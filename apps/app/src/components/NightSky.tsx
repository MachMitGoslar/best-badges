import { Canvas, Circle, LinearGradient, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from '../theme.ts';

/** Nachthimmel-Hintergrund des Game-Looks: Cornflower-Nacht mit warmem MachMit!-Schein oben. */
export function NightSky() {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const glowR = Math.min(size.w * 0.95, size.h * 0.5);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w > 0 && (
        <Canvas style={StyleSheet.absoluteFill}>
          <Rect x={0} y={0} width={size.w} height={size.h}>
            <LinearGradient start={vec(0, 0)} end={vec(0, size.h)} colors={[...colors.night]} positions={[0, 0.55, 1]} />
          </Rect>
          {/* Nebel-Schein in der Mitte, berührt weder Kopf- noch Tab-Leiste (sonst harte Kante) */}
          <Circle cx={size.w * 0.5} cy={size.h * 0.58} r={glowR}>
            <RadialGradient c={vec(size.w * 0.5, size.h * 0.58)} r={glowR} colors={[colors.nebula, 'rgba(151,51,153,0)']} />
          </Circle>
        </Canvas>
      )}
    </View>
  );
}
