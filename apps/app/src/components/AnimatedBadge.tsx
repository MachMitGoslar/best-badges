import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, Easing, useAnimatedStyle, useDerivedValue, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { Canvas, Circle, Group, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { Badge, type BadgeProps } from './Badge';

/**
 * Großes Abzeichen zum Anfassen: kippt mit dem Finger, schwebt leicht und bekommt regelmäßig einen Glanzstreifen.
 */
export function AnimatedBadge(props: BadgeProps) {
  const { size } = props;
  const rx = useSharedValue(0);
  const ry = useSharedValue(0);
  const float = useSharedValue(0);
  const shine = useSharedValue(-1);

  useEffect(() => {
    float.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.sin) }), -1, true);
    if (!props.locked) {
      shine.value = withRepeat(withSequence(withTiming(-1, { duration: 0 }), withTiming(1.4, { duration: 1100, easing: Easing.out(Easing.cubic) }), withDelay(2600, withTiming(1.4, { duration: 0 }))), -1);
    }
  }, [float, shine, props.locked]);

  const notify = (active: boolean) => props.onInteract?.(active);
  const pan = Gesture.Pan()
    .onBegin(() => { runOnJS(notify)(true); })
    .onFinalize(() => { runOnJS(notify)(false); })
    .onUpdate((e) => {
      ry.value = Math.max(-28, Math.min(28, e.translationX / 4));
      rx.value = Math.max(-28, Math.min(28, -e.translationY / 4));
    })
    .onEnd(() => {
      rx.value = withSpring(0, { damping: 8, stiffness: 90 });
      ry.value = withSpring(0, { damping: 8, stiffness: 90 });
    });

  const style = useAnimatedStyle(() => ({
    transform: [
      { perspective: 700 },
      { translateY: -6 * float.value },
      { rotateX: `${rx.value}deg` },
      { rotateY: `${ry.value}deg` },
    ],
  }));

  // Glanzstreifen läuft diagonal über die Medaille (innerhalb des Rahmens)
  const r = size * 0.42;
  const start = useDerivedValue(() => vec(size * (shine.value - 0.3), size * (shine.value - 0.3)));
  const end = useDerivedValue(() => vec(size * (shine.value + 0.1), size * (shine.value + 0.1)));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[{ width: size, height: size }, style]}>
        <Badge {...props} />
        {!props.locked && (
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Canvas style={{ width: size, height: size }}>
              <Group clip={{ rect: { x: size / 2 - r, y: size / 2 - r, width: 2 * r, height: 2 * r }, rx: r, ry: r }} blendMode="screen">
                <Rect x={0} y={0} width={size} height={size}>
                  <LinearGradient start={start} end={end} colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.55)', 'rgba(255,255,255,0)']} />
                </Rect>
              </Group>
              <Circle cx={size / 2} cy={size / 2} r={r} color="transparent" />
            </Canvas>
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
}
