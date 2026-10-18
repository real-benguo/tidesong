import * as THREE from 'three';
import { clamp, smoothstep } from '../utils/math.js';

const SIZE = 460;
const SEGMENTS_HIGH = 230;
const SEGMENTS_LOW = 150;

export class Terrain {
  constructor({ shape, assets, config, quality = 'high' }) {
    this.shape = shape;
    this.assets = assets;
    this.config = config;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    this.material = this.createMaterial();
    this.mesh = this.createMesh(quality === 'high' ? SEGMENTS_HIGH : SEGMENTS_LOW);
    this.group.add(this.mesh);
    this.heightData = this.createHeightData(256);
    this.heightTexture = this.createHeightTexture(this.heightData, 256);
  }

  blendAt(h, slope, x, z) {
    const profile = this.config.terrain.profile;
    const n = this.shape.fbm(x * 0.09 + 12, z * 0.09 - 7, 2);
    let sand = smoothstep(4.4, 0.1, h);
    let rock = smoothstep(0.2, 0.58, slope) * 0.88 + smoothstep(13, 23, h) * 0.42;
    let grass = 1 - sand;
    sand = Math.max(sand, smoothstep(2.1, 0.05, h) * 0.94);
    rock *= smoothstep(0.65, 3.6, h);

    if (profile === 'atoll') {
      sand = Math.max(sand, 0.8 + n * 0.08);
      rock *= 0.45;
      grass = Math.max(0, 1 - sand - rock);
    } else if (profile === 'marsh') {
      sand = Math.max(sand, smoothstep(1.2, 0.15, h) * 0.66);
      grass = Math.max(0.28, 1 - sand - rock * 0.5);
      rock *= 0.4;
    } else if (profile === 'cliff') {
      sand = Math.max(sand, smoothstep(1.4, 0.1, h) * 0.88);
      rock += smoothstep(0.12, 0.4, slope) * 0.4 * smoothstep(1.2, 4.0, h);
      grass = Math.max(0, 1 - sand - rock);
    } else if (profile === 'caldera') {
      sand = Math.max(sand, smoothstep(1.6, 0.1, h) * 0.7);
      rock += 0.42;
      grass = Math.max(0, 0.42 - sand - rock * 0.25);
    } else {
      sand = Math.max(sand, smoothstep(1.8, 0.05, h) * 0.92);
      grass = Math.max(0, 1 - sand - rock);
    }

    sand = clamp(sand + n * 0.05);
    rock = clamp(rock + n * 0.04);
    grass = clamp(grass);
    const total = sand + rock + grass || 1;
    return [sand / total, grass / total, rock / total];
  }

