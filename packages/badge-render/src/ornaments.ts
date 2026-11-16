// Lage der Schmuckteile am Rahmen – eine Quelle für die 2D-Grafik und die 3D-Medaille.
// Winkel im SVG-Raster (Bogenmaß, y zeigt nach unten), Radius 80 von 100 (3D: 0,80).
import { PALETTES, type BadgeSpec } from '@best-badges/badge-spec';
import { COLLECTION_LOOK, materialLook, type MaterialLook } from './materials.ts';
import { resolveMaterial } from './render.ts';

export const ORNAMENT_RADIUS = 80;

export interface OrnamentLayout {
  look: MaterialLook;
  /** Nieten im oberen Bogen */
  studs: number[];
  /** Stufen-Punkte unten; filled = erreicht */
  pips: { angle: number; filled: boolean }[];
  /** Kristalle rundum (Sammel-Abzeichen); lit = Teil gesammelt; size = halbe Länge im SVG-Raster */
  gems: { angle: number; lit: boolean; size: number }[];
}

export function ornamentLayout(spec: BadgeSpec, o: { tier?: number; tierCount?: number; gems?: { total: number; filled: number } }): OrnamentLayout {
  const gems = o.gems ? { total: Math.min(Math.max(1, Math.round(o.gems.total)), 20), filled: Math.max(0, Math.round(o.gems.filled)) } : null;
  const look = gems ? COLLECTION_LOOK : materialLook(resolveMaterial(o), PALETTES[spec.emblem.palette]);
  const studs = Array.from({ length: look.studs }, (_, i) => ((150 + (240 / (look.studs - 1 || 1)) * i) * Math.PI) / 180);

  const tierCount = !gems && o.tier !== undefined ? Math.max(1, o.tierCount ?? o.tier) : 0;
  const tier = o.tier !== undefined ? Math.min(Math.max(1, o.tier), tierCount) : 0;
  const step = 13 * (Math.PI / 180);
  const pips = tierCount > 1
    ? Array.from({ length: tierCount }, (_, i) => ({ angle: Math.PI / 2 - (i - (tierCount - 1) / 2) * step, filled: i < tier }))
    : [];

  const size = gems ? Math.min(10, Math.max(4, ((2 * Math.PI * ORNAMENT_RADIUS) / gems.total) * 0.34)) : 0;
  const gemList = gems
    ? Array.from({ length: gems.total }, (_, i) => ({ angle: -Math.PI / 2 + (i / gems.total) * Math.PI * 2, lit: i < gems.filled, size }))
    : [];
  return { look, studs, pips, gems: gemList };
}
