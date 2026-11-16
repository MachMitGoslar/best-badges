import type { MiddlewareHandler } from 'hono';

/**
 * Einfaches Rate-Limit pro Konto (gleitendes Fenster, im Speicher).
 * Für einen einzelnen API-Prozess ausreichend; bei mehreren Instanzen in die Datenbank oder Redis verlagern.
 */
export function perUserRateLimit(limit: number, windowMs: number, keyOf: (c: Parameters<MiddlewareHandler>[0]) => string | undefined = (c) => c.get('user')?.sub): MiddlewareHandler {
  const hits = new Map<string, number[]>();
  return async (c, next) => {
    const sub = keyOf(c);
    if (!sub) return next();
    const now = Date.now();
    const recent = (hits.get(sub) ?? []).filter((t) => t > now - windowMs);
    if (recent.length >= limit) {
      const retry = Math.ceil((recent[0]! + windowMs - now) / 1000);
      c.header('Retry-After', String(retry));
      return c.json({ error: 'rate_limited', message: 'Zu viele Versuche, bitte kurz warten.' }, 429);
    }
    recent.push(now);
    hits.set(sub, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (v.every((t) => t <= now - windowMs)) hits.delete(k);
    await next();
  };
}
