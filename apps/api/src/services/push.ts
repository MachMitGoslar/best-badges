// Push-Versand direkt an Apple (APNs, HTTP/2, Token-Anmeldung mit .p8-Schlüssel) und der Worker,
// der die Tabelle push_outbox abarbeitet. Kein Drittanbieter sieht Inhalte oder Geräte-Tokens.
import { connect, type ClientHttp2Session } from 'node:http2';
import { readFileSync } from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';
import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';
import type { NotificationService } from './notifications.ts';

export interface ApnsConfig { keyFile: string; keyId: string; teamId: string; topic: string }

export interface PushMessage { title: string; body: string; link: string | null; category: string; badge: number; marketing: boolean }
/** ok | gone (Token ungültig, Gerät deaktivieren) | retry (später erneut) | fail (aufgeben) */
export type SendResult = { status: 'ok' } | { status: 'gone' | 'retry' | 'fail'; reason: string };
export interface PushSender { send(token: string, environment: 'development' | 'production', msg: PushMessage): Promise<SendResult> }

const HOSTS = { production: 'https://api.push.apple.com', development: 'https://api.sandbox.push.apple.com' } as const;

export class ApnsSender implements PushSender {
  private key: Promise<CryptoKey>;
  private jwt: { token: string; at: number } | null = null;
  private sessions = new Map<string, ClientHttp2Session>();

  constructor(private cfg: ApnsConfig) {
    // Schlüssel nur einmal lesen; er bleibt im Speicher und wird nie ausgegeben
    this.key = importPKCS8(readFileSync(cfg.keyFile, 'utf8'), 'ES256');
  }

  /** Apple verlangt ein höchstens 60 Minuten altes Token, erneuert aber höchstens alle 20 Minuten */
  private async bearer(force = false) {
    if (!force && this.jwt && Date.now() - this.jwt.at < 40 * 60_000) return this.jwt.token;
    const token = await new SignJWT({}).setProtectedHeader({ alg: 'ES256', kid: this.cfg.keyId })
      .setIssuer(this.cfg.teamId).setIssuedAt().sign(await this.key);
    this.jwt = { token, at: Date.now() };
    return token;
  }

  private session(host: string) {
    const s = this.sessions.get(host);
    if (s && !s.closed && !s.destroyed) return s;
    const n = connect(host);
    n.on('error', () => this.sessions.delete(host));
    n.on('close', () => this.sessions.delete(host));
    n.setTimeout(10 * 60_000, () => n.close());
    this.sessions.set(host, n);
    return n;
  }

  async send(token: string, environment: 'development' | 'production', msg: PushMessage): Promise<SendResult> {
    const payload = JSON.stringify({
      aps: { alert: { title: msg.title, body: msg.body }, sound: 'default', badge: msg.badge, 'thread-id': msg.category },
      ...(msg.link ? { link: msg.link } : {}),
    });
    const attempt = async (force: boolean): Promise<{ status: number; reason: string }> => {
      const auth = await this.bearer(force);
      return new Promise((resolve) => {
        const req = this.session(HOSTS[environment]).request({
          ':method': 'POST', ':path': `/3/device/${token}`,
          authorization: `bearer ${auth}`,
          'apns-topic': this.cfg.topic,
          'apns-push-type': 'alert',
          // Werbliches mit niedriger Priorität und kurzer Gültigkeit
          'apns-priority': msg.marketing ? '5' : '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + (msg.marketing ? 86_400 : 7 * 86_400)),
          'content-type': 'application/json',
        });
        let status = 0, body = '';
        req.setTimeout(15_000, () => req.close());
        req.on('response', (h) => { status = Number(h[':status']); });
        req.on('data', (c: Buffer) => { body += c.toString(); });
        req.on('end', () => {
          let reason = '';
          try { reason = (JSON.parse(body || '{}') as { reason?: string }).reason ?? ''; } catch { /* leer */ }
          resolve({ status, reason });
        });
        req.on('error', (e) => resolve({ status: 0, reason: e.message }));
        req.end(payload);
      });
    };
    let r = await attempt(false);
    if (r.status === 403 && r.reason === 'ExpiredProviderToken') r = await attempt(true);
    if (r.status === 200) return { status: 'ok' };
    if (r.status === 410 || ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(r.reason)) return { status: 'gone', reason: r.reason || String(r.status) };
    if (r.status === 0 || r.status === 429 || r.status >= 500) return { status: 'retry', reason: r.reason || String(r.status) };
    return { status: 'fail', reason: r.reason || String(r.status) };
  }

