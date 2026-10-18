import * as THREE from 'three';
import { rand } from '../utils/math.js';

const SKY_FRAG = /* glsl */ `
  precision highp float;
  uniform sampler2D uSky;
  uniform float uTime;
  uniform float uRotation;
  uniform float uCoverage;
  uniform float uStorm;
  uniform float uFlash;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uCloudLit;
  uniform vec3 uCloudShadow;
  uniform vec3 uHaze;
  uniform vec3 uEmber;
  varying vec3 vDir;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  float noise2(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
               mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    mat2 rot = mat2(0.8, -0.6, 0.6, 0.8);
    for (int i = 0; i < 5; i++) {
      v += a * noise2(p);
      p = rot * p * 2.03 + 11.7;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 d = normalize(vDir);
    vec3 sd = d;
    float cs = cos(uRotation);
    float sn = sin(uRotation);
    sd.xz = mat2(cs, -sn, sn, cs) * sd.xz;
    vec2 uv = vec2(atan(sd.z, sd.x) * 0.15915494 + 0.5, asin(clamp(sd.y, -1.0, 1.0)) * 0.31830989 + 0.5);
    vec3 sky = texture2D(uSky, uv).rgb;

    float horizonFade = smoothstep(0.0, 0.055, d.y);
    vec2 cuv = d.xz / (d.y + 0.17);
    float n1 = fbm(cuv * 1.15 + vec2(uTime * 0.004, uTime * 0.0015));
    float n2 = fbm(cuv * 3.4 - vec2(uTime * 0.007, -uTime * 0.002));
    float n = n1 * 0.72 + n2 * 0.28;
    float cov = uCoverage;
    float cloud = smoothstep(1.0 - cov * 1.04, 1.0 - cov * 1.04 + 0.22, n);
    cloud *= horizonFade;
    cloud *= 0.82 + 0.18 * smoothstep(0.0, 0.3, d.y);

    float sunDot = max(dot(d, uSunDir), 0.0);
    vec3 lit = mix(uCloudLit, uSunColor * 1.18, pow(sunDot, 3.0) * 0.72);
    vec3 shadow = mix(uCloudShadow, uEmber, 0.24 + 0.3 * uStorm);
    vec3 cloudCol = mix(shadow, lit, smoothstep(0.2, 0.88, n) + 0.08);
    cloudCol += uSunColor * pow(sunDot, 14.0) * 0.65 * (1.0 - cloud * 0.35);

    vec3 col = mix(sky, cloudCol, cloud * 0.93);
    col += uSunColor * pow(sunDot, 240.0) * (0.9 - cloud * 0.3);
    col += uEmber * pow(1.0 - abs(d.y), 8.0) * 0.08 * uStorm;

    float hz = 1.0 - smoothstep(-0.005, 0.15, max(d.y, 0.0));
    col = mix(col, uHaze, hz * 0.68);
    col = mix(uHaze, col, smoothstep(-0.035, 0.025, d.y));
    col += uFlash * vec3(0.58, 0.7, 0.82);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function cloudSettings(config) {
  const id = config.id;
  if (id === 'hub') return { coverage: 0.66, lit: '#ffd3aa', shadow: '#48596a', ember: '#e9a87c' };
  if (id === 'mangrove') return { coverage: 0.64, lit: '#dfe4d6', shadow: '#586a62', ember: '#9baf9d' };
  if (id === 'atoll') return { coverage: 0.4, lit: '#fffdf2', shadow: '#9fbac1', ember: '#e8f1e9' };
  if (id === 'cliffs') return { coverage: 0.92, lit: '#9fadb6', shadow: '#34434d', ember: '#71848f' };
  return { coverage: 0.82, lit: '#a97562', shadow: '#2c2020', ember: '#ff7442' };
}

export class SkySystem {
  constructor({ scene, config, assets, quality = 'high' }) {
    this.scene = scene;
    this.config = config;
    this.assets = assets;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'sky';
    scene.add(this.group);
    this.lightning = 0;
    this.nextLightning = rand(4, 12);
    this.flash = 0;
    this.time = 0;
  }

  async load() {
    const { envMap } = await this.assets.loadSky(this.config.sky);
    const scene = this.scene;
    scene.background = null;
    scene.environment = envMap;
    scene.environmentRotation.set(0, (this.config.skyRotation || 0) + 0.2, 0);
    scene.environmentIntensity = this.config.weather === 'storm' ? 0.55 : 0.76;
    scene.fog = new THREE.FogExp2(new THREE.Color(this.config.fog.color), this.config.fog.density);
    this.envMap = envMap;

    const s = this.config.sun;
    const el = THREE.MathUtils.degToRad(s.elevation);
    const az = THREE.MathUtils.degToRad(s.azimuth);
    this.sunDir = new THREE.Vector3(
      Math.cos(el) * Math.sin(az),
      Math.sin(el),
      Math.cos(el) * Math.cos(az)
    ).normalize();

    const darkIsland = this.config.id === 'volcano' || this.config.id === 'cliffs';
    const hemi = new THREE.HemisphereLight(new THREE.Color(s.ambient), new THREE.Color(this.config.palette.rock), darkIsland ? 1.5 : 1.0);
    hemi.position.set(0, 80, 0);
    this.group.add(hemi);
    this.hemi = hemi;

    const dir = new THREE.DirectionalLight(new THREE.Color(s.color), s.intensity);
    dir.position.copy(this.sunDir).multiplyScalar(130);
    dir.target.position.set(0, 0, 0);
    dir.castShadow = true;
    dir.shadow.mapSize.set(this.quality === 'high' ? 2048 : 1024, this.quality === 'high' ? 2048 : 1024);
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 320;
    dir.shadow.camera.left = -110;
    dir.shadow.camera.right = 110;
    dir.shadow.camera.top = 110;
    dir.shadow.camera.bottom = -110;
    dir.shadow.bias = -0.00025;
    dir.shadow.normalBias = 0.045;
    dir.shadow.radius = 3;
    this.group.add(dir);
    this.group.add(dir.target);
    this.sun = dir;

    const fillColor = this.config.id === 'volcano' ? this.config.sun.color : this.config.water.shallow;
    const fillPower = this.config.id === 'volcano' ? 1.15 : this.config.id === 'cliffs' ? 1.0 : this.config.id === 'mangrove' ? 0.52 : 0.42;
    const fill = new THREE.DirectionalLight(new THREE.Color(fillColor), fillPower);
    fill.position.set(-70, 45, 90);
    this.group.add(fill);
    this.fill = fill;

    const clouds = cloudSettings(this.config);
    const skyTex = this.assets.skies[this.config.sky].texture;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uSky: { value: skyTex },
        uTime: { value: 0 },
        uRotation: { value: this.config.skyRotation || 0 },
        uCoverage: { value: clouds.coverage },
        uStorm: { value: this.config.weather === 'storm' ? 1 : this.config.weather === 'ash' ? 0.75 : 0.08 },
        uFlash: { value: 0 },
        uSunDir: { value: this.sunDir.clone() },
        uSunColor: { value: new THREE.Color(s.color) },
        uCloudLit: { value: new THREE.Color(clouds.lit) },
        uCloudShadow: { value: new THREE.Color(clouds.shadow) },
        uHaze: { value: new THREE.Color(this.config.fog.color) },
        uEmber: { value: new THREE.Color(clouds.ember) },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      transparent: false,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1900, 48, 24), this.material);
    this.dome.renderOrder = -1000;
    this.dome.frustumCulled = false;
    this.group.add(this.dome);

    // A warm sun halo, kept behind the island so it never pastes over geometry.
    const cc = document.createElement('canvas');
    cc.width = cc.height = 256;
    const cctx = cc.getContext('2d');
    const grad = cctx.createRadialGradient(128, 128, 2, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,250,232,.95)');
    grad.addColorStop(0.08, 'rgba(255,220,160,.62)');
    grad.addColorStop(0.3, 'rgba(255,178,112,.18)');
    grad.addColorStop(1, 'rgba(255,160,90,0)');
    cctx.fillStyle = grad;
    cctx.fillRect(0, 0, 256, 256);
    const sunTex = new THREE.CanvasTexture(cc);
    sunTex.colorSpace = THREE.SRGBColorSpace;
    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: sunTex, transparent: true, depthWrite: false, depthTest: true,
      blending: THREE.AdditiveBlending, opacity: this.config.weather === 'storm' ? 0.14 : 0.42,
    }));
    this.sunGlow.position.copy(this.sunDir).multiplyScalar(700);
    this.sunGlow.scale.setScalar(this.config.weather === 'storm' ? 120 : 170);
    this.sunGlow.renderOrder = -900;
    this.group.add(this.sunGlow);

    if (this.config.weather === 'storm') {
      this.bolt = this.createLightningBolt();
      this.group.add(this.bolt);
      this.bolt.visible = false;
    }

    return this;
  }

  createLightningBolt() {
    const points = [];
    let x = -150;
    let y = 90;
    let z = -260;
    for (let i = 0; i < 15; i++) {
      points.push(new THREE.Vector3(x, y, z));
      x += rand(-12, 12);
      y -= rand(8, 22);
      z += rand(-6, 6);
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const geo = new THREE.TubeGeometry(curve, 40, 0.38, 3, false);
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color('#c8e4ff'),
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    return new THREE.Mesh(geo, mat);
  }

  flashLightning() {
    if (!this.bolt) return;
    this.bolt.visible = true;
    this.bolt.material.opacity = 1;
    this.bolt.position.set(rand(-80, 80), 0, rand(-30, 30));
    this.flash = 1;
    this.lightning = 0.55;
  }

  update(dt, playerPos) {
    this.time += dt;
    if (!this.sun) return;
    if (this.material) this.material.uniforms.uTime.value = this.time;
    if (this.config.weather === 'storm') {
      this.nextLightning -= dt;
      if (this.nextLightning <= 0) {
        this.flashLightning();
        this.nextLightning = rand(7, 18);
      }
      if (this.flash > 0) {
        this.flash = Math.max(0, this.flash - dt * 3.2);
        this.sun.intensity = this.config.sun.intensity + this.flash * 2.2;
        this.hemi.intensity = 1.0 + this.flash * 1.2;
        if (this.material) this.material.uniforms.uFlash.value = this.flash * 0.35;
      } else {
        this.sun.intensity = this.config.sun.intensity;
        this.hemi.intensity = 1.0;
        if (this.material) this.material.uniforms.uFlash.value = 0;
      }
      if (this.bolt) {
        this.bolt.material.opacity = Math.max(0, this.bolt.material.opacity - dt * 4.5);
        if (this.bolt.material.opacity <= 0) this.bolt.visible = false;
      }
    }
    if (playerPos) {
      this.sun.target.position.set(playerPos.x, 0, playerPos.z);
      this.sun.position.set(playerPos.x, 0, playerPos.z).addScaledVector(this.sunDir, 130);
      if (this.sunGlow) this.sunGlow.position.set(playerPos.x, 0, playerPos.z).addScaledVector(this.sunDir, 700);
    }
  }

  dispose() {
    if (this.dome) {
      this.dome.geometry.dispose();
      this.material.dispose();
    }
    this.scene.remove(this.group);
    this.group.clear();
  }
}
