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

export const PoiRefSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
}).openapi('PoiRef', { description: 'POI aus dem HSP (Geschäft, Filiale, Ort einer Organisation)' });

export const AutoRuleSchema = z.enum(['active_days', 'awards_count', 'orgs_count', 'places_count', 'collections_count']).openapi('AutoRule', {
  description: 'active_days: Tage mit geöffneter App · awards_count: gesammelte Abzeichen · orgs_count: verschiedene Organisationen · places_count: besuchte Orte · collections_count: geschaffte Kombinationen',
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
  availableFrom: z.string().datetime({ offset: true }).nullish().openapi({ description: 'Zeitfenster: erst ab dann zu verdienen' }),
  availableUntil: z.string().datetime({ offset: true }).nullish().openapi({ description: 'Zeitfenster: nur bis dann zu verdienen (Limited Edition)' }),
  poiId: z.string().min(1).max(100).nullish().openapi({ description: 'Gehört diesem POI der Organisation; leer = der ganzen Organisation' }),
  autoRule: AutoRuleSchema.nullish().openapi({ description: 'Plattform-Abzeichen (nur Haupt-Admin-Organisation): automatische Vergabe. Fortschritt = Wert der Kennzahl.' }),
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
  autoRule: AutoRuleSchema.nullable(),
  availableFrom: z.string().nullable(),
  availableUntil: z.string().nullable(),
  poi: PoiRefSchema.nullable(),
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
  availableFrom: z.string().nullable().openapi({ description: 'Zeitfenster: erst ab dann zu verdienen' }),
  availableUntil: z.string().nullable().openapi({ description: 'Zeitfenster: nur bis dann zu verdienen' }),
  poi: PoiRefSchema.nullable().openapi({ description: 'Gehört diesem POI (Geschäft, Filiale); null = der ganzen Organisation' }),
}).openapi('PublicAchievementDetails');

export const PublicAchievementSchema = z.union([PublicAchievementFullSchema, SecretRefSchema]).openapi('PublicAchievement');

export const CollectionUnlockSchema = z.object({
  achievement: PublicSummarySchema,
  progress: z.number().int(),
  requiredCount: z.number().int(),
  completed: z.boolean(),
  firstTime: z.boolean(),
}).openapi('CollectionUnlock');

const RARITY_IDS = Object.keys(RARITIES) as [keyof typeof RARITIES, ...(keyof typeof RARITIES)[]];
/** Seltenheit der erreichten Stufe; null ohne Stufe oder bei versteckten Abzeichen (Platzhalter) */
export const RarityField = z.enum(RARITY_IDS).nullable().openapi({
  description: 'Seltenheit der erreichten Stufe aus dem Anteil der Sammelnden der Organisation (common, rare, epic, legendary); null ohne Stufe oder bei Platzhaltern',
});

export const VetoSchema = z.object({ reason: text(500).min(3) }).openapi('VetoInput');

export const ImageQuery = z.object({
  tier: z.coerce.number().int().min(1).max(20).optional(),
  rarity: z.enum(RARITY_IDS).optional(),
  locked: z.enum(['true', 'false']).optional(),
  size: z.coerce.number().int().min(32).max(1024).optional(),
});

const GeoSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radiusM: z.number().int().min(10).max(5000),
});

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Uhrzeit im Format HH:MM');
export const ScheduleSchema = z.array(z.object({
  days: z.array(z.number().int().min(1).max(7)).min(1).max(7).openapi({ description: 'ISO-Wochentage, 1 = Montag' }),
  from: hhmm,
  to: hhmm.openapi({ description: 'Vor „from“ = über Mitternacht' }),
})).max(14).openapi('Schedule', { description: 'Feste Zeiten in Goslarer Ortszeit (Europe/Berlin)' });

export const CodeTemplateSchema = z.enum(['station', 'event', 'checkout', 'voucher', 'place']);

export const CodeInputSchema = z.object({
  achievementId: z.string().uuid(),
  template: CodeTemplateSchema,
  label: text(120).optional(),
  perUserLimit: z.number().int().positive().max(10000).nullish(),
  perUserCooldownSeconds: z.number().int().positive().max(366 * 24 * 3600).nullish(),
  value: z.number().int().min(1).max(1000).optional(),
  maxTotal: z.number().int().positive().max(1_000_000).nullish(),
  validFrom: z.string().datetime({ offset: true }).nullish(),
  validUntil: z.string().datetime({ offset: true }).nullish(),
  geo: GeoSchema.nullish(),
  placeName: text(80).nullish().openapi({ description: 'Nur Vorlage place: öffentlicher Name des Ortes auf der Karte' }),
  schedule: ScheduleSchema.nullish(),
  poiId: z.string().min(1).max(100).nullish().openapi({ description: 'Hängt an diesem POI; Orte übernehmen Standort und Namen, wenn nicht angegeben' }),
  count: z.number().int().min(1).max(500).optional(),
}).openapi('CodeInput');

export const CodePatchSchema = z.object({
  label: text(120).optional(),
  active: z.boolean().optional(),
  validUntil: z.string().datetime({ offset: true }).nullable().optional(),
  maxTotal: z.number().int().positive().max(1_000_000).nullable().optional(),
  geo: GeoSchema.optional().openapi({ description: 'Nur Ort: verschieben' }),
  placeName: text(80).optional().openapi({ description: 'Nur Ort: umbenennen' }),
  schedule: ScheduleSchema.nullable().optional(),
}).openapi('CodePatch');

export const CodeSchema = z.object({
  id: z.string().uuid(),
  achievementId: z.string().uuid(),
  template: CodeTemplateSchema,
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
  placeName: z.string().nullable(),
  schedule: ScheduleSchema.nullable(),
  poiId: z.string().nullable(),
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
