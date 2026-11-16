// Paletten für das Emblem, abgeleitet aus den Farbskalen des MachMit!Haus-Designsystems.
// Die IDs bleiben stabil (gespeicherte Abzeichen verweisen darauf); die Farben stammen aus @best-badges/design-tokens.
// `ink` ist die Motivfarbe und kontrastiert auf `base` mindestens 3:1 (große Grafik).
import { mmh } from '@best-badges/design-tokens';

export interface Palette {
  label: string;
  /** Hauptfarbe der Emblemfläche */
  base: string;
  /** dunklere Kante und Schatten */
  deep: string;
  /** hellere Mitte und Musterlinien */
  light: string;
  /** Akzent für Glanz und Effekte */
  accent: string;
  /** Farbe des Motivs */
  ink: string;
  /** MMH-Skala, aus der die Palette stammt */
  scale: string;
}

const { pastelGreen: pg, cornflower: cf, deadPixel: dp, ferocious: fe, ripeMango: rm, violaceousGreti: vg, lager: lg } = mmh;

export const PALETTES = {
  moss:    { label: 'Moos',        scale: 'Pastel Green',     base: pg[900],  deep: pg[1400], light: pg[600],  accent: pg[300],  ink: pg[100] },
  forest:  { label: 'Tanne',       scale: 'Pastel Green',     base: pg[1100], deep: pg[1500], light: pg[800],  accent: pg[400],  ink: pg[100] },
  harz:    { label: 'Harz',        scale: 'Cornflower',       base: cf[1100], deep: cf[1500], light: cf[900],  accent: cf[500],  ink: cf[100] },
  river:   { label: 'Flusslauf',   scale: 'Cornflower',       base: cf[900],  deep: cf[1400], light: cf[700],  accent: cf[400],  ink: mmh.white },
  slate:   { label: 'Schiefer',    scale: 'Dead Pixel',       base: dp[1200], deep: dp[1500], light: dp[900],  accent: dp[400],  ink: dp[100] },
  ore:     { label: 'Erz',         scale: 'Ferocious',        base: fe[1200], deep: fe[1500], light: fe[1000], accent: fe[500],  ink: fe[100] },
  kaiser:  { label: 'Kaiserrot',   scale: 'Ferocious',        base: fe[1000], deep: fe[1400], light: fe[800],  accent: fe[400],  ink: mmh.white },
  sunset:  { label: 'Abendrot',    scale: 'Ferocious · Ripe Mango', base: fe[800], deep: fe[1300], light: fe[600], accent: rm[500], ink: rm[100] },
  mango:   { label: 'MachMit!-Gelb', scale: 'Ripe Mango',     base: rm[800],  deep: rm[1200], light: rm[600],  accent: rm[300],  ink: rm[1400] },
  heather: { label: 'Heide',       scale: 'Violaceous Greti', base: vg[1000], deep: vg[1400], light: vg[800],  accent: vg[400],  ink: vg[100] },
  night:   { label: 'Nachthimmel', scale: 'Cornflower',       base: cf[1300], deep: cf[1500], light: cf[1000], accent: cf[600],  ink: cf[100] },
  granite: { label: 'Granit',      scale: 'Dead Pixel',       base: dp[700],  deep: dp[1100], light: dp[400],  accent: mmh.white, ink: dp[1500] },
  lager:   { label: 'Lager',       scale: 'Lager',            base: lg[600],  deep: lg[1200], light: lg[300],  accent: lg[100],  ink: lg[1500] },
} as const satisfies Record<string, Palette>;

export type PaletteId = keyof typeof PALETTES;
export const PALETTE_IDS = Object.keys(PALETTES) as PaletteId[];
