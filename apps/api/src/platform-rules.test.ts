import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from './db/index.ts';
import { ADMIN_ORG, MUSEUM_ORG, WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
let app: Awaited<ReturnType<typeof testApp>>['app'];
let clock = Date.parse('2026-11-21T10:00:00Z');
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const DAY = 24 * 3600 * 1000;

beforeAll(async () => { db = await freshDatabase(); ({ call, app } = await testApp(db, { now: () => clock })); });
afterAll(async () => { await db.destroy(); });
beforeEach(async () => {
  clock = Date.parse('2026-11-21T10:00:00Z');
  // Jeder Test mit eigenen Plattform-Abzeichen
  await db.updateTable('achievements').set({ status: 'archived' }).where('auto_rule', 'is not', null).execute();
});

async function publish(orgId: string, user: string, body: Record<string, unknown>) {
  const res = await call('POST', `/api/v1/orgs/${orgId}/achievements`, user, { spec, ...body });
  expect(res.status).toBe(201);
  expect((await call('POST', `/api/v1/orgs/${orgId}/achievements/${res.body.id}/publish`, user)).status).toBe(200);
  return res.body.id as string;
}
const rule = (autoRule: string, extra: Record<string, unknown> = {}) => publish(ADMIN_ORG, 'admin', { kind: 'single', name: `Plattform ${autoRule}`, autoRule, ...extra });
async function stationFor(orgId: string, user: string, name: string) {
  const id = await publish(orgId, user, { kind: 'single', name });
  const res = await call('POST', `/api/v1/orgs/${orgId}/codes`, user, { achievementId: id, template: 'station' });
  return res.body.items[0].url as string;
}
const award = (user: string, achievementId: string) =>
  db.selectFrom('awards').select(['progress', 'tier']).where('user_sub', '=', user).where('achievement_id', '=', achievementId).executeTakeFirst();

describe('Plattform-Abzeichen anlegen', () => {
  it('nur die Haupt-Admin-Organisation darf Regeln setzen, nicht für Kombinationen, und ohne Codes', async () => {
    const forbidden = await call('POST', `/api/v1/orgs/${WALD_ORG}/achievements`, 'waldpfad', { kind: 'single', name: 'X', spec, autoRule: 'awards_count' });
    expect(forbidden.status).toBe(403);
    const id = await rule('awards_count');
    const view = await call('GET', `/api/v1/orgs/${ADMIN_ORG}/achievements/${id}`, 'admin');
    expect(view.body.autoRule).toBe('awards_count');
    const code = await call('POST', `/api/v1/orgs/${ADMIN_ORG}/codes`, 'admin', { achievementId: id, template: 'station' });
    expect(code.status).toBe(422);
    const locked = await call('PATCH', `/api/v1/orgs/${ADMIN_ORG}/achievements/${id}`, 'admin', { autoRule: null });
    expect(locked.status).toBe(409);
  });
});

describe('Automatische Vergabe', () => {
  it('erstes gesammeltes Abzeichen löst „Sammle dein erstes Abzeichen“ aus und kommt in der Antwort als Bonus', async () => {
    const first = await rule('awards_count');
    const url = await stationFor(WALD_ORG, 'waldpfad', 'Wald 1');
    const res = await call('POST', '/api/v1/redemptions', 'paul', { code: url });
    expect(res.status).toBe(200);
    expect(res.body.bonus).toHaveLength(1);
    expect(res.body.bonus[0]).toMatchObject({ firstTime: true, tier: 1, achievement: { id: first, name: 'Plattform awards_count' } });
    expect(await award('paul', first)).toEqual({ progress: 1, tier: 1 });
  });

  it('Stufen nach Anzahl Abzeichen und Organisationen; Plattform-Abzeichen zählen nicht mit', async () => {
    const collector = await rule('awards_count', { kind: 'tiered', tiers: [{ threshold: 2 }, { threshold: 3 }] });
    const orgs = await rule('orgs_count', { kind: 'tiered', tiers: [{ threshold: 2 }, { threshold: 5 }] });
    const w1 = await stationFor(WALD_ORG, 'waldpfad', 'Wald A');
    const w2 = await stationFor(WALD_ORG, 'waldpfad', 'Wald B');
    const m1 = await stationFor(MUSEUM_ORG, 'museum', 'Museum A');

    expect((await call('POST', '/api/v1/redemptions', 'rita', { code: w1 })).body.bonus).toEqual([]);
    const second = await call('POST', '/api/v1/redemptions', 'rita', { code: w2 });
    expect(second.body.bonus.map((b: { achievement: { id: string } }) => b.achievement.id)).toEqual([collector]);
    expect(await award('rita', orgs)).toEqual({ progress: 1, tier: 0 });

    const third = await call('POST', '/api/v1/redemptions', 'rita', { code: m1 });
    const ids = third.body.bonus.map((b: { achievement: { id: string } }) => b.achievement.id).sort();
    expect(ids).toEqual([collector, orgs].sort());
    // 3 normale Abzeichen – das Plattform-Abzeichen selbst zählt nicht
    expect(await award('rita', collector)).toEqual({ progress: 3, tier: 2 });
    expect(await award('rita', orgs)).toEqual({ progress: 2, tier: 1 });
  });

  it('App genutzt: zählt Tage einmal pro Tag und vergibt Stufen', async () => {
    const days = await rule('active_days', { kind: 'tiered', tiers: [{ threshold: 1 }, { threshold: 3 }] });
    const first = await call('POST', '/api/v1/users/me/activity', 'otto');
    expect(first.status).toBe(200);
    expect(first.body.bonus).toEqual([expect.objectContaining({ firstTime: true, tier: 1 })]);
    expect((await call('POST', '/api/v1/users/me/activity', 'otto')).body.bonus).toEqual([]);
    clock += DAY;
    await call('POST', '/api/v1/users/me/activity', 'otto');
    clock += DAY;
    const third = await call('POST', '/api/v1/users/me/activity', 'otto');
    expect(third.body.bonus).toEqual([expect.objectContaining({ tierUp: true, tier: 2 })]);
    expect(await award('otto', days)).toEqual({ progress: 3, tier: 2 });
    const rows = await db.selectFrom('user_activity_days').select('day').where('user_sub', '=', 'otto').execute();
    expect(rows).toHaveLength(3);
  });

  it('holt beim ersten Öffnen am Tag nach, was schon vorher gesammelt wurde', async () => {
    const url = await stationFor(WALD_ORG, 'waldpfad', 'Vorher');
    await call('POST', '/api/v1/redemptions', 'vera', { code: url });
    const first = await rule('awards_count');
    expect(await award('vera', first)).toBeUndefined();
    const res = await call('POST', '/api/v1/users/me/activity', 'vera');
    expect(res.body.bonus.map((b: { achievement: { id: string } }) => b.achievement.id)).toContain(first);
  });

  it('besuchte Orte zählen beim Check-in', async () => {
    const explorer = await rule('places_count');
    const id = await publish(WALD_ORG, 'waldpfad', { kind: 'single', name: 'Ort-Abzeichen' });
    const place = (await call('POST', `/api/v1/orgs/${WALD_ORG}/codes`, 'waldpfad', { achievementId: id, template: 'place', placeName: 'Markt', geo: { lat: 51.9059, lng: 10.429, radiusM: 60 } })).body.items[0];
    const res = await call('POST', `/api/v1/places/${place.id}/checkins`, 'pia', { geo: { lat: 51.9059, lng: 10.429, accuracyM: 10 } });
    expect(res.status).toBe(200);
    expect(res.body.bonus.map((b: { achievement: { id: string } }) => b.achievement.id)).toContain(explorer);
  });

  it('API-Schlüssel können Plattform-Abzeichen nicht direkt vergeben', async () => {
    const id = await rule('awards_count');
    const key = await call('POST', `/api/v1/orgs/${ADMIN_ORG}/api-keys`, 'admin', { name: 'Test', scopes: ['awards:create'] });
    expect(key.status).toBe(201);
    const res = await app.request('/api/v1/integrations/awards', { method: 'POST', headers: { 'X-Api-Key': key.body.secret, 'Content-Type': 'application/json' }, body: JSON.stringify({ achievementId: id, userSub: 'zoe' }) });
    expect(res.status).toBe(409);
  });
});
