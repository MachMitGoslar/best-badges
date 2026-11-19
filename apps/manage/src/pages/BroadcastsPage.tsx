import { useState } from 'react';
import { Link, Navigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiFailure, unwrap } from '../api.ts';
import { useMe } from '../hooks.ts';

type Category = 'news' | 'campaigns';
const CATEGORIES: Record<Category, { title: string; text: string }> = {
  news: { title: 'Neuigkeit', text: 'z. B. „Entdecke diese neuen Abzeichen“' },
  campaigns: { title: 'Sonderaktion', text: 'z. B. Ferienaktion, Stadtfest' },
};

/**
 * Rundschreiben der Haupt-Admin-Organisation. Geht nur an Personen, die der Kategorie in der App zugestimmt haben;
 * höchstens 3 in 24 Stunden; Zustellung per Push nur zwischen 9 und 20 Uhr.
 */
export function BroadcastsPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [category, setCategory] = useState<Category>('news');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [check, setCheck] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const list = useQuery({ queryKey: ['broadcasts'], enabled: !!me.data?.isPlatformAdmin, queryFn: async () => (await unwrap(api.GET('/api/v1/admin/broadcasts'))).items });
  const input = () => ({ category, title: title.trim(), body: body.trim(), link: link.trim() || null });
  const dry = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/admin/broadcasts', { body: { ...input(), dryRun: true } })),
    onSuccess: (r) => setCheck(r.recipients),
    onError: (e) => setError((e as ApiFailure).message),
  });
  const send = useMutation({
    mutationFn: () => unwrap(api.POST('/api/v1/admin/broadcasts', { body: input() })),
    onSuccess: (r) => {
      setDone(`Verschickt an ${r.recipients} ${r.recipients === 1 ? 'Person' : 'Personen'}.`);
      setTitle(''); setBody(''); setLink(''); setCheck(null);
      void qc.invalidateQueries({ queryKey: ['broadcasts'] });
    },
    onError: (e) => setError((e as ApiFailure).message),
  });

  if (me.isPending) return <p className="muted">Lade …</p>;
  if (!me.data?.isPlatformAdmin) return <Navigate to="/" replace />;
  const linkOk = !link.trim() || /^\/[A-Za-z0-9/_-]{0,120}$/.test(link.trim());
  const ready = title.trim() && body.trim() && linkOk;
  const reset = () => { setCheck(null); setError(null); setDone(null); };

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs"><Link to="/">Start</Link> / Rundschreiben</div>
          <h1>Rundschreiben</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Mitteilungen an alle, die in der App zugestimmt haben. Werbliche Nachrichten ohne Einwilligung sind nicht erlaubt –
            deshalb erreicht ein Rundschreiben nur Personen, die „{CATEGORIES[category].title}“ eingeschaltet haben.
          </p>
        </div>
      </div>

      {done && <div className="notice notice-ok" role="status" style={{ marginBottom: 16 }}>{done}</div>}
      {error && <div className="notice notice-error" style={{ marginBottom: 16 }}>{error}</div>}

      <section className="panel stack" style={{ marginBottom: 20 }}>
        <h2>Neues Rundschreiben</h2>
        <div className="field">Art
          {(Object.keys(CATEGORIES) as Category[]).map((c) => (
            <label key={c} className="row small" style={{ color: 'var(--text)' }}>
              <input type="radio" name="category" checked={category === c} onChange={() => { setCategory(c); reset(); }} />
              <span><strong>{CATEGORIES[c].title}</strong> <span className="muted">– {CATEGORIES[c].text}</span></span>
            </label>
          ))}
        </div>
        <label className="field">Titel ({title.length}/60)<input value={title} maxLength={60} onChange={(e) => { setTitle(e.target.value); reset(); }} placeholder="Neue Abzeichen am Rammelsberg" /></label>
        <label className="field">Text ({body.length}/180)<textarea value={body} maxLength={180} rows={3} onChange={(e) => { setBody(e.target.value); reset(); }} placeholder="Drei neue Stationen warten auf dich." /></label>
        <label className="field">Ziel in der App (optional)
          <input value={link} onChange={(e) => { setLink(e.target.value); reset(); }} placeholder="/achievements/<id> – leer: Startseite" aria-invalid={!linkOk} />
          {!linkOk && <span className="small" style={{ color: 'var(--danger)' }}>Nur Pfade in der App, z. B. /achievements/…, keine Webadressen.</span>}
        </label>

        <div className="panel" style={{ background: 'var(--bg-page)' }} aria-label="Vorschau">
          <div className="small muted">Vorschau auf dem Sperrbildschirm</div>
          <strong>{title || 'Titel'}</strong>
          <div className="small">{body || 'Text der Mitteilung'}</div>
        </div>

        <div className="row">
          <button className="btn" disabled={!ready || dry.isPending} onClick={() => { setError(null); dry.mutate(); }}>Empfänger zählen</button>
          {check !== null && <span className="muted small">{check} {check === 1 ? 'Person hat' : 'Personen haben'} zugestimmt.</span>}
          <span className="spacer" />
          <button className="btn btn-primary" disabled={!ready || check === null || check === 0 || send.isPending}
            onClick={() => { if (window.confirm(`„${title.trim()}“ jetzt an ${check} ${check === 1 ? 'Person' : 'Personen'} schicken? Das lässt sich nicht zurückholen.`)) { setError(null); send.mutate(); } }}>
            Verschicken
          </button>
        </div>
        <span className="small muted">Höchstens 3 Rundschreiben in 24 Stunden. Push kommt nur zwischen 9 und 20 Uhr an, sonst am nächsten Morgen.</span>
      </section>

      <section className="panel">
        <div className="panel-title"><h2>Verschickt</h2></div>
        {list.isPending && <p className="muted">Lade …</p>}
        {list.data?.length === 0 && <p className="muted">Noch keine Rundschreiben.</p>}
        {list.data?.map((b) => (
          <div key={b.id} className="code-row">
            <div>
              <div className="row"><strong>{b.title}</strong><span className="pill">{CATEGORIES[b.category].title}</span></div>
              <div className="muted small">{b.body}</div>
              <div className="muted small">{new Date(b.createdAt).toLocaleString('de-DE')} · an {b.recipients} {b.recipients === 1 ? 'Person' : 'Personen'}{b.link ? ` · Ziel ${b.link}` : ''}</div>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
