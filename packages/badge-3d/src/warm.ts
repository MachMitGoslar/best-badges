import type { BadgeSpec } from '@best-badges/badge-spec';
import type { MedalOptions } from './medal.ts';

const spec: BadgeSpec = { version: 1, frame: 'classic', emblem: { shape: 'circle', pattern: 'rays', motif: { type: 'icon', ref: 'star' }, palette: 'mango' } } as BadgeSpec;

/**
 * Materialvarianten fürs Vorwärmen: jede Stufe (Holz bis Kristall), Emaille, Sammlung mit gefüllten
 * und offenen Fassungen, gesperrt, dazu die Seltenheits-Effekte. Gleiche Shader teilen sich ein Programm,
 * die Liste darf also großzügig sein.
 */
export function warmVariants(lite = false): Omit<MedalOptions, 'face'>[] {
  const v: Omit<MedalOptions, 'face'>[] = [];
  for (let t = 1; t <= 5; t++) v.push({ spec, tier: t, tierCount: 5, lite });
  v.push({ spec, lite, rarity: 'legendary' });
  v.push({ spec, lite, rarity: 'epic', gems: { total: 4, filled: 2 } });
  v.push({ spec, lite, tier: 2, tierCount: 3, locked: true });
  return v;
}
