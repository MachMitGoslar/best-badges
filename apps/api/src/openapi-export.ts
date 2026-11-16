// Schreibt das OpenAPI-Dokument nach packages/api-client/openapi.json (ohne laufenden Server).
import { writeFileSync } from 'node:fs';
import { createApp } from './app.ts';
import { createDb } from './db/index.ts';
import { publicDocument } from './openapi.ts';

const config = {
  PORT: 0, NODE_ENV: 'test' as const, DATABASE_URL: 'postgres://unused@localhost/unused', OIDC_ISSUER: 'https://issuer.invalid',
  OIDC_AUDIENCE: 'badges-api', HSP_BASE_URL: 'https://hsp.invalid', ADMIN_ORG_ID: '00000000-0000-4000-8000-000000000001',
  PUBLIC_BASE_URL: 'https://badges.invalid', MIGRATE_ON_START: false, CORS_ORIGINS: [], HSP_MEMBERSHIP_TTL: 1, HSP_ORG_TTL: 1,
};
const db = createDb(config.DATABASE_URL, { max: 1 }); // verbindet sich erst bei der ersten Abfrage – hier nie
const app = createApp({ config, db, directory: { lookupUser: async () => { throw new Error(); }, getOrganisation: async () => null } });
const doc = app.getOpenAPI31Document({
  openapi: '3.1.0',
  info: { title: 'Best Badges API', version: '0.1.0' },
});
// Vollständig (intern) für den typisierten Client von App und Verwaltung; öffentlich für Partner
writeFileSync(new URL('../../../packages/api-client/openapi.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
const pub = publicDocument(doc);
writeFileSync(new URL('../../../packages/api-client/openapi.public.json', import.meta.url), JSON.stringify(pub, null, 2) + '\n');
await db.destroy();
console.log(`OpenAPI geschrieben: ${Object.keys(doc.paths ?? {}).length} Pfade intern, ${Object.keys(pub.paths ?? {}).length} öffentlich`);
