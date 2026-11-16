import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { AchievementService } from '../services/achievements.ts';
import { AchievementInputSchema, AchievementPatchSchema, AchievementSchema, OrgIdParams, OrgParams, errors, json } from './schemas.ts';

interface Deps {
  achievements: AchievementService;
  auth: { required: MiddlewareHandler; orgMember: MiddlewareHandler };
}

/** Verwaltung der Abzeichen einer Organisation (nur Mitglieder). */
export function achievementRoutes(app: OpenAPIHono, { achievements, auth }: Deps) {
  const mw = [auth.required, auth.orgMember];
  const base = '/api/v1/orgs/{orgId}/achievements';
  const tags = ['Abzeichen verwalten'];
  const security = [{ bearer: [] }];

  app.openapi(createRoute({ method: 'get', path: base, tags, security, middleware: mw, summary: 'Abzeichen der Organisation (inkl. Entwürfe)',
    request: { params: OrgParams },
    responses: { 200: json(z.object({ items: z.array(AchievementSchema) }), 'Liste'), ...errors } }),
  async (c) => c.json({ items: await achievements.list(c.req.valid('param').orgId) }, 200));

  app.openapi(createRoute({ method: 'post', path: base, tags, security, middleware: mw, summary: 'Abzeichen als Entwurf anlegen',
    request: { params: OrgParams, body: { content: { 'application/json': { schema: AchievementInputSchema } }, required: true } },
    responses: { 201: json(AchievementSchema, 'Angelegt'), ...errors } }),
  async (c) => c.json(await achievements.create(c.req.valid('param').orgId, c.req.valid('json'), c.get('user').sub), 201));

  app.openapi(createRoute({ method: 'get', path: `${base}/{id}`, tags, security, middleware: mw, summary: 'Ein Abzeichen',
    request: { params: OrgIdParams },
    responses: { 200: json(AchievementSchema, 'Abzeichen'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await achievements.get(p.orgId, p.id), 200); });

  app.openapi(createRoute({ method: 'patch', path: `${base}/{id}`, tags, security, middleware: mw, summary: 'Abzeichen ändern (Art und Stufen nur im Entwurf)',
    request: { params: OrgIdParams, body: { content: { 'application/json': { schema: AchievementPatchSchema } }, required: true } },
    responses: { 200: json(AchievementSchema, 'Geändert'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await achievements.update(p.orgId, p.id, c.req.valid('json'), c.get('user').sub), 200); });

  app.openapi(createRoute({ method: 'post', path: `${base}/{id}/publish`, tags, security, middleware: mw, summary: 'Entwurf veröffentlichen',
    request: { params: OrgIdParams },
    responses: { 200: json(AchievementSchema, 'Veröffentlicht'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await achievements.publish(p.orgId, p.id, c.get('user').sub), 200); });

  app.openapi(createRoute({ method: 'post', path: `${base}/{id}/archive`, tags, security, middleware: mw, summary: 'Abzeichen archivieren',
    request: { params: OrgIdParams },
    responses: { 200: json(AchievementSchema, 'Archiviert'), ...errors } }),
  async (c) => { const p = c.req.valid('param'); return c.json(await achievements.archive(p.orgId, p.id, c.get('user').sub), 200); });
}
