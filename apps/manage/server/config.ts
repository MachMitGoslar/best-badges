import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MANAGE_BFF_PORT: z.coerce.number().int().default(5174),
  /** Lauschadresse: lokal nur 127.0.0.1, im Container 0.0.0.0 */
  MANAGE_BFF_HOST: z.string().default('127.0.0.1'),
  /** Öffentliche Adresse der Verwaltung (in der Entwicklung der Vite-Server) */
  MANAGE_PUBLIC_URL: z.string().url().default('http://localhost:5173').transform((u) => u.replace(/\/$/, '')),
  OIDC_ISSUER: z.string().url(),
  OIDC_AUDIENCE: z.string().min(1),
  MANAGE_OIDC_CLIENT_ID: z.string().min(1).default('badges-manage'),
  /** Nur nötig, wenn der Identity Provider einen vertraulichen Client verlangt. Bleibt im BFF, nie im Browser. */
  MANAGE_OIDC_CLIENT_SECRET: z.string().optional(),
  API_URL: z.string().url().default('http://127.0.0.1:3001').transform((u) => u.replace(/\/$/, '')),
  /** Höchstdauer einer Sitzung in Sekunden */
  MANAGE_SESSION_TTL: z.coerce.number().int().positive().default(8 * 3600),
});

export type BffConfig = z.infer<typeof schema>;
export const loadBffConfig = (env: NodeJS.ProcessEnv = process.env): BffConfig => schema.parse(env);
