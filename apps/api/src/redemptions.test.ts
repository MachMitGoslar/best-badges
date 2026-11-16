import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from './db/index.ts';
import { WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
let clock = Date.parse('2026-11-14T10:00:00Z');
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const orgBase = `/api/v1/orgs/${WALD_ORG}`;

beforeAll(async () => { db = await freshDatabase(); ({ call } = await testApp(db, { now: () => clock })); });
afterAll(async () => { await db.destroy(); });
beforeEach(() => { clock = Date.parse('2026-11-14T10:00:00Z'); });

/** Legt ein veröffentlichtes Abzeichen an */
async function liveAchievement(tiers: number[] | null = [2, 4]) {
  const body = tiers ? { kind: 'tiered', name: 'Walderlebnispfad', spec, tiers: tiers.map((threshold) => ({ threshold, awardedText: `Stufe ab ${threshold}` })) } : { kind: 'single', name: 'Einmal', spec };
  const a = (await call('POST', `${orgBase}/achievements`, 'waldpfad', body)).body;
  await call('POST', `${orgBase}/achievements/${a.id}/publish`, 'waldpfad');
  return a.id as string;
}
async function code(achievementId: string, extra: Record<string, unknown> = {}) {
  const res = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId, template: 'station', ...extra });
  expect(res.status).toBe(201);
  return res.body.items as { id: string; url: string | null; template: string }[];
}
const redeem = (user: string, c: string, geo?: unknown) => call('POST', '/api/v1/redemptions', user, { code: c, ...(geo ? { geo } : {}) });

describe('Einlösen: Stationen und Stufen', () => {
  it('zählt Fortschritt hoch, meldet den Stufenaufstieg und sperrt die zweite Einlösung derselben Station', async () => {
    const id = await liveAchievement([2, 4]);
    const [a] = await code(id, { label: 'Station A' });
    const [b] = await code(id, { label: 'Station B' });

    const first = await redeem('anna', a!.url!);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ status: 'success', progress: 1, previousTier: 0, tier: 0, tierCount: 2, tierUp: false, firstTime: false, nextThreshold: 2 });

    const second = await redeem('anna', b!.url!);
    expect(second.body).toMatchObject({ progress: 2, previousTier: 0, tier: 1, tierUp: true, firstTime: true, nextThreshold: 4, awardedText: 'Stufe ab 2' });

    const again = await redeem('anna', a!.url!);
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('limit_reached');

    const log = await db.selectFrom('redemptions').select(['status']).where('user_sub', '=', 'anna').orderBy('created_at').execute();
    expect(log.map((l) => l.status)).toEqual(['success', 'success', 'limit_reached']);
  });

  it('akzeptiert auch das nackte Token und lehnt Unbekanntes mit 404 ab', async () => {
    const id = await liveAchievement(null);
    const [c] = await code(id);
    const token = c!.url!.split('/').pop()!;
    expect((await redeem('ben', token)).status).toBe(200);
    expect((await redeem('ben', 'https://badges.test/c/AAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
    expect((await redeem('ben', 'hallo welt')).status).toBe(404);
    expect((await redeem('ben', 'javascript:alert(1)')).status).toBe(404);
  });

  it('lehnt ohne Anmeldung ab', async () => {
    expect((await call('POST', '/api/v1/redemptions', undefined, { code: 'x' })).status).toBe(401);
  });
});

describe('Einlösen: Gleichzeitigkeit', () => {
  it('20 gleichzeitige Versuche derselben Person ergeben genau eine Einlösung', async () => {
    const id = await liveAchievement([2, 4]);
    const [c] = await code(id);
    const results = await Promise.all(Array.from({ length: 20 }, () => redeem('carla', c!.url!)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 409)).toHaveLength(19);
    const row = await db.selectFrom('codes').select('uses').where('id', '=', c!.id).executeTakeFirstOrThrow();
    expect(row.uses).toBe(1);
    const award = await db.selectFrom('awards').select('progress').where('achievement_id', '=', id).where('user_sub', '=', 'carla').executeTakeFirstOrThrow();
    expect(award.progress).toBe(1);
  });

  it('Gesamtlimit 5 hält bei 12 gleichzeitigen Personen', async () => {
    const id = await liveAchievement(null);
    const [c] = await code(id, { maxTotal: 5 });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => redeem(`gast${i}`, c!.url!)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);
    expect(results.filter((r) => r.status === 410 && r.body.error === 'exhausted')).toHaveLength(7);
    expect((await db.selectFrom('codes').select('uses').where('id', '=', c!.id).executeTakeFirstOrThrow()).uses).toBe(5);
  });

  it('zwei Stationen gleichzeitig zählen beide zum selben Fortschritt', async () => {
    const id = await liveAchievement([2, 4]);
    const [a] = await code(id);
    const [b] = await code(id);
    const [r1, r2] = await Promise.all([redeem('dora', a!.url!), redeem('dora', b!.url!)]);
    expect([r1.status, r2.status]).toEqual([200, 200]);
    const award = await db.selectFrom('awards').select(['progress', 'tier']).where('achievement_id', '=', id).where('user_sub', '=', 'dora').executeTakeFirstOrThrow();
    expect(award).toEqual({ progress: 2, tier: 1 });
  });
});

