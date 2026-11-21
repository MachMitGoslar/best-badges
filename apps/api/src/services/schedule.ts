// Feste Zeiten (Wochentage + Uhrzeit) in Goslarer Ortszeit. Ein Fenster mit „to“ vor „from“ geht über Mitternacht
// und gehört zu dem Tag, an dem es beginnt (Fr 22:00–02:00 gilt auch Samstagnacht bis 2 Uhr).

export interface ScheduleSlot {
  /** ISO-Wochentage: 1 = Montag … 7 = Sonntag */
  days: number[];
  from: string;
  to: string;
}
export type Schedule = ScheduleSlot[];

const TZ = 'Europe/Berlin';
const DAY_NAMES = ['', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number) as [number, number];
  return h * 60 + m;
};

/** Wochentag (1–7) und Minute des Tages in Europe/Berlin */
export function localTime(ms: number): { day: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  return { day, minute: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Ist jetzt eines der Fenster offen? Kein Zeitplan = immer offen. */
export function isOpen(schedule: Schedule | null | undefined, ms: number): boolean {
  if (!schedule || schedule.length === 0) return true;
  const { day, minute } = localTime(ms);
  const yesterday = day === 1 ? 7 : day - 1;
  return schedule.some((s) => {
    const from = minutes(s.from), to = minutes(s.to);
    if (from < to) return s.days.includes(day) && minute >= from && minute < to;
    // über Mitternacht: Abend des Starttags oder früher Morgen des Folgetags
    return (s.days.includes(day) && minute >= from) || (s.days.includes(yesterday) && minute < to);
  });
}

/** Lesbar, z. B. „Sa 07:00–13:00 · Mo–Fr 06:00–08:00“ */
export function describe(schedule: Schedule | null | undefined): string {
  if (!schedule || schedule.length === 0) return '';
  return schedule.map((s) => `${daysText(s.days)} ${s.from}–${s.to}`).join(' · ');
}

function daysText(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return 'täglich';
  // zusammenhängende Folgen als Bereich
  const out: string[] = [];
  for (let i = 0; i < d.length; i++) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j]! + 1) j++;
    out.push(j - i >= 2 ? `${DAY_NAMES[d[i]!]}–${DAY_NAMES[d[j]!]}` : d.slice(i, j + 1).map((x) => DAY_NAMES[x]).join(', '));
    i = j;
  }
  return out.join(', ');
}

/** Prüft Form und Werte; liefert eine Fehlermeldung oder null. */
export function scheduleError(schedule: Schedule): string | null {
  if (schedule.length > 14) return 'Höchstens 14 Zeitfenster';
  for (const s of schedule) {
    if (s.days.length === 0) return 'Jedes Zeitfenster braucht mindestens einen Wochentag';
    if (s.from === s.to) return 'Beginn und Ende eines Zeitfensters dürfen nicht gleich sein';
  }
  return null;
}
