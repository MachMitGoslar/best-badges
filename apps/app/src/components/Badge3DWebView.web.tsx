import { Badge3D } from './Badge3D.web';
import type { BadgeProps } from './Badge';
import type { GLStats } from './Badge3DGL';

/** Im Browser ist die WebView-Fassung einfach die Web-3D-Medaille. */
export function Badge3DWebView(props: BadgeProps & { spinOnShow?: boolean; onStats?: (s: GLStats) => void }) {
  const { onStats: _s, ...rest } = props;
  return <Badge3D {...rest} />;
}
