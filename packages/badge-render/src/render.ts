import {
  ICONS, PALETTES, materialForTier,
  type BadgeSpec, type MaterialId, type Motif, type Palette, type Rarity,
} from '@best-badges/badge-spec';
import { game, mmh } from '@best-badges/design-tokens';
import { C, motifBox, patternSvg, scallopPath, shapePath } from './geometry.ts';
import { COLLECTION_LOOK, materialLook } from './materials.ts';
import { textureSvg } from './textures.ts';

export interface RenderOptions {
  /** Erreichte Stufe (1-basiert). Ohne Angabe: Abzeichen ohne Stufen (Emaille-Rahmen). */
  tier?: number;
  /** Anzahl Stufen des Abzeichens; nötig, wenn `tier` gesetzt ist. */
  tierCount?: number;
  rarity?: Rarity;
  /** Noch nicht gesammelt: entsättigt und abgedunkelt. */
  locked?: boolean;
  /** Ausgabegröße in Pixeln (Breite = Höhe). */
  size?: number;
  /** Präfix für interne IDs; muss pro Seite eindeutig sein. Standard: aus dem Inhalt abgeleitet. */
  idPrefix?: string;
  /** Zugänglicher Name des Bildes */
  title?: string;
  /**
   * Sammel-Abzeichen (Kombination): so viele Kristalleinsätze am Rand, wie Teile nötig sind;
   * `filled` davon leuchten. Ersetzt Stufen und Material durch den Onyx-Rahmen.
   */
  gems?: { total: number; filled: number };
  /**
   * Nur die Medaille formatfüllend, ohne Glühen, Strahlen, Funkeln und Schlagschatten –
   * als Textur für die 3D-Darstellung (Medaillenrand r = 92,4 entspricht der Bildkante).
   * Nieten, Stufen-Punkte und Kristalle fehlen – die baut die 3D-Medaille als eigene Körper (ornamentLayout).
   */
  face?: boolean;
}

/** Anteil des Medaillons an der Bildfläche; der Rest gehört den Effekten. */
const MEDAL_SCALE = 0.84;

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const ALLOWED_ICON_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse']);
const ALLOWED_ICON_ATTRS = new Set(['d', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'points']);

