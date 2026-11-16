import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { createDb } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { HspOrgDirectory } from './orgDirectory.ts';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
if (config.MIGRATE_ON_START) await migrate(db);

const directory = new HspOrgDirectory(config.HSP_BASE_URL, {
  membershipTtlSec: config.HSP_MEMBERSHIP_TTL,
  orgTtlSec: config.HSP_ORG_TTL,
});
const app = createApp({ config, directory, db });

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  console.log(`Badge-API läuft auf http://${config.HOST}:${info.port} (Doku: /docs)`);
});

const shutdown = () => server.close(() => void db.destroy().then(() => process.exit(0)));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
