import { useEffect, useMemo } from 'react';
import { Canvas, Circle, Path, Skia } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withDelay, withTiming, type SharedValue } from 'react-native-reanimated';

import { mmh } from '@best-badges/design-tokens';

// Konfetti in MachMit!Haus-Farben: Gelb, Grün, Greti, Cornflower
const COLORS = [mmh.ripeMango[700], mmh.ripeMango[300], mmh.white, mmh.pastelGreen[400], mmh.violaceousGreti[500], mmh.cornflower[400]];
const STAR_SVG = 'M0 -6 Q1.3 -1.3 6 0 Q1.3 1.3 0 6 Q-1.3 1.3 -6 0 Q-1.3 -1.3 0 -6Z';

function Particle({ i, n, size, progress }: { i: number; n: number; size: number; progress: SharedValue<number> }) {
  // Pfad erst zur Laufzeit erzeugen, nicht beim Import
  const star = useMemo(() => Skia.Path.MakeFromSVGString(STAR_SVG)!, []);
  const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.2;
  const dist = size * (0.32 + ((i * 37) % 17) / 40);
  const c = size / 2;
  const cx = useDerivedValue(() => c + Math.cos(angle) * dist * progress.value);
  const cy = useDerivedValue(() => c + Math.sin(angle) * dist * progress.value + 40 * progress.value * progress.value);
  const opacity = useDerivedValue(() => (progress.value < 0.05 ? 0 : 1 - progress.value));
  const transform = useDerivedValue(() => [{ translateX: cx.value }, { translateY: cy.value }, { rotate: progress.value * 4 }, { scale: 1.4 - progress.value }]);
  return i % 2
    ? <Circle cx={cx} cy={cy} r={3 + (i % 3)} color={COLORS[i % COLORS.length]} opacity={opacity} />
    : <Path path={star} transform={transform} color={COLORS[i % COLORS.length]} opacity={opacity} />;
}

/** Funkenregen beim Erhalt eines Abzeichens oder einem Stufenaufstieg. */
export function Burst({ size, trigger, delay = 0 }: { size: number; trigger: number; delay?: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    if (trigger <= 0) return;
    progress.value = 0;
    progress.value = withDelay(delay, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }));
  }, [trigger, delay, progress]);
  const n = 28;
  return (
    <Canvas style={{ width: size, height: size, position: 'absolute' }} pointerEvents="none">
      {Array.from({ length: n }, (_, i) => <Particle key={i} i={i} n={n} size={size} progress={progress} />)}
    </Canvas>
  );
}
