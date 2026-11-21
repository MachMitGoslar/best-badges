// Plattform-Abzeichen: Kennzahlen je Person für die automatische Vergabe.
// Plattform-Abzeichen zählen selbst nie mit – sonst würde „Sammle dein erstes Abzeichen“ sich selbst auslösen.
import { sql, type Transaction } from 'kysely';
import type { AutoRule, DB } from '../db/types.ts';

export const AUTO_RULES: readonly AutoRule[] = ['active_days', 'awards_count', 'orgs_count', 'places_count', 'collections_count'];

/** Regeln, die sich ändern können, wenn jemand ein (nicht automatisches) Abzeichen zum ersten Mal verdient */
export const RULES_ON_EARN: readonly AutoRule[] = ['awards_count', 'orgs_count', 'collections_count'];

/** Aktueller Wert einer Kennzahl für eine Person */
export async function metric(trx: Transaction<DB>, userSub: string, rule: AutoRule): Promise<number> {
  switch (rule) {
    case 'active_days': {
      const r = await trx.selectFrom('user_activity_days').select((eb) => eb.fn.countAll<string>().as('n')).where('user_sub', '=', userSub).executeTakeFirstOrThrow();
      return Number(r.n);
    }
    case 'places_count': {
      const r = await trx.selectFrom('redemptions').select(sql<string>`count(DISTINCT code_id)`.as('n'))
        .where('user_sub', '=', userSub).where('source', '=', 'place').where('status', '=', 'success').executeTakeFirstOrThrow();
      return Number(r.n);
    }
    default: {
      let q = trx.selectFrom('awards').innerJoin('achievements', 'achievements.id', 'awards.achievement_id')
        .where('awards.user_sub', '=', userSub).where('awards.tier', '>=', 1).where('achievements.auto_rule', 'is', null);
      if (rule === 'collections_count') q = q.where('achievements.kind', '=', 'collection');
      const r = await q.select(rule === 'orgs_count' ? sql<string>`count(DISTINCT achievements.org_id)`.as('n') : sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow();
      return Number(r.n);
    }
  }
}

/** Kalendertag in Goslar (YYYY-MM-DD) */
export const berlinDay = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date(ms));
