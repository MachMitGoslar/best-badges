// Benachrichtigungen: Postfach in der App, Einstellungen, Geräte für Push, Rundschreiben der Haupt-Admin-
// Organisation und Erinnerungen. Versand an Apple erledigt der PushWorker über die Tabelle push_outbox.
//
// Grundsätze:
// - Werbliche Kategorien (news, campaigns) und Erinnerungen nur mit Einwilligung (Standard aus, consent_at als Nachweis).
// - awards/requests landen immer im Postfach; Push nur, wenn die Kategorie an ist und das Gerät Push erlaubt.
// - Werbliches und Erinnerungen werden nur zwischen 9 und 20 Uhr (Berlin) zugestellt.
// - Keine personenbezogenen Inhalte im Text: Abzeichen- und Organisationsnamen, keine Namen von Personen.
import { sql, type Kysely, type Transaction } from 'kysely';
import type { DB, NotificationCategory } from '../db/types.ts';
import { ApiError } from '../errors.ts';

type Exec = Kysely<DB> | Transaction<DB>;

export const CATEGORIES = ['awards', 'requests', 'news', 'campaigns', 'reminders'] as const;
/** Ohne Einwilligung nichts davon – weder Postfach noch Push */
const CONSENT_REQUIRED = new Set<NotificationCategory>(['news', 'campaigns', 'reminders']);
const DEFAULTS: Record<NotificationCategory, boolean> = { awards: true, requests: true, news: false, campaigns: false, reminders: false };

export type Prefs = Record<NotificationCategory, boolean>;

export interface NotifyInput {
  userSubs: string[];
  category: NotificationCategory;
  title: string;
  body: string;
  link?: string | null;
  /** false: nur ins Postfach (z. B. wenn die Person das Ergebnis gerade selbst auf dem Bildschirm sieht) */
  push?: boolean;
  broadcastId?: string | null;
}

const REMINDER_AFTER_DAYS = 14;
const MAX_BROADCASTS_PER_DAY = 3;
const LINK_RE = /^\/[A-Za-z0-9/_-]{0,120}$/;

/** Stunde in Berlin (0–23) */
const HOUR_FMT = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' });
// Nur den Stundenwert lesen (format() kann je nach Sprache „22 Uhr“ liefern)
const berlinHour = (d: Date) => Number(HOUR_FMT.formatToParts(d).find((p) => p.type === 'hour')!.value);

