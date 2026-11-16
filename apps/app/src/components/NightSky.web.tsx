import { StyleSheet, View } from 'react-native';
import { colors } from '../theme.ts';

/** Web-Variante ohne Skia: dieselben Farben als CSS-Verlauf. */
export function NightSky() {
  const [top, mid, bottom] = colors.night;
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, {
        // react-native-web reicht backgroundImage an CSS durch
        backgroundImage: `radial-gradient(circle at 50% 58%, ${colors.nebula}, transparent 45%), linear-gradient(180deg, ${top} 0%, ${mid} 55%, ${bottom} 100%)`,
      } as object]}
    />
  );
}
