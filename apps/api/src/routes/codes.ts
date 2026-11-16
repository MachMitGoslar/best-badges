import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { CodeService } from '../services/codes.ts';
import { CodeInputSchema, CodePatchSchema, CodeSchema, OrgIdParams, OrgParams, errors, json } from './schemas.ts';

interface Deps {
  codes: CodeService;
  auth: { required: MiddlewareHandler; orgMember: MiddlewareHandler };
}

/** Codes zum Einlösen (nur Mitglieder der Organisation). */
export function codeRoutes(app: OpenAPIHono, { codes, auth }: Deps) {
  const mw = [auth.required, auth.orgMember];
  const base = '/api/v1/orgs/{orgId}/codes';
  const tags = ['Codes'];
  const security = [{ bearer: [] }];

  app.openapi(createRoute({ method: 'get', path: base, tags, security, middleware: mw, summary: 'Codes der Organisation',
    request: { params: OrgParams, query: z.object({ achievementId: z.string().uuid().optional() }) },
    responses: { 200: json(z.object({ items: z.array(CodeSchema) }), 'Liste'), ...errors } }),
  async (c) => c.json({ items: await codes.list(c.req.valid('param').orgId, c.req.valid('query').achievementId) }, 200));

  app.openapi(createRoute({ method: 'post', path: base, tags, security, middleware: mw,
    summary: 'Code anlegen (Vorlage station, event, checkout oder voucher; Gutscheine mit count als Stapel)',
    request: { params: OrgParams, body: { content: { 'application/json': { schema: CodeInputSchema } }, required: true } },
    responses: { 201: json(z.object({ items: z.array(CodeSchema) }), 'Angelegt'), ...errors } }),
  async (c) => c.json({ items: await codes.create(c.req.valid('param').orgId, c.req.valid('json'), c.get('user').sub) }, 201));

  app.openapi(createRoute({ method: 'get', path: `${base}/{id}`, tags, security, middleware: mw, summary: 'Ein Code',
    request: { params: OrgIdParams },
    responses: { 200: json(CodeSchema, 'Code'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await codes.get(p.orgId, p.id), 200); });

  app.openapi(createRoute({ method: 'patch', path: `${base}/{id}`, tags, security, middleware: mw, summary: 'Code ändern (Bezeichnung, aktiv, gültig bis, Gesamtlimit)',
    request: { params: OrgIdParams, body: { content: { 'application/json': { schema: CodePatchSchema } }, required: true } },
    responses: { 200: json(CodeSchema, 'Geändert'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await codes.update(p.orgId, p.id, c.req.valid('json'), c.get('user').sub), 200); });

  app.openapi(createRoute({ method: 'post', path: `${base}/{id}/rotate`, tags, security, middleware: mw, summary: 'Neuen Code erzeugen; der alte wird sofort ungültig',
    request: { params: OrgIdParams },
    responses: { 200: json(CodeSchema, 'Neu erzeugt'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await codes.rotate(p.orgId, p.id, c.get('user').sub), 200); });

  app.openapi(createRoute({ method: 'get', path: `${base}/{id}/current`, tags, security, middleware: mw,
    summary: 'Ausgabe-Modus: aktueller Link eines rotierenden Veranstaltungs-Codes',
    request: { params: OrgIdParams },
    responses: { 200: json(z.object({ url: z.string(), expiresInSeconds: z.number().int(), active: z.boolean() }), 'Aktueller Link'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await codes.currentEvent(p.orgId, p.id), 200); });

  app.openapi(createRoute({ method: 'post', path: `${base}/{id}/mint`, tags, security, middleware: mw,
    summary: 'Kasse: einmaligen Code mit Wert erzeugen (10 Minuten gültig)',
    request: { params: OrgIdParams, body: { content: { 'application/json': { schema: z.object({ value: z.number().int().min(1).max(100) }) } }, required: true } },
    responses: { 201: json(z.object({ url: z.string(), value: z.number().int(), expiresAt: z.string() }), 'Einmal-Code'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await codes.mintCheckout(p.orgId, p.id, c.req.valid('json').value, c.get('user').sub), 201); });
}
