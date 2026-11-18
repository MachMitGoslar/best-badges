import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from './db/index.ts';
import { WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const wald = `/api/v1/orgs/${WALD_ORG}`;

beforeAll(async () => { db = await freshDatabase(); ({ call } = await testApp(db)); });
afterAll(async () => { await db.destroy(); });

async function earn(user: string, body: Record<string, unknown>) {
  const a = (await call('POST', `${wald}/achievements`, 'waldpfad', { spec, kind: 'single', ...body })).body;
  await call('POST', `${wald}/achievements/${a.id}/publish`, 'waldpfad');
  const url = (await call('POST', `${wald}/codes`, 'waldpfad', { achievementId: a.id, template: 'station' })).body.items[0].url;
  expect((await call('POST', '/api/v1/redemptions', user, { code: url })).status).toBe(200);
  return a.id as string;
}

describe('Profil und Showcase', () => {
  it('ist standardmäßig privat und ohne Daten aus der Goslar ID', async () => {
    const me = (await call('GET', '/api/v1/users/me/profile', 'fiona')).body;
    expect(me).toEqual({ handle: null, displayName: null, public: false, showcase: [], url: null });
    expect((await call('PUT', '/api/v1/users/me/profile', 'fiona', { public: true })).status).toBe(422);
  });

  it('zeigt öffentlich nur gewählte, gesammelte Abzeichen; versteckte bleiben für andere geheim', async () => {
    const open = await earn('gerd', { name: 'Brunnen' });
    const secret = await earn('gerd', { name: 'Geheimgang', hidden: true });
    const notMine = (await call('POST', `${wald}/achievements`, 'waldpfad', { spec, kind: 'single', name: 'Fremd' })).body.id;

    expect((await call('PUT', '/api/v1/users/me/profile', 'gerd', { showcase: [open, notMine] })).status).toBe(422);
    expect((await call('PUT', '/api/v1/users/me/profile', 'gerd', { handle: 'admin' })).status).toBe(422);
    expect((await call('PUT', '/api/v1/users/me/profile', 'gerd', { handle: 'X!' })).status).toBe(422);

    const saved = await call('PUT', '/api/v1/users/me/profile', 'gerd', { handle: 'Gerd-Goslar', displayName: 'Gerd', public: true, showcase: [secret, open] });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({ handle: 'gerd-goslar', public: true, url: 'https://badges.test/u/gerd-goslar' });

    // Kürzel ist eindeutig
    expect((await call('PUT', '/api/v1/users/me/profile', 'hanna', { handle: 'gerd-goslar' })).status).toBe(409);

    const pub = (await call('GET', '/api/v1/profiles/gerd-goslar')).body;
    expect(pub).toMatchObject({ handle: 'gerd-goslar', displayName: 'Gerd', stats: { badges: 2 } });
    expect(pub.showcase.map((s: { achievement: { name?: string; secret: boolean } }) => s.achievement.secret ? 'geheim' : s.achievement.name)).toEqual(['geheim', 'Brunnen']);
    expect(JSON.stringify(pub)).not.toContain('Geheimgang');
    // Platzhalter verraten auch keine Seltenheit
    expect(pub.showcase.map((s: { rarity: string | null }) => s.rarity)).toEqual([null, 'common']);
    expect(JSON.stringify(pub)).not.toContain('gerd"'); // kein sub
    // Die Person selbst sieht ihr Geheimnis
    expect((await call('GET', '/api/v1/profiles/gerd-goslar', 'gerd')).body.showcase[0].achievement.name).toBe('Geheimgang');

    // Privat geschaltet: weg
    await call('PUT', '/api/v1/users/me/profile', 'gerd', { public: false });
    expect((await call('GET', '/api/v1/profiles/gerd-goslar')).status).toBe(404);
  });
});
