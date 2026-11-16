// Auswahllisten des Baukastens mit deutschen Bezeichnungen für den Editor.

export const FRAMES = { classic: 'Klassisch' } as const;
export type FrameId = keyof typeof FRAMES;

export const SHAPES = { circle: 'Kreis', shield: 'Schild', hexagon: 'Hexagon', diamond: 'Raute' } as const;
export type ShapeId = keyof typeof SHAPES;

export const PATTERNS = {
  none: 'Ohne', rays: 'Strahlen', waves: 'Wellen', forest: 'Wald', mountains: 'Berge', timber: 'Fachwerk', dots: 'Punkte',
} as const;
export type PatternId = keyof typeof PATTERNS;

/** Material des Rahmens. Es zeigt die Stufe; `enamel` ist der Rahmen für Abzeichen ohne Stufen. */
export const MATERIALS = {
  enamel: 'Emaille', wood: 'Holz', bronze: 'Bronze', silver: 'Silber', gold: 'Gold', crystal: 'Kristall',
} as const;
export type MaterialId = keyof typeof MATERIALS;

/** Seltenheit ergibt sich zur Laufzeit aus dem Anteil der Sammelnden, nicht aus der Spezifikation. */
export const RARITIES = { common: 'Gewöhnlich', rare: 'Selten', epic: 'Episch', legendary: 'Legendär' } as const;
export type Rarity = keyof typeof RARITIES;

const LADDERS: Record<number, MaterialId[]> = {
  1: ['gold'],
  2: ['silver', 'gold'],
  3: ['bronze', 'silver', 'gold'],
  4: ['bronze', 'silver', 'gold', 'crystal'],
  5: ['wood', 'bronze', 'silver', 'gold', 'crystal'],
};

/**
 * Material für Stufe `tier` (1-basiert) von `tierCount` Stufen.
 * Bis fünf Stufen gibt es feste Leitern; darüber wird die Fünferleiter anteilig verteilt.
 */
export function materialForTier(tier: number, tierCount: number): MaterialId {
  const count = Math.max(1, Math.floor(tierCount));
  const t = Math.min(Math.max(1, Math.floor(tier)), count);
  const ladder = LADDERS[count];
  if (ladder) return ladder[t - 1]!;
  const five = LADDERS[5]!;
  return five[Math.round(((t - 1) / (count - 1)) * (five.length - 1))]!;
}

/**
 * Seltenheit aus dem Anteil der Sammelnden. Unterhalb von `minCollectors` gilt alles als gewöhnlich,
 * damit am Anfang nicht jedes Abzeichen legendär wirkt.
 */
export function rarityFromShare(holders: number, collectors: number, minCollectors = 50): Rarity {
  if (collectors < minCollectors || collectors <= 0) return 'common';
  const share = holders / collectors;
  if (share <= 0.02) return 'legendary';
  if (share <= 0.08) return 'epic';
  if (share <= 0.25) return 'rare';
  return 'common';
}

/**
 * Platzhalter für versteckte Abzeichen, die man noch nicht hat. Die API liefert für sie nur
 * `{ secret: true, id, orgId, hint }`; Clients zeichnen dieses Abzeichen selbst.
 */
export const SECRET_NAME = 'Geheimes Abzeichen';
export const SECRET_SPEC = {
  version: 1,
  frame: 'classic',
  emblem: { shape: 'circle', pattern: 'none', motif: { type: 'icon', ref: 'question-mark' }, palette: 'night' },
} as const;
