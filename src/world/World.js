import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createNoise2D } from 'simplex-noise';
import { IslandShape } from './IslandShape.js';
import { Terrain } from './Terrain.js';
import { Ocean } from './Ocean.js';
import { SkySystem } from './Sky.js';
import { PropBuilder } from './Props.js';
import { Vegetation } from './Vegetation.js';
import { createNPC, NPCPortraitRenderer } from './NPCFactory.js';
import { createFishModel, animateFish, disposeFishModel } from '../gameplay/FishFactory.js';
import { NPCS } from '../data/npcs.js';
import { ISLANDS } from '../data/islands.js';
import { mulberry32, clamp, rand } from '../utils/math.js';
import { getObjective } from '../data/chapters.js';

const TRAIL_PATHS = {
  hub: [[3.2, 82], [4.5, 68], [8, 56], [16, 42], [22, 22], [26, -16]],
  mangrove: [[6.5, 92], [3, 78], [-1, 64], [0, 54], [7, 50]],
  atoll: [[2.2, 99], [1, 85], [-2, 72], [1, 60], [5, 53]],
  cliffs: [[3.2, 84], [4, 72], [8, 60], [12, 50], [16, 43]],
  volcano: [[4.2, 99], [2, 84], [-2, 70], [-6, 58], [2, 52]],
};

const ITEM_LOOK = {
  tide_iron: { color: '#b9c1bd', glow: '#d7e1d8', icon: 'ore' },
  glow_algae: { color: '#77e9b9', glow: '#9cffd2', icon: 'plant' },
  dive_part: { color: '#c49b58', glow: '#f0c176', icon: 'gear' },
  driftwood: { color: '#b69b78', glow: '#e2c79f', icon: 'wood' },
  ship_nail: { color: '#a7a39a', glow: '#d7d1c6', icon: 'nail' },
  obsidian: { color: '#3d3338', glow: '#ff744f', icon: 'crystal' },
};

function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
}

let CONTACT_SHADOW_TEXTURE = null;

function makeContactShadow(radius = 0.7, opacity = 0.28) {
  if (!CONTACT_SHADOW_TEXTURE) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,.72)');
    g.addColorStop(0.46, 'rgba(0,0,0,.36)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    CONTACT_SHADOW_TEXTURE = new THREE.CanvasTexture(c);
    CONTACT_SHADOW_TEXTURE.colorSpace = THREE.SRGBColorSpace;
  }
  const mat = new THREE.MeshBasicMaterial({
    map: CONTACT_SHADOW_TEXTURE, transparent: true, opacity, depthWrite: false,
    side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 2;
  return mesh;
}

function makeGlowSprite(color, size = 1.2) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.22, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.75 });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  return s;
}

export class World {
  constructor({ scene, renderer, assets, quality = 'high', state }) {
    this.scene = scene;
    this.renderer = renderer;
    this.assets = assets;
    this.quality = quality;
    this.state = state;
    this.group = new THREE.Group();
    this.group.name = 'world';
    scene.add(this.group);
    this.npcs = new Map();
    this.interactables = [];
    this.markers = [];
    this.allCollectibles = [];
    this.ambientFish = [];
    this.colliders = [];
    this.portraitRenderer = null;
    this.island = null;
    this.dock = null;
    this.spawn = { x: 0, z: 0, yaw: 0, y: 1.6 };
    this.bossPosition = new THREE.Vector3();
    this.waterMarker = new THREE.Vector3();
    this.time = 0;
  }

  async load(islandId, { onProgress } = {}) {
    this.dispose();
    this.group = new THREE.Group();
    this.group.name = 'world';
    this.scene.add(this.group);
    this.island = this.islandById(islandId);
    this.colliders = [];
    this.rng = mulberry32(this.island.seed + 17);
    this.shape = new IslandShape(this.island);
    this.terrain = new Terrain({ shape: this.shape, assets: this.assets, config: this.island, quality: this.quality });
    this.group.add(this.terrain.group);
    onProgress?.('塑造海岸', 0.16);

    this.sky = new SkySystem({ scene: this.scene, config: this.island, assets: this.assets, quality: this.quality });
    await this.sky.load();
    onProgress?.('点亮天光', 0.34);

    this.ocean = new Ocean({ scene: this.scene, config: this.island, terrain: this.terrain, assets: this.assets, quality: this.quality });
    onProgress?.('注入潮水', 0.48);

    this.props = new PropBuilder({ assets: this.assets, config: this.island, shape: this.shape });
    this.group.add(this.props.group);
    onProgress?.('搭起木屋', 0.6);

    this.trailPath2D = TRAIL_PATHS[this.island.id] || TRAIL_PATHS.hub;
    this.buildDock();
    this.buildLayout();
    this.vegetation = new Vegetation({
      scene: this.group, config: this.island, shape: this.shape, assets: this.assets, quality: this.quality,
      exclusions: (x, z) => this.isVegetationClear(x, z),
    });
    this.vegetation.palms.forEach((palm) => {
      this.colliders.push({ x: palm.position.x, z: palm.position.z, radius: 0.34 });
    });
    this.vegetation.trees.forEach((tree) => {
      this.colliders.push({ x: tree.position.x, z: tree.position.z, radius: 0.58 });
    });
    this.vegetation.rocks.forEach((rock) => this.colliders.push(rock));
    onProgress?.('种下棕榈', 0.74);
    this.buildTrailDressing();
    this.buildOutcrops();
    this.buildBeachDetails();
    this.mergeStaticProps();
    this.buildSmoke();
    this.buildBossSite();
    this.buildInteractables();
    this.buildFocusMarker();
    this.buildPlayerShadow();
    this.buildNPCs();
    this.buildAmbientLife();
    this.buildSeaStacks();
    this.refreshCollected();
    this.colliders = [...(this.props.colliders || []), ...this.colliders];

    this.portraitRenderer = new NPCPortraitRenderer({ width: 384, height: 480 });
    onProgress?.('潮声就位', 0.94);

    this.spawn = this.computeSpawn();
    const waterDist = this.dock.shore + this.island.dockLength + 6;
    this.waterMarker.set(Math.sin(this.island.dockAngle) * waterDist, 0.08, Math.cos(this.island.dockAngle) * waterDist);
    this.group.add(this.terrain.createPath(
      this.trailPath2D.map(([x, z]) => ({ x, z })),
      2.9,
    ));
    onProgress?.('归潮', 1);
    return this;
  }

  islandById(id) {
    return ISLANDS[id] || ISLANDS.hub;
  }

  pointNearDock(x, z, pad = 1.2) {
    if (!this.dock) return false;
    const dx = x - this.dock.cx;
    const dz = z - this.dock.cz;
    const c = Math.cos(-this.dock.angle);
    const s = Math.sin(-this.dock.angle);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    return Math.abs(lx) < this.dock.width / 2 + pad && Math.abs(lz) < this.dock.length / 2 + pad;
  }

