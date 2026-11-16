import { useMemo } from 'react';
import { Image } from 'react-native';
import { renderBadgeSvg } from '@best-badges/badge-render';
import type { BadgeProps } from './Badge';

/**
 * Web-Variante: dasselbe SVG aus badge-render, direkt vom Browser gezeichnet.
 * Skia bräuchte im Web zusätzlich CanvasKit (WebAssembly); für die Darstellung reicht SVG.
 */
export function Badge({ spec, size, tier, tierCount, rarity, locked, title, gems }: BadgeProps) {
  const uri = useMemo(() => {
    const svg = renderBadgeSvg(spec, { tier, tierCount, rarity, locked, size: Math.round(size), title, gems });
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [spec, tier, tierCount, rarity, locked, size, title, gems?.total, gems?.filled]);
  return <Image source={{ uri }} style={{ width: size, height: size }} accessibilityLabel={title} />;
}
