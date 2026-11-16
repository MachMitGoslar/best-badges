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

const fromResponse = (r: AuthSession.TokenResponse, previousRefresh: string | null = null): Tokens => ({
  accessToken: r.accessToken,
  refreshToken: r.refreshToken ?? previousRefresh,
  expiresAt: (r.issuedAt + (r.expiresIn ?? 300)) * 1000,
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
  const tokens = await AuthSession.exchangeCodeAsync(
    { clientId: config.clientId, code: result.params.code!, redirectUri, extraParams: { code_verifier: request.codeVerifier! } },
    d,
  );
  await save(fromResponse(tokens));
  return true;
}

export const signOut = () => save(null);

let refreshing: Promise<string | null> | null = null;

/** Gültiges Access-Token; erneuert es kurz vor Ablauf. Null = nicht (mehr) angemeldet. */
export async function getAccessToken(): Promise<string | null> {
  const t = state.tokens;
  if (!t) return null;
  if (t.expiresAt - Date.now() > 30_000) return t.accessToken;
  if (!t.refreshToken) { await save(null); return null; }
  refreshing ??= (async () => {
    try {
      const r = await AuthSession.refreshAsync({ clientId: config.clientId, refreshToken: t.refreshToken! }, await discover());
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
