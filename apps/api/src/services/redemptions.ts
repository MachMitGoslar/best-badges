import { sql, type Transaction } from 'kysely';
import type { BadgeSpec } from '@best-badges/badge-spec';
import type { Database } from '../db/index.ts';
import type { Achievement, AutoRule, Code, DB, RedemptionStatus, Tier } from '../db/types.ts';
import { AUTO_RULES, RULES_ON_EARN, berlinDay, metric } from './rules.ts';
import { describe as describeSchedule, isOpen } from './schedule.ts';
import { parseScanned, verifyCheckout, verifyEvent } from './signing.ts';
import { ApiError, conflict, notFound } from '../errors.ts';
import type { ApiKeyPrincipal } from './apiKeys.ts';
import { evaluateCollections, type CollectionProgress } from './collections.ts';
import type { NotificationService } from './notifications.ts';
import { publicSummary, type PublicSummary, type PublicSummaryFull } from './publicViews.ts';

export interface GeoInput { lat: number; lng: number; accuracyM?: number }

/** Standort beim Einchecken an einem Ort. `mocked`: Das Gerät meldet einen vorgetäuschten Standort (Android). */
export interface PlaceGeo extends GeoInput { mocked?: boolean }

/** Ort: schlechter als diese Genauigkeit wird nicht eingecheckt */
export const PLACE_MAX_ACCURACY_M = 150;
/** Ort: höchstens so viel Ungenauigkeit wird dem Radius zugeschlagen */
const PLACE_MAX_SLACK_M = 50;
/** Ort: schneller als ~250 km/h zwischen zwei Orten gilt als unplausibel */
export const PLACE_MAX_SPEED_MPS = 70;

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

/** Plattform-Abzeichen, das durch diesen Vorgang dazukam oder aufstieg */
export interface BonusUnlock {
  achievement: AchievementSummary;
  progress: number;
  tier: number;
  tierCount: number;
  tierUp: boolean;
  firstTime: boolean;
  awardedText: string;
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
  /** Plattform-Abzeichen, die dadurch dazukamen oder aufstiegen */
  bonus: BonusUnlock[];
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
  inaccurate: 'Dein Standort ist gerade zu ungenau. Geh ein paar Schritte ins Freie und versuch es noch einmal.',
  implausible: 'Dieser Standort wirkt nicht echt. Versuch es später noch einmal.',
  not_started: 'Dieses Abzeichen gibt es noch nicht.',
  ended: 'Dieses Abzeichen gibt es nicht mehr.',
  closed: 'Das geht gerade nicht – nur zu bestimmten Zeiten.',
};

const berlinDate = (d: Date) => new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'numeric', year: 'numeric' }).format(d);

/** Zeitfenster des Abzeichens: null = jetzt verfügbar, sonst Status und Meldung mit Datum */
export function windowState(a: Pick<Achievement, 'available_from' | 'available_until'>, nowMs: number): { status: 'not_started' | 'ended'; message: string } | null {
  if (a.available_from && a.available_from.getTime() > nowMs) return { status: 'not_started', message: `Dieses Abzeichen gibt es erst ab dem ${berlinDate(a.available_from)}.` };
  if (a.available_until && a.available_until.getTime() <= nowMs) return { status: 'ended', message: `Dieses Abzeichen gab es nur bis zum ${berlinDate(a.available_until)}.` };
  return null;
}

/** Entfernung in Metern (Haversine) */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
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

const INVALID = { ok: false, status: 'invalid', code: null, achievement: null } as const;

/** Ergebnis der Prüfung eines Codes, ohne Nutzungsgrenzen. */
type Resolved =
  | { ok: true; code: Code; achievement: Achievement; value: number; nonce: string | null }
  | { ok: false; status: FailureStatus; code: Code | null; achievement: Achievement | null; message?: string };

export class RedemptionService {
  constructor(private db: Database, private now: () => number = Date.now, private notifications?: NotificationService, private opts: { allowMockedPlaces?: boolean } = {}) {}

