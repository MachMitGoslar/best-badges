import { sql, type Transaction } from 'kysely';
import type { BadgeSpec } from '@best-badges/badge-spec';
import type { Database } from '../db/index.ts';
import type { Achievement, Code, DB, RedemptionStatus, Tier } from '../db/types.ts';
import { parseScanned, verifyCheckout, verifyEvent } from './signing.ts';
import { ApiError, conflict, notFound } from '../errors.ts';
import type { ApiKeyPrincipal } from './apiKeys.ts';
import { evaluateCollections, type CollectionProgress } from './collections.ts';
import type { NotificationService } from './notifications.ts';
import { publicSummary, type PublicSummary, type PublicSummaryFull } from './publicViews.ts';

export interface GeoInput { lat: number; lng: number; accuracyM?: number }

export interface RedeemInput {
  code: string;
  geo?: GeoInput | null;
}

export type AchievementSummary = PublicSummary;

/** Fortschritt einer Kombination, ausgelöst durch diesen Vorgang */
export interface CollectionUnlock {
  achievement: AchievementSummary;
  progress: number;
  requiredCount: number;
  completed: boolean;
  firstTime: boolean;
}

export interface RedeemSuccess {
  status: 'success';
  achievement: AchievementSummary;
  value: number;
  progress: number;
  previousTier: number;
  tier: number;
  tierCount: number;
  tierUp: boolean;
  firstTime: boolean;
  nextThreshold: number | null;
  awardedText: string;
  collections: CollectionUnlock[];
}

export type FailureStatus = Exclude<RedemptionStatus, 'success'>;

export interface RedeemFailure {
  status: FailureStatus;
  message: string;
  retryAfterSeconds?: number;
}

export type RedeemResult = RedeemSuccess | RedeemFailure;

const MESSAGES: Record<FailureStatus, string> = {
  invalid: 'Dieser Code ist ungültig.',
  inactive: 'Dieser Code ist gerade nicht aktiv.',
  expired: 'Dieser Code ist abgelaufen.',
  exhausted: 'Dieser Code wurde bereits vollständig eingelöst.',
  unavailable: 'Dieses Abzeichen ist derzeit nicht verfügbar.',
  limit_reached: 'Du hast diesen Code schon so oft eingelöst wie erlaubt.',
  cooldown: 'Diesen Code kannst du erst später wieder einlösen.',
  out_of_range: 'Du bist zu weit vom Ort dieses Codes entfernt.',
};

/** Entfernung in Metern (Haversine) */
function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Erreichte Stufe = Anzahl Schwellen, die der Fortschritt erreicht. */
export function tierFor(tiers: Pick<Tier, 'threshold'>[], progress: number) {
  const sorted = [...tiers].sort((x, y) => x.threshold - y.threshold);
  const tier = sorted.filter((t) => t.threshold <= progress).length;
  return { tier, tierCount: sorted.length, nextThreshold: sorted.find((t) => t.threshold > progress)?.threshold ?? null };
}

type SummaryInput = Parameters<typeof publicSummary>[0];
const summary = (a: SummaryInput, earned = true): PublicSummary => publicSummary(a, earned);
/** Vollständige Kurzform für die eigene Organisation (Integrationen) */
const fullSummary = (a: SummaryInput) => publicSummary({ ...a, hidden: false }, true) as PublicSummaryFull;

const unlockView = (c: CollectionProgress): CollectionUnlock => ({
  achievement: summary({ id: c.collectionId, org_id: c.orgId, name: c.name, kind: 'collection', spec: c.spec, hidden: c.hidden, hint: c.hint }, c.completed),
  progress: c.progress, requiredCount: c.requiredCount, completed: c.completed, firstTime: c.firstTime,
});
const isVisible = (a: Achievement) => a.status === 'live' && a.vetoed_at === null;

/** Ergebnis der Prüfung eines Codes, ohne Nutzungsgrenzen. */
type Resolved =
  | { ok: true; code: Code; achievement: Achievement; value: number; nonce: string | null }
  | { ok: false; status: FailureStatus; code: Code | null; achievement: Achievement | null };

export class RedemptionService {
  constructor(private db: Database, private now: () => number = Date.now, private notifications?: NotificationService) {}

