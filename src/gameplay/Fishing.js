import * as THREE from 'three';
import { fishValue, fishXp, rollWeight, pickSpecies, speciesForIsland, FISH } from '../data/fish.js';
import { clamp, lerp, rand, pick } from '../utils/math.js';
import { createFishModel, animateFish, disposeFishModel } from './FishFactory.js';
import { statTotals } from '../data/progression.js';

const STATE = {
  IDLE: 'idle',
  CHARGING: 'charging',
  CASTING: 'casting',
  WAITING: 'waiting',
  BITE: 'bite',
  REEL: 'reel',
  LANDED: 'landed',
};

function makeBobber() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: '#e85a3d', roughness: 0.35, clearcoat: 0.7 });
  const whiteMat = new THREE.MeshPhysicalMaterial({ color: '#f4ead8', roughness: 0.4, clearcoat: 0.5 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
  const bottom = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), whiteMat);
  g.add(top, bottom);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.16, 6), new THREE.MeshStandardMaterial({ color: '#3b3128' }));
  antenna.position.y = 0.15;
  g.add(antenna);
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffcf73' }));
  tip.position.y = 0.24;
  g.add(tip);
  // No point light on the bobber: showing/hiding it would change the scene's
  // light count and force a full shader recompile when fishing starts.
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

export class Fishing {
  constructor({ game, scene, camera, player, state, ui, audio }) {
    this.game = game;
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.state = state;
    this.ui = ui;
    this.audio = audio;
    this.mode = STATE.IDLE;
    this.charge = 0;
    this.castImpulse = 0;
    this.target = new THREE.Vector3();
    this.castOrigin = new THREE.Vector3();
    this.bobberPos = new THREE.Vector3();
    this.linePoints = Array.from({ length: 36 }, () => new THREE.Vector3());
    this.tension = 45;
    this.integrity = 100;
    this.lineOut = 1;
    this.stamina = 100;
    this.fish = null;
    this.shadow = null;
    this.species = null;
    this.reelHeld = false;
    this.lastInput = false;
    this.biteTimer = 0;
    this.biteWindow = 0;
    this.waitTimer = 0;
    this.shadowTimer = 0;
    this.slackTimer = 0;
    this.runTimer = 3;
    this.fightTime = 0;
    this.splashTimer = 0;
    this.castPower = 0;
    this.bobber = makeBobber();
    this.bobber.visible = false;
    this.scene.add(this.bobber);
    this.lineGeo = new THREE.BufferGeometry().setFromPoints(this.linePoints);
    this.lineMat = new THREE.LineBasicMaterial({ color: '#efe7d2', transparent: true, opacity: 0.75 });
    this.line = new THREE.Line(this.lineGeo, this.lineMat);
    this.line.frustumCulled = false;
    this.line.visible = false;
    this.scene.add(this.line);
    this.pendingCatch = null;
    this.lastReelTick = 0;
    this.hotspot = null;
  }

  get isActive() {
    return this.mode !== STATE.IDLE;
  }

  get stats() {
    return statTotals(this.state.data.equipment, this.state.data.perks);
  }

  beginCharge() {
    if (!this.game.canFish()) return false;
    if (this.mode !== STATE.IDLE) return false;
    const bait = this.state.data.currentBait;
    if (!bait || (this.state.data.baits[bait] || 0) <= 0) {
      this.ui.toast('鱼饵用完了。去杂货铺补充一些。', 'warn');
      return false;
    }
    if (bait.startsWith('boss')) {
      this.ui.toast('这股味道不属于这里。去潮主出没的水域再用。', 'warn');
      return false;
    }
    this.mode = STATE.CHARGING;
    this.charge = 0;
    this.audio?.setMusicMode('fishing');
    this.audio?.play('cast', { charge: 0.1 });
    this.ui.showFishingCharge(0);
    return true;
  }

  cancelCharge() {
    if (this.mode !== STATE.CHARGING) return;
    this.mode = STATE.IDLE;
    this.ui.hideFishingCharge();
    this.player.rod.setVisible(true);
    this.audio?.setMusicMode('explore');
  }

