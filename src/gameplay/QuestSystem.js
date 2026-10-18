import { CHAPTERS, SCENES } from '../data/chapters.js';
import { NPCS } from '../data/npcs.js';
import { ITEMS } from '../data/progression.js';
import { FISH, BAITS } from '../data/fish.js';

const IDLE = {
  shen: {
    1: ['灯亮着，海还不太平。你要学会听线下面的声音。', '你祖父以前总说，钓鱼不是把鱼拉上来，是把自己沉下去。'],
    2: ['雾泽的水比看上去深。别把脚伸进去。', '我在灯下等你回来。别让我等太久。'],
    3: ['环礁的太阳会骗人。记得喝水。'],
    4: ['风暴里不要相信海平线。它随时会消失。'],
    5: ['你已经比我走得远了。剩下的路，得自己选。'],
  },
  alan: {
    1: ['鱼卖不卖？不卖也别让它们臭在篓里。', '你祖父欠我一盒茶叶。你可以替他还。'],
    2: ['雾泽的鱼有点怪。价格我照收，别让它们咬我。'],
    3: ['环礁的贝壳很漂亮。别捡太多，阿澈会念叨。'],
    4: ['风暴把船价都吹高了。你也该学会讲价了。'],
    5: ['最后一站了。回来的时候，记得给我带一条会发光的鱼。'],
  },
  linman: {
    1: ['你身上有海腥味。刚从黑礁回来？'],
    2: ['黑潮的浓度还在升。我们时间不多了。'],
    3: ['阿澈的哥哥……如果找到他的东西，告诉我。'],
    4: ['风暴里的样本最珍贵。也最危险。'],
  },
  laotao: {
    2: ['小子，酒带了吗？', '海唱歌的时候，别跟着唱。听就好。'],
  },
  ache: {
    3: ['潟湖今天很安静。安静得不太对。', '你祖父欠我两瓶酒。别死，死了就没人还了。'],
  },
  huoxiao: {
    4: ['风向变了。把帆收紧。', '你祖父要是看见你现在的样子，大概会先骂你，再笑。'],
  },
  hanzhao: {
    5: ['潮心不是用来许愿的。', '你祖父最后看我的那一眼，我记了十年。'],
  },
};

export class QuestSystem {
  constructor({ game, state, ui, world, audio }) {
    this.game = game;
    this.state = state;
    this.ui = ui;
    this.world = world;
    this.audio = audio;
    this.uniqueSpecies = new Set();
    this.busy = false;
  }

  setWorld(world) {
    this.world = world;
  }

  get chapter() {
    return CHAPTERS[Math.max(0, this.state.data.chapter - 1)];
  }

  get objective() {
    return this.chapter.objectives[this.state.data.objective] || null;
  }

  get progress() {
    const obj = this.objective;
    if (!obj) return { count: 0, unique: [] };
    if (!this.state.data.objectiveProgress[obj.id]) {
      this.state.data.objectiveProgress[obj.id] = { count: 0, unique: [] };
    }
    return this.state.data.objectiveProgress[obj.id];
  }

  async beginChapter({ playIntro = true } = {}) {
    const ch = this.chapter;
    this.uniqueSpecies = new Set(this.progress.unique || []);
    this.syncProgressFromCaught();
    this.ui.setChapter(ch);
    if (playIntro && ch.introScene && !this.state.data.scenesSeen[`intro_${ch.id}`]) {
      this.state.data.scenesSeen[`intro_${ch.id}`] = true;
      await this.ui.playDialogue(ch.introScene, { cinematic: true });
    }
    await this.startObjective();
  }

  syncProgressFromCaught() {
    const obj = this.objective;
    if (!obj) return;
    if (obj.type === 'catch') {
      // Count catches made before this objective began if the save is mid-scene.
      const prog = this.progress;
      if (prog.startedAt && !prog.count) {
        // No reliable per-objective history; leave at zero. The HUD will guide the player.
      }
    }
  }

  async startObjective() {
    const obj = this.objective;
    if (!obj) return;
    this.busy = false;
    if (!this.state.data.objectiveProgress[obj.id]) {
      this.state.data.objectiveProgress[obj.id] = { count: 0, unique: [] };
    }
    this.ui.updateQuest(obj, this.chapter, this.progress, this.state);
    this.world?.setObjective(obj, this.progress);
    this.ui.setObjectiveMarker(this.getTargetPosition());
    if (obj.type === 'boss') {
      const bossBait = Object.keys(this.state.data.baits).find((k) => k.startsWith('boss') && this.state.data.baits[k] > 0);
      if (bossBait) {
        this.state.data.currentBait = bossBait;
        this.state.save();
        this.ui.refreshHUD(this.state);
        this.ui.toast('已换上潮主专用的饵。去水边的光柱下抛竿。', 'item');
      }
    }
    this.state.save();
    if (obj.type === 'catch' || obj.type === 'catchUnique') {
      this.uniqueSpecies = new Set(this.progress.unique || []);
    }
    if (obj.startScene && !this.state.data.scenesSeen[`start_${obj.id}`]) {
      this.state.data.scenesSeen[`start_${obj.id}`] = true;
      await this.ui.playDialogue(obj.startScene, { cinematic: false });
    }
    if (obj.ending) {
      // The final interaction opens the ending choice through notify().
    }
  }

