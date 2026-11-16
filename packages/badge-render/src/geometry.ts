import type { PatternId, ShapeId } from '@best-badges/badge-spec';

export const C = 100; // Mittelpunkt im 200×200-Raster
const f = (n: number) => Number(n.toFixed(2));

/** Gewellter Außenrand des Medaillons. */
export function scallopPath(r: number, bumps: number, depth: number, steps = 192): string {
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const rr = r + depth * Math.cos(bumps * t);
    pts.push(`${f(C + rr * Math.cos(t))} ${f(C + rr * Math.sin(t))}`);
  }
  return `M${pts.join('L')}Z`;
}

function polygon(r: number, corners: number, rotDeg: number): string {
  const pts: string[] = [];
  for (let i = 0; i < corners; i++) {
    const t = ((rotDeg + (360 / corners) * i) * Math.PI) / 180;
    pts.push(`${f(C + r * Math.cos(t))} ${f(C + r * Math.sin(t))}`);
  }
  return `M${pts.join('L')}Z`;
}

/** Umriss der Emblemfläche; alle Formen bleiben innerhalb von r = 72. */
export function shapePath(shape: ShapeId): string {
  switch (shape) {
    case 'circle':
      return `M${C - 70} ${C}a70 70 0 1 0 140 0a70 70 0 1 0 -140 0Z`;
    case 'shield':
      return 'M100 36L152 52V98C152 132 130 154 100 166C70 154 48 132 48 98V52Z';
    case 'hexagon':
      return polygon(71, 6, -90);
    case 'diamond':
      return polygon(71, 4, -90);
  }
}

/** Platz für das Motiv je Form: Mittelpunkt und Kantenlänge des Quadrats. */
export function motifBox(shape: ShapeId): { cx: number; cy: number; size: number } {
  switch (shape) {
    case 'circle': return { cx: C, cy: C, size: 86 };
    case 'shield': return { cx: C, cy: 97, size: 74 };
    case 'hexagon': return { cx: C, cy: C, size: 82 };
    case 'diamond': return { cx: C, cy: C, size: 66 };
  }
}

/** Muster als SVG-Fragment; wird auf die Emblemfläche zugeschnitten. */
export function patternSvg(pattern: PatternId, light: string, deep: string): string {
  const line = `fill="none" stroke="${light}" stroke-opacity="0.3" stroke-width="2.2"`;
  switch (pattern) {
    case 'none':
      return '';
    case 'rays': {
      const parts: string[] = [];
      for (let i = 0; i < 24; i += 2) {
        const a1 = (i / 24) * Math.PI * 2, a2 = ((i + 1) / 24) * Math.PI * 2;
        parts.push(`M${C} ${C}L${f(C + 110 * Math.cos(a1))} ${f(C + 110 * Math.sin(a1))}L${f(C + 110 * Math.cos(a2))} ${f(C + 110 * Math.sin(a2))}Z`);
      }
      return `<path d="${parts.join('')}" fill="${light}" fill-opacity="0.18"/>`;
    }
    case 'waves': {
      const parts: string[] = [];
      for (let y = 30; y <= 175; y += 13) {
        let d = `M20 ${y}`;
        for (let x = 20; x < 180; x += 20) d += `q5 -5 10 0t10 0`;
        parts.push(d);
      }
      return `<path d="${parts.join('')}" ${line}/>`;
    }
    case 'forest': {
      const tree = (x: number, y: number, h: number) => `M${x} ${y - h}l${f(h * 0.42)} ${h}h${f(-h * 0.84)}Z`;
      const back: string[] = [], front: string[] = [];
      for (let x = 22; x <= 180; x += 15) back.push(tree(x, 150, 26 + ((x * 7) % 11)));
      for (let x = 30; x <= 175; x += 19) front.push(tree(x, 172, 32 + ((x * 5) % 9)));
      return `<path d="${back.join('')}" fill="${light}" fill-opacity="0.22"/><path d="${front.join('')}" fill="${deep}" fill-opacity="0.45"/>`;
    }
    case 'mountains':
      return `<path d="M10 175L62 108L88 136L120 92L190 175Z" fill="${light}" fill-opacity="0.16"/>` +
        `<path d="M10 180L50 140L78 162L112 124L190 180Z" fill="${deep}" fill-opacity="0.45"/>` +
        `<path d="M120 92L111 104L120 101L128 107Z" fill="#ffffff" fill-opacity="0.35"/>`;
    case 'timber': {
      const parts: string[] = [];
      for (let x = 28; x <= 172; x += 36) parts.push(`M${x} 20V180`);
      for (let y = 46; y <= 160; y += 38) parts.push(`M20 ${y}H180`);
      for (let x = 28, i = 0; x < 172; x += 36, i++) {
        for (let y = 46, j = 0; y < 160; y += 38, j++) parts.push((i + j) % 2 ? `M${x} ${y}L${x + 36} ${y + 38}` : `M${x + 36} ${y}L${x} ${y + 38}`);
      }
      return `<path d="${parts.join('')}" fill="none" stroke="${deep}" stroke-opacity="0.38" stroke-width="4" stroke-linecap="square"/>`;
    }
    case 'dots': {
      const parts: string[] = [];
      for (let y = 28; y <= 175; y += 14) for (let x = 28 + ((y / 14) % 2) * 7; x <= 175; x += 14) parts.push(`M${x} ${y}h0.01`);
      return `<path d="${parts.join('')}" fill="none" stroke="${light}" stroke-opacity="0.36" stroke-width="3.4" stroke-linecap="round"/>`;
    }
  }
}
