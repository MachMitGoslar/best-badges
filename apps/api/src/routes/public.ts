import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import { renderBadgeSvg } from '@best-badges/badge-render';
import type { AchievementService } from '../services/achievements.ts';
import { SECRET_SPEC, type BadgeSpec } from '@best-badges/badge-spec';
import { IdParams, ImageQuery, PublicAchievementSchema, errors, json } from './schemas.ts';

/**
 * Öffentlich: nur veröffentlichte Abzeichen ohne Veto.
 * Versteckte erscheinen als Platzhalter; mit Anmeldung sieht man die, die man schon hat.
 */
export function publicRoutes(app: OpenAPIHono, { achievements, auth }: { achievements: AchievementService; auth: { optional: MiddlewareHandler } }) {
  const tags = ['Öffentlich'];
  const mw = [auth.optional];

  app.openapi(createRoute({ method: 'get', path: '/api/v1/achievements', tags, middleware: mw, summary: 'Veröffentlichte Abzeichen',
    request: { query: z.object({ orgId: z.string().uuid().optional() }) },
    responses: { 200: json(z.object({ items: z.array(PublicAchievementSchema) }), 'Liste') } }),
  async (c) => c.json({ items: await achievements.listPublic(c.req.valid('query').orgId, c.get('user')?.sub) }, 200));

  app.openapi(createRoute({ method: 'get', path: '/api/v1/achievements/{id}', tags, middleware: mw, summary: 'Ein veröffentlichtes Abzeichen',
    request: { params: IdParams },
    responses: { 200: json(PublicAchievementSchema, 'Abzeichen'), 404: errors[404] } }),
  async (c) => c.json(await achievements.getPublic(c.req.valid('param').id, c.get('user')?.sub), 200));

  app.openapi(createRoute({ method: 'get', path: '/api/v1/achievements/{id}/image.svg', tags, summary: 'Abzeichen als SVG-Bild',
    request: { params: IdParams, query: ImageQuery },
    responses: { 200: { content: { 'image/svg+xml': { schema: z.string() } }, description: 'SVG' }, 404: errors[404] } }),
  async (c) => {
    // Ohne Anmeldung (Bild-Tags): versteckte Abzeichen immer als Platzhalter
    const a = await achievements.getPublic(c.req.valid('param').id);
    const q = c.req.valid('query');
    if (a.secret) {
      const svg = renderBadgeSvg(SECRET_SPEC as unknown as BadgeSpec, { size: q.size ?? 256, locked: q.locked === 'true', title: 'Geheimes Abzeichen' });
      return c.body(svg, 200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
    }
    const tierCount = a.kind === 'tiered' ? a.tiers.length : undefined;
    const svg = renderBadgeSvg(a.spec, {
      tier: tierCount ? Math.min(q.tier ?? tierCount, tierCount) : undefined,
      tierCount,
      rarity: q.rarity,
      locked: q.locked === 'true',
      size: q.size ?? 256,
      title: a.name,
      // Sammel-Abzeichen mit allen Kristallen (gesperrt: leere Fassungen)
      gems: a.kind === 'collection' && a.requiredCount ? { total: a.requiredCount, filled: q.locked === 'true' ? 0 : a.requiredCount } : undefined,
    });
    const cache = a.hidden ? 'no-store' : 'public, max-age=300';
    return c.body(svg, 200, {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'Cache-Control': cache,
      // Eigenständiges SVG: keine Skripte, nur Inline-Styles und Logos per HTTPS
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src https: 'self'",
      'X-Content-Type-Options': 'nosniff',
    });
  });
}
