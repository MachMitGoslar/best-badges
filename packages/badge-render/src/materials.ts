import type { MaterialId, Palette } from '@best-badges/badge-spec';
import { mmh } from '@best-badges/design-tokens';

const rm = mmh.ripeMango, cf = mmh.cornflower, vg = mmh.violaceousGreti, dp = mmh.deadPixel;

export type Texture = 'none' | 'grain' | 'hammered' | 'brushed' | 'facets';

export interface MaterialLook {
  /** Verlauf des Rahmens von oben links nach unten rechts */
  stops: [offset: number, color: string][];
  /** Kantenlinie */
  edge: string;
  /** Glanzfarbe für Stufen-Punkte, Nieten und Lichter */
  shine: string;
  /** Oberflächenstruktur des Rahmens */
  texture: Texture;
  /** Anzahl Nieten im oberen Bogen */
  studs: number;
  /** Stärke des Glanzlichts oben links (0 = matt) */
  gloss: number;
  /** Neon-Aura und Lichtkreuz (höchste Stufe) */
  halo: boolean;
}

/**
 * Rahmenmaterialien der Stufen. Sie sind unabhängig von der Palette, damit eine Stufe überall gleich aussieht.
 * Abzeichen ohne Stufen bekommen Emaille in den Farben ihrer Palette (siehe `materialLook`).
 */
const LOOKS: Record<Exclude<MaterialId, 'enamel'>, MaterialLook> = {
  wood: {
    stops: [[0, '#b98a5c'], [0.35, '#94653d'], [0.7, '#73492a'], [1, '#4e2f19']],
    edge: '#2e1b0d', shine: '#e9cfa6', texture: 'grain', studs: 0, gloss: 0.12, halo: false,
  },
  bronze: {
    stops: [[0, '#ffc28c'], [0.3, '#e07a33'], [0.6, '#a94b17'], [1, '#5e2408']],
    edge: '#431806', shine: '#ffd9b5', texture: 'hammered', studs: 6, gloss: 0.5, halo: false,
  },
  silver: {
    // Chrom: harte Lichtbänder statt eines weichen Verlaufs
    stops: [[0, '#ffffff'], [0.16, '#dce3ea'], [0.3, '#7d8996'], [0.42, '#f7f9fb'], [0.56, '#b7c1cc'], [0.7, '#56616d'], [0.84, '#e6ecf2'], [1, '#9aa6b3']],
    edge: '#2f3742', shine: '#ffffff', texture: 'brushed', studs: 8, gloss: 0.9, halo: false,
  },
  gold: {
    // Gold aus der MMH-Markenskala Ripe Mango
    stops: [[0, rm[200]], [0.22, rm[700]], [0.4, rm[1000]], [0.55, rm[500]], [0.75, rm[1100]], [1, rm[1300]]],
    edge: rm[1400], shine: rm[100], texture: 'brushed', studs: 12, gloss: 0.8, halo: false,
  },
  crystal: {
    // Prismatisch schillernd, aus Cornflower, Violaceous Greti und Ripe Mango
    stops: [[0, '#ffffff'], [0.18, cf[300]], [0.36, cf[600]], [0.54, vg[600]], [0.72, rm[400]], [0.88, cf[400]], [1, cf[1000]]],
    edge: cf[1300], shine: '#ffffff', texture: 'facets', studs: 0, gloss: 1, halo: true,
  },
};

export function materialLook(material: MaterialId, palette: Palette): MaterialLook {
  if (material === 'enamel') {
    // Emaille in Palettenfarbe mit Goldkante – Einzelabzeichen wirken so eigenständig und farbig
    return {
      stops: [[0, palette.light], [0.45, palette.base], [1, palette.deep]],
      edge: rm[1000], shine: rm[400], texture: 'none', studs: 0, gloss: 0.5, halo: false,
    };
  }
  return LOOKS[material];
}

/** Sammel-Abzeichen (Kombinationen): Onyx-Rahmen mit Goldkante, in den die Kristalle gefasst sind. */
export const COLLECTION_LOOK: MaterialLook = {
  stops: [[0, dp[900]], [0.25, dp[1200]], [0.55, dp[1400]], [0.8, dp[1500]], [1, '#000000']],
  edge: rm[900], shine: rm[300], texture: 'none', studs: 0, gloss: 0.55, halo: false,
};
