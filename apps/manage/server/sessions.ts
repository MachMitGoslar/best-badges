import { randomString } from './oidc.ts';

export interface Session {
  id: string;
  sub: string;
  name: string | null;
  accessToken: string;
  refreshToken: string | null;
  accessExpiresAt: number;
  createdAt: number;
  expiresAt: number;
}

export interface PendingLogin { state: string; verifier: string; nonce: string; returnTo: string; createdAt: number }

/**
 * Sitzungen im Speicher des BFF. Der Browser kennt nur die zufällige Sitzungs-ID im httpOnly-Cookie.
 * Für mehrere Instanzen später in Redis oder Postgres verlagern.
 */
export class SessionStore {
  private sessions = new Map<string, Session>();
  private pending = new Map<string, PendingLogin>();
  constructor(private ttlMs: number, private now: () => number = Date.now) {}

  startLogin(returnTo: string): PendingLogin {
    this.sweep();
    const p = { state: randomString(24), verifier: randomString(48), nonce: randomString(24), returnTo, createdAt: this.now() };
    this.pending.set(p.state, p);
    return p;
  }

  /** Holt und entfernt einen ausstehenden Login (einmalig, höchstens 10 Minuten alt). */
  takeLogin(state: string): PendingLogin | null {
    const p = this.pending.get(state);
    this.pending.delete(state);
    if (!p || this.now() - p.createdAt > 10 * 60_000) return null;
    return p;
  }

  create(data: Omit<Session, 'id' | 'createdAt' | 'expiresAt'>): Session {
    const s: Session = { ...data, id: randomString(32), createdAt: this.now(), expiresAt: this.now() + this.ttlMs };
    this.sessions.set(s.id, s);
    return s;
  }

  get(id: string | undefined): Session | null {
    if (!id) return null;
    const s = this.sessions.get(id);
    if (!s) return null;
    if (s.expiresAt <= this.now()) { this.sessions.delete(id); return null; }
    return s;
  }

  update(s: Session) { this.sessions.set(s.id, s); }
  destroy(id: string | undefined) { if (id) this.sessions.delete(id); }

  private sweep() {
    const now = this.now();
    for (const [k, p] of this.pending) if (now - p.createdAt > 10 * 60_000) this.pending.delete(k);
    for (const [k, s] of this.sessions) if (s.expiresAt <= now) this.sessions.delete(k);
  }
}
