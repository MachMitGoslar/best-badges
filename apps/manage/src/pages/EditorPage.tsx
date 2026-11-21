import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import {
  SECRET_NAME, SECRET_SPEC, BadgeSpecSchema, ICONS, ICON_IDS, PALETTES, PALETTE_IDS, PATTERNS, RARITIES, SHAPES, materialForTier, MATERIALS, randomSpec,
  type BadgeSpec, type IconId, type PaletteId, type PatternId, type Rarity, type ShapeId,
} from '@best-badges/badge-spec';
import type { AchievementInput, components } from '@best-badges/api-client';
import { BadgeView } from '../components/BadgeView.tsx';
// three.js erst laden, wenn der Editor offen ist (hält die Startseite schlank)
const Badge3D = lazy(() => import('../components/Badge3D.tsx').then((m) => ({ default: m.Badge3D })));
import { StatusPill } from '../components/StatusPill.tsx';
import { Icon } from '../components/Icon.tsx';
import { ApiFailure } from '../api.ts';
import { useAchievement, useCollectionCandidates, useMe, useSaveAchievement, useTransition } from '../hooks.ts';

type Tab = 'shape' | 'pattern' | 'motif' | 'palette';
type Kind = 'single' | 'tiered' | 'collection';
type AutoRule = NonNullable<components['schemas']['AutoRule']>;

/** Regeln für Plattform-Abzeichen (nur Haupt-Admin-Organisation) */
const AUTO_RULES: Record<AutoRule, string> = {
  active_days: 'App genutzt – Anzahl Tage mit geöffneter App',
  awards_count: 'Abzeichen gesammelt – Anzahl verschiedener Abzeichen',
  orgs_count: 'Vielseitig – Abzeichen von verschiedenen Organisationen',
  places_count: 'Unterwegs – an verschiedenen Orten eingecheckt',
  collections_count: 'Kombiniert – geschaffte Kombinationen',
};
const STATE_LABEL = { approved: 'zugestimmt', pending: 'wartet auf Zustimmung', rejected: 'abgelehnt' } as const;
interface TierDraft { threshold: number; name: string }

const DEFAULT_SPEC: BadgeSpec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'rays', motif: { type: 'icon', ref: 'star' }, palette: 'moss' } };
const DEFAULT_TIERS: TierDraft[] = [{ threshold: 3, name: '' }, { threshold: 6, name: '' }, { threshold: 10, name: '' }];

function IconGlyph({ id }: { id: IconId }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICONS[id].nodes.map(([tag, attrs], i) => {
        const Tag = tag as 'path';
        return <Tag key={i} {...(attrs as Record<string, string>)} />;
      })}
    </svg>
  );
}

