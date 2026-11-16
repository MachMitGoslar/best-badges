// Oberflächenstrukturen für den Rahmen (Ring zwischen r = 70 und r = 90 im Medaillon).
import { C } from './geometry.ts';
import type { MaterialLook } from './materials.ts';

const f = (n: number) => Number(n.toFixed(2));
const pt = (r: number, a: number) => `${f(C + r * Math.cos(a))} ${f(C + r * Math.sin(a))}`;

/** Fester Pseudozufall, damit jedes Abzeichen gleich aussieht. */
function seq(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

/** Leicht gewellter Ring – Jahresring im Holz. */
function wobblyRing(r: number, phase: number, amp: number): string {
  const steps = 96, pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    pts.push(pt(r + amp * Math.sin(5 * a + phase) + amp * 0.6 * Math.sin(13 * a + phase * 2), a));
  }
  return `M${pts.join('L')}Z`;
}

function grain(look: MaterialLook): string {
  const dark: string[] = [], light: string[] = [];
  const radii = [72, 74.2, 75.6, 77.9, 79.4, 81.8, 83.1, 85.4, 87.6];
  radii.forEach((r, i) => (i % 2 ? light : dark).push(wobblyRing(r, i * 1.7, 0.7 + (i % 3) * 0.25)));
  // Astlöcher: kleine Ellipsen mit Ringen
  const knots = [[0.6, 80], [2.5, 78], [4.1, 82]].map(([a, r]) => {
    const x = C + r! * Math.cos(a!), y = C + r! * Math.sin(a!);
    const rot = (a! * 180) / Math.PI + 90;
    return `<g transform="rotate(${f(rot)} ${f(x)} ${f(y)})"><ellipse cx="${f(x)}" cy="${f(y)}" rx="5" ry="2.6" fill="${look.edge}" fill-opacity="0.55"/><ellipse cx="${f(x)}" cy="${f(y)}" rx="7.5" ry="3.8" fill="none" stroke="${look.edge}" stroke-opacity="0.4" stroke-width="0.8"/></g>`;
  });
  return `<path d="${dark.join('')}" fill="none" stroke="${look.edge}" stroke-opacity="0.55" stroke-width="1.1"/>` +
    `<path d="${light.join('')}" fill="none" stroke="#f0cf9e" stroke-opacity="0.35" stroke-width="0.8"/>` + knots.join('');
}

function hammered(look: MaterialLook): string {
  // Gehämmerte Oberfläche: weiche, überlappende Dellen mit Licht oben links und Schatten unten rechts
  const r = seq(7), hi: string[] = [], lo: string[] = [];
  for (let i = 0; i < 110; i++) {
    const a = r() * Math.PI * 2, rr = 71 + r() * 19, s = 2.2 + r() * 2;
    const x = C + rr * Math.cos(a), y = C + rr * Math.sin(a);
    lo.push(`M${f(x - s)} ${f(y)}a${f(s)} ${f(s)} 0 0 0 ${f(2 * s)} 0`);
    hi.push(`M${f(x + s)} ${f(y)}a${f(s)} ${f(s)} 0 0 0 ${f(-2 * s)} 0`);
  }
  return `<path d="${lo.join('')}" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.1" stroke-linecap="round"/>` +
    `<path d="${hi.join('')}" fill="none" stroke="${look.edge}" stroke-opacity="0.32" stroke-width="1.1" stroke-linecap="round"/>`;
}

function brushed(): string {
  const a: string[] = [], b: string[] = [];
  for (let r = 71.5, i = 0; r < 90; r += 1.1, i++) (i % 2 ? a : b).push(`M${C - r} ${C}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`);
  return `<path d="${a.join('')}" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="0.5"/>` +
    `<path d="${b.join('')}" fill="none" stroke="#000000" stroke-opacity="0.07" stroke-width="0.5"/>`;
}

function facets(): string {
  const lightW: string[] = [], darkW: string[] = [], lines: string[] = [];
  const n = 24;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, am = (a0 + a1) / 2;
    // Jede Facette: zwei Dreiecke mit Spitze außen bzw. innen
    const outerTri = `M${pt(70.5, a0)}L${pt(90, am)}L${pt(70.5, a1)}Z`;
    const innerTri = `M${pt(90, a0)}L${pt(70.5, a0)}L${pt(90, am)}Z`;
    (i % 2 ? lightW : darkW).push(outerTri);
    (i % 2 ? darkW : lightW).push(innerTri);
    lines.push(`M${pt(70.5, a0)}L${pt(90, am)}L${pt(70.5, a1)}`);
  }
  return `<path d="${lightW.join('')}" fill="#ffffff" fill-opacity="0.32"/>` +
    `<path d="${darkW.join('')}" fill="#2a1d7a" fill-opacity="0.22"/>` +
    `<path d="${lines.join('')}" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="0.6"/>`;
}

export function textureSvg(look: MaterialLook): string {
  switch (look.texture) {
    case 'none': return '';
    case 'grain': return grain(look);
    case 'hammered': return hammered(look);
    case 'brushed': return brushed();
    case 'facets': return facets();
  }
}
