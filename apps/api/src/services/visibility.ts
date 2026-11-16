import { SECRET_NAME as NAME, SECRET_SPEC as SPEC, type BadgeSpec } from '@best-badges/badge-spec';
import type { Database } from '../db/index.ts';

/**
 * Versteckte Abzeichen: Öffentlich (App, öffentliche API, Bild-Endpunkt, Vorschau) erscheinen sie
 * mit Platzhalter statt Name, Beschreibung und Design – bis die Person das Abzeichen hat (Stufe ≥ 1).
 * Der Hinweistext ist bewusst öffentlich.
 */
export const SECRET_NAME = NAME;
export const SECRET_SPEC: BadgeSpec = SPEC as unknown as BadgeSpec;

/** IDs der Abzeichen, die diese Person verdient hat (Stufe ≥ 1). Ohne Anmeldung: leer. */
export async function earnedIds(db: Database, userSub: string | undefined, ids?: string[]): Promise<Set<string>> {
  if (!userSub || (ids && ids.length === 0)) return new Set();
  let q = db.selectFrom('awards').select('achievement_id').where('user_sub', '=', userSub).where('tier', '>=', 1);
  if (ids) q = q.where('achievement_id', 'in', ids);
  return new Set((await q.execute()).map((r) => r.achievement_id));
}
