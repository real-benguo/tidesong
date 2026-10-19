import * as THREE from 'three';
import { clamp, damp, lerp } from '../utils/math.js';
import { RodView } from './RodView.js';

const EYE_HEIGHT = 1.62;

export class Player {
  constructor({ camera, input, game }) {
    this.camera = camera;
    this.input = input;
    this.game = game;
    this.position = new THREE.Vector3(0, 2, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = -0.04;
    this.eye = EYE_HEIGHT;
    this.frozen = false;
    this.enabled = false;
    this.bob = 0;
    this.bobAmt = 0;
    this.footTimer = 0;
    this.walkSpeed = 5.0;
    this.runSpeed = 8.6;
    this.rod = new RodView({ camera });
    // Gentle eye-level fill so shaded coves and cliff paths remain readable.
    this.cameraFill = new THREE.PointLight(new THREE.Color('#ffd6a8'), 4.2, 20, 2);
    this.cameraFill.position.set(0, 0, 0);
    this.camera.add(this.cameraFill);
    this.rodTier = 0;
    this.forward = new THREE.Vector3(0, 0, -1);
    this.currentTarget = null;
    this.waterTarget = null;
    this.cinematic = null;
    this.verticalVelocity = 0;
    this.grounded = true;
    this.jumpCooldown = 0;
    this.camera.rotation.order = 'YXZ';
    this.camera.position.copy(this.position);
    this.interactKey = 'E';
    this.lastSurface = 'grass';
  }

  setWorld(world) {
    this.world = world;
  }

  spawn(world, spawn) {
    this.world = world;
    this.cinematic = null;
    this.position.set(spawn.x, (spawn.y || 0) + EYE_HEIGHT, spawn.z);
    this.yaw = spawn.yaw || 0;
    this.pitch = -0.03;
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
    this.frozen = false;
    this.enabled = true;
    this.camera.position.copy(this.position);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  teleport(x, z, yaw = this.yaw) {
    const h = this.world?.getWalkHeight(x, z) ?? 0;
    this.position.set(x, h + EYE_HEIGHT, z);
    this.yaw = yaw;
    this.velocity.set(0, 0, 0);
    this.verticalVelocity = 0;
    this.grounded = true;
    this.camera.position.copy(this.position);
  }

  jump() {
    if (this.frozen || this.cinematic || !this.grounded || this.jumpCooldown > 0) return false;
    this.verticalVelocity = 6.35;
    this.grounded = false;
    this.jumpCooldown = 0.18;
    return true;
  }

  setRodTier(tier) {
    this.rodTier = tier;
    this.rod.setRodTier(tier);
  }

  setCinematicView({ center, radius = 140, height = 52, angle = 0, speed = 0.024 } = {}) {
    if (!center) return;
    this.cinematic = { center: center.clone(), radius, height, angle, speed };
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
    this.setFrozen(true);
    this.rod.setVisible(false);
  }

  clearCinematicView() {
    this.cinematic = null;
    this.rod.setVisible(!this.frozen);
  }

  setFrozen(v) {
    this.frozen = v;
    this.rod.setVisible(!v);
    if (v) {
      this.velocity.set(0, 0, 0);
      this.verticalVelocity = 0;
      this.grounded = true;
      this.currentTarget = null;
      this.waterTarget = null;
      this.game?.ui?.setPrompt(null);
    } else {
      this.rod.setVisible(true);
    }
  }

  update(dt) {
    if (!this.enabled || !this.world) return;
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    if (this.cinematic) {
      const c = this.cinematic;
      c.angle += dt * c.speed;
      this.camera.position.set(
        c.center.x + Math.sin(c.angle) * c.radius,
        c.height,
        c.center.z + Math.cos(c.angle) * c.radius,
      );
      this.camera.fov = damp(this.camera.fov, 48, 2.5, dt);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(c.center);
      this.forward.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
      return;
    }
    const input = this.input;
    if (!this.frozen) {
      const sens = 0.0021 * (this.game?.state?.settings?.sensitivity || 1);
      const m = input.consumeMouse();
      this.yaw -= m.dx * sens;
      this.pitch -= m.dy * sens * (this.game?.state?.settings?.invertY ? -1 : 1);
      this.pitch = clamp(this.pitch, -1.38, 1.25);
    } else {
      input.consumeMouse();
    }

    if (!this.frozen) {
      const fwd = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      let ix = 0;
      let iz = 0;
      if (input.down('KeyW') || input.down('ArrowUp')) iz += 1;
      if (input.down('KeyS') || input.down('ArrowDown')) iz -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) ix += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) ix -= 1;
      const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
      const targetSpeed = (sprint ? this.runSpeed : this.walkSpeed) * (this.game?.fishing?.isActive ? 0.6 : 1);
      const wish = new THREE.Vector3().addScaledVector(fwd, iz).addScaledVector(right, ix);
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(targetSpeed);
      this.velocity.x = damp(this.velocity.x, wish.x, wish.lengthSq() ? 10 : 14, dt);
      this.velocity.z = damp(this.velocity.z, wish.z, wish.lengthSq() ? 10 : 14, dt);

      const nextX = this.position.x + this.velocity.x * dt;
      const nextZ = this.position.z + this.velocity.z * dt;
      const canX = this.world.canWalk(nextX, this.position.z);
      const canZ = this.world.canWalk(this.position.x, nextZ);
      if (canX && canZ) {
        this.position.x = nextX;
        this.position.z = nextZ;
      } else if (canX) {
        this.position.x = nextX;
        this.velocity.z *= 0.2;
      } else if (canZ) {
        this.position.z = nextZ;
        this.velocity.x *= 0.2;
      } else {
        this.velocity.x *= 0.2;
        this.velocity.z *= 0.2;
      }
      // Keep within the playable band.
      const maxR = (this.world.island?.radius || 100) * 1.28;
      if (Math.hypot(this.position.x, this.position.z) > maxR) {
        const k = maxR / Math.hypot(this.position.x, this.position.z);
        this.position.x *= k;
        this.position.z *= k;
      }

      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      this.bobAmt = damp(this.bobAmt, speed > 0.2 ? 1 : 0, 8, dt);
      this.bob += dt * (sprint ? 11 : 8) * Math.min(1, speed / this.walkSpeed);
      this.footTimer -= dt * Math.max(0.2, speed);
      if (this.grounded && speed > 1.6 && this.footTimer <= 0) {
        this.footTimer = sprint ? 0.34 : 0.48;
        const h = this.world.getWalkHeight(this.position.x, this.position.z);
        const onDock = Math.abs(h - 0.98) < 0.03;
        const surface = onDock ? 'wood' : h < 0.75 ? 'sand' : this.world.shape.slope(this.position.x, this.position.z) > 0.45 ? 'rock' : 'grass';
        this.lastSurface = surface;
        this.game?.audio?.play('footstep', { surface, volume: 0.5 });
      }
    }

    const ground = this.world.getWalkHeight(this.position.x, this.position.z);
    const standY = ground + EYE_HEIGHT + Math.sin(this.bob) * 0.025 * this.bobAmt;
    if (!this.grounded) {
      this.verticalVelocity -= 20 * dt;
      this.position.y += this.verticalVelocity * dt;
      if (this.position.y <= standY && this.verticalVelocity <= 0) {
        const impact = Math.min(1, Math.abs(this.verticalVelocity) / 9);
        this.position.y = standY;
        this.verticalVelocity = 0;
        this.grounded = true;
        this.game?.audio?.play('footstep', { surface: 'sand', volume: 0.25 + impact * 0.3 });
        this.game?.world?.sparkle(
          new THREE.Vector3(this.position.x, ground + 0.08, this.position.z),
          '#d9c49a', 5 + Math.floor(impact * 8),
        );
      }
    } else {
      this.position.y = damp(this.position.y, standY, 16, dt);
      // Never let the eye sink into a rising slope.
      if (this.position.y < standY - 0.35) this.position.y = standY;
    }
    const baseFov = this.overrideFov || this.game?.state?.settings?.fov || 72;
    const targetFov = baseFov + (Math.hypot(this.velocity.x, this.velocity.z) > 6 ? 2.5 : 0);
    this.camera.fov = damp(this.camera.fov, targetFov, 5, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(this.position.x, this.position.y, this.position.z);
    this.camera.rotation.set(this.pitch, this.yaw, Math.sin(this.bob * 0.5) * 0.003 * this.bobAmt);
    this.forward.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();

    this.updateTargets();
    this.updateRod(dt);
  }

  updateTargets() {
    if (this.frozen) return;
    const cam = this.camera.position;
    let best = null;
    let bestScore = Infinity;
    for (const it of this.world.interactables || []) {
      const tx = it.pos.x;
      const ty = it.pos.y + (it.type === 'boss' ? 0.2 : 1.0);
      const tz = it.pos.z;
      const dx = tx - cam.x;
      const dy = ty - cam.y;
      const dz = tz - cam.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > (it.radius || 3.5) + (it.type === 'boss' ? 8 : 3)) continue;
      const dot = (dx * this.forward.x + dy * this.forward.y + dz * this.forward.z) / Math.max(0.0001, dist);
      const minDot = it.type === 'boss' ? 0.35 : dist > 8 ? 0.82 : 0.28;
      if (dot < minDot) continue;
      const score = dist - dot * 4;
      if (score < bestScore) {
        bestScore = score;
        best = it;
      }
    }
    this.currentTarget = best;
    this.waterTarget = null;
    if (!best) {
      this.waterTarget = this.getWaterTarget();
    }
    const game = this.game;
    if (!game) return;
    if (game.mode !== 'play') return;

    if (best) {
      const active = game.quest?.objective;
      let text = null;
      let key = 'E';
      if (best.type === 'npc') {
        text = active?.type === 'talk' && active.target === best.id ? `与${best.label}交谈` : `与${best.label}交谈`;
        if (best.id === 'alan') text = '打开潮汐杂货铺';
      } else if (best.type === 'shop') {
        text = '打开潮汐杂货铺';
      } else if (best.type === 'collect') {
        const need = active?.type === 'collect' && active.item === best.item;
        text = need ? `拾取 ${best.label}` : `查看 ${best.label}`;
      } else if (best.type === 'boss') {
        text = active?.type === 'boss' ? `挑战 ${best.label}` : `观察 ${best.label}`;
      } else if (best.type === 'boat') {
        text = active?.type === 'travel' ? '启航' : '返回船上';
      } else {
        text = `查看 ${best.label}`;
      }
      game.ui.setPrompt(text, key);
      game.ui.setCrosshair('interact');
    } else if (this.waterTarget && game.fishing && !game.fishing.isActive) {
      game.ui.setPrompt('蓄力抛竿', 'LMB');
      game.ui.setCrosshair('fish');
    } else {
      game.ui.setPrompt(null);
      game.ui.setCrosshair('default');
    }
  }

