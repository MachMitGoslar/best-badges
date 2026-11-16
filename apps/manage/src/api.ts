import { createApiClient } from '@best-badges/api-client';

/** Fehler der API mit Status und optionaler Liste von Validierungsproblemen */
export class ApiFailure extends Error {
  constructor(public status: number, message: string, public issues: { path: string; message: string }[] = []) {
    super(message);
  }
}

/**
 * Alle Aufrufe gehen über das BFF unter demselben Ursprung. Das Cookie hängt der Browser an,
 * der CSRF-Header kennzeichnet Anfragen aus dieser Oberfläche.
 */
export const api = createApiClient({
  baseUrl: '',
  credentials: 'same-origin',
  headers: { 'x-bb-csrf': '1' },
});

api.use({
  onResponse({ response }) {
    if (response.status === 401) {
      const here = window.location.pathname + window.location.search;
      window.location.assign(`/auth/login?returnTo=${encodeURIComponent(here)}`);
    }
    return response;
  },
});

/** Packt eine openapi-fetch-Antwort aus oder wirft ApiFailure. */
export async function unwrap<T>(p: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await p;
  if (error !== undefined || data === undefined) {
    const e = (error ?? {}) as { message?: string; issues?: { path: string; message: string }[] };
    throw new ApiFailure(response.status, e.message ?? `Fehler ${response.status}`, e.issues ?? []);
  }
  return data;
}

export interface SessionInfo { authenticated: boolean; sub?: string; name?: string | null }

export async function fetchSession(): Promise<SessionInfo> {
  const r = await fetch('/auth/session', { credentials: 'same-origin' });
  return r.json();
}

export async function logout(): Promise<void> {
  const r = await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'x-bb-csrf': '1' } });
  const { redirect } = (await r.json()) as { redirect: string };
  window.location.assign(redirect);
}
