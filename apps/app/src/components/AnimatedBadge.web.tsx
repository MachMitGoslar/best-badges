import type { BadgeProps } from './Badge';
import { Badge } from './Badge.web.tsx';

/** Web-Variante ohne Skia-Effekte: Kippen und Glanz gibt es nur in der nativen App. */
export function AnimatedBadge(props: BadgeProps) {
  return <Badge {...props} />;
}
