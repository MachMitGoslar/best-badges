// Erzeugt apps/manage/src/tokens.css aus den Tokens (eine Quelle für Web und App).
import { writeFileSync } from 'node:fs';
import { dark, fontFamily, game, mmh, radius } from '../src/index.ts';

const kebab = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const lines: string[] = [];
for (const [scale, steps] of Object.entries(mmh)) {
  if (typeof steps === 'string') { lines.push(`  --mmh-${kebab(scale)}: ${steps};`); continue; }
  for (const [step, v] of Object.entries(steps)) lines.push(`  --mmh-${kebab(scale)}-${step}: ${v};`);
}
for (const [k, v] of Object.entries(dark)) lines.push(`  --${kebab(k)}: ${v};`);
for (const [k, v] of Object.entries(game)) {
  if (typeof v === 'string') lines.push(`  --game-${kebab(k)}: ${v};`);
  else for (const [r, c] of Object.entries(v)) lines.push(`  --${kebab(k)}-${r}: ${c};`);
}
for (const [k, v] of Object.entries(radius)) lines.push(`  --radius-${k}: ${v}px;`);
lines.push(`  --font-sans: ${fontFamily};`);

writeFileSync(new URL('../../../apps/manage/src/tokens.css', import.meta.url),
  `/* MMH Game – generiert aus packages/design-tokens (pnpm --filter @best-badges/design-tokens gen:css). Nicht von Hand bearbeiten. */\n:root {\n${lines.join('\n')}\n}\n`);
console.log(`tokens.css geschrieben (${lines.length} Variablen)`);
