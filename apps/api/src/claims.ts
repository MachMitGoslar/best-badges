// Übersetzt die Claims des Identity Providers an genau einer Stelle.
// Die Goslar ID liefert die E-Mail unter dem WS-Federation-Claim.
const GOSLAR_EMAIL_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress';

export interface Identity {
  sub: string;
  email: string | null;
  name: string | null;
}

export function identityFromClaims(claims: Record<string, unknown>): Identity {
  const sub = claims.sub;
  if (typeof sub !== 'string' || sub.length === 0) throw new Error('Token ohne sub');
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);
  return {
    sub,
    email: str(claims[GOSLAR_EMAIL_CLAIM]) ?? str(claims.email),
    name: str(claims.name) ?? str(claims.preferred_username),
  };
}
