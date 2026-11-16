import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import type { DB } from './types.ts';

export type Database = Kysely<DB>;

export function createDb(connectionString: string, opts: { max?: number } = {}): Database {
  return new Kysely<DB>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: opts.max ?? 10, statement_timeout: 10_000 }),
    }),
  });
}
