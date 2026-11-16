// Seltenheit in 3D: Effekte hinter der Medaille, in der Seltenheitsfarbe des MMH-Game-Looks.
// selten: Leuchtring · episch: + drehende Lichtstrahlen · legendär: + Funkeln
// Texturen werden im Code erzeugt (DataTexture) – gleich im Web und in expo-gl.
import * as THREE from 'three';
import type { Rarity } from '@best-badges/badge-spec';
import { game } from '@best-badges/design-tokens';

function texture(size: number, alpha: (x: number, y: number) => number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const x = (i + 0.5) / size * 2 - 1, y = (j + 0.5) / size * 2 - 1;
    const k = (j * size + i) * 4;
    data[k] = data[k + 1] = data[k + 2] = 255;
    data[k + 3] = Math.round(Math.max(0, Math.min(1, alpha(x, y))) * 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

let cache: { glow: THREE.DataTexture; rays: THREE.DataTexture; star: THREE.DataTexture } | null = null;
function textures() {
  cache ??= {
    // Ring knapp außerhalb der Medaille, weich nach außen auslaufend
    glow: texture(128, (x, y) => { const r = Math.hypot(x, y); return smooth(0.5, 0.66, r) * (1 - smooth(0.66, 1, r)); }),
    // 16 spitze Strahlen, innen ausgeblendet (dort liegt die Medaille)
    rays: texture(256, (x, y) => {
      const r = Math.hypot(x, y), a = Math.atan2(y, x);
      const ray = Math.pow(Math.abs(Math.cos(a * 8)), 18);
      return ray * smooth(0.55, 0.7, r) * (1 - smooth(0.72, 0.98, r));
    }),
    // Vierzackiger Funkelstern
    star: texture(64, (x, y) => { const ax = Math.abs(x), ay = Math.abs(y); return Math.max(1 - smooth(0, 0.12, ax) * 1, 0) * (1 - ay) + Math.max(1 - smooth(0, 0.12, ay), 0) * (1 - ax) + (1 - smooth(0, 0.35, Math.hypot(x, y))); }),
  };
  return cache;
}

export interface RarityFx { group: THREE.Group; update(t: number): void; dispose(): void }

export function buildRarity(rarity: Rarity | undefined): RarityFx | null {
  if (!rarity || rarity === 'common') return null;
  const color = new THREE.Color(game.rarity[rarity]);
  const tx = textures();
  const group = new THREE.Group();
  group.position.z = -0.25; // hinter der Medaille; dreht nicht mit (Teil der Szene, nicht der Medaille)
  const mats: THREE.Material[] = [];
  const plane = (tex: THREE.Texture, size: number, opacity: number) => {
    const m = new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    mats.push(m);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    group.add(mesh);
    return mesh;
  };
  const glow = plane(tx.glow, 2.35, rarity === 'rare' ? 0.7 : 0.9);
  const rays = rarity === 'epic' || rarity === 'legendary' ? plane(tx.rays, 2.4, 0.75) : null;
  const rays2 = rarity === 'legendary' ? plane(tx.rays, 2.25, 0.5) : null;
  const sparkles: { mesh: THREE.Mesh; phase: number }[] = [];
  if (rarity === 'legendary') {
    const spots: [number, number, number][] = [[-0.82, 0.8, 0.18], [0.95, 0.42, 0.14], [0.8, -0.8, 0.16], [-0.78, -0.68, 0.11], [0.1, 0.98, 0.1]];
    spots.forEach(([x, y, s], i) => {
      const m = new THREE.MeshBasicMaterial({ map: tx.star, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      mats.push(m);
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s, s), m);
      mesh.position.set(x, y, 0.5);
      group.add(mesh);
      sparkles.push({ mesh, phase: i * 1.3 });
    });
  }
  return {
    group,
    update(t) {
      if (rays) rays.rotation.z = t * 0.12;
      if (rays2) rays2.rotation.z = -t * 0.08 + 0.2;
      (glow.material as THREE.MeshBasicMaterial).opacity = (rarity === 'rare' ? 0.6 : 0.8) + Math.sin(t * 1.6) * 0.12;
      for (const s of sparkles) {
        const k = Math.max(0, Math.sin(t * 2.2 + s.phase));
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = k;
        s.mesh.scale.setScalar(0.6 + k * 0.6);
      }
    },
    dispose() { group.traverse((o) => (o as THREE.Mesh).geometry?.dispose()); mats.forEach((m) => m.dispose()); },
  };
}
