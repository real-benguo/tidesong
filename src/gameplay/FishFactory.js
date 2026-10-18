// FishFactory — procedural, self-contained fish atelier for TIDESONG.
//
// Everything here is generated from the species definition: silhouette, skin,
// fins, eyes, gills, boss wounds and the portrait renderer. No external assets,
// no network, no addons. The body is a parametric superellipse tube in a
// "total length = 1" design space, so every archetype is easy to profile by hand.
//
// Public API:
//   createFishModel(fishDef, { scale, portrait, quality })
//   animateFish(group, time, speed)
//   new FishPortraitRenderer({ width, height }).getPortrait(fishDef)
//   disposeFishModel(group)

import * as THREE from 'three';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const FALLBACK_PORTRAIT =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// ─────────────────────────────────────────────────────────────────────────────
// Small deterministic helpers
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a || 1e-6));
  return t * t * (3 - 2 * t);
};
const num = (v, fallback) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const signPow = (v, p) => (v < 0 ? -Math.pow(-v, p) : Math.pow(v, p));

function hashString(str) {
  let h = 2166136261 >>> 0;
  const s = String(str || 'fish');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickR(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// ─────────────────────────────────────────────────────────────────────────────
// Colour helpers (hex strings everywhere; canvas-friendly)
// ─────────────────────────────────────────────────────────────────────────────

function parseHex(hex) {
  let h = String(hex || '#888888').trim().replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = Number.parseInt(h, 16);
  if (!Number.isFinite(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(r, g, b) {
  const c = (v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function mixHex(a, b, t) {
  const A = parseHex(a);
  const B = parseHex(b);
  const u = clamp(t);
  return toHex(lerp(A[0], B[0], u), lerp(A[1], B[1], u), lerp(A[2], B[2], u));
}

function shade(hex, amount) {
  return amount >= 0 ? mixHex(hex, '#ffffff', amount) : mixHex(hex, '#05080a', -amount);
}

function rgba(hex, alpha = 1) {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${clamp(alpha)})`;
}

function paletteOf(def) {
  const c = (def && def.shape && def.shape.colors) || {};
  return {
    back: c.back || '#34485a',
    mid: c.mid || '#8aa6b2',
    belly: c.belly || '#ece7d8',
    fin: c.fin || '#6e8794',
    accent: c.accent || '#d6b86a',
    eye: c.eye || '#e8d9a0',
    glow: (def && def.shape && def.shape.glow) || (def && def.boss && def.boss.color) || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Quality / species helpers
// ─────────────────────────────────────────────────────────────────────────────

const QUALITY = {
  high: { key: 'high', segL: 96, segR: 32, skinW: 1024, bumpW: 512, finW: 256, shadow: true, detail: 2 },
  medium: { key: 'medium', segL: 72, segR: 26, skinW: 768, bumpW: 384, finW: 192, shadow: false, detail: 1 },
  low: { key: 'low', segL: 48, segR: 20, skinW: 512, bumpW: 0, finW: 128, shadow: false, detail: 0 },
};

function qualityInfo(q) {
  if (q === 'medium' || q === 'low') return QUALITY[q];
  return QUALITY.high;
}

const ARCHETYPES = ['fish', 'eel', 'shark', 'tuna', 'ray', 'puffer', 'angler', 'crab', 'jelly', 'shrimp', 'whale'];

function archetypeOf(def) {
  const t = def && def.shape && def.shape.type;
  return ARCHETYPES.includes(t) ? t : 'fish';
}

function speciesLength(def) {
  const l = def && def.length;
  if (Array.isArray(l) && l.length) {
    const a = num(l[0], 0.3);
    const b = num(l[1], a);
    return Math.max(0.01, (a + b) * 0.5);
  }
  return 0.3;
}

function speciesKey(def, quality) {
  const id = (def && (def.id || def.name)) || 'fish';
  return `${id}::${quality}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canvas textures
// ─────────────────────────────────────────────────────────────────────────────

function makeCanvas(w, h) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, Math.floor(w));
  canvas.height = Math.max(2, Math.floor(h));
  return canvas;
}

function canvasTexture(canvas, { srgb = true, wrapS = THREE.ClampToEdgeWrapping, wrapT = THREE.ClampToEdgeWrapping } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = wrapS;
  tex.wrapT = wrapT;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function addSoftBlob(ctx, x, y, rx, ry, color, alpha, rng, wobble = 0.32, points = 9) {
  const n = points;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + (rng() - 0.5) * wobble;
    const px = x + Math.cos(a) * rx * k;
    const py = y + Math.sin(a) * ry * k;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(color, alpha);
  ctx.fill();
}

function drawScaleLattice(ctx, W, H, pal, rng, strength) {
  const cols = Math.max(18, Math.round(W / 26));
  const rows = Math.max(10, Math.round(H / 18));
  const cw = W / cols;
  const ch = H / rows;
  const dark = mixHex(pal.back, '#000000', 0.32);
  const light = mixHex(pal.mid, pal.belly, 0.65);
  ctx.save();
  ctx.lineCap = 'round';
  for (let row = -1; row <= rows + 1; row++) {
    for (let col = -1; col <= cols + 1; col++) {
      const x = (col + (row & 1 ? 0.5 : 0)) * cw;
      const y = row * ch;
      const rx = cw * (0.48 + rng() * 0.06);
      const ry = ch * (0.64 + rng() * 0.08);
      ctx.beginPath();
      ctx.arc(x, y, rx, Math.PI * 0.08, Math.PI * 0.92, false);
      ctx.strokeStyle = rgba(dark, 0.24 * strength);
      ctx.lineWidth = Math.max(0.8, W / 760);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - ch * 0.14, rx * 0.92, Math.PI * 0.12, Math.PI * 0.88, false);
      ctx.strokeStyle = rgba(light, 0.16 * strength);
      ctx.stroke();
      if (rng() < 0.18) {
        ctx.beginPath();
        ctx.arc(x, y + ry * 0.1, rx * 0.2, 0, TAU);
        ctx.fillStyle = rgba(light, 0.06 * strength);
        ctx.fill();
      }
    }
  }
  // A very fine secondary lattice, the "wet glass" layer.
  if (strength > 0.5) {
    for (let row = 0; row < rows * 2; row++) {
      for (let col = 0; col < cols * 2; col++) {
        const x = (col + (row & 1 ? 0.5 : 0)) * (cw * 0.5);
        const y = row * ch * 0.5;
        ctx.beginPath();
        ctx.arc(x, y, cw * 0.2, Math.PI * 0.12, Math.PI * 0.88, false);
        ctx.strokeStyle = rgba(light, 0.025 * strength);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

function drawPattern(ctx, W, H, def, pal, rng) {
  const pattern = (def.shape && def.shape.pattern) || 'gradient';
  ctx.save();
  if (pattern === 'bands') {
    const count = 3 + (rng() < 0.25 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const cx = W * (0.16 + (i + 0.25 + rng() * 0.15) * (0.68 / count));
      const bw = W * (0.055 + rng() * 0.025);
      const darkEdge = mixHex(pal.accent, '#121316', 0.7);
      ctx.beginPath();
      for (let y = -10; y <= H + 10; y += 12) {
        const x = cx + Math.sin((y / H) * Math.PI * (1.2 + i * 0.2) + i * 1.7) * bw * 0.34;
        if (y === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let y = H + 10; y >= -10; y -= 12) {
        const x = cx + bw + Math.sin((y / H) * Math.PI * (1.2 + i * 0.2) + i * 1.7) * bw * 0.34;
        ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = rgba(pal.accent, 0.74);
      ctx.fill();
      ctx.strokeStyle = rgba(darkEdge, 0.6);
      ctx.lineWidth = Math.max(1, W / 440);
      ctx.stroke();
    }
  } else if (pattern === 'stripes') {
    const lines = 4 + Math.floor(rng() * 3);
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < lines; i++) {
        const y0 = H * (0.12 + i * 0.055 + rng() * 0.015);
        const y = side === 0 ? y0 : H - y0;
        const amp = H * (0.012 + rng() * 0.02);
        const phase = rng() * TAU;
        ctx.beginPath();
        for (let x = -4; x <= W + 4; x += 10) {
          const yy = y + Math.sin((x / W) * Math.PI * 3.2 + phase) * amp;
          if (x === -4) ctx.moveTo(x, yy);
          else ctx.lineTo(x, yy);
        }
        ctx.strokeStyle = rgba(pal.accent, 0.4 + rng() * 0.3);
        ctx.lineWidth = Math.max(1.2, W / (240 + i * 50));
        ctx.stroke();
      }
    }
    // Fine vertical ripples on the back, like storm markings.
    if (rng() < 0.55) {
      const n = 5 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        const cx = W * (0.08 + rng() * 0.84);
        ctx.beginPath();
        for (let y = H * 0.06; y < H * 0.4; y += 8) {
          const x = cx + (rng() - 0.5) * W * 0.018;
          if (y === H * 0.06) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = rgba(pal.accent, 0.16);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  } else if (pattern === 'spots') {
    const n = Math.round(W / 9);
    for (let i = 0; i < n; i++) {
      const upper = rng() < 0.72;
      const y = upper ? H * (0.07 + rng() * 0.4) : H * (0.58 + rng() * 0.36);
      const x = W * (0.03 + rng() * 0.94);
      const r = (2 + Math.pow(rng(), 2.2) * 8) * (W / 1024);
      const col = rng() < 0.22 ? shade(pal.accent, 0.25) : pal.accent;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba(shade(col, 0.25), 0.55));
      g.addColorStop(0.6, rgba(col, 0.46));
      g.addColorStop(1, rgba(col, 0));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = g;
      ctx.fill();
    }
  } else if (pattern === 'rings') {
    const n = Math.round(W / 26);
    for (let i = 0; i < n; i++) {
      const upper = rng() < 0.7;
      const y = upper ? H * (0.08 + rng() * 0.38) : H * (0.58 + rng() * 0.32);
      const x = W * (0.04 + rng() * 0.92);
      const r = (4 + rng() * 10) * (W / 1024);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.strokeStyle = rgba(pal.accent, 0.38 + rng() * 0.3);
      ctx.lineWidth = Math.max(1, (1.5 + rng() * 2.5) * (W / 1024));
      ctx.stroke();
      if (rng() < 0.5) {
        ctx.beginPath();
        ctx.arc(x, y, r * 0.42, 0, TAU);
        ctx.strokeStyle = rgba(shade(pal.accent, 0.35), 0.3);
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  } else if (pattern === 'mottle') {
    const n = 34;
    for (let i = 0; i < n; i++) {
      const y = H * (0.04 + rng() * 0.92);
      const x = W * (0.02 + rng() * 0.96);
      const rx = W * (0.015 + rng() * 0.07);
      const ry = H * (0.02 + rng() * 0.12);
      const base = rng() < 0.58 ? pal.back : mixHex(pal.mid, pal.belly, rng());
      addSoftBlob(ctx, x, y, rx, ry, base, 0.14 + rng() * 0.18, rng, 0.42, 8);
    }
    for (let i = 0; i < 18; i++) {
      const y = H * (0.1 + rng() * 0.8);
      const x = W * (0.02 + rng() * 0.96);
      addSoftBlob(ctx, x, y, W * (0.004 + rng() * 0.015), H * (0.006 + rng() * 0.02), pal.belly, 0.08 + rng() * 0.1, rng, 0.6, 6);
    }
  } else if (pattern === 'scales') {
    // The lattice does the work; add a few brighter growth rings.
    for (let i = 0; i < 9; i++) {
      const y = H * (0.1 + rng() * 0.8);
      const x = W * (0.05 + rng() * 0.9);
      ctx.beginPath();
      ctx.arc(x, y, W * (0.008 + rng() * 0.02), 0, TAU);
      ctx.strokeStyle = rgba(pal.belly, 0.08);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  if (def.shape && def.shape.type === 'ray') {
    for (let i = 0; i < 46; i++) {
      const x = W * (0.04 + rng() * 0.92);
      const y = H * (0.1 + rng() * 0.44);
      const r = (2 + Math.pow(rng(), 1.7) * 7) * (W / 1024);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = rgba(mixHex(pal.back, '#05080a', 0.35), 0.18 + rng() * 0.2);
      ctx.fill();
    }
    for (let i = 0; i < 14; i++) {
      const x = W * (0.08 + rng() * 0.84);
      const y = H * (0.22 + rng() * 0.22);
      ctx.beginPath();
      ctx.arc(x, y, (3 + rng() * 6) * (W / 1024), 0, TAU);
      ctx.strokeStyle = rgba(pal.accent, 0.3 + rng() * 0.25);
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function createSkinCanvas(def, rng, q) {
  const W = q.skinW;
  const H = Math.round(q.skinW * 0.5);
  const pal = paletteOf(def);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // Countershading. The texture wraps around the body, so the dorsal seam is
  // dark at both ends of the canvas and the belly sits at the middle.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, mixHex(pal.back, '#05080a', 0.12));
  grad.addColorStop(0.14, mixHex(pal.back, pal.mid, 0.48));
  grad.addColorStop(0.26, mixHex(pal.back, pal.mid, 0.28));
  grad.addColorStop(0.38, pal.mid);
  grad.addColorStop(0.5, pal.belly);
  grad.addColorStop(0.62, pal.mid);
  grad.addColorStop(0.74, mixHex(pal.back, pal.mid, 0.28));
  grad.addColorStop(0.86, mixHex(pal.back, pal.mid, 0.48));
  grad.addColorStop(1, mixHex(pal.back, '#05080a', 0.12));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // A cool wet light down each flank.
  const flank = ctx.createLinearGradient(0, 0, W, 0);
  flank.addColorStop(0, rgba(mixHex(pal.mid, pal.belly, 0.4), 0));
  flank.addColorStop(0.38, rgba(mixHex(pal.mid, pal.belly, 0.42), 0.08));
  flank.addColorStop(0.78, rgba(pal.accent, 0.05));
  flank.addColorStop(1, rgba(mixHex(pal.mid, pal.belly, 0.4), 0));
  ctx.fillStyle = flank;
  ctx.fillRect(0, 0, W, H);

  // Iridescent interference bands, very restrained.
  const irid = clamp(num(def.shape && def.shape.iridescence, 0), 0, 1);
  if (irid > 0.05) {
    ctx.save();
    ctx.globalAlpha = 0.05 + irid * 0.12;
    for (let i = 0; i < 5; i++) {
      const y = H * (0.1 + rng() * 0.8);
      const g = ctx.createLinearGradient(0, y - H * 0.08, W, y + H * 0.08);
      g.addColorStop(0, rgba('#80e6ff', 0));
      g.addColorStop(0.45, rgba('#b9ffe8', 0.5));
      g.addColorStop(0.65, rgba('#ffb9ef', 0.45));
      g.addColorStop(1, rgba('#80e6ff', 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, y - H * 0.08, W, H * 0.16);
    }
    ctx.restore();
  }

  // Low-frequency wet mottling.
  for (let i = 0; i < 32; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = H * (0.05 + rng() * 0.16);
    const light = rng() < 0.45;
    const c = light ? mixHex(pal.mid, pal.belly, 0.5) : pal.back;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, light ? 0.08 : 0.1));
    g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  // Caustic streaks.
  ctx.save();
  ctx.globalAlpha = 0.08;
  ctx.strokeStyle = '#e9fff8';
  for (let i = 0; i < 14; i++) {
    const x = rng() * W;
    const y = rng() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + W * 0.05, y + H * 0.08, x + W * (0.08 + rng() * 0.15), y + H * (rng() - 0.5) * 0.1);
    ctx.lineWidth = 1 + rng() * 5;
    ctx.stroke();
  }
  ctx.restore();

  drawPattern(ctx, W, H, def, pal, rng);

  if ((def.shape && def.shape.type) === 'ray') {
    // Radiating wing rays on the dorsal surface.
    const cx = W * 0.5;
    const cy = H * 0.28;
    ctx.save();
    ctx.lineCap = 'round';
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < 13; i++) {
        const edgeY = H * (side ? 0.56 : 0.16) + (rng() - 0.5) * H * 0.03;
        const edgeX = W * (0.03 + rng() * 0.94);
        const g = ctx.createLinearGradient(cx, cy, edgeX, edgeY);
        g.addColorStop(0, rgba(mixHex(pal.back, '#000000', 0.4), 0.3));
        g.addColorStop(0.7, rgba(mixHex(pal.mid, pal.back, 0.4), 0.2));
        g.addColorStop(1, rgba(pal.accent, 0.04));
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.quadraticCurveTo((cx + edgeX) * 0.5, cy + (edgeY - cy) * 0.3, edgeX, edgeY);
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(0.8, W / 900);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  if ((def.shape && def.shape.type) === 'crab') {
    // Extra mineral staining and pore marks for the carapace.
    for (let i = 0; i < 30; i++) {
      const x = rng() * W;
      const y = H * (0.06 + rng() * 0.86);
      const rx = W * (0.02 + rng() * 0.07);
      const ry = H * (0.03 + rng() * 0.1);
      addSoftBlob(ctx, x, y, rx, ry, rng() < 0.55 ? mixHex(pal.back, '#101914', 0.45) : mixHex(pal.mid, pal.belly, 0.4), 0.14 + rng() * 0.14, rng, 0.5, 8);
    }
    for (let i = 0; i < 70; i++) {
      ctx.beginPath();
      ctx.arc(rng() * W, rng() * H, (1 + rng() * 2.5) * (W / 1024), 0, TAU);
      ctx.fillStyle = rgba(mixHex(pal.back, '#000000', 0.35), 0.12 + rng() * 0.16);
      ctx.fill();
    }
  }

  const pattern = (def.shape && def.shape.pattern) || 'gradient';
  const scaleStrength = pattern === 'scales' ? 1.25 : pattern === 'mottle' ? (def.shape && def.shape.type === 'crab' ? 0.18 : 0.35) : pattern === 'bands' ? 0.5 : 0.62;
  drawScaleLattice(ctx, W, H, pal, rng, scaleStrength);

  // Fine wet speckle and a little pearl dust, mostly on the flank.
  ctx.save();
  for (let i = 0; i < Math.round(W * 0.9); i++) {
    const x = rng() * W;
    const y = rng() * H;
    const a = 0.02 + rng() * 0.075;
    ctx.fillStyle = rgba(rng() < 0.55 ? pal.belly : pal.accent, a);
    const s = 0.5 + rng() * 1.6;
    ctx.fillRect(x, y, s, s);
  }
  ctx.restore();

  // Dorsal seam darkening, keeps the texture wrap from showing a line.
  const edge = ctx.createLinearGradient(0, 0, 0, H);
  edge.addColorStop(0, rgba(pal.back, 0.34));
  edge.addColorStop(0.08, rgba(pal.back, 0));
  edge.addColorStop(0.92, rgba(pal.back, 0));
  edge.addColorStop(1, rgba(pal.back, 0.34));
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, W, H);

  return { canvas, W, H };
}

function createBumpCanvas(def, rng, q) {
  const W = q.bumpW || 384;
  const H = Math.round(W * 0.5);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, W, H);
  const pal = paletteOf(def);
  const pattern = (def.shape && def.shape.pattern) || 'gradient';

  for (let i = 0; i < 22; i++) {
    const x = rng() * W;
    const y = rng() * H;
    const r = H * (0.05 + rng() * 0.15);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const v = rng() < 0.5 ? 170 : 95;
    g.addColorStop(0, `rgba(${v},${v},${v},0.11)`);
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
  }

  const strength = pattern === 'scales' ? 1.3 : 0.55;
  const cols = Math.max(16, Math.round(W / 22));
  const rows = Math.max(8, Math.round(H / 15));
  const cw = W / cols;
  const ch = H / rows;
  for (let row = -1; row <= rows + 1; row++) {
    for (let col = -1; col <= cols + 1; col++) {
      const x = (col + (row & 1 ? 0.5 : 0)) * cw;
      const y = row * ch;
      ctx.beginPath();
      ctx.arc(x, y, cw * 0.48, Math.PI * 0.1, Math.PI * 0.9, false);
      ctx.strokeStyle = `rgba(34,34,34,${0.26 * strength})`;
      ctx.lineWidth = Math.max(0.7, W / 700);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, y - ch * 0.15, cw * 0.44, Math.PI * 0.12, Math.PI * 0.88, false);
      ctx.strokeStyle = `rgba(232,232,232,${0.2 * strength})`;
      ctx.stroke();
    }
  }
  return { canvas, W, H };
}

function createFinCanvas(def, rng, q) {
  const W = q.finW || 192;
  const H = W;
  const pal = paletteOf(def);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');

  const baseGrad = ctx.createLinearGradient(0, 0, W, 0);
  baseGrad.addColorStop(0, rgba(mixHex(pal.fin, pal.back, 0.38), 0.99));
  baseGrad.addColorStop(0.45, rgba(mixHex(pal.fin, pal.back, 0.12), 0.97));
  baseGrad.addColorStop(0.84, rgba(mixHex(pal.fin, pal.accent, 0.36), 0.88));
  baseGrad.addColorStop(1, rgba(mixHex(pal.fin, pal.accent, 0.58), 0.55));
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, W, H);

  // Fin rays, slightly wavy.
  const rays = 19;
  for (let i = 0; i < rays; i++) {
    const y = (i + 0.5) * (H / rays);
    const bend = (rng() - 0.5) * H * 0.06;
    const grad = ctx.createLinearGradient(0, y, W, y + bend);
    grad.addColorStop(0, rgba(shade(pal.fin, 0.34), 0.34));
    grad.addColorStop(0.65, rgba(shade(pal.fin, 0.24), 0.25));
    grad.addColorStop(1, rgba(pal.accent, 0.14));
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(W * 0.3, y + bend * 0.2, W * 0.7, y + bend * 0.75, W, y + bend);
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(0.7, W / 170);
    ctx.stroke();
  }

  // Inter-ray webbing / subtle growth arcs.
  for (let i = 0; i < 8; i++) {
    const x = W * (0.18 + i * 0.1);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.quadraticCurveTo(x + W * 0.06, H * 0.5, x, H);
    ctx.strokeStyle = rgba(shade(pal.fin, 0.15), 0.05);
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // A few pigment specks, matching the body mood.
  for (let i = 0; i < 44; i++) {
    const x = rng() * W;
    const y = rng() * H;
    ctx.fillStyle = rgba(rng() < 0.55 ? pal.accent : pal.back, 0.05 + rng() * 0.08);
    ctx.beginPath();
    ctx.arc(x, y, (0.8 + rng() * 3) * (W / 256), 0, TAU);
    ctx.fill();
  }

  // Alpha: solid at the root, feathered at the trailing edge.
  ctx.globalCompositeOperation = 'destination-in';
  const fade = ctx.createLinearGradient(0, 0, W, 0);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.62, 'rgba(0,0,0,0.98)');
  fade.addColorStop(0.88, 'rgba(0,0,0,0.82)');
  fade.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';

  return { canvas, W, H };
}

function createEmissiveCanvas(def, rng, q) {
  const W = Math.min(q.skinW, 768);
  const H = Math.round(W * 0.5);
  const canvas = makeCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, H);
  const pal = paletteOf(def);
  const glow = pal.glow;
  const boss = !!(def && def.boss);
  if (!glow && !boss) return { canvas, W, H };

  const ink = glow || pal.accent;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';

  const drawVein = (x, y, angle, len, width, depth, hue) => {
    if (depth <= 0) return;
    const points = [];
    let px = x;
    let py = y;
    const steps = 5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      points.push([px, py]);
      px += Math.cos(angle + Math.sin(t * 5.1 + x) * 0.2) * (len / steps);
      py += Math.sin(angle + Math.sin(t * 4.7 + y) * 0.2) * (len / steps) * 0.55;
    }
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.strokeStyle = rgba(hue, 0.5 + depth * 0.12);
    ctx.lineWidth = width;
    ctx.shadowColor = rgba(hue, 0.9);
    ctx.shadowBlur = 7;
    ctx.stroke();
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last[0], last[1], width * 1.4, 0, TAU);
    ctx.fillStyle = rgba(shade(hue, 0.35), 0.8);
    ctx.shadowBlur = 10;
    ctx.fill();
    if (depth > 1) {
      drawVein(last[0], last[1], angle + 0.62, len * 0.5, width * 0.6, depth - 1, hue);
      drawVein(last[0], last[1], angle - 0.58, len * 0.46, width * 0.55, depth - 1, hue);
    }
  };

  if (boss) {
    for (let side = 0; side < 2; side++) {
      const y = side ? H * 0.75 : H * 0.26;
      for (let i = 0; i < 3; i++) {
        const x = W * (0.16 + i * 0.24 + rng() * 0.08);
        const yy = y + (rng() - 0.5) * H * 0.12;
        drawVein(x, yy, (rng() < 0.5 ? -0.25 : Math.PI + 0.25), W * (0.16 + rng() * 0.16), W / 420, 2, ink);
      }
    }
  }

  if (glow && !boss) {
    if ((def.shape.pattern || '') === 'rings') {
      for (let i = 0; i < 12; i++) {
        const x = W * (0.06 + rng() * 0.88);
        const y = H * (0.12 + rng() * 0.76);
        ctx.beginPath();
        ctx.arc(x, y, W * (0.01 + rng() * 0.035), 0, TAU);
        ctx.strokeStyle = rgba(ink, 0.5);
        ctx.lineWidth = W / 380;
        ctx.shadowColor = rgba(ink, 1);
        ctx.shadowBlur = 9;
        ctx.stroke();
      }
    }
    // Photophores along the flank and around the head.
    for (let i = 0; i < 44; i++) {
      const x = W * (0.03 + rng() * 0.94);
      const upper = rng() < 0.7;
      const y = upper ? H * (0.08 + rng() * 0.37) : H * (0.6 + rng() * 0.32);
      const r = W * (0.002 + rng() * 0.008);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = rgba(shade(ink, 0.45), 0.65);
      ctx.shadowColor = rgba(ink, 0.95);
      ctx.shadowBlur = 8;
      ctx.fill();
    }
    // The signature lantern under the eye.
    if ((def.id || '').includes('lantern')) {
      const x = W * 0.82;
      const y = H * 0.34;
      const r = W * 0.026;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rgba('#ffffff', 0.98));
      g.addColorStop(0.25, rgba(ink, 0.95));
      g.addColorStop(1, rgba(ink, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    }
  }

  if (def.shape && def.shape.type === 'jelly') {
    // Radial canals + ring muscles, aligned with the bell UVs.
    for (let i = 0; i < 10; i++) {
      const x = W * (i / 10) + W * 0.02;
      ctx.beginPath();
      ctx.moveTo(x, H * 0.04);
      ctx.quadraticCurveTo(x + W * 0.03, H * 0.5, x, H * 0.94);
      ctx.strokeStyle = rgba(ink, 0.28);
      ctx.lineWidth = W / 520;
      ctx.shadowColor = rgba(ink, 0.8);
      ctx.shadowBlur = 8;
      ctx.stroke();
    }
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(W * 0.5, H * (0.32 + i * 0.2), W * 0.37, H * (0.07 + i * 0.015), 0, 0, TAU);
      ctx.strokeStyle = rgba(ink, 0.2);
      ctx.lineWidth = W / 500;
      ctx.shadowColor = rgba(ink, 0.8);
      ctx.shadowBlur = 8;
      ctx.stroke();
    }
  }

  ctx.restore();
  return { canvas, W, H };
}

// ─────────────────────────────────────────────────────────────────────────────
// Texture cache (reference counted so shared textures survive multiple fish)
// ─────────────────────────────────────────────────────────────────────────────

const TEXTURE_CACHE = new Map();

function acquireSpeciesTextures(def, q) {
  const key = speciesKey(def, q);
  const existing = TEXTURE_CACHE.get(key);
  if (existing) {
    existing.refs += 1;
    return existing;
  }
  const seed = hashString((def && (def.id || def.name)) || 'fish');
  const skinRng = mulberry32(seed ^ 0x9e3779b9);
  const bumpRng = mulberry32(seed ^ 0x85ebca6b);
  const finRng = mulberry32(seed ^ 0xc2b2ae35);
  const emisRng = mulberry32(seed ^ 0x27d4eb2f);

  const skin = createSkinCanvas(def, skinRng, q);
  const skinTex = canvasTexture(skin.canvas, {
    srgb: true,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
  });
  skinTex.name = `${key}-skin`;
  let bumpTex = null;
  if (q.bumpW) {
    const bump = createBumpCanvas(def, bumpRng, q);
    bumpTex = canvasTexture(bump.canvas, {
      srgb: false,
      wrapS: THREE.RepeatWrapping,
      wrapT: THREE.RepeatWrapping,
    });
    bumpTex.name = `${key}-bump`;
  }
  const emis = createEmissiveCanvas(def, emisRng, q);
  const emisTex = canvasTexture(emis.canvas, {
    srgb: true,
    wrapS: THREE.RepeatWrapping,
    wrapT: THREE.RepeatWrapping,
  });
  emisTex.name = `${key}-emissive`;
  const fin = createFinCanvas(def, finRng, q);
  const finTex = canvasTexture(fin.canvas, {
    srgb: true,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
  finTex.name = `${key}-fin`;

  const entry = { key, def, q, skin: skinTex, bump: bumpTex, emissive: emisTex, fin: finTex, refs: 1 };
  TEXTURE_CACHE.set(key, entry);
  return entry;
}

function releaseSpeciesTextures(key) {
  const entry = TEXTURE_CACHE.get(key);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs > 0) return;
  TEXTURE_CACHE.delete(key);
  entry.skin.dispose();
  if (entry.bump) entry.bump.dispose();
  entry.emissive.dispose();
  entry.fin.dispose();
}

// ─────────────────────────────────────────────────────────────────────────────
// Materials
// ─────────────────────────────────────────────────────────────────────────────

function createMaterials(def, textures, q) {
  const pal = paletteOf(def);
  const s = def.shape || {};
  const transparency = clamp(num(s.transparent, 0), 0, 1);
  const opacity = clamp(1 - transparency * 0.88, 0.3, 1);
  const isTransparent = opacity < 0.995;
  const pattern = s.pattern || 'gradient';
  const irid = clamp(num(s.iridescence, 0), 0, 1);
  const glow = pal.glow;
  const isBoss = !!def.boss;
  const roughness = clamp(
    (pattern === 'mottle' ? 0.4 : pattern === 'scales' ? 0.35 : 0.375) + (isBoss ? 0.02 : 0),
    0.25,
    0.45
  );
  const clearcoat = clamp(0.58 + irid * 0.2 + (isTransparent ? -0.03 : 0), 0.55, 0.88);
  const metalness = pattern === 'scales' ? 0.12 : pattern === 'mottle' ? 0.04 : 0.06;

  const skin = new THREE.MeshPhysicalMaterial({
    map: textures.skin,
    bumpMap: textures.bump || null,
    bumpScale: textures.bump ? (pattern === 'scales' ? 0.065 : 0.026) : 0,
    roughness,
    metalness,
    clearcoat,
    clearcoatRoughness: 0.22 + (pattern === 'mottle' ? 0.08 : 0),
    iridescence: irid,
    iridescenceIOR: 1.36,
    iridescenceThicknessRange: [110, 380],
    sheen: pattern === 'scales' ? 0.3 : 0.16,
    sheenColor: new THREE.Color(mixHex(pal.mid, pal.belly, 0.45)),
    sheenRoughness: 0.72,
    emissive: new THREE.Color(glow || (isBoss ? pal.accent : '#000000')),
    emissiveMap: glow || isBoss ? textures.emissive : null,
    emissiveIntensity: glow ? (isBoss ? 1.55 : 1.0) : isBoss ? 0.85 : 0,
    transparent: isTransparent,
    opacity,
    depthWrite: isTransparent ? opacity > 0.76 : true,
    side: THREE.FrontSide,
    ior: 1.33,
    specularIntensity: 0.8,
    envMapIntensity: 0.65,
  });
  if (s.type === 'jelly') {
    skin.side = THREE.DoubleSide;
    skin.depthWrite = false;
    skin.opacity = Math.min(skin.opacity, 0.34);
    skin.transparent = true;
    skin.roughness = 0.34;
    skin.metalness = 0;
    skin.clearcoat = 0.62;
    skin.emissiveIntensity = glow ? 1.35 : 0.3;
  }
  if (s.type === 'crab') {
    skin.roughness = 0.38;
    skin.metalness = 0.12;
    skin.clearcoat = 0.68;
    skin.clearcoatRoughness = 0.3;
  }
  if (s.type === 'ray') {
    skin.side = THREE.DoubleSide;
    skin.roughness = 0.45;
    skin.clearcoat = 0.55;
    skin.clearcoatRoughness = 0.42;
    skin.metalness = 0.01;
  }
  if (s.type === 'whale') {
    skin.side = THREE.DoubleSide;
  }
  if (s.type === 'shrimp') {
    skin.opacity = Math.min(skin.opacity, 0.64);
    skin.transparent = true;
    skin.depthWrite = false;
  }
  skin.name = 'fish-skin';
  skin.userData.baseEmissiveIntensity = skin.emissiveIntensity;

  const fin = new THREE.MeshPhysicalMaterial({
    map: textures.fin,
    color: new THREE.Color(mixHex('#ffffff', pal.fin, 0.4)),
    transparent: true,
    opacity: clamp(0.94 + (isBoss ? -0.03 : 0), 0.7, 0.98),
    alphaTest: 0.005,
    depthWrite: false,
    side: THREE.DoubleSide,
    roughness: 0.4,
    metalness: 0.03,
    clearcoat: 0.42,
    clearcoatRoughness: 0.35,
    sheen: 0.3,
    sheenColor: new THREE.Color(mixHex(pal.fin, pal.accent, 0.4)),
    emissive: new THREE.Color(glow || (isBoss ? pal.accent : '#000000')),
    emissiveMap: glow || isBoss ? textures.fin : null,
    emissiveIntensity: glow ? 0.55 : isBoss ? 0.35 : 0,
    ior: 1.33,
  });
  if (s.type === 'whale') {
    fin.color.set(mixHex(pal.fin, pal.back, 0.55));
    fin.opacity = 0.98;
  }
  fin.name = 'fish-fin';
  fin.userData.baseEmissiveIntensity = fin.emissiveIntensity;

  const finEdge = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(shade(pal.fin, -0.22)),
    roughness: 0.45,
    metalness: 0.04,
    clearcoat: 0.45,
    transparent: true,
    opacity: 0.92,
    emissive: new THREE.Color(glow || '#000000'),
    emissiveIntensity: glow ? 0.4 : 0,
  });
  finEdge.name = 'fish-fin-edge';

  const dark = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#0b0d10'),
    roughness: 0.58,
    metalness: 0.04,
    clearcoat: 0.3,
    clearcoatRoughness: 0.45,
  });
  dark.name = 'fish-dark';

  const eyeBlack = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#030508'),
    roughness: 0.07,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    ior: 1.5,
  });
  eyeBlack.name = 'fish-eye';

  const iris = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(pal.eye),
    roughness: 0.28,
    metalness: 0.15,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color(pal.glow || '#000000'),
    emissiveIntensity: pal.glow ? 0.35 : 0,
    side: THREE.DoubleSide,
  });
  iris.name = 'fish-iris';

  const catchlight = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffffff'),
    toneMapped: false,
    transparent: true,
    opacity: 0.98,
  });
  catchlight.name = 'fish-catchlight';

  const bone = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e8dfc9'),
    roughness: 0.46,
    metalness: 0.03,
  });
  bone.name = 'fish-bone';

  const barnacle = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#b8b0a0'),
    roughness: 0.82,
    metalness: 0.02,
  });
  barnacle.name = 'fish-barnacle';

  const scar = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#e7d9c4'),
    roughness: 0.62,
    metalness: 0.01,
    transparent: true,
    opacity: 0.56,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  scar.name = 'fish-scar';

  const shell = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(mixHex(pal.mid, pal.back, 0.25)),
    roughness: 0.36,
    metalness: 0.14,
    clearcoat: 0.72,
    clearcoatRoughness: 0.22,
    emissive: new THREE.Color(glow || '#000000'),
    emissiveIntensity: glow ? 0.28 : 0,
  });
  shell.name = 'fish-shell';

  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(glow || pal.accent),
    toneMapped: false,
    transparent: true,
    opacity: 0.68,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  glowMat.name = 'fish-glow';

  const glowSolid = new THREE.MeshBasicMaterial({
    color: new THREE.Color(glow || pal.accent),
    toneMapped: false,
  });
  glowSolid.name = 'fish-glow-solid';

  const finRay = new THREE.LineBasicMaterial({
    color: new THREE.Color(mixHex(pal.fin, pal.accent, 0.55)),
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    toneMapped: false,
  });
  finRay.name = 'fish-fin-rays';

  const whisker = new THREE.MeshStandardMaterial({
    color: new THREE.Color(mixHex(pal.back, pal.mid, 0.4)),
    roughness: 0.62,
    metalness: 0.02,
  });
  whisker.name = 'fish-whisker';

  const lateral = new THREE.MeshBasicMaterial({
    color: new THREE.Color(mixHex(pal.back, '#05080a', 0.45)),
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    toneMapped: true,
  });
  lateral.name = 'fish-lateral-line';

  const raySpot = new THREE.MeshStandardMaterial({
    color: new THREE.Color(mixHex(pal.back, '#05080a', 0.45)),
    roughness: 0.55,
    metalness: 0.03,
  });
  raySpot.name = 'ray-spot';

  const rayRing = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(pal.accent),
    roughness: 0.3,
    metalness: 0.05,
    clearcoat: 0.7,
    emissive: new THREE.Color(pal.glow || '#000000'),
    emissiveIntensity: pal.glow ? 0.5 : 0,
  });
  rayRing.name = 'ray-ring';

  const rayLine = new THREE.LineBasicMaterial({
    color: new THREE.Color(mixHex(pal.accent, pal.back, 0.35)),
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
  });
  rayLine.name = 'ray-lines';

  const jaw = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(mixHex(pal.back, pal.mid, 0.46)),
    roughness: 0.43,
    metalness: 0.05,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
  });
  jaw.name = 'fish-jaw';

  const tongue = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(mixHex(pal.accent, '#6e2632', 0.62)),
    roughness: 0.45,
    metalness: 0.02,
    clearcoat: 0.62,
    clearcoatRoughness: 0.28,
    emissive: new THREE.Color(pal.glow || '#000000'),
    emissiveIntensity: pal.glow ? 0.2 : 0,
  });
  tongue.name = 'fish-tongue';

  const shellDark = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(shade(mixHex(pal.back, pal.mid, 0.35), -0.15)),
    roughness: 0.42,
    metalness: 0.18,
    clearcoat: 0.68,
    clearcoatRoughness: 0.25,
  });
  shellDark.name = 'fish-shell-dark';

  const jellyInner = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(mixHex(pal.mid, pal.accent, 0.35)),
    transparent: true,
    opacity: 0.16,
    roughness: 0.2,
    metalness: 0,
    clearcoat: 0.9,
    clearcoatRoughness: 0.12,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: new THREE.Color(glow || pal.accent),
    emissiveIntensity: glow ? 0.7 : 0.25,
  });
  jellyInner.name = 'fish-jelly-inner';

  return {
    skin,
    fin,
    finEdge,
    dark,
    eyeBlack,
    iris,
    catchlight,
    bone,
    barnacle,
    scar,
    shell,
    shellDark,
    glow: glowMat,
    glowSolid,
    finRay,
    whisker,
    lateral,
    raySpot,
    rayRing,
    rayLine,
    jaw,
    tongue,
    jellyInner,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Geometry helpers
// ─────────────────────────────────────────────────────────────────────────────

function mergeGeometries(geometries) {
  const geos = geometries.filter(Boolean);
  if (!geos.length) return new THREE.BufferGeometry();
  let vertexCount = 0;
  let indexCount = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    vertexCount += pos.count;
    indexCount += g.index ? g.index.count : pos.count;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  let vOff = 0;
  let iOff = 0;
  for (const g of geos) {
    const pos = g.getAttribute('position');
    if (!pos) continue;
    const nor = g.getAttribute('normal');
    const uv = g.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) {
      positions[(vOff + i) * 3] = pos.getX(i);
      positions[(vOff + i) * 3 + 1] = pos.getY(i);
      positions[(vOff + i) * 3 + 2] = pos.getZ(i);
      if (nor) {
        normals[(vOff + i) * 3] = nor.getX(i);
        normals[(vOff + i) * 3 + 1] = nor.getY(i);
        normals[(vOff + i) * 3 + 2] = nor.getZ(i);
      }
      if (uv) {
        uvs[(vOff + i) * 2] = uv.getX(i);
        uvs[(vOff + i) * 2 + 1] = uv.getY(i);
      }
    }
    if (g.index) {
      for (let i = 0; i < g.index.count; i++) indices[iOff + i] = g.index.getX(i) + vOff;
      iOff += g.index.count;
    } else {
      for (let i = 0; i < pos.count; i++) indices[iOff + i] = i + vOff;
      iOff += pos.count;
    }
    vOff += pos.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(indices, 1));
  out.computeBoundingSphere();
  for (const g of geos) g.dispose();
  return out;
}