  createMaterial() {
    const a = this.assets;
    const p = this.config.palette;
    const profile = this.config.terrain.profile;
    const mat = new THREE.MeshStandardMaterial({
      map: a.get('sand')?.diffuse || null,
      normalMap: a.get('rock')?.normal || null,
      roughnessMap: a.get('sand')?.arm || null,
      metalnessMap: a.get('sand')?.arm || null,
      roughness: 1,
      metalness: 0,
      color: 0xffffff,
      envMapIntensity: 0.35,
    });
    mat.normalScale.set(0.9, 0.9);
    const sandTint = new THREE.Color(p.sand).lerp(new THREE.Color('#fff1c9'), 0.35).multiplyScalar(1.52);
    const grassTint = new THREE.Color(p.grass).lerp(new THREE.Color(p.grassDry), 0.18).multiplyScalar(1.26);
    const rockTint = new THREE.Color(p.rock).multiplyScalar(1.14);
    if (profile === 'caldera') sandTint.multiplyScalar(0.7);
    if (profile === 'marsh') sandTint.lerp(new THREE.Color('#726b51'), 0.35);
    const uniforms = {
      uSandMap: { value: a.get('sand').diffuse },
      uGrassMap: { value: a.get(profile === 'marsh' ? 'forest' : 'grass').diffuse },
      uRockMap: { value: a.get(profile === 'volcano' ? 'forest' : 'rock').diffuse },
      uSandN: { value: a.get('sand').normal },
      uGrassN: { value: a.get('grass').normal },
      uRockN: { value: a.get('rock').normal },
      uSandA: { value: a.get('sand').arm },
      uGrassA: { value: a.get('grass').arm },
      uRockA: { value: a.get('rock').arm },
      uMacro: { value: a.macro },
      uSandTint: { value: sandTint },
      uGrassTint: { value: grassTint },
      uRockTint: { value: rockTint },
      uDryTint: { value: new THREE.Color(p.grassDry).multiplyScalar(1.12) },
    };

    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          attribute vec3 aBlend;
          attribute float aHeight;
          varying vec3 vTerrainBlend;
          varying float vTerrainHeight;`
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vTerrainBlend = aBlend;
          vTerrainHeight = aHeight;`
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform sampler2D uSandMap;
          uniform sampler2D uGrassMap;
          uniform sampler2D uRockMap;
          uniform sampler2D uSandN;
          uniform sampler2D uGrassN;
          uniform sampler2D uRockN;
          uniform sampler2D uSandA;
          uniform sampler2D uGrassA;
          uniform sampler2D uRockA;
          uniform sampler2D uMacro;
          uniform vec3 uSandTint;
          uniform vec3 uGrassTint;
          uniform vec3 uRockTint;
          uniform vec3 uDryTint;
          varying vec3 vTerrainBlend;
          varying float vTerrainHeight;`
        )
        .replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec3 w = vTerrainBlend;
            vec2 uvS = vMapUv * vec2(42.0, 54.0);
            vec2 uvG = vMapUv * vec2(65.0, 78.0);
            vec2 uvR = vMapUv * vec2(27.0, 35.0);
            vec3 cSand = texture2D(uSandMap, uvS).rgb * uSandTint;
            vec3 cGrass = texture2D(uGrassMap, uvG).rgb * uGrassTint;
            vec3 cRock = texture2D(uRockMap, uvR).rgb * uRockTint;
            float macro = texture2D(uMacro, vMapUv * 2.35).r;
            float beach = (1.0 - smoothstep(0.4, 2.7, vTerrainHeight)) * w.x;
            cSand = mix(cSand, vec3(0.62, 0.5, 0.34) * (0.9 + macro * 0.18), beach * 0.62);
            cGrass *= mix(vec3(0.86, 0.94, 0.84), uDryTint / max(uGrassTint, vec3(0.01)), smoothstep(0.48, 0.82, macro));
            vec3 terrainColor = cSand * w.x + cGrass * w.y + cRock * w.z;
            float grain = texture2D(uMacro, vMapUv * 23.0).r;
            terrainColor *= 0.92 + macro * 0.28 + (grain - 0.5) * 0.1;
            float tl = dot(terrainColor, vec3(0.299, 0.587, 0.114));
            terrainColor = mix(vec3(tl), terrainColor, 1.16);
            float wet = (1.0 - smoothstep(0.1, 1.15, vTerrainHeight)) * w.x;
            terrainColor *= mix(1.0, 0.88, wet);
            diffuseColor.rgb *= terrainColor * 1.14;
          #endif`
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#ifdef USE_NORMALMAP_TANGENTSPACE
            vec3 nSand = texture2D(uSandN, vMapUv * vec2(42.0, 54.0)).xyz * 2.0 - 1.0;
            vec3 nGrass = texture2D(uGrassN, vMapUv * vec2(65.0, 78.0)).xyz * 2.0 - 1.0;
            vec3 nRock = texture2D(uRockN, vMapUv * vec2(27.0, 35.0)).xyz * 2.0 - 1.0;
            vec3 mapN = normalize(nSand * w.x + nGrass * w.y + nRock * w.z);
            mapN.xy *= normalScale;
            normal = normalize(tbn * mapN);
          #endif`
        )
        .replace(
          '#include <roughnessmap_fragment>',
          `float roughnessFactor = roughness;
          #ifdef USE_ROUGHNESSMAP
            vec4 aS = texture2D(uSandA, vMapUv * vec2(42.0, 54.0));
            vec4 aG = texture2D(uGrassA, vMapUv * vec2(65.0, 78.0));
            vec4 aR = texture2D(uRockA, vMapUv * vec2(27.0, 35.0));
            float roughnessBlend = aS.g * w.x + aG.g * w.y + aR.g * w.z;
            roughnessFactor *= mix(roughnessBlend, 0.42, smoothstep(0.5, 0.95, w.x) * (1.0 - smoothstep(0.1, 1.7, vTerrainHeight)));
          #endif`
        );
    };
    mat.customProgramCacheKey = () => `terrain-${profile}`;
    return mat;
  }

  createMesh(segments) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const blend = new Float32Array(pos.count * 3);
    const heights = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.shape.height(x, z);
      pos.setY(i, h);
      heights[i] = h;
      const slope = this.shape.slope(x, z);
      const w = this.blendAt(h, slope, x, z);
      blend[i * 3] = w[0];
      blend[i * 3 + 1] = w[1];
      blend[i * 3 + 2] = w[2];
    }
    geo.setAttribute('aBlend', new THREE.BufferAttribute(blend, 3));
    geo.setAttribute('aHeight', new THREE.BufferAttribute(heights, 1));
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'island-terrain';
    return mesh;
  }

  createHeightData(res = 256) {
    const data = new Float32Array(res * res);
    const half = SIZE / 2;
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const x = (i / (res - 1)) * SIZE - half;
        const z = (j / (res - 1)) * SIZE - half;
        data[j * res + i] = this.shape.height(x, z);
      }
    }
    this.heightRes = res;
    return data;
  }

  createHeightTexture(data, res) {
    const tex = new THREE.DataTexture(data, res, res, THREE.RedFormat, THREE.FloatType);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    this.heightTextureSize = SIZE;
    return tex;
  }

  sampleHeightTexture(x, z) {
    if (!this.heightData) return 0;
    const res = this.heightRes;
    const half = SIZE / 2;
    const fx = clamp((x + half) / SIZE) * (res - 1);
    const fz = clamp((z + half) / SIZE) * (res - 1);
    return this.heightData[Math.round(fz) * res + Math.round(fx)] || 0;
  }

  createPath(points, width = 2.1, material = null) {
    if (points.length < 2) return null;
    const curvePoints = points.map((p) => new THREE.Vector3(p.x, this.shape.height(p.x, p.z) + 0.06, p.z));
    const curve = new THREE.CatmullRomCurve3(curvePoints, false, 'catmullrom', 0.35);
    const steps = Math.max(30, Math.floor(curve.getLength() * 2.4));
    const verts = [];
    const uvs = [];
    const indices = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const p = curve.getPoint(t);
      const tangent = curve.getTangent(t);
      tangent.y = 0;
      tangent.normalize();
      const side = new THREE.Vector3().crossVectors(tangent, up).normalize();
      const w = width * (0.78 + Math.sin(t * Math.PI) * 0.22);
      const y = this.shape.height(p.x, p.z) + 0.075;
      const l = p.clone().addScaledVector(side, -w / 2);
      const r = p.clone().addScaledVector(side, w / 2);
      verts.push(l.x, y, l.z, r.x, y, r.z);
      uvs.push(0, t * 8, 1, t * 8);
      if (i < steps) {
        const a = i * 2;
        indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const mat = material || new THREE.MeshStandardMaterial({
      map: this.assets.setRepeat('sand', 1.2, 8, 'diffuse'),
      normalMap: this.assets.setRepeat('sand', 1.2, 8, 'normal'),
      color: new THREE.Color('#b49b76'),
      roughness: 0.98,
      metalness: 0,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    return mesh;
  }

  update(dt) {}

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.heightTexture.dispose();
    this.group.clear();
  }
}
