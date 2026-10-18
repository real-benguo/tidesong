import { createNoise2D } from 'simplex-noise';
import { clamp, smoothstep, mulberry32, lerp } from '../utils/math.js';

export class IslandShape {
  constructor(config) {
    this.config = config;
    const rng = mulberry32(config.seed);
    this.noise = createNoise2D(rng);
    this.noise2 = createNoise2D(mulberry32(config.seed + 997));
    this.r = config.radius;
    this.profile = config.terrain.profile;
    this.dockAngle = config.dockAngle || 0;
    this.half = 230;
  }

  fbm(x, z, octaves = 4, lac = 2.03, gain = 0.5) {
    let a = 0.5;
    let f = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += a * this.noise(x * f, z * f);
      norm += a;
      f *= lac;
      a *= gain;
    }
    return sum / norm;
  }

  edgeWarp(x, z) {
    const n = this.noise2(x * 0.008 + 3.1, z * 0.008 - 2.4);
    const angle = Math.atan2(x, z);
    return 1 + n * 0.075 + Math.sin(angle * 3.0 + this.config.seed) * 0.035;
  }

  height(x, z) {
    const R = this.r;
    const nx = x / R;
    const nz = z / R;
    const rawR = Math.hypot(nx, nz);
    const warp = this.edgeWarp(x, z);
    const r = rawR / warp;
    const land = this.profile === 'atoll' ? smoothstep(1.03, 0.9, r) : smoothstep(1.055, 0.845, r);
    const n1 = this.fbm(x * 0.018 + 11.7, z * 0.018 - 4.2, 4);
    const n2 = this.fbm(x * 0.057 - 2.1, z * 0.057 + 8.9, 3);
    const terrain = this.config.terrain;
    const maxH = terrain.maxHeight;
    let h = 0;

    if (this.profile === 'green') {
      const dome = maxH * Math.pow(Math.max(0, 1 - r), 1.42);
      const ridge = maxH * 0.4 * Math.exp(-(((nx + 0.22) / 0.35) ** 2) - (((nz + 0.08) / 0.55) ** 2));
      const shelf = smoothstep(1.0, 0.8, r) * 1.35;
      h = -2.6 + land * (2.6 + dome * 0.88 + ridge * 0.6) + shelf * 0.72;
      h += land * n1 * terrain.hills * (0.35 + 0.65 * clamp(1 - r));
      h += land * n2 * 0.55;
      // A shallow saddle for the old cabin and path.
      const saddle = Math.exp(-(((nx + 0.12) / 0.28) ** 2) - (((nz - 0.52) / 0.4) ** 2));
      h -= saddle * 2.1 * land;
    } else if (this.profile === 'marsh') {
      const dome = maxH * Math.pow(Math.max(0, 1 - r), 0.82);
      h = -2.2 + land * (2.2 + dome);
      h += land * n1 * terrain.hills * 0.45;
      h += land * n2 * 0.22;
      const channel = Math.sin(nx * 12.0 + 1.2) + Math.cos(nz * 9.0 - 0.4);
      const channel2 = this.fbm(x * 0.04 + 6.3, z * 0.04, 3);
      const cut = smoothstep(0.25, 0.9, channel * 0.28 + channel2 * 0.6) * land;
      h -= cut * 1.65;
      h -= smoothstep(0.55, 0.95, this.fbm(x * 0.031 - 4, z * 0.031 + 2, 3)) * 1.1 * land;
      h += smoothstep(1.0, 0.84, r) * 0.55;
    } else if (this.profile === 'atoll') {
      const ring = smoothstep(0.16, 0.53, r) * (1 - smoothstep(0.84, 1.0, r));
      const islet = smoothstep(0.42, 0.7, this.fbm(x * 0.028 + 22, z * 0.028 - 7, 4) + 0.45);
      h = -6.4 + ring * 8.8 + islet * 1.2 * ring;
      h += n1 * terrain.hills * 0.45 * ring;
      h += n2 * 0.28 * ring;
      h -= smoothstep(0.5, 0.95, this.fbm(x * 0.02 - 3, z * 0.02 + 12, 3)) * 1.4 * ring;
      h += smoothstep(0.9, 0.78, r) * 0.5;
      // Cut a small landing notch at the pier so the dune does not swallow it.
      const ca = this.dockAngle;
      const notchX = Math.sin(ca) * 0.93;
      const notchZ = Math.cos(ca) * 0.93;
      const notch = Math.exp(-(((nx - notchX) / 0.18) ** 2) - (((nz - notchZ) / 0.22) ** 2));
      h -= notch * 2.1 * ring;
    } else if (this.profile === 'cliff') {
      const plateau = maxH * Math.pow(smoothstep(1.0, 0.57, r), 1.18);
      h = -3.0 + land * (3.0 + plateau);
      h += land * n1 * terrain.hills * (0.4 + 0.6 * clamp(1 - r));
      h += land * n2 * 0.75;
      // A storm-cut cove aligned with the pier makes room for the dock and
      // keeps the first-person view out of the cliff face.
      const ca = this.dockAngle;
      const coveX = Math.sin(ca) * 0.84;
      const coveZ = Math.cos(ca) * 0.84;
      const cove = Math.exp(-(((nx - coveX) / 0.27) ** 2) - (((nz - coveZ) / 0.32) ** 2));
      h -= cove * maxH * 0.66;
      // A diagonal shelf leads up to the old signal cliff.
      const shelf = Math.exp(-(((nx - nz * 0.55 + 0.05) / 0.18) ** 2)) * smoothstep(0.2, 0.9, r);
      h += shelf * maxH * 0.22;
    } else if (this.profile === 'caldera') {
      const cone = maxH * Math.pow(Math.max(0, 1 - r), 1.18);
      const crater = Math.exp(-((r / 0.245) ** 2)) * 53;
      h = -2.8 + land * (2.8 + cone) - crater * land;
      h += land * n1 * terrain.hills * (0.35 + 0.65 * clamp(1 - r));
      h += land * n2 * 0.9;
      // Basalt ridges radiate from the caldera.
      const ridge = Math.abs(Math.sin(Math.atan2(nz, nx) * 5.0 + 0.3));
      h += ridge * 2.4 * land * smoothstep(0.2, 0.7, r);
      // Carve a landing shelf into the basalt where the pier meets the island.
      const ca = this.dockAngle;
      const coveX = Math.sin(ca) * 0.88;
      const coveZ = Math.cos(ca) * 0.88;
      const cove = Math.exp(-(((nx - coveX) / 0.25) ** 2) - (((nz - coveZ) / 0.3) ** 2));
      h -= cove * maxH * 0.34 * land;
    }

    // Offshore floor falls away into deep water.
    const off = Math.max(0, r - 0.98);
    h -= off * off * 56;
    // A soft shelf just beyond the break keeps the shallows readable.
    h += smoothstep(0.02, -0.12, h) * 0.2;
    return h;
  }

  normal(x, z, eps = 0.55) {
    const hL = this.height(x - eps, z);
    const hR = this.height(x + eps, z);
    const hD = this.height(x, z - eps);
    const hU = this.height(x, z + eps);
    const n = { x: hL - hR, y: 2 * eps, z: hD - hU };
    const len = Math.hypot(n.x, n.y, n.z) || 1;
    return { x: n.x / len, y: n.y / len, z: n.z / len };
  }

  slope(x, z) {
    return 1 - this.normal(x, z).y;
  }

  isLand(x, z, threshold = 0.22) {
    return this.height(x, z) > threshold;
  }

  findOuterShore(angle, target = 0.3) {
    const R = this.r * 1.38;
    let prev = null;
    for (let d = R; d >= 4; d -= 1.1) {
      const x = Math.sin(angle) * d;
      const z = Math.cos(angle) * d;
      const h = this.height(x, z);
      if (h >= target) {
        if (!prev) return { x, z, h: target, distance: d, angle };
        const t = Math.abs(h - prev.h) < 0.0001 ? 0 : clamp((target - prev.h) / (h - prev.h));
        return {
          x: lerp(prev.x, x, t),
          z: lerp(prev.z, z, t),
          h: target,
          distance: lerp(prev.distance, d, t),
          angle,
        };
      }
      prev = { x, z, h, distance: d };
    }
    return { x: Math.sin(angle) * R, z: Math.cos(angle) * R, h: target, distance: R, angle };
  }

  findShore(angle, target = 0.3, maxDistance = null) {
    const R = this.r * (maxDistance || 1.32);
    let prev = { x: 0, z: 0, h: this.height(0, 0) };
    for (let d = 4; d <= R; d += 1.1) {
      const x = Math.sin(angle) * d;
      const z = Math.cos(angle) * d;
      const h = this.height(x, z);
      if (h < target) {
        const denom = h - prev.h;
        const t = Math.abs(denom) < 0.0001 ? 0 : clamp((target - prev.h) / denom);
        return {
          x: lerp(prev.x, x, t),
          z: lerp(prev.z, z, t),
          h: target,
          distance: lerp(d - 1.1, d, t),
          angle,
        };
      }
      prev = { x, z, h };
    }
    return { x: Math.sin(angle) * R, z: Math.cos(angle) * R, h: 0, distance: R, angle };
  }

  findLandPoint(nx, nz, fallbackH = 1.2) {
    let x = nx;
    let z = nz;
    let h = this.height(x, z);
    if (h < 0.6) {
      // Nudge toward the island centre until the point is comfortably dry.
      for (let i = 0; i < 16; i++) {
        x *= 0.9;
        z *= 0.9;
        h = this.height(x, z);
        if (h > 0.9) break;
      }
    }
    return { x, z, h: Math.max(h, fallbackH) };
  }
}
