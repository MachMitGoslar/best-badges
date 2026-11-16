import { describe, it, expect } from 'vitest';
import { ICON_IDS, PATTERNS, SHAPES, PALETTE_IDS, type BadgeSpec, type PatternId, type ShapeId } from '@best-badges/badge-spec';
import { ornamentLayout } from './ornaments.ts';
import { renderBadgeSvg, resolveMaterial } from './index.ts';

const spec: BadgeSpec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'forest', motif: { type: 'icon', ref: 'trees' }, palette: 'moss' } };
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('renderBadgeSvg', () => {
  it('liefert ein eigenständiges SVG mit zugänglichem Namen', () => {
    const svg = renderBadgeSvg(spec, { title: 'Walderlebnispfad', size: 120 });
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg).toContain('width="120" height="120"');
    expect(svg).toContain('aria-label="Walderlebnispfad"');
    expect(svg).toContain('<title>Walderlebnispfad</title>');
  });

  it('ist deterministisch', () => {
    expect(renderBadgeSvg(spec, { tier: 2, tierCount: 5 })).toBe(renderBadgeSvg(spec, { tier: 2, tierCount: 5 }));
  });

  it('vergibt eindeutige ID-Präfixe je Darstellung und hält sie ein', () => {
    const a = renderBadgeSvg(spec, { tier: 1, tierCount: 5 });
    const b = renderBadgeSvg(spec, { tier: 2, tierCount: 5 });
    const idsA = [...a.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!);
    const idsB = [...b.matchAll(/id="([^"]+)"/g)].map((m) => m[1]!);
    expect(idsA.some((x) => idsB.includes(x))).toBe(false);
    const custom = renderBadgeSvg(spec, { idPrefix: 'x1' });
    for (const [, ident] of custom.matchAll(/id="([^"]+)"/g)) expect(ident!.startsWith('x1-')).toBe(true);
    for (const [, ref] of custom.matchAll(/url\(#([^)]+)\)/g)) expect(ref!.startsWith('x1-')).toBe(true);
  });

  it('escaped den Titel', () => {
    const svg = renderBadgeSvg(spec, { title: '<script>alert("x")</script>' });
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
  });

  it('zeigt Stufen als Punkte: so viele wie Stufen, gefüllt bis zur erreichten', () => {
    const svg = renderBadgeSvg(spec, { tier: 3, tierCount: 5 });
    expect(count(svg, /r="4\.6"/g)).toBe(3);
    expect(count(svg, /r="3\.6"/g)).toBe(2);
    expect(count(renderBadgeSvg(spec), /r="4\.6"|r="3\.6"/g)).toBe(0);
  });

  it('wählt das Material nach Stufe, ohne Stufe Emaille', () => {
    expect(resolveMaterial({})).toBe('enamel');
    expect(resolveMaterial({ tier: 5, tierCount: 5 })).toBe('crystal');
    expect(resolveMaterial({ tier: 7, tierCount: 3 })).toBe('gold');
  });

  it('zeigt Seltenheit über Glühen, Strahlen und Funkeln', () => {
    const common = renderBadgeSvg(spec, { rarity: 'common' });
    const rare = renderBadgeSvg(spec, { rarity: 'rare' });
    const legendary = renderBadgeSvg(spec, { rarity: 'legendary' });
    expect(common).not.toContain('bb-rays');
    expect(rare).toContain('-glow)"/>');
    expect(rare).not.toContain('bb-rays');
    expect(legendary).toContain('bb-rays');
    expect(legendary).toContain('bb-sparkles');
  });

  it('zeigt bei der höchsten Stufe Aura und Lichtkreuz, auch ohne Seltenheit', () => {
    const top = renderBadgeSvg(spec, { tier: 5, tierCount: 5 });
    expect(top).toContain('bb-beams');
    expect(top).toContain('-halo)"/>');
    expect(top).not.toContain('<ellipse cx="100" cy="22"');
    expect(renderBadgeSvg(spec, { tier: 4, tierCount: 5 })).not.toContain('bb-beams');
  });

  it('färbt Stufenrahmen unabhängig von der Palette, Einzelabzeichen in Palettenfarbe', () => {
    const rimOf = (svg: string) => svg.match(/<linearGradient id="[^"]+-rim"[^>]*>(.*?)<\/linearGradient>/)![1];
    const other: BadgeSpec = { ...spec, emblem: { ...spec.emblem, palette: 'kaiser' } };
    expect(rimOf(renderBadgeSvg(spec, { tier: 3, tierCount: 5 }))).toBe(rimOf(renderBadgeSvg(other, { tier: 3, tierCount: 5 })));
    expect(rimOf(renderBadgeSvg(spec))).not.toBe(rimOf(renderBadgeSvg(other)));
    expect(rimOf(renderBadgeSvg(spec))).toContain('#477a47'); // Moos = MMH Pastel Green 900
  });

  it('entsättigt gesperrte Abzeichen und unterdrückt Effekte', () => {
    const svg = renderBadgeSvg(spec, { locked: true, rarity: 'legendary', tier: 5, tierCount: 5 });
    expect(svg).toMatch(/<g filter="url\(#[^)]+-locked\)" opacity="0\.6">/);
    expect(svg).not.toContain('bb-rays');
    expect(svg).not.toContain('bb-beams');
  });

  it('bettet Logos als Silhouette ein und escaped die URL', () => {
    const svg = renderBadgeSvg({ ...spec, emblem: { ...spec.emblem, motif: { type: 'logo', url: 'https://cdn.example.test/a&b.png' } } });
    expect(svg).toContain('href="https://cdn.example.test/a&amp;b.png"');
    expect(svg).toMatch(/filter="url\(#[^)]+-silhouette\)"/);
  });

  it('rendert jede Kombination aus Form, Muster, Palette und Icon ohne kaputte Werte', () => {
    for (const shape of Object.keys(SHAPES) as ShapeId[]) {
      for (const pattern of Object.keys(PATTERNS) as PatternId[]) {
        for (const [i, icon] of ICON_IDS.entries()) {
          const palette = PALETTE_IDS[i % PALETTE_IDS.length]!;
          const svg = renderBadgeSvg({ version: 1, frame: 'classic', emblem: { shape, pattern, motif: { type: 'icon', ref: icon }, palette } }, { tier: (i % 5) + 1, tierCount: 5, rarity: 'legendary' });
          expect(svg).not.toMatch(/NaN|undefined|Infinity/);
          expect(count(svg, /<g\b/g)).toBe(count(svg, /<\/g>/g));
        }
      }
    }
  });

  it('zeigt bei Sammel-Abzeichen so viele Kristalle wie Teile nötig sind, gesammelte leuchten', () => {
    const svg = renderBadgeSvg(spec, { gems: { total: 5, filled: 2 }, tier: 3, tierCount: 3, idPrefix: 'g' });
    expect(count(svg, /fill="url\(#g-gem\)"/g)).toBe(2);
    expect(count(svg, /url\(#g-gemglow\)/g)).toBe(2);
    // Keine Stufen-Punkte, kein Kranz solange unvollständig
    expect(svg).not.toContain('url(#g-done)"/>');
    const full = renderBadgeSvg(spec, { gems: { total: 3, filled: 3 }, idPrefix: 'h' });
    expect(full).toContain('fill="url(#h-done)"');
    expect(count(full, /fill="url\(#h-gem\)"/g)).toBe(3);
    expect(renderBadgeSvg(spec, { gems: { total: 99, filled: 0 } })).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('liefert für 3D nur die Medaille ohne Effekte und Schatten', () => {
    const svg = renderBadgeSvg(spec, { face: true, tier: 5, tierCount: 5, rarity: 'legendary', idPrefix: 'f' });
    expect(svg).not.toContain('bb-sparkles');
    expect(svg).not.toContain('bb-rays');
    expect(svg).not.toContain('fill-opacity="0.35"');
    expect(svg).not.toMatch(/NaN|undefined/);
  });

  it('liefert die Lage der Schmuckteile passend zur 2D-Grafik', () => {
    const l = ornamentLayout(spec, { tier: 2, tierCount: 3 });
    expect(l.pips.map((p) => p.filled)).toEqual([true, true, false]);
    expect(l.studs.length).toBe(l.look.studs);
    const g = ornamentLayout(spec, { gems: { total: 5, filled: 2 } });
    expect(g.gems.filter((x) => x.lit)).toHaveLength(2);
    expect(g.pips).toEqual([]);
    // Im Face-Modus sind sie nicht gemalt
    const face = renderBadgeSvg(spec, { face: true, gems: { total: 5, filled: 2 }, idPrefix: 'q' });
    expect(face).not.toContain('url(#q-gem)"');
  });
});
