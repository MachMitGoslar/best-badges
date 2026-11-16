import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from './db/index.ts';
import { MUSEUM_ORG, WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
let achievementId: string;
const base = `/api/v1/orgs/${WALD_ORG}/codes`;
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };

beforeAll(async () => {
  db = await freshDatabase();
  ({ call } = await testApp(db));
  achievementId = (await call('POST', `/api/v1/orgs/${WALD_ORG}/achievements`, 'waldpfad', {
    kind: 'tiered', name: 'Walderlebnispfad', spec, tiers: [{ threshold: 3 }, { threshold: 10 }],
  })).body.id;
});
afterAll(async () => { await db.destroy(); });

describe('Codes', () => {
  it('Station: statischer Link, 1× pro Person, Wert 1, kein Geheimnis', async () => {
    const res = await call('POST', base, 'waldpfad', { achievementId, template: 'station', label: 'Station 1: Ameisenhaufen', geo: { lat: 51.9, lng: 10.43, radiusM: 80 } });
    expect(res.status).toBe(201);
    const [code] = res.body.items;
    expect(code).toMatchObject({ template: 'station', perUserLimit: 1, value: 1, maxTotal: null, uses: 0, active: true, geo: { radiusM: 80 } });
    expect(code.url).toMatch(/^https:\/\/badges\.test\/c\/[A-Za-z0-9]{22}$/);
    const row = await db.selectFrom('codes').select(['secret']).where('id', '=', code.id).executeTakeFirstOrThrow();
    expect(row.secret).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain('secret');
  });

  it('Station und Veranstaltung erzwingen Wert 1', async () => {
    const res = await call('POST', base, 'waldpfad', { achievementId, template: 'station', value: 3 });
    expect(res.status).toBe(422);
    expect(res.body.message).toContain('value');
    expect((await call('POST', base, 'waldpfad', { achievementId, template: 'event', value: 2 })).status).toBe(422);
  });

  it('Veranstaltung und Kasse bekommen ein Geheimnis, aber keinen statischen Link', async () => {
    for (const template of ['event', 'checkout']) {
      const [code] = (await call('POST', base, 'waldpfad', { achievementId, template })).body.items;
      expect(code.url).toBeNull();
      const row = await db.selectFrom('codes').select(['secret']).where('id', '=', code.id).executeTakeFirstOrThrow();
      expect(row.secret?.length).toBe(32);
    }
  });

  it('Gutschein-Stapel: viele einmalige Codes mit gemeinsamer Stapel-ID', async () => {
    const res = await call('POST', base, 'waldpfad', { achievementId, template: 'voucher', count: 25, value: 2, label: 'Kassenbon' });
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(25);
    const batch = new Set(res.body.items.map((c: { batchId: string }) => c.batchId));
    expect(batch.size).toBe(1);
    expect(res.body.items.every((c: { perUserLimit: number; maxTotal: number; value: number }) => c.perUserLimit === 1 && c.maxTotal === 1 && c.value === 2)).toBe(true);
    expect(new Set(res.body.items.map((c: { url: string }) => c.url)).size).toBe(25);
    expect((await call('POST', base, 'waldpfad', { achievementId, template: 'station', count: 3 })).status).toBe(422);
    expect((await call('POST', base, 'waldpfad', { achievementId, template: 'voucher', maxTotal: 5 })).status).toBe(422);
  });

  it('prüft Zeitfenster und Zugehörigkeit des Abzeichens', async () => {
    expect((await call('POST', base, 'waldpfad', { achievementId, template: 'event', validFrom: '2026-12-01T10:00:00Z', validUntil: '2026-12-01T09:00:00Z' })).status).toBe(422);
    expect((await call('POST', `/api/v1/orgs/${MUSEUM_ORG}/codes`, 'museum', { achievementId, template: 'station' })).status).toBe(404);
    expect((await call('POST', base, 'museum', { achievementId, template: 'station' })).status).toBe(403);
  });

  it('ändert Bezeichnung, Aktiv-Status und Gesamtlimit', async () => {
    const [code] = (await call('POST', base, 'waldpfad', { achievementId, template: 'station' })).body.items;
    const res = await call('PATCH', `${base}/${code.id}`, 'waldpfad', { label: 'Station 2', active: false, maxTotal: 100 });
    expect(res.body).toMatchObject({ label: 'Station 2', active: false, maxTotal: 100 });
    await db.updateTable('codes').set({ uses: 50 }).where('id', '=', code.id).execute();
    expect((await call('PATCH', `${base}/${code.id}`, 'waldpfad', { maxTotal: 10 })).status).toBe(422);
  });

  it('Rotation macht den alten Link ungültig', async () => {
    const [code] = (await call('POST', base, 'waldpfad', { achievementId, template: 'station' })).body.items;
    const rotated = await call('POST', `${base}/${code.id}/rotate`, 'waldpfad');
    expect(rotated.status).toBe(200);
    expect(rotated.body.url).not.toBe(code.url);
    const oldToken = code.url.split('/').pop();
    expect(await db.selectFrom('codes').select('id').where('token', '=', oldToken).executeTakeFirst()).toBeUndefined();
  });

  it('keine Codes für archivierte Abzeichen', async () => {
    const a = (await call('POST', `/api/v1/orgs/${WALD_ORG}/achievements`, 'waldpfad', { kind: 'single', name: 'Alt', spec })).body;
    await call('POST', `/api/v1/orgs/${WALD_ORG}/achievements/${a.id}/archive`, 'waldpfad');
    expect((await call('POST', base, 'waldpfad', { achievementId: a.id, template: 'station' })).status).toBe(409);
  });

  it('listet Codes gefiltert nach Abzeichen', async () => {
    const res = await call('GET', `${base}?achievementId=${achievementId}`, 'waldpfad');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(25);
    expect(res.body.items.every((c: { achievementId: string }) => c.achievementId === achievementId)).toBe(true);
  });
});
