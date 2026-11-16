import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { BadgeSpecSchema } from '@best-badges/badge-spec';
import type { AchievementService } from '../services/achievements.ts';
import type { OrgDirectory } from '../orgDirectory.ts';
import { OrgParams, errors, json } from './schemas.ts';

const RequestSchema = z.object({
  collection: z.object({
    id: z.string().uuid(), orgId: z.string().uuid(), orgName: z.string().nullable(), name: z.string(), spec: BadgeSpecSchema,
    status: z.enum(['draft', 'live', 'archived']), hidden: z.boolean(), requiredCount: z.number().int(), itemCount: z.number().int(),
  }),
  achievement: z.object({ id: z.string().uuid(), name: z.string(), spec: BadgeSpecSchema }),
  state: z.enum(['approved', 'pending', 'rejected']),
}).openapi('CollectionRequest');

const CandidateSchema = z.object({
  id: z.string().uuid(), orgId: z.string().uuid(), own: z.boolean(), draft: z.boolean(),
  secret: z.boolean().openapi({ description: 'Verstecktes Abzeichen einer anderen Organisation: ohne Name und Design' }),
  name: z.string().nullable(), kind: z.enum(['single', 'tiered', 'collection']), spec: BadgeSpecSchema.nullable(), hint: z.string().nullable(),
}).openapi('CollectionCandidate');

const DecideParams = OrgParams.extend({
  collectionId: z.string().uuid().openapi({ param: { name: 'collectionId', in: 'path' } }),
  achievementId: z.string().uuid().openapi({ param: { name: 'achievementId', in: 'path' } }),
  decision: z.enum(['approve', 'reject']).openapi({ param: { name: 'decision', in: 'path' } }),
});

/** Kombinationen über Organisationsgrenzen: Org A schlägt vor, die Organisationen der Teile stimmen zu. */
export function collectionRoutes(app: OpenAPIHono, { achievements, auth, directory }: {
  achievements: AchievementService;
  directory: OrgDirectory;
  auth: { required: MiddlewareHandler; orgMember: MiddlewareHandler };
}) {
  const mw = [auth.required, auth.orgMember];
  const tags = ['Kombinationen'];
  const security = [{ bearer: [] }];
  const base = '/api/v1/orgs/{orgId}/collection-requests';

  app.openapi(createRoute({ method: 'get', path: base, tags, security, middleware: mw,
    summary: 'Anfragen anderer Organisationen, eigene Abzeichen in ihre Kombination aufzunehmen',
    request: { params: OrgParams },
    responses: { 200: json(z.object({ items: z.array(RequestSchema) }), 'Anfragen'), ...errors } }),
  async (c) => {
    const items = await achievements.collectionRequests(c.req.valid('param').orgId);
    // Namen der anfragenden Organisationen aus dem HSP (zwischengespeichert)
    const token = c.req.header('Authorization')!.slice(7);
    const names = new Map(await Promise.all([...new Set(items.map((i) => i.collection.orgId))].map(async (id) =>
      [id, (await directory.getOrganisation(id, token).catch(() => null))?.name ?? null] as const)));
    return c.json({ items: items.map((i) => ({ ...i, collection: { ...i.collection, orgName: names.get(i.collection.orgId) ?? null } })) }, 200);
  });

  app.openapi(createRoute({ method: 'get', path: '/api/v1/orgs/{orgId}/collection-candidates', tags, security, middleware: mw,
    summary: 'Mögliche Teile für eine Kombination: eigene und von anderen Organisationen freigegebene',
    request: { params: OrgParams },
    responses: { 200: json(z.object({ items: z.array(CandidateSchema) }), 'Kandidaten'), ...errors } }),
  async (c) => c.json({ items: await achievements.collectionCandidates(c.req.valid('param').orgId) }, 200));

  app.openapi(createRoute({ method: 'post', path: `${base}/{collectionId}/items/{achievementId}/{decision}`, tags, security, middleware: mw,
    summary: 'Einer Anfrage zustimmen oder sie ablehnen',
    request: { params: DecideParams },
    responses: { 204: { description: 'Entschieden' }, ...errors } }),
  async (c) => {
    const p = c.req.valid('param');
    await achievements.decideItem(p.orgId, p.collectionId, p.achievementId, p.decision, c.get('user').sub);
    return c.body(null, 204);
  });
}
