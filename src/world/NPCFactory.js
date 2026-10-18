import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const SKIN = '#c99773';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.78, metalness: 0, ...opts });
}

function capsule(radius, length, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(radius, length, 6, 16), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(radius, material, x = 0, y = 0, z = 0, seg = 24) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(radius, seg, Math.max(12, seg / 2)), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function rounded(w, h, d, r, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function curveLine(points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 4, false), material);
}

export function createNPC(def) {
  const g = new THREE.Group();
  const s = (def.height || 1.72) / 1.72;
  g.scale.setScalar(s);
  g.userData.def = def;

  const skin = mat(def.skin, { roughness: 0.62 });
  const coat = mat(def.coat, { roughness: 0.88 });
  const coat2 = mat(def.coat2, { roughness: 0.9 });
  const shirt = mat(def.shirt, { roughness: 0.92 });
  const pants = mat(def.pants, { roughness: 0.95 });
  const boot = mat('#2c2722', { roughness: 0.82 });
  const hair = mat(def.hair || '#2a2522', { roughness: 0.9 });
  const beardMat = mat(def.beard || def.hair || '#5a4a3c', { roughness: 0.94 });
  const eyeWhite = mat('#e8e0cf', { roughness: 0.35 });
  const iris = mat(def.eyes || '#433327', { roughness: 0.25 });
  const dark = mat('#171615', { roughness: 0.4 });
  const metal = mat('#8a7a5b', { roughness: 0.35, metalness: 0.7 });
  const accent = mat(def.accent || '#c49a5e', { roughness: 0.55 });

  // Legs and boots
  for (const side of [-1, 1]) {
    const thigh = capsule(0.085, 0.5, pants, side * 0.1, 0.63, 0);
    thigh.rotation.z = side * 0.03;
    g.add(thigh);
    const shin = capsule(0.073, 0.42, pants, side * 0.11, 0.24, 0.01);
    g.add(shin);
    const b = rounded(0.16, 0.13, 0.31, 0.04, boot, side * 0.11, 0.065, 0.07);
    b.rotation.y = side * 0.05;
    g.add(b);
  }

  // Torso and layered clothing
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.205, 0.4, 8, 20), shirt);
  torso.scale.set(1.18, 1, 0.72);
  torso.position.set(0, 1.14, 0);
  torso.castShadow = true;
  g.add(torso);
  const jacket = new THREE.Mesh(new THREE.CapsuleGeometry(0.225, 0.44, 8, 20, 1, true), coat);
  jacket.scale.set(1.12, 1, 0.78);
  jacket.position.set(0, 1.14, 0);
  jacket.castShadow = true;
  g.add(jacket);
  // Coat front panels and collar.
  for (const side of [-1, 1]) {
    g.add(rounded(0.135, 0.54, 0.055, 0.02, coat, side * 0.075, 1.1, 0.158));
    const lapel = rounded(0.09, 0.22, 0.04, 0.02, coat2, side * 0.11, 1.3, 0.178);
    lapel.rotation.z = side * 0.28;
    g.add(lapel);
  }
  g.add(rounded(0.3, 0.07, 0.16, 0.02, coat2, 0, 1.36, 0.14));
  g.add(rounded(0.32, 0.055, 0.06, 0.02, mat('#4a3a2a'), 0, 0.92, 0.17));
  if (def.look !== 'young') {
    g.add(sphere(0.035, accent, 0, 0.95, 0.2, 12));
  }
  // Shirt collar.
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.018, 5, 16, Math.PI * 1.2), shirt);
  collar.rotation.x = Math.PI / 2;
  collar.rotation.z = 0.5;
  collar.position.set(0, 1.47, 0.03);
  g.add(collar);

  // Arms, slightly bent.
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.255, 1.36, 0);
    const upper = capsule(0.068, 0.3, coat, 0, -0.16, 0);
    upper.rotation.z = side * 0.18;
    shoulder.add(upper);
    const lower = capsule(0.058, 0.28, coat, side * 0.045, -0.44, 0.04);
    lower.rotation.z = side * 0.08;
    lower.rotation.x = -0.18;
    shoulder.add(lower);
    const hand = sphere(0.07, skin, side * 0.06, -0.61, 0.1, 16);
    hand.scale.set(0.8, 1.2, 0.7);
    shoulder.add(hand);
    // Cuff.
    shoulder.add(new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.014, 5, 12), coat2));
    g.add(shoulder);
  }

  // Neck and head.
  g.add(capsule(0.065, 0.09, skin, 0, 1.47, 0));
  const head = new THREE.Group();
  head.position.set(0, 1.6, 0.01);
  const skull = sphere(0.135, skin, 0, 0.08, 0, 32);
  skull.scale.set(0.92, 1.1, 0.95);
  head.add(skull);
  // Jaw/chin.
  const jaw = sphere(0.095, skin, 0, 0.005, 0.045, 24);
  jaw.scale.set(0.9, 0.75, 0.95);
  head.add(jaw);
  // Nose.
  const nose = sphere(0.025, skin, 0, 0.075, 0.135, 12);
  nose.scale.set(0.75, 1.35, 0.9);
  head.add(nose);
  // Ears.
  for (const side of [-1, 1]) {
    const ear = sphere(0.03, skin, side * 0.132, 0.065, 0.0, 12);
    ear.scale.set(0.5, 1, 0.7);
    head.add(ear);
  }
  // Eyes, brows, mouth.
  for (const side of [-1, 1]) {
    const eye = sphere(0.028, eyeWhite, side * 0.047, 0.105, 0.118, 16);
    eye.scale.set(1, 0.72, 0.5);
    head.add(eye);
    const ir = sphere(0.014, iris, side * 0.047, 0.104, 0.136, 12);
    ir.scale.set(1, 1, 0.5);
    head.add(ir);
    const pu = sphere(0.007, dark, side * 0.047, 0.104, 0.142, 8);
    head.add(pu);
    const catchlight = sphere(0.0035, mat('#fff8e8', { emissive: '#fff4dc', emissiveIntensity: 1.6 }), side * 0.053, 0.111, 0.146, 6);
    head.add(catchlight);
    const brow = rounded(0.055, 0.012, 0.02, 0.005, hair, side * 0.048, 0.145, 0.128);
    brow.rotation.z = side * (def.look === 'sharp' ? 0.16 : -0.08);
    head.add(brow);
  }
  const mouth = curveLine([
    new THREE.Vector3(-0.034, 0.012, 0.142),
    new THREE.Vector3(0, 0.004, 0.15),
    new THREE.Vector3(0.034, 0.012, 0.142),
  ], 0.005, mat('#6b3b34'));
  head.add(mouth);
  // Hair / hats.
  if (def.hat === 'woolcap') {
    const cap = sphere(0.145, mat(def.hatColor || '#493b33', { roughness: 0.98 }), 0, 0.15, -0.005, 28);
    cap.scale.set(1, 0.7, 1);
    head.add(cap);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 6, 24), mat(def.hatColor || '#493b33'));
    brim.rotation.x = Math.PI / 2;
    brim.position.set(0, 0.1, 0);
    head.add(brim);
  } else if (def.hat === 'straw') {
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.025, 32), mat(def.hatColor || '#b49a62', { roughness: 0.95 }));
    brim.position.set(0, 0.17, 0);
    head.add(brim);
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.16, 24), mat(def.hatColor || '#b49a62'));
    crown.position.set(0, 0.25, 0);
    head.add(crown);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.145, 0.012, 5, 24), mat('#675137'));
    band.rotation.x = Math.PI / 2;
    band.position.y = 0.19;
    head.add(band);
  } else if (def.hat === 'bandana') {
    const band = new THREE.Mesh(new THREE.SphereGeometry(0.142, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(def.hatColor || '#d06d4c', { roughness: 0.9 }));
    band.position.y = 0.13;
    band.scale.set(1, 0.72, 1);
    head.add(band);
    const knot = rounded(0.07, 0.05, 0.03, 0.01, mat(def.hatColor || '#d06d4c'), 0.13, 0.16, -0.07);
    knot.rotation.z = 0.4;
    head.add(knot);
  } else {
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.142, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), hair);
    hairCap.position.y = 0.15;
    hairCap.scale.set(1.01, 0.76, 1.01);
    head.add(hairCap);
    // Sideburns.
    for (const side of [-1, 1]) {
      const sideburn = rounded(0.035, 0.11, 0.05, 0.015, hair, side * 0.125, 0.09, 0.03);
      sideburn.rotation.z = side * 0.1;
      head.add(sideburn);
    }
  }
  if (def.beardStyle === 'full') {
    const beard = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 1.4 + Math.PI * 0.8;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.12, 6), beardMat);
      tuft.position.set(Math.cos(a) * 0.085, -0.02 + Math.sin(a * 0.7) * 0.035, 0.105 + Math.abs(Math.sin(a)) * 0.03);
      tuft.rotation.z = Math.cos(a) * 0.5;
      tuft.rotation.x = 0.7;
      beard.add(tuft);
    }
    beard.position.y = 0.01;
    head.add(beard);
  } else if (def.beardStyle === 'long') {
    const beard = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.2 + (i % 3) * 0.06, 6), beardMat);
      tuft.position.set((i - 3) * 0.025, -0.14 - (i % 3) * 0.03, 0.1);
      tuft.rotation.x = 0.25;
      tuft.rotation.z = (i - 3) * 0.08;
      beard.add(tuft);
    }
    head.add(beard);
  } else if (def.beardStyle === 'short') {
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 1.7 + Math.PI * 0.7;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 5), beardMat);
      tuft.position.set(Math.cos(a) * 0.085, -0.03 + Math.sin(a * 0.5) * 0.025, 0.12);
      tuft.rotation.x = 0.8;
      head.add(tuft);
    }
  }
  if (def.glasses) {
    const frameMat = mat('#5b4b3b', { roughness: 0.35, metalness: 0.55 });
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.006, 6, 20), frameMat);
      ring.position.set(side * 0.047, 0.105, 0.148);
      ring.scale.set(1.2, 0.9, 1);
      head.add(ring);
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.036, 20), new THREE.MeshPhysicalMaterial({
        color: '#b9d0ca', transparent: true, opacity: 0.18, roughness: 0.1, metalness: 0.1,
      }));
      lens.position.set(side * 0.047, 0.105, 0.149);
      lens.scale.set(1.2, 0.9, 1);
      head.add(lens);
    }
    const bridge = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.005, 5, 12, Math.PI), frameMat);
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.11, 0.15);
    head.add(bridge);
  }
  // Freckles for Alan.
  if (def.freckles) {
    const freckleMat = mat('#a86e52', { roughness: 0.8 });
    for (let i = 0; i < 7; i++) {
      const f = sphere(0.004, freckleMat, (i % 2 ? 1 : -1) * (0.035 + (i % 3) * 0.012), 0.045 + (i % 2) * 0.008, 0.138, 4);
      head.add(f);
    }
  }
  g.add(head);
  g.userData.head = head;
  g.userData.torso = torso;
  g.userData.baseHeadY = head.position.y;
  g.userData.materials = { skin, coat, shirt, pants };
  return g;
}

