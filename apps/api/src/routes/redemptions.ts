import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { Context } from 'hono';
import type { RedemptionService, FailureStatus, RedeemResult } from '../services/redemptions.ts';
import { CodeTemplateSchema, CollectionUnlockSchema, ErrorSchema, PublicSummarySchema, RarityField, errors, json } from './schemas.ts';
import type { RarityService } from '../services/rarity.ts';


const RedeemInputSchema = z.object({
  code: z.string().min(1).max(2048).openapi({ description: 'Gescannter QR-Inhalt (Link) oder das Token' }),
  geo: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), accuracyM: z.number().min(0).max(10000).optional() }).nullish(),
}).openapi('RedeemInput');

export const BonusUnlockSchema = z.object({
  achievement: PublicSummarySchema,
  progress: z.number().int(),
  tier: z.number().int(),
  tierCount: z.number().int(),
  tierUp: z.boolean(),
  firstTime: z.boolean(),
  awardedText: z.string(),
}).openapi('BonusUnlock', { description: 'Plattform-Abzeichen, das automatisch dazukam oder aufstieg' });

export const RedeemSuccessSchema = z.object({
  status: z.literal('success'),
  achievement: PublicSummarySchema,
  value: z.number().int(),
  progress: z.number().int(),
  previousTier: z.number().int(),
  tier: z.number().int(),
  tierCount: z.number().int(),
  tierUp: z.boolean(),
  firstTime: z.boolean(),
  nextThreshold: z.number().int().nullable(),
  awardedText: z.string(),
  collections: z.array(CollectionUnlockSchema).openapi({ description: 'Kombinationen, die durch diese Einlösung vorankommen' }),
  bonus: z.array(BonusUnlockSchema).openapi({ description: 'Plattform-Abzeichen, die dadurch dazukamen oder aufstiegen' }),
  rarity: RarityField,
}).openapi('RedeemSuccess');

export const RedeemFailureSchema = ErrorSchema.extend({ retryAfterSeconds: z.number().int().optional() }).openapi('RedeemFailure');

const PreviewSchema = z.object({
  status: z.string(),
  message: z.string().nullable(),
  achievement: PublicSummarySchema.nullable(),
  template: CodeTemplateSchema.nullable(),
  value: z.number().int().nullable(),
  award: z.object({ progress: z.number().int(), tier: z.number().int() }).nullable(),
}).openapi('RedeemPreview');

const AwardSchema = z.object({
  achievement: PublicSummarySchema,
  progress: z.number().int(),
  tier: z.number().int(),
  tierCount: z.number().int(),
  nextThreshold: z.number().int().nullable(),
  requiredCount: z.number().int().nullable().openapi({ description: 'Nur Kombination: benötigte Teile' }),
  rarity: RarityField,
  firstEarnedAt: z.string().nullable(),
  updatedAt: z.string(),
}).openapi('Award');

/** HTTP-Status je Fehlerart. Unbekannte Codes sind 404, um nichts über vorhandene Tokens zu verraten. */
const STATUS: Record<FailureStatus, 403 | 404 | 409 | 410 | 422> = {
  invalid: 404, inactive: 410, expired: 410, exhausted: 410, unavailable: 410,
  limit_reached: 409, cooldown: 409, out_of_range: 403, implausible: 403, inaccurate: 422,
};

/** Antwort auf Einlösen und Check-in: Erfolg mit Seltenheit, sonst Fehler mit passendem HTTP-Status. */
export async function redeemResponse(c: Context, result: RedeemResult, rarity: RarityService) {
  if (result.status === 'success') {
    // Neue Vergabe: Zahlen der Organisation neu laden, damit die eigene Vergabe mitzählt
    rarity.invalidate(result.achievement.orgId);
    const [r] = await rarity.forAwards([{ achievementId: result.achievement.id, orgId: result.achievement.orgId, tier: result.achievement.secret ? 0 : result.tier }]);
    return c.json({ ...result, rarity: r ?? null }, 200);
  }
  if (result.retryAfterSeconds) c.header('Retry-After', String(result.retryAfterSeconds));
  return c.json({ error: result.status, message: result.message, ...(result.retryAfterSeconds ? { retryAfterSeconds: result.retryAfterSeconds } : {}) }, STATUS[result.status]);
}

export function redemptionRoutes(app: OpenAPIHono, deps: {
  redemptions: RedemptionService;
  rarity: RarityService;
  auth: { required: MiddlewareHandler; optional: MiddlewareHandler };
  rateLimit: MiddlewareHandler;
}) {
  const tags = ['Einlösen'];
  const security = [{ bearer: [] }];

  app.openapi(createRoute({ method: 'post', path: '/api/v1/redemptions', tags, security, middleware: [deps.auth.required, deps.rateLimit],
    summary: 'Gescannten Code einlösen',
    request: { body: { content: { 'application/json': { schema: RedeemInputSchema } }, required: true } },
    responses: {
      200: json(RedeemSuccessSchema, 'Eingelöst'),
      403: json(RedeemFailureSchema, 'Außerhalb des erlaubten Ortes'),
      404: json(RedeemFailureSchema, 'Code unbekannt'),
      409: json(RedeemFailureSchema, 'Limit pro Person erreicht oder Wartezeit läuft'),
      410: json(RedeemFailureSchema, 'Code abgelaufen, inaktiv, ausgeschöpft oder Abzeichen nicht verfügbar'),
      401: errors[401], 422: errors[422], 429: json(ErrorSchema, 'Zu viele Versuche'),
    } }),
  async (c) => redeemResponse(c, await deps.redemptions.redeem(c.get('user').sub, c.req.valid('json')), deps.rarity));

  app.openapi(createRoute({ method: 'get', path: '/api/v1/redemptions/preview', tags, middleware: [deps.auth.optional],
    summary: 'Vorschau eines gescannten Codes (verbraucht nichts; mit Anmeldung inkl. eigenem Fortschritt)',
    request: { query: z.object({ code: z.string().min(1).max(2048) }) },
    responses: { 200: json(PreviewSchema, 'Vorschau') } }),
  async (c) => c.json(await deps.redemptions.preview(c.req.valid('query').code, c.get('user')?.sub), 200));

  app.openapi(createRoute({ method: 'post', path: '/api/v1/users/me/activity', tags: ['Sammlung'], security, middleware: [deps.auth.required],
    summary: 'App geöffnet: Tag vermerken (nur das Datum) und Plattform-Abzeichen prüfen – einmal pro Tag wirksam',
    responses: { 200: json(z.object({ bonus: z.array(BonusUnlockSchema) }), 'Vermerkt'), 401: errors[401] } }),
  async (c) => c.json(await deps.redemptions.recordActivity(c.get('user').sub), 200));

  app.openapi(createRoute({ method: 'get', path: '/api/v1/users/me/awards', tags: ['Sammlung'], security, middleware: [deps.auth.required],
    summary: 'Eigene Sammlung mit Fortschritt',
    responses: { 200: json(z.object({ items: z.array(AwardSchema) }), 'Sammlung'), 401: errors[401] } }),
  async (c) => {
    const items = await deps.redemptions.awardsFor(c.get('user').sub);
    const rarity = await deps.rarity.forAwards(items.map((i) => ({ achievementId: i.achievement.id, orgId: i.achievement.orgId, tier: i.achievement.secret ? 0 : i.tier })));
    return c.json({ items: items.map((i, n) => ({ ...i, rarity: rarity[n] ?? null })) }, 200);
  });
}
