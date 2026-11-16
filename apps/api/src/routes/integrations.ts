import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { apiKeyAuth } from '../auth.ts';
import type { ApiKeyService } from '../services/apiKeys.ts';
import type { CodeService } from '../services/codes.ts';
import type { RedemptionService } from '../services/redemptions.ts';
import { PublicSummaryFullSchema, CollectionUnlockSchema, ErrorSchema, IdParams, OrgIdParams, OrgParams, errors, json } from './schemas.ts';

const ScopeSchema = z.enum(['awards:create', 'codes:mint']);

const ApiKeySchema = z.object({
  id: z.string().uuid(), name: z.string(), hint: z.string(), scopes: z.array(ScopeSchema),
  expiresAt: z.string(), revokedAt: z.string().nullable(), lastUsedAt: z.string().nullable(), createdAt: z.string(), active: z.boolean(),
}).openapi('ApiKey');

const ApiKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  scopes: z.array(ScopeSchema).min(1).max(2),
  expiresInDays: z.number().int().min(1).max(365).optional(),
}).openapi('ApiKeyInput');

const DirectAwardSchema = z.object({
  achievementId: z.string().uuid(),
  userSub: z.string().trim().min(1).max(200).openapi({ description: 'Kennung der Person bei der Goslar ID (sub)' }),
  value: z.number().int().min(1).max(1000).optional(),
  reference: z.string().trim().min(1).max(120).optional().openapi({ description: 'Eigene Kennung des Vorgangs, z. B. Bonnummer. Macht die Vergabe idempotent.' }),
}).openapi('DirectAwardInput');

const DirectAwardResultSchema = z.object({
  status: z.literal('success'),
  achievement: PublicSummaryFullSchema,
  value: z.number().int(), progress: z.number().int(), previousTier: z.number().int(), tier: z.number().int(), tierCount: z.number().int(),
  tierUp: z.boolean(), firstTime: z.boolean(), nextThreshold: z.number().int().nullable(), awardedText: z.string(), collections: z.array(CollectionUnlockSchema), replayed: z.boolean(),
}).openapi('DirectAwardResult');

export function integrationRoutes(app: OpenAPIHono, deps: {
  keys: ApiKeyService;
  codes: CodeService;
  redemptions: RedemptionService;
  auth: { required: MiddlewareHandler; orgMember: MiddlewareHandler };
  keyRateLimit: MiddlewareHandler;
}) {
  const { keys, codes, redemptions, auth } = deps;

  // Verwaltung der Schlüssel (Mitglieder der Organisation)
  const mw = [auth.required, auth.orgMember];
  const base = '/api/v1/orgs/{orgId}/api-keys';
  const tags = ['API-Schlüssel'];
  const security = [{ bearer: [] }];

  app.openapi(createRoute({ method: 'get', path: base, tags, security, middleware: mw, summary: 'API-Schlüssel der Organisation',
    request: { params: OrgParams },
    responses: { 200: json(z.object({ items: z.array(ApiKeySchema) }), 'Liste'), ...errors } }),
  async (c) => c.json({ items: await keys.list(c.req.valid('param').orgId) }, 200));

  app.openapi(createRoute({ method: 'post', path: base, tags, security, middleware: mw, summary: 'API-Schlüssel anlegen (Klartext wird nur einmal angezeigt)',
    request: { params: OrgParams, body: { content: { 'application/json': { schema: ApiKeyInputSchema } }, required: true } },
    responses: { 201: json(z.object({ key: ApiKeySchema, secret: z.string() }), 'Angelegt'), ...errors } }),
  async (c) => c.json(await keys.create(c.req.valid('param').orgId, c.req.valid('json'), c.get('user').sub), 201));

  app.openapi(createRoute({ method: 'delete', path: `${base}/{id}`, tags, security, middleware: mw, summary: 'API-Schlüssel widerrufen',
    request: { params: OrgIdParams },
    responses: { 200: json(ApiKeySchema, 'Widerrufen'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await keys.revoke(p.orgId, p.id, c.get('user').sub), 200); });

  // Maschinen-Endpunkte (API-Schlüssel im Header X-Api-Key)
  const itags = ['Integrationen'];
  const keySecurity = [{ apiKey: [] }];
  const keyErrors = { 401: json(ErrorSchema, 'Schlüssel fehlt oder ungültig'), 403: json(ErrorSchema, 'Recht fehlt'), 404: errors[404], 409: errors[409], 410: json(ErrorSchema, 'Nicht verfügbar'), 422: errors[422], 429: json(ErrorSchema, 'Zu viele Anfragen') };

  app.openapi(createRoute({ method: 'post', path: '/api/v1/integrations/awards', tags: itags, security: keySecurity,
    middleware: [apiKeyAuth(keys, 'awards:create'), deps.keyRateLimit],
    summary: 'Abzeichen direkt an eine Person vergeben (mit reference idempotent)',
    request: { body: { content: { 'application/json': { schema: DirectAwardSchema } }, required: true } },
    responses: { 200: json(DirectAwardResultSchema, 'Vergeben oder Wiederholung'), ...keyErrors } }),
  async (c) => c.json(await redemptions.directAward(c.get('apiKey'), c.req.valid('json')), 200));

  app.openapi(createRoute({ method: 'post', path: '/api/v1/integrations/codes/{id}/mint', tags: itags, security: keySecurity,
    middleware: [apiKeyAuth(keys, 'codes:mint'), deps.keyRateLimit],
    summary: 'Kassensystem: einmaligen QR-Code mit Wert erzeugen (z. B. für den Bon)',
    request: { params: IdParams, body: { content: { 'application/json': { schema: z.object({ value: z.number().int().min(1).max(100) }) } }, required: true } },
    responses: { 201: json(z.object({ url: z.string(), value: z.number().int(), expiresAt: z.string() }), 'Einmal-Code'), ...keyErrors } }),
  async (c) => {
    const key = c.get('apiKey');
    return c.json(await codes.mintCheckout(key.orgId, c.req.valid('param').id, c.req.valid('json').value, `apikey:${key.id}`), 201);
  });
}