function portraitLights(scene) {
  const key = new THREE.DirectionalLight('#ffd9b0', 3.2);
  key.position.set(2.3, 3.4, 3.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight('#8fc8da', 2.6);
  rim.position.set(-2.8, 2.0, -2.6);
  scene.add(rim);
  const fill = new THREE.HemisphereLight('#dce6e2', '#513d32', 1.15);
  scene.add(fill);
  const bounce = new THREE.PointLight('#e6b17c', 1.1, 6);
  bounce.position.set(0, 0.8, 2.2);
  scene.add(bounce);
}

export class NPCPortraitRenderer {
  constructor({ width = 384, height = 480 } = {}) {
    this.width = width;
    this.height = height;
    this.cache = new Map();
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(1);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 20);
    this.camera.position.set(0, 1.58, 1.72);
    this.camera.lookAt(0, 1.56, 0);
    portraitLights(this.scene);
  }

  get(def) {
    if (this.cache.has(def.id)) return this.cache.get(def.id);
    const model = createNPC(def);
    model.position.y = 0.0;
    model.rotation.y = 0;
    this.scene.add(model);
    this.renderer.render(this.scene, this.camera);
    const url = this.renderer.domElement.toDataURL('image/png');
    this.scene.remove(model);
    model.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.cache.set(def.id, url);
    return url;
  }

  dispose() {
    this.renderer.dispose();
    this.cache.clear();
  }
}
