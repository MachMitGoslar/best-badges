import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Database } from './db/index.ts';
import { HspOrgDirectory, type HspPoi } from './orgDirectory.ts';
import { fromHspOpeningHours } from './services/schedule.ts';
import { MUSEUM_ORG, WALD_ORG, freshDatabase, hspState, testApp, testPois } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const orgBase = `/api/v1/orgs/${WALD_ORG}`;

const poi = (id: string, extra: Partial<HspPoi> = {}): HspPoi => ({
  id, orgId: WALD_ORG, name: `Filiale ${id}`, street: 'Breite Straße', houseNumber: '12', zipCode: '38640', city: 'Goslar',
  category: 'Cafés', lat: 51.9061, lng: 10.4312, openingHours: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '18:00' }], ...extra,
});

beforeAll(async () => { db = await freshDatabase(); ({ call } = await testApp(db)); });
afterAll(async () => { await db.destroy(); });
beforeEach(() => {
  hspState.down = false;
  testPois[WALD_ORG] = [poi('breite'), poi('markt', { name: 'Filiale Markt', street: 'Markt', houseNumber: '1', lat: 51.9059, lng: 10.429, openingHours: null })];
  testPois[MUSEUM_ORG] = [poi('museum', { orgId: MUSEUM_ORG, name: 'Goslarer Museum' })];
});

const loadPois = (org = WALD_ORG, user = 'waldpfad') => call('GET', `/api/v1/orgs/${org}/pois`, user);
async function live(body: Record<string, unknown>) {
  const res = await call('POST', `${orgBase}/achievements`, 'waldpfad', { kind: 'single', name: 'Kaffee', spec, ...body });
  expect(res.status).toBe(201);
  expect((await call('POST', `${orgBase}/achievements/${res.body.id}/publish`, 'waldpfad')).status).toBe(200);
  return res.body as { id: string; poi: unknown };
}

describe('Öffnungszeiten aus dem HSP', () => {
  it('rechnet .NET-Wochentage um und fasst gleiche Zeiten zusammen', () => {
    expect(fromHspOpeningHours([
      { dayOfWeek: 1, from: '09:00:00', to: '18:00:00' }, { dayOfWeek: 2, from: '09:00:00', to: '18:00:00' },
      { dayOfWeek: 6, from: '10:00:00', to: '14:00:00' }, { dayOfWeek: 0, from: '10:00:00', to: '14:00:00' },
    ])).toEqual([{ days: [1, 2], from: '09:00', to: '18:00' }, { days: [6, 7], from: '10:00', to: '14:00' }]);
  });
  it('versteht Mitternacht als TimeSpan und überspringt Unbrauchbares', () => {
    expect(fromHspOpeningHours([{ dayOfWeek: 5, from: '20:00:00', to: '1.00:00:00' }, { dayOfWeek: 3, from: 'kaputt', to: '10:00' }, { dayOfWeek: 9, from: '08:00', to: '09:00' }]))
      .toEqual([{ days: [5], from: '20:00', to: '00:00' }]);
    expect(fromHspOpeningHours([])).toBeNull();
  });
});

describe('HSP-Abruf der POI', () => {
  it('liest Felder, verwirft POI ohne Koordinaten und kommt ohne Öffnungszeiten aus', async () => {
    const fake = (async (url: string) => {
      const u = String(url);
      if (u.endsWith('/PointsOfInterest')) {
        return new Response(JSON.stringify([
          { id: 'a', name: 'Café A', street: 'Hoher Weg', houseNumber: '3', zipCode: '38640', city: 'Goslar', firstCategory: null, secondCategory: 'Cafés', latitude: 51.9, longitude: 10.43 },
          { id: 'b', name: 'Ohne Ort', latitude: 0, longitude: 0 },
          { id: 'c', name: '', latitude: 51.9, longitude: 10.4 },
        ]));
      }
      if (u.includes('/a/OpeningHours')) return new Response(JSON.stringify([{ dayOfWeek: 0, from: '10:00:00', to: '12:00:00' }]));
      return new Response('boom', { status: 500 });
    }) as typeof fetch;
    const dir = new HspOrgDirectory('http://hsp.test/api', { membershipTtlSec: 1, orgTtlSec: 1 }, fake);
    const list = await dir.listPointsOfInterest(WALD_ORG, 'token');
    expect(list).toEqual([{ id: 'a', orgId: WALD_ORG, name: 'Café A', street: 'Hoher Weg', houseNumber: '3', zipCode: '38640', city: 'Goslar',
      category: 'Cafés', lat: 51.9, lng: 10.43, openingHours: [{ days: [7], from: '10:00', to: '12:00' }] }]);
  });
});