/** Nächster Zeitpunkt im Fenster 9–20 Uhr (Berlin), in 15-Minuten-Schritten gesucht */
export function nextQuietWindow(now: Date): Date {
  let t = new Date(now);
  for (let i = 0; i < 4 * 24 && (berlinHour(t) < 9 || berlinHour(t) >= 20); i++) t = new Date(t.getTime() + 15 * 60_000);
  return t;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export class NotificationService {
  /** Gemerkte Mitgliedschaften (org:sub → Zeitpunkt), damit nicht jede Anfrage schreibt */
  private seen = new Map<string, number>();

  constructor(
    private db: Kysely<DB>,
    private opts: { pushEnabled: boolean },
    private now: () => number = Date.now,
  ) {}

  // ── Erzeugen ────────────────────────────────────────────────────────────

  /** Legt Nachrichten an (gleiche Transaktion wie der Anlass) und reiht Push für erlaubte Geräte ein. */
  async notify(db: Exec, input: NotifyInput): Promise<number> {
    const subs = [...new Set(input.userSubs)];
    if (!subs.length) return 0;
    const prefs = await this.prefsMap(db, subs);
    const now = new Date(this.now());
    const rows = subs.flatMap((sub) => {
      const p = prefs.get(sub) ?? DEFAULTS;
      if (CONSENT_REQUIRED.has(input.category) && !p[input.category]) return [];
      return [{ sub, push: input.push !== false && p[input.category] }];
    });
    if (!rows.length) return 0;
    const link = input.link && LINK_RE.test(input.link) ? input.link : null;
    const created = await db.insertInto('notifications').values(rows.map((r) => ({
      user_sub: r.sub, category: input.category, title: clip(input.title, 80), body: clip(input.body, 240), link,
      broadcast_id: input.broadcastId ?? null, created_at: now,
    }))).returning(['id', 'user_sub']).execute();

    const pushSubs = new Set(rows.filter((r) => r.push).map((r) => r.sub));
    if (this.opts.pushEnabled && pushSubs.size) {
      const devices = await db.selectFrom('push_devices').select(['id', 'user_sub'])
        .where('user_sub', 'in', [...pushSubs]).where('disabled_at', 'is', null).execute();
      const at = CONSENT_REQUIRED.has(input.category) ? nextQuietWindow(now) : now;
      const outbox = created.flatMap((n) => devices.filter((d) => d.user_sub === n.user_sub)
        .map((d) => ({ notification_id: n.id, device_id: d.id, next_attempt_at: at })));
      if (outbox.length) await db.insertInto('push_outbox').values(outbox).execute();
    }
    return created.length;
  }

  /** Mitglieder einer Organisation, die in den letzten 180 Tagen aktiv waren */
  async orgMembers(db: Exec, orgId: string): Promise<string[]> {
    const since = new Date(this.now() - 180 * 86_400_000);
    return (await db.selectFrom('org_members_seen').select('user_sub').where('org_id', '=', orgId).where('last_seen_at', '>=', since).execute())
      .map((r) => r.user_sub);
  }

  /** Nach erfolgreicher Anmeldung: Mitgliedschaften merken (höchstens stündlich je Person und Organisation) */
  async trackMembership(sub: string, orgIds: string[]) {
    const now = this.now();
    const due = orgIds.filter((o) => (this.seen.get(`${o}:${sub}`) ?? 0) < now - 3_600_000);
    if (!due.length) return;
    due.forEach((o) => this.seen.set(`${o}:${sub}`, now));
    await this.db.insertInto('org_members_seen').values(due.map((org_id) => ({ org_id, user_sub: sub, last_seen_at: new Date(now) })))
      .onConflict((oc) => oc.columns(['org_id', 'user_sub']).doUpdateSet({ last_seen_at: new Date(now) })).execute();
  }

  // ── Postfach ────────────────────────────────────────────────────────────

  async inbox(userSub: string, opts: { before?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
    let q = this.db.selectFrom('notifications').select(['id', 'category', 'title', 'body', 'link', 'created_at', 'read_at'])
      .where('user_sub', '=', userSub).orderBy('created_at', 'desc').orderBy('id', 'desc').limit(limit);
    if (opts.before) q = q.where('created_at', '<', new Date(opts.before));
    const [items, unread] = await Promise.all([
      q.execute(),
      this.db.selectFrom('notifications').select(sql<string>`count(*)`.as('n')).where('user_sub', '=', userSub).where('read_at', 'is', null).executeTakeFirstOrThrow(),
    ]);
    await this.touch(userSub);
    return {
      items: items.map((n) => ({ id: n.id, category: n.category, title: n.title, body: n.body, link: n.link, createdAt: n.created_at.toISOString(), read: n.read_at !== null })),
      unread: Number(unread.n),
    };
  }

  async markRead(userSub: string, input: { ids?: string[]; all?: boolean }) {
    let q = this.db.updateTable('notifications').set({ read_at: new Date(this.now()) }).where('user_sub', '=', userSub).where('read_at', 'is', null);
    if (!input.all) {
      if (!input.ids?.length) return { unread: await this.unread(userSub) };
      q = q.where('id', 'in', input.ids);
    }
    await q.execute();
    return { unread: await this.unread(userSub) };
  }

  async unread(userSub: string) {
    const r = await this.db.selectFrom('notifications').select(sql<string>`count(*)`.as('n')).where('user_sub', '=', userSub).where('read_at', 'is', null).executeTakeFirstOrThrow();
    return Number(r.n);
  }

  /** App wurde benutzt (für Erinnerungen) – höchstens einmal pro Stunde geschrieben */
  private async touch(userSub: string) {
    const now = new Date(this.now());
    await this.db.insertInto('notification_prefs').values({ user_sub: userSub, last_active_at: now, updated_at: now })
      .onConflict((oc) => oc.column('user_sub').doUpdateSet({ last_active_at: now })
        .where(sql<boolean>`notification_prefs.last_active_at IS NULL OR notification_prefs.last_active_at < ${new Date(now.getTime() - 3_600_000)}`))
      .execute();
  }

  // ── Einstellungen ───────────────────────────────────────────────────────

  private async prefsMap(db: Exec, subs: string[]) {
    const rows = await db.selectFrom('notification_prefs').select(['user_sub', ...CATEGORIES]).where('user_sub', 'in', subs).execute();
    return new Map(rows.map((r) => [r.user_sub, { awards: r.awards, requests: r.requests, news: r.news, campaigns: r.campaigns, reminders: r.reminders } as Prefs]));
  }

  async settings(userSub: string) {
    const r = await this.db.selectFrom('notification_prefs').selectAll().where('user_sub', '=', userSub).executeTakeFirst();
    const devices = await this.db.selectFrom('push_devices').select(sql<string>`count(*)`.as('n')).where('user_sub', '=', userSub).where('disabled_at', 'is', null).executeTakeFirstOrThrow();
    return {
      prefs: r ? { awards: r.awards, requests: r.requests, news: r.news, campaigns: r.campaigns, reminders: r.reminders } : { ...DEFAULTS },
      consentAt: r?.consent_at?.toISOString() ?? null,
      pushDevices: Number(devices.n),
      pushAvailable: this.opts.pushEnabled,
    };
  }

  async updateSettings(userSub: string, input: Partial<Prefs>) {
    const now = new Date(this.now());
    const before = (await this.settings(userSub)).prefs;
    const next = { ...before, ...input };
    const consentChanged = [...CONSENT_REQUIRED].some((c) => next[c] !== before[c]);
    const values = { ...next, updated_at: now, ...(consentChanged ? { consent_at: now } : {}) };
    await this.db.insertInto('notification_prefs').values({ user_sub: userSub, ...values })
      .onConflict((oc) => oc.column('user_sub').doUpdateSet(values)).execute();
    return this.settings(userSub);
  }

  // ── Geräte ──────────────────────────────────────────────────────────────

  async registerDevice(userSub: string, token: string, environment: 'development' | 'production') {
    const now = new Date(this.now());
    // Gleiches Gerät, andere Person: Token wechselt den Besitzer (alte Person bekommt dort nichts mehr)
    await this.db.insertInto('push_devices').values({ user_sub: userSub, token, environment, last_seen_at: now })
      .onConflict((oc) => oc.column('token').doUpdateSet({ user_sub: userSub, environment, last_seen_at: now, disabled_at: null })).execute();
    await this.touch(userSub);
    return { ok: true as const };
  }

  async unregisterDevice(userSub: string, token: string) {
    await this.db.deleteFrom('push_devices').where('user_sub', '=', userSub).where('token', '=', token).execute();
    return { ok: true as const };
  }

  // ── Rundschreiben (Haupt-Admin) ─────────────────────────────────────────

  async broadcast(actor: string, input: { category: 'news' | 'campaigns'; title: string; body: string; link?: string | null; dryRun?: boolean }) {
    if (input.link && !LINK_RE.test(input.link)) throw new ApiError(422, 'invalid', 'Link muss ein Pfad in der App sein, z. B. /achievements/<id>');
    const audience = this.db.selectFrom('notification_prefs').select('user_sub').where(input.category, '=', true);
    const count = Number((await this.db.selectFrom(audience.as('a')).select(sql<string>`count(*)`.as('n')).executeTakeFirstOrThrow()).n);
    if (input.dryRun) return { id: null, recipients: count, sent: false };

    const since = new Date(this.now() - 86_400_000);
    const today = Number((await this.db.selectFrom('broadcasts').select(sql<string>`count(*)`.as('n')).where('created_at', '>=', since).executeTakeFirstOrThrow()).n);
    if (today >= MAX_BROADCASTS_PER_DAY) throw new ApiError(429, 'too_many', `Höchstens ${MAX_BROADCASTS_PER_DAY} Rundschreiben in 24 Stunden`);

    return this.db.transaction().execute(async (trx) => {
      const b = await trx.insertInto('broadcasts').values({ category: input.category, title: input.title, body: input.body, link: input.link ?? null, created_by: actor })
        .returning('id').executeTakeFirstOrThrow();
      const subs = (await trx.selectFrom('notification_prefs').select('user_sub').where(input.category, '=', true).execute()).map((r) => r.user_sub);
      // In Blöcken, damit große Empfängerzahlen die Abfrage nicht sprengen
      let n = 0;
      for (let i = 0; i < subs.length; i += 1000) {
        n += await this.notify(trx, { userSubs: subs.slice(i, i + 1000), category: input.category, title: input.title, body: input.body, link: input.link, broadcastId: b.id });
      }
      await trx.updateTable('broadcasts').set({ recipients: n }).where('id', '=', b.id).execute();
      return { id: b.id, recipients: n, sent: true };
    });
  }

  async broadcasts() {
    const rows = await this.db.selectFrom('broadcasts').selectAll().orderBy('created_at', 'desc').limit(50).execute();
    return rows.map((b) => ({ id: b.id, category: b.category, title: b.title, body: b.body, link: b.link, recipients: b.recipients, createdAt: b.created_at.toISOString() }));
  }

  // ── Erinnerungen ────────────────────────────────────────────────────────

  /** Einmal pro Stunde aufgerufen; schickt nur zwischen 17 und 19 Uhr (Berlin). */
  async sendReminders(): Promise<number> {
    const now = new Date(this.now());
    const h = berlinHour(now);
    if (h < 17 || h >= 19) return 0;
    const cutoff = new Date(now.getTime() - REMINDER_AFTER_DAYS * 86_400_000);
    const due = await this.db.selectFrom('notification_prefs').select('user_sub')
      .where('reminders', '=', true)
      .where((eb) => eb.or([eb('last_active_at', 'is', null), eb('last_active_at', '<', cutoff)]))
      .where((eb) => eb.or([eb('last_reminder_at', 'is', null), eb('last_reminder_at', '<', cutoff)]))
      .limit(5000).execute();
    if (!due.length) return 0;
    const subs = due.map((r) => r.user_sub);
    return this.db.transaction().execute(async (trx) => {
      await trx.updateTable('notification_prefs').set({ last_reminder_at: now }).where('user_sub', 'in', subs).execute();
      return this.notify(trx, { userSubs: subs, category: 'reminders', title: 'Schon länger nicht gesammelt', body: 'In Goslar warten neue Abzeichen auf dich. Schau mal wieder rein!', link: '/' });
    });
  }

  /** Aufräumen: alte Nachrichten (180 Tage) und erledigte Push-Einträge (7 Tage) */
  async cleanup() {
    const now = this.now();
    await this.db.deleteFrom('push_outbox').where('status', '<>', 'pending').where('created_at', '<', new Date(now - 7 * 86_400_000)).execute();
    await this.db.deleteFrom('notifications').where('created_at', '<', new Date(now - 180 * 86_400_000)).execute();
  }

}
