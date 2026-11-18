// Seltenheit eines Abzeichens (je Stufe) aus dem Anteil der Sammelnden der Organisation.
// „Sammelnde“ = alle, die bei dieser Organisation mindestens ein Abzeichen haben. So wirken lokale
// Abzeichen (Museum, Waldpfad) nicht nur deshalb selten, weil die Plattform groß ist.
// Nach außen geht nur die Kategorie, nie Anzahlen – kleine Organisationen verraten so nichts über Einzelne.
import { sql } from 'kysely';
import { rarityFromShare, type Rarity } from '@best-badges/badge-spec';
import type { Database } from '../db/index.ts';

interface OrgStats {
  at: number;
  collectors: number;
  /** holders.get(achievementId)[t] = Personen mit Stufe ≥ t (Index 1 …) */
  holders: Map<string, number[]>;
}

export class RarityService {
  private cache = new Map<string, OrgStats>();

  constructor(
    private db: Database,
    private opts: { minCollectors: number; ttlMs?: number },
    private now: () => number = Date.now,
  ) {}

  /** Nach einer Vergabe: Zahlen der Organisation neu laden (spätestens beim nächsten Abruf) */
  invalidate(orgId: string) { this.cache.delete(orgId); }

  private async stats(orgId: string): Promise<OrgStats> {
    const hit = this.cache.get(orgId);
    if (hit && this.now() - hit.at < (this.opts.ttlMs ?? 5 * 60_000)) return hit;
    const rows = await this.db.selectFrom('awards')
      .innerJoin('achievements', 'achievements.id', 'awards.achievement_id')
      .select(['awards.achievement_id', 'awards.tier', sql<string>`count(*)`.as('n')])
      .where('achievements.org_id', '=', orgId).where('awards.tier', '>=', 1)
      .groupBy(['awards.achievement_id', 'awards.tier'])
      .execute();
    const collectors = await this.db.selectFrom('awards')
      .innerJoin('achievements', 'achievements.id', 'awards.achievement_id')
      .select(sql<string>`count(DISTINCT awards.user_sub)`.as('n'))
      .where('achievements.org_id', '=', orgId).where('awards.tier', '>=', 1)
      .executeTakeFirstOrThrow();
    // Je Abzeichen: Anzahl genau auf Stufe t → kumuliert „mindestens Stufe t“
    const exact = new Map<string, number[]>();
    for (const r of rows) {
      const arr = exact.get(r.achievement_id) ?? [];
      arr[r.tier] = (arr[r.tier] ?? 0) + Number(r.n);
      exact.set(r.achievement_id, arr);
    }
    const holders = new Map<string, number[]>();
    for (const [id, arr] of exact) {
      const cum: number[] = [];
      for (let t = arr.length - 1, sum = 0; t >= 1; t--) { sum += arr[t] ?? 0; cum[t] = sum; }
      holders.set(id, cum);
    }
    const s = { at: this.now(), collectors: Number(collectors.n), holders };
    this.cache.set(orgId, s);
    return s;
  }

  /** Seltenheit je Eintrag; null, solange keine Stufe erreicht ist. */
  async forAwards(items: { achievementId: string; orgId: string; tier: number }[]): Promise<(Rarity | null)[]> {
    const orgs = [...new Set(items.filter((i) => i.tier >= 1).map((i) => i.orgId))];
    const stats = new Map(await Promise.all(orgs.map(async (o) => [o, await this.stats(o)] as const)));
    return items.map((i) => {
      if (i.tier < 1) return null;
      const s = stats.get(i.orgId)!;
      const holders = s.holders.get(i.achievementId)?.[i.tier] ?? 0;
      return rarityFromShare(holders, s.collectors, this.opts.minCollectors);
    });
  }
}
