import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { damp } from '../utils/math.js';

function rodSegment(rt, rb, len, mat, z) {
  const g = new THREE.CylinderGeometry(rt, rb, len, 10, 1);
  g.rotateX(Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.position.z = z;
  m.castShadow = true;
  return m;
}

function capsuleBetween(a, b, radius, mat, seg = 8) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.01, len - radius * 2), 6, seg);
  const m = new THREE.Mesh(geo, mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}

export class RodView {
  constructor({ camera, rodTier = 0 }) {
    this.camera = camera;
    this.group = new THREE.Group();
    this.group.name = 'first-person-rod';
    this.group.position.set(0.37, -0.48, -0.7);
    this.group.rotation.set(-0.32, -0.3, -0.05);
    this.group.scale.setScalar(0.62);
    camera.add(this.group);
    this.materials = {
      cork: new THREE.MeshStandardMaterial({ color: '#b28658', roughness: 0.92 }),
      blank: new THREE.MeshPhysicalMaterial({ color: '#3d4f4d', roughness: 0.25, metalness: 0.55, clearcoat: 0.8 }),
      blank2: new THREE.MeshPhysicalMaterial({ color: '#7d9d8c', roughness: 0.28, metalness: 0.4, clearcoat: 0.7 }),
      guide: new THREE.MeshStandardMaterial({ color: '#b9c4b7', roughness: 0.25, metalness: 0.9 }),
      metal: new THREE.MeshStandardMaterial({ color: '#5b625f', roughness: 0.34, metalness: 0.88 }),
      dark: new THREE.MeshStandardMaterial({ color: '#1d2322', roughness: 0.52, metalness: 0.35 }),
      line: new THREE.LineBasicMaterial({ color: '#e8e1cf', transparent: true, opacity: 0.7 }),
      skin: new THREE.MeshStandardMaterial({ color: '#b47f5c', roughness: 0.78 }),
      glove: new THREE.MeshStandardMaterial({ color: '#514133', roughness: 0.9 }),
      gloveTrim: new THREE.MeshStandardMaterial({ color: '#8e7552', roughness: 0.86 }),
      sleeve: new THREE.MeshStandardMaterial({ color: '#395159', roughness: 0.92 }),
      sleeve2: new THREE.MeshStandardMaterial({ color: '#2a3d43', roughness: 0.94 }),
      brass: new THREE.MeshStandardMaterial({ color: '#c9a464', roughness: 0.28, metalness: 0.9 }),
    };
    this.build();
    this.time = 0;
    this.mode = 'idle';
    this.reelSpin = 0;
    this.charge = 0;
  }

