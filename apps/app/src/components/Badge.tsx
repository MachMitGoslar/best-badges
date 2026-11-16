import { useMemo } from 'react';
import { Canvas, ColorMatrix, Group, ImageSVG, Paint, Skia } from '@shopify/react-native-skia';
import { renderBadgeSvg, type RenderOptions } from '@best-badges/badge-render';
import type { BadgeSpec } from '@best-badges/badge-spec';

// Graustufen für noch nicht gesammelte Abzeichen
const GRAYSCALE = [
  0.33, 0.33, 0.33, 0, 0,
  0.33, 0.33, 0.33, 0, 0,
  0.33, 0.33, 0.33, 0, 0,
  0, 0, 0, 0.55, 0,
];

export interface BadgeProps extends Omit<RenderOptions, 'size' | 'idPrefix'> {
  spec: BadgeSpec;
  size: number;
  /** Finger liegt auf der Medaille (true) bzw. losgelassen – z. B. um das Scrollen der Seite zu sperren */
  onInteract?: (active: boolean) => void;
}

/** Abzeichen aus der gemeinsamen Spezifikation, gerendert mit Skia (gleiches SVG wie im Web). */
export function Badge({ spec, size, tier, tierCount, rarity, locked, title, gems }: BadgeProps) {
  const svg = useMemo(
    // Zielgröße direkt ins SVG schreiben: ImageSVG zeichnet in der eingebauten Größe des SVG
    () => Skia.SVG.MakeFromString(renderBadgeSvg(spec, { tier, tierCount, rarity: locked ? 'common' : rarity, size: Math.round(size), idPrefix: 'b', title, gems })),
    [spec, tier, tierCount, rarity, locked, title, size, gems?.total, gems?.filled],
  );
  if (!svg) return null;
  const image = <ImageSVG svg={svg} x={0} y={0} width={size} height={size} />;
  return (
    <Canvas style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel={title}>
      {locked ? (
        <Group layer={<Paint><ColorMatrix matrix={GRAYSCALE} /></Paint>}>{image}</Group>
      ) : image}
    </Canvas>
  );
}