  /** Findet und prüft einen gescannten Code: Signatur, Aktivität, Zeitfenster, Sichtbarkeit. */
  private async resolve(db: Database | Transaction<DB>, scanned: string, lock: boolean): Promise<Resolved> {
    const parsed = parseScanned(scanned);
    if (!parsed) return { ok: false, status: 'invalid', code: null, achievement: null };
    let q = db.selectFrom('codes').selectAll().where('token', '=', parsed.token);
    if (lock) q = q.forUpdate();
    const code = await q.executeTakeFirst();
    if (!code) return { ok: false, status: 'invalid', code: null, achievement: null };
    const achievement = await db.selectFrom('achievements').selectAll().where('id', '=', code.achievement_id).executeTakeFirstOrThrow();
    const fail = (status: FailureStatus): Resolved => ({ ok: false, status, code, achievement });
    const now = this.now();

    let value = code.value;
    let nonce: string | null = null;
    if (code.template === 'event') {
      if (!code.secret || !verifyEvent(code.token, code.secret, parsed.params, now)) return fail('expired');
    } else if (code.template === 'checkout') {
      if (!code.secret) return fail('invalid');
      const claim = verifyCheckout(code.token, code.secret, parsed.params, now);
      if (!claim.ok) return fail(claim.reason);
      value = claim.value;
      nonce = claim.nonce;
    }
    if (!isVisible(achievement)) return fail('unavailable');
    if (!code.active) return fail('inactive');
    if (code.valid_from && code.valid_from.getTime() > now) return fail('inactive');
    if (code.valid_until && code.valid_until.getTime() <= now) return fail('expired');
    if (code.max_total !== null && code.uses >= code.max_total) return fail('exhausted');
    return { ok: true, code, achievement, value, nonce };
  }

