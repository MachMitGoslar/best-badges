import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from './db/index.ts';
import { ADMIN_ORG, WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';
import { describe as describeSchedule, isOpen } from './services/schedule.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
// Samstag, 21.11.2026, 10:00 in Goslar (MEZ = UTC+1)
const SAT_10 = Date.parse('2026-11-21T09:00:00Z');
const HOUR = 3600_000, DAY = 24 * HOUR;
let clock = SAT_10;
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const orgBase = `/api/v1/orgs/${WALD_ORG}`;

beforeAll(async () => { db = await freshDatabase(); ({ call } = await testApp(db, { now: () => clock })); });
afterAll(async () => { await db.destroy(); });
beforeEach(() => { clock = SAT_10; });

async function live(extra: Record<string, unknown> = {}, org = WALD_ORG, user = 'waldpfad') {
  const res = await call('POST', `/api/v1/orgs/${org}/achievements`, user, { kind: 'single', name: 'Zeitlich', spec, ...extra });
  expect(res.status).toBe(201);
  expect((await call('POST', `/api/v1/orgs/${org}/achievements/${res.body.id}/publish`, user)).status).toBe(200);
  return res.body.id as string;
}
async function station(achievementId: string, extra: Record<string, unknown> = {}) {
  const res = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId, template: 'station', ...extra });
  expect(res.status).toBe(201);
  return res.body.items[0] as { id: string; url: string; schedule: unknown };
}
const redeem = (user: string, url: string) => call('POST', '/api/v1/redemptions', user, { code: url });

describe('Feste Zeiten: Logik', () => {
  const sat = [{ days: [6], from: '07:00', to: '13:00' }];
  it('prüft in Goslarer Ortszeit', () => {
    expect(isOpen(sat, SAT_10)).toBe(true);
    expect(isOpen(sat, SAT_10 + 4 * HOUR)).toBe(false); // 14:00
    expect(isOpen(sat, SAT_10 - 3.5 * HOUR)).toBe(false); // 06:30
    expect(isOpen(sat, SAT_10 + DAY)).toBe(false); // Sonntag
    expect(isOpen(null, SAT_10)).toBe(true);
  });
  it('über Mitternacht gehört zum Starttag', () => {
    const fri = [{ days: [5], from: '22:00', to: '02:00' }];
    expect(isOpen(fri, Date.parse('2026-11-20T22:30:00Z'))).toBe(true); // Fr 23:30
    expect(isOpen(fri, Date.parse('2026-11-21T00:30:00Z'))).toBe(true); // Sa 01:30
    expect(isOpen(fri, Date.parse('2026-11-21T01:30:00Z'))).toBe(false); // Sa 02:30
    expect(isOpen(fri, Date.parse('2026-11-21T22:30:00Z'))).toBe(false); // Sa 23:30
  });
  it('folgt der Sommerzeit', () => {
    const early = [{ days: [1, 2, 3, 4, 5, 6, 7], from: '08:00', to: '09:00' }];
    expect(isOpen(early, Date.parse('2026-07-01T06:30:00Z'))).toBe(true); // 08:30 MESZ
    expect(isOpen(early, Date.parse('2026-01-14T07:30:00Z'))).toBe(true); // 08:30 MEZ
    expect(isOpen(early, Date.parse('2026-07-01T07:30:00Z'))).toBe(false); // 09:30 MESZ
  });
  it('beschreibt Zeiten lesbar', () => {
    expect(describeSchedule([{ days: [1, 2, 3, 4, 5], from: '06:00', to: '08:00' }, { days: [6], from: '07:00', to: '13:00' }]))
      .toBe('Mo–Fr 06:00–08:00 · Sa 07:00–13:00');
    expect(describeSchedule([{ days: [6, 7], from: '10:00', to: '12:00' }])).toBe('Sa, So 10:00–12:00');
    expect(describeSchedule([{ days: [1, 2, 3, 4, 5, 6, 7], from: '22:00', to: '02:00' }])).toBe('täglich 22:00–02:00');
  });
});

