import { Image } from 'react-native';
import { WORDMARK_RATIO, WORDMARK_SVG } from '../brand/wordmark.ts';

const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(WORDMARK_SVG)}`;

export function BrandMark({ height = 32 }: { height?: number }) {
  return <Image source={{ uri }} style={{ width: height * WORDMARK_RATIO, height }} accessibilityLabel="MachMit!Haus" />;
}