  releaseCast() {
    if (this.mode !== STATE.CHARGING) return;
    const aim = this.player.getWaterTarget();
    if (!aim) {
      this.cancelCharge();
      this.ui.toast('把准星对准水面再抛竿。', 'warn');
      return;
    }
    const bait = this.state.data.currentBait;
    this.state.useBait(bait, 1);
    this.charge = clamp(this.charge, 0.15, 1);
    this.castPower = this.charge;
    const stats = this.stats;
    const maxDist = 22 * stats.cast;
    const dist = lerp(4.5, maxDist, this.charge);
    const from = this.player.camera.position;
    const dir = aim.clone().sub(from).setY(0).normalize();
    let tx = from.x + dir.x * dist;
    let tz = from.z + dir.z * dist;
    // Keep the bobber off the pier and off dry land.
    for (let i = 0; i < 24 && this.game.world.getWalkHeight(tx, tz) > 0.45; i++) {
      tx += dir.x * 1.2;
      tz += dir.z * 1.2;
    }
    if (!this.game.world.isWaterAim(tx, tz) || this.game.world.getWalkHeight(tx, tz) > 0.45) {
      this.cancelCharge();
      this.ui.toast('这个方向没有足够的水面。', 'warn');
      return;
    }
    this.target.set(tx, 0.08, tz);
    this.hotspot = this.game.world.nearestFishingSpot?.(tx, tz, 4.8) || null;
    if (this.hotspot) {
      this.ui.toast('潮光鱼群 · 稀有鱼概率提升', 'success');
      this.audio?.play('shimmer');
    }
    this.castOrigin.copy(this.player.rod.getTipWorld());
    this.mode = STATE.CASTING;
    this.castTime = 0;
    this.castImpulse = 1;
    this.bobber.visible = true;
    this.bobber.position.copy(this.castOrigin);
    this.line.visible = true;
    this.ui.hideFishingCharge();
    this.audio?.play('cast', { charge: this.charge });
    this.species = pickSpecies({
      island: this.game.world.island.id,
      bait,
      caught: this.state.data.catches,
      rareBoost: stats.rareBonus + (this.hotspot ? 0.35 : 0),
    });
    if (this.species) {
      this.questBias(bait);
    }
    this.state.data.stats.casts++;
    this.game.quest?.notify('cast', {});
  }

  questBias(bait) {
    const obj = this.game.quest?.objective;
    let wanted = null;
    if (obj?.type === 'catch') wanted = obj.species.find((s) => FISH[s]?.baits.includes(bait));
    if (wanted && Math.random() < 0.5) {
      this.species = FISH[wanted];
    }
    if (obj?.type === 'catchUnique' && this.species) {
      // Give an uncaught species a better shot while keeping the roll natural.
      const seen = this.game.quest?.uniqueSpecies || new Set();
      const candidates = speciesForIsland(this.game.world.island.id).filter(
        (f) => f.baits.includes(bait) && !seen.has(f.id) && this.state.data.catches[f.id] === undefined
      );
      if (candidates.length && Math.random() < 0.55) this.species = pick(candidates);
    }
  }

  setReel(held) {
    this.reelHeld = held;
  }

  pump() {
    if (this.mode !== STATE.REEL) return;
    if (this.tension > 88 || this.integrity < 12) return;
    this.lineOut = Math.max(0.02, this.lineOut - 0.028);
    this.tension = clamp(this.tension + 11, 0, 112);
    this.stamina = clamp(this.stamina - 2.5, 0, 100);
    this.game.addShake(0.055);
    this.audio?.play('hookset', { soft: true });
    this.game.world.ocean.ripple(this.bobber.position.x, this.bobber.position.z, { radius: 4, life: 1, opacity: 0.4 });
  }

