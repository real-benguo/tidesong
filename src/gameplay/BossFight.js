import * as THREE from 'three';
import { FISH } from '../data/fish.js';
import { createFishModel, animateFish, disposeFishModel } from './FishFactory.js';
import { statTotals } from '../data/progression.js';
import { clamp, rand } from '../utils/math.js';

const BOSS_LABEL = {
  iron_crab: '甲壳 · 潮穴',
  giant_pike: '腐鳞 · 深潭',
  puffer_king: '气囊 · 沉钟',
  storm_tuna: '雷潮 · 外海',
  abyss_whale: '黑潮 · 潮心',
};

const CUE_TEXT = {
  HOLD: { title: '稳住收线', hint: '按住左键', key: 'HOLD', color: '#e9c27b' },
  RELEASE: { title: '松线！', hint: '松开左键', key: 'RELEASE', color: '#8ed7ce' },
  STRIKE: { title: '扬竿！', hint: '在光环重合时按 空格', key: 'SPACE', color: '#ff9a66' },
};

export class BossFight {
  constructor({ game }) {
    this.game = game;
    this.active = false;
    this.phase = 'idle';
    this.boss = null;
    this.model = null;
    this.ring = null;
    this.glow = null;
    this.def = null;
    this.hp = 100;
    this.integrity = 100;
    this.cue = null;
    this.nextTimer = 0;
    this.phaseTimer = 0;
    this.introTimer = 0;
    this.phaseLevel = 0;
    this.hits = 0;
    this.cameraTarget = new THREE.Vector3();
    this.originalFov = 70;
    this.ended = false;
    this.lastCueType = null;
  }

  async start(species) {
    if (this.active) return;
    const def = FISH[species];
    if (!def) return;
    this.active = true;
    this.def = def;
    this.speciesId = species;
    this.ended = false;
    this.phase = 'intro';
    this.hp = 100;
    this.integrity = 100;
    this.phaseLevel = 0;
    this.hits = 0;
    this.introTimer = 3.8;
    this.nextTimer = 0;
    this.game.setMode('boss');
    this.game.player.setFrozen(true);
    this.game.audio?.setMusicMode('boss');
    this.game.audio?.play('bossRoar');
    this.game.ui.showBossHud(def, BOSS_LABEL[def.id] || '潮主');
    this.game.ui.setPrompt(null);
    this.originalFov = this.game.player.camera.fov;
    this.game.player.overrideFov = 52;
    this.game.player.camera.fov = 52;
    this.game.player.camera.updateProjectionMatrix();

    const pos = this.game.world.bossPosition.clone();
    const size = def.length[1] || 3;
    const visualScale = def.id === 'abyss_whale' ? 1.5 :
      def.id === 'iron_crab' ? 6.5 :
        def.id === 'giant_pike' ? 3.7 :
          def.id === 'puffer_king' ? 4.4 : 3.8;
    const worldSize = ((def.length[0] + def.length[1]) / 2) * visualScale;
    this.model = createFishModel(def, { scale: visualScale, quality: 'high' });
    this.model.position.copy(pos);
    this.model.position.y = def.shape?.type === 'whale' ? -worldSize * 0.06 :
      def.shape?.type === 'crab' ? worldSize * 0.22 : worldSize * 0.04;
    this.model.rotation.y = Math.atan2(
      this.game.player.camera.position.x - pos.x,
      this.game.player.camera.position.z - pos.z
    ) + (def.shape?.type === 'whale' ? Math.PI / 2 : 0.22);
    this.game.scene.add(this.model);
    this.bossBase = this.model.position.clone();

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.35, 64),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(def.boss?.color || '#ffb06a'), transparent: true, opacity: 0.3, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.copy(pos).setY(0.06);
    this.ring.scale.setScalar(Math.max(4, worldSize * 0.5));
    this.game.scene.add(this.ring);
    this.glow = new THREE.PointLight(new THREE.Color(def.boss?.color || '#ff9c64'), 3.5, 35, 1.8);
    this.glow.position.copy(pos).add(new THREE.Vector3(0, 2, 0));
    this.game.scene.add(this.glow);
    this.cameraTarget.copy(pos).add(new THREE.Vector3(0, worldSize * 0.15, 0));
    this.model.userData.baseY = this.model.position.y;
    this.game.world.ocean.splash(pos.x, pos.z, 8);
    this.game.addShake(0.12);