describe('Einlösen: Gutscheine', () => {
  it('jeder Gutschein ist genau einmal einlösbar und zählt seinen Wert', async () => {
    const id = await liveAchievement([2, 4]);
    const [v] = await code(id, { template: 'voucher', value: 3 });
    const [r1, r2] = await Promise.all([redeem('emil', v!.url!), redeem('fritz', v!.url!)]);
    const ok = [r1, r2].find((r) => r.status === 200)!;
    expect([r1, r2].filter((r) => r.status === 200)).toHaveLength(1);
    expect(ok.body).toMatchObject({ value: 3, progress: 3, tier: 1 });
  });
});

describe('Einlösen: Veranstaltung (rotierender Code)', () => {
  it('gilt im aktuellen und vorigen Fenster, danach nicht mehr; Fälschungen scheitern', async () => {
    const id = await liveAchievement(null);
    const [e] = await code(id, { template: 'event' });
    const current = await call('GET', `${orgBase}/codes/${e!.id}/current`, 'waldpfad');
    expect(current.status).toBe(200);
    expect(current.body.expiresInSeconds).toBeGreaterThan(0);
    expect(current.body.expiresInSeconds).toBeLessThanOrEqual(15);
    const url: string = current.body.url;

    const forged = url.replace(/s=[^&]+/, 's=AAAAAAAAAAAAAAAAAAAAAA');
    expect((await redeem('gina', forged)).status).toBe(410);
    expect((await redeem('gina', url.split('?')[0]!)).status).toBe(410);

    clock += 15_000; // ein Fenster später: noch gültig
    expect((await redeem('gina', url)).status).toBe(200);
    clock += 30_000; // zwei weitere Fenster: abgelaufen
    const late = await redeem('hans', url);
    expect(late.status).toBe(410);
    expect(late.body.error).toBe('expired');
    expect((await call('GET', `${orgBase}/codes/${e!.id}/current`, 'museum')).status).toBe(403);
  });
});

describe('Einlösen: Kasse', () => {
  it('erzeugt Einmal-Codes mit Wert, die genau einmal und nur 10 Minuten gelten', async () => {
    const id = await liveAchievement([2, 4]);
    const [k] = await code(id, { template: 'checkout' });
    const minted = await call('POST', `${orgBase}/codes/${k!.id}/mint`, 'waldpfad', { value: 3 });
    expect(minted.status).toBe(201);
    const url: string = minted.body.url;

    const tampered = url.replace('v=3', 'v=30');
    expect((await redeem('ida', tampered)).status).toBe(404);

    const ok = await redeem('ida', url);
    expect(ok.body).toMatchObject({ value: 3, progress: 3, tier: 1 });
    const reuse = await redeem('jan', url);
    expect(reuse.status).toBe(410);
    expect(reuse.body.error).toBe('exhausted');

    const second = (await call('POST', `${orgBase}/codes/${k!.id}/mint`, 'waldpfad', { value: 1 })).body.url;
    clock += 11 * 60_000;
    expect((await redeem('ida', second)).body.error).toBe('expired');
    expect((await call('POST', `${orgBase}/codes/${k!.id}/mint`, 'waldpfad', { value: 500 })).status).toBe(422);
  });
});

