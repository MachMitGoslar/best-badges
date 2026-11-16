// Erzeugt preview/index.html: alle Beispiel-Abzeichen in allen Stufen, Seltenheiten und gesperrt.
// Aufruf: pnpm --filter @best-badges/badge-render preview
import { mkdirSync, writeFileSync } from 'node:fs';
import { MATERIALS, PALETTES, RARITIES, SHAPES, PATTERNS, randomSpec, resolveMaterialName, type BadgeSpec } from './preview-deps.ts';
import { renderBadgeSvg } from '../src/index.ts';

const samples: { name: string; spec: BadgeSpec }[] = [
  { name: 'Walderlebnispfad', spec: { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } } },
  { name: 'Stadtmuseum', spec: { version: 1, frame: 'classic', emblem: { shape: 'shield', pattern: 'timber', motif: { type: 'icon', ref: 'building-castle' }, palette: 'kaiser' } } },
  { name: 'Rammelsberg', spec: { version: 1, frame: 'classic', emblem: { shape: 'hexagon', pattern: 'mountains', motif: { type: 'icon', ref: 'pick' }, palette: 'ore' } } },
  { name: 'Leseclub', spec: { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'waves', motif: { type: 'icon', ref: 'books' }, palette: 'river' } } },
  { name: 'Monogramm', spec: { version: 1, frame: 'classic', emblem: { shape: 'diamond', pattern: 'rays', motif: { type: 'monogram', text: 'GS' }, palette: 'mango' } } },
  { name: 'Ehrenamt', spec: { version: 1, frame: 'classic', emblem: { shape: 'shield', pattern: 'dots', motif: { type: 'icon', ref: 'heart-handshake' }, palette: 'heather' } } },
];

let n = 0;
const card = (svg: string, label: string, sub = '') =>
  `<figure class="card"><div class="tilt">${svg}</div><figcaption>${label}${sub ? `<small>${sub}</small>` : ''}</figcaption></figure>`;
const badge = (spec: BadgeSpec, o: Parameters<typeof renderBadgeSvg>[1] = {}) =>
  renderBadgeSvg(spec, { size: 150, idPrefix: `p${n++}`, ...o });

const sections: string[] = [];

sections.push(`<h2>Stufen: ein Emblem, fünf Materialien</h2>` + samples.map(({ name, spec }) =>
  `<h3>${name}</h3><div class="row">` +
  card(badge(spec, { title: name }), 'ohne Stufen', 'Emaille') +
  [1, 2, 3, 4, 5].map((t) => card(badge(spec, { tier: t, tierCount: 5, title: `${name} Stufe ${t}` }), `Stufe ${t}`, resolveMaterialName(t, 5))).join('') +
  card(badge(spec, { tier: 2, tierCount: 5, locked: true, title: `${name} gesperrt` }), 'gesperrt') +
  `</div>`).join(''));

const harz: BadgeSpec = { version: 1, frame: 'classic', emblem: { shape: 'hexagon', pattern: 'rays', motif: { type: 'icon', ref: 'map-2' }, palette: 'mango' } };
sections.push(`<h2>Sammel-Abzeichen (Kombination): Kristalle für die benötigten Teile</h2><div class="row">` +
  card(badge(harz, { gems: { total: 3, filled: 0 }, locked: true }), '0 von 3', 'gesperrt') +
  card(badge(harz, { gems: { total: 3, filled: 1 } }), '1 von 3') +
  card(badge(harz, { gems: { total: 3, filled: 3 } }), '3 von 3', 'vollständig') +
  card(badge(samples[0]!.spec, { gems: { total: 5, filled: 2 } }), '2 von 5') +
  card(badge(samples[1]!.spec, { gems: { total: 8, filled: 8 } }), '8 von 8', 'vollständig') +
  card(badge(samples[3]!.spec, { gems: { total: 12, filled: 7 } }), '7 von 12') +
  card(badge(samples[5]!.spec, { gems: { total: 20, filled: 20 } }), '20 von 20') +
  `</div>`);

sections.push(`<h2>Drei Stufen (Bronze, Silber, Gold)</h2><div class="row">` +
  [1, 2, 3].map((t) => card(badge(samples[0]!.spec, { tier: t, tierCount: 3 }), `Stufe ${t} von 3`, resolveMaterialName(t, 3))).join('') + `</div>`);

