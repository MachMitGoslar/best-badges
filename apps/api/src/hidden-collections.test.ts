import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from './db/index.ts';
import { MUSEUM_ORG, WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
let app: Awaited<ReturnType<typeof testApp>>['app'];
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const wald = `/api/v1/orgs/${WALD_ORG}`;
const museum = `/api/v1/orgs/${MUSEUM_ORG}`;

beforeAll(async () => { db = await freshDatabase(); ({ call, app } = await testApp(db)); });
afterAll(async () => { await db.destroy(); });

async function create(org: string, user: string, body: Record<string, unknown>) {
  const res = await call('POST', `${org}/achievements`, user, { spec, ...body });
  expect(res.status).toBe(201);
  return res.body;
}
async function live(org: string, user: string, body: Record<string, unknown>) {
  const a = await create(org, user, body);
  expect((await call('POST', `${org}/achievements/${a.id}/publish`, user)).status).toBe(200);
  return a.id as string;
}
async function stationUrl(org: string, user: string, achievementId: string) {
  const res = await call('POST', `${org}/codes`, user, { achievementId, template: 'station' });
  expect(res.status).toBe(201);
  return res.body.items[0].url as string;
}
const redeem = (user: string, url: string) => call('POST', '/api/v1/redemptions', user, { code: url });

describe('Versteckte Abzeichen', () => {
  it('zeigt öffentlich nur Platzhalter und Hinweis, bis man es hat', async () => {
    const id = await live(wald, 'waldpfad', { kind: 'single', name: 'Die Waldhexe', description: 'Geheime Lichtung', hidden: true, hint: 'Folge den Pilzen' });
    const url = await stationUrl(wald, 'waldpfad', id);

    const anon = (await call('GET', `/api/v1/achievements/${id}`)).body;
    // Nur Verweis mit Hinweis: kein Name, kein Design, keine Struktur, nichts aus der Verwaltung
    expect(anon).toEqual({ secret: true, id, orgId: WALD_ORG, hint: 'Folge den Pilzen' });
    expect(JSON.stringify((await call('GET', '/api/v1/achievements', 'anna')).body)).not.toContain('Waldhexe');

    // Bild-Endpunkt verrät nichts und wird nicht zwischengespeichert
    const img = await app.request(`/api/v1/achievements/${id}/image.svg`);
    const svg = await img.text();
    expect(svg).not.toContain('Waldhexe');
    expect(img.headers.get('cache-control')).toBe('no-store');

    // Vorschau beim Scannen: Platzhalter
    const preview = (await call('GET', `/api/v1/redemptions/preview?code=${encodeURIComponent(url)}`, 'anna')).body;
    expect(preview.achievement).toEqual({ secret: true, id, orgId: WALD_ORG, hint: 'Folge den Pilzen' });

    // Einlösen deckt auf
    const res = await redeem('anna', url);
    expect(res.status).toBe(200);
    expect(res.body.achievement).toMatchObject({ secret: false, name: 'Die Waldhexe', hidden: true });
    const revealed = (await call('GET', `/api/v1/achievements/${id}`, 'anna')).body;
    expect(revealed).toMatchObject({ secret: false, name: 'Die Waldhexe', description: 'Geheime Lichtung' });
    // Öffentliche Sicht ohne Verwaltungsfelder
    for (const k of ['status', 'visible', 'veto', 'openForCollections', 'awardedText', 'createdAt', 'updatedAt']) expect(revealed).not.toHaveProperty(k);
    expect((await call('GET', '/api/v1/users/me/awards', 'anna')).body.items[0].achievement.name).toBe('Die Waldhexe');

    // Andere sehen weiter den Platzhalter, die Organisation sieht alles
    expect((await call('GET', `/api/v1/achievements/${id}`, 'ben')).body.secret).toBe(true);
    expect((await call('GET', `${wald}/achievements/${id}`, 'waldpfad')).body).toMatchObject({ name: 'Die Waldhexe', hidden: true });
  });

  it('bleibt bei Stufen-Abzeichen bis zur ersten Stufe verborgen', async () => {
    const id = await live(wald, 'waldpfad', { kind: 'tiered', name: 'Nachtwanderer', hidden: true, tiers: [{ threshold: 2, name: 'Eule' }, { threshold: 4 }] });
    const a = await stationUrl(wald, 'waldpfad', id);
    const b = await stationUrl(wald, 'waldpfad', id);
    const first = await redeem('carla', a);
    expect(first.body.achievement).toEqual({ secret: true, id, orgId: WALD_ORG, hint: '' });
    expect(first.body.awardedText).toBe('');
    expect((await call('GET', '/api/v1/users/me/awards', 'carla')).body.items[0].achievement.secret).toBe(true);
    const second = await redeem('carla', b);
    expect(second.body.achievement).toMatchObject({ secret: false, name: 'Nachtwanderer' });
  });
});

describe('Kombinations-Abzeichen', () => {
  it('braucht Zustimmung fremder Organisationen, wird rückwirkend vergeben und zählt neue Teile', async () => {
    const pfad = await live(wald, 'waldpfad', { kind: 'single', name: 'Pfad' });
    const quelle = await live(wald, 'waldpfad', { kind: 'single', name: 'Quelle' });
    const stollen = await live(museum, 'museum', { kind: 'single', name: 'Stollen', openForCollections: true });
    const urls = { pfad: await stationUrl(wald, 'waldpfad', pfad), quelle: await stationUrl(wald, 'waldpfad', quelle), stollen: await stationUrl(museum, 'museum', stollen) };

    // Dora hat schon zwei Teile, bevor die Kombination existiert
    await redeem('dora', urls.pfad);
    await redeem('dora', urls.stollen);

    const combo = await create(wald, 'waldpfad', { kind: 'collection', name: 'Harz-Entdecker', requiredCount: 2, items: [pfad, quelle, stollen] });
    expect(combo.tiers).toEqual([{ level: 1, threshold: 2, name: null, awardedText: null }]);
    expect(combo.items.map((i: { name: string; state: string }) => `${i.name}:${i.state}`)).toEqual(['Pfad:approved', 'Quelle:approved', 'Stollen:pending']);

    // Ohne Zustimmung des Museums keine Veröffentlichung
    const blocked = await call('POST', `${wald}/achievements/${combo.id}/publish`, 'waldpfad');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('approval_pending');

    // Das Museum sieht die Anfrage; nur das Museum darf entscheiden
    const requests = (await call('GET', `${museum}/collection-requests`, 'museum')).body.items;
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ collection: { name: 'Harz-Entdecker', orgName: 'Walderlebnispfad', requiredCount: 2, itemCount: 3 }, achievement: { name: 'Stollen' }, state: 'pending' });
    expect((await call('POST', `${wald}/collection-requests/${combo.id}/items/${stollen}/approve`, 'waldpfad')).status).toBe(404);
    expect((await call('POST', `${museum}/collection-requests/${combo.id}/items/${stollen}/approve`, 'waldpfad')).status).toBe(403);
    expect((await call('POST', `${museum}/collection-requests/${combo.id}/items/${stollen}/approve`, 'museum')).status).toBe(204);

    expect((await call('POST', `${wald}/achievements/${combo.id}/publish`, 'waldpfad')).status).toBe(200);

    // Rückwirkend: Dora hat die Kombination sofort
    const dora = (await call('GET', '/api/v1/users/me/awards', 'dora')).body.items;
    expect(dora.find((a: { achievement: { id: string } }) => a.achievement.id === combo.id)).toMatchObject({ progress: 2, tier: 1 });

    // Emil sammelt: erstes Teil bringt Fortschritt, zweites schließt ab
    const e1 = await redeem('emil', urls.quelle);
    expect(e1.body.collections).toEqual([expect.objectContaining({ progress: 1, requiredCount: 2, completed: false, firstTime: false })]);
    const e2 = await redeem('emil', urls.stollen);
    expect(e2.body.collections).toEqual([expect.objectContaining({ progress: 2, completed: true, firstTime: true, achievement: expect.objectContaining({ name: 'Harz-Entdecker' }) })]);
    const e3 = await redeem('emil', urls.pfad);
    expect(e3.body.collections).toEqual([expect.objectContaining({ progress: 3, completed: true, firstTime: false })]);

    // Öffentliche Sicht zeigt die Teile
    const pub = (await call('GET', `/api/v1/achievements/${combo.id}`)).body;
    expect(pub).toMatchObject({ kind: 'collection', requiredCount: 2 });
    expect(pub.items).toHaveLength(3);

    // Für Kombinationen gibt es keine Codes
    expect((await call('POST', `${wald}/codes`, 'waldpfad', { achievementId: combo.id, template: 'station' })).status).toBe(409);
  });

  it('prüft Teile und N', async () => {
    const own = await live(wald, 'waldpfad', { kind: 'single', name: 'A' });
    const own2 = await create(wald, 'waldpfad', { kind: 'single', name: 'Entwurf' });
    const foreignDraft = await create(museum, 'museum', { kind: 'single', name: 'Museumsentwurf' });
    const bad = (body: Record<string, unknown>) => call('POST', `${wald}/achievements`, 'waldpfad', { spec, kind: 'collection', name: 'K', ...body });
    expect((await bad({ requiredCount: 1, items: [own] })).status).toBe(422);
    expect((await bad({ requiredCount: 3, items: [own, own2.id] })).status).toBe(422);
    expect((await bad({ requiredCount: 1, items: [own, own] })).status).toBe(422);
    expect((await bad({ requiredCount: 1, items: [own, foreignDraft.id] })).status).toBe(422);
    // Fremdes, veröffentlichtes Abzeichen ohne Freigabe: nicht anfragbar
    const closed = await live(museum, 'museum', { kind: 'single', name: 'Nicht freigegeben' });
    const res422 = await bad({ requiredCount: 1, items: [own, closed] });
    expect(res422.status).toBe(422);
    expect(res422.body.message).toContain('nicht für Kombinationen freigegeben');
    expect((await call('POST', `${wald}/achievements`, 'waldpfad', { spec, kind: 'single', name: 'x', items: [own] })).status).toBe(422);

    // Eigener Entwurf als Teil geht, verhindert aber die Veröffentlichung
    const k = await create(wald, 'waldpfad', { kind: 'collection', name: 'K', requiredCount: 2, items: [own, own2.id] });
    const res = await call('POST', `${wald}/achievements/${k.id}/publish`, 'waldpfad');
    expect(res.body.error).toBe('items_not_live');

    // Keine Verschachtelung
    expect((await bad({ requiredCount: 1, items: [own, k.id] })).status).toBe(422);
  });

  it('versteckte Kombination verrät ihre Teile nicht, versteckte Teile bleiben Platzhalter', async () => {
    const a = await live(wald, 'waldpfad', { kind: 'single', name: 'Sichtbar' });
    const b = await live(wald, 'waldpfad', { kind: 'single', name: 'Geheimgang', hidden: true });
    const open = await live(wald, 'waldpfad', { kind: 'collection', name: 'Offen', requiredCount: 2, items: [a, b] });
    const secret = await live(wald, 'waldpfad', { kind: 'collection', name: 'Geheimbund', hidden: true, requiredCount: 2, items: [a, b] });

    const o = (await call('GET', `/api/v1/achievements/${open}`)).body;
    expect(o.items.map((i: { name?: string; secret: boolean }) => i.secret ? 'geheim' : i.name)).toEqual(['Sichtbar', 'geheim']);
    expect(JSON.stringify(o)).not.toContain('Geheimgang');
    const s = (await call('GET', `/api/v1/achievements/${secret}`)).body;
    expect(s).toEqual({ secret: true, id: secret, orgId: WALD_ORG, hint: '' });
  });
});