    await new Promise((r) => setTimeout(r, 250));
    this.game.ui.showBossIntro(def);
  }

  cuePool() {
    const id = this.def.id;
    if (id === 'storm_tuna') return ['HOLD', 'RELEASE', 'HOLD', 'STRIKE', 'RELEASE', 'HOLD', 'STRIKE'];
    if (id === 'puffer_king') return ['HOLD', 'RELEASE', 'RELEASE', 'STRIKE', 'HOLD', 'RELEASE'];
    if (id === 'giant_pike') return ['STRIKE', 'HOLD', 'RELEASE', 'STRIKE', 'HOLD', 'STRIKE'];
    if (id === 'abyss_whale') return ['HOLD', 'RELEASE', 'STRIKE', 'HOLD', 'RELEASE', 'STRIKE', 'HOLD'];
    return ['HOLD', 'RELEASE', 'STRIKE', 'HOLD', 'RELEASE'];
  }

  startCue() {
    if (this.ended) return;
    const pool = this.cuePool();
    let type = pool[Math.floor(Math.random() * pool.length)];
    if (type === this.lastCueType && Math.random() < 0.5) type = pool[(pool.indexOf(type) + 1) % pool.length];
    this.lastCueType = type;
    const speed = 1 + this.phaseLevel * 0.16;
    const duration = (type === 'STRIKE' ? 1.75 : 2.2) / speed;
    this.cue = {
      type,
      duration,
      time: 0,
      resolved: false,
      success: false,
      startedHeld: this.game.input.mouse.left,
    };
    this.game.ui.showBossCue(CUE_TEXT[type], this.cue, this.phaseLevel);
  }

  resolveCue(success, reason = '') {
    if (!this.cue || this.cue.resolved) return;
    this.cue.resolved = true;
    this.cue.success = success;
    const stats = this.game.stats;
    if (success) {
      const dmg = (7.5 + Math.random() * 4.5) * stats.power * stats.bossBonus;
      this.hp = Math.max(0, this.hp - dmg);
      this.hits++;
      this.game.audio?.play('bossHit');
      this.game.addShake(0.1);
      this.game.ui.bossCueResult(true, reason);
      this.game.world.ocean.splash(this.model.position.x + rand(-2, 2), this.model.position.z + rand(-2, 2), 5);
      this.model.position.y = this.bossBase.y + (this.def.shape?.type === 'crab' ? 0.4 : 0.7);
      this.model.rotation.z = 0.12;
      this.game.ui.updateBossHud(this.hp, this.integrity, this.phaseLevel);
    } else {
      const dmg = 13 + Math.random() * 7;
      this.integrity = Math.max(0, this.integrity - dmg);
      this.game.audio?.play('bossFail');
      this.game.addShake(0.26);
      this.game.ui.bossCueResult(false, reason);
      this.game.world.ocean.splash(this.model.position.x, this.model.position.z, 7);
      this.model.rotation.z = -0.1;
      this.game.ui.updateBossHud(this.hp, this.integrity, this.phaseLevel);
    }
    if (this.hp <= 0) {
      this.win();
      return;
    }
    if (this.integrity <= 0) {
      this.lose();
      return;
    }
    const nextThreshold = this.phaseLevel === 0 ? 64 : this.phaseLevel === 1 ? 31 : -1;
    if (this.hp <= nextThreshold && nextThreshold > 0) {
      this.phaseLevel++;
      this.phase = 'phase';
      this.phaseTimer = 1.9;
      this.nextTimer = 0;
      this.game.ui.showBossPhase(this.def, this.phaseLevel);
      this.game.audio?.play('bossRoar');
      this.game.addShake(0.3);
      this.model.position.y = this.bossBase.y + 1.2;
      return;
    }
    this.nextTimer = 0.8 - this.phaseLevel * 0.08;
  }

  update(dt) {
    if (!this.active) return;
    const input = this.game.input;
    if (this.phase === 'intro') {
      this.introTimer -= dt;
      this.followCamera(dt);
      animateFish(this.model, this.game.time, 0.8);
      this.model.rotation.z = Math.sin(this.game.time * 1.3) * 0.04;
      if (this.introTimer <= 0) {
        this.phase = 'fight';
        this.nextTimer = 0.4;
        this.game.ui.hideBossIntro();
        this.startCue();
      }
      this.animateArena(dt);
      return;
    }
    if (this.phase === 'won' || this.phase === 'lost') {
      this.followCamera(dt);
      this.animateArena(dt);
      return;
    }
    this.followCamera(dt);
    if (this.phase === 'phase') {
      this.phaseTimer -= dt;
      this.model.rotation.z = Math.sin(this.game.time * 18) * 0.03;
      if (this.phaseTimer <= 0) {
        this.phase = 'fight';
        this.nextTimer = 0.7;
        this.model.rotation.z = 0;
        this.game.ui.hideBossPhase();
      }
      this.animateArena(dt);
      return;
    }
    // Fight loop.
    if (!this.cue) {
      this.nextTimer -= dt;
      if (this.nextTimer <= 0) this.startCue();
    } else {
      this.cue.time += dt;
      const c = this.cue;
      if (c.type === 'STRIKE' && !c.resolved && input.consumePressed('Space')) {
        const f = c.time / c.duration;
        if (f > 0.32 && f < 0.72) this.resolveCue(true, '完美扬竿');
        else this.resolveCue(false, f <= 0.32 ? '太早了' : '太晚了');
      }
      if (!c.resolved && c.time >= c.duration) {
        if (c.type === 'HOLD') {
          this.resolveCue(!!input.mouse.left, input.mouse.left ? '' : '线松了');
        } else if (c.type === 'RELEASE') {
          this.resolveCue(!input.mouse.left, input.mouse.left ? '没有松线' : '');
        } else if (c.type === 'STRIKE') {
          this.resolveCue(false, '错过了扬竿时机');
        }
      }
      this.game.ui.updateBossCue(c, input.mouse.left);
      if (c.resolved && this.nextTimer <= 0) {
        this.nextTimer = 0.7;
        this.cue = null;
        this.game.ui.hideBossCue();
      }
      if (c.resolved) {
        this.nextTimer -= dt;
        if (this.nextTimer <= 0 && this.phase === 'fight' && this.hp > 0 && this.integrity > 0) {
          this.cue = null;
          this.startCue();
        }
      }
    }
    // The boss circles and lunges.
    const t = this.game.time;
    const len = this.def.length[0] || 3;
    this.model.position.x = this.bossBase.x + Math.sin(t * 0.32) * len * 0.12;
    this.model.position.z = this.bossBase.z + Math.cos(t * 0.27) * len * 0.08;
    this.model.position.y = this.bossBase.y + Math.sin(t * 0.8) * len * 0.015;
    this.model.rotation.y = Math.atan2(
      this.game.player.camera.position.x - this.model.position.x,
      this.game.player.camera.position.z - this.model.position.z
    ) + (this.def.shape?.type === 'whale' ? Math.PI / 2 : 0.22) + Math.sin(t * 0.35) * 0.12;
    this.model.rotation.z *= 0.92;
    animateFish(this.model, t, this.phaseLevel > 0 ? 1.4 : 1);
    this.animateArena(dt);
  }

  animateArena(dt) {
    if (!this.ring) return;
    this.ring.rotation.z += dt * (0.2 + this.phaseLevel * 0.1);
    this.ring.material.opacity = 0.2 + Math.sin(this.game.time * 2.2) * 0.08;
    this.glow.intensity = 2.8 + Math.sin(this.game.time * 3) * 0.8;
    if (Math.random() < dt * 0.5) {
      this.game.world.ocean.ripple(
        this.model.position.x + rand(-4, 4),
        this.model.position.z + rand(-4, 4),
        { radius: 5 + Math.random() * 5, life: 1.8, opacity: 0.25 }
      );
    }
  }

  followCamera(dt) {
    const player = this.game.player;
    const target = this.model ? this.model.position.clone().add(new THREE.Vector3(0, (this.def?.length?.[0] || 3) * 0.35, 0)) : this.cameraTarget;
    const dir = target.clone().sub(player.camera.position).normalize();
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.asin(clamp(dir.y, -1, 1));
    player.yaw += (yaw - player.yaw) * Math.min(1, dt * 2.2);
    player.pitch += (pitch - player.pitch) * Math.min(1, dt * 2.2);
  }

  win() {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'won';
    this.game.audio?.stopFishing();
    this.game.audio?.play('bossWin');
    this.game.ui.hideBossCue();
    this.game.ui.showBossVictory(this.def);
    this.game.addShake(0.16);
    this.game.state.data.stats.bosses++;
    const caught = this.game.state.data.catches[this.def.id] || { count: 0, first: Date.now() };
    caught.count += 1;
    caught.last = Date.now();
    this.game.state.data.catches[this.def.id] = caught;
    this.game.state.data.records[this.def.id] = {
      kg: this.def.weight?.[1] || 1,
      length: this.def.length?.[1] || 1,
      date: Date.now(),
    };
    this.game.state.save();
    this.game.world.sparkle(this.model.position.clone().setY(1.4), this.def.boss?.color || '#ffd27d', 60);
    setTimeout(() => {
      this.game.world.ocean.splash(this.model.position.x, this.model.position.z, 10);
    }, 200);
    setTimeout(() => {
      const species = this.def?.id || this.speciesId;
      if (this.model) this.model.visible = false;
      this.game.ui.hideBossHud();
      this.game.setMode('play');
      this.game.player.setFrozen(false);
      this.game.player.overrideFov = null;
      this.game.player.camera.fov = this.originalFov;
      this.game.player.camera.updateProjectionMatrix();
      this.game.audio?.setMusicMode('explore');
      const normalBait = Object.keys(this.game.state.data.baits).find((k) => !k.startsWith('boss') && this.game.state.data.baits[k] > 0);
      if (normalBait) {
        this.game.state.data.currentBait = normalBait;
        this.game.ui.refreshHUD(this.game.state);
      }
      this.cleanup();
      if (species) this.game.quest?.bossDefeated(species);
    }, 3200);
  }

  lose() {
    if (this.ended) return;
    this.ended = true;
    this.phase = 'lost';
    this.game.audio?.play('bossFail');
    this.game.ui.hideBossCue();
    this.game.ui.showBossDefeat(this.def, {
      onRetry: () => {
        const species = this.speciesId || this.def?.id;
        this.game.ui.hideBossHud();
        this.cleanup();
        this.active = false;
        if (species) this.start(species);
      },
      onReturn: () => {
        this.game.ui.hideBossHud();
        this.game.setMode('play');
        this.game.player.setFrozen(false);
        this.game.player.overrideFov = null;
        this.game.player.camera.fov = this.originalFov;
        this.game.player.camera.updateProjectionMatrix();
        this.game.audio?.setMusicMode('explore');
        this.cleanup();
      },
    });
  }

  cleanup() {
    this.active = false;
    this.cue = null;
    if (this.model) {
      this.game.scene.remove(this.model);
      disposeFishModel(this.model);
      this.model = null;
    }
    if (this.ring) {
      this.game.scene.remove(this.ring);
      this.ring.geometry.dispose();
      this.ring.material.dispose();
      this.ring = null;
    }
    if (this.glow) {
      this.game.scene.remove(this.glow);
      this.glow = null;
    }
    this.def = null;
  }
}
