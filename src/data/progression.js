import { BAITS } from './fish.js';

export const ITEMS = {
  old_log: { name: '祖父的航海日志', icon: 'book', desc: '被盐雾泡硬的纸页。最后一页夹着一张三个人的旧照片。' },
  tide_shard_1: { name: '第一枚潮鸣片', icon: 'shard', desc: '从铁甲潮蟹的鳃下取出的铜片。贴近耳朵时，能听见很低的海。' },
  tide_shard_2: { name: '第二枚潮鸣片', icon: 'shard', desc: '蚀鳞狗鱼吞下的铜片。边缘有一圈像年轮一样的绿锈。' },
  tide_shard_3: { name: '第三枚潮鸣片', icon: 'shard', desc: '沉钟的钟舌碎片。敲击时会发出不属于铜的声音。' },
  tide_shard_4: { name: '第四枚潮鸣片', icon: 'shard', desc: '风暴金枪鱼体内取出的铜片。表面有闪电状的白色纹路。' },
  dive_log: { name: '潜钟防水日志', icon: 'book', desc: '祖父留在潜钟里的最后记录。最后半页被撕掉了。' },
  recorder: { name: '旧录音箱', icon: 'box', desc: '磁带里存着十年前两个男人的争吵，和一声很长的鲸鸣。' },
  tide_iron: { name: '潮铁', icon: 'ore', desc: '被海水泡出层纹的旧铁。敲开后有海盐和灯油的味道。' },
  glow_algae: { name: '萤潮藻', icon: 'plant', desc: '只在无风静水里生长的发光藻类。离开水后仍会亮一整夜。' },
  dive_part: { name: '潜钟零件', icon: 'gear', desc: '旧式潜钟的阀、齿轮或缆绳。铜面上刻着潮生研究所的编号。' },
  driftwood: { name: '浮木', icon: 'wood', desc: '在崖滩上晒了很久的木头。纹理直，浮力好。' },
  ship_nail: { name: '船钉', icon: 'nail', desc: '从沉船龙骨上拔下来的方头铁钉。锈很重，但还结实。' },
  obsidian: { name: '黑曜潮晶', icon: 'crystal', desc: '火山口边缘的黑色晶体。握久了，掌心会发热。' },
  tideheart: { name: '潮心', icon: 'heart', desc: '海的心脏。它一直在跳，只是我们太久没有听。' },
};

export const RODS = [
  {
    id: 0, name: '旧潮竿', en: 'OLD TIDE', price: 0, chapter: 1,
    desc: '祖父留下的玻璃钢竿。握把上的软木被他的手磨出一道浅窝。',
    power: 1, cast: 1, color: '#b58c57',
  },
  {
    id: 1, name: '青岚竿', en: 'MIST BAMBOO', price: 520, chapter: 2,
    desc: '雾泽老匠人用青竹和碳布拼成的竿。轻，韧，像一根会呼吸的骨头。',
    power: 1.18, cast: 1.18, color: '#6f9f87',
  },
  {
    id: 2, name: '霜潮竿', en: 'FROST TIDE', price: 1680, chapter: 3,
    desc: '环礁沉船里的旧碳纤维，被阿岚重新缠了导环。竿身有细密的霜纹。',
    power: 1.38, cast: 1.35, color: '#9dc9d5',
  },
  {
    id: 3, name: '烬海竿', en: 'EMBER SEA', price: 3600, chapter: 5,
    desc: '霍骁用风暴金枪的尾骨和火山黑曜石做的竿。沉，但能把海提起来。',
    power: 1.62, cast: 1.55, color: '#c77a55',
  },
];

export const REELS = [
  { id: 0, name: '旧式纺车轮', price: 0, chapter: 1, desc: '逆止阀有点松，但还能用。收线时会发出很轻的咔哒声。', speed: 1, recovery: 1 },
  { id: 1, name: '雾泽水滴轮', price: 460, chapter: 2, desc: '低重心，出线顺滑。林蔓用它换了你三瓶淡水。', speed: 1.2, recovery: 1.15 },
  { id: 2, name: '环礁远投轮', price: 1480, chapter: 3, desc: '为长距离抛投调校，泄力片是黄铜的。', speed: 1.42, recovery: 1.3 },
  { id: 3, name: '风暴泄力轮', price: 3300, chapter: 4, desc: '霍骁从沉船里捞出的军用轮。淋了十年海水，仍然不打滑。', speed: 1.68, recovery: 1.48 },
];

