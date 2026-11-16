import { createDb } from './index.ts';
import { migrate } from './migrate.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL fehlt');
const db = createDb(url, { max: 1 });
try {
  const applied = await migrate(db);
  console.log(applied.length ? `${applied.length} Migration(en) angewendet.` : 'Datenbank ist aktuell.');
} finally {
  await db.destroy();
}
