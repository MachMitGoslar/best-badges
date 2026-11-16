import { useEffect, useRef, useState } from 'react';
import { renderBadgeSvg } from '@best-badges/badge-render';
import { MedalStage, svgTexture } from '@best-badges/badge-3d';
import type { BadgeSpec, Rarity } from '@best-badges/badge-spec';
import { BadgeView } from './BadgeView.tsx';

interface Props {
  spec: BadgeSpec;
  tier?: number;
  tierCount?: number;
  gems?: { total: number; filled: number };
  locked?: boolean;
  rarity?: Rarity;
  title?: string;
}

/** Medaille als echtes 3D-Objekt; ohne WebGL fällt sie auf die 2D-Darstellung zurück. */
export function Badge3D({ spec, tier, tierCount, gems, locked, rarity, title }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<MedalStage | null>(null);
  const [failed, setFailed] = useState(false);

  // Bühne einmal anlegen
  useEffect(() => {
    const el = canvas.current, box = wrap.current;
    if (!el || !box) return;
    try {
      const w = box.clientWidth || 320;
      const s = new MedalStage({ canvas: el, width: w, height: w, pixelRatio: Math.min(window.devicePixelRatio, 2) });
      stage.current = s;
      s.run();
      const ro = new ResizeObserver(() => s.resize(box.clientWidth, box.clientWidth));
      ro.observe(box);
      return () => { ro.disconnect(); s.dispose(); stage.current = null; };
    } catch {
      setFailed(true);
    }
  }, []);

  // Medaille bei Änderungen neu aufbauen
  useEffect(() => {
    let cancelled = false;
    const svg = renderBadgeSvg(spec, { tier, tierCount, gems, locked, face: true, size: 1024, idPrefix: 'm3d', title });
    void svgTexture(svg).then((face) => {
      if (cancelled || !stage.current) { face.dispose(); return; }
      stage.current.setMedal({ spec, tier, tierCount, gems, locked, rarity, face });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [spec, tier, tierCount, gems?.total, gems?.filled, locked, rarity, title]);

  if (failed) return <BadgeView spec={spec} tier={tier} tierCount={tierCount} gems={gems} locked={locked} title={title} />;

  const onMove = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    stage.current?.point(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  };
  return (
    <div ref={wrap} className="badge-3d" onPointerMove={onMove} onPointerLeave={() => stage.current?.release()} role="img" aria-label={title}>
      <canvas ref={canvas} style={{ width: '100%', aspectRatio: '1', display: 'block' }} />
    </div>
  );
}