  update(dt) {
    if (!this.game.player?.enabled) return;
    const t = this.game.time;
    this.castImpulse = Math.max(0, this.castImpulse - dt * 3.4);

    if (this.mode === STATE.CHARGING) {
      this.charge = clamp(this.charge + dt * 0.62, 0, 1);
      this.ui.showFishingCharge(this.charge);
      if (!this.game.input.mouse.left) this.releaseCast();
    } else if (this.mode === STATE.CASTING) {
      this.castTime += dt;
      const p = clamp(this.castTime / 0.58);
      const e = 1 - Math.pow(1 - p, 3);
      const from = this.castOrigin;
      const to = this.target;
      this.bobber.position.set(
        lerp(from.x, to.x, e),
        lerp(from.y, 0.08, e) + Math.sin(p * Math.PI) * 5.5,
        lerp(from.z, to.z, e)
      );
      this.updateLine();
      if (p >= 1) {
        this.mode = STATE.WAITING;
        this.waitTimer = rand(1.8, 5.2);
        this.shadowTimer = Math.max(0.8, this.waitTimer - 2.1);
        this.game.world.ocean.splash(to.x, to.z, 3);
        this.audio?.play('splash', { power: this.castPower });
        this.showShadow();
      }
    } else if (this.mode === STATE.WAITING) {
      this.bobFloat(t, 0.06);
      this.waitTimer -= dt;
      this.shadowTimer -= dt;
      if (this.shadowTimer <= 0 && this.shadow && !this.shadow.visible) {
        this.shadow.visible = true;
      }
      if (this.shadow && this.shadow.visible) {
        const toBob = this.bobber.position.clone().sub(this.shadow.position);
        toBob.y = 0;
        if (toBob.length() > 0.9) this.shadow.position.addScaledVector(toBob.normalize(), dt * 1.6);
        this.shadow.position.y = -0.35 + Math.sin(t * 2 + 1) * 0.08;
        this.shadow.rotation.y = Math.atan2(toBob.x, toBob.z);
      }
      if (this.waitTimer <= 0) this.bite();
      this.updateLine();
    } else if (this.mode === STATE.BITE) {
      this.biteTimer -= dt;
      this.bobFloat(t, 0.15, true);
      this.updateLine();
      if (this.game.input.mouse.left && !this.lastInput) {
        this.hook();
      }
      if (this.biteTimer <= 0) this.escape();
      this.lastInput = this.game.input.mouse.left;
    } else if (this.mode === STATE.REEL) {
      this.fight(dt, t);
      this.updateLine();
    } else if (this.mode === STATE.LANDED) {
      this.castImpulse = 0;
    }
    this.updateBobberVisual(dt);
    if (this.mode === STATE.REEL || this.mode === STATE.WAITING || this.mode === STATE.BITE) {
      this.audio?.setTension(this.mode === STATE.REEL ? this.tension / 100 : 0.15);
    }
  }

  bobFloat(t, amp, bite = false) {
    const dip = bite ? -0.11 + Math.sin(t * 22) * 0.025 : 0;
    this.bobber.position.y = 0.08 + Math.sin(t * 2.3 + this.target.x) * amp + dip;
  }

  updateBobberVisual(dt) {
    if (!this.bobber.visible) return;
    this.bobber.rotation.z = Math.sin(this.game.time * 1.8) * 0.08;
    this.bobber.rotation.x = Math.cos(this.game.time * 1.4) * 0.06;
  }

  showShadow() {
    if (this.shadow) {
      this.scene.remove(this.shadow);
      disposeFishModel(this.shadow);
      this.shadow = null;
    }
    if (!this.species) return;
    const shadow = createFishModel(this.species, { scale: 0.7, quality: 'low' });
    shadow.visible = false;
    shadow.position.set(this.target.x + 2.5, -0.4, this.target.z + 2.5);
    shadow.rotation.y = Math.random() * 6;
    this.scene.add(shadow);
    this.shadow = shadow;
    this.shadowSpecies = this.species;
  }

  bite() {
    this.mode = STATE.BITE;
    this.biteWindow = 1.35 * this.stats.biteWindow;
    this.biteTimer = this.biteWindow;
    this.ui.showBite(this.species);
    this.audio?.play('bite');
    this.game.world.ocean.splash(this.bobber.position.x, this.bobber.position.z, 2);
    this.lastInput = this.game.input.mouse.left;
  }

  hook() {
    if (this.mode !== STATE.BITE) return;
    this.mode = STATE.REEL;
    this.reelHeld = true;
    this.tension = 52;
    this.integrity = 100 * this.stats.integrity * this.stats.lineBonus;
    this.maxIntegrity = this.integrity;
    this.lineOut = 1;
    this.stamina = 100;
    this.fightTime = 0;
    this.slackTimer = 0;
    this.runTimer = rand(1.2, 3.2);
    this.ui.hideBite();
    this.ui.showReelHud(this.species, this.stats);
    this.audio?.play('hookset');
    this.audio?.startFishing();
    this.game.world.ocean.splash(this.bobber.position.x, this.bobber.position.z, 4);
    if (this.shadow) this.shadow.visible = false;
  }

