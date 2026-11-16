// Medaille als echtes 3D-Objekt: massiver, gewellter Körper mit Münzkante, erhabener Rahmenring,
// leicht vertiefte Emblemfläche. Die Bildinformation kommt aus derselben SVG wie in 2D (badge-render, face: true).
import * as THREE from 'three';
import { PALETTES, type BadgeSpec, type MaterialId, type Rarity } from '@best-badges/badge-spec';
import { materialLook, ornamentLayout, ORNAMENT_RADIUS, resolveMaterial } from '@best-badges/badge-render';
import { mmh } from '@best-badges/design-tokens';

/** Maße in Szeneneinheiten (SVG-Raster / 100). Außenrand der Medaille: r = 0,9 ± 0,024. */
const R = 0.9, BUMPS = 20, WAVE = 0.024;
/** Halbe Kantenlänge der Textur in Einheiten: die Face-SVG füllt r = 0,924 bis zur Bildkante. */
const TEX_HALF = 0.924;
const BODY = 0.13;            // Dicke des Körpers
const BAND_Z = 0.056;         // Höhe des Nietenbands über der Vorderseite (siehe Profil)

function scallopShape(radius = R, steps = 240): THREE.Shape {
  const s = new THREE.Shape();
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * Math.PI * 2;
    const r = radius + WAVE * Math.cos(BUMPS * t);
    const x = r * Math.cos(t), y = -r * Math.sin(t); // SVG-y zeigt nach unten
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

/** Schimmer je Facette: Farbton wandert mit dem Winkel durch Cornflower, Greti und Mango (wie der 2D-Kristall). */
function crystalColors(g: THREE.BufferGeometry) {
  const cf = mmh.cornflower, vg = mmh.violaceousGreti, rm = mmh.ripeMango;
  const stops = [cf[700], vg[800], cf[900], rm[900], vg[700], cf[600]].map((c) => new THREE.Color(c));
  const pos = g.attributes.position!;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = ((Math.atan2(pos.getY(i), pos.getX(i)) / (Math.PI * 2) + 1) * 3) % 1;
    const f = t * stops.length, k = Math.floor(f);
    const c = stops[k % stops.length]!.clone().lerp(stops[(k + 1) % stops.length]!, f - k);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Planare UVs aus x/y der Eckpunkte – das Rahmenbild liegt so passgenau auch auf Wulst und Fassung. */
function setPlanarUV(g: THREE.BufferGeometry, flipV: boolean, zoom = 1) {
  const pos = g.attributes.position!;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = ((pos.getX(i) * zoom) / TEX_HALF + 1) / 2;
    const v = ((pos.getY(i) * zoom) / TEX_HALF + 1) / 2;
    uvs[i * 2 + 1] = flipV ? 1 - v : v;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
}

export interface MedalOptions {
  spec: BadgeSpec;
  /** Seltenheit: Effekte hinter der Medaille (Leuchtring, Strahlen, Funkeln) */
  rarity?: Rarity;
  tier?: number;
  tierCount?: number;
  gems?: { total: number; filled: number };
  locked?: boolean;
  /** Textur der Vorderseite (aus renderBadgeSvg(spec, { face: true, … })) */
  face: THREE.Texture;
  /** true, wenn die Textur nicht vertikal gespiegelt hochgeladen wird (z. B. Rohpixel aus Skia) */
  flipV?: boolean;
  /**
   * Leichte Materialien (Standard-PBR ohne Lack, Schillern, Samt): Shader kompilieren und rendern
   * deutlich schneller – für Handys und expo-gl. Sieht fast gleich aus.
   */
  lite?: boolean;
}

interface Metal { color: THREE.ColorRepresentation; metalness: number; roughness: number; clearcoat?: number; iridescence?: number; sheen?: number }

/** Physikalische Materialien je Stufe – Farben aus derselben Quelle wie der 2D-Rahmen. */
function metalFor(material: MaterialId | 'collection', spec: BadgeSpec, locked: boolean): Metal {
  if (locked) return { color: '#5a5a5a', metalness: 0.6, roughness: 0.55 };
  if (material === 'collection') return { color: '#1b1b1b', metalness: 0.4, roughness: 0.25, clearcoat: 1 };
  const look = materialLook(material, PALETTES[spec.emblem.palette]);
  const mid = look.stops[Math.floor(look.stops.length / 2)]![1];
  switch (material) {
    case 'wood': return { color: mid, metalness: 0, roughness: 0.75, sheen: 0.4 };
    case 'bronze': return { color: '#c0703a', metalness: 1, roughness: 0.38 };
    case 'silver': return { color: '#e3e8ee', metalness: 1, roughness: 0.18 };
    case 'gold': return { color: '#f2c14e', metalness: 1, roughness: 0.22 };
    case 'crystal': return { color: '#c9d4ff', metalness: 0.35, roughness: 0.08, clearcoat: 1, iridescence: 1 };
    case 'enamel': return { color: mid, metalness: 0.15, roughness: 0.3, clearcoat: 1 };
  }
}

let LITE = false;

/**
 * Kristall – höchste Stufe: durchscheinend, schillernd und von innen leuchtend.
 * Web: echte Lichtdurchlässigkeit (Transmission). Handy (lite): Leuchten plus Teiltransparenz.
 */
function crystalMaterial(kind: 'body' | 'frame'): THREE.Material {
  const cf = mmh.cornflower, vg = mmh.violaceousGreti;
  if (LITE) {
    // Ohne echte Lichtdurchlässigkeit: Kristall wirkt auf dunklem Grund dunkel mit hellen Facetten.
    // Darum dunkler, spiegelnder Grundton, Farbschimmer je Facette (Vertex-Farben) und Kern-Leuchten.
    return new THREE.MeshStandardMaterial({
      color: '#ffffff', vertexColors: true, metalness: 0.55, roughness: 0.04,
      emissive: vg[1100], emissiveIntensity: kind === 'frame' ? 0.55 : 0.4,
      transparent: true, opacity: kind === 'frame' ? 0.9 : 0.82, flatShading: true, side: THREE.DoubleSide,
    });
  }
  // Klar wie Bergkristall: hohe Brechung, kaum Trübung; Farbe kommt aus Schillern und dem violetten Kern-Leuchten
  return new THREE.MeshPhysicalMaterial({
    color: '#ffffff', metalness: 0, roughness: 0.0, transmission: 1, thickness: kind === 'frame' ? 0.2 : 0.45, ior: 2.0,
    dispersion: 0.4,
    attenuationColor: new THREE.Color(vg[500]), attenuationDistance: 0.9,
    iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [250, 900],
    clearcoat: 1, clearcoatRoughness: 0, emissive: vg[1100], emissiveIntensity: kind === 'frame' ? 0.3 : 0.18,
    specularIntensity: 1, envMapIntensity: 1.4, flatShading: true, side: THREE.DoubleSide,
  });
}

function physical(m: Metal, extra: THREE.MeshPhysicalMaterialParameters = {}): THREE.MeshStandardMaterial {
  if (LITE) {
    const { clearcoat: _c, clearcoatRoughness: _cr, iridescence: _i, iridescenceIOR: _ii, sheen: _s, sheenRoughness: _sr, ...std } = extra;
    return new THREE.MeshStandardMaterial({ color: m.color, metalness: m.metalness, roughness: m.roughness, ...(std as THREE.MeshStandardMaterialParameters) });
  }
  return new THREE.MeshPhysicalMaterial({
    color: m.color, metalness: m.metalness, roughness: m.roughness,
    clearcoat: m.clearcoat ?? 0, clearcoatRoughness: 0.12,
    iridescence: m.iridescence ?? 0, iridescenceIOR: 1.6,
    sheen: m.sheen ?? 0, sheenRoughness: 0.6,
    ...extra,
  });
}

/** Baut die Medaille. Ursprung im Mittelpunkt, Vorderseite zeigt in +z. */
export function buildMedal(o: MedalOptions): THREE.Group {
  LITE = !!o.lite;
  const material = o.gems ? 'collection' : resolveMaterial(o);
  const metal = metalFor(material, o.spec, !!o.locked);
  const group = new THREE.Group();

  // 1) Massiver Körper mit abgerundeter Münzkante
  // Seitliche Rundung kleiner als der Krümmungsradius der Wellentäler – sonst faltet sich die Kante dort um
  const bevel = 0.03, bevelSide = 0.009;
  const bodyGeo = new THREE.ExtrudeGeometry(scallopShape(R - bevelSide), {
    depth: BODY, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevelSide, bevelSegments: 6, curveSegments: 1,
  });
  bodyGeo.translate(0, 0, -BODY / 2);
  // Kante leicht gebürstet: spiegelt die Umgebung weich statt mit harten dunklen Flecken
  // Doppelseitig: in den Wellentälern liegen einzelne Kantenflächen „verkehrt herum“ und würden sonst weggeschnitten
  const isCrystal = material === 'crystal' && !o.locked;
  if (isCrystal && LITE) crystalColors(bodyGeo);
  const bodyMat = isCrystal ? crystalMaterial('body') : physical({ ...metal, roughness: Math.min(0.6, metal.roughness + 0.18) }, { side: THREE.DoubleSide });
  group.add(new THREE.Mesh(bodyGeo, bodyMat));
  const front = BODY / 2 + bevel;

  // 2) Bildfläche (Emblem, vertieft unter dem Ring) – glänzend wie Emaille
  // Emaille: farbtreu, dezenter Lack. Wenig Umgebungsspiegelung, sonst wäscht die Fläche beim Kippen aus.
  const faceMat = physical({ color: '#ffffff', metalness: 0, roughness: 0.42 }, {
    map: o.face, clearcoat: o.locked ? 0 : 0.45, clearcoatRoughness: 0.25, envMapIntensity: 0.35,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  // Nur der Schacht: außerhalb liegen Rahmenprofil und Metall des Körpers
  const faceGeo = new THREE.CircleGeometry(0.706, 160);
  setPlanarUV(faceGeo, !!o.flipV, o.lite && !o.locked ? 0.94 : 1);
  const face = new THREE.Mesh(faceGeo, faceMat);
  face.position.z = front + 0.004;
  group.add(face);

  // 3) Rahmen als gedrehtes Profil (Querschnitt um die Mitte): außen ein Wulst, eine Rille, das flache Band
  //    mit Nieten und Stufen-Punkten, innen eine hochstehende Fassung. Dazwischen liegt das Emblem tief im Schacht.
  //    Punkte: [Radius, Höhe über der Vorderseite des Körpers]
  const profile: [number, number][] = [
    // Außenradius ≤ 0,855: in den Tälern des Wellenrands endet die flache Vorderseite des Körpers bei ≈ 0,858
    [0.854, 0.0], [0.855, 0.03], [0.849, 0.06], [0.839, 0.074], [0.829, 0.072], [0.823, 0.06],     // Außenwulst
    [0.819, 0.05], [0.815, 0.047], [0.811, 0.05],                                                   // Rille
    [0.807, 0.056], [0.77, 0.056], [0.752, 0.056],                                                  // Band (Nieten r ≈ 0,80, Punkte)
    [0.746, 0.068], [0.738, 0.09], [0.728, 0.098], [0.718, 0.094], [0.712, 0.082],                  // innere Fassung
    [0.708, 0.05], [0.705, 0.012], [0.703, 0.0],                                                    // Schachtwand zum Emblem
  ];
  // Kristall: wenige Segmente und harte Kanten ergeben echte Facetten statt gemalter
  const latheGeo = new THREE.LatheGeometry(profile.map(([r, h]) => new THREE.Vector2(r, h)), isCrystal ? 28 : 200);
  latheGeo.rotateX(Math.PI / 2); // Drehachse von y auf z: Höhe zeigt nach vorn
  setPlanarUV(latheGeo, !!o.flipV);
  if (isCrystal && LITE) crystalColors(latheGeo);
  latheGeo.computeVertexNormals();
  const frameMat = physical({ color: '#ffffff', metalness: o.locked ? 0.3 : metal.metalness * 0.75, roughness: Math.max(0.24, metal.roughness) }, {
    map: o.face, clearcoat: (metal.clearcoat ?? 0) * 0.4, clearcoatRoughness: 0.2, iridescence: metal.iridescence ?? 0, envMapIntensity: 0.8,
    side: THREE.DoubleSide,
  });
  // Kristall: kein aufgemaltes Rahmenbild – das Material selbst ist der Look (sonst wirkt er milchig)
  const frame = new THREE.Mesh(latheGeo, isCrystal ? crystalMaterial('frame') : frameMat);
  frame.position.z = front;
  group.add(frame);

  // 3b) Schmuckteile als echte Körper: Nietköpfe, Stufen-Punkte, geschliffene Kristalle (Lage wie in 2D)
  group.add(buildOrnaments(o, metal, front + BAND_Z));

  // 3c) Glaslinse über dem Emblem: deutlich gewölbt. Im Web echte Lichtbrechung (Brechungsindex 1,5),
  //     auf dem Handy (lite) zu teuer – dort vergrößert die Bildfläche leicht wie unter einer Lupe.
  if (!o.locked) {
    const a = 0.704, hDome = 0.085;                    // Grundradius, Wölbung
    const rs = (a * a + hDome * hDome) / (2 * hDome);  // Kugelradius der Kappe
    const glassGeo = new THREE.SphereGeometry(rs, 128, 24, 0, Math.PI * 2, 0, Math.asin(a / rs));
    glassGeo.rotateX(Math.PI / 2);
    const glass = new THREE.Mesh(glassGeo, LITE
      ? new THREE.MeshStandardMaterial({ color: '#ffffff', metalness: 0, roughness: 0.03, transparent: true, opacity: 0.1, depthWrite: false })
      : new THREE.MeshPhysicalMaterial({
          color: '#ffffff', metalness: 0, roughness: 0.02, transmission: 1, ior: 1.5, thickness: 0.14,
          specularIntensity: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.02, envMapIntensity: 0.55,
        }));
    glass.position.z = front + 0.004 + hDome - rs;
    glass.renderOrder = 2;
    group.add(glass);
  }

  // 4) Rückseite: schlichtes Metall mit feiner Gravurlinie
  const backRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.008, 8, 128), physical({ ...metal, roughness: metal.roughness + 0.15 }));
  backRing.position.z = -front - 0.002;
  group.add(backRing);

  return group;
}

export function disposeMedal(g: THREE.Object3D) {
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    mats.forEach((x) => x.dispose());
  });
}

