import type { Achievement } from '@best-badges/api-client';

export function StatusPill({ a }: { a: Pick<Achievement, 'status' | 'veto'> }) {
  if (a.veto) return <span className="pill pill-veto">● Veto</span>;
  const map = { draft: ['pill-draft', 'Entwurf'], live: ['pill-live', 'Live'], archived: ['pill-archived', 'Archiviert'] } as const;
  const [cls, text] = map[a.status];
  return <span className={`pill ${cls}`}>● {text}</span>;
}