export function EditorPage() {
  const { orgId = '', id } = useParams();
  const navigate = useNavigate();
  const existing = useAchievement(orgId, id);
  const save = useSaveAchievement(orgId);
  const transition = useTransition(orgId);

  const [spec, setSpec] = useState<BadgeSpec>(DEFAULT_SPEC);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [awardedText, setAwardedText] = useState('');
  const [kind, setKind] = useState<Kind>('tiered');
  const [hidden, setHidden] = useState(false);
  const [hint, setHint] = useState('');
  const [openForCollections, setOpenForCollections] = useState(false);
  const [autoRule, setAutoRule] = useState<AutoRule | null>(null);
  const me = useMe();
  const isAdminOrg = !!me.data?.adminOrgId && me.data.adminOrgId === orgId;
  const [items, setItems] = useState<string[]>([]);
  const [requiredCount, setRequiredCount] = useState(2);
  const [itemFilter, setItemFilter] = useState('');
  const candidateList = useCollectionCandidates(orgId);
  const [tiers, setTiers] = useState<TierDraft[]>(DEFAULT_TIERS);
  const [tab, setTab] = useState<Tab>('shape');
  const [previewTier, setPreviewTier] = useState<number | 'max'>('max');
  const [rarity, setRarity] = useState<Rarity>('common');
  const [loaded, setLoaded] = useState(!id);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string; issues?: string[] } | null>(null);
  const [monogram, setMonogram] = useState('GS');
  const [logoUrl, setLogoUrl] = useState('');

  // Vorhandenes Abzeichen einmalig in den Editor übernehmen
  useEffect(() => {
    const a = existing.data;
    if (!a || loaded) return;
    setSpec(a.spec); setName(a.name); setDescription(a.description); setAwardedText(a.awardedText);
    setKind(a.kind);
    setHidden(a.hidden); setHint(a.hint); setOpenForCollections(a.openForCollections); setAutoRule(a.autoRule);
    if (a.kind === 'collection') { setItems(a.items.map((i) => i.achievementId)); setRequiredCount(a.requiredCount ?? 2); }
    if (a.kind === 'tiered') setTiers(a.tiers.map((t) => ({ threshold: t.threshold, name: t.name ?? '' })));
    if (a.spec.emblem.motif.type === 'monogram') setMonogram(a.spec.emblem.motif.text);
    if (a.spec.emblem.motif.type === 'logo') setLogoUrl(a.spec.emblem.motif.url);
    setLoaded(true);
  }, [existing.data, loaded]);

  const a = existing.data;
  const status = a?.status ?? 'draft';
  const structural = status === 'draft';
  const readOnly = status === 'archived';
  const tierCount = kind === 'tiered' ? tiers.length : 0;
  const shownTier = kind === 'tiered' ? (previewTier === 'max' ? tierCount : Math.min(previewTier, tierCount)) : undefined;
  const emblem = spec.emblem;
  const setEmblem = (patch: Partial<BadgeSpec['emblem']>) => setSpec((s) => ({ ...s, emblem: { ...s.emblem, ...patch } }));
  const specValid = useMemo(() => BadgeSpecSchema.safeParse(spec).success, [spec]);

  const tierError = useMemo(() => {
    if (kind !== 'tiered') return null;
    if (tiers.length < 2 || tiers.length > 10) return 'Zwei bis zehn Stufen';
    for (let i = 0; i < tiers.length; i++) {
      if (!Number.isInteger(tiers[i]!.threshold) || tiers[i]!.threshold < 1) return `Stufe ${i + 1}: Schwelle muss mindestens 1 sein`;
      if (i > 0 && tiers[i]!.threshold <= tiers[i - 1]!.threshold) return `Stufe ${i + 1}: Schwelle muss größer sein als bei Stufe ${i}`;
    }
    return null;
  }, [kind, tiers]);

  /** Mögliche Teile: eigene (auch Entwürfe) und von anderen Organisationen freigegebene; nicht sich selbst. */
  const candidates = useMemo(() => (candidateList.data ?? [])
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, name: c.name ?? SECRET_NAME, spec: (c.spec ?? SECRET_SPEC) as BadgeSpec, own: c.own, draft: c.draft, secret: c.secret })), [candidateList.data, id]);
  const itemStates = new Map((a?.items ?? []).map((i) => [i.achievementId, i.state] as const));
  const shownCandidates = candidates.filter((c) => items.includes(c.id) || c.name.toLowerCase().includes(itemFilter.trim().toLowerCase()));

  const collectionError = useMemo(() => {
    if (kind !== 'collection') return null;
    if (items.length < 2) return 'Wähle mindestens zwei Teile';
    if (items.length > 20) return 'Höchstens 20 Teile';
    if (requiredCount < 1 || requiredCount > items.length) return `N muss zwischen 1 und ${items.length} liegen`;
    return null;
  }, [kind, items, requiredCount]);

  async function onSave() {
    setMessage(null);
    const input: AchievementInput = {
      name: name.trim(), description: description.trim(), awardedText: awardedText.trim(), spec,
      kind, hidden, hint: hint.trim(), openForCollections,
      ...(kind === 'tiered' ? { tiers: tiers.map((t) => ({ threshold: t.threshold, name: t.name.trim() || null })) } : {}),
      ...(kind === 'collection' ? { items, requiredCount } : {}),
      ...(isAdminOrg && kind !== 'collection' ? { autoRule } : {}),
    };
    // Art, Stufen und Teile lassen sich nur im Entwurf ändern
    const body = structural ? input : { name: input.name, description: input.description, awardedText: input.awardedText, spec, hidden, hint: hint.trim(), openForCollections } as AchievementInput;
    try {
      const saved = await save.mutateAsync({ id, input: body });
      setMessage({ kind: 'ok', text: 'Gespeichert.' });
      if (!id) navigate(`/orgs/${orgId}/achievements/${saved.id}`, { replace: true });
    } catch (e) {
      const f = e as ApiFailure;
      setMessage({ kind: 'error', text: f.message, issues: f.issues?.map((i) => `${i.path}: ${i.message}`) });
    }
  }

  async function onTransition(action: 'publish' | 'archive') {
    const text = action === 'publish'
      ? (kind === 'collection'
        ? 'Veröffentlichen? Wer die nötigen Teile schon hat, bekommt die Kombination sofort. Danach lassen sich die Teile nicht mehr ändern.'
        : 'Veröffentlichen? Danach lassen sich Art und Stufen nicht mehr ändern.')
      : 'Archivieren? Das Abzeichen verschwindet aus der App, Codes funktionieren nicht mehr. Vergebene Abzeichen bleiben erhalten.';
    if (!id || !window.confirm(text)) return;
    try {
      await transition.mutateAsync({ id, action });
      setMessage({ kind: 'ok', text: action === 'publish' ? 'Veröffentlicht – das Abzeichen ist jetzt in der App sichtbar.' : 'Archiviert.' });
    } catch (e) {
      setMessage({ kind: 'error', text: (e as Error).message });
    }
  }

  if (id && existing.isPending) return <p className="muted">Lade …</p>;
  if (id && existing.error) return <div className="notice notice-error">Abzeichen nicht gefunden.</div>;

  const variant = (patch: Partial<BadgeSpec['emblem']>): BadgeSpec => ({ ...spec, emblem: { ...emblem, ...patch } });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to={`/orgs/${orgId}`}>Abzeichen</Link> / {id ? 'Bearbeiten' : 'Neu'}</div>
          <div className="row"><h1>{name.trim() || 'Neues Abzeichen'}</h1>{a && <StatusPill a={a} />}</div>
        </div>
        <div className="row">
          {id && kind !== 'collection' && <Link className="btn" to={`/orgs/${orgId}/achievements/${id}/codes`}>Codes &amp; Ausgabe</Link>}
          {id && status === 'draft' && <button className="btn" disabled={!!a?.veto || transition.isPending} onClick={() => void onTransition('publish')}>Veröffentlichen</button>}
          {id && status !== 'archived' && <button className="btn btn-ghost btn-danger" disabled={transition.isPending} onClick={() => void onTransition('archive')}>Archivieren</button>}
          {!readOnly && <button className="btn btn-primary" disabled={!name.trim() || !specValid || !!tierError || !!collectionError || save.isPending} onClick={() => void onSave()}>{save.isPending ? 'Speichert …' : 'Speichern'}</button>}
        </div>
      </div>

      {a?.veto && <div className="notice notice-error" style={{ marginBottom: 16 }}><strong>Veto der Haupt-Admin-Organisation:</strong> {a.veto.reason}</div>}
      {message && (
        <div className={`notice ${message.kind === 'ok' ? 'notice-ok' : 'notice-error'}`} style={{ marginBottom: 16 }} role="status">
          {message.text}
          {message.issues && message.issues.length > 0 && <ul style={{ margin: '6px 0 0' }}>{message.issues.map((i) => <li key={i}>{i}</li>)}</ul>}
        </div>
      )}

      <div className="grid editor">
        <div className="stack">
          <section className="panel">
            <div className="panel-title">
              <h2>Gestaltung</h2>
              {!readOnly && <button className="btn btn-sm" onClick={() => setSpec(randomSpec(Math.floor(Math.random() * 1e9)))} title="Zufälliger Vorschlag"><Icon name="shuffle" size={16} /> Würfeln</button>}
            </div>
            <div className="tabs" role="tablist">
              {([['shape', '1 · Form'], ['pattern', '2 · Muster'], ['motif', '3 · Motiv'], ['palette', '4 · Farbe']] as [Tab, string][]).map(([t, label]) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>{label}</button>
              ))}
            </div>
            <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
              {tab === 'shape' && (
                <div className="choices">
                  {(Object.keys(SHAPES) as ShapeId[]).map((s) => (
                    <button key={s} className="choice" aria-pressed={emblem.shape === s} onClick={() => setEmblem({ shape: s })}>
                      <BadgeView className="mini" spec={variant({ shape: s })} tilt={false} title={SHAPES[s]} />{SHAPES[s]}
                    </button>
                  ))}
                </div>
              )}
              {tab === 'pattern' && (
                <div className="choices">
                  {(Object.keys(PATTERNS) as PatternId[]).map((p) => (
                    <button key={p} className="choice" aria-pressed={emblem.pattern === p} onClick={() => setEmblem({ pattern: p })}>
                      <BadgeView className="mini" spec={variant({ pattern: p })} tilt={false} title={PATTERNS[p]} />{PATTERNS[p]}
                    </button>
                  ))}
                </div>
              )}
              {tab === 'motif' && (
                <div className="stack">
                  <div className="seg" role="group" aria-label="Art des Motivs">
                    <button aria-pressed={emblem.motif.type === 'icon'} onClick={() => setEmblem({ motif: { type: 'icon', ref: emblem.motif.type === 'icon' ? emblem.motif.ref : 'star' } })}>Symbol</button>
                    <button aria-pressed={emblem.motif.type === 'monogram'} onClick={() => setEmblem({ motif: { type: 'monogram', text: monogram || 'GS' } })}>Buchstaben</button>
                    <button aria-pressed={emblem.motif.type === 'logo'} onClick={() => logoUrl && setEmblem({ motif: { type: 'logo', url: logoUrl } })}>Logo</button>
                  </div>
                  {emblem.motif.type === 'icon' && (
                    <div className="choices icons">
                      {ICON_IDS.map((i) => (
                        <button key={i} className="choice" aria-pressed={emblem.motif.type === 'icon' && emblem.motif.ref === i} onClick={() => setEmblem({ motif: { type: 'icon', ref: i } })} title={ICONS[i].label}>
                          <IconGlyph id={i} />{ICONS[i].label}
                        </button>
                      ))}
                    </div>
                  )}
                  {emblem.motif.type === 'monogram' && (
                    <label className="field">1 bis 3 Buchstaben oder Ziffern
                      <input value={monogram} maxLength={3} onChange={(e) => {
                        const v = e.target.value.replace(/[^\p{L}\p{N}]/gu, '').slice(0, 3);
                        setMonogram(v);
                        if (v) setEmblem({ motif: { type: 'monogram', text: v } });
                      }} />
                    </label>
                  )}
                  {(emblem.motif.type === 'logo' || logoUrl !== '') && (
                    <label className="field">Logo-Adresse (https://…). Das Logo wird automatisch einfarbig in der Motivfarbe dargestellt.
                      <input value={logoUrl} placeholder="https://…/logo.png" onChange={(e) => {
                        setLogoUrl(e.target.value);
                        const candidate = { ...spec, emblem: { ...emblem, motif: { type: 'logo' as const, url: e.target.value.trim() } } };
                        if (BadgeSpecSchema.safeParse(candidate).success) setSpec(candidate);
                      }} />
                    </label>
                  )}
                </div>
              )}
              {tab === 'palette' && (
                <div className="choices">
                  {PALETTE_IDS.map((p: PaletteId) => (
                    <button key={p} className="choice" aria-pressed={emblem.palette === p} onClick={() => setEmblem({ palette: p })}>
                      <span className="swatch" style={{ background: `radial-gradient(circle at 35% 30%, ${PALETTES[p].light}, ${PALETTES[p].base} 55%, ${PALETTES[p].deep})` }} />
                      {PALETTES[p].label}
                    </button>
                  ))}
                </div>
              )}
            </fieldset>
          </section>

          <section className="panel stack">
            <h2>Texte</h2>
            <fieldset disabled={readOnly} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
              <label className="field">Name<input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="z. B. Walderlebnispfad" /></label>
              <label className="field">So bekommt man es<textarea value={description} maxLength={500} onChange={(e) => setDescription(e.target.value)} placeholder="z. B. Besuche die Stationen am Pfad und scanne die QR-Codes." /></label>
              <label className="field">Text beim Erhalt<textarea value={awardedText} maxLength={500} onChange={(e) => setAwardedText(e.target.value)} placeholder="z. B. Stark! Du kennst den Wald jetzt besser als die Eichhörnchen." /></label>
            </fieldset>
          </section>

          <section className="panel stack">
            <div className="panel-title" style={{ marginBottom: 0 }}>
              <h2>Sichtbarkeit</h2>
              <div className="seg" role="group" aria-label="Sichtbarkeit">
                <button aria-pressed={!hidden} disabled={readOnly} onClick={() => setHidden(false)}><Icon name="eye" size={14} /> Offen</button>
                <button aria-pressed={hidden} disabled={readOnly} onClick={() => setHidden(true)}><Icon name="eyeOff" size={14} /> Versteckt</button>
              </div>
            </div>
            {hidden ? (
              <>
                <p className="muted small" style={{ margin: 0 }}>In der App erscheint nur ein Fragezeichen mit deinem Hinweis. Name, Beschreibung und Design sieht man erst, wenn man das Abzeichen hat.</p>
                <label className="field">Hinweis (öffentlich, optional)
                  <input value={hint} maxLength={140} disabled={readOnly} onChange={(e) => setHint(e.target.value)} placeholder="z. B. Folge den Pilzen bis zur Lichtung" />
                </label>
              </>
            ) : <p className="muted small" style={{ margin: 0 }}>Alle sehen Name, Beschreibung und Design schon vor dem Sammeln.</p>}
            {kind !== 'collection' && (
              <>
                <div className="panel-title" style={{ marginBottom: 0, marginTop: 8 }}>
                  <h3 style={{ margin: 0 }}>Kombinationen anderer Organisationen</h3>
                  <div className="seg" role="group" aria-label="Für Kombinationen freigeben">
                    <button aria-pressed={!openForCollections} disabled={readOnly} onClick={() => setOpenForCollections(false)}>Nicht freigegeben</button>
                    <button aria-pressed={openForCollections} disabled={readOnly} onClick={() => setOpenForCollections(true)}><Icon name="link" size={14} /> Freigegeben</button>
                  </div>
                </div>
                <p className="muted small" style={{ margin: 0 }}>{openForCollections
                  ? 'Andere Organisationen können dieses Abzeichen für ihre Kombination anfragen. Du entscheidest jede Anfrage einzeln.'
                  : 'Nur deine Organisation kann dieses Abzeichen in Kombinationen verwenden.'}</p>
              </>
            )}
          </section>

          {isAdminOrg && (
            <section className="panel stack">
              <h2>Automatische Vergabe</h2>
              <p className="muted small" style={{ margin: 0 }}>
                Plattform-Abzeichen bekommt man ohne Code, sobald eine Kennzahl die Schwelle erreicht. Bei „Mit Stufen“ gelten die Stufen-Schwellen,
                ohne Stufen reicht 1. Plattform-Abzeichen zählen selbst nicht mit. Wer schon gesammelt hat, bekommt es beim nächsten Öffnen der App.
              </p>
              <label className="field">Regel
                <select value={autoRule ?? ''} disabled={!structural || kind === 'collection'} onChange={(e) => setAutoRule((e.target.value || null) as AutoRule | null)}>
                  <option value="">Keine – Vergabe über Codes</option>
                  {(Object.keys(AUTO_RULES) as AutoRule[]).map((r) => <option key={r} value={r}>{AUTO_RULES[r]}</option>)}
                </select>
              </label>
              {kind === 'collection' && <p className="muted small" style={{ margin: 0 }}>Kombinationen lassen sich nicht automatisch vergeben.</p>}
            </section>
          )}

          <section className="panel stack">
            <div className="panel-title" style={{ marginBottom: 0 }}>
              <h2>Art</h2>
              <div className="seg" role="group" aria-label="Art des Abzeichens">
                <button aria-pressed={kind === 'single'} disabled={!structural} onClick={() => setKind('single')}>Ohne Stufen</button>
                <button aria-pressed={kind === 'tiered'} disabled={!structural} onClick={() => setKind('tiered')}>Mit Stufen</button>
                <button aria-pressed={kind === 'collection'} disabled={!structural} onClick={() => setKind('collection')}>Kombination</button>
              </div>
            </div>
            {!structural && <p className="muted small" style={{ margin: 0 }}>Nach dem Veröffentlichen lassen sich Art, Stufen und Teile nicht mehr ändern.</p>}
            {kind === 'collection' ? (
              <div className="stack">
                <p className="muted small" style={{ margin: 0 }}>Wer genug der gewählten Abzeichen hat, bekommt die Kombination automatisch – auch rückwirkend. Zur Auswahl stehen deine Abzeichen und die, die andere Organisationen für Kombinationen freigegeben haben; diese zählen erst nach ihrer Zustimmung.</p>
                <div className="row">
                  <label className="field" style={{ width: 120 }}>Benötigt (N)
                    <input type="number" min={1} max={Math.max(1, items.length)} value={requiredCount} disabled={!structural} onChange={(e) => setRequiredCount(Number(e.target.value))} />
                  </label>
                  <span className="muted" style={{ alignSelf: 'flex-end', paddingBottom: 10 }}>von {items.length} gewählten Teilen</span>
                  <label className="field" style={{ flex: 1, minWidth: 180 }}>Suchen
                    <input value={itemFilter} onChange={(e) => setItemFilter(e.target.value)} placeholder="Name des Abzeichens" />
                  </label>
                </div>
                <div className="choices items">
                  {shownCandidates.map((c) => {
                    const on = items.includes(c.id);
                    const state = itemStates.get(c.id);
                    return (
                      <button key={c.id} className="choice" aria-pressed={on} disabled={!structural}
                        onClick={() => setItems(on ? items.filter((x) => x !== c.id) : [...items, c.id])}>
                        <BadgeView className="mini" spec={c.spec} tilt={false} title={c.name} />
                        <span className="item-name">{c.name}</span>
                        <span className="item-meta">{c.own ? (c.draft ? 'eigener Entwurf' : 'eigenes') : 'andere Organisation'}{on && state && state !== 'approved' ? ` · ${STATE_LABEL[state]}` : ''}</span>
                      </button>
                    );
                  })}
                  {shownCandidates.length === 0 && <p className="muted small">Keine passenden Abzeichen.</p>}
                </div>
                {collectionError && <span className="small" style={{ color: 'var(--danger)' }}>{collectionError}</span>}
              </div>
            ) : kind === 'single' ? (
              <p className="muted" style={{ margin: 0 }}>Einmal gesammelt, fertig. Der Rahmen erscheint in der Farbe des Emblems.</p>
            ) : (
              <div className="stack">
                <p className="muted small" style={{ margin: 0 }}>Jede Einlösung zählt zum Fortschritt. Bei jeder Schwelle steigt das Abzeichen eine Stufe auf, das Material wechselt automatisch.</p>
                {tiers.map((t, i) => (
                  <div key={i} className="tier-row">
                    <span className="muted small">Stufe {i + 1}<br /><strong style={{ color: 'var(--text)' }}>{MATERIALS[materialForTier(i + 1, tiers.length)]}</strong></span>
                    <label className="field">ab Anzahl
                      <input type="number" min={1} value={t.threshold} disabled={!structural} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, threshold: Number(e.target.value) } : x)))} />
                    </label>
                    <label className="field">Name der Stufe (optional)
                      <input data-name value={t.name} maxLength={80} disabled={!structural} placeholder={['Entdecker', 'Kenner', 'Profi', 'Meister', 'Legende'][i] ?? ''} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    </label>
                    <button className="btn btn-sm btn-ghost" disabled={!structural || tiers.length <= 2} onClick={() => setTiers(tiers.filter((_, j) => j !== i))} aria-label={`Stufe ${i + 1} entfernen`}><Icon name="x" size={16} /></button>
                  </div>
                ))}
                <div className="row">
                  <button className="btn btn-sm" disabled={!structural || tiers.length >= 10} onClick={() => setTiers([...tiers, { threshold: (tiers.at(-1)?.threshold ?? 0) + 5, name: '' }])}><Icon name="plus" size={16} /> Stufe hinzufügen</button>
                  {tierError && <span className="small" style={{ color: 'var(--danger)' }}>{tierError}</span>}
                </div>
              </div>
            )}
          </section>
        </div>

        <aside className="editor-preview panel">
          <div className="panel-title"><h2>Vorschau</h2><span className="muted small">Mit der Maus bewegen</span></div>
          <div className="preview-stage">
            <Suspense fallback={<BadgeView spec={spec} tier={shownTier} tierCount={kind === 'tiered' ? tierCount : undefined} title={name || 'Vorschau'} />}>
              <Badge3D rarity={rarity} spec={spec} tier={shownTier} tierCount={kind === 'tiered' ? tierCount : undefined} gems={kind === 'collection' ? { total: Math.max(1, requiredCount), filled: Math.max(1, requiredCount) } : undefined} title={name || 'Vorschau'} />
            </Suspense>
          </div>
          <h3 style={{ textAlign: 'center', marginTop: 8 }}>{name.trim() || 'Name des Abzeichens'}</h3>
          {kind === 'collection' && <p className="muted small" style={{ textAlign: 'center', margin: '2px 0 0' }}>{requiredCount} von {items.length} Teilen</p>}
          {hidden && <p className="small" style={{ textAlign: 'center', margin: '6px 0 0', color: 'var(--brand-ink)' }}><Icon name="eyeOff" size={14} /> Versteckt – in der App erst nach dem Sammeln sichtbar</p>}
          {kind === 'tiered' && shownTier && (
            <p className="muted small" style={{ textAlign: 'center', margin: '2px 0 0' }}>
              Stufe {shownTier}{tiers[shownTier - 1]?.name ? ` · ${tiers[shownTier - 1]!.name}` : ''} · ab {tiers[shownTier - 1]?.threshold}
            </p>
          )}
          {kind === 'tiered' && (
            <div className="tier-strip" role="group" aria-label="Stufe in der Vorschau">
              {tiers.map((_, i) => (
                <button key={i} aria-pressed={shownTier === i + 1} onClick={() => setPreviewTier(i + 1)}>
                  <BadgeView spec={spec} tier={i + 1} tierCount={tierCount} tilt={false} title={`Stufe ${i + 1}`} />{i + 1}
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ marginTop: 14, justifyContent: 'center' }}>
            <span className="muted small">Seltenheit:</span>
            <div className="seg">
              {(Object.keys(RARITIES) as Rarity[]).map((r) => <button key={r} aria-pressed={rarity === r} onClick={() => setRarity(r)} className="small">{RARITIES[r]}</button>)}
            </div>
          </div>
          <p className="muted small" style={{ textAlign: 'center', marginBottom: 0 }}>Die Seltenheit ergibt sich später automatisch daraus, wie viele Sammelnde das Abzeichen haben.</p>
        </aside>
      </div>
    </>
  );
}
