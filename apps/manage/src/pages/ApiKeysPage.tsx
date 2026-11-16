import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiFailure, unwrap } from '../api.ts';
import { useMe } from '../hooks.ts';
import { Icon } from '../components/Icon.tsx';

type Scope = 'awards:create' | 'codes:mint';
const SCOPES: Record<Scope, { title: string; text: string }> = {
  'codes:mint': { title: 'Einmal-Codes erzeugen', text: 'Für Kassensysteme: einen QR-Code mit Menge erzeugen, z. B. für den Bon.' },
  'awards:create': { title: 'Direkt vergeben', text: 'Für Systeme, die die Person kennen: Abzeichen ohne Scan gutschreiben.' },
};

export function ApiKeysPage() {
  const { orgId = '' } = useParams();
  const qc = useQueryClient();
  const org = useMe().data?.organisations.find((o) => o.id === orgId);
  const keys = useQuery({ queryKey: ['api-keys', orgId], queryFn: async () => (await unwrap(api.GET('/api/v1/orgs/{orgId}/api-keys', { params: { path: { orgId } } }))).items });
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<Scope[]>(['codes:mint']);
  const [days, setDays] = useState(180);
  const [secret, setSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/orgs/{orgId}/api-keys', { params: { path: { orgId } }, body: { name: name.trim(), scopes, expiresInDays: days } })),
    onSuccess: (r) => { setSecret(r.secret); setCopied(false); setName(''); void qc.invalidateQueries({ queryKey: ['api-keys', orgId] }); },
    onError: (e) => setError((e as ApiFailure).message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => unwrap(api.DELETE('/api/v1/orgs/{orgId}/api-keys/{id}', { params: { path: { orgId, id } } })),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['api-keys', orgId] }),
  });

  const toggle = (s: Scope) => setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to={`/orgs/${orgId}`}>{org?.name ?? 'Organisation'}</Link> / API-Schlüssel</div>
          <h1>API-Schlüssel</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Für Kassensysteme und andere Programme, die Abzeichen ausgeben. Behandle Schlüssel wie Passwörter.</p>
        </div>
      </div>

      {secret && (
        <div className="notice notice-ok stack" style={{ marginBottom: 16 }} role="status">
          <strong>Neuer Schlüssel – jetzt kopieren, er wird nur dieses eine Mal angezeigt:</strong>
          <code style={{ wordBreak: 'break-all', fontSize: 15 }}>{secret}</code>
          <div className="row">
            <button className="btn btn-sm" onClick={() => void navigator.clipboard.writeText(secret).then(() => setCopied(true))}><Icon name={copied ? 'check' : 'copy'} size={16} /> {copied ? 'Kopiert' : 'Kopieren'}</button>
            <button className="btn btn-sm btn-ghost" onClick={() => setSecret(null)}>Ausblenden</button>
          </div>
          <span className="small muted">Im Header <code>X-Api-Key</code> mitsenden. Die Schnittstellen stehen in der API-Doku unter „Integrationen“.</span>
        </div>
      )}
      {error && <div className="notice notice-error" style={{ marginBottom: 16 }}>{error}</div>}

      <section className="panel stack" style={{ marginBottom: 20 }}>
        <h2>Neuer Schlüssel</h2>
        <label className="field">Bezeichnung<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="z. B. Kasse Museumsshop" /></label>
        <div className="field">Rechte
          {(Object.keys(SCOPES) as Scope[]).map((s) => (
            <label key={s} className="row small" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />
              <span><strong>{SCOPES[s].title}</strong> <span className="muted">– {SCOPES[s].text}</span></span>
            </label>
          ))}
        </div>
        <label className="field" style={{ maxWidth: 220 }}>Gültig (Tage)<input type="number" min={1} max={365} value={days} onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))} /></label>
        <div><button className="btn btn-primary" disabled={!name.trim() || scopes.length === 0 || create.isPending} onClick={() => { setError(null); create.mutate(); }}>Schlüssel erzeugen</button></div>
      </section>

      <section className="panel">
        <div className="panel-title"><h2>Vorhandene Schlüssel</h2></div>
        {keys.isPending && <p className="muted">Lade …</p>}
        {keys.data?.length === 0 && <p className="muted">Noch keine Schlüssel.</p>}
        {keys.data?.map((k) => (
          <div key={k.id} className="code-row">
            <div>
              <div className="row"><strong>{k.name}</strong>{!k.active && <span className="pill">{k.revokedAt ? 'widerrufen' : 'abgelaufen'}</span>}</div>
              <div className="muted small"><code>{k.hint}</code> · {k.scopes.map((s) => SCOPES[s as Scope]?.title ?? s).join(', ')} · gültig bis {new Date(k.expiresAt).toLocaleDateString('de-DE')} · {k.lastUsedAt ? `zuletzt genutzt ${new Date(k.lastUsedAt).toLocaleString('de-DE')}` : 'noch nie genutzt'}</div>
            </div>
            <span />
            {k.active ? (
              <button className="btn btn-sm btn-ghost btn-danger" disabled={revoke.isPending} onClick={() => { if (window.confirm(`Schlüssel „${k.name}“ widerrufen? Programme, die ihn nutzen, funktionieren danach nicht mehr.`)) revoke.mutate(k.id); }}>Widerrufen</button>
            ) : <span />}
          </div>
        ))}
      </section>
    </>
  );
}
