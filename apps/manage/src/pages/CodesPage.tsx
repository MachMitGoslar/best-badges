import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import type { Code, CodeInput } from '@best-badges/api-client';
import { BadgeView } from '../components/BadgeView.tsx';
import { Qr } from '../components/Qr.tsx';
import { PlacePicker, type PlaceValue } from '../components/PlacePicker.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import { Icon, type IconName } from '../components/Icon.tsx';
import { ApiFailure } from '../api.ts';
import { useAchievement, useCodeAction, useCodes, useCreateCode } from '../hooks.ts';

type Template = CodeInput['template'];

const TEMPLATES: Record<Template, { icon: IconName; title: string; text: string }> = {
  station: { icon: 'printer', title: 'Plakat / Station', text: 'Gedruckter QR-Code, z. B. an einer Station im Wald. Jede Person kann ihn einmal einlösen.' },
  event: { icon: 'smartphone', title: 'Veranstaltung', text: 'Du zeigst einen QR-Code auf deinem Handy, der sich alle 15 Sekunden ändert. Abfotografieren bringt nichts.' },
  checkout: { icon: 'bag', title: 'Kasse', text: 'Für Käufe: Du tippst die Menge ein und zeigst einen einmaligen QR-Code, der 10 Minuten gilt.' },
  voucher: { icon: 'layers', title: 'Gutschein-Stapel', text: 'Viele einmalige Codes zum Ausdrucken, z. B. für Eintrittskarten oder Kassenbons.' },
  place: { icon: 'mapPin', title: 'Ort', text: 'Ganz ohne Code: Wer in der App vor Ort ist, checkt ein. Der Ort erscheint auf der Karte. Gut für Einstiegs-Abzeichen.' },
};

function CreateForm({ template, onCreate, onCancel, busy }: { template: Template; onCreate: (i: Omit<CodeInput, 'achievementId'>) => void; onCancel: () => void; busy: boolean }) {
  const [label, setLabel] = useState('');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'unlimited'>('once');
  const [count, setCount] = useState(20);
  const [value, setValue] = useState(1);
  const [validUntil, setValidUntil] = useState('');
  const [useGeo, setUseGeo] = useState(false);
  const [geo, setGeo] = useState({ lat: '', lng: '', radiusM: '80' });
  const [place, setPlace] = useState<PlaceValue | null>(null);
  const [placeName, setPlaceName] = useState('');

  function submit() {
    const input: Omit<CodeInput, 'achievementId'> = { template, label: label.trim() };
    if (template === 'station' || template === 'place') {
      if (repeat === 'daily') { input.perUserLimit = null; input.perUserCooldownSeconds = 24 * 3600; }
      if (repeat === 'unlimited') input.perUserLimit = null;
      if (template === 'station' && useGeo && geo.lat && geo.lng) input.geo = { lat: Number(geo.lat), lng: Number(geo.lng), radiusM: Number(geo.radiusM) };
    }
    if (template === 'place') { input.geo = place; input.placeName = placeName.trim(); }
    if (template === 'voucher') { input.count = count; input.value = value; }
    if (validUntil) input.validUntil = new Date(validUntil).toISOString();
    onCreate(input);
  }

  return (
    <div className="panel stack">
      <h2 className="row"><Icon name={TEMPLATES[template].icon} size={22} /> {TEMPLATES[template].title}</h2>
      <label className="field">Bezeichnung (nur für dich)<input value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} placeholder={template === 'station' ? 'z. B. Station 3: Ameisenhaufen' : 'z. B. Sommerfest 2027'} /></label>
      {template === 'place' && (
        <>
          <label className="field">Name des Ortes (öffentlich auf der Karte)<input value={placeName} maxLength={80} onChange={(e) => setPlaceName(e.target.value)} placeholder="z. B. Kaiserpfalz" /></label>
          <PlacePicker value={place} onChange={setPlace} />
        </>
      )}
      {(template === 'station' || template === 'place') && (
        <>
          <div className="field">Wie oft pro Person?
            <div className="seg">
              <button aria-pressed={repeat === 'once'} onClick={() => setRepeat('once')}>Einmal</button>
              <button aria-pressed={repeat === 'daily'} onClick={() => setRepeat('daily')}>Einmal pro Tag</button>
              <button aria-pressed={repeat === 'unlimited'} onClick={() => setRepeat('unlimited')}>Beliebig</button>
            </div>
          </div>
          {template === 'station' && <label className="row small"><input type="checkbox" checked={useGeo} onChange={(e) => setUseGeo(e.target.checked)} /> Nur in der Nähe einlösbar (Standort)</label>}
          {template === 'station' && useGeo && (
            <div className="row">
              <label className="field">Breite<input value={geo.lat} onChange={(e) => setGeo({ ...geo, lat: e.target.value })} placeholder="51.9055" /></label>
              <label className="field">Länge<input value={geo.lng} onChange={(e) => setGeo({ ...geo, lng: e.target.value })} placeholder="10.4297" /></label>
              <label className="field">Radius (m)<input type="number" min={10} max={5000} value={geo.radiusM} onChange={(e) => setGeo({ ...geo, radiusM: e.target.value })} /></label>
              <button className="btn btn-sm" onClick={() => navigator.geolocation?.getCurrentPosition((p) => setGeo({ ...geo, lat: p.coords.latitude.toFixed(5), lng: p.coords.longitude.toFixed(5) }))}>Mein Standort</button>
            </div>
          )}
        </>
      )}
      {template === 'voucher' && (
        <div className="row">
          <label className="field">Anzahl Codes<input type="number" min={1} max={500} value={count} onChange={(e) => setCount(Number(e.target.value))} /></label>
          <label className="field">Wert je Code<input type="number" min={1} max={1000} value={value} onChange={(e) => setValue(Number(e.target.value))} /></label>
        </div>
      )}
      {template !== 'checkout' && <label className="field">Gültig bis (optional)<input type="datetime-local" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>}
      <div className="row">
        <button className="btn btn-primary" disabled={busy || (template === 'place' && (!place || !placeName.trim()))} onClick={submit}>{busy ? 'Legt an …' : 'Anlegen'}</button>
        <button className="btn btn-ghost" onClick={onCancel}>Abbrechen</button>
      </div>
    </div>
  );
}

