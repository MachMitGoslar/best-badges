import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { PoiService } from '../services/pois.ts';
import { OrgParams, PoiRefSchema, PublicSummarySchema, ScheduleSchema, errors, json } from './schemas.ts';

const PoiSchema = PoiRefSchema.extend({
  category: z.string().nullable(),
  openingHours: ScheduleSchema.nullable().openapi({ description: 'Öffnungszeiten aus dem HSP im Format der festen Zeiten' }),
  openingHoursText: z.string().nullable(),
  removed: z.boolean(),
}).openapi('Poi');

const PublicPoiSchema = PoiRefSchema.extend({
  category: z.string().nullable(),
  openingHoursText: z.string().nullable(),
  achievements: z.array(PublicSummarySchema),
}).openapi('PublicPoi');

/** POI aus dem HSP: für Mitglieder der Organisation (Verwaltung) und öffentlich mit ihren Abzeichen (Karte). */
export function poiRoutes(app: OpenAPIHono, deps: {
  pois: PoiService;
  auth: { required: MiddlewareHandler; optional: MiddlewareHandler; orgMember: MiddlewareHandler };
}) {
  app.openapi(createRoute({ method: 'get', path: '/api/v1/orgs/{orgId}/pois', tags: ['Codes'], security: [{ bearer: [] }],
    middleware: [deps.auth.required, deps.auth.orgMember],
    summary: 'POI der Organisation aus dem HSP (frisch abgerufen; fällt das HSP aus, der letzte Stand)',
    request: { params: OrgParams },
    responses: { 200: json(z.object({ items: z.array(PoiSchema) }), 'POI'), ...errors } }),
  async (c) => {
    const token = c.req.header('Authorization')!.slice(7);
    return c.json({ items: await deps.pois.refresh(c.req.valid('param').orgId, token) }, 200);
  });

  app.openapi(createRoute({ method: 'get', path: '/api/v1/pois', tags: ['Orte'], middleware: [deps.auth.optional],
    summary: 'POI mit gerade verfügbaren Abzeichen (für die Karte)',
    responses: { 200: json(z.object({ items: z.array(PublicPoiSchema) }), 'POI') } }),
  async (c) => c.json({ items: await deps.pois.publicList(c.get('user')?.sub) }, 200));
}