/**
 * A tapered tube along a Catmull-Rom curve. This is used for gills, barbels,
 * tentacles, crab legs, claws and whip tails. Normals are analytic (Frenet
 * frames), so the tube stays smooth even when it bends sharply.
 */
function makeTaperedTubeGeometry(points, radiusAt, tubularSegments = 14, radialSegments = 6) {
  const pts = points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(p[0], p[1], p[2])));
  if (pts.length < 2) pts.push(pts[0].clone().add(new THREE.Vector3(0.01, 0, 0)));
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.5);
  const frames = curve.computeFrenetFrames(tubularSegments, false);
  const rows = tubularSegments + 1;
  const cols = radialSegments + 1;
  const positions = new Float32Array(rows * cols * 3);
  const normals = new Float32Array(rows * cols * 3);
  const uvs = new Float32Array(rows * cols * 2);
  const indices = [];
  for (let i = 0; i < rows; i++) {
    const t = i / tubularSegments;
    const center = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const r = Math.max(0, radiusAt(t));
    for (let j = 0; j < cols; j++) {
      const v = j / radialSegments;
      const angle = v * TAU;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      const nx = N.x * ca + B.x * sa;
      const ny = N.y * ca + B.y * sa;
      const nz = N.z * ca + B.z * sa;
      const idx = i * cols + j;
      positions[idx * 3] = center.x + nx * r;
      positions[idx * 3 + 1] = center.y + ny * r;
      positions[idx * 3 + 2] = center.z + nz * r;
      normals[idx * 3] = nx;
      normals[idx * 3 + 1] = ny;
      normals[idx * 3 + 2] = nz;
      uvs[idx * 2] = t;
      uvs[idx * 2 + 1] = v;
    }
  }
  for (let i = 0; i < tubularSegments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * cols + j;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

function makeSphericalCap(radius, angle, segs = 24, rings = 4) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const R = Math.max(0.0001, radius);
  const a = clamp(angle, 0.01, Math.PI * 0.49);
  // Pole.
  positions.push(0, 0, R);
  normals.push(0, 0, 1);
  uvs.push(0.5, 1);
  const cols = segs + 1;
  for (let i = 1; i <= rings; i++) {
    const phi = (a * i) / rings;
    const sp = Math.sin(phi);
    const cp = Math.cos(phi);
    for (let j = 0; j < cols; j++) {
      const theta = (j / segs) * TAU;
      const x = R * sp * Math.cos(theta);
      const y = R * sp * Math.sin(theta);
      const z = R * cp;
      positions.push(x, y, z);
      normals.push(x / R, y / R, z / R);
      uvs.push(j / segs, 1 - i / rings);
    }
  }
  for (let j = 0; j < segs; j++) indices.push(0, 1 + j, 1 + j + 1);
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a0 = 1 + i * cols + j;
      const b0 = a0 + 1;
      const c0 = a0 + cols;
      const d0 = c0 + 1;
      indices.push(a0, c0, b0, b0, c0, d0);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/**
 * A radial fin: all rays originate at the root. It is parameterised in a
 * caller-provided orthonormal-ish basis so the same function can build a
 * vertical caudal fin, a horizontal whale fluke, a pectoral paddle or a ray
 * wing.
 */
function makePolarFinGeometry({
  rows = 10,
  cols = 28,
  spread = 1.05,
  radiusFn,
  axis = new THREE.Vector3(1, 0, 0),
  side = new THREE.Vector3(0, 1, 0),
  normal = new THREE.Vector3(0, 0, 1),
  bow = 0,
  rootStart = 0.035,
  asym = 1,
}) {
  const ax = axis.clone().normalize();
  const sd = side.clone().normalize();
  const nm = normal.clone().normalize();
  const positions = [];
  const uvs = [];
  const indices = [];
  const cols1 = cols + 1;
  for (let i = 0; i <= rows; i++) {
    const s = rootStart + (1 - rootStart) * (i / rows);
    for (let j = 0; j <= cols; j++) {
      const t = -1 + (2 * j) / cols;
      const theta = t * spread;
      const r = radiusFn(t) * s;
      const ca = Math.cos(theta);
      const sa = Math.sin(theta);
      const sideMul = t >= 0 ? asym : 1;
      const a = ca * r;
      const b = sa * r * sideMul;
      const bowAmt = bow * Math.sin(Math.PI * s) * (0.4 + 0.6 * Math.cos(theta));
      positions.push(
        ax.x * a + sd.x * b + nm.x * bowAmt,
        ax.y * a + sd.y * b + nm.y * bowAmt,
        ax.z * a + sd.z * b + nm.z * bowAmt
      );
      uvs.push(s, j / cols);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * cols1 + j;
      const b = a + 1;
      const c = a + cols1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function polarFinEdgePoints({ cols = 28, spread = 1.05, radiusFn, axis, side, normal, bow = 0, asym = 1 }) {
  const ax = axis.clone().normalize();
  const sd = side.clone().normalize();
  const nm = normal.clone().normalize();
  const pts = [];
  for (let j = 0; j <= cols; j++) {
    const t = -1 + (2 * j) / cols;
    const theta = t * spread;
    const r = radiusFn(t);
    const ca = Math.cos(theta);
    const sa = Math.sin(theta);
    const sideMul = t >= 0 ? asym : 1;
    const a = ca * r;
    const b = sa * r * sideMul;
    const bowAmt = bow * Math.sin(Math.PI) * 0;
    pts.push(new THREE.Vector3(ax.x * a + sd.x * b + nm.x * bowAmt, ax.y * a + sd.y * b + nm.y * bowAmt, ax.z * a + sd.z * b + nm.z * bowAmt));
  }
  return pts;
}

function polarFinRays({ rows = 10, cols = 28, spread = 1.05, radiusFn, axis, side, normal, bow = 0, asym = 1, rayCount = 11 }) {
  const ax = axis.clone().normalize();
  const sd = side.clone().normalize();
  const nm = normal.clone().normalize();
  const rays = [];
  for (let k = 0; k < rayCount; k++) {
    const j = Math.round((k / (rayCount - 1)) * cols);
    const t = -1 + (2 * j) / cols;
    const theta = t * spread;
    const sideMul = t >= 0 ? asym : 1;
    const pts = [];
    for (const s of [0.1, 0.56, 0.97]) {
      const r = radiusFn(t) * s;
      const bowAmt = bow * Math.sin(Math.PI * s) * (0.4 + 0.6 * Math.cos(theta));
      pts.push(
        new THREE.Vector3(
          ax.x * Math.cos(theta) * r + sd.x * Math.sin(theta) * r * sideMul + nm.x * bowAmt,
          ax.y * Math.cos(theta) * r + sd.y * Math.sin(theta) * r * sideMul + nm.y * bowAmt,
          ax.z * Math.cos(theta) * r + sd.z * Math.sin(theta) * r * sideMul + nm.z * bowAmt
        )
      );
    }
    rays.push(pts);
  }
  return rays;
}

function makeFinRayLines(rays, material, offsetNormal = null, offset = 0.0015) {
  const positions = [];
  for (const pts of rays) {
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (i < pts.length - 1) {
        const q = pts[i + 1];
        const a = p.clone();
        const b = q.clone();
        if (offsetNormal) {
          a.addScaledVector(offsetNormal, offset);
          b.addScaledVector(offsetNormal, offset);
        }
        positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(geo, material);
}

/**
 * A fin whose root runs along a line on the body (dorsal / anal / crest).
 * Each base sample has its own outward direction and height, which gives us
 * spiny peaks, sails, long fringes and torn boss fins from the same code.
 */
function makeRidgeFinGeometry({ basePoints, dirs, heights, normal, rows = 9, bow = 0.002, freeEdge = 0 }) {
  const n = basePoints.length - 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  const cols = rows + 1;
  const nm = normal.clone().normalize();
  for (let j = 0; j <= n; j++) {
    const base = basePoints[j];
    const dir = dirs[j].clone().normalize();
    const h = heights[j];
    for (let i = 0; i <= rows; i++) {
      const s = i / rows;
      const bowAmt = bow * Math.sin(Math.PI * s) * (0.35 + 0.65 * Math.sin(j * 0.7 + 0.4));
      positions.push(
        base.x + dir.x * h * s + nm.x * bowAmt,
        base.y + dir.y * h * s + nm.y * bowAmt,
        base.z + dir.z * h * s + nm.z * bowAmt + freeEdge * s * s
      );
      uvs.push(s, j / n);
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < rows; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function ridgeFinEdgePoints({ basePoints, dirs, heights, normal, bow = 0.002 }) {
  const nm = normal.clone().normalize();
  const pts = [];
  const n = basePoints.length - 1;
  for (let j = 0; j <= n; j++) {
    const base = basePoints[j];
    const dir = dirs[j].clone().normalize();
    const h = heights[j];
    const bowAmt = bow * Math.sin(Math.PI) * 0;
    pts.push(new THREE.Vector3(base.x + dir.x * h + nm.x * bowAmt, base.y + dir.y * h + nm.y * bowAmt, base.z + dir.z * h + nm.z * bowAmt));
  }
  return pts;
}

function makeRidgeFinRays({ basePoints, dirs, heights, normal, count = 12 }) {
  const nm = normal.clone().normalize();
  const n = basePoints.length - 1;
  const rays = [];
  for (let k = 0; k < count; k++) {
    const j = Math.round((k / (count - 1)) * n);
    const base = basePoints[j];
    const dir = dirs[j].clone().normalize();
    const h = heights[j];
    const pts = [];
    for (const s of [0.08, 0.55, 0.96]) {
      pts.push(new THREE.Vector3(base.x + dir.x * h * s + nm.x * 0.0015, base.y + dir.y * h * s + nm.y * 0.0015, base.z + dir.z * h * s + nm.z * 0.0015));
    }
    rays.push(pts);
  }
  return rays;
}

// ─────────────────────────────────────────────────────────────────────────────
// Archetype profiles — hand-tuned silhouettes in "one fish length" space
// ─────────────────────────────────────────────────────────────────────────────

function archetypeConfig(def) {
  const s = (def && def.shape) || {};
  const type = archetypeOf(def);
  const h = clamp(num(s.h, 0.34), 0.06, 0.92);
  const w = clamp(num(s.w, 0.16), 0.06, 0.9);
  const snout = clamp(num(s.snout, 0.14), 0, 0.6);
  const head = clamp(num(s.head, 0.8), 0.4, 1);
  const cfg = {
    type,
    noseX: 0.5,
    tailX: -0.34,
    depthScale: 0.95,
    widthScale: 0.82,
    depth: h * 0.95,
    width: w * 0.82,
    tailBase: 0.1,
    tailRise: 0.29,
    headStart: clamp(1 - (0.21 + snout * 0.8 + (1 - head) * 0.14), 0.5, 0.78),
    noseBase: clamp(0.13 - snout * 0.3, 0.035, 0.14),
    headPow: 2.1,
    bulge: 0.13,
    peak: 0.43,
    bulgeWidth: 0.3,
    superellipse: 2.3,
    sCurve: 0.008,
    bellyDrop: 0.055,
    bellyBulge: 0.12,
    dorsalArch: 0.05,
    bodyArch: 0.18,
    headPinch: 0.18,
    gillCrease: 0.055,
    cheek: 0.045,
    segmentAmp: 0,
    segmentCount: 0,
    spineY: null,
    eyeU: 0.83,
    eyeV: 0.21,
    eyeScale: 1,
    gillU: 0.755,
    tailType: s.tail || 'fork',
    finScale: 1,
    torn: !!(def && def.boss),
    isBoss: !!(def && def.boss),
    transparent: clamp(num(s.transparent, 0), 0, 1),
  };

  if (type === 'eel') {
    cfg.noseX = 0.5;
    cfg.tailX = -0.435;
    cfg.depthScale = 0.52;
    cfg.widthScale = 0.72;
    cfg.depth = Math.max(0.045, h * 0.52);
    cfg.width = Math.max(0.04, w * 0.72);
    cfg.tailBase = 0.62;
    cfg.tailRise = 0.09;
    cfg.headStart = clamp(1 - (0.09 + snout * 0.42), 0.8, 0.93);
    cfg.noseBase = 0.3;
    cfg.headPow = 2.0;
    cfg.bulge = 0.022;
    cfg.peak = 0.55;
    cfg.bulgeWidth = 0.28;
    cfg.superellipse = 2.12;
    cfg.sCurve = 0.03;
    cfg.bellyDrop = 0.02;
    cfg.bellyBulge = 0.04;
    cfg.dorsalArch = 0.012;
    cfg.bodyArch = 0.04;
    cfg.headPinch = 0.04;
    cfg.gillCrease = 0;
    cfg.eyeU = 0.885;
    cfg.eyeV = 0.2;
    cfg.eyeScale = 0.9;
    cfg.gillU = 0.845;
    cfg.tailType = s.tail || 'whip';
  } else if (type === 'shark') {
    cfg.noseX = 0.515;
    cfg.tailX = -0.39;
    cfg.depthScale = 0.78;
    cfg.widthScale = 0.86;
    cfg.depth = Math.max(0.07, h * 0.78);
    cfg.width = Math.max(0.055, w * 0.86);
    cfg.tailBase = 0.06;
    cfg.tailRise = 0.32;
    cfg.headStart = clamp(1 - (0.13 + snout * 0.55), 0.55, 0.77);
    cfg.noseBase = 0.06;
    cfg.headPow = 1.7;
    cfg.bulge = 0.11;
    cfg.peak = 0.45;
    cfg.bulgeWidth = 0.27;
    cfg.gillCrease = 0.035;
    cfg.cheek = 0.035;
    cfg.bodyArch = 0.07;
    cfg.superellipse = 2.2;
    cfg.sCurve = 0.004;
    cfg.bellyDrop = 0.022;
    cfg.bellyBulge = 0.06;
    cfg.dorsalArch = 0.02;
    cfg.headPinch = 0.16;
    cfg.eyeU = clamp(1 - (0.12 + snout * 0.22), 0.72, 0.82);
    cfg.eyeV = 0.22;
    cfg.eyeScale = 0.74;
    cfg.gillU = 0.7;
    cfg.tailType = s.tail || 'crescent';
  } else if (type === 'tuna') {
    cfg.noseX = 0.5;
    cfg.tailX = -0.37;
    cfg.depthScale = 0.78;
    cfg.widthScale = 0.9;
    cfg.depth = Math.max(0.07, h * 0.78);
    cfg.width = Math.max(0.055, w * 0.9);
    cfg.tailBase = 0.05;
    cfg.tailRise = 0.3;
    cfg.headStart = clamp(1 - (0.22 + snout * 0.65), 0.58, 0.76);
    cfg.noseBase = 0.045;
    cfg.headPow = 2.1;
    cfg.bulge = 0.12;
    cfg.peak = 0.46;
    cfg.bulgeWidth = 0.27;
    cfg.gillCrease = 0.04;
    cfg.cheek = 0.03;
    cfg.bodyArch = 0.07;
    cfg.superellipse = 2.6;
    cfg.sCurve = 0.004;
    cfg.bellyDrop = 0.024;
    cfg.bellyBulge = 0.075;
    cfg.dorsalArch = 0.02;
    cfg.headPinch = 0.18;
    cfg.eyeU = 0.83;
    cfg.eyeV = 0.22;
    cfg.eyeScale = 0.7;
    cfg.gillU = 0.745;
    cfg.tailType = s.tail || 'crescent';
  } else if (type === 'puffer') {
    cfg.noseX = 0.5;
    cfg.tailX = -0.3;
    cfg.depthScale = 0.86;
    cfg.widthScale = 0.88;
    cfg.depth = Math.max(0.12, h * 0.86);
    cfg.width = Math.max(0.1, w * 0.88);
    cfg.tailBase = 0.3;
    cfg.tailRise = 0.16;
    cfg.headStart = 0.72;
    cfg.noseBase = 0.45;
    cfg.headPow = 2.2;
    cfg.bulge = 0.2;
    cfg.peak = 0.48;
    cfg.bulgeWidth = 0.3;
    cfg.superellipse = 2.05;
    cfg.sCurve = 0.002;
    cfg.bellyDrop = 0.01;
    cfg.bellyBulge = 0.035;
    cfg.dorsalArch = 0.01;
    cfg.bodyArch = 0.08;
    cfg.headPinch = 0.02;
    cfg.gillCrease = 0.025;
    cfg.cheek = 0.02;
    cfg.eyeU = 0.8;
    cfg.eyeV = 0.19;
    cfg.eyeScale = 1.18;
    cfg.gillU = 0.7;
    cfg.tailType = s.tail || 'fan';
  } else if (type === 'angler') {
    cfg.noseX = 0.5;
    cfg.tailX = -0.32;
    cfg.depthScale = 0.88;
    cfg.widthScale = 0.9;
    cfg.depth = Math.max(0.1, h * 0.88);
    cfg.width = Math.max(0.08, w * 0.9);
    cfg.tailBase = 0.06;
    cfg.tailRise = 0.55;
    cfg.headStart = 0.9;
    cfg.noseBase = 0.5;
    cfg.headPow = 2.8;
    cfg.bulge = 0.2;
    cfg.peak = 0.66;
    cfg.bulgeWidth = 0.24;
    cfg.superellipse = 2.18;
    cfg.sCurve = 0.003;
    cfg.bellyDrop = 0.035;
    cfg.bellyBulge = 0.11;
    cfg.dorsalArch = 0.026;
    cfg.bodyArch = 0.06;
    cfg.headPinch = 0.02;
    cfg.gillCrease = 0.05;
    cfg.cheek = 0.04;
    cfg.eyeU = 0.82;
    cfg.eyeV = 0.17;
    cfg.eyeScale = 0.78;
    cfg.gillU = 0.66;
    cfg.tailType = s.tail || 'fan';
  } else if (type === 'whale') {
    cfg.noseX = 0.5;
    cfg.tailX = -0.4;
    cfg.depthScale = 0.66;
    cfg.widthScale = 0.8;
    cfg.depth = Math.max(0.08, h * 0.66);
    cfg.width = Math.max(0.07, w * 0.8);
    cfg.tailBase = 0.08;
    cfg.tailRise = 0.34;
    cfg.headStart = 0.6;
    cfg.noseBase = 0.25;
    cfg.headPow = 1.6;
    cfg.bulge = 0.08;
    cfg.peak = 0.45;
    cfg.bulgeWidth = 0.28;
    cfg.gillCrease = 0;
    cfg.superellipse = 2.1;
    cfg.sCurve = 0.004;
    cfg.bellyDrop = 0.03;
    cfg.bellyBulge = 0.075;
    cfg.dorsalArch = 0.03;
    cfg.bodyArch = 0.045;
    cfg.headPinch = 0.06;
    cfg.eyeU = 0.855;
    cfg.eyeV = 0.285;
    cfg.eyeScale = 0.62;
    cfg.gillU = null;
    cfg.tailType = s.tail || 'fluke';
    cfg.spineY = (u) => 0.012 * Math.sin(u * Math.PI) + 0.008 * (1 - u);
  } else if (type === 'ray') {
    cfg.noseX = 0.48;
    cfg.tailX = -0.16;
    cfg.depthScale = 0.45;
    cfg.widthScale = 0.34;
    cfg.depth = Math.max(0.05, h * 0.45);
    cfg.width = 0.38;
    cfg.tailBase = 0.34;
    cfg.tailRise = 0.28;
    cfg.headStart = 0.8;
    cfg.noseBase = 0.46;
    cfg.headPow = 2.2;
    cfg.bulge = 0.035;
    cfg.gillCrease = 0;
    cfg.peak = 0.55;
    cfg.bulgeWidth = 0.3;
    cfg.superellipse = 2.85;
    cfg.sCurve = 0;
    cfg.bellyDrop = 0;
    cfg.bellyBulge = 0.08;
    cfg.dorsalArch = 0.02;
    cfg.bodyArch = 0.05;
    cfg.headPinch = 0.02;
    cfg.eyeU = 0.82;
    cfg.eyeV = 0.09;
    cfg.eyeScale = 0.72;
    cfg.gillU = 0.68;
    cfg.tailType = s.tail || 'whip';
  } else if (type === 'shrimp') {
    cfg.noseX = 0.48;
    cfg.tailX = -0.43;
    cfg.depthScale = 0.5;
    cfg.widthScale = 0.62;
    cfg.depth = Math.max(0.05, h * 0.5);
    cfg.width = Math.max(0.035, w * 0.62);
    cfg.tailBase = 0.08;
    cfg.tailRise = 0.3;
    cfg.headStart = 0.78;
    cfg.noseBase = 0.34;
    cfg.headPow = 1.4;
    cfg.bulge = 0.05;
    cfg.peak = 0.68;
    cfg.bulgeWidth = 0.22;
    cfg.gillCrease = 0;
    cfg.superellipse = 2.1;
    cfg.sCurve = 0.006;
    cfg.bellyDrop = 0.02;
    cfg.bellyBulge = 0.02;
    cfg.dorsalArch = 0.012;
    cfg.bodyArch = 0.08;
    cfg.headPinch = 0.04;
    cfg.segmentAmp = 0.055;
    cfg.segmentCount = 7;
    cfg.eyeU = 0.885;
    cfg.eyeV = 0.2;
    cfg.eyeScale = 1.05;
    cfg.gillU = null;
    cfg.spineY = (u) => -0.15 * Math.pow(1 - u, 1.8) + 0.012 * Math.sin(u * Math.PI);
    cfg.tailType = 'fan';
  }
  if (type === 'fish' && snout > 0.3) {
    // Long-jawed ambush predators are much more slender than the generic fish.
    cfg.depth *= 0.84;
    cfg.width *= 0.9;
  }

  // Two-stage head profile: a head taper followed by an (often very long)
  // snout tube. This is what turns a generic fish into a gar, a pike or a
  // needle-nosed ambush predator.
  const snoutFrac = type === 'fish'
    ? clamp((snout - 0.22) * 0.9, 0, 0.28)
    : clamp((snout - 0.22) * 0.3, 0, 0.08);
  const headLen = {
    fish: 0.16 + (1 - head) * 0.1,
    eel: 0.08,
    shark: 0.15,
    tuna: 0.18,
    puffer: 0.17,
    angler: 0.28,
    whale: 0.24,
    ray: 0.15,
    shrimp: 0.12,
  }[type] || 0.16;
  cfg.headEnd = 1 - snoutFrac;
  cfg.headStart = clamp(cfg.headEnd - headLen, 0.34, 0.92);
  cfg.eyeU = clamp(Math.min(cfg.eyeU, cfg.headEnd - (snoutFrac > 0.06 ? 0.09 : 0.05)), 0.5, 0.9);
  if (cfg.gillU != null) cfg.gillU = Math.min(cfg.gillU, cfg.eyeU - 0.03);
  cfg.forehead = type === 'fish' && head < 0.74 && snout < 0.3 ? 0.24 : 0;
  return cfg;
}

function createBodyShape(def, cfg) {
  const depth = Math.max(0.03, cfg.depth);
  const width = Math.max(0.025, cfg.width);
  const noseX = cfg.noseX;
  const tailX = cfg.tailX;
  const bodyLen = noseX - tailX;
  const p = 2 / Math.max(1.5, cfg.superellipse);

  function envelope(s) {
    const tailRise = smoothstep(0, Math.max(0.001, cfg.tailRise), s);
    let e = lerp(cfg.tailBase, 1, tailRise);
    const headT = smoothstep(cfg.headStart, cfg.headEnd ?? 1, s);
    e *= 1 - Math.pow(headT, cfg.headPow) * (1 - cfg.noseBase);
    const g = Math.exp(-Math.pow((s - cfg.peak) / Math.max(0.02, cfg.bulgeWidth), 2));
    e *= 1 + cfg.bulge * g;
    if (cfg.segmentAmp > 0 && cfg.segmentCount > 0) {
      e *= 1 + cfg.segmentAmp * Math.cos(s * cfg.segmentCount * TAU + 0.8) * smoothstep(0.05, 0.2, s) * (1 - smoothstep(0.7, 0.96, s));
    }
    if (cfg.bodyArch) {
      const arch = Math.pow(Math.sin(Math.PI * Math.pow(clamp(s), 0.9)), 0.5);
      e *= 1 - cfg.bodyArch * (1 - arch);
    }
    return Math.max(0.012, e);
  }

  function headFactor(s) {
    return smoothstep(cfg.headStart, cfg.headEnd ?? 1, s);
  }

  function centerAt(s) {
    const spine = cfg.spineY ? cfg.spineY(s) : 0;
    const y = spine - depth * cfg.bellyDrop * Math.sin(Math.PI * clamp(s)) * smoothstep(0, 0.14, s);
    const z = cfg.sCurve * Math.sin(s * TAU) * smoothstep(0, 0.12, s);
    return new THREE.Vector3(tailX + bodyLen * s, y, z);
  }

  function profileAt(s) {
    const env = envelope(s);
    const hf = headFactor(s);
    const gill = cfg.gillCrease && cfg.gillU != null
      ? 1 - cfg.gillCrease * Math.exp(-Math.pow((s - cfg.gillU) / 0.017, 2))
      : 1;
    const cheek = cfg.cheek && cfg.gillU != null
      ? 1 + cfg.cheek * Math.exp(-Math.pow((s - (cfg.gillU + 0.055)) / 0.055, 2))
      : 1;
    const halfH = depth * env * 0.5 * gill * cheek;
    const forehead = cfg.forehead
      ? 1 + cfg.forehead * Math.exp(-Math.pow((s - (cfg.headStart + 0.045)) / 0.05, 2))
      : 1;
    const top = halfH * (1 + cfg.dorsalArch * Math.sin(Math.PI * clamp(s))) * forehead;
    const bottom = halfH * (1 + cfg.bellyBulge * Math.sin(Math.PI * clamp(s)));
    const widthPinch = 1 - cfg.headPinch * Math.pow(hf, 1.35);
    const halfW = width * env * 0.5 * widthPinch * gill * cheek;
    return { env, hf, halfH, top, bottom, halfW, center: centerAt(s) };
  }

  function sample(s, v) {
    const u = clamp(s);
    const prof = profileAt(u);
    const a = v * TAU;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const yn = signPow(ca, p);
    const zn = signPow(sa, p);
    const yy = ca >= 0 ? prof.top : prof.bottom;
    return new THREE.Vector3(
      tailX + bodyLen * u,
      prof.center.y + yn * yy,
      prof.center.z + zn * prof.halfW
    );
  }

  function normalAt(s, v) {
    const u = clamp(s);
    const eps = 0.0015;
    const p0 = sample(Math.max(0, u - eps), v);
    const p1 = sample(Math.min(1, u + eps), v);
    const q0 = sample(u, v - eps);
    const q1 = sample(u, v + eps);
    const du = p1.sub(p0);
    const dv = q1.sub(q0);
    const n = dv.cross(du);
    if (n.lengthSq() < 1e-12) return new THREE.Vector3(0, 1, 0);
    return n.normalize();
  }

  function topPoint(s) {
    return sample(s, 0);
  }
  function bottomPoint(s) {
    return sample(s, 0.5);
  }
  function sidePoint(s, sideSign) {
    return sample(s, sideSign >= 0 ? 0.25 : 0.75);
  }
  function tailCenter() {
    return centerAt(0);
  }
  function noseCenter() {
    return centerAt(1);
  }
  function endRadiusTail() {
    const prof = profileAt(0);
    return Math.max(prof.top, prof.bottom, prof.halfW);
  }
  function endRadiusNose() {
    const prof = profileAt(1);
    return Math.max(prof.top, prof.bottom, prof.halfW);
  }

  return {
    cfg,
    depth,
    width,
    noseX,
    tailX,
    bodyLen,
    envelope,
    profileAt,
    centerAt,
    sample,
    normalAt,
    topPoint,
    bottomPoint,
    sidePoint,
    tailCenter,
    noseCenter,
    endRadiusTail,
    endRadiusNose,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Body mesh: capped superellipse tube with analytic-ish smooth normals
// ─────────────────────────────────────────────────────────────────────────────

function buildBodyGeometry(shape, q) {
  const segL = q.segL;
  const segR = q.segR;
  const cols = segR + 1;
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringStarts = [];
  const capTail = clamp(shape.endRadiusTail() * 0.8, 0.0025, 0.022);
  const capNose = clamp(shape.endRadiusNose() * 0.85, 0.0025, 0.024);
  const capSteps = q.key === 'high' ? 4 : q.key === 'medium' ? 3 : 2;

  const pushRingFromSample = (sampleFn, uCoord) => {
    ringStarts.push(positions.length / 3);
    for (let j = 0; j < cols; j++) {
      const p = sampleFn(j);
      positions.push(p.x, p.y, p.z);
      uvs.push(uCoord, j / segR);
    }
  };

  // Tail cap, ordered from the pole outward so ring x increases monotonically.
  const tailProf = shape.profileAt(0);
  const tailBasePts = [];
  for (let j = 0; j < cols; j++) tailBasePts.push(shape.sample(0, j / segR));
  for (let k = capSteps; k >= 1; k--) {
    const t = k / (capSteps + 1);
    const f = Math.sqrt(Math.max(0, 1 - t * t));
    pushRingFromSample((j) => {
      const p = tailBasePts[j];
      return new THREE.Vector3(shape.tailX - capTail * t, tailProf.center.y + (p.y - tailProf.center.y) * f, tailProf.center.z + (p.z - tailProf.center.z) * f);
    }, 0);
  }

  // Main body.
  for (let i = 0; i <= segL; i++) {
    const s = i / segL;
    pushRingFromSample((j) => shape.sample(s, j / segR), s);
  }

  // Nose cap.
  const noseProf = shape.profileAt(1);
  const noseBasePts = [];
  for (let j = 0; j < cols; j++) noseBasePts.push(shape.sample(1, j / segR));
  for (let k = 1; k <= capSteps; k++) {
    const t = k / (capSteps + 1);
    const f = Math.sqrt(Math.max(0, 1 - t * t));
    pushRingFromSample((j) => {
      const p = noseBasePts[j];
      return new THREE.Vector3(shape.noseX + capNose * t, noseProf.center.y + (p.y - noseProf.center.y) * f, noseProf.center.z + (p.z - noseProf.center.z) * f);
    }, 1);
  }

  const ringCount = ringStarts.length;
  for (let r = 0; r < ringCount - 1; r++) {
    const a0 = ringStarts[r];
    const c0 = ringStarts[r + 1];
    for (let j = 0; j < segR; j++) {
      const a = a0 + j;
      const b = a + 1;
      const c = c0 + j;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }

  const tailPole = positions.length / 3;
  positions.push(shape.tailX - capTail, tailProf.center.y, tailProf.center.z);
  uvs.push(0, 0);
  for (let j = 0; j < segR; j++) {
    const a = ringStarts[0] + j;
    const b = a + 1;
    indices.push(tailPole, b, a);
  }

  const nosePole = positions.length / 3;
  positions.push(shape.noseX + capNose, noseProf.center.y, noseProf.center.z);
  uvs.push(1, 0.5);
  const lastRing = ringStarts[ringStarts.length - 1];
  for (let j = 0; j < segR; j++) {
    const a = lastRing + j;
    const b = a + 1;
    indices.push(nosePole, a, b);
  }

  const posAttr = new THREE.Float32BufferAttribute(positions, 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', posAttr);
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  // Accumulate face normals, then average the duplicated UV seam columns.
  const normals = new Float32Array(positions.length);
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3] - ax;
    const by = positions[b * 3 + 1] - ay;
    const bz = positions[b * 3 + 2] - az;
    const cx = positions[c * 3] - ax;
    const cy = positions[c * 3 + 1] - ay;
    const cz = positions[c * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    for (const v of [a, b, c]) {
      normals[v * 3] += nx;
      normals[v * 3 + 1] += ny;
      normals[v * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l;
    normals[i + 1] /= l;
    normals[i + 2] /= l;
  }
  for (let r = 0; r < ringCount; r++) {
    const start = ringStarts[r];
    const a = start;
    const b = start + segR;
    const nx = normals[a * 3] + normals[b * 3];
    const ny = normals[a * 3 + 1] + normals[b * 3 + 1];
    const nz = normals[a * 3 + 2] + normals[b * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [a, b]) {
      normals[v * 3] = nx / l;
      normals[v * 3 + 1] = ny / l;
      normals[v * 3 + 2] = nz / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
  return geo;
}

// ─────────────────────────────────────────────────────────────────────────────
// Eyes, gills, mouths and small surface details
// ─────────────────────────────────────────────────────────────────────────────

function addMesh(parent, geometry, material, name = '') {
  const mesh = new THREE.Mesh(geometry, material);
  if (name) mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function makeEye(position, direction, radius, mats, { socket = true } = {}) {
  const group = new THREE.Group();
  group.position.copy(position);
  const dir = direction.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
  group.quaternion.copy(q);
  group.name = 'eye';
  const r = Math.max(0.004, radius);

  const ball = addMesh(group, new THREE.SphereGeometry(r, 16, 12), mats.eyeBlack, 'eyeball');
  ball.castShadow = false;

  const irisR = r * 0.74;
  const irisAngle = Math.asin(clamp(irisR / r, 0.15, 0.92));
  addMesh(group, makeSphericalCap(r * 1.022, irisAngle, 24, 4), mats.iris, 'iris');

  const pupilR = r * 0.31;
  const pupilAngle = Math.asin(clamp(pupilR / r, 0.08, 0.7));
  addMesh(group, makeSphericalCap(r * 1.032, pupilAngle, 20, 3), mats.eyeBlack, 'pupil');

  const c1 = new THREE.Vector3(-0.27, 0.31, 0.91).normalize().multiplyScalar(r * 1.045);
  const c2 = new THREE.Vector3(0.22, -0.13, 0.97).normalize().multiplyScalar(r * 1.038);
  addMesh(group, new THREE.SphereGeometry(r * 0.085, 8, 6), mats.catchlight, 'catchlight-a').position.copy(c1);
  addMesh(group, new THREE.SphereGeometry(r * 0.045, 8, 6), mats.catchlight, 'catchlight-b').position.copy(c2);

  if (socket && r > 0.011) {
    const ring = addMesh(group, new THREE.TorusGeometry(r * 0.98, r * 0.07, 6, 24), mats.dark, 'eye-socket');
    ring.position.z = -r * 0.04;
  }

  return group;
}

function addEyesForBody(parent, def, cfg, shape, mats, q) {
  const type = cfg.type;
  const forward = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const radius = clamp(Math.max(shape.depth, shape.width) * 0.095 * cfg.eyeScale, 0.005, 0.052);
  for (const sign of [1, -1]) {
    const v = sign > 0 ? cfg.eyeV : 1 - cfg.eyeV;
    const u = clamp(cfg.eyeU + (sign > 0 ? 0 : 0.002), 0, 1);
    const base = shape.sample(u, v);
    const n = shape.normalAt(u, v);
    let dir = n.clone().multiplyScalar(0.86).addScaledVector(forward, type === 'shark' ? 0.34 : 0.48);
    if (type !== 'ray') dir.addScaledVector(up, 0.12);
    if (type === 'whale') dir.addScaledVector(up, -0.06);
    dir.normalize();
    const pos = base.clone().addScaledVector(n, -radius * 0.18);
    if (type !== 'ray') pos.addScaledVector(forward, radius * 0.04);
    const eye = makeEye(pos, dir, radius, mats, { socket: type !== 'ray' && type !== 'puffer' });
    parent.add(eye);
  }
}

function addTubeDetail(parent, points, radius, material, name, tubular = 10) {
  if (points.length < 2) return null;
  const geo = makeTaperedTubeGeometry(points, () => radius, tubular, 4);
  return addMesh(parent, geo, material, name);
}

function addGills(parent, def, cfg, shape, mats, q) {
  if (cfg.type === 'crab' || cfg.type === 'jelly' || cfg.type === 'shrimp' || cfg.type === 'whale') return;
  const tubes = [];
  const dark = mats.dark;
  if (cfg.type === 'shark') {
    const count = 5;
    for (const sign of [1, -1]) {
      for (let i = 0; i < count; i++) {
        const u = 0.675 + i * 0.014;
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const v = sign > 0 ? 0.14 + k * 0.034 : 0.86 - k * 0.034;
          const p = shape.sample(u + Math.sin(k * 0.9) * 0.004, v);
          const n = shape.normalAt(u, v);
          pts.push(p.addScaledVector(n, 0.0016));
        }
        tubes.push(makeTaperedTubeGeometry(pts, () => 0.0018, 8, 4));
      }
    }
  } else if (cfg.type === 'ray') {
    // Five short gill slits on the underside, behind the mouth.
    for (const sign of [1, -1]) {
      for (let i = 0; i < 5; i++) {
        const u = 0.62 + i * 0.018;
        const pts = [];
        for (let k = 0; k <= 5; k++) {
          const v = 0.5 + sign * (0.016 + k * 0.01);
          const p = shape.sample(u, v);
          const n = shape.normalAt(u, v);
          pts.push(p.addScaledVector(n, 0.0013));
        }
        tubes.push(makeTaperedTubeGeometry(pts, () => 0.0011, 6, 3));
      }
    }
  } else {
    const mainU = cfg.gillU;
    if (mainU != null) {
      for (const sign of [1, -1]) {
        const pts = [];
        for (let k = 0; k <= 8; k++) {
          const v = sign > 0 ? 0.12 + k * 0.04 : 0.88 - k * 0.04;
          const u = mainU + Math.sin(k * 0.8) * 0.008;
          const p = shape.sample(u, v);
          const n = shape.normalAt(u, v);
          pts.push(p.addScaledVector(n, 0.0015));
        }
        tubes.push(makeTaperedTubeGeometry(pts, () => 0.0026, 10, 4));
        if (q.key !== 'low') {
          for (let line = 0; line < 2; line++) {
            const pts2 = [];
            for (let k = 0; k <= 6; k++) {
              const v = sign > 0 ? 0.16 + k * 0.04 : 0.84 - k * 0.04;
              const u = mainU - 0.018 - line * 0.014 + Math.sin(k * 0.7) * 0.005;
              const p = shape.sample(u, v);
              const n = shape.normalAt(u, v);
              pts2.push(p.addScaledVector(n, 0.0016));
            }
            tubes.push(makeTaperedTubeGeometry(pts2, () => 0.0017, 8, 3));
          }
        }
      }
    }
  }
  if (tubes.length) addMesh(parent, mergeGeometries(tubes), dark, 'gills');
}

function addLateralLines(parent, def, cfg, shape, mats, q) {
  if (q.key === 'low') return;
  if (!['fish', 'eel', 'shark', 'tuna', 'puffer', 'angler', 'whale'].includes(cfg.type)) return;
  const tubes = [];
  for (const sign of [1, -1]) {
    const pts = [];
    const v0 = sign > 0 ? 0.205 : 0.795;
    for (let k = 0; k <= 16; k++) {
      const u = 0.16 + (k / 16) * 0.64;
      const v = v0 + Math.sin(k * 0.7) * (sign > 0 ? 0.008 : -0.008);
      const p = shape.sample(u, v);
      const n = shape.normalAt(u, v);
      pts.push(p.addScaledVector(n, 0.0013));
    }
    tubes.push(makeTaperedTubeGeometry(pts, () => 0.0014, 26, 3));
  }
  addMesh(parent, mergeGeometries(tubes), mats.lateral, 'lateral-line');
}

function makeLipTube(points, radius, mats, parent, name) {
  return addTubeDetail(parent, points, radius, mats.dark, name, 12);
}

function addGenericMouth(parent, def, cfg, shape, mats, rng, q) {
  const nose = shape.noseCenter();
  const prof = shape.profileAt(1);
  const w = Math.max(prof.halfW * 1.05, shape.depth * 0.075);
  const y = nose.y - shape.depth * 0.06;
  const xFront = shape.noseX + Math.min(shape.endRadiusNose() * 0.06, 0.004);
  const upper = [];
  const lower = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    const z = lerp(-w, w, t);
    const zz = Math.abs(z) / Math.max(w, 1e-4);
    const x = xFront - zz * zz * w * 0.95;
    upper.push(new THREE.Vector3(x, y + zz * zz * shape.depth * 0.012, z));
    lower.push(new THREE.Vector3(x - w * 0.06, y - shape.depth * 0.026 - zz * zz * shape.depth * 0.015, z * 0.95));
  }
  makeLipTube(upper, Math.max(0.0014, w * 0.07), mats, parent, 'upper-lip');
  makeLipTube(lower, Math.max(0.0012, w * 0.06), mats, parent, 'lower-lip');

  // A thin lower-jaw shadow makes the lip line read at portrait size.
  addTubeDetail(
    parent,
    [
      new THREE.Vector3(xFront - w * 0.1, y - shape.depth * 0.04, -w * 0.45),
      new THREE.Vector3(xFront - w * 0.03, y - shape.depth * 0.045, 0),
      new THREE.Vector3(xFront - w * 0.1, y - shape.depth * 0.04, w * 0.45),
    ],
    0.0012,
    mats.jaw,
    'lower-jaw-shadow',
    7
  );

  // A jaw/cheek seam running back along the lower head, one per side.
  for (const sign of [1, -1]) {
    const pts = [];
    for (let k = 0; k <= 10; k++) {
      const u = 0.8 + (k / 10) * 0.175;
      const v = sign > 0 ? 0.36 : 0.64;
      const p = shape.sample(u, v);
      const n = shape.normalAt(u, v);
      pts.push(p.addScaledVector(n, 0.0015));
    }
    addTubeDetail(parent, pts, 0.0018, mats.jaw, 'jaw-seam', 12);
  }

  // Paired nares just above the lip.
  if (['fish', 'eel', 'tuna', 'shrimp'].includes(cfg.type)) {
    const nr = Math.max(0.0022, shape.depth * 0.012);
    for (const sign of [1, -1]) {
      const v = sign > 0 ? 0.075 : 0.925;
      const p = shape.sample(0.955, v);
      const nrm = shape.normalAt(0.955, v);
      const dot = addMesh(parent, new THREE.SphereGeometry(nr, 8, 6), mats.dark, 'nare');
      dot.position.copy(p).addScaledVector(nrm, 0.0012);
      dot.scale.set(1.6, 0.45, 1.1);
    }
  }

  // A long jaw seam for gar/pike snouts.
  if ((shape.cfg && shape.cfg.type === 'fish') && (def.shape.snout || 0) > 0.3) {
    for (const sign of [1, -1]) {
      const pts = [];
      for (let k = 0; k <= 8; k++) {
        const u = 0.82 + (k / 8) * 0.16;
        const v = sign > 0 ? 0.31 : 0.69;
        const p = shape.sample(u, v);
        const n = shape.normalAt(u, v);
        pts.push(p.addScaledVector(n, 0.0015));
      }
      addTubeDetail(parent, pts, 0.0014, mats.dark, 'jaw-seam', 10);
    }
  }
}

function addAnglerMouth(parent, def, cfg, shape, mats, rng, q) {
  const nose = shape.noseCenter();
  const capNose = Math.min(shape.endRadiusNose() * 0.85, 0.024);
  const rx = shape.depth * 0.29;
  const ry = shape.depth * 0.21;
  const xFront = shape.noseX + capNose + 0.001;

  // The oral cavity is a black, slightly cupped disc.
  const cavity = new THREE.CircleGeometry(1, 32);
  cavity.scale(rx, ry, 1);
  cavity.rotateY(Math.PI / 2);
  const m = addMesh(parent, cavity, mats.dark, 'mouth-cavity');
  m.position.set(xFront, nose.y - shape.depth * 0.025, 0);

  // Thick lips.
  const upper = [];
  const lower = [];
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    const a = Math.PI * (0.08 + t * 0.84);
    const z = Math.cos(a) * rx * 1.05;
    const yy = Math.sin(a) * ry * 1.05;
    upper.push(new THREE.Vector3(xFront - 0.003, nose.y - shape.depth * 0.025 + yy, z));
    lower.push(new THREE.Vector3(xFront - 0.005, nose.y - shape.depth * 0.025 - yy, z));
  }
  addTubeDetail(parent, upper, Math.max(0.002, rx * 0.07), mats.dark, 'upper-jaw', 16);
  addTubeDetail(parent, lower, Math.max(0.002, rx * 0.07), mats.dark, 'lower-jaw', 16);

  // A fleshy outer lip collar blends the maw into the head.
  const collar = [];
  for (let k = 0; k <= 24; k++) {
    const a = (k / 24) * TAU;
    collar.push(new THREE.Vector3(xFront - 0.006, nose.y - shape.depth * 0.025 + Math.sin(a) * ry * 1.18, Math.cos(a) * rx * 1.18));
  }
  collar.push(collar[0].clone());
  addTubeDetail(parent, collar, Math.max(0.004, rx * 0.055), mats.jaw, 'mouth-collar', 28);

  // A low, fleshy tongue catching the cold light.
  const tongueGeo = new THREE.SphereGeometry(1, 16, 10);
  tongueGeo.scale(rx * 0.48, ry * 0.22, rx * 0.46);
  const tongue = addMesh(parent, tongueGeo, mats.tongue, 'tongue');
  tongue.position.set(xFront + 0.004, nose.y - shape.depth * 0.025 - ry * 0.26, 0);

  // Teeth.
  const teeth = [];
  const upperCount = 9;
  const lowerCount = 8;
  for (let i = 0; i < upperCount; i++) {
    const t = i / (upperCount - 1);
    const a = Math.PI * (0.11 + t * 0.78);
    const z = Math.cos(a) * rx * 0.93;
    const yy = Math.sin(a) * ry * 0.82;
    const r = Math.max(0.002, rx * (0.07 + (i % 3) * 0.012));
    const h = ry * (0.25 + (i % 3) * 0.06);
    const geo = new THREE.ConeGeometry(r, h, 6, 1, false);
    geo.translate(0, -h * 0.5, 0);
    geo.rotateZ(Math.PI * 0.06);
    geo.translate(xFront - 0.002, nose.y - shape.depth * 0.025 + yy - h * 0.2, z);
    teeth.push(geo);
  }
  for (let i = 0; i < lowerCount; i++) {
    const t = i / (lowerCount - 1);
    const a = Math.PI * (0.14 + t * 0.72);
    const z = Math.cos(a) * rx * 0.88;
    const yy = Math.sin(a) * ry * 0.75;
    const r = Math.max(0.0018, rx * (0.065 + (i % 2) * 0.015));
    const h = ry * (0.22 + (i % 2) * 0.08);
    const geo = new THREE.ConeGeometry(r, h, 6, 1, false);
    geo.translate(0, -h * 0.5, 0);
    geo.rotateZ(-Math.PI * 0.06);
    geo.translate(xFront - 0.002, nose.y - shape.depth * 0.025 - yy + h * 0.2, z);
    teeth.push(geo);
  }
  addMesh(parent, mergeGeometries(teeth), mats.bone, 'teeth');
}

function addSharkMouth(parent, def, cfg, shape, mats, rng, q) {
  const nose = shape.noseCenter();
  const s = 0.875;
  const prof = shape.profileAt(s);
  const w = Math.max(shape.width * 0.3, 0.02);
  const y = shape.sample(s, 0.5).y - shape.depth * 0.015;
  const x = shape.sample(s, 0.5).x;
  const upper = [];
  const lower = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const z = lerp(-w, w, t);
    const zz = Math.abs(z) / Math.max(w, 1e-4);
    upper.push(new THREE.Vector3(x + 0.006 - zz * zz * w * 0.45, y + shape.depth * 0.018, z));
    lower.push(new THREE.Vector3(x - 0.002 - zz * zz * w * 0.4, y - shape.depth * 0.018, z * 0.94));
  }
  addTubeDetail(parent, upper, 0.0022, mats.dark, 'shark-upper-lip', 14);
  addTubeDetail(parent, lower, 0.002, mats.dark, 'shark-lower-lip', 14);
  const teeth = [];
  for (let i = 0; i < 13; i++) {
    const t = i / 12;
    const z = lerp(-w * 0.9, w * 0.9, t);
    const h = 0.014 + (i % 2) * 0.006;
    const geo = new THREE.ConeGeometry(0.0035, h, 5, 1, false);
    geo.translate(0, -h * 0.5, 0);
    geo.rotateZ(Math.PI);
    geo.translate(x + 0.002, y - shape.depth * 0.018 + h * 0.1, z);
    teeth.push(geo);
  }
  addMesh(parent, mergeGeometries(teeth), mats.bone, 'shark-teeth');
}

function addPufferMouth(parent, def, cfg, shape, mats, rng, q) {
  const nose = shape.noseCenter();
  const capNose = Math.min(shape.endRadiusNose() * 0.85, 0.024);
  const mouthR = Math.max(0.012, shape.depth * 0.055);
  const torus = new THREE.TorusGeometry(mouthR, mouthR * 0.32, 8, 20);
  torus.rotateY(Math.PI / 2);
  const m = addMesh(parent, torus, mats.dark, 'puffer-lips');
  m.position.set(shape.noseX + capNose + 0.001, nose.y - shape.depth * 0.04, 0);
  const inner = new THREE.CircleGeometry(mouthR * 0.68, 20);
  inner.rotateY(Math.PI / 2);
  const im = addMesh(parent, inner, mats.dark, 'puffer-mouth');
  im.position.copy(m.position).add(new THREE.Vector3(0.001, 0, 0));
}

function addWhaleMouth(parent, def, cfg, shape, mats, rng, q) {
  const nose = shape.noseCenter();
  for (const sign of [1, -1]) {
    const pts = [];
    for (let k = 0; k <= 16; k++) {
      const u = 0.97 - (k / 16) * 0.27;
      const v = sign > 0 ? 0.355 : 0.645;
      const p = shape.sample(u, v);
      const n = shape.normalAt(u, v);
      pts.push(p.addScaledVector(n, 0.0016));
    }
    addTubeDetail(parent, pts, 0.0028, mats.dark, 'whale-jaw', 18);
  }
  const mouth = new THREE.CircleGeometry(1, 24);
  mouth.scale(shape.width * 0.34, shape.depth * 0.05, 1);
  mouth.rotateY(Math.PI / 2);
  const mouthMesh = addMesh(parent, mouth, mats.dark, 'whale-mouth');
  mouthMesh.position.set(shape.noseX + 0.001, nose.y - shape.depth * 0.11, 0);

  // A row of pale teeth along the jaw seam.
  const teeth = [];
  for (const sign of [1, -1]) {
    for (let k = 0; k < 8; k++) {
      const u = 0.72 + (k / 7) * 0.23;
      const v = sign > 0 ? 0.355 : 0.645;
      const p = shape.sample(u, v);
      const nrm = shape.normalAt(u, v);
      const h = 0.018 + (k % 3) * 0.004;
      const geo = new THREE.ConeGeometry(0.0035, h, 5, 1, false);
      geo.translate(0, -h * 0.5, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0));
      geo.applyMatrix4(new THREE.Matrix4().compose(p.clone().addScaledVector(nrm, 0.003), quat, new THREE.Vector3(1, 1, 1)));
      teeth.push(geo);
    }
  }
  addMesh(parent, mergeGeometries(teeth), mats.bone, 'whale-teeth');

  // Throat grooves.
  const grooves = [];
  for (let i = 0; i < 6; i++) {
    const pts = [];
    const v = 0.455 + i * 0.011;
    for (let k = 0; k <= 12; k++) {
      const u = 0.78 - (k / 12) * 0.43;
      const p = shape.sample(u, v);
      const n = shape.normalAt(u, v);
      pts.push(p.addScaledVector(n, 0.0013));
    }
    grooves.push(makeTaperedTubeGeometry(pts, () => 0.0012, 14, 3));
  }
  addMesh(parent, mergeGeometries(grooves), mats.shellDark, 'throat-grooves');

  // Blowhole.
  const bh = new THREE.CircleGeometry(0.014, 16);
  bh.scale(1.7, 1, 1);
  const bm = addMesh(parent, bh, mats.dark, 'blowhole');
  bm.position.set(shape.noseX - shape.bodyLen * 0.14, shape.sample(0.86, 0).y + 0.001, 0);
  bm.rotation.x = -Math.PI / 2;
}

function addRayMouth(parent, def, cfg, shape, mats, rng, q) {
  const nose = shape.noseCenter();
  const w = Math.max(shape.width * 0.7, 0.04);
  const pts = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const z = lerp(-w, w, t);
    const zz = Math.abs(z) / Math.max(w, 1e-4);
    pts.push(new THREE.Vector3(shape.noseX - 0.02 - zz * zz * w * 0.3, nose.y - shape.depth * 0.36, z * 0.9));
  }
  addTubeDetail(parent, pts, 0.0022, mats.dark, 'ray-mouth', 14);
  for (const sign of [1, -1]) {
    const n = addMesh(parent, new THREE.SphereGeometry(0.007, 8, 6), mats.dark, 'nostril');
    n.position.set(shape.noseX - 0.04, nose.y - shape.depth * 0.31, sign * w * 0.45);
    n.scale.y = 0.5;
  }
}

function addSpikes(parent, def, cfg, shape, mats, rng, q) {
  if (!def.shape.spikes) return;
  const stonefish = cfg.type === 'angler';
  const count = stonefish
    ? q.key === 'high' ? 18 : 11
    : q.key === 'high' ? (cfg.isBoss ? 74 : 54) : q.key === 'medium' ? 38 : 26;
  const spikeGeos = [];
  const glowGeos = [];
  const boss = cfg.isBoss;
  for (let i = 0; i < count; i++) {
    const s = stonefish ? 0.28 + rng() * 0.5 : 0.1 + rng() * 0.76;
    const v = stonefish
      ? rng() < 0.68
        ? rng() * 0.13
        : 0.87 + rng() * 0.13
      : rng() < 0.5 ? rng() * 0.38 : 0.62 + rng() * 0.38;
    const base = shape.sample(s, v);
    const n = shape.normalAt(s, v);
    const r = Math.max(0.0035, shape.depth * (0.011 + rng() * 0.006) * (stonefish ? 1.7 : boss ? 1.5 : 1));
    const h = Math.max(0.008, shape.depth * (0.032 + rng() * 0.03) * (stonefish ? 1.9 : boss ? 1.7 : 1));
    const geo = new THREE.ConeGeometry(r, h, 6, 1, false);
    geo.translate(0, h * 0.5, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
    const mat = new THREE.Matrix4().compose(base.clone().addScaledVector(n, -0.002), quat, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(mat);
    if (boss && i % 9 === 0) glowGeos.push(geo.clone());
    spikeGeos.push(geo);
  }
  addMesh(parent, mergeGeometries(spikeGeos), mats.bone, 'spines');
  if (glowGeos.length) addMesh(parent, mergeGeometries(glowGeos), mats.glowSolid, 'glowing-spines');
}

function addWhiskers(parent, def, cfg, shape, mats, rng, q) {
  if ((def.id || '') !== 'mud_catfish') return;
  const nose = shape.noseCenter();
  const tubes = [];
  for (const sign of [1, -1]) {
    for (let k = 0; k < 2; k++) {
      const start = new THREE.Vector3(shape.noseX - shape.bodyLen * 0.035, nose.y - shape.depth * 0.06 + k * 0.012, sign * (0.012 + k * 0.008));
      const pts = [
        start,
        start.clone().add(new THREE.Vector3(shape.bodyLen * 0.06, -0.02 - k * 0.006, sign * (0.02 + k * 0.012))),
        start.clone().add(new THREE.Vector3(shape.bodyLen * 0.1, -0.055 - k * 0.02, sign * (0.045 + k * 0.025))),
        start.clone().add(new THREE.Vector3(shape.bodyLen * 0.08, -0.085 - k * 0.02, sign * (0.075 + k * 0.035))),
      ];
      tubes.push(makeTaperedTubeGeometry(pts, (t) => 0.0024 * (1 - t * 0.55), 12, 4));
    }
  }
  addMesh(parent, mergeGeometries(tubes), mats.whisker, 'barbels');
}

function addRockyBumps(parent, def, cfg, shape, mats, rng, q) {
  if (!def.shape.spikes || cfg.type !== 'angler') return;
  const count = q.key === 'high' ? 18 : 10;
  const geos = [];
  for (let i = 0; i < count; i++) {
    const s = 0.18 + rng() * 0.62;
    const v = rng() < 0.5 ? rng() * 0.35 : 0.65 + rng() * 0.35;
    const base = shape.sample(s, v);
    const n = shape.normalAt(s, v);
    const radius = shape.depth * (0.035 + rng() * 0.04);
    const geo = new THREE.SphereGeometry(radius, 8, 6);
    geo.scale(1, 0.55 + rng() * 0.2, 1);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
    const mat = new THREE.Matrix4().compose(base.clone().addScaledVector(n, -radius * 0.55), quat, new THREE.Vector3(1, 1, 1));
    geo.applyMatrix4(mat);
    geos.push(geo);
  }
  addMesh(parent, mergeGeometries(geos), mats.skin, 'rocky-bumps');
}

function addPhotophores(parent, def, cfg, shape, mats, rng, q) {
  if (cfg.type !== 'angler' || !def.shape.glow) return;
  const geos = [];
  for (const sign of [1, -1]) {
    for (let i = 0; i < 8; i++) {
      const u = 0.2 + i * 0.065;
      const v = sign > 0 ? 0.34 : 0.66;
      const p = shape.sample(u, v);
      const n = shape.normalAt(u, v);
      const r = 0.0045 + (i % 3) * 0.0013;
      const geo = new THREE.SphereGeometry(r, 8, 6);
      geo.translate(p.x + n.x * 0.0025, p.y + n.y * 0.0025, p.z + n.z * 0.0025);
      geos.push(geo);
    }
  }
  addMesh(parent, mergeGeometries(geos), mats.glowSolid, 'photophores');
}

function addLure(parent, def, cfg, shape, mats, rng, q) {
  if (cfg.type !== 'angler' || !(def.shape.glow)) return;
  const base = shape.sample(0.7, 0).add(new THREE.Vector3(0, shape.depth * 0.02, 0));
  const pivot = new THREE.Group();
  pivot.position.copy(base);
  pivot.name = 'lure';
  parent.add(pivot);
  const pts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(shape.bodyLen * 0.035, shape.depth * 0.18, 0.004),
    new THREE.Vector3(shape.bodyLen * 0.075, shape.depth * 0.27, 0.008),
    new THREE.Vector3(shape.bodyLen * 0.115, shape.depth * 0.21, 0.006),
  ];
  const stalk = makeTaperedTubeGeometry(pts, (t) => 0.0024 * (1 - t * 0.55), 12, 4);
  addMesh(pivot, stalk, mats.whisker, 'illicium');
  const tip = pts[pts.length - 1].clone();
  const bulb = addMesh(pivot, new THREE.SphereGeometry(0.018, 14, 10), mats.glowSolid, 'lure-bulb');
  bulb.position.copy(tip);
  const halo = addMesh(pivot, new THREE.SphereGeometry(0.033, 14, 10), mats.glow, 'lure-halo');
  halo.position.copy(tip);
  parent.userData.lurePivot = pivot;
  parent.userData.lureBulb = bulb;
}

function addBossDetails(parent, def, cfg, shape, mats, rng, q) {
  if (!cfg.isBoss) return;
  const barnacles = [];
  const scars = [];
  const veins = [];
  const barnacleCount = q.key === 'high' ? 20 : 11;
  for (let i = 0; i < barnacleCount; i++) {
    const s = 0.22 + rng() * 0.58;
    const v = rng() < 0.5 ? 0.02 + rng() * 0.3 : 0.68 + rng() * 0.3;
    const base = shape.sample(s, v);
    const n = shape.normalAt(s, v);
    const r = 0.008 + rng() * 0.012;
    const h = 0.007 + rng() * 0.01;
    const geo = new THREE.CylinderGeometry(r * 0.45, r, h, 7, 1, false);
    geo.translate(0, h * 0.5, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
    geo.applyMatrix4(new THREE.Matrix4().compose(base.clone().addScaledVector(n, -0.001), quat, new THREE.Vector3(1, 1, 1)));
    barnacles.push(geo);
  }
  addMesh(parent, mergeGeometries(barnacles), mats.barnacle, 'barnacles');

  for (let i = 0; i < (q.key === 'high' ? 8 : 4); i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const s0 = 0.2 + rng() * 0.5;
    const v0 = sign > 0 ? 0.16 + rng() * 0.22 : 0.84 - rng() * 0.22;
    const pts = [];
    const len = 0.06 + rng() * 0.1;
    for (let k = 0; k <= 5; k++) {
      const s = clamp(s0 + (k / 5) * len, 0.03, 0.95);
      const v = clamp(v0 + (rng() - 0.5) * 0.04, 0.02, 0.98);
      const p = shape.sample(s, v);
      const n = shape.normalAt(s, v);
      pts.push(p.addScaledVector(n, 0.0017));
    }
    scars.push(makeTaperedTubeGeometry(pts, (t) => 0.0022 * (1 - t * 0.6), 8, 3));
  }
  addMesh(parent, mergeGeometries(scars), mats.scar, 'scars');

  if (def.shape.glow || (def.boss && def.boss.color)) {
    for (const sign of [1, -1]) {
      const pts = [];
      const v = sign > 0 ? 0.27 : 0.73;
      for (let k = 0; k <= 18; k++) {
        const s = 0.24 + (k / 18) * 0.5;
        const p = shape.sample(s, v + Math.sin(k * 0.6) * 0.02);
        const n = shape.normalAt(s, v);
        pts.push(p.addScaledVector(n, 0.002));
      }
      veins.push(makeTaperedTubeGeometry(pts, (t) => 0.0018 * (0.4 + Math.sin(t * Math.PI) * 0.6), 20, 3));
      for (let b = 0; b < 3; b++) {
        const pts2 = [];
        const s0 = 0.34 + b * 0.12;
        for (let k = 0; k <= 5; k++) {
          const s = s0 + (k / 5) * 0.06;
          const p = shape.sample(s, v + (k / 5) * (sign > 0 ? -0.12 : 0.12));
          const n = shape.normalAt(s, v);
          pts2.push(p.addScaledVector(n, 0.0018));
        }
        veins.push(makeTaperedTubeGeometry(pts2, () => 0.0012, 7, 3));
      }
    }
    addMesh(parent, mergeGeometries(veins), mats.glow, 'tide-veins');
  }
}

function addCrest(parent, def, cfg, shape, mats, rng, q) {
  if (!(def.id === 'oarfish')) return;
  const n = 10;
  const base = [];
  const dirs = [];
  const heights = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 0.78 + t * 0.14;
    const p = shape.topPoint(u);
    const nrm = shape.normalAt(u, 0);
    base.push(p.addScaledVector(nrm, -0.002));
    dirs.push(new THREE.Vector3(-0.12, 1, 0));
    heights.push(0.035 + Math.sin(t * Math.PI) * 0.11 + t * 0.02);
  }
  const geo = makeRidgeFinGeometry({ basePoints: base, dirs, heights, normal: new THREE.Vector3(0, 0, 1), rows: 8, bow: 0.002 });
  const edge = ridgeFinEdgePoints({ basePoints: base, dirs, heights, normal: new THREE.Vector3(0, 0, 1), bow: 0.002 });
  const group = new THREE.Group();
  addMesh(group, geo, mats.fin, 'crest');
  if (q.key !== 'low') addTubeDetail(group, edge, 0.0018, mats.finEdge, 'crest-edge', 14);
  parent.add(group);
}

// ─────────────────────────────────────────────────────────────────────────────
// Fins
// ─────────────────────────────────────────────────────────────────────────────

function makeFinAssembly({ geometry, material, edgePoints = null, edgeRadius = 0.0016, rays = null, edgeMaterial, rayMaterial, q, name = 'fin' }) {
  const group = new THREE.Group();
  group.name = name;
  if (geometry) {
    const mesh = addMesh(group, geometry, material, `${name}-membrane`);
    mesh.castShadow = false;
  }
  if (edgePoints && edgePoints.length > 1 && q.key !== 'low') {
    addTubeDetail(group, edgePoints, edgeRadius, edgeMaterial, `${name}-edge`, 14);
  }
  if (rays && rays.length && q.key === 'high') {
    const lines = makeFinRayLines(rays, rayMaterial, new THREE.Vector3(0, 0, 1), 0.0012);
    lines.name = `${name}-rays`;
    group.add(lines);
  }
  return group;
}

function tailRadiusFn(type, torn, rng) {
  return (t) => {
    const a = Math.abs(t);
    let r;
    if (type === 'crescent') {
      r = 0.16 + 0.9 * Math.pow(a, 0.8);
    } else if (type === 'round') {
      r = 0.6 + 0.4 * Math.cos((a * Math.PI) / 2);
    } else if (type === 'fan') {
      r = 0.74 + 0.26 * Math.cos(a * Math.PI * 0.82);
    } else if (type === 'fluke') {
      r = 0.26 + 0.78 * Math.pow(a, 0.85);
    } else {
      r = 0.4 + 0.6 * Math.pow(a, 0.72);
      r *= 1 - 0.14 * Math.pow(a, 4.2);
    }
    if (torn) {
      const notch = Math.abs(Math.sin(t * 15.7 + 1.3));
      r *= 1 - 0.12 * notch * (0.35 + a * 0.65);
    }
    return clamp(r, 0.03, 1.05);
  };
}

function buildTail(def, cfg, shape, mats, rng, q) {
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.copy(shape.tailCenter());
  const type = cfg.tailType || def.shape.tail || 'fork';
  const typeMap = { fork: 'fork', round: 'round', fan: 'fan', crescent: 'crescent', whip: 'whip', fluke: 'fluke', none: 'none' };
  const tailShape = typeMap[type] || 'fork';
  const isRay = cfg.type === 'ray';
  const isEel = cfg.type === 'eel';
  const isWhale = cfg.type === 'whale';
  const torn = cfg.torn;

  if (tailShape === 'whip' || isRay) {
    const len = isRay ? 0.34 : 0.075 + Math.max(0.02, shape.bodyLen * 0.13);
    const baseR = isRay ? Math.max(0.014, shape.endRadiusTail() * 0.62) : Math.max(0.012, shape.endRadiusTail() * 0.78);
    const wave = isRay ? 0.03 : 0.012;
    const pts = [
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-len * 0.28, wave * 0.6, -0.006),
      new THREE.Vector3(-len * 0.55, wave * 0.2, 0.004),
      new THREE.Vector3(-len * 0.8, -wave * 0.3, 0.008),
      new THREE.Vector3(-len, -wave * 0.6, 0.004),
    ];
    const whip = makeTaperedTubeGeometry(pts, (t) => Math.max(0.0009, baseR * Math.pow(1 - t, 0.72)), 22, isRay ? 6 : 5);
    addMesh(tail, whip, mats.skin, 'whip-tail');
    if (isEel) {
      const basePts = pts.map((p) => p.clone().add(new THREE.Vector3(0, 0.002, 0)));
      const dirs = basePts.map(() => new THREE.Vector3(-0.08, 1, 0));
      const heights = basePts.map((_, i) => 0.016 + Math.sin((i / (basePts.length - 1)) * Math.PI) * 0.012);
      const geo = makeRidgeFinGeometry({ basePoints: basePts, dirs, heights, normal: new THREE.Vector3(0, 0, 1), rows: 5, bow: 0.001 });
      addMesh(tail, geo, mats.fin, 'tail-fin');
    }
    if (isRay) {
      // A barb and two small lateral keels make the whip read as a ray tail.
      const barbGeo = new THREE.ConeGeometry(0.007, 0.06, 5, 1, false);
      barbGeo.translate(0, 0.03, 0);
      barbGeo.rotateZ(0.32);
      const barb = addMesh(tail, barbGeo, mats.bone, 'stinger');
      barb.position.set(-len * 0.28, 0.005, 0);
      const barb2 = barb.clone();
      barb2.position.set(-len * 0.23, 0.002, 0.0);
      barb2.scale.setScalar(0.65);
      tail.add(barb2);
    }
    tail.userData.tailAxis = 'y';
    tail.userData.tailAmp = isRay ? 0.1 : 0.16;
    tail.userData.tailFreq = isRay ? 1.15 : 1.8;
    return tail;
  }

  if (tailShape === 'none') {
    tail.userData.tailAxis = 'y';
    tail.userData.tailAmp = 0;
    return tail;
  }

  // Broad caudal fin.
  let spread = 0.92;
  let size;
  let asym = 1;
  let material = mats.fin;
  let edgeMat = mats.finEdge;
  let axis = new THREE.Vector3(-1, 0, 0);
  let side = new THREE.Vector3(0, 1, 0);
  let normal = new THREE.Vector3(0, 0, 1);
  let bow = 0.003;
  if (tailShape === 'fork') spread = 0.94;
  if (tailShape === 'round') spread = 1.02;
  if (tailShape === 'fan') spread = 1.2;
  if (tailShape === 'crescent') spread = 0.98;
  if (cfg.type === 'shark') {
    size = Math.max(0.17, shape.depth * 1.25);
    asym = 1.14;
  } else if (cfg.type === 'tuna') {
    size = Math.max(0.17, shape.depth * 1.15);
    asym = 1.05;
  } else if (cfg.type === 'puffer') {
    size = 0.115;
  } else if (cfg.type === 'angler') {
    size = Math.max(0.12, shape.bodyLen * 0.19);
  } else if (isWhale) {
    size = Math.max(0.2, shape.depth * 1.3);
    material = mats.skin;
    axis = new THREE.Vector3(-1, 0, 0);
    side = new THREE.Vector3(0, 0, 1);
    normal = new THREE.Vector3(0, 1, 0);
    spread = 1.02;
    bow = 0.006;
  } else {
    const longSnout = (def.shape.snout || 0) > 0.3;
    size = Math.max(longSnout ? 0.12 : 0.09, shape.depth * (longSnout ? 0.95 : 0.76));
  }
  const radiusFn = tailRadiusFn(tailShape, torn, rng);
  const geo = makePolarFinGeometry({
    rows: q.key === 'high' ? 12 : 8,
    cols: q.key === 'high' ? 30 : 20,
    spread,
    radiusFn: (t) => radiusFn(t) * size,
    axis,
    side,
    normal,
    bow,
    asym,
  });
  if (isWhale) {
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const sx = bb.max.x - bb.min.x || 1;
    const sz = bb.max.z - bb.min.z || 1;
    for (let i = 0; i < pos.count; i++) {
      uv.setXY(i, (pos.getX(i) - bb.min.x) / sx, (pos.getZ(i) - bb.min.z) / sz);
    }
    uv.needsUpdate = true;
  }
  const edgePts = polarFinEdgePoints({ cols: 30, spread, radiusFn: (t) => radiusFn(t) * size, axis, side, normal, asym });
  const rays = polarFinRays({ rows: 12, cols: 30, spread, radiusFn: (t) => radiusFn(t) * size, axis, side, normal, bow, asym, rayCount: 13 });
  const assembly = makeFinAssembly({
    geometry: geo,
    material,
    edgePoints: edgePts,
    edgeRadius: isWhale ? 0.0022 : 0.0018,
    rays: isWhale ? null : rays,
    edgeMaterial: edgeMat,
    rayMaterial: mats.finRay,
    q,
    name: 'caudal-fin',
  });
  tail.add(assembly);
  tail.userData.tailAxis = isWhale ? 'z' : 'y';
  tail.userData.tailAmp = isWhale ? 0.22 : cfg.type === 'eel' ? 0.22 : cfg.type === 'shark' ? 0.14 : cfg.type === 'tuna' ? 0.12 : 0.18;
  tail.userData.tailFreq = isWhale ? 1.35 : 2.15;
  return tail;
}

function buildRidgeFin(parent, { basePoints, dirs, heights, normal, q, mats, material = null, name = 'fin', edgeRadius = 0.0016, rays = true, rows = 10, bow = 0.002 }) {
  const geo = makeRidgeFinGeometry({ basePoints, dirs, heights, normal, rows, bow });
  const edgePts = ridgeFinEdgePoints({ basePoints, dirs, heights, normal, bow });
  const rayList = rays ? makeRidgeFinRays({ basePoints, dirs, heights, normal, count: Math.min(14, Math.max(4, basePoints.length - 1)) }) : null;
  const assembly = makeFinAssembly({
    geometry: geo,
    material: material || mats.fin,
    edgePoints: edgePts,
    edgeRadius,
    rays: rayList,
    edgeMaterial: mats.finEdge,
    rayMaterial: mats.finRay,
    q,
    name,
  });
  parent.add(assembly);
  return assembly;
}

function buildDorsalFin(parent, def, cfg, shape, mats, rng, q) {
  if (['ray', 'crab', 'jelly', 'shrimp'].includes(cfg.type)) return;
  const dorsal = def.shape.dorsal || 'small';
  if (dorsal === 'none') return;
  const type = cfg.type;
  let u0 = 0.3;
  let u1 = 0.55;
  let hMax = Math.max(0.025, shape.depth * 0.2);
  let n = q.key === 'high' ? 22 : 14;
  let lean = -0.18;
  let mode = 'small';

  const longSnout = (def.shape.snout || 0) > 0.3 && type === 'fish';
  if (dorsal === 'spiny') {
    u0 = longSnout ? 0.12 : 0.26;
    u1 = longSnout ? 0.36 : 0.63;
    hMax = Math.max(0.04, shape.depth * (longSnout ? 0.4 : 0.42));
    n = q.key === 'high' ? 30 : 20;
    mode = 'spiny';
    lean = -0.12;
  } else if (dorsal === 'long') {
    u0 = type === 'eel' ? 0.07 : 0.18;
    u1 = type === 'eel' ? 0.9 : 0.68;
    hMax = Math.max(0.028, shape.depth * (type === 'eel' ? 0.18 : 0.26));
    n = q.key === 'high' ? 28 : 18;
    mode = 'long';
    lean = -0.1;
  } else if (dorsal === 'sail') {
    if (type === 'shark') {
      u0 = 0.32;
      u1 = 0.52;
      hMax = Math.max(0.12, shape.depth * 0.94);
      n = q.key === 'high' ? 20 : 13;
    } else if (type === 'tuna') {
      u0 = 0.33;
      u1 = 0.52;
      hMax = Math.max(0.12, shape.depth * 0.8);
      n = q.key === 'high' ? 20 : 13;
    } else {
      u0 = 0.47;
      u1 = 0.65;
      hMax = Math.max(0.12, shape.depth * 0.62);
      n = q.key === 'high' ? 20 : 13;
    }
    mode = 'sail';
    lean = -0.28;
  } else {
    // small
    if (longSnout) {
      u0 = 0.13;
      u1 = 0.34;
      hMax = Math.max(0.035, shape.depth * 0.22);
    } else if (type === 'puffer') {
      u0 = 0.2;
      u1 = 0.33;
      hMax = Math.max(0.032, shape.depth * 0.1);
    } else if (type === 'angler') {
      u0 = 0.23;
      u1 = 0.37;
      hMax = Math.max(0.035, shape.depth * 0.11);
    } else if (type === 'whale') {
      u0 = 0.16;
      u1 = 0.27;
      hMax = Math.max(0.03, shape.depth * 0.17);
    } else if (type === 'tuna') {
      u0 = 0.38;
      u1 = 0.5;
      hMax = Math.max(0.04, shape.depth * 0.18);
    } else {
      u0 = 0.29;
      u1 = 0.52;
      hMax = Math.max(0.04, shape.depth * 0.24);
    }
    n = q.key === 'high' ? 16 : 10;
    mode = 'small';
  }

  const basePoints = [];
  const dirs = [];
  const heights = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = lerp(u0, u1, t);
    const p = shape.topPoint(u);
    const nrm = shape.normalAt(u, 0);
    basePoints.push(p.addScaledVector(nrm, -0.002));
    dirs.push(new THREE.Vector3(lean, 1, 0).normalize());
    let h = hMax;
    if (mode === 'spiny') {
      const env = smoothstep(0, 0.05, t) * (1 - smoothstep(0.9, 1, t));
      const spikes = 0.2 + 0.8 * Math.pow(Math.abs(Math.sin(t * Math.PI * 5.2 + 0.45)), 1.45);
      h = hMax * env * spikes * (1 - 0.2 * t);
    } else if (mode === 'sail') {
      h = hMax * (0.12 + 0.88 * smoothstep(0, 0.66, t)) * (1 - 0.78 * smoothstep(0.83, 1, t));
      h *= 0.72 + 0.28 * Math.sin((t * 1.2 + 0.1) * Math.PI);
    } else if (mode === 'long') {
      h = hMax * (0.68 + 0.32 * Math.sin(t * Math.PI * 3.1 + 1.2)) * (0.5 + 0.5 * Math.sin(Math.PI * clamp(t * 1.05)));
    } else {
      h = hMax * Math.pow(Math.sin(Math.PI * clamp(t * 0.98 + 0.01)), 0.72) * (0.75 + 0.25 * t);
    }
    if (cfg.torn) {
      const notch = Math.abs(Math.sin(t * 12.7 + 2.2));
      h *= 1 - 0.36 * notch * (0.25 + t * 0.75);
    }
    heights.push(Math.max(0.004, h));
  }
  buildRidgeFin(parent, {
    basePoints,
    dirs,
    heights,
    normal: new THREE.Vector3(0, 0, 1),
    q,
    mats,
    name: 'dorsal-fin',
    edgeRadius: hMax > 0.1 ? 0.0022 : 0.0015,
    rows: q.key === 'high' ? 12 : 7,
  });

  // A shark's second dorsal, kept tiny and far back.
  if (type === 'shark' && q.key !== 'low') {
    const b2 = [];
    const d2 = [];
    const h2 = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const u = 0.14 + t * 0.09;
      const p = shape.topPoint(u);
      const nrm = shape.normalAt(u, 0);
      b2.push(p.addScaledVector(nrm, -0.002));
      d2.push(new THREE.Vector3(-0.2, 1, 0).normalize());
      h2.push(0.022 * Math.sin(Math.PI * clamp(t * 0.9 + 0.05)));
    }
    buildRidgeFin(parent, { basePoints: b2, dirs: d2, heights: h2, normal: new THREE.Vector3(0, 0, 1), q, mats, name: 'second-dorsal', rays: false, rows: 6 });
  }
}

function buildAnalFin(parent, def, cfg, shape, mats, rng, q) {
  if (['ray', 'crab', 'jelly', 'whale', 'shrimp'].includes(cfg.type)) return;
  const type = cfg.type;
  let u0 = 0.18;
  let u1 = 0.39;
  let hMax = Math.max(0.025, shape.depth * 0.18);
  let n = q.key === 'high' ? 18 : 12;
  const longSnout = (def.shape.snout || 0) > 0.3 && type === 'fish';
  if (longSnout) {
    u0 = 0.11;
    u1 = 0.31;
    hMax = Math.max(0.04, shape.depth * 0.22);
  }
  if (type === 'eel') {
    u0 = 0.06;
    u1 = 0.82;
    hMax = Math.max(0.018, shape.depth * 0.18);
    n = q.key === 'high' ? 26 : 16;
  } else if (type === 'puffer') {
    u0 = 0.17;
    u1 = 0.27;
    hMax = Math.max(0.025, shape.depth * 0.075);
  } else if (type === 'angler') {
    u0 = 0.18;
    u1 = 0.3;
    hMax = Math.max(0.025, shape.depth * 0.075);
  } else if (type === 'shark') {
    u0 = 0.17;
    u1 = 0.29;
    hMax = Math.max(0.04, shape.depth * 0.24);
  }
  const basePoints = [];
  const dirs = [];
  const heights = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = lerp(u0, u1, t);
    const p = shape.bottomPoint(u);
    const nrm = shape.normalAt(u, 0.5);
    basePoints.push(p.addScaledVector(nrm, -0.002));
    dirs.push(new THREE.Vector3(-0.12, -1, 0).normalize());
    let h = hMax * Math.pow(Math.sin(Math.PI * clamp(t * 0.97 + 0.015)), 0.7) * (0.75 + 0.25 * t);
    if (type === 'eel') h = hMax * (0.62 + 0.38 * Math.sin(t * Math.PI * 3.3 + 1.6)) * (0.55 + 0.45 * Math.sin(Math.PI * clamp(t)));
    if (cfg.torn) h *= 1 - 0.3 * Math.abs(Math.sin(t * 10.3 + 0.4));
    heights.push(Math.max(0.003, h));
  }
  buildRidgeFin(parent, {
    basePoints,
    dirs,
    heights,
    normal: new THREE.Vector3(0, 0, 1),
    q,
    mats,
    name: 'anal-fin',
    rows: q.key === 'high' ? 10 : 6,
  });
}

function addPairedFin(parent, def, cfg, shape, mats, rng, q, opts) {
  const {
    u = 0.7,
    v = 0.28,
    length = 0.1,
    spread = 1.05,
    radiusFn = (t) => 0.72 + 0.28 * Math.cos((Math.abs(t) * Math.PI) / 2),
    spanDir = new THREE.Vector3(-0.55, -0.25, 0.79),
    chordHint = new THREE.Vector3(0, 1, 0),
    name = 'pectoral',
    isPectoral = true,
    bow = 0.005,
    leaf = false,
    leafWidth = 0.1,
    material = null,
  } = opts;
  const fins = [];
  for (const sign of [1, -1]) {
    const vv = sign > 0 ? v : 1 - v;
    const base = shape.sample(u, vv);
    const nrm = shape.normalAt(u, vv);
    const sx = new THREE.Vector3(spanDir.x, spanDir.y, spanDir.z * sign).normalize();
    let syHint = new THREE.Vector3(chordHint.x, chordHint.y, chordHint.z * sign).normalize();
    syHint.addScaledVector(sx, -syHint.dot(sx));
    if (syHint.lengthSq() < 1e-6) syHint.set(0, 1, 0);
    syHint.normalize();
    const sz = new THREE.Vector3().crossVectors(sx, syHint).normalize();
    const outer = new THREE.Group();
    outer.name = `${name}-root`;
    outer.position.copy(base).addScaledVector(nrm, -0.002);
    outer.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(sx, syHint, sz));
    parent.add(outer);
    const pivot = new THREE.Group();
    pivot.name = `${name}-pivot`;
    outer.add(pivot);
    let geo;
    let edge;
    let rays = null;
    if (leaf) {
      geo = makeLeafGeometry({
        root: new THREE.Vector3(0, 0, 0),
        dir: new THREE.Vector3(1, 0, 0),
        side: new THREE.Vector3(0, 1, 0),
        normal: new THREE.Vector3(0, 0, 1),
        length,
        width: leafWidth,
        rows: q.key === 'high' ? 10 : 6,
        cols: q.key === 'high' ? 5 : 3,
        curl: bow * 2.5,
      });
      edge = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        const x = t * length;
        const halfW = Math.sin(Math.PI * Math.pow(t, 0.82)) * leafWidth * 0.5;
        edge.push(new THREE.Vector3(x, halfW, 0));
      }
      for (let i = 10; i >= 0; i--) {
        const t = i / 10;
        const x = t * length;
        const halfW = Math.sin(Math.PI * Math.pow(t, 0.82)) * leafWidth * 0.5;
        edge.push(new THREE.Vector3(x, -halfW, 0));
      }
    } else {
      geo = makePolarFinGeometry({
        rows: q.key === 'high' ? 8 : 5,
        cols: q.key === 'high' ? 20 : 13,
        spread,
        radiusFn: (t) => radiusFn(t) * length,
        axis: new THREE.Vector3(1, 0, 0),
        side: new THREE.Vector3(0, 1, 0),
        normal: new THREE.Vector3(0, 0, 1),
        bow,
        asym: 1,
      });
      edge = polarFinEdgePoints({
        cols: 24,
        spread,
        radiusFn: (t) => radiusFn(t) * length,
        axis: new THREE.Vector3(1, 0, 0),
        side: new THREE.Vector3(0, 1, 0),
        normal: new THREE.Vector3(0, 0, 1),
      });
      rays = polarFinRays({
        cols: 20,
        spread,
        radiusFn: (t) => radiusFn(t) * length,
        axis: new THREE.Vector3(1, 0, 0),
        side: new THREE.Vector3(0, 1, 0),
        normal: new THREE.Vector3(0, 0, 1),
        bow,
        rayCount: 9,
      });
    }
    const assembly = makeFinAssembly({
      geometry: geo,
      material: material || mats.fin,
      edgePoints: edge,
      edgeRadius: leaf ? 0.0018 : 0.0013,
      rays,
      edgeMaterial: mats.finEdge,
      rayMaterial: mats.finRay,
      q,
      name,
    });
    pivot.add(assembly);
    if (isPectoral) {
      fins.push({ pivot, side: sign, phase: rng() * TAU });
    }
  }
  return fins;
}

function buildPectorals(parent, def, cfg, shape, mats, rng, q) {
  if (['ray', 'crab', 'jelly', 'shrimp'].includes(cfg.type)) return [];
  const type = def.shape.pectoral || 'round';
  let length;
  let spread;
  let radiusFn;
  let spanDir;
  let chordHint;
  let leaf = false;
  let leafWidth = 0.1;
  let material = null;
  if (type === 'wing') {
    length = Math.max(shape.bodyLen * 0.48, shape.depth * 2.3);
    leaf = true;
    leafWidth = Math.max(shape.bodyLen * 0.22, shape.depth * 1.0);
    spread = 1.16;
    radiusFn = (t) => 0.8 + 0.2 * Math.cos((Math.abs(t) * Math.PI) / 2);
    spanDir = new THREE.Vector3(-0.52, 0.12, 0.85);
    chordHint = new THREE.Vector3(0, 1, 0);
  } else if (type === 'long') {
    if (cfg.type === 'shark') {
      length = Math.max(shape.depth * 1.18, 0.12);
      leafWidth = Math.max(shape.depth * 0.72, 0.09);
      spanDir = new THREE.Vector3(-0.5, -0.12, 0.86);
    } else if (cfg.type === 'tuna') {
      length = Math.max(shape.depth * 1.25, 0.13);
      leafWidth = Math.max(shape.depth * 0.36, 0.045);
      spanDir = new THREE.Vector3(-0.62, -0.18, 0.76);
    } else {
      length = Math.max(shape.depth * 0.92, 0.1);
      leafWidth = Math.max(shape.depth * 0.4, 0.055);
      spanDir = new THREE.Vector3(-0.62, -0.2, 0.76);
    }
    leaf = true;
    spread = 0.88;
    radiusFn = (t) => 0.55 + 0.45 * Math.cos((Math.abs(t) * Math.PI) / 2);
    chordHint = new THREE.Vector3(0, 1, 0);
  } else if (type === 'small') {
    length = Math.max(shape.depth * 0.3, 0.034);
    spread = 0.98;
    radiusFn = (t) => 0.7 + 0.3 * Math.cos((Math.abs(t) * Math.PI) / 2);
    spanDir = new THREE.Vector3(-0.46, -0.45, 0.77);
    chordHint = new THREE.Vector3(0, 1, 0);
  } else {
    length = Math.max(shape.depth * 0.4, 0.05);
    spread = 1.06;
    radiusFn = (t) => 0.74 + 0.26 * Math.cos((Math.abs(t) * Math.PI) / 2);
    spanDir = new THREE.Vector3(-0.46, -0.42, 0.78);
    chordHint = new THREE.Vector3(0, 1, 0);
  }
  if (cfg.type === 'whale' && type !== 'wing') {
    length = shape.bodyLen * 0.23;
    leaf = true;
    leafWidth = Math.max(shape.depth * 0.72, 0.1);
    material = mats.skin;
    spread = 0.7;
    spanDir = new THREE.Vector3(-0.45, -0.14, 0.88);
  }
  const u = cfg.type === 'whale' ? 0.72 : type === 'wing' ? 0.73 : cfg.type === 'angler' ? 0.72 : 0.69;
  const v = cfg.type === 'whale' ? 0.27 : type === 'wing' ? 0.24 : cfg.type === 'angler' ? 0.32 : 0.33;
  const fins = addPairedFin(parent, def, cfg, shape, mats, rng, q, {
    u,
    v,
    length,
    spread,
    radiusFn,
    spanDir,
    chordHint,
    leaf,
    leafWidth,
    material,
    name: 'pectoral',
  });
  if (q.key !== 'low' && cfg.type !== 'puffer') {
    const pl = Math.max(shape.depth * 0.18, 0.03);
    addPairedFin(parent, def, cfg, shape, mats, rng, q, {
      u: 0.58,
      v: 0.36,
      length: pl,
      spread: 0.9,
      radiusFn: (t) => 0.62 + 0.38 * Math.cos((Math.abs(t) * Math.PI) / 2),
      spanDir: new THREE.Vector3(-0.5, -0.55, 0.67),
      chordHint: new THREE.Vector3(0, 1, 0),
      name: 'pelvic',
      isPectoral: false,
      bow: 0.003,
    });
  }
  return fins;
}

function buildFinlets(parent, def, cfg, shape, mats, rng, q) {
  if (cfg.type !== 'tuna' || q.key === 'low') return;
  const geos = [];
  for (const bottom of [false, true]) {
    for (let i = 0; i < 5; i++) {
      const u = 0.09 + i * 0.04;
      const base = bottom ? shape.bottomPoint(u) : shape.topPoint(u);
      const dir = new THREE.Vector3(-0.18, bottom ? -1 : 1, 0).normalize();
      const width = 0.016;
      const h = 0.022 * (0.75 + (i / 5) * 0.5);
      const p0 = base.clone().add(new THREE.Vector3(-width * 0.5, 0, 0));
      const p1 = base.clone().add(new THREE.Vector3(width * 0.5, 0, 0));
      const p2 = base.clone().addScaledVector(dir, h).add(new THREE.Vector3(-width * 0.2, 0, 0));
      const positions = new Float32Array([p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z]);
      const uv = new Float32Array([0, 0, 1, 0, 0.5, 1]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex([0, 1, 2]);
      geo.computeVertexNormals();
      geos.push(geo);
    }
  }
  addMesh(parent, mergeGeometries(geos), mats.fin, 'finlets');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ray wings, shrimp appendages and custom silhouette pieces
// ─────────────────────────────────────────────────────────────────────────────

function makeRayWingGeometry({ chord, span, sweep, droop, rows, cols, sign, rootZFn, rootYFn }) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const cols1 = cols + 1;
  for (let i = 0; i <= rows; i++) {
    const u = i / rows;
    const xRoot = (u - 0.5) * chord;
    const edge = span * Math.pow(Math.sin(Math.PI * Math.pow(u, 0.92)), 0.55);
    const rz = rootZFn ? rootZFn(u) : 0;
    const ry = rootYFn ? rootYFn(u) : 0;
    for (let j = 0; j <= cols; j++) {
      const v = j / cols;
      const x = xRoot + v * sweep * (u - 0.42);
      const z = rz + sign * v * edge;
      const y = ry - v * v * droop + Math.sin(Math.PI * v) * Math.sin(Math.PI * u) * 0.012;
      positions.push(x, y, z);
      uvs.push(0.08 + 0.84 * u, 0.26 + 0.48 * v);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * cols1 + j;
      const b = a + 1;
      const c = a + cols1;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function buildRayWings(torso, def, cfg, shape, mats, rng, q) {
  const wings = [];
  const chord = shape.bodyLen * 0.9;
  const span = Math.max(0.36, shape.bodyLen * 0.62);
  const halfW = Math.max(0.07, shape.profileAt(0.5).halfW);
  const wingMat = mats.skin.clone();
  wingMat.name = 'ray-wing-skin';
  wingMat.roughness = 0.52;
  wingMat.clearcoat = 0.32;
  wingMat.clearcoatRoughness = 0.42;
  wingMat.metalness = 0.02;
  wingMat.side = THREE.DoubleSide;
  mats.wingSkin = wingMat;
  for (const sign of [1, -1]) {
    const centerX = shape.tailX + shape.bodyLen * 0.5;
    const centerY = shape.centerAt(0.5).y + shape.depth * 0.22;
    const pivotZ = sign * halfW * 0.78;
    const pivot = new THREE.Group();
    pivot.position.set(centerX, centerY, pivotZ);
    pivot.name = `ray-wing-${sign}`;
    const uToS = (u) => clamp((centerX + (u - 0.5) * chord - shape.tailX) / shape.bodyLen, 0, 1);
    const rootZFn = (u) => {
      const s = uToS(u);
      return sign * (shape.profileAt(s).halfW - halfW * 0.78);
    };
    const rootYFn = (u) => {
      const s = uToS(u);
      return shape.centerAt(s).y - centerY;
    };
    const geo = makeRayWingGeometry({
      chord,
      span,
      sweep: 0.065,
      droop: 0.026,
      rows: q.key === 'high' ? 30 : 18,
      cols: q.key === 'high' ? 12 : 8,
      sign,
      rootZFn,
      rootYFn,
    });
    const mesh = addMesh(pivot, geo, wingMat, 'wing-membrane');
    mesh.castShadow = false;
    if (q.key !== 'low') {
      const edgePts = [];
      const pos = geo.getAttribute('position');
      const cols1 = q.key === 'high' ? 13 : 9;
      const rowStart = (q.key === 'high' ? 30 : 18) * cols1;
      for (let j = 0; j < cols1; j++) {
        const idx = rowStart + j;
        edgePts.push(new THREE.Vector3(pos.getX(idx), pos.getY(idx), pos.getZ(idx)));
      }
      addTubeDetail(pivot, edgePts, 0.0022, mats.finEdge, 'wing-edge', 24);
    }
    if (q.key === 'high') {
      const rays = [];
      const rows = 30;
      const cols = 12;
      const cols1 = 13;
      const pos = geo.getAttribute('position');
      for (let i = 2; i < rows; i += 2) {
        const pts = [];
        for (const vv of [0.12, 0.55, 0.96]) {
          const j = Math.round(vv * cols);
          const idx = i * cols1 + j;
          pts.push(new THREE.Vector3(pos.getX(idx), pos.getY(idx) + 0.0015, pos.getZ(idx)));
        }
        rays.push(pts);
      }
      const lines = makeFinRayLines(rays, mats.finRay);
      lines.name = 'wing-rays';
      pivot.add(lines);
    }
    torso.add(pivot);
    wings.push({ pivot, side: sign, phase: rng() * TAU });
  }
  return wings;
}

function addRayDetails(torso, def, cfg, shape, mats, rng, q) {
  // Spiracles just behind the eyes.
  for (const sign of [1, -1]) {
    const v = sign > 0 ? 0.14 : 0.86;
    const p = shape.sample(0.765, v);
    const n = shape.normalAt(0.765, v);
    const spiracle = addMesh(torso, new THREE.SphereGeometry(Math.max(0.008, shape.depth * 0.075), 10, 7), mats.dark, 'spiracle');
    spiracle.position.copy(p).addScaledVector(n, 0.0015);
    spiracle.scale.set(1.6, 0.35, 0.9);
    spiracle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize());
  }
}

function makeLeafGeometry({ root, dir, side, normal, length, width, rows = 6, cols = 4, curl = 0.004 }) {
  const d = dir.clone().normalize();
  const s = side.clone().normalize();
  const n = normal.clone().normalize();
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    for (let j = 0; j <= cols; j++) {
      const v = j / cols - 0.5;
      const w = Math.sin(Math.PI * Math.pow(t, 0.82)) * width;
      const p = root.clone().addScaledVector(d, t * length).addScaledVector(s, v * w);
      p.addScaledVector(n, curl * Math.sin(Math.PI * t) * (0.4 + 0.6 * Math.cos(v * Math.PI)));
      positions.push(p.x, p.y, p.z);
      uvs.push(t, j / cols);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + 1;
      const c = a + cols + 1;
      const dd = c + 1;
      indices.push(a, b, c, b, dd, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildShrimpTail(tail, def, cfg, shape, mats, rng, q) {
  const geos = [];
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const t = i / (blades - 1) - 0.5;
    const angle = t * 1.18;
    const d = new THREE.Vector3(-Math.cos(angle), 0.03, Math.sin(angle)).normalize();
    const s = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle)).normalize();
    const n = new THREE.Vector3().crossVectors(d, s).normalize();
    if (n.y < 0) n.negate();
    const len = 0.14 + (1 - Math.abs(t) * 1.4) * 0.055;
    geos.push(makeLeafGeometry({
      root: new THREE.Vector3(0, 0, 0),
      dir: d,
      side: s,
      normal: n,
      length: len,
      width: 0.046 + (1 - Math.abs(t)) * 0.02,
      rows: q.key === 'high' ? 6 : 4,
      cols: 4,
    }));
  }
  const fan = new THREE.Group();
  fan.name = 'uropod-fan';
  fan.rotation.x = -1.0;
  addMesh(fan, mergeGeometries(geos), mats.fin, 'uropods');
  tail.add(fan);
  if (q.key !== 'low') {
    addTubeDetail(
      tail,
      [new THREE.Vector3(0, 0.01, 0), new THREE.Vector3(-0.06, 0.012, 0), new THREE.Vector3(-0.14, 0.006, 0)],
      0.0035,
      mats.finEdge,
      'telson',
      8
    );
  }
  tail.userData.tailAxis = 'y';
  tail.userData.tailAmp = 0.12;
  tail.userData.tailFreq = 2.6;
  return tail;
}

function buildShrimpExtras(torso, def, cfg, shape, mats, rng, q) {
  // Head shield.
  const head = new THREE.SphereGeometry(1, q.key === 'high' ? 28 : 18, q.key === 'high' ? 18 : 12);
  head.scale(shape.bodyLen * 0.13, shape.depth * 0.62, shape.width * 0.7);
  const hm = addMesh(torso, head, mats.shell, 'carapace');
  hm.position.set(shape.noseX - shape.bodyLen * 0.12, shape.centerAt(0.85).y + shape.depth * 0.025, 0);
  addTubeDetail(
    torso,
    [
      new THREE.Vector3(shape.noseX - shape.bodyLen * 0.15, shape.centerAt(0.86).y + shape.depth * 0.32, 0),
      new THREE.Vector3(shape.noseX - shape.bodyLen * 0.02, shape.centerAt(0.9).y + shape.depth * 0.38, 0),
      new THREE.Vector3(shape.noseX + shape.bodyLen * 0.06, shape.centerAt(0.95).y + shape.depth * 0.38, 0),
    ],
    0.0035,
    mats.shellDark,
    'carapace-ridge',
    10
  );

  // Rostrum, with three little teeth.
  const rostrumBase = new THREE.Vector3(shape.noseX - 0.01, shape.centerAt(0.94).y + shape.depth * 0.12, 0);
  const rostrumTip = new THREE.Vector3(shape.noseX + shape.bodyLen * 0.16, shape.centerAt(0.94).y + shape.depth * 0.2, 0);
  const rostrum = makeTaperedTubeGeometry([rostrumBase, rostrumBase.clone().lerp(rostrumTip, 0.5), rostrumTip], (t) => 0.004 * (1 - t * 0.8), 10, 4);
  addMesh(torso, rostrum, mats.shellDark, 'rostrum');
  for (let i = 0; i < 3; i++) {
    const p = rostrumBase.clone().lerp(rostrumTip, 0.35 + i * 0.2);
    const tooth = new THREE.ConeGeometry(0.0018, 0.007, 5, 1, false);
    tooth.translate(0, 0.0035, 0);
    tooth.rotateZ(-0.6);
    tooth.translate(p.x, p.y, p.z);
    addMesh(torso, tooth, mats.bone, 'rostrum-tooth');
  }

  // Antennae, grouped so the whole pair can sway gently.
  const antennae = new THREE.Group();
  antennae.name = 'antennae';
  const antennaeGeos = [];
  for (const sign of [1, -1]) {
    for (let k = 0; k < 2; k++) {
      const base = new THREE.Vector3(shape.noseX - shape.bodyLen * 0.03, shape.centerAt(0.9).y + shape.depth * 0.22, sign * (0.012 + k * 0.01));
      const pts = [
        base,
        base.clone().add(new THREE.Vector3(shape.bodyLen * 0.08, shape.depth * 0.14, sign * (0.03 + k * 0.02))),
        base.clone().add(new THREE.Vector3(shape.bodyLen * 0.18, shape.depth * 0.26, sign * (0.06 + k * 0.04))),
        base.clone().add(new THREE.Vector3(shape.bodyLen * 0.28, shape.depth * 0.18, sign * (0.09 + k * 0.06))),
        base.clone().add(new THREE.Vector3(shape.bodyLen * 0.34, shape.depth * 0.08, sign * (0.12 + k * 0.08))),
      ];
      antennaeGeos.push(makeTaperedTubeGeometry(pts, (t) => 0.0026 * (1 - t * 0.72), 18, 4));
    }
  }
  addMesh(antennae, mergeGeometries(antennaeGeos), mats.whisker, 'antennae-pair');
  torso.add(antennae);
  torso.userData.antennae = antennae;

  // Stalked eyes.
  for (const sign of [1, -1]) {
    const stalkBase = new THREE.Vector3(shape.noseX - shape.bodyLen * 0.15, shape.centerAt(0.88).y + shape.depth * 0.12, sign * shape.width * 0.38);
    const stalkTip = stalkBase.clone().add(new THREE.Vector3(shape.bodyLen * 0.05, shape.depth * 0.35, sign * shape.width * 0.18));
    addTubeDetail(torso, [stalkBase, stalkBase.clone().lerp(stalkTip, 0.55), stalkTip], 0.0045, mats.shell, 'eye-stalk', 8);
    const dir = new THREE.Vector3(0.55, 0.35, sign * 0.75).normalize();
    torso.add(makeEye(stalkTip, dir, Math.max(0.016, shape.width * 0.32), mats, { socket: false }));
  }

  // Walking legs and swimmerets, merged into a single draw.
  const legs = [];
  for (const sign of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const u = 0.64 - i * 0.12;
      const base = shape.sample(u, sign > 0 ? 0.36 : 0.64);
      const p0 = base.clone();
      const p1 = base.clone().add(new THREE.Vector3(-0.02, -shape.depth * 0.35, sign * shape.width * 0.45));
      const p2 = base.clone().add(new THREE.Vector3(-0.05, -shape.depth * 0.7, sign * shape.width * 0.7));
      legs.push(makeTaperedTubeGeometry([p0, p1, p2], (t) => 0.0032 * (1 - t * 0.75), 8, 4));
    }
  }
  addMesh(torso, mergeGeometries(legs), mats.shellDark, 'walking-legs');

  // Abdominal segment seams.
  const segmentGeos = [];
  for (const u of [0.18, 0.29, 0.4, 0.51, 0.62]) {
    const pts = [];
    for (let k = 0; k <= 28; k++) {
      const v = (k / 28);
      const p = shape.sample(u, v);
      const n = shape.normalAt(u, v);
      pts.push(p.addScaledVector(n, 0.0012));
    }
    pts.push(pts[0].clone());
    segmentGeos.push(makeTaperedTubeGeometry(pts, () => 0.0022, 30, 3));
  }
  addMesh(torso, mergeGeometries(segmentGeos), mats.shellDark, 'segment-seams');

  // Internal red line, visible through the translucent shell.
  const innerMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(def.shape.colors.accent || '#ff9d87'),
    transparent: true,
    opacity: 0.78,
    toneMapped: false,
    depthWrite: false,
  });
  innerMat.name = 'shrimp-inner-line';
  mats.innerLine = innerMat;
  const innerPts = [];
  for (let k = 0; k <= 12; k++) {
    const u = 0.12 + (k / 12) * 0.78;
    innerPts.push(shape.sample(u, 0.5).add(new THREE.Vector3(0, shape.depth * 0.05, 0)));
  }
  addTubeDetail(torso, innerPts, 0.004, innerMat, 'inner-line', 18);
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic archetype assembly (fish, eel, shark, tuna, puffer, angler, whale, ray)
// ─────────────────────────────────────────────────────────────────────────────

function buildTubeCreature(def, cfg, shape, mats, rng, q) {
  const torso = new THREE.Group();
  torso.name = 'torso';
  const body = addMesh(torso, buildBodyGeometry(shape, q), mats.skin, 'body');

  if (cfg.type !== 'shrimp') addEyesForBody(torso, def, cfg, shape, mats, q);
  addGills(torso, def, cfg, shape, mats, q);
  addLateralLines(torso, def, cfg, shape, mats, q);

  if (cfg.type === 'shark') addSharkMouth(torso, def, cfg, shape, mats, rng, q);
  else if (cfg.type === 'puffer') addPufferMouth(torso, def, cfg, shape, mats, rng, q);
  else if (cfg.type === 'angler') addAnglerMouth(torso, def, cfg, shape, mats, rng, q);
  else if (cfg.type === 'whale') addWhaleMouth(torso, def, cfg, shape, mats, rng, q);
  else if (cfg.type === 'ray') addRayMouth(torso, def, cfg, shape, mats, rng, q);
  else addGenericMouth(torso, def, cfg, shape, mats, rng, q);

  if (cfg.type !== 'ray' && cfg.type !== 'shrimp') {
    buildDorsalFin(torso, def, cfg, shape, mats, rng, q);
    buildAnalFin(torso, def, cfg, shape, mats, rng, q);
  }
  const pectorals = buildPectorals(torso, def, cfg, shape, mats, rng, q);
  buildFinlets(torso, def, cfg, shape, mats, rng, q);
  addWhiskers(torso, def, cfg, shape, mats, rng, q);
  addCrest(torso, def, cfg, shape, mats, rng, q);
  addLure(torso, def, cfg, shape, mats, rng, q);
  addPhotophores(torso, def, cfg, shape, mats, rng, q);
  addSpikes(torso, def, cfg, shape, mats, rng, q);
  addRockyBumps(torso, def, cfg, shape, mats, rng, q);
  addBossDetails(torso, def, cfg, shape, mats, rng, q);

  let tail;
  if (cfg.type === 'shrimp') {
    tail = new THREE.Group();
    tail.name = 'tail';
    tail.position.copy(shape.tailCenter());
    buildShrimpTail(tail, def, cfg, shape, mats, rng, q);
    buildShrimpExtras(torso, def, cfg, shape, mats, rng, q);
  } else {
    tail = buildTail(def, cfg, shape, mats, rng, q);
  }

  let wings = [];
  if (cfg.type === 'ray') {
    wings = buildRayWings(torso, def, cfg, shape, mats, rng, q);
    addRayDetails(torso, def, cfg, shape, mats, rng, q);
  }

  return {
    torso,
    body,
    tail,
    pectorals,
    wings,
    legs: [],
    claws: [],
    tailAxis: tail.userData.tailAxis || 'y',
    tailAmp: tail.userData.tailAmp || 0.16,
    tailFreq: tail.userData.tailFreq || 2.1,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ray — a single flattened disc with morph-target wing flutter
// ─────────────────────────────────────────────────────────────────────────────

function buildRayDisc(def, cfg, mats, rng, q) {
  const sdef = def.shape;
  const h = clamp(num(sdef.h, 0.2), 0.08, 0.7);
  const w = clamp(num(sdef.w, 1.0), 0.4, 1.2);
  const xc = 0.1;
  const frontR = 0.32 + w * 0.06;
  const backR = 0.22 + w * 0.08;
  const rz = 0.3 + w * 0.16;
  const topH = Math.max(0.032, h * 0.24);
  const bottomH = Math.max(0.018, h * 0.1);
  const nExp = 1.55;
  const seg = q.key === 'high' ? 72 : 44;
  const rings = q.key === 'high' ? 24 : 14;
  const morphAmp = Math.max(0.045, topH * 1.1);

  const outlineR = (theta) => {
    const c = Math.abs(Math.cos(theta));
    const sAbs = Math.abs(Math.sin(theta));
    const rx = Math.cos(theta) >= 0 ? frontR : backR;
    return 1 / Math.pow(Math.pow(c / rx, nExp) + Math.pow(sAbs / rz, nExp), 1 / nExp);
  };
  const topYAt = (x, z) => {
    const theta = Math.atan2(z, x - xc);
    const s = Math.min(1, Math.hypot(x - xc, z) / Math.max(0.0001, outlineR(theta)));
    const dome = topH * Math.pow(Math.max(0, 1 - s * s), 0.55);
    const centerBulge = topH * 0.55 * Math.exp(-Math.pow((x - xc) / 0.17, 2) - Math.pow(z / 0.14, 2)) * (1 - s);
    return dome + centerBulge;
  };
  const bottomYAt = (x, z) => {
    const theta = Math.atan2(z, x - xc);
    const s = Math.min(1, Math.hypot(x - xc, z) / Math.max(0.0001, outlineR(theta)));
    return -bottomH * Math.pow(Math.max(0, 1 - s * s), 0.5);
  };

  const positions = [];
  const uvs = [];
  const indices = [];
  const ringStarts = [];
  const cols = seg + 1;
  const ringInfo = [];

  const pushDiscRing = (s, isTop) => {
    ringStarts.push(positions.length / 3);
    ringInfo.push({ s, isTop });
    for (let j = 0; j < cols; j++) {
      const theta = (j / seg) * TAU;
      const R = outlineR(theta);
      const x = xc + Math.cos(theta) * R * s;
      const z = Math.sin(theta) * R * s;
      let y;
      if (isTop) {
        const dome = topH * Math.pow(Math.max(0, 1 - s * s), 0.55);
        const centerBulge = topH * 0.55 * Math.exp(-Math.pow((x - xc) / 0.17, 2) - Math.pow(z / 0.14, 2)) * (1 - s);
        y = dome + centerBulge;
      } else {
        y = -bottomH * Math.pow(Math.max(0, 1 - s * s), 0.5);
      }
      positions.push(x, y, z);
      const u = 0.08 + 0.84 * clamp((x - (xc - backR)) / (frontR + backR));
      const zz = clamp(0.5 + z / (2 * rz));
      uvs.push(u, isTop ? 0.17 + 0.22 * zz : 0.43 + 0.14 * zz);
    }
  };

  // Center pole of the top surface.
  const topPole = positions.length / 3;
  positions.push(xc, topYAt(xc, 0), 0);
  uvs.push(0.5, 0.28);

  // Top rings, center to rim.
  for (let i = 1; i <= rings; i++) pushDiscRing(i / rings, true);
  // Last top ring is the shared rim. Bottom rings run back toward the bottom center.
  for (let i = rings - 1; i >= 1; i--) pushDiscRing(i / rings, false);
  const bottomPole = positions.length / 3;
  positions.push(xc, -bottomH, 0);
  uvs.push(0.5, 0.48);

  for (let r = 0; r < ringStarts.length - 1; r++) {
    const a0 = ringStarts[r];
    const c0 = ringStarts[r + 1];
    for (let j = 0; j < seg; j++) {
      const a = a0 + j;
      const b = a + 1;
      const c = c0 + j;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const first = ringStarts[0];
  for (let j = 0; j < seg; j++) indices.push(topPole, first + j + 1, first + j);
  const last = ringStarts[ringStarts.length - 1];
  for (let j = 0; j < seg; j++) indices.push(bottomPole, last + j, last + j + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  // Normals with a welded UV seam.
  const normals = new Float32Array(positions.length);
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3] - ax;
    const by = positions[b * 3 + 1] - ay;
    const bz = positions[b * 3 + 2] - az;
    const cx = positions[c * 3] - ax;
    const cy = positions[c * 3 + 1] - ay;
    const cz = positions[c * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    for (const v of [a, b, c]) {
      normals[v * 3] += nx;
      normals[v * 3 + 1] += ny;
      normals[v * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l;
    normals[i + 1] /= l;
    normals[i + 2] /= l;
  }
  for (let r = 0; r < ringStarts.length; r++) {
    const a = ringStarts[r];
    const b = a + seg;
    const nx = normals[a * 3] + normals[b * 3];
    const ny = normals[a * 3 + 1] + normals[b * 3 + 1];
    const nz = normals[a * 3 + 2] + normals[b * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [a, b]) {
      normals[v * 3] = nx / l;
      normals[v * 3 + 1] = ny / l;
      normals[v * 3 + 2] = nz / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  // Morph targets: wing tips up and down.
  const morphA = new Float32Array(positions.length);
  const morphB = new Float32Array(positions.length);
  for (let i = 0; i < positions.length / 3; i++) {
    const x = positions[i * 3];
    const z = positions[i * 3 + 2];
    const theta = Math.atan2(z, x - xc);
    const R = outlineR(theta);
    const s = Math.min(1, Math.hypot(x - xc, z) / Math.max(0.0001, R));
    const mask = Math.pow(Math.abs(Math.sin(theta)), 2.2) * Math.pow(s, 3.2);
    const dy = morphAmp * mask;
    morphA[i * 3 + 1] = dy;
    morphB[i * 3 + 1] = -dy;
  }
  geo.morphAttributes.position = [
    new THREE.BufferAttribute(morphA, 3),
    new THREE.BufferAttribute(morphB, 3),
  ];
  geo.morphTargetsRelative = true;
  geo.computeBoundingSphere();
  return { geo, outlineR, topYAt, bottomYAt, xc, frontR, backR, rz, topH, bottomH, topPole, bottomPole, morphAmp };
}

function buildRay(def, cfg, mats, rng, q) {
  const torso = new THREE.Group();
  torso.name = 'torso';
  const disc = buildRayDisc(def, cfg, mats, rng, q);
  const body = addMesh(torso, disc.geo, mats.skin, 'body');
  body.morphTargetInfluences = [0, 0];

  // Eyes on the dorsal surface.
  for (const sign of [1, -1]) {
    const ex = 0.34;
    const ez = sign * 0.085;
    const ey = disc.topYAt(ex, ez) + 0.002;
    const dir = new THREE.Vector3(0.35, 0.9, sign * 0.18).normalize();
    torso.add(makeEye(new THREE.Vector3(ex, ey, ez), dir, 0.016, mats, { socket: false }));
    // Spiracles just behind the eyes.
    const sx = 0.25;
    const sz = sign * 0.07;
    const spiracle = addMesh(torso, new THREE.SphereGeometry(0.011, 10, 7), mats.dark, 'spiracle');
    spiracle.position.set(sx, disc.topYAt(sx, sz) + 0.001, sz);
    spiracle.scale.set(1.5, 0.3, 0.8);
    spiracle.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 1, 0));
  }

  // Underside mouth.
  const mouthPts = [];
  for (let k = 0; k <= 12; k++) {
    const t = k / 12;
    const z = lerp(-0.09, 0.09, t);
    mouthPts.push(new THREE.Vector3(0.4 - Math.abs(z) * 0.5, disc.bottomYAt(0.4, z) - 0.002, z));
  }
  addTubeDetail(torso, mouthPts, 0.0024, mats.dark, 'ray-mouth', 14);
  for (const sign of [1, -1]) {
    addMesh(torso, new THREE.SphereGeometry(0.006, 8, 6), mats.dark, 'nostril').position.set(0.36, disc.bottomYAt(0.36, sign * 0.045) - 0.001, sign * 0.045);
  }

  // Five gill slits on each side of the underside.
  const gillGeos = [];
  for (const sign of [1, -1]) {
    for (let i = 0; i < 5; i++) {
      const x = 0.15 - i * 0.035;
      const z = sign * (0.08 + i * 0.012);
      const pts = [
        new THREE.Vector3(x + 0.01, disc.bottomYAt(x, z) - 0.001, z),
        new THREE.Vector3(x, disc.bottomYAt(x, z) - 0.0015, z + sign * 0.025),
        new THREE.Vector3(x - 0.008, disc.bottomYAt(x, z) - 0.001, z + sign * 0.05),
      ];
      gillGeos.push(makeTaperedTubeGeometry(pts, () => 0.0012, 6, 3));
    }
  }
  addMesh(torso, mergeGeometries(gillGeos), mats.dark, 'ray-gills');

  // Dorsal markings, added as geometry so they stay crisp at portrait size.
  const pattern = (def.shape && def.shape.pattern) || 'spots';
  const markGeos = [];
  const markCount = q.key === 'high' ? 30 : 16;
  for (let i = 0; i < markCount; i++) {
    const theta = rng() * TAU;
    const s = 0.16 + rng() * 0.6;
    const R = disc.outlineR(theta) * s;
    const x = disc.xc + Math.cos(theta) * R;
    const z = Math.sin(theta) * R;
    const y = disc.topYAt(x, z) + 0.0015;
    if (pattern === 'rings') {
      const rr = 0.012 + rng() * 0.018;
      const ring = new THREE.TorusGeometry(rr, 0.0035, 6, 18);
      ring.rotateX(Math.PI / 2);
      ring.translate(x, y, z);
      markGeos.push(ring);
    } else {
      const rr = 0.006 + rng() * 0.012;
      const spot = new THREE.CircleGeometry(rr, 12);
      spot.rotateX(-Math.PI / 2);
      spot.translate(x, y, z);
      markGeos.push(spot);
    }
  }
  addMesh(torso, mergeGeometries(markGeos), pattern === 'rings' ? mats.rayRing : mats.raySpot, 'ray-markings');

  // Radial wing rays and a clean rim line.
  const linePts = [];
  for (const sign of [1, -1]) {
    for (let i = 0; i < 11; i++) {
      const theta = sign * (0.3 + (i / 10) * 2.45);
      const R = disc.outlineR(theta);
      let prev = null;
      for (const s of [0.18, 0.46, 0.74]) {
        const x = disc.xc + Math.cos(theta) * R * s;
        const z = Math.sin(theta) * R * s;
        const p = new THREE.Vector3(x, disc.topYAt(x, z) + 0.002, z);
        if (prev) linePts.push(prev, p);
        prev = p;
      }
    }
  }
  const lineGeo = new THREE.BufferGeometry().setFromPoints(linePts);
  const rayLines = new THREE.LineSegments(lineGeo, mats.rayLine);
  rayLines.name = 'ray-wing-lines';
  torso.add(rayLines);

  const rimPts = [];
  for (let i = 0; i <= 72; i++) {
    const theta = (i / 72) * TAU;
    const R = disc.outlineR(theta);
    rimPts.push(new THREE.Vector3(disc.xc + Math.cos(theta) * R, 0.001, Math.sin(theta) * R));
  }
  const rimLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(rimPts), mats.rayLine);
  rimLine.name = 'ray-rim';
  torso.add(rimLine);

  // Whip tail with a stinger.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(disc.xc - disc.backR, 0, 0);
  const whipLen = 0.3;
  const whipPts = [
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(-whipLen * 0.3, 0.015, 0.01),
    new THREE.Vector3(-whipLen * 0.58, 0.005, -0.012),
    new THREE.Vector3(-whipLen * 0.82, -0.01, -0.01),
    new THREE.Vector3(-whipLen, -0.018, 0),
  ];
  addMesh(tail, makeTaperedTubeGeometry(whipPts, (t) => Math.max(0.0008, 0.015 * Math.pow(1 - t, 0.75)), 22, 6), mats.skin, 'whip-tail');
  const barb = new THREE.ConeGeometry(0.0075, 0.055, 5, 1, false);
  barb.translate(0, 0.0275, 0);
  barb.rotateZ(0.28);
  const barbMesh = addMesh(tail, barb, mats.bone, 'stinger');
  barbMesh.position.set(-whipLen * 0.3, 0.008, 0.006);
  const barb2 = barbMesh.clone();
  barb2.position.set(-whipLen * 0.36, 0.004, 0.004);
  barb2.scale.setScalar(0.62);
  tail.add(barb2);
  tail.userData.tailAxis = 'y';
  tail.userData.tailAmp = 0.1;
  tail.userData.tailFreq = 1.1;

  return {
    torso,
    body,
    tail,
    pectorals: [],
    wings: [],
    legs: [],
    claws: [],
    tailAxis: 'y',
    tailAmp: 0.1,
    tailFreq: 1.1,
    rayDisc: body,
    bell: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Crab
// ─────────────────────────────────────────────────────────────────────────────

function makeCarapaceGeometry(rx, rz, topH, bottomH, seg, rings) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringStarts = [];
  const cols = seg + 1;
  const p = 0.78;

  for (let i = 1; i < rings; i++) {
    const phi = (i / rings) * Math.PI;
    const cy = Math.cos(phi);
    const sy = Math.max(0.0001, Math.sin(phi));
    const rr = Math.pow(sy, 0.9);
    const flare = 1 + 0.035 * Math.exp(-Math.pow(Math.abs(cy) / 0.16, 2));
    const y = cy >= 0 ? topH * Math.pow(cy, 0.72) : -bottomH * Math.pow(-cy, 1.15);
    ringStarts.push(positions.length / 3);
    for (let j = 0; j < cols; j++) {
      const theta = (j / seg) * TAU;
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const x = rx * rr * signPow(c, p) * flare;
      const z = rz * rr * signPow(s, p) * flare;
      positions.push(x, y, z);
      uvs.push(j / seg, i / rings);
    }
  }
  const topPole = positions.length / 3;
  positions.push(0, topH, 0);
  uvs.push(0.5, 0);
  const bottomPole = positions.length / 3;
  positions.push(0, -bottomH, 0);
  uvs.push(0.5, 1);

  for (let r = 0; r < ringStarts.length - 1; r++) {
    const a0 = ringStarts[r];
    const c0 = ringStarts[r + 1];
    for (let j = 0; j < seg; j++) {
      const a = a0 + j;
      const b = a + 1;
      const c = c0 + j;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const first = ringStarts[0];
  for (let j = 0; j < seg; j++) indices.push(topPole, first + j + 1, first + j);
  const last = ringStarts[ringStarts.length - 1];
  for (let j = 0; j < seg; j++) indices.push(bottomPole, last + j, last + j + 1);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);

  // Smooth normals with a welded UV seam.
  const normals = new Float32Array(positions.length);
  const idx = geo.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i];
    const b = idx[i + 1];
    const c = idx[i + 2];
    const ax = positions[a * 3];
    const ay = positions[a * 3 + 1];
    const az = positions[a * 3 + 2];
    const bx = positions[b * 3] - ax;
    const by = positions[b * 3 + 1] - ay;
    const bz = positions[b * 3 + 2] - az;
    const cx = positions[c * 3] - ax;
    const cy = positions[c * 3 + 1] - ay;
    const cz = positions[c * 3 + 2] - az;
    const nx = by * cz - bz * cy;
    const ny = bz * cx - bx * cz;
    const nz = bx * cy - by * cx;
    for (const v of [a, b, c]) {
      normals[v * 3] += nx;
      normals[v * 3 + 1] += ny;
      normals[v * 3 + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const l = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= l;
    normals[i + 1] /= l;
    normals[i + 2] /= l;
  }
  for (let r = 0; r < ringStarts.length; r++) {
    const a = ringStarts[r];
    const b = a + seg;
    const nx = normals[a * 3] + normals[b * 3];
    const ny = normals[a * 3 + 1] + normals[b * 3 + 1];
    const nz = normals[a * 3 + 2] + normals[b * 3 + 2];
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const v of [a, b]) {
      normals[v * 3] = nx / l;
      normals[v * 3 + 1] = ny / l;
      normals[v * 3 + 2] = nz / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.computeBoundingSphere();
  return geo;
}

function makeCarapaceSampler(rx, rz, topH, bottomH) {
  return function sampleCarapace(theta, phi) {
    const cy = Math.cos(phi);
    const sy = Math.max(0.0001, Math.sin(phi));
    const rr = Math.pow(sy, 0.9);
    const flare = 1 + 0.035 * Math.exp(-Math.pow(Math.abs(cy) / 0.16, 2));
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    return new THREE.Vector3(
      rx * rr * signPow(c, 0.78) * flare,
      cy >= 0 ? topH * Math.pow(cy, 0.72) : -bottomH * Math.pow(-cy, 1.15),
      rz * rr * signPow(s, 0.78) * flare
    );
  };
}

function carapaceNormal(sampler, theta, phi) {
  const eps = 0.006;
  const p0 = sampler(theta - eps, phi);
  const p1 = sampler(theta + eps, phi);
  const q0 = sampler(theta, Math.max(0.001, phi - eps));
  const q1 = sampler(theta, Math.min(Math.PI - 0.001, phi + eps));
  const dt = p1.sub(p0);
  const dp = q1.sub(q0);
  const n = dt.cross(dp);
  return n.lengthSq() > 1e-12 ? n.normalize() : new THREE.Vector3(0, 1, 0);
}

function buildCrab(def, cfg, mats, rng, q) {
  const s = def.shape;
  const h = clamp(num(s.h, 0.42), 0.2, 0.8);
  const w = clamp(num(s.w, 0.58), 0.3, 0.9);
  const rx = 0.23 + h * 0.21;
  const rz = 0.27 + w * 0.24;
  const topH = 0.08 + h * 0.14;
  const bottomH = 0.03 + h * 0.03;
  const torso = new THREE.Group();
  torso.name = 'torso';
  const bell = null;
  const bodyGeo = makeCarapaceGeometry(rx, rz, topH, bottomH, q.key === 'high' ? 64 : 40, q.key === 'high' ? 30 : 20);
  const body = addMesh(torso, bodyGeo, mats.skin, 'body');
  const sampler = makeCarapaceSampler(rx, rz, topH, bottomH);

  // Rim and grooves.
  const rimPts = [];
  for (let i = 0; i <= 48; i++) {
    const theta = (i / 48) * TAU;
    const p = sampler(theta, Math.PI / 2);
    rimPts.push(p);
  }
  additiveCarapaceRim(torso, rimPts, mats, q);
  if (!cfg.isBoss) addCrabFrontTeeth(torso, sampler, mats, q);
  const grooveGeos = [];
  for (const off of [-0.34, 0, 0.34]) {
    const pts = [];
    for (let k = 0; k <= 14; k++) {
      const t = k / 14;
      const theta = lerp(-0.7, 0.7, t) + off;
      const phi = 0.42 + Math.sin(t * Math.PI) * 0.18;
      const p = sampler(theta, phi);
      p.y += 0.0015;
      pts.push(p);
    }
    grooveGeos.push(makeTaperedTubeGeometry(pts, () => 0.0042, 16, 3));
  }
  // A central dorsal ridge along the shell.
  const ridgePts = [];
  for (let k = 0; k <= 14; k++) {
    const t = k / 14;
    const x = lerp(-rx * 0.72, rx * 0.72, t);
    const y = topH * Math.pow(Math.max(0, 1 - Math.pow(x / (rx * 1.02), 2)), 0.55) + 0.002;
    ridgePts.push(new THREE.Vector3(x, y, 0));
  }
  grooveGeos.push(makeTaperedTubeGeometry(ridgePts, (t) => 0.0025 * (0.45 + Math.sin(t * Math.PI) * 0.8), 18, 3));
  addMesh(torso, mergeGeometries(grooveGeos), mats.shellDark, 'carapace-grooves');

  // Eyes on short stalks.
  for (const sign of [1, -1]) {
    const stalkBase = new THREE.Vector3(rx * 0.8, topH * 0.5, sign * rz * 0.44);
    const stalkTip = stalkBase.clone().add(new THREE.Vector3(rx * 0.1, topH * 0.34, sign * rz * 0.09));
    addTubeDetail(torso, [stalkBase, stalkBase.clone().lerp(stalkTip, 0.5), stalkTip], 0.016, mats.shellDark, 'eye-stalk', 8);
    const dir = new THREE.Vector3(0.75, 0.28, sign * 0.6).normalize();
    torso.add(makeEye(stalkTip, dir, 0.038, mats, { socket: false }));
  }

  // Mouth parts.
  for (const sign of [1, -1]) {
    const plate = new THREE.SphereGeometry(1, 10, 8);
    plate.scale(rx * 0.13, topH * 0.12, rz * 0.09);
    const m = addMesh(torso, plate, mats.dark, 'mandible');
    m.position.set(rx * 0.83, -topH * 0.33, sign * rz * 0.09);
  }

  // Legs.
  const legs = [];
  for (const sign of [1, -1]) {
    for (let i = 0; i < 4; i++) {
      const shoulder = new THREE.Vector3(rx * (0.5 - i * 0.3), -topH * 0.2, sign * rz * 0.76);
      const group = new THREE.Group();
      group.position.copy(shoulder);
      group.name = 'crab-leg';
      const p0 = new THREE.Vector3(0, 0, 0);
      const p1 = new THREE.Vector3(0.02, -topH * 0.28, sign * rz * 0.11);
      const p2 = new THREE.Vector3(0.045, -topH * 0.62, sign * rz * 0.17);
      const p3 = new THREE.Vector3(0.07, -topH * 0.82, sign * rz * 0.19);
      const tube = makeTaperedTubeGeometry([p0, p1, p2, p3], (t) => lerp(0.025, 0.006, t), 14, 5);
      const joint = new THREE.SphereGeometry(0.025, 8, 6);
      joint.translate(p1.x, p1.y, p1.z);
      addMesh(group, mergeGeometries([tube, joint]), mats.shell, 'leg');
      torso.add(group);
      legs.push({ pivot: group, side: sign, phase: rng() * TAU + i * 0.7 });
    }
  }

  // Claws.
  const claws = [];
  for (const sign of [1, -1]) {
    const shoulder = new THREE.Vector3(rx * 0.82, -topH * 0.12, sign * rz * 0.52);
    const group = new THREE.Group();
    group.position.copy(shoulder);
    group.name = 'crab-claw';
    group.rotation.y = sign * 0.18;
    const scl = sign > 0 ? 1.12 : 1.0;
    group.scale.setScalar(scl);
    const p0 = new THREE.Vector3(0, 0, 0);
    const p1 = new THREE.Vector3(0.075, 0.012, sign * 0.13);
    const p2 = new THREE.Vector3(0.17, 0.03, sign * 0.235);
    addTubeDetail(group, [p0, p0.clone().lerp(p1, 0.55), p1, p2], 0.043, mats.shell, 'claw-arm', 12);
    const joint = new THREE.SphereGeometry(0.042, 10, 8);
    joint.translate(p1.x, p1.y, p1.z);
    addMesh(group, joint, mats.shellDark, 'claw-joint');
    const palm = new THREE.SphereGeometry(1, 18, 14);
    palm.scale(0.088, 0.058, 0.061);
    const palmMesh = addMesh(group, palm, mats.shell, 'claw-palm');
    palmMesh.position.copy(p2);
    // Fixed lower finger.
    const f0 = p2.clone().add(new THREE.Vector3(0.045, -0.02, 0));
    const f1 = p2.clone().add(new THREE.Vector3(0.145, -0.012, sign * 0.005));
    const f2 = p2.clone().add(new THREE.Vector3(0.225, 0.012, sign * 0.01));
    addMesh(group, makeTaperedTubeGeometry([f0, f1, f2], (t) => lerp(0.022, 0.0035, t), 12, 5), mats.shell, 'claw-finger-fixed');
    const fingerPivot = new THREE.Group();
    fingerPivot.position.copy(p2);
    group.add(fingerPivot);
    const m0 = new THREE.Vector3(0.045, 0.016, 0);
    const m1 = new THREE.Vector3(0.145, 0.008, sign * 0.004);
    const m2 = new THREE.Vector3(0.225, -0.014, sign * 0.006);
    addMesh(fingerPivot, makeTaperedTubeGeometry([m0, m1, m2], (t) => lerp(0.021, 0.0032, t), 12, 5), mats.shell, 'claw-finger-movable');
    // A dark inner tooth strip.
    addTubeDetail(group, [f0.clone().add(new THREE.Vector3(0.045, 0.018, 0)), f1.clone().add(new THREE.Vector3(0, 0.016, 0))], 0.004, mats.dark, 'claw-tooth', 6);
    addTubeDetail(fingerPivot, [m0.clone().add(new THREE.Vector3(0.045, -0.012, 0)), m1.clone().add(new THREE.Vector3(0, -0.011, 0))], 0.004, mats.dark, 'claw-tooth-upper', 6);
    torso.add(group);
    claws.push({ pivot: group, finger: fingerPivot, side: sign, phase: rng() * TAU, baseRotY: sign * 0.18, baseRotZ: 0 });
  }

  // Tucked abdomen.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(-rx * 0.82, -topH * 0.18, 0);
  const abdomen = new THREE.SphereGeometry(1, 14, 10);
  abdomen.scale(rx * 0.33, topH * 0.22, rz * 0.36);
  addMesh(tail, abdomen, mats.shellDark, 'abdomen');
  tail.userData.tailAxis = 'y';
  tail.userData.tailAmp = 0.02;

  if (cfg.isBoss) addCrabBossDetails(torso, def, cfg, mats, rng, q, sampler, rx, rz, topH, bottomH);
  return {
    torso,
    body,
    tail,
    pectorals: [],
    wings: [],
    legs,
    claws,
    tailAxis: 'y',
    tailAmp: 0.02,
    tailFreq: 1,
    bell,
  };
}

function additiveCarapaceRim(torso, points, mats, q) {
  if (q.key === 'low') return;
  const closed = points.slice();
  closed.push(points[0].clone());
  addTubeDetail(torso, closed, 0.006, mats.shellDark, 'carapace-rim', 24);
}

function addCrabFrontTeeth(torso, sampler, mats, q) {
  const geos = [];
  const count = q.key === 'high' ? 9 : 6;
  for (let i = 0; i < count; i++) {
    const theta = -0.78 + (i / (count - 1)) * 1.56;
    const phi = Math.PI / 2 - 0.12;
    const p = sampler(theta, phi);
    const n = carapaceNormal(sampler, theta, phi);
    const h = 0.018 + (i % 3) * 0.006;
    const geo = new THREE.ConeGeometry(0.008, h, 6, 1, false);
    geo.translate(0, h * 0.5, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    geo.applyMatrix4(new THREE.Matrix4().compose(p, quat, new THREE.Vector3(1, 1, 1)));
    geos.push(geo);
  }
  addMesh(torso, mergeGeometries(geos), mats.shellDark, 'carapace-teeth');
}

function addCrabBossDetails(torso, def, cfg, mats, rng, q, sampler, rx, rz, topH, bottomH) {
  // Barnacle clusters on the shell.
  const barnacles = [];
  for (let i = 0; i < (q.key === 'high' ? 22 : 12); i++) {
    const theta = rng() * TAU;
    const phi = 0.18 + rng() * 0.55;
    const base = sampler(theta, phi);
    const n = carapaceNormal(sampler, theta, phi);
    const r = 0.009 + rng() * 0.013;
    const h = 0.008 + rng() * 0.012;
    const geo = new THREE.CylinderGeometry(r * 0.4, r, h, 7, 1, false);
    geo.translate(0, h * 0.5, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    geo.applyMatrix4(new THREE.Matrix4().compose(base.clone().addScaledVector(n, -0.001), quat, new THREE.Vector3(1, 1, 1)));
    barnacles.push(geo);
  }
  addMesh(torso, mergeGeometries(barnacles), mats.barnacle, 'barnacles');

  // Rivets and iron straps along the ridges.
  const rivets = [];
  for (let i = 0; i < (q.key === 'high' ? 24 : 14); i++) {
    const theta = lerp(-0.8, 0.8, rng());
    const phi = 0.3 + rng() * 0.32;
    const base = sampler(theta, phi);
    const n = carapaceNormal(sampler, theta, phi);
    const geo = new THREE.CylinderGeometry(0.008, 0.01, 0.012, 6, 1, false);
    geo.translate(0, 0.006, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    geo.applyMatrix4(new THREE.Matrix4().compose(base.clone().addScaledVector(n, 0.001), quat, new THREE.Vector3(1, 1, 1)));
    rivets.push(geo);
  }
  addMesh(torso, mergeGeometries(rivets), mats.shellDark, 'rivets');

  // Glowing tide veins run through the shell.
  const veins = [];
  for (const theta0 of [-0.45, 0.15, 0.55]) {
    for (let b = 0; b < 2; b++) {
      const pts = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const theta = theta0 + Math.sin(t * 3.2 + b) * 0.18 + t * 0.25;
        const phi = 0.28 + t * 0.5;
        const p = sampler(theta, phi);
        const n = carapaceNormal(sampler, theta, phi);
        pts.push(p.addScaledVector(n, 0.0022));
      }
      veins.push(makeTaperedTubeGeometry(pts, (t) => 0.0022 * (0.45 + Math.sin(t * Math.PI) * 0.7), 12, 3));
    }
  }
  addMesh(torso, mergeGeometries(veins), mats.glow, 'crab-veins');

  // Old shell scars.
  const scarGeos = [];
  for (let i = 0; i < 4; i++) {
    const theta0 = -0.7 + rng() * 1.4;
    const phi0 = 0.26 + rng() * 0.3;
    const pts = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      const theta = theta0 + t * 0.22 + Math.sin(t * 6) * 0.03;
      const phi = clamp(phi0 + t * 0.22, 0.1, 0.9);
      const p = sampler(theta, phi);
      const nrm = carapaceNormal(sampler, theta, phi);
      pts.push(p.addScaledVector(nrm, 0.0025));
    }
    scarGeos.push(makeTaperedTubeGeometry(pts, (t) => 0.0026 * (1 - t * 0.55), 10, 3));
  }
  addMesh(torso, mergeGeometries(scarGeos), mats.scar, 'crab-scars');

  // Crown spikes around the front rim.
  const spikes = [];
  for (let i = 0; i < 9; i++) {
    const theta = -0.9 + (i / 8) * 1.8;
    const p = sampler(theta, Math.PI / 2 - 0.08);
    const n = carapaceNormal(sampler, theta, Math.PI / 2 - 0.08);
    const h = topH * (0.22 + (i % 3) * 0.05);
    const geo = new THREE.ConeGeometry(0.012, h, 6, 1, false);
    geo.translate(0, h * 0.5, 0);
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
    geo.applyMatrix4(new THREE.Matrix4().compose(p, quat, new THREE.Vector3(1, 1, 1)));
    spikes.push(geo);
  }
  addMesh(torso, mergeGeometries(spikes), mats.bone, 'crown-spines');
}

// ─────────────────────────────────────────────────────────────────────────────
// Jelly
// ─────────────────────────────────────────────────────────────────────────────

function makeBellGeometry(R, H, seg, rings, lobes, phase, innerScale = 1) {
  const positions = [];
  const uvs = [];
  const indices = [];
  const ringStarts = [];
  const cols = seg + 1;
  for (let i = 1; i <= rings; i++) {
    const t = i / rings;
    const tq = Math.sin((t * Math.PI) / 2);
    let r = R * Math.pow(tq, 0.82) * innerScale;
    const y = H * Math.pow(Math.cos((t * Math.PI) / 2), 1.16);
    const lobe = 1 + 0.05 * Math.sin(lobes * (t * 4.3) + phase) * smoothstep(0.55, 1, t);
    ringStarts.push(positions.length / 3);
    for (let j = 0; j < cols; j++) {
      const theta = (j / seg) * TAU;
      const rr = r * lobe;
      const yy = y - Math.abs(Math.sin(theta * lobes * 0.5 + phase)) * 0.008 * smoothstep(0.7, 1, t);
      positions.push(Math.cos(theta) * rr, yy, Math.sin(theta) * rr);
      uvs.push(j / seg, t);
    }
  }
  const topPole = positions.length / 3;
  positions.push(0, H, 0);
  uvs.push(0.5, 0);
  for (let r = 0; r < ringStarts.length - 1; r++) {
    const a0 = ringStarts[r];
    const c0 = ringStarts[r + 1];
    for (let j = 0; j < seg; j++) {
      const a = a0 + j;
      const b = a + 1;
      const c = c0 + j;
      const d = c + 1;
      indices.push(a, b, c, b, d, c);
    }
  }
  const first = ringStarts[0];
  for (let j = 0; j < seg; j++) indices.push(topPole, first + j + 1, first + j);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

function buildJelly(def, cfg, mats, rng, q) {
  const s = def.shape;
  const w = clamp(num(s.w, 0.9), 0.3, 1.1);
  const h = clamp(num(s.h, 0.5), 0.2, 0.8);
  const R = 0.34 + w * 0.16;
  const H = 0.17 + h * 0.24;
  const pal = paletteOf(def);
  const torso = new THREE.Group();
  torso.name = 'torso';
  const bellGroup = new THREE.Group();
  bellGroup.name = 'bell';
  torso.add(bellGroup);
  const seg = q.key === 'high' ? 64 : 40;
  const rings = q.key === 'high' ? 24 : 16;
  const outer = makeBellGeometry(R, H, seg, rings, 12, rng() * TAU, 1);
  const body = addMesh(bellGroup, outer, mats.skin, 'body');
  const inner = makeBellGeometry(R * 0.9, H * 0.82, seg, rings, 12, rng() * TAU, 1);
  const innerMesh = addMesh(bellGroup, inner, mats.jellyInner, 'bell-inner');
  innerMesh.position.y = H * 0.02;

  // Tentacle material (local, but registered on the shared material bag).
  const tentacleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(shade(mixHex(pal.back, pal.accent, 0.45), -0.48)),
    roughness: 0.4,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.3,
    side: THREE.DoubleSide,
    emissive: new THREE.Color(pal.glow || pal.accent),
    emissiveIntensity: pal.glow ? 0.45 : 0.16,
  });
  tentacleMat.name = 'jelly-tentacle';
  mats.tentacle = tentacleMat;

  const gonadMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(mixHex('#b06d88', pal.accent, 0.22)),
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  });
  gonadMat.name = 'jelly-gonads';
  mats.gonads = gonadMat;

  // Rim tube, following the scalloped edge.
  if (q.key !== 'low') {
    const rim = [];
    for (let i = 0; i <= 64; i++) {
      const theta = (i / 64) * TAU;
      const lobe = 1 + 0.05 * Math.sin(12 * theta + 0.4);
      rim.push(new THREE.Vector3(Math.cos(theta) * R * lobe, -0.002, Math.sin(theta) * R * lobe));
    }
    addTubeDetail(bellGroup, rim, 0.003, tentacleMat, 'bell-rim', 24);
    addTubeDetail(bellGroup, rim, 0.0016, mats.glow, 'bell-rim-glow', 24);

    // A closed annular lip between the outer bell and the inner bell.
    const bandPositions = [];
    const bandUvs = [];
    const bandIndices = [];
    const bandSegs = 64;
    for (let i = 0; i <= bandSegs; i++) {
      const theta = (i / bandSegs) * TAU;
      const lobe = 1 + 0.05 * Math.sin(12 * theta + 0.4);
      const outer = new THREE.Vector3(Math.cos(theta) * R * lobe, -0.002, Math.sin(theta) * R * lobe);
      const inner = new THREE.Vector3(Math.cos(theta) * R * 0.88, -0.006, Math.sin(theta) * R * 0.88);
      bandPositions.push(outer.x, outer.y, outer.z, inner.x, inner.y, inner.z);
      bandUvs.push(i / bandSegs, 1, i / bandSegs, 0.72);
    }
    for (let i = 0; i < bandSegs; i++) {
      const a = i * 2;
      bandIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
    const bandGeo = new THREE.BufferGeometry();
    bandGeo.setAttribute('position', new THREE.Float32BufferAttribute(bandPositions, 3));
    bandGeo.setAttribute('uv', new THREE.Float32BufferAttribute(bandUvs, 2));
    bandGeo.setIndex(bandIndices);
    bandGeo.computeVertexNormals();
    addMesh(bellGroup, bandGeo, tentacleMat, 'bell-lip');
  }

  // Four horseshoe gonads glow through the bell.
  const gonadGeos = [];
  for (let i = 0; i < 4; i++) {
    const torus = new THREE.TorusGeometry(R * 0.3, 0.028, 8, 26, Math.PI * 1.12);
    torus.rotateX(Math.PI / 2);
    torus.rotateY((i / 4) * TAU + 0.38);
    torus.translate(0, H * 0.32, 0);
    gonadGeos.push(torus);
  }
  const gonadMesh = addMesh(bellGroup, mergeGeometries(gonadGeos), gonadMat, 'gonads');
  gonadMesh.renderOrder = 3;

  const stomach = new THREE.TorusGeometry(R * 0.1, 0.016, 8, 22);
  stomach.rotateX(Math.PI / 2);
  stomach.translate(0, H * 0.3, 0);
  const stomachMesh = addMesh(bellGroup, stomach, mats.glowSolid, 'stomach');
  stomachMesh.renderOrder = 4;

  // Radial canals inside the bell, visible through the translucent dome.
  const canalGeos = [];
  for (let i = 0; i < 12; i++) {
    const theta = (i / 12) * TAU;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const t = k / 8;
      const rr = lerp(R * 0.1, R * 0.88, t);
      const yy = H * (1 - 0.06) * Math.pow(1 - t, 1.35) + 0.005;
      pts.push(new THREE.Vector3(Math.cos(theta) * rr, yy, Math.sin(theta) * rr));
    }
    canalGeos.push(makeTaperedTubeGeometry(pts, (t) => 0.0024 * (0.6 + Math.sin(t * Math.PI) * 0.5), 10, 3));
  }
  addMesh(bellGroup, mergeGeometries(canalGeos), mats.glow, 'radial-canals');

  // Tentacles, merged into one swaying group.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, 0, 0);
  const tentacleGeos = [];
  const count = q.key === 'high' ? 24 : 14;
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * TAU + rng() * 0.08;
    const lobe = 1 + 0.05 * Math.sin(12 * theta + 0.4);
    const start = new THREE.Vector3(Math.cos(theta) * R * lobe * 0.92, -H * 0.03, Math.sin(theta) * R * lobe * 0.92);
    const len = H * (1.05 + rng() * 0.85);
    const sway = 0.035 + rng() * 0.05;
    const phase = rng() * TAU;
    const pts = [];
    for (let k = 0; k <= 8; k++) {
      const tt = k / 8;
      const curl = Math.sin(tt * 4.2 + phase) * sway * tt * 1.35;
      pts.push(start.clone().add(new THREE.Vector3(
        Math.cos(theta) * (sway * tt + curl),
        -len * tt,
        Math.sin(theta) * (sway * tt * 1.3 - curl * 0.7)
      )));
    }
    tentacleGeos.push(makeTaperedTubeGeometry(pts, (t) => 0.011 * (1 - t * 0.92), 18, 6));
  }
  addMesh(tail, mergeGeometries(tentacleGeos), tentacleMat, 'tentacles');

  // Four frilled oral arms.
  const armGeos = [];
  for (let i = 0; i < 4; i++) {
    const theta = (i / 4) * TAU + Math.PI / 4;
    const start = new THREE.Vector3(Math.cos(theta) * R * 0.24, -H * 0.05, Math.sin(theta) * R * 0.24);
    const len = H * 0.85;
    const pts = [
      start,
      start.clone().add(new THREE.Vector3(Math.cos(theta) * 0.022, -len * 0.36, Math.sin(theta) * 0.022)),
      start.clone().add(new THREE.Vector3(Math.cos(theta) * 0.055, -len * 0.72, Math.sin(theta) * 0.04)),
      start.clone().add(new THREE.Vector3(Math.cos(theta) * 0.03, -len, Math.sin(theta) * 0.06)),
    ];
    armGeos.push(makeTaperedTubeGeometry(pts, (t) => 0.025 * (1 - t * 0.84), 14, 5));
  }
  addMesh(tail, mergeGeometries(armGeos), tentacleMat, 'oral-arms');

  tail.userData.tailAxis = 'z';
  tail.userData.tailAmp = 0.07;
  tail.userData.tailFreq = 0.9;

  return {
    torso,
    body,
    tail,
    pectorals: [],
    wings: [],
    legs: [],
    claws: [],
    tailAxis: 'z',
    tailAmp: 0.07,
    tailFreq: 0.9,
    bell: bellGroup,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public model factory
// ─────────────────────────────────────────────────────────────────────────────

function collectPulseMaterials(mats) {
  const emissive = [];
  const opacity = [];
  for (const key of ['skin', 'wingSkin', 'fin', 'finEdge', 'iris', 'jellyInner', 'shell', 'tentacle', 'tentacleMat']) {
    const m = mats[key];
    if (!m) continue;
    if (typeof m.emissiveIntensity === 'number' && m.emissiveIntensity > 0.001) {
      if (m.userData.baseEmissiveIntensity == null) m.userData.baseEmissiveIntensity = m.emissiveIntensity;
      emissive.push(m);
    }
    if (m.isMeshBasicMaterial && m.transparent) {
      if (m.userData.baseOpacity == null) m.userData.baseOpacity = m.opacity;
      opacity.push(m);
    }
  }
  return { emissive, opacity };
}

export function createFishModel(fishDef, options = {}) {
  const source = fishDef || {};
  const def = {
    ...source,
    shape: { ...(source.shape || {}) },
  };
  const q = qualityInfo(options.quality);
  const portrait = !!options.portrait;
  const id = def.id || def.name || 'fish';
  const archetype = archetypeOf(def);
  const seed = hashString(id);
  const rng = mulberry32(seed ^ 0x51ed270b);
  const textures = acquireSpeciesTextures(def, q);
  const mats = createMaterials(def, textures, q);
  const root = new THREE.Group();
  root.name = `fish:${id}`;
  const rig = new THREE.Group();
  rig.name = 'fish-rig';
  root.add(rig);

  try {
    const cfg = archetypeConfig(def);
    let built;
    let shape = null;
    if (archetype === 'crab') {
      built = buildCrab(def, cfg, mats, rng, q);
    } else if (archetype === 'jelly') {
      built = buildJelly(def, cfg, mats, rng, q);
    } else if (archetype === 'ray') {
      built = buildRay(def, cfg, mats, rng, q);
    } else {
      shape = createBodyShape(def, cfg);
      built = buildTubeCreature(def, cfg, shape, mats, rng, q);
    }

    rig.add(built.torso);
    rig.add(built.tail);

    if (q.shadow) {
      built.body.castShadow = true;
      built.body.receiveShadow = true;
    }

    const pulse = collectPulseMaterials(mats);
    root.userData = {
      fishId: id,
      fishDef: def,
      archetype,
      quality: q.key,
      portrait,
      body: built.body,
      torso: built.torso,
      tail: built.tail,
      materials: mats,
      pectorals: built.pectorals || [],
      wings: built.wings || [],
      legs: built.legs || [],
      claws: built.claws || [],
      bell: built.bell || null,
      rayDisc: built.rayDisc || null,
      antennae: built.torso.userData.antennae || null,
      lurePivot: built.torso.userData.lurePivot || null,
      tailAxis: built.tailAxis || 'y',
      tailAmp: built.tailAmp || 0.16,
      tailFreq: built.tailFreq || 2.1,
      animPhase: rng() * TAU,
      glowMaterials: pulse.emissive,
      opacityMaterials: pulse.opacity,
      _textureKey: textures.key,
      _disposed: false,
    };
    // Expose the lure pivot from the torso as well (addLure stores it there).
    if (built.torso.userData.lurePivot) root.userData.lurePivot = built.torso.userData.lurePivot;
    if (built.torso.userData.antennae) root.userData.antennae = built.torso.userData.antennae;
    void shape;

    // Recenter and scale exactly. The rig keeps the animation pivots intact.
    root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const naturalLength = Math.max(0.0001, size.x);
    const scale = portrait
      ? 1.0 / naturalLength
      : (speciesLength(def) * Math.max(0.0001, num(options.scale, 1))) / naturalLength;
    rig.scale.setScalar(scale);
    rig.position.copy(center).multiplyScalar(-scale);
    root.userData.naturalLength = naturalLength;
    root.userData.length = naturalLength * scale;
    root.userData.modelScale = scale;
    root.updateMatrixWorld(true);
    return root;
  } catch (err) {
    // Never leave a half-built model or leaked texture reference behind.
    releaseSpeciesTextures(textures.key);
    try {
      root.traverse((obj) => {
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
          const list = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of list) m.dispose();
        }
      });
    } catch (_) {
      /* ignore cleanup errors */
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Animation
// ─────────────────────────────────────────────────────────────────────────────

export function animateFish(group, time = 0, speed = 1) {
  if (!group || !group.userData || group.userData._disposed) return;
  const ud = group.userData;
  const s = Math.max(0.0001, num(speed, 1));
  const t = num(time, 0) * s + (ud.animPhase || 0);
  const amp = clamp(0.55 + s * 0.45, 0.55, 1.65);

  if (ud.torso) {
    const rayFactor = ud.archetype === 'ray' || ud.archetype === 'crab' ? 0.45 : 1;
    ud.torso.rotation.z = (Math.sin(t * 0.8) * 0.012 + Math.sin(t * 2.05 + 1.7) * 0.0045) * amp * rayFactor;
    ud.torso.rotation.y = Math.sin(t * 0.62 + 0.8) * 0.008 * amp * rayFactor;
    if (ud.archetype === 'crab') ud.torso.position.y = Math.sin(t * 1.4) * 0.0025;
  }

  if (ud.tail) {
    const freq = ud.tailFreq || 2.1;
    const ta = (ud.tailAmp || 0) * amp;
    if (ud.tailAxis === 'z') {
      ud.tail.rotation.z = Math.sin(t * freq) * ta + Math.sin(t * freq * 1.73 + 1.1) * ta * 0.22;
      ud.tail.rotation.y = Math.sin(t * freq * 0.52 + 0.6) * ta * 0.18;
    } else {
      ud.tail.rotation.y = Math.sin(t * freq) * ta + Math.sin(t * freq * 1.67 + 1.4) * ta * 0.24;
      if (ud.archetype === 'ray' || ud.archetype === 'jelly') {
        ud.tail.rotation.z = Math.sin(t * freq * 0.63 + 1.2) * ta * 0.35;
      }
    }
  }

  if (ud.pectorals) {
    for (let i = 0; i < ud.pectorals.length; i++) {
      const p = ud.pectorals[i];
      if (!p || !p.pivot) continue;
      const ph = p.phase || 0;
      p.pivot.rotation.x = Math.sin(t * 1.72 + ph) * 0.2 * amp;
      p.pivot.rotation.z = Math.sin(t * 1.72 + ph + 1.1) * 0.11 * amp;
    }
  }

  if (ud.wings) {
    for (let i = 0; i < ud.wings.length; i++) {
      const w = ud.wings[i];
      if (!w || !w.pivot) continue;
      const ph = w.phase || 0;
      w.pivot.rotation.x = -Math.sin(t * 1.12 + ph) * 0.11 * amp * (w.side || 1);
      w.pivot.rotation.z = Math.sin(t * 0.82 + ph + 1.2) * 0.035 * amp;
    }
  }

  if (ud.rayDisc && ud.rayDisc.morphTargetInfluences && ud.rayDisc.morphTargetInfluences.length >= 2) {
    const wave = Math.sin(t * 1.12 + 0.4);
    ud.rayDisc.morphTargetInfluences[0] = Math.max(0, wave) * 0.95 * amp;
    ud.rayDisc.morphTargetInfluences[1] = Math.max(0, -wave) * 0.95 * amp;
  }

  if (ud.legs) {
    for (let i = 0; i < ud.legs.length; i++) {
      const leg = ud.legs[i];
      if (!leg || !leg.pivot) continue;
      const ph = leg.phase || 0;
      const sw = Math.sin(t * 2.15 + ph) * 0.11 * amp;
      leg.pivot.rotation.y = sw;
      leg.pivot.rotation.z = Math.cos(t * 2.15 + ph + 0.7) * 0.045 * amp;
    }
  }

  if (ud.claws) {
    for (let i = 0; i < ud.claws.length; i++) {
      const claw = ud.claws[i];
      if (!claw || !claw.pivot) continue;
      const ph = claw.phase || 0;
      claw.pivot.rotation.y = (claw.baseRotY || 0) + Math.sin(t * 1.3 + ph) * 0.055 * amp;
      claw.pivot.rotation.z = (claw.baseRotZ || 0) + Math.cos(t * 1.7 + ph + 0.4) * 0.035 * amp;
      if (claw.finger) claw.finger.rotation.z = 0.32 + Math.sin(t * 1.85 + ph) * 0.16 * amp;
    }
  }

  if (ud.antennae) {
    ud.antennae.rotation.y = Math.sin(t * 1.35) * 0.05 * amp;
    ud.antennae.rotation.z = Math.cos(t * 1.1 + 0.5) * 0.03 * amp;
  }

  if (ud.lurePivot) {
    ud.lurePivot.rotation.z = Math.sin(t * 1.25) * 0.075 * amp;
    ud.lurePivot.rotation.x = Math.cos(t * 0.95 + 0.7) * 0.055 * amp;
  }

  if (ud.bell) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.55);
    ud.bell.scale.set(1 + pulse * 0.035 * amp, 1 - pulse * 0.045 * amp, 1 + pulse * 0.035 * amp);
  }

  const glowPulse = 0.82 + 0.18 * Math.sin(t * 1.65 + 0.4);
  for (let i = 0; i < ud.glowMaterials.length; i++) {
    const m = ud.glowMaterials[i];
    const base = m.userData.baseEmissiveIntensity;
    if (base != null) m.emissiveIntensity = base * glowPulse;
  }
  for (let i = 0; i < ud.opacityMaterials.length; i++) {
    const m = ud.opacityMaterials[i];
    const base = m.userData.baseOpacity;
    if (base != null) m.opacity = base * (0.85 + 0.15 * glowPulse);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Portrait renderer
// ─────────────────────────────────────────────────────────────────────────────

const PORTRAIT_CACHE = new Map();
let PORTRAIT_QUEUE = Promise.resolve();

function portraitDirection(archetype) {
  switch (archetype) {
    case 'ray':
      return new THREE.Vector3(0.28, 0.92, 0.58).normalize();
    case 'crab':
      return new THREE.Vector3(0.45, 0.64, 1.0).normalize();
    case 'jelly':
      return new THREE.Vector3(0.22, 0.34, 1.0).normalize();
    case 'shrimp':
      return new THREE.Vector3(0.5, 0.28, 1.0).normalize();
    case 'whale':
      return new THREE.Vector3(0.55, 0.72, 0.9).normalize();
    case 'eel':
      return new THREE.Vector3(0.42, 0.28, 1.0).normalize();
    default:
      return new THREE.Vector3(0.62, 0.35, 1.0).normalize();
  }
}

export class FishPortraitRenderer {
  constructor({ width = 640, height = 480 } = {}) {
    this.width = Math.max(64, Math.round(width));
    this.height = Math.max(64, Math.round(height));
    this._pending = new Map();
    this._disposed = false;
  }

  async getPortrait(fishDef) {
    if (this._disposed) throw new Error('FishPortraitRenderer has been disposed');
    const id = (fishDef && (fishDef.id || fishDef.name)) || 'fish';
    const key = `${id}::${this.width}x${this.height}`;
    if (PORTRAIT_CACHE.has(key)) return PORTRAIT_CACHE.get(key);
    if (this._pending.has(key)) return this._pending.get(key);

    const run = () =>
      this._render(fishDef)
        .then((url) => {
          if (url && url !== FALLBACK_PORTRAIT) PORTRAIT_CACHE.set(key, url);
          return url || FALLBACK_PORTRAIT;
        })
        .catch((err) => {
          console.warn('[FishFactory] portrait failed', id, err);
          return FALLBACK_PORTRAIT;
        })
        .finally(() => {
          this._pending.delete(key);
        });
    const promise = PORTRAIT_QUEUE.then(run, run);
    PORTRAIT_QUEUE = promise.then(
      () => undefined,
      () => undefined
    );
    this._pending.set(key, promise);
    return promise;
  }

  async _render(fishDef) {
    if (typeof document === 'undefined') return FALLBACK_PORTRAIT;
    const def = fishDef || {};
    const archetype = archetypeOf(def);
    const model = createFishModel(def, { portrait: true, quality: 'high' });
    animateFish(model, 0.55, 0.8);

    const scene = new THREE.Scene();
    scene.add(model);

    const pal = paletteOf(def);
    const lum = (hex) => {
      const [r, g, b] = parseHex(hex);
      return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    };
    const darkSpecies = (lum(pal.back) + lum(pal.mid) + lum(pal.belly)) / 3 < 0.24;
    const hemi = new THREE.HemisphereLight(0xd8f1ff, 0x07121b, darkSpecies ? 0.62 : 0.38);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xfff0d7, darkSpecies ? 2.5 : 2.15);
    key.position.set(3.2, 3.6, 4.4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x7fc4ff, 0.85);
    fill.position.set(-4.2, 0.7, 2.7);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(0x9ff7ff, 2.9);
    rim.position.set(-2.0, 3.0, -4.6);
    scene.add(rim);
    const under = new THREE.DirectionalLight(0x2b5870, 0.65);
    under.position.set(0.6, -3.4, 1.2);
    scene.add(under);
    const front = new THREE.DirectionalLight(0xfff4e6, darkSpecies ? 1.85 : 0.95);
    front.position.set(2.6, 1.2, 3.8);
    scene.add(front);
    const warm = new THREE.PointLight(0xffcf99, 5.5, 9, 2);
    warm.position.set(1.8, 0.5, 2.5);
    scene.add(warm);

    const box = new THREE.Box3().setFromObject(model);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const radius = Math.max(0.05, sphere.radius);
    const camera = new THREE.PerspectiveCamera(33, this.width / this.height, Math.max(0.001, radius * 0.01), radius * 30 + 10);
    camera.aspect = this.width / this.height;
    const vfov = camera.fov * DEG;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const fitFov = Math.min(vfov, hfov);
    let distance = (radius / Math.sin(fitFov / 2)) * 1.05;
    const dir = portraitDirection(archetype);
    if (def.id === 'flying_fish') dir.set(0.5, 0.58, 1.0).normalize();
    const center = box.getCenter(new THREE.Vector3());
    const corners = [];
    for (const x of [box.min.x, box.max.x]) {
      for (const y of [box.min.y, box.max.y]) {
        for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
      }
    }
    camera.position.copy(center).addScaledVector(dir, distance);
    camera.lookAt(center);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 3; i++) {
      let fill = 0;
      for (const corner of corners) {
        const v = corner.clone().project(camera);
        fill = Math.max(fill, Math.abs(v.x), Math.abs(v.y));
      }
      if (!Number.isFinite(fill) || fill < 1e-4) break;
      distance *= fill / 0.9;
      camera.position.copy(center).addScaledVector(dir, distance);
      camera.lookAt(center);
      camera.updateMatrixWorld(true);
    }
    camera.near = Math.max(0.001, distance - radius * 2.5);
    camera.far = distance + radius * 5 + 5;
    camera.updateProjectionMatrix();
    scene.updateMatrixWorld(true);

    let renderer = null;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(1);
      renderer.setSize(this.width, this.height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.setClearColor(0x000000, 0);
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      return url && url.length > 100 ? url : FALLBACK_PORTRAIT;
    } finally {
      disposeFishModel(model);
      scene.clear();
      if (renderer) {
        const canvas = renderer.domElement;
        renderer.dispose();
        if (renderer.forceContextLoss) renderer.forceContextLoss();
        if (canvas) {
          canvas.width = 1;
          canvas.height = 1;
        }
      }
    }
  }

  dispose() {
    this._disposed = true;
    this._pending.clear();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Disposal
// ─────────────────────────────────────────────────────────────────────────────

export function disposeFishModel(group) {
  if (!group || !group.userData || group.userData._disposed) return;
  const geometries = new Set();
  const materials = new Set();
  group.traverse((obj) => {
    if (obj.geometry) geometries.add(obj.geometry);
    if (obj.material) {
      const list = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of list) if (m) materials.add(m);
    }
  });
  for (const geo of geometries) {
    try {
      geo.dispose();
    } catch (_) {
      /* ignore */
    }
  }
  for (const mat of materials) {
    try {
      mat.dispose();
    } catch (_) {
      /* ignore */
    }
  }
  const key = group.userData._textureKey;
  if (key) releaseSpeciesTextures(key);
  group.userData._disposed = true;
  group.userData.body = null;
  group.userData.tail = null;
  group.clear();
}

