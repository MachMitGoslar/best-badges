import type { components } from '@best-badges/api-client';

export type Schedule = NonNullable<components['schemas']['Schedule']>;
type Slot = Schedule[number];

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Lesbar wie in der App, z. B. „Mo–Fr 06:00–08:00 · Sa 07:00–13:00“ */
export function describeSchedule(schedule: Schedule | null | undefined): string {
  if (!schedule?.length) return '';
  return schedule.map((s) => `${daysText(s.days)} ${s.from}–${s.to}`).join(' · ');
}

function daysText(days: number[]) {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return 'täglich';
  const out: string[] = [];
  for (let i = 0; i < d.length; i++) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j]! + 1) j++;
    out.push(j - i >= 2 ? `${DAYS[d[i]! - 1]}–${DAYS[d[j]! - 1]}` : d.slice(i, j + 1).map((x) => DAYS[x - 1]).join(', '));
    i = j;
  }
  return out.join(', ');
}

/**
 * Feste Zeiten bearbeiten: je Zeile Wochentage und Uhrzeit (Goslarer Ortszeit).
 * Ende vor Beginn = über Mitternacht (z. B. Fr 22:00–02:00).
 */
export function ScheduleEditor({ value, onChange, disabled }: { value: Schedule; onChange: (s: Schedule) => void; disabled?: boolean }) {
  const set = (i: number, patch: Partial<Slot>) => onChange(value.map((s, n) => (n === i ? { ...s, ...patch } : s)));
  const toggleDay = (i: number, day: number) => {
    const days = value[i]!.days.includes(day) ? value[i]!.days.filter((d) => d !== day) : [...value[i]!.days, day].sort((a, b) => a - b);
    set(i, { days });
  };
  return (
    <div className="stack" style={{ gap: 8 }}>
      {value.map((s, i) => (
        <div key={i} className="row" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="seg" role="group" aria-label={`Wochentage, Zeitfenster ${i + 1}`}>
            {DAYS.map((d, n) => (
              <button key={d} type="button" aria-pressed={s.days.includes(n + 1)} disabled={disabled} onClick={() => toggleDay(i, n + 1)}>{d}</button>
            ))}
          </div>
          <label className="field">von<input type="time" value={s.from} disabled={disabled} onChange={(e) => set(i, { from: e.target.value })} /></label>
          <label className="field">bis<input type="time" value={s.to} disabled={disabled} onChange={(e) => set(i, { to: e.target.value })} /></label>
          <button type="button" className="btn btn-sm btn-ghost" disabled={disabled} onClick={() => onChange(value.filter((_, n) => n !== i))} aria-label={`Zeitfenster ${i + 1} entfernen`}>Entfernen</button>
        </div>
      ))}
      <div className="row">
        <button type="button" className="btn btn-sm" disabled={disabled || value.length >= 14}
          onClick={() => onChange([...value, { days: [6], from: '10:00', to: '14:00' }])}>Zeitfenster hinzufügen</button>
        {value.length > 0 && <span className="muted small">{describeSchedule(value)}{value.some((s) => s.to < s.from) ? ' (über Mitternacht)' : ''}</span>}
      </div>
    </div>
  );
}