  /** Findet und prüft einen gescannten Code: Signatur, Aktivität, Zeitfenster, Sichtbarkeit. */
  private async resolve(db: Database | Transaction<DB>, scanned: string, lock: boolean): Promise<Resolved> {
    const parsed = parseScanned(scanned);
    if (!parsed) return INVALID;
    let q = db.selectFrom('codes').selectAll().where('token', '=', parsed.token);
    if (lock) q = q.forUpdate();
    const code = await q.executeTakeFirst();
    // Orte gibt es nur über den Check-in mit Standort, nie über ihr (internes) Token
    if (!code || code.template === 'place') return INVALID;
    return this.check(db, code, parsed.params);
  }

  /** Findet einen Ort über seine ID und prüft ihn wie einen Code. */
  private async resolvePlace(db: Database | Transaction<DB>, id: string, lock: boolean): Promise<Resolved> {
    let q = db.selectFrom('codes').selectAll().where('id', '=', id).where('template', '=', 'place');
    if (lock) q = q.forUpdate();
    const code = await q.executeTakeFirst();
    return code ? this.check(db, code, new URLSearchParams()) : INVALID;
  }

  private async check(db: Database | Transaction<DB>, code: Code, params: URLSearchParams): Promise<Resolved> {
    const achievement = await db.selectFrom('achievements').selectAll().where('id', '=', code.achievement_id).executeTakeFirstOrThrow();
    const fail = (status: FailureStatus, message?: string): Resolved => ({ ok: false, status, code, achievement, message });
    const now = this.now();

    let value = code.value;
    let nonce: string | null = null;
    if (code.template === 'event') {
      if (!code.secret || !verifyEvent(code.token, code.secret, params, now)) return fail('expired');
    } else if (code.template === 'checkout') {
      if (!code.secret) return fail('invalid');
      const claim = verifyCheckout(code.token, code.secret, params, now);
      if (!claim.ok) return fail(claim.reason);
      value = claim.value;
      nonce = claim.nonce;
    }
    if (!isVisible(achievement)) return fail('unavailable');
    const window = windowState(achievement, now);
    if (window) return fail(window.status, window.message);
    if (!code.active) return fail('inactive');
    if (code.valid_from && code.valid_from.getTime() > now) return fail('inactive');
    if (code.valid_until && code.valid_until.getTime() <= now) return fail('expired');
    if (code.max_total !== null && code.uses >= code.max_total) return fail('exhausted');
    if (!isOpen(code.schedule, now)) return fail('closed', `Das geht nur zu bestimmten Zeiten: ${describeSchedule(code.schedule)}.`);
    return { ok: true, code, achievement, value, nonce };
  }

  /** Löst einen Code für eine Person ein. Alles in einer Transaktion; der Code ist dabei gesperrt. */
  async redeem(userSub: string, input: RedeemInput): Promise<RedeemResult> {
    return this.db.transaction().execute(async (trx) => {
      const r = await this.resolve(trx, input.code, true);
      return this.complete(trx, userSub, r, input.geo ?? null, 'scan');
    });
  }

  /**
   * Check-in an einem Ort: nur mit Standort. Weiche Hürde für Einstiegs-Abzeichen –
   * geprüft werden Entfernung, Genauigkeit, gemeldeter vorgetäuschter Standort und die Reisegeschwindigkeit seit dem letzten Check-in.
   * Der Standort der Person wird nicht gespeichert.
   */
  async checkIn(userSub: string, placeId: string, geo: PlaceGeo): Promise<RedeemResult> {
    return this.db.transaction().execute(async (trx) => {
      const r = await this.resolvePlace(trx, placeId, true);
      return this.complete(trx, userSub, r, geo, 'place');
    });
  }