  distanceToTrail(x, z) {
    const pts = this.trailPath2D || [];
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const vx = bx - ax;
      const vz = bz - az;
      const len2 = vx * vx + vz * vz;
      const t = len2 > 1e-6 ? clamp(((x - ax) * vx + (z - az) * vz) / len2, 0, 1) : 0;
      const px = ax + vx * t;
      const pz = az + vz * t;
      best = Math.min(best, Math.hypot(x - px, z - pz));
    }
    return best;
  }

  isVegetationClear(x, z) {
    if (this.pointNearDock(x, z, 1.4)) return false;
    if (this.distanceToTrail(x, z) < 2.6) return false;
    for (const c of this.props?.colliders || []) {
      if (Math.hypot(x - c.x, z - c.z) < c.radius + 0.75) return false;
    }
    for (const p of Object.values(this.island.npcs || {})) {
      if (Math.hypot(x - p[0], z - p[1]) < 2.2) return false;
    }
    for (const it of this.island.interactables || []) {
      if (Math.hypot(x - it.pos[0], z - it.pos[1]) < 1.4) return false;
    }
    if (this.boatPosition && Math.hypot(x - this.boatPosition.x, z - this.boatPosition.z) < 3.2) return false;
    return true;
  }

  getCinematicView() {
    const angle = (this.island.dockAngle || 0) + 0.72;
    const radius = (this.island.radius || 110) * 1.5;
    return {
      center: new THREE.Vector3(0, 8.5, 0),
      radius,
      height: Math.max(34, radius * 0.34),
      angle,
      speed: 0.026,
    };
  }

  computeSpawn() {
    const a = this.island.dockAngle;
    const dir = new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const end = this.dock.shore + 7.0;
    const x = dir.x * end;
    const z = dir.z * end;
    const firstNpc = Object.values(this.island.npcs || {})[0];
    let yaw = a;
    if (firstNpc) {
      yaw = Math.atan2(-(firstNpc[0] - x), -(firstNpc[1] - z));
    }
    return { x, z, y: 1.58, yaw };
  }

  buildDock() {
    const cfg = this.island;
    const shore = this.shape.findOuterShore(cfg.dockAngle, 0.4);
    const dirX = Math.sin(cfg.dockAngle);
    const dirZ = Math.cos(cfg.dockAngle);
    const length = cfg.dockLength;
    const dock = this.props.buildPier(length, 3.6);
    dock.rotation.y = cfg.dockAngle;
    dock.position.set(dirX * (shore.distance + length / 2 - 1.1), 0, dirZ * (shore.distance + length / 2 - 1.1));
    this.props.group.add(dock);
    this.dock = {
      group: dock,
      angle: cfg.dockAngle,
      shore: shore.distance,
      length,
      width: 3.6,
      cx: dock.position.x,
      cz: dock.position.z,
      deckY: 0.98,
    };
    this.shore = shore;
    // Fishing boat at the end of the pier.
    const boat = this.props.buildBoat(cfg.id === 'hub' ? '归潮号' : cfg.id === 'mangrove' ? '雾舟' : cfg.id === 'atoll' ? '琥珀号' : cfg.id === 'cliffs' ? '断帆号' : '烬潮号');
    boat.position.set(
      dirX * (shore.distance + length + 5.2) + Math.cos(cfg.dockAngle) * 3.0,
      0.2,
      dirZ * (shore.distance + length + 5.2) - Math.sin(cfg.dockAngle) * 3.0
    );
    boat.rotation.y = cfg.dockAngle + Math.PI * 0.42;
    this.props.group.add(boat);
    this.boat = boat;
    this.boatPosition = new THREE.Vector3(boat.position.x, 1.0, boat.position.z);
  }

  buildLayout() {
    const id = this.island.id;
    const p = this.props;
    const put = (obj, x, z, opts = {}) => {
      const r = p.place(obj, x, z, opts);
      return r;
    };
    // Shared camp dressing.
    const camp = id === 'hub' ? [0, 60] : id === 'mangrove' ? [-4, 49] : id === 'atoll' ? [5, 53] : id === 'cliffs' ? [4, 55] : [3, 55];
    put(p.buildCampfire(), camp[0], camp[1]);
    put(p.buildNetFrame(), camp[0] + 6, camp[1] + 2, { rot: -0.55 });
    put(p.buildCrates(), camp[0] - 5, camp[1] - 1, { rot: 0.2 });
    put(p.buildBarrel(camp[0] + 3.3, camp[1] - 2.2), camp[0] + 3.3, camp[1] - 2.2);
    put(p.buildBuoys(), camp[0] + 1.2, camp[1] + 4.2, { rot: 0.4 });
    p.addCollider(camp[0], camp[1], 1.05);
    p.addCollider(camp[0] + 6, camp[1] + 2, 1.4);
    p.addCollider(camp[0] - 5, camp[1] - 1, 1.05);
    p.addCollider(camp[0] + 3.3, camp[1] - 2.2, 0.5);

    if (id === 'hub') {
      const lighthouse = p.buildLighthouse();
      put(lighthouse, 26, -18, { name: 'lighthouse' });
      this.lighthouse = lighthouse;
      if (this.state?.data?.flags?.lamp_lit) p.buildLighthouseLit();
      const cabin = p.buildCabin();
      put(cabin, -16, 46, { rot: 0.06, name: 'cabin' });
      const shop = p.buildShop();
      put(shop, 12, 55, { rot: -0.1, name: 'shop' });
      put(p.buildSign('归 潮 岛 · GUI CHAO'), 4.5, 65, { rot: 0.12 });

      // Clothesline with faded cloth.
      const lineY = 2.3;
      const lineA = new THREE.Vector3(-7, lineY, 56);
      const lineB = new THREE.Vector3(-2.5, lineY, 55);
      const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, lineA.distanceTo(lineB), 4), p.materials.rope);
      line.position.copy(lineA).add(lineB).multiplyScalar(0.5);
      line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().subVectors(lineB, lineA).normalize());
      this.props.group.add(line);
      for (const [x, z] of [[-7, 56], [-2.5, 55]]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 2.3, 6), p.materials.woodDark);
        post.position.set(x, 1.15, z);
        this.props.group.add(post);
      }
      this.props.addCollider(-16, 46, 5.2);
      this.props.addCollider(12, 55, 3.8);
      this.props.addCollider(26, -18, 3.6);
    } else if (id === 'mangrove') {
      const hut = p.buildStiltHut();
      put(hut, 11, 57, { rot: 0.1, name: 'stiltHut' });
      put(p.buildTotem(), -27, 8);
      put(p.buildCanoe(), -38, 31, { rot: 1.8 });
      put(p.buildSign('雾 苇 泽'), 1.4, 57, { rot: 0.1 });
      this.props.addCollider(-38, 31, 2.2);
      // Slate-black monolith near Lao Tao.
      const stone = new THREE.Group();
      const slab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3.4, 0.5), p.materials.rockDark);
      slab.position.y = 1.7;
      slab.rotation.z = 0.08;
      stone.add(slab);
      const runeMat = new THREE.MeshBasicMaterial({ color: '#8fffd1', transparent: true, opacity: 0.8 });
      for (let i = 0; i < 5; i++) {
        const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.42), runeMat);
        rune.position.set(-0.32 + (i % 3) * 0.32, 1.3 + Math.floor(i / 3) * 0.55, 0.26);
        stone.add(rune);
      }
      put(stone, -27, 2, { rot: -0.1, name: 'monolith' });
      this.props.lamp(-27, 2.2, 2, 1.1, 7);
      this.props.addCollider(11, 57, 3.5);
      this.props.addCollider(-27, 2, 2.2);
    } else if (id === 'atoll') {
      const wreck = p.buildWreck();
      put(wreck, 27, 60, { rot: 0.5, name: 'wreck' });
      put(p.buildHammock(), -5, 59, { rot: -0.2 });
      put(p.buildDiveGear(), 15, 51, { rot: 0.6 });
      this.props.addCollider(-5, 59, 1.5);
      this.props.addCollider(15, 51, 0.8);
      put(p.buildLookout(), 34, 47, { rot: -0.2 });
      const shop = p.buildShop();
      shop.scale.setScalar(0.82);
      put(shop, -13, 53, { rot: 0.08, name: 'shop' });
      put(p.buildSign('琥 珀 环 礁'), 2.2, 63, { rot: 0.1 });
      this.props.addCollider(27, 60, 4.2);
      this.props.addCollider(-13, 53, 3.2);
    } else if (id === 'cliffs') {
      const yard = p.buildBoatyard();
      put(yard, 22, 61, { rot: -0.2, name: 'boatyard' });
      const wreck = p.buildWreck();
      put(wreck, -34, 34, { rot: 1.2 });
      put(p.buildFlag(), 8, 66);
      put(p.buildCrates(), -18, 40);
      put(p.buildSign('断 帆 崖 · 外海'), 3.0, 64, { rot: 0.1 });
      // Research tent.
      const tent = new THREE.Mesh(new THREE.ConeGeometry(2.2, 2.0, 4), new THREE.MeshStandardMaterial({ color: '#5f7068', roughness: 0.94 }));
      tent.rotation.y = Math.PI / 4;
      tent.position.set(-23, 1.0, 36);
      this.props.group.add(tent);
      this.props.lamp(-22, 1.8, 35, 1.0, 8);
      this.props.addCollider(22, 61, 4.4);
      this.props.addCollider(-23, 36, 2.6);
    } else if (id === 'volcano') {
      const camp = p.buildFieldCamp();
      put(camp, 22, -23, { rot: 0.2, name: 'fieldCamp' });
      put(p.buildBeacon(), 5, 53);
      put(p.buildCrates(), 9, 57);
      put(p.buildSign('烬 潮 岛 · 禁 区'), 2.4, 61, { rot: 0.1 });
      put(p.buildLavaFlow(-31, 24, 12), -31, 24, { y: 0.05 });
      put(p.buildLavaFlow(18, -38, 14), 18, -38, { y: 0.05 });
      put(p.buildLavaFlow(34, -8, 10), 34, -8, { y: 0.05 });
      put(p.buildAshVent(-32, 28), -32, 28);
      put(p.buildAshVent(36, 18), 36, 18);
      this.props.addCollider(22, -23, 4.2);
      this.props.addCollider(-31, 24, 7.2);
      this.props.addCollider(18, -38, 8.2);
      this.props.addCollider(34, -8, 6.2);
      this.props.addCollider(-32, 28, 1.7);
      this.props.addCollider(36, 18, 1.7);
    }
  }

  buildTrailDressing() {
    const id = this.island.id;
    const paths = this.trailPath2D || [];
    if (!paths.length) return;
    const curve = new THREE.CatmullRomCurve3(paths.map(([x, z]) => new THREE.Vector3(x, this.shape.height(x, z) + 0.1, z)));
    const len = curve.getLength();
    const steps = Math.max(6, Math.floor(len / 3.2));
    const postMat = this.props.materials.woodDark;
    const railMat = this.props.materials.woodPale;
    for (let side of [-1, 1]) {
      let prev = null;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const p = curve.getPoint(t);
        const tangent = curve.getTangent(t).setY(0).normalize();
        const sideV = new THREE.Vector3(-tangent.z, 0, tangent.x);
        const q = p.clone().addScaledVector(sideV, side * 2.15);
        const h = this.shape.height(q.x, q.z);
        if (h < 0.35) { prev = null; continue; }
        const blocked = this.props.colliders.some((c) => Math.hypot(q.x - c.x, q.z - c.z) < c.radius + 0.5);
        if (blocked) { prev = null; continue; }
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.08, 1.05, 6), postMat);
        post.position.set(q.x, h + 0.5, q.z);
        post.rotation.y = Math.atan2(tangent.x, tangent.z);
        this.props.group.add(post);
        if (prev) {
          for (const yy of [0.42, 0.92]) {
            const a = new THREE.Vector3(prev.x, prev.h + yy, prev.z);
            const b = new THREE.Vector3(q.x, h + yy, q.z);
            const dir = new THREE.Vector3().subVectors(b, a);
            const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, dir.length(), 5), railMat);
            rail.position.copy(a).addScaledVector(dir, 0.5);
            rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
            this.props.group.add(rail);
          }
        }
        prev = { x: q.x, z: q.z, h };
        if (i === Math.floor(steps * 0.28) || i === Math.floor(steps * 0.68)) {
          const lamp = new THREE.Group();
          lamp.add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.02, 0.16, 6), this.props.materials.iron));
          const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.32, 8, 1, true), this.props.materials.lanternGlass);
          glass.position.y = -0.2;
          lamp.add(glass);
          const cap = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.12, 8), this.props.materials.iron);
          cap.position.y = -0.4;
          lamp.add(cap);
          lamp.position.set(q.x, h + 1.22, q.z);
          this.props.group.add(lamp);
          this.props.lamp(q.x, h + 1.1, q.z, 0.9, 8);
        }
      }
    }
    // Stone slabs at the steep lighthouse approach.
    if (id === 'hub') {
      for (let i = 0; i < 16; i++) {
        const t = i / 15;
        const x = 18 + t * 8;
        const z = 20 - t * 33;
        const h = this.shape.height(x, z);
        if (h < 0.4) continue;
        const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.74), this.props.materials.rock);
        slab.position.set(x, h + 0.06, z);
        slab.rotation.y = 0.15;
        slab.rotation.z = 0.02;
        slab.castShadow = true;
        slab.receiveShadow = true;
        this.props.group.add(slab);
      }
    }
  }

  buildOutcrops() {
    const id = this.island.id;
    const spots = id === 'hub' ? [[-49, 24, 6.2], [45, -24, 4.8], [-8, -44, 7], [55, 16, 3.8], [-36, -8, 4.2]] :
      id === 'cliffs' ? [[-36, 25, 8], [24, -38, 7], [43, 21, 5], [-44, -20, 6]] :
        id === 'volcano' ? [[-32, 22, 7], [29, 31, 6], [-24, -31, 5.5]] :
          id === 'atoll' ? [[-44, 20, 2.2], [46, 22, 2.6]] : [];
    if (!spots.length) return;
    const noise = createNoise2D(mulberry32(this.island.seed + 63));
    for (const [x, z, scale] of spots) {
      const g = new THREE.Group();
      for (let i = 0; i < 4; i++) {
        const geo = new THREE.IcosahedronGeometry(1, 3);
        const pos = geo.attributes.position;
        for (let v = 0; v < pos.count; v++) {
          const vx = pos.getX(v);
          const vy = pos.getY(v);
          const vz = pos.getZ(v);
          const n = 1 + noise(vx * 1.6 + i, vy * 1.6 + vz) * 0.22;
          pos.setXYZ(v, vx * n, vy * n, vz * n);
        }
        geo.computeVertexNormals();
        const mat = i % 2 ? this.props.materials.rock : this.props.materials.rockDark;
        const rock = new THREE.Mesh(geo, mat);
        const s = scale * (0.45 + this.rng() * 0.5);
        rock.scale.set(s * (0.7 + this.rng() * 0.5), s * (0.6 + this.rng() * 0.5), s * (0.7 + this.rng() * 0.5));
        rock.position.set((this.rng() - 0.5) * scale * 1.1, s * 0.38 - scale * 0.2, (this.rng() - 0.5) * scale * 1.1);
        rock.rotation.set(this.rng() * 0.3, this.rng() * 6, this.rng() * 0.25);
        rock.castShadow = true;
        rock.receiveShadow = true;
        g.add(rock);
      }
      const h = this.shape.height(x, z);
      const y = h < 0 ? -1 : h;
      g.position.set(x, y, z);
      this.props.group.add(g);
    }
  }

  buildBeachDetails() {
    const R = this.island.radius;
    for (let i = 0; i < 34; i++) {
      const a = this.rng() * Math.PI * 2;
      const shore = this.shape.findOuterShore(a, 0.25);
      const d = shore.distance - 1.5 - this.rng() * 5;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const h = this.shape.height(x, z);
      if (h < -0.2 || h > 2.2) continue;
      const s = 0.08 + this.rng() * 0.32;
      const pebble = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), this.props.materials.rock);
      pebble.scale.y = 0.45 + this.rng() * 0.3;
      pebble.position.set(x, h + s * 0.25, z);
      pebble.rotation.set(this.rng() * 2, this.rng() * 6, this.rng() * 2);
      pebble.castShadow = true;
      this.props.group.add(pebble);
    }
    const logs = this.island.id === 'hub' || this.island.id === 'mangrove' || this.island.id === 'cliffs' ? 6 : 3;
    for (let i = 0; i < logs; i++) {
      const a = this.rng() * Math.PI * 2;
      const shore = this.shape.findOuterShore(a, 0.4);
      const d = shore.distance - 2 - this.rng() * 6;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const h = this.shape.height(x, z);
      if (h < 0.2 || h > 2.6) continue;
      const len = 1.4 + this.rng() * 2.6;
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.12 + this.rng() * 0.1, 0.16 + this.rng() * 0.12, len, 8), this.props.materials.woodDark);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = this.rng() * Math.PI;
      log.position.set(x, h + 0.16, z);
      log.castShadow = true;
      log.receiveShadow = true;
      this.props.group.add(log);
      for (let k = 0; k < 3; k++) {
        const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.5 + this.rng() * 0.5, 5), this.props.materials.woodDark);
        branch.position.set(x + (this.rng() - 0.5) * len * 0.7, h + 0.28, z + (this.rng() - 0.5) * 0.4);
        branch.rotation.set(this.rng() * 1.2, this.rng() * 6, this.rng() * 1.2);
        this.props.group.add(branch);
      }
    }
    // Short coastal reeds.
    for (let i = 0; i < 22; i++) {
      const a = this.rng() * Math.PI * 2;
      const shore = this.shape.findOuterShore(a, 0.4);
      const d = shore.distance + 1 + this.rng() * 4;
      const x = Math.sin(a) * d;
      const z = Math.cos(a) * d;
      const h = this.shape.height(x, z);
      if (h < -0.4 || h > 1.2) continue;
      const g = new THREE.Group();
      for (let k = 0; k < 5; k++) {
        const reed = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.7 + this.rng() * 0.8), this.props.materials.leaf);
        reed.position.set((this.rng() - 0.5) * 0.4, 0.35, (this.rng() - 0.5) * 0.4);
        reed.rotation.y = this.rng() * 6;
        reed.rotation.z = (this.rng() - 0.5) * 0.2;
        g.add(reed);
      }
      g.position.set(x, h, z);
      this.props.group.add(g);
    }
  }

  mergeStaticProps() {
    const root = this.props.group;
    const buckets = new Map();
    const remove = [];
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSprite || !o.geometry) return;
      let p = o;
      while (p && p !== root) {
        if (p.userData?.noMerge) return;
        p = p.parent;
      }
      const mat = o.material;
      if (!mat || Array.isArray(mat) || mat.transparent) return;
      if (!o.geometry.attributes.position || !o.geometry.attributes.normal || !o.geometry.attributes.uv) return;
      const sig = Object.keys(o.geometry.attributes).sort().join(',') + (o.geometry.index ? ':i' : ':n');
      const key = `${mat.uuid}|${sig}`;
      if (!buckets.has(key)) buckets.set(key, { mat, geos: [], cast: false, receive: false });
      const bucket = buckets.get(key);
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      bucket.geos.push(geo);
      bucket.cast = bucket.cast || o.castShadow;
      bucket.receive = bucket.receive || o.receiveShadow;
      remove.push(o);
    });
    for (const o of remove) {
      o.parent?.remove(o);
      o.geometry?.dispose();
    }
    for (const bucket of buckets.values()) {
      if (!bucket.geos.length) continue;
      const merged = mergeGeometries(bucket.geos, false);
      for (const g of bucket.geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, bucket.mat);
      mesh.castShadow = bucket.cast;
      mesh.receiveShadow = bucket.receive;
      root.add(mesh);
    }
    // Remove empty groups but keep groups that carry lights or animated children.
    for (const child of [...root.children]) {
      if (child.isMesh) continue;
      if (child.isLight || child.isSprite) continue;
      if (child.userData?.noMerge) continue;
      if (!child.children.length) root.remove(child);
    }
  }

  buildSmoke() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(220,215,200,0.45)');
    grad.addColorStop(0.5, 'rgba(190,185,170,0.16)');
    grad.addColorStop(1, 'rgba(180,180,170,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55 });
    this.smoke = [];
    const emits = this.island.id === 'hub' ? [[-17.8, 46, 5.8, 18], [0, 60, 1.1, 10]] :
      this.island.id === 'mangrove' ? [[-4, 49, 1.1, 9]] :
        this.island.id === 'cliffs' ? [[4, 55, 1.1, 8], [-23, 36, 1.2, 8]] :
          this.island.id === 'volcano' ? [[-15, 4, 1.4, 12], [36, 18, 1.8, 8]] : [];
    for (const [x, z, y, count] of emits) {
      for (let i = 0; i < count; i++) {
        const s = new THREE.Sprite(mat.clone());
        const base = 0.6 + Math.random() * 1.3;
        s.scale.setScalar(base);
        s.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 4, z + (Math.random() - 0.5) * 0.6);
        s.userData = { phase: Math.random() * 10, speed: 0.2 + Math.random() * 0.2, base, x, z, y };
        this.group.add(s);
        this.smoke.push(s);
      }
    }
  }

  buildBossSite() {
    const cfg = this.island.boss;
    let x;
    let z;
    if (cfg.custom) {
      [x, z] = cfg.custom;
    } else {
      const shore = this.shape.findShore(cfg.angle, 0.25);
      x = Math.sin(cfg.angle) * (shore.distance + cfg.distance);
      z = Math.cos(cfg.angle) * (shore.distance + cfg.distance);
    }
    this.bossPosition.set(x, 0.1, z);
    const g = new THREE.Group();
    g.position.set(x, 0.03, z);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(cfg.species === 'abyss_whale' ? '#ff734c' : '#d7c28c'),
      transparent: true,
      opacity: 0.32,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.4, 5.2, 64), ringMat);
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    const ring2 = new THREE.Mesh(new THREE.RingGeometry(6.6, 6.85, 64), ringMat.clone());
    ring2.material.opacity = 0.15;
    ring2.rotation.x = -Math.PI / 2;
    g.add(ring2);
    // Dark reef / sunken ruin silhouettes, kept behind the encounter.
    const stoneMat = this.props.materials.rockDark;
    const n = cfg.species === 'abyss_whale' ? 6 : 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.7;
      const r = 16 + this.rng() * 9;
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2 + this.rng() * 2.0, 2), stoneMat);
      rock.position.set(Math.cos(a) * r, -1.8 + this.rng() * 0.5, Math.sin(a) * r);
      rock.scale.y = 0.45 + this.rng() * 0.5;
      rock.rotation.set(this.rng() * 2, this.rng() * 6, this.rng() * 2);
      g.add(rock);
    }
    if (cfg.species === 'puffer_king') {
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.2, 2.0, 16, 1, true), this.props.materials.copper);
      bell.position.set(0, 0.6, 0);
      bell.rotation.z = 0.3;
      g.add(bell);
    }
    this.group.add(g);
    this.bossSite = g;
    this.bossRing = ring;
    this.bossRing2 = ring2;
    this.bossSpecies = cfg.species;
    this.bossCfg = cfg;
  }

  buildInteractables() {
    const add = (data) => {
      this.interactables.push(data);
      return data;
    };
    // NPCs.
    for (const [npcId, pos] of Object.entries(this.island.npcs)) {
      add({
        id: npcId, type: 'npc', npc: npcId,
        pos: new THREE.Vector3(pos[0], this.shape.height(pos[0], pos[1]), pos[1]),
        radius: 3.2, label: NPCS[npcId]?.name || npcId,
      });
    }
    if (this.island.npcs.alan) {
      const shopSpot = this.island.id === 'atoll' ? [-13, 53] : [12, 55];
      add({
        id: 'shop', type: 'shop',
        pos: new THREE.Vector3(shopSpot[0], this.shape.height(shopSpot[0], shopSpot[1]), shopSpot[1]),
        radius: 4.2, label: '潮汐杂货铺',
      });
    }
    add({
      id: 'boat', type: 'boat', pos: this.boatPosition.clone(),
      radius: 6.5, label: '启航',
    });
    add({
      id: this.island.boss.id, type: 'boss', species: this.island.boss.species,
      pos: this.bossPosition.clone(), radius: this.island.boss.species === 'abyss_whale' ? 46 : 26,
      label: this.island.boss.label,
    });
    for (const item of this.island.interactables) {
      const y = item.type === 'collect' ? this.shape.height(item.pos[0], item.pos[1]) : this.shape.height(item.pos[0], item.pos[1]);
      add({
        ...item,
        pos: new THREE.Vector3(item.pos[0], y, item.pos[1]),
        radius: item.radius || (item.type === 'collect' ? 2.6 : 3.6),
      });
      if (item.type === 'collect') {
        this.createCollectible(item);
      } else {
        this.createFixedInteract(item);
      }
    }
  }

  createCollectible(item) {
    const look = ITEM_LOOK[item.item] || ITEM_LOOK.tide_iron;
    const g = new THREE.Group();
    const y = this.shape.height(item.pos[0], item.pos[1]);
    g.position.set(item.pos[0], y + 0.4, item.pos[1]);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(look.color), roughness: 0.42, metalness: item.item === 'driftwood' ? 0 : 0.35,
      emissive: new THREE.Color(look.glow), emissiveIntensity: 0.16,
    });
    if (item.item === 'tide_iron') {
      for (let i = 0; i < 3; i++) {
        const chunk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + i * 0.06, 0), mat);
        chunk.position.set((i - 1) * 0.22, i * 0.07, (i % 2) * 0.12);
        chunk.rotation.set(rand(0, 2), rand(0, 2), rand(0, 2));
        g.add(chunk);
      }
    } else if (item.item === 'glow_algae') {
      for (let i = 0; i < 6; i++) {
        const frond = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.8, 1, 3), new THREE.MeshStandardMaterial({
          color: '#5fd9a8', emissive: '#62ffc1', emissiveIntensity: 0.9, side: THREE.DoubleSide, transparent: true, opacity: 0.85,
        }));
        frond.position.set(rand(-0.2, 0.2), 0.4, rand(-0.2, 0.2));
        frond.rotation.set(rand(-0.3, 0.3), rand(0, 3), rand(-0.3, 0.3));
        g.add(frond);
      }
      g.add(makeGlowSprite('#5fffc0', 2.0));
    } else if (item.item === 'dive_part') {
      g.add(new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 8, 20), mat));
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 14), mat));
      g.children[0].rotation.x = Math.PI / 2;
    } else if (item.item === 'driftwood') {
      for (let i = 0; i < 3; i++) {
        const log = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 1.1, 8), mat);
        log.rotation.z = Math.PI / 2;
        log.rotation.y = i * 0.3;
        log.position.set(i * 0.1, 0.15 + i * 0.1, i * 0.14);
        g.add(log);
      }
    } else if (item.item === 'ship_nail') {
      for (let i = 0; i < 4; i++) {
        const nail = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.045, 0.45, 6), mat);
        nail.rotation.set(rand(-1, 1), rand(0, 3), rand(-1, 1));
        nail.position.set(rand(-0.2, 0.2), 0.2, rand(-0.2, 0.2));
        g.add(nail);
      }
    } else if (item.item === 'obsidian') {
      for (let i = 0; i < 4; i++) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.7 + i * 0.1, 5), mat);
        shard.position.set((i - 1.5) * 0.2, 0.35, (i % 2) * 0.18);
        shard.rotation.z = (i - 1.5) * 0.15;
        g.add(shard);
      }
      g.add(makeGlowSprite('#ff6236', 1.6));
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.8, 32), new THREE.MeshBasicMaterial({
      color: new THREE.Color(look.glow), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.2;
    g.add(ring);
    g.userData = { item, ring, baseY: g.position.y, look };
    this.group.add(g);
    this.allCollectibles.push(g);
    item.instance = g;
  }

  createFixedInteract(item) {
    if (item.id === 'logbook') {
      // The cabin already carries a book prop; this is the pickable marker table.
      const glow = makeGlowSprite('#ffd69a', 1.2);
      glow.position.set(item.pos[0] + 1.3, this.shape.height(item.pos[0], item.pos[1]) + 1.3, item.pos[1] + 1.3);
      glow.visible = false;
      this.group.add(glow);
      item.marker = glow;
    } else if (item.id === 'lamp') {
      item.marker = null;
    } else if (item.id === 'resonance') {
      // Monolith is already in the layout; add a subtle resonance glow.
      const glow = makeGlowSprite('#8fffd1', 3.2);
      glow.position.set(item.pos[0], this.shape.height(item.pos[0], item.pos[1]) + 2.4, item.pos[1]);
      this.group.add(glow);
      item.marker = glow;
    } else if (item.id === 'dive_log') {
      const g = new THREE.Group();
      const y = this.shape.height(item.pos[0], item.pos[1]);
      g.position.set(item.pos[0], y, item.pos[1]);
      const bell = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 2.1, 2.3, 18, 1, true), this.props.materials.copper);
      bell.position.y = 1.15;
      bell.rotation.z = 0.22;
      g.add(bell);
      const dome = new THREE.Mesh(new THREE.SphereGeometry(1.25, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), this.props.materials.copper);
      dome.position.y = 2.3;
      dome.rotation.z = 0.22;
      g.add(dome);
      const bellRing = new THREE.Mesh(new THREE.TorusGeometry(1.28, 0.06, 6, 28), this.props.materials.brass);
      bellRing.rotation.x = Math.PI / 2;
      g.add(bellRing);
      this.group.add(g);
      this.props.addCollider(item.pos[0], item.pos[1], 2.6);
      item.marker = null;
    } else if (item.id === 'recorder') {
      const g = new THREE.Group();
      const y = this.shape.height(item.pos[0], item.pos[1]);
      g.position.set(item.pos[0], y + 0.25, item.pos[1]);
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.55, 0.55), this.props.materials.metal);
      g.add(body);
      const grille = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), new THREE.MeshStandardMaterial({ color: '#181b1b', roughness: 0.8 }));
      grille.position.set(0, 0, 0.281);
      g.add(grille);
      this.group.add(g);
      item.marker = null;
    } else if (item.id === 'tideheart') {
      const glow = makeGlowSprite('#ff6e41', 14);
      glow.position.set(item.pos[0], 3, item.pos[1]);
      this.group.add(glow);
      const ring = new THREE.Mesh(new THREE.RingGeometry(5, 5.3, 64), new THREE.MeshBasicMaterial({
        color: '#ff855a', transparent: true, opacity: 0.4, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(item.pos[0], 0.12, item.pos[1]);
      this.group.add(ring);
      item.marker = glow;
    }
  }

  buildFocusMarker() {
    const g = new THREE.Group();
    g.name = 'focus-marker';
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.54, 0.6, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color('#d9c08c'), transparent: true, opacity: 0.22,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.04;
    g.add(ring);
    const glow = makeGlowSprite('#ffdca4', 1.25);
    glow.position.y = 1.25;
    glow.material.opacity = 0.2;
    g.add(glow);
    const light = new THREE.PointLight(new THREE.Color('#ffd49a'), 0.3, 2.8, 2);
    light.position.y = 1.1;
    g.add(light);
    g.visible = false;
    this.group.add(g);
    this.focusMarker = { group: g, ring, glow, light, target: null, pulse: 0 };
  }

  buildPlayerShadow() {
    const shadow = makeContactShadow(0.48, 0.28);
    shadow.name = 'player-contact-shadow';
    this.group.add(shadow);
    this.playerShadow = shadow;
  }

  isObjectiveTarget(target, objective) {
    if (!target || !objective) return false;
    if (objective.type === 'collect') return target.type === 'collect' && target.item === objective.item;
    if (['talk', 'interact', 'travel', 'boss', 'shop'].includes(objective.type)) return target.id === objective.target;
    return false;
  }

  setFocusTarget(target, objective = null) {
    if (!this.focusMarker) return;
    const f = this.focusMarker;
    if (target && (target.consumed || target.instance?.visible === false)) target = null;
    if (this.isObjectiveTarget(target, objective)) target = null;
    if (f.target === target) return;
    f.target = target;
    f.group.visible = !!target;
    if (!target) return;
    const type = target.type || 'interact';
    const scale = type === 'boss' ? 3.4 : type === 'shop' ? 1.3 : type === 'boat' ? 1.1 : type === 'npc' ? 0.62 : type === 'collect' ? 0.7 : 0.8;
    f.ringBase = scale;
    f.ring.scale.setScalar(scale);
    f.glow.position.y = type === 'npc' ? 1.75 : type === 'shop' ? 2.35 : type === 'boss' ? 3.4 : type === 'boat' ? 1.7 : 1.05;
    f.glow.scale.setScalar(type === 'npc' ? 0.85 : 1.0);
    f.light.position.y = Math.max(0.9, f.glow.position.y * 0.85);
    f.group.position.set(target.pos.x, target.pos.y + 0.01, target.pos.z);
    f.pulse = Math.random() * 6;
  }

  buildNPCs() {
    for (const [id, pos] of Object.entries(this.island.npcs)) {
      const def = NPCS[id];
      if (!def) continue;
      const g = createNPC(def);
      let [x, z] = pos;
      let h = this.shape.height(x, z);
      if (h < 0.7) {
        const safe = this.shape.findLandPoint(x, z, 1);
        x = safe.x;
        z = safe.z;
        h = Math.max(0.7, safe.h);
      }
      g.position.set(x, h, z);
      g.rotation.y = Math.atan2(this.spawn.x - x, this.spawn.z - z);
      const shadow = makeContactShadow(0.58, 0.3);
      shadow.position.y = 0.025;
      g.add(shadow);
      this.group.add(g);
      this.npcs.set(id, { group: g, def, baseY: h, phase: Math.random() * 6 });
      this.props.addCollider(x, z, 0.9);
      // Update the matching interactable's resolved position.
      const it = this.interactables.find((i) => i.id === id);
      if (it) it.pos.set(x, h, z);
    }
  }

  buildAmbientLife() {
    // A few small fish shadows near the dock and in the shallows.
    const chapter = this.island.chapter;
    const fishIds = chapter === 1 ? ['silver_bream', 'sand_sardine', 'golden_thread'] :
      chapter === 2 ? ['mud_catfish', 'glow_killifish', 'needle_gar'] :
        chapter === 3 ? ['parrotfish', 'coral_trout', 'moorish_idol'] :
          chapter === 4 ? ['storm_mackerel', 'flying_fish'] : ['magma_eel', 'obsidian_snapper'];
    for (let i = 0; i < 4; i++) {
      const def = this.fishById(fishIds[i % fishIds.length]);
      if (!def) continue;
      const m = createFishModel(def, { scale: 0.75, quality: this.quality === 'low' ? 'low' : 'high' });
      m.visible = false;
      m.userData.ambient = true;
      m.userData.phase = Math.random() * 10;
      m.userData.center = new THREE.Vector3(
        (this.rng() - 0.5) * 30,
        -0.8 - this.rng() * 1.5,
        this.dock.shore - 4 + (this.rng() - 0.5) * 22
      );
      m.userData.radius = 3 + this.rng() * 7;
      m.userData.speed = 0.12 + this.rng() * 0.12;
      this.group.add(m);
      this.ambientFish.push(m);
    }
  }

  fishById(id) {
    const all = this.fishData || {};
    return all[id];
  }

  setFishData(data) {
    this.fishData = data;
  }

  buildSeaStacks() {
    const id = this.island.id;
    if (!['hub', 'cliffs', 'volcano', 'atoll'].includes(id)) return;
    const zones = id === 'hub' ? [[-118, 42, 6.5], [112, 55, 4.5], [-105, -58, 5.5]] :
      id === 'cliffs' ? [[-72, 46, 8], [79, 41, 10], [56, -65, 9], [-62, -68, 7]] :
        id === 'volcano' ? [[64, 44, 8], [-70, -30, 10], [52, -52, 7]] :
          [[-92, 43, 4.0], [96, 38, 5.0]];
    const noise = createNoise2D(mulberry32(this.island.seed + 41));
    for (const [x, z, scale] of zones) {
      const geo = new THREE.IcosahedronGeometry(1, 4);
      const pos = geo.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const vx = pos.getX(i);
        const vy = pos.getY(i);
        const vz = pos.getZ(i);
        const d = 1 + noise(vx * 1.2 + vz, vy * 1.2) * 0.3;
        pos.setXYZ(i, vx * d, vy * d, vz * d);
      }
      geo.computeVertexNormals();
      const rock = new THREE.Mesh(geo, this.props.materials.rockDark);
      rock.scale.set(scale * 0.62, scale * 2.0, scale * 0.55);
      const h = this.shape.height(x, z);
      rock.position.set(x, Math.min(h, 0) + scale * 0.7, z);
      rock.rotation.set(rand(-0.08, 0.08), rand(0, 6), rand(-0.08, 0.08));
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.group.add(rock);
      // Barnacle-colored shelf near the waterline.
      for (let i = 0; i < 4; i++) {
        const shelf = new THREE.Mesh(new THREE.CylinderGeometry(scale * (0.55 + i * 0.1), scale * (0.6 + i * 0.1), 0.18, 9), this.props.materials.rock);
        shelf.position.set(x + rand(-0.3, 0.3) * scale, 0.1 + i * 0.22, z + rand(-0.3, 0.3) * scale);
        shelf.rotation.y = rand(0, 6);
        this.group.add(shelf);
      }
    }
  }

  refreshCollected() {
    const flags = this.state?.data?.flags || {};
    for (const c of this.allCollectibles) {
      if (flags[`collect_${c.userData.item.id}`]) {
        c.visible = false;
        c.userData.collected = true;
      }
    }
  }

  setLighthouseLit(on) {
    if (!this.props) return;
    if (on) this.props.buildLighthouseLit();
  }

  collect(id) {
    const c = this.allCollectibles.find((o) => o.userData.item.id === id);
    if (!c || c.userData.collected) return null;
    c.userData.collected = true;
    if (this.state) this.state.data.flags[`collect_${id}`] = true;
    const item = c.userData.item;
    // Small sparkle burst.
    this.sparkle(c.position, c.userData.look.glow);
    c.visible = false;
    return item;
  }

  sparkle(pos, color, count = 18) {
    const geo = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) arr[i * 3 + 1] = 0;
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const mat = new THREE.PointsMaterial({ color: new THREE.Color(color), size: 0.1, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
    const pts = new THREE.Points(geo, mat);
    pts.position.copy(pos);
    pts.userData = { vel: [], life: 0 };
    for (let i = 0; i < count; i++) {
      pts.userData.vel.push(new THREE.Vector3(rand(-1, 1), rand(0.5, 2.2), rand(-1, 1)));
    }
    this.group.add(pts);
    this.effects = this.effects || [];
    this.effects.push(pts);
  }

  setObjective(objective, progress = 0) {
    for (const m of this.markers) {
      this.group.remove(m);
      disposeObject(m);
    }
    this.markers = [];
    if (!objective) return;
    const addMarker = (pos, color = '#f1c677', size = 1.4) => {
      const g = new THREE.Group();
      g.position.copy(pos);
      const diamondMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false });
      const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.34, 0), diamondMat);
      diamond.position.y = 3.4;
      g.add(diamond);
      const glow = makeGlowSprite(color, size * 1.5);
      glow.position.y = 3.4;
      g.add(glow);
      const beamMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(color), transparent: true, opacity: 0.13,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.2, 8, 8, 1, true), beamMat);
      beam.position.y = 4;
      g.add(beam);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.92, 40), new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      g.add(ring);
      g.userData = { phase: Math.random() * 6, baseY: g.position.y };
      this.group.add(g);
      this.markers.push(g);
    };
    if (objective.type === 'talk' || objective.type === 'shop') {
      const it = this.interactables.find((i) => i.id === objective.target);
      if (it) addMarker(it.pos);
    } else if (objective.type === 'collect') {
      for (const c of this.allCollectibles) {
        if (c.userData.item.item === objective.item && !c.userData.collected) addMarker(c.position, '#9fe8c9', 1.2);
      }
    } else if (objective.type === 'interact') {
      const it = this.interactables.find((i) => i.id === objective.target);
      if (it) addMarker(it.pos, '#f0d19a', 1.4);
    } else if (objective.type === 'boss') {
      addMarker(this.bossPosition.clone().setY(0.2), '#ffb56e', 3.2);
    } else if (objective.type === 'travel') {
      addMarker(this.boatPosition.clone(), '#f0d19a', 2.0);
    } else if (objective.type === 'catch' || objective.type === 'catchUnique') {
      addMarker(this.waterMarker.clone(), '#a9e5dd', 1.5);
    }
  }

  update(dt, t, camera, player) {
    this.time = t;
    this.sky?.update(dt, player || camera.position);
    this.ocean?.update(dt, t);
    this.vegetation?.update(dt, t, camera);
    this.props?.update(dt, t);
    for (const m of this.markers) {
      m.userData.phase += dt;
      m.position.y = m.userData.baseY + Math.sin(t * 1.6 + m.userData.phase) * 0.18;
      m.rotation.y += dt * 0.6;
    }
    for (const c of this.allCollectibles) {
      if (!c.visible) continue;
      c.userData.ring.rotation.z += dt * 0.4;
      c.rotation.y += dt * 0.15;
      c.position.y = c.userData.baseY + Math.sin(t * 1.3 + c.position.x) * 0.06;
    }
    if (this.focusMarker?.target) {
      const f = this.focusMarker;
      const target = f.target;
      f.pulse += dt;
      f.group.position.set(target.pos.x, target.pos.y + 0.01, target.pos.z);
      f.ring.rotation.z += dt * 0.55;
      const pulse = 1 + Math.sin(t * 2.4 + f.pulse) * 0.055;
      f.ring.scale.setScalar(f.ringBase * pulse);
      f.ring.material.opacity = 0.18 + Math.sin(t * 2.4 + f.pulse) * 0.05;
      f.glow.material.opacity = 0.17 + Math.sin(t * 2.1 + f.pulse) * 0.04;
      f.light.intensity = 0.26 + Math.sin(t * 2.4 + f.pulse) * 0.05;
    }
    if (this.playerShadow && player) {
      if (!Number.isFinite(player.y)) {
        this.playerShadow.visible = false;
      } else {
      this.playerShadow.visible = true;
      const gh = this.getWalkHeight(player.x, player.z);
      const eye = player.y;
      const air = Math.max(0, eye - (gh + 1.62));
      this.playerShadow.position.set(player.x, gh + 0.035, player.z);
      this.playerShadow.scale.setScalar(Math.max(0.55, 1 - air * 0.16));
      this.playerShadow.material.opacity = 0.27 * Math.max(0.3, 1 - air * 0.2);
      }
    }
    if (this.bossRing) {
      this.bossRing.rotation.z += dt * 0.1;
      this.bossRing2.rotation.z -= dt * 0.06;
    }
    if (this.smoke) {
      for (const s of this.smoke) {
        const u = s.userData;
        s.position.y += dt * u.speed;
        s.position.x += Math.sin(t * 0.3 + u.phase) * dt * 0.08;
        s.position.z += Math.cos(t * 0.25 + u.phase) * dt * 0.06;
        s.scale.setScalar(u.base * (1 + (s.position.y - u.y) * 0.16));
        s.material.opacity = 0.4 * clamp(1 - (s.position.y - u.y) / 8, 0, 1);
        if (s.position.y > u.y + 8) {
          s.position.y = u.y + Math.random() * 0.4;
          s.position.x = u.x + (Math.random() - 0.5) * 0.5;
          s.position.z = u.z + (Math.random() - 0.5) * 0.5;
        }
      }
    }
    for (const [id, npc] of this.npcs) {
      const g = npc.group;
      g.position.y = npc.baseY + Math.sin(t * 1.1 + npc.phase) * 0.008;
      const head = g.userData.head;
      if (head) {
        head.rotation.y = Math.sin(t * 0.5 + npc.phase) * 0.08;
        head.rotation.x = Math.sin(t * 0.7 + npc.phase) * 0.02;
      }
      g.userData.torso.scale.y = 1 + Math.sin(t * 1.4 + npc.phase) * 0.006;
      if (player) {
        const dx = player.x - g.position.x;
        const dz = player.z - g.position.z;
        const target = Math.atan2(dx, dz);
        let diff = target - g.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        if (Math.abs(diff) < 1.5) g.rotation.y += diff * Math.min(1, dt * 1.5);
      }
    }
    for (const f of this.ambientFish) {
      const u = f.userData;
      u.phase += dt * u.speed;
      f.position.set(
        u.center.x + Math.cos(u.phase) * u.radius,
        u.center.y + Math.sin(u.phase * 0.7) * 0.3,
        u.center.z + Math.sin(u.phase) * u.radius
      );
      f.rotation.y = -u.phase + Math.PI / 2;
      f.visible = f.position.y < 0.1;
      animateFish(f, t, 0.7);
    }
    if (this.effects) {
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const p = this.effects[i];
        p.userData.life += dt;
        const pos = p.geometry.attributes.position;
        for (let j = 0; j < pos.count; j++) {
          const v = p.userData.vel[j];
          pos.setXYZ(j, pos.getX(j) + v.x * dt, pos.getY(j) + v.y * dt, pos.getZ(j) + v.z * dt);
          v.y -= dt * 2.4;
        }
        pos.needsUpdate = true;
        p.material.opacity = Math.max(0, 1 - p.userData.life / 1.2);
        if (p.userData.life > 1.2) {
          this.group.remove(p);
          p.geometry.dispose();
          p.material.dispose();
          this.effects.splice(i, 1);
        }
      }
    }
  }

  // ── queries ────────────────────────────────────────────────────────
  heightAt(x, z) {
    return this.shape.height(x, z);
  }

  getWalkHeight(x, z) {
    if (this.dock) {
      const dx = x - this.dock.cx;
      const dz = z - this.dock.cz;
      const c = Math.cos(-this.dock.angle);
      const s = Math.sin(-this.dock.angle);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < this.dock.width / 2 - 0.2 && Math.abs(lz) < this.dock.length / 2) {
        return this.dock.deckY;
      }
    }
    return this.shape.height(x, z);
  }

  canWalk(x, z) {
    const h = this.getWalkHeight(x, z);
    if (h < -0.35) return false;
    for (const c of this.colliders) {
      if (Math.hypot(x - c.x, z - c.z) < c.radius) return false;
    }
    return true;
  }

  isWaterAim(x, z) {
    return this.shape.height(x, z) < 0.15;
  }

  nearestNPC(pos) {
    let best = null;
    let d = Infinity;
    for (const [id, npc] of this.npcs) {
      const dist = Math.hypot(pos.x - npc.group.position.x, pos.z - npc.group.position.z);
      if (dist < d) {
        d = dist;
        best = id;
      }
    }
    return { id: best, dist: d };
  }

  dispose() {
    if (!this.group) return;
    this.scene.remove(this.group);
    this.sky?.dispose();
    this.terrain?.dispose();
    this.ocean?.dispose();
    this.vegetation?.dispose();
    for (const f of this.ambientFish) disposeFishModel(f);
    this.ambientFish = [];
    this.portraitRenderer?.dispose();
    this.portraitRenderer = null;
    disposeObject(this.group);
    this.group.clear();
    this.markers = [];
    this.interactables = [];
    this.npcs.clear();
    this.allCollectibles = [];
  }
}
