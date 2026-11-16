import { PATTERNS, SHAPES, type PatternId, type ShapeId } from './catalog.ts';
import { ICON_IDS } from './icons.generated.ts';
import { PALETTE_IDS } from './palettes.ts';
import type { BadgeSpec } from './schema.ts';

/** Deterministischer Zufallsgenerator (mulberry32), damit „Würfeln“ reproduzierbar ist. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

/** Zufallsvorschlag für den Editor („Würfeln“). Immer ein Icon-Motiv, weil das am sichersten gut aussieht. */
export function randomSpec(seed: number): BadgeSpec {
  const r = rng(seed);
  return {
    version: 1,
    frame: 'classic',
    emblem: {
      shape: pick(r, Object.keys(SHAPES) as ShapeId[]),
      pattern: pick(r, (Object.keys(PATTERNS) as PatternId[]).filter((p) => p !== 'none')),
      motif: { type: 'icon', ref: pick(r, ICON_IDS) },
      palette: pick(r, PALETTE_IDS),
    },
  };
}
