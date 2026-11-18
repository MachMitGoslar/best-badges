import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from './db/index.ts';
import { WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

// Testkonfiguration: Seltenheit ab 3 Sammelnden je Organisation (RARITY_MIN_COLLECTORS)
let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const wald = `/api/v1/orgs/${WALD_ORG}`;

beforeAll(async () => { db = await freshDatabase(); ({ call } = await testApp(db)); });
afterAll(async () => { await db.destroy(); });

async function badge(name: string, body: Record<string, unknown> = {}) {
  const a = (await call('POST', `${wald}/achievements`, 'waldpfad', { spec, kind: 'single', name, ...body })).body;
  expect((await call('POST', `${wald}/achievements/${a.id}/publish`, 'waldpfad')).status).toBe(200);
  const url = (await call('POST', `${wald}/codes`, 'waldpfad', { achievementId: a.id, template: 'station' })).body.items[0].url as string;
  return { id: a.id as string, url };
}
const redeem = (user: string, url: string) => call('POST', '/api/v1/redemptions', user, { code: url });

describe('Seltenheit', () => {
  it('ist gewöhnlich, solange die Organisation zu wenige Sammelnde hat', async () => {
    const a = await badge('Erster Baum');
    const r = await redeem('r1', a.url);
    expect(r.status).toBe(200);
    expect(r.body.rarity).toBe('common');
  });

  it('ergibt sich aus dem Anteil der Sammelnden der Organisation, ohne Anzahlen preiszugeben', async () => {
    const many = await badge('Rastplatz');
    const few = await badge('Eulennest');
    for (const u of ['r1', 'r2', 'r3', 'r4']) expect((await redeem(u, many.url)).status).toBe(200);
    // 1 von 4 Sammelnden (25 %) → selten
    const r = await redeem('r4', few.url);
    expect(r.body.rarity).toBe('rare');

    const items = (await call('GET', '/api/v1/users/me/awards', 'r4')).body.items as { achievement: { id: string }; rarity: string | null }[];
    expect(items.find((i) => i.achievement.id === few.id)?.rarity).toBe('rare');
    expect(items.find((i) => i.achievement.id === many.id)?.rarity).toBe('common');
    expect(JSON.stringify(items)).not.toMatch(/holders|collectors|share/);
  });

  it('gilt je Stufe: höhere Stufen sind seltener', async () => {
    const a = (await call('POST', `${wald}/achievements`, 'waldpfad', { spec, kind: 'tiered', name: 'Wanderer', tiers: [{ threshold: 1 }, { threshold: 2 }] })).body;
    expect((await call('POST', `${wald}/achievements/${a.id}/publish`, 'waldpfad')).status).toBe(200);
    // Zwei Stationen: jede zählt einmal je Person
    const mk = async () => (await call('POST', `${wald}/codes`, 'waldpfad', { achievementId: a.id, template: 'station' })).body.items[0].url as string;
    const [s1, s2] = [await mk(), await mk()];
    for (const u of ['r1', 'r2', 'r3']) expect((await redeem(u, s1)).body.tier).toBe(1);
    const up = await redeem('r1', s2);
    expect(up.body.tier).toBe(2);
    // Stufe 2: 1 von 4 Sammelnden → selten; Stufe 1 (3 von 4) bleibt gewöhnlich
    expect(up.body.rarity).toBe('rare');
    const r2 = (await call('GET', '/api/v1/users/me/awards', 'r2')).body.items.find((i: { achievement: { id: string } }) => i.achievement.id === a.id);
    expect(r2.rarity).toBe('common');
  });
});