  getWaterTarget() {
    if (!this.world) return null;
    const origin = this.camera.position;
    const maxDist = 26 * (this.game?.stats?.cast || 1);
    this._waterDir ||= new THREE.Vector3();
    this._waterPoint ||= new THREE.Vector3();
    const horizontal = this._waterDir.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    // A first-person cast is aimed along the horizontal view direction. The
    // bobber is allowed to land at the rod's maximum range even if the camera
    // is looking a little above the water.
    let candidate = null;
    let seenWater = false;
    for (let d = 4; d <= maxDist; d += 1.2) {
      const p = this._waterPoint.copy(origin).addScaledVector(horizontal, d);
      const water = this.world.isWaterAim(p.x, p.z);
      if (water) {
        seenWater = true;
        candidate = p;
      } else if (seenWater) {
        // A strip of water followed by land means the cast is aimed inland.
        return null;
      }
    }
    if (candidate) return candidate;
    // If the shoreline is close, prefer a point just past it.
    if (this.forward.y < -0.05) {
      const t = -origin.y / this.forward.y;
      if (t > 1 && t < maxDist) {
        const p = this._waterPoint.copy(origin).addScaledVector(this.forward, t);
        if (this.world.isWaterAim(p.x, p.z)) return p;
      }
    }
    return null;
  }

  updateRod(dt) {
    const game = this.game;
    const f = game?.fishing;
    let state = { mode: 'idle' };
    if (f && f.isActive) {
      state = {
        mode: f.state === 'reel' ? 'reel' : f.state === 'charging' ? 'charging' : f.state === 'bite' ? 'bite' : f.state === 'casting' ? 'cast' : 'idle',
        charge: f.charge,
        tension: f.tension,
        castImpulse: f.castImpulse,
      };
    }
    this.rod.update(dt, state);
    this.rod.group.visible = !this.frozen && game?.mode !== 'title';
  }

  // Snap camera to a point for cinematics.
  cinematicLook(target, dt, speed = 3) {
    const dir = target.clone().sub(this.camera.position).normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.asin(clamp(dir.y, -1, 1));
    this.yaw = damp(this.yaw, yaw, speed, dt);
    this.pitch = damp(this.pitch, pitch, speed, dt);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
