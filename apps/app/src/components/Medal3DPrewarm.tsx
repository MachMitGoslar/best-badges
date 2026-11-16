import { useEffect, useState, type ComponentType } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import { MEDAL_HTML } from '../web3d/medal-html.generated.ts';

const WV = WebView as unknown as ComponentType<WebViewProps>;

/** Ergebnis des letzten Vorwärmens (für den Testbildschirm) */
export const prewarmInfo: { bootMs: number | null; warmMs: number | null } = { bootMs: null, warmMs: null };

/**
 * Wärmt die 3D-WebView nach dem App-Start unsichtbar vor: startet den WebView-Prozess, liest die
 * 3D-Seite ein und übersetzt alle Shader. Das System behält seine Shader- und Seiten-Caches, deshalb
 * startet die erste sichtbare Medaille danach so schnell wie jede weitere. Danach wird die WebView
 * wieder entfernt (keine laufende Bildschleife im Hintergrund).
 */
export function Medal3DPrewarm() {
  const [state, setState] = useState<'wait' | 'run' | 'done'>('wait');
  useEffect(() => {
    // Etwas nach dem Start, damit der erste Bildschirm der App nicht leidet
    const go = setTimeout(() => setState((s) => (s === 'wait' ? 'run' : s)), 1500);
    // Sicherheitsnetz: nach 20 s aufräumen, falls keine Antwort kommt
    const stop = setTimeout(() => setState('done'), 20_000);
    return () => { clearTimeout(go); clearTimeout(stop); };
  }, []);
  if (state !== 'run') return null;

  const onMessage = (e: WebViewMessageEvent) => {
    let m: { type: string; ms?: number };
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'boot') prewarmInfo.bootMs = m.ms ?? null;
    if (m.type === 'warmed') { prewarmInfo.warmMs = m.ms ?? null; setState('done'); }
  };
  return (
    <View style={{ position: 'absolute', width: 2, height: 2, opacity: 0, left: -10, top: -10 }} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
      <WV
        source={{ html: MEDAL_HTML }}
        originWhitelist={['about:*']}
        onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:')}
        injectedJavaScript="window.bbReceive && window.bbReceive({ type: 'warm' }); true;"
        onMessage={onMessage}
        style={{ width: 2, height: 2, backgroundColor: 'transparent' }}
        javaScriptEnabled
        allowFileAccess={false}
        cacheEnabled={false}
        // Kein incognito: Jede incognito-WebView bekommt einen eigenen Datenspeicher und damit einen neuen
        // Prozess – das kostet beim Öffnen spürbar Zeit. Die Seite speichert nichts und lädt nichts nach.
      />
    </View>
  );
}