  build() {
    const m = this.materials;
    const rod = new THREE.Group();
    rod.position.set(0, 0.02, -0.15);
    this.rod = rod;
    this.group.add(rod);
    // Grip and blank.
    rod.add(rodSegment(0.018, 0.021, 0.55, m.cork, -0.28));
    rod.add(rodSegment(0.011, 0.017, 0.08, m.metal, -0.58));
    rod.add(rodSegment(0.007, 0.011, 1.45, m.blank, -1.35));
    rod.add(rodSegment(0.0035, 0.007, 0.55, m.blank2, -2.35));
    // Butt cap.
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.027, 0.05, 12), m.dark);
    cap.rotation.x = Math.PI / 2;
    cap.position.z = 0.0;
    rod.add(cap);
    // Reel stem and body.
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.16, 0.03), m.metal);
    stem.position.set(0.0, -0.1, -0.34);
    rod.add(stem);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 18), m.dark);
    body.rotation.z = Math.PI / 2;
    body.position.set(0.035, -0.19, -0.34);
    rod.add(body);
    const spool = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.066, 0.075, 20), m.brass);
    spool.rotation.z = Math.PI / 2;
    spool.position.set(0.073, -0.19, -0.34);
    rod.add(spool);
    const handleArm = new THREE.Group();
    handleArm.position.set(0.105, -0.19, -0.34);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.12, 0.022), m.metal);
    arm.position.y = -0.06;
    handleArm.add(arm);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.045, 10), m.cork);
    knob.rotation.z = Math.PI / 2;
    knob.position.set(0.01, -0.13, 0);
    handleArm.add(knob);
    rod.add(handleArm);
    this.reelHandle = handleArm;
    // Line guides.
    for (let i = 0; i < 7; i++) {
      const t = 0.22 + i * 0.115;
      const z = -0.65 - t * 2.0;
      const r = 0.015 - i * 0.0012;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.0028, 5, 12), m.guide);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(0, 0.025 + i * 0.003, z);
      rod.add(ring);
    }
    // Tip and line origin.
    this.tip = new THREE.Object3D();
    this.tip.position.set(0, 0.042, -2.64);
    rod.add(this.tip);
    const tipGuide = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0025, 5, 12), m.guide);
    tipGuide.position.copy(this.tip.position);
    tipGuide.rotation.y = Math.PI / 2;
    rod.add(tipGuide);
    // Small red float line at the tip for readability.
    const tipDot = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), new THREE.MeshBasicMaterial({ color: '#e9a25a' }));
    tipDot.position.copy(this.tip.position);
    rod.add(tipDot);

    // Forearms and hands.
    const leftWrist = new THREE.Vector3(-0.2, -0.34, -0.24);
    const leftHand = new THREE.Vector3(0.0, -0.05, -0.3);
    const armL = capsuleBetween(leftWrist, leftHand, 0.062, m.sleeve, 10);
    this.group.add(armL);
    const wristL = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), m.skin);
    wristL.position.copy(leftWrist);
    this.group.add(wristL);
    // Right hand on the reel handle.
    const rightWrist = new THREE.Vector3(0.36, -0.4, -0.18);
    const rightHand = new THREE.Vector3(0.12, -0.22, -0.3);
    const armR = capsuleBetween(rightWrist, rightHand, 0.06, m.sleeve2, 10);
    this.group.add(armR);
    const wristR = new THREE.Mesh(new THREE.SphereGeometry(0.052, 14, 10), m.skin);
    wristR.position.copy(rightWrist);
    this.group.add(wristR);

    // Hands: palm + fingers curled around the grip.
    const hand = new THREE.Group();
    hand.position.set(0.01, -0.04, -0.28);
    const palm = new THREE.Mesh(new RoundedBoxGeometry(0.078, 0.088, 0.095, 3, 0.025), m.glove);
    palm.rotation.x = 0.15;
    hand.add(palm);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.012, 5, 14), m.gloveTrim);
    cuff.rotation.y = Math.PI / 2;
    cuff.position.set(-0.045, 0, 0.01);
    hand.add(cuff);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.013, 0.055, 4, 8), m.glove);
      finger.rotation.z = Math.PI / 2;
      finger.rotation.y = 0.15;
      finger.position.set(0.005, 0.03 - i * 0.023, -0.06 - Math.sin(i * 0.8) * 0.012);
      hand.add(finger);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), m.skin);
      tip.position.set(0.04, 0.03 - i * 0.023, -0.065 - Math.sin(i * 0.8) * 0.012);
      hand.add(tip);
    }
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.05, 4, 8), m.glove);
    thumb.rotation.z = 0.9;
    thumb.rotation.x = 0.4;
    thumb.position.set(-0.042, 0.02, -0.03);
    hand.add(thumb);
    this.hand = hand;
    this.group.add(hand);

    // A second hand cupping the reel.
    const hand2 = new THREE.Group();
    hand2.position.set(0.11, -0.21, -0.3);
    const palm2 = new THREE.Mesh(new RoundedBoxGeometry(0.068, 0.075, 0.085, 3, 0.022), m.glove);
    hand2.add(palm2);
    for (let i = 0; i < 4; i++) {
      const finger = new THREE.Mesh(new THREE.CapsuleGeometry(0.011, 0.045, 4, 8), m.glove);
      finger.rotation.x = 0.8;
      finger.position.set(0.025, 0.03 - i * 0.017, -0.04);
      hand2.add(finger);
    }
    this.hand2 = hand2;
    this.group.add(hand2);

    // Readability comes from the eye-level fill light on the player camera.
    // A point light parented here changed the scene's light count whenever the
    // rod was shown/hidden, forcing WebGL to recompile every material.
  }

  setRodTier(tier) {
    if (tier >= 2) {
      this.materials.blank.color.set('#7c99a4');
      this.materials.blank2.color.set('#b5d0d3');
    }
    if (tier >= 3) {
      this.materials.blank.color.set('#a35e45');
      this.materials.blank2.color.set('#d4946c');
    }
  }

  getTipWorld(target = new THREE.Vector3()) {
    this.tip.getWorldPosition(target);
    return target;
  }

  update(dt, { mode = 'idle', charge = 0, reeling = false, castImpulse = 0, tension = 0 } = {}) {
    this.time += dt;
    this.mode = mode;
    this.charge = charge;
    const idleSway = Math.sin(this.time * 1.1) * 0.005;
    let px = 0.37;
    let py = -0.48 + Math.sin(this.time * 1.4) * 0.004;
    let pz = -0.7;
    let rx = -0.32;
    let ry = -0.3;
    let rz = -0.05;

    if (mode === 'charging') {
      px += charge * 0.02;
      py += charge * 0.03;
      pz += charge * 0.06;
      rx = -0.32 + charge * 0.42;
      rz = -0.05 - charge * 0.18;
    } else if (mode === 'cast') {
      rx = -0.5 + castImpulse * 0.22;
      pz = -0.78 - castImpulse * 0.08;
      py += 0.03;
    } else if (mode === 'reel') {
      const t = tension / 100;
      px = 0.36 + Math.sin(this.time * 31) * 0.003 * t;
      py = -0.46 + Math.sin(this.time * 27) * 0.004 * t;
      rx = -0.22 + Math.sin(this.time * 6.5) * 0.014;
      rz = -0.13;
      this.reelSpin += dt * (2.5 + t * 7);
      this.reelHandle.rotation.x = this.reelSpin;
    } else if (mode === 'bite') {
      py -= 0.02;
      rx = -0.12;
    }

    this.group.position.x = damp(this.group.position.x, px + idleSway, 7, dt);
    this.group.position.y = damp(this.group.position.y, py, 7, dt);
    this.group.position.z = damp(this.group.position.z, pz, 8, dt);
    this.group.rotation.x = damp(this.group.rotation.x, rx, 7, dt);
    this.group.rotation.y = damp(this.group.rotation.y, ry, 7, dt);
    this.group.rotation.z = damp(this.group.rotation.z, rz, 7, dt);
    if (mode !== 'reel') this.reelHandle.rotation.x = damp(this.reelHandle.rotation.x, 0.2, 4, dt);
    this.hand.position.z = damp(this.hand.position.z, mode === 'reel' ? -0.315 : -0.28, 8, dt);
    this.hand2.rotation.x = Math.sin(this.time * 3.1) * 0.015;
  }

  setVisible(v) {
    this.group.visible = v;
  }
}
