import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { RedemptionService } from '../services/redemptions.ts';
import type { PlaceService } from '../services/places.ts';
import type { RarityService } from '../services/rarity.ts';
import { ErrorSchema, IdParams, PublicSummarySchema, ScheduleSchema, errors, json } from './schemas.ts';
import { RedeemFailureSchema, RedeemSuccessSchema, redeemResponse } from './redemptions.ts';

const PlaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusM: z.number().int(),
  validUntil: z.string().nullable(),
  availableUntil: z.string().nullable().openapi({ description: 'Ende des Zeitfensters des Abzeichens' }),
  schedule: ScheduleSchema.nullable(),
  scheduleText: z.string().nullable().openapi({ description: 'Feste Zeiten lesbar, z. B. „Sa 07:00–13:00“' }),
  openNow: z.boolean().openapi({ description: 'Gerade innerhalb der festen Zeiten' }),
  poiId: z.string().nullable().openapi({ description: 'Ort hängt an diesem POI (siehe /api/v1/pois)' }),
  achievement: PublicSummarySchema,
  done: z.boolean().nullable().openapi({ description: 'Mit Anmeldung: hier vorerst nicht mehr möglich (Limit oder Wartezeit). Ohne Anmeldung null.' }),
}).openapi('Place');

const BBoxQuery = z.object({
  bbox: z.string().regex(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/).optional()
    .openapi({ description: 'Kartenausschnitt: minLng,minLat,maxLng,maxLat', example: '10.38,51.88,10.48,51.93' }),
});

const CheckInSchema = z.object({
  geo: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    accuracyM: z.number().min(0).max(10000).openapi({ description: 'Genauigkeit laut Gerät in Metern; über 150 m wird nicht eingecheckt' }),
    mocked: z.boolean().optional().openapi({ description: 'Gerät meldet vorgetäuschten Standort (Android)' }),
  }),
}).openapi('CheckInInput');

/** Orte: öffentliche Liste für die Karte, Check-in nur angemeldet. */
export function placeRoutes(app: OpenAPIHono, deps: {
  places: PlaceService;
  redemptions: RedemptionService;
  rarity: RarityService;
  auth: { required: MiddlewareHandler; optional: MiddlewareHandler };
  rateLimit: MiddlewareHandler;
}) {
  const tags = ['Orte'];

  app.openapi(createRoute({ method: 'get', path: '/api/v1/places', tags, middleware: [deps.auth.optional],
    summary: 'Orte zum Einchecken (mit Anmeldung inkl. eigenem Stand)',
    request: { query: BBoxQuery },
    responses: { 200: json(z.object({ items: z.array(PlaceSchema) }), 'Orte'), 422: errors[422] } }),
  async (c) => {
    const raw = c.req.valid('query').bbox;
    let bbox;
    if (raw) {
      const [minLng, minLat, maxLng, maxLat] = raw.split(',').map(Number) as [number, number, number, number];
      bbox = { minLng, minLat, maxLng, maxLat };
    }
    return c.json({ items: await deps.places.list(c.get('user')?.sub, bbox) }, 200);
  });

  app.openapi(createRoute({ method: 'post', path: '/api/v1/places/{id}/checkins', tags, security: [{ bearer: [] }],
    middleware: [deps.auth.required, deps.rateLimit],
    summary: 'An einem Ort einchecken (Standort wird geprüft, aber nicht gespeichert)',
    request: { params: IdParams, body: { content: { 'application/json': { schema: CheckInSchema } }, required: true } },
    responses: {
      200: json(RedeemSuccessSchema, 'Eingecheckt'),
      403: json(RedeemFailureSchema, 'Zu weit entfernt oder unplausibler Standort'),
      404: json(RedeemFailureSchema, 'Ort unbekannt'),
      409: json(RedeemFailureSchema, 'Limit pro Person erreicht, Wartezeit läuft, außerhalb der Zeiten oder noch nicht verfügbar'),
      410: json(RedeemFailureSchema, 'Ort abgelaufen, inaktiv, ausgeschöpft oder Abzeichen nicht verfügbar'),
      422: json(RedeemFailureSchema, 'Standort zu ungenau oder ungültige Eingabe'),
      401: errors[401], 429: json(ErrorSchema, 'Zu viele Versuche'),
    } }),
  async (c) => redeemResponse(c, await deps.redemptions.checkIn(c.get('user').sub, c.req.valid('param').id, c.req.valid('json').geo), deps.rarity));
}