  close() { for (const s of this.sessions.values()) s.close(); }
}

const MAX_ATTEMPTS = 8;
const MARKETING = new Set(['news', 'campaigns', 'reminders']);

/**
 * Arbeitet fällige Einträge der push_outbox ab. Mehrere Instanzen sind möglich: Einträge werden mit
 * FOR UPDATE SKIP LOCKED geholt und durch Vorziehen von next_attempt_at für 5 Minuten reserviert.
 */
export class PushWorker {
  private timers: NodeJS.Timeout[] = [];
  private busy = false;

  constructor(private db: Kysely<DB>, private sender: PushSender, private notifications: NotificationService) {}

  start() {
    const tick = () => { void this.runOnce().catch((e) => console.error('Push-Worker:', (e as Error).message)); };
    this.timers.push(setInterval(tick, 3000));
    const hourly = () => {
      void this.notifications.sendReminders().catch((e) => console.error('Erinnerungen:', (e as Error).message));
      void this.notifications.cleanup().catch((e) => console.error('Aufräumen:', (e as Error).message));
    };
    this.timers.push(setInterval(hourly, 3_600_000));
    tick();
  }

  stop() { this.timers.forEach(clearInterval); this.timers = []; }

  /** Ein Durchlauf; liefert die Zahl der bearbeiteten Einträge */
  async runOnce(limit = 50): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try {
      const jobs = await this.db.transaction().execute(async (trx) => {
        const due = await trx.selectFrom('push_outbox').select(['id']).where('status', '=', 'pending').where('next_attempt_at', '<=', new Date())
          .orderBy('id').limit(limit).forUpdate().skipLocked().execute();
        if (!due.length) return [];
        const ids = due.map((d) => d.id);
        await trx.updateTable('push_outbox').set({ next_attempt_at: new Date(Date.now() + 5 * 60_000) }).where('id', 'in', ids).execute();
        return trx.selectFrom('push_outbox')
          .innerJoin('notifications', 'notifications.id', 'push_outbox.notification_id')
          .innerJoin('push_devices', 'push_devices.id', 'push_outbox.device_id')
          .select(['push_outbox.id', 'push_outbox.attempts', 'push_outbox.device_id', 'push_devices.token', 'push_devices.environment', 'push_devices.disabled_at',
            'notifications.user_sub', 'notifications.title', 'notifications.body', 'notifications.link', 'notifications.category'])
          .where('push_outbox.id', 'in', ids).execute();
      });
      for (const j of jobs) {
        if (j.disabled_at) { await this.finish(j.id, 'failed', 'device disabled'); continue; }
        const unread = await this.notifications.unread(j.user_sub);
        const r = await this.sender.send(j.token, j.environment, {
          title: j.title, body: j.body, link: j.link, category: j.category, badge: unread, marketing: MARKETING.has(j.category),
        });
        if (r.status === 'ok') await this.finish(j.id, 'sent', null);
        else if (r.status === 'gone') {
          await this.db.updateTable('push_devices').set({ disabled_at: new Date() }).where('id', '=', j.device_id).execute();
          await this.finish(j.id, 'failed', r.reason);
        } else if (r.status === 'retry' && j.attempts + 1 < MAX_ATTEMPTS) {
          const delay = Math.min(30_000 * 2 ** j.attempts, 6 * 3_600_000);
          await this.db.updateTable('push_outbox')
            .set({ attempts: sql`attempts + 1`, next_attempt_at: new Date(Date.now() + delay), last_error: r.reason.slice(0, 200) })
            .where('id', '=', j.id).execute();
        } else await this.finish(j.id, 'failed', r.reason);
      }
      return jobs.length;
    } finally {
      this.busy = false;
    }
  }

  private async finish(id: string, status: 'sent' | 'failed', error: string | null) {
    await this.db.updateTable('push_outbox')
      .set({ status, attempts: sql`attempts + 1`, last_error: error?.slice(0, 200) ?? null, ...(status === 'sent' ? { sent_at: new Date() } : {}) })
      .where('id', '=', id).execute();
  }
}