describe('POI der Organisation in der Verwaltung', () => {
  it('liefert die POI, merkt entfernte und nutzt bei Ausfall die Kopie', async () => {
    const first = await loadPois();
    expect(first.status).toBe(200);
    // nach Name sortiert
    expect(first.body.items.map((p: { name: string }) => p.name)).toEqual(['Filiale Markt', 'Filiale breite']);
    expect(first.body.items.find((p: { id: string }) => p.id === 'breite')).toMatchObject({ address: 'Breite Straße 12, 38640 Goslar', openingHoursText: 'Mo–Fr 08:00–18:00', removed: false });

    testPois[WALD_ORG] = [poi('breite')];
    expect((await loadPois()).body.items.map((p: { id: string }) => p.id)).toEqual(['breite']);
    expect((await db.selectFrom('pois').select('removed_at').where('id', '=', 'markt').executeTakeFirstOrThrow()).removed_at).not.toBeNull();

    hspState.down = true;
    expect((await loadPois()).body.items.map((p: { id: string }) => p.id)).toEqual(['breite']);
  });

  it('nur für Mitglieder', async () => {
    expect((await loadPois(WALD_ORG, 'museum')).status).toBe(403);
  });
});

describe('Abzeichen eines POI', () => {
  it('gehört dem POI, zeigt ihn öffentlich und lässt sich umhängen; fremde POI sind tabu', async () => {
    await loadPois();
    await loadPois(MUSEUM_ORG, 'museum');
    const a = await live({ name: 'Kaffee Breite Straße', poiId: 'breite' });
    expect(a.poi).toEqual({ id: 'breite', name: 'Filiale breite', address: 'Breite Straße 12, 38640 Goslar', lat: 51.9061, lng: 10.4312 });
    const pub = await call('GET', `/api/v1/achievements/${a.id}`);
    expect(pub.body.poi).toMatchObject({ id: 'breite', name: 'Filiale breite' });

    const foreign = await call('POST', `${orgBase}/achievements`, 'waldpfad', { kind: 'single', name: 'Fremd', spec, poiId: 'museum' });
    expect(foreign.status).toBe(422);
    const moved = await call('PATCH', `${orgBase}/achievements/${a.id}`, 'waldpfad', { poiId: 'markt' });
    expect(moved.status).toBe(200);
    expect(moved.body.poi.id).toBe('markt');
    const orgWide = await call('PATCH', `${orgBase}/achievements/${a.id}`, 'waldpfad', { poiId: null });
    expect(orgWide.body.poi).toBeNull();
  });

  it('Abzeichen der Organisation haben keinen POI', async () => {
    const a = await live({ name: 'Kaffee bei uns' });
    expect(a.poi).toBeNull();
  });
});

describe('Orte und Codes am POI', () => {
  it('Ort am POI übernimmt Standort (60 m) und Namen', async () => {
    await loadPois();
    const a = await live({ name: 'Kaffee bei uns' });
    const res = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: a.id, template: 'place', poiId: 'breite' });
    expect(res.status).toBe(201);
    expect(res.body.items[0]).toMatchObject({ poiId: 'breite', placeName: 'Filiale breite', geo: { lat: 51.9061, lng: 10.4312, radiusM: 60 } });
    const places = await call('GET', '/api/v1/places');
    expect(places.body.items.find((p: { id: string }) => p.id === res.body.items[0].id)).toMatchObject({ poiId: 'breite' });
    // Eigene Angaben gehen vor
    const own = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: a.id, template: 'place', poiId: 'markt', placeName: 'Tresen', geo: { lat: 51.9059, lng: 10.429, radiusM: 120 } });
    expect(own.body.items[0]).toMatchObject({ placeName: 'Tresen', geo: { radiusM: 120 } });
  });

  it('Station am POI merkt sich den Bezug', async () => {
    await loadPois();
    const a = await live({ name: 'Stempel' });
    const res = await call('POST', `${orgBase}/codes`, 'waldpfad', { achievementId: a.id, template: 'station', poiId: 'markt' });
    expect(res.body.items[0]).toMatchObject({ poiId: 'markt', geo: null });
  });
});

describe('POI auf der Karte', () => {
  it('zeigt POI mit ihren verfügbaren Abzeichen, versteckte nur als Platzhalter', async () => {
    await loadPois();
    const shown = await live({ name: 'Sichtbar am Markt', poiId: 'markt' });
    const secret = await live({ name: 'Geheim am Markt', poiId: 'markt', hidden: true, hint: 'Frag nach dem Lieblingskuchen' });
    await live({ name: 'Vorbei', poiId: 'markt', availableUntil: '2020-01-01T00:00:00Z' });
    const res = await call('GET', '/api/v1/pois');
    const markt = res.body.items.find((p: { id: string }) => p.id === 'markt');
    expect(markt).toMatchObject({ name: 'Filiale Markt', address: 'Markt 1, 38640 Goslar' });
    const ids = markt.achievements.map((x: { id: string }) => x.id);
    expect(ids).toEqual(expect.arrayContaining([shown.id, secret.id]));
    expect(ids).toHaveLength(2);
    expect(markt.achievements.find((x: { id: string }) => x.id === secret.id)).toMatchObject({ secret: true, hint: 'Frag nach dem Lieblingskuchen' });
  });
});
