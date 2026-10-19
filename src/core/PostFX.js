import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uExposure: { value: 0.97 },
    uVignette: { value: 0.28 },
    uGrain: { value: 0.024 },
    uSaturation: { value: 1.12 },
    uWarmth: { value: 0.024 },
    uContrast: { value: 1.075 },
    uAberration: { value: 0.0003 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uExposure;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uSaturation;
    uniform float uWarmth;
    uniform float uContrast;
    uniform float uAberration;
    varying vec2 vUv;

    vec3 aces(vec3 x) {
      const float a = 2.51;
      const float b = 0.03;
      const float c = 2.43;
      const float d = 0.59;
      const float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    vec3 toSRGB(vec3 c) {
      return mix(c * 12.92, 1.055 * pow(max(c, 0.0), vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
    }

    void main() {
      vec2 uv = vUv;
      vec2 centered = uv - 0.5;
      float r2 = dot(centered, centered);
      vec2 ab = centered * uAberration * (0.25 + r2 * 2.0);

      vec3 color;
      color.r = texture2D(tDiffuse, uv + ab).r;
      color.g = texture2D(tDiffuse, uv).g;
      color.b = texture2D(tDiffuse, uv - ab).b;

      color *= uExposure;
      color = aces(color);

      // Gentle cinematic grade: cool shadows, warm highlights, restrained saturation.
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, uSaturation);
      color += vec3(-0.012, 0.005, 0.018) * (1.0 - luma);
      color += vec3(uWarmth, uWarmth * 0.35, -uWarmth * 0.5) * smoothstep(0.45, 0.95, luma);
      color = (color - 0.5) * uContrast + 0.5;

      // Vignette and a whisper of 35mm grain.
      float vig = 1.0 - smoothstep(0.18, 0.82, r2 * 1.85);
      color *= mix(1.0, vig, uVignette);
      float grain = hash(uv * vec2(1920.0, 1080.0) + fract(uTime) * 91.7) - 0.5;
      color += grain * uGrain;

      gl_FragColor = vec4(toSRGB(clamp(color, 0.0, 1.0)), 1.0);
    }
  `,
};

export class PostFX {
  constructor({ renderer, scene, camera, quality = 'high' }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality === 'high' ? 2 : 0,
      colorSpace: THREE.NoColorSpace,
    });
    this.composer = new EffectComposer(renderer, target);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.bloom = null;
    if (quality !== 'low') {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.14, 0.65, 1.1);
      this.bloom.enabled = true;
      this.composer.addPass(this.bloom);
    }
    this.finalPass = new ShaderPass(FinalShader);
    this.finalPass.renderToScreen = true;
    this.composer.addPass(this.finalPass);
    this.time = 0;
  }

  setQuality(quality) {
    this.quality = quality;
    if (this.bloom) this.bloom.enabled = quality !== 'low';
  }

  setExposure(v) {
    this.finalPass.uniforms.uExposure.value = v;
  }

  update(dt) {
    this.time += dt;
    this.finalPass.uniforms.uTime.value = this.time;
  }

  render(dt) {
    this.update(dt);
    this.composer.render(dt);
  }

  resize(width, height) {
    this.composer.setSize(width, height);
    if (this.bloom) this.bloom.setSize(width, height);
  }

  dispose() {
    this.composer.dispose();
  }
}
