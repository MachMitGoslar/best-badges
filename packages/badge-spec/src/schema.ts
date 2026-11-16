import { z } from 'zod';
import { FRAMES, PATTERNS, SHAPES } from './catalog.ts';
import { ICONS } from './icons.generated.ts';
import { PALETTES } from './palettes.ts';

const keysOf = <T extends Record<string, unknown>>(o: T) => Object.keys(o) as [keyof T & string, ...(keyof T & string)[]];

/**
 * Logos nur per HTTPS oder als Pfad im eigenen Dateispeicher (`/files/…`).
 * Keine data:-, javascript:- oder protokoll-relativen URLs, keine `..`-Segmente.
 */
const logoUrl = z
  .string()
  .max(2048)
  .refine((u) => /^https:\/\/[^\s"'<>]+$/i.test(u) || /^\/files(\/[A-Za-z0-9_-][A-Za-z0-9_.-]*)+$/.test(u), 'Logo-URL muss https:// oder ein Pfad unter /files/ sein');

export const MotifSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('icon'), ref: z.enum(keysOf(ICONS)) }),
  z.object({
    type: z.literal('monogram'),
    // Buchstaben inkl. Umlaute und Ziffern, 1–3 Zeichen
    text: z.string().trim().regex(/^[\p{L}\p{N}]{1,3}$/u, '1 bis 3 Buchstaben oder Ziffern'),
  }),
  z.object({ type: z.literal('logo'), url: logoUrl }),
]);

export const BadgeSpecSchema = z.object({
  version: z.literal(1),
  frame: z.enum(keysOf(FRAMES)),
  emblem: z.object({
    shape: z.enum(keysOf(SHAPES)),
    pattern: z.enum(keysOf(PATTERNS)),
    motif: MotifSchema,
    palette: z.enum(keysOf(PALETTES)),
  }),
});

export type Motif = z.infer<typeof MotifSchema>;
export type BadgeSpec = z.infer<typeof BadgeSpecSchema>;

export function parseBadgeSpec(input: unknown): BadgeSpec {
  return BadgeSpecSchema.parse(input);
}
