/**
 * App-Theme: „MMH Game“ – MachMit!Haus Dark plus Game-Ebene.
 * Alle Werte stammen aus @best-badges/design-tokens (eine Quelle für App und Verwaltung).
 */
import { dark, game, mmh } from '@best-badges/design-tokens';

export const colors = {
  bg: dark.bgPage,
  bg2: dark.bgCard,
  panel: game.panel,
  panel2: game.panelRaised,
  line: game.panelLine,
  text: dark.fgDefault,
  muted: dark.fgMuted,
  gold: dark.brand,
  onGold: dark.onBrand,
  goldDeep: mmh.ripeMango[1000],
  ok: dark.successFg,
  danger: dark.errorFg,
  night: [game.nightTop, game.nightMid, game.nightBottom] as const,
  glow: game.glow,
  glowSoft: game.glowSoft,
  nebula: game.nebula,
  rarity: game.rarity,
  progressTrack: game.progressTrack,
  progressFill: game.progressFill,
};

/** MMH: Karten 8, Schaltflächen als Pille */
export const radius = { s: 8, m: 12, l: 16, pill: 999 };

/** Inter in festen Schnitten (React Native braucht pro Schnitt eine eigene Familie). */
export const font = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  black: 'Inter_800ExtraBold',
} as const;
