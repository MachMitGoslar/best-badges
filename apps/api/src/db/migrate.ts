// Einfacher Migrationsrunner: wendet migrations/NNN_*.sql der Reihe nach an,
// jede Datei in einer eigenen Transaktion, geschützt durch ein Advisory Lock.
import { readdir, readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import type { Database } from './index.ts';

// Im Container liegt der Code gebündelt woanders: dann MIGRATIONS_DIR setzen
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR
  ? pathToFileURL(process.env.MIGRATIONS_DIR.replace(/\/?$/, '/'))
  : new URL('../../migrations/', import.meta.url);
const LOCK_KEY = 4711_2026;

export async function migrate(db: Database, log: (msg: string) => void = console.log): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
  const applied: string[] = [];
  await db.connection().execute(async (conn) => {
    await sql`SELECT pg_advisory_lock(${LOCK_KEY})`.execute(conn);
    try {
      await sql`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`.execute(conn);
      const done = new Set((await sql<{ name: string }>`SELECT name FROM schema_migrations`.execute(conn)).rows.map((r) => r.name));
      for (const file of files) {
        if (done.has(file)) continue;
        const body = await readFile(new URL(file, MIGRATIONS_DIR), 'utf8');
        await conn.transaction().execute(async (trx) => {
          await sql.raw(body).execute(trx);
          await sql`INSERT INTO schema_migrations (name) VALUES (${file})`.execute(trx);
        });
        applied.push(file);
        log(`Migration angewendet: ${file}`);
      }
    } finally {
      await sql`SELECT pg_advisory_unlock(${LOCK_KEY})`.execute(conn);
    }
  });
  return applied;
}