  /** Löst einen Code für eine Person ein. Alles in einer Transaktion; der Code ist dabei gesperrt. */
  async redeem(userSub: string, input: RedeemInput): Promise<RedeemResult> {
    return this.db.transaction().execute(async (trx) => {
      const r = await this.resolve(trx, input.code, true);
      const logFailure = async (status: FailureStatus, code: Code | null, achievement: Achievement | null, retryAfterSeconds?: number): Promise<RedeemFailure> => {
        await trx.insertInto('redemptions').values({ code_id: code?.id ?? null, achievement_id: achievement?.id ?? null, user_sub: userSub, value: 0, status, created_at: new Date(this.now()) }).execute();
        return { status, message: MESSAGES[status], ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
      };
      if (!r.ok) return logFailure(r.status, r.code, r.achievement);
      const { code, achievement, value, nonce } = r;
      const now = this.now();

      // Pro Person: Anzahl und Abstand
      if (code.per_user_limit !== null || code.per_user_cooldown_seconds !== null) {
        const stats = await trx.selectFrom('redemptions')
          .select([(eb) => eb.fn.countAll<string>().as('count'), (eb) => eb.fn.max('created_at').as('last')])
          .where('code_id', '=', code.id).where('user_sub', '=', userSub).where('status', '=', 'success')
          .executeTakeFirstOrThrow();
        if (code.per_user_limit !== null && Number(stats.count) >= code.per_user_limit) return logFailure('limit_reached', code, achievement);
        if (code.per_user_cooldown_seconds !== null && stats.last) {
          const waitMs = new Date(stats.last).getTime() + code.per_user_cooldown_seconds * 1000 - now;
          if (waitMs > 0) return logFailure('cooldown', code, achievement, Math.ceil(waitMs / 1000));
        }
      }

      // Standort-Plausibilisierung (weiche Hürde)
      if (code.geo_lat !== null && code.geo_lng !== null && code.geo_radius_m !== null) {
        const g = input.geo;
        const slack = Math.min(g?.accuracyM ?? 0, 100);
        if (!g || distanceM(g, { lat: code.geo_lat, lng: code.geo_lng }) > code.geo_radius_m + slack) {
          return logFailure('out_of_range', code, achievement);
        }
      }

      // Kassen-Code: Nonce genau einmal
      if (nonce) {
        const used = await trx.insertInto('code_nonces').values({ code_id: code.id, nonce, user_sub: userSub })
          .onConflict((oc) => oc.doNothing()).returning('nonce').executeTakeFirst();
        if (!used) return logFailure('exhausted', code, achievement);
      }

      await trx.updateTable('codes').set({ uses: sql`uses + 1` }).where('id', '=', code.id).execute();
      // Selbst gescannt: Die Person sieht den Erfolg gerade auf dem Bildschirm – nur ins Postfach, kein Push
      const result = await this.applyProgress(trx, achievement, userSub, value, false);
      // Zeitstempel aus derselben Uhr wie die Prüfung der Wartezeit
      await trx.insertInto('redemptions').values({ code_id: code.id, achievement_id: achievement.id, user_sub: userSub, value, status: 'success', created_at: new Date(now) }).execute();
      return result;
    });
  }

  /** Fortschritt atomar erhöhen und Stufe neu berechnen. Wird auch für die Direktvergabe genutzt. */
  async applyProgress(trx: Transaction<DB>, achievement: Achievement, userSub: string, value: number, push = false): Promise<RedeemSuccess> {
    const now = new Date(this.now());
    const award = await trx.insertInto('awards')
      .values({ achievement_id: achievement.id, user_sub: userSub, progress: value, tier: 0, first_earned_at: null, updated_at: now })
      .onConflict((oc) => oc.columns(['achievement_id', 'user_sub']).doUpdateSet({ progress: sql`awards.progress + ${value}`, updated_at: now }))
      .returningAll().executeTakeFirstOrThrow();
    const tiers = await trx.selectFrom('achievement_tiers').select(['level', 'threshold', 'awarded_text', 'name']).where('achievement_id', '=', achievement.id).execute();
    const { tier, tierCount, nextThreshold } = tierFor(tiers, award.progress);
    const previousTier = award.tier;
    const firstTime = award.first_earned_at === null && tier >= 1;
    if (tier !== previousTier || firstTime) {
      await trx.updateTable('awards')
        .set({ tier, ...(firstTime ? { first_earned_at: now } : {}) })
        .where('id', '=', award.id).execute();
    }
    const tierText = tiers.find((t) => t.level === tier)?.awarded_text;
    // Erstes Verdienen eines Teils bringt Kombinationen voran
    const collections = firstTime ? (await evaluateCollections(trx, { userSub, itemId: achievement.id }, now)).map(unlockView) : [];
    const earned = tier >= 1;
    if (this.notifications && (firstTime || tier > previousTier)) {
      const tierName = tiers.find((t) => t.level === tier)?.name;
      await this.notifications.notify(trx, {
        userSubs: [userSub], category: 'awards', push, link: `/achievements/${achievement.id}`,
        title: firstTime ? 'Neues Abzeichen' : `Stufe ${tier} erreicht`,
        body: `${achievement.name}${!firstTime && tierName ? ` · ${tierName}` : ''}`,
      });
    }
    if (this.notifications) {
      for (const c of collections.filter((x) => x.completed && x.firstTime && !x.achievement.secret)) {
        await this.notifications.notify(trx, { userSubs: [userSub], category: 'awards', push, link: `/achievements/${c.achievement.id}`, title: 'Kombination geschafft', body: 'name' in c.achievement ? c.achievement.name : 'Kombination' });
      }
    }
    return {
      status: 'success',
      achievement: summary(achievement, earned),
      value,
      progress: award.progress,
      previousTier,
      tier,
      tierCount,
      tierUp: tier > previousTier,
      firstTime,
      nextThreshold,
      awardedText: earned ? ((tier > previousTier && tierText) || achievement.awarded_text) : '',
      collections,
    };
  }

  /** Vorschau vor dem Einlösen: was gibt es, ist der Code gültig, wie steht die Person? Verbraucht nichts. */
  async preview(scanned: string, userSub?: string) {
    const r = await this.resolve(this.db, scanned, false);
    if (!r.achievement || (!r.ok && r.status === 'unavailable')) {
      return { status: r.ok ? 'ok' : r.status, message: r.ok ? null : MESSAGES[r.status], achievement: null, template: r.code?.template ?? null, value: null, award: null };
    }
    let award = null;
    if (userSub) {
      const a = await this.db.selectFrom('awards').select(['progress', 'tier']).where('achievement_id', '=', r.achievement.id).where('user_sub', '=', userSub).executeTakeFirst();
      if (a) award = { progress: a.progress, tier: a.tier };
    }
    return {
      status: r.ok ? 'ok' : r.status,
      message: r.ok ? null : MESSAGES[r.status],
      achievement: summary(r.achievement, (award?.tier ?? 0) >= 1),
      template: r.code!.template,
      value: r.ok ? r.value : null,
      award,
    };
  }

  /** Sammlung einer Person */
  async awardsFor(userSub: string) {
    const rows = await this.db.selectFrom('awards')
      .innerJoin('achievements', 'achievements.id', 'awards.achievement_id')
      .select(['awards.achievement_id', 'awards.progress', 'awards.tier', 'awards.first_earned_at', 'awards.updated_at as award_updated_at',
        'achievements.org_id', 'achievements.name', 'achievements.kind', 'achievements.spec', 'achievements.hidden', 'achievements.hint', 'achievements.required_count'])
      .where('awards.user_sub', '=', userSub)
      .orderBy('awards.updated_at', 'desc')
      .execute();
    const ids = rows.map((r) => r.achievement_id);
    const tiers = ids.length ? await this.db.selectFrom('achievement_tiers').selectAll().where('achievement_id', 'in', ids).execute() : [];
    return rows.map((r) => {
      const t = tierFor(tiers.filter((x) => x.achievement_id === r.achievement_id), r.progress);
      return {
        achievement: summary({ id: r.achievement_id, org_id: r.org_id, name: r.name, kind: r.kind, spec: r.spec, hidden: r.hidden, hint: r.hint }, r.tier >= 1),
        progress: r.progress,
        tier: r.tier,
        tierCount: t.tierCount,
        nextThreshold: t.nextThreshold,
        requiredCount: r.required_count,
        firstEarnedAt: r.first_earned_at?.toISOString() ?? null,
        updatedAt: r.award_updated_at.toISOString(),
      };
    });
  }

  /**
   * Direktvergabe durch ein externes System mit API-Schlüssel.
   * Mit `reference` idempotent: Dieselbe Referenz desselben Schlüssels zählt nur einmal,
   * Wiederholungen liefern den aktuellen Stand mit `replayed: true`.
   */
  async directAward(key: ApiKeyPrincipal, input: { achievementId: string; userSub: string; value?: number; reference?: string }) {
    const value = input.value ?? 1;
    return this.db.transaction().execute(async (trx) => {
      const achievement = await trx.selectFrom('achievements').selectAll()
        .where('id', '=', input.achievementId).where('org_id', '=', key.orgId).executeTakeFirst();
      if (!achievement) throw notFound('Abzeichen');
      if (!isVisible(achievement)) throw new ApiError(410, 'unavailable', MESSAGES.unavailable);
      if (achievement.kind === 'collection') throw conflict('collection', 'Kombinationen bekommt man über ihre Teile');

      if (input.reference) {
        // Gleiche Referenz nacheinander abarbeiten, damit parallele Wiederholungen nicht doppelt zählen
        await sql`SELECT pg_advisory_xact_lock(hashtext(${`${key.id}:${input.reference}`}))`.execute(trx);
        const prior = await trx.selectFrom('redemptions').select(['achievement_id', 'user_sub', 'value'])
          .where('api_key_id', '=', key.id).where('reference', '=', input.reference).where('status', '=', 'success')
          .executeTakeFirst();
        if (prior) {
          if (prior.achievement_id !== achievement.id || prior.user_sub !== input.userSub || prior.value !== value) {
            throw conflict('reference_reused', 'Diese Referenz wurde bereits für eine andere Vergabe verwendet');
          }
          const award = await trx.selectFrom('awards').select(['progress', 'tier'])
            .where('achievement_id', '=', achievement.id).where('user_sub', '=', input.userSub).executeTakeFirstOrThrow();
          const tiers = await trx.selectFrom('achievement_tiers').select(['threshold']).where('achievement_id', '=', achievement.id).execute();
          const t = tierFor(tiers, award.progress);
          return {
            status: 'success' as const, achievement: { ...fullSummary(achievement), hidden: achievement.hidden }, value, progress: award.progress,
            previousTier: award.tier, tier: award.tier, tierCount: t.tierCount, tierUp: false, firstTime: false,
            nextThreshold: t.nextThreshold, awardedText: achievement.awarded_text, collections: [], replayed: true,
          };
        }
      }

      // Von außen vergeben (z. B. Kasse): Die Person bekommt es per Push mit
      const result = await this.applyProgress(trx, achievement, input.userSub, value, true);
      await trx.insertInto('redemptions').values({
        code_id: null, achievement_id: achievement.id, user_sub: input.userSub, value, status: 'success', source: 'api',
        api_key_id: key.id, reference: input.reference ?? null, created_at: new Date(this.now()),
      }).execute();
      // Die eigene Organisation sieht ihr Abzeichen immer vollständig
      return { ...result, achievement: { ...fullSummary(achievement), hidden: achievement.hidden }, replayed: false };
    });
  }
}
