// Plattform-Abzeichen: Kennzahlen je Person für die automatische Vergabe.
// Plattform-Abzeichen zählen selbst nie mit – sonst würde „Sammle dein erstes Abzeichen“ sich selbst auslösen.
import { sql, type Transaction } from 'kysely';
import type { AutoRule, DB } from '../db/types.ts';

export const AUTO_RULES: readonly AutoRule[] = ['active_days', 'awards_count', 'orgs_count', 'places_count', 'collections_count'];

/** Regeln, die sich ändern können, wenn jemand ein (nicht automatisches) Abzeichen zum ersten Mal verdient */
export const RULES_ON_EARN: readonly AutoRule[] = ['awards_count', 'orgs_count', 'collections_count'];

/** Zeitraum für „Nur im Zeitraum zählen“; offene Enden erlaubt */
export interface CountWindow { from: Date | null; until: Date | null }

/** Aktueller Wert einer Kennzahl für eine Person – optional nur, was im Zeitraum passiert ist. */
export async function metric(trx: Transaction<DB>, userSub: string, rule: AutoRule, window?: CountWindow | null): Promise<number> {
  switch (rule) {
    case 'active_days': {
      let q = trx.selectFrom('user_activity_days').select((eb) => eb.fn.countAll<string>().as('n')).where('user_sub', '=', userSub);
      // Tage zählen als Kalendertage in Goslar
      if (window?.from) q = q.where('day', '>=', berlinDay(window.from.getTime()));
      if (window?.until) q = q.where('day', '<=', berlinDay(window.until.getTime()));
      const r = await q.executeTakeFirstOrThrow();
      return Number(r.n);
    }
    case 'places_count': {
      let q = trx.selectFrom('redemptions').select(sql<string>`count(DISTINCT code_id)`.as('n'))
        .where('user_sub', '=', userSub).where('source', '=', 'place').where('status', '=', 'success');
      if (window?.from) q = q.where('created_at', '>=', window.from);
      if (window?.until) q = q.where('created_at', '<', window.until);
      const r = await q.executeTakeFirstOrThrow();
      return Number(r.n);
    }
    default: {
      let q = trx.selectFrom('awards').innerJoin('achievements', 'achievements.id', 'awards.achievement_id')
        .where('awards.user_sub', '=', userSub).where('awards.tier', '>=', 1).where('achievements.auto_rule', 'is', null);
      if (rule === 'collections_count') q = q.where('achievements.kind', '=', 'collection');
      // Im Zeitraum: zum ersten Mal verdient zwischen Beginn und Ende
      if (window?.from) q = q.where('awards.first_earned_at', '>=', window.from);
      if (window?.until) q = q.where('awards.first_earned_at', '<', window.until);
      const r = await q.select(rule === 'orgs_count' ? sql<string>`count(DISTINCT achievements.org_id)`.as('n') : sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow();
      return Number(r.n);
    }
  }
}

/** Kalendertag in Goslar (YYYY-MM-DD) */
export const berlinDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(ms));