function usage(c: Code) {
  const per = c.perUserLimit === null ? (c.perUserCooldownSeconds ? 'einmal pro Tag' : 'beliebig oft') : c.perUserLimit === 1 ? 'einmal' : `${c.perUserLimit}×`;
  return `${c.uses}${c.maxTotal ? ` / ${c.maxTotal}` : ''} eingelöst · pro Person ${per}${c.value > 1 ? ` · Wert ${c.value}` : ''}${c.geo && c.template !== 'place' ? ' · mit Standort' : ''}${c.placeName ? ` · ${c.placeName}, Radius ${c.geo?.radiusM ?? '?'} m` : ''}`;
}

export function CodesPage() {
  const { orgId = '', id = '' } = useParams();
  const achievement = useAchievement(orgId, id);
  const codes = useCodes(orgId, id);
  const create = useCreateCode(orgId);
  const action = useCodeAction(orgId, id);
  const [template, setTemplate] = useState<Template | null>(null);
  const [openQr, setOpenQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { singles, batches } = useMemo(() => {
    const singles: Code[] = [];
    const batches = new Map<string, Code[]>();
    for (const c of codes.data ?? []) {
      if (c.batchId) batches.set(c.batchId, [...(batches.get(c.batchId) ?? []), c]);
      else singles.push(c);
    }
    return { singles, batches: [...batches.entries()] };
  }, [codes.data]);

  const a = achievement.data;
  if (achievement.isPending) return <p className="muted">Lade …</p>;
  if (!a) return <div className="notice notice-error">Abzeichen nicht gefunden.</div>;
  const usable = a.status === 'live' && !a.veto;

  async function onCreate(input: Omit<CodeInput, 'achievementId'>) {
    setError(null);
    try {
      const created = await create.mutateAsync({ ...input, achievementId: id });
      setTemplate(null);
      if (created.length === 1 && created[0]!.url) setOpenQr(created[0]!.id);
    } catch (e) {
      const f = e as ApiFailure;
      setError([f.message, ...f.issues.map((i) => `${i.path}: ${i.message}`)].join(' · '));
    }
  }

  async function act(c: Code, kind: 'rotate' | 'activate' | 'deactivate') {
    if (kind === 'rotate' && !window.confirm('Neuen Code erzeugen? Der bisherige QR-Code funktioniert danach nicht mehr – gedruckte Codes müssen ersetzt werden.')) return;
    await action.mutateAsync({ id: c.id, action: kind });
  }

  return (
    <>
      <div className="page-head">
        <div className="row" style={{ alignItems: 'center', gap: 16 }}>
          <div style={{ width: 72 }}><BadgeView spec={a.spec} tier={a.kind === 'tiered' ? a.tiers.length : undefined} tierCount={a.kind === 'tiered' ? a.tiers.length : undefined} title={a.name} /></div>
          <div>
            <div className="crumbs"><Link to={`/orgs/${orgId}`}>Abzeichen</Link> / <Link to={`/orgs/${orgId}/achievements/${id}`}>{a.name}</Link> / Codes</div>
            <div className="row"><h1>Codes &amp; Ausgabe</h1><StatusPill a={a} /></div>
          </div>
        </div>
      </div>

      {!usable && (
        <div className="notice notice-warn" style={{ marginBottom: 16 }}>
          {a.veto ? 'Wegen eines Vetos kann dieses Abzeichen gerade nicht eingelöst werden.' : a.status === 'draft' ? 'Das Abzeichen ist noch ein Entwurf. Codes kannst du schon anlegen, einlösen lässt es sich erst nach dem Veröffentlichen.' : 'Archivierte Abzeichen lassen sich nicht mehr einlösen.'}
        </div>
      )}
      {error && <div className="notice notice-error" style={{ marginBottom: 16 }}>{error}</div>}

      {a.autoRule && <div className="notice" style={{ marginBottom: 16 }}>Plattform-Abzeichen werden automatisch nach ihrer Regel vergeben und brauchen keine Codes.</div>}
      {a.status !== 'archived' && !a.autoRule && (template ? (
        <CreateForm template={template} busy={create.isPending} onCreate={(i) => void onCreate(i)} onCancel={() => setTemplate(null)} />
      ) : (
        <section className="stack" style={{ marginBottom: 24 }}>
          <h2>Neuer Code</h2>
          <div className="grid templates">
            {(Object.keys(TEMPLATES) as Template[]).map((t) => (
              <button key={t} className="panel template-card stack" onClick={() => setTemplate(t)}>
                <span className="tpl-icon"><Icon name={TEMPLATES[t].icon} size={22} /></span>
                <h3>{TEMPLATES[t].title}</h3>
                <span className="muted small">{TEMPLATES[t].text}</span>
              </button>
            ))}
          </div>
        </section>
      ))}

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="panel-title"><h2>Vorhandene Codes</h2></div>
        {codes.isPending && <p className="muted">Lade …</p>}
        {codes.data?.length === 0 && <p className="muted">Noch keine Codes.</p>}
        {singles.map((c) => (
          <div key={c.id}>
            <div className="code-row">
              <div>
                <div className="row"><strong className="row" style={{ gap: 8 }}><Icon name={TEMPLATES[c.template].icon} size={16} /> {c.label || TEMPLATES[c.template].title}</strong>{!c.active && <span className="pill">inaktiv</span>}</div>
                <div className="muted small">{usage(c)}</div>
              </div>
              <div className="row">
                {c.url && <button className="btn btn-sm" onClick={() => setOpenQr(openQr === c.id ? null : c.id)}>{openQr === c.id ? 'QR ausblenden' : 'QR-Code'}</button>}
                {c.template === 'event' && <Link className="btn btn-sm btn-primary" to={`/orgs/${orgId}/codes/${c.id}/issue`}>Ausgabe-Modus</Link>}
                {c.template === 'checkout' && <Link className="btn btn-sm btn-primary" to={`/orgs/${orgId}/codes/${c.id}/checkout`}>Kasse öffnen</Link>}
              </div>
              <div className="row">
                <button className="btn btn-sm btn-ghost" onClick={() => void act(c, c.active ? 'deactivate' : 'activate')}>{c.active ? 'Pausieren' : 'Aktivieren'}</button>
                <button className="btn btn-sm btn-ghost" onClick={() => void act(c, 'rotate')}>Neu erzeugen</button>
              </div>
            </div>
            {openQr === c.id && c.url && (
              <div className="row" style={{ padding: '4px 0 16px', alignItems: 'flex-start', gap: 20 }}>
                <div style={{ width: 200 }}><Qr value={c.url} label={`QR-Code für ${a.name}`} /></div>
                <div className="stack small" style={{ alignItems: 'flex-start' }}>
                  <span className="muted">Link im QR-Code:</span><code style={{ wordBreak: 'break-all' }}>{c.url}</code>
                  <Link className="btn btn-sm" to={`/orgs/${orgId}/achievements/${id}/print?code=${c.id}`}>Druckansicht</Link>
                </div>
              </div>
            )}
          </div>
        ))}
        {batches.map(([batchId, list]) => (
          <div key={batchId} className="code-row">
            <div>
              <strong className="row" style={{ gap: 8 }}><Icon name="layers" size={16} /> {list[0]!.label || 'Gutschein-Stapel'}</strong>
              <div className="muted small">{list.length} Gutscheine · {list.filter((c) => c.uses > 0).length} eingelöst · Wert {list[0]!.value}</div>
            </div>
            <Link className="btn btn-sm btn-primary" to={`/orgs/${orgId}/achievements/${id}/print?batch=${batchId}`}>Drucken</Link>
            <span />
          </div>
        ))}
      </section>
    </>
  );
}
