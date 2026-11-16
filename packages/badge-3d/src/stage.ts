// Bühne für eine Medaille: Licht, Umgebung für Spiegelungen, sanftes Schweben und Kippen per Zeiger/Finger.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildMedal, disposeMedal, type MedalOptions } from './medal.ts';
import { buildRarity, type RarityFx } from './rarity.ts';

export interface StageOptions {
  /** Canvas (Web) oder Ersatzobjekt (React Native mit expo-gl) */
  canvas: HTMLCanvasElement | { width: number; height: number; style?: object; addEventListener?: () => void; removeEventListener?: () => void; clientHeight?: number };
  /** Vorhandener WebGL-Kontext (expo-gl) */
  context?: WebGLRenderingContext | WebGL2RenderingContext;
  width: number;
  height: number;
  pixelRatio?: number;
  /** Nach jedem Bild aufrufen (expo-gl: gl.endFrameEXP) */
  onFrame?: () => void;
  /**
   * Umgebungsspiegelung (PMREM). Braucht Float-Render-Targets – expo-gl unter iOS hat sie nicht,
   * dort stattdessen Studiolicht aus mehreren Quellen.
   */
  environment?: boolean;
}

export class MedalStage {
  readonly renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private medal: THREE.Group | null = null;
  private target = { x: 0, y: 0 };
  private current = { x: 0, y: 0, vx: 0, vy: 0 };
  private raf = 0;
  private start = 0;
  private envTex: THREE.Texture | null = null;
  /** Ein Schwung beim Erscheinen (Erfolgsbildschirm) */
  private spin = 0;
  private failed = false;
  private fx: RarityFx | null = null;
  private warm: { medal: THREE.Group; fx: RarityFx | null; face?: THREE.Texture }[] = [];

  constructor(private o: StageOptions) {
    this.renderer = new THREE.WebGLRenderer({ canvas: o.canvas as HTMLCanvasElement, context: o.context, antialias: true, alpha: true });
    this.renderer.setPixelRatio(o.pixelRatio ?? 1);
    this.renderer.setSize(o.width, o.height, false);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    // Enger Tiefenbereich: auf Geräten mit 16-Bit-Tiefenpuffer sonst Flimmern zwischen nahen Flächen
    this.camera = new THREE.PerspectiveCamera(26, o.width / o.height, 3.2, 7.5);
    // Medaille füllt ~88 % der Fläche – etwas Platz für Seltenheits-Effekte
    this.camera.position.set(0, 0, 5.0);

    // Umgebung für glaubwürdige Spiegelungen auf Metall; ohne Float-Targets: Studiolicht
    let env = o.environment ?? true;
    if (env) {
      try {
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.envTex = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
        this.scene.environment = this.envTex;
        this.scene.environmentIntensity = 0.75;
        pmrem.dispose();
      } catch { env = false; }
    }
    if (!env) {
      // Ohne Umgebung: Himmelslicht plus ein Glanzlicht von oben – zusammen mit Haupt- und Kantenlicht
      // vier Lichter. Jedes Licht kostet pro Pixel; mehr bringt auf dem Handy kaum sichtbaren Gewinn.
      this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x2a1f12, 1.9));
      const top = new THREE.DirectionalLight(0xffffff, 2.0);
      top.position.set(0.5, 3, 2.5);
      this.scene.add(top);
    }
    const key = new THREE.DirectionalLight(0xfff1d6, 1.6);   // warmes Hauptlicht oben links
    key.position.set(-2.5, 3, 4);
    const rim = new THREE.DirectionalLight(0xc8b6ff, 0.8);   // violettes Kantenlicht passend zum Nebel
    rim.position.set(3, -1.5, -2);
    this.scene.add(key, rim);
  }

  setMedal(o: MedalOptions) {
    if (this.medal) { this.scene.remove(this.medal); disposeMedal(this.medal); }
    this.medal = buildMedal(o);
    this.scene.add(this.medal);
    if (this.fx) { this.scene.remove(this.fx.group); this.fx.dispose(); }
    this.fx = o.locked ? null : buildRarity(o.rarity);
    if (this.fx) this.scene.add(this.fx.group);
  }

  /**
   * Shader aller Materialvarianten vorab übersetzen, ohne etwas zu zeigen. Das erste Übersetzen kostet
   * auf dem Handy bis zu Sekunden; danach liegen die Programme im Renderer (und im Shader-Cache des
   * Systems) und eine neue Medaille steht nach wenigen Millisekunden.
   * Nutzt compileAsync: wo der Browser parallel übersetzen kann, blockiert das die Bildrate nicht.
   */
  async warmUp(variants: Omit<MedalOptions, 'face'>[]): Promise<number> {
    const t0 = performance.now();
    const face = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    face.needsUpdate = true;
    const tmp = new THREE.Scene();
    const built: { medal: THREE.Group; fx: RarityFx | null }[] = [];
    for (const v of variants) {
      const medal = buildMedal({ ...v, face });
      const fx = v.locked ? null : buildRarity(v.rarity);
      tmp.add(medal);
      if (fx) tmp.add(fx.group);
      built.push({ medal, fx });
    }
    try {
      // targetScene = this.scene: übersetzt mit den Lichtern und der Umgebung der echten Bühne
      await this.renderer.compileAsync(tmp, this.camera, this.scene);
    } catch (e) {
      console.warn('MedalStage: Vorwärmen fehlgeschlagen', e);
    }
    // Nicht sofort freigeben: three.js löscht ein Programm, sobald kein Material es mehr nutzt.
    // Die Objekte bleiben bis dispose() liegen (wenige hundert KB), damit die Programme erhalten bleiben.
    this.warm.push(...built, { medal: new THREE.Group(), fx: null, face });
    return Math.round(performance.now() - t0);
  }

  /** Zeigerposition –1 … 1 (x nach rechts, y nach oben) → Kippen */
  point(x: number, y: number) { this.target = { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) }; }
  release() { this.target = { x: 0, y: 0 }; }
  /** Einmal um die eigene Achse drehen (z. B. beim Erhalt) */
  flip() { this.spin = Math.PI * 2; }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  run() {
    this.start = performance.now();
    let last = this.start;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // Feder statt linearer Bewegung: Masse und Nachschwingen lassen das Objekt schwer wirken
      const k = 38, d = 9;
      for (const [axis, v] of [['x', 'vx'], ['y', 'vy']] as const) {
        const a = k * (this.target[axis] - this.current[axis]) - d * this.current[v];
        this.current[v] += a * dt;
        this.current[axis] += this.current[v] * dt;
      }
      const t = (now - this.start) / 1000;
      if (this.medal) {
        const idleY = Math.sin(t * 0.7) * 0.16, idleX = Math.sin(t * 0.9 + 1) * 0.06;
        if (this.spin > 0) this.spin = Math.max(0, this.spin - dt * this.spin * 3.2 - dt * 0.4);
        this.medal.rotation.y = idleY + this.current.x * 0.55 + this.spin;
        this.medal.rotation.x = idleX - this.current.y * 0.45;
        this.medal.position.y = Math.sin(t * 1.2) * 0.03;
      }
      this.fx?.update(t);
      try {
        this.renderer.render(this.scene, this.camera);
      } catch (e) {
        if (!this.failed) { this.failed = true; console.warn('MedalStage: Rendern fehlgeschlagen', e); }
      }
      this.o.onFrame?.();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    if (this.medal) disposeMedal(this.medal);
    this.fx?.dispose();
    for (const w of this.warm) { disposeMedal(w.medal); w.fx?.dispose(); w.face?.dispose(); }
    this.envTex?.dispose();
    this.renderer.dispose();
  }
}