export const LINES = [
  { id: 0, name: '旧尼龙线', price: 0, chapter: 1, desc: '泛黄的 8 磅尼龙线。祖父在每一卷上都写了日期。', strength: 1, integrity: 1 },
  { id: 1, name: '萤丝编织线', price: 420, chapter: 2, desc: '混入萤藻纤维的编织线。夜里会泛出一点绿光。', strength: 1.16, integrity: 1.25 },
  { id: 2, name: '海魇碳线', price: 1560, chapter: 3, desc: '从沉船渔具箱里找到的碳线。几乎不延展，能听见鱼的每一次心跳。', strength: 1.34, integrity: 1.55 },
  { id: 3, name: '潮心丝', price: 3480, chapter: 5, desc: '霍骁用旧缆绳和鲸须编的线。阿岚说它不像钓线，像一根弦。', strength: 1.55, integrity: 1.9 },
];

export const PERKS = [
  { id: 'tide_sense', name: '读潮', icon: '潮', cost: 1, desc: '咬钩窗口延长 30%。你知道浮漂下沉前会先轻颤一下。', tier: 1 },
  { id: 'steady_hand', name: '稳手', icon: '稳', cost: 1, desc: '收线速度 +10%。手腕比脑子先做出反应。', tier: 1 },
  { id: 'strong_line', name: '韧线', icon: '线', cost: 1, desc: '线张力上限 +10%。', tier: 2, req: ['tide_sense'] },
  { id: 'fish_reader', name: '识鱼', icon: '鱼', cost: 1, desc: '稀有鱼出现概率 +15%。', tier: 2 },
  { id: 'haggle', name: '商谈', icon: '商', cost: 1, desc: '鱼获售价 +12%。', tier: 2, req: ['fish_reader'] },
  { id: 'still_water', name: '静心', icon: '静', cost: 1, desc: '松线时张力回落速度 +20%。', tier: 3, req: ['steady_hand'] },
  { id: 'big_game', name: '大物', icon: '巨', cost: 2, desc: '对潮主造成的收线伤害 +18%。', tier: 3, req: ['strong_line'] },
  { id: 'tide_gift', name: '潮赐', icon: '赐', cost: 2, desc: '稀有鱼概率额外 +10%，并提高大个体出现率。', tier: 4, req: ['fish_reader'] },
  { id: 'veteran', name: '老练', icon: '练', cost: 2, desc: '获得的垂钓经验 +15%。', tier: 4, req: ['haggle'] },
  { id: 'homecoming', name: '归潮', icon: '归', cost: 3, desc: '所有钓具属性 +5%。海会认得更清楚你。', tier: 5, req: ['big_game', 'tide_gift'] },
];

export const SHOP_BAITS = ['worm', 'shrimp', 'lure', 'glow', 'deep'];

export const LEVEL_XP = (level) => Math.round(140 + (level - 1) * 105 + Math.pow(level - 1, 1.55) * 35);

export function levelFromXp(totalXp) {
  let level = 1;
  let remaining = totalXp;
  while (level < 30) {
    const need = LEVEL_XP(level);
    if (remaining < need) break;
    remaining -= need;
    level++;
  }
  return { level, current: remaining, need: LEVEL_XP(level) };
}

export function xpProgress(totalXp) {
  const info = levelFromXp(totalXp);
  return { ...info, pct: Math.min(1, info.current / info.need) };
}

export function statTotals(equipment, perks = []) {
  const rod = RODS[Math.min(equipment.rod, RODS.length - 1)];
  const reel = REELS[Math.min(equipment.reel, REELS.length - 1)];
  const line = LINES[Math.min(equipment.line, LINES.length - 1)];
  const levelBonus = 1 + (equipment.upgrades?.rod || 0) * 0.035;
  const all = perks.includes('homecoming') ? 1.05 : 1;
  return {
    power: rod.power * levelBonus * all,
    cast: rod.cast * all,
    speed: reel.speed * all,
    recovery: reel.recovery * all,
    strength: line.strength * all,
    integrity: line.integrity * all,
    sellBonus: perks.includes('haggle') ? 1.12 : 1,
    rareBonus: (perks.includes('fish_reader') ? 0.15 : 0) + (perks.includes('tide_gift') ? 0.1 : 0),
    xpBonus: perks.includes('veteran') ? 1.15 : 1,
    bossBonus: perks.includes('big_game') ? 1.18 : 1,
    biteWindow: perks.includes('tide_sense') ? 1.3 : 1,
    reelBonus: perks.includes('steady_hand') ? 1.1 : 1,
    lineBonus: perks.includes('strong_line') ? 1.1 : 1,
    slackRecovery: perks.includes('still_water') ? 1.2 : 1,
  };
}

export function upgradeCost(kind, currentTier, nextTier) {
  const base = { rod: 180, reel: 160, line: 150 }[kind];
  return Math.round(base * Math.pow(1.7, nextTier - 1) * (1 + currentTier * 0.28));
}

export function baitPrice(id) {
  return BAITS[id]?.price || 0;
}
