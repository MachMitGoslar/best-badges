import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { Icon } from './Icon.tsx';
import { logout } from '../api.ts';
import { useMe, useSession } from '../hooks.ts';

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();
  if (session.isPending) return <div className="page muted">Einen Moment …</div>;
  if (!session.data?.authenticated) {
    return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
  return <Outlet />;
}

/** Wortmarke des MachMit!Haus (Originaldatei, gold und weiß für dunklen Grund) */
export function Logo() {
  return <img className="brand-mark" src="/brand/machmit-logo.svg" alt="MachMit!Haus" />;
}

export function Layout() {
  const me = useMe();
  const session = useSession();
  return (
    <>
      <header className="topbar">
        <Link to="/" className="brand"><Logo /> <span>Best Badges</span> <span className="muted small brand-sub">Verwaltung</span></Link>
        <div className="spacer" />
        {me.data?.isPlatformAdmin && <Link to="/admin/broadcasts" className="btn btn-sm btn-ghost"><Icon name="inbox" size={16} /> Rundschreiben</Link>}
        {me.data?.isPlatformAdmin && <span className="pill">Haupt-Admin</span>}
        <span className="muted small user-name">{session.data?.name ?? me.data?.name ?? session.data?.sub}</span>
        <button className="btn btn-sm btn-ghost" onClick={() => void logout()}><Icon name="logout" size={16} /> Abmelden</button>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  );
}
