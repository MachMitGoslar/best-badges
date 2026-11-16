import { createApiClient } from '@best-badges/api-client';
import { config } from './config.ts';
import { getAccessToken, signOut } from './auth.ts';

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

/**
 * Eigene fetch-Funktion statt openapi-fetch-Middleware: React Native verarbeitet
 * Request-Objekte und geklonte Antworten nicht zuverlässig. Hier gehen URL, Methode,
 * Header und Body explizit an das native fetch; das Token kommt frisch dazu.
 */
async function authedFetch(input: Request): Promise<Response> {
  const headers = new Headers(input.headers);
  const token = await getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const body = input.method === 'GET' || input.method === 'HEAD' ? undefined : await input.text();
  const response = await fetch(input.url, { method: input.method, headers, body });
  if (response.status === 401) await signOut();
  return response;
}

export const api = createApiClient({ baseUrl: config.apiUrl, fetch: authedFetch });

export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || data === undefined) {
    const e = (error ?? {}) as { error?: string; message?: string };
    throw new ApiFailure(response.status, e.error ?? 'error', e.message ?? `Fehler ${response.status}`);
  }
  return data;
}
