import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from './db/index.ts';
import { MUSEUM_ORG, WALD_ORG, freshDatabase, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
beforeAll(async () => { db = await freshDatabase(); ({ call } = await testApp(db)); });
afterAll(async () => { await db.destroy(); });

const base = `/api/v1/orgs/${WALD_ORG}/achievements`;
const spec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const waldpfad = {
  kind: 'tiered', name: 'Walderlebnispfad', description: 'Besuche die Stationen am Pfad', awardedText: 'Weiter so!',
  category: ['Natur'], spec,
  tiers: [{ threshold: 3, name: 'Spurensucher' }, { threshold: 6 }, { threshold: 10, name: 'Waldkenner' }],
};

describe('Abzeichen verwalten', () => {
  it('legt ein Stufen-Abzeichen als Entwurf an und protokolliert es', async () => {
    const res = await call('POST', base, 'waldpfad', waldpfad);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ orgId: WALD_ORG, kind: 'tiered', status: 'draft', visible: false, veto: null });
    expect(res.body.tiers).toEqual([
      { level: 1, threshold: 3, name: 'Spurensucher', awardedText: null },
      { level: 2, threshold: 6, name: null, awardedText: null },
      { level: 3, threshold: 10, name: 'Waldkenner', awardedText: null },
    ]);
    const log = await db.selectFrom('audit_log').selectAll().where('entity_id', '=', res.body.id).execute();
    expect(log.map((l) => l.action)).toEqual(['achievement.create']);
    expect(log[0]!.actor_sub).toBe('waldpfad');
  });

  it('legt Abzeichen ohne Stufen mit genau einer Stufe an', async () => {
    const res = await call('POST', base, 'waldpfad', { kind: 'single', name: 'Erster Besuch', spec });
    expect(res.status).toBe(201);
    expect(res.body.tiers).toEqual([{ level: 1, threshold: 1, name: null, awardedText: null }]);
  });

  it('prüft Stufen und Spezifikation', async () => {
    expect((await call('POST', base, 'waldpfad', { ...waldpfad, tiers: [{ threshold: 5 }, { threshold: 5 }] })).status).toBe(422);
    expect((await call('POST', base, 'waldpfad', { ...waldpfad, tiers: [{ threshold: 5 }] })).status).toBe(422);
    expect((await call('POST', base, 'waldpfad', { kind: 'single', name: 'x', spec, tiers: [{ threshold: 1 }] })).status).toBe(422);
    const badSpec = await call('POST', base, 'waldpfad', { ...waldpfad, spec: { ...spec, emblem: { ...spec.emblem, motif: { type: 'logo', url: 'javascript:alert(1)' } } } });
    expect(badSpec.status).toBe(422);
    expect(badSpec.body.issues.length).toBeGreaterThan(0);
    expect((await call('POST', base, 'waldpfad', { ...waldpfad, name: '' })).status).toBe(422);
  });

  it('erlaubt nur Mitgliedern der Organisation Zugriff', async () => {
    expect((await call('POST', base, 'museum', waldpfad)).status).toBe(403);
    expect((await call('GET', base, 'besucher')).status).toBe(403);
    expect((await call('GET', base)).status).toBe(401);
  });

  it('findet fremde Abzeichen nicht über die eigene Organisation', async () => {
    const own = (await call('POST', base, 'waldpfad', waldpfad)).body;
    expect((await call('GET', `/api/v1/orgs/${MUSEUM_ORG}/achievements/${own.id}`, 'museum')).status).toBe(404);
  });

  it('durchläuft Entwurf → Live → Archiv und zeigt nur Live öffentlich', async () => {
    const a = (await call('POST', base, 'waldpfad', waldpfad)).body;
    expect((await call('GET', `/api/v1/achievements/${a.id}`)).status).toBe(404);

    const live = await call('POST', `${base}/${a.id}/publish`, 'waldpfad');
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({ status: 'live', visible: true });
    expect(live.body.publishedAt).not.toBeNull();
    expect((await call('GET', `/api/v1/achievements/${a.id}`)).status).toBe(200);
    const listed = await call('GET', `/api/v1/achievements?orgId=${WALD_ORG}`);
    expect(listed.body.items.some((x: { id: string }) => x.id === a.id)).toBe(true);

    expect((await call('POST', `${base}/${a.id}/publish`, 'waldpfad')).status).toBe(409);
    expect((await call('PATCH', `${base}/${a.id}`, 'waldpfad', { tiers: [{ threshold: 1 }, { threshold: 2 }] })).status).toBe(409);
    const renamed = await call('PATCH', `${base}/${a.id}`, 'waldpfad', { name: 'Waldpfad Goslar' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe('Waldpfad Goslar');

    expect((await call('POST', `${base}/${a.id}/archive`, 'waldpfad')).body.status).toBe('archived');
    expect((await call('GET', `/api/v1/achievements/${a.id}`)).status).toBe(404);
    expect((await call('PATCH', `${base}/${a.id}`, 'waldpfad', { name: 'x' })).status).toBe(409);
  });

  it('ändert Art und Stufen im Entwurf', async () => {
    const a = (await call('POST', base, 'waldpfad', { kind: 'single', name: 'Probe', spec })).body;
    const res = await call('PATCH', `${base}/${a.id}`, 'waldpfad', { kind: 'tiered', tiers: [{ threshold: 2 }, { threshold: 4 }] });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('tiered');
    expect(res.body.tiers.map((t: { threshold: number }) => t.threshold)).toEqual([2, 4]);
  });
});

describe('Nachkontrolle', () => {
  it('Veto nimmt ein Abzeichen sofort offline und blockiert die Veröffentlichung', async () => {
    const a = (await call('POST', base, 'waldpfad', waldpfad)).body;
    await call('POST', `${base}/${a.id}/publish`, 'waldpfad');

    expect((await call('POST', `/api/v1/admin/achievements/${a.id}/veto`, 'waldpfad', { reason: 'unpassend' })).status).toBe(403);
    const vetoed = await call('POST', `/api/v1/admin/achievements/${a.id}/veto`, 'admin', { reason: 'Bild verletzt Urheberrecht' });
    expect(vetoed.status).toBe(200);
    expect(vetoed.body).toMatchObject({ status: 'live', visible: false, veto: { reason: 'Bild verletzt Urheberrecht' } });
    expect((await call('GET', `/api/v1/achievements/${a.id}`)).status).toBe(404);

    const lifted = await call('DELETE', `/api/v1/admin/achievements/${a.id}/veto`, 'admin');
    expect(lifted.body).toMatchObject({ visible: true, veto: null });
    const actions = (await db.selectFrom('audit_log').select('action').where('entity_id', '=', a.id).orderBy('id').execute()).map((r) => r.action);
    expect(actions).toEqual(['achievement.create', 'achievement.publish', 'achievement.veto', 'achievement.veto_lift']);
  });

  it('Entwürfe mit Veto lassen sich nicht veröffentlichen', async () => {
    const a = (await call('POST', base, 'waldpfad', waldpfad)).body;
    await call('POST', `/api/v1/admin/achievements/${a.id}/veto`, 'admin', { reason: 'Bitte überarbeiten' });
    expect((await call('POST', `${base}/${a.id}/publish`, 'waldpfad')).status).toBe(409);
  });
});

describe('Bild', () => {
  it('liefert veröffentlichte Abzeichen als SVG mit strenger CSP', async () => {
    const a = (await call('POST', base, 'waldpfad', waldpfad)).body;
    expect((await call('GET', `/api/v1/achievements/${a.id}/image.svg`)).status).toBe(404);
    await call('POST', `${base}/${a.id}/publish`, 'waldpfad');
    const res = await call('GET', `/api/v1/achievements/${a.id}/image.svg?tier=2&rarity=epic&size=128`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('image/svg+xml');
    expect(res.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(res.body).toContain('width="128"');
    expect(res.body).toContain('aria-label="Walderlebnispfad"');
    expect((await call('GET', `/api/v1/achievements/${a.id}/image.svg?size=99999`)).status).toBe(422);
  });
});

describe('OpenAPI', () => {
  it('trennt öffentliche und interne Doku', async () => {
    const pub = await call('GET', '/openapi.json');
    expect(pub.status).toBe(200);
    const paths = Object.keys(pub.body.paths);
    expect(paths).toEqual(expect.arrayContaining(['/api/v1/achievements/{id}', '/api/v1/redemptions', '/api/v1/integrations/awards', '/api/v1/profiles/{handle}']));
    // Nichts aus Verwaltung, Codes, API-Schlüsseln, Kombinations-Anfragen oder Nachkontrolle
    expect(paths.filter((p) => p.includes('/orgs/') || p.includes('/admin/') || p === '/api/v1/me')).toEqual([]);
    const schemas = Object.keys(pub.body.components.schemas);
    expect(schemas).not.toContain('Achievement');
    expect(schemas).not.toContain('Code');
    expect(JSON.stringify(pub.body)).not.toMatch(/"veto"|openForCollections|"status":\{"type":"string","enum":\["draft"/);

    const internal = await call('GET', '/internal/openapi.json');
    expect(Object.keys(internal.body.paths)).toEqual(expect.arrayContaining([
      '/api/v1/orgs/{orgId}/achievements', '/api/v1/orgs/{orgId}/codes', '/api/v1/admin/achievements/{id}/veto', '/api/v1/orgs/{orgId}/collection-candidates',
    ]));
  });
});
