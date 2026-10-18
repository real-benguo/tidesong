// TIDESONG / 潮汐遗歌 — procedural audio engine.
//
// Everything in this module is synthesized at runtime from oscillators, noise
// buffers, biquad filters, code-generated convolution impulses and envelopes.
// There are no audio assets, imports, network requests or dependencies.
//
// Signal flow:
//   voices -> music / sfx / ambience bus -> master
//           -> DynamicsCompressor -> soft-clip shaper -> destination
//   per-voice sends -> generated convolution reverb / stereo echo -> master
//
// The game may construct this object at boot; no AudioContext is created until
// init().  Ambience and music only begin once the context is running, which in
// Chrome means the first user gesture.  Every public method is safe to call
// before init(), twice, or after dispose().

const SCENE_IDS = ['hub', 'mangrove', 'atoll', 'cliffs', 'volcano'];
const MUSIC_MODES = ['explore', 'fishing', 'boss', 'ending', 'title'];

const PENTATONIC = [62, 65, 67, 69, 72]; // D minor pentatonic: D F G A C
const HIGH_PENTA = [74, 77, 79, 81, 84];

const STEP_DURATION = {
  explore: 0.46,
  fishing: 0.56,
  boss: 0.22,
  ending: 0.62,
  title: 0.5,
};

// Dm9 / Bbmaj7 / Fmaj7 / Cmaj7 — warm, unresolved but consonant.
const EXPLORE_CHORDS = [
  { root: 38, notes: [50, 53, 57, 60, 64] },
  { root: 34, notes: [46, 50, 53, 57] },
  { root: 41, notes: [53, 57, 60, 64] },
  { root: 36, notes: [48, 52, 55, 59] },
];

const TITLE_CHORDS = [
  { root: 38, notes: [50, 53, 57, 62] }, // Dm
  { root: 34, notes: [46, 50, 53, 58] }, // Bb
  { root: 41, notes: [53, 57, 60, 65] }, // F
  { root: 36, notes: [48, 52, 55, 60] }, // C
];

// The main theme: five pentatonic notes, D A C G D.  Steps are relative to the
// phrase start; each phrase lasts sixteen steps (two bars).
const TITLE_MOTIF = [[0, 62], [2, 69], [4, 72], [6, 67], [8, 62]];
const TITLE_ANSWER = [[0, 69], [2, 67], [4, 65], [6, 62], [8, 69]];

// A low ostinato in D with a flat second and a tritone for tension.
const BOSS_OSTINATO = [38, 38, 39, 41, 38, 43, 41, 39, 38, 38, 39, 44, 43, 41, 39, 38];

