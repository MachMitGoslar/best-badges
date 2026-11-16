import { Link, Navigate } from 'react-router';
import { useMe } from '../hooks.ts';

export function HomePage() {
  const me = useMe();
  if (me.isPending) return <p className="muted">Lade …</p>;
  if (me.error) return <div className="notice notice-error">Konnte dein Profil nicht laden.</div>;
  const orgs = me.data.organisations;
  if (orgs.length === 1) return <Navigate to={`/orgs/${orgs[0]!.id}`} replace />;
  return (
    <div className="stack">
      <h1>Hallo {me.data.name ?? ''}</h1>
      {orgs.length === 0 ? (
        <div className="panel stack">
          <h2>Noch keine Organisation</h2>
          <p className="muted" style={{ margin: 0 }}>
            Abzeichen gestalten können Mitglieder von Organisationen, die im Organisationsportal der Stadt eingetragen sind.
            Sobald du dort Mitglied bist, erscheint deine Organisation hier.
          </p>
        </div>
      ) : (
        <div className="grid achievement-grid">
          {orgs.map((o) => (
            <Link key={o.id} to={`/orgs/${o.id}`} className="panel achievement-card"><h2>{o.name ?? 'Organisation'}</h2><span className="muted small">Abzeichen verwalten →</span></Link>
          ))}
        </div>
      )}
    </div>
  );
}
