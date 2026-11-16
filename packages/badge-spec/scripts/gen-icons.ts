import { existsSync } from 'node:fs';
// Erzeugt src/icons.generated.ts aus einem kuratierten Ausschnitt von Tabler Icons (MIT).
// Aufruf: pnpm --filter @best-badges/badge-spec gen:icons
import { readFileSync, writeFileSync } from 'node:fs';
// Das Paket gibt seine JSON-Dateien nicht über "exports" frei, daher direkter Pfad.
// Paketordner über die Modulauflösung finden (pnpm legt ihn je nach node-linker woanders ab)
function findPkg(): URL {
  for (let dir = new URL('../', import.meta.url); dir.pathname !== '/'; dir = new URL('../', dir)) {
    const candidate = new URL('node_modules/@tabler/icons/', dir);
    if (existsSync(new URL('package.json', candidate))) return candidate;
  }
  throw new Error('@tabler/icons nicht gefunden');
}
const pkgDir = findPkg();
const all = JSON.parse(readFileSync(new URL('tabler-nodes-outline.json', pkgDir), 'utf8')) as Record<string, [string, Record<string, string>][]>;
const version = (JSON.parse(readFileSync(new URL('package.json', pkgDir), 'utf8')) as { version: string }).version;

// id → deutsche Bezeichnung für den Editor
const CATALOG: Record<string, string> = {
  tree: 'Baum', trees: 'Wald', leaf: 'Blatt', 'plant-2': 'Pflanze', mushroom: 'Pilz', mountain: 'Berg', tent: 'Zelt',
  binoculars: 'Fernglas', compass: 'Kompass', 'map-pin': 'Ort', 'map-2': 'Karte', route: 'Route', walk: 'Wandern',
  run: 'Laufen', bike: 'Radfahren', swimming: 'Schwimmen', 'ball-football': 'Fußball', 'building-castle': 'Burg',
  'building-church': 'Kirche', 'building-monument': 'Denkmal', 'building-bank': 'Museum', pick: 'Bergbau',
  hammer: 'Handwerk', tools: 'Werkzeug', book: 'Buch', books: 'Bibliothek', school: 'Schule', certificate: 'Zertifikat',
  bulb: 'Idee', puzzle: 'Rätsel', 'chess-knight': 'Strategie', music: 'Musik', microphone: 'Bühne', 'masks-theater': 'Theater',
  palette: 'Kunst', brush: 'Malen', camera: 'Foto', coffee: 'Café', cake: 'Feier', gift: 'Geschenk', 'shopping-bag': 'Einkauf',
  ticket: 'Eintritt', users: 'Gemeinschaft', 'heart-handshake': 'Ehrenamt', recycle: 'Umwelt', heart: 'Herz', star: 'Stern',
  sparkles: 'Funkeln', flame: 'Feuer', sun: 'Sonne', moon: 'Mond', snowflake: 'Winter', droplet: 'Wasser', fish: 'Fisch',
  paw: 'Tiere', feather: 'Vogel', trophy: 'Pokal', medal: 'Medaille', crown: 'Krone', diamond: 'Diamant', key: 'Schlüssel',
  flag: 'Ziel', clock: 'Zeit', rocket: 'Start', train: 'Bahn', bus: 'Bus', 'question-mark': 'Geheimnis', 'stack-2': 'Sammlung',
};

const entries = Object.entries(CATALOG).map(([id, label]) => {
  const nodes = all[id];
  if (!nodes) throw new Error(`Icon ${id} fehlt in Tabler ${version}`);
  return `  ${JSON.stringify(id)}: { label: ${JSON.stringify(label)}, nodes: ${JSON.stringify(nodes)} },`;
});

writeFileSync(
  new URL('../src/icons.generated.ts', import.meta.url),
  `// GENERIERT von scripts/gen-icons.ts – nicht von Hand bearbeiten.
// Quelle: Tabler Icons ${version}, MIT-Lizenz, https://tabler.io/icons
// Koordinaten im 24×24-Raster, gedacht für stroke-width 2, runde Linienenden.

export type IconNode = [string, Record<string, string>];
export interface IconDef { label: string; nodes: IconNode[] }

export const ICONS = {
${entries.join('\n')}
} as const satisfies Record<string, IconDef>;

export type IconId = keyof typeof ICONS;
export const ICON_IDS = Object.keys(ICONS) as IconId[];
`,
);
console.log(`${entries.length} Icons geschrieben (Tabler ${version}).`);
