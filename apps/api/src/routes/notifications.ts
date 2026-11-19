import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { MiddlewareHandler } from 'hono';
import type { NotificationService } from '../services/notifications.ts';
import { errors, json } from './schemas.ts';

const Category = z.enum(['awards', 'requests', 'news', 'campaigns', 'reminders']);
const Link = z.string().regex(/^\/[A-Za-z0-9/_-]{0,120}$/).openapi({ description: 'Ziel in der App, z. B. /achievements/<id>' });

const NotificationSchema = z.object({
  id: z.string().uuid(), category: Category, title: z.string(), body: z.string(), link: z.string().nullable(), createdAt: z.string(), read: z.boolean(),
}).openapi('Notification');

const PrefsSchema = z.object({
  awards: z.boolean().openapi({ description: 'Neue Stufe, neues Abzeichen, Kombination geschafft' }),
  requests: z.boolean().openapi({ description: 'Sammelanfragen (für Mitglieder von Organisationen)' }),
  news: z.boolean().openapi({ description: 'Neuigkeiten der Plattform (werblich, nur mit Einwilligung)' }),
  campaigns: z.boolean().openapi({ description: 'Sonderaktionen (werblich, nur mit Einwilligung)' }),
  reminders: z.boolean().openapi({ description: '„Schau mal wieder rein“ nach 14 Tagen ohne Besuch' }),
}).openapi('NotificationPrefs');

const SettingsSchema = z.object({
  prefs: PrefsSchema,
  consentAt: z.string().nullable().openapi({ description: 'Zeitpunkt der letzten Änderung der Einwilligungen' }),
  pushDevices: z.number().int().openapi({ description: 'Geräte dieser Person mit Push' }),
  pushAvailable: z.boolean().openapi({ description: 'Ist Push auf dem Server eingerichtet?' }),
}).openapi('NotificationSettings');

const DeviceSchema = z.object({
  token: z.string().regex(/^[0-9a-f]{64,200}$/).openapi({ description: 'APNs-Geräte-Token (hex)' }),
  environment: z.enum(['development', 'production']).openapi({ description: 'APNs-Umgebung des App-Builds' }),
}).openapi('PushDeviceInput');

const BroadcastInput = z.object({
  category: z.enum(['news', 'campaigns']),
  title: z.string().trim().min(1).max(60),
  body: z.string().trim().min(1).max(180),
  link: Link.nullable().optional(),
  dryRun: z.boolean().optional().openapi({ description: 'Nur Empfänger zählen, nichts senden' }),
}).openapi('BroadcastInput');

const BroadcastSchema = z.object({
  id: z.string().uuid(), category: z.enum(['news', 'campaigns']), title: z.string(), body: z.string(), link: z.string().nullable(), recipients: z.number().int(), createdAt: z.string(),
}).openapi('Broadcast');

export function notificationRoutes(app: OpenAPIHono, { notifications, auth }: {
  notifications: NotificationService;
  auth: { required: MiddlewareHandler; platformAdmin: MiddlewareHandler };
}) {
  const tags = ['Benachrichtigungen'];
  const security = [{ bearer: [] }];
  const mw = [auth.required];

  app.openapi(createRoute({ method: 'get', path: '/api/v1/users/me/notifications', tags, security, middleware: mw, summary: 'Postfach (neueste zuerst) und Zahl der ungelesenen',
    request: { query: z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().int().min(1).max(100).optional() }) },
    responses: { 200: json(z.object({ items: z.array(NotificationSchema), unread: z.number().int() }), 'Postfach'), 401: errors[401], 422: errors[422] } }),
  async (c) => c.json(await notifications.inbox(c.get('user').sub, c.req.valid('query')), 200));

  app.openapi(createRoute({ method: 'post', path: '/api/v1/users/me/notifications/read', tags, security, middleware: mw, summary: 'Als gelesen markieren (einzelne oder alle)',
    request: { body: { content: { 'application/json': { schema: z.object({ ids: z.array(z.string().uuid()).max(100).optional(), all: z.boolean().optional() }) } }, required: true } },
    responses: { 200: json(z.object({ unread: z.number().int() }), 'Ungelesene danach'), 401: errors[401], 422: errors[422] } }),
  async (c) => c.json(await notifications.markRead(c.get('user').sub, c.req.valid('json')), 200));

  app.openapi(createRoute({ method: 'get', path: '/api/v1/users/me/notification-settings', tags, security, middleware: mw, summary: 'Einstellungen und Einwilligungen',
    responses: { 200: json(SettingsSchema, 'Einstellungen'), 401: errors[401] } }),
  async (c) => c.json(await notifications.settings(c.get('user').sub), 200));

  app.openapi(createRoute({ method: 'put', path: '/api/v1/users/me/notification-settings', tags, security, middleware: mw, summary: 'Einstellungen ändern (werbliche Kategorien = Einwilligung)',
    request: { body: { content: { 'application/json': { schema: PrefsSchema.partial() } }, required: true } },
    responses: { 200: json(SettingsSchema, 'Gespeichert'), 401: errors[401], 422: errors[422] } }),
  async (c) => c.json(await notifications.updateSettings(c.get('user').sub, c.req.valid('json')), 200));

  app.openapi(createRoute({ method: 'post', path: '/api/v1/users/me/push-devices', tags, security, middleware: mw, summary: 'Gerät für Push anmelden (nach Erlaubnis im Betriebssystem)',
    request: { body: { content: { 'application/json': { schema: DeviceSchema } }, required: true } },
    responses: { 200: json(z.object({ ok: z.literal(true) }), 'Angemeldet'), 401: errors[401], 422: errors[422] } }),
  async (c) => { const b = c.req.valid('json'); return c.json(await notifications.registerDevice(c.get('user').sub, b.token, b.environment), 200); });

  app.openapi(createRoute({ method: 'delete', path: '/api/v1/users/me/push-devices/{token}', tags, security, middleware: mw, summary: 'Gerät abmelden (z. B. beim Abmelden aus der App)',
    request: { params: z.object({ token: DeviceSchema.shape.token }) },
    responses: { 200: json(z.object({ ok: z.literal(true) }), 'Abgemeldet'), 401: errors[401], 422: errors[422] } }),
  async (c) => c.json(await notifications.unregisterDevice(c.get('user').sub, c.req.valid('param').token), 200));

  // Rundschreiben der Haupt-Admin-Organisation (intern)
  const admin = [auth.required, auth.platformAdmin];
  const atags = ['Rundschreiben'];
  app.openapi(createRoute({ method: 'post', path: '/api/v1/admin/broadcasts', tags: atags, security, middleware: admin,
    summary: 'Neuigkeit oder Sonderaktion an alle schicken, die zugestimmt haben (dryRun: nur zählen)',
    request: { body: { content: { 'application/json': { schema: BroadcastInput } }, required: true } },
    responses: { 200: json(z.object({ id: z.string().uuid().nullable(), recipients: z.number().int(), sent: z.boolean() }), 'Ergebnis'), ...errors, 429: errors[422] } }),
  async (c) => c.json(await notifications.broadcast(c.get('user').sub, c.req.valid('json')), 200));

  app.openapi(createRoute({ method: 'get', path: '/api/v1/admin/broadcasts', tags: atags, security, middleware: admin, summary: 'Verschickte Rundschreiben',
    responses: { 200: json(z.object({ items: z.array(BroadcastSchema) }), 'Liste'), ...errors } }),
  async (c) => c.json({ items: await notifications.broadcasts() }, 200));
}
