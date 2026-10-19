import { CHAPTERS, SCENES, getChapter } from '../data/chapters.js';
import { NPCS, ISLAND_NPCS } from '../data/npcs.js';
import { FISH, FISH_LIST, REGULAR_FISH, RARITY, BAITS, speciesForIsland } from '../data/fish.js';
import { ITEMS, RODS, REELS, LINES, PERKS, SHOP_BAITS, xpProgress, statTotals, LEVEL_XP } from '../data/progression.js';
import { ISLANDS, ISLAND_ORDER, ISLAND_NAMES } from '../data/islands.js';
import { formatWeight, formatLength, fmt, clamp } from '../utils/math.js';

const CHAPTER_SUMMARY = {
  1: '你回到归潮岛，修好了熄灭十年的灯塔，也第一次听见祖父留在潮声里的声音。',
  2: '雾苇泽的鱼在变异。你找到了第二枚潮鸣片，也确认黑潮正在被某种力量抽向火山。',
  3: '沉钟之下，祖父的潜钟与半本日志浮出水面。韩照的名字，第一次出现在他的字迹里。',
  4: '风暴金枪拖回了录音箱。十年前那场事故不再是秘密，而烬潮岛就在风暴眼里。',
  5: '潮心就在火山口下。所有的潮声，都在等你做出最后一个选择。',
};

const ICON = {
  coin: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9 9.5h6M9 14.5h6M12 7v10" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  fish: '<svg viewBox="0 0 48 24"><path d="M4 12c5-7 18-9 28-3 3 2 6 3 9 3-3 0-6 1-9 3-10 6-23 4-28-3Zm9-4c3 2 5 5 5 8M9 8c2 2 3 5 3 8" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
};

function pct(v) {
  return `${(clamp(v) * 100).toFixed(1)}%`;
}

export class UI {
  constructor(game) {
    this.game = game;
    this.state = game.state;
    this.hoverItem = null;
    this.portraitCache = new Map();
    this.fishPortraitCache = new Map();
    this.dialogue = null;
    this.typeAcc = 0;
    this.dialogueResolve = null;
    this.pauseOpen = false;
    this.journalTab = 'journey';
    this.modalKind = null;
    this.bossCueData = null;
    this.defeatCallbacks = null;
    this._compassHidden = true;
    this._distanceHidden = true;
    this._objectiveHidden = true;
    this._compassText = '';
    this._distanceText = '';
    this._promptHidden = true;
    this._promptText = '';
    this._promptKey = '';
    this.root = document.createElement('div');
    this.root.id = 'ui-root';
    this.root.innerHTML = this.template();
    document.body.appendChild(this.root);
    this.refs = {};
    this.collectRefs();
    this.bind();
    this.showBoot();
    document.addEventListener('fullscreenchange', () => this.syncFullscreen());
    this.syncFullscreen();
  }

  syncFullscreen() {
    const on = !!document.fullscreenElement;
    this.root.querySelectorAll('.hud-tool[data-fullscreen]').forEach((el) => el.classList.toggle('active', on));
    this.root.querySelectorAll('[data-fullscreen-label]').forEach((el) => { el.textContent = on ? '退出全屏' : '进入全屏'; });
  }

  template() {
    return `
      <div id="boot-screen" class="screen boot-screen">
        <div class="boot-rings"><i></i><i></i><i></i></div>
        <div class="boot-center">
          <div class="boot-mark">潮</div>
          <div class="boot-title">TIDESONG</div>
          <div class="boot-sub">一段关于潮声、旧灯与归途的故事</div>
          <div class="boot-progress"><div class="boot-progress-fill"></div></div>
          <div class="boot-status">正在听海……</div>
          <div class="boot-quote">“有些潮声，是为归来的人唱的。”</div>
        </div>
      </div>

      <div id="title-screen" class="screen title-screen hidden">
        <div class="title-grain"></div>
        <div class="title-frame"></div>
        <div class="title-top">
          <span>AN ORIGINAL FISHING ODYSSEY</span>
          <span class="title-top-right">归墟海 · 第 20 年</span>
        </div>
        <div class="title-center">
          <div class="title-kicker">TIDE · SONG</div>
          <h1 class="title-main">潮汐遗歌</h1>
          <div class="title-en">TIDESONG</div>
          <p class="title-tagline">海会记得每一个回家的人。<br/>只要你愿意，再听一次潮声。</p>
        </div>
        <div class="title-bottom">
          <div class="title-menu">
            <button class="title-btn primary" data-title="new"><span>开始旅程</span><small>NEW JOURNEY</small></button>
            <button class="title-btn" data-title="continue"><span>继续旅程</span><small>CONTINUE</small></button>
            <button class="title-btn small" data-title="settings">设置</button>
            <button class="title-btn small duel-entry" data-title="duel">潮斗</button>
            <button class="title-btn small" data-fullscreen title="全屏（F11）">全屏</button>
            <button class="title-btn small" data-title="account">账号</button>
            <button class="title-btn small" data-title="credits">制作名单</button>
          </div>
          <div class="title-foot">
            <span>建议佩戴耳机 · 使用鼠标与键盘</span>
            <span id="title-profile">归潮者 · 本地存档</span>
            <span>© 2026 TIDESONG · 原创作品</span>
          </div>
        </div>
        <div class="title-side">潮<br/>汐<br/>遗<br/>歌</div>
      </div>

      <div id="duel-ui" class="duel-ui hidden">
        <div class="duel-head"><div><b>潮斗</b><span>LOCAL 1V1 · 双人决斗</span></div><div class="duel-phase" id="duel-phase">准备</div></div>
        <div class="duel-bars">
          <div class="duel-side p1"><div class="duel-name"><span>沈屿</span><b id="duel-hp1-text">100</b></div><div class="duel-hp"><i id="duel-hp1"></i></div><small>WASD 移动 · J 攻击 · K 冲刺 · L 格挡</small></div>
          <div class="duel-side p2"><div class="duel-name"><span id="duel-name2">潮斗者</span><b id="duel-hp2-text">100</b></div><div class="duel-hp"><i id="duel-hp2"></i></div><small id="duel-hint2">方向键 移动 · U 攻击 · I 冲刺 · O 格挡</small></div>
        </div>
        <div class="duel-count" id="duel-count">3</div>
        <div class="duel-result hidden" id="duel-result"><span>潮斗结束</span><h3 id="duel-result-title">沈屿获胜</h3><div><button class="btn primary small" data-duel="rematch">再战一局</button><button class="btn ghost small" data-duel="exit">离开潮斗</button></div></div>
        <div class="duel-hint">Esc 离开 · 本地双人同屏 · 先击倒对方者获胜</div>
      </div>

      <div id="hud" class="hud hidden">
        <div class="hud-top">
          <div class="brand">
            <div class="brand-line"></div>
            <div>
              <div class="chapter-no" id="hud-chapter-no">第一章</div>
              <div class="chapter-name" id="hud-chapter-name">灯熄之夜</div>
            </div>
          </div>
          <div class="compass" id="compass">
            <div class="compass-ruler"></div>
            <div class="compass-needle"></div>
            <div class="compass-marker" id="compass-marker"></div>
            <div class="compass-deg" id="compass-deg">N · 000°</div>
          </div>
          <div class="hud-stats">
            <div class="pill coins" title="金币">${ICON.coin}<span id="hud-coins">0</span></div>
            <div class="pill level" title="钓手等级"><span>LV</span><b id="hud-level">1</b><i class="mini-xp"><em id="hud-xp"></em></i></div>
            <div class="pill basket" title="鱼篓">${ICON.fish}<span id="hud-basket">0/18</span></div>
            <button class="hud-tool" data-fullscreen title="全屏（F11）" aria-label="全屏">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
          </div>
        </div>

        <div class="quest-card" id="quest-card">
          <div class="quest-eyebrow"><i></i> 当前目标</div>
          <div class="quest-text" id="quest-text">……</div>
          <div class="quest-distance hidden" id="quest-distance"><i></i><span></span></div>
          <div class="quest-progress hidden" id="quest-progress"><span id="quest-progress-text"></span><div><i id="quest-progress-fill"></i></div></div>
        </div>

        <div class="crosshair" id="crosshair"><span></span><i></i></div>
        <div class="prompt hidden" id="prompt"><kbd></kbd><span></span></div>

        <div class="bait-dock" id="bait-dock"></div>

        <div class="controls-hint" id="controls-hint">
          <span><kbd>WASD</kbd> 移动</span><span><kbd>Shift</kbd> 疾行</span><span><kbd>Space</kbd> 跳跃</span><span><kbd>E</kbd> 互动</span><span><kbd>Tab</kbd> 手记</span><span><kbd>M</kbd> 海图</span><span><kbd>F11</kbd> 全屏</span>
        </div>

        <div class="fishing-charge hidden" id="fishing-charge">
          <div class="charge-label">抛竿力度</div>
          <div class="charge-track"><div class="charge-zones"></div><div class="charge-fill" id="charge-fill"></div><div class="charge-cursor" id="charge-cursor"></div></div>
          <div class="charge-hint">松开左键抛竿 · 右键取消</div>
        </div>

        <div class="bite-prompt hidden" id="bite-prompt">
          <div class="bite-ring"><span>!</span></div>
          <div class="bite-title" id="bite-title">咬钩了</div>
          <div class="bite-hint" id="bite-hint">左键提竿</div>
        </div>

        <div class="reel-hud hidden" id="reel-hud">
          <div class="reel-head">
            <div class="reel-fish" id="reel-fish">${ICON.fish}</div>
            <div class="reel-name-wrap"><div class="reel-eyebrow">水下有什么正在挣扎</div><div class="reel-name" id="reel-name">未知鱼影</div></div>
            <div class="reel-status" id="reel-status">稳住</div>
          </div>
          <div class="reel-body">
            <div class="tension-block">
              <div class="tension-label">线张力</div>
              <div class="tension-meter">
                <div class="tension-danger high"></div>
                <div class="tension-safe"></div>
                <div class="tension-fill" id="tension-fill"></div>
                <div class="tension-needle" id="tension-needle"></div>
              </div>
              <div class="tension-value" id="tension-value">52</div>
            </div>
            <div class="fight-main">
              <div class="fight-hint" id="fight-hint">按住左键收线，松开泄力</div>
              <div class="line-progress"><div class="line-progress-fill" id="line-progress-fill"></div><div class="line-progress-fish" id="line-progress-fish">${ICON.fish}</div></div>
              <div class="integrity-row"><span>线体</span><div class="integrity"><i id="integrity-fill"></i></div><b id="integrity-value">100%</b></div>
              <div class="stamina-row"><span>鱼的体力</span><div class="stamina"><i id="stamina-fill"></i></div></div>
            </div>
          </div>
          <div class="reel-foot"><kbd>LMB</kbd> 收线 / 泄力 <span>·</span> <kbd>SPACE</kbd> 猛提 <span>·</span> 张力过高会断线</div>
        </div>

        <div class="boss-ui hidden" id="boss-ui">
          <div class="boss-top">
            <div class="boss-name" id="boss-name">潮主</div>
            <div class="boss-sub" id="boss-sub"></div>
            <div class="boss-hp"><i id="boss-hp-fill"></i><span id="boss-hp-text">100</span></div>
            <div class="boss-line"><span>钓线</span><div><i id="boss-line-fill"></i></div><b id="boss-line-text">100%</b></div>
          </div>
          <div class="boss-cue hidden" id="boss-cue">
            <div class="cue-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="cue-track"/><circle cx="60" cy="60" r="52" class="cue-progress" id="cue-progress"/></svg><div class="cue-key" id="cue-key">HOLD</div></div>
            <div class="cue-title" id="cue-title">稳住收线</div>
            <div class="cue-hint" id="cue-hint">按住左键</div>
            <div class="cue-timebar"><i id="cue-timefill"></i><em class="sweet" id="cue-sweet"></em></div>
          </div>
          <div class="boss-result" id="boss-result"></div>
        </div>

        <div class="cinematic-bars"><i></i><i></i></div>
      </div>

      <div id="dialogue-layer" class="dialogue-layer hidden">
        <div class="dialogue-backdrop"></div>
        <div class="dialogue-inner">
          <div class="dialogue-portrait" id="dialogue-portrait"><img alt=""/><div class="portrait-glow"></div></div>
          <div class="dialogue-box">
            <div class="dialogue-head"><div class="dialogue-name" id="dialogue-name"></div><div class="dialogue-role" id="dialogue-role"></div></div>
            <div class="dialogue-text" id="dialogue-text"></div>
            <div class="dialogue-foot"><span class="dialogue-tone" id="dialogue-tone"></span><span class="continue" id="dialogue-continue">点击继续 <i></i></span><button class="skip-btn" id="dialogue-skip">跳过</button></div>
          </div>
        </div>
      </div>

      <div id="cinematic-layer" class="cinematic-layer hidden"></div>
      <div id="modal-layer" class="modal-layer hidden"><div class="modal-backdrop"></div><div class="modal-shell"><div id="modal-content" class="modal-content"></div></div></div>
      <div id="toast-layer" class="toast-layer"></div>
      <div id="fade-layer" class="fade-layer"></div>
      <div id="ending-layer" class="ending-layer hidden"></div>
      <div id="boss-overlay" class="boss-overlay hidden"></div>
    `;
  }

