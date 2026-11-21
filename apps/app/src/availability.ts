// Zeitfenster eines Abzeichens als kurzer Text: vorher „ab …“, währenddessen Countdown, danach „nicht mehr erhältlich“.

export type Availability = { state: 'upcoming' | 'running' | 'ended'; text: string } | null;

const date = (d: Date, year = false) =>
  d.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'Europe/Berlin' });

export function availability(from: string | null | undefined, until: string | null | undefined, now = Date.now()): Availability {
  const f = from ? new Date(from) : null;
  const u = until ? new Date(until) : null;
  if (f && f.getTime() > now) return { state: 'upcoming', text: `ab ${date(f)}` };
  if (u && u.getTime() <= now) return { state: 'ended', text: `nicht mehr erhältlich (bis ${date(u, true)})` };
  if (!u) return null;
  const left = u.getTime() - now;
  const hours = Math.ceil(left / 3_600_000);
  if (hours < 24) return { state: 'running', text: hours <= 1 ? 'nur noch heute – letzte Stunde' : `nur noch ${hours} Std.` };
  const days = Math.ceil(left / 86_400_000);
  return { state: 'running', text: days <= 14 ? `noch ${days} Tage` : `bis ${date(u)}` };
}