  getTargetPosition() {
    const obj = this.objective;
    if (!obj || !this.world) return null;
    if (obj.type === 'talk') return this.world.interactables.find((i) => i.id === obj.target)?.pos || null;
    if (obj.type === 'boss') return this.world.bossPosition;
    if (obj.type === 'travel') return this.world.boatPosition;
    if (obj.type === 'interact') return this.world.interactables.find((i) => i.id === obj.target)?.pos || null;
    if (obj.type === 'catch' || obj.type === 'catchUnique') return this.world.waterMarker;
    if (obj.type === 'collect') {
      const c = this.world.allCollectibles.find((x) => x.userData.item.item === obj.item && !x.userData.collected);
      return c?.position || null;
    }
    return null;
  }

  notify(type, payload = {}) {
    const obj = this.objective;
    if (!obj || this.busy) return;
    if (type === 'catch') {
      if (obj.type === 'catch' && obj.species.includes(payload.species)) {
        this.addProgress(1);
      } else if (obj.type === 'catchUnique') {
        const id = payload.species;
        if (!this.progress.unique.includes(id)) {
          this.progress.unique.push(id);
          this.uniqueSpecies.add(id);
          this.addProgress(1, `新鱼种 · ${FISH[id]?.name || id}`);
        }
      }
    }
    if (type === 'collect' && obj.type === 'collect' && obj.item === payload.item) {
      this.addProgress(1);
    }
    if (type === 'talk' && obj.type === 'talk' && obj.target === payload.npc) {
      this.complete();
    }
    if (type === 'interact' && obj.type === 'interact' && obj.target === payload.target) {
      this.complete();
    }
    if (type === 'boss' && obj.type === 'boss' && obj.species === payload.species) {
      this.complete();
    }
    if (type === 'travel' && obj.type === 'travel') {
      this.game.showTravelMap(obj.nextChapter);
    }
  }

  addProgress(n = 1, detail = null) {
    const obj = this.objective;
    const prog = this.progress;
    prog.count += n;
    this.state.save();
    this.ui.updateQuest(obj, this.chapter, prog, this.state);
    this.world?.setObjective(obj, prog);
    this.ui.setObjectiveMarker(this.getTargetPosition());
    this.audio?.play('questStep');
    if (detail) this.ui.toast(detail, 'success');
    if (obj.type !== 'catchUnique' && prog.count >= (obj.count || 1)) {
      this.complete();
    } else if (obj.type === 'catchUnique' && prog.count >= (obj.count || 1)) {
      this.complete();
    }
  }

  async complete() {
    if (this.busy) return;
    const obj = this.objective;
    if (!obj) return;
    this.busy = true;
    this.applyReward(obj.reward);
    this.ui.questComplete(obj);
    this.audio?.play('questComplete');
    if (obj.id === 'ch1_lamp') {
      this.state.data.flags.lamp_lit = true;
      this.world?.setLighthouseLit(true);
    }
    if (obj.type === 'interact' && obj.target === 'lamp') {
      this.state.data.flags.lamp_lit = true;
      this.world?.setLighthouseLit(true);
    }
    if (obj.scene && !this.state.data.scenesSeen[`done_${obj.id}`]) {
      this.state.data.scenesSeen[`done_${obj.id}`] = true;
      await this.ui.playDialogue(obj.scene, { cinematic: obj.type === 'boss' || obj.id.includes('outro') });
    } else {
      await new Promise((r) => setTimeout(r, 650));
    }
    this.advance();
  }

  async advance() {
    const ch = this.chapter;
    const next = this.state.data.objective + 1;
    if (next < ch.objectives.length) {
      this.state.data.objective = next;
      this.busy = false;
      this.state.save();
      await this.startObjective();
      return;
    }
    // Chapter complete. The final travel objective is last for chapters 1-4;
    // chapter 5 ends with the choice interaction.
    if (!this.state.data.chapterCleared.includes(ch.id)) {
      this.state.data.chapterCleared.push(ch.id);
    }
    this.state.save();
    this.busy = false;
    if (ch.id >= CHAPTERS.length) {
      this.busy = true;
      this.game.showEndingChoice();
    }
  }