  /** Gemeinsamer Abschluss für Scan und Check-in: Grenzen, Standort, Fortschritt, Protokoll. Code ist gesperrt. */
  private async complete(trx: Transaction<DB>, userSub: string, r: Resolved, geo: PlaceGeo | null, source: 'scan' | 'place'): Promise<RedeemResult> {
    const logFailure = async (status: FailureStatus, code: Code | null, achievement: Achievement | null, retryAfterSeconds?: number, message?: string): Promise<RedeemFailure> => {
      await trx.insertInto('redemptions').values({ code_id: code?.id ?? null, achievement_id: achievement?.id ?? null, user_sub: userSub, value: 0, status, source, created_at: new Date(this.now()) }).execute();
      return { status, message: message ?? MESSAGES[status], ...(retryAfterSeconds ? { retryAfterSeconds } : {}) };
    };
    if (!r.ok) return logFailure(r.status, r.code, r.achievement, undefined, r.message);
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

    // Ort: Genauigkeit, vorgetäuschter Standort, Reisegeschwindigkeit
    if (source === 'place') {
      if (!geo) return logFailure('out_of_range', code, achievement);
      if (geo.mocked && !this.opts.allowMockedPlaces) return logFailure('implausible', code, achievement);
      if (geo.accuracyM === undefined || geo.accuracyM > PLACE_MAX_ACCURACY_M) return logFailure('inaccurate', code, achievement);
      if (await this.tooFast(trx, userSub, code, now)) return logFailure('implausible', code, achievement);
    }

    // Standort-Plausibilisierung (weiche Hürde)
    if (code.geo_lat !== null && code.geo_lng !== null && code.geo_radius_m !== null) {
      const g = geo;
      const slack = Math.min(g?.accuracyM ?? 0, source === 'place' ? PLACE_MAX_SLACK_M : 100);
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
    await trx.insertInto('redemptions').values({ code_id: code.id, achievement_id: achievement.id, user_sub: userSub, value, status: 'success', source, created_at: new Date(now) }).execute();
    // Nach dem Protokolleintrag: Die Zahl der Orte zählt Check-ins
    if (source === 'place') result.bonus.push(...await this.applyRules(trx, userSub, ['places_count'], false));
    return result;
  }

  /**
   * Unmöglich schneller Ortswechsel? Verglichen wird mit dem Ort des letzten erfolgreichen Check-ins
   * (dessen Mittelpunkt, nicht der damalige Standort der Person – der wird nicht gespeichert).
   */
  private async tooFast(trx: Transaction<DB>, userSub: string, code: Code, now: number): Promise<boolean> {
    const last = await trx.selectFrom('redemptions')
      .innerJoin('codes', 'codes.id', 'redemptions.code_id')
      .select(['redemptions.created_at', 'codes.geo_lat', 'codes.geo_lng', 'codes.geo_radius_m'])
      .where('redemptions.user_sub', '=', userSub).where('redemptions.source', '=', 'place').where('redemptions.status', '=', 'success')
      .orderBy('redemptions.created_at', 'desc').limit(1).executeTakeFirst();
    if (!last || last.geo_lat === null || last.geo_lng === null || code.geo_lat === null || code.geo_lng === null) return false;
    const gap = distanceM({ lat: last.geo_lat, lng: last.geo_lng }, { lat: code.geo_lat, lng: code.geo_lng })
      - (last.geo_radius_m ?? 0) - (code.geo_radius_m ?? 0);
    if (gap <= 0) return false;
    const seconds = (now - new Date(last.created_at).getTime()) / 1000;
    return seconds <= 0 || gap / seconds > PLACE_MAX_SPEED_MPS;
  }

  /** Fortschritt atomar erhöhen und Stufe neu berechnen. Wird auch für die Direktvergabe genutzt. */
  async applyProgress(trx: Transaction<DB>, achievement: Achievement, userSub: string, value: number, push = false, absolute = false): Promise<RedeemSuccess> {
    const now = new Date(this.now());
    // absolute: Plattform-Abzeichen – Fortschritt ist der Wert der Kennzahl (nie kleiner als bisher)
    const progress = absolute ? sql<number>`GREATEST(awards.progress, ${value})` : sql<number>`awards.progress + ${value}`;
    const award = await trx.insertInto('awards')
      .values({ achievement_id: achievement.id, user_sub: userSub, progress: value, tier: 0, first_earned_at: null, updated_at: now })
      .onConflict((oc) => oc.columns(['achievement_id', 'user_sub']).doUpdateSet({ progress, updated_at: now }))
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
    const auto = achievement.auto_rule !== null;
    const collections = firstTime && !auto ? (await evaluateCollections(trx, { userSub, itemId: achievement.id }, now)).map(unlockView) : [];
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
    // Erstes Verdienen eines normalen Abzeichens bringt Plattform-Abzeichen voran (nicht umgekehrt, keine Schleife)
    const bonus = firstTime && !auto ? await this.applyRules(trx, userSub, RULES_ON_EARN, push) : [];
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
      bonus,
    };
  }

