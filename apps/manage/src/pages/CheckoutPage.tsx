import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BadgeView } from '../components/BadgeView.tsx';
import { Qr } from '../components/Qr.tsx';
import { Icon } from '../components/Icon.tsx';
import { api, unwrap } from '../api.ts';
import { useAchievement, useCode } from '../hooks.ts';

/** Kasse: Menge eintippen, einmaligen QR-Code zeigen. */
export function CheckoutPage() {
  const { orgId = '', codeId = '' } = useParams();
  const code = useCode(orgId, codeId, 4000);
  const achievement = useAchievement(orgId, code.data?.achievementId);
  const [value, setValue] = useState(1);
  const [minted, setMinted] = useState<{ url: string; value: number; expiresAt: number } | null>(null);
  const [usesAtMint, setUsesAtMint] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);

  async function mint() {
    setBusy(true); setError(null);
    try {
      const r = await unwrap(api.POST('/api/v1/orgs/{orgId}/codes/{id}/mint', { params: { path: { orgId, id: codeId } }, body: { value } }));
      setMinted({ url: r.url, value: r.value, expiresAt: Date.parse(r.expiresAt) });
      setUsesAtMint(code.data?.uses ?? 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const a = achievement.data;
  const left = minted ? Math.max(0, minted.expiresAt - now) : 0;
  const redeemed = minted && usesAtMint !== null && (code.data?.uses ?? 0) > usesAtMint;
  const mm = Math.floor(left / 60000), ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');

  return (
    <div className="issue">
      <div className="issue-card stack" style={{ alignItems: 'center' }}>
        <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Link to={code.data ? `/orgs/${orgId}/achievements/${code.data.achievementId}/codes` : `/orgs/${orgId}`} className="small">← Beenden</Link>
          <span className="muted small">Kasse · {code.data?.uses ?? 0}× eingelöst</span>
        </div>
        {a && <div style={{ width: 88 }}><BadgeView spec={a.spec} tier={a.kind === 'tiered' ? a.tiers.length : undefined} tierCount={a.kind === 'tiered' ? a.tiers.length : undefined} title={a.name} /></div>}
        <h1>{a?.name ?? 'Abzeichen'}</h1>
        {error && <div className="notice notice-error">{error}</div>}
        {!minted ? (
          <div className="stack" style={{ alignItems: 'center' }}>
            <span className="muted">Menge</span>
            <div className="row">
              <button className="btn btn-lg" onClick={() => setValue(Math.max(1, value - 1))} aria-label="weniger"><Icon name="minus" size={18} /></button>
              <input type="number" min={1} max={100} value={value} onChange={(e) => setValue(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} style={{ width: 90, fontSize: 28, textAlign: 'center' }} aria-label="Menge" />
              <button className="btn btn-lg" onClick={() => setValue(Math.min(100, value + 1))} aria-label="mehr"><Icon name="plus" size={18} /></button>
            </div>
            <button className="btn btn-primary btn-lg" disabled={busy || !code.data?.active} onClick={() => void mint()}>QR-Code erzeugen</button>
            {code.data && !code.data.active && <div className="notice notice-warn">Dieser Kassen-Code ist pausiert.</div>}
          </div>
        ) : redeemed ? (
          <div className="stack" style={{ alignItems: 'center' }}>
            <div className="notice notice-ok row"><Icon name="check" size={18} /> Eingelöst – {minted.value}× gutgeschrieben.</div>
            <button className="btn btn-primary btn-lg" onClick={() => { setMinted(null); setValue(1); }}>Nächster Kunde</button>
          </div>
        ) : (
          <div className="stack" style={{ alignItems: 'center' }}>
            <p className="muted" style={{ margin: 0 }}>{minted.value}× · einmal einlösbar · noch {mm}:{ss}</p>
            {left > 0 ? <Qr value={minted.url} label="Einmaliger QR-Code" /> : <div className="notice notice-warn">Abgelaufen.</div>}
            <button className="btn" onClick={() => { setMinted(null); }}>Abbrechen</button>
          </div>
        )}
      </div>
    </div>
  );
}
