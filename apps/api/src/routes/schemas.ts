import { z } from '@hono/zod-openapi';
import { BadgeSpecSchema, RARITIES } from '@best-badges/badge-spec';

export const ErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
  issues: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
}).openapi('Error');

export const OrgParams = z.object({ orgId: z.string().uuid().openapi({ param: { name: 'orgId', in: 'path' } }) });
export const OrgIdParams = OrgParams.extend({ id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }) });
export const IdParams = z.object({ id: z.string().uuid().openapi({ param: { name: 'id', in: 'path' } }) });

const text = (max: number) => z.string().trim().max(max);

export const TierInputSchema = z.object({
  threshold: z.number().int().positive().max(100000),
  name: text(80).nullish(),
  awardedText: text(500).nullish(),
});

export const AchievementInputSchema = z.object({
  kind: z.enum(['single', 'tiered', 'collection']),
  name: text(80).min(1),
  description: text(500).optional(),
  awardedText: text(500).optional(),
  category: z.array(text(40).min(1)).max(10).optional(),
  spec: BadgeSpecSchema,
  tiers: z.array(TierInputSchema).max(10).optional(),
  hidden: z.boolean().optional().openapi({ description: 'Versteckt: öffentlich nur Platzhalter und Hinweis, bis man es hat' }),
  hint: text(140).optional().openapi({ description: 'Öffentlicher Hinweis für versteckte Abzeichen' }),
  openForCollections: z.boolean().optional().openapi({ description: 'Andere Organisationen dürfen es für ihre Kombinationen anfragen' }),
  requiredCount: z.number().int().min(1).max(20).optional().openapi({ description: 'Nur Kombination: N von M' }),
  items: z.array(z.string().uuid()).max(20).optional().openapi({ description: 'Nur Kombination: Teil-Abzeichen (2–20)' }),
}).openapi('AchievementInput');

export const AchievementPatchSchema = AchievementInputSchema.partial().openapi('AchievementPatch');

export const AchievementSchema = z.object({
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  kind: z.enum(['single', 'tiered', 'collection']),
  name: z.string(),
  description: z.string(),
  awardedText: z.string(),
  category: z.array(z.string()),
  spec: BadgeSpecSchema,
  status: z.enum(['draft', 'live', 'archived']),
  visible: z.boolean(),
  veto: z.object({ at: z.string(), reason: z.string() }).nullable(),
  tiers: z.array(z.object({ level: z.number().int(), threshold: z.number().int(), name: z.string().nullable(), awardedText: z.string().nullable() })),
  hidden: z.boolean(),
  hint: z.string(),
  openForCollections: z.boolean(),
  requiredCount: z.number().int().nullable(),
  items: z.array(z.object({
    achievementId: z.string().uuid(), orgId: z.string().uuid(), name: z.string(), kind: z.enum(['single', 'tiered', 'collection']),
    spec: BadgeSpecSchema, hidden: z.boolean(), state: z.enum(['approved', 'pending', 'rejected']),
  })),
  createdAt: z.string(),
  updatedAt: z.string(),
  publishedAt: z.string().nullable(),
}).openapi('Achievement', { description: 'Abzeichen in der Verwaltung (nur für Mitglieder der Organisation)' });

const kindEnum = z.enum(['single', 'tiered', 'collection']);

export const SecretRefSchema = z.object({
  secret: z.literal(true),
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  hint: z.string().openapi({ description: 'Öffentlicher Hinweis der Organisation (kann leer sein)' }),
}).openapi('SecretAchievement', {
  description: 'Verstecktes Abzeichen, das die Person noch nicht hat. Ohne Name, Design und Struktur; den Platzhalter zeichnet der Client selbst (badge-spec: SECRET_SPEC).',
});

