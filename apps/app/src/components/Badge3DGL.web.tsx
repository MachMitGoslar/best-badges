import { Badge3D } from './Badge3D.web';
import type { BadgeProps } from './Badge';

export interface GLStats { firstFrameMs: number | null; fps: number }

/** Web: dieselbe 3D-Bühne über einen Browser-Canvas (keine Messwerte). */
export function Badge3DGL(props: BadgeProps & { spinOnShow?: boolean; onStats?: (s: GLStats) => void }) {
  const { onStats: _s, ...rest } = props;
  // Wie auf dem Handy: leichte Materialien – so lässt sich der Geräte-Look im Browser vorab ansehen
  return <Badge3D {...rest} lite />;
}