describe('Einlösen: Wartezeit und Standort', () => {
  it('Wartezeit pro Person mit Retry-After', async () => {
    const id = await liveAchievement([2, 4]);
    const [c] = await code(id, { perUserLimit: null, perUserCooldownSeconds: 3600 });
    expect((await redeem('kai', c!.url!)).status).toBe(200);
    const wait = await redeem('kai', c!.url!);
    expect(wait.status).toBe(409);
    expect(wait.body.error).toBe('cooldown');
    expect(wait.body.retryAfterSeconds).toBeGreaterThan(3500);
    expect(wait.headers.get('retry-after')).toBe(String(wait.body.retryAfterSeconds));
    clock += 3601_000;
    expect((await redeem('kai', c!.url!)).body.progress).toBe(2);
  });

  it('prüft den Standort, wenn der Code einen Ort hat', async () => {
    const id = await liveAchievement(null);
    const [c] = await code(id, { geo: { lat: 51.9055, lng: 10.4297, radiusM: 80 } });
    expect((await redeem('lena', c!.url!)).status).toBe(403);
    expect((await redeem('lena', c!.url!, { lat: 51.92, lng: 10.45 })).body.error).toBe('out_of_range');
    expect((await redeem('lena', c!.url!, { lat: 51.9058, lng: 10.4299, accuracyM: 15 })).status).toBe(200);
  });
});

describe('Einlösen: nicht verfügbar', () => {
  it('Entwurf, Veto, inaktiver und abgelaufener Code', async () => {
    const draft = (await call('POST', `${orgBase}/achievements`, 'waldpfad', { kind: 'single', name: 'Entwurf', spec })).body.id;
    const [d] = await code(draft);
    expect((await redeem('mia', d!.url!)).body.error).toBe('unavailable');

    const id = await liveAchievement(null);
    const [c] = await code(id);
    await call('POST', `/api/v1/admin/achievements/${id}/veto`, 'admin', { reason: 'Prüfung läuft' });
    expect((await redeem('mia', c!.url!)).body.error).toBe('unavailable');
    await call('DELETE', `/api/v1/admin/achievements/${id}/veto`, 'admin');

    await call('PATCH', `${orgBase}/codes/${c!.id}`, 'waldpfad', { active: false });
    expect((await redeem('mia', c!.url!)).body.error).toBe('inactive');
    await call('PATCH', `${orgBase}/codes/${c!.id}`, 'waldpfad', { active: true, validUntil: '2026-11-14T09:00:00Z' });
    expect((await redeem('mia', c!.url!)).body.error).toBe('expired');
  });
});

describe('Vorschau und Sammlung', () => {
  it('Vorschau verbraucht nichts und zeigt eigenen Fortschritt', async () => {
    const id = await liveAchievement([2, 4]);
    const [c] = await code(id);
    const anon = await call('GET', `/api/v1/redemptions/preview?code=${encodeURIComponent(c!.url!)}`);
    expect(anon.body).toMatchObject({ status: 'ok', template: 'station', value: 1, award: null, achievement: { id, name: 'Walderlebnispfad' } });
    await redeem('nora', c!.url!);
    const mine = await call('GET', `/api/v1/redemptions/preview?code=${encodeURIComponent(c!.url!)}`, 'nora');
    expect(mine.body.award).toEqual({ progress: 1, tier: 0 });
    expect((await db.selectFrom('codes').select('uses').where('id', '=', c!.id).executeTakeFirstOrThrow()).uses).toBe(1);
    expect((await call('GET', '/api/v1/redemptions/preview?code=quatsch')).body.status).toBe('invalid');
  });

  it('listet die eigene Sammlung mit Stufen', async () => {
    const res = await call('GET', '/api/v1/users/me/awards', 'anna');
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ progress: 2, tier: 1, tierCount: 2, nextThreshold: 4, achievement: { name: 'Walderlebnispfad' } });
    expect(res.body.items[0].firstEarnedAt).not.toBeNull();
  });
});

describe('Rate-Limit', () => {
  it('begrenzt Einlöseversuche pro Konto', async () => {
    const { call: fresh } = await testApp(db, { now: () => clock });
    const results = [];
    for (let i = 0; i < 31; i++) results.push(await fresh('POST', '/api/v1/redemptions', 'otto', { code: 'AAAAAAAAAAAAAAAAAAAAAA' }));
    expect(results.slice(0, 30).every((r) => r.status === 404)).toBe(true);
    expect(results[30]!.status).toBe(429);
    expect((await fresh('POST', '/api/v1/redemptions', 'paula', { code: 'AAAAAAAAAAAAAAAAAAAAAA' })).status).toBe(404);
  });
});
