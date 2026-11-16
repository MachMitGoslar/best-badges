// Typisierter Client für die Badge-API, generiert aus dem OpenAPI-Dokument (pnpm --filter @best-badges/api-client generate).
import createClient, { type ClientOptions } from 'openapi-fetch';
import type { components, paths } from './schema.d.ts';

export type { paths, components };
export type Schemas = components['schemas'];
export type Achievement = Schemas['Achievement'];
export type AchievementInput = Schemas['AchievementInput'];
export type Code = Schemas['Code'];
export type CodeInput = Schemas['CodeInput'];
export type Award = Schemas['Award'];

export function createApiClient(options: ClientOptions = {}) {
  return createClient<paths>(options);
}
export type ApiClient = ReturnType<typeof createApiClient>;
