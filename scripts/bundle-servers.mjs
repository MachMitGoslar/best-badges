// Bündelt API und Verwaltungs-Server (BFF) für den Container: je eine Datei, alle Abhängigkeiten
// eingebaut. Im Laufzeit-Image liegen dann nur Node, das Bündel und die Migrationen.
// Aufruf (im Repository-Wurzelordner): node scripts/bundle-servers.mjs <ausgabeordner>
import { build } from 'esbuild';
import { cpSync, mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'out';
const common = {
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: 'linked',
  legalComments: 'linked',
  // pg lädt pg-native nur optional; wir nutzen den reinen JS-Treiber
  external: ['pg-native'],
  // CommonJS-Abhängigkeiten (pg) brauchen require im ESM-Bündel
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['apps/api/src/index.ts'], outfile: `${out}/api/index.mjs` });
mkdirSync(`${out}/api/migrations`, { recursive: true });
cpSync('apps/api/migrations', `${out}/api/migrations`, { recursive: true });

await build({ ...common, entryPoints: ['apps/manage/server/index.ts'], outfile: `${out}/manage/server/index.mjs` });
cpSync('apps/manage/dist', `${out}/manage/dist`, { recursive: true });
