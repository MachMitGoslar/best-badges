import { describe, it, expect, beforeEach } from 'vitest';
import { createBffApp } from './app.ts';
import type { BffConfig } from './config.ts';
import type { OidcClient, TokenSet } from './oidc.ts';
import { SessionStore } from './sessions.ts';

const config: BffConfig = {
  NODE_ENV: 'test', MANAGE_BFF_PORT: 0, MANAGE_PUBLIC_URL: 'http://localhost:5173', OIDC_ISSUER: 'http://idp.test',
  OIDC_AUDIENCE: 'badges-api', MANAGE_OIDC_CLIENT_ID: 'badges-manage', MANAGE_OIDC_CLIENT_SECRET: undefined,
  API_URL: 'http://api.test', MANAGE_SESSION_TTL: 3600,
};

let clock = 1_000_000;
let refreshCalls = 0;
let refreshFails = false;
let apiCalls: { url: string; method: string; headers: Headers; body: string | null }[] = [];

const fakeOidc = {
  authorizationUrl: async (p: { state: string; redirectUri: string }) => `http://idp.test/authorize?state=${p.state}&redirect_uri=${encodeURIComponent(p.redirectUri)}`,
  exchangeCode: async (code: string): Promise<TokenSet> => {
    if (code !== 'good') throw new Error('bad code');
    return { access_token: 'at-1', refresh_token: 'rt-1', id_token: 'idt', expires_in: 300 };
  },
  verifyIdToken: async () => ({ sub: 'waldpfad', name: 'Wanda Wald' }),
  refresh: async (): Promise<TokenSet> => {
    refreshCalls++;
    if (refreshFails) throw new Error('refresh failed');
    return { access_token: `at-refreshed-${refreshCalls}`, expires_in: 300 };
  },
  endSessionUrl: async () => null,
} as unknown as OidcClient;

const fetchApi: typeof fetch = async (input, init) => {
  apiCalls.push({ url: String(input), method: init?.method ?? 'GET', headers: new Headers(init?.headers), body: init?.body ? new TextDecoder().decode(init.body as ArrayBuffer) : null });
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json', 'set-cookie': 'leak=1' } });
};

let app: ReturnType<typeof createBffApp>;
beforeEach(() => {
  clock = 1_000_000; refreshCalls = 0; refreshFails = false; apiCalls = [];
  app = createBffApp({ config, oidc: fakeOidc, sessions: new SessionStore(3600_000, () => clock), fetchApi, now: () => clock });
});

const cookieOf = (res: Response, name: string) => {
  const all = res.headers.getSetCookie();
  const c = all.find((x) => x.startsWith(`${name}=`));
  return c ? c.split(';')[0]!.split('=')[1]! : undefined;
};

async function login(returnTo = '/orgs') {
  const start = await app.request(`/auth/login?returnTo=${encodeURIComponent(returnTo)}`);
  const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
  const loginCookie = cookieOf(start, 'bb_login')!;
  const cb = await app.request(`/auth/callback?code=good&state=${state}`, { headers: { cookie: `bb_login=${loginCookie}` } });
  return { start, cb, sid: cookieOf(cb, 'bb_session') };
}

