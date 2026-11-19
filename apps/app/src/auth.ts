// Anmeldung mit der Goslar ID (OIDC, Authorization Code + PKCE über den Systembrowser).
// Tokens liegen nur im SecureStore (iOS Keychain / Android Keystore).
import { useSyncExternalStore } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';
import { config } from './config.ts';

WebBrowser.maybeCompleteAuthSession();

interface Tokens { accessToken: string; refreshToken: string | null; expiresAt: number }
interface AuthState { status: 'loading' | 'signedOut' | 'signedIn'; tokens: Tokens | null }

const KEY = 'bb.tokens.v1';
let state: AuthState = { status: 'loading', tokens: null };
const listeners = new Set<() => void>();
const set = (next: AuthState) => { state = next; listeners.forEach((l) => l()); };

export const redirectUri = AuthSession.makeRedirectUri({ scheme: 'bestbadges', path: 'auth-callback' });

let discovery: Promise<AuthSession.DiscoveryDocument> | null = null;
const discover = () => (discovery ??= AuthSession.fetchDiscoveryAsync(config.issuer).catch((e) => { discovery = null; throw e; }));

export async function hydrate() {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    set(raw ? { status: 'signedIn', tokens: JSON.parse(raw) as Tokens } : { status: 'signedOut', tokens: null });
  } catch {
    set({ status: 'signedOut', tokens: null });
  }
}

async function save(t: Tokens | null) {
  if (t) await SecureStore.setItemAsync(KEY, JSON.stringify(t));
  else await SecureStore.deleteItemAsync(KEY);
  set(t ? { status: 'signedIn', tokens: t } : { status: 'signedOut', tokens: null });
}

interface TokenJson { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string }

/**
 * Anfrage an den Token-Endpunkt – bewusst ohne exchangeCodeAsync/refreshAsync von expo-auth-session:
 * Die schneiden den abschließenden Schrägstrich der Adresse ab (…/token/ → …/token), was manche Anbieter
 * (authentik) mit 404 beantworten. Wir nutzen die Adresse genau so, wie die Discovery sie nennt.
 */
async function tokenRequest(params: Record<string, string>): Promise<TokenJson> {
  const d = await discover();
  if (!d.tokenEndpoint) throw new Error('OIDC-Discovery ohne token_endpoint');
  const res = await fetch(d.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ client_id: config.clientId, ...params }).toString(),
  });
  const json = (await res.json().catch(() => ({}))) as TokenJson;
  if (!res.ok || !json.access_token) throw new Error(`Token-Anfrage fehlgeschlagen (${res.status}${json.error ? `, ${json.error}` : ''})`);
  return json;
}

const fromResponse = (r: TokenJson, previousRefresh: string | null = null): Tokens => ({
  accessToken: r.access_token!,
  refreshToken: r.refresh_token ?? previousRefresh,
  expiresAt: Date.now() + (r.expires_in ?? 300) * 1000,
});

/** Startet den Login im Systembrowser. Liefert false, wenn abgebrochen. */
export async function signIn(): Promise<boolean> {
  const d = await discover();
  const request = new AuthSession.AuthRequest({
    clientId: config.clientId,
    redirectUri,
    scopes: ['openid', 'profile', 'email', 'offline_access'],
    usePKCE: true,
    extraParams: config.audience ? { audience: config.audience } : {},
  });
  const result = await request.promptAsync(d);
  if (result.type !== 'success') return false;
  const tokens = await tokenRequest({ grant_type: 'authorization_code', code: result.params.code!, redirect_uri: redirectUri, code_verifier: request.codeVerifier! });
  await save(fromResponse(tokens));
  return true;
}

const beforeSignOut: (() => Promise<void>)[] = [];
/** Aufräumen, solange die Anmeldung noch gilt (z. B. Push-Gerät abmelden) */
export const onBeforeSignOut = (fn: () => Promise<void>) => { beforeSignOut.push(fn); };
let signingOut = false;

/** Abmelden: Refresh-Token beim Anbieter widerrufen (wenn möglich), dann lokal löschen. */
export async function signOut() {
  // Aufräum-Schritte können selbst 401 bekommen und erneut abmelden wollen
  if (signingOut || !state.tokens) return;
  signingOut = true;
  try {
    for (const fn of beforeSignOut) await fn().catch(() => {});
  } finally {
    signingOut = false;
  }
  const refresh = state.tokens?.refreshToken;
  await save(null);
  if (!refresh) return;
  try {
    const d = await discover();
    if (d.revocationEndpoint) {
      await fetch(d.revocationEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: config.clientId, token: refresh, token_type_hint: 'refresh_token' }).toString(),
      });
    }
  } catch {
    // Offline o. Ä.: lokal ist abgemeldet, das Token läuft beim Anbieter von selbst ab
  }
}

let refreshing: Promise<string | null> | null = null;

/** Gültiges Access-Token; erneuert es kurz vor Ablauf. Null = nicht (mehr) angemeldet. */
export async function getAccessToken(): Promise<string | null> {
  const t = state.tokens;
  if (!t) return null;
  if (t.expiresAt - Date.now() > 30_000) return t.accessToken;
  if (!t.refreshToken) { await save(null); return null; }
  refreshing ??= (async () => {
    try {
      const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refreshToken! });
      const next = fromResponse(r, t.refreshToken);
      await save(next);
      return next.accessToken;
    } catch {
      await save(null);
      return null;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export function useAuth() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}