  fight(dt, t) {
    if (!this.species) return this.escape();
    const stats = this.stats;
    this.fightTime += dt;
    this.runTimer -= dt;
    if (this.runTimer <= 0) {
      this.fishRun = rand(0.45, 1);
      this.runTimer = rand(1.4, 3.4);
      if (this.fishRun > 0.8) this.audio?.play('bossHit', { soft: true });
    }
    const fishPower = this.species.strength * (1 - (1 - this.stamina / 100) * 0.35);
    const pull = 0.22 + fishPower * 0.62 + Math.sin(t * 3.7) * 0.12 + (this.fishRun || 0) * 0.28;
    this.fishRun = Math.max(0, (this.fishRun || 0) - dt * 0.8);
    const held = this.reelHeld;
    if (held) {
      this.tension += dt * (34 + pull * 42) / Math.max(0.7, stats.strength);
    } else {
      this.tension -= dt * (27 + stats.slackRecovery * 8);
    }
    this.tension = clamp(this.tension, 0, 112);

    const inSafe = this.tension > 28 && this.tension < 86;
    if (held && inSafe) {
      const speed = 0.105 * stats.speed * (0.55 + (1 - fishPower * 0.4)) * (1 - (this.stamina / 100) * 0.35);
      this.lineOut -= dt * speed;
      this.stamina -= dt * (7.5 + this.species.strength * 5);
      this.audio?.play('reelTick', { tension: this.tension });
    } else if (this.tension < 22) {
      this.slackTimer += dt;
      if (this.slackTimer > 2.6) return this.escape('线松了太久，鱼脱钩了。');
    } else {
      this.slackTimer = 0;
    }
    if (this.tension > 90) {
      this.integrity -= dt * (8 + (this.tension - 90) * 3.4);
      if (this.tension > 104) this.integrity -= dt * 18;
    } else {
      this.integrity = Math.min(this.maxIntegrity, this.integrity + dt * 1.2);
    }
    this.stamina = clamp(this.stamina, 0, 100);

    // Line angle and fish shadow movement.
    if (this.shadow) {
      const side = Math.sin(this.fightTime * 1.8) * 2.5;
      this.shadow.position.set(
        this.bobber.position.x + side,
        -0.35,
        this.bobber.position.z + Math.cos(this.fightTime * 1.5) * 2
      );
      this.shadow.rotation.y = Math.atan2(this.bobber.position.x - this.shadow.position.x, this.bobber.position.z - this.shadow.position.z);
      this.shadow.visible = true;
      animateFish(this.shadow, t, 1.6);
    }
    // Camera shake and splashes.
    if (this.tension > 82) {
      this.splashTimer -= dt;
      if (this.splashTimer <= 0) {
        this.splashTimer = 0.45;
        this.game.world.ocean.ripple(this.bobber.position.x, this.bobber.position.z, { radius: 4, life: 1.1, opacity: 0.4 });
        if (this.game.settings?.shake) this.game.addShake(0.045);
      }
    }
    this.ui.updateReelHud({
      tension: this.tension,
      progress: 1 - this.lineOut,
      integrity: this.integrity / this.maxIntegrity,
      stamina: this.stamina,
      status: this.tension > 90 ? 'danger' : this.tension < 22 ? 'slack' : 'safe',
    });
    if (this.integrity <= 0) return this.snap();
    if (this.lineOut <= 0.035) return this.land();
  }

  updateLine() {
    const tip = this.player.rod.getTipWorld();
    const b = this.bobber.position;
    const sag = this.mode === STATE.REEL ? 0.8 + this.tension * 0.012 : 1.2;
    for (let i = 0; i < this.linePoints.length; i++) {
      const f = i / (this.linePoints.length - 1);
      const p = new THREE.Vector3().lerpVectors(tip, b, f);
      p.y -= Math.sin(f * Math.PI) * sag;
      p.x += Math.sin(f * Math.PI) * 0.1;
      this.linePoints[i].copy(p);
    }
    this.lineGeo.setFromPoints(this.linePoints);
    this.lineGeo.attributes.position.needsUpdate = true;
    this.lineMat.opacity = this.mode === STATE.REEL ? 0.55 + Math.sin(this.game.time * 8) * 0.1 : 0.75;
  }

  snap() {
    this.audio?.play('lineSnap');
    this.audio?.stopFishing();
    this.ui.hideReelHud();
    this.ui.toast('线断了。鱼带着你的饵消失在深处。', 'danger');
    this.game.addShake(0.2);
    this.game.world.ocean.splash(this.bobber.position.x, this.bobber.position.z, 5);
    this.game.state.data.stats.snapped++;
    this.reset();
  }

