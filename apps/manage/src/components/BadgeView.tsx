import { useId, useMemo } from 'react';
import { renderBadgeSvg, type RenderOptions } from '@best-badges/badge-render';
import type { BadgeSpec } from '@best-badges/badge-spec';

interface Props extends Omit<RenderOptions, 'idPrefix' | 'size'> {
  spec: BadgeSpec;
  tilt?: boolean;
  className?: string;
}

/**
 * Zeigt ein Abzeichen. Das SVG stammt aus dem eigenen Renderer, der alle Texte und URLs escaped;
 * die Spezifikation ist vorher per Schema geprüft.
 */
export function BadgeView({ spec, tilt = true, className, ...opts }: Props) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const svg = useMemo(() => renderBadgeSvg(spec, { ...opts, idPrefix: `b${id}`, size: 200 }), [spec, id, opts.tier, opts.tierCount, opts.rarity, opts.locked, opts.title, opts.gems?.total, opts.gems?.filled]);
  const inner = <div className="badge-svg" dangerouslySetInnerHTML={{ __html: svg }} />;
  return <div className={`${tilt ? 'badge-tilt' : ''} ${className ?? ''}`}>{inner}</div>;
}
