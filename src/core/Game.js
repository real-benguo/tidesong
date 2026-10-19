import * as THREE from 'three';
import { AssetManager } from './Assets.js';
import { GameState } from './state.js';
import { ProfileStore } from './Profiles.js';
import { Input } from './Input.js';
import { PostFX } from './PostFX.js';
import { UI } from '../ui/UI.js';
import { World } from '../world/World.js';
import { Player } from '../player/Player.js';
import { Fishing } from '../gameplay/Fishing.js';
import { QuestSystem } from '../gameplay/QuestSystem.js';
import { BossFight } from '../gameplay/BossFight.js';
import { Duel } from '../gameplay/Duel.js';
import { FishPortraitRenderer } from '../gameplay/FishFactory.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { CHAPTERS, getChapter } from '../data/chapters.js';
import { NPCS } from '../data/npcs.js';
import { BAITS, FISH, RARITY } from '../data/fish.js';
import { RODS, REELS, LINES, PERKS, statTotals, upgradeCost } from '../data/progression.js';
import { ISLAND_NAMES } from '../data/islands.js';
import { clamp, rand } from '../utils/math.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.profiles = new ProfileStore();
    this.state = new GameState({ saveKey: this.profiles.saveKey });
    this.mode = 'boot';
    this.sessionActive = false;
    this.loading = true;
    this.time = 0;
    this.shake = 0;
    this.saveTimer = 0;
    this.npcPortraits = new Map();
    this.titleAngle = 0;
    const query = new URLSearchParams(location.search);
    if (query.get('quality')) this.state.settings.quality = query.get('quality');
    this.quality = this.state.settings.quality;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality === 'high' ? 1.35 : this.quality === 'medium' ? 1.1 : 0.9));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = this.quality !== 'low';
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.state.settings.fov || 72, innerWidth / innerHeight, 0.055, 2600);
    this.scene.add(this.camera);
    this.clock = new THREE.Clock();
    this.input = new Input(canvas);
    this.ui = new UI(this);
    this.post = new PostFX({ renderer: this.renderer, scene: this.scene, camera: this.camera, quality: this.quality });
    this.assets = new AssetManager(this.renderer);
    this.world = new World({ scene: this.scene, renderer: this.renderer, assets: this.assets, quality: this.quality, state: this.state });
    this.player = new Player({ camera: this.camera, input: this.input, game: this });
    this.audio = new AudioSystem();
    this.quest = new QuestSystem({ game: this, state: this.state, ui: this.ui, world: this.world, audio: this.audio });
    this.fishing = new Fishing({
      game: this, scene: this.scene, camera: this.camera, player: this.player,
      state: this.state, ui: this.ui, audio: this.audio,
    });
    this.boss = new BossFight({ game: this });
    this.fishPortraits = null;
    this.bindEvents();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  get settings() {
    return this.state.settings;
  }

  get stats() {
    return statTotals(this.state.data.equipment, this.state.data.perks);
  }

  async boot() {
    this.ui.setLoading(0.03, '正在听海……', '“有些潮声，是为归来的人唱的。”');
    await this.assets.loadAll((p) => {
      this.ui.setLoading(0.03 + p * 0.42, p < 0.65 ? '正在打磨潮水的纹理……' : '正在收起旧渔网……');
    });
    this.fishPortraits = new FishPortraitRenderer({ width: 620, height: 460 });
    this.ui.setLoading(0.5, '正在点亮灯塔……');
    this.world.setFishData(FISH);
    await this.world.load('hub', {
      onProgress: (label, p) => this.ui.setLoading(0.5 + p * 0.46, label),
    });
    this.bindWorld();
    this.prewarmPortraits();
    this.player.enabled = false;
    this.player.setFrozen(true);
    this.quest.setWorld(this.world);
    this.ui.setLoading(0.9, '正在等潮水对齐……');
    this.setTitleCamera();
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch (e) {
      this.renderer.compile(this.scene, this.camera);
    }
    // Force the first real draw while the boot layer is still visible. This is
    // where the driver compiles shadow variants and uploads the island buffers;
    // doing it later causes a multi-second freeze on the first gameplay frame.
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
    this.flushGPU();
    this.loading = false;
    this.ui.setLoading(0.99, '归潮');
    await sleep(250);
    this.ui.hideBoot();
    this.ui.showTitle(this.state.hasSave());
    this.setTitleCamera();
    this.ui.fadeOut(800);
    this.audio.setScene('hub');
    this.audio.setMusicMode('title');
  }

  bindWorld() {
    this.player.setWorld(this.world);
    this.player.setRodTier(this.state.data.equipment.rod);
    this.fishing.world = this.world;
    this.quest.setWorld(this.world);
    // The world lighting and most props are static; only re-render the large
    // 2048px shadow map when a new world/actor is introduced.
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
  }

  bindEvents() {
    this.input.on('mousedown', (e) => {
      if (e.button === 2) {
        if (this.fishing.mode === 'charging') this.fishing.cancelCharge();
        return;
      }
      if (e.button !== 0) return;
      this.ensureAudio();
      if (this.mode === 'boss') return;
      if (this.mode !== 'play') return;
      if (!this.ui.refs.modalLayer.classList.contains('hidden')) return;
      if (!this.input.locked) {
        this.input.requestLock();
        return;
      }
      if (this.fishing.mode === 'bite') {
        this.fishing.hook();
        return;
      }
      if (this.fishing.isActive) {
        this.fishing.setReel(true);
        return;
      }
      this.fishing.beginCharge();
    });
    this.input.on('mouseup', (e) => {
      if (e.button !== 0) return;
      this.fishing.setReel(false);
      if (this.fishing.mode === 'charging') this.fishing.releaseCast();
    });
    this.input.on('keydown', (e) => this.onKey(e));
    this.canvas.addEventListener('click', () => {
      this.ensureAudio();
      if (this.mode === 'play' && !this.input.locked) this.input.requestLock();
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.input.locked && this.mode === 'play' && this.fishing.isActive && this.fishing.mode === 'charging') {
        this.fishing.cancelCharge();
      }
    });
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.save();
        this.audio?.suspend();
      } else {
        this.audio?.resume();
      }
    });
    window.addEventListener('beforeunload', () => this.save());
  }

  async ensureAudio() {
    if (this.audio) {
      try { await this.audio.init(); } catch (e) { /* noop */ }
      this.audio.setVolume(this.settings.volume);
      this.audio.setMusicVolume(this.settings.music);
    }
  }

  onKey(e) {
    const code = e.code;
    if (code === 'F11' || (code === 'Enter' && e.altKey)) {
      e.preventDefault?.();
      this.toggleFullscreen();
      return;
    }
    if (this.mode === 'title') {
      if (code === 'Escape' && this.ui.modalKind) this.ui.closeModal();
      return;
    }
    if (this.mode === 'duel') {
      if (code === 'Escape') {
        this.duel?.exit();
        return;
      }
      if (code === 'KeyR' && this.duel?.phase === 'result') {
        this.duel.rematch();
        return;
      }
      return;
    }
    if (code === 'Escape') {
      if (this.ui.dialogue) {
        this.ui.finishDialogue();
        return;
      }
      if (!this.ui.refs.modalLayer.classList.contains('hidden')) {
        this.ui.closeModal();
        return;
      }
      if (this.mode === 'play' || this.fishing.isActive) {
        this.ui.openPause();
      }
      return;
    }
    if (this.ui.dialogue) {
      if (code === 'Space' || code === 'Enter') this.ui.advanceDialogue();
      return;
    }
    if (!this.ui.refs.modalLayer.classList.contains('hidden')) {
      if (code === 'Tab') this.ui.closeModal();
      return;
    }
    if (this.mode !== 'play') return;
    if (code === 'Tab') {
      e.preventDefault?.();
      this.ui.openJournal('journey');
      return;
    }
    if (code === 'KeyM') {
      this.ui.openJournal('map');
      return;
    }
    if (code === 'KeyJ') {
      this.ui.openJournal('journey');
      return;
    }
    if (code === 'KeyI') {
      this.ui.openJournal('skills');
      return;
    }
    if (code === 'KeyH') {
      this.ui.refs.controlsHint.classList.toggle('hidden');
      return;
    }
    if (code === 'KeyE') {
      if (this.mode === 'play' && this.player.currentTarget) {
        this.quest.interact(this.player.currentTarget);
      }
      return;
    }
    if (code === 'KeyF') {
      if (this.mode === 'play' && !this.fishing.isActive && this.input.locked) this.fishing.beginCharge();
      return;
    }
    if (code === 'Space') {
      if (this.mode !== 'play') return;
      if (this.fishing.isActive) {
        this.fishing.pump?.();
      } else if (!e.repeat && this.player.jump()) {
        this.audio?.play('footstep', { surface: 'grass', volume: 0.18 });
      }
      return;
    }
    if (/^Digit[1-6]$/.test(code)) {
      const idx = Number(code.slice(5)) - 1;
      const els = [...this.ui.refs.baitDock.querySelectorAll('[data-bait]')];
      if (els[idx]) {
        const id = els[idx].dataset.bait;
        if (this.state.data.baits[id] > 0) {
          this.state.data.currentBait = id;
          this.state.save();
          this.ui.refreshHUD(this.state);
        }
      }
    }
  }

  setMode(mode) {
    this.mode = mode;
    document.body.dataset.mode = mode;
  }

  canFish() {
    return this.mode === 'play' && !this.player.frozen && this.player.enabled;
  }

  addShake(v) {
    if (!this.settings.shake) return;
    this.shake = Math.min(0.5, this.shake + v);
  }

  flushGPU() {
    try {
      const gl = this.renderer.getContext();
      const px = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    } catch (e) {
      /* readPixels can fail on some drivers; the render is still valid */
    }
  }

  startDuel(mode = 'local') {
    if (this.mode === 'duel') return;
    this.ensureAudio();
    this.input.exitLock();
    this.fishing.reset();
    this.player.setFrozen(true);
    this.player.enabled = false;
    this.ui.closeModal();
    this.ui.refs.hud.classList.add('hidden');
    this.ui.refs.titleScreen.classList.add('hidden');
    this.ui.showTransition('潮斗 · 潮石升起');
    this.ui.fadeIn(180);
    this.setMode('duel');
    this.duel = new Duel(this, { ai: mode === 'ai' });
    this.duel.start();
    setTimeout(() => {
      this.ui.hideTransition();
      this.ui.fadeOut(500);
    }, 280);
  }

  endDuel() {
    this.duel = null;
    this.setMode('title');
    this.setTitleCamera();
    this.ui.showTitle(this.state.hasSave());
    this.audio?.setMusicMode('title');
    this.input.clearFrame();
  }

  setTitleCamera() {
    this.titleAngle = 0;
    this.camera.position.set(56, 25, 133);
    this.camera.lookAt(3, 9, 30);
    this.player.rod.setVisible(false);
    this.player.enabled = false;
  }

  titleUpdate(dt) {
    this.titleAngle += dt * 0.012;
    const radius = 148;
    const angle = -0.52 + Math.sin(this.titleAngle) * 0.2;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const y = 35 + Math.sin(this.titleAngle * 0.7) * 3;
    this.camera.position.set(x, y, z);
    this.camera.lookAt(0, 8, 18);
    this.world.update(dt, this.time, this.camera, { x: 0, z: 0 });
  }

  async newGame() {
    if (this.state.hasSave() && !this._newConfirmed) {
      this.ui.confirmNewGame(() => {
        this._newConfirmed = true;
        this.newGame();
      });
      return;
    }
    this._newConfirmed = false;
    await this.ensureAudio();
    this.state.reset();
    this.state.data.chapter = 1;
    this.state.data.objective = 0;
    this.state.save();
    this.sessionActive = true;
    this.ui.hideTitle();
    // Reuse the already-built hub when starting a new journey from the title.
    // Rebuilding an identical island costs a multi-second GPU upload for no
    // visual benefit.
    if (this.world.island?.id !== 'hub') this.world.island = null;
    await this.enterChapter(1, { showCard: true, first: true });
  }

  async continueGame() {
    if (!this.state.hasSave()) return;
    await this.ensureAudio();
    this.state.load();
    this.sessionActive = true;
    this.ui.hideTitle();
    const targetIsland = getChapter(this.state.data.chapter).island;
    if (this.world.island?.id !== targetIsland) this.world.island = null;
    await this.enterChapter(this.state.data.chapter, { showCard: false, resume: true });
  }

  async enterChapter(chapterId, { showCard = true, resume = false, first = false } = {}) {
    const ch = getChapter(chapterId);
    this.loading = true;
    this.setMode('cinematic');
    this.player.setFrozen(true);
    this.fishing.reset();
    this.ui.showTransition(`正在靠近 · ${ISLAND_NAMES[ch.island]}`);
    this.ui.fadeIn(700);
    await sleep(720);
    const islandChanged = !this.world.island || this.world.island.id !== ch.island;
    if (islandChanged) {
      await this.world.load(ch.island, {
        onProgress: (label, p) => this.ui.setLoading(0.4 + p * 0.6, label),
      });
      this.bindWorld();
      this.prewarmPortraits();
      this.audio.setScene(ch.island, { immediate: true });
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    }
    if (!islandChanged) {
      if (!resume) this.world.setLighthouseLit(false);
      this.world.refreshCollected();
    }
    this.quest.setWorld(this.world);
    this.player.setWorld(this.world);
    this.player.spawn(this.world, this.world.spawn);
    this.player.setRodTier(this.state.data.equipment.rod);
    this.player.setFrozen(true);
    this.ui.showHud();
    // Warm the exact eye-level view after the rod and HUD are attached. The
    // title camera is high above the island and frustum-culls much of the
    // grass/shore detail, so its warm-up misses the buffers that cause the
    // first gameplay-frame stall.
    this.camera.position.copy(this.player.position);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
    this.player.update(0);
    this.post.render(0);
    this.loading = false;
    // Absorb the first real gameplay frame while the transition layer still
    // covers the screen. This includes the player/world update that the warm
    // draw alone cannot predict, and waits for the driver to finish compiling
    // and uploading before the interactive loop starts.
    this.update(0);
    this.flushGPU();
    this.ui.setChapter(ch);
    this.ui.updateQuest(this.quest.objective, ch, this.quest.progress, this.state);
    this.audio.setMusicMode('explore');
    this.ui.hideTransition();
    this.ui.fadeOut(900);
    await sleep(760);
    if (showCard) {
      this.player.setCinematicView(this.world.getCinematicView());
      await this.ui.showChapterCard(ch);
      this.ui.fadeIn(240);
      await sleep(260);
      this.player.clearCinematicView();
      await sleep(170);
      this.ui.fadeOut(620);
    }
    this.setMode('play');
    this.player.setFrozen(false);
    await this.quest.beginChapter({ playIntro: true });
    this.setMode('play');
    this.player.setFrozen(false);
    this.ui.fadeOut(400);
    this.ui.refreshHUD(this.state);
    this.save();
  }

  async startTravel(nextChapter) {
    if (this.mode !== 'menu' && this.mode !== 'play') return;
    const obj = this.quest.objective;
    this.ui.closeModal();
    this.setMode('cinematic');
    this.player.setFrozen(true);
    this.ui.fadeIn(900);
    await sleep(920);
    if (obj?.type === 'travel' && obj.reward) this.quest.applyReward(obj.reward);
    this.state.data.chapter = nextChapter;
    this.state.data.objective = 0;
    this.state.data.chapterCleared = Array.from(new Set([...(this.state.data.chapterCleared || []), nextChapter - 1]));
    this.state.save();
    this.audio.play('chapter');
    await this.enterChapter(nextChapter, { showCard: true, travel: true });
  }

  async openChapterFromSave() {
    const chapterId = this.state.data.chapter;
    await this.enterChapter(chapterId, { showCard: false, resume: true });
  }

  showTravelMap(nextChapter) {
    this.ui.showTravelMap(nextChapter);
  }

  openShop() {
    this.ui.openShop();
  }

  showEndingChoice() {
    if (this.state.data.flags.endingShown && (this.state.data.ending || this.state.data.completed)) return;
    this.state.data.flags.endingShown = true;
    this.state.data.ending = null;
    this.state.save();
    this.ui.showEndingChoice();
  }

  async resolveEnding(choice) {
    this.ui.closeModal();
    this.state.data.ending = choice;
    this.state.data.completed = true;
    this.state.addItem('tideheart', 1);
    this.state.save();
    this.setMode('cinematic');
    this.player.setFrozen(true);
    this.ui.fadeIn(500);
    await sleep(600);
    await this.ui.playDialogue(choice === 'keep' ? 'ending_keep' : 'ending_quiet', { cinematic: true });
    this.setMode('ending');
    this.player.setFrozen(true);
    this.ui.showEnding(choice);
    this.ui.fadeOut(900);
  }

  startBoss(species) {
    this.ui.fadeIn(150);
    this.boss.start(species);
    setTimeout(() => this.ui.fadeOut(420), 160);
  }

  async quitToTitle(reset = false, saveFirst = true) {
    if (saveFirst) this.save();
    this.sessionActive = false;
    this.fishing.reset();
    this.player.setFrozen(true);
    this.player.enabled = false;
    this.ui.closeModal();
    this.ui.refs.dialogueLayer.classList.add('hidden');
    this.ui.refs.hud.classList.add('hidden');
    this.ui.refs.endingLayer.classList.add('hidden');
    this.ui.refs.bossOverlay.classList.add('hidden');
    this.ui.refs.cinematicLayer.classList.add('hidden');
    document.body.classList.remove('dialogue-active', 'boss-active', 'reeling');
    this.ui.hideBossHud();
    this.boss?.cleanup();
    if (this.boss) this.boss.active = false;
    this.player.overrideFov = null;
    this.ui.refs.titleScreen.classList.remove('hidden');
    this.ui.showTitle(this.state.hasSave());
    this.setMode('title');
    this.setTitleCamera();
    this.audio.setMusicMode('title');
    if (reset) {
      this.ui.showTitle(this.state.hasSave());
    }
  }

  save() {
    // The title uses a fresh in-memory state; never let a profile switch or a
    // title-screen autosave overwrite an existing profile with defaults.
    if (!this.sessionActive || this.mode === 'title' || this.mode === 'boot') return;
    this.state.save();
  }

  clearSave() {
    this.state.clearSave();
    this.profiles.clearCurrentSave();
  }

  switchProfile(id) {
    if (id === this.profiles.activeId) return;
    this.save();
    if (!this.profiles.activate(id)) {
      this.ui.toast('没有找到这个本地账号。', 'warn');
      return;
    }
    this.ui.toast('正在切换本地账号……', 'muted');
    setTimeout(() => location.reload(), 260);
  }

  createProfile(name, pin) {
    this.save();
    const result = this.profiles.create(name, pin, { copyFromKey: this.state.saveKey });
    if (result.error) {
      this.ui.toast(result.error, 'warn');
      return false;
    }
    this.ui.toast(`本地账号「${result.profile.name}」已创建。`, 'success');
    setTimeout(() => location.reload(), 420);
    return true;
  }

  loginProfile(name, pin) {
    this.save();
    const result = this.profiles.login(name, pin);
    if (result.error) {
      this.ui.toast(result.error, 'warn');
      return false;
    }
    this.ui.toast(`欢迎回来，${result.profile.name}。`, 'success');
    setTimeout(() => location.reload(), 420);
    return true;
  }

  exportSave() {
    try {
      let source = this.state.data;
      if (this.mode === 'title' || this.mode === 'boot') {
        try {
          const raw = localStorage.getItem(this.state.saveKey);
          if (raw) source = JSON.parse(raw);
        } catch (e) { /* fall back to the in-memory default */ }
      }
      const payload = {
        ...source,
        _profile: this.profiles.active?.name || '归潮者',
        _exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      const safeName = (this.profiles.active?.name || 'guest').replace(/[^\w\u4e00-\u9fa5-]+/g, '_');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = URL.createObjectURL(blob);
      a.download = `tidesong-${safeName}-${stamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1500);
      this.ui.toast('存档文件已导出。', 'success');
    } catch (e) {
      this.ui.toast('导出失败，请检查浏览器权限。', 'warn');
    }
  }

  importSave(text) {
    try {
      const parsed = JSON.parse(text);
      this.state.importData(parsed);
      this.ui.toast('存档已导入，正在回到潮声里……', 'success');
      setTimeout(() => location.reload(), 480);
      return true;
    } catch (e) {
      this.ui.toast('存档文件无法读取。', 'warn');
      return false;
    }
  }

  buyBait(id, qty = 1) {
    const b = BAITS[id];
    if (!b) return;
    const total = b.price * qty;
    if (!this.state.spend(total)) {
      this.ui.toast('金币不够。', 'warn');
      return;
    }
    this.state.addBait(id, qty);
    this.ui.toast(`购入 ${b.name} × ${qty}`, 'success');
    this.audio.play('buy');
    this.ui.refreshHUD(this.state);
  }

  buyGear(kind) {
    const arr = kind === 'rod' ? RODS : kind === 'reel' ? REELS : LINES;
    const cur = this.state.data.equipment[kind];
    const next = arr[cur + 1];
    if (!next) return;
    if (this.state.data.chapter < next.chapter) {
      this.ui.toast('这一代钓具还没到货。继续旅程吧。', 'warn');
      return;
    }
    if (!this.state.spend(next.price)) {
      this.ui.toast('金币不够。', 'warn');
      return;
    }
    this.state.data.equipment[kind] = next.id;
    this.state.save();
    this.player.setRodTier(this.state.data.equipment.rod);
    this.ui.toast(`换上了 ${next.name}`, 'success');
    this.audio.play('buy');
    this.ui.refreshHUD(this.state);
  }

  upgradeCreel() {
    const next = this.state.data.creel + 1;
    const prices = { 1: 450, 2: 1400 };
    if (next > 2) return;
    if (!this.state.spend(prices[next])) {
      this.ui.toast('金币不够。', 'warn');
      return;
    }
    this.state.data.creel = next;
    this.state.save();
    this.ui.toast(`鱼篓扩容至 ${this.state.creelCapacity} 格`, 'success');
    this.audio.play('buy');
    this.ui.refreshHUD(this.state);
  }

  sellFish(uid) {
    const f = this.state.data.fishBasket.find((x) => x.uid === uid);
    if (!f) return;
    const value = f.value;
    this.state.sellFish(uid, value);
    this.ui.toast(`售出 ${FISH[f.species]?.name || '渔获'} · +${value} 金币`, 'coin');
    this.audio.play('sell');
    this.ui.refreshHUD(this.state);
  }

  sellAllFish() {
    const fs = this.state.data.fishBasket.slice();
    if (!fs.length) return;
    let total = 0;
    for (const f of fs) {
      total += f.value;
      this.state.removeFish(f.uid);
    }
    this.state.addCoins(total);
    this.state.save();
    this.ui.toast(`售出 ${fs.length} 条渔获 · +${total} 金币`, 'coin');
    this.audio.play('sell');
    this.ui.refreshHUD(this.state);
  }

  unlockPerk(id) {
    const p = PERKS.find((x) => x.id === id);
    if (!p) return;
    if (this.state.data.perks.includes(id)) return;
    if (this.state.data.perkPoints < p.cost) {
      this.ui.toast('技能点不够。', 'warn');
      return;
    }
    if ((p.req || []).some((r) => !this.state.data.perks.includes(r))) {
      this.ui.toast('需要先习得前置技能。', 'warn');
      return;
    }
    this.state.data.perkPoints -= p.cost;
    this.state.addPerk(id);
    this.audio.play('levelUp');
    this.ui.toast(`习得「${p.name}」`, 'success');
    this.ui.refreshHUD(this.state);
  }

  prewarmPortraits() {
    if (!this.world?.island?.npcs) return;
    for (const id of Object.keys(this.world.island.npcs)) this.getNPCPortrait(id);
  }

  getNPCPortrait(id) {
    if (this.npcPortraits.has(id)) return this.npcPortraits.get(id);
    const def = NPCS[id];
    if (!def || !this.world?.portraitRenderer) return '';
    try {
      const src = this.world.portraitRenderer.get(def);
      this.npcPortraits.set(id, src);
      return src;
    } catch (e) {
      return '';
    }
  }

  getFishPortrait(fish) {
    if (!this.fishPortraits) return null;
    return this.fishPortraits.getPortrait(fish);
  }

  async toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
      } else {
        await document.exitFullscreen?.();
      }
    } catch (e) {
      this.ui.toast('浏览器没有允许全屏，请再点一次或按 F11。', 'warn');
    }
    this.ui.syncFullscreen();
    this.resize();
  }

  applySettings() {
    const s = this.settings;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, s.quality === 'high' ? 1.6 : s.quality === 'medium' ? 1.15 : 1));
    this.renderer.shadowMap.enabled = s.quality !== 'low';
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.shadowMap.needsUpdate = true;
    this.post.setQuality(s.quality);
    this.audio?.setVolume(s.volume);
    this.audio?.setMusicVolume(s.music);
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.state.saveSettings();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.resize(w, h);
    if (this.duel?.camera) {
      this.duel.camera.aspect = w / h;
      this.duel.camera.updateProjectionMatrix();
    }
  }

  update(dt) {
    this.time += dt;
    if (this.loading) {
      this.audio?.update(dt);
      return;
    }
    if (this.mode === 'title' || this.mode === 'boot') {
      this.titleUpdate(dt);
      this.audio?.update(dt);
      this.post.render(dt);
      return;
    }
    if (this.mode === 'duel') {
      this.duel?.update(dt);
      this.ui.update(dt);
      this.audio?.update(dt);
      this.post.render(dt);
      return;
    }
    this.state.update(dt);
    if (this.world.island) {
      this.player.update(dt);
      if (this.mode === 'play') this.fishing.update(dt);
      if (this.boss.active) this.boss.update(dt);
      this.world.setFocusTarget(this.player.currentTarget, this.quest.objective);
      this.world.update(dt, this.time, this.camera, this.player.position);
      this.ui.update(dt);
      const target = this.quest.getTargetPosition();
      if (target) this.ui.setObjectiveMarker(target);
      this.ui.updateQuestDistance(this.player.position, target, this.quest.getTargetLabel());
      if (this.mode === 'play' || this.mode === 'boss') {
        this.ui.updateCompass(this.player.yaw, this.player.position, target);
      }

      this.audio?.update(dt);
      if (this.shake > 0) {
        const s = this.shake;
        this.camera.position.x += (Math.random() - 0.5) * s;
        this.camera.position.y += (Math.random() - 0.5) * s * 0.7;
        this.camera.position.z += (Math.random() - 0.5) * s;
        this.camera.rotation.z += (Math.random() - 0.5) * s * 0.18;
        this.shake *= Math.exp(-dt * 8.5);
        if (this.shake < 0.001) this.shake = 0;
      }
      this.saveTimer += dt;
      if (this.saveTimer > 20) {
        this.saveTimer = 0;
        this.save();
      }
    }
    this.post.render(dt);
  }

  loop() {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    try {
      this.update(dt);
    } catch (e) {
      console.error(e);
    }
    this.input.clearFrame();
    requestAnimationFrame(this.loop);
  }
}
