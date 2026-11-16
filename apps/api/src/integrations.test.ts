import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from './db/index.ts';
import { MUSEUM_ORG, WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let app: Awaited<ReturnType<typeof testApp>>['app'];
let call: Awaited<ReturnType<typeof testApp>>['call'];
let clock = Date.parse('2026-11-15T10:00:00Z');
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const keysBase = `/api/v1/orgs/${WALD_ORG}/api-keys`;

beforeAll(async () => { db = await freshDatabase(); ({ app, call } = await testApp(db, { now: () => clock })); });
afterAll(async () => { await db.destroy(); });

async function liveAchievement(org = WALD_ORG, user = 'waldpfad') {
  const a = (await call('POST', `/api/v1/orgs/${org}/achievements`, user, { kind: 'tiered', name: 'Einkaufsheld', spec, tiers: [{ threshold: 3 }, { threshold: 10 }] })).body;
  await call('POST', `/api/v1/orgs/${org}/achievements/${a.id}/publish`, user);
  return a.id as string;
}
const newKey = async (scopes: string[], extra: Record<string, unknown> = {}) =>
  (await call('POST', keysBase, 'waldpfad', { name: 'Kasse Hofladen', scopes, ...extra })).body as { key: { id: string; hint: string }; secret: string };
const withKey = (method: string, path: string, key: string | undefined, body?: unknown) =>
  Promise.resolve(app.request(path, { method, headers: { ...(key ? { 'X-Api-Key': key } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }))
    .then(async (r: Response) => ({ status: r.status, body: await r.json() as any }));

describe('API-Schlüssel verwalten', () => {
  it('zeigt den Klartext nur einmal und speichert nur einen Hash', async () => {
    const { key, secret } = await newKey(['awards:create']);
    expect(secret).toMatch(/^bbk_[A-Za-z0-9]{8}_[A-Za-z0-9]{32}$/);
    expect(key.hint).toBe(`${secret.slice(0, 13)}…`);
    const list = await call('GET', keysBase, 'waldpfad');
    expect(JSON.stringify(list.body)).not.toContain(secret.slice(13));
    const row = await db.selectFrom('api_keys').selectAll().where('id', '=', key.id).executeTakeFirstOrThrow();
    expect(row.secret_hash.length).toBe(32);
    expect(JSON.stringify(row)).not.toContain(secret.slice(13));
  });

  it('nur Mitglieder der Organisation; Rechte und Laufzeit werden geprüft', async () => {
    expect((await call('POST', keysBase, 'museum', { name: 'x', scopes: ['awards:create'] })).status).toBe(403);
    expect((await call('GET', keysBase)).status).toBe(401);
    expect((await call('POST', keysBase, 'waldpfad', { name: 'x', scopes: ['admin:all'] })).status).toBe(422);
    expect((await call('POST', keysBase, 'waldpfad', { name: 'x', scopes: [] })).status).toBe(422);
    expect((await call('POST', keysBase, 'waldpfad', { name: 'x', scopes: ['codes:mint'], expiresInDays: 400 })).status).toBe(422);
  });
});

describe('Direktvergabe', () => {
  it('vergibt mit gültigem Schlüssel und protokolliert die Herkunft', async () => {
    const id = await liveAchievement();
    const { key, secret } = await newKey(['awards:create']);
    const res = await withKey('POST', '/api/v1/integrations/awards', secret, { achievementId: id, userSub: 'kundin-1', value: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'success', value: 3, progress: 3, tier: 1, tierUp: true, firstTime: true, replayed: false });
    const log = await db.selectFrom('redemptions').selectAll().where('user_sub', '=', 'kundin-1').executeTakeFirstOrThrow();
    expect(log).toMatchObject({ source: 'api', api_key_id: key.id, code_id: null, value: 3, status: 'success' });
    const used = await db.selectFrom('api_keys').select('last_used_at').where('id', '=', key.id).executeTakeFirstOrThrow();
    expect(used.last_used_at).not.toBeNull();
  });

  it('lehnt fehlende, falsche, fremde und rechtlose Schlüssel ab', async () => {
    const id = await liveAchievement();
    const { secret } = await newKey(['awards:create']);
    const body = { achievementId: id, userSub: 'kunde-x' };
    expect((await withKey('POST', '/api/v1/integrations/awards', undefined, body)).status).toBe(401);
    expect((await withKey('POST', '/api/v1/integrations/awards', 'bbk_AAAAAAAA_' + 'A'.repeat(32), body)).status).toBe(401);
    expect((await withKey('POST', '/api/v1/integrations/awards', secret.slice(0, -1) + (secret.endsWith('A') ? 'B' : 'A'), body)).status).toBe(401);
    const mintOnly = (await newKey(['codes:mint'])).secret;
    expect((await withKey('POST', '/api/v1/integrations/awards', mintOnly, body)).status).toBe(403);
    // Abzeichen einer anderen Organisation
    const foreign = await liveAchievement(MUSEUM_ORG, 'museum');
    expect((await withKey('POST', '/api/v1/integrations/awards', secret, { achievementId: foreign, userSub: 'kunde-x' })).status).toBe(404);
  });

  it('widerrufene und abgelaufene Schlüssel funktionieren nicht mehr', async () => {
    const id = await liveAchievement();
    const { key, secret } = await newKey(['awards:create'], { expiresInDays: 1 });
    const body = { achievementId: id, userSub: 'kunde-y' };
    expect((await withKey('POST', '/api/v1/integrations/awards', secret, body)).status).toBe(200);
    clock += 2 * 86_400_000;
    expect((await withKey('POST', '/api/v1/integrations/awards', secret, body)).status).toBe(401);
    clock -= 2 * 86_400_000;
    expect((await call('DELETE', `${keysBase}/${key.id}`, 'waldpfad')).body.active).toBe(false);
    expect((await withKey('POST', '/api/v1/integrations/awards', secret, body)).status).toBe(401);
    expect((await call('DELETE', `${keysBase}/${key.id}`, 'waldpfad')).status).toBe(409);
  });

  it('ist mit reference idempotent, auch bei gleichzeitigen Wiederholungen', async () => {
    const id = await liveAchievement();
    const { secret } = await newKey(['awards:create']);
    const body = { achievementId: id, userSub: 'kundin-2', value: 2, reference: 'BON-4711' };
    const results = await Promise.all(Array.from({ length: 8 }, () => withKey('POST', '/api/v1/integrations/awards', secret, body)));
    expect(results.every((r: { status: number }) => r.status === 200)).toBe(true);
    expect(results.filter((r: { body: any }) => r.body.replayed === false)).toHaveLength(1);
    const award = await db.selectFrom('awards').select('progress').where('achievement_id', '=', id).where('user_sub', '=', 'kundin-2').executeTakeFirstOrThrow();
    expect(award.progress).toBe(2);
    // Gleiche Referenz für eine andere Vergabe ist ein Konflikt
    expect((await withKey('POST', '/api/v1/integrations/awards', secret, { ...body, value: 5 })).status).toBe(409);
    // Ohne Referenz zählt jede Anfrage
    await withKey('POST', '/api/v1/integrations/awards', secret, { achievementId: id, userSub: 'kundin-2' });
    expect((await db.selectFrom('awards').select('progress').where('user_sub', '=', 'kundin-2').executeTakeFirstOrThrow()).progress).toBe(3);
  });

  it('archivierte Abzeichen sind nicht vergebbar', async () => {
    const id = await liveAchievement();
    await call('POST', `/api/v1/orgs/${WALD_ORG}/achievements/${id}/archive`, 'waldpfad');
    const { secret } = await newKey(['awards:create']);
    expect((await withKey('POST', '/api/v1/integrations/awards', secret, { achievementId: id, userSub: 'z' })).status).toBe(410);
  });
});

describe('Kassensystem: Einmal-Code per Schlüssel', () => {
  it('erzeugt einlösbare Einmal-Codes nur für eigene Kassen-Codes', async () => {
    const id = await liveAchievement();
    const [checkout] = (await call('POST', `/api/v1/orgs/${WALD_ORG}/codes`, 'waldpfad', { achievementId: id, template: 'checkout' })).body.items;
    const [station] = (await call('POST', `/api/v1/orgs/${WALD_ORG}/codes`, 'waldpfad', { achievementId: id, template: 'station' })).body.items;
    const { secret } = await newKey(['codes:mint']);
    const minted = await withKey('POST', `/api/v1/integrations/codes/${checkout.id}/mint`, secret, { value: 4 });
    expect(minted.status).toBe(201);
    const redeemed = await call('POST', '/api/v1/redemptions', 'kunde-z', { code: minted.body.url });
    expect(redeemed.body).toMatchObject({ value: 4, progress: 4, tier: 1 });
    expect((await withKey('POST', `/api/v1/integrations/codes/${station.id}/mint`, secret, { value: 1 })).status).toBe(422);
    const foreignId = await liveAchievement(MUSEUM_ORG, 'museum');
    const [foreignCheckout] = (await call('POST', `/api/v1/orgs/${MUSEUM_ORG}/codes`, 'museum', { achievementId: foreignId, template: 'checkout' })).body.items;
    expect((await withKey('POST', `/api/v1/integrations/codes/${foreignCheckout.id}/mint`, secret, { value: 1 })).status).toBe(404);
    const log = await db.selectFrom('audit_log').select(['actor_sub', 'action']).where('entity_id', '=', checkout.id).where('action', '=', 'code.mint').executeTakeFirstOrThrow();
    expect(log.actor_sub).toMatch(/^apikey:/);
  });
});
