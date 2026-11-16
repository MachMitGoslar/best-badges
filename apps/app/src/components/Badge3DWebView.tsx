import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

// Die Klassen-Typen von react-native-webview passen nicht zu den React-19.3-Typen (Props werden zu never)
const WV = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;
import { MEDAL_HTML } from '../web3d/medal-html.generated.ts';
import { Badge, type BadgeProps } from './Badge';
import type { GLStats } from './Badge3DGL';

/**
 * 3D-Medaille in einer WebView: dieselbe Darstellung wie im Browser (echte Lichtdurchlässigkeit, Brechung,
 * Umgebungsspiegelung). Die Seite ist offline eingebettet, lädt nichts nach und darf nirgendwohin navigieren.
 * Bis das erste 3D-Bild steht, liegt die 2D-Medaille darüber.
 */
export function Badge3DWebView(props: BadgeProps & { spinOnShow?: boolean; onStats?: (s: GLStats) => void }) {
  const { size } = props;
  const web = useRef<WebView>(null);
  const [loaded, setLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const propsRef = useRef(props);
  propsRef.current = props;
  // Messung aus Sicht der App: vom Einblenden bis zum ersten 3D-Bild (enthält Start der WebView)
  const mountedAt = useRef(Date.now());
  const stats = useRef<GLStats>({ firstFrameMs: null, fps: 0, switchMs: null, warmMs: null });
  const report = (s: Partial<GLStats>) => { stats.current = { ...stats.current, ...s }; propsRef.current.onStats?.(stats.current); };
  const send = (msg: object) => web.current?.injectJavaScript(`window.bbReceive && window.bbReceive(${JSON.stringify(msg)}); true;`);

  const key = `${JSON.stringify(props.spec)}|${props.tier}|${props.tierCount}|${props.gems?.total}|${props.gems?.filled}|${props.locked}|${props.rarity}`;
  useEffect(() => {
    if (!loaded) return;
    const p = propsRef.current;
    send({ type: 'medal', props: { spec: p.spec, tier: p.tier, tierCount: p.tierCount, gems: p.gems, locked: p.locked, rarity: p.rarity, spinOnShow: p.spinOnShow } });
  }, [key, loaded]);

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { type: string; active?: boolean; fps?: number; ms?: number };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'ready') {
      setReady(true);
      report({ firstFrameMs: Date.now() - mountedAt.current });
      // Nach dem ersten Bild die übrigen Materialvarianten vorwärmen: spätere Wechsel ohne Wartezeit
      send({ type: 'warm' });
    }
    if (m.type === 'shown' && stats.current.firstFrameMs !== null) report({ switchMs: m.ms ?? null });
    if (m.type === 'warmed') report({ warmMs: m.ms ?? null });
    if (m.type === 'stats') report({ fps: m.fps ?? 0 });
    if (m.type === 'touch') propsRef.current.onInteract?.(!!m.active);
  };

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessible accessibilityRole="image" accessibilityLabel={props.title}>
      <WV
        ref={web}
        source={{ html: MEDAL_HTML }}
        originWhitelist={['about:*']}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:')}
        onLoadEnd={() => setLoaded(true)}
        onMessage={onMessage}
        // iOS beendet WebView-Prozesse bei Speicherknappheit: 2D zeigen und neu laden, die Medaille kommt dann neu
        onContentProcessDidTerminate={() => { setReady(false); setLoaded(false); web.current?.reload(); }}
        // Für VoiceOver zählt nur die Beschriftung außen, nicht der Inhalt der Seite
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{ width: size, height: size, backgroundColor: 'transparent' }}
        containerStyle={{ backgroundColor: 'transparent' }}
        scrollEnabled={false}
        bounces={false}
        overScrollMode="never"
        javaScriptEnabled
        allowsInlineMediaPlayback={false}
        allowFileAccess={false}
        cacheEnabled={false}
        // Kein incognito: Jede incognito-WebView bekommt einen eigenen Datenspeicher und damit einen neuen
        // Prozess – das kostet beim Öffnen spürbar Zeit. Die Seite speichert nichts und lädt nichts nach.
        webviewDebuggingEnabled={__DEV__}
      />
      {!ready && <View style={{ position: 'absolute' }} pointerEvents="none"><Badge {...props} size={size * 0.8} /></View>}
    </View>
  );
}
