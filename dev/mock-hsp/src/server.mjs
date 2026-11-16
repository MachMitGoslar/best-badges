// Mock des HSP-Organisationsportals. Bildet genau die drei Endpunkte nach,
// die die Badge-API nutzt. Keine Abhängigkeiten, nur für die lokale Entwicklung.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const data = JSON.parse(readFileSync(new URL('../data/hsp.json', import.meta.url), 'utf8'));
const port = Number(process.env.PORT ?? 4010);

// Unbekannte Benutzer bekommen ein stabiles Profil ohne Mitgliedschaften (Bürger).
function profileFor(sub) {
  const known = data.users[sub];
  if (known) return known;
  const hex = createHash('sha256').update(sub).digest('hex');
  const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
  return { id, firstName: sub, lastName: '', memberships: [] };
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const hasBearer = (req) => /^Bearer\s+\S+$/i.test(req.headers.authorization ?? '');

createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  console.log(`${req.method} ${url.pathname}`);

  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed' });
  if (url.pathname === '/health') return send(res, 200, { status: 'ok' });

  // /api/UserAccounts/{sub}/UserProfile  (beim echten HSP derzeit ohne Anmeldung)
  if (parts[0] === 'api' && parts[1] === 'UserAccounts' && parts[3] === 'UserProfile' && parts.length === 4) {
    const p = profileFor(parts[2]);
    return send(res, 200, { id: p.id, firstName: p.firstName, lastName: p.lastName });
  }

  // Ab hier verlangt auch das echte HSP ein Bearer-Token.
  if (!hasBearer(req)) return send(res, 401, { error: 'Unauthorized' });

  // /api/UserProfiles/{profileId}/Memberships
  if (parts[0] === 'api' && parts[1] === 'UserProfiles' && parts[3] === 'Memberships' && parts.length === 4) {
    const user = Object.values(data.users).find((u) => u.id === parts[2]);
    return send(res, 200, (user?.memberships ?? []).map((organisationId) => ({ organisationId })));
  }

  // /api/Organisations/{id}
  if (parts[0] === 'api' && parts[1] === 'Organisations' && parts.length === 3) {
    const org = data.organisations.find((o) => o.id === parts[2]);
    return org ? send(res, 200, org) : send(res, 404, { error: 'Not found' });
  }

  send(res, 404, { error: 'Not found' });
}).listen(port, () => console.log(`Mock-HSP läuft auf Port ${port}`));
