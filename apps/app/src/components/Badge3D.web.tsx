import { useEffect, useRef } from 'react';
import { renderBadgeSvg } from '@best-badges/badge-render';
import { MedalStage, svgTexture } from '@best-badges/badge-3d';
import type { BadgeProps } from './Badge';

/** Web-Variante: dieselbe Bühne mit einem Canvas, Textur über den Browser. */
export function Badge3D(props: BadgeProps & { spinOnShow?: boolean; lite?: boolean }) {
  const { size } = props;
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stage = useRef<MedalStage | null>(null);

  useEffect(() => {
    if (!canvas.current) return;
    const s = new MedalStage({ canvas: canvas.current, width: size, height: size, pixelRatio: Math.min(window.devicePixelRatio, 2) });
    stage.current = s;
    if (props.spinOnShow) s.flip();
    s.run();
    return () => { s.dispose(); stage.current = null; };
  }, [size]); // eslint-disable-line react-hooks/exhaustive-deps

  const key = `${JSON.stringify(props.spec)}|${props.tier}|${props.tierCount}|${props.gems?.total}|${props.gems?.filled}|${props.locked}|${props.rarity}`;
  useEffect(() => {
    let cancelled = false;
    const svg = renderBadgeSvg(props.spec, { tier: props.tier, tierCount: props.tierCount, gems: props.gems, locked: props.locked, face: true, size: 1024, idPrefix: 'f' });
    void svgTexture(svg).then((face) => { if (!cancelled) stage.current?.setMedal({ ...props, face }); });
    return () => { cancelled = true; };
  }, [key, size]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <canvas
      ref={canvas}
      style={{ width: size, height: size, touchAction: 'none', cursor: 'grab' }}
      aria-label={props.title}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        stage.current?.point(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      }}
      onPointerLeave={() => stage.current?.release()}
    />
  );
}