const SCENE_EVENTS = {
  hub: [['gull', 8, 18, 3]],
  mangrove: [
    ['insect', 1.4, 3.8, 2],
    ['drip', 2.5, 6, 1],
    ['flute', 10, 20, 5],
  ],
  atoll: [['bell', 7, 16, 4]],
  cliffs: [['thunder', 12, 26, 6]],
  volcano: [
    ['ember', 0.7, 1.8, 1],
    ['rumble', 14, 30, 8],
  ],
};

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class AudioSystem {
  constructor() {
    this._ctx = null;
    this._ready = false;
    this._started = false;
    this._running = false;
    this._failed = false;
    this._initPromise = null;

    this._volumes = { master: 0.9, music: 0.7, sfx: 1.0, ambience: 0.85 };

    this._desiredScene = null;
    this._sceneId = null;
    this._scene = null;
    this._sceneEvents = [];

    this._desiredMusic = null;
    this._musicMode = null;
    this._music = null;
    this._stepDur = 0.5;
    this._stepIndex = 0;
    this._nextStep = 0;

    this._tension = 0;
    this._fishing = null;
    this._wantFishing = false;

    this._timers = new Set();
    this._lastPlay = Object.create(null);
    this._noiseCache = Object.create(null);
    this._unlockHandler = null;

    this._randState = 0x1a2b3c4d;
    this._elapsed = 0;
    this._lastAir = 0;

    // Buses and master chain.
    this._master = null;
    this._musicBus = null;
    this._sfxBus = null;
    this._ambienceBus = null;
    this._fishingBus = null;
    this._airGain = null;
    this._reverbIn = null;
    this._echoIn = null;
    this._sendReverb = null;
    this._sendEcho = null;
    this._compressor = null;
    this._softClip = null;
    this._convolver = null;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Create the audio graph.  Safe to call repeatedly; concurrent calls share the
   * same promise.  The context may start suspended and is resumed by the first
   * pointer / key / touch gesture.
   */
  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._initInternal();
    return this._initPromise;
  }

  async _initInternal() {
    try {
      if (this._ctx) {
        if (this._ctx.state === 'running') this._onStarted();
        return this;
      }

      const AC = this._getAudioContextClass();
      if (!AC) {
        this._failed = true;
        return this;
      }

      let ctx = null;
      try {
        ctx = new AC({ latencyHint: 'interactive' });
      } catch (err) {
        ctx = new AC();
      }
      this._ctx = ctx;
      this._running = ctx.state === 'running';

      this._buildBuses();
      // Pre-bake the noise beds so the first scene change doesn't hitch.
      this._noiseBuffer('white');
      this._noiseBuffer('pink');
      this._noiseBuffer('brown');
      this._attachUnlock();

      if (ctx.state === 'running') {
        this._onStarted();
      } else {
        // Do not await resume: in Chrome a resume() before a gesture can stay
        // pending indefinitely.  The gesture listeners finish the job.
        this._nudgeResume();
      }

      ctx.onstatechange = () => {
        if (!this._ctx) return;
        this._running = this._ctx.state === 'running';
        if (this._running) this._onStarted();
      };

      return this;
    } catch (err) {
      this._failed = true;
      // Never take the game down because audio is unavailable.
      try {
        console.warn('[AudioSystem] audio unavailable:', err);
      } catch (_) {}
      return this;
    }
  }

  _getAudioContextClass() {
    try {
      if (typeof window !== 'undefined') {
        const W = window.AudioContext || window.webkitAudioContext;
        if (W) return W;
      }
      if (typeof AudioContext !== 'undefined') return AudioContext;
    } catch (_) {}
    return null;
  }

  _buildBuses() {
    const ctx = this._ctx;
    if (!ctx || typeof ctx.createGain !== 'function') {
      throw new Error('AudioContext lacks required factory methods');
    }

    this._master = ctx.createGain();
    this._master.gain.value = this._volumes.master;

    this._compressor = ctx.createDynamicsCompressor();
    this._compressor.threshold.value = -18;
    this._compressor.knee.value = 20;
    this._compressor.ratio.value = 3;
    this._compressor.attack.value = 0.006;
    this._compressor.release.value = 0.28;

    this._softClip = ctx.createWaveShaper();
    this._softClip.curve = this._makeSoftClipCurve(4096);
    try {
      this._softClip.oversample = '2x';
    } catch (_) {}

    this._master
      .connect(this._compressor)
      .connect(this._softClip)
      .connect(ctx.destination);

    this._musicBus = ctx.createGain();
    this._musicBus.gain.value = this._volumes.music;
    this._musicBus.connect(this._master);

    this._sfxBus = ctx.createGain();
    this._sfxBus.gain.value = this._volumes.sfx;
    this._sfxBus.connect(this._master);

    this._ambienceBus = ctx.createGain();
    this._ambienceBus.gain.value = this._volumes.ambience;
    this._airGain = ctx.createGain();
    this._airGain.gain.value = 1;
    this._ambienceBus.connect(this._airGain);
    this._airGain.connect(this._master);

    this._fishingBus = ctx.createGain();
    this._fishingBus.gain.value = 0.8;
    this._fishingBus.connect(this._sfxBus);

    this._buildReverb();
    this._buildEcho();
    this._buildSendGroups();

    this._ready = true;
  }

  _buildSendGroups() {
    const ctx = this._ctx;
    const make = (value) => {
      const g = ctx.createGain();
      g.gain.value = value;
      return g;
    };
    this._sendReverb = {
      sfx: make(this._volumes.sfx),
      music: make(this._volumes.music),
      ambience: make(1),
    };
    this._sendEcho = {
      sfx: make(this._volumes.sfx),
      music: make(this._volumes.music),
      ambience: make(1),
    };
    const groups = ['sfx', 'music', 'ambience'];
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      this._sendReverb[g].connect(this._reverbIn);
      this._sendEcho[g].connect(this._echoIn);
    }
  }

  _makeSoftClipCurve(n) {
    const curve = new Float32Array(n);
    // Linear below 0.6 so quiet details are never boosted; a quadratic soft
    // knee above it approaches 0.94 at full scale.  The compressor does most
    // of the work; this is only a safety net against inter-sample peaks.
    const knee = 0.6;
    const bend = 0.375;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      const a = x < 0 ? -x : x;
      let y;
      if (a <= knee) y = a;
      else {
        const d = a - knee;
        y = knee + d - bend * d * d;
      }
      if (y > 0.94) y = 0.94;
      curve[i] = x < 0 ? -y : y;
    }
    return curve;
  }

  _buildReverb() {
    const ctx = this._ctx;
    this._reverbIn = ctx.createGain();
    this._reverbIn.gain.value = 1;

    if (typeof ctx.createConvolver !== 'function' || typeof ctx.createBuffer !== 'function') {
      this._reverbIn.connect(this._master);
      return;
    }

    const preDelay = ctx.createDelay(0.2);
    preDelay.delayTime.value = 0.028;

    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 6200;
    damp.Q.value = 0.4;

    const convolver = ctx.createConvolver();
    convolver.normalize = false;
    convolver.buffer = this._buildImpulse();

    const ret = ctx.createGain();
    ret.gain.value = 0.5;

    this._reverbIn.connect(preDelay).connect(damp).connect(convolver).connect(ret).connect(this._master);
    this._convolver = convolver;
  }

  /**
   * Generate a stereo hall impulse.  Energy-normalised (not peak-normalised):
   * a dense decaying noise tail has a small peak but plenty of energy, which is
   * exactly what convolution reverb expects.
   */
  _buildImpulse() {
    const ctx = this._ctx;
    const sr = ctx.sampleRate || 44100;
    const seconds = 3.2;
    const len = Math.max(1, Math.floor(sr * seconds));
    const buf = ctx.createBuffer(2, len, sr);
    const taps = [0.011, 0.017, 0.026, 0.039, 0.057, 0.083];

    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const env = Math.pow(1 - x, 2.7);
        const n = Math.random() * 2 - 1;
        const a = 0.55 - 0.43 * x; // tail darkens as it decays
        lp += a * (n - lp);
        data[i] = lp * env;
      }
      for (let k = 0; k < taps.length; k++) {
        const idx = Math.floor(taps[k] * sr) + (ch ? 13 : 0);
        if (idx < len) data[idx] += (k % 2 ? -1 : 1) * (0.5 / (k + 1)) * (ch ? 0.85 : 1);
      }
      let dc = 0;
      for (let i = 0; i < len; i++) dc += data[i];
      dc /= len;
      let energy = 0;
      for (let i = 0; i < len; i++) {
        data[i] -= dc;
        energy += data[i] * data[i];
      }
      const scale = energy > 0 ? Math.sqrt(1 / energy) : 1;
      for (let i = 0; i < len; i++) data[i] *= scale;
    }
    return buf;
  }

  _buildEcho() {
    const ctx = this._ctx;
    this._echoIn = ctx.createGain();
    this._echoIn.gain.value = 1;

    const ret = ctx.createGain();
    ret.gain.value = 0.3;
    ret.connect(this._master);

    const make = (time, pan) => {
      const delay = ctx.createDelay(1.5);
      delay.delayTime.value = time;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2900;
      lp.Q.value = 0.5;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 180;
      hp.Q.value = 0.5;
      const fb = ctx.createGain();
      fb.gain.value = 0.27;
      const panner = this._panner(pan);

      this._echoIn.connect(delay);
      delay.connect(lp).connect(hp);
      hp.connect(fb).connect(delay);
      hp.connect(panner).connect(ret);
    };

    make(0.29, -0.72);
    make(0.43, 0.72);
  }

  _attachUnlock() {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    if (this._unlockHandler) return;
    const handler = () => this._unlock();
    this._unlockHandler = handler;
    try {
      window.addEventListener('pointerdown', handler, true);
      window.addEventListener('keydown', handler, true);
      window.addEventListener('touchstart', handler, { passive: true, capture: true });
    } catch (_) {}
  }

  _removeUnlock() {
    const handler = this._unlockHandler;
    if (!handler || typeof window === 'undefined' || typeof window.removeEventListener !== 'function') {
      this._unlockHandler = null;
      return;
    }
    try {
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('touchstart', handler, true);
    } catch (_) {}
    this._unlockHandler = null;
  }

  async _unlock() {
    const ctx = this._ctx;
    if (!ctx || !this._ready) return;
    // Kick the hardware while the gesture is still active (helps iOS/Safari).
    this._silentKick();
    try {
      if (ctx.state !== 'running') await ctx.resume();
    } catch (_) {}
    if (!this._ctx || this._ctx !== ctx) return;
    if (ctx.state === 'running') {
      this._silentKick();
      this._onStarted();
    }
  }

  _silentKick() {
    const ctx = this._ctx;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const buf = ctx.createBuffer(1, 1, ctx.sampleRate || 44100);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(g).connect(ctx.destination);
      src.start(now);
      src.stop(now + 0.01);
    } catch (_) {}
  }

  _nudgeResume() {
    const ctx = this._ctx;
    if (!ctx) return;
    try {
      const p = ctx.resume();
      if (p && typeof p.then === 'function') {
        const timeout = new Promise((resolve) => setTimeout(resolve, 180));
        Promise.race([p.catch(() => {}), timeout]).then(() => {
          if (this._ctx === ctx && ctx.state === 'running') this._onStarted();
        });
      } else if (ctx.state === 'running') {
        this._onStarted();
      }
    } catch (_) {}
  }

  _onStarted() {
    if (!this._ctx || !this._ready) return;
    this._running = this._ctx.state === 'running';
    if (!this._running) return;

    this._removeUnlock();
    this._started = true;

    // This covers both the first unlock and a mode/scene requested while the
    // context was suspended (e.g. changed from a pause menu).
    if (this._desiredScene && (this._sceneId !== this._desiredScene || !this._scene)) {
      this._applyScene(this._desiredScene, false);
    }
    if (this._desiredMusic && (this._musicMode !== this._desiredMusic || !this._music)) {
      this._applyMusic(this._desiredMusic);
    }
    if (this._wantFishing && !this._fishing) this._applyFishing();

    this._resetClocks();
  }

  _resetClocks() {
    const ctx = this._ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    if (this._music) this._nextStep = now + 0.08;
    for (let i = 0; i < this._sceneEvents.length; i++) {
      const ev = this._sceneEvents[i];
      if (ev.next < now + 0.25) ev.next = now + this._rrange(ev.min, ev.max);
    }
  }

  // ---------------------------------------------------------------------------
  // Mix levels
  // ---------------------------------------------------------------------------

  setVolume(v) {
    this._volumes.master = clamp(Number(v) || 0, 0, 1);
    if (this._master) this._smooth(this._master.gain, this._volumes.master);
    return this;
  }

  setMusicVolume(v) {
    this._volumes.music = clamp(Number(v) || 0, 0, 1);
    if (this._musicBus) this._smooth(this._musicBus.gain, this._volumes.music);
    if (this._sendReverb && this._sendReverb.music) {
      this._smooth(this._sendReverb.music.gain, this._volumes.music);
    }
    if (this._sendEcho && this._sendEcho.music) {
      this._smooth(this._sendEcho.music.gain, this._volumes.music);
    }
    return this;
  }

  setSfxVolume(v) {
    this._volumes.sfx = clamp(Number(v) || 0, 0, 1);
    if (this._sfxBus) this._smooth(this._sfxBus.gain, this._volumes.sfx);
    if (this._sendReverb && this._sendReverb.sfx) {
      this._smooth(this._sendReverb.sfx.gain, this._volumes.sfx);
    }
    if (this._sendEcho && this._sendEcho.sfx) {
      this._smooth(this._sendEcho.sfx.gain, this._volumes.sfx);
    }
    return this;
  }

  _smooth(param, value) {
    if (!this._ctx || !param) return;
    const now = this._ctx.currentTime;
    try {
      if (typeof param.cancelAndHoldAtTime === 'function') {
        param.cancelAndHoldAtTime(now);
      } else {
        const current = param.value;
        param.cancelScheduledValues(now);
        param.setValueAtTime(current, now);
      }
      param.linearRampToValueAtTime(value, now + 0.08);
    } catch (_) {
      try {
        param.value = value;
      } catch (__) {}
    }
  }

  // ---------------------------------------------------------------------------
  // Scene ambience
  // ---------------------------------------------------------------------------

  /**
   * Crossfade between the five island soundscapes.  If the context is not yet
   * unlocked the request is remembered and applied on the first gesture.
   */
  setScene(sceneId, options = {}) {
    const id = SCENE_IDS.indexOf(sceneId) >= 0 ? sceneId : 'hub';
    this._desiredScene = id;
    const immediate = !!(options && options.immediate);
    if (!this._ready || !this._running || !this._started) return this;
    this._applyScene(id, immediate);
    return this;
  }

  _applyScene(id, immediate) {
    if (!this._ctx) return;
    if (this._sceneId === id && this._scene) return;

    try {
      const now = this._ctx.currentTime;
      const fade = immediate ? 0.06 : 2.0;

      if (this._scene) this._retireBed(this._scene, fade);
      const bed = this._buildScene(id);
      bed.gain.gain.cancelScheduledValues(now);
      bed.gain.gain.setValueAtTime(0, now);
      bed.gain.gain.linearRampToValueAtTime(bed.level || 1, now + fade);

      this._scene = bed;
      this._sceneId = id;
      this._setupSceneEvents(id, now + fade * 0.5);
    } catch (err) {
      try {
        console.warn('[AudioSystem] scene failed:', id, err);
      } catch (_) {}
    }
  }

  _setupSceneEvents(id, startAt) {
    const defs = SCENE_EVENTS[id] || [];
    const now = this._ctx ? this._ctx.currentTime : startAt;
    this._sceneEvents = defs.map((d) => ({
      name: d[0],
      min: d[1],
      max: d[2],
      next: now + d[3] + Math.random() * Math.max(0.1, d[2] - d[1]),
    }));
  }

  _newBed(dest, wet, echo, group) {
    const ctx = this._ctx;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(dest);
    const nodes = [gain];
    const g = group || 'ambience';
    if (wet > 0 && this._reverbIn) {
      const send = ctx.createGain();
      send.gain.value = wet;
      gain.connect(send).connect((this._sendReverb && this._sendReverb[g]) || this._reverbIn);
      nodes.push(send);
    }
    if (echo > 0 && this._echoIn) {
      const send = ctx.createGain();
      send.gain.value = echo;
      gain.connect(send).connect((this._sendEcho && this._sendEcho[g]) || this._echoIn);
      nodes.push(send);
    }
    return { gain, nodes, sources: [] };
  }

  _buildScene(id) {
    const bed = this._newBed(this._ambienceBus, 0.38, 0, 'ambience');
    // A little per-island gain trim keeps the quiet wetland and bright atoll
    // from disappearing under the surf-heavy scenes.
    bed.level = id === 'hub' ? 1.6 : id === 'mangrove' ? 2.0 : id === 'atoll' ? 2.7 : id === 'cliffs' ? 1.2 : 1.25;

    switch (id) {
      case 'hub':
        // Golden-hour surf, warm air and a low sunset pad.
        this._layerNoise(bed, { kind: 'brown', filter: 'lowpass', filterFreq: 140, q: 0.7, gain: 0.05 });
        this._layerNoise(bed, {
          kind: 'pink', filter: 'lowpass', filterFreq: 520, q: 0.6, gain: 0.13,
          gainLfo: { rate: 0.07, depth: 0.035 },
        });
        this._layerNoise(bed, {
          kind: 'white', filter: 'bandpass', filterFreq: 1500, q: 0.8, gain: 0.02, pan: -0.3,
          gainLfo: { rate: 0.21, depth: 0.012 },
        });
        this._layerNoise(bed, {
          kind: 'white', filter: 'bandpass', filterFreq: 2700, q: 1.1, gain: 0.008, pan: 0.34,
          gainLfo: { rate: 0.17, depth: 0.006 },
        });
        this._layerNoise(bed, {
          kind: 'pink', filter: 'highpass', filterFreq: 2100, q: 0.5, gain: 0.012, pan: 0.1,
          filterLfo: { rate: 0.05, depth: 350 },
        });
        this._layerPad(bed, {
          notes: [38, 45, 50, 53], type: 'sawtooth', detune: 7, gain: 0.022,
          brightness: 520, q: 0.8, attack: 2.5,
          filterLfo: { rate: 0.035, depth: 170 },
        });
        break;

      case 'mangrove':
        // Mist, insect shimmer, a dark channel and a wooden flute bed.
        this._layerNoise(bed, {
          kind: 'pink', filter: 'lowpass', filterFreq: 320, q: 0.6, gain: 0.075,
          gainLfo: { rate: 0.09, depth: 0.018 },
        });
        this._layerNoise(bed, { kind: 'brown', filter: 'lowpass', filterFreq: 120, q: 0.7, gain: 0.035 });
        this._layerNoise(bed, {
          kind: 'white', filter: 'bandpass', filterFreq: 5400, q: 1.5, gain: 0.011, pan: -0.35,
          gainLfo: { rate: 6.3, depth: 0.007 },
        });
        this._layerNoise(bed, {
          kind: 'white', filter: 'bandpass', filterFreq: 7100, q: 1.2, gain: 0.007, pan: 0.4,
          gainLfo: { rate: 8.1, depth: 0.005 },
        });
        this._layerPad(bed, {
          notes: [38, 41, 45, 48], type: 'triangle', detune: 5, gain: 0.018,
          brightness: 620, q: 0.7, attack: 3,
          filterLfo: { rate: 0.04, depth: 120 },
        });
        this._layerTone(bed, {
          type: 'triangle', freq: midi(50), detune: -4, gain: 0.006,
          filter: 'lowpass', filterFreq: 700, q: 0.8,
          vibrato: 3, vibratoRate: 4.6, pan: -0.2,
        });
        break;

      case 'atoll':
        // Bright, shallow lagoon; sparse bells carry the air.
        this._layerNoise(bed, {
          kind: 'white', filter: 'bandpass', filterFreq: 1150, q: 0.7, gain: 0.045, pan: 0.1,
          gainLfo: { rate: 0.15, depth: 0.02 },
        });
        this._layerNoise(bed, { kind: 'pink', filter: 'lowpass', filterFreq: 2600, q: 0.5, gain: 0.022 });
        this._layerNoise(bed, {
          kind: 'pink', filter: 'bandpass', filterFreq: 520, q: 0.6, gain: 0.032,
          gainLfo: { rate: 0.08, depth: 0.014 },
        });
        this._layerPad(bed, {
          notes: [50, 57, 60, 67], type: 'triangle', detune: 4, gain: 0.016,
          brightness: 1600, q: 0.6, attack: 3.2,
          filterLfo: { rate: 0.03, depth: 260 },
        });
        this._layerTone(bed, {
          type: 'triangle', freq: midi(81), gain: 0.0035, pan: -0.45,
          filter: 'highpass', filterFreq: 1600, q: 0.5,
          gainLfo: { rate: 0.07, depth: 0.002 },
        });
        break;

      case 'cliffs':
        // Storm wind, heavy surf, rain and a low drone.
        this._layerNoise(bed, {
          kind: 'pink', filter: 'bandpass', filterFreq: 450, q: 0.4, gain: 0.15, pan: -0.1,
          gainLfo: { rate: 0.065, depth: 0.06 },
        });
        this._layerNoise(bed, {
          kind: 'white', filter: 'highpass', filterFreq: 950, q: 0.6, gain: 0.055, pan: 0.2,
          gainLfo: { rate: 0.045, depth: 0.04 },
        });
        this._layerNoise(bed, {
          kind: 'white', filter: 'bandpass', filterFreq: 780, q: 6, gain: 0.018, pan: -0.45,
          filterLfo: { rate: 0.04, depth: 320 },
        });
        this._layerNoise(bed, {
          kind: 'brown', filter: 'lowpass', filterFreq: 95, q: 0.8, gain: 0.07,
          gainLfo: { rate: 0.055, depth: 0.02 },
        });
        this._layerNoise(bed, {
          kind: 'white', filter: 'highpass', filterFreq: 3200, q: 0.4, gain: 0.03,
          gainLfo: { rate: 0.022, depth: 0.012 },
        });
        this._layerTone(bed, {
          type: 'sawtooth', freq: midi(26), detune: -5, gain: 0.035,
          filter: 'lowpass', filterFreq: 125, q: 1.2,
          filterLfo: { rate: 0.03, depth: 25 },
        });
        this._layerTone(bed, {
          type: 'triangle', freq: midi(33), detune: 4, gain: 0.018,
          filter: 'lowpass', filterFreq: 180, q: 0.8,
        });
        break;

      case 'volcano':
        // Ash wind, sub rumble, ember crackle and an ominous choir.
        this._layerNoise(bed, {
          kind: 'brown', filter: 'lowpass', filterFreq: 260, q: 0.7, gain: 0.13,
          gainLfo: { rate: 0.06, depth: 0.025 },
        });
        this._layerNoise(bed, {
          kind: 'brown', filter: 'lowpass', filterFreq: 55, q: 0.9, gain: 0.08,
          gainLfo: { rate: 0.09, depth: 0.02 },
        });
        this._layerNoise(bed, {
          kind: 'pink', filter: 'bandpass', filterFreq: 1100, q: 0.8, gain: 0.022, pan: 0.2,
          filterLfo: { rate: 0.03, depth: 450 },
        });
        this._layerPad(bed, {
          notes: [38, 50, 53, 56, 57], type: 'sawtooth', detune: 9, gain: 0.017,
          brightness: 640, q: 0.9, attack: 4,
          filterLfo: { rate: 0.025, depth: 180 },
        });
        this._layerTone(bed, {
          type: 'sine', freq: midi(26), gain: 0.026, filter: 'lowpass', filterFreq: 80, q: 0.8,
        });
        break;

      default:
        break;
    }

    return bed;
  }

  // ---------------------------------------------------------------------------
  // Scene layers
  // ---------------------------------------------------------------------------

  _layerNoise(bed, o = {}) {
    const ctx = this._ctx;
    if (!ctx || !bed) return;
    const now = ctx.currentTime;
    const buf = this._noiseBuffer(o.kind || 'pink');
    if (!buf) return;

    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;

    const nodes = [src];
    const sources = [src];
    let tail = src;

    let filter = null;
    if (o.filter) {
      filter = ctx.createBiquadFilter();
      filter.type = o.filter;
      filter.frequency.value = Math.max(20, o.filterFreq || 500);
      filter.Q.value = o.q == null ? 0.7 : o.q;
      tail.connect(filter);
      tail = filter;
      nodes.push(filter);
    }

    const gain = ctx.createGain();
    gain.gain.value = Math.max(0.0001, o.gain == null ? 0.03 : o.gain);
    tail.connect(gain);
    tail = gain;
    nodes.push(gain);

    if (o.pan) {
      const panner = this._panner(o.pan);
      gain.connect(panner);
      tail = panner;
      nodes.push(panner);
    }
    tail.connect(bed.gain);

    if (o.gainLfo) {
      const lfo = this._lfo(
        Math.max(0.005, o.gainLfo.rate || 0.1),
        Math.abs(o.gainLfo.depth == null ? 0.01 : o.gainLfo.depth),
        gain.gain
      );
      nodes.push(lfo.osc, lfo.gain);
      sources.push(lfo.osc);
    }
    if (o.filterLfo && filter) {
      const lfo = this._lfo(
        Math.max(0.005, o.filterLfo.rate || 0.1),
        Math.abs(o.filterLfo.depth == null ? 200 : o.filterLfo.depth),
        filter.frequency
      );
      nodes.push(lfo.osc, lfo.gain);
      sources.push(lfo.osc);
    }

    const duration = buf.duration || 1;
    const offset = o.offset == null ? Math.random() * Math.max(0.1, duration - 0.2) : o.offset;
    try {
      src.start(now, clamp(offset, 0, Math.max(0, duration - 0.01)));
    } catch (_) {
      try {
        src.start(now);
      } catch (__) {}
    }

    bed.nodes.push(...nodes);
    bed.sources.push(...sources);
  }

  _layerTone(bed, o = {}) {
    const ctx = this._ctx;
    if (!ctx || !bed) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.value = Math.max(1, o.freq || 110);
    if (o.detune) osc.detune.value = o.detune;

    const nodes = [osc];
    const sources = [osc];
    let tail = osc;

    if (o.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = o.filter;
      filter.frequency.value = Math.max(20, o.filterFreq || 600);
      filter.Q.value = o.q == null ? 0.7 : o.q;
      tail.connect(filter);
      tail = filter;
      nodes.push(filter);
      if (o.filterLfo) {
        const lfo = this._lfo(
          Math.max(0.005, o.filterLfo.rate || 0.05),
          Math.abs(o.filterLfo.depth == null ? 100 : o.filterLfo.depth),
          filter.frequency
        );
        nodes.push(lfo.osc, lfo.gain);
        sources.push(lfo.osc);
      }
    }

    const gain = ctx.createGain();
    gain.gain.value = 0;
    const base = Math.max(0.0001, o.gain == null ? 0.02 : o.gain);
    if (o.attack) {
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(base, now + o.attack);
    } else {
      gain.gain.value = base;
    }
    tail.connect(gain);
    tail = gain;
    nodes.push(gain);

    if (o.pan) {
      const panner = this._panner(o.pan);
      gain.connect(panner);
      tail = panner;
      nodes.push(panner);
    }
    tail.connect(bed.gain);

    if (o.gainLfo) {
      const lfo = this._lfo(
        Math.max(0.005, o.gainLfo.rate || 0.1),
        Math.abs(o.gainLfo.depth == null ? base * 0.3 : o.gainLfo.depth),
        gain.gain
      );
      nodes.push(lfo.osc, lfo.gain);
      sources.push(lfo.osc);
    }
    if (o.vibrato) {
      const lfo = this._lfo(Math.max(0.1, o.vibratoRate || 5), Math.abs(o.vibrato), osc.detune);
      nodes.push(lfo.osc, lfo.gain);
      sources.push(lfo.osc);
    }

    osc.start(now);
    bed.nodes.push(...nodes);
    bed.sources.push(...sources);
  }

  _layerPad(bed, o = {}) {
    const ctx = this._ctx;
    if (!ctx || !bed) return;
    const now = ctx.currentTime;
    const notes = o.notes && o.notes.length ? o.notes : [50, 53, 57];
    const voices = Math.max(1, o.voices || 2);
    const detune = o.detune == null ? 6 : o.detune;
    const peak = Math.max(0.0001, o.gain == null ? 0.02 : o.gain);
    const attack = Math.max(0.01, o.attack == null ? 2 : o.attack);
    const width = o.width == null ? 0.5 : o.width;

    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(40, o.brightness || 900);
    filter.Q.value = o.q == null ? 0.6 : o.q;
    filter.connect(gain);

    const nodes = [gain, filter];
    const sources = [];
    let tail = gain;

    if (o.pan) {
      const panner = this._panner(o.pan);
      gain.connect(panner);
      tail = panner;
      nodes.push(panner);
    }
    tail.connect(bed.gain);

    if (o.filterLfo) {
      const lfo = this._lfo(
        Math.max(0.005, o.filterLfo.rate || 0.04),
        Math.abs(o.filterLfo.depth == null ? 120 : o.filterLfo.depth),
        filter.frequency
      );
      nodes.push(lfo.osc, lfo.gain);
      sources.push(lfo.osc);
    }

    let vibratoLfo = null;
    if (o.vibrato) {
      vibratoLfo = this._lfo(Math.max(0.1, o.vibratoRate || 5), Math.abs(o.vibrato), null);
      nodes.push(vibratoLfo.osc, vibratoLfo.gain);
      sources.push(vibratoLfo.osc);
    }

    for (let n = 0; n < notes.length; n++) {
      const noteMix = ctx.createGain();
      noteMix.gain.value = 1 / voices;
      let noteTail = noteMix;
      if (notes.length > 1) {
        const spread = notes.length === 1 ? 0 : (n / (notes.length - 1)) * 2 - 1;
        const panner = this._panner(spread * width);
        noteMix.connect(panner);
        noteTail = panner;
        nodes.push(panner);
      }
      noteTail.connect(filter);
      nodes.push(noteMix);

      for (let v = 0; v < voices; v++) {
        const osc = ctx.createOscillator();
        osc.type = o.type || 'sawtooth';
        if (osc.type !== 'sine' && osc.type !== 'triangle' && osc.type !== 'sawtooth' && osc.type !== 'square') {
          osc.type = 'sawtooth';
        }
        osc.frequency.value = Math.max(1, midi(notes[n]));
        const offset = voices === 1 ? 0 : (v === 0 ? -detune : detune);
        osc.detune.value = offset;
        osc.connect(noteMix);
        try {
          osc.start(now);
        } catch (_) {}
        sources.push(osc);
        if (vibratoLfo) {
          try {
            vibratoLfo.gain.connect(osc.detune);
          } catch (_) {}
        }
      }
    }

    bed.nodes.push(...nodes);
    bed.sources.push(...sources);
  }

  _lfo(rate, depth, param, type) {
    const ctx = this._ctx;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = Math.max(0.001, rate);
    const gain = ctx.createGain();
    gain.gain.value = depth;
    osc.connect(gain);
    if (param) gain.connect(param);
    try {
      osc.start(ctx.currentTime);
    } catch (_) {}
    return { osc, gain };
  }

  // ---------------------------------------------------------------------------
  // Music beds and generative sequencer
  // ---------------------------------------------------------------------------

  setMusicMode(mode) {
    const id = MUSIC_MODES.indexOf(mode) >= 0 ? mode : 'explore';
    this._desiredMusic = id;
    if (!this._ready || !this._running || !this._started) return this;
    this._applyMusic(id);
    return this;
  }

  _applyMusic(mode) {
    if (!this._ctx) return;
    if (this._musicMode === mode && this._music && this._music.bed) return;

    try {
      const now = this._ctx.currentTime;
      if (this._music && this._music.bed) this._retireBed(this._music.bed, 1.8);

      const bed = this._buildMusicBed(mode);
      bed.gain.gain.cancelScheduledValues(now);
      bed.gain.gain.setValueAtTime(0, now);
      bed.gain.gain.linearRampToValueAtTime(bed.level || 1, now + 1.6);

      this._music = { mode, bed };
      this._musicMode = mode;
      this._stepDur = STEP_DURATION[mode] || 0.5;
      this._stepIndex = 0;
      this._nextStep = now + 0.08;
    } catch (err) {
      try {
        console.warn('[AudioSystem] music mode failed:', mode, err);
      } catch (_) {}
    }
  }

  _buildMusicBed(mode) {
    const wet = mode === 'boss' ? 0.28 : mode === 'title' || mode === 'ending' ? 0.4 : 0.34;
    const echo = mode === 'boss' ? 0.1 : mode === 'fishing' ? 0.05 : 0.14;
    const bed = this._newBed(this._musicBus, wet, echo, 'music');
    bed.level =
      mode === 'explore' ? 2.6 : mode === 'fishing' ? 2.6 : mode === 'title' || mode === 'ending' ? 2.2 : mode === 'boss' ? 1.25 : 1.0;

    switch (mode) {
      case 'title':
        this._layerTone(bed, {
          type: 'triangle', freq: midi(38), detune: -3, gain: 0.013,
          filter: 'lowpass', filterFreq: 380, q: 0.8,
          filterLfo: { rate: 0.03, depth: 60 },
        });
        this._layerTone(bed, {
          type: 'sine', freq: midi(45), detune: 3, gain: 0.009,
          filter: 'lowpass', filterFreq: 500, q: 0.7,
        });
        break;

      case 'ending':
        this._layerTone(bed, { type: 'triangle', freq: midi(38), gain: 0.016, filter: 'lowpass', filterFreq: 480, q: 0.8 });
        this._layerTone(bed, { type: 'sine', freq: midi(45), gain: 0.01 });
        this._layerTone(bed, { type: 'sine', freq: midi(53), gain: 0.006 });
        break;

      case 'boss':
        // Cinematic sub, a growling fifth and a distant high tension tone.
        this._layerTone(bed, {
          type: 'sine', freq: midi(26), gain: 0.045,
          filter: 'lowpass', filterFreq: 90, q: 0.9,
        });
        this._layerTone(bed, {
          type: 'sawtooth', freq: midi(38), detune: -7, gain: 0.012,
          filter: 'lowpass', filterFreq: 170, q: 1.4,
          filterLfo: { rate: 0.035, depth: 45 },
        });
        this._layerTone(bed, {
          type: 'triangle', freq: midi(45), gain: 0.007,
          filter: 'lowpass', filterFreq: 700, q: 0.6,
          vibrato: 4, vibratoRate: 3.2,
        });
        break;

      case 'fishing':
        this._layerTone(bed, { type: 'sine', freq: midi(38), gain: 0.009, filter: 'lowpass', filterFreq: 220, q: 0.8 });
        break;

      case 'explore':
      default:
        this._layerTone(bed, {
          type: 'triangle', freq: midi(38), detune: -4, gain: 0.012,
          filter: 'lowpass', filterFreq: 320, q: 0.7,
        });
        this._layerTone(bed, {
          type: 'sine', freq: midi(45), gain: 0.007, filter: 'lowpass', filterFreq: 500, q: 0.6,
        });
        break;
    }

    return bed;
  }

  _updateMusic(now) {
    const music = this._music;
    if (!music || !music.bed || !this._ctx) return;

    if (this._nextStep < now - 0.5) this._nextStep = now + 0.03;
    let guard = 0;
    while (this._nextStep < now + 0.2 && guard < 16) {
      const t = this._nextStep;
      const step = this._stepIndex;
      this._scheduleStep(t, step, music.bed);
      this._stepIndex++;
      if (this._stepIndex > 100000) this._stepIndex = 0;
      this._nextStep += this._stepDur;
      guard++;
    }
  }

  _scheduleStep(t, step, bed) {
    switch (this._musicMode) {
      case 'title':
        this._stepTitle(t, step, bed);
        break;
      case 'ending':
        this._stepEnding(t, step, bed);
        break;
      case 'boss':
        this._stepBoss(t, step, bed);
        break;
      case 'fishing':
        this._stepFishing(t, step, bed);
        break;
      case 'explore':
      default:
        this._stepExplore(t, step, bed);
        break;
    }
  }

  _stepTitle(t, step, bed) {
    if (step % 8 === 0) {
      const chord = TITLE_CHORDS[Math.floor(step / 8) % TITLE_CHORDS.length];
      this._pad(t, {
        notes: chord.notes, gain: 0.03, attack: 0.7, duration: 2.5, release: 2.4,
        brightness: 1200, q: 0.7, dest: bed.gain, bus: 'music',
      });
      this._pluck(t, {
        freq: midi(chord.root), gain: 0.036, duration: 2.1, brightness: 520,
        dest: bed.gain, bus: 'music',
      });
    }
    if (step % 32 === 0) this._themePhrase(t, bed, TITLE_MOTIF);
    else if (step % 32 === 16) this._themePhrase(t, bed, TITLE_ANSWER);
  }

  _stepEnding(t, step, bed) {
    if (step % 8 === 0) {
      const chord = TITLE_CHORDS[Math.floor(step / 8) % TITLE_CHORDS.length];
      this._pad(t, {
        notes: chord.notes, gain: 0.034, attack: 0.9, duration: 3, release: 2.8,
        brightness: 1500, q: 0.7, dest: bed.gain, bus: 'music',
      });
      this._pluck(t, {
        freq: midi(chord.root), gain: 0.034, duration: 2.6, brightness: 500,
        dest: bed.gain, bus: 'music',
      });
      if (step % 16 === 8) {
        this._bell(t, {
          freq: midi(81), gain: 0.018, duration: 2.4, pan: 0.35,
          partials: [1, 2, 3, 4.2], partialGains: [1, 0.4, 0.18, 0.08],
          dest: bed.gain, bus: 'music',
        });
      }
    }
    if (step % 32 === 0) this._themePhrase(t, bed, TITLE_MOTIF, true);
    else if (step % 32 === 16) this._themePhrase(t, bed, TITLE_ANSWER, true);
  }

  _themePhrase(t, bed, notes, warm) {
    const stepDur = this._stepDur;
    for (let i = 0; i < notes.length; i++) {
      const when = t + notes[i][0] * stepDur;
      const freq = midi(notes[i][1]);
      const last = i === notes.length - 1;
      this._bell(when, {
        freq, gain: warm ? 0.052 : 0.048,
        duration: last ? 2.8 : 1.8,
        pan: i % 2 ? 0.18 : -0.18,
        partials: [1, 2, 3, 4.2],
        partialGains: [1, 0.42, 0.18, 0.08],
        dest: bed.gain, bus: 'music',
      });
      this._pluck(when, {
        freq, gain: 0.02, duration: last ? 1.9 : 1.2, brightness: 2400,
        dest: bed.gain, bus: 'music',
      });
      if (last) {
        this._bell(when, {
          freq: freq * 2, gain: 0.018, duration: 2.2,
          pan: -0.25, partials: [1, 2], partialGains: [1, 0.3],
          dest: bed.gain, bus: 'music',
        });
      }
    }
  }

  _stepExplore(t, step, bed) {
    const bar = Math.floor(step / 8) % EXPLORE_CHORDS.length;
    const chord = EXPLORE_CHORDS[bar];

    if (step % 8 === 0) {
      this._pad(t, {
        notes: chord.notes, gain: 0.022, attack: 1.2, duration: 3.4, release: 2.6,
        brightness: 950, q: 0.6, dest: bed.gain, bus: 'music',
      });
      this._pluck(t, {
        freq: midi(chord.root), gain: 0.028, duration: 2.4, brightness: 420,
        dest: bed.gain, bus: 'music',
      });
    }

    if (step % 2 === 0 && step % 8 !== 0 && this._rand() < 0.34) {
      const m = PENTATONIC[Math.floor(this._rand() * PENTATONIC.length)] + (this._rand() < 0.28 ? 12 : 0);
      this._pluck(t + this._rrange(0, 0.03), {
        freq: midi(m), gain: 0.032 * this._rrange(0.75, 1),
        duration: this._rrange(0.9, 1.8), brightness: this._rrange(1500, 2800),
        pan: this._rrange(-0.4, 0.4), dest: bed.gain, bus: 'music',
      });
    }

    if (step % 16 === 8 && this._rand() < 0.5) {
      this._bell(t, {
        freq: midi(this._pick(HIGH_PENTA)), gain: 0.018,
        duration: 2.6, pan: this._rrange(-0.5, 0.5),
        partials: [1, 2.76, 5.4], partialGains: [1, 0.3, 0.12],
        dest: bed.gain, bus: 'music',
      });
    }
  }

  _stepFishing(t, step, bed) {
    if (step % 8 === 0) {
      const chord = EXPLORE_CHORDS[Math.floor(step / 8) % EXPLORE_CHORDS.length];
      this._pad(t, {
        notes: chord.notes.slice(0, 3), gain: 0.014, attack: 1.4, duration: 3.6, release: 3,
        brightness: 700, q: 0.6, dest: bed.gain, bus: 'music',
      });
    }

    // A sparse pulse: the sound of waiting, not a melody.
    if (step % 4 === 0) {
      this._tone(t, {
        type: 'sine', freq: midi(38), gain: 0.038, attack: 0.008, decay: 0.45,
        filter: 'lowpass', filterFreq: 260, q: 0.9,
        dest: bed.gain, bus: 'music',
      });
      this._tone(t + 0.02, {
        type: 'triangle', freq: midi(45), gain: 0.01, attack: 0.01, decay: 0.5,
        filter: 'lowpass', filterFreq: 380, q: 0.7,
        dest: bed.gain, bus: 'music',
      });
    }

    if (step % 8 === 4 && this._rand() < 0.4) {
      this._pluck(t, {
        freq: midi(this._pick(HIGH_PENTA)), gain: 0.016,
        duration: 1.2, brightness: 2200, pan: this._rrange(-0.3, 0.3),
        dest: bed.gain, bus: 'music',
      });
    }
  }

  _stepBoss(t, step, bed) {
    const cycle = step % 16;

    if (step % 16 === 0) {
      this._pad(t, {
        notes: [50, 53, 56, 60], gain: 0.021, attack: 1.3, duration: 3.5, release: 3,
        brightness: 700, q: 0.8, dest: bed.gain, bus: 'music',
      });
    }

    if (step % 64 === 0) {
      this._bell(t, {
        freq: midi(38), gain: 0.06, duration: 5.2, pan: -0.1,
        partials: [1, 1.48, 2.09, 2.56, 3.77],
        partialGains: [1, 0.55, 0.34, 0.2, 0.1],
        dest: bed.gain, bus: 'music',
      });
      this._noise(t, {
        kind: 'brown', gain: 0.05, attack: 0.008, decay: 1.2,
        filter: 'lowpass', filterFreq: 420, filterEnd: 110, q: 0.9,
        dest: bed.gain, bus: 'music',
      });
    }

    // Heartbeat under the taiko, on the off-bar.
    if (cycle === 4) this._heartbeat(t, bed);

    if (cycle === 0 || cycle === 8) this._taiko(t, bed, true, cycle === 8 ? 0.15 : -0.15);
    else if (cycle === 3 || cycle === 6 || cycle === 11 || cycle === 14) {
      this._taiko(t, bed, false, cycle % 2 ? 0.22 : -0.22);
    }

    // Low ostinato every eighth note.
    if (step % 2 === 0) {
      const n = BOSS_OSTINATO[(step / 2) % BOSS_OSTINATO.length];
      this._pluck(t, {
        freq: midi(n), gain: 0.028, duration: 0.38, brightness: 520,
        pan: step % 4 ? 0.16 : -0.16, dest: bed.gain, bus: 'music',
      });
    }

    // A high, vibrato-heavy line appears at the end of every second bar.
    if (step % 32 === 24) {
      const turn = Math.floor(step / 32) % 2;
      this._tone(t, {
        type: 'sawtooth', freq: midi(turn ? 75 : 74), gain: 0.013,
        attack: 0.45, decay: 1.8, filter: 'lowpass', filterFreq: 1600, filterEnd: 750, q: 1.2,
        vibrato: 7, vibratoRate: 5, pan: 0.38, dest: bed.gain, bus: 'music',
      });
    }

    // Cinematic air-raid style riser twice per phrase.
    if (step % 64 === 32) {
      this._riser(t, bed, 3.4, 0.038);
    }
  }

  _heartbeat(t, bed) {
    this._tone(t, {
      type: 'sine', freq: 66, freqEnd: 40, glide: 0.14, gain: 0.115,
      attack: 0.012, decay: 0.22, filter: 'lowpass', filterFreq: 120, q: 0.8,
      dest: bed.gain, bus: 'music',
    });
    this._tone(t + 0.19, {
      type: 'sine', freq: 58, freqEnd: 36, glide: 0.12, gain: 0.06,
      attack: 0.012, decay: 0.18, filter: 'lowpass', filterFreq: 110, q: 0.8,
      dest: bed.gain, bus: 'music',
    });
  }

  _taiko(t, bed, strong, pan) {
    const gain = strong ? 1 : 0.62;
    this._tone(t, {
      type: 'sine', freq: strong ? 112 : 92, freqEnd: strong ? 46 : 52, glide: 0.16,
      gain: 0.12 * gain, attack: 0.004, decay: strong ? 0.42 : 0.3,
      filter: 'lowpass', filterFreq: 260, q: 1.1,
      pan, dest: bed.gain, bus: 'music',
    });
    this._noise(t, {
      kind: 'pink', gain: 0.04 * gain, attack: 0.002, decay: strong ? 0.16 : 0.11,
      filter: 'lowpass', filterFreq: 700, filterEnd: 220, q: 0.8,
      pan, dest: bed.gain, bus: 'music',
    });
    this._noise(t, {
      kind: 'white', gain: 0.011 * gain, attack: 0.001, decay: 0.04,
      filter: 'bandpass', filterFreq: 2300, q: 2.2,
      pan: -pan, dest: bed.gain, bus: 'music',
    });
  }

  _riser(t, bed, duration, gain) {
    this._noise(t, {
      kind: 'white', gain, attack: duration * 0.82, decay: 0.5,
      filter: 'bandpass', filterFreq: 220, filterEnd: 3200, filterGlide: duration * 0.82, q: 1.4,
      pan: 0.1, dest: bed.gain, bus: 'music',
    });
    this._tone(t, {
      type: 'sawtooth', freq: midi(38), freqEnd: midi(50), glide: duration * 0.8,
      gain: gain * 0.22, attack: duration * 0.75, decay: 0.6,
      filter: 'lowpass', filterFreq: 300, filterEnd: 1100, filterGlide: duration * 0.75, q: 1.2,
      pan: -0.2, dest: bed.gain, bus: 'music',
    });
  }

  // ---------------------------------------------------------------------------
  // Fishing layer
  // ---------------------------------------------------------------------------

  startFishing() {
    this._wantFishing = true;
    if (!this._ready || !this._running || !this._started) return this;
    this._applyFishing();
    return this;
  }

  stopFishing() {
    this._wantFishing = false;
    if (!this._fishing) return this;
    const bed = this._fishing.bed;
    this._fishing = null;
    if (bed) this._retireBed(bed, 1.2);
    return this;
  }

  _applyFishing() {
    if (!this._ctx || !this._running || this._fishing) return;

    try {
      const ctx = this._ctx;
      const now = ctx.currentTime;
      const bed = this._newBed(this._fishingBus, 0.32, 0, 'sfx');

      // Water lapping around the hull.
      const lap = ctx.createGain();
      lap.gain.value = 0.045;
      const lapPanner = this._panner(-0.15);
      lap.connect(lapPanner).connect(bed.gain);
      bed.nodes.push(lap, lapPanner);

      const lapNoise = ctx.createBufferSource();
      lapNoise.buffer = this._noiseBuffer('white');
      lapNoise.loop = true;
      const lapFilter = ctx.createBiquadFilter();
      lapFilter.type = 'bandpass';
      lapFilter.frequency.value = 720;
      lapFilter.Q.value = 1;
      lapNoise.connect(lapFilter).connect(lap);
      const lapLfo = this._lfo(0.23, 0.022, lap.gain);
      lapNoise.start(now, Math.random() * 1.5);
      bed.nodes.push(lapNoise, lapFilter, lapLfo.osc, lapLfo.gain);
      bed.sources.push(lapNoise, lapLfo.osc);

      // Line-tension drone: a narrow resonant band that opens up as tension grows.
      const lineFilter = ctx.createBiquadFilter();
      lineFilter.type = 'bandpass';
      lineFilter.frequency.value = 260;
      lineFilter.Q.value = 1.5;
      const lineGain = ctx.createGain();
      lineGain.gain.value = 0.03;
      lineFilter.connect(lineGain).connect(bed.gain);
      bed.nodes.push(lineFilter, lineGain);

      const lineA = ctx.createOscillator();
      lineA.type = 'triangle';
      lineA.frequency.value = midi(38);
      lineA.detune.value = -5;
      lineA.connect(lineFilter);
      lineA.start(now);

      const lineB = ctx.createOscillator();
      lineB.type = 'sawtooth';
      lineB.frequency.value = midi(45);
      lineB.detune.value = 6;
      const lineBGain = ctx.createGain();
      lineBGain.gain.value = 0.35;
      lineB.connect(lineBGain).connect(lineFilter);
      lineB.start(now);
      bed.nodes.push(lineA, lineB, lineBGain);
      bed.sources.push(lineA, lineB);

      // A thin whine just before the line gives way.
      const whine = ctx.createOscillator();
      whine.type = 'triangle';
      whine.frequency.value = 540;
      const whineGain = ctx.createGain();
      whineGain.gain.value = 0.0001;
      const whineFilter = ctx.createBiquadFilter();
      whineFilter.type = 'bandpass';
      whineFilter.frequency.value = 900;
      whineFilter.Q.value = 3;
      whine.connect(whineFilter).connect(whineGain).connect(bed.gain);
      whine.start(now);
      bed.nodes.push(whine, whineGain, whineFilter);
      bed.sources.push(whine);

      bed.gain.gain.setValueAtTime(0, now);
      bed.gain.gain.linearRampToValueAtTime(1, now + 1.2);

      this._fishing = { bed, lap, lineFilter, lineGain, whine, whineGain };
      this._setFishingTension(this._tension, 0.04);
    } catch (err) {
      try {
        console.warn('[AudioSystem] fishing layer failed:', err);
      } catch (_) {}
    }
  }

  setTension(v) {
    this._tension = clamp(Number(v) || 0, 0, 1);
    this._setFishingTension(this._tension, 0.22);
    return this;
  }

  _setFishingTension(v, tc) {
    const f = this._fishing;
    if (!f || !this._ctx) return;
    const now = this._ctx.currentTime;
    const time = Math.max(0.02, tc || 0.2);
    try {
      f.lineFilter.frequency.setTargetAtTime(240 + v * 980, now, time);
      f.lineFilter.Q.setTargetAtTime(1.5 + v * 5.5, now, time);
      f.lineGain.gain.setTargetAtTime(0.026 + v * 0.06, now, time);
      f.whineGain.gain.setTargetAtTime(0.0001 + v * v * 0.028, now, time);
      f.whine.frequency.setTargetAtTime(500 + v * 840, now, time);
      f.lap.gain.setTargetAtTime(0.045 * (1 - v * 0.35), now, time);
    } catch (_) {}
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  update(dt) {
    if (!this._ctx || !this._ready || !this._running) return;
    const now = this._ctx.currentTime;
    const step = clamp(Number(dt) || 0, 0, 0.25);
    this._elapsed += step;

    // A very slow air movement over the ambience, updated at ~8 Hz.
    if (now - this._lastAir > 0.12) {
      this._lastAir = now;
      if (this._airGain) {
        const air = 1 + 0.04 * Math.sin(this._elapsed * 0.37) + 0.022 * Math.sin(this._elapsed * 0.13 + 1.3);
        try {
          this._airGain.gain.setTargetAtTime(air, now, 0.55);
        } catch (_) {}
      }
    }

    this._updateMusic(now);
    this._updateSceneEvents(now);
  }

  _updateSceneEvents(now) {
    if (!this._ctx || !this._sceneEvents.length) return;
    for (let i = 0; i < this._sceneEvents.length; i++) {
      const ev = this._sceneEvents[i];
      if (now >= ev.next) {
        this._emitSceneEvent(ev.name, now + 0.02);
        ev.next = now + Math.max(ev.min, ev.min + Math.random() * (ev.max - ev.min));
      }
    }
  }

  _emitSceneEvent(name, t) {
    switch (name) {
      case 'gull':
        this._gull(t);
        break;
      case 'insect':
        this._insect(t);
        break;
      case 'drip':
        this._drip(t);
        break;
      case 'flute':
        this._flute(t);
        break;
      case 'bell':
        this._atollBell(t);
        break;
      case 'thunder':
        this._thunder(t);
        break;
      case 'ember':
        this._ember(t);
        break;
      case 'rumble':
        this._volcanoRumble(t);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------
  // Ambient event voices
  // ---------------------------------------------------------------------------

  _gull(t) {
    const pan = this._rrange(-0.65, 0.65);
    const base = this._rrange(1280, 1720);
    this._tone(t, {
      type: 'triangle', freq: base, freqEnd: base * 0.68, glide: 0.3,
      gain: 0.022, attack: 0.02, decay: 0.42,
      filter: 'bandpass', filterFreq: 1900, q: 2.2,
      vibrato: 22, vibratoRate: 13, pan, reverb: 0.8, echo: 0.1, bus: 'ambience',
    });
    this._tone(t + 0.3, {
      type: 'triangle', freq: base * 0.92, freqEnd: base * 0.6, glide: 0.26,
      gain: 0.013, attack: 0.02, decay: 0.36,
      filter: 'bandpass', filterFreq: 1700, q: 2,
      vibrato: 18, vibratoRate: 12, pan: clamp(pan + 0.15, -1, 1), reverb: 0.85, bus: 'ambience',
    });
    this._noise(t, {
      kind: 'white', gain: 0.006, attack: 0.04, decay: 0.35,
      filter: 'bandpass', filterFreq: 2600, q: 1.2, pan, reverb: 0.8, bus: 'ambience',
    });
  }

  _insect(t) {
    const pan = this._rrange(-0.7, 0.7);
    const base = this._rrange(4300, 6500);
    for (let i = 0; i < 3; i++) {
      this._tone(t + i * 0.055, {
        type: 'sine', freq: base * this._rrange(0.98, 1.03), gain: 0.009,
        attack: 0.004, decay: 0.03,
        pan, reverb: 0.25, bus: 'ambience',
      });
    }
  }

  _drip(t) {
    const pan = this._rrange(-0.55, 0.55);
    const base = this._rrange(900, 1500);
    this._tone(t, {
      type: 'sine', freq: base, freqEnd: base * 0.45, glide: 0.1,
      gain: 0.045, attack: 0.002, decay: 0.22,
      filter: 'highpass', filterFreq: 400, q: 0.6,
      pan, reverb: 0.75, echo: 0.1, bus: 'ambience',
    });
    this._noise(t, {
      kind: 'white', gain: 0.008, attack: 0.001, decay: 0.05,
      filter: 'bandpass', filterFreq: 3200, q: 1.6, pan, reverb: 0.5, bus: 'ambience',
    });
  }

  _flute(t) {
    const notes = [50, 53, 55, 57, 60];
    const first = this._pick(notes);
    const second = this._pick(notes);
    const pan = -0.15;
    const phrase = [
      [0, first, 1.6],
      [1.4, second, 2],
    ];
    for (let i = 0; i < phrase.length; i++) {
      const when = t + phrase[i][0];
      const freq = midi(phrase[i][1]);
      this._tone(when, {
        type: 'triangle', freq, gain: 0.035, attack: 0.18, decay: phrase[i][2],
        filter: 'lowpass', filterFreq: 1150, q: 0.8,
        vibrato: 9, vibratoRate: 4.8, pan, reverb: 0.8, echo: 0.15, bus: 'ambience',
      });
      this._noise(when, {
        kind: 'pink', gain: 0.008, attack: 0.22, decay: phrase[i][2] * 0.7,
        filter: 'bandpass', filterFreq: 1900, q: 1, pan: pan + 0.1, reverb: 0.6, bus: 'ambience',
      });
    }
  }

  _atollBell(t) {
    const note = this._pick(HIGH_PENTA);
    this._bell(t, {
      freq: midi(note) * this._rrange(0.995, 1.005), gain: 0.038,
      duration: 3.6, pan: this._rrange(-0.65, 0.65),
      partials: [1, 2.76, 5.4, 8.9], partialGains: [1, 0.36, 0.16, 0.07],
      reverb: 0.85, echo: 0.22, bus: 'ambience',
    });
    if (this._rand() < 0.4) {
      this._bell(t + this._rrange(0.35, 0.8), {
        freq: midi(this._pick(HIGH_PENTA)) * 0.5, gain: 0.014,
        duration: 2.6, pan: this._rrange(-0.5, 0.5),
        partials: [1, 2.01, 3.9], partialGains: [1, 0.3, 0.12],
        reverb: 0.85, bus: 'ambience',
      });
    }
  }

  _thunder(t) {
    const pan = this._rrange(-0.4, 0.4);
    this._noise(t, {
      kind: 'brown', gain: 0.17, attack: 0.18, decay: 2.8,
      filter: 'lowpass', filterFreq: 240, filterEnd: 95, q: 0.8,
      pan, reverb: 0.65, bus: 'ambience',
    });
    this._noise(t + 0.05, {
      kind: 'white', gain: 0.04, attack: 0.01, decay: 0.35,
      filter: 'highpass', filterFreq: 700, q: 0.7,
      pan: pan + 0.12, reverb: 0.7, bus: 'ambience',
    });
    this._noise(t + 0.75, {
      kind: 'brown', gain: 0.08, attack: 0.3, decay: 1.8,
      filter: 'lowpass', filterFreq: 160, filterEnd: 80, q: 0.9,
      pan: -pan, reverb: 0.7, bus: 'ambience',
    });
  }

  _ember(t) {
    const pan = this._rrange(-0.85, 0.85);
    const freq = this._rrange(1800, 5200);
    const bursts = this._rand() < 0.4 ? 2 : 1;
    for (let i = 0; i < bursts; i++) {
      const when = t + i * this._rrange(0.015, 0.05);
      this._noise(when, {
        kind: 'white', gain: this._rrange(0.014, 0.028),
        attack: 0.001, decay: this._rrange(0.015, 0.06),
        filter: 'bandpass', filterFreq: freq * this._rrange(0.85, 1.15), q: 2.4,
        pan, reverb: 0.25, bus: 'ambience',
      });
    }
  }

  _volcanoRumble(t) {
    this._tone(t, {
      type: 'sine', freq: 36, freqEnd: 28, glide: 2.4,
      gain: 0.075, attack: 0.5, decay: 2.6,
      filter: 'lowpass', filterFreq: 70, q: 0.9,
      pan: this._rrange(-0.2, 0.2), reverb: 0.4, bus: 'ambience',
    });
    this._noise(t, {
      kind: 'brown', gain: 0.07, attack: 0.6, decay: 2.2,
      filter: 'lowpass', filterFreq: 85, filterEnd: 55, q: 0.8,
      pan: 0, reverb: 0.5, bus: 'ambience',
    });
  }

  // ---------------------------------------------------------------------------
  // One-shots
  // ---------------------------------------------------------------------------

  /**
   * Fire a procedural one-shot.  Returns false if the context is not unlocked
   * or the name is unknown.  Unknown names are ignored rather than thrown.
   */
  play(name, opts = {}) {
    if (!this._ctx || !this._ready || !this._running || this._ctx.state !== 'running') return false;
    const o = opts || {};
    const gaps = {
      uiHover: 0.025,
      uiClick: 0.02,
      footstep: 0.055,
      reelTick: 0.03,
      dialogue: 0.04,
      bossHit: 0.025,
      questStep: 0.06,
    };
    const gap = gaps[name];
    if (gap && !this._rateOk(name, gap)) return false;

    const t = this._ctx.currentTime + 0.005;

    try {
      switch (name) {
        case 'cast':
          this._sfxCast(t, o);
          break;
        case 'splash':
          this._sfxSplash(t, o);
          break;
        case 'bite':
          this._sfxBite(t, o);
          break;
        case 'hookset':
          this._sfxHookset(t, o);
          break;
        case 'reelTick':
          this._sfxReelTick(t, o);
          break;
        case 'lineSnap':
          this._sfxLineSnap(t, o);
          break;
        case 'fishLand':
          this._sfxFishLand(t, o);
          break;
        case 'uiHover':
          this._sfxUiHover(t, o);
          break;
        case 'uiClick':
          this._sfxUiClick(t, o);
          break;
        case 'uiOpen':
          this._sfxUiOpen(t, o);
          break;
        case 'uiClose':
          this._sfxUiClose(t, o);
          break;
        case 'questComplete':
          this._sfxQuestComplete(t, o);
          break;
        case 'questStep':
          this._sfxQuestStep(t, o);
          break;
        case 'levelUp':
          this._sfxLevelUp(t, o);
          break;
        case 'buy':
          this._sfxCoin(t, o, true);
          break;
        case 'sell':
          this._sfxCoin(t, o, false);
          break;
        case 'pickup':
          this._sfxPickup(t, o);
          break;
        case 'footstep':
          this._sfxFootstep(t, o);
          break;
        case 'dialogue':
          this._sfxDialogue(t, o);
          break;
        case 'bossRoar':
          this._sfxBossRoar(t, o);
          break;
        case 'bossHit':
          this._sfxBossHit(t, o);
          break;
        case 'bossFail':
          this._sfxBossFail(t, o);
          break;
        case 'bossWin':
          this._sfxBossWin(t, o);
          break;
        case 'shimmer':
          this._shimmer(t, { gain: this._vol(o) * 0.09, bus: 'sfx' });
          break;
        case 'chapter':
          this._sfxChapter(t, o);
          break;
        default:
          return false;
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  _rateOk(name, gap) {
    const now = this._ctx ? this._ctx.currentTime : 0;
    const last = this._lastPlay[name];
    if (last != null && now - last < gap) return false;
    this._lastPlay[name] = now;
    return true;
  }

  _sfxCast(t, o) {
    const charge = clamp(o.charge == null ? 0.5 : Number(o.charge) || 0, 0, 1);
    const vol = this._vol(o) * (0.6 + charge * 0.65);
    const pan = this._panOf(o);
    this._noise(t, {
      kind: 'white', gain: 0.18 * vol, attack: 0.07, decay: 0.3,
      filter: 'bandpass', filterFreq: 420, filterEnd: 2500, q: 1.1,
      pan: pan - 0.08, reverb: 0.35, echo: 0.1,
    });
    this._tone(t + 0.02, {
      type: 'triangle', freq: 620, freqEnd: 1480, glide: 0.22,
      gain: 0.024 * vol, attack: 0.03, decay: 0.26,
      filter: 'bandpass', filterFreq: 1600, q: 2.2, pan, reverb: 0.3,
    });
    this._noise(t + 0.3, {
      kind: 'white', gain: 0.06 * vol, attack: 0.004, decay: 0.16,
      filter: 'lowpass', filterFreq: 900, filterEnd: 400, q: 0.8,
      pan: pan + 0.12, reverb: 0.45,
    });
  }

  _sfxSplash(t, o) {
    const power = clamp(o.power == null ? 0.6 : Number(o.power) || 0, 0, 1);
    const vol = this._vol(o) * (0.65 + power * 0.6);
    const pan = this._panOf(o);
    this._noise(t, {
      kind: 'white', gain: 0.14 * vol, attack: 0.004, decay: 0.4,
      filter: 'lowpass', filterFreq: 3200, filterEnd: 420, q: 0.9,
      pan, reverb: 0.45,
    });
    this._noise(t + 0.02, {
      kind: 'pink', gain: 0.06 * vol, attack: 0.01, decay: 0.5,
      filter: 'bandpass', filterFreq: 1400, filterEnd: 700, q: 0.8,
      pan: clamp(pan + 0.18, -1, 1), reverb: 0.5,
    });
    for (let i = 0; i < 3; i++) {
      const f = this._rrange(900, 1700);
      this._tone(t + 0.08 + this._rand() * 0.3, {
        type: 'sine', freq: f, freqEnd: f * 0.45, glide: 0.12,
        gain: 0.013 * vol, attack: 0.003, decay: 0.18,
        filter: 'highpass', filterFreq: 500, q: 0.5,
        pan: this._rrange(-0.5, 0.5), reverb: 0.55,
      });
    }
  }

  _sfxBite(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    this._tone(t, {
      type: 'triangle', freq: 170, freqEnd: 78, glide: 0.1,
      gain: 0.12 * vol, attack: 0.003, decay: 0.2,
      filter: 'lowpass', filterFreq: 600, q: 1.1, pan, reverb: 0.2,
    });
    this._noise(t, {
      kind: 'white', gain: 0.03 * vol, attack: 0.001, decay: 0.05,
      filter: 'bandpass', filterFreq: 2200, q: 1.8, pan: pan - 0.1, reverb: 0.25,
    });
  }

  _sfxHookset(t, o) {
    const vol = this._vol(o) * (o.soft ? 0.55 : 1);
    const pan = this._panOf(o);
    this._noise(t, {
      kind: 'white', gain: 0.075 * vol, attack: 0.001, decay: 0.09,
      filter: 'highpass', filterFreq: 1200, q: 0.6, pan, reverb: 0.25,
    });
    this._tone(t, {
      type: 'square', freq: 900, freqEnd: 280, glide: 0.12,
      gain: 0.02 * vol, attack: 0.001, decay: 0.14,
      filter: 'bandpass', filterFreq: 1500, q: 2.6, pan, reverb: 0.2,
    });
    this._tone(t, {
      type: 'sine', freq: 120, freqEnd: 58, glide: 0.12,
      gain: 0.11 * vol, attack: 0.002, decay: 0.24,
      filter: 'lowpass', filterFreq: 300, q: 0.9, pan, reverb: 0.18,
    });
  }

  _sfxReelTick(t, o) {
    let tension = Number(o.tension);
    if (!Number.isFinite(tension)) tension = 0.5;
    else if (tension > 1) tension /= 100;
    tension = clamp(tension, 0, 1);
    const vol = this._vol(o) * (0.8 + tension * 0.35);
    const pan = this._panOf(o) + this._rrange(-0.12, 0.12);
    const p =
      (o.pitch ? clamp(Number(o.pitch) || 1, 0.5, 2) : 1) *
      (0.9 + tension * 0.25) *
      this._rrange(0.92, 1.08);
    this._noise(t, {
      kind: 'white', gain: 0.34 * vol, attack: 0.001, decay: 0.028,
      filter: 'bandpass', filterFreq: 2600 * p, q: 6,
      pan, reverb: 0.08,
    });
    this._tone(t, {
      type: 'triangle', freq: 1800 * p, freqEnd: 1180 * p, glide: 0.02,
      gain: 0.05 * vol, attack: 0.001, decay: 0.035,
      filter: 'highpass', filterFreq: 900, q: 0.7, pan, reverb: 0.08,
    });
  }

  _sfxLineSnap(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    this._noise(t, {
      kind: 'white', gain: 0.11 * vol, attack: 0.001, decay: 0.06,
      filter: 'highpass', filterFreq: 1400, q: 0.7, pan, reverb: 0.3,
    });
    this._tone(t, {
      type: 'sawtooth', freq: 430, freqEnd: 88, glide: 0.38,
      gain: 0.045 * vol, attack: 0.002, decay: 0.42,
      filter: 'lowpass', filterFreq: 1800, filterEnd: 350, q: 1.4,
      pan, reverb: 0.35,
    });
    this._noise(t + 0.02, {
      kind: 'pink', gain: 0.04 * vol, attack: 0.005, decay: 0.3,
      filter: 'bandpass', filterFreq: 800, q: 1.8,
      pan: pan + 0.15, reverb: 0.3,
    });
  }

  _sfxFishLand(t, o) {
    const vol = this._vol(o);
    this._tone(t, {
      type: 'sine', freq: 110, freqEnd: 52, glide: 0.18,
      gain: 0.16 * vol, attack: 0.003, decay: 0.3,
      filter: 'lowpass', filterFreq: 320, q: 0.9, pan: 0, reverb: 0.3,
    });
    this._sfxSplash(t + 0.02, { volume: vol * 0.6, pan: this._panOf(o) });
    this._bell(t + 0.06, {
      freq: midi(74), gain: 0.022 * vol, duration: 1.4,
      partials: [1, 2, 3.9], partialGains: [1, 0.35, 0.14],
      pan: 0.2, reverb: 0.6, echo: 0.15,
    });
  }

  _sfxUiHover(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o) + this._rrange(-0.1, 0.1);
    this._noise(t, {
      kind: 'white', gain: 0.12 * vol, attack: 0.002, decay: 0.045,
      filter: 'bandpass', filterFreq: 2400 + this._rrange(-300, 500), q: 1.3,
      pan, reverb: 0.06,
    });
    this._noise(t, {
      kind: 'pink', gain: 0.05 * vol, attack: 0.002, decay: 0.07,
      filter: 'highpass', filterFreq: 4200, q: 0.6,
      pan: clamp(pan + 0.12, -1, 1), reverb: 0.1,
    });
  }

  _sfxUiClick(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    this._noise(t, {
      kind: 'white', gain: 0.12 * vol, attack: 0.001, decay: 0.035,
      filter: 'bandpass', filterFreq: 1500, q: 1.4, pan, reverb: 0.08,
    });
    this._noise(t, {
      kind: 'pink', gain: 0.064 * vol, attack: 0.001, decay: 0.05,
      filter: 'lowpass', filterFreq: 650, filterEnd: 300, q: 0.7, pan, reverb: 0.05,
    });
    this._tone(t, {
      type: 'sine', freq: 155, freqEnd: 92, glide: 0.05,
      gain: 0.096 * vol, attack: 0.002, decay: 0.09,
      filter: 'lowpass', filterFreq: 300, q: 0.7, pan,
    });
  }

  _sfxUiOpen(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    this._noise(t, {
      kind: 'white', gain: 0.24 * vol, attack: 0.02, decay: 0.24,
      filter: 'bandpass', filterFreq: 900, filterEnd: 3300, q: 1.6,
      pan, reverb: 0.25,
    });
    this._noise(t + 0.035, {
      kind: 'pink', gain: 0.13 * vol, attack: 0.03, decay: 0.32,
      filter: 'highpass', filterFreq: 2000, q: 0.5,
      pan: clamp(pan + 0.2, -1, 1), reverb: 0.35,
    });
  }

  _sfxUiClose(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    this._noise(t, {
      kind: 'white', gain: 0.18 * vol, attack: 0.01, decay: 0.2,
      filter: 'bandpass', filterFreq: 3200, filterEnd: 700, q: 1.5,
      pan, reverb: 0.2,
    });
    this._noise(t + 0.03, {
      kind: 'pink', gain: 0.10 * vol, attack: 0.02, decay: 0.25,
      filter: 'lowpass', filterFreq: 900, filterEnd: 350, q: 0.6,
      pan: pan - 0.1, reverb: 0.15,
    });
  }

  _sfxQuestComplete(t, o) {
    const vol = this._vol(o);
    const notes = [62, 65, 69, 74];
    for (let i = 0; i < notes.length; i++) {
      const when = t + i * 0.11;
      this._bell(when, {
        freq: midi(notes[i]), gain: 0.042 * vol, duration: 2.3,
        pan: i % 2 ? 0.22 : -0.22,
        partials: [1, 2.01, 3, 4.2], partialGains: [1, 0.45, 0.2, 0.09],
        reverb: 0.55, echo: 0.18,
      });
      this._pluck(when, {
        freq: midi(notes[i]), gain: 0.018 * vol, duration: 1.1,
        brightness: 2400, pan: i % 2 ? 0.2 : -0.2, reverb: 0.3,
      });
    }
    this._pad(t + 0.1, {
      notes: [50, 53, 57, 62], gain: 0.016 * vol,
      attack: 0.5, duration: 1.6, release: 2.2, brightness: 1400,
      reverb: 0.55, bus: 'sfx',
    });
    this._shimmer(t + 0.48, { gain: 0.022 * vol });
  }

  _sfxQuestStep(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    this._noise(t, {
      kind: 'white', gain: 0.08 * vol, attack: 0.001, decay: 0.05,
      filter: 'bandpass', filterFreq: 2000, q: 2, pan, reverb: 0.15,
    });
    this._bell(t, {
      freq: midi(81), gain: 0.04 * vol, duration: 0.7, pan: pan - 0.08,
      partials: [1, 2.01, 3], partialGains: [1, 0.3, 0.12],
      reverb: 0.4, echo: 0.12,
    });
  }

  _sfxLevelUp(t, o) {
    const vol = this._vol(o);
    const notes = [62, 67, 69, 72, 74];
    for (let i = 0; i < notes.length; i++) {
      const when = t + i * 0.085;
      this._bell(when, {
        freq: midi(notes[i]), gain: 0.042 * vol, duration: 1.9,
        pan: this._rrange(-0.35, 0.35),
        partials: [1, 2.01, 3, 4.2], partialGains: [1, 0.4, 0.18, 0.08],
        reverb: 0.55, echo: 0.2,
      });
    }
    this._noise(t, {
      kind: 'white', gain: 0.026 * vol, attack: 0.18, decay: 0.35,
      filter: 'bandpass', filterFreq: 800, filterEnd: 3600, q: 1.2,
      reverb: 0.4,
    });
    this._shimmer(t + 0.4, { gain: 0.026 * vol });
  }

  _sfxCoin(t, o, up) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    const notes = up ? [84, 91] : [91, 84];
    const strength = 1;
    for (let i = 0; i < 2; i++) {
      const when = t + i * 0.075;
      this._bell(when, {
        freq: midi(notes[i]), gain: 0.054 * strength * vol, duration: 0.75,
        pan: clamp(pan + (i ? 0.12 : -0.05), -1, 1),
        partials: [1, 2.4, 4.7], partialGains: [1, 0.32, 0.12],
        reverb: 0.3, echo: 0.12,
      });
      this._noise(when, {
        kind: 'white', gain: 0.025 * strength * vol, attack: 0.001, decay: 0.045,
        filter: 'bandpass', filterFreq: midi(notes[i]) * 2, q: 4,
        pan, reverb: 0.2,
      });
    }
  }

  _sfxPickup(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    const note = this._pick(PENTATONIC.map((n) => n + 12));
    this._pluck(t, {
      freq: midi(note), gain: 0.08 * vol, duration: 0.9, brightness: 2800,
      pan, reverb: 0.35, echo: 0.12,
    });
    this._noise(t, {
      kind: 'white', gain: 0.024 * vol, attack: 0.001, decay: 0.06,
      filter: 'bandpass', filterFreq: 3000, q: 1.2, pan, reverb: 0.3,
    });
    this._shimmer(t + 0.06, { gain: 0.024 * vol, bus: 'sfx' });
  }

  _sfxFootstep(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o) + this._rrange(-0.18, 0.18);
    const surface = o.surface || 'sand';
    const v = vol * this._rrange(0.82, 1.05);

    if (surface === 'wood') {
      this._noise(t, {
        kind: 'white', gain: 0.126 * v, attack: 0.002, decay: 0.07,
        filter: 'bandpass', filterFreq: 300, q: 2.6, pan, reverb: 0.12,
      });
      this._tone(t, {
        type: 'triangle', freq: 190, freqEnd: 118, glide: 0.06,
        gain: 0.11 * v, attack: 0.002, decay: 0.13,
        filter: 'lowpass', filterFreq: 520, q: 1.2, pan, reverb: 0.1,
      });
      this._noise(t + 0.01, {
        kind: 'white', gain: 0.044 * v, attack: 0.001, decay: 0.035,
        filter: 'bandpass', filterFreq: 2400, q: 1.4, pan: pan - 0.1, reverb: 0.1,
      });
    } else if (surface === 'rock') {
      this._noise(t, {
        kind: 'white', gain: 0.078 * v, attack: 0.001, decay: 0.06,
        filter: 'highpass', filterFreq: 950, q: 0.7, pan, reverb: 0.15,
      });
      this._noise(t, {
        kind: 'pink', gain: 0.045 * v, attack: 0.001, decay: 0.05,
        filter: 'bandpass', filterFreq: 2300, q: 2.2, pan, reverb: 0.12,
      });
      this._tone(t, {
        type: 'triangle', freq: 100, freqEnd: 62, glide: 0.08,
        gain: 0.042 * v, attack: 0.002, decay: 0.1,
        filter: 'lowpass', filterFreq: 260, q: 0.8, pan, reverb: 0.1,
      });
    } else {
      this._noise(t, {
        kind: 'pink', gain: 0.12 * v, attack: 0.004, decay: 0.12,
        filter: 'lowpass', filterFreq: 1600, filterEnd: 520, q: 0.6,
        pan, reverb: 0.08,
      });
      this._tone(t, {
        type: 'sine', freq: 108, freqEnd: 70, glide: 0.08,
        gain: 0.058 * v, attack: 0.004, decay: 0.13,
        filter: 'lowpass', filterFreq: 240, q: 0.7, pan, reverb: 0.08,
      });
    }
  }

  _sfxDialogue(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o) + this._rrange(-0.08, 0.08);
    const pitch = this._speakerPitch(o.speaker) * (o.pitch ? clamp(Number(o.pitch) || 1, 0.4, 2.2) : 1);
    const base = 168 * pitch;
    this._tone(t, {
      type: 'triangle', freq: base, freqEnd: base * 0.93, glide: 0.05,
      gain: 0.62 * vol, attack: 0.004, decay: 0.075,
      filter: 'bandpass', filterFreq: 850 * pitch, q: 1.6,
      pan, reverb: 0.12,
    });
    this._noise(t, {
      kind: 'white', gain: 0.135 * vol, attack: 0.003, decay: 0.05,
      filter: 'bandpass', filterFreq: 1500 * pitch, q: 1.3,
      pan, reverb: 0.1,
    });
  }

  _speakerPitch(speaker) {
    if (speaker == null) return 1;
    if (typeof speaker === 'number') return clamp(speaker, 0.4, 2.2);
    const known = {
      shen: 0.8,
      alan: 1.05,
      linman: 0.92,
      laotao: 0.72,
      ache: 1.22,
      huoxiao: 0.86,
      hanzhao: 0.68,
    };
    if (typeof speaker === 'string') {
      if (known[speaker] != null) return known[speaker];
      let h = 0;
      for (let i = 0; i < speaker.length; i++) h = (h * 31 + speaker.charCodeAt(i)) | 0;
      return 0.8 + (Math.abs(h) % 40) / 100;
    }
    return 1;
  }

  _sfxBossRoar(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    this._tone(t, {
      type: 'sine', freq: 82, freqEnd: 30, glide: 1.5,
      gain: 0.2 * vol, attack: 0.07, decay: 1.7,
      filter: 'lowpass', filterFreq: 180, q: 1.1,
      vibrato: 45, vibratoRate: 8, pan, reverb: 0.35,
    });
    this._tone(t + 0.03, {
      type: 'sawtooth', freq: 112, freqEnd: 44, glide: 1.25,
      gain: 0.1 * vol, attack: 0.09, decay: 1.5,
      filter: 'lowpass', filterFreq: 620, filterEnd: 170, q: 2,
      vibrato: 55, vibratoRate: 9, pan: pan - 0.15, reverb: 0.45,
    });
    this._noise(t, {
      kind: 'brown', gain: 0.15 * vol, attack: 0.12, decay: 1.6,
      filter: 'lowpass', filterFreq: 420, filterEnd: 120, q: 0.9,
      pan, reverb: 0.5,
    });
    this._tone(t + 0.65, {
      type: 'sawtooth', freq: 74, freqEnd: 34, glide: 1,
      gain: 0.05 * vol, attack: 0.15, decay: 1.2,
      filter: 'lowpass', filterFreq: 380, filterEnd: 120, q: 1.4,
      pan: -pan, reverb: 0.45,
    });
  }

  _sfxBossHit(t, o) {
    const vol = this._vol(o) * (o.soft ? 0.55 : 1);
    const pan = this._panOf(o);
    this._tone(t, {
      type: 'sine', freq: 92, freqEnd: 44, glide: 0.15,
      gain: 0.2 * vol, attack: 0.002, decay: 0.26,
      filter: 'lowpass', filterFreq: 240, q: 0.9, pan, reverb: 0.25,
    });
    this._noise(t, {
      kind: 'white', gain: 0.055 * vol, attack: 0.001, decay: 0.12,
      filter: 'bandpass', filterFreq: 1900, filterEnd: 650, q: 1.4,
      pan: pan + 0.1, reverb: 0.3,
    });
    this._tone(t, {
      type: 'triangle', freq: 760, freqEnd: 330, glide: 0.1,
      gain: 0.026 * vol, attack: 0.001, decay: 0.18,
      filter: 'highpass', filterFreq: 500, q: 0.6, pan: -pan, reverb: 0.35,
    });
  }

  _sfxBossFail(t, o) {
    const vol = this._vol(o);
    const pan = this._panOf(o);
    const notes = [50, 53, 56];
    for (let i = 0; i < notes.length; i++) {
      const f = midi(notes[i]);
      this._tone(t + i * 0.045, {
        type: 'sawtooth', freq: f, freqEnd: f * 0.72, glide: 1.9,
        gain: 0.038 * vol, attack: 0.06, decay: 2.1,
        filter: 'lowpass', filterFreq: 700, filterEnd: 120, q: 1.5,
        pan: pan + (i - 1) * 0.2, reverb: 0.5,
      });
    }
    this._tone(t, {
      type: 'sine', freq: 54, freqEnd: 28, glide: 1.8,
      gain: 0.14 * vol, attack: 0.02, decay: 2.2,
      filter: 'lowpass', filterFreq: 110, q: 0.8, pan, reverb: 0.35,
    });
    this._noise(t, {
      kind: 'brown', gain: 0.08 * vol, attack: 0.1, decay: 2.2,
      filter: 'lowpass', filterFreq: 240, filterEnd: 80, q: 0.7,
      pan, reverb: 0.5,
    });
  }

  _sfxBossWin(t, o) {
    const vol = this._vol(o);
    // A Picardy-third resolution: the storm breaks and D major finally lands.
    this._bell(t, {
      freq: midi(38), gain: 0.085 * vol, duration: 4.6,
      partials: [1, 1.48, 2.09, 2.56], partialGains: [1, 0.5, 0.3, 0.16],
      pan: 0, reverb: 0.55, echo: 0.15,
    });
    const notes = [62, 66, 69, 74, 78];
    for (let i = 0; i < notes.length; i++) {
      const when = t + 0.08 + i * 0.1;
      this._bell(when, {
        freq: midi(notes[i]), gain: 0.04 * vol, duration: 2.2,
        pan: i % 2 ? 0.22 : -0.22,
        partials: [1, 2.01, 3, 4.2], partialGains: [1, 0.4, 0.18, 0.08],
        reverb: 0.55, echo: 0.2,
      });
      this._pluck(when, {
        freq: midi(notes[i]), gain: 0.018 * vol, duration: 1.2,
        brightness: 2600, pan: i % 2 ? 0.2 : -0.2, reverb: 0.35,
      });
    }
    this._pad(t + 0.18, {
      notes: [50, 54, 57, 62, 66], gain: 0.026 * vol,
      attack: 0.6, duration: 2.4, release: 2.8, brightness: 1600,
      reverb: 0.6, echo: 0.15, bus: 'sfx',
    });
    this._shimmer(t + 0.5, { gain: 0.03 * vol, bus: 'sfx' });
  }

  _shimmer(t, o = {}) {
    const vol = 1;
    const gain = o.gain == null ? 0.02 : o.gain;
    const bus = o.bus || 'sfx';
    const notes = [86, 88, 91, 93, 96];
    const count = 6;
    for (let i = 0; i < count; i++) {
      const pan = this._rrange(-0.7, 0.7);
      this._tone(t + i * 0.035 + this._rrange(0, 0.1), {
        type: 'triangle', freq: midi(this._pick(notes)) * this._rrange(0.996, 1.004),
        gain: gain * vol * (1 - i * 0.07) * this._rrange(0.7, 1.15),
        attack: 0.003, decay: this._rrange(0.4, 1.1),
        filter: 'highpass', filterFreq: 2600, q: 0.5,
        pan, reverb: 0.75, echo: 0.2, bus,
      });
    }
    this._noise(t, {
      kind: 'white', gain: gain * 0.35, attack: 0.01, decay: 0.55,
      filter: 'highpass', filterFreq: 5000, q: 0.5,
      pan: 0, reverb: 0.8, bus,
    });
  }

  _sfxChapter(t, o) {
    const vol = this._vol(o);
    this._bell(t, {
      freq: midi(38), gain: 0.11 * vol, duration: 5.2,
      partials: [1, 1.48, 2.09, 2.56, 3.77], partialGains: [1, 0.55, 0.34, 0.2, 0.1],
      pan: 0, reverb: 0.6, echo: 0.2,
    });
    this._noise(t, {
      kind: 'brown', gain: 0.09 * vol, attack: 0.01, decay: 1.4,
      filter: 'lowpass', filterFreq: 420, filterEnd: 100, q: 0.8,
      pan: 0, reverb: 0.5,
    });
    this._pad(t + 0.1, {
      notes: [50, 53, 57, 62, 65], gain: 0.027 * vol,
      attack: 1.1, duration: 2.8, release: 2.8, brightness: 1250,
      reverb: 0.65, echo: 0.15, bus: 'sfx',
    });
    this._shimmer(t + 0.35, { gain: 0.024 * vol, bus: 'sfx' });
  }

  // ---------------------------------------------------------------------------
  // Voice helpers
  // ---------------------------------------------------------------------------

  _tone(t, o = {}) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    t = this._at(t);
    const out = this._makeOut(o);
    if (!out) return;
    const nodes = out.nodes;
    const attack = Math.max(0.002, o.attack == null ? 0.004 : o.attack);
    const hold = Math.max(0, o.hold || 0);
    const decay = Math.max(0.02, o.decay == null ? 0.3 : o.decay);
    const end = t + attack + hold + decay;

    let dest = out.node;
    if (o.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = o.filter;
      filter.frequency.setValueAtTime(Math.max(20, o.filterFreq || 800), t);
      if (o.filterEnd) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(20, o.filterEnd),
          t + (o.filterGlide || Math.min(0.6, attack + decay * 0.7))
        );
      }
      filter.Q.value = o.q == null ? 0.7 : o.q;
      filter.connect(out.node);
      dest = filter;
      nodes.push(filter);
    }

    const amp = ctx.createGain();
    amp.gain.value = 0; // never let a source sneak through before its envelope
    amp.connect(dest);
    nodes.push(amp);

    const peak = Math.max(0.0001, o.gain == null ? 0.06 : o.gain);
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + attack);
    if (hold) amp.gain.setValueAtTime(peak, t + attack + hold);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.gain.setValueAtTime(0, end + 0.001);

    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    if (
      osc.type !== 'sine' &&
      osc.type !== 'triangle' &&
      osc.type !== 'sawtooth' &&
      osc.type !== 'square'
    ) {
      osc.type = 'sine';
    }
    const freq = Math.max(1, o.freq || 440);
    osc.frequency.setValueAtTime(freq, t);
    if (o.freqEnd) {
      const glide = Math.max(0.005, o.glide || 0.1);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.freqEnd), t + glide);
    }
    if (o.detune) osc.detune.value = o.detune;
    osc.connect(amp);
    nodes.push(osc);

    if (o.vibrato) {
      const lfo = this._lfo(Math.max(0.1, o.vibratoRate || 5), Math.abs(o.vibrato), osc.detune);
      nodes.push(lfo.osc, lfo.gain);
      try {
        lfo.osc.stop(end + 0.1);
      } catch (_) {}
    }

    try {
      osc.start(t);
      osc.stop(end + 0.05);
    } catch (_) {}

    this._release(nodes, end + 0.25);
  }

  _noise(t, o = {}) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    t = this._at(t);
    const out = this._makeOut(o);
    if (!out) return;
    const buf = this._noiseBuffer(o.kind || 'white');
    if (!buf) return;

    const nodes = out.nodes;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;

    let dest = out.node;
    if (o.filter) {
      const filter = ctx.createBiquadFilter();
      filter.type = o.filter;
      filter.frequency.setValueAtTime(Math.max(20, o.filterFreq || 800), t);
      if (o.filterEnd) {
        filter.frequency.exponentialRampToValueAtTime(
          Math.max(20, o.filterEnd),
          t + (o.filterGlide || 0.2)
        );
      }
      filter.Q.value = o.q == null ? 0.8 : o.q;
      filter.connect(out.node);
      dest = filter;
      nodes.push(filter);
    }

    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.connect(dest);
    nodes.push(amp);

    const peak = Math.max(0.0001, o.gain == null ? 0.05 : o.gain);
    const attack = Math.max(0.002, o.attack == null ? 0.006 : o.attack);
    const hold = Math.max(0, o.hold || 0);
    const decay = Math.max(0.02, o.decay == null ? 0.25 : o.decay);
    const end = t + attack + hold + decay;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + attack);
    if (hold) amp.gain.setValueAtTime(peak, t + attack + hold);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.gain.setValueAtTime(0, end + 0.001);

    src.connect(amp);
    nodes.push(src);

    const duration = buf.duration || 1;
    const offset = o.offset == null ? Math.random() * Math.max(0.1, duration - 0.2) : o.offset;
    try {
      src.start(t, clamp(offset, 0, Math.max(0, duration - 0.01)));
      src.stop(end + 0.08);
    } catch (_) {
      try {
        src.start(t);
        src.stop(end + 0.08);
      } catch (__) {}
    }

    this._release(nodes, end + 0.25);
  }

  _bell(t, o = {}) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    t = this._at(t);
    const out = this._makeOut(o);
    if (!out) return;

    const nodes = out.nodes;
    const base = Math.max(20, o.freq || 440);
    const duration = Math.max(0.2, o.duration == null ? 2.6 : o.duration);
    const peak = Math.max(0.0001, o.gain == null ? 0.05 : o.gain);
    const ratios = o.partials || [1, 2.01, 2.98, 4.07];
    const gains = o.partialGains || [1, 0.45, 0.24, 0.11];
    const width = o.width == null ? 0.18 : o.width;
    let end = t + duration;

    for (let i = 0; i < ratios.length; i++) {
      const decay = Math.max(0.08, duration * (1 - i * 0.12));
      const noteEnd = t + decay;
      if (noteEnd > end) end = noteEnd;

      const partialPan = clamp((o.pan || 0) + (i % 2 ? width : -width), -1, 1);
      const panner = this._panner(partialPan);
      panner.connect(out.node);
      nodes.push(panner);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base * ratios[i];
      if (o.detune) osc.detune.value = o.detune * (i % 2 ? -1 : 1);

      const g = ctx.createGain();
      g.gain.value = 0;
      const p = Math.max(0.0001, peak * (gains[i] == null ? 1 / (i + 1) : gains[i]));
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(p, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      g.gain.setValueAtTime(0, noteEnd + 0.001);

      osc.connect(g).connect(panner);
      nodes.push(osc, g);
      try {
        osc.start(t);
        osc.stop(noteEnd + 0.05);
      } catch (_) {}
    }

    if (o.strike) {
      const src = ctx.createBufferSource();
      const buf = this._noiseBuffer('white');
      src.buffer = buf;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = Math.min(6000, base * 4);
      bp.Q.value = 1.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak * 0.35, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      src.connect(bp).connect(g).connect(out.node);
      try {
        src.start(t, Math.random() * 1.5);
        src.stop(t + 0.12);
      } catch (_) {}
      nodes.push(src, bp, g);
    }

    this._release(nodes, end + 0.3);
  }

  _pluck(t, o = {}) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    t = this._at(t);
    const out = this._makeOut(o);
    if (!out) return;

    const nodes = out.nodes;
    const freq = Math.max(20, o.freq || 220);
    const duration = Math.max(0.12, o.duration == null ? 1.2 : o.duration);
    const peak = Math.max(0.0001, o.gain == null ? 0.04 : o.gain);
    const brightness = Math.max(200, o.brightness || 2000);
    const end = t + duration;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(Math.min(9000, brightness * 1.7), t);
    filter.frequency.exponentialRampToValueAtTime(Math.max(120, brightness * 0.3), t + duration * 0.75);
    filter.Q.value = o.q == null ? 1.1 : o.q;

    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(peak, t + 0.004);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.gain.setValueAtTime(0, end + 0.001);

    filter.connect(amp).connect(out.node);
    nodes.push(filter, amp);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = freq;
    oscA.detune.value = -4;
    const oscB = ctx.createOscillator();
    oscB.type = 'triangle';
    oscB.frequency.value = freq * 2;
    oscB.detune.value = 3;
    const mixB = ctx.createGain();
    mixB.gain.value = 0.3;
    oscA.connect(filter);
    oscB.connect(mixB).connect(filter);
    nodes.push(oscA, oscB, mixB);

    try {
      oscA.start(t);
      oscB.start(t);
      oscA.stop(end + 0.05);
      oscB.stop(end + 0.05);
    } catch (_) {}

    this._release(nodes, end + 0.25);
  }

  _pad(t, o = {}) {
    if (!this._ctx) return;
    const ctx = this._ctx;
    t = this._at(t);
    const out = this._makeOut(o);
    if (!out) return;

    const notes = o.notes && o.notes.length ? o.notes : [50, 53, 57];
    const duration = Math.max(0.3, o.duration == null ? 3 : o.duration);
    const attack = Math.max(0.02, o.attack == null ? 1.2 : o.attack);
    const release = Math.max(0.1, o.release == null ? 2.5 : o.release);
    const peak = Math.max(0.0001, o.gain == null ? 0.025 : o.gain);
    const end = t + attack + duration + release;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(60, o.brightness || 1000);
    filter.Q.value = o.q == null ? 0.6 : o.q;

    const amp = ctx.createGain();
    amp.gain.value = 0;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.linearRampToValueAtTime(peak, t + attack);
    amp.gain.setValueAtTime(peak, t + attack + duration);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);
    amp.gain.setValueAtTime(0, end + 0.001);

    filter.connect(amp).connect(out.node);

    const nodes = out.nodes.concat([filter, amp]);
    const voices = Math.max(1, o.voices || 2);
    const detune = o.detune == null ? 6 : o.detune;
    const width = o.width == null ? 0.45 : o.width;

    for (let n = 0; n < notes.length; n++) {
      const noteMix = ctx.createGain();
      noteMix.gain.value = 1 / voices;
      let noteTail = noteMix;
      if (notes.length > 1) {
        const spread = (n / (notes.length - 1)) * 2 - 1;
        const panner = this._panner(spread * width);
        noteMix.connect(panner);
        noteTail = panner;
        nodes.push(panner);
      }
      noteTail.connect(filter);
      nodes.push(noteMix);

      for (let v = 0; v < voices; v++) {
        const osc = ctx.createOscillator();
        osc.type = o.type || 'sawtooth';
        if (
          osc.type !== 'sine' &&
          osc.type !== 'triangle' &&
          osc.type !== 'sawtooth' &&
          osc.type !== 'square'
        ) {
          osc.type = 'sawtooth';
        }
        osc.frequency.value = Math.max(1, midi(notes[n]));
        osc.detune.value = voices === 1 ? 0 : v === 0 ? -detune : detune;
        osc.connect(noteMix);
        try {
          osc.start(t);
          osc.stop(end + 0.05);
        } catch (_) {}
        nodes.push(osc);
      }
    }

    this._release(nodes, end + 0.3);
  }

  _makeOut(o = {}) {
    const ctx = this._ctx;
    if (!ctx) return null;
    const nodes = [];
    const voice = ctx.createGain();
    voice.gain.value = 1;
    nodes.push(voice);

    const dest = o.dest
      ? o.dest
      : o.bus === 'music'
      ? this._musicBus
      : o.bus === 'ambience'
      ? this._ambienceBus
      : o.bus === 'fishing'
      ? this._fishingBus
      : this._sfxBus;

    let tail = voice;
    if (o.pan) {
      const panner = this._panner(o.pan);
      voice.connect(panner);
      tail = panner;
      nodes.push(panner);
    }
    tail.connect(dest);

    // Music routed into a bed inherits the bed's shared reverb/echo sends.
    const group = o.bus === 'music' ? 'music' : o.bus === 'ambience' ? 'ambience' : 'sfx';
    if (!o.dest && o.reverb) {
      const send = ctx.createGain();
      send.gain.value = clamp(o.reverb, 0, 1);
      const destSend = (this._sendReverb && this._sendReverb[group]) || this._reverbIn;
      if (destSend) voice.connect(send).connect(destSend);
      nodes.push(send);
    }
    if (!o.dest && o.echo && this._echoIn) {
      const send = ctx.createGain();
      send.gain.value = clamp(o.echo, 0, 1);
      const destSend = (this._sendEcho && this._sendEcho[group]) || this._echoIn;
      if (destSend) voice.connect(send).connect(destSend);
      nodes.push(send);
    }

    return { node: voice, nodes };
  }

  _panner(pan) {
    const ctx = this._ctx;
    const p = clamp(Number(pan) || 0, -1, 1);
    try {
      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = p;
        return panner;
      }
    } catch (_) {}
    // Non-panning fallback keeps the graph valid on older engines.
    return ctx.createGain();
  }

  _at(t) {
    if (!this._ctx) return 0;
    return Math.max(Number(t) || 0, this._ctx.currentTime + 0.001);
  }

  _release(nodes, endTime) {
    const ctx = this._ctx;
    if (!ctx) return;
    const delay = Math.max(40, (endTime - ctx.currentTime) * 1000 + 250);
    this._later(() => {
      if (this._ctx !== ctx) return;
      this._disconnectAll(nodes);
    }, delay);
  }

  _later(fn, ms) {
    const id = setTimeout(() => {
      this._timers.delete(id);
      try {
        fn();
      } catch (_) {}
    }, ms);
    this._timers.add(id);
    return id;
  }

  _disconnectAll(nodes) {
    if (!nodes) return;
    for (let i = 0; i < nodes.length; i++) {
      try {
        nodes[i].disconnect();
      } catch (_) {}
    }
  }

  _retireBed(bed, fade) {
    if (!bed || !this._ctx) return;
    const now = this._ctx.currentTime;
    const gain = bed.gain.gain;
    try {
      if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
      else {
        const current = gain.value;
        gain.cancelScheduledValues(now);
        gain.setValueAtTime(current, now);
      }
      gain.linearRampToValueAtTime(0, now + fade);
    } catch (_) {}
    for (let i = 0; i < bed.sources.length; i++) {
      try {
        bed.sources[i].stop(now + fade + 0.12);
      } catch (_) {}
    }
    this._later(() => this._teardownBed(bed), (fade + 0.35) * 1000);
  }

  _teardownBed(bed) {
    if (!bed) return;
    this._disconnectAll(bed.nodes);
    bed.nodes.length = 0;
    bed.sources.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Noise buffers
  // ---------------------------------------------------------------------------

  _noiseBuffer(kind) {
    const ctx = this._ctx;
    if (!ctx || typeof ctx.createBuffer !== 'function') return null;
    const key = kind || 'white';
    if (this._noiseCache[key]) return this._noiseCache[key];

    const sr = ctx.sampleRate || 44100;
    const seconds = 2.5;
    const len = Math.max(1, Math.floor(sr * seconds));
    const fade = Math.min(Math.floor(sr * 0.12), Math.floor(len / 4));
    const full = len + fade;
    const buffer = ctx.createBuffer(2, len, sr);

    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      const tmp = new Float32Array(full);

      if (key === 'brown') {
        let last = 0;
        for (let i = 0; i < full; i++) {
          const w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          tmp[i] = last;
        }
      } else if (key === 'pink') {
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
        for (let i = 0; i < full; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.969 * b2 + w * 0.153852;
          b3 = 0.8665 * b3 + w * 0.3104856;
          b4 = 0.55 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.016898;
          tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        }
      } else {
        for (let i = 0; i < full; i++) tmp[i] = Math.random() * 2 - 1;
      }

      // Seamless loop: at sample 0 the waveform continues from the sample that
      // would follow the end of the loop; over 120 ms it crossfades back to the
      // generated start. This avoids a low thump every 2.5 s (especially audible
      // with the brown-noise beds).
      for (let i = 0; i < fade; i++) {
        const w = i / fade;
        const original = Math.sin((w * Math.PI) / 2);
        const continuation = Math.cos((w * Math.PI) / 2);
        tmp[i] = tmp[i] * original + tmp[len + i] * continuation;
      }
      for (let i = 0; i < len; i++) data[i] = tmp[i];

      let dc = 0;
      for (let i = 0; i < len; i++) dc += data[i];
      dc /= len;
      let peak = 0;
      for (let i = 0; i < len; i++) {
        data[i] -= dc;
        const a = data[i] < 0 ? -data[i] : data[i];
        if (a > peak) peak = a;
      }
      const scale = peak > 0 ? 0.85 / peak : 1;
      for (let i = 0; i < len; i++) data[i] *= scale;
    }

    this._noiseCache[key] = buffer;
    return buffer;
  }

  // ---------------------------------------------------------------------------
  // Controls and teardown
  // ---------------------------------------------------------------------------

  suspend() {
    if (!this._ctx) return Promise.resolve();
    this._running = false;
    try {
      const p = this._ctx.suspend();
      return p && typeof p.catch === 'function' ? p.catch(() => {}) : Promise.resolve();
    } catch (_) {
      return Promise.resolve();
    }
  }

  resume() {
    if (!this._ctx) return Promise.resolve();
    const ctx = this._ctx;
    try {
      const p = ctx.resume();
      const done = () => {
        if (this._ctx === ctx && ctx.state === 'running') this._onStarted();
      };
      if (p && typeof p.then === 'function') return p.then(done).catch(() => {});
      done();
      return Promise.resolve();
    } catch (_) {
      return Promise.resolve();
    }
  }

  dispose() {
    this._wantFishing = false;
    this._removeUnlock();

    for (const id of this._timers) {
      try {
        clearTimeout(id);
      } catch (_) {}
    }
    this._timers.clear();

    const beds = [];
    if (this._scene) beds.push(this._scene);
    if (this._music && this._music.bed) beds.push(this._music.bed);
    if (this._fishing && this._fishing.bed) beds.push(this._fishing.bed);
    const now = this._ctx ? this._ctx.currentTime : 0;
    for (let i = 0; i < beds.length; i++) {
      const bed = beds[i];
      for (let s = 0; s < bed.sources.length; s++) {
        try {
          bed.sources[s].stop(now);
        } catch (_) {}
      }
      this._disconnectAll(bed.nodes);
      bed.nodes.length = 0;
      bed.sources.length = 0;
    }

    const ctx = this._ctx;
    this._ctx = null;
    this._ready = false;
    this._started = false;
    this._running = false;
    this._initPromise = null;
    this._failed = false;
    this._scene = null;
    this._sceneId = null;
    this._desiredScene = null;
    this._sceneEvents = [];
    this._music = null;
    this._musicMode = null;
    this._desiredMusic = null;
    this._fishing = null;
    this._lastPlay = Object.create(null);
    this._noiseCache = Object.create(null);
    this._master = null;
    this._musicBus = null;
    this._sfxBus = null;
    this._ambienceBus = null;
    this._fishingBus = null;
    this._airGain = null;
    this._reverbIn = null;
    this._echoIn = null;
    this._sendReverb = null;
    this._sendEcho = null;
    this._compressor = null;
    this._softClip = null;
    this._convolver = null;

    if (ctx) {
      try {
        ctx.onstatechange = null;
      } catch (_) {}
      try {
        const p = ctx.close();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {}
    }
  }

  // ---------------------------------------------------------------------------
  // Small utilities
  // ---------------------------------------------------------------------------

  _vol(o) {
    return o && o.volume != null ? clamp(Number(o.volume) || 0, 0, 2) : 1;
  }

  _panOf(o) {
    return o && o.pan != null ? clamp(Number(o.pan) || 0, -1, 1) : 0;
  }

  _rand() {
    let t = (this._randState += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  _rrange(a, b) {
    return a + (b - a) * Math.random();
  }

  _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
