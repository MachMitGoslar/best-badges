import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { Database } from './db/index.ts';
import { WALD_ORG, freshDatabase, signToken, testApp } from './test/helpers.ts';

let db: Database;
let call: Awaited<ReturnType<typeof testApp>>['call'];
let app: Awaited<ReturnType<typeof testApp>>['app'];
beforeAll(async () => { db = await freshDatabase(); ({ call, app } = await testApp(db)); });
afterAll(async () => { await db.destroy(); });

const withToken = async (token: string) => (await app.request('/api/v1/me', { headers: { Authorization: `Bearer ${token}` } })).status;

describe('Auth', () => {
  it('lehnt Anfragen ohne Token ab', async () => {
    expect((await call('GET', '/api/v1/me')).status).toBe(401);
  });

  it('akzeptiert ein gültiges Token und mappt die Goslar-ID-Claims', async () => {
    const res = await call('GET', '/api/v1/me', 'waldpfad');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      sub: 'waldpfad', name: 'WALDPFAD', email: 'waldpfad@example.test', isPlatformAdmin: false,
      organisations: [{ id: WALD_ORG, name: 'Walderlebnispfad' }],
    });
  });

  it('lehnt falschen Issuer, falsche Audience und abgelaufene Tokens ab', async () => {
    expect(await withToken(await signToken('waldpfad', { iss: 'http://evil.test' }))).toBe(401);
    expect(await withToken(await signToken('waldpfad', { aud: 'other-api' }))).toBe(401);
    expect(await withToken(await signToken('waldpfad', { exp: '-1m' }))).toBe(401);
  });

  it('erkennt die Haupt-Admin-Organisation', async () => {
    expect((await call('GET', '/api/v1/me', 'admin')).body.isPlatformAdmin).toBe(true);
  });

  it('lässt nur Mitglieder auf ihre Organisation zugreifen', async () => {
    expect((await call('GET', `/api/v1/orgs/${WALD_ORG}`, 'waldpfad')).status).toBe(200);
    expect((await call('GET', `/api/v1/orgs/${WALD_ORG}`, 'besucher')).status).toBe(403);
  });
});