describe('Login', () => {
  it('leitet mit state zum Identity Provider und setzt das Login-Cookie httpOnly', async () => {
    const res = await app.request('/auth/login');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback');
    const raw = res.headers.getSetCookie().find((c) => c.startsWith('bb_login='))!;
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it('legt nach erfolgreichem Callback eine Sitzung an und kehrt zum Ziel zurück', async () => {
    const { cb, sid } = await login('/orgs/123');
    expect(cb.status).toBe(302);
    expect(cb.headers.get('location')).toBe('/orgs/123');
    expect(sid).toBeTruthy();
    const session = await (await app.request('/auth/session', { headers: { cookie: `bb_session=${sid}` } })).json();
    expect(session).toEqual({ authenticated: true, sub: 'waldpfad', name: 'Wanda Wald' });
    // Das Token selbst erreicht den Browser nie
    expect(JSON.stringify(session)).not.toContain('at-1');
  });

  it('lehnt einen state ohne passendes Cookie ab (Login-CSRF)', async () => {
    const start = await app.request('/auth/login');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const res = await app.request(`/auth/callback?code=good&state=${state}`);
    expect(res.headers.get('location')).toBe('/login?error=state');
  });

  it('verwendet einen state nur einmal und meldet Fehler beim Code-Tausch', async () => {
    const start = await app.request('/auth/login');
    const state = new URL(start.headers.get('location')!).searchParams.get('state')!;
    const cookie = `bb_login=${cookieOf(start, 'bb_login')}`;
    expect((await app.request(`/auth/callback?code=bad&state=${state}`, { headers: { cookie } })).headers.get('location')).toBe('/login?error=login');
    expect((await app.request(`/auth/callback?code=good&state=${state}`, { headers: { cookie } })).headers.get('location')).toBe('/login?error=expired');
  });

  it('verhindert offene Weiterleitungen', async () => {
    for (const evil of ['//evil.test', 'https://evil.test', '/\\evil.test', 'javascript:alert(1)']) {
      const { cb } = await login(evil);
      expect(cb.headers.get('location')).toBe('/');
    }
  });
});

describe('API-Weiterleitung', () => {
  it('setzt das Bearer-Token der Sitzung und gibt keine Cookies weiter', async () => {
    const { sid } = await login();
    const res = await app.request('/api/v1/me?x=1', { headers: { cookie: `bb_session=${sid}; other=1` } });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
    expect(apiCalls[0]!.url).toBe('http://api.test/api/v1/me?x=1');
    expect(apiCalls[0]!.headers.get('authorization')).toBe('Bearer at-1');
    expect(apiCalls[0]!.headers.get('cookie')).toBeNull();
  });

  it('leitet ohne Sitzung ohne Token weiter (öffentliche Endpunkte)', async () => {
    await app.request('/api/v1/achievements');
    expect(apiCalls[0]!.headers.get('authorization')).toBeNull();
  });

  it('verlangt für ändernde Anfragen den CSRF-Header und den eigenen Origin', async () => {
    const { sid } = await login();
    const cookie = `bb_session=${sid}`;
    const body = JSON.stringify({ a: 1 });
    expect((await app.request('/api/v1/x', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body })).status).toBe(403);
    expect((await app.request('/api/v1/x', { method: 'POST', headers: { cookie, 'x-bb-csrf': '1', origin: 'https://evil.test' }, body })).status).toBe(403);
    const ok = await app.request('/api/v1/x', { method: 'POST', headers: { cookie, 'x-bb-csrf': '1', origin: 'http://localhost:5173', 'content-type': 'application/json' }, body });
    expect(ok.status).toBe(200);
    expect(apiCalls.at(-1)).toMatchObject({ method: 'POST', body });
  });

  it('erneuert das Token kurz vor Ablauf', async () => {
    const { sid } = await login();
    clock += 290_000; // 10 s vor Ablauf
    await app.request('/api/v1/me', { headers: { cookie: `bb_session=${sid}` } });
    expect(refreshCalls).toBe(1);
    expect(apiCalls[0]!.headers.get('authorization')).toBe('Bearer at-refreshed-1');
  });

  it('beendet die Sitzung, wenn die Erneuerung scheitert', async () => {
    const { sid } = await login();
    clock += 400_000;
    refreshFails = true;
    const res = await app.request('/api/v1/me', { headers: { cookie: `bb_session=${sid}` } });
    expect(res.status).toBe(401);
    expect(apiCalls).toHaveLength(0);
    expect(await (await app.request('/auth/session', { headers: { cookie: `bb_session=${sid}` } })).json()).toEqual({ authenticated: false });
  });
});

describe('Abmelden', () => {
  it('löscht die Sitzung nur mit CSRF-Header', async () => {
    const { sid } = await login();
    const cookie = `bb_session=${sid}`;
    expect((await app.request('/auth/logout', { method: 'POST', headers: { cookie } })).status).toBe(403);
    const res = await app.request('/auth/logout', { method: 'POST', headers: { cookie, 'x-bb-csrf': '1' } });
    expect(await res.json()).toEqual({ redirect: '/login' });
    expect(await (await app.request('/auth/session', { headers: { cookie } })).json()).toEqual({ authenticated: false });
  });
});
