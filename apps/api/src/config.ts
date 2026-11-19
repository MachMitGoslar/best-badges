import { z } from 'zod';

/** Leere Werte (z. B. VAR= in .env) gelten als nicht gesetzt */
const optionalText = <T extends z.ZodTypeAny>(t: T) => z.preprocess((v) => (v === '' ? undefined : v), t.optional());

const schema = z.object({
  PORT: z.coerce.number().int().default(3001),
  /** Lauschadresse: lokal nur 127.0.0.1, im Container 0.0.0.0 (Zugang regelt dann Docker/Traefik) */
  HOST: z.string().default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().url(),
  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string().min(1),
  HSP_BASE_URL: z.string().url(),
  ADMIN_ORG_ID: z.string().uuid(),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:3001').transform((u) => u.replace(/\/$/, '')),
  MIGRATE_ON_START: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
  CORS_ORIGINS: z.string().default('').transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  // Interne API-Doku (/internal/docs) ausliefern? Standard: nur außerhalb der Produktion
  INTERNAL_DOCS: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  // Cache-Laufzeiten für HSP-Daten in Sekunden
  /** Seltenheit erst ab so vielen Sammelnden je Organisation, vorher alles „gewöhnlich“ */
  RARITY_MIN_COLLECTORS: z.coerce.number().int().min(1).default(50),
  /** Push über Apple: alle vier gesetzt = an. Der Schlüssel (.p8) liegt als Datei vor, nie in Umgebungsvariablen. */
  APNS_KEY_FILE: optionalText(z.string()),
  APNS_KEY_ID: optionalText(z.string().regex(/^[A-Z0-9]{10}$/)),
  APNS_TEAM_ID: optionalText(z.string().regex(/^[A-Z0-9]{10}$/)),
  /** Bundle-ID der App */
  APNS_TOPIC: optionalText(z.string().regex(/^[A-Za-z0-9.-]+$/)),
  HSP_MEMBERSHIP_TTL: z.coerce.number().int().positive().default(600),
  HSP_ORG_TTL: z.coerce.number().int().positive().default(4 * 3600),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
    throw new Error(`Ungültige Konfiguration:\n  ${issues}`);
  }
  return parsed.data;
}
