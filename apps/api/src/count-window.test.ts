import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from './db/index.ts';
import { ADMIN_ORG, MUSEUM_ORG, WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
const DAY = 24 * 3600 * 1000;
const NOV_20 = Date.parse('2026-11-20T10:00:00Z');
const DEC_2 = Date.parse('2026-12-02T10:00:00Z');
let clock = NOV_20;
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const ADVENT = { availableFrom: '2026-12-01T00:00:00+01:00', availableUntil: '2026-12-24T23:59:00+01:00' };

beforeAll(async () => { db = await freshDatabase(); ({ call } = await testApp(db, { now: () => clock })); });
afterAll(async () => { await db.destroy(); });
beforeEach(async () => {
  clock = NOV_20;
  await db.updateTable('achievements').set({ status: 'archived' }).where('auto_rule', 'is not', null).execute();
});

async function publish(orgId: string, user: string, body: Record<string, unknown>) {
  const res = await call('POST', `/api/v1/orgs/${orgId}/achievements`, user, { spec, ...body });
  expect(res.status).toBe(201);
  expect((await call('POST', `/api/v1/orgs/${orgId}/achievements/${res.body.id}/publish`, user)).status).toBe(200);
  return res.body.id as string;
}
const platform = (body: Record<string, unknown>) => publish(ADMIN_ORG, 'admin', { kind: 'single', name: 'Plattform', ...body });
let n = 0;
async function stationUrl(org = WALD_ORG, user = 'waldpfad') {
  const id = await publish(org, user, { kind: 'single', name: `Station ${++n}` });
  return (await call('POST', `/api/v1/orgs/${org}/codes`, user, { achievementId: id, template: 'station' })).body.items[0].url as string;
}
const redeem = (user: string, url: string) => call('POST', '/api/v1/redemptions', user, { code: url });
const bonusIds = (res: { body: { bonus: { achievement: { id: string } }[] } }) => res.body.bonus.map((b) => b.achievement.id);
const award = (user: string, id: string) =>
  db.selectFrom('awards').select(['progress', 'tier']).where('user_sub', '=', user).where('achievement_id', '=', id).executeTakeFirst();

describe('„Was zählt?“ – Nur im Zeitraum', () => {
  it('Abzeichen von vorher zählen nicht, nur die im Zeitraum verdienten', async () => {
    const before = [await stationUrl(), await stationUrl(), await stationUrl()];
    const during = [await stationUrl(), await stationUrl()];
    for (const u of before) await redeem('anna', u);          // 20.11.: drei Abzeichen
    const adventsjaeger = await platform({ name: 'Adventsjäger', kind: 'tiered', tiers: [{ threshold: 2 }, { threshold: 5 }], autoRule: 'awards_count', countWindow: true, ...ADVENT });

    clock = DEC_2;
    expect(bonusIds(await call('POST', '/api/v1/users/me/activity', 'anna'))).not.toContain(adventsjaeger);
    expect(bonusIds(await redeem('anna', during[0]!))).not.toContain(adventsjaeger);
    const second = await redeem('anna', during[1]!);
    expect(bonusIds(second)).toContain(adventsjaeger);
    expect(await award('anna', adventsjaeger)).toEqual({ progress: 2, tier: 1 });
  });

  it('„Alles bisher“ mit Zeitraum: Vorheriges zählt, vergeben wird erst im Zeitraum', async () => {
    const urls = [await stationUrl(), await stationUrl()];
    for (const u of urls) await redeem('ben', u);
    const jahr = await platform({ name: 'Jahressammler', autoRule: 'awards_count', countWindow: false, ...ADVENT });
    // Vor dem Zeitraum: nicht verfügbar
    expect(bonusIds(await call('POST', '/api/v1/users/me/activity', 'ben'))).not.toContain(jahr);
    clock = DEC_2;
    expect(bonusIds(await call('POST', '/api/v1/users/me/activity', 'ben'))).toContain(jahr);
  });

  it('Organisationen, Orte und Tage im Zeitraum', async () => {
    const orgs = await platform({ name: 'Advents-Vielfalt', autoRule: 'orgs_count', kind: 'tiered', tiers: [{ threshold: 1 }, { threshold: 2 }], countWindow: true, ...ADVENT });
    const days = await platform({ name: 'Advents-Treue', autoRule: 'active_days', kind: 'tiered', tiers: [{ threshold: 2 }, { threshold: 3 }], countWindow: true, ...ADVENT });
    const places = await platform({ name: 'Advents-Orte', autoRule: 'places_count', countWindow: true, ...ADVENT });
    // Vorher: Museum-Abzeichen, Tage, ein Ort
    await redeem('carla', await stationUrl(MUSEUM_ORG, 'museum'));
    await call('POST', '/api/v1/users/me/activity', 'carla');
    clock += DAY;
    await call('POST', '/api/v1/users/me/activity', 'carla');
    const placeBadge = await publish(WALD_ORG, 'waldpfad', { kind: 'single', name: 'Ort' });
    const place = (await call('POST', `/api/v1/orgs/${WALD_ORG}/codes`, 'waldpfad', { achievementId: placeBadge, template: 'place', placeName: 'Markt', geo: { lat: 51.9059, lng: 10.429, radiusM: 60 }, perUserLimit: null, perUserCooldownSeconds: 3600 })).body.items[0];
    await call('POST', `/api/v1/places/${place.id}/checkins`, 'carla', { geo: { lat: 51.9059, lng: 10.429, accuracyM: 10 } });

    clock = DEC_2;
    await call('POST', '/api/v1/users/me/activity', 'carla');
    // Nur ein Tag im Zeitraum, keine Organisation, kein Ort
    expect(await award('carla', days)).toEqual({ progress: 1, tier: 0 });
    expect(await award('carla', orgs)).toBeUndefined();
    expect(await award('carla', places)).toBeUndefined();

    clock += DAY;
    await call('POST', '/api/v1/users/me/activity', 'carla');
    expect(await award('carla', days)).toEqual({ progress: 2, tier: 1 });
    const checkIn = await call('POST', `/api/v1/places/${place.id}/checkins`, 'carla', { geo: { lat: 51.9059, lng: 10.429, accuracyM: 10 } });
    expect(bonusIds(checkIn)).toContain(places);
    const r = await redeem('carla', await stationUrl());
    expect(bonusIds(r)).toContain(orgs);
  });
});

describe('„Was zählt?“ – Regeln', () => {
  it('nur bei Plattform-Abzeichen mit Zeitraum, nach dem Veröffentlichen fest', async () => {
    const noRule = await call('POST', `/api/v1/orgs/${ADMIN_ORG}/achievements`, 'admin', { kind: 'single', name: 'X', spec, countWindow: true, ...ADVENT });
    expect(noRule.status).toBe(422);
    const noWindow = await call('POST', `/api/v1/orgs/${ADMIN_ORG}/achievements`, 'admin', { kind: 'single', name: 'X', spec, autoRule: 'awards_count', countWindow: true });
    expect(noWindow.status).toBe(422);
    const id = await platform({ autoRule: 'awards_count', countWindow: true, ...ADVENT });
    const view = await call('GET', `/api/v1/orgs/${ADMIN_ORG}/achievements/${id}`, 'admin');
    expect(view.body.countWindow).toBe(true);
    expect((await call('PATCH', `/api/v1/orgs/${ADMIN_ORG}/achievements/${id}`, 'admin', { countWindow: false })).status).toBe(409);
    // Zeitraum entfernen geht nicht, solange nur im Zeitraum gezählt wird
    expect((await call('PATCH', `/api/v1/orgs/${ADMIN_ORG}/achievements/${id}`, 'admin', { availableFrom: null, availableUntil: null })).status).toBe(422);
  });
});