export const PublicSummaryFullSchema = z.object({
  secret: z.literal(false),
  id: z.string().uuid(),
  orgId: z.string().uuid(),
  name: z.string(),
  kind: kindEnum,
  spec: BadgeSpecSchema,
  hidden: z.boolean().openapi({ description: 'War versteckt – die Person hat es gefunden' }),
}).openapi('AchievementSummary');

export const PublicSummarySchema = z.union([PublicSummaryFullSchema, SecretRefSchema]).openapi('AchievementRef');

export const PublicAchievementFullSchema = PublicSummaryFullSchema.extend({
  description: z.string(),
  category: z.array(z.string()),
  tiers: z.array(z.object({ level: z.number().int(), threshold: z.number().int(), name: z.string().nullable() })),
  requiredCount: z.number().int().nullable().openapi({ description: 'Nur Kombination: benötigte Teile (N von M)' }),
  items: z.array(PublicSummarySchema).openapi({ description: 'Nur Kombination: die Teile' }),
  publishedAt: z.string().nullable(),
}).openapi('PublicAchievementDetails');

export const PublicAchievementSchema = z.union([PublicAchievementFullSchema, SecretRefSchema]).openapi('PublicAchievement');

export const CollectionUnlockSchema = z.object({
  achievement: PublicSummarySchema,
  progress: z.number().int(),
  requiredCount: z.number().int(),
  completed: z.boolean(),
  firstTime: z.boolean(),
}).openapi('CollectionUnlock');

export const VetoSchema = z.object({ reason: text(500).min(3) }).openapi('VetoInput');

export const ImageQuery = z.object({
  tier: z.coerce.number().int().min(1).max(20).optional(),
  rarity: z.enum(Object.keys(RARITIES) as [keyof typeof RARITIES, ...(keyof typeof RARITIES)[]]).optional(),
  locked: z.enum(['true', 'false']).optional(),
  size: z.coerce.number().int().min(32).max(1024).optional(),
});

const GeoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(10).max(5000),
});

export const CodeInputSchema = z.object({
  achievementId: z.string().uuid(),
  template: z.enum(['station', 'event', 'checkout', 'voucher']),
  label: text(120).optional(),
  perUserLimit: z.number().int().positive().max(10000).nullish(),
  perUserCooldownSeconds: z.number().int().positive().max(366 * 24 * 3600).nullish(),
  value: z.number().int().min(1).max(1000).optional(),
  maxTotal: z.number().int().positive().max(1_000_000).nullish(),
  validFrom: z.string().datetime({ offset: true }).nullish(),
  validUntil: z.string().datetime({ offset: true }).nullish(),
  geo: GeoSchema.nullish(),
  count: z.number().int().min(1).max(500).optional(),
}).openapi('CodeInput');

export const CodePatchSchema = z.object({
  label: text(120).optional(),
  active: z.boolean().optional(),
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  maxTotal: z.number().int().positive().max(1_000_000).nullable().optional(),
}).openapi('CodePatch');

export const CodeSchema = z.object({
  id: z.string().uuid(),
  achievementId: z.string().uuid(),
  template: z.enum(['station', 'event', 'checkout', 'voucher']),
  label: z.string(),
  url: z.string().nullable(),
  perUserLimit: z.number().int().nullable(),
  perUserCooldownSeconds: z.number().int().nullable(),
  value: z.number().int(),
  maxTotal: z.number().int().nullable(),
  uses: z.number().int(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  active: z.boolean(),
  geo: GeoSchema.nullable(),
  batchId: z.string().uuid().nullable(),
  createdAt: z.string(),
}).openapi('Code');

export const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { 'application/json': { schema } },
  description,
});

export const errors = {
  401: json(ErrorSchema, 'Nicht angemeldet'),
  403: json(ErrorSchema, 'Keine Berechtigung'),
  404: json(ErrorSchema, 'Nicht gefunden'),
  409: json(ErrorSchema, 'Konflikt mit dem aktuellen Zustand'),
  422: json(ErrorSchema, 'Ungültige Eingabe'),
} as const;