/** FNV-1a – kurzer, stabiler Hash für ID-Präfixe. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

export function resolveMaterial(opts: Pick<RenderOptions, 'tier' | 'tierCount'>): MaterialId {
  if (opts.tier === undefined) return 'enamel';
  return materialForTier(opts.tier, opts.tierCount ?? opts.tier);
}

function motifSvg(motif: Motif, palette: Palette, box: { cx: number; cy: number; size: number }, id: (n: string) => string): string {
  const shadow = (inner: string) =>
    `<g transform="translate(0 2.5)" opacity="0.55">${inner.replaceAll(`"${palette.ink}"`, `"${palette.deep}"`)}</g>${inner}`;

  switch (motif.type) {
    case 'icon': {
      const s = box.size / 24;
      const nodes = ICONS[motif.ref].nodes
        .filter(([tag]) => ALLOWED_ICON_TAGS.has(tag))
        .map(([tag, attrs]) => {
          const a = Object.entries(attrs).filter(([k]) => ALLOWED_ICON_ATTRS.has(k)).map(([k, v]) => `${k}="${esc(String(v))}"`).join(' ');
          return `<${tag} ${a}/>`;
        })
        .join('');
      const g = `<g transform="translate(${box.cx - box.size / 2} ${box.cy - box.size / 2}) scale(${Number(s.toFixed(4))})" fill="none" stroke="${palette.ink}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${nodes}</g>`;
      return shadow(g);
    }
    case 'monogram': {
      const text = motif.text.toUpperCase();
      const fontSize = text.length === 1 ? box.size * 0.95 : text.length === 2 ? box.size * 0.72 : box.size * 0.54;
      const t = `<text x="${box.cx}" y="${Number((box.cy + fontSize * 0.35).toFixed(2))}" text-anchor="middle" font-family="Outfit, Inter, 'Segoe UI', system-ui, sans-serif" font-weight="800" font-size="${Number(fontSize.toFixed(1))}" letter-spacing="-1" fill="${palette.ink}">${esc(text)}</text>`;
      return shadow(t);
    }
    case 'logo': {
      const s = box.size * 1.05;
      return `<image href="${esc(motif.url)}" x="${box.cx - s / 2}" y="${box.cy - s / 2}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet" filter="url(#${id('silhouette')})"/>`;
    }
  }
}

function hexToRgb01(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map((v) => Number(v.toFixed(3))) as [number, number, number];
}

function sparkle(x: number, y: number, r: number): string {
  const k = r * 0.22;
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`;
}

/** Rendert ein Abzeichen als eigenständiges SVG (ohne externe Abhängigkeiten außer einem Logo-Bild). */
export function renderBadgeSvg(spec: BadgeSpec, opts: RenderOptions = {}): string {
  const palette = PALETTES[spec.emblem.palette];
  const gems = opts.gems ? { total: Math.min(Math.max(1, Math.round(opts.gems.total)), 20), filled: Math.max(0, Math.round(opts.gems.filled)) } : null;
  const material = gems ? 'enamel' : resolveMaterial(opts);
  const look = gems ? COLLECTION_LOOK : materialLook(material, palette);
  const complete = !!gems && gems.filled >= gems.total;
  const rarity = opts.rarity ?? 'common';
  // Seltenheitsfarbe aus dem MMH-Game-Look (selten Cornflower, episch Greti, legendär Ripe Mango)
  const rarityGlow = game.rarity[rarity];
  const tierCount = !gems && opts.tier !== undefined ? Math.max(1, opts.tierCount ?? opts.tier) : 0;
  const tier = opts.tier !== undefined ? Math.min(Math.max(1, opts.tier), tierCount) : 0;
  const size = opts.size ?? 200;
  const prefix = opts.idPrefix ?? `bb${hash(JSON.stringify([spec, material, rarity, tier, tierCount, !!opts.locked, gems]))}`;
  const id = (n: string) => `${prefix}-${n}`;
  const shape = shapePath(spec.emblem.shape);
  const box = motifBox(spec.emblem.shape);
  const [ir, ig, ib] = hexToRgb01(palette.ink);
  const title = opts.title ?? 'Abzeichen';

  const defs = [
    `<linearGradient id="${id('rim')}" x1="0" y1="0" x2="1" y2="1">${look.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`,
    `<linearGradient id="${id('bevel')}" x1="1" y1="1" x2="0" y2="0">${look.stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`,
    `<radialGradient id="${id('plate')}" cx="0.42" cy="0.36" r="0.75"><stop offset="0" stop-color="${palette.light}"/><stop offset="0.55" stop-color="${palette.base}"/><stop offset="1" stop-color="${palette.deep}"/></radialGradient>`,
    `<radialGradient id="${id('glow')}"><stop offset="0.7" stop-color="${rarityGlow}" stop-opacity="0.75"/><stop offset="1" stop-color="${rarityGlow}" stop-opacity="0"/></radialGradient>`,
    `<clipPath id="${id('shape')}"><path d="${shape}"/></clipPath>`,
    `<clipPath id="${id('ring')}"><path d="${scallopPath(90, 20, 2.4)}M${C - 70} ${C}a70 70 0 1 1 140 0a70 70 0 1 1 -140 0Z" clip-rule="evenodd"/></clipPath>`,
    `<radialGradient id="${id('halo')}"><stop offset="0.6" stop-color="${mmh.cornflower[500]}" stop-opacity="0"/><stop offset="0.76" stop-color="${mmh.cornflower[500]}" stop-opacity="0.85"/><stop offset="0.86" stop-color="${mmh.violaceousGreti[600]}" stop-opacity="0.55"/><stop offset="1" stop-color="${mmh.violaceousGreti[600]}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="${id('gem')}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${mmh.violaceousGreti[300]}"/><stop offset="0.35" stop-color="${mmh.violaceousGreti[700]}"/><stop offset="0.7" stop-color="${mmh.violaceousGreti[1000]}"/><stop offset="1" stop-color="${mmh.violaceousGreti[1300]}"/></linearGradient>`,
    `<radialGradient id="${id('gemglow')}"><stop offset="0" stop-color="${mmh.violaceousGreti[400]}" stop-opacity="0.9"/><stop offset="1" stop-color="${mmh.violaceousGreti[400]}" stop-opacity="0"/></radialGradient>`,
    `<radialGradient id="${id('done')}"><stop offset="0.62" stop-color="${mmh.ripeMango[700]}" stop-opacity="0"/><stop offset="0.8" stop-color="${mmh.ripeMango[700]}" stop-opacity="0.55"/><stop offset="1" stop-color="${mmh.violaceousGreti[600]}" stop-opacity="0"/></radialGradient>`,
    `<filter id="${id('silhouette')}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 ${ir} 0 0 0 0 ${ig} 0 0 0 0 ${ib} 0 0 0 1 0"/></filter>`,
    `<filter id="${id('locked')}" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncR type="linear" slope="0.55"/><feFuncG type="linear" slope="0.55"/><feFuncB type="linear" slope="0.55"/></feComponentTransfer></filter>`,
  ].join('');

  const effects: string[] = [];
  if (!opts.locked && look.halo) {
    // Neon-Aura und Lichtkreuz
    effects.push(`<circle cx="${C}" cy="${C}" r="100" fill="url(#${id('halo')})"/>`);
    const beam = (a: number, len: number, w: number) => {
      const p = (ang: number, r: number) => `${(C + r * Math.cos(ang)).toFixed(1)} ${(C + r * Math.sin(ang)).toFixed(1)}`;
      return `M${p(a - w, 60)}L${p(a, len)}L${p(a + w, 60)}Z`;
    };
    const beams = [0, 1, 2, 3].map((i) => beam((i * Math.PI) / 2, 100, 0.05)).join('') + [0, 1, 2, 3].map((i) => beam(Math.PI / 4 + (i * Math.PI) / 2, 92, 0.035)).join('');
    effects.push(`<path class="bb-beams" d="${beams}" fill="#ffffff" fill-opacity="0.85"/>`);
  }
  if (!opts.locked && complete) {
    // Vollständige Sammlung: goldener Kranz mit violettem Saum
    effects.push(`<circle cx="${C}" cy="${C}" r="100" fill="url(#${id('done')})"/>`);
  }
  if (!opts.locked && rarity !== 'common') {
    effects.push(`<circle cx="${C}" cy="${C}" r="99" fill="url(#${id('glow')})"/>`);
  }
  if (!opts.locked && (rarity === 'epic' || rarity === 'legendary')) {
    const rays: string[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, w = 0.07;
      const p = (ang: number, r: number) => `${(C + r * Math.cos(ang)).toFixed(1)} ${(C + r * Math.sin(ang)).toFixed(1)}`;
      rays.push(`M${p(a - w, 62)}L${p(a, 99)}L${p(a + w, 62)}Z`);
    }
    effects.push(`<path class="bb-rays" d="${rays.join('')}" fill="${rarityGlow}" fill-opacity="0.7"/>`);
  }

  const outer = scallopPath(90, 20, 2.4);
  const arc = (r: number, a0: number, a1: number) => {
    const p = (a: number) => `${(C + r * Math.cos((a * Math.PI) / 180)).toFixed(2)} ${(C + r * Math.sin((a * Math.PI) / 180)).toFixed(2)}`;
    return `M${p(a0)}A${r} ${r} 0 0 1 ${p(a1)}`;
  };
  // Nieten nur im oberen Bogen, damit unten Platz für die Stufen-Punkte bleibt
  const studs: string[] = [];
  for (let i = 0; i < (opts.face ? 0 : look.studs); i++) {
    const a = ((150 + (240 / (look.studs - 1 || 1)) * i) * Math.PI) / 180;
    const x = (C + 80 * Math.cos(a)).toFixed(2), y = (C + 80 * Math.sin(a)).toFixed(2);
    studs.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${look.edge}" fill-opacity="0.5" transform="translate(0.6 0.8)"/><circle cx="${x}" cy="${y}" r="2.4" fill="${look.shine}" stroke="${look.edge}" stroke-width="0.7"/>`);
  }
  const frame = [
    `<path d="${outer}" transform="translate(0 3)" fill="#000000" fill-opacity="0.35"/>`,
    `<path d="${outer}" fill="url(#${id('rim')})" stroke="${look.edge}" stroke-width="1.2"/>`,
    `<g clip-path="url(#${id('ring')})">${textureSvg(look)}</g>`,
    // Gemalte Glanzlichter nur in 2D – in 3D übernimmt echtes Licht
    look.gloss > 0 && !opts.face ? `<path d="${arc(85, 195, 290)}" fill="none" stroke="#ffffff" stroke-opacity="${look.gloss * 0.7}" stroke-width="2.4" stroke-linecap="round"/>` : '',
    look.gloss > 0.6 && !opts.face ? `<path d="${arc(76, 205, 240)}" fill="none" stroke="#ffffff" stroke-opacity="${look.gloss * 0.6}" stroke-width="1.6" stroke-linecap="round"/>` : '',
    `<path d="${arc(85, 20, 75)}" fill="none" stroke="#000000" stroke-opacity="0.2" stroke-width="2.4" stroke-linecap="round"/>`,
    studs.join(''),
    `<circle cx="${C}" cy="${C}" r="71.5" fill="none" stroke="url(#${id('bevel')})" stroke-width="3.5"/>`,
    look.halo ? `<circle cx="${C}" cy="${C}" r="71.5" fill="none" stroke="#ffffff" stroke-width="1.4"/>` : '',
    `<circle cx="${C}" cy="${C}" r="69" fill="${palette.deep}" stroke="${look.edge}" stroke-width="1.5"/>`,
  ].join('');

  const emblem = [
    `<g transform="translate(${C} ${C}) scale(0.9) translate(${-C} ${-C})">`,
    `<path d="${shape}" fill="url(#${id('plate')})"/>`,
    `<g clip-path="url(#${id('shape')})">${patternSvg(spec.emblem.pattern, palette.light, palette.deep)}</g>`,
    motifSvg(spec.emblem.motif, palette, box, id),
    // Glanzlicht als zwei halbtransparente Ellipsen statt Verlauf – rendert in Browsern und Skia gleich
    opts.face ? '' : `<g clip-path="url(#${id('shape')})"><ellipse cx="${C}" cy="56" rx="80" ry="46" fill="#ffffff" fill-opacity="0.1"/><ellipse cx="${C}" cy="46" rx="62" ry="30" fill="#ffffff" fill-opacity="0.1"/></g>`,
    `<path d="${shape}" fill="none" stroke="${look.stops[0]![1]}" stroke-width="2.6"/>`,
    `<path d="${shape}" fill="none" stroke="${look.edge}" stroke-opacity="0.6" stroke-width="0.8"/>`,
    `</g>`,
  ].join('');

  const pips: string[] = [];
  if (tierCount > 1 && !opts.face) {
    const step = 13 * (Math.PI / 180);
    for (let i = 0; i < tierCount; i++) {
      const a = Math.PI / 2 + (i - (tierCount - 1) / 2) * step * -1;
      const x = (C + 80 * Math.cos(a)).toFixed(2), y = (C + 80 * Math.sin(a)).toFixed(2);
      pips.push(i < tier
        ? `<circle cx="${x}" cy="${y}" r="4.6" fill="${look.shine}" stroke="${look.edge}" stroke-width="1.2"/>`
        : `<circle cx="${x}" cy="${y}" r="3.6" fill="${palette.deep}" fill-opacity="0.85" stroke="${look.edge}" stroke-width="1.2"/>`);
    }
  }

  // Kristalleinsätze: gleichmäßig um den Rand, oben beginnend; leuchtend = gesammelt, sonst leere Fassung
  const gemSvg: string[] = [];
  if (gems && !opts.face) {
    const s = Math.min(10, Math.max(4, ((2 * Math.PI * 80) / gems.total) * 0.34));
    for (let i = 0; i < gems.total; i++) {
      const a = -Math.PI / 2 + (i / gems.total) * Math.PI * 2;
      const x = C + 80 * Math.cos(a), y = C + 80 * Math.sin(a);
      // Raute, radial ausgerichtet: Spitzen innen/außen länger als seitlich
      const ux = Math.cos(a), uy = Math.sin(a), vx = -uy, vy = ux;
      const p = (r: number, t: number) => `${(x + ux * r + vx * t).toFixed(2)} ${(y + uy * r + vy * t).toFixed(2)}`;
      const outline = `M${p(-s * 1.15, 0)}L${p(0, s * 0.78)}L${p(s * 1.15, 0)}L${p(0, -s * 0.78)}Z`;
      const lit = i < gems.filled;
      gemSvg.push(`<path d="${outline}" fill="#000000" fill-opacity="0.55" transform="translate(0.5 0.9)"/>`);
      if (lit) {
        gemSvg.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(s * 1.9).toFixed(2)}" fill="url(#${id('gemglow')})"/>`);
        gemSvg.push(`<path d="${outline}" fill="url(#${id('gem')})" stroke="${look.edge}" stroke-width="0.9"/>`);
        // Facette: obere Hälfte heller
        gemSvg.push(`<path d="M${p(-s * 1.15, 0)}L${p(0, -s * 0.78)}L${p(s * 0.2, 0)}Z" fill="#ffffff" fill-opacity="0.4"/>`);
        gemSvg.push(`<circle cx="${(x - ux * s * 0.35 + vx * -s * 0.2).toFixed(2)}" cy="${(y - uy * s * 0.35 + vy * -s * 0.2).toFixed(2)}" r="${(s * 0.16).toFixed(2)}" fill="#ffffff"/>`);
      } else {
        gemSvg.push(`<path d="${outline}" fill="${mmh.deadPixel[1500]}" stroke="${look.edge}" stroke-width="0.9"/>`);
        gemSvg.push(`<path d="M${p(-s * 0.6, 0)}L${p(0, -s * 0.4)}L${p(s * 0.6, 0)}" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="0.7"/>`);
      }
    }
  }

  const sparkles = !opts.locked && (rarity === 'legendary' || look.halo || complete)
    ? `<g class="bb-sparkles" fill="#ffffff">${[sparkle(30, 34, 8), sparkle(172, 52, 6), sparkle(166, 166, 7), sparkle(34, 160, 5)].map((d) => `<path d="${d}"/>`).join('')}</g>`
    : '';

  // Das Medaillon wird verkleinert, damit Glühen und Strahlen der Seltenheit sichtbar um den Rahmen liegen.
  const medal = `${frame}${emblem}${pips.join('')}${gemSvg.join('')}`;
  const body = opts.face
    // Formatfüllend: Außenrand (r = 92,4) auf die Bildkante skalieren, ohne Schatten
    ? `<g transform="translate(${C} ${C}) scale(${(100 / 92.4).toFixed(4)}) translate(${-C} ${-C})">${medal.replace(/<path d="[^"]*" transform="translate\(0 3\)" fill="#000000" fill-opacity="0\.35"\/>/, '')}</g>`
    : `${effects.join('')}<g transform="translate(${C} ${C}) scale(${MEDAL_SCALE}) translate(${-C} ${-C})">${medal}</g>${sparkles}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}" role="img" aria-label="${esc(title)}">` +
    `<title>${esc(title)}</title><defs>${defs}</defs>` +
    (opts.locked ? `<g filter="url(#${id('locked')})" opacity="0.6">${body}</g>` : body) +
    `</svg>`;
}
