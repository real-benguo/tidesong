import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from 'simplex-noise';
import { mulberry32, rand, clamp, smoothstep } from '../utils/math.js';

function leafTexture(seed = 1, color = '#ffffff') {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const rng = mulberry32(seed);
  ctx.clearRect(0, 0, 512, 512);
  // Soft leaf cluster with many small pointed leaves, transparent edges.
  for (let i = 0; i < 160; i++) {
    const a = rng() * Math.PI * 2;
    const d = Math.pow(rng(), 0.7) * 215;
    const x = 256 + Math.cos(a) * d;
    const y = 256 + Math.sin(a) * d * 0.8;
    const s = 18 + rng() * 46;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a + rng() * 1.2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-s, 0);
    ctx.quadraticCurveTo(0, -s * 0.48, s, 0);
    ctx.quadraticCurveTo(0, s * 0.34, -s, 0);
    ctx.fill();
    ctx.restore();
  }
  // Carve out the silhouette edges to avoid a square card.
  const grad = ctx.createRadialGradient(256, 256, 120, 256, 256, 256);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makeFrond(length = 4.5, width = 0.75, seed = 1) {
  const rng = mulberry32(seed);
  const segs = 26;
  const verts = [];
  const uvs = [];
  const idx = [];
  const colors = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = t * length;
    const y = Math.sin(t * Math.PI * 0.55) * length * 0.18 - Math.pow(t, 2.4) * length * 0.52;
    const w = Math.sin(Math.pow(t, 0.72) * Math.PI) * width * (0.7 + 0.3 * t);
    const serr = (i % 3 === 0 ? 0.84 : 1) * (0.9 + rng() * 0.2);
    verts.push(x, y + w * 0.16 * serr, -w * 0.5 * serr);
    verts.push(x, y - w * 0.1, 0);
    verts.push(x, y + w * 0.16 * serr, w * 0.5 * serr);
    uvs.push(t, 0, t, 0.5, t, 1);
    const shade = 0.62 + 0.38 * Math.sin(t * 5.0 + seed);
    colors.push(shade, shade, shade, shade, shade, shade, shade, shade, shade);
    if (i < segs) {
      const a = i * 3;
      for (let k = 0; k < 2; k++) idx.push(a + k, a + k + 3, a + k + 1, a + k + 1, a + k + 3, a + k + 4);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

export class Vegetation {
  constructor({ scene, config, shape, assets, quality = 'high', exclusions = null }) {
    this.scene = scene;
    this.config = config;
    this.shape = shape;
    this.assets = assets;
    this.quality = quality;
    this.exclusions = exclusions;
    this.group = new THREE.Group();
    this.group.name = 'vegetation';
    scene.add(this.group);
    this.rng = mulberry32(config.seed + 77);
    this.fronds = [];
    this.palms = [];
    this.trees = [];
    this.rocks = [];
    this.leafTex = [
      leafTexture(config.seed + 1, '#ffffff'),
      leafTexture(config.seed + 2, '#ffffff'),
      leafTexture(config.seed + 3, '#ffffff'),
    ];
    this.leafMats = this.leafTex.map((t, i) => new THREE.MeshStandardMaterial({
      map: t, color: new THREE.Color(i === 1 ? config.palette.leaf2 : config.palette.leaf),
      alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.92, metalness: 0,
      transparent: false,
    }));
    this.buildMaterials();
    this.staticGroup = new THREE.Group();
    this.staticGroup.name = 'static-foliage';
    this.group.add(this.staticGroup);
    this.buildPalms();
    this.buildTrees();
    this.buildShrubs();
    this.buildGrass();
    this.buildFlowers();
    this.buildFerns();
    this.buildRocks();
    this.mergeStaticFoliage();
    this.buildBirds();
    this.buildParticles();
    this.buildRain();
  }

  buildMaterials() {
    const p = this.config.palette;
    this.trunkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.bark), roughness: 0.95, map: this.assets.setRepeat('bark', 3, 2, 'diffuse') || null });
    this.trunkMat2 = new THREE.MeshStandardMaterial({ color: new THREE.Color('#5f5141'), roughness: 0.96 });
    this.rockMat = this.assets.standardMaterial('rock', { repeat: 2.4, color: '#8b877a', roughness: 0.95 });
    this.rockMatDark = this.assets.standardMaterial('rock', { repeat: 2.6, color: '#5c584f', roughness: 0.98 });
    this.frondMat = new THREE.MeshStandardMaterial({
      vertexColors: true, color: new THREE.Color(p.leaf).multiplyScalar(1.35), roughness: 0.78,
      side: THREE.DoubleSide, alphaTest: 0.15,
    });
    this.frondMat2 = new THREE.MeshStandardMaterial({
      vertexColors: true, color: new THREE.Color(p.leaf2).multiplyScalar(1.3), roughness: 0.8,
      side: THREE.DoubleSide, alphaTest: 0.15,
    });
  }

  isFree(x, z, margin = 7) {
    const h = this.shape.height(x, z);
    if (h < 0.4) return false;
    if (this.shape.slope(x, z) > 0.58) return false;
    // Keep the main pier approach and NPC camp readable.
    if (Math.abs(x) < 3.6 && z > 35) return false;
    if (this.exclusions && !this.exclusions(x, z)) return false;
    for (const p of this.keepOut || []) {
      if (Math.hypot(x - p[0], z - p[1]) < margin) return false;
    }
    return true;
  }

  pickPoint(minR = 0.18, maxR = 0.82, tries = 50) {
    for (let i = 0; i < tries; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = (minR + this.rng() * (maxR - minR)) * this.config.radius;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      if (this.isFree(x, z)) return [x, z, this.shape.height(x, z)];
    }
    return null;
  }

  buildPalms() {
    const count = this.config.vegetation.palms;
    if (!count) return;
    this.keepOut = [
      [26, -18], [12, 55], [-16, 46], [0, 70], [0, 55], [22, 57], [9, 54], [0, 100],
      ...Object.values(this.config.npcs || {}),
      ...(this.config.interactables || []).map((i) => i.pos),
    ];
    for (let i = 0; i < count; i++) {
      const p = this.pickPoint(0.32, 0.86, 38);
      if (!p) continue;
      const palm = this.createPalm(p[0], p[1], 5.5 + this.rng() * 4.4, this.rng() * 100);
      this.group.add(palm);
      this.palms.push(palm);
    }
  }

  createPalm(x, z, height, seed) {
    const rng = mulberry32(Math.floor(seed * 997 + x * 13 + z * 7));
    const g = new THREE.Group();
    const bend = (rng() - 0.5) * 0.22;
    const dir = rng() * Math.PI * 2;
    const segs = 26;
    const radial = 9;
    const verts = [];
    const uvs = [];
    const idx = [];
    const rings = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const y = t * height;
      const swayX = Math.sin(t * 1.5 + dir) * bend * t * height * 0.22;
      const swayZ = Math.cos(t * 1.1 + dir) * bend * t * height * 0.15;
      const rad = (0.29 - t * 0.15) * (1 + Math.sin(t * 17) * 0.035) * (i < 3 ? 1.25 : 1);
      rings.push({ x: swayX, y, z: swayZ, rad });
    }
    for (let i = 0; i <= segs; i++) {
      const r = rings[i];
      for (let j = 0; j < radial; j++) {
        const a = (j / radial) * Math.PI * 2;
        verts.push(r.x + Math.cos(a) * r.rad, r.y, r.z + Math.sin(a) * r.rad);
        uvs.push(j / radial, i / segs);
        if (i < segs) {
          const a0 = i * radial + j;
          const a1 = i * radial + ((j + 1) % radial);
          const b0 = (i + 1) * radial + j;
          const b1 = (i + 1) * radial + ((j + 1) % radial);
          idx.push(a0, b0, a1, a1, b0, b1);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const trunk = new THREE.Mesh(geo, this.trunkMat);
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    g.add(trunk);
    const top = rings[rings.length - 1];
    const crown = new THREE.Group();
    crown.position.set(top.x, top.y, top.z);
    g.add(crown);
    const frondCount = 17 + Math.floor(rng() * 5);
    for (let i = 0; i < frondCount; i++) {
      const a = (i / frondCount) * Math.PI * 2 + rng() * 0.24;
      const len = 3.2 + rng() * 2.3;
      const frond = new THREE.Group();
      const mesh = new THREE.Mesh(makeFrond(len, 0.7 + rng() * 0.35, 5 + i), i % 3 === 0 ? this.frondMat2 : this.frondMat);
      mesh.rotation.z = -0.18 + rng() * 0.34;
      mesh.castShadow = true;
      frond.add(mesh);
      const rib = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.024, len * 0.9, 4), this.trunkMat2);
      rib.rotation.z = Math.PI / 2;
      rib.position.x = len * 0.45;
      rib.position.y = -len * 0.1;
      frond.add(rib);
      frond.rotation.y = a;
      frond.rotation.x = -0.24 + rng() * 0.26;
      crown.add(frond);
      this.fronds.push({ group: frond, baseX: frond.rotation.x, phase: rng() * 6 });
    }
    // An inner crown of shorter, upturned fronds fills the silhouette.
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + 0.2;
      const len = 1.7 + rng() * 1.1;
      const mesh = new THREE.Mesh(makeFrond(len, 0.48 + rng() * 0.2, 21 + i), this.frondMat2);
      mesh.rotation.z = 0.45 + rng() * 0.5;
      mesh.castShadow = true;
      const holder = new THREE.Group();
      holder.rotation.y = a;
      holder.rotation.x = -0.28;
      holder.add(mesh);
      crown.add(holder);
    }
    for (let i = 0; i < 4; i++) {
      const nut = new THREE.Mesh(new THREE.SphereGeometry(0.14, 9, 7), this.trunkMat2);
      nut.position.set(Math.cos(i * 1.7) * 0.2, -0.08 - i * 0.08, Math.sin(i * 1.7) * 0.2);
      crown.add(nut);
    }
    this.mergeChildren(crown);
    crown.userData.baseRotation = crown.rotation.z;
    this.fronds.push({ group: crown, baseX: crown.rotation.x, phase: rng() * 6, crown: true });
    g.position.set(x, Math.max(0.1, this.shape.height(x, z)), z);
    g.rotation.y = rng() * Math.PI * 2;
    g.userData.crown = crown;
    return g;
  }

  buildTrees() {
    const count = this.config.vegetation.trees;
    if (!count) return;
    for (let i = 0; i < count; i++) {
      const p = this.pickPoint(0.2, 0.78, 45);
      if (!p) continue;
      const tree = this.createTree(p[0], p[1], 3 + this.rng() * 2.2, this.rng() * 1000);
      this.trees.push(tree);
      this.staticGroup.add(tree);
    }
  }

  createTree(x, z, height, seed) {
    const rng = mulberry32(seed);
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, height, 8), this.trunkMat);
    trunk.position.y = height / 2;
    trunk.castShadow = true;
    g.add(trunk);
    // Arching mangrove roots.
    if (this.config.terrain.profile === 'marsh') {
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + rng();
        const start = new THREE.Vector3(0, height * 0.34, 0);
        const end = new THREE.Vector3(Math.cos(a) * (1.6 + rng() * 1.6), 0.0, Math.sin(a) * (1.6 + rng() * 1.6));
        const mid = new THREE.Vector3(end.x * 0.45, height * 0.22, end.z * 0.45);
        const curve = new THREE.CatmullRomCurve3([start, mid, end]);
        const root = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, 0.055, 5, false), this.trunkMat2);
        root.castShadow = true;
        g.add(root);
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.12, height * 0.55, 6), this.trunkMat2);
      branch.position.set(Math.cos(a) * 0.5, height * 0.72, Math.sin(a) * 0.5);
      branch.rotation.z = Math.cos(a) * 0.55;
      branch.rotation.x = Math.sin(a) * 0.55;
      g.add(branch);
    }
    const canopy = new THREE.Group();
    canopy.position.y = height * 0.9;
    const blobs = 4 + Math.floor(rng() * 4);
    for (let i = 0; i < blobs; i++) {
      const size = 2.2 + rng() * 2.6;
      for (let k = 0; k < 3; k++) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), this.leafMats[Math.floor(rng() * 3)]);
        plane.position.set((rng() - 0.5) * 3.2, (rng() - 0.5) * 1.5, (rng() - 0.5) * 3.2);
        plane.rotation.set(rng() * 2, rng() * 6, rng() * 2);
        plane.castShadow = true;
        canopy.add(plane);
      }
    }
    g.add(canopy);
    g.position.set(x, this.shape.height(x, z), z);
    g.userData.canopy = canopy;
    return g;
  }

  buildShrubs() {
    const count = this.config.vegetation.shrubs;
    if (!count) return;
    for (let i = 0; i < count; i++) {
      const p = this.pickPoint(0.15, 0.88, 28);
      if (!p) continue;
      const g = new THREE.Group();
      const n = 2 + Math.floor(this.rng() * 3);
      for (let k = 0; k < n; k++) {
        const size = 0.8 + this.rng() * 1.3;
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(size, size), this.leafMats[Math.floor(this.rng() * 3)]);
        plane.position.set((this.rng() - 0.5) * 0.8, size * 0.35 + this.rng() * 0.2, (this.rng() - 0.5) * 0.8);
        plane.rotation.set(this.rng() * 0.6, this.rng() * 6, this.rng() * 0.6);
        g.add(plane);
      }
      g.position.set(p[0], Math.max(0.1, p[2]), p[1]);
      g.scale.setScalar(0.8 + this.rng() * 0.45);
      this.staticGroup.add(g);
    }
  }

  buildGrass() {
    const count = this.quality === 'high' ? Math.floor(this.config.vegetation.grass * 0.68) : Math.floor(this.config.vegetation.grass * 0.26);
    if (!count) return;
    const blade = new THREE.BufferGeometry();
    const verts = [];
    const heights = [];
    const colors = [];
    const indices = [];
    const rng = this.rng;
    let vbase = 0;
    // Each instance is a small tuft of five curved blades rather than one stick.
    for (let b = 0; b < 5; b++) {
      const a = rng() * Math.PI * 2;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const px = (rng() - 0.5) * 0.2;
      const pz = (rng() - 0.5) * 0.2;
      const lean = 0.03 + rng() * 0.08;
      const len = 0.14 + rng() * 0.17;
      const rows = [[0, 0.014], [0.5, 0.009], [1, 0.0015]];
      for (let i = 0; i < rows.length; i++) {
        const [t, w] = rows[i];
        const y = t * len;
        const bend = lean * t * t;
        const cx = px + dx * bend;
        const cz = pz + dz * bend;
        const sx = -dz * w;
        const sz = dx * w;
        for (const sgn of [-1, 1]) {
          verts.push(cx + sx * sgn, y, cz + sz * sgn);
          heights.push(t);
          const shade = 0.4 + t * 0.55;
          colors.push(shade * 0.72, shade, shade * 0.65);
        }
        if (i < rows.length - 1) {
          const a0 = vbase + (i % 2) * 2;
          const b0 = vbase + (i % 2) * 2 + 2;
          indices.push(a0, a0 + 1, b0, b0, a0 + 1, b0 + 1);
        }
      }
      vbase += 6;
      // The rows share vertices vertically, so add the second connecting quad.
      // (Indices above already connect row 0->1 and row 1->2 via vbase offsets.)
    }
    // Rebuild correct indexed strips for the six vertices per blade.
    indices.length = 0;
    for (let b = 0; b < 5; b++) {
      const o = b * 6;
      indices.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
      indices.push(o + 2, o + 3, o + 4, o + 4, o + 3, o + 5);
    }
    blade.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    blade.setAttribute('aH', new THREE.Float32BufferAttribute(heights, 1));
    blade.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    blade.setIndex(indices);
    blade.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(this.config.palette.grass).multiplyScalar(0.9),
      roughness: 0.95, side: THREE.DoubleSide, vertexColors: true,
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      this.grassUniform = shader.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aH;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec3 wp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;
          float sway = sin(uTime * 1.4 + wp.x * 0.22 + wp.z * 0.17) * 0.16 + sin(uTime * 2.3 + wp.x * 0.5) * 0.05;
          transformed.x += sway * aH * aH;
          transformed.z += sway * 0.55 * aH * aH;`
        );
    };
    mat.customProgramCacheKey = () => 'grass-wind';
    const mesh = new THREE.InstancedMesh(blade, mat, count);
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 7) {
      attempts++;
      const a = this.rng() * Math.PI * 2;
      const r = (0.15 + this.rng() * 0.77) * this.config.radius;
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      const h = this.shape.height(x, z);
      if (h < 0.65 || this.shape.slope(x, z) > 0.52) continue;
      // Thin around the central path.
      if (Math.abs(x) < 2.5 && z > 30) continue;
      if (this.exclusions && !this.exclusions(x, z)) continue;
      dummy.position.set(x, h, z);
      dummy.rotation.y = this.rng() * Math.PI * 2;
      const s = 0.55 + this.rng() * 1.0;
      dummy.scale.set(s, s * (0.55 + this.rng() * 0.45), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      const v = 0.52 + this.rng() * 0.28;
      color.setRGB(v * 0.86, v, v * 0.68);
      mesh.setColorAt(placed, color);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.grassMesh = mesh;
    this.group.add(mesh);
  }

  buildFlowers() {
    const profile = this.config.terrain.profile;
    if (profile === 'caldera' || profile === 'cliff') return;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.translate(64, 64);
    for (let i = 0; i < 5; i++) {
      ctx.save();
      ctx.rotate((i / 5) * Math.PI * 2);
      const grd = ctx.createRadialGradient(0, -23, 2, 0, -23, 24);
      grd.addColorStop(0, 'rgba(255,255,255,1)');
      grd.addColorStop(1, 'rgba(255,255,255,0.85)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.ellipse(0, -23, 12, 22, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.fillStyle = '#e9be59';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.92, metalness: 0,
      color: '#fff6dd',
    });
    const geoVerts = [];
    const geoUvs = [];
    const geoIdx = [];
    const segs = 3;
    let base = 0;
    for (let s = 0; s < 3; s++) {
      const a = (s / 3) * Math.PI;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const w = 0.16;
      for (let i = 0; i < segs; i++) {
        const t0 = i / segs;
        const t1 = (i + 1) / segs;
        const y0 = t0 * 0.34;
        const y1 = t1 * 0.34;
        geoVerts.push(-w * dx, y0, -w * dz, w * dx, y0, w * dz, -w * dx, y1, -w * dz, w * dx, y1, w * dz);
        geoUvs.push(0, 0, 1, 0, 0, 1, 1, 1);
        geoIdx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        base += 4;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(geoVerts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(geoUvs, 2));
    geo.setIndex(geoIdx);
    geo.computeVertexNormals();
    const count = this.quality === 'high' ? 1400 : 450;
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let placed = 0;
    let tries = 0;
    while (placed < count && tries < count * 8) {
      tries++;
      const p = this.pickPoint(0.16, 0.8, 12);
      if (!p) continue;
      const h = this.shape.height(p[0], p[1]);
      if (h < 1.2 || this.shape.slope(p[0], p[1]) > 0.4) continue;
      dummy.position.set(p[0], h, p[1]);
      dummy.rotation.y = this.rng() * Math.PI * 2;
      const s = 0.55 + this.rng() * 0.9;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      const variant = this.rng();
      if (variant < 0.55) col.set('#fff1d0');
      else if (variant < 0.82) col.set('#f4d77a');
      else col.set('#dca8ac');
      mesh.setColorAt(placed, col);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.group.add(mesh);
    this.flowerMesh = mesh;
  }

  buildFerns() {
    const count = this.quality === 'high' ? 160 : 45;
    for (let i = 0; i < count; i++) {
      const p = this.pickPoint(0.18, 0.82, 20);
      if (!p) continue;
      const h = this.shape.height(p[0], p[1]);
      if (h < 0.9 || this.shape.slope(p[0], p[1]) > 0.55) continue;
      const g = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.15 + this.rng() * 0.8, 0.75 + this.rng() * 0.4), this.leafMats[k % 3]);
        plane.position.set((this.rng() - 0.5) * 0.5, 0.35 + this.rng() * 0.15, (this.rng() - 0.5) * 0.5);
        plane.rotation.set(-0.1 + this.rng() * 0.2, this.rng() * 6, (this.rng() - 0.5) * 0.3);
        plane.castShadow = true;
        g.add(plane);
      }
      g.position.set(p[0], h, p[1]);
      g.scale.setScalar(0.55 + this.rng() * 0.5);
      this.staticGroup.add(g);
    }
  }

  mergeChildren(group) {
    group.updateMatrixWorld(true);
    const inv = group.matrixWorld.clone().invert();
    const buckets = new Map();
    const remove = [];
    group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry || !o.material || Array.isArray(o.material)) return;
      if (!o.geometry.attributes.position || !o.geometry.attributes.normal) return;
      const sig = Object.keys(o.geometry.attributes).sort().join(',') + (o.geometry.index ? ':i' : ':n');
      const key = `${o.material.uuid}|${sig}`;
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [] });
      const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(rel);
      buckets.get(key).geos.push(geo);
      remove.push(o);
    });
    for (const o of remove) {
      o.parent?.remove(o);
      o.geometry?.dispose();
    }
    for (const b of buckets.values()) {
      if (!b.geos.length) continue;
      const merged = mergeGeometries(b.geos, false);
      for (const g of b.geos) g.dispose();
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, b.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
  }

  mergeStaticFoliage() {
    this.mergeChildren(this.staticGroup);
    // Remove empty transform groups left behind by the merge.
    for (const child of [...this.staticGroup.children]) {
      if (child.isMesh) continue;
      this.staticGroup.remove(child);
    }
  }

  buildRocks() {
    const count = this.config.vegetation.rocks;
    if (!count) return;
    for (let i = 0; i < count; i++) {
      const p = this.pickPoint(0.55, 1.02, 40);
      if (!p) continue;
      const h = this.shape.height(p[0], p[1]);
      if (h < 0.05 && this.rng() > 0.25) continue;
      const size = 0.32 + this.rng() * 1.15;
      const geo = new THREE.IcosahedronGeometry(1, this.quality === 'high' ? 4 : 3);
      const pos = geo.attributes.position;
      const n = createNoise2D(mulberry32(i * 333 + 5));
      for (let v = 0; v < pos.count; v++) {
        const x = pos.getX(v);
        const y = pos.getY(v);
        const z = pos.getZ(v);
        const d = 1 + n(x * 1.5 + z, y * 1.5) * 0.18;
        pos.setXYZ(v, x * d, y * d * 0.62, z * d);
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, i % 3 === 0 ? this.rockMatDark : this.rockMat);
      rock.scale.set(size * (0.8 + this.rng() * 0.6), size * (0.5 + this.rng() * 0.35), size * (0.8 + this.rng() * 0.5));
      rock.position.set(p[0], Math.max(-0.15, h) + size * 0.16, p[1]);
      rock.rotation.set(this.rng() * 0.3, this.rng() * 6, this.rng() * 0.3);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.staticGroup.add(rock);
      if (size > 0.8) this.rocks.push({ x: p[0], z: p[1], radius: size * 0.55 });
      if (i % 5 === 0) {
        for (let k = 0; k < 3; k++) {
          const s2 = size * (0.18 + this.rng() * 0.3);
          const r2 = rock.clone();
          r2.scale.setScalar(s2);
          r2.position.set(p[0] + (this.rng() - 0.5) * size * 2.5, Math.max(-0.05, h) + s2 * 0.2, p[1] + (this.rng() - 0.5) * size * 2.5);
          r2.rotation.y = this.rng() * 6;
          this.staticGroup.add(r2);
        }
      }
    }
  }

  buildBirds() {
    if (this.config.weather === 'ash') return;
    this.birds = [];
    const bodyMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.config.weather === 'storm' ? '#303b42' : '#3d3a35') });
    const wingMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(this.config.weather === 'storm' ? '#303b42' : '#4a463f'), side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.5, 3, 6), bodyMat);
      body.rotation.z = Math.PI / 2;
      g.add(body);
      const wingGeo = new THREE.BufferGeometry();
      wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([
        0, 0, 0, 0.7, 0.05, 0.25, 0.45, 0, 0.58,
        0, 0, 0, -0.7, 0.05, 0.25, -0.45, 0, 0.58,
      ], 3));
      wingGeo.computeVertexNormals();
      const wings = new THREE.Mesh(wingGeo, wingMat);
      g.add(wings);
      const s = 1.2 + this.rng() * 0.8;
      g.scale.setScalar(s);
      g.userData = {
        radius: 45 + this.rng() * 55,
        height: 22 + this.rng() * 18,
        angle: this.rng() * Math.PI * 2,
        speed: 0.04 + this.rng() * 0.04,
        phase: this.rng() * 10,
      };
      this.group.add(g);
      this.birds.push(g);
    }
  }

  buildParticles() {
    const v = this.config.vegetation;
    if (v.fireflies) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(v.fireflies * 3);
      const base = [];
      for (let i = 0; i < v.fireflies; i++) {
        const a = this.rng() * Math.PI * 2;
        const r = (0.18 + this.rng() * 0.6) * this.config.radius;
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        const y = Math.max(0.5, this.shape.height(x, z)) + 0.3 + this.rng() * 2.2;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        base.push({ x, y, z, phase: this.rng() * 6 });
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: new THREE.Color('#a8ffd0'), size: 0.1, transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
      });
      this.fireflies = new THREE.Points(geo, mat);
      this.fireflyBase = base;
      this.group.add(this.fireflies);
    }
    if (this.config.weather === 'clear' || this.config.weather === 'mist') {
      const geo = new THREE.BufferGeometry();
      const count = this.quality === 'high' ? 220 : 80;
      const pos = new Float32Array(count * 3);
      const base = [];
      for (let i = 0; i < count; i++) {
        const a = this.rng() * Math.PI * 2;
        const r = (0.2 + this.rng() * 0.7) * this.config.radius;
        const x = Math.sin(a) * r;
        const z = Math.cos(a) * r;
        const y = this.shape.height(x, z) + 0.4 + this.rng() * 4;
        pos[i * 3] = x;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = z;
        base.push({ x, y, z, phase: this.rng() * 8, speed: 0.1 + this.rng() * 0.25 });
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: new THREE.Color(this.config.weather === 'mist' ? '#bfffe0' : '#ffe8b8'),
        size: 0.055, transparent: true, opacity: 0.55, depthWrite: false,
        blending: THREE.AdditiveBlending, sizeAttenuation: true,
      });
      this.motes = new THREE.Points(geo, mat);
      this.moteBase = base;
      this.group.add(this.motes);
    }
    if (v.ash) {
      const geo = new THREE.BufferGeometry();
      const pos = new Float32Array(v.ash * 3);
      const base = [];
      for (let i = 0; i < v.ash; i++) {
        const a = this.rng() * Math.PI * 2;
        const r = this.rng() * 160;
        const y = this.rng() * 55;
        pos[i * 3] = Math.sin(a) * r;
        pos[i * 3 + 1] = y;
        pos[i * 3 + 2] = Math.cos(a) * r;
        base.push({ phase: this.rng() * 6, speed: 0.3 + this.rng() * 0.8 });
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: new THREE.Color('#d49b7d'), size: 0.09, transparent: true, opacity: 0.65,
        depthWrite: false, sizeAttenuation: true,
      });
      this.ash = new THREE.Points(geo, mat);
      this.ashBase = base;
      this.group.add(this.ash);
    }
  }

  buildRain() {
    if (this.config.weather !== 'storm') return;
    const count = this.quality === 'high' ? 900 : 320;
    const pos = new Float32Array(count * 6);
    const seed = [];
    for (let i = 0; i < count; i++) {
      const x = (this.rng() - 0.5) * 70;
      const y = this.rng() * 28;
      const z = (this.rng() - 0.5) * 70;
      const len = 0.35 + this.rng() * 0.7;
      pos[i * 6] = x; pos[i * 6 + 1] = y; pos[i * 6 + 2] = z;
      pos[i * 6 + 3] = x + 0.06; pos[i * 6 + 4] = y - len; pos[i * 6 + 5] = z + 0.04;
      seed.push({ x, z, speed: 16 + this.rng() * 15, len });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color('#b7d1d8'), transparent: true, opacity: 0.24, depthWrite: false });
    this.rain = new THREE.LineSegments(geo, mat);
    this.rain.frustumCulled = false;
    this.rain.userData.seed = seed;
    this.group.add(this.rain);
  }

  update(dt, t, camera) {
    if (this.grassUniform) this.grassUniform.value = t;
    for (const f of this.fronds) {
      f.group.rotation.x = f.baseX + Math.sin(t * 1.2 + f.phase) * 0.035;
      f.group.rotation.z = Math.sin(t * 0.9 + f.phase) * 0.025;
    }
    for (const bird of this.birds || []) {
      const d = bird.userData;
      d.angle += dt * d.speed;
      bird.position.set(Math.sin(d.angle) * d.radius, d.height + Math.sin(t * 0.7 + d.phase) * 2, Math.cos(d.angle) * d.radius);
      bird.rotation.y = -d.angle + Math.PI / 2;
      bird.rotation.z = Math.sin(t * 4 + d.phase) * 0.12;
      bird.children[1].rotation.z = Math.sin(t * 5 + d.phase) * 0.35;
    }
    if (this.rain && camera) {
      const p = this.rain.geometry.attributes.position;
      const seed = this.rain.userData.seed;
      for (let i = 0; i < seed.length; i++) {
        const s = seed[i];
        let y = p.getY(i * 2) - dt * s.speed;
        if (y < 0.2) y = 24 + Math.random() * 5;
        p.setY(i * 2, y);
        p.setY(i * 2 + 1, y - s.len);
      }
      p.needsUpdate = true;
      this.rain.position.x = camera.position.x;
      this.rain.position.z = camera.position.z;
    }
    if (this.motes) {
      const p = this.motes.geometry.attributes.position;
      for (let i = 0; i < this.moteBase.length; i++) {
        const b = this.moteBase[i];
        p.setXYZ(
          i,
          b.x + Math.sin(t * b.speed + b.phase) * 1.8,
          b.y + Math.sin(t * b.speed * 1.4 + b.phase) * 0.6,
          b.z + Math.cos(t * b.speed * 0.8 + b.phase) * 1.8
        );
      }
      p.needsUpdate = true;
      this.motes.material.opacity = 0.35 + Math.sin(t * 0.8) * 0.15;
    }
    if (this.fireflies) {
      const p = this.fireflies.geometry.attributes.position;
      for (let i = 0; i < this.fireflyBase.length; i++) {
        const b = this.fireflyBase[i];
        p.setXYZ(i, b.x + Math.sin(t * 0.7 + b.phase) * 0.5, b.y + Math.sin(t * 1.1 + b.phase) * 0.25, b.z + Math.cos(t * 0.6 + b.phase) * 0.5);
      }
      p.needsUpdate = true;
      this.fireflies.material.opacity = 0.55 + Math.sin(t * 1.7) * 0.25;
    }
    if (this.ash && camera) {
      const p = this.ash.geometry.attributes.position;
      for (let i = 0; i < this.ashBase.length; i++) {
        const b = this.ashBase[i];
        let y = p.getY(i) - dt * b.speed;
        if (y < 0) y = 55;
        p.setY(i, y);
        p.setX(i, p.getX(i) + Math.sin(t * 0.5 + b.phase) * dt * 0.7);
      }
      p.needsUpdate = true;
      this.ash.position.x = camera.position.x * 0.85;
      this.ash.position.z = camera.position.z * 0.85;
    }
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.leafTex.forEach((t) => t.dispose());
    this.scene.remove(this.group);
  }
}
