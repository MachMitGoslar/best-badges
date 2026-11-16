import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync } from 'node:fs';
import { loadBffConfig } from './config.ts';
import { createBffApp } from './app.ts';
import { OidcClient } from './oidc.ts';
import { SessionStore } from './sessions.ts';

const config = loadBffConfig();
const app = createBffApp({
  config,
  oidc: new OidcClient({ issuer: config.OIDC_ISSUER, clientId: config.MANAGE_OIDC_CLIENT_ID, clientSecret: config.MANAGE_OIDC_CLIENT_SECRET, audience: config.OIDC_AUDIENCE }),
  sessions: new SessionStore(config.MANAGE_SESSION_TTL * 1000),
});

if (config.NODE_ENV === 'production') {
  // Gebaute Oberfläche ausliefern, mit strenger Content-Security-Policy
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'";
  app.use('*', async (c, next) => { await next(); c.header('Content-Security-Policy', csp); });
  app.use('/assets/*', serveStatic({ root: './dist' }));
  const index = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  app.get('*', (c) => c.html(index));
}

serve({ fetch: app.fetch, port: config.MANAGE_BFF_PORT, hostname: '127.0.0.1' }, (i) => {
  console.log(`Verwaltung (BFF) läuft auf http://127.0.0.1:${i.port}, öffentlich unter ${config.MANAGE_PUBLIC_URL}`);
});
