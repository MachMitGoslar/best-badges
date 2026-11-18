import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { ProfileService } from '../services/profiles.ts';
import { MAX_SHOWCASE } from '../services/profiles.ts';
import { PublicSummarySchema, RarityField, errors, json } from './schemas.ts';
import type { RarityService } from '../services/rarity.ts';

const MyProfileSchema = z.object({
  handle: z.string().nullable(),
  displayName: z.string().nullable(),
  public: z.boolean(),
  showcase: z.array(z.string().uuid()),
  url: z.string().nullable().openapi({ description: 'Öffentliche Adresse, nur wenn das Profil öffentlich ist' }),
}).openapi('MyProfile');

const ProfileInputSchema = z.object({
  handle: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,28})[a-z0-9]$/, '3–30 Zeichen: Kleinbuchstaben, Ziffern, Bindestrich').nullable().optional(),
  displayName: z.string().trim().max(40).nullable().optional(),
  public: z.boolean().optional(),
  showcase: z.array(z.string().uuid()).max(MAX_SHOWCASE).optional(),
}).openapi('ProfileInput');

const PublicProfileSchema = z.object({
  handle: z.string(),
  displayName: z.string().nullable(),
  stats: z.object({ badges: z.number().int(), tiers: z.number().int() }),
  showcase: z.array(z.object({
    achievement: PublicSummarySchema,
    tier: z.number().int(), tierCount: z.number().int(), progress: z.number().int(), requiredCount: z.number().int().nullable(),
    rarity: RarityField,
  })),
}).openapi('PublicProfile');

export function profileRoutes(app: OpenAPIHono, { profiles, rarity, auth }: {
  profiles: ProfileService;
  rarity: RarityService;
  auth: { required: MiddlewareHandler; optional: MiddlewareHandler };
}) {
  const security = [{ bearer: [] }];

  app.openapi(createRoute({ method: 'get', path: '/api/v1/users/me/profile', tags: ['Profil'], security, middleware: [auth.required],
    summary: 'Eigenes Profil und Showcase (privat, bis du es öffentlich schaltest)',
    responses: { 200: json(MyProfileSchema, 'Profil'), 401: errors[401] } }),
  async (c) => c.json(await profiles.mine(c.get('user').sub), 200));

  app.openapi(createRoute({ method: 'put', path: '/api/v1/users/me/profile', tags: ['Profil'], security, middleware: [auth.required],
    summary: 'Profil ändern: Kürzel, Anzeigename, öffentlich, Showcase (bis zu 6 gesammelte Abzeichen)',
    request: { body: { content: { 'application/json': { schema: ProfileInputSchema } }, required: true } },
    responses: { 200: json(MyProfileSchema, 'Gespeichert'), 401: errors[401], 409: errors[409], 422: errors[422] } }),
  async (c) => c.json(await profiles.update(c.get('user').sub, c.req.valid('json')), 200));

  app.openapi(createRoute({ method: 'get', path: '/api/v1/profiles/{handle}', tags: ['Profil'], middleware: [auth.optional],
    summary: 'Öffentliches Profil mit Showcase',
    request: { params: z.object({ handle: z.string().min(3).max(30).openapi({ param: { name: 'handle', in: 'path' } }) }) },
    responses: { 200: json(PublicProfileSchema, 'Profil'), 404: errors[404] } }),
  async (c) => {
    const p = await profiles.publicProfile(c.req.valid('param').handle, c.get('user')?.sub);
    // Platzhalter (verstecktes Abzeichen, das die betrachtende Person nicht hat) bekommen keine Seltenheit
    const r = await rarity.forAwards(p.showcase.map((s) => ({ achievementId: s.achievement.id, orgId: s.achievement.orgId, tier: s.achievement.secret ? 0 : s.tier })));
    return c.json({ ...p, showcase: p.showcase.map((s, n) => ({ ...s, rarity: r[n] ?? null })) }, 200);
  });
}
