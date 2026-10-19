import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { mulberry32 } from '../utils/math.js';

const BASE = import.meta.env.BASE_URL || './';
const URL = (p) => `${BASE}${p}`.replace(/([^:])\/\//g, '$1/');

const TEXTURE_NAMES = ['sand', 'grass', 'rock', 'wood', 'bark', 'forest'];

export class AssetManager {
  constructor(renderer) {
    this.renderer = renderer;
    this.loader = new THREE.TextureLoader();
    this.rgbe = new RGBELoader();
    this.textures = {};
    this.skies = {};
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.pmrem.compileEquirectangularShader();
    this.progress = 0;
    this.total = 0;
    this.loaded = 0;
    this.macro = null;
    this.foam = null;
    this.repeatCache = new Map();
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  async loadAll(onProgress) {
    const jobs = [];
    this.total = TEXTURE_NAMES.length + 2;
    for (const name of TEXTURE_NAMES) {
      jobs.push(this.loadTextureSet(name, onProgress));
    }
    jobs.push(this.makeMacroTexture());
    jobs.push(this.makeFoamTexture());
    await Promise.all(jobs);
    this.progress = 1;
    onProgress?.(1);
    return this;
  }

  bump() {
    this.loaded++;
    this.progress = this.loaded / this.total;
  }

  async loadTextureSet(name, onProgress) {
    const base = `assets/textures/${name}`;
    const [diffuse, normal, arm] = await Promise.all([
      this.loader.loadAsync(URL(`${base}_diff.jpg`)).then((t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        return t;
      }),
      this.loader.loadAsync(URL(`${base}_nor.jpg`)),
      this.loader.loadAsync(URL(`${base}_arm.jpg`)),
    ]);
    const maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    for (const tex of [diffuse, normal, arm]) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
    }
    normal.colorSpace = THREE.NoColorSpace;
    arm.colorSpace = THREE.NoColorSpace;
    this.textures[name] = { diffuse, normal, arm };
    this.bump();
    onProgress?.(this.progress);
    return this.textures[name];
  }

  get(name) {
    return this.textures[name];
  }

  setRepeat(name, repeatX, repeatY = repeatX, kind = 'diffuse') {
    const set = this.textures[name];
    if (!set) return null;
    const key = `${name}:${kind}:${repeatX}:${repeatY}`;
    const cached = this.repeatCache.get(key);
    if (cached) return cached;
    const tex = set[kind].clone();
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeatX, repeatY);
    tex.anisotropy = this.maxAniso;
    tex.needsUpdate = true;
    this.repeatCache.set(key, tex);
    return tex;
  }

  standardMaterial(name, {
    repeat = 1, color = 0xffffff, roughness = 0.9, metalness = 0,
    normalScale = 1, side = THREE.FrontSide, transparent = false, opacity = 1,
  } = {}) {
    const set = this.textures[name];
    const mat = new THREE.MeshStandardMaterial({
      map: set ? this.setRepeat(name, repeat, repeat, 'diffuse') : null,
      normalMap: set ? this.setRepeat(name, repeat, repeat, 'normal') : null,
      roughnessMap: set ? this.setRepeat(name, repeat, repeat, 'arm') : null,
      metalnessMap: set ? this.setRepeat(name, repeat, repeat, 'arm') : null,
      color, roughness, metalness, side, transparent, opacity,
    });
    if (mat.normalMap) {
      mat.normalMap.colorSpace = THREE.NoColorSpace;
      mat.normalScale.set(normalScale, normalScale);
    }
    if (mat.roughnessMap) mat.roughnessMap.colorSpace = THREE.NoColorSpace;
    return mat;
  }

  async loadSky(id, onProgress) {
    if (this.skies[id]) return this.skies[id];
    const tex = await this.rgbe.loadAsync(URL(`assets/hdri/${id}.hdr`));
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.LinearSRGBColorSpace;
    const envMap = this.pmrem.fromEquirectangular(tex).texture;
    this.skies[id] = { texture: tex, envMap };
    onProgress?.(1);
    return this.skies[id];
  }

  async makeMacroTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const rng = mulberry32(7331);
    const grid = 32;
    const vals = new Float32Array((grid + 1) * (grid + 1));
    for (let i = 0; i < vals.length; i++) vals[i] = rng();
    const sample = (x, y) => {
      const gx = (x / size) * grid;
      const gy = (y / size) * grid;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const tx = gx - x0;
      const ty = gy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = vals[y0 * (grid + 1) + x0];
      const b = vals[y0 * (grid + 1) + Math.min(grid, x0 + 1)];
      const c = vals[Math.min(grid, y0 + 1) * (grid + 1) + x0];
      const d = vals[Math.min(grid, y0 + 1) * (grid + 1) + Math.min(grid, x0 + 1)];
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = sample(x, y) * 0.55 + sample(x * 2.7, y * 2.7) * 0.3 + sample(x * 6.1, y * 6.1) * 0.15;
        const v = Math.round(70 + n * 185);
        const i = (y * size + x) * 4;
        img.data[i] = v;
        img.data[i + 1] = v;
        img.data[i + 2] = v;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    this.macro = tex;
    this.bump();
    return tex;
  }

  async makeFoamTexture() {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    const rng = mulberry32(991);
    const grid = 64;
    const vals = new Float32Array(grid * grid);
    for (let i = 0; i < vals.length; i++) vals[i] = rng();
    const sample = (x, y) => {
      const gx = (x / size) * grid;
      const gy = (y / size) * grid;
      const x0 = Math.floor(gx) % grid;
      const y0 = Math.floor(gy) % grid;
      const tx = gx - Math.floor(gx);
      const ty = gy - Math.floor(gy);
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = vals[y0 * grid + x0];
      const b = vals[y0 * grid + ((x0 + 1) % grid)];
      const c = vals[((y0 + 1) % grid) * grid + x0];
      const d = vals[((y0 + 1) % grid) * grid + ((x0 + 1) % grid)];
      return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
    };
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let n = sample(x, y) * 0.45 + sample(x * 3.3, y * 3.3) * 0.3 + sample(x * 7.7, y * 7.7) * 0.25;
        n = Math.max(0, Math.min(1, (n - 0.48) * 5.2));
        const i = (y * size + x) * 4;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = 255;
        img.data[i + 3] = Math.round(n * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.NoColorSpace;
    this.foam = tex;
    this.bump();
    return tex;
  }

  dispose() {
    this.pmrem.dispose();
    for (const set of Object.values(this.textures)) {
      set.diffuse.dispose();
      set.normal.dispose();
      set.arm.dispose();
    }
    for (const sky of Object.values(this.skies)) {
      sky.texture.dispose();
      sky.envMap.dispose();
    }
  }
}