  collectRefs() {
    const ids = [
      'boot-screen', 'title-screen', 'hud', 'hud-chapter-no', 'hud-chapter-name', 'hud-coins', 'hud-level', 'hud-xp',
      'hud-basket', 'quest-card', 'quest-text', 'quest-distance', 'quest-progress', 'quest-progress-text', 'quest-progress-fill',
      'compass', 'compass-ticks', 'compass-marker', 'compass-deg', 'crosshair', 'prompt', 'bait-dock',
      'fishing-charge', 'charge-fill', 'charge-cursor', 'bite-prompt', 'bite-title', 'bite-hint',
      'reel-hud', 'reel-name', 'reel-status', 'tension-fill', 'tension-needle', 'tension-value',
      'line-progress-fill', 'line-progress-fish', 'integrity-fill', 'integrity-value', 'stamina-fill',
      'fight-hint', 'boss-ui', 'boss-name', 'boss-sub', 'boss-hp-fill', 'boss-hp-text', 'boss-line-fill',
      'boss-line-text', 'boss-cue', 'cue-progress', 'cue-key', 'cue-title', 'cue-hint', 'cue-timefill', 'cue-sweet',
      'boss-result', 'dialogue-layer', 'dialogue-portrait', 'dialogue-name', 'dialogue-role', 'dialogue-text',
      'dialogue-tone', 'dialogue-continue', 'dialogue-skip', 'modal-layer', 'modal-content', 'toast-layer',
      'fade-layer', 'cinematic-layer', 'ending-layer', 'boss-overlay', 'controls-hint', 'compass',
      'duel-ui', 'duel-phase', 'duel-count', 'duel-result', 'duel-result-title', 'duel-hp1', 'duel-hp2', 'duel-hp1-text', 'duel-hp2-text', 'duel-name2', 'duel-hint2',
    ];
    for (const id of ids) this.refs[id.replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = document.getElementById(id);
    this.refs.bootFill = this.root.querySelector('.boot-progress-fill');
    this.refs.bootStatus = this.root.querySelector('.boot-status');
    this.refs.bootQuote = this.root.querySelector('.boot-quote');
    this.refs.titleContinue = this.root.querySelector('[data-title="continue"]');
    this.refs.titleProfile = this.root.querySelector('#title-profile');
  }

  bind() {
    this.root.addEventListener('click', (e) => {
      const fs = e.target.closest('[data-fullscreen]');
      if (fs) {
        this.game.toggleFullscreen();
        return;
      }
      const accountOpen = e.target.closest('[data-account]');
      if (accountOpen) {
        this.openAccount();
        return;
      }
      const duelButton = e.target.closest('[data-duel]');
      if (duelButton) {
        if (duelButton.dataset.duel === 'rematch') this.game.duel?.rematch();
        else this.game.duel?.exit();
        return;
      }
      const duelMode = e.target.closest('[data-duel-mode]');
      if (duelMode) {
        this.closeModal();
        this.game.startDuel(duelMode.dataset.duelMode);
        return;
      }
      const t = e.target.closest('[data-title]');
      if (t) {
        const action = t.dataset.title;
        if (action === 'new') this.game.newGame();
        if (action === 'continue') this.game.continueGame();
        if (action === 'settings') this.openSettings();
        if (action === 'account') this.openAccount();
        if (action === 'duel') this.openDuelMenu();
        if (action === 'credits') this.showCredits();
        return;
      }
      const bait = e.target.closest('[data-bait]');
      if (bait) {
        const id = bait.dataset.bait;
        if (this.state.data.baits[id] > 0) {
          this.state.data.currentBait = id;
          this.state.save();
          this.refreshHUD(this.state);
          this.toast(`换上 ${BAITS[id].name}`, 'muted');
        }
        return;
      }
      const tab = e.target.closest('[data-journal-tab]');
      if (tab) {
        this.journalTab = tab.dataset.journalTab;
        this.renderJournal(this.journalTab);
        return;
      }
      const shopTab = e.target.closest('[data-shop-tab]');
      if (shopTab) {
        this.shopTab = shopTab.dataset.shopTab;
        this.renderShop();
        return;
      }
      const buyBait = e.target.closest('[data-buy-bait]');
      if (buyBait) {
        const [id, qty] = buyBait.dataset.buyBait.split(':');
        this.game.buyBait(id, Number(qty));
        this.renderShop();
        return;
      }
      const buyGear = e.target.closest('[data-buy-gear]');
      if (buyGear) {
        this.game.buyGear(buyGear.dataset.buyGear);
        this.renderShop();
        return;
      }
      const creel = e.target.closest('[data-upgrade-creel]');
      if (creel) {
        this.game.upgradeCreel();
        this.renderShop();
        return;
      }
      const sell = e.target.closest('[data-sell-fish]');
      if (sell) {
        this.game.sellFish(sell.dataset.sellFish);
        this.renderShop();
        return;
      }
      const sellAll = e.target.closest('[data-sell-all]');
      if (sellAll) {
        this.game.sellAllFish();
        this.renderShop();
        return;
      }
      const perk = e.target.closest('[data-perk]');
      if (perk) {
        this.game.unlockPerk(perk.dataset.perk);
        this.renderJournal('skills');
        return;
      }
      const fishCard = e.target.closest('[data-fish-detail]');
      if (fishCard) {
        this.renderFishDetail(fishCard.dataset.fishDetail);
        return;
      }
      const sail = e.target.closest('[data-sail]');
      if (sail) {
        const next = Number(sail.dataset.sail);
        this.closeModal();
        this.game.startTravel(next);
        return;
      }
      const close = e.target.closest('[data-close]');
      if (close) {
        this.closeModal();
        return;
      }
      const pauseBtn = e.target.closest('[data-pause]');
      if (pauseBtn) {
        const action = pauseBtn.dataset.pause;
        if (action === 'resume') this.closeModal();
        if (action === 'journal') this.openJournal('journey');
        if (action === 'settings') this.openSettings(true);
        if (action === 'title') this.game.quitToTitle();
        if (action === 'save') { this.game.save(); this.toast('旅程已保存。', 'success'); }
        return;
      }
      const ending = e.target.closest('[data-ending]');
      if (ending) {
        this.game.resolveEnding(ending.dataset.ending);
        return;
      }
      const retry = e.target.closest('[data-boss-retry]');
      if (retry) {
        this.defeatCallbacks?.onRetry?.();
        return;
      }
      const retreat = e.target.closest('[data-boss-return]');
      if (retreat) {
        this.defeatCallbacks?.onReturn?.();
        return;
      }
    });

    this.refs.dialogueLayer?.addEventListener('click', (e) => {
      if (e.target.closest('#dialogue-skip')) {
        this.finishDialogue();
        return;
      }
      this.advanceDialogue();
    });

    this.refs.modalLayer?.addEventListener('click', (e) => {
      if (e.target === this.refs.modalLayer || e.target.classList.contains('modal-backdrop')) {
        if (this.refs.modalLayer.dataset.dismissible !== '0') this.closeModal();
      }
    });

    this.root.querySelectorAll('input[data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting;
        let value = input.type === 'checkbox' ? input.checked : Number(input.value);
        this.state.settings[key] = value;
        this.state.saveSettings();
        const out = input.parentElement?.querySelector('output');
        if (out) out.textContent = input.type === 'checkbox' ? (value ? '开' : '关') : value;
        this.game.applySettings();
      });
    });
  }

  // ── boot & title ─────────────────────────────────────────────────
  showBoot() {
    this.refs.bootScreen?.classList.remove('hidden');
  }

  setLoading(progress, label = '正在听海……', quote = null) {
    if (this.refs.bootFill) this.refs.bootFill.style.width = `${Math.round(progress * 100)}%`;
    if (this.refs.bootStatus) this.refs.bootStatus.textContent = label;
    if (quote && this.refs.bootQuote) this.refs.bootQuote.textContent = quote;
  }

  hideBoot() {
    this.refs.bootScreen?.classList.add('hidden');
  }

  showTitle(hasSave) {
    this.refs.titleScreen?.classList.remove('hidden');
    this.refs.hud?.classList.add('hidden');
    if (this.refs.titleContinue) this.refs.titleContinue.style.display = hasSave ? '' : 'none';
    const profile = this.game.profiles?.active;
    if (this.refs.titleProfile) this.refs.titleProfile.textContent = `${profile?.name || '归潮者'} · 本地存档 · ${hasSave ? '已有进度' : '新旅程'}`;
    this.game.setMode('title');
    this.fadeOut(600);
  }

  hideTitle() {
    this.refs.titleScreen?.classList.add('hidden');
  }

  showDuelHud(ai = false) {
    this.refs.duelUi?.classList.remove('hidden');
    this.refs.duelResult?.classList.add('hidden');
    this.refs.duelCount?.classList.remove('hidden');
    if (this.refs.duelName2) this.refs.duelName2.textContent = ai ? '潮斗者 · AI' : '潮斗者';
    if (this.refs.duelHint2) this.refs.duelHint2.textContent = ai ? 'AI 会自动攻防 · 你只需专注自己的节奏' : '方向键 移动 · U 攻击 · I 冲刺 · O 格挡';
  }

  hideDuelHud() {
    this.refs.duelUi?.classList.add('hidden');
    this.refs.duelResult?.classList.add('hidden');
  }

  updateDuelHud(duel, phase) {
    if (!duel?.p1) return;
    const p1 = Math.max(0, duel.p1.hp);
    const p2 = Math.max(0, duel.p2.hp);
    if (this.refs.duelHp1) this.refs.duelHp1.style.width = `${p1}%`;
    if (this.refs.duelHp2) this.refs.duelHp2.style.width = `${p2}%`;
    if (this.refs.duelHp1Text) this.refs.duelHp1Text.textContent = String(p1);
    if (this.refs.duelHp2Text) this.refs.duelHp2Text.textContent = String(p2);
    if (this.refs.duelPhase) this.refs.duelPhase.textContent = phase || (duel.phase === 'fight' ? '进行中' : '准备');
    if (this.refs.duelCount) {
      if (duel.phase === 'ready') {
        this.refs.duelCount.textContent = String(Math.max(1, Math.ceil(duel.countdown)));
        this.refs.duelCount.classList.remove('hidden');
      } else {
        this.refs.duelCount.classList.add('hidden');
      }
    }
  }

  showDuelResult(title) {
    if (!this.refs.duelResult) return;
    this.refs.duelResultTitle.textContent = title;
    this.refs.duelResult.classList.remove('hidden');
    this.refs.duelCount?.classList.add('hidden');
  }

  hideDuelResult() {
    this.refs.duelResult?.classList.add('hidden');
    this.refs.duelCount?.classList.remove('hidden');
  }

  showHud() {
    this.refs.hud?.classList.remove('hidden');
    this.refs.controlsHint?.classList.remove('hidden');
    this.refreshHUD(this.state);
  }

  showTransition(text) {
    this.refs.fadeLayer.innerHTML = `<div class="transition-label"><span>潮</span><b>${text}</b><i></i></div>`;
  }

  hideTransition() {
    this.refs.fadeLayer.innerHTML = '';
  }

  fadeIn(ms = 500) {
    this.refs.fadeLayer.style.transition = `opacity ${ms}ms ease`;
    this.refs.fadeLayer.style.opacity = '1';
    this.refs.fadeLayer.classList.add('visible');
  }

  fadeOut(ms = 500) {
    this.refs.fadeLayer.style.transition = `opacity ${ms}ms ease`;
    this.refs.fadeLayer.style.opacity = '0';
    setTimeout(() => this.refs.fadeLayer.classList.remove('visible'), ms);
  }

  // ── HUD ────────────────────────────────────────────────────────────
  setChapter(chapter) {
    if (!chapter) return;
    this.refs.hudChapterNo.textContent = `第${chapter.numeral}章`;
    this.refs.hudChapterName.textContent = chapter.title;
  }

  refreshHUD(state = this.state) {
    if (!this.refs.hudCoins) return;
    this.refs.hudCoins.textContent = fmt(state.data.coins);
    this.refs.hudLevel.textContent = state.level;
    const xp = xpProgress(state.data.totalXp);
    this.refs.hudXp.style.width = pct(xp.pct);
    this.refs.hudBasket.textContent = `${state.data.fishBasket.length}/${state.creelCapacity}`;
    this.renderBaitDock(state);
    this.setChapter(state.chapter);
  }

  renderBaitDock(state = this.state) {
    if (!this.refs.baitDock) return;
    const owned = Object.entries(state.data.baits).filter(([, n]) => n > 0);
    const order = ['worm', 'shrimp', 'lure', 'glow', 'deep', 'boss1', 'boss2', 'boss3', 'boss4', 'boss5'];
    owned.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
    const current = state.data.currentBait;
    this.refs.baitDock.innerHTML = owned.slice(0, 6).map(([id, n], i) => {
      const b = BAITS[id];
      if (!b) return '';
      return `<button class="bait-chip ${id === current ? 'active' : ''}" data-bait="${id}" title="${b.desc}">
        <span class="bait-dot" style="--bait:${b.color}"></span><span class="bait-name">${b.short}</span><span class="bait-count">${n}</span><kbd>${i + 1}</kbd>
      </button>`;
    }).join('');
    if (!owned.length) this.refs.baitDock.innerHTML = '<div class="bait-empty">鱼饵用完了</div>';
  }

  setPrompt(text, key = 'E') {
    if (!text) {
      if (!this._promptHidden) {
        this._promptHidden = true;
        this.refs.prompt.classList.add('hidden');
      }
      return;
    }
    const label = key === 'LMB' ? '左键' : key;
    if (!this._promptHidden && this._promptText === text && this._promptKey === label) return;
    this._promptHidden = false;
    this._promptText = text;
    this._promptKey = label;
    this.refs.prompt.classList.remove('hidden');
    this.refs.prompt.querySelector('kbd').textContent = label;
    this.refs.prompt.querySelector('span').textContent = text;
  }

  setCrosshair(mode = 'default') {
    const c = this.refs.crosshair;
    if (!c) return;
    this.crosshairMode = this.crosshairMode || '';
    if (this.crosshairMode === mode) return;
    this.crosshairMode = mode;
    c.className = `crosshair ${mode}`;
  }

  updateCompass(yaw, playerPos, targetPos) {
    if (!this.refs.compassDeg) return;
    const norm = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    const deg = Math.round(((norm * 180) / Math.PI + 180) % 360);
    const card = deg < 22.5 || deg >= 337.5 ? 'N' : deg < 67.5 ? 'NE' : deg < 112.5 ? 'E' : deg < 157.5 ? 'SE' : deg < 202.5 ? 'S' : deg < 247.5 ? 'SW' : deg < 292.5 ? 'W' : 'NW';
    const compassText = `${card} · ${String(deg).padStart(3, '0')}°`;
    if (this._compassText !== compassText) {
      this._compassText = compassText;
      this.refs.compassDeg.textContent = compassText;
    }
    const span = Math.PI * 1.1;
    if (targetPos && playerPos) {
      const desired = Math.atan2(-(targetPos.x - playerPos.x), -(targetPos.z - playerPos.z));
      let rel = desired - yaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const left = clamp(50 - (rel / span) * 100, 3, 97);
      const leftText = `${left.toFixed(1)}%`;
      if (this._compassLeft !== leftText) {
        this._compassLeft = leftText;
        this.refs.compassMarker.style.left = leftText;
      }
      if (this._compassHidden) {
        this._compassHidden = false;
        this.refs.compassMarker.classList.remove('hidden');
      }
    } else if (!this._compassHidden) {
      this._compassHidden = true;
      this.refs.compassMarker.classList.add('hidden');
    }
  }

  setObjectiveMarker(pos) {
    this.objectivePos = pos ? { x: pos.x, y: pos.y, z: pos.z } : null;
    const hidden = !pos;
    if (this._objectiveHidden !== hidden) {
      this._objectiveHidden = hidden;
      this.refs.compassMarker?.classList.toggle('hidden', hidden);
    }
  }

  updateQuestDistance(playerPos, target, label) {
    const el = this.refs.questDistance;
    if (!el) return;
    if (!target || !playerPos) {
      if (!this._distanceHidden) {
        this._distanceHidden = true;
        el.classList.add('hidden');
      }
      return;
    }
    const dx = target.x - playerPos.x;
    const dz = target.z - playerPos.z;
    const dist = Math.round(Math.hypot(dx, dz));
    if (!Number.isFinite(dist) || dist > 999) {
      if (!this._distanceHidden) {
        this._distanceHidden = true;
        el.classList.add('hidden');
      }
      return;
    }
    const deg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
    const dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
    const dir = dirs[Math.round(deg / 45) % 8];
    const text = `${label || '目标'} · ${dist}m · ${dir}`;
    if (this._distanceText !== text) {
      this._distanceText = text;
      el.querySelector('span').textContent = text;
    }
    if (this._distanceHidden) {
      this._distanceHidden = false;
      el.classList.remove('hidden');
    }
  }

  updateQuest(obj, chapter, progress, state) {
    if (!obj) return;
    this.refs.questCard?.classList.remove('hidden');
    this.refs.questText.textContent = obj.hint || '';
    const total = obj.count || 1;
    const count = progress?.count || 0;
    if (obj.type === 'catch' || obj.type === 'catchUnique' || obj.type === 'collect') {
      this.refs.questProgress.classList.remove('hidden');
      this.refs.questProgressText.textContent = `${Math.min(count, total)} / ${total}`;
      this.refs.questProgressFill.style.width = pct(Math.min(1, count / total));
    } else {
      this.refs.questProgress.classList.add('hidden');
    }
    this.setChapter(chapter);
  }

  questComplete(obj) {
    this.refs.questCard?.classList.add('complete');
    this.toast(`目标完成 · ${obj.hint || ''}`, 'success');
    setTimeout(() => this.refs.questCard?.classList.remove('complete'), 1400);
  }

  levelUp(level, points) {
    this.toast(`钓手等级提升 · LV ${level}　获得 ${points} 点技能点`, 'level');
    this.refreshHUD(this.state);
  }

  toast(msg, type = 'muted', duration = 3800) {
    if (!msg) return;
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = { success: '✓', warn: '!', danger: '×', coin: '¤', item: '◆', level: '↑', questStep: '·' };
    t.innerHTML = `<span class="toast-icon">${icons[type] || '·'}</span><span>${msg}</span>`;
    this.refs.toastLayer.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => {
      t.classList.remove('show');
      setTimeout(() => t.remove(), 500);
    }, duration);
  }

  // ── dialogue ──────────────────────────────────────────────────────
  async playDialogue(sceneKeyOrArray, { cinematic = false } = {}) {
    let lines = typeof sceneKeyOrArray === 'string' ? SCENES[sceneKeyOrArray] : sceneKeyOrArray;
    if (!lines || !lines.length) return Promise.resolve();
    if (this.dialogue) {
      // Chain instead of overlapping.
      await new Promise((resolve) => {
        const old = this.dialogueResolve;
        this.dialogueResolve = () => { old?.(); resolve(); };
      });
    }
    this.dialogue = { lines, index: 0, cinematic, typing: false, typeText: '', fullText: '' };
    this.refs.dialogueLayer.classList.remove('hidden');
    this.refs.dialogueLayer.classList.toggle('cinematic', cinematic);
    document.body.classList.add('dialogue-active');
    this.game.setMode('dialogue');
    this.game.player?.setFrozen(true);
    this.game.input?.exitLock();
    this.game.audio?.play('uiOpen');
    this.showDialogueLine();
    return new Promise((resolve) => {
      this.dialogueResolve = resolve;
    });
  }

  showDialogueLine() {
    const d = this.dialogue;
    if (!d) return;
    const line = d.lines[d.index];
    if (!line) return this.finishDialogue();
    const who = line.who || 'narrator';
    const npc = NPCS[who];
    const isPlayer = who === 'you';
    const isNarrator = who === 'narrator' || who === 'radio' || who === 'log' || who === 'echo';
    this.refs.dialogueLayer.classList.toggle('narrator', isNarrator && who === 'narrator');
    this.refs.dialogueLayer.classList.toggle('radio', who === 'radio');
    this.refs.dialogueLayer.classList.toggle('log', who === 'log');
    this.refs.dialogueLayer.classList.toggle('echo', who === 'echo');
    this.refs.dialogueName.textContent = isPlayer ? '沈屿' : isNarrator ? '' : npc?.name || '';
    this.refs.dialogueRole.textContent = isPlayer ? '归潮者' : isNarrator ? '' : npc?.title || '';
    this.refs.dialogueTone.textContent = who === 'radio' ? '— 无线电 —' : who === 'log' ? '— 旧记录 —' : who === 'echo' ? '— 潮声 —' : '';
    const portrait = this.refs.dialoguePortrait;
    if (isNarrator || isPlayer || !npc) {
      portrait.classList.add('hidden');
    } else {
      portrait.classList.remove('hidden');
      const src = this.game.getNPCPortrait?.(who);
      portrait.querySelector('img').src = src || '';
      portrait.querySelector('img').alt = npc.name;
    }
    d.fullText = line.text;
    d.typeText = '';
    d.typing = true;
    this.typeAcc = 0;
    this.typeStart = performance.now();
    this.refs.dialogueText.textContent = '';
    this.refs.dialogueContinue.style.opacity = '0';
    this.game.audio?.play('dialogue', { pitch: who === 'shen' ? 0.8 : who === 'alan' ? 1.2 : who === 'you' ? 0.95 : 1 });
  }

  update(dt) {
    if (this.dialogue?.typing) {
      const elapsed = (performance.now() - (this.typeStart || performance.now())) / 1000;
      const n = Math.min(this.dialogue.fullText.length, Math.floor(elapsed * 34));
      this.refs.dialogueText.textContent = this.dialogue.fullText.slice(0, n);
      if (n >= this.dialogue.fullText.length) {
        this.dialogue.typing = false;
        this.refs.dialogueContinue.style.opacity = '1';
      }
    }
  }

  advanceDialogue() {
    const d = this.dialogue;
    if (!d) return;
    if (d.typing) {
      d.typing = false;
      this.refs.dialogueText.textContent = d.fullText;
      this.refs.dialogueContinue.style.opacity = '1';
      return;
    }
    d.index++;
    if (d.index >= d.lines.length) this.finishDialogue();
    else this.showDialogueLine();
  }

  finishDialogue() {
    if (!this.dialogue) return;
    const resolve = this.dialogueResolve;
    this.dialogue = null;
    this.dialogueResolve = null;
    this.refs.dialogueLayer.classList.add('hidden');
    this.refs.dialogueLayer.classList.remove('cinematic', 'narrator', 'radio', 'log', 'echo');
    document.body.classList.remove('dialogue-active');
    this.game.setMode('play');
    this.game.player?.setFrozen(false);
    this.game.input?.requestLock();
    this.game.audio?.play('uiClose');
    resolve?.();
  }

  // ── fishing ───────────────────────────────────────────────────────
  showFishingCharge(charge) {
    this.refs.fishingCharge.classList.remove('hidden');
    this.refs.chargeFill.style.width = pct(charge);
    this.refs.chargeCursor.style.left = pct(charge);
  }

  hideFishingCharge() {
    this.refs.fishingCharge.classList.add('hidden');
  }

  showBite(species) {
    this.refs.bitePrompt.classList.remove('hidden');
    this.refs.bitePrompt.classList.remove('show');
    requestAnimationFrame(() => this.refs.bitePrompt.classList.add('show'));
    this.refs.biteTitle.textContent = '咬钩了';
    this.refs.biteHint.textContent = '左键提竿';
    this.game.audio?.play('uiOpen');
  }

  hideBite() {
    this.refs.bitePrompt.classList.add('hidden');
    this.refs.bitePrompt.classList.remove('show');
  }

  showReelHud(species, stats) {
    this.refs.reelHud.classList.remove('hidden');
    this.refs.hud.classList.add('reeling');
    this.refs.reelName.textContent = species?.name || '未知鱼影';
    this.refs.reelStatus.textContent = '稳住';
    this.refs.reelStatus.className = 'reel-status';
    this.refs.tensionValue.textContent = '52';
    this.refs.integrityValue.textContent = '100%';
    this.refs.staminaFill.style.width = '100%';
    this.refs.lineProgressFill.style.width = '0%';
    this.refs.lineProgressFish.style.left = '0%';
    this.refs.tensionFill.style.height = '0%';
  }

  updateReelHud({ tension, progress, integrity, stamina, status }) {
    this.refs.tensionFill.style.height = pct(tension / 100);
    this.refs.tensionNeedle.style.bottom = pct(tension / 100);
    this.refs.tensionValue.textContent = Math.round(tension);
    this.refs.lineProgressFill.style.width = pct(progress);
    this.refs.lineProgressFish.style.left = pct(progress);
    this.refs.integrityFill.style.width = pct(integrity);
    this.refs.integrityValue.textContent = `${Math.max(0, Math.round(integrity * 100))}%`;
    this.refs.staminaFill.style.width = pct(stamina / 100);
    const statusText = { danger: '张力过高', slack: '线太松', safe: '收线中' }[status] || '稳住';
    this.refs.reelStatus.textContent = statusText;
    this.refs.reelStatus.className = `reel-status ${status}`;
    this.refs.tensionFill.className = `tension-fill ${status}`;
    this.refs.fightHint.textContent = status === 'danger' ? '松手！让线泄力' : status === 'slack' ? '按住左键，别让鱼脱钩' : '按住左键收线，松开泄力';
  }

  hideReelHud() {
    this.refs.reelHud.classList.add('hidden');
    this.refs.hud.classList.remove('reeling');
  }

  showCatch({ entry, fish, added, xp, levelUp, onSell, onRelease, onKeep, onClose }) {
    const rarity = RARITY[fish.rarity] || RARITY.common;
    const imgId = `catch-${fish.id}`;
    const html = `
      <div class="catch-card ${entry.shiny ? 'shiny' : ''}" style="--rarity:${rarity.color}">
        <button class="modal-x" data-close>${ICON.close}</button>
        <div class="catch-art">
          <div class="catch-art-glow"></div>
          <div class="catch-fish-wrap"><div class="catch-fish" id="${imgId}">${ICON.fish}</div></div>
          <div class="catch-rarity">${rarity.label}</div>
          ${entry.shiny ? '<div class="shiny-badge">潮光变种</div>' : ''}
        </div>
        <div class="catch-info">
          <div class="catch-eyebrow">渔获 · CATCH</div>
          <h2>${fish.name}</h2>
          <div class="catch-latin">${fish.latin || ''}</div>
          <p class="catch-desc">${fish.desc || ''}</p>
          <div class="catch-stats">
            <div><span>重量</span><b>${formatWeight(entry.kg)}</b></div>
            <div><span>体长</span><b>${formatLength(entry.length)}</b></div>
            <div><span>估值</span><b>${fmt(entry.value)} <small>金币</small></b></div>
            <div><span>经验</span><b>+${xp}</b></div>
          </div>
          ${entry.isRecord ? '<div class="record-badge">新纪录</div>' : ''}
          ${!added ? '<div class="catch-warn">鱼篓已满。你可以直接出售这条鱼，或把它放回海里。</div>' : ''}
          <div class="catch-actions">
            ${added ? '<button class="btn primary" data-catch-keep>收入鱼篓</button>' : ''}
            <button class="btn" data-catch-sell>出售 · ${fmt(entry.value)} 金币</button>
            <button class="btn ghost" data-catch-release>放生</button>
          </div>
          <div class="catch-note">按 Esc 或点击空白处继续</div>
        </div>
      </div>`;
    this.openModal(html, { kind: 'catch', wide: true, onClose });
    const fishEl = document.getElementById(imgId);
    this.applyFishPortrait(fishEl, fish);
    this.refs.modalContent.querySelector('[data-catch-keep]')?.addEventListener('click', onKeep);
    this.refs.modalContent.querySelector('[data-catch-sell]')?.addEventListener('click', onSell);
    this.refs.modalContent.querySelector('[data-catch-release]')?.addEventListener('click', onRelease);
    if (!added) this.refs.modalContent.querySelector('[data-catch-keep]')?.remove();
  }

  applyFishPortrait(el, fish) {
    if (!el) return;
    const cached = this.fishPortraitCache.get(fish.id);
    if (cached) {
      el.innerHTML = `<img src="${cached}" alt="${fish.name}"/>`;
      return;
    }
    const p = this.game.getFishPortrait?.(fish);
    if (!p) return;
    Promise.resolve(p).then((src) => {
      if (!src) return;
      this.fishPortraitCache.set(fish.id, src);
      el.innerHTML = `<img src="${src}" alt="${fish.name}"/>`;
    }).catch(() => {});
  }

  // ── modal framework ───────────────────────────────────────────────
  openModal(html, { kind = 'generic', wide = false, dismissible = true, onClose = null } = {}) {
    this.modalKind = kind;
    this.refs.modalLayer.classList.remove('hidden');
    this.refs.modalContent.className = `modal-content ${wide ? 'wide' : ''} ${kind}`;
    this.refs.modalContent.innerHTML = html;
    this.game.setMode('menu');
    this.game.player?.setFrozen(true);
    this.game.input?.exitLock();
    this.refs.modalLayer.dataset.dismissible = dismissible ? '1' : '0';
    this.modalOnClose = onClose || null;
    this.game.audio?.play('uiOpen');
  }

  closeModal() {
    if (this.refs.modalLayer.classList.contains('hidden')) return;
    this.refs.modalLayer.classList.add('hidden');
    this.refs.modalContent.innerHTML = '';
    this.refs.modalLayer.style.zIndex = '';
    this.modalKind = null;
    const onClose = this.modalOnClose;
    this.modalOnClose = null;
    onClose?.();
    const onTitle = !this.refs.titleScreen.classList.contains('hidden');
    const onEnding = !this.refs.endingLayer.classList.contains('hidden');
    if (onTitle) {
      this.game.setMode('title');
    } else if (onEnding) {
      this.game.setMode('ending');
      this.game.player?.setFrozen(true);
    } else if (this.game.mode === 'menu') {
      this.game.setMode('play');
      this.game.player?.setFrozen(false);
      this.game.input?.requestLock();
    }
    this.game.audio?.play('uiClose');
    this.refreshHUD(this.state);
  }

  confirmNewGame(onConfirm) {
    this.openModal(`<div class="confirm-modal"><div class="modal-eyebrow">A NEW TIDE</div><h2>开始一段新的旅程？</h2><p>旧存档会被潮水带走。图鉴、渔获与故事进度都会重新开始。</p><div class="confirm-actions"><button class="btn ghost" data-close>留在现在</button><button class="btn danger" data-confirm-new>重新启程</button></div></div>`, { kind: 'confirm' });
    this.refs.modalContent.querySelector('[data-confirm-new]')?.addEventListener('click', () => {
      this.closeModal();
      onConfirm?.();
    });
  }

  openSettings() {
    const html = `<div class="settings-standalone">${this.settingsContent()}<div class="settings-close"><button class="btn ghost" data-close>完成</button></div></div>`;
    this.openModal(html, { kind: 'settings', wide: false });
    this.bindSettingsInputs();
  }

  openDuelMenu() {
    const html = `<div class="duel-menu">
      <div class="modal-eyebrow">TIDE DUEL · 1V1</div><h2>潮斗</h2>
      <p class="muted">在同一块潮石上决出胜负。先击倒对方者获胜；格挡可以把 12 点伤害压到 4 点。</p>
      <div class="duel-modes">
        <button class="duel-mode" data-duel-mode="local"><b>双人同屏</b><span>P1 WASD · J 攻击 · K 冲刺 · L 格挡</span><span>P2 方向键 · U 攻击 · I 冲刺 · O 格挡</span></button>
        <button class="duel-mode" data-duel-mode="ai"><b>单人挑战 AI</b><span>你控制沈屿</span><span>潮斗者会自动逼近、攻击和格挡</span></button>
      </div>
      <div class="settings-close"><button class="btn ghost" data-close>返回</button></div>
    </div>`;
    this.openModal(html, { kind: 'duel-menu', wide: false });
  }

  openAccount() {
    const profiles = this.game.profiles;
    const active = profiles.active;
    const rows = profiles.list.map((p) => `
      <div class="account-row ${p.id === active.id ? 'current' : ''}">
        <div><b>${p.name}</b><span>${p.guest ? '游客存档' : 'PIN 保护'}${p.lastPlayed ? ` · ${new Date(p.lastPlayed).toLocaleDateString('zh-CN')}` : ''}</span></div>
        ${p.id === active.id
          ? '<em>当前</em>'
          : `<button class="btn ghost small" data-account-switch="${p.id}">进入</button>`}
      </div>`).join('');
    const html = `<div class="account-modal">
      <div class="modal-eyebrow">LOCAL ARCHIVE</div><h2>潮声档案</h2>
      <p class="muted">账号只保存在此浏览器。换设备或清理浏览器前，请导出存档；导入可恢复。</p>
      <div class="account-current"><span>当前账号</span><b>${active.name}</b><small>${this.state.hasSave() ? '已有进度' : '尚无进度'}</small></div>
      <div class="account-list">${rows}</div>
      <div class="account-form">
        <input id="account-name" maxlength="14" placeholder="账号名（2–14 字）" autocomplete="username"/>
        <input id="account-pin" type="password" inputmode="numeric" maxlength="8" placeholder="4–8 位 PIN" autocomplete="current-password"/>
        <div class="account-form-actions"><button class="btn primary small" data-account-login>登录</button><button class="btn small" data-account-create>创建账号</button></div>
      </div>
      <div class="account-transfer"><button class="btn ghost small" data-save-export>导出当前存档</button><button class="btn ghost small" data-import-trigger>导入存档文件</button></div>
      <input id="save-import-file" type="file" accept="application/json,.json" hidden/>
      <div class="account-note">本地账号用于区分多个存档，不是云端登录。游客账号无需 PIN；“创建账号”会把当前进度复制到新账号。</div>
      <div class="settings-close"><button class="btn ghost" data-close>关闭</button></div>
    </div>`;
    this.openModal(html, { kind: 'account', wide: false });
    this.refs.modalContent.querySelectorAll('[data-account-switch]').forEach((btn) => {
      btn.addEventListener('click', () => this.game.switchProfile(btn.dataset.accountSwitch));
    });
    this.refs.modalContent.querySelector('[data-account-login]')?.addEventListener('click', () => {
      const name = this.refs.modalContent.querySelector('#account-name')?.value || '';
      const pin = this.refs.modalContent.querySelector('#account-pin')?.value || '';
      this.game.loginProfile(name, pin);
    });
    this.refs.modalContent.querySelector('[data-account-create]')?.addEventListener('click', () => {
      const name = this.refs.modalContent.querySelector('#account-name')?.value || '';
      const pin = this.refs.modalContent.querySelector('#account-pin')?.value || '';
      this.game.createProfile(name, pin);
    });
    this.refs.modalContent.querySelector('[data-save-export]')?.addEventListener('click', () => this.game.exportSave());
    this.refs.modalContent.querySelector('[data-import-trigger]')?.addEventListener('click', () => {
      this.refs.modalContent.querySelector('#save-import-file')?.click();
    });
    this.refs.modalContent.querySelector('#save-import-file')?.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        this.game.importSave(await file.text());
      } catch (e) {
        this.toast('存档文件无法读取。', 'warn');
      }
    });
  }

  // ── shop ──────────────────────────────────────────────────────────
  openShop() {
    this.shopTab = 'bait';
    this.game.setMode('menu');
    this.game.player?.setFrozen(true);
    this.game.input?.exitLock();
    this.renderShop();
  }

  renderShop() {
    const st = this.state;
    const coins = st.data.coins;
    const tab = this.shopTab || 'bait';
    let body = '';
    if (tab === 'bait') {
      body = `<div class="shop-grid">${SHOP_BAITS.map((id) => {
        const b = BAITS[id];
        const owned = st.data.baits[id] || 0;
        return `<div class="shop-card">
          <div class="shop-icon" style="--c:${b.color}"><span></span></div>
          <div class="shop-card-main"><div class="shop-name">${b.name}<em>${b.tag}</em></div><p>${b.desc}</p>
          <div class="shop-meta">持有 ${owned} · 单价 ${b.price} 金币</div></div>
          <div class="shop-buy"><button class="btn small" data-buy-bait="${id}:1" ${coins < b.price ? 'disabled' : ''}>×1</button><button class="btn small primary" data-buy-bait="${id}:5" ${coins < b.price * 5 ? 'disabled' : ''}>×5</button></div>
        </div>`;
      }).join('')}</div>`;
    } else if (tab === 'gear') {
      body = `<div class="gear-tabs">${[['rod', '鱼竿', RODS], ['reel', '卷线器', REELS], ['line', '钓线', LINES]].map(([kind, name]) => {
        const arr = kind === 'rod' ? RODS : kind === 'reel' ? REELS : LINES;
        const cur = st.data.equipment[kind];
        const next = arr[cur + 1];
        const Item = arr[cur];
        return `<div class="gear-card">
          <div class="gear-title"><span>${name}</span><b>${Item.name}</b><em>+${st.data.equipment.upgrades?.[kind] || 0}</em></div>
          <div class="gear-compare">
            <div><span>当前</span><strong>${kind === 'rod' ? `抛投 ${Item.cast.toFixed(2)}x · 力量 ${Item.power.toFixed(2)}x` : kind === 'reel' ? `收线 ${Item.speed.toFixed(2)}x · 泄力 ${Item.recovery.toFixed(2)}x` : `强度 ${Item.strength.toFixed(2)}x · 线体 ${Item.integrity.toFixed(2)}x`}</strong></div>
            ${next ? `<div class="next"><span>下一阶</span><strong>${next.name}</strong><p>${next.desc}</p><em>${next.price} 金币 · 第${next.chapter}章解锁</em><button class="btn primary small" data-buy-gear="${kind}" ${coins < next.price || st.data.chapter < next.chapter ? 'disabled' : ''}>购入升级</button></div>` : '<div class="next maxed">已是最新一代。</div>'}
          </div>
        </div>`;
      }).join('')}</div>`;
    } else if (tab === 'creel') {
      const levels = [18, 32, 52];
      const next = st.data.creel + 1;
      const prices = { 1: 450, 2: 1400 };
      body = `<div class="creel-card">
        <div class="creel-illustration">${ICON.fish}<div class="creel-num">${st.data.creelCapacity}</div><span>格鱼篓</span></div>
        <div><h3>藤编鱼篓</h3><p>阿岚亲手编的鱼篓。每一格都垫了海草，鱼获能多活半天。</p>
        ${next < 3 ? `<div class="creel-next">升级至 ${levels[next]} 格 · ${prices[next]} 金币</div><button class="btn primary" data-upgrade-creel ${coins < prices[next] ? 'disabled' : ''}>升级鱼篓</button>` : '<div class="creel-next">已经是最大容量。</div>'}
        </div></div>`;
    } else if (tab === 'sell') {
      const fish = st.data.fishBasket;
      body = `<div class="sell-head"><span>鱼篓 ${fish.length}/${st.data.creelCapacity}</span><button class="btn primary small" data-sell-all ${!fish.length ? 'disabled' : ''}>全部出售</button></div>
      <div class="sell-list">${fish.length ? fish.map((f) => {
        const def = FISH[f.species];
        return `<div class="sell-item"><div class="sell-thumb" data-thumb="${f.species}"></div><div class="sell-info"><b>${def?.name || f.species}</b><span>${formatWeight(f.kg)} · ${f.isRecord ? '纪录' : (RARITY[def?.rarity || 'common'].label)}</span></div><div class="sell-price">${fmt(f.value)} <small>金币</small></div><button class="btn small" data-sell-fish="${f.uid}">出售</button></div>`;
      }).join('') : '<div class="empty-state">鱼篓空空。去栈桥边试试手气。</div>'}</div>`;
      setTimeout(() => {
        this.refs.modalContent.querySelectorAll('[data-thumb]').forEach((el) => {
          const def = FISH[el.dataset.thumb];
          if (def) this.applyFishPortrait(el, def);
        });
      }, 0);
    }
    const html = `<div class="shop-modal">
      <div class="modal-head"><div><div class="modal-eyebrow">TIDE & TRINKET</div><h2>潮汐杂货铺</h2><p>阿岚把算盘拨得很响。</p></div><div class="modal-coins">${ICON.coin}<b>${fmt(coins)}</b></div><button class="modal-x" data-close>${ICON.close}</button></div>
      <div class="shop-tabs">${[['bait', '鱼饵'], ['gear', '钓具'], ['creel', '鱼篓'], ['sell', '出售']].map(([id, label]) => `<button class="${tab === id ? 'active' : ''}" data-shop-tab="${id}">${label}</button>`).join('')}</div>
      <div class="shop-body">${body}</div>
      <div class="modal-foot"><span>所有价格以归墟海通用金币计。</span><span>“不赊账。”</span></div>
    </div>`;
    this.openModal(html, { kind: 'shop', wide: true });
    this.game.audio?.play('uiOpen');
  }

  // ── journal ───────────────────────────────────────────────────────
  openJournal(tab = 'journey') {
    this.journalTab = tab;
    this.game.setMode('menu');
    this.game.player?.setFrozen(true);
    this.game.input?.exitLock();
    this.renderJournal(tab);
  }

  renderJournal(tab) {
    const st = this.state;
    const ch = st.chapter;
    const obj = st.objective;
    let content = '';
    if (tab === 'journey') {
      content = `<div class="journal-journey">
        <div class="journey-hero"><div class="journey-no">第${ch.numeral}章</div><h2>${ch.title}</h2><div class="journey-en">${ch.en}</div><p>“${ch.epigraph}”</p></div>
        <div class="journey-current"><div class="eyebrow">当前目标</div><h3>${obj?.hint || '旅途已经结束。'}</h3>
        <div class="journey-progress"><span>${st.data.objective + 1} / ${ch.objectives.length}</span><div><i style="width:${pct((st.data.objective + (obj ? 0.2 : 0)) / ch.objectives.length)}"></i></div></div></div>
        <div class="journey-story">${CHAPTERS.filter((c) => c.id < ch.id).map((c) => `<div class="story-row"><div>第${c.numeral}章</div><div><b>${c.title}</b><p>${CHAPTER_SUMMARY[c.id]}</p></div></div>`).join('') || '<p class="muted">故事才刚刚开始。</p>'}</div>
        <div class="journey-items"><div class="eyebrow">行囊</div><div class="item-grid">${Object.entries(st.data.items).filter(([, n]) => n > 0).map(([id]) => `<div class="item-chip"><span>${ITEMS[id]?.name || id}</span><b>×${n}</b></div>`).join('') || '<span class="muted">只有一卷旧线和一点海盐。</span>'}</div></div>
      </div>`;
    } else if (tab === 'bestiary') {
      const caught = Object.keys(st.data.catches).length;
      content = `<div class="bestiary">
        <div class="bestiary-head"><div><div class="eyebrow">FISH ENCYCLOPEDIA</div><h2>潮生图鉴</h2><p>记录你在归墟海遇见过的每一种生命。</p></div><div class="bestiary-count"><b>${caught}</b><span>/ ${FISH_LIST.length}</span><em>已记录</em></div></div>
        ${CHAPTERS.map((c) => {
          const list = speciesForIsland(c.island);
          if (!list.length) return '';
          return `<div class="bestiary-section"><div class="bestiary-section-title"><span>第${c.numeral}章</span>${ISLAND_NAMES[c.island]}</div><div class="bestiary-grid">${list.map((f) => {
            const isCaught = !!st.data.catches[f.id];
            const rec = st.data.records[f.id];
            return `<button class="fish-card ${isCaught ? 'caught' : 'locked'}" data-fish-detail="${f.id}">
              <div class="fish-card-art" data-fishthumb="${f.id}">${isCaught ? ICON.fish : '<span>?</span>'}</div>
              <div class="fish-card-info"><b>${isCaught ? f.name : '未记录'}</b><span>${isCaught ? (rec ? formatWeight(rec.kg) : RARITY[f.rarity].label) : '？？？'}</span></div>
            </button>`;
          }).join('')}</div></div>`;
        }).join('')}
        <div class="bestiary-section"><div class="bestiary-section-title"><span>潮主</span>潮鸣之底</div><div class="bestiary-grid">${FISH_LIST.filter((f) => f.boss).map((f) => {
          const isCaught = !!st.data.catches[f.id];
          const rec = st.data.records[f.id];
          return `<button class="fish-card ${isCaught ? 'caught' : 'locked'}" data-fish-detail="${f.id}">
            <div class="fish-card-art" data-fishthumb="${f.id}">${isCaught ? ICON.fish : '<span>?</span>'}</div>
            <div class="fish-card-info"><b>${isCaught ? f.name : '未记录'}</b><span>${isCaught ? (rec ? formatWeight(rec.kg) : RARITY[f.rarity].label) : '？？？'}</span></div>
          </button>`;
        }).join('')}</div></div>
      </div>`;
      setTimeout(() => {
        this.refs.modalContent.querySelectorAll('[data-fishthumb]').forEach((el) => {
          const f = FISH[el.dataset.fishthumb];
          if (f && st.data.catches[f.id]) this.applyFishPortrait(el, f);
        });
      }, 0);
    } else if (tab === 'skills') {
      const xp = xpProgress(st.data.totalXp);
      content = `<div class="skills">
        <div class="skills-head"><div><div class="eyebrow">ANGLER'S PATH</div><h2>潮感</h2><p>每一次收线，都会留下一点什么。</p></div><div class="skill-level"><div class="level-ring"><b>${st.level}</b><span>LV</span></div><div><span>技能点</span><b>${st.data.perkPoints}</b><div class="xp-line"><i style="width:${pct(xp.pct)}"></i></div><small>${xp.current} / ${xp.need} XP</small></div></div></div>
        <div class="perk-grid">${PERKS.map((p) => {
          const owned = st.data.perks.includes(p.id);
          const canReq = (p.req || []).every((r) => st.data.perks.includes(r));
          const can = !owned && canReq && st.data.perkPoints >= p.cost;
          return `<button class="perk-card ${owned ? 'owned' : ''} ${canReq ? '' : 'locked'}" data-perk="${p.id}" ${can ? '' : 'disabled'}>
            <div class="perk-icon">${p.icon}</div><div class="perk-name">${p.name}</div><p>${p.desc}</p><div class="perk-cost">${owned ? '已习得' : `${p.cost} 点`}</div>
          </button>`;
        }).join('')}</div>
        <div class="skill-foot">升级可获得技能点。已习得 ${st.data.perks.length} / ${PERKS.length}。</div>
      </div>`;
    } else if (tab === 'map') {
      content = `<div class="map-journal">
        <div class="modal-eyebrow">THE RETURNING SEA</div><h2>归墟海图</h2><p class="map-sub">灯塔为针，潮声为线。</p>
        <div class="map-route">
          <svg viewBox="0 0 900 420" class="map-svg">
            <defs><radialGradient id="islandGlow"><stop offset="0" stop-color="#e9c27b" stop-opacity=".35"/><stop offset="1" stop-color="#0d2629" stop-opacity="0"/></radialGradient></defs>
            <path d="M85 320 C 210 260, 250 360, 360 280 S 520 170, 610 235 S 760 170, 820 95" fill="none" stroke="#897957" stroke-width="1.2" stroke-dasharray="6 7" opacity=".7"/>
            ${CHAPTERS.map((c, i) => {
              const x = [90, 270, 470, 660, 820][i];
              const y = [315, 290, 235, 215, 95][i];
              const unlocked = c.id <= st.data.chapter || st.data.completed;
              return `<g class="map-node ${c.id === st.data.chapter ? 'current' : ''} ${unlocked ? '' : 'locked'}">
                <circle cx="${x}" cy="${y}" r="56" fill="url(#islandGlow)" opacity="${unlocked ? 1 : 0.2}"/>
                <circle cx="${x}" cy="${y}" r="7" fill="${unlocked ? '#e9c27b' : '#4b5451'}" stroke="#f4e7c9" stroke-width="1"/>
                <text x="${x}" y="${y + 34}" text-anchor="middle" fill="${unlocked ? '#f2e5c7' : '#707874'}" font-size="17" font-family="Noto Serif SC Variable, serif">${unlocked ? c.islandName || ISLAND_NAMES[c.island] : '？？？'}</text>
                <text x="${x}" y="${y - 26}" text-anchor="middle" fill="#b7a98b" font-size="11" letter-spacing="2">${c.id <= st.data.chapter ? `CH.${c.id}` : 'LOCKED'}</text>
              </g>`;
            }).join('')}
          </svg>
        </div>
        <div class="map-objective"><span>当前目标</span>${this.game.quest.objective?.hint || '自由探索'} <b>${this.game.quest.getTargetLabel()}</b></div>
        <div class="map-caption">当前：${ch.title} · ${ISLAND_NAMES[ch.island]}　|　已点亮 ${st.data.chapterCleared.length} / ${CHAPTERS.length} 座潮心</div>
      </div>`;
    } else if (tab === 'settings') {
      content = this.settingsContent();
    }
    const tabs = [['journey', '旅程'], ['bestiary', '图鉴'], ['skills', '潮感'], ['map', '海图'], ['settings', '设置']];
    const html = `<div class="journal-modal">
      <div class="journal-side"><div class="journal-brand"><span>潮</span><b>TIDESONG</b><small>FIELD NOTES</small></div><div class="journal-nav">${tabs.map(([id, label]) => `<button class="${tab === id ? 'active' : ''}" data-journal-tab="${id}">${label}</button>`).join('')}</div><div class="journal-foot">按 <kbd>Tab</kbd> 关闭</div></div>
      <div class="journal-main"><button class="modal-x" data-close>${ICON.close}</button>${content}</div>
    </div>`;
    this.openModal(html, { kind: 'journal', wide: true });
    if (tab === 'settings') this.bindSettingsInputs();
  }

  settingsContent() {
    const s = this.state.settings;
    return `<div class="settings-panel">
      <div class="modal-eyebrow">SETTINGS</div><h2>设置</h2><p class="muted">调校潮声与画面。</p>
      <div class="setting-row"><label>存档账号</label><button class="btn small" data-account><span>${this.game.profiles?.active?.name || '归潮者'}</span><small>切换 / 导出</small></button></div>
      <div class="setting-row"><label>画面质量</label><div class="segmented" data-quality>${['high', 'medium', 'low'].map((q) => `<button data-setting-quality="${q}" class="${s.quality === q ? 'active' : ''}">${q === 'high' ? '电影' : q === 'medium' ? '均衡' : '流畅'}</button>`).join('')}</div></div>
      <div class="setting-row"><label>主音量 <output>${s.volume.toFixed(2)}</output></label><input type="range" min="0" max="1" step="0.01" value="${s.volume}" data-setting="volume"/></div>
      <div class="setting-row"><label>音乐 <output>${s.music.toFixed(2)}</output></label><input type="range" min="0" max="1" step="0.01" value="${s.music}" data-setting="music"/></div>
      <div class="setting-row"><label>鼠标灵敏度 <output>${s.sensitivity.toFixed(1)}</output></label><input type="range" min="0.3" max="2" step="0.1" value="${s.sensitivity}" data-setting="sensitivity"/></div>
      <div class="setting-row"><label>视野 <output>${s.fov}</output></label><input type="range" min="60" max="90" step="1" value="${s.fov}" data-setting="fov"/></div>
      <div class="setting-row"><label>反转 Y 轴</label><button class="toggle ${s.invertY ? 'on' : ''}" data-toggle-setting="invertY"><i></i><span>${s.invertY ? '开' : '关'}</span></button></div>
      <div class="setting-row"><label>镜头震动</label><button class="toggle ${s.shake ? 'on' : ''}" data-toggle-setting="shake"><i></i><span>${s.shake ? '开' : '关'}</span></button></div>
      <div class="setting-row"><label>全屏显示</label><button class="btn small" data-fullscreen><span data-fullscreen-label>${document.fullscreenElement ? '退出全屏' : '进入全屏'}</span><small>F11</small></button></div>
      <div class="setting-row"><label>重新开始</label><button class="btn danger small" data-reset-save>抹去存档</button></div>
      <div class="settings-note">环境光影与材质来自 Poly Haven（CC0）。字体为 Noto Serif / Sans SC（OFL）。其余内容均为原创。</div>
    </div>`;
  }

  bindSettingsInputs() {
    this.refs.modalContent.querySelectorAll('[data-setting]').forEach((input) => {
      input.addEventListener('input', () => {
        const key = input.dataset.setting;
        const value = Number(input.value);
        this.state.settings[key] = value;
        this.state.saveSettings();
        const out = input.parentElement?.querySelector('output');
        if (out) out.textContent = key === 'fov' ? value : value.toFixed(2);
        this.game.applySettings();
      });
    });
    this.refs.modalContent.querySelectorAll('[data-setting-quality]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.state.settings.quality = btn.dataset.settingQuality;
        this.state.saveSettings();
        this.game.applySettings();
        this.renderJournal('settings');
      });
    });
    this.refs.modalContent.querySelectorAll('[data-toggle-setting]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.toggleSetting;
        this.state.settings[key] = !this.state.settings[key];
        this.state.saveSettings();
        this.game.applySettings();
        this.renderJournal('settings');
      });
    });
    this.refs.modalContent.querySelector('[data-reset-save]')?.addEventListener('click', () => {
      this.openModal(`<div class="confirm-modal"><div class="modal-eyebrow">IRREVERSIBLE</div><h2>让潮水抹去这段旅程？</h2><p>所有渔获、图鉴、等级与故事进度都会消失。</p><div class="confirm-actions"><button class="btn ghost" data-close>再想想</button><button class="btn danger" data-confirm-reset>确认抹去</button></div></div>`, { kind: 'confirm' });
      this.refs.modalContent.querySelector('[data-confirm-reset]')?.addEventListener('click', () => {
        this.state.reset(false);
        this.game.clearSave();
        this.closeModal();
        this.game.quitToTitle(true, false);
      });
    });
  }

  renderFishDetail(fishId) {
    const f = FISH[fishId];
    if (!f) return;
    const st = this.state;
    const caught = st.data.catches[fishId];
    const rec = st.data.records[fishId];
    const html = `<div class="detail-modal ${caught ? '' : 'locked'}">
      <button class="modal-x" data-close>${ICON.close}</button>
      <div class="detail-art" id="detail-art">${caught ? ICON.fish : '<span class="detail-lock">?</span>'}</div>
      <div class="detail-body">
        <div class="catch-eyebrow">${caught ? 'RECORDED' : 'UNRECORDED'}</div>
        <h2>${caught ? f.name : '未记录'}</h2>
        <div class="catch-latin">${caught ? f.latin : '？？？'}</div>
        <div class="detail-tags"><span>${RARITY[f.rarity].label}</span><span>${f.habitat}</span><span>${f.active}</span></div>
        <p>${caught ? f.desc : '图鉴里还留着一页空白。也许该换一种饵，去更深的地方看看。'}</p>
        <div class="detail-clue">${f.clue}</div>
        ${caught ? `<div class="detail-stats"><div><span>捕获次数</span><b>${caught.count}</b></div><div><span>最重纪录</span><b>${rec ? formatWeight(rec.kg) : '—'}</b></div><div><span>最长纪录</span><b>${rec ? formatLength(rec.length) : '—'}</b></div><div><span>基础价</span><b>${f.boss ? '无法出售' : `${f.price}/kg`}</b></div></div>` : ''}
      </div>
    </div>`;
    this.openModal(html, { kind: 'fish-detail' });
    if (caught) this.applyFishPortrait(document.getElementById('detail-art'), f);
  }

  // ── pause ─────────────────────────────────────────────────────────
  openPause() {
    this.pauseOpen = true;
    const html = `<div class="pause-modal">
      <div class="pause-mark">潮</div><div class="modal-eyebrow">PAUSED</div><h2>潮水停了一瞬</h2><p>所有声音都在等你。</p>
      <div class="pause-actions"><button class="btn primary" data-pause="resume">继续旅程</button><button class="btn" data-pause="journal">岸边手记</button><button class="btn" data-pause="settings">设置</button><button class="btn" data-fullscreen><span data-fullscreen-label>${document.fullscreenElement ? '退出全屏' : '进入全屏'}</span></button><button class="btn" data-pause="save">保存进度</button><button class="btn ghost" data-pause="title">回到标题</button></div>
      <div class="pause-foot">当前进度已自动保存。</div>
    </div>`;
    this.openModal(html, { kind: 'pause' });
    this.game.player?.setFrozen(true);
    this.game.input?.exitLock();
  }

  closePause() {
    this.pauseOpen = false;
  }

  // ── chapter / travel ──────────────────────────────────────────────
  async showChapterCard(ch) {
    return new Promise((resolve) => {
      const layer = this.refs.cinematicLayer;
      this.refs.hud.classList.add('hidden');
      layer.classList.remove('hidden');
      layer.innerHTML = `<div class="chapter-card">
        <div class="chapter-card-bg"></div>
        <div class="chapter-card-inner">
          <div class="chapter-number">第 ${ch.numeral} 章</div>
          <div class="chapter-rule"></div>
          <h1>${ch.title}</h1>
          <div class="chapter-en">${ch.en}</div>
          <p>${ch.epigraph}</p>
          <div class="chapter-location">${ISLAND_NAMES[ch.island]} · ${ISLANDS[ch.island].en}</div>
        </div>
        <button class="chapter-skip">点击继续</button>
      </div>`;
      this.game.setMode('cinematic');
      this.game.player?.setFrozen(true);
      this.game.input?.exitLock();
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        layer.classList.add('hidden');
        layer.innerHTML = '';
        this.refs.hud.classList.remove('hidden');
        resolve();
      };
      const timer = setTimeout(done, 5200);
      layer.querySelector('.chapter-skip').addEventListener('click', (e) => {
        e.stopPropagation();
        done();
      });
      layer.addEventListener('click', done, { once: true });
    });
  }

  showTravelMap(nextChapter) {
    const ch = getChapter(nextChapter);
    const cur = this.state.chapter;
    const html = `<div class="travel-modal">
      <div class="modal-eyebrow">SET SAIL</div><h2>启航 · ${ISLAND_NAMES[ch.island]}</h2><p class="muted">第${ch.numeral}章　${ch.title}</p>
      <div class="travel-map">
        <div class="travel-point current"><span>${ISLAND_NAMES[cur.island]}</span><small>现在</small></div>
        <div class="travel-line"><i></i><span>≈ ${18 + nextChapter * 7} 海里</span></div>
        <div class="travel-point next"><span>${ISLAND_NAMES[ch.island]}</span><small>目的地</small></div>
      </div>
      <div class="travel-quote">“${ch.epigraph}”</div>
      <div class="travel-actions"><button class="btn ghost" data-close>再等等</button><button class="btn primary" data-sail="${nextChapter}">启航</button></div>
      <div class="modal-foot">启航后仍可返回旧岛探索（通关后开放）。</div>
    </div>`;
    this.openModal(html, { kind: 'travel', wide: true });
  }

  // ── boss ──────────────────────────────────────────────────────────
  showBossHud(def, sub) {
    this.refs.bossUi.classList.remove('hidden');
    this.refs.bossName.textContent = def.name;
    this.refs.bossSub.textContent = `${def.boss?.title || ''} · ${sub}`;
    this.refs.bossHpFill.style.width = '100%';
    this.refs.bossHpText.textContent = '100%';
    this.refs.bossLineFill.style.width = '100%';
    this.refs.bossLineText.textContent = '100%';
    this.refs.bossCue.classList.add('hidden');
    this.refs.bossResult.textContent = '';
    document.body.classList.add('boss-active');
  }

  updateBossHud(hp, integrity, phase) {
    this.refs.bossHpFill.style.width = `${clamp(hp / 100)}%`;
    this.refs.bossHpText.textContent = `${Math.ceil(hp)}%`;
    this.refs.bossLineFill.style.width = `${clamp(integrity / 100)}%`;
    this.refs.bossLineText.textContent = `${Math.round(integrity)}%`;
    this.refs.bossUi.dataset.phase = String(phase);
  }

  showBossIntro(def) {
    const overlay = this.refs.bossOverlay;
    overlay.classList.remove('hidden');
    overlay.innerHTML = `<div class="boss-intro">
      <div class="boss-intro-glow"></div>
      <div class="boss-intro-kicker">TIDE LORD · ${(def.boss?.element || '潮主')}</div>
      <h1>${def.name}</h1>
      <div class="boss-intro-latin">${def.latin}</div>
      <p>${def.boss?.title || ''}</p>
      <div class="boss-intro-rule"></div>
      <div class="boss-intro-hint">握紧你的竿</div>
    </div>`;
    setTimeout(() => overlay.classList.add('show'), 20);
    setTimeout(() => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.classList.add('hidden'), 800);
    }, 3400);
  }

  hideBossIntro() {
    this.refs.bossOverlay.classList.add('hidden');
  }

  showBossCue(cueText, cue, phaseLevel) {
    this.bossCueData = cueText;
    this.refs.bossCue.classList.remove('hidden');
    this.refs.bossCue.dataset.type = cue.type;
    this.refs.cueKey.textContent = cue.type === 'STRIKE' ? 'SPACE' : cue.type;
    this.refs.cueTitle.textContent = cueText.title;
    this.refs.cueHint.textContent = cueText.hint;
    this.refs.cueProgress.style.strokeDashoffset = '0';
    this.refs.cueTimefill.style.width = '0%';
    this.refs.cueSweet.style.left = cue.type === 'STRIKE' ? '38%' : '0%';
    this.refs.cueSweet.style.width = cue.type === 'STRIKE' ? '26%' : '100%';
    this.refs.cueSweet.style.display = cue.type === 'STRIKE' ? '' : 'none';
    this.refs.bossResult.textContent = '';
    this.refs.bossResult.className = 'boss-result';
  }

  updateBossCue(cue, held) {
    const p = clamp(cue.time / cue.duration);
    this.refs.cueTimefill.style.width = pct(p);
    const circ = 2 * Math.PI * 52;
    this.refs.cueProgress.style.strokeDasharray = `${circ}`;
    this.refs.cueProgress.style.strokeDashoffset = `${circ * (1 - p)}`;
    this.refs.bossCue.classList.toggle('holding', held);
  }

  hideBossCue() {
    this.refs.bossCue.classList.add('hidden');
  }

  bossCueResult(success, reason) {
    const el = this.refs.bossResult;
    el.textContent = success ? (reason || '稳住了') : (reason || '线在尖叫');
    el.className = `boss-result ${success ? 'good' : 'bad'} show`;
    this.game.addShake(success ? 0.05 : 0.2);
    setTimeout(() => el.classList.remove('show'), 800);
  }

  showBossPhase(def, phase) {
    const overlay = this.refs.bossOverlay;
    overlay.classList.remove('hidden');
    overlay.classList.add('show');
    overlay.innerHTML = `<div class="boss-phase"><div class="phase-kicker">PHASE ${phase + 1}</div><h2>${phase === 1 ? '潮主被激怒了' : '最后的挣扎'}</h2><p>“${def.boss?.title || ''}”</p><div class="phase-line"></div></div>`;
    setTimeout(() => {
      overlay.classList.remove('show');
      setTimeout(() => overlay.classList.add('hidden'), 600);
    }, 2000);
  }

  hideBossPhase() {
    this.refs.bossOverlay.classList.add('hidden');
    this.refs.bossOverlay.classList.remove('show');
  }

  showBossVictory(def) {
    const overlay = this.refs.bossOverlay;
    overlay.classList.remove('hidden');
    overlay.classList.add('show');
    overlay.innerHTML = `<div class="boss-victory"><div class="victory-kicker">TIDE LORD FELLED</div><h1>潮主归寂</h1><div class="victory-name">${def.name}</div><p>海水慢慢恢复了它本来的颜色。</p></div>`;
    setTimeout(() => {
      overlay.classList.remove('show');
      overlay.classList.add('hidden');
    }, 3000);
  }

  showBossDefeat(def, callbacks) {
    this.defeatCallbacks = callbacks;
    this.refs.bossOverlay.classList.remove('hidden');
    this.refs.bossOverlay.classList.add('show');
    this.refs.bossOverlay.innerHTML = `<div class="boss-defeat"><div class="victory-kicker">THE LINE BROKE</div><h1>线断了</h1><p>${def.name}沉回了水里。它还会再咬钩。</p><div class="defeat-actions"><button class="btn primary" data-boss-retry>再试一次</button><button class="btn ghost" data-boss-return>撤回岸边</button></div></div>`;
  }

  hideBossHud() {
    this.refs.bossUi.classList.add('hidden');
    this.refs.bossCue.classList.add('hidden');
    this.refs.bossOverlay.classList.add('hidden');
    this.refs.bossOverlay.classList.remove('show');
    document.body.classList.remove('boss-active');
  }

  // ── ending ────────────────────────────────────────────────────────
  showEndingChoice() {
    this.game.setMode('menu');
    this.game.player?.setFrozen(true);
    this.game.input?.exitLock();
    const html = `<div class="choice-modal">
      <div class="modal-eyebrow">THE LAST TIDE</div><h2>潮心在你面前跳动</h2>
      <p>你可以让它继续跳下去，也可以让这片海彻底安静。<br/>没有哪一个选择是干净的。</p>
      <div class="choice-grid">
        <button class="choice-card" data-ending="keep"><span class="choice-no">I</span><h3>让潮心继续跳动</h3><p>海会继续唱歌。你会留下来，守着灯，也守着所有还没回家的人。</p><em>结局 · 归潮</em></button>
        <button class="choice-card" data-ending="quiet"><span class="choice-no">II</span><h3>让潮心安静</h3><p>黑潮会停止。海会忘记那些声音，也会忘记你。没有人再需要守灯。</p><em>结局 · 无歌之海</em></button>
      </div>
      <div class="choice-foot">选择之后，故事将结束。</div>
    </div>`;
    this.openModal(html, { kind: 'choice', wide: true, dismissible: false });
  }

  showEnding(ending) {
    this.refs.modalLayer.classList.add('hidden');
    this.refs.hud.classList.add('hidden');
    const layer = this.refs.endingLayer;
    layer.classList.remove('hidden');
    const isKeep = ending === 'keep';
    layer.innerHTML = `<div class="ending-screen ${isKeep ? 'keep' : 'quiet'}">
      <div class="ending-grain"></div>
      <div class="ending-symbol">${isKeep ? '灯' : '海'}</div>
      <div class="ending-kicker">${isKeep ? 'ENDING I · HOMECOMING' : 'ENDING II · THE QUIET SEA'}</div>
      <h1>${isKeep ? '归潮' : '无歌之海'}</h1>
      <p>${isKeep ? '灯亮着。潮声还在。你终于成了那个为别人点灯的人。' : '海安静了。没有人再记得那些歌，但也没有人再在黑潮里失踪。'}</p>
      <div class="ending-stats"><div><span>钓获</span><b>${this.state.data.stats.catches}</b></div><div><span>图鉴</span><b>${Object.keys(this.state.data.catches).length} / ${FISH_LIST.length}</b></div><div><span>潮主</span><b>${this.state.data.stats.bosses}</b></div><div><span>旅程</span><b>${Math.floor(this.state.data.playTime / 60)} 分钟</b></div></div>
      <div class="ending-actions"><button class="btn primary" data-ending-credits>观看制作名单</button><button class="btn ghost" data-ending-title>回到标题</button></div>
      <div class="ending-quote">“有些潮声，是为归来的人唱的。”</div>
    </div>`;
    layer.querySelector('[data-ending-credits]')?.addEventListener('click', () => this.showCredits(true));
    layer.querySelector('[data-ending-title]')?.addEventListener('click', () => {
      layer.classList.add('hidden');
      this.game.quitToTitle();
    });
    this.game.audio?.setMusicMode('ending');
  }

  showCredits(fromEnding = false) {
    if (fromEnding) this.refs.modalLayer.style.zIndex = '110';
    const html = `<div class="credits-modal">
      <div class="credits-symbol">潮</div>
      <h2>潮汐遗歌</h2><div class="credits-en">TIDESONG</div>
      <div class="credits-rule"></div>
      <div class="credits-block"><span>企划 · 程序 · 美术 · 文本</span><b>DeepSeek Harness</b></div>
      <div class="credits-block"><span>环境光影 · 材质</span><b>Poly Haven · CC0</b></div>
      <div class="credits-block"><span>字体</span><b>Noto Serif SC / Noto Sans SC · OFL</b></div>
      <div class="credits-block"><span>声音</span><b>程序化音频 · Web Audio API</b></div>
      <div class="credits-thanks">给所有在潮声里等过的人。<br/>也给你。</div>
      <button class="btn ghost" data-close>返回</button>
    </div>`;
    this.openModal(html, { kind: 'credits' });
  }
}
