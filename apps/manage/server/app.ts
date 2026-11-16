import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { secureHeaders } from 'hono/secure-headers';
import { bodyLimit } from 'hono/body-limit';
import { decodeJwt } from 'jose';
import type { BffConfig } from './config.ts';
import type { OidcClient, TokenSet } from './oidc.ts';
import type { Session, SessionStore } from './sessions.ts';

export interface BffDeps {
  config: BffConfig;
  oidc: OidcClient;
  sessions: SessionStore;
  /** Für Tests austauschbar: Aufrufe an die Badge-API */
  fetchApi?: typeof fetch;
  now?: () => number;
}

/** Header, an dem das BFF erkennt, dass eine ändernde Anfrage aus der eigenen Oberfläche kommt (CSRF-Schutz). */
export const CSRF_HEADER = 'x-bb-csrf';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const PASS_RESPONSE_HEADERS = ['content-type', 'cache-control', 'retry-after', 'content-security-policy', 'x-content-type-options'];

export function createBffApp({ config, oidc, sessions, fetchApi = fetch, now = Date.now }: BffDeps) {
  const app = new Hono();
  const secure = config.MANAGE_PUBLIC_URL.startsWith('https://');
  // __Host- erzwingt Secure, Path=/ und keine Domain – nur mit HTTPS möglich
  const SESSION_COOKIE = secure ? '__Host-bb_session' : 'bb_session';
  const LOGIN_COOKIE = secure ? '__Host-bb_login' : 'bb_login';
  const redirectUri = `${config.MANAGE_PUBLIC_URL}/auth/callback`;
  const publicOrigin = new URL(config.MANAGE_PUBLIC_URL).origin;
  const cookieBase = { httpOnly: true, secure, sameSite: 'Lax' as const, path: '/' };

  app.use('*', secureHeaders({ referrerPolicy: 'same-origin', xFrameOptions: 'DENY' }));

  /** Nur relative Pfade derselben Seite als Rücksprungziel – verhindert offene Weiterleitungen. */
  const safeReturnTo = (v: string | undefined) => (v && /^\/(?!\/)[\w\-./?=&%#]*$/.test(v) ? v : '/');

  const expiresAt = (t: TokenSet) => {
    if (t.expires_in) return now() + t.expires_in * 1000;
    try { return (decodeJwt(t.access_token).exp ?? 0) * 1000; } catch { return now() + 5 * 60_000; }
  };

  // CSRF: ändernde Anfragen brauchen den eigenen Header und – falls gesendet – den eigenen Origin.
  const csrf = async (c: Context, next: () => Promise<void>) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      if (c.req.header(CSRF_HEADER) !== '1' || (origin && origin !== publicOrigin)) {
        return c.json({ error: 'csrf', message: 'Anfrage abgelehnt' }, 403);
      }
    }
    await next();
  };

  app.get('/auth/login', async (c) => {
    const p = sessions.startLogin(safeReturnTo(c.req.query('returnTo')));
    setCookie(c, LOGIN_COOKIE, p.state, { ...cookieBase, maxAge: 600 });
    return c.redirect(await oidc.authorizationUrl({ redirectUri, state: p.state, nonce: p.nonce, verifier: p.verifier }));
  });

  app.get('/auth/callback', async (c) => {
    const { code, state, error } = c.req.query();
    const cookieState = getCookie(c, LOGIN_COOKIE);
    deleteCookie(c, LOGIN_COOKIE, { path: '/', secure });
    if (error) return c.redirect(`/login?error=${encodeURIComponent(error.slice(0, 64))}`);
    // state muss zum Cookie dieses Browsers passen (Schutz gegen Login-CSRF)
    if (!code || !state || state !== cookieState) return c.redirect('/login?error=state');
    const pending = sessions.takeLogin(state);
    if (!pending) return c.redirect('/login?error=expired');
    try {
      const tokens = await oidc.exchangeCode(code, redirectUri, pending.verifier);
      if (!tokens.id_token) throw new Error('Kein ID-Token');
      const id = await oidc.verifyIdToken(tokens.id_token, pending.nonce);
      const session = sessions.create({
        sub: String(id.sub),
        name: (typeof id.name === 'string' && id.name) || (typeof id.preferred_username === 'string' && id.preferred_username) || null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        accessExpiresAt: expiresAt(tokens),
      });
      setCookie(c, SESSION_COOKIE, session.id, { ...cookieBase, maxAge: config.MANAGE_SESSION_TTL });
      return c.redirect(pending.returnTo);
    } catch (err) {
      console.warn('Login fehlgeschlagen:', (err as Error).message);
      return c.redirect('/login?error=login');
    }
  });

  app.get('/auth/session', (c) => {
    const s = sessions.get(getCookie(c, SESSION_COOKIE));
    c.header('Cache-Control', 'no-store');
    return c.json(s ? { authenticated: true, sub: s.sub, name: s.name } : { authenticated: false });
  });

  app.post('/auth/logout', csrf, async (c) => {
    sessions.destroy(getCookie(c, SESSION_COOKIE));
    deleteCookie(c, SESSION_COOKIE, { path: '/', secure });
    let redirect = '/login';
    try { redirect = (await oidc.endSessionUrl(`${config.MANAGE_PUBLIC_URL}/login`)) ?? redirect; } catch { /* Abmelden lokal reicht */ }
    return c.json({ redirect });
  });

  /** Gültiges Access-Token der Sitzung, bei Bedarf erneuert. */
  async function accessToken(s: Session): Promise<string | null> {
    if (s.accessExpiresAt - now() > 30_000) return s.accessToken;
    if (!s.refreshToken) return null;
    try {
      const t = await oidc.refresh(s.refreshToken);
      s.accessToken = t.access_token;
      s.refreshToken = t.refresh_token ?? s.refreshToken;
      s.accessExpiresAt = expiresAt(t);
      sessions.update(s);
      return s.accessToken;
    } catch (err) {
      console.warn('Token-Erneuerung fehlgeschlagen:', (err as Error).message);
      return null;
    }
  }

  // Weiterleitung an die Badge-API mit dem Token der Sitzung
  app.all('/api/*', csrf, bodyLimit({ maxSize: 512 * 1024, onError: (c) => c.json({ error: 'Payload Too Large', message: 'Anfrage zu groß' }, 413) }), async (c) => {
    const sid = getCookie(c, SESSION_COOKIE);
    const s = sessions.get(sid);
    const headers: Record<string, string> = { accept: c.req.header('accept') ?? 'application/json' };
    if (s) {
      const token = await accessToken(s);
      if (!token) {
        sessions.destroy(sid);
        deleteCookie(c, SESSION_COOKIE, { path: '/', secure });
        return c.json({ error: 'Unauthorized', message: 'Sitzung abgelaufen' }, 401);
      }
      headers.authorization = `Bearer ${token}`;
    }
    const ct = c.req.header('content-type');
    if (ct) headers['content-type'] = ct;
    const url = new URL(c.req.url);
    const body = SAFE_METHODS.has(c.req.method) ? undefined : await c.req.arrayBuffer();
    const res = await fetchApi(`${config.API_URL}${url.pathname}${url.search}`, { method: c.req.method, headers, body, signal: AbortSignal.timeout(15_000) });
    const out = new Headers();
    for (const h of PASS_RESPONSE_HEADERS) { const v = res.headers.get(h); if (v) out.set(h, v); }
    return new Response(res.body, { status: res.status, headers: out });
  });

  return app;
}
