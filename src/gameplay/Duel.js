import * as THREE from 'three';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const P1 = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', attack: 'KeyJ', dash: 'KeyK', block: 'KeyL' };
const P2 = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', attack: 'KeyU', dash: 'KeyI', block: 'KeyO' };

function arenaTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#3f4a46';
  ctx.fillRect(0, 0, 1024, 1024);
  // Broken stone slabs with a radial tide-sigil overlaid on top.
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * 500;
    const x = 512 + Math.cos(a) * r;
    const y = 512 + Math.sin(a) * r;
    const s = 16 + Math.random() * 58;
    ctx.fillStyle = `rgba(${35 + Math.random() * 30},${43 + Math.random() * 30},${40 + Math.random() * 26},${0.12 + Math.random() * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(x - s, y - s * 0.2);
    ctx.lineTo(x - s * 0.2, y - s);
    ctx.lineTo(x + s, y - s * 0.15);
    ctx.lineTo(x + s * 0.2, y + s);
    ctx.closePath();
    ctx.fill();
  }
  for (const radius of [130, 260, 390, 500]) {
    ctx.strokeStyle = radius === 500 ? 'rgba(210,177,112,.55)' : 'rgba(146,164,145,.24)';
    ctx.lineWidth = radius === 500 ? 5 : 2;
    ctx.beginPath();
    ctx.arc(512, 512, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.strokeStyle = 'rgba(196,177,134,.16)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(512 + Math.cos(a) * 120, 512 + Math.sin(a) * 120);
    ctx.lineTo(512 + Math.cos(a) * 500, 512 + Math.sin(a) * 500);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(143,227,200,.62)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(512, 512, 120, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(143,227,200,.2)';
  ctx.beginPath();
  ctx.arc(512, 512, 62, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(217,181,116,.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(512, 512, 56, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,.72)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLabel(text, color = '#f0d29a') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = '600 28px "Noto Serif SC", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(5,17,19,.65)';
  ctx.fillRect(36, 10, 184, 44);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 10, 184, 44);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: true }));
  sprite.scale.set(1.65, 0.41, 1);
  sprite.position.y = 2.55;
  return sprite;
}

function makeBlobShadow(radius = 0.8) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.035;
  m.renderOrder = 3;
  return m;
}

class Duelist {
  constructor(scene, { name, color, accent, x, z, facing }) {
    this.name = name;
    this.hp = 100;
    this.maxHp = 100;
    this.x = x;
    this.z = z;
    this.facing = facing;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.hurt = 0;
    this.walk = 0;
    this.dead = false;
    this.blocking = false;
    this.group = new THREE.Group();
    this.group.position.set(x, 0, z);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.55, metalness: 0.18 });
    const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.38, metalness: 0.45, emissive: new THREE.Color(accent), emissiveIntensity: 0.14 });
    const skin = new THREE.MeshStandardMaterial({ color: new THREE.Color('#d9aa82'), roughness: 0.8 });
    const hairMat = new THREE.MeshStandardMaterial({ color: new THREE.Color('#24201d'), roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#334744'), roughness: 0.75 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.88, 6, 12), mat);
    torso.position.y = 1.24;
    torso.castShadow = true;
    this.group.add(torso);
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.48, 0.58, 12, 1, true), dark);
    skirt.position.y = 0.73;
    this.group.add(skirt);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.255, 20, 16), skin);
    head.position.y = 1.95;
    head.castShadow = true;
    this.group.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.268, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.58), hairMat);
    hair.position.y = 1.99;
    this.group.add(hair);
    const headband = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.028, 4, 18), trim);
    headband.rotation.x = Math.PI / 2;
    headband.position.y = 2.02;
    this.group.add(headband);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), new THREE.MeshBasicMaterial({ color: '#101718' }));
      eye.position.set(side * 0.085, 1.99, 0.225);
      this.group.add(eye);
    }
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.04, 4, 18), trim);
    belt.rotation.x = Math.PI / 2;
    belt.position.y = 1.0;
    this.group.add(belt);
    const cape = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.15, 8, 1, true, 0.5, 1.6), mat);
    cape.position.set(0, 1.1, -0.18);
    cape.rotation.y = Math.PI;
    this.group.add(cape);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.12, 0.86, 8), dark);
      leg.position.set(side * 0.16, 0.46, 0);
      leg.rotation.z = side * 0.04;
      this.group.add(leg);
      const boot = new THREE.Mesh(new THREE.CapsuleGeometry(0.115, 0.16, 3, 8), new THREE.MeshStandardMaterial({ color: '#1e2a29', roughness: 0.82 }));
      boot.rotation.x = Math.PI / 2;
      boot.position.set(side * 0.16, 0.12, 0.09);
      this.group.add(boot);
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.48, 4, 9), mat);
      arm.position.set(side * 0.39, 1.43, 0);
      arm.rotation.z = side * 0.13;
      this.group.add(arm);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
      hand.position.set(side * 0.43, 1.17, 0.02);
      this.group.add(hand);
      const shoulderPad = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), trim);
      shoulderPad.position.set(side * 0.31, 1.61, 0);
      shoulderPad.scale.set(1, 0.7, 1);
      this.group.add(shoulderPad);
    }
    const shoulder = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 6, 18, Math.PI), trim);
    shoulder.position.set(0, 1.58, 0.02);
    shoulder.rotation.x = Math.PI / 2;
    this.group.add(shoulder);
    // A tide-forged spear makes attacks readable at a glance.
    this.weapon = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.8, 7), dark);
    shaft.position.y = 0.35;
    this.weapon.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.38, 6), trim);
    tip.position.y = 1.38;
    this.weapon.add(tip);
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.018, 4, 10), trim);
    rune.position.y = 0.35;
    rune.rotation.x = Math.PI / 2;
    this.weapon.add(rune);
    this.weapon.position.set(0.5, 1.02, 0.08);
    this.weapon.rotation.z = -0.22;
    this.group.add(this.weapon);
    this.group.add(makeBlobShadow(0.82));
    this.group.add(makeLabel(name, accent));
    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 0.62, 28),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.5, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.045;
    this.group.add(this.aura);
    this.auraColor = accent;
    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(0.62, 16, 10),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(accent), transparent: true, opacity: 0.12, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.shield.position.y = 1.25;
    this.shield.visible = false;
    this.group.add(this.shield);
    scene.add(this.group);
  }

  update(dt, keys, opponent) {
    if (this.dead) return;
    this.attackTimer = Math.max(0, this.attackTimer - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.hurt = Math.max(0, this.hurt - dt);
    let ix = 0;
    let iz = 0;
    const k = this.keys;
    if (k) {
      if (keys.has(k.up)) iz -= 1;
      if (keys.has(k.down)) iz += 1;
      if (keys.has(k.left)) ix -= 1;
      if (keys.has(k.right)) ix += 1;
    }
    const len = Math.hypot(ix, iz);
    const moving = len > 0;
    const speed = this.dashTimer > 0 ? 12 : 5.3;
    if (moving) {
      ix /= len;
      iz /= len;
      this.x += ix * speed * dt;
      this.z += iz * speed * dt;
      this.walk += dt * (this.dashTimer > 0 ? 16 : 9);
    } else {
      this.walk += dt * 2;
    }
    this.blocking = !!(k && keys.has(k.block));
    this.shield.visible = this.blocking;
    if (this.blocking) {
      this.shield.scale.setScalar(1 + Math.sin(this.walk * 2.2) * 0.035);
      this.shield.material.opacity = 0.1 + Math.sin(this.walk * 2.4) * 0.025;
    }
    const r = Math.hypot(this.x, this.z);
    if (r > 7.4) {
      this.x = (this.x / r) * 7.4;
      this.z = (this.z / r) * 7.4;
    }
    this.group.position.x = this.x;
    this.group.position.z = this.z;
    if (opponent) this.group.rotation.y = Math.atan2(opponent.x - this.x, opponent.z - this.z);
    this.group.position.y = Math.abs(Math.sin(this.walk)) * 0.025;
    this.weapon.rotation.z = this.blocking
      ? 1.1
      : -0.22 - (this.attackTimer > 0 ? Math.sin((1 - this.attackTimer / 0.32) * Math.PI) * 1.25 : 0);
    if (this.hurt > 0) {
      this.group.position.x += Math.sin(this.hurt * 70) * 0.03;
    }
  }

  attack(opponent) {
    if (this.dead || this.attackCooldown > 0) return false;
    this.attackCooldown = this.blocking ? 0.72 : 0.5;
    this.attackTimer = 0.32;
    const dist = Math.hypot(opponent.x - this.x, opponent.z - this.z);
    if (dist > 2.5) return false;
    const damage = opponent.blocking ? 4 : this.blocking ? 7 : 12;
    opponent.hp = Math.max(0, opponent.hp - damage);
    opponent.hurt = 0.28;
    const dx = opponent.x - this.x;
    const dz = opponent.z - this.z;
    const d = Math.max(0.001, Math.hypot(dx, dz));
    opponent.x += (dx / d) * 0.6;
    opponent.z += (dz / d) * 0.6;
    if (opponent.hp <= 0) opponent.dead = true;
    this.lastDamage = damage;
    return true;
  }

  dash() {
    if (this.dead || this.dashCooldown > 0) return;
    this.dashTimer = 0.22;
    this.dashCooldown = 1.15;
  }
}

export class Duel {
  constructor(game, { ai = false } = {}) {
    this.game = game;
    this.ai = ai;
    this.scene = null;
    this.camera = null;
    this.active = false;
    this.phase = 'ready';
    this.countdown = 3;
    this.result = null;
    this.p1 = null;
    this.p2 = null;
    this.last = new THREE.Vector3();
    this.shake = 0;
    this.effects = [];
  }

  start() {
    this.active = true;
    this.phase = 'ready';
    this.countdown = 3;
    this.result = null;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#102f31');
    this.scene.fog = new THREE.FogExp2('#0b2527', 0.009);
    this.camera = new THREE.PerspectiveCamera(44, innerWidth / innerHeight, 0.1, 80);
    this.camera.position.set(0, 7.1, 10.4);
    this.camera.lookAt(0, 1.08, 0);
    this.arena = new THREE.Group();
    this.scene.add(this.arena);
    const stoneDark = new THREE.MeshStandardMaterial({ color: new THREE.Color('#4c554f'), roughness: 0.88, metalness: 0.1 });
    const side = new THREE.Mesh(new THREE.CylinderGeometry(9.2, 10.0, 1.1, 64, 1, true), stoneDark);
    side.position.y = -0.57;
    this.arena.add(side);
    const floorMat = new THREE.MeshStandardMaterial({ map: arenaTexture(), roughness: 0.82, metalness: 0.12 });
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9.15, 72), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.015;
    floor.receiveShadow = true;
    this.arena.add(floor);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(9.18, 0.12, 5, 72), new THREE.MeshStandardMaterial({ color: '#d8b875', roughness: 0.45, metalness: 0.55, emissive: '#6f5528', emissiveIntensity: 0.35 }));
    lip.rotation.x = Math.PI / 2;
    lip.position.y = 0.04;
    this.arena.add(lip);
    const outerGlow = new THREE.Mesh(new THREE.RingGeometry(9.25, 9.55, 80), new THREE.MeshBasicMaterial({ color: '#8fe3c8', transparent: true, opacity: 0.2, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    outerGlow.rotation.x = -Math.PI / 2;
    outerGlow.position.y = 0.02;
    this.arena.add(outerGlow);
    const sea = new THREE.Mesh(new THREE.CircleGeometry(52, 64), new THREE.MeshStandardMaterial({ color: '#0b2528', roughness: 0.32, metalness: 0.35 }));
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -1.15;
    this.scene.add(sea);
    const starPositions = new Float32Array(220 * 3);
    for (let i = 0; i < 220; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 18 + Math.random() * 28;
      starPositions[i * 3] = Math.cos(a) * r;
      starPositions[i * 3 + 1] = 5 + Math.random() * 23;
      starPositions[i * 3 + 2] = Math.sin(a) * r;
    }
    const stars = new THREE.Points(
      new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(starPositions, 3)),
      new THREE.PointsMaterial({ color: '#d8ebe0', size: 0.09, transparent: true, opacity: 0.58, depthWrite: false, fog: false }),
    );
    this.scene.add(stars);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 1.2, 8), stoneDark);
      pillar.position.set(Math.sin(a) * 8.5, 0.6, Math.cos(a) * 8.5);
      pillar.castShadow = true;
      this.arena.add(pillar);
      const flame = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? '#ffb36b' : '#8fffd2' }));
      flame.position.set(pillar.position.x, 1.3, pillar.position.z);
      this.arena.add(flame);
    }
    const ambient = new THREE.AmbientLight('#a8ccc0', 0.72);
    this.scene.add(ambient);
    const hemi = new THREE.HemisphereLight('#d5eadf', '#51443a', 1.35);
    this.scene.add(hemi);
    const key = new THREE.DirectionalLight('#ffd7a8', 2.7);
    key.position.set(-8, 15, 7);
    key.castShadow = false;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight('#76d9d2', 1.45);
    rim.position.set(8, 8, -9);
    this.scene.add(rim);
    const top = new THREE.PointLight('#ffe2bd', 26, 30, 2);
    top.position.set(0, 7, 0);
    this.scene.add(top);
    this.p1 = new Duelist(this.scene, { name: '沈屿', color: '#477985', accent: '#e6c27c', x: 0, z: 3.2, facing: 0 });
    this.p2 = new Duelist(this.scene, { name: this.ai ? '潮斗者 AI' : '潮斗者', color: '#8a4850', accent: '#ff9c6e', x: 0, z: -3.2, facing: 0 });
    this.effects = [];
    this.p1.keys = P1;
    this.p2.keys = P2;
    this.p1.group.rotation.y = Math.PI;
    this.game.post.renderPass.scene = this.scene;
    this.game.post.renderPass.camera = this.camera;
    this.game.renderer.shadowMap.autoUpdate = false;
    this.game.renderer.shadowMap.needsUpdate = true;
    this.game.ui.showDuelHud(this.ai);
    this.game.audio?.setMusicMode('boss');
    return true;
  }

  update(dt) {
    if (!this.active) return;
    const input = this.game.input;
    if (this.phase === 'ready') {
      this.countdown -= dt;
      this.game.ui.updateDuelHud(this, '准备');
      if (this.countdown <= 0) {
        this.phase = 'fight';
        this.countdown = 0;
        this.game.ui.updateDuelHud(this, '潮斗开始');
      }
      return;
    }
    if (this.phase === 'result') {
      this.game.ui.updateDuelHud(this, this.result);
      return;
    }
    const keys = input.keys;
    this.p1.update(dt, keys, this.p2);
    if (this.ai) this.updateAI(dt);
    else this.p2.update(dt, keys, this.p1);
    const p1Before = this.p1.hp;
    const p2Before = this.p2.hp;
    if (input.consumePressed(P1.attack)) this.p1.attack(this.p2);
    if (!this.ai && input.consumePressed(P2.attack)) this.p2.attack(this.p1);
    if (this.p2.hp < p2Before) {
      this.burst(this.p2.x, this.p2.z, '#e6c27c');
      this.shake = 0.2;
    }
    if (this.p1.hp < p1Before) {
      this.burst(this.p1.x, this.p1.z, '#ff9c6e');
      this.shake = 0.2;
    }
    if (input.consumePressed(P1.dash)) this.p1.dash();
    if (!this.ai && input.consumePressed(P2.dash)) this.p2.dash();
    this.updateEffects(dt);
    this.game.ui.updateDuelHud(this, '');
    if (this.shake > 0) {
      this.shake *= Math.exp(-dt * 11);
      this.camera.position.set(
        (Math.random() - 0.5) * this.shake,
        7.1 + (Math.random() - 0.5) * this.shake * 0.7,
        10.4,
      );
      if (this.shake < 0.002) {
        this.shake = 0;
        this.camera.position.set(0, 7.1, 10.4);
      }
    }
    if (this.p1.hp <= 0 || this.p2.hp <= 0) {
      this.phase = 'result';
      this.result = this.p1.hp <= 0 ? '潮斗者获胜' : '沈屿获胜';
      this.game.ui.showDuelResult(this.result);
      this.game.audio?.play('bossWin');
    }
  }

  updateAI(dt) {
    const dx = this.p1.x - this.p2.x;
    const dz = this.p1.z - this.p2.z;
    const dist = Math.hypot(dx, dz);
    const keys = new Set();
    if (dist > 2.15) {
      if (dx > 0.3) keys.add(P2.right);
      if (dx < -0.3) keys.add(P2.left);
      if (dz < -0.3) keys.add(P2.up);
      if (dz > 0.3) keys.add(P2.down);
    }
    if (this.p1.attackTimer > 0 && dist < 3.2) keys.add(P2.block);
    this.p2.update(dt, keys, this.p1);
    if (dist < 2.4 && this.p2.attackCooldown <= 0 && Math.random() < dt * 3.2) {
      this.p2.attack(this.p1);
    }
    if (dist > 4.5 && this.p2.dashCooldown <= 0 && Math.random() < dt * 0.7) {
      this.p2.dash();
    }
  }

  burst(x, z, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.8, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 1.0, z);
    this.scene.add(mesh);
    this.effects.push({ mesh, life: 0.36, max: 0.36 });
    const slash = new THREE.Mesh(
      new THREE.TorusGeometry(0.58, 0.045, 4, 18, Math.PI * 1.15),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    slash.position.set(x, 1.35, z);
    slash.rotation.y = Math.random() * Math.PI;
    slash.rotation.z = -0.7;
    this.scene.add(slash);
    this.effects.push({ mesh: slash, life: 0.28, max: 0.28 });
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.life -= dt;
      const p = 1 - Math.max(0, e.life) / e.max;
      e.mesh.scale.setScalar(1 + p * 3.2);
      e.mesh.material.opacity = 0.8 * (1 - p);
      if (e.life <= 0) {
        this.scene.remove(e.mesh);
        e.mesh.geometry.dispose();
        e.mesh.material.dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  rematch() {
    if (!this.active) return;
    this.p1.hp = this.p1.maxHp;
    this.p2.hp = this.p2.maxHp;
    this.p1.dead = this.p2.dead = false;
    this.p1.x = 0; this.p1.z = 3.2;
    this.p2.x = 0; this.p2.z = -3.2;
    this.p1.group.position.set(this.p1.x, 0, this.p1.z);
    this.p2.group.position.set(this.p2.x, 0, this.p2.z);
    this.p1.attackTimer = this.p2.attackTimer = 0;
    this.p1.attackCooldown = this.p2.attackCooldown = 0;
    this.p1.hurt = this.p2.hurt = 0;
    this.phase = 'ready';
    this.countdown = 3;
    this.result = null;
    this.game.ui.hideDuelResult();
    this.game.ui.updateDuelHud(this, '准备');
  }

  exit() {
    if (!this.active) return;
    this.active = false;
    this.game.post.renderPass.scene = this.game.scene;
    this.game.post.renderPass.camera = this.game.camera;
    this.game.renderer.shadowMap.autoUpdate = false;
    this.game.renderer.shadowMap.needsUpdate = true;
    this.game.ui.hideDuelHud();
    this.scene?.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
        else o.material.dispose();
      }
    });
    this.scene = null;
    this.camera = null;
    this.p1 = null;
    this.p2 = null;
    this.game.endDuel();
  }
}