sections.push(`<h2>Seltenheit (aus dem Anteil der Sammelnden)</h2><div class="row">` +
  (Object.keys(RARITIES) as (keyof typeof RARITIES)[]).map((r) =>
    card(badge(samples[2]!.spec, { tier: 4, tierCount: 5, rarity: r }), RARITIES[r])).join('') +
  (Object.keys(RARITIES) as (keyof typeof RARITIES)[]).map((r) =>
    card(badge(samples[4]!.spec, { rarity: r }), RARITIES[r], 'ohne Stufen')).join('') + `</div>`);

sections.push(`<h2>Paletten</h2><div class="row">` +
  (Object.keys(PALETTES) as (keyof typeof PALETTES)[]).map((p) =>
    card(badge({ version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'rays', motif: { type: 'icon', ref: 'star' }, palette: p } }), PALETTES[p].label)).join('') + `</div>`);

sections.push(`<h2>Formen und Muster</h2><div class="row">` +
  (Object.keys(SHAPES) as (keyof typeof SHAPES)[]).flatMap((s) =>
    (Object.keys(PATTERNS) as (keyof typeof PATTERNS)[]).filter((_, i) => i % 2 === 0 || s === 'circle').map((pt) =>
      card(badge({ version: 1, frame: 'classic', emblem: { shape: s, pattern: pt, motif: { type: 'icon', ref: 'compass' }, palette: 'harz' } }, { tier: 3, tierCount: 5 }), SHAPES[s], PATTERNS[pt]))).join('') + `</div>`);

sections.push(`<h2>Würfeln (Zufallsvorschläge)</h2><div class="row">` +
  Array.from({ length: 12 }, (_, i) => card(badge(randomSpec(i + 1), { tier: (i % 5) + 1, tierCount: 5 }), `Wurf ${i + 1}`)).join('') + `</div>`);

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Badge-Vorschau</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 24px 16px 64px; background: radial-gradient(circle at 20% 0%, #18213d, #0f1426 40%, #151515 85%); color: #e9ecff; font: 15px/1.4 system-ui, sans-serif; min-height: 100vh; }
  h1 { font-size: 22px; margin: 0 0 4px; } p.lead { color: #aab0d6; margin: 0 0 24px; }
  h2 { font-size: 17px; margin: 40px 0 8px; color: #fcce4c; } h3 { font-size: 14px; margin: 18px 0 4px; color: #aab0d6; font-weight: 500; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .card { margin: 0; width: 150px; text-align: center; perspective: 600px; }
  .card svg { display: block; width: 100%; height: auto; filter: drop-shadow(0 8px 14px rgba(0,0,0,.45)); }
  .tilt { transition: transform .35s cubic-bezier(.2,.8,.2,1); transform-style: preserve-3d; }
  .card:hover .tilt { transform: rotateY(18deg) rotateX(8deg) scale(1.06); }
  figcaption { font-size: 13px; margin-top: 2px; } figcaption small { display: block; color: #8a90b8; font-size: 11.5px; }
  .bb-rays { transform-origin: 100px 100px; animation: spin 18s linear infinite; }
  .bb-beams { transform-origin: 100px 100px; animation: pulse 3s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }
  .bb-sparkles path { transform-box: fill-box; transform-origin: center; animation: twinkle 2.4s ease-in-out infinite; }
  .bb-sparkles path:nth-child(2) { animation-delay: .6s } .bb-sparkles path:nth-child(3) { animation-delay: 1.2s } .bb-sparkles path:nth-child(4) { animation-delay: 1.8s }
  @keyframes spin { to { transform: rotate(360deg) } }
  @keyframes twinkle { 0%,100% { opacity: .2; transform: scale(.6) } 50% { opacity: 1; transform: scale(1.1) } }
  @media (prefers-reduced-motion: reduce) { .bb-rays, .bb-sparkles path { animation: none } .tilt { transition: none } }
</style></head><body>
<h1>Badge-Vorschau</h1><p class="lead">Erzeugt aus <code>badge-spec</code> + <code>badge-render</code>. Mit der Maus über ein Abzeichen fahren: Kippen wie später in der App. Strahlen und Funkeln sind hier per CSS animiert.</p>
${sections.join('\n')}
</body></html>`;

mkdirSync(new URL('../preview/', import.meta.url), { recursive: true });
writeFileSync(new URL('../preview/index.html', import.meta.url), html);
console.log(`preview/index.html geschrieben (${n} Abzeichen, ${(html.length / 1024).toFixed(0)} KB).`);
