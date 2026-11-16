import { useEffect, useRef, useState } from 'react';
import { PanResponder, View } from 'react-native';
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import * as THREE from 'three';
import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';
import { renderBadgeSvg } from '@best-badges/badge-render';
import { MedalStage } from '@best-badges/badge-3d';
import { Badge, type BadgeProps } from './Badge';

const TEX = 768;

/** Vorderseite als Rohpixel: Skia rastert dieselbe SVG wie in 2D, three.js bekommt sie als DataTexture. */
function faceTexture(p: BadgeProps): THREE.DataTexture | null {
  const svgText = renderBadgeSvg(p.spec, { tier: p.tier, tierCount: p.tierCount, gems: p.gems, locked: p.locked, face: true, size: TEX, idPrefix: 'f' });
  const svg = Skia.SVG.MakeFromString(svgText);
  const surface = Skia.Surface.Make(TEX, TEX);
  if (!svg || !surface) return null;
  surface.getCanvas().drawSvg(svg, TEX, TEX);
  const pixels = surface.makeImageSnapshot().readPixels(0, 0, { width: TEX, height: TEX, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul });
  if (!pixels) return null;
  const tex = new THREE.DataTexture(new Uint8Array(pixels.buffer as ArrayBuffer), TEX, TEX, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/**
 * NOCH NICHT FREIGEGEBEN: im iOS-Simulator (emuliertes OpenGL) nicht zuverlässig sichtbar, auf echten Geräten ungeprüft.
 * Zum Vergleich: EXPO_PUBLIC_BADGE_3D=gl (Standard ist die WebView-Fassung).
 *
 * Medaille als echtes 3D-Objekt (expo-gl + three.js): massiv, mit Münzkante und Spiegelungen.
 * Mit dem Finger kippen; schwingt mit Masse zurück.
 */
export interface GLStats {
  /** Erstes Bild nach dem Einblenden der Ansicht (WebView: inkl. Start der WebView) */
  firstFrameMs: number | null;
  fps: number;
  /** Nur WebView: Wechsel auf eine andere Medaille in derselben Ansicht */
  switchMs?: number | null;
  /** Nur WebView: Dauer des Vorwärmens der Shader */
  warmMs?: number | null;
}

export function Badge3DGL(props: BadgeProps & { spinOnShow?: boolean; onStats?: (s: GLStats) => void }) {
  const { size } = props;
  const stage = useRef<MedalStage | null>(null);
  const propsRef = useRef(props);
  // Bis das erste 3D-Bild steht (Shader kompilieren), zeigen wir die 2D-Medaille
  const [ready, setReady] = useState(false);
  // GLView erst nach dem ersten Zeichnen einhängen: Shader kompilieren blockiert den JS-Thread,
  // so steht vorher wenigstens die 2D-Medaille da
  const [mountGL, setMountGL] = useState(false);
  useEffect(() => { const t = setTimeout(() => setMountGL(true), 200); return () => clearTimeout(t); }, []);
  propsRef.current = props;

  const key = `${JSON.stringify(props.spec)}|${props.tier}|${props.tierCount}|${props.gems?.total}|${props.gems?.filled}|${props.locked}|${props.rarity}`;
  useEffect(() => {
    const s = stage.current;
    if (!s) return;
    const face = faceTexture(props);
    if (face) s.setMedal({ ...props, face, flipV: true, lite: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { stage.current?.dispose(); stage.current = null; }, []);

  const onContextCreate = (gl: ExpoWebGLRenderingContext) => {
    // expo-gl erwartet die Einrichtung synchron in onContextCreate
    try { setup(gl); } catch (e) { console.warn('Badge3D: Einrichtung fehlgeschlagen', e); }
  };
  const setup = (gl: ExpoWebGLRenderingContext) => {
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    let shown = false;
    const t0 = Date.now();
    let firstFrameMs: number | null = null, frames = 0, lastReport = t0;


    const canvas = { width: w, height: h, style: {}, addEventListener: () => {}, removeEventListener: () => {}, clientHeight: h };
    const s = new MedalStage({ canvas, context: gl as unknown as WebGL2RenderingContext, width: w, height: h, environment: false, onFrame: () => {
      gl.endFrameEXP();
      const now = Date.now();
      if (!shown) { shown = true; firstFrameMs = now - t0; setReady(true); }
      // Bildrate für den Gerätetest: einmal pro Sekunde melden
      frames++;
      if (now - lastReport >= 1000) { propsRef.current.onStats?.({ firstFrameMs, fps: Math.round((frames * 1000) / (now - lastReport)) }); frames = 0; lastReport = now; }
    } });
    stage.current = s;
    const face = faceTexture(propsRef.current);
    if (face) s.setMedal({ ...propsRef.current, face, flipV: true, lite: true });
    if (propsRef.current.spinOnShow) s.flip();
    s.run();

  };

  // Die Medaille hält den Finger fest: Capture vor der ScrollView, keine Übergabe während der Geste
  const responder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onStartShouldSetPanResponderCapture: () => true,
    onMoveShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponderCapture: () => true,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (e) => {
      propsRef.current.onInteract?.(true);
      const { locationX, locationY } = e.nativeEvent;
      stage.current?.point((locationX / size) * 2 - 1, -((locationY / size) * 2 - 1));
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      stage.current?.point((locationX / size) * 2 - 1, -((locationY / size) * 2 - 1));
    },
    onPanResponderRelease: () => { stage.current?.release(); propsRef.current.onInteract?.(false); },
    onPanResponderTerminate: () => { stage.current?.release(); propsRef.current.onInteract?.(false); },
  })).current;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} {...responder.panHandlers} accessibilityRole="image" accessibilityLabel={props.title}>
      {mountGL && <GLView style={{ width: size, height: size }} msaaSamples={2} onContextCreate={onContextCreate} pointerEvents="none" />}
      {/* 2D-Medaille liegt darüber, bis das erste 3D-Bild steht (GLView nicht unsichtbar schalten – iOS zeigt sonst nichts) */}
      {!ready && <View style={{ position: 'absolute' }} pointerEvents="none"><Badge {...props} size={size * 0.86} /></View>}
    </View>
  );
}
