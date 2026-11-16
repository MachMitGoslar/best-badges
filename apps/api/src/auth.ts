import type { Context, MiddlewareHandler } from 'hono';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { identityFromClaims, type Identity } from './claims.ts';
import type { OrgDirectory } from './orgDirectory.ts';

export interface AuthUser extends Identity {
  hspProfileId: string;
  /** Organisationen, in denen die Person Mitglied ist (vorerst darf jedes Mitglied verwalten). */
  organisationIds: string[];
  /** Mitglied der Haupt-Admin-Organisation (darf Veto einlegen). */
  isPlatformAdmin: boolean;
}

declare module 'hono' {
  interface ContextVariableMap { user: AuthUser; apiKey: import('./services/apiKeys.ts').ApiKeyPrincipal }
}

export interface AuthOptions {
  issuer: string;
  audience: string;
  adminOrgId: string;
  directory: OrgDirectory;
  /** Für Tests austauschbar; standardmäßig JWKS aus der OIDC-Discovery. */
  keys?: JWTVerifyGetKey;
}

async function discoverJwks(issuer: string): Promise<JWTVerifyGetKey> {
  const res = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`OIDC-Discovery fehlgeschlagen: ${res.status}`);
  const { jwks_uri } = (await res.json()) as { jwks_uri?: string };
  if (!jwks_uri) throw new Error('OIDC-Discovery ohne jwks_uri');
  return createRemoteJWKSet(new URL(jwks_uri), { cacheMaxAge: 60 * 60 * 1000 });
}

function bearer(c: Context): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(c.req.header('Authorization') ?? '');
  return m?.[1] ?? null;
}

const unauthorized = (c: Context, message: string) => c.json({ error: 'Unauthorized', message }, 401);

export function createAuth(opts: AuthOptions) {
  let keys: Promise<JWTVerifyGetKey> | null = opts.keys ? Promise.resolve(opts.keys) : null;
  const getKeys = () => {
    if (!keys) keys = discoverJwks(opts.issuer).catch((e) => { keys = null; throw e; });
    return keys;
  };

  async function resolve(token: string): Promise<AuthUser> {
    const { payload } = await jwtVerify(token, await getKeys(), {
      issuer: opts.issuer,
      audience: opts.audience,
      algorithms: ['RS256', 'ES256'],
      clockTolerance: 30,
    });
    const identity = identityFromClaims(payload);
    const entry = await opts.directory.lookupUser(identity.sub, token);
    return {
      ...identity,
      name: identity.name ?? entry.displayName,
      hspProfileId: entry.hspProfileId,
      organisationIds: entry.organisationIds,
      isPlatformAdmin: entry.organisationIds.includes(opts.adminOrgId),
    };
  }

  const required: MiddlewareHandler = async (c, next) => {
    const token = bearer(c);
    if (!token) return unauthorized(c, 'Bearer-Token fehlt');
    try {
      c.set('user', await resolve(token));
    } catch (err) {
      console.warn('Auth fehlgeschlagen:', (err as Error).message);
      return unauthorized(c, 'Token ungültig oder abgelaufen');
    }
    await next();
  };

  const optional: MiddlewareHandler = async (c, next) => {
    const token = bearer(c);
    if (token) {
      try { c.set('user', await resolve(token)); } catch { /* anonym weiter */ }
    }
    await next();
  };

  /** Verlangt Mitgliedschaft in der Organisation aus dem Pfadparameter :orgId. */
  const orgMember: MiddlewareHandler = async (c, next) => {
    const orgId = c.req.param('orgId');
    if (!orgId || !c.get('user').organisationIds.includes(orgId)) {
      return c.json({ error: 'Forbidden', message: 'Keine Mitgliedschaft in dieser Organisation' }, 403);
    }
    await next();
  };

  const platformAdmin: MiddlewareHandler = async (c, next) => {
    if (!c.get('user').isPlatformAdmin) return c.json({ error: 'Forbidden', message: 'Nur für die Haupt-Admin-Organisation' }, 403);
    await next();
  };

  return { required, optional, orgMember, platformAdmin };
}

/** Maschinen-Zugang per API-Schlüssel im Header X-Api-Key, mit Prüfung des Rechts. */
export function apiKeyAuth(keys: import('./services/apiKeys.ts').ApiKeyService, scope: import('./db/types.ts').ApiScope): MiddlewareHandler {
  return async (c, next) => {
    const principal = await keys.authenticate(c.req.header('X-Api-Key'));
    if (!principal) return c.json({ error: 'Unauthorized', message: 'API-Schlüssel fehlt, ist ungültig, abgelaufen oder widerrufen' }, 401);
    if (!principal.scopes.includes(scope)) return c.json({ error: 'Forbidden', message: `Schlüssel hat das Recht „${scope}“ nicht` }, 403);
    c.set('apiKey', principal);
    await next();
  };
}
