import { serve } from '@hono/node-server';
import { loadConfig } from './config.ts';
import { createApp } from './app.ts';
import { createDb } from './db/index.ts';
import { migrate } from './db/migrate.ts';
import { HspOrgDirectory } from './orgDirectory.ts';
import { NotificationService } from './services/notifications.ts';
import { ApnsSender, PushWorker } from './services/push.ts';

const config = loadConfig();
const db = createDb(config.DATABASE_URL);
if (config.MIGRATE_ON_START) await migrate(db);

const directory = new HspOrgDirectory(config.HSP_BASE_URL, {
  membershipTtlSec: config.HSP_MEMBERSHIP_TTL,
  orgTtlSec: config.HSP_ORG_TTL,
});
const apns = config.APNS_KEY_FILE && config.APNS_KEY_ID && config.APNS_TEAM_ID && config.APNS_TOPIC
  ? new ApnsSender({ keyFile: config.APNS_KEY_FILE, keyId: config.APNS_KEY_ID, teamId: config.APNS_TEAM_ID, topic: config.APNS_TOPIC })
  : null;
const notifications = new NotificationService(db, { pushEnabled: !!apns });
const app = createApp({ config, directory, db, notifications });
// Push-Worker (Versand an Apple) – ohne Schlüssel nur Erinnerungen und Aufräumen
const worker = new PushWorker(db, apns ?? { send: async () => ({ status: 'fail', reason: 'push disabled' }) }, notifications);
worker.start();
console.log(apns ? `Push an (APNs, Topic ${config.APNS_TOPIC})` : 'Push aus: APNS_* nicht gesetzt (Postfach funktioniert trotzdem)');

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: config.HOST }, (info) => {
  console.log(`Badge-API läuft auf http://${config.HOST}:${info.port} (Doku: /docs)`);
});

const shutdown = () => {
  worker.stop();
  apns?.close();
  server.close(() => void db.destroy().then(() => process.exit(0)));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
