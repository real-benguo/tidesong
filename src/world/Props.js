import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { rand, pick } from '../utils/math.js';

const UP = new THREE.Vector3(0, 1, 0);

function ease(t) {
  return t * t * (3 - 2 * t);
}

function tube(points, radius, material, radial = 6, segments = 32) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geo = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function beam(a, b, radius, material, radial = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CylinderGeometry(radius, radius, len, radial, 1, false);
  const m = new THREE.Mesh(geo, material);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function rounded(w, h, d, r, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function sphere(r, mat, x = 0, y = 0, z = 0, seg = 12) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, Math.floor(seg / 2))), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg, 1), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function canvasText(text, { width = 512, height = 160, bg = 'rgba(0,0,0,0)', color = '#e9dcc0', font = '600 64px "Noto Serif SC", serif', stroke = null } = {}) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 8;
    ctx.strokeText(text, width / 2, height / 2);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function stripeCanvas(c1, c2, count = 8) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d');
  const w = c.width / count;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = i % 2 ? c1 : c2;
    ctx.fillRect(i * w, 0, w, c.height);
  }
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0.18)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class PropBuilder {
  constructor({ assets, config, shape }) {
    this.assets = assets;
    this.config = config;
    this.shape = shape;
    this.group = new THREE.Group();
    this.group.name = 'props';
    this.lights = [];
    this.colliders = [];
    this.materials = {};
    this.buildMaterials();
  }

  buildMaterials() {
    const a = this.assets;
    const p = this.config.palette;
    this.materials.wood = a.standardMaterial('wood', { repeat: 2.2, color: '#d0a878', roughness: 0.84 });
    this.materials.woodDark = a.standardMaterial('wood', { repeat: 2.4, color: '#8b6a4d', roughness: 0.9 });
    this.materials.woodPale = a.standardMaterial('wood', { repeat: 2, color: '#e5c79c', roughness: 0.8 });
    this.materials.bark = a.standardMaterial('bark', { repeat: 2, color: '#8a7050', roughness: 0.95 });
    this.materials.rock = a.standardMaterial('rock', { repeat: 2.3, color: '#9b9589', roughness: 0.94 });
    this.materials.rockDark = a.standardMaterial('rock', { repeat: 2.6, color: '#4e4b45', roughness: 0.96 });
    this.materials.stoneWall = a.standardMaterial('rock', { repeat: 1.35, color: '#aaa395', roughness: 0.92, normalScale: 1.35 });
    this.materials.rope = new THREE.MeshStandardMaterial({ color: new THREE.Color('#b79a6e'), roughness: 0.96, metalness: 0 });
    this.materials.ropeDark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#6a5a45'), roughness: 0.96 });
    this.materials.metal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4c5353'), roughness: 0.48, metalness: 0.82 });
    this.materials.iron = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2d3131'), roughness: 0.68, metalness: 0.7 });
    this.materials.copper = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9a6242'), roughness: 0.38, metalness: 0.86 });
    this.materials.brass = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c39a56'), roughness: 0.3, metalness: 0.9 });
    this.materials.canvas = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d8c9aa'), roughness: 0.94, side: THREE.DoubleSide });
    this.materials.canvasWarm = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c77b56'), roughness: 0.92, side: THREE.DoubleSide });
    this.materials.glass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#9ab7bb'), roughness: 0.1, metalness: 0.1, transmission: 0.25,
      transparent: true, opacity: 0.35, envMapIntensity: 1.2, side: THREE.DoubleSide,
    });
    this.materials.lamp = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#ffd79a'), emissive: new THREE.Color('#ffb35f'), emissiveIntensity: 2.6, roughness: 0.3,
    });
    this.materials.lanternGlass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#ffd7a0'), emissive: new THREE.Color('#ff9d4c'), emissiveIntensity: 0.62,
      roughness: 0.12, transparent: true, opacity: 0.58,
    });
    this.materials.windowWarm = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#3a2617'), emissive: new THREE.Color('#ffad63'), emissiveIntensity: 1.1, roughness: 0.4,
    });
    this.materials.paint = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e3ddcd'), roughness: 0.66 });
    this.materials.paintRed = new THREE.MeshStandardMaterial({ color: new THREE.Color('#9a4437'), roughness: 0.7 });
    this.materials.hull = new THREE.MeshStandardMaterial({ color: new THREE.Color('#e7e2d5'), roughness: 0.55, metalness: 0.04, side: THREE.DoubleSide });
    this.materials.hullBlue = new THREE.MeshStandardMaterial({ color: new THREE.Color('#31585f'), roughness: 0.58, side: THREE.DoubleSide });
    this.materials.black = new THREE.MeshStandardMaterial({ color: new THREE.Color('#171c1c'), roughness: 0.85 });
    this.materials.net = new THREE.MeshStandardMaterial({
      color: new THREE.Color('#b9aa86'), roughness: 0.96, transparent: true, opacity: 0.7,
      side: THREE.DoubleSide, depthWrite: false,
    });
    this.materials.leaf = new THREE.MeshStandardMaterial({
      color: new THREE.Color(p.leaf), roughness: 0.86, side: THREE.DoubleSide,
    });
    this.materials.leaf2 = new THREE.MeshStandardMaterial({
      color: new THREE.Color(p.leaf2), roughness: 0.88, side: THREE.DoubleSide,
    });
    this.materials.awning = new THREE.MeshStandardMaterial({
      map: stripeCanvas('#b85b42', '#ead9b7', 9), roughness: 0.9, side: THREE.DoubleSide,
    });
  }

  place(obj, x, z, { y = null, rot = 0, name = '' } = {}) {
    const h = this.shape.height(x, z);
    obj.position.set(x, y ?? Math.max(0, h), z);
    obj.rotation.y = rot;
    obj.name = name;
    this.group.add(obj);
    return obj;
  }

  addCollider(x, z, radius = 1.6) {
    this.colliders.push({ x, z, radius });
  }

  lamp(x, y, z, intensity = 2.2, distance = 18, parent = this.group) {
    const light = new THREE.PointLight(new THREE.Color('#ffb266'), intensity, distance, 1.6);
    light.position.set(x, y, z);
    parent.add(light);
    this.lights.push(light);
    return light;
  }

  buildPier(length = 19, width = 3.6) {
    const g = new THREE.Group();
    const deckY = 0.9;
    const planks = Math.floor(length / 0.52);
    for (let i = 0; i < planks; i++) {
      const z = -length / 2 + i * 0.52 + 0.26;
      const w = width * (0.94 + Math.sin(i * 1.7) * 0.025);
      const pl = box(w, 0.14, 0.46, i % 5 === 0 ? this.materials.woodDark : this.materials.wood, 0, deckY, z);
      pl.rotation.y = (Math.sin(i * 2.7) * 0.5) * 0.008;
      g.add(pl);
      if (i % 2 === 0) {
        for (const s of [-1, 1]) {
          const nail = cyl(0.022, 0.026, 0.012, this.materials.iron, s * w * 0.36, deckY + 0.076, z, 6);
          g.add(nail);
        }
      }
    }
    for (const side of [-1, 1]) {
      for (let i = 0; i <= Math.floor(length / 3.2); i++) {
        const z = -length / 2 + i * 3.2;
        const post = cyl(0.17, 0.2, 3.1, this.materials.woodDark, side * (width / 2 - 0.1), -0.55, z, 8);
        g.add(post);
        const cap = cyl(0.22, 0.22, 0.12, this.materials.woodPale, side * (width / 2 - 0.1), 1.02, z, 8);
        g.add(cap);
        if (i < Math.floor(length / 3.2)) {
          const brace = beam(
            new THREE.Vector3(side * (width / 2 - 0.08), 0.6, z),
            new THREE.Vector3(side * (width / 2 - 0.08), 0.85, z + 3.2),
            0.055, this.materials.woodDark
          );
          g.add(brace);
        }
      }
      const rail = beam(
        new THREE.Vector3(side * (width / 2 - 0.12), 1.55, -length / 2),
        new THREE.Vector3(side * (width / 2 - 0.12), 1.55, length / 2),
        0.055, this.materials.woodPale
      );
      g.add(rail);
      for (let i = 0; i <= 6; i++) {
        const z = -length / 2 + i * (length / 6);
        g.add(cyl(0.05, 0.06, 0.65, this.materials.woodPale, side * (width / 2 - 0.12), 1.22, z, 6));
      }
    }
    // Ladder, rope coils, lantern posts.
    for (let i = 0; i < 4; i++) {
      const rung = beam(
        new THREE.Vector3(-0.55, 0.8 - i * 0.35, length / 2 + 0.1),
        new THREE.Vector3(0.55, 0.8 - i * 0.35, length / 2 + 0.1),
        0.045, this.materials.rope
      );
      g.add(rung);
    }
    for (const side of [-1, 1]) {
      const post = cyl(0.09, 0.12, 2.8, this.materials.woodDark, side * (width / 2 - 0.2), 1.9, -length / 2 + 3, 8);
      g.add(post);
      const arm = beam(
        new THREE.Vector3(side * (width / 2 - 0.2), 3.1, -length / 2 + 3),
        new THREE.Vector3(side * (width / 2 - 0.65), 3.18, -length / 2 + 3),
        0.045, this.materials.woodDark
      );
      g.add(arm);
      const lamp = new THREE.Group();
      lamp.add(cyl(0.26, 0.2, 0.12, this.materials.iron, 0, 0.04, 0, 8));
      lamp.add(cyl(0.17, 0.2, 0.42, this.materials.lanternGlass, 0, 0.28, 0, 8));
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2;
        lamp.add(cyl(0.012, 0.012, 0.44, this.materials.iron, Math.sin(a) * 0.19, 0.28, Math.cos(a) * 0.19, 5));
      }
      const lampCap = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.16, 8), this.materials.iron);
      lampCap.position.y = 0.54;
      lamp.add(lampCap);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), this.materials.brass);
      finial.position.y = 0.65;
      lamp.add(finial);
      lamp.position.set(side * (width / 2 - 0.65), 2.9, -length / 2 + 3);
      g.add(lamp);
      this.lamp(lamp.position.x, 3.1, lamp.position.z, 1.1, 11, g);
    }
    // Coiled ropes and an old crate.
    for (let i = 0; i < 3; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.07, 8, 20), this.materials.rope);
      coil.rotation.x = -Math.PI / 2;
      coil.position.set(-1.1, 1.0, -length / 2 + 2.4 + i * 0.12);
      g.add(coil);
    }
    g.add(rounded(0.75, 0.6, 0.65, 0.05, this.materials.woodDark, 1.15, 1.27, -length / 2 + 2.1));
    return g;
  }

  buildBoat(name = '归潮号') {
    const g = new THREE.Group();
    const L = 7.2;
    const B = 2.35;
    // Lofted hull from cross sections.
    const rings = [];
    const N = 24;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const z = -L / 2 + t * L;
      const taper = Math.pow(Math.sin(t * Math.PI * 0.92 + 0.08), 0.55);
      const half = B / 2 * taper * (t > 0.82 ? 1 - (t - 0.82) * 2.1 : 1);
      const sheer = 0.62 + Math.sin(t * Math.PI) * 0.18;
      const keel = -0.55 + Math.cos(t * Math.PI * 0.5) * 0.18;
      rings.push({ z, half: Math.max(0.08, half), sheer, keel });
    }
    const verts = [];
    const idx = [];
    const profile = [
      [-1.0, -1.0], [-1.0, 0.25], [-0.82, 0.56], [-0.55, 0.78],
      [0, 0.88], [0.55, 0.78], [0.82, 0.56], [1.0, 0.25], [1.0, -1.0],
    ];
    for (const r of rings) {
      for (const [px, py] of profile) {
        verts.push(px * r.half, r.keel + (py + 1) * 0.5 * (r.sheer - r.keel), r.z);
      }
    }
    const P = profile.length;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < P - 1; j++) {
        const a = i * P + j;
        const b = (i + 1) * P + j;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const hullGeo = new THREE.BufferGeometry();
    hullGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    hullGeo.setIndex(idx);
    hullGeo.computeVertexNormals();
    const hull = new THREE.Mesh(hullGeo, this.materials.hull);
    hull.castShadow = true;
    hull.receiveShadow = true;
    g.add(hull);
    // Interior floor and gunwale.
    g.add(box(B * 0.72, 0.1, L * 0.78, this.materials.wood, 0, 0.65, -0.25));
    for (const side of [-1, 1]) {
      const rail = tube([
        new THREE.Vector3(side * B * 0.47, 0.85, -L / 2 + 0.15),
        new THREE.Vector3(side * B * 0.48, 0.96, -L * 0.1),
        new THREE.Vector3(side * B * 0.42, 0.92, L * 0.35),
        new THREE.Vector3(side * 0.1, 0.88, L / 2 - 0.05),
      ], 0.065, this.materials.woodPale, 6, 28);
      g.add(rail);
    }
    // Painted waterline stripe.
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(B * 0.98, 0.12, L * 0.82), this.materials.hullBlue);
    stripe.position.y = 0.25;
    stripe.scale.z = 1.02;
    g.add(stripe);
    // Cabin.
    const cab = new THREE.Group();
    cab.position.set(0, 1.1, 0.7);
    cab.add(rounded(1.75, 1.05, 1.65, 0.08, this.materials.hull, 0, 0.52, 0));
    const roof = rounded(1.95, 0.14, 1.85, 0.06, this.materials.hullBlue, 0, 1.1, 0);
    cab.add(roof);
    for (const side of [-1, 1]) {
      const win = box(0.04, 0.42, 0.95, this.materials.glass, side * 0.89, 0.58, 0.05);
      cab.add(win);
      const frame = box(0.06, 0.5, 1.05, this.materials.woodDark, side * 0.905, 0.58, 0.05);
      cab.add(frame);
      cab.add(box(0.09, 0.12, 1.02, this.materials.woodPale, side * 0.92, 0.36, 0.05));
    }
    cab.add(box(1.0, 0.42, 0.05, this.materials.glass, 0, 0.62, -0.84));
    g.add(cab);
    // Name board, life ring, deck cleats, rope and rod holders.
    const plateCanvas = document.createElement('canvas');
    plateCanvas.width = 256;
    plateCanvas.height = 64;
    const plateCtx = plateCanvas.getContext('2d');
    plateCtx.fillStyle = '#173a3d';
    plateCtx.fillRect(0, 0, 256, 64);
    plateCtx.strokeStyle = '#c8a86a';
    plateCtx.lineWidth = 3;
    plateCtx.strokeRect(4, 4, 248, 56);
    plateCtx.fillStyle = '#e7d7b3';
    plateCtx.font = '30px "Noto Serif SC", serif';
    plateCtx.textAlign = 'center';
    plateCtx.textBaseline = 'middle';
    plateCtx.fillText(name, 128, 35);
    const plateTex = new THREE.CanvasTexture(plateCanvas);
    plateTex.colorSpace = THREE.SRGBColorSpace;
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: plateTex }));
    plate.position.set(0, 1.28, 1.535);
    plate.rotation.y = 0;
    g.add(plate);
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.045, 6, 20), new THREE.MeshStandardMaterial({ color: '#d9784e', roughness: 0.72 }));
      ring.position.set(side * (B * 0.43), 0.86, 1.35);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      const cleat = box(0.34, 0.06, 0.12, this.materials.brass, side * B * 0.36, 0.92, -1.15);
      g.add(cleat);
      g.add(cyl(0.025, 0.025, 0.16, this.materials.brass, side * B * 0.36, 0.84, -1.15, 6));
    }
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 5, 18), this.materials.rope);
    coil.rotation.x = Math.PI / 2;
    coil.position.set(-0.55, 0.73, -1.45);
    g.add(coil);
    const radar = new THREE.Group();
    radar.position.set(0.55, 1.8, 0.2);
    radar.add(cyl(0.025, 0.035, 0.7, this.materials.metal, 0, 0.35, 0, 6));
    radar.add(rounded(0.5, 0.06, 0.14, 0.02, this.materials.metal, 0, 0.7, 0));
    g.add(radar);
    for (const [x, z, rz] of [[-0.75, -0.5, -0.4], [-0.55, -0.7, -0.5]]) {
      const rod = cyl(0.012, 0.018, 2.1, this.materials.woodPale, x, 1.1, z, 5);
      rod.rotation.z = rz;
      rod.rotation.x = -0.45;
      g.add(rod);
    }
    // Outboard.
    const motor = new THREE.Group();
    motor.position.set(0, 0.7, -L / 2 - 0.2);
    motor.add(rounded(0.55, 0.7, 0.4, 0.06, this.materials.iron, 0, 0.35, 0));
    motor.add(cyl(0.09, 0.09, 1.0, this.materials.metal, 0, -0.25, 0.05, 8));
    const skeg = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.3, 8), this.materials.iron);
    skeg.position.set(0, -0.75, 0.05);
    motor.add(skeg);
    g.add(motor);
    // Cleats, fenders, ropes, nameplate.
    for (const side of [-1, 1]) {
      for (const z of [-2.3, 1.8]) {
        g.add(cyl(0.07, 0.09, 0.18, this.materials.brass, side * B * 0.42, 0.94, z, 8));
        const fender = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.5, 4, 8), this.materials.canvasWarm);
        fender.rotation.z = Math.PI / 2;
        fender.position.set(side * (B * 0.52), 0.38, z);
        g.add(fender);
      }
    }
    const nameMat = new THREE.MeshBasicMaterial({ map: canvasText(name, { width: 512, height: 128, font: '600 66px "Noto Serif SC", serif', color: '#26383a' }), transparent: true });
    const namePlate = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), nameMat);
    namePlate.position.set(0, 0.92, -L / 2 + 0.03);
    namePlate.rotation.y = Math.PI;
    g.add(namePlate);
    // A couple of crates and a fishing rod inside.
    g.add(rounded(0.55, 0.45, 0.55, 0.03, this.materials.woodDark, -0.45, 0.95, -1.5));
    g.add(beam(new THREE.Vector3(0.55, 0.9, -1.2), new THREE.Vector3(0.2, 2.5, -0.6), 0.025, this.materials.woodDark, 5));
    return g;
  }

  buildLighthouse() {
    const g = new THREE.Group();
    const stone = this.materials.stoneWall;
    const red = this.materials.paintRed;
    // Distinct plaster map for the tower: sun-bleached patches, hairline
    // cracks and salt streaks keep the silhouette from reading as a flat cone.
    const plasterCanvas = document.createElement('canvas');
    plasterCanvas.width = 512;
    plasterCanvas.height = 512;
    const pctx = plasterCanvas.getContext('2d');
    pctx.fillStyle = '#e6dfcf';
    pctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 420; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const s = 3 + Math.random() * 34;
      pctx.fillStyle = `rgba(${90 + Math.random() * 70},${82 + Math.random() * 60},${66 + Math.random() * 50},${0.025 + Math.random() * 0.07})`;
      pctx.beginPath();
      pctx.ellipse(x, y, s, s * (0.25 + Math.random() * 0.9), Math.random() * 3, 0, Math.PI * 2);
      pctx.fill();
    }
    for (let i = 0; i < 34; i++) {
      const x = Math.random() * 512;
      pctx.strokeStyle = `rgba(72,65,54,${0.05 + Math.random() * 0.1})`;
      pctx.lineWidth = 0.5 + Math.random();
      pctx.beginPath();
      pctx.moveTo(x, 0);
      pctx.bezierCurveTo(x + 8, 140, x - 9, 330, x + 4, 512);
      pctx.stroke();
    }
    const plasterTex = new THREE.CanvasTexture(plasterCanvas);
    plasterTex.colorSpace = THREE.SRGBColorSpace;
    plasterTex.wrapS = plasterTex.wrapT = THREE.RepeatWrapping;
    plasterTex.repeat.set(3, 2);
    plasterTex.anisotropy = 8;
    const white = new THREE.MeshStandardMaterial({
      map: plasterTex, bumpMap: plasterTex, bumpScale: 0.025,
      color: new THREE.Color('#eee7d8'), roughness: 0.72,
    });
    // Sink a wide plinth into the hillside so the lighthouse can never appear
    // to float on a slope.
    g.add(cyl(3.5, 4.35, 2.8, stone, 0, -0.65, 0, 48));
    g.add(cyl(2.7, 3.25, 0.8, stone, 0, 0.4, 0, 40));
    g.add(cyl(2.25, 2.8, 1.0, stone, 0, 1.3, 0, 40));
    // Rough masonry courses break up the foundation silhouette.
    for (let row = 0; row < 3; row++) {
      const count = 17;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + row * 0.17;
        const r = 2.72 - row * 0.17;
        const block = new THREE.Mesh(new RoundedBoxGeometry(0.55 + (i % 3) * 0.12, 0.22, 0.32, 2, 0.03), stone);
        block.position.set(Math.sin(a) * r, 0.26 + row * 0.44, Math.cos(a) * r);
        block.rotation.y = a;
        block.rotation.z = (i % 2 ? 1 : -1) * 0.02;
        block.castShadow = true;
        block.receiveShadow = true;
        g.add(block);
      }
    }
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 2.35, 11.8, 40, 1), white);
    tower.position.y = 7.7;
    tower.castShadow = true;
    tower.receiveShadow = true;
    g.add(tower);
    const radiusAt = (y) => 2.35 - ((y - 1.8) / 11.8) * 0.8;
    for (const [y, h] of [[4.0, 1.1], [8.5, 1.0]]) {
      const r = radiusAt(y);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(r + 0.01, r + 0.05, h, 40, 1), red);
      band.position.y = y;
      band.castShadow = true;
      g.add(band);
    }
    // Iron hoops and rivets give the tower readable scale from the path.
    for (const y of [3.0, 6.4, 10.6, 12.7]) {
      const r = radiusAt(y) + 0.025;
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(r, 0.045, 5, 48), this.materials.iron);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
      g.add(hoop);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        g.add(sphere(0.028, this.materials.metal, Math.sin(a) * (r + 0.02), y, Math.cos(a) * (r + 0.02), 8));
      }
    }
    // Door with stone surround, planks and iron hardware.
    const door = box(1.05, 1.9, 0.22, this.materials.woodDark, 0, 2.75, 2.36);
    g.add(door);
    for (const x of [-0.42, 0, 0.42]) g.add(box(0.035, 1.78, 0.035, this.materials.woodPale, x, 2.75, 2.49));
    for (const y of [2.05, 3.34]) {
      g.add(box(0.9, 0.07, 0.06, this.materials.iron, 0, y, 2.48));
      g.add(sphere(0.055, this.materials.brass, 0.34, y, 2.53, 8));
    }
    g.add(box(1.3, 0.16, 0.3, this.materials.woodPale, 0, 3.72, 2.52));
    for (const side of [-1, 1]) {
      g.add(box(0.18, 2.05, 0.28, stone, side * 0.64, 2.78, 2.4));
      g.add(box(0.58, 0.18, 0.28, stone, side * 0.42, 3.83, 2.4));
    }
    // Framed windows and sills, sunk into the tower radius.
    for (const [y, a] of [[5.4, -0.3], [9.0, 0.2], [12.1, -0.6]]) {
      const r = radiusAt(y) + 0.01;
      const frame = box(0.5, 0.78, 0.09, this.materials.iron, Math.sin(a) * r, y, Math.cos(a) * r);
      frame.rotation.y = a;
      g.add(frame);
      const w = box(0.34, 0.6, 0.13, this.materials.glass, Math.sin(a) * (r + 0.035), y, Math.cos(a) * (r + 0.035));
      w.rotation.y = a;
      g.add(w);
      for (const dy of [-0.4, 0.4]) {
        const sill = box(0.6, 0.07, 0.16, stone, Math.sin(a) * (r + 0.04), y + dy, Math.cos(a) * (r + 0.04));
        sill.rotation.y = a;
        g.add(sill);
      }
    }
    // A weathered drainpipe and brackets on the seaward face.
    const pipeAngle = 2.35;
    for (let i = 0; i < 4; i++) {
      const y = 3.2 + i * 2.5;
      const r = radiusAt(y) + 0.08;
      g.add(box(0.22, 0.06, 0.14, this.materials.iron, Math.sin(pipeAngle) * r, y, Math.cos(pipeAngle) * r));
    }
    g.add(cyl(0.055, 0.065, 9.4, this.materials.iron, Math.sin(pipeAngle) * (radiusAt(8) + 0.1), 7.3, Math.cos(pipeAngle) * (radiusAt(8) + 0.1), 8));
    // Balcony.
    g.add(cyl(2.55, 2.7, 0.24, this.materials.iron, 0, 13.15, 0, 32));
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      g.add(cyl(0.055, 0.055, 0.9, this.materials.brass, Math.sin(a) * 2.42, 13.68, Math.cos(a) * 2.42, 5));
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.055, 6, 64), this.materials.brass);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 14.1;
    g.add(rail);
    const midRail = rail.clone();
    midRail.position.y = 13.7;
    midRail.scale.setScalar(0.995);
    g.add(midRail);
    // Lantern room.
    const glassRoom = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 1.9, 16, 1, true), this.materials.glass);
    glassRoom.position.y = 14.45;
    g.add(glassRoom);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.add(cyl(0.045, 0.045, 1.95, this.materials.iron, Math.sin(a) * 1.47, 14.45, Math.cos(a) * 1.47, 5));
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.95, 1.2, 16), this.materials.copper);
    roof.position.y = 16.05;
    roof.castShadow = true;
    g.add(roof);
    g.add(cyl(0.09, 0.16, 0.8, this.materials.copper, 0, 16.9, 0, 6));
    // Fresnel lens.
    const lens = new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), this.materials.lamp);
    lens.scale.set(1, 1.35, 1);
    lens.position.y = 14.5;
    lens.userData.noMerge = true;
    g.add(lens);
    this.lamp(0, 14.55, 0, 5.5, 34, g);
    this.lens = lens;
    // Rotating beam cones, hidden until the lamp is lit.
    const beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#ffd9a0'),
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.beamGroup = new THREE.Group();
    this.beamGroup.position.y = 14.5;
    for (const s of [0, Math.PI]) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.4, 34, 24, 1, true), beamMat);
      cone.rotation.z = Math.PI / 2;
      cone.rotation.y = 0;
      cone.position.set(17, 0, 0);
      const holder = new THREE.Group();
      holder.add(cone);
      holder.rotation.y = s;
      this.beamGroup.add(holder);
    }
    this.beamGroup.visible = false;
    this.beamGroup.userData.noMerge = true;
    g.add(this.beamGroup);
    // A low iron rail rings the stone platform, with a gap at the seaward door.
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      if (Math.cos(a) > 0.82 && Math.abs(Math.sin(a)) < 0.45) continue;
      const r = 3.02;
      g.add(cyl(0.045, 0.055, 0.95, this.materials.iron, Math.sin(a) * r, 1.95, Math.cos(a) * r, 6));
    }
    for (const y of [1.72, 2.32]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(3.02, 0.045, 5, 64), this.materials.iron);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = y;
      g.add(ring);
    }
    // Path lanterns with an iron cage, cap and base.
    for (const [x, z] of [[3.2, 2.6], [-3.5, 2.2], [2.7, -2.4]]) {
      g.add(rounded(0.24, 0.45, 0.24, 0.03, this.materials.lanternGlass, x, 1.2, z));
      g.add(cyl(0.03, 0.05, 1.0, this.materials.iron, x, 0.55, z, 6));
      g.add(cyl(0.19, 0.22, 0.08, this.materials.iron, x, 1.43, z, 8));
      for (const [ox, oz] of [[-0.13, -0.13], [0.13, -0.13], [-0.13, 0.13], [0.13, 0.13]]) {
        g.add(cyl(0.018, 0.018, 0.48, this.materials.iron, x + ox, 1.2, z + oz, 5));
      }
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.16, 8), this.materials.iron);
      cap.position.set(x, 1.52, z);
      g.add(cap);
    }
    return g;
  }

  buildCabin() {
    const g = new THREE.Group();
    const W = 6.6;
    const D = 5.4;
    const H = 2.9;
    g.add(box(W + 1.6, 0.35, D + 1.8, this.materials.woodDark, 0, 0.2, 0));
    // Walls made of vertical boards.
    for (let i = 0; i < 15; i++) {
      const x = -W / 2 + i * (W / 15) + W / 30;
      const m = i % 4 === 0 ? this.materials.woodDark : this.materials.wood;
      const p = box(W / 15 - 0.02, H, D * 0.08, m, x, 0.42 + H / 2, -D / 2 + 0.1);
      g.add(p);
      const p2 = box(W / 15 - 0.02, H, D * 0.08, m, x, 0.42 + H / 2, D / 2 - 0.1);
      g.add(p2);
    }
    for (const side of [-1, 1]) {
      g.add(box(W, H, 0.22, this.materials.wood, 0, 0.42 + H / 2, side * D / 2));
    }
    // Cut a dark doorway / windows as inset panels.
    g.add(box(1.3, 2.25, 0.25, this.materials.woodDark, 0.7, 1.55, D / 2 + 0.02));
    g.add(box(1.55, 2.45, 0.18, this.materials.woodPale, 0.7, 1.65, D / 2 + 0.12));
    g.add(box(1.28, 2.18, 0.2, this.materials.black, 0.7, 1.58, D / 2 + 0.22));
    g.add(cyl(0.06, 0.06, 0.24, this.materials.brass, 1.3, 1.43, D / 2 + 0.35, 6));
    for (const x of [-1.5, 2.0]) {
      g.add(box(1.0, 0.9, 0.2, this.materials.windowWarm, x, 1.9, D / 2 + 0.02));
      g.add(box(1.18, 1.08, 0.16, this.materials.woodPale, x, 1.9, D / 2 + 0.1));
      g.add(box(0.05, 0.95, 0.04, this.materials.woodDark, x, 1.9, D / 2 + 0.21));
    }
    this.lamp(0, 2.1, 0.4, 1.9, 10, g);
    // Gable roof: two weathered slabs.
    const roofL = new THREE.Mesh(new THREE.BoxGeometry(W + 1.3, 0.18, D * 0.67), this.materials.woodDark);
    roofL.position.set(0, 4.45, -D * 0.25);
    roofL.rotation.x = -0.52;
    roofL.castShadow = true;
    g.add(roofL);
    const roofR = roofL.clone();
    roofR.position.z = D * 0.25;
    roofR.rotation.x = 0.52;
    g.add(roofR);
    // Overlapping shingle courses.
    for (const side of [-1, 1]) {
      for (let row = 0; row < 5; row++) {
        const shingle = new THREE.Mesh(new THREE.BoxGeometry(W + 1.35, 0.05, 0.52), row % 2 ? this.materials.wood : this.materials.woodDark);
        shingle.position.set(0, 4.57 - row * 0.22, side * (D * 0.14 + row * 0.42));
        shingle.rotation.x = side * 0.52;
        shingle.castShadow = true;
        g.add(shingle);
      }
    }
    g.add(box(W + 1.45, 0.12, 0.16, this.materials.woodPale, 0, 5.18, 0));
    g.add(box(0.65, 1.6, 0.65, this.materials.rockDark, -1.9, 4.35, 1.1));
    // Porch.
    for (const x of [-2.8, 2.9]) {
      for (const z of [D / 2 + 1.3]) {
        g.add(cyl(0.11, 0.14, 2.7, this.materials.woodDark, x, 1.7, z, 8));
      }
    }
    g.add(box(W + 1.4, 0.2, 2.2, this.materials.wood, 0, 2.95, D / 2 + 1.35));
    g.add(box(W + 1.2, 0.12, 2.0, this.materials.woodPale, 0, 0.28, D / 2 + 1.3));
    // Porch table with the logbook.
    g.add(box(1.45, 0.1, 0.85, this.materials.woodPale, 1.4, 0.95, D / 2 + 1.25));
    for (const [x, z] of [[0.8, 1.1], [2.0, 1.1], [0.8, 1.9], [2.0, 1.9]]) {
      g.add(cyl(0.06, 0.075, 0.7, this.materials.woodDark, x, 0.58, D / 2 + z, 6));
    }
    const book = rounded(0.5, 0.09, 0.36, 0.02, this.materials.canvasWarm, 1.35, 1.04, D / 2 + 1.3);
    book.rotation.y = 0.3;
    g.add(book);
    // Hanging lantern by the door.
    g.add(beam(new THREE.Vector3(2.7, 3.45, D / 2 + 0.2), new THREE.Vector3(2.7, 3.0, D / 2 + 0.2), 0.03, this.materials.iron));
    g.add(rounded(0.23, 0.4, 0.23, 0.03, this.materials.lanternGlass, 2.7, 2.75, D / 2 + 0.2));
    this.lamp(2.7, 2.75, D / 2 + 0.2, 1.3, 9, g);
    // Fishing nets and oars on the wall.
    g.add(beam(new THREE.Vector3(-2.8, 0.6, D / 2 + 0.22), new THREE.Vector3(-1.1, 2.6, D / 2 + 0.24), 0.045, this.materials.woodPale));
    g.add(beam(new THREE.Vector3(-2.3, 0.6, D / 2 + 0.23), new THREE.Vector3(-0.7, 2.55, D / 2 + 0.25), 0.04, this.materials.woodPale));
    return g;
  }

  buildShop() {
    const g = new THREE.Group();
    const W = 5.4;
    const D = 2.7;
    g.add(box(W + 1.2, 0.28, D + 1.4, this.materials.woodDark, 0, 0.18, 0));
    for (const x of [-W / 2, W / 2]) {
      for (const z of [-D / 2, D / 2]) {
        g.add(cyl(0.12, 0.16, 3.0, this.materials.woodDark, x, 1.65, z, 8));
      }
    }
    // Counter.
    g.add(box(W, 0.9, 0.8, this.materials.wood, 0, 0.95, D / 2 - 0.2));
    g.add(box(W + 0.2, 0.12, 1.05, this.materials.woodPale, 0, 1.44, D / 2 - 0.15));
    // Shelves and jars.
    for (let row = 0; row < 2; row++) {
      g.add(box(W - 0.3, 0.09, 0.6, this.materials.woodPale, 0, 2.0 + row * 0.65, -D / 2 + 0.55));
      for (let i = 0; i < 7; i++) {
        const col = ['#9f6b46', '#6f8f74', '#c5a264', '#7c6070'][i % 4];
        const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.3, 10), new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.3, transparent: true, opacity: 0.8 }));
        jar.position.set(-2.1 + i * 0.68, 2.22 + row * 0.65, -D / 2 + 0.55);
        g.add(jar);
      }
    }
    // Striped awning.
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.6, 2.2, 1, 1), this.materials.awning);
    awning.rotation.x = -Math.PI / 2 + 0.22;
    awning.position.set(0, 3.2, D / 2 + 0.7);
    awning.castShadow = true;
    g.add(awning);
    const fringe = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.6, 0.28), this.materials.canvasWarm);
    fringe.position.set(0, 2.82, D / 2 + 1.76);
    g.add(fringe);
    // Hanging fish, buoys, scale.
    for (let i = 0; i < 4; i++) {
      const fish = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), this.materials.canvasWarm);
      fish.scale.set(0.45, 1.1, 0.25);
      fish.position.set(-1.8 + i * 0.85, 2.62, D / 2 + 0.25);
      g.add(fish);
      g.add(cyl(0.012, 0.012, 0.5, this.materials.rope, -1.8 + i * 0.85, 2.98, D / 2 + 0.25, 4));
    }
    g.add(cyl(0.32, 0.4, 0.48, this.materials.brass, 1.9, 1.7, D / 2 - 0.3, 12));
    g.add(box(0.5, 0.05, 0.6, this.materials.woodDark, 1.9, 1.48, D / 2 - 0.1));
    // Sign.
    const signMat = new THREE.MeshBasicMaterial({
      map: canvasText('潮 汐 杂 货', { width: 512, height: 140, font: '600 62px "Noto Serif SC", serif', color: '#f0dfba' }),
      transparent: true,
    });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.7), signMat);
    sign.position.set(0, 3.35, D / 2 + 0.5);
    g.add(sign);
    // Crates in front.
    for (const [x, z, s] of [[-2.3, 1.45, 0.55], [-1.65, 1.6, 0.4], [2.2, 1.5, 0.65]]) {
      g.add(rounded(s, s * 0.8, s, 0.03, this.materials.woodDark, x, 0.45 + s * 0.4, z));
    }
    this.lamp(0, 2.8, D / 2, 1.2, 10, g);
    return g;
  }

  buildCampfire() {
    const g = new THREE.Group();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24 + rand(0, 0.1), 0), this.materials.rockDark);
      rock.position.set(Math.cos(a) * 0.72, 0.12, Math.sin(a) * 0.72);
      rock.rotation.set(rand(0, 1), rand(0, 3), rand(0, 1));
      g.add(rock);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.add(beam(new THREE.Vector3(Math.cos(a) * 0.55, 0.1, Math.sin(a) * 0.55), new THREE.Vector3(0, 0.8, 0), 0.08, this.materials.bark));
    }
    const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a45'), transparent: true, opacity: 0.72, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 3; i++) {
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.2 - i * 0.04, 0.8 + i * 0.2, 8), flameMat);
      flame.position.set(rand(-0.08, 0.08), 0.45, rand(-0.08, 0.08));
      g.add(flame);
    }
    this.lamp(0, 1.1, 0, 3.2, 12, g);
    return g;
  }

  buildCrates() {
    const g = new THREE.Group();
    for (const [x, z, s, r] of [[0, 0, 0.7, 0.2], [0.9, 0.3, 0.5, -0.3], [0.5, -0.7, 0.45, 0.8]]) {
      const c = rounded(s, s * 0.8, s, 0.03, this.materials.woodDark, x, s * 0.4, z);
      c.rotation.y = r;
      g.add(c);
      g.add(box(s * 1.02, 0.04, s * 1.02, this.materials.woodPale, x, s * 0.8 + 0.02, z));
    }
    return g;
  }

  buildBarrel(x = 0, z = 0) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.33, 0.8, 18), this.materials.woodDark);
    body.position.y = 0.4;
    g.add(body);
    for (const y of [0.15, 0.65]) {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.345, 0.025, 6, 24), this.materials.iron);
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = y;
      g.add(hoop);
    }
    g.position.set(x, 0, z);
    return g;
  }

  buildNetFrame() {
    const g = new THREE.Group();
    for (const x of [-1.1, 1.1]) g.add(cyl(0.045, 0.06, 2.2, this.materials.woodDark, x, 1.1, 0, 6));
    g.add(beam(new THREE.Vector3(-1.1, 2.05, 0), new THREE.Vector3(1.1, 2.05, 0), 0.04, this.materials.woodDark));
    const net = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.1, 1, 1), this.materials.net);
    net.position.set(0, 1.42, 0);
    net.rotation.x = -0.05;
    g.add(net);
    return g;
  }

  buildSign(text, color = '#2d3531') {
    const g = new THREE.Group();
    g.add(cyl(0.06, 0.08, 2.2, this.materials.woodDark, 0, 1.1, 0, 6));
    g.add(box(1.7, 0.52, 0.09, this.materials.woodPale, 0, 1.85, 0));
    const mat = new THREE.MeshBasicMaterial({
      map: canvasText(text, { width: 512, height: 140, font: '500 58px "Noto Serif SC", serif', color }),
      transparent: true,
    });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.58, 0.42), mat);
    plate.position.set(0, 1.85, 0.055);
    g.add(plate);
    return g;
  }

  buildBuoys() {
    const g = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), i % 2 ? this.materials.paintRed : this.materials.paint);
      b.scale.y = 1.3;
      b.position.set(i * 0.45 - 0.45, 0.34, 0);
      g.add(b);
      g.add(cyl(0.02, 0.02, 0.35, this.materials.rope, i * 0.45 - 0.45, 0.75, 0, 4));
    }
    return g;
  }

  buildRowboat() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.7, 2.4, 4, 10, 4), this.materials.woodDark);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(1, 0.55, 1);
    hull.position.y = 0.5;
    g.add(hull);
    for (const x of [-1.4, 1.4]) g.add(box(0.18, 0.08, 1.1, this.materials.woodPale, x, 0.7, 0));
    return g;
  }

  buildStiltHut() {
    const g = new THREE.Group();
    for (const [x, z] of [[-2, -1.5], [2, -1.5], [-2, 1.5], [2, 1.5], [0, 0]]) {
      g.add(cyl(0.13, 0.17, 2.6, this.materials.woodDark, x, 0.0, z, 7));
    }
    g.add(box(5.2, 0.25, 4.1, this.materials.wood, 0, 1.4, 0));
    for (let i = 0; i < 8; i++) {
      const x = -2.5 + i * 0.72;
      g.add(box(0.04, 2.0, 0.06, this.materials.woodDark, x, 2.55, 2.03));
      g.add(box(0.04, 2.0, 0.06, this.materials.woodDark, x, 2.55, -2.03));
    }
    g.add(box(5.2, 2.0, 0.16, this.materials.wood, 0, 2.55, -2.03));
    g.add(box(5.2, 2.0, 0.16, this.materials.wood, 0, 2.55, 2.03));
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 1.7, 4), this.materials.woodDark);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 4.55;
    roof.scale.z = 0.82;
    g.add(roof);
    g.add(box(1.1, 1.8, 0.12, this.materials.black, 0, 2.5, 2.13));
    this.lamp(0, 2.8, 1.4, 1.2, 8, g);
    return g;
  }

  buildCanoe() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 3.2, 4, 10, 4), this.materials.bark);
    hull.rotation.z = Math.PI / 2;
    hull.scale.set(1, 0.5, 1);
    hull.position.y = 0.4;
    g.add(hull);
    for (const x of [-1.2, 0.3]) g.add(box(0.12, 0.06, 0.7, this.materials.woodPale, x, 0.62, 0));
    return g;
  }

  buildTotem() {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const carve = new THREE.Mesh(new THREE.CylinderGeometry(0.4 - i * 0.03, 0.44 - i * 0.03, 0.6, 7), this.materials.woodDark);
      carve.position.y = 0.4 + i * 0.6;
      carve.rotation.y = i * 0.4;
      g.add(carve);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), this.materials.paintRed);
      eye.position.set(0.32, 0.5 + i * 0.6, 0.2);
      g.add(eye);
    }
    return g;
  }

  buildWreck() {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.8, 7, 12, 1, true, 0, Math.PI), this.materials.woodDark);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.x = 0.35;
    hull.position.y = 1.1;
    hull.scale.set(1, 0.55, 1);
    g.add(hull);
    for (let i = 0; i < 7; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(1.1 - i * 0.05, 0.055, 5, 18, Math.PI), this.materials.woodPale);
      rib.rotation.y = Math.PI / 2;
      rib.rotation.z = Math.PI / 2;
      rib.position.set(0, 1.1 + Math.sin(i) * 0.1, -3 + i * 0.9);
      g.add(rib);
    }
    g.add(beam(new THREE.Vector3(0.3, 1.2, -1), new THREE.Vector3(0.8, 7.5, -1.8), 0.16, this.materials.woodDark));
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.6, 5, 4), new THREE.MeshStandardMaterial({
      color: '#b9ab8c', roughness: 0.95, side: THREE.DoubleSide, transparent: true, opacity: 0.72,
    }));
    const sa = sail.geometry.attributes.position;
    for (let i = 0; i < sa.count; i++) {
      sa.setZ(i, Math.sin(sa.getX(i) * 2 + sa.getY(i)) * 0.25);
    }
    sail.geometry.computeVertexNormals();
    sail.position.set(-0.9, 5.3, -1.3);
    sail.rotation.y = 0.4;
    g.add(sail);
    // Seaweed and starfish.
    for (let i = 0; i < 5; i++) {
      const weed = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1.2), this.materials.leaf);
      weed.position.set(rand(-1.5, 1.5), 0.5, rand(-2, 2));
      weed.rotation.y = rand(0, 3);
      g.add(weed);
    }
    return g;
  }

  buildHammock() {
    const g = new THREE.Group();
    for (const [x, z, h] of [[-1.8, -1.1, 2.1], [1.8, 1.1, 2.1]]) {
      g.add(cyl(0.1, 0.14, h, this.materials.woodDark, x, h / 2, z, 7));
    }
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 1.3, 12, 4), new THREE.MeshStandardMaterial({
      color: '#d78d62', roughness: 0.93, side: THREE.DoubleSide,
    }));
    const pos = cloth.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      pos.setZ(i, -0.45 * Math.cos(x / 1.65) + 0.15 * Math.sin(y * 4));
    }
    cloth.geometry.computeVertexNormals();
    cloth.rotation.x = -0.25;
    cloth.position.set(0, 1.65, 0);
    g.add(cloth);
    return g;
  }

  buildDiveGear() {
    const g = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const tank = new THREE.Mesh(new THREE.CapsuleGeometry(0.19, 0.8, 4, 12), i ? this.materials.paintRed : this.materials.metal);
      tank.position.set(i * 0.42, 0.64, 0);
      g.add(tank);
      g.add(cyl(0.06, 0.08, 0.22, this.materials.brass, i * 0.42, 1.22, 0, 8));
    }
    const mask = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 18), this.materials.black);
    mask.position.set(0.7, 0.4, 0.25);
    mask.rotation.x = 1.2;
    g.add(mask);
    return g;
  }

  buildLookout() {
    const g = new THREE.Group();
    for (const [x, z] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      g.add(cyl(0.12, 0.18, 5.2, this.materials.woodDark, x, 2.6, z, 7));
    }
    g.add(box(3.6, 0.22, 3.6, this.materials.wood, 0, 5.1, 0));
    for (const side of [-1, 1]) {
      g.add(box(3.6, 0.8, 0.08, this.materials.woodPale, 0, 5.55, side * 1.75));
      g.add(box(0.08, 0.8, 3.6, this.materials.woodPale, side * 1.75, 5.55, 0));
    }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 1.4, 4), this.materials.canvas);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 6.9;
    g.add(roof);
    for (let i = 0; i < 3; i++) {
      g.add(beam(new THREE.Vector3(-1.6, 0.1, -1.6 + i * 1.6), new THREE.Vector3(-1.6, 5.1, -1.6), 0.04, this.materials.woodDark));
    }
    return g;
  }

  buildFlag() {
    const g = new THREE.Group();
    g.add(cyl(0.05, 0.08, 4.2, this.materials.woodDark, 0, 2.1, 0, 6));
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2, 12, 6), new THREE.MeshStandardMaterial({
      color: '#b14f40', roughness: 0.94, side: THREE.DoubleSide,
    }));
    const pos = flag.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(pos.getX(i) * 2.4) * 0.16);
    }
    flag.geometry.computeVertexNormals();
    flag.position.set(1.2, 3.35, 0);
    g.add(flag);
    return g;
  }

  buildBoatyard() {
    const g = new THREE.Group();
    g.add(box(7, 0.35, 5, this.materials.woodDark, 0, 0.18, 0));
    // Cradle.
    for (const x of [-2.2, 2.2]) {
      g.add(beam(new THREE.Vector3(x, 0.3, -1.8), new THREE.Vector3(x, 1.8, -1.2), 0.12, this.materials.wood));
      g.add(beam(new THREE.Vector3(x, 0.3, 1.8), new THREE.Vector3(x, 1.8, 1.2), 0.12, this.materials.wood));
    }
    // Crane.
    g.add(cyl(0.18, 0.24, 5.4, this.materials.metal, 2.8, 2.7, -1.8, 8));
    g.add(beam(new THREE.Vector3(2.8, 5.2, -1.8), new THREE.Vector3(-0.3, 6.4, -1.8), 0.12, this.materials.metal));
    g.add(cyl(0.015, 0.015, 2.4, this.materials.rope, -0.3, 5.2, -1.8, 4));
    g.add(rounded(0.5, 0.4, 0.5, 0.03, this.materials.iron, -0.3, 3.8, -1.8));
    return g;
  }

  buildFieldCamp() {
    const g = new THREE.Group();
    for (const [x, z, rot, col] of [[-2.2, 0.6, 0.3, '#8c7c62'], [1.8, -0.4, -0.5, '#6f7564']]) {
      const tent = new THREE.Mesh(new THREE.ConeGeometry(1.7, 1.6, 4), new THREE.MeshStandardMaterial({ color: col, roughness: 0.95 }));
      tent.rotation.y = Math.PI / 4 + rot;
      tent.position.set(x, 0.8, z);
      g.add(tent);
      g.add(box(0.7, 0.05, 1.0, this.materials.canvas, x, 0.12, z + 0.8));
    }
    // Drill rig.
    const rig = new THREE.Group();
    rig.position.set(0, 0, -2.6);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      rig.add(beam(new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4), new THREE.Vector3(0, 3.8, 0), 0.08, this.materials.metal));
    }
    rig.add(cyl(0.26, 0.22, 2.2, this.materials.iron, 0, 3.4, 0, 10));
    rig.add(box(0.9, 0.5, 0.7, this.materials.metal, 0, 2.1, 0));
    g.add(rig);
    for (let i = 0; i < 4; i++) g.add(this.buildCrates().children[0].clone());
    return g;
  }

  buildBeacon() {
    const g = new THREE.Group();
    g.add(cyl(0.12, 0.22, 4.4, this.materials.metal, 0, 2.2, 0, 6));
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.26 - i * 0.04, 0.025, 5, 16), this.materials.brass);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 3.4 + i * 0.38;
      g.add(ring);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), this.materials.lamp);
    lamp.position.y = 4.5;
    g.add(lamp);
    this.lamp(0, 4.5, 0, 4.0, 18, g);
    return g;
  }

  buildLavaFlow(x, z, length = 8) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5b27'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 6; i++) {
      const seg = new THREE.Mesh(new THREE.PlaneGeometry(2.2 + rand(-0.6, 0.6), length / 6 + 0.4), mat);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = rand(-0.35, 0.35);
      seg.position.set(rand(-1, 1), 0.08, -length / 2 + i * (length / 6));
      g.add(seg);
    }
    this.lamp(0, 1.2, 0, 2.0, 16, g);
    return g;
  }

  buildAshVent(x, z) {
    const g = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.0, 1.2, 7, 1, true), this.materials.rockDark);
    cone.position.y = 0.6;
    g.add(cone);
    const smoke = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2.5, 8, 1, true), new THREE.MeshBasicMaterial({
      color: '#8f7668', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
    }));
    smoke.position.y = 2.2;
    g.add(smoke);
    return g;
  }

  buildLighthouseLit() {
    if (this.beamGroup) this.beamGroup.visible = true;
    if (this.lens) this.lens.material.emissiveIntensity = 5.5;
  }

  setLighthouseLit(on) {
    if (this.beamGroup) this.beamGroup.visible = on;
    if (this.lens) this.lens.material.emissiveIntensity = on ? 5.5 : 0.35;
  }

  update(dt, t) {
    if (this.beamGroup && this.beamGroup.visible) {
      this.beamGroup.rotation.y += dt * 0.22;
      this.beamGroup.rotation.y %= Math.PI * 2;
    }
  }
}
