import { levelFromXp } from '../data/progression.js';
import { CHAPTERS } from '../data/chapters.js';

const SAVE_KEY = 'tidesong_save_v1';
const SETTINGS_KEY = 'tidesong_settings_v1';

const DEFAULT_SETTINGS = {
  quality: 'high',
  volume: 0.78,
  music: 0.58,
  sensitivity: 1,
  invertY: false,
  subtitles: true,
  shake: true,
  fov: 72,
};

const DEFAULT_STATE = () => ({
  version: 1,
  chapter: 1,
  objective: 0,
  coins: 160,
  totalXp: 0,
  perkPoints: 0,
  perks: [],
  claimedLevel: 1,
  equipment: { rod: 0, reel: 0, line: 0, upgrades: { rod: 0, reel: 0, line: 0 } },
  creel: 0,
  baits: { worm: 6 },
  currentBait: 'worm',
  fishBasket: [],
  items: {},
  catches: {},
  records: {},
  objectiveProgress: {},
  islandFish: {},
  flags: {},
  ending: null,
  completed: false,
  playTime: 0,
  chapterCleared: [],
  sideContracts: [],
  scenesSeen: {},
  stats: { casts: 0, catches: 0, bosses: 0, snapped: 0, coinsEarned: 0 },
});

export class GameState {
  constructor() {
    this.data = DEFAULT_STATE();
    this.settings = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    this.loadSettings();
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit(event = 'change', detail = {}) {
    for (const fn of this.listeners) fn(event, detail);
  }

  reset(persist = true) {
    this.data = DEFAULT_STATE();
    if (persist) this.save();
    this.emit('reset');
  }

  clearSave() {
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch (e) {
      /* ignore */
    }
  }

  get chapter() {
    return CHAPTERS[Math.max(0, Math.min(CHAPTERS.length - 1, this.data.chapter - 1))];
  }

  get objective() {
    return this.chapter.objectives[this.data.objective] || null;
  }

  get level() {
    return levelFromXp(this.data.totalXp).level;
  }

  get creelCapacity() {
    return [18, 32, 52][this.data.creel] || 18;
  }

  addCoins(n, silent = false) {
    this.data.coins = Math.max(0, Math.round(this.data.coins + n));
    if (n > 0) this.data.stats.coinsEarned += n;
    if (!silent) this.emit('coins', { amount: n });
    this.save();
  }

  spend(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.emit('coins', { amount: -n });
    this.save();
    return true;
  }

  addXp(n) {
    const before = levelFromXp(this.data.totalXp).level;
    this.data.totalXp += Math.max(0, Math.round(n));
    const after = levelFromXp(this.data.totalXp).level;
    let leveled = 0;
    if (after > this.data.claimedLevel) {
      leveled = after - this.data.claimedLevel;
      this.data.perkPoints += leveled;
      this.data.claimedLevel = after;
    }
    this.emit('xp', { amount: n, leveled, level: after });
    this.save();
    return { leveled, level: after };
  }

  addPerk(id) {
    if (this.data.perks.includes(id)) return false;
    this.data.perks.push(id);
    this.emit('perks');
    this.save();
    return true;
  }

  addBait(id, n = 1) {
    this.data.baits[id] = (this.data.baits[id] || 0) + n;
    if (!this.data.currentBait || (this.data.baits[this.data.currentBait] || 0) <= 0) {
      this.data.currentBait = id;
    }
    this.emit('bait');
    this.save();
  }

  useBait(id, n = 1) {
    if ((this.data.baits[id] || 0) < n) return false;
    this.data.baits[id] -= n;
    if (this.data.baits[id] <= 0) {
      const next = Object.entries(this.data.baits).find(([, v]) => v > 0);
      if (next) this.data.currentBait = next[0];
    }
    this.emit('bait');
    this.save();
    return true;
  }

  addItem(id, n = 1) {
    this.data.items[id] = (this.data.items[id] || 0) + n;
    this.emit('items', { id, n });
    this.save();
  }

  hasItem(id, n = 1) {
    return (this.data.items[id] || 0) >= n;
  }

  addFish(entry) {
    // Bestiary/quest records are kept even when the creel is full; the player
    // still gets the choice to release or sell the fish from the catch card.
    this.data.stats.catches += 1;
    const record = this.data.records[entry.species];
    if (!record || entry.kg > record.kg) {
      this.data.records[entry.species] = { kg: entry.kg, length: entry.length, date: Date.now() };
    }
    const catchData = this.data.catches[entry.species] || { count: 0, first: Date.now() };
    catchData.count += 1;
    catchData.last = Date.now();
    this.data.catches[entry.species] = catchData;
    const added = this.data.fishBasket.length < this.creelCapacity;
    if (added) this.data.fishBasket.push(entry);
    this.emit('fish', entry);
    this.save();
    return added;
  }

  removeFish(uid) {
    const i = this.data.fishBasket.findIndex((f) => f.uid === uid);
    if (i < 0) return null;
    const [f] = this.data.fishBasket.splice(i, 1);
    this.save();
    this.emit('fishRemoved', f);
    return f;
  }

  sellFish(uid, price) {
    const f = this.removeFish(uid);
    if (!f) return 0;
    this.addCoins(price);
    this.emit('sold', { fish: f, price });
    return price;
  }

  isCaught(species) {
    return !!this.data.catches[species];
  }

  catchCount(species) {
    return this.data.catches[species]?.count || 0;
  }

  save() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('Save failed', e);
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      this.data = { ...DEFAULT_STATE(), ...parsed };
      this.data.equipment = { ...DEFAULT_STATE().equipment, ...(parsed.equipment || {}) };
      this.data.stats = { ...DEFAULT_STATE().stats, ...(parsed.stats || {}) };
      this.data.claimedLevel = this.data.claimedLevel || levelFromXp(this.data.totalXp).level;
      return true;
    } catch (e) {
      console.warn('Load failed', e);
      return false;
    }
  }

  hasSave() {
    return !!localStorage.getItem(SAVE_KEY);
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (e) {
      /* ignore */
    }
  }

  loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch (e) {
      /* ignore */
    }
  }

  update(dt) {
    this.data.playTime += dt;
  }
}
