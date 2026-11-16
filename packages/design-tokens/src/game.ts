// MMH Game: dunkle Variante des MachMit!Haus-Designsystems mit Spiel-Ebene.
// Ebene 1 „MMH Dark“: dieselben Rollen wie das helle System, nur aus den dunklen Skalenstufen.
// Ebene 2 „Game“: Kaffee-Verlauf mit Greti-Nebel, Leuchten in Markengelb, Seltenheitsfarben – alles aus MMH-Skalen.
import { mmh } from './mmh.ts';

const { deadPixel: dp, ripeMango: rm, cornflower: cf, ferocious: fe, pastelGreen: pg, violaceousGreti: vg } = mmh;

/** Ebene 1: MMH Dark – semantische Rollen wie im hellen System */
export const dark = {
  bgPage: dp[1500],            // Seitengrund (hell: dead-pixel-10)
  bgCard: dp[1400],            // Karten, Eingaben (hell: white)
  bgRaised: dp[1300],          // angehobene Flächen, Chips
  border: 'rgba(255, 255, 255, 0.10)', // wie hell rgb(0 0 0 / 10%), invertiert
  borderStrong: dp[1200],
  fgDefault: dp[100],          // Text (hell: dead-pixel-1400)
  fgEmphasis: mmh.white,
  fgMuted: dp[500],            // Nebentext (hell: dead-pixel-1000)
  brand: rm[700],              // Markengelb – Füllung für Primäraktionen
  onBrand: rm[1400],           // Schrift auf Gelb (8.1:1) – nie Weiß auf Gelb
  brandInk: rm[600],           // gelbe Schrift/Marken auf dunklem Grund (hell: ripe-mango-1200)
  brandSoftBg: rm[1400],       // weicher Markengrund
  brandSoftFg: rm[300],
  successFg: pg[400], successSoftBg: pg[1400], successBorder: pg[1100],
  warningFg: rm[600], warningSoftBg: rm[1500], warningBorder: rm[1200],
  errorFg: fe[500], errorSoftBg: fe[1500], errorBorder: fe[1200],
  focus: rm[700],
} as const;

/** Ebene 2: Game Look */
export const game = {
  // „Kaffee & Karamell“: Schwarz oben, dunkles Ripe Mango (Kaffee) unten – die Markenfarbe in ihrer tiefsten Stufe
  nightTop: dp[1500],
  nightMid: rm[1500],
  nightBottom: '#2e2306',      // zwischen ripe-mango-1500 und -1400: Karamell-Boden
  /** Warmer Schein am unteren Rand (Ripe Mango 1300, transparent) */
  caramel: 'rgba(100, 78, 12, 0.35)',
  glow: rm[700],               // Leuchten bei Erfolg und Stufenaufstieg
  glowSoft: 'rgba(252, 206, 76, 0.28)',
  /** Nebel-Schein für Hintergründe (Greti 1000, transparent) */
  nebula: 'rgba(151,51,153,0.22)',
  panel: 'rgba(34, 34, 34, 0.72)',  // dead-pixel-1400, halbtransparent über dem Kaffeegrund
  panelRaised: dp[1300],
  panelLine: 'rgba(253, 222, 135, 0.14)', // ripe-mango-500 als warme Haarlinie
  // Seltenheit – unterscheidet sich auch in der Helligkeit, nicht nur im Farbton
  rarity: { common: dp[500], rare: cf[600], epic: vg[700], legendary: rm[700] },
  // Stufen-Fortschritt
  progressTrack: dp[1300],
  progressFill: rm[700],
} as const;

export const radius = { sm: 4, md: 8, lg: 12, xl: 16, pill: 999 } as const;   // MMH border-radius-3/4/5/6/pill
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 40, 8: 48 } as const; // MMH size-1 … size-8

/** Typo nach MMH (Inter, Titel 700 mit 120 %), im Game Look Titel zusätzlich 800 */
export const type = {
  display: { size: 40, weight: 800, lineHeight: 1.1, letterSpacing: -0.6 },
  title: { size: 28, weight: 700, lineHeight: 1.2, letterSpacing: -0.4 },
  headline: { size: 20, weight: 700, lineHeight: 1.2 },
  subheadline: { size: 18, weight: 500, lineHeight: 1.3 },
  body: { size: 16, weight: 400, lineHeight: 1.3 },
  footnote: { size: 14, weight: 400, lineHeight: 1.3 },
  caption: { size: 12, weight: 600, lineHeight: 1.3, letterSpacing: 0.6 }, // Labels, in Großbuchstaben per Stil
} as const;
