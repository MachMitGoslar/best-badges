import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { errors, json } from './routes/schemas.ts';
import { publicDocument } from './openapi.ts';
import { swaggerUI } from '@hono/swagger-ui';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { logger } from 'hono/logger';
import { bodyLimit } from 'hono/body-limit';
import { ZodError } from 'zod';
import type { JWTVerifyGetKey } from 'jose';
import type { Config } from './config.ts';
import type { Database } from './db/index.ts';
import { createAuth } from './auth.ts';
import { ApiError } from './errors.ts';
import type { OrgDirectory } from './orgDirectory.ts';
import { AchievementService } from './services/achievements.ts';
import { CodeService } from './services/codes.ts';
import { RedemptionService } from './services/redemptions.ts';
import { perUserRateLimit } from './rateLimit.ts';
import { achievementRoutes } from './routes/achievements.ts';
import { codeRoutes } from './routes/codes.ts';
import { publicRoutes } from './routes/public.ts';
import { adminRoutes } from './routes/admin.ts';
import { redemptionRoutes } from './routes/redemptions.ts';
import { integrationRoutes } from './routes/integrations.ts';
import { collectionRoutes } from './routes/collections.ts';
import { profileRoutes } from './routes/profiles.ts';
import { ProfileService } from './services/profiles.ts';
import { RarityService } from './services/rarity.ts';
import { ApiKeyService } from './services/apiKeys.ts';

/** Höchstgröße einer Anfrage (Bytes) */
export const BODY_LIMIT = 512 * 1024;

const MeSchema = z.object({
  sub: z.string(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  isPlatformAdmin: z.boolean(),
  organisations: z.array(z.object({ id: z.string().uuid(), name: z.string().nullable() })),
}).openapi('Me');

export interface AppDeps {
  config: Config;
  directory: OrgDirectory;
  db: Database;
  /** Für Tests: lokale Schlüssel statt OIDC-Discovery */
  authKeys?: JWTVerifyGetKey;
  /** Für Tests: feste Uhr */
  now?: () => number;
}

const zodIssues = (err: ZodError) => err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));

export function createApp({ config, directory, db, authKeys, now = Date.now }: AppDeps) {
  const app = new OpenAPIHono({
    // Validierungsfehler einheitlich als 422 mit Liste der Probleme
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: 'Unprocessable Entity', message: 'Ungültige Eingabe', issues: zodIssues(result.error as ZodError) }, 422);
      }
    },
  });
  const auth = createAuth({
    issuer: config.OIDC_ISSUER,
    audience: config.OIDC_AUDIENCE,
    adminOrgId: config.ADMIN_ORG_ID,
    directory,
    keys: authKeys,
  });
  const achievements = new AchievementService(db, now);
  const codes = new CodeService(db, achievements, config.PUBLIC_BASE_URL, now);
  const redemptions = new RedemptionService(db, now);
  const keys = new ApiKeyService(db, now);
  const profiles = new ProfileService(db, config.PUBLIC_BASE_URL, now);
  const rarity = new RarityService(db, { minCollectors: config.RARITY_MIN_COLLECTORS }, now);

  if (config.NODE_ENV !== 'test') {
    const log = logger();
    // Healthchecks (alle 15 s) nicht protokollieren
    app.use('*', (c, next) => (c.req.path === '/health' ? next() : log(c, next)));
  }
  // Öffentlich erreichbar: Anfragen begrenzen, bevor irgendetwas sie liest (alle Eingaben sind kleines JSON)
  app.use('*', bodyLimit({ maxSize: BODY_LIMIT, onError: (c) => c.json({ error: 'Payload Too Large', message: 'Anfrage zu groß' }, 413) }));
  app.use('*', secureHeaders());
  app.use('*', cors({
    origin: (origin) => (config.CORS_ORIGINS.includes(origin) ? origin : null),
    allowHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    maxAge: 600,
  }));

  app.get('/health', (c) => c.json({ status: 'ok' }));

  app.openapi(createRoute({
    method: 'get', path: '/api/v1/me', tags: ['Konto'], security: [{ bearer: [] }], middleware: [auth.required],
    summary: 'Angemeldete Person mit ihren Organisationen',
    responses: { 200: json(MeSchema, 'Ich'), 401: errors[401] },
  }), async (c) => {
    const user = c.get('user');
    const token = c.req.header('Authorization')!.slice(7);
    const organisations = (await Promise.all(user.organisationIds.map((id) => directory.getOrganisation(id, token))))
      .filter((o) => o !== null)
      .map((o) => ({ id: o.id, name: o.name }));
    return c.json({ sub: user.sub, name: user.name, email: user.email, isPlatformAdmin: user.isPlatformAdmin, organisations }, 200);
  });

  app.get('/api/v1/orgs/:orgId', auth.required, auth.orgMember, async (c) => {
    const org = await directory.getOrganisation(c.req.param('orgId'), c.req.header('Authorization')!.slice(7));
    return org ? c.json(org) : c.json({ error: 'Not Found', message: 'Organisation unbekannt' }, 404);
  });

  achievementRoutes(app, { achievements, auth });
  codeRoutes(app, { codes, auth });
  publicRoutes(app, { achievements, auth });
  collectionRoutes(app, { achievements, auth, directory });
  profileRoutes(app, { profiles, rarity, auth });
  adminRoutes(app, { achievements, auth });
  redemptionRoutes(app, { redemptions, rarity, auth, rateLimit: perUserRateLimit(30, 60_000) });
  integrationRoutes(app, { keys, codes, redemptions, auth, keyRateLimit: perUserRateLimit(120, 60_000, (c) => c.get('apiKey')?.id) });

  app.openAPIRegistry.registerComponent('securitySchemes', 'bearer', { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' });
  app.openAPIRegistry.registerComponent('securitySchemes', 'apiKey', { type: 'apiKey', in: 'header', name: 'X-Api-Key' });
  const docConfig = (internal: boolean) => ({
    openapi: '3.1.0' as const,
    info: internal
      ? { title: 'Best Badges API (intern)', version: '0.1.0', description: 'Vollständige Schnittstelle inklusive Verwaltung, Codes, Kombinations-Anfragen und Nachkontrolle. Nur für die eigenen Oberflächen.' }
      : { title: 'Best Badges API', version: '0.1.0', description: 'Abzeichen entdecken, einlösen und sammeln; Profile mit Showcase; Integrationen für Partner (API-Schlüssel). Anmeldung über die Goslar ID (OIDC).' },
  });
  app.get('/openapi.json', (c) => c.json(publicDocument(app.getOpenAPI31Document(docConfig(false)))));
  app.get('/docs', swaggerUI({ url: '/openapi.json' }));
  if (config.INTERNAL_DOCS ?? config.NODE_ENV !== 'production') {
    app.get('/internal/openapi.json', (c) => c.json(app.getOpenAPI31Document(docConfig(true))));
    app.get('/internal/docs', swaggerUI({ url: '/internal/openapi.json' }));
  }

  app.notFound((c) => c.json({ error: 'Not Found', message: `${c.req.method} ${c.req.path} gibt es nicht` }, 404));
  app.onError((err, c) => {
    if (err instanceof ApiError) return c.json({ error: err.code, message: err.message }, err.status);
    if (err instanceof ZodError) return c.json({ error: 'Unprocessable Entity', message: 'Ungültige Eingabe', issues: zodIssues(err) }, 422);
    console.error(err);
    return c.json({ error: 'Internal Server Error', message: config.NODE_ENV === 'development' ? err.message : 'Unerwarteter Fehler' }, 500);
  });

  return app;
}