  applyReward(reward) {
    if (!reward) return;
    if (reward.coins) {
      this.state.addCoins(reward.coins);
      this.ui.toast(`+ ${reward.coins} 金币`, 'coin');
    }
    if (reward.xp) {
      const r = this.state.addXp(reward.xp);
      if (r.leveled > 0) {
        this.ui.levelUp(r.level, this.state.data.perkPoints);
        this.audio?.play('levelUp');
      }
    }
    if (reward.bait) {
      for (const [id, n] of Object.entries(reward.bait)) {
        this.state.addBait(id, n);
        this.ui.toast(`获得 ${BAITS[id]?.name || id} × ${n}`, 'item');
      }
    }
    if (reward.item) {
      for (const [id, n] of Object.entries(reward.item)) {
        this.state.addItem(id, n);
        this.ui.toast(`获得「${ITEMS[id]?.name || id}」`, 'item');
      }
    }
    this.ui.refreshHUD(this.state);
  }

  // Called by Game when player talks to an NPC.
  talkTo(npcId) {
    const obj = this.objective;
    if (obj?.type === 'talk' && obj.target === npcId) {
      this.complete();
      return;
    }
    const def = NPCS[npcId];
    if (!def) return;
    const chapter = this.chapter.id;
    if (npcId === 'alan') {
      this.game.openShop();
      return;
    }
    const lines = IDLE[npcId]?.[chapter] || IDLE[npcId]?.[1];
    const text = lines ? lines[Math.floor(Math.random() * lines.length)] : '海今天很安静。';
    this.ui.playDialogue([{ who: npcId, text }], { cinematic: false });
  }

  // Called by Game on explicit interaction (E).
  interact(target) {
    const obj = this.objective;
    if (!target) return;
    if (target.type === 'npc') {
      this.talkTo(target.id);
      return;
    }
    if (target.type === 'shop') {
      this.game.openShop();
      return;
    }
    if (target.type === 'boat') {
      if (obj?.type === 'travel') this.notify('travel', {});
      else this.ui.toast('现在还不能离开。潮水还没把该带来的东西带来。', 'warn');
      return;
    }
    if (target.type === 'boss') {
      if (obj?.type === 'boss' && obj.target === target.id) {
        this.game.startBoss(obj.species);
      } else if (obj?.type === 'boss') {
        this.ui.toast('不是这片水。去任务标记的地方。', 'warn');
      } else {
        this.ui.toast('水面下有一道很大的影子。它现在还不想见你。', 'warn');
      }
      return;
    }
    if (target.type === 'collect') {
      if (obj?.type === 'collect' && obj.item === target.item && !target.consumed) {
        const got = this.world.collect(target.id);
        if (got) {
          target.consumed = true;
          this.state.data.flags[`interact_${target.id}`] = true;
          this.audio?.play('pickup');
          this.notify('collect', { item: got.item });
        }
      } else {
        this.ui.toast('现在还用不上这个。', 'muted');
      }
      return;
    }
    if (target.type === 'interact') {
      if (target.id === 'logbook' && obj?.type === 'interact' && obj.target === 'logbook') {
        this.notify('interact', { target: 'logbook' });
        return;
      }
      if (target.id === 'lamp' && obj?.type === 'interact' && obj.target === 'lamp') {
        this.notify('interact', { target: 'lamp' });
        return;
      }
      if (target.id === 'resonance' && obj?.type === 'interact' && obj.target === 'resonance') {
        this.notify('interact', { target: 'resonance' });
        return;
      }
      if (target.id === 'dive_log' && obj?.type === 'interact' && obj.target === 'dive_log') {
        this.notify('interact', { target: 'dive_log' });
        return;
      }
      if (target.id === 'recorder' && obj?.type === 'interact' && obj.target === 'recorder') {
        this.notify('interact', { target: 'recorder' });
        return;
      }
      if (target.id === 'tideheart' && obj?.type === 'interact' && obj.target === 'tideheart') {
        this.game.showEndingChoice();
        return;
      }
      this.ui.toast(target.label ? `「${target.label}」没有回应。` : '什么也没有发生。', 'muted');
    }
  }

  // Called by BossFight after victory.
  bossDefeated(species) {
    this.notify('boss', { species });
  }

  travel(nextChapter) {
    this.state.data.chapter = nextChapter;
    this.state.data.objective = 0;
    this.state.data.flags.travel_completed = nextChapter;
    this.state.save();
    this.game.loadChapter(nextChapter, { travel: true });
  }

  getScene(id) {
    return SCENES[id] || [];
  }
}
