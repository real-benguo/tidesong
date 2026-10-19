const ACCOUNTS_KEY = 'tidesong_accounts_v1';
const ACTIVE_KEY = 'tidesong_active_profile_v1';
const MIGRATED_KEY = 'tidesong_profiles_migrated_v1';
const LEGACY_SAVE_KEY = 'tidesong_save_v1';
const SAVE_PREFIX = 'tidesong_save_v2_';

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    /* private mode / quota — keep the in-memory session alive */
  }
}

function pinHash(name, pin) {
  const text = `${String(name).trim().toLowerCase()}::${String(pin)}::tidesong-local`;
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 = Math.imul(h2 ^ c, 0x85ebca6b);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Local, browser-scoped save profiles. There is no server account: this keeps
 * several independent saves on one browser and makes the storage boundary
 * explicit. Export/import in the UI is the portable fallback.
 */
export class ProfileStore {
  constructor() {
    this.profiles = readJSON(ACCOUNTS_KEY, []);
    if (!Array.isArray(this.profiles) || !this.profiles.length) {
      this.profiles = [{
        id: 'guest',
        name: '归潮者',
        pinHash: null,
        guest: true,
        created: Date.now(),
        lastPlayed: Date.now(),
      }];
      writeJSON(ACCOUNTS_KEY, this.profiles);
    }
    let activeId = null;
    try { activeId = localStorage.getItem(ACTIVE_KEY); } catch (e) { /* ignore */ }
    if (!this.profiles.some((p) => p.id === activeId)) activeId = this.profiles[0].id;
    this.activeId = activeId;
    try { localStorage.setItem(ACTIVE_KEY, activeId); } catch (e) { /* ignore */ }
    this.migrateLegacy();
    this.touchActive();
  }

  get saveKey() {
    return `${SAVE_PREFIX}${this.activeId}`;
  }

  get active() {
    return this.profiles.find((p) => p.id === this.activeId) || this.profiles[0];
  }

  get list() {
    return [...this.profiles].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  }

  migrateLegacy() {
    try {
      if (localStorage.getItem(MIGRATED_KEY)) return;
      const legacy = localStorage.getItem(LEGACY_SAVE_KEY);
      const guestKey = `${SAVE_PREFIX}guest`;
      if (legacy && !localStorage.getItem(guestKey)) {
        localStorage.setItem(guestKey, legacy);
      }
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch (e) {
      /* ignore */
    }
  }

  touchActive() {
    const p = this.active;
    if (!p) return;
    p.lastPlayed = Date.now();
    writeJSON(ACCOUNTS_KEY, this.profiles);
  }

  activate(id) {
    if (!this.profiles.some((p) => p.id === id)) return false;
    this.activeId = id;
    try { localStorage.setItem(ACTIVE_KEY, id); } catch (e) { /* ignore */ }
    this.touchActive();
    return true;
  }

  create(name, pin, { copyFromKey = null } = {}) {
    const clean = String(name || '').trim();
    if (clean.length < 2 || clean.length > 14) return { error: '账号名需要 2–14 个字符。' };
    if (!/^\d{4,8}$/.test(String(pin || ''))) return { error: 'PIN 需要 4–8 位数字。' };
    if (this.profiles.some((p) => p.name.toLowerCase() === clean.toLowerCase())) {
      return { error: '这个账号名已经存在。' };
    }
    const profile = {
      id: `p_${Date.now().toString(36)}_${Math.floor(Math.random() * 999).toString(36)}`,
      name: clean,
      pinHash: pinHash(clean, pin),
      guest: false,
      created: Date.now(),
      lastPlayed: Date.now(),
    };
    this.profiles.push(profile);
    writeJSON(ACCOUNTS_KEY, this.profiles);
    if (copyFromKey) {
      try {
        const raw = localStorage.getItem(copyFromKey);
        if (raw) localStorage.setItem(`${SAVE_PREFIX}${profile.id}`, raw);
      } catch (e) { /* ignore */ }
    }
    this.activate(profile.id);
    return { profile };
  }

  login(name, pin) {
    const clean = String(name || '').trim().toLowerCase();
    const profile = this.profiles.find((p) => p.name.toLowerCase() === clean);
    if (!profile) return { error: '没有找到这个本地账号。' };
    if (profile.pinHash && profile.pinHash !== pinHash(profile.name, pin)) {
      return { error: 'PIN 不正确。' };
    }
    this.activate(profile.id);
    return { profile };
  }

  clearCurrentSave() {
    try {
      localStorage.removeItem(this.saveKey);
      if (this.activeId === 'guest') localStorage.removeItem(LEGACY_SAVE_KEY);
      localStorage.setItem(MIGRATED_KEY, '1');
    } catch (e) {
      /* ignore */
    }
  }
}