describe('Feste Zeiten an Codes und Orten', () => {
  it('Einlösen nur innerhalb der Zeiten, mit verständlicher Meldung', async () => {
    const id = await live();
    const s = await station(id, { schedule: [{ days: [6], from: '07:00', to: '13:00' }] });
    expect(s.schedule).toEqual([{ days: [6], from: '07:00', to: '13:00' }]);
    clock = SAT_10 + 4 * HOUR;
    const closed = await redeem('mara', s.url);
    expect(closed.status).toBe(409);
    expect(closed.body).toMatchObject({ error: 'closed', message: 'Das geht nur zu bestimmten Zeiten: Sa 07:00–13:00.' });
    clock = SAT_10;
    expect((await redeem('mara', s.url)).status).toBe(200);
  });

  it('prüft die Eingabe und lässt sich ändern oder entfernen', async () => {
    const id = await live();
    const noDays = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'station', schedule: [{ days: [], from: '07:00', to: '13:00' }] });
    expect(noDays.status).toBe(422);
    const same = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'station', schedule: [{ days: [1], from: '07:00', to: '07:00' }] });
    expect(same.status).toBe(422);
    const bad = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'station', schedule: [{ days: [1], from: '7 Uhr', to: '13:00' }] });
    expect(bad.status).toBe(422);
    const s = await station(id, { schedule: [{ days: [1], from: '07:00', to: '08:00' }] });
    expect((await redeem('nils', s.url)).body.error).toBe('closed');
    const cleared = await call('PATCH', `${orgBase}/codes/${s.id}`, 'waldpfad', { schedule: null });
    expect(cleared.body.schedule).toBeNull();
    expect((await redeem('nils', s.url)).status).toBe(200);
  });

  it('Orte melden ihre Zeiten und ob gerade offen ist', async () => {
    const id = await live();
    const res = await call('POST', `${orgBase}/codes`, 'waldpfad', {
      achievementId: id, template: 'place', placeName: 'Wochenmarkt', geo: { lat: 51.9059, lng: 10.429, radiusM: 60 },
      schedule: [{ days: [6], from: '07:00', to: '13:00' }],
    });
    const placeId = res.body.items[0].id;
    let p = (await call('GET', '/api/v1/places')).body.items.find((x: { id: string }) => x.id === placeId);
    expect(p).toMatchObject({ openNow: true, scheduleText: 'Sa 07:00–13:00' });
    clock = SAT_10 + DAY;
    p = (await call('GET', '/api/v1/places')).body.items.find((x: { id: string }) => x.id === placeId);
    expect(p.openNow).toBe(false);
    const checkIn = await call('POST', `/api/v1/places/${placeId}/checkins`, 'olga', { geo: { lat: 51.9059, lng: 10.429, accuracyM: 10 } });
    expect(checkIn.body.error).toBe('closed');
  });
});

describe('Zeitfenster am Abzeichen', () => {
  it('erst ab, nur bis – für alle Codes, mit Datum in der Meldung', async () => {
    const id = await live({ availableFrom: '2026-11-25T00:00:00+01:00', availableUntil: '2026-12-31T00:00:00+01:00' });
    const s = await station(id);
    const early = await redeem('paul', s.url);
    expect(early.status).toBe(409);
    expect(early.body).toMatchObject({ error: 'not_started', message: 'Dieses Abzeichen gibt es erst ab dem 25.11.2026.' });

    clock = Date.parse('2026-12-01T12:00:00Z');
    expect((await redeem('paul', s.url)).status).toBe(200);

    clock = Date.parse('2027-01-02T12:00:00Z');
    const late = await redeem('rosa', s.url);
    expect(late.status).toBe(410);
    expect(late.body).toMatchObject({ error: 'ended', message: 'Dieses Abzeichen gab es nur bis zum 31.12.2026.' });
    // Wer es hat, behält es
    const awards = await call('GET', '/api/v1/users/me/awards', 'paul');
    expect(awards.body.items.map((a: { achievement: { id: string } }) => a.achievement.id)).toContain(id);
  });

  it('öffentlich sichtbar mit Zeitfenster, prüft die Reihenfolge und lässt sich verlängern', async () => {
    const id = await live({ availableUntil: '2026-12-24T18:00:00+01:00' });
    const pub = await call('GET', `/api/v1/achievements/${id}`);
    expect(pub.body).toMatchObject({ availableFrom: null, availableUntil: '2026-12-24T17:00:00.000Z' });
    const wrong = await call('PATCH', `${orgBase}/achievements/${id}`, 'waldpfad', { availableFrom: '2026-12-25T00:00:00+01:00' });
    expect(wrong.status).toBe(422);
    const longer = await call('PATCH', `${orgBase}/achievements/${id}`, 'waldpfad', { availableUntil: '2027-01-06T00:00:00+01:00' });
    expect(longer.status).toBe(200);
    expect(longer.body.availableUntil).toBe('2027-01-05T23:00:00.000Z');
  });

  it('Orte außerhalb des Zeitfensters erscheinen nicht auf der Karte', async () => {
    const id = await live({ availableFrom: '2026-12-01T00:00:00+01:00' });
    const res = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'place', placeName: 'Advent', geo: { lat: 51.9, lng: 10.43, radiusM: 60 } });
    const placeId = res.body.items[0].id;
    const ids = () => call('GET', '/api/v1/places').then((r) => r.body.items.map((x: { id: string }) => x.id));
    expect(await ids()).not.toContain(placeId);
    clock = Date.parse('2026-12-02T10:00:00Z');
    expect(await ids()).toContain(placeId);
  });

  it('gilt auch für Plattform-Abzeichen', async () => {
    const auto = await live({ name: 'Herbst-Aktion', autoRule: 'active_days', availableUntil: '2026-11-21T00:00:00+01:00' }, ADMIN_ORG, 'admin');
    const res = await call('POST', '/api/v1/users/me/activity', 'sven');
    expect(res.body.bonus.map((b: { achievement: { id: string } }) => b.achievement.id)).not.toContain(auto);
  });
});
