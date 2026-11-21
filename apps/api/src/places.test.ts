import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from './db/index.ts';
import { WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
let clock = Date.parse('2026-11-21T10:00:00Z');
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const orgBase = `/api/v1/orgs/${WALD_ORG}`;

// Goslar: Marktplatz und Kaiserpfalz liegen ~600 m auseinander, Bad Harzburg ~10 km entfernt
const MARKT = { lat: 51.9059, lng: 10.4290 };
const PFALZ = { lat: 51.9013, lng: 10.4262 };
const HARZBURG = { lat: 51.8826, lng: 10.5617 };

beforeAll(async () => { db = await freshDatabase(); ({ call } = await testApp(db, { now: () => clock })); });
afterAll(async () => { await db.destroy(); });
beforeEach(() => { clock = Date.parse('2026-11-21T10:00:00Z'); });

async function liveAchievement(extra: Record<string, unknown> = {}) {
  const a = (await call('POST', `${orgBase}/achievements`, 'waldpfad', { kind: 'single', name: 'Entdecker', spec, ...extra })).body;
  await call('POST', `${orgBase}/achievements/${a.id}/publish`, 'waldpfad');
  return a.id as string;
}
async function place(achievementId: string, at: { lat: number; lng: number }, extra: Record<string, unknown> = {}) {
  const res = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId, template: 'place', placeName: 'Marktplatz', geo: { ...at, radiusM: 60 }, ...extra });
  expect(res.status).toBe(201);
  return res.body.items[0] as { id: string; url: string | null; placeName: string };
}
const checkIn = (user: string, id: string, geo: Record<string, unknown>) => call('POST', `/api/v1/places/${id}/checkins`, user, { geo });

describe('Orte anlegen', () => {
  it('braucht Standort, Namen und einen passenden Radius und hat keinen Link', async () => {
    const id = await liveAchievement();
    const p = await place(id, MARKT);
    expect(p.url).toBeNull();
    expect(p.placeName).toBe('Marktplatz');

    const noGeo = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'place', placeName: 'X' });
    expect(noGeo.status).toBe(422);
    const noName = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'place', geo: { ...MARKT, radiusM: 60 } });
    expect(noName.status).toBe(422);
    const tiny = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'place', placeName: 'X', geo: { ...MARKT, radiusM: 15 } });
    expect(tiny.status).toBe(422);
    const nameOnStation = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'station', placeName: 'X' });
    expect(nameOnStation.status).toBe(422);
  });

  it('lässt sich verschieben und umbenennen, Stationen nicht', async () => {
    const id = await liveAchievement();
    const p = await place(id, MARKT);
    const moved = await call('PATCH', `${orgBase}/codes/${p.id}`, 'waldpfad', { placeName: 'Kaiserpfalz', geo: { ...PFALZ, radiusM: 120 } });
    expect(moved.status).toBe(200);
    expect(moved.body).toMatchObject({ placeName: 'Kaiserpfalz', geo: { ...PFALZ, radiusM: 120 } });
    const station = (await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'station' })).body.items[0];
    expect((await call('PATCH', `${orgBase}/codes/${station.id}`, 'waldpfad', { placeName: 'X' })).status).toBe(422);
  });
});

describe('Orte auf der Karte', () => {
  it('liefert aktive Orte öffentlich, filtert nach Kartenausschnitt und zeigt versteckte Abzeichen nur als Platzhalter', async () => {
    const visible = await liveAchievement({ name: 'Sichtbar' });
    const hidden = await liveAchievement({ name: 'Geheim', hidden: true, hint: 'Wo der Kaiser wohnte' });
    const a = await place(visible, MARKT);
    const b = await place(hidden, PFALZ, { placeName: 'Kaiserpfalz' });
    const off = await place(visible, MARKT, { placeName: 'Inaktiv' });
    await call('PATCH', `${orgBase}/codes/${off.id}`, 'waldpfad', { active: false });
    const far = await place(visible, HARZBURG, { placeName: 'Harzburg' });

    const all = await call('GET', '/api/v1/places');
    expect(all.status).toBe(200);
    const ids = all.body.items.map((p: { id: string }) => p.id);
    expect(ids).toEqual(expect.arrayContaining([a.id, b.id, far.id]));
    expect(ids).not.toContain(off.id);
    const secret = all.body.items.find((p: { id: string }) => p.id === b.id);
    expect(secret).toMatchObject({ name: 'Kaiserpfalz', done: null, achievement: { secret: true, hint: 'Wo der Kaiser wohnte' } });
    expect(secret.achievement.name).toBeUndefined();

    const goslar = await call('GET', '/api/v1/places?bbox=10.40,51.89,10.45,51.92');
    const goslarIds = goslar.body.items.map((p: { id: string }) => p.id);
    expect(goslarIds).toContain(a.id);
    expect(goslarIds).not.toContain(far.id);
    expect((await call('GET', '/api/v1/places?bbox=quatsch')).status).toBe(422);
  });
});