  escape(msg = '鱼脱钩了。下次早一点提竿。') {
    this.audio?.stopFishing();
    this.ui.hideBite();
    this.ui.hideReelHud();
    this.ui.toast(msg, 'warn');
    if (this.bobber.visible) this.game.world.ocean.splash(this.bobber.position.x, this.bobber.position.z, 2);
    this.reset();
  }

  land() {
    if (!this.species) return this.escape();
    const fish = this.species;
    const kg = rollWeight(fish);
    const length = lerp(fish.length[0], fish.length[1], clamp(kg / fish.weight[1], 0, 1) * 0.9 + Math.random() * 0.1);
    const shiny = !fish.boss && Math.random() < 0.045 + (this.stats.rareBonus * 0.2);
    const value = Math.round(fishValue(fish, kg) * (shiny ? 1.6 : 1) * this.stats.sellBonus);
    const xp = Math.round(fishXp(fish, kg) * this.stats.xpBonus);
    const previousRecord = this.state.data.records[fish.id]?.kg || 0;
    const entry = {
      uid: `${Date.now()}_${Math.floor(Math.random() * 9999)}`,
      species: fish.id,
      kg,
      length,
      value,
      shiny,
      isRecord: kg > previousRecord,
      caughtAt: Date.now(),
    };
    const added = this.state.addFish(entry);
    const result = this.state.addXp(xp);
    this.state.data.stats.catches += 0;
    this.audio?.play('fishLand');
    this.audio?.stopFishing();
    this.ui.hideReelHud();
    this.game.world.ocean.splash(this.bobber.position.x, this.bobber.position.z, 6);
    this.game.world.sparkle(new THREE.Vector3(this.bobber.position.x, 1.2, this.bobber.position.z), shiny ? '#ffd77a' : '#baf4e4', shiny ? 36 : 18);
    let questNotified = false;
    const notifyQuest = () => {
      if (questNotified) return;
      questNotified = true;
      this.game.quest?.notify('catch', { species: fish.id, entry });
    };
    if (result.leveled > 0) {
      this.ui.levelUp(result.level, this.state.data.perkPoints);
      this.audio?.play('levelUp');
    }
    this.pendingCatch = entry;
    this.ui.showCatch({
      entry,
      fish,
      added,
      xp,
      levelUp: result.leveled > 0,
      onSell: () => {
        if (added) this.state.sellFish(entry.uid, value);
        else this.state.addCoins(value);
        this.ui.toast(`售出 ${fish.name} · +${value} 金币`);
        this.audio?.play('sell');
        this.ui.closeModal();
      },
      onRelease: () => {
        if (added) {
          this.state.removeFish(entry.uid);
          this.state.addXp(Math.round(xp * 0.25));
          this.ui.toast('你把它放回了海里。');
        }
        this.ui.closeModal();
      },
      onKeep: () => {
        if (!added) {
          this.ui.toast('鱼篓已满。先出售一些渔获吧。', 'warn');
          return;
        }
        this.ui.toast(`${fish.name} 已收入鱼篓。`);
        this.ui.closeModal();
      },
      onClose: notifyQuest,
    });
    this.game.save();
    this.reset();
  }

  reset() {
    this.mode = STATE.IDLE;
    this.hotspot = null;
    this.bobber.visible = false;
    this.line.visible = false;
    this.charge = 0;
    this.reelHeld = false;
    this.castImpulse = 0;
    this.ui.hideFishingCharge();
    this.ui.hideBite();
    this.ui.hideReelHud();
    if (this.shadow) {
      this.scene.remove(this.shadow);
      disposeFishModel(this.shadow);
      this.shadow = null;
    }
    this.audio?.stopFishing();
    if (this.game.mode !== 'boss' && this.game.mode !== 'title') this.audio?.setMusicMode('explore');
  }

  getRodState() {
    return {
      mode: this.mode === STATE.CHARGING ? 'charging' : this.mode === STATE.CASTING ? 'cast' : this.mode === STATE.BITE ? 'bite' : this.mode === STATE.REEL ? 'reel' : 'idle',
      charge: this.charge,
      tension: this.tension,
      castImpulse: this.castImpulse,
    };
  }

  dispose() {
    this.scene.remove(this.bobber);
    this.scene.remove(this.line);
    if (this.shadow) {
      this.scene.remove(this.shadow);
      disposeFishModel(this.shadow);
    }
  }
}

export { STATE as FISHING_STATE };
