import { useSearchParams } from 'react-router';
import { Logo } from '../components/Layout.tsx';
import { BadgeView } from '../components/BadgeView.tsx';

const ERRORS: Record<string, string> = {
  state: 'Die Anmeldung konnte nicht zugeordnet werden. Bitte noch einmal versuchen.',
  expired: 'Die Anmeldung hat zu lange gedauert. Bitte noch einmal versuchen.',
  login: 'Die Anmeldung ist fehlgeschlagen.',
  access_denied: 'Die Anmeldung wurde abgebrochen.',
};

export function LoginPage() {
  const [params] = useSearchParams();
  const error = params.get('error');
  const returnTo = params.get('returnTo') ?? '/';
  return (
    <div className="issue">
      <div className="issue-card panel stack" style={{ alignItems: 'center', padding: 32 }}>
        <Logo />
        <h1>Best Badges</h1>
        <p className="muted" style={{ margin: 0 }}>Abzeichen gestalten und an Besucherinnen und Besucher ausgeben.</p>
        <div style={{ width: 170, margin: '8px 0' }}>
          <BadgeView spec={{ version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'rays', motif: { type: 'icon', ref: 'trophy' }, palette: 'mango' } }} tier={5} tierCount={5} title="Beispiel-Abzeichen" />
        </div>
        {error && <div className="notice notice-error">{ERRORS[error] ?? 'Die Anmeldung ist fehlgeschlagen.'}</div>}
        <a className="btn btn-primary btn-lg" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>Mit Goslar ID anmelden</a>
        <p className="muted small" style={{ margin: 0 }}>Für Organisationen, die im Organisationsportal eingetragen sind. Ein Angebot des MachMit!Haus Goslar.</p>
      </div>
    </div>
  );
}
