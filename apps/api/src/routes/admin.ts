import { OpenAPIHono, createRoute } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { AchievementService } from '../services/achievements.ts';
import { AchievementSchema, IdParams, VetoSchema, errors, json } from './schemas.ts';

/** Nachkontrolle durch die Haupt-Admin-Organisation. */
export function adminRoutes(app: OpenAPIHono, deps: { achievements: AchievementService; auth: { required: MiddlewareHandler; platformAdmin: MiddlewareHandler } }) {
  const mw = [deps.auth.required, deps.auth.platformAdmin];
  const tags = ['Nachkontrolle'];
  const security = [{ bearer: [] }];

  app.openapi(createRoute({ method: 'post', path: '/api/v1/admin/achievements/{id}/veto', tags, security, middleware: mw, summary: 'Veto: Abzeichen sofort offline nehmen',
    request: { params: IdParams, body: { content: { 'application/json': { schema: VetoSchema } }, required: true } },
    responses: { 200: json(AchievementSchema, 'Veto eingelegt'), ...errors } }),
  async (c) => c.json(await deps.achievements.veto(c.req.valid('param').id, c.req.valid('json').reason, c.get('user').sub), 200));

  app.openapi(createRoute({ method: 'delete', path: '/api/v1/admin/achievements/{id}/veto', tags, security, middleware: mw, summary: 'Veto aufheben',
    request: { params: IdParams },
    responses: { 200: json(AchievementSchema, 'Veto aufgehoben'), ...errors } }),
  async (c) => c.json(await deps.achievements.liftVeto(c.req.valid('param').id, c.get('user').sub), 200));
}
