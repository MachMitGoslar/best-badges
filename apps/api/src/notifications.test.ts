import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from './db/index.ts';
import { MUSEUM_ORG, WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';
import { NotificationService, nextQuietWindow } from './services/notifications.ts';
import { PushWorker, type PushMessage, type SendResult } from './services/push.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
let app: Awaited<ReturnType<typeof testApp>>['app'];
// Mittags in Berlin: Werbliches darf sofort raus
let clock = Date.parse('2026-11-18T11:00:00Z');
let notifications: NotificationService;
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const wald = `/api/v1/orgs/${WALD_ORG}`;
const museum = `/api/v1/orgs/${MUSEUM_ORG}`;
const TOKEN = (n: number) => n.toString(16).padStart(64, '0');

beforeAll(async () => {
  db = await freshDatabase();
  notifications = new NotificationService(db, { pushEnabled: true }, () => clock);
  ({ call, app } = await testApp(db, { now: () => clock, notifications }));
});
afterAll(async () => { await db.destroy(); });

async function live(base: string, user: string, body: Record<string, unknown>) {
  const a = (await call('POST', `${base}/achievements`, user, { spec, ...body })).body;
  expect((await call('POST', `${base}/achievements/${a.id}/publish`, user)).status).toBe(200);
  return a.id as string;
}
const station = async (base: string, user: string, id: string) => (await call('POST', `${base}/codes`, user, { achievementId: id, template: 'station' })).body.items[0].url as string;
const outboxFor = (sub: string) => db.selectFrom('push_outbox').innerJoin('notifications', 'notifications.id', 'push_outbox.notification_id')
  .select(['push_outbox.status', 'notifications.category', 'notifications.title']).where('notifications.user_sub', '=', sub).execute();

class FakeSender {
  sent: { token: string; msg: PushMessage }[] = [];
  next: SendResult = { status: 'ok' };
  async send(token: string, _env: string, msg: PushMessage) { this.sent.push({ token, msg }); return this.next; }
}

describe('Postfach und Push', () => {
  it('legt bei eigener Einlösung nur einen Eintrag im Postfach an, ohne Push', async () => {
    expect((await call('POST', '/api/v1/users/me/push-devices', 'nina', { token: TOKEN(1), environment: 'development' })).status).toBe(200);
    const id = await live(wald, 'waldpfad', { kind: 'single', name: 'Hexenstieg' });
    expect((await call('POST', '/api/v1/redemptions', 'nina', { code: await station(wald, 'waldpfad', id) })).status).toBe(200);

    const inbox = (await call('GET', '/api/v1/users/me/notifications', 'nina')).body;
    expect(inbox.unread).toBe(1);
    expect(inbox.items[0]).toMatchObject({ category: 'awards', title: 'Neues Abzeichen', body: 'Hexenstieg', link: `/achievements/${id}`, read: false });
    expect(await outboxFor('nina')).toEqual([]);

    expect((await call('POST', '/api/v1/users/me/notifications/read', 'nina', { all: true })).body).toEqual({ unread: 0 });
  });

  it('schickt bei Vergabe von außen (API-Schlüssel) Push an angemeldete Geräte', async () => {
    const id = await live(wald, 'waldpfad', { kind: 'single', name: 'Hofladen' });
    const { secret } = (await call('POST', `${wald}/api-keys`, 'waldpfad', { name: 'Kasse', scopes: ['awards:create'] })).body;
    const res = await app.request('/api/v1/integrations/awards', { method: 'POST', headers: { 'X-Api-Key': secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ achievementId: id, userSub: 'nina' }) });
    expect(res.status).toBe(200);
    expect(await outboxFor('nina')).toEqual([{ status: 'pending', category: 'awards', title: 'Neues Abzeichen' }]);

    // Worker: Erfolg → gesendet, mit Zahl der ungelesenen als App-Symbol-Zähler
    const sender = new FakeSender();
    expect(await new PushWorker(db, sender, notifications).runOnce()).toBe(1);
    expect(sender.sent[0]).toMatchObject({ token: TOKEN(1), msg: { title: 'Neues Abzeichen', body: 'Hofladen', badge: 1, marketing: false } });
    expect((await outboxFor('nina'))[0]!.status).toBe('sent');
  });

  it('deaktiviert von Apple abgelehnte Geräte und wiederholt vorübergehende Fehler', async () => {
    await call('POST', '/api/v1/users/me/push-devices', 'otto', { token: TOKEN(2), environment: 'production' });
    await call('POST', '/api/v1/users/me/push-devices', 'otto', { token: TOKEN(3), environment: 'production' });
    await db.transaction().execute((trx) => notifications.notify(trx, { userSubs: ['otto'], category: 'awards', title: 'T', body: 'B' }));
    const sender = new FakeSender();
    const worker = new PushWorker(db, sender, notifications);
    sender.next = { status: 'gone', reason: 'Unregistered' };
    await worker.runOnce(1);
    sender.next = { status: 'retry', reason: '503' };
    await worker.runOnce(1);
    const devices = await db.selectFrom('push_devices').select(['token', 'disabled_at']).where('user_sub', '=', 'otto').orderBy('token').execute();
    expect(devices.map((d) => d.disabled_at !== null)).toEqual([true, false]);
    const rows = await db.selectFrom('push_outbox').innerJoin('notifications', 'notifications.id', 'push_outbox.notification_id')
      .select(['push_outbox.status', 'push_outbox.attempts', 'push_outbox.next_attempt_at']).where('notifications.user_sub', '=', 'otto').orderBy('push_outbox.id').execute();
    expect(rows[0]).toMatchObject({ status: 'failed', attempts: 1 });
    expect(rows[1]).toMatchObject({ status: 'pending', attempts: 1 });
    expect(rows[1]!.next_attempt_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('gibt ein Gerät beim Wechsel der Person weiter und meldet es beim Abmelden ab', async () => {
    await call('POST', '/api/v1/users/me/push-devices', 'paul', { token: TOKEN(9), environment: 'development' });
    await call('POST', '/api/v1/users/me/push-devices', 'quinn', { token: TOKEN(9), environment: 'development' });
    expect((await db.selectFrom('push_devices').select('user_sub').where('token', '=', TOKEN(9)).executeTakeFirstOrThrow()).user_sub).toBe('quinn');
    expect((await call('DELETE', `/api/v1/users/me/push-devices/${TOKEN(9)}`, 'quinn')).status).toBe(200);
    expect(await db.selectFrom('push_devices').select('id').where('token', '=', TOKEN(9)).execute()).toEqual([]);
    expect((await call('POST', '/api/v1/users/me/push-devices', 'quinn', { token: 'nicht-hex', environment: 'development' })).status).toBe(422);
  });
});

describe('Einwilligungen und Rundschreiben', () => {
  it('werbliche Kategorien sind aus, bis die Person zustimmt (mit Zeitpunkt als Nachweis)', async () => {
    const s = (await call('GET', '/api/v1/users/me/notification-settings', 'rita')).body;
    expect(s).toMatchObject({ prefs: { awards: true, requests: true, news: false, campaigns: false, reminders: false }, consentAt: null, pushAvailable: true });
    const after = (await call('PUT', '/api/v1/users/me/notification-settings', 'rita', { news: true })).body;
    expect(after.prefs.news).toBe(true);
    expect(after.consentAt).toBe(new Date(clock).toISOString());
  });

  it('geht nur an Zustimmende; nur die Haupt-Admin-Organisation; höchstens 3 pro Tag', async () => {
    await call('POST', '/api/v1/users/me/push-devices', 'rita', { token: TOKEN(20), environment: 'development' });
    const msg = { category: 'news', title: 'Neue Abzeichen am Rammelsberg', body: 'Entdecke drei neue Stationen.', link: '/' };
    expect((await call('POST', '/api/v1/admin/broadcasts', 'waldpfad', msg)).status).toBe(403);
    expect((await call('POST', '/api/v1/admin/broadcasts', 'admin', { ...msg, dryRun: true })).body).toEqual({ id: null, recipients: 1, sent: false });
    expect((await call('POST', '/api/v1/admin/broadcasts', 'admin', { ...msg, link: 'https://evil.test' })).status).toBe(422);

    const sent = (await call('POST', '/api/v1/admin/broadcasts', 'admin', msg)).body;
    expect(sent).toMatchObject({ recipients: 1, sent: true });
    expect((await call('GET', '/api/v1/users/me/notifications', 'rita')).body.items[0]).toMatchObject({ category: 'news', title: msg.title });
    // Wer nicht zugestimmt hat, bekommt nichts
    expect((await call('GET', '/api/v1/users/me/notifications', 'nina')).body.items.some((i: { category: string }) => i.category === 'news')).toBe(false);
    expect((await outboxFor('rita'))[0]).toMatchObject({ category: 'news', status: 'pending' });

    await call('POST', '/api/v1/admin/broadcasts', 'admin', msg);
    await call('POST', '/api/v1/admin/broadcasts', 'admin', msg);
    expect((await call('POST', '/api/v1/admin/broadcasts', 'admin', msg)).status).toBe(429);
    expect((await call('GET', '/api/v1/admin/broadcasts', 'admin')).body.items).toHaveLength(3);
  });

  it('stellt Werbliches nur zwischen 9 und 20 Uhr (Berlin) zu', () => {
    expect(nextQuietWindow(new Date('2026-11-18T11:00:00Z')).toISOString()).toBe('2026-11-18T11:00:00.000Z');
    // 22 Uhr Berlin (Winterzeit, UTC+1) → nächster Morgen 9 Uhr
    expect(nextQuietWindow(new Date('2026-11-18T21:00:00Z')).toISOString()).toBe('2026-11-19T08:00:00.000Z');
  });

  it('erinnert nach 14 Tagen ohne Besuch, nur mit Zustimmung, höchstens alle 14 Tage', async () => {
    await call('PUT', '/api/v1/users/me/notification-settings', 'sven', { reminders: true });
    await call('PUT', '/api/v1/users/me/notification-settings', 'tara', { reminders: false });
    await db.updateTable('notification_prefs').set({ last_active_at: new Date(clock - 20 * 86_400_000) }).where('user_sub', 'in', ['sven', 'tara']).execute();
    const saved = clock;
    clock = Date.parse('2026-11-18T17:30:00Z'); // 18:30 Berlin
    expect(await notifications.sendReminders()).toBe(1);
    expect(await notifications.sendReminders()).toBe(0);
    clock = saved;
    const subs = (await db.selectFrom('notifications').select('user_sub').where('category', '=', 'reminders').execute()).map((r) => r.user_sub);
    expect(subs).toEqual(['sven']);
  });
});

describe('Sammelanfragen', () => {
  it('benachrichtigt aktive Mitglieder der angefragten und der anfragenden Organisation', async () => {
    await notifications.trackMembership('museum', [MUSEUM_ORG]);
    await notifications.trackMembership('waldpfad', [WALD_ORG]);
    const pfad = await live(wald, 'waldpfad', { kind: 'single', name: 'Pfad' });
    const stollen = await live(museum, 'museum', { kind: 'single', name: 'Stollen', openForCollections: true });
    const combo = (await call('POST', `${wald}/achievements`, 'waldpfad', { spec, kind: 'collection', name: 'Harz-Entdecker', requiredCount: 2, items: [pfad, stollen] })).body;

    const m = (await call('GET', '/api/v1/users/me/notifications', 'museum')).body.items[0];
    expect(m).toMatchObject({ category: 'requests', title: 'Neue Sammelanfrage' });
    expect(m.body).toContain('Harz-Entdecker');

    expect((await call('POST', `${museum}/collection-requests/${combo.id}/items/${stollen}/approve`, 'museum')).status).toBe(204);
    const w = (await call('GET', '/api/v1/users/me/notifications', 'waldpfad')).body.items[0];
    expect(w).toMatchObject({ category: 'requests', title: 'Sammelanfrage angenommen' });
  });
});
