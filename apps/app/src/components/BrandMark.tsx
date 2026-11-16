import { useMemo } from 'react';
import { Canvas, ImageSVG, Skia } from '@shopify/react-native-skia';
import { WORDMARK_RATIO, WORDMARK_SVG } from '../brand/wordmark.ts';

/** MachMit!Haus-Wortmarke. Skia zeichnet SVG in seiner eingebauten Größe, darum Größe ins SVG schreiben. */
export function BrandMark({ height = 32 }: { height?: number }) {
  const width = Math.round(height * WORDMARK_RATIO);
  const svg = useMemo(() => Skia.SVG.MakeFromString(WORDMARK_SVG.replace('<svg ', `<svg width="${width}" height="${height}" `)), [width, height]);
  if (!svg) return null;
  return (
    <Canvas style={{ width, height }} accessibilityRole="image" accessibilityLabel="MachMit!Haus">
      <ImageSVG svg={svg} x={0} y={0} width={width} height={height} />
    </Canvas>
  );
}
