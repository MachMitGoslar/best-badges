import { sql, type Transaction } from 'kysely';
import type { BadgeSpec } from '@best-badges/badge-spec';
import type { DB } from '../db/types.ts';

export interface CollectionProgress {
  collectionId: string;
  orgId: string;
  name: string;
  spec: BadgeSpec;
  hidden: boolean;
  hint: string;
  progress: number;
  requiredCount: number;
  completed: boolean;
  /** In diesem Vorgang neu abgeschlossen */
  firstTime: boolean;
}

/**
 * Berechnet den Stand von Kombinations-Abzeichen neu und schreibt ihn in `awards`.
 * Gezählt werden zugestimmte Teile, die die Person verdient hat (Stufe ≥ 1).
 * Fortschritt und Stufe sinken nie: Was einmal verdient ist, bleibt (auch wenn ein Teil später entfernt wird).
 *
 * - `userSub` + `itemId`: nach dem ersten Verdienen eines Teils (beim Einlösen)
 * - `collectionId`: rückwirkend für alle Personen (beim Veröffentlichen)
 */
export async function evaluateCollections(
  trx: Transaction<DB>,
  scope: { userSub: string; itemId: string } | { collectionId: string },
  now: Date,
): Promise<CollectionProgress[]> {
  const filter = 'collectionId' in scope
    ? sql`ci.collection_id = ${scope.collectionId}`
    : sql`a.user_sub = ${scope.userSub} AND ci.collection_id IN (SELECT collection_id FROM collection_items WHERE achievement_id = ${scope.itemId})`;

  const rows = await sql<{
    achievement_id: string; user_sub: string; progress: number; tier: number; first_earned_at: Date | null;
  }>`
    WITH counts AS (
      SELECT ci.collection_id, a.user_sub, count(*)::int AS n
      FROM collection_items ci
      JOIN awards a ON a.achievement_id = ci.achievement_id AND a.tier >= 1
      JOIN achievements c ON c.id = ci.collection_id AND c.status = 'live' AND c.vetoed_at IS NULL
      WHERE ci.approved_at IS NOT NULL AND ${filter}
      GROUP BY ci.collection_id, a.user_sub
    )
    INSERT INTO awards (achievement_id, user_sub, progress, tier, first_earned_at, updated_at)
    SELECT counts.collection_id, counts.user_sub, counts.n,
           CASE WHEN counts.n >= c.required_count THEN 1 ELSE 0 END,
           CASE WHEN counts.n >= c.required_count THEN ${now}::timestamptz END,
           ${now}::timestamptz
    FROM counts JOIN achievements c ON c.id = counts.collection_id
    ON CONFLICT (achievement_id, user_sub) DO UPDATE SET
      progress = GREATEST(awards.progress, EXCLUDED.progress),
      tier = GREATEST(awards.tier, EXCLUDED.tier),
      first_earned_at = COALESCE(awards.first_earned_at, EXCLUDED.first_earned_at),
      updated_at = EXCLUDED.updated_at
    WHERE awards.progress < EXCLUDED.progress OR awards.tier < EXCLUDED.tier
    RETURNING achievement_id, user_sub, progress, tier, first_earned_at
  `.execute(trx);

  if (rows.rows.length === 0 || 'collectionId' in scope) return [];
  const ids = rows.rows.map((r) => r.achievement_id);
  const defs = await trx.selectFrom('achievements').select(['id', 'org_id', 'name', 'spec', 'hidden', 'hint', 'required_count']).where('id', 'in', ids).execute();
  return rows.rows.map((r) => {
    const d = defs.find((x) => x.id === r.achievement_id)!;
    return {
      collectionId: d.id, orgId: d.org_id, name: d.name, spec: d.spec as BadgeSpec, hidden: d.hidden, hint: d.hint,
      progress: r.progress, requiredCount: d.required_count ?? 0, completed: r.tier >= 1,
      firstTime: r.first_earned_at !== null && r.first_earned_at.getTime() === now.getTime(),
    };
  });
}
