import { Link, useParams, useSearchParams } from 'react-router';
import { BadgeView } from '../components/BadgeView.tsx';
import { Qr } from '../components/Qr.tsx';
import { useAchievement, useCodes } from '../hooks.ts';

/** Druckansicht für gedruckte Codes und Gutschein-Stapel (Drucken bzw. „Als PDF sichern“ im Browser). */
export function PrintPage() {
  const { orgId = '', id = '' } = useParams();
  const [params] = useSearchParams();
  const a = useAchievement(orgId, id).data;
  const codes = useCodes(orgId, id).data ?? [];
  const batch = params.get('batch'), single = params.get('code');
  const list = codes.filter((c) => c.url && (batch ? c.batchId === batch : c.id === single));
  if (!a) return <p className="muted">Lade …</p>;
  return (
    <div className="stack">
      <div className="row no-print" style={{ justifyContent: 'space-between' }}>
        <Link to={`/orgs/${orgId}/achievements/${id}/codes`}>← Zurück</Link>
        <button className="btn btn-primary" onClick={() => window.print()}>Drucken / als PDF</button>
      </div>
      <div className="print-grid">
        {list.map((c) => (
          <div key={c.id} className="print-card">
            <div style={{ width: 70, margin: '0 auto' }}><BadgeView spec={a.spec} tier={a.kind === 'tiered' ? 1 : undefined} tierCount={a.kind === 'tiered' ? a.tiers.length : undefined} tilt={false} title={a.name} /></div>
            <strong>{a.name}</strong>
            <Qr value={c.url!} label={`QR-Code für ${a.name}`} />
            <div style={{ fontSize: 11 }}>{c.label || 'Mit der Best-Badges-App scannen'}</div>
          </div>
        ))}
      </div>
      {list.length === 0 && <p className="muted">Keine druckbaren Codes gefunden.</p>}
    </div>
  );
}
