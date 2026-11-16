import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { BadgeView } from '../components/BadgeView.tsx';
import { Qr } from '../components/Qr.tsx';
import { api, unwrap } from '../api.ts';
import { useAchievement, useCode } from '../hooks.ts';

/** Ausgabe-Modus: großer, rotierender QR-Code auf dem Handy der ausgebenden Person. */
export function IssuePage() {
  const { orgId = '', codeId = '' } = useParams();
  const code = useCode(orgId, codeId, 4000);
  const achievement = useAchievement(orgId, code.data?.achievementId);
  const [current, setCurrent] = useState<{ url: string; expiresAt: number; period: number } | null>(null);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let alive = true;
    const load = async () => {
      try {
        const r = await unwrap(api.GET('/api/v1/orgs/{orgId}/codes/{id}/current', { params: { path: { orgId, id: codeId } } }));
        if (!alive) return;
        setCurrent({ url: r.url, expiresAt: Date.now() + r.expiresInSeconds * 1000, period: 15 });
        setError(null);
        timer = setTimeout(load, r.expiresInSeconds * 1000 + 150);
      } catch (e) {
        if (!alive) return;
        setError((e as Error).message);
        timer = setTimeout(load, 5000);
      }
    };
    void load();
    return () => { alive = false; clearTimeout(timer); };
  }, [orgId, codeId]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);

  // Bildschirm nicht abdunkeln, solange der Ausgabe-Modus offen ist
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    return () => { void lock?.release(); };
  }, []);

  const a = achievement.data;
  const left = current ? Math.max(0, current.expiresAt - now) : 0;
  return (
    <div className="issue">
      <div className="issue-card stack" style={{ alignItems: 'center' }}>
        <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
          <Link to={code.data ? `/orgs/${orgId}/achievements/${code.data.achievementId}/codes` : `/orgs/${orgId}`} className="small">← Beenden</Link>
          <span className="muted small">{code.data?.uses ?? 0}× eingelöst</span>
        </div>
        {a && <div style={{ width: 96 }}><BadgeView spec={a.spec} tier={a.kind === 'tiered' ? a.tiers.length : undefined} tierCount={a.kind === 'tiered' ? a.tiers.length : undefined} title={a.name} /></div>}
        <h1>{a?.name ?? 'Abzeichen'}</h1>
        <p className="muted" style={{ margin: 0 }}>Mit der Best-Badges-App scannen</p>
        {error && <div className="notice notice-error">{error}</div>}
        {current && <Qr value={current.url} label={`QR-Code für ${a?.name ?? 'das Abzeichen'}`} />}
        <div className="countdown" style={{ width: 'min(380px, 86vw)' }} aria-hidden="true">
          <div style={{ width: `${Math.min(100, (left / (current?.period ?? 15) / 10))}%` }} />
        </div>
        <p className="muted small" style={{ margin: 0 }}>Der Code wechselt alle 15 Sekunden – ein Foto davon funktioniert nicht.</p>
        {code.data && !code.data.active && <div className="notice notice-warn">Dieser Code ist pausiert.</div>}
      </div>
    </div>
  );
}
