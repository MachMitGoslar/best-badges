import { Link } from 'react-router';
export function NotFound() {
  return <div className="panel stack"><h2>Seite nicht gefunden</h2><Link to="/">Zur Übersicht</Link></div>;
}
