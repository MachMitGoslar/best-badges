// Läuft in der WebView der App: dieselbe 3D-Bühne wie im Browser (volle Materialien, echte Brechung).
// Kommunikation mit der App nur über Nachrichten; keine Netzwerkzugriffe.
import { renderBadgeSvg } from '@best-badges/badge-render';
import { MedalStage } from '../src/stage.ts';
import { svgTexture } from '../src/web.ts';
import type { MedalOptions } from '../src/medal.ts';
import { warmVariants } from '../src/warm.ts';

type Props = Omit<MedalOptions, 'face'> & { spinOnShow?: boolean };
type InMsg = { type: 'medal'; props: Props } | { type: 'warm' };

declare global { interface Window { ReactNativeWebView?: { postMessage(s: string): void }; bbReceive?: (m: InMsg) => void } }

const post = (m: object) => window.ReactNativeWebView?.postMessage(JSON.stringify(m));
const t0 = performance.now();
const canvas = document.getElementById('c') as HTMLCanvasElement;
const size = () => Math.max(1, Math.min(window.innerWidth, window.innerHeight));
let firstFrameMs: number | null = null, frames = 0, last = performance.now();

const stage = new MedalStage({
  canvas, width: size(), height: size(), pixelRatio: Math.min(window.devicePixelRatio || 1, 3),
  onFrame: () => {
    const now = performance.now();
    // Zeit ab Navigationsstart (enthält das Einlesen der Seite), gemeldet beim ersten Bild mit Medaille
    if (firstFrameMs === null && medalSet) { firstFrameMs = Math.round(now); pendingShow = null; post({ type: 'ready', firstFrameMs }); }
    // Spätere Wechsel in derselben WebView
    if (pendingShow !== null) { post({ type: 'shown', ms: Math.round(now - pendingShow) }); pendingShow = null; }
    frames++;
    if (now - last >= 1000) { post({ type: 'stats', fps: Math.round((frames * 1000) / (now - last)), firstFrameMs }); frames = 0; last = now; }
  },
});
stage.run();
window.addEventListener('resize', () => stage.resize(size(), size()));

let medalSet = false;
let token = 0;
/** Zeitpunkt, an dem die aktuelle Medaille angefordert wurde; Meldung beim ersten Bild danach */
let pendingShow: number | null = null;
let warmed = false;
window.bbReceive = async (m) => {
  if (m.type === 'warm') {
    if (warmed) return;
    warmed = true;
    const ms = await stage.warmUp(warmVariants());
    post({ type: 'warmed', ms });
    return;
  }
  if (m.type !== 'medal') return;
  const my = ++token;
  const requested = performance.now();
  const p = m.props;
  const svg = renderBadgeSvg(p.spec, { tier: p.tier, tierCount: p.tierCount, gems: p.gems, locked: p.locked, face: true, size: 1024, idPrefix: 'f' });
  const face = await svgTexture(svg);
  if (my !== token) { face.dispose(); return; }
  stage.setMedal({ ...p, face });
  pendingShow = requested;
  if (p.spinOnShow) stage.flip();
  medalSet = true;
};

// Finger direkt in der WebView: kippen; der App melden, damit sie das Scrollen sperrt
const point = (e: PointerEvent) => {
  const r = canvas.getBoundingClientRect();
  stage.point(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
};
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); post({ type: 'touch', active: true }); point(e); });
canvas.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') point(e); });
const up = () => { stage.release(); post({ type: 'touch', active: false }); };
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', up);

post({ type: 'boot', ms: Math.round(performance.now()), scriptMs: Math.round(performance.now() - t0) });
