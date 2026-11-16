import { Link, useParams } from 'react-router';
import { BadgeView } from '../components/BadgeView.tsx';
import { StatusPill } from '../components/StatusPill.tsx';
import { Icon } from '../components/Icon.tsx';
import { useAchievements, useCollectionRequests, useDecideItem, useMe } from '../hooks.ts';

export function OrgPage() {
  const { orgId = '' } = useParams();
  const me = useMe();
  const list = useAchievements(orgId);
  const org = me.data?.organisations.find((o) => o.id === orgId);
  const requests = useCollectionRequests(orgId);
  const decide = useDecideItem(orgId);
  const open = (requests.data ?? []).filter((r) => r.state !== 'approved');

  return (
    <>
      <div className="page-head">
        <div>
          {me.data && me.data.organisations.length > 1 && <div className="crumbs"><Link to="/">Organisationen</Link></div>}
          <h1>{org?.name ?? 'Organisation'}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>Deine Abzeichen. Entwürfe sieht nur deine Organisation.</p>
        </div>
        <div className="row">
          <Link className="btn btn-ghost" to={`/orgs/${orgId}/api-keys`}><Icon name="key" size={16} /> API-Schlüssel</Link>
          <Link className="btn btn-primary" to={`/orgs/${orgId}/achievements/new`}><Icon name="plus" size={16} /> Abzeichen anlegen</Link>
        </div>
      </div>

      {open.length > 0 && (
        <section className="panel" style={{ marginBottom: 20 }}>
          <div className="panel-title"><h2 className="row" style={{ gap: 8 }}><Icon name="inbox" size={20} /> Anfragen für Kombinationen</h2><span className="pill">{open.length}</span></div>
          <p className="muted small" style={{ marginTop: 0 }}>Andere Organisationen möchten deine Abzeichen als Teil ihrer Kombination nutzen. Erst mit deiner Zustimmung zählen sie dort.</p>
          {open.map((r) => (
            <div key={`${r.collection.id}:${r.achievement.id}`} className="request-row">
              <BadgeView className="mini" spec={r.collection.spec} gems={{ total: r.collection.requiredCount, filled: r.collection.requiredCount }} tilt={false} title={r.collection.name} />
              <div>
                <strong>{r.collection.name}</strong>{r.collection.hidden && <span className="pill pill-hidden" style={{ marginLeft: 8 }}>Versteckt</span>}
                <div className="muted small">{r.collection.orgName ?? 'Eine andere Organisation'} · {r.collection.requiredCount} von {r.collection.itemCount} Teilen · dein Teil: <strong style={{ color: 'var(--text)' }}>{r.achievement.name}</strong>{r.state === 'rejected' ? ' · abgelehnt' : ''}</div>
              </div>
              <div className="row">
                {r.state !== 'rejected' && <button className="btn btn-sm btn-ghost" disabled={decide.isPending} onClick={() => decide.mutate({ collectionId: r.collection.id, achievementId: r.achievement.id, decision: 'reject' })}><Icon name="x" size={16} /> Ablehnen</button>}
                <button className="btn btn-sm btn-primary" disabled={decide.isPending} onClick={() => decide.mutate({ collectionId: r.collection.id, achievementId: r.achievement.id, decision: 'approve' })}><Icon name="check" size={16} /> Zustimmen</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {list.isPending && <p className="muted">Lade …</p>}
      {list.error && <div className="notice notice-error">Konnte die Abzeichen nicht laden.</div>}
      {list.data && list.data.length === 0 && (
        <div className="panel stack" style={{ alignItems: 'center', textAlign: 'center', padding: 40 }}>
          <h2>Noch keine Abzeichen</h2>
          <p className="muted" style={{ margin: 0 }}>Gestalte dein erstes Abzeichen – das dauert keine zwei Minuten.</p>
          <Link className="btn btn-primary" to={`/orgs/${orgId}/achievements/new`}>Abzeichen gestalten</Link>
        </div>
      )}
      {list.data && list.data.length > 0 && (
        <div className="grid achievement-grid">
          {list.data.map((a) => (
            <Link key={a.id} to={`/orgs/${orgId}/achievements/${a.id}`} className="panel achievement-card">
              <BadgeView spec={a.spec} tier={a.kind === 'tiered' ? a.tiers.length : undefined} tierCount={a.kind === 'tiered' ? a.tiers.length : undefined} gems={a.kind === 'collection' ? { total: a.requiredCount ?? 1, filled: a.requiredCount ?? 1 } : undefined} locked={a.status === 'archived' || !!a.veto} title={a.name} />
              <h3>{a.name}</h3>
              <div className="row" style={{ justifyContent: 'center' }}>
                <StatusPill a={a} />
                {a.hidden && <span className="pill pill-hidden">Versteckt</span>}
                {a.openForCollections && <span className="pill" title="Für Kombinationen anderer Organisationen freigegeben"><Icon name="link" size={12} /> Kombi</span>}
                <span className="muted small">{a.kind === 'tiered' ? `${a.tiers.length} Stufen` : a.kind === 'collection' ? `Kombination · ${a.requiredCount} von ${a.items.length}` : 'Einzelabzeichen'}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