describe('Einchecken', () => {
  it('klappt im Radius, zählt einmal und meldet den Ort danach als erledigt', async () => {
    const id = await liveAchievement();
    const p = await place(id, MARKT);
    const ok = await checkIn('anna', p.id, { lat: 51.9061, lng: 10.4292, accuracyM: 12 });
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({ status: 'success', firstTime: true, tier: 1 });

    const again = await checkIn('anna', p.id, { lat: 51.9061, lng: 10.4292, accuracyM: 12 });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('limit_reached');

    const list = await call('GET', '/api/v1/places', 'anna');
    expect(list.body.items.find((x: { id: string }) => x.id === p.id)).toMatchObject({ done: true, achievement: { secret: false, name: 'Entdecker' } });
    const log = await db.selectFrom('redemptions').select(['status', 'source']).where('user_sub', '=', 'anna').orderBy('created_at').execute();
    expect(log).toEqual([{ status: 'success', source: 'place' }, { status: 'limit_reached', source: 'place' }]);
  });

  it('lehnt zu weit entfernt, zu ungenau und vorgetäuscht ab', async () => {
    const id = await liveAchievement();
    const p = await place(id, MARKT);
    const far = await checkIn('ben', p.id, { ...PFALZ, accuracyM: 10 });
    expect([far.status, far.body.error]).toEqual([403, 'out_of_range']);
    const vague = await checkIn('ben', p.id, { ...MARKT, accuracyM: 400 });
    expect([vague.status, vague.body.error]).toEqual([422, 'inaccurate']);
    const missing = await checkIn('ben', p.id, { ...MARKT });
    expect(missing.status).toBe(422);
    const mocked = await checkIn('ben', p.id, { ...MARKT, accuracyM: 5, mocked: true });
    expect([mocked.status, mocked.body.error]).toEqual([403, 'implausible']);
    // Ungenauigkeit zählt höchstens 50 m zum Radius: 60 m + 50 m
    const edge = await checkIn('ben', p.id, { lat: MARKT.lat + 0.0009, lng: MARKT.lng, accuracyM: 100 });
    expect(edge.status).toBe(200);
  });

  it('erkennt unmöglich schnelle Ortswechsel', async () => {
    const id = await liveAchievement();
    const markt = await place(id, MARKT);
    const harzburg = await place(id, HARZBURG, { placeName: 'Harzburg' });
    expect((await checkIn('carla', markt.id, { ...MARKT, accuracyM: 10 })).status).toBe(200);
    clock += 60_000; // eine Minute später 10 km weiter
    const fast = await checkIn('carla', harzburg.id, { ...HARZBURG, accuracyM: 10 });
    expect([fast.status, fast.body.error]).toEqual([403, 'implausible']);
    clock += 20 * 60_000; // mit dem Auto plausibel
    expect((await checkIn('carla', harzburg.id, { ...HARZBURG, accuracyM: 10 })).status).toBe(200);
  });

  it('nimmt das Token eines Ortes nicht als Code an und kennt fremde IDs nicht', async () => {
    const id = await liveAchievement();
    const p = await place(id, MARKT);
    const { token } = await db.selectFrom('codes').select('token').where('id', '=', p.id).executeTakeFirstOrThrow();
    const res = await call('POST', '/api/v1/redemptions', 'dora', { code: token, geo: { ...MARKT, accuracyM: 5 } });
    expect(res.status).toBe(404);
    const station = (await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: id, template: 'station' })).body.items[0];
    expect((await checkIn('dora', station.id, { ...MARKT, accuracyM: 5 })).status).toBe(404);
    expect((await checkIn('dora', '00000000-0000-4000-8000-0000000000aa', { ...MARKT, accuracyM: 5 })).status).toBe(404);
  });

  it('braucht eine Anmeldung', async () => {
    expect((await call('POST', '/api/v1/places/00000000-0000-4000-8000-0000000000aa/checkins', undefined, { geo: { ...MARKT, accuracyM: 5 } })).status).toBe(401);
  });
});