/**
 * Leuchtender Edelstein in Greti. Keine Transmission: die mischt hellen Hintergrund ein und der Stein wirkt weiß-rosa.
 * Satte Grundfarbe, Eigenleuchten und harte Facetten-Glanzlichter (Lack) ergeben den Edelstein.
 */
function gemMaterial(): THREE.Material {
  const vg = mmh.violaceousGreti;
  return LITE
    ? new THREE.MeshStandardMaterial({ color: vg[1000], metalness: 0, roughness: 0.08, emissive: vg[1100], emissiveIntensity: 1.4, flatShading: true })
    : new THREE.MeshPhysicalMaterial({
        color: vg[1000], metalness: 0, roughness: 0.03, ior: 2.1, specularIntensity: 1,
        emissive: vg[1100], emissiveIntensity: 1.3, clearcoat: 1, clearcoatRoughness: 0.01,
        iridescence: 0.35, iridescenceIOR: 1.9, envMapIntensity: 0.9, flatShading: true,
      });
}

/** Nietköpfe, Stufen-Punkte und Kristalle als eigene Körper auf dem Band. */
function buildOrnaments(o: MedalOptions, metal: Metal, z: number): THREE.Group {
  const g = new THREE.Group();
  const lay = ornamentLayout(o.spec, o);
  const R3 = ORNAMENT_RADIUS / 100;
  // SVG-Winkel (y nach unten) → 3D (y nach oben)
  const at = (a: number, r = R3) => new THREE.Vector3(r * Math.cos(a), -r * Math.sin(a), z);
  const dome = (radius: number, flat: number) => {
    const geo = new THREE.SphereGeometry(radius, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    geo.rotateX(Math.PI / 2);
    geo.scale(1, 1, flat);
    return geo;
  };
  // Gleiches Metall wie der Rahmen, nur polierter – Glanzlichter kommen vom Licht, nicht von der Farbe
  const studMat = physical({ ...metal, roughness: Math.max(0.18, metal.roughness - 0.04) });

  // Nieten: flache, polierte Köpfe
  const studGeo = dome(0.03, 0.9);
  for (const a of lay.studs) { const m = new THREE.Mesh(studGeo, studMat); m.position.copy(at(a)); g.add(m); }

  // Stufen-Punkte: erreicht = glänzende Kuppe; offen = vertiefte, dunkle Fassung mit Metallrand
  const pipGeo = dome(0.046, 0.85);
  const socketGeo = new THREE.CylinderGeometry(0.032, 0.032, 0.01, 28); socketGeo.rotateX(Math.PI / 2);
  const rimGeo = new THREE.TorusGeometry(0.036, 0.007, 8, 28);
  const socketMat = physical({ color: '#141414', metalness: 0, roughness: 0.7 });
  const rimMat = physical({ ...metal, roughness: metal.roughness + 0.05 });
  const crystal = resolveMaterial(o) === 'crystal' && !o.gems && !o.locked;
  const pipStone = crystal ? gemMaterial() : studMat;
  for (const p of lay.pips) {
    if (p.filled) { const m = new THREE.Mesh(pipGeo, pipStone); m.position.copy(at(p.angle)); g.add(m); }
    else {
      const s = new THREE.Mesh(socketGeo, socketMat); s.position.copy(at(p.angle)).setZ(z - 0.002); g.add(s);
      const rim = new THREE.Mesh(rimGeo, rimMat); rim.position.copy(at(p.angle)).setZ(z + 0.002); g.add(rim);
    }
  }

  // Kristalle: Edelsteinschliff (Tafel, Krone, Pavillon) in einer Zargenfassung mit vier Krappen.
  // Die Fassung sitzt auf dem höchsten Punkt des Rahmens – nichts schneidet durch Wulst oder Fassung.
  if (lay.gems.length) {
    const crown = new THREE.CylinderGeometry(0.55, 1, 0.38, 8, 1);    // Tafel oben (r 0,55), Rundiste unten (r 1)
    crown.translate(0, 0.19, 0);
    const pavilion = new THREE.ConeGeometry(1, 0.62, 8, 1);           // Spitze nach unten, steckt in der Fassung
    pavilion.rotateX(Math.PI); pavilion.translate(0, -0.31, 0);
    for (const geo of [crown, pavilion]) geo.rotateX(Math.PI / 2);   // Höhe zeigt nach vorn (z)
    // Zarge (achteckig wie der Stein) mit Sockel bis hinunter aufs Band: steht massiv auf dem Rahmen
    const cupGeo = new THREE.CylinderGeometry(1.14, 1.04, 0.72, 8, 1);
    cupGeo.rotateX(Math.PI / 2); cupGeo.translate(0, 0, -0.14);
    const prongGeo = new THREE.SphereGeometry(0.16, 10, 8);

    // Leuchtender Stein: Eigenleuchten in Greti; im Web zusätzlich lichtdurchlässig mit hoher Brechung
    const litMat = gemMaterial();
    const emptyMat = physical({ color: '#151515', metalness: 0.1, roughness: 0.55 });
    const top = z + 0.046; // höchster Punkt des Profils (innere Fassung ≈ 0,098 über der Vorderseite)

    for (const gem of lay.gems) {
      const s = gem.size / 100;
      const holder = new THREE.Group();
      holder.position.copy(at(gem.angle)).setZ(top);
      holder.rotation.z = -gem.angle;
      holder.scale.set(s * 1.1, s * 0.78, s * 1.1);          // radial gestreckt (Navette-Form)
      holder.add(new THREE.Mesh(cupGeo, rimMat));
      for (const k of [0, 1, 2, 3]) {
        const a = Math.PI / 4 + (k * Math.PI) / 2;
        const prong = new THREE.Mesh(prongGeo, rimMat);
        prong.position.set(Math.cos(a) * 1.02, Math.sin(a) * 1.02, 0.26);
        holder.add(prong);
      }
      const lit = gem.lit && !o.locked;
      const stoneMat = lit ? litMat : emptyMat;
      const stone = new THREE.Group();
      stone.add(new THREE.Mesh(crown, stoneMat), new THREE.Mesh(pavilion, stoneMat));
      stone.position.z = lit ? 0.24 : 0.12;
      if (!lit) stone.scale.set(0.9, 0.9, 0.35);       // leere Fassung: flacher, dunkler Platzhalter
      holder.add(stone);
      g.add(holder);
    }
  }
  return g;
}
