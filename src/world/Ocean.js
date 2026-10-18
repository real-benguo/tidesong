import * as THREE from 'three';

const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uStorm;
  varying vec3 vWorld;
  varying vec2 vUv;

  void main() {
    vec3 p = position;
    float d = length(p.xz);
    float swell = sin(p.x * 0.085 + uTime * 0.72) * 0.16
                + sin(p.z * 0.12 - uTime * 0.53) * 0.12
                + sin((p.x + p.z) * 0.047 + uTime * 0.31) * 0.22;
    p.y += swell * (0.5 + uStorm * 1.8) * smoothstep(900.0, 80.0, d);
    vec4 wp = modelMatrix * vec4(p, 1.0);
    vWorld = wp.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  uniform float uTime;
  uniform sampler2D uSky;
  uniform sampler2D uHeightMap;
  uniform sampler2D uFoam;
  uniform float uHeightSize;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoamColor;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogDensity;
  uniform float uStorm;
  uniform float uClarity;
  varying vec3 vWorld;
  varying vec2 vUv;

  vec2 waveGrad(vec2 p, vec2 dir, float len, float amp, float speed) {
    float k = 6.28318 / len;
    float phase = dot(dir, p) * k + uTime * speed;
    return dir * (amp * k * cos(phase));
  }

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    vec2 p = vWorld.xz;
    vec2 g = vec2(0.0);
    g += waveGrad(p, normalize(vec2(0.9, 0.35)), 19.0, 0.072, 0.9);
    g += waveGrad(p, normalize(vec2(-0.45, 0.85)), 10.5, 0.038, 1.35);
    g += waveGrad(p, normalize(vec2(0.2, -0.98)), 5.7, 0.017, 1.9);
    g += waveGrad(p, normalize(vec2(-0.8, -0.2)), 3.1, 0.008, 2.5);
    g += waveGrad(p, normalize(vec2(0.6, 0.8)), 1.45, 0.004, 3.4);
    float micro = sin(p.x * 2.9 + uTime * 2.2) * sin(p.y * 2.3 - uTime * 1.7);
    g += vec2(micro, -micro) * 0.006;
    g *= (0.7 + uStorm * 1.9);

    vec3 N = normalize(vec3(-g.x, 1.0, -g.y));
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.2);
    fres = mix(0.1, 1.0, fres);

    vec3 R = reflect(-V, N);
    R.y = max(R.y, 0.015);
    vec2 skyUv = vec2(atan(R.z, R.x) * 0.15915494 + 0.5, asin(clamp(R.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    vec3 sky = texture2D(uSky, skyUv).rgb;

    vec2 huv = (vWorld.xz + uHeightSize * 0.5) / uHeightSize;
    float bottom = texture2D(uHeightMap, clamp(huv, 0.0, 1.0)).r;
    float depth = max(0.0, -bottom);
    if (bottom > 0.12) discard;

    vec3 shallow = uShallow * (0.75 + 0.25 * clamp(depth / 2.0, 0.0, 1.0));
    vec3 deep = uDeep;
    vec3 body = mix(shallow, deep, smoothstep(0.3, 14.0, depth));
    float caustic = sin(p.x * 1.7 + uTime * 0.8) * sin(p.y * 1.3 - uTime * 0.65);
    body += max(caustic, 0.0) * 0.014 * (1.0 - smoothstep(0.0, 4.0, depth)) * uClarity;

    vec3 warmSky = mix(sky * 0.68, uSunColor * 0.28, 0.3);
    vec3 color = mix(body, warmSky, 0.08 + fres * 0.34);
    color += uSunColor * 0.012 * (0.4 + fres);

    vec3 H = normalize(uSunDir + V);
    float spec = pow(max(dot(N, H), 0.0), 900.0);
    float broad = pow(max(dot(N, H), 0.0), 55.0);
    color += uSunColor * (spec * 1.05 + broad * 0.07);

    float foamTex = texture2D(uFoam, p * 0.085 + vec2(uTime * 0.006, -uTime * 0.009)).a;
    float foamTex2 = texture2D(uFoam, p * 0.19 - vec2(uTime * 0.011, uTime * 0.004)).a;
    float shore = 1.0 - smoothstep(0.0, 1.65, depth);
    float foamLine = smoothstep(0.34, 0.78, foamTex * 0.65 + foamTex2 * 0.5 + shore * 0.32);
    float foam = shore * foamLine * (0.5 + 0.5 * sin(uTime * 1.15 + depth * 7.0));
    float crest = smoothstep(0.82, 1.0, length(g) * 0.7 + foamTex * 0.25) * uStorm;
    foam = clamp(foam + crest * 0.55, 0.0, 1.0);
    color = mix(color, uFoamColor, foam * 0.7);

    float alpha = mix(0.4, 0.95, smoothstep(0.0, 6.8, depth));
    alpha = max(alpha, foam * 0.9);

    float fogDist = length(vWorld.xz - cameraPosition.xz);
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * fogDist * fogDist);
    color = mix(color, uFogColor, clamp(fog, 0.0, 0.95));

    gl_FragColor = vec4(color, alpha);
  }
`;

export class Ocean {
  constructor({ scene, config, terrain, assets, quality = 'high' }) {
    this.scene = scene;
    this.config = config;
    this.assets = assets;
    this.terrain = terrain;
    const seg = quality === 'high' ? 140 : 90;
    const geo = new THREE.PlaneGeometry(2600, 2600, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const w = config.water;
    const sun = new THREE.Vector3();
    const el = THREE.MathUtils.degToRad(config.sun.elevation);
    const az = THREE.MathUtils.degToRad(config.sun.azimuth);
    sun.set(Math.sin(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();

    const hdr = assets.skies[config.sky]?.texture;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uSky: { value: hdr || null },
        uHeightMap: { value: terrain.heightTexture },
        uHeightSize: { value: terrain.heightTextureSize },
        uFoam: { value: assets.foam },
        uShallow: { value: new THREE.Color(w.shallow) },
        uDeep: { value: new THREE.Color(w.deep) },
        uFoamColor: { value: new THREE.Color(w.foam) },
        uSunColor: { value: new THREE.Color(w.sun) },
        uSunDir: { value: sun },
        uFogColor: { value: new THREE.Color(config.fog.color) },
        uFogDensity: { value: config.fog.density * 1.35 },
        uStorm: { value: w.storm },
        uClarity: { value: w.clarity },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = 'ocean';
    this.mesh.renderOrder = 2;
    this.mesh.receiveShadow = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.ripples = [];
    this.rippleGroup = new THREE.Group();
    this.rippleGroup.name = 'ripples';
    scene.add(this.rippleGroup);
  }

  update(dt, t) {
    this.material.uniforms.uTime.value = t;
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.age += dt;
      const life = r.age / r.life;
      if (life >= 1) {
        this.rippleGroup.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        this.ripples.splice(i, 1);
        continue;
      }
      const s = 0.4 + life * r.radius;
      r.mesh.scale.set(s, s, s);
      r.mesh.material.opacity = (1 - life) * (r.opacity || 0.55);
    }
  }

  ripple(x, z, { radius = 5, life = 1.6, opacity = 0.5, color = '#d9ece8' } = {}) {
    const geo = new THREE.RingGeometry(0.84, 1.0, 48);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.045, z);
    mesh.scale.setScalar(0.4);
    this.rippleGroup.add(mesh);
    this.ripples.push({ mesh, age: 0, life, radius, opacity });
    if (this.ripples.length > 30) {
      const old = this.ripples.shift();
      this.rippleGroup.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
    return mesh;
  }

  splash(x, z, count = 3) {
    for (let i = 0; i < count; i++) {
      setTimeout(() => this.ripple(x + (Math.random() - 0.5) * 0.8, z + (Math.random() - 0.5) * 0.8, {
        radius: 3 + Math.random() * 3, life: 1.2 + Math.random() * 1.1, opacity: 0.35,
      }), i * 160);
    }
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.scene.remove(this.rippleGroup);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.rippleGroup.clear();
  }
}
