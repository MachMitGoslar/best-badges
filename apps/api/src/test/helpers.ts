// Gemeinsame Testhilfen: lokale Schlüssel statt OIDC, Test-Datenbank, Org-Verzeichnis ohne HSP.
import { generateKeyPair, SignJWT, createLocalJWKSet, exportJWK, type JWTVerifyGetKey } from 'jose';
import { sql } from 'kysely';
import pg from 'pg';
import { createApp } from '../app.ts';
import type { Config } from '../config.ts';
import { createDb, type Database } from '../db/index.ts';
import { migrate } from '../db/migrate.ts';
import type { OrgDirectory } from '../orgDirectory.ts';

export const ISS = 'http://issuer.test/goslarid';
export const ADMIN_ORG = '00000000-0000-4000-8000-000000000001';
export const WALD_ORG = '00000000-0000-4000-8000-000000000002';
export const MUSEUM_ORG = '00000000-0000-4000-8000-000000000003';

/** Testbenutzer → Organisationen */
const MEMBERS: Record<string, string[]> = { admin: [ADMIN_ORG], waldpfad: [WALD_ORG], museum: [MUSEUM_ORG] };

export const directory: OrgDirectory = {
  async lookupUser(sub) {
    return { hspProfileId: `p-${sub}`, displayName: sub.toUpperCase(), organisationIds: MEMBERS[sub] ?? [] };
  },
  async getOrganisation(id) {
    const names: Record<string, string> = { [ADMIN_ORG]: 'Admin', [WALD_ORG]: 'Walderlebnispfad', [MUSEUM_ORG]: 'Museum' };
    return names[id]
      ? { id, name: names[id]!, street: null, number: null, postcode: null, city: null, logoFileUrl: null, description: null, websiteUrl: null, contactEmail: null }
      : null;
  },
};

export const TEST_DB_URL = process.env.TEST_DATABASE_URL ?? 'postgres://badges:badges-dev@127.0.0.1:5433/badges_test';

export const testConfig = (over: Partial<Config> = {}): Config => ({
  PORT: 0, NODE_ENV: 'test', DATABASE_URL: TEST_DB_URL, OIDC_ISSUER: ISS, OIDC_AUDIENCE: 'badges-api',
  HSP_BASE_URL: 'http://hsp.test', ADMIN_ORG_ID: ADMIN_ORG, PUBLIC_BASE_URL: 'https://badges.test',
  MIGRATE_ON_START: false, CORS_ORIGINS: [], HSP_MEMBERSHIP_TTL: 600, HSP_ORG_TTL: 600, ...over,
});

let keyMaterial: Promise<{ privateKey: CryptoKey; keys: JWTVerifyGetKey }> | null = null;
function keyPair() {
  keyMaterial ??= (async () => {
    const pair = await generateKeyPair('RS256');
    const jwk = { ...(await exportJWK(pair.publicKey)), alg: 'RS256', kid: 'k1' };
    return { privateKey: pair.privateKey, keys: createLocalJWKSet({ keys: [jwk] }) };
  })();
  return keyMaterial;
}

export async function signToken(sub: string, over: { iss?: string; aud?: string; exp?: string } = {}) {
  const { privateKey } = await keyPair();
  return new SignJWT({ 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress': `${sub}@example.test` })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject(sub).setIssuer(over.iss ?? ISS).setAudience(over.aud ?? 'badges-api')
    .setIssuedAt().setExpirationTime(over.exp ?? '5m').sign(privateKey);
}

/** Legt die Test-Datenbank bei Bedarf an, leert das Schema und wendet alle Migrationen an. */
export async function freshDatabase(): Promise<Database> {
  const url = new URL(TEST_DB_URL);
  const dbName = url.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(dbName) || !dbName.endsWith('_test')) throw new Error(`Test-Datenbank muss auf _test enden: ${dbName}`);
  const adminUrl = new URL(TEST_DB_URL); adminUrl.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) await admin.query(`CREATE DATABASE ${dbName}`);
  await admin.end();

  const db = createDb(TEST_DB_URL, { max: 25 });
  await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(db);
  await migrate(db, () => {});
  return db;
}

export async function testApp(db: Database, opts: { now?: () => number } = {}) {
  const { keys } = await keyPair();
  const app = createApp({ config: testConfig(), directory, db, authKeys: keys, now: opts.now });
  /** Kleiner Client: call('POST', '/pfad', 'waldpfad', body) */
  const call = async (method: string, path: string, user?: string, body?: unknown) => {
    const headers: Record<string, string> = {};
    if (user) headers.Authorization = `Bearer ${await signToken(user)}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const type = res.headers.get('content-type') ?? '';
    return { status: res.status, headers: res.headers, body: type.includes('json') ? await res.json() as any : await res.text() };
  };
  return { app, call };
}
