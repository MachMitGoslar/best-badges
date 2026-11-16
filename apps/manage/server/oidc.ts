import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface TokenSet {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
}

interface Discovery { authorization_endpoint: string; token_endpoint: string; jwks_uri: string; end_session_endpoint?: string }

const b64url = (b: Buffer) => b.toString('base64url');
export const randomString = (bytes = 32) => b64url(randomBytes(bytes));
export const pkceChallenge = (verifier: string) => b64url(createHash('sha256').update(verifier).digest());

/** Schlanker OIDC-Client für das BFF: Authorization Code mit PKCE, Refresh, Prüfung des ID-Tokens. */
export class OidcClient {
  private discovery: Promise<Discovery> | null = null;
  private jwks: JWTVerifyGetKey | null = null;

  constructor(
    private opts: { issuer: string; clientId: string; clientSecret?: string; audience: string },
    private fetchFn: typeof fetch = fetch,
  ) {}

  private discover(): Promise<Discovery> {
    this.discovery ??= this.fetchFn(`${this.opts.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(5000) })
      .then(async (r) => {
        if (!r.ok) throw new Error(`OIDC-Discovery fehlgeschlagen: ${r.status}`);
        return (await r.json()) as Discovery;
      })
      .catch((e) => { this.discovery = null; throw e; });
    return this.discovery;
  }

  async authorizationUrl(p: { redirectUri: string; state: string; nonce: string; verifier: string }): Promise<string> {
    const d = await this.discover();
    const url = new URL(d.authorization_endpoint);
    url.search = new URLSearchParams({
      response_type: 'code',
      client_id: this.opts.clientId,
      redirect_uri: p.redirectUri,
      scope: 'openid profile email offline_access',
      state: p.state,
      nonce: p.nonce,
      code_challenge: pkceChallenge(p.verifier),
      code_challenge_method: 'S256',
      audience: this.opts.audience,
    }).toString();
    return url.toString();
  }

  private async token(body: Record<string, string>): Promise<TokenSet> {
    const d = await this.discover();
    const params = new URLSearchParams({ client_id: this.opts.clientId, ...body });
    if (this.opts.clientSecret) params.set('client_secret', this.opts.clientSecret);
    const res = await this.fetchFn(d.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Token-Endpunkt antwortet ${res.status}`);
    const t = (await res.json()) as TokenSet;
    if (!t.access_token) throw new Error('Antwort ohne access_token');
    return t;
  }

  exchangeCode(code: string, redirectUri: string, verifier: string) {
    return this.token({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: verifier });
  }

  refresh(refreshToken: string) {
    return this.token({ grant_type: 'refresh_token', refresh_token: refreshToken });
  }

  /** Prüft Signatur, Issuer, Audience und Nonce des ID-Tokens. */
  async verifyIdToken(idToken: string, nonce: string) {
    const d = await this.discover();
    this.jwks ??= createRemoteJWKSet(new URL(d.jwks_uri));
    const { payload } = await jwtVerify(idToken, this.jwks, {
      issuer: this.opts.issuer,
      // Die Goslar ID setzt die Client-ID als Audience; manche Anbieter zusätzlich die API.
      audience: [this.opts.clientId, this.opts.audience],
      clockTolerance: 30,
    });
    if (payload.nonce !== nonce) throw new Error('Nonce passt nicht');
    return payload;
  }

  async endSessionUrl(postLogoutRedirect: string): Promise<string | null> {
    const d = await this.discover();
    if (!d.end_session_endpoint) return null;
    const url = new URL(d.end_session_endpoint);
    url.searchParams.set('post_logout_redirect_uri', postLogoutRedirect);
    url.searchParams.set('client_id', this.opts.clientId);
    return url.toString();
  }
}