  /** Plattform-Abzeichen mit diesen Regeln neu bewerten. Liefert nur, was dazukam oder aufstieg. */
  async applyRules(trx: Transaction<DB>, userSub: string, rules: readonly AutoRule[], push: boolean): Promise<BonusUnlock[]> {
    const list = await trx.selectFrom('achievements').selectAll()
      .where('auto_rule', 'in', [...rules]).where('status', '=', 'live').where('vetoed_at', 'is', null)
      // Nur Plattform-Abzeichen in ihrem Zeitfenster
      .where((eb) => eb.or([eb('available_from', 'is', null), eb('available_from', '<=', new Date(this.now()))]))
      .where((eb) => eb.or([eb('available_until', 'is', null), eb('available_until', '>', new Date(this.now()))]))
      .execute();
    if (list.length === 0) return [];
    const current = new Map((await trx.selectFrom('awards').select(['achievement_id', 'progress'])
      .where('user_sub', '=', userSub).where('achievement_id', 'in', list.map((a) => a.id)).execute()).map((a) => [a.achievement_id, a.progress]));
    const values = new Map<AutoRule, number>();
    const out: BonusUnlock[] = [];
    for (const a of list) {
      const rule = a.auto_rule!;
      if (!values.has(rule)) values.set(rule, await metric(trx, userSub, rule));
      const v = values.get(rule)!;
      if (v <= (current.get(a.id) ?? 0)) continue;
      const r = await this.applyProgress(trx, a, userSub, v, push, true);
      if (r.firstTime || r.tierUp) {
        out.push({ achievement: r.achievement, progress: r.progress, tier: r.tier, tierCount: r.tierCount, tierUp: r.tierUp, firstTime: r.firstTime, awardedText: r.awardedText });
      }
    }
    return out;
  }

  /**
   * App geöffnet: den Tag vermerken (nur Datum) und – einmal pro Tag – alle Plattform-Abzeichen neu bewerten.
   * So bekommen auch Personen, die schon vorher gesammelt haben, neue Plattform-Abzeichen.
   */
  async recordActivity(userSub: string): Promise<{ bonus: BonusUnlock[] }> {
    return this.db.transaction().execute(async (trx) => {
      const inserted = await trx.insertInto('user_activity_days').values({ user_sub: userSub, day: berlinDay(this.now()) })
        .onConflict((oc) => oc.doNothing()).returning('day').executeTakeFirst();
      if (!inserted) return { bonus: [] };
      // Die App läuft gerade: Mitteilung im Postfach und als Banner
      return { bonus: await this.applyRules(trx, userSub, AUTO_RULES, true) };
    });
  }

  /** Vorschau vor dem Einlösen: was gibt es, ist der Code gültig, wie steht die Person? Verbraucht nichts. */
  async preview(scanned: string, userSub?: string) {
    const r = await this.resolve(this.db, scanned, false);
    if (!r.achievement || (!r.ok && r.status === 'unavailable')) {
      return { status: r.ok ? 'ok' : r.status, message: r.ok ? null : (r.message ?? MESSAGES[r.status]), achievement: null, template: r.code?.template ?? null, value: null, award: null };
    }
    let award = null;
    if (userSub) {
      const a = await this.db.selectFrom('awards').select(['progress', 'tier']).where('achievement_id', '=', r.achievement.id).where('user_sub', '=', userSub).executeTakeFirst();
      if (a) award = { progress: a.progress, tier: a.tier };
    }
    return {
      status: r.ok ? 'ok' : r.status,
      message: r.ok ? null : (r.message ?? MESSAGES[r.status]),
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
      if (achievement.auto_rule) throw conflict('auto_rule', 'Plattform-Abzeichen werden automatisch vergeben');
      const window = windowState(achievement, this.now());
      if (window) throw new ApiError(window.status === 'ended' ? 410 : 409, window.status, window.message);

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
            nextThreshold: t.nextThreshold, awardedText: achievement.awarded_text, collections: [], bonus: [], replayed: true,
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
