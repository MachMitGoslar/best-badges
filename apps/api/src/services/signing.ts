// Signaturen für dynamische Codes. Der QR-Inhalt ist immer ein Link auf /c/{token};
// rotierende und Kassen-Codes tragen zusätzlich Parameter und eine HMAC-SHA256-Signatur.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomToken } from './tokens.ts';

/** Länge eines Zeitfensters für rotierende Codes */
export const WINDOW_SECONDS = 15;
/** Gültigkeit eines an der Kasse erzeugten Einmal-Codes */
export const CHECKOUT_TTL_SECONDS = 10 * 60;

const sign = (secret: Buffer, payload: string) =>
  createHmac('sha256', secret).update(payload).digest().subarray(0, 16).toString('base64url');

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const windowAt = (nowMs: number) => Math.floor(nowMs / 1000 / WINDOW_SECONDS);

export function eventUrl(base: string, token: string, secret: Buffer, nowMs: number) {
  const w = windowAt(nowMs);
  const url = `${base}/c/${token}?w=${w}&s=${sign(secret, `event.${token}.${w}`)}`;
  const expiresInMs = (w + 1) * WINDOW_SECONDS * 1000 - nowMs;
  return { url, window: w, expiresInMs };
}

/** Rotierender Code: gültig im aktuellen und im vorigen Fenster (Übergang, Uhrenabweichung). */
export function verifyEvent(token: string, secret: Buffer, params: URLSearchParams, nowMs: number): boolean {
  const w = Number(params.get('w')), s = params.get('s') ?? '';
  if (!Number.isInteger(w)) return false;
  const current = windowAt(nowMs);
  if (w > current + 1 || w < current - 1) return false;
  return safeEqual(s, sign(secret, `event.${token}.${w}`));
}

export function checkoutUrl(base: string, token: string, secret: Buffer, value: number, nowMs: number) {
  const nonce = randomToken(16);
  const exp = Math.floor(nowMs / 1000) + CHECKOUT_TTL_SECONDS;
  const url = `${base}/c/${token}?v=${value}&n=${nonce}&e=${exp}&s=${sign(secret, `checkout.${token}.${value}.${nonce}.${exp}`)}`;
  return { url, nonce, expiresAt: new Date(exp * 1000) };
}

export type CheckoutClaim = { ok: true; value: number; nonce: string } | { ok: false; reason: 'invalid' | 'expired' };

export function verifyCheckout(token: string, secret: Buffer, params: URLSearchParams, nowMs: number): CheckoutClaim {
  const v = Number(params.get('v')), n = params.get('n') ?? '', e = Number(params.get('e')), s = params.get('s') ?? '';
  if (!Number.isInteger(v) || v < 1 || v > 1000 || !/^[A-Za-z0-9]{12,32}$/.test(n) || !Number.isInteger(e)) return { ok: false, reason: 'invalid' };
  if (!safeEqual(s, sign(secret, `checkout.${token}.${v}.${n}.${e}`))) return { ok: false, reason: 'invalid' };
  if (e * 1000 < nowMs) return { ok: false, reason: 'expired' };
  return { ok: true, value: v, nonce: n };
}

/** Akzeptiert einen vollständigen Link (beliebiger Host, Pfad /c/{token}) oder ein nacktes Token. */
export function parseScanned(input: string): { token: string; params: URLSearchParams } | null {
  const raw = input.trim();
  if (/^[A-Za-z0-9]{16,64}$/.test(raw)) return { token: raw, params: new URLSearchParams() };
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:' && url.protocol !== 'bestbadges:') return null;
  const m = /\/c\/([A-Za-z0-9]{16,64})\/?$/.exec(url.pathname);
  return m ? { token: m[1]!, params: url.searchParams } : null;
}
