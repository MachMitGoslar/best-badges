import { AnimatedBadge } from './AnimatedBadge';
import { Badge3DGL } from './Badge3DGL';
import { Badge3DWebView } from './Badge3DWebView';
import type { BadgeProps } from './Badge';

/**
 * Große Medaille in der App (Detail, Erfolg, Vitrine). Standard ist die WebView-Fassung: dieselbe
 * Darstellung wie im Browser, auf dem iPhone gemessen 333 ms bis zum ersten Bild, 65 ms je Wechsel, 60 fps.
 * Bis das 3D-Bild steht – oder falls WebGL fehlt –, liegt die 2D-Medaille darüber.
 *
 * Zum Vergleichen umschaltbar mit EXPO_PUBLIC_BADGE_3D: 'gl' (expo-gl, leichte Materialien) oder '2d'.
 * Im Web immer direkt 3D (Badge3D.web.tsx).
 */
export function Badge3D(props: BadgeProps & { spinOnShow?: boolean }) {
  const mode = process.env.EXPO_PUBLIC_BADGE_3D;
  if (mode === 'gl') return <Badge3DGL {...props} />;
  if (mode === '2d') {
    const { spinOnShow: _s, ...rest } = props;
    return <AnimatedBadge {...rest} />;
  }
  return <Badge3DWebView {...props} />;
}
