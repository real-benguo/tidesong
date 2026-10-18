// Main story: five chapters, five islands, five tide-shards.
// Objectives are sequential and data-driven; scenes are keyed for the dialogue system.

export const CHAPTERS = [
  {
    id: 1,
    numeral: '一',
    title: '灯熄之夜',
    en: 'THE NIGHT THE LIGHT DIED',
    island: 'hub',
    accent: '#e8b969',
    epigraph: '有些潮声，是为归来的人唱的。',
    introScene: 'ch1_arrival',
    objectives: [
      {
        id: 'ch1_talk_shen', type: 'talk', target: 'shen', hint: '沿着石阶上到灯塔，和沈叔谈谈。',
        scene: 'ch1_shen_1', reward: { coins: 60, bait: { worm: 10 }, xp: 30 },
      },
      {
        id: 'ch1_bream', type: 'catch', species: ['silver_bream'], count: 2,
        hint: '在栈桥边钓上 2 条银鳍鲷。', scene: 'ch1_bream_done',
        reward: { coins: 90, xp: 70 },
      },
      {
        id: 'ch1_log', type: 'interact', target: 'logbook',
        hint: '回到祖父的小屋，翻开桌上的航海日志。', scene: 'ch1_log',
        reward: { item: { old_log: 1 }, xp: 50 },
      },
      {
        id: 'ch1_iron', type: 'collect', item: 'tide_iron', count: 3,
        hint: '沿着黑礁滩拾取 3 块潮铁。', scene: 'ch1_iron_done',
        reward: { coins: 80, xp: 60 },
      },
      {
        id: 'ch1_bait', type: 'talk', target: 'shen',
        hint: '把潮铁带回灯塔，请沈叔制作铁潮饵。', scene: 'ch1_shen_2',
        reward: { bait: { boss1: 1 }, coins: 50 },
      },
      {
        id: 'ch1_boss', type: 'boss', species: 'iron_crab', target: 'boss_crab',
        hint: '退潮了。去黑礁，钓起铁甲潮蟹，取回第一枚潮鸣片。',
        scene: 'ch1_crab_done', startScene: 'ch1_boss_brief',
        reward: { item: { tide_shard_1: 1 }, coins: 320, xp: 420 },
      },
      {
        id: 'ch1_lamp', type: 'interact', target: 'lamp',
        hint: '回到灯塔，把潮鸣片放进旧灯。', scene: 'ch1_lamp',
        reward: { coins: 220, xp: 280 },
      },
      {
        id: 'ch1_travel', type: 'travel', target: 'boat',
        hint: '回到码头，启航前往雾苇泽。', nextChapter: 2,
        reward: { coins: 150, xp: 100 },
      },
    ],
  },
  {
    id: 2,
    numeral: '二',
    title: '雾泽萤火',
    en: 'FIREFLIES IN THE MIRE',
    island: 'mangrove',
    accent: '#8fe3ba',
    epigraph: '红树把根扎进泥里，是为了把海举起来。',
    introScene: 'ch2_arrival',
    objectives: [
      {
        id: 'ch2_talk_lin', type: 'talk', target: 'linman',
        hint: '在红树营地找到林蔓。', scene: 'ch2_lin_1',
        reward: { bait: { glow: 6 }, coins: 80, xp: 60 },
      },
      {
        id: 'ch2_glowfish', type: 'catch', species: ['glow_killifish'], count: 3,
        hint: '用萤潮藻饵，在静水区钓上 3 条萤光鳉。', scene: 'ch2_glowfish_done',
        reward: { coins: 140, xp: 120 },
      },
      {
        id: 'ch2_laotao', type: 'talk', target: 'laotao',
        hint: '去沉木潭拜访守歌人老陶。', scene: 'ch2_laotao_1',
        reward: { xp: 90 },
      },
      {
        id: 'ch2_algae', type: 'collect', item: 'glow_algae', count: 3,
        hint: '在雾泽的三个静水潭边采集萤潮藻。', scene: 'ch2_algae_done',
        reward: { coins: 120, xp: 100 },
      },
      {
        id: 'ch2_bait', type: 'talk', target: 'linman',
        hint: '把萤潮藻交给林蔓，制作萤骨饵。', scene: 'ch2_lin_2',
        reward: { bait: { boss2: 1 }, coins: 100, xp: 80 },
      },
      {
        id: 'ch2_boss', type: 'boss', species: 'giant_pike', target: 'boss_pike',
        hint: '月落了。去沉木潭深处，钓起蚀鳞狗鱼。',
        scene: 'ch2_pike_done', startScene: 'ch2_boss_brief',
        reward: { item: { tide_shard_2: 1 }, coins: 460, xp: 620 },
      },
      {
        id: 'ch2_resonance', type: 'interact', target: 'resonance',
        hint: '让第二枚潮鸣片在沉木碑上共鸣，听它指向哪里。', scene: 'ch2_outro',
        reward: { coins: 260, xp: 320 },
      },
      {
        id: 'ch2_travel', type: 'travel', target: 'boat',
        hint: '回到码头，启航前往琥珀环礁。', nextChapter: 3,
        reward: { coins: 180, xp: 120 },
      },
    ],
  },
  {
    id: 3,
    numeral: '三',
    title: '沉钟之下',
    en: 'BENEATH THE DROWNED BELL',
    island: 'atoll',
    accent: '#79d9d0',
    epigraph: '环礁是海的一枚旧伤，沙会慢慢把它填平。',
    introScene: 'ch3_arrival',
    objectives: [
      {
        id: 'ch3_talk_ache', type: 'talk', target: 'ache',
        hint: '在沉船残骸边找到潜水员阿澈。', scene: 'ch3_ache_1',
        reward: { coins: 100, xp: 80, bait: { shrimp: 6, lure: 4 } },
      },
      {
        id: 'ch3_species', type: 'catchUnique', count: 5,
        hint: '钓上 5 种不同的环礁鱼类，帮阿澈检查潟湖。', scene: 'ch3_species_done',
        reward: { coins: 240, xp: 220 },
      },
      {
        id: 'ch3_parts', type: 'collect', item: 'dive_part', count: 3,
        hint: '在环礁四周打捞 3 件潜钟零件。', scene: 'ch3_parts_done',
        reward: { coins: 150, xp: 120 },
      },
      {
        id: 'ch3_bait', type: 'talk', target: 'ache',
        hint: '把潜钟零件交给阿澈，准备下潜。', scene: 'ch3_ache_2',
        reward: { bait: { boss3: 1 }, coins: 110, xp: 100 },
      },
      {
        id: 'ch3_boss', type: 'boss', species: 'puffer_king', target: 'boss_puffer',
        hint: '去潟湖中央，钓起守着沉钟的胀潮河豚。',
        scene: 'ch3_puffer_done', startScene: 'ch3_boss_brief',
        reward: { item: { tide_shard_3: 1 }, coins: 620, xp: 820 },
      },
      {
        id: 'ch3_log', type: 'interact', target: 'dive_log',
        hint: '打开祖父留在潜钟里的防水日志。', scene: 'ch3_log',
        reward: { item: { dive_log: 1 }, xp: 260 },
      },
      {
        id: 'ch3_travel', type: 'travel', target: 'boat',
        hint: '风暴要来了。回到码头，前往断帆崖。', nextChapter: 4,
        reward: { coins: 220, xp: 160 },
      },
    ],
  },
  {
    id: 4,
    numeral: '四',
    title: '风暴之线',
    en: 'THE LINE IN THE STORM',
    island: 'cliffs',
    accent: '#8eb8da',
    epigraph: '风把海举起来的时候，人才能看见自己有多轻。',
    introScene: 'ch4_arrival',
    objectives: [
      {
        id: 'ch4_talk_huo', type: 'talk', target: 'huoxiao',
        hint: '在断帆崖的旧船坞找到霍骁。', scene: 'ch4_huo_1',
        reward: { coins: 110, xp: 90 },
      },
      {
        id: 'ch4_wood', type: 'collect', item: 'driftwood', count: 3,
        hint: '在崖滩收集 3 根可用的浮木。', scene: 'ch4_wood_done',
        reward: { coins: 120, xp: 90 },
      },
      {
        id: 'ch4_nails', type: 'collect', item: 'ship_nail', count: 3,
        hint: '从沉船残骸里取出 3 枚船钉。', scene: 'ch4_nails_done',
        reward: { coins: 120, xp: 90 },
      },
      {
        id: 'ch4_repair', type: 'talk', target: 'huoxiao',
        hint: '回到船坞，把材料交给霍骁。', scene: 'ch4_huo_2',
        reward: { coins: 100, xp: 80 },
      },
      {
        id: 'ch4_mackerel', type: 'catch', species: ['storm_mackerel'], count: 3,
        hint: '风暴临近，钓上 3 条风暴鲭做饵。', scene: 'ch4_mackerel_done',
        reward: { coins: 160, xp: 150 },
      },
      {
        id: 'ch4_bait', type: 'talk', target: 'huoxiao',
        hint: '把风暴鲭交给霍骁，制作风暴饵。', scene: 'ch4_huo_3',
        reward: { bait: { boss4: 1 }, coins: 120, xp: 100 },
      },
      {
        id: 'ch4_boss', type: 'boss', species: 'storm_tuna', target: 'boss_tuna',
        hint: '雷声之间，把风暴饵抛向断崖外海。',
        scene: 'ch4_tuna_done', startScene: 'ch4_boss_brief',
        reward: { item: { tide_shard_4: 1 }, coins: 820, xp: 1100 },
      },
      {
        id: 'ch4_recorder', type: 'interact', target: 'recorder',
        hint: '打开金枪鱼拖上来的那只旧录音箱。', scene: 'ch4_recorder',
        reward: { item: { recorder: 1 }, xp: 320 },
      },
      {
        id: 'ch4_travel', type: 'travel', target: 'boat',
        hint: '风暴眼正在打开。回到码头，启航前往烬潮岛。', nextChapter: 5,
        reward: { coins: 260, xp: 180 },
      },
    ],
  },
  {
    id: 5,
    numeral: '五',
    title: '海的最后一首歌',
    en: 'THE LAST SONG OF THE SEA',
    island: 'volcano',
    accent: '#ff9166',
    epigraph: '海不说话。它只是把所有的声音，都变成了潮。',
    introScene: 'ch5_arrival',
    objectives: [
      {
        id: 'ch5_talk_shen', type: 'talk', target: 'shen',
        hint: '在烬潮岛的黑沙滩上找到沈叔。', scene: 'ch5_shen_1',
        reward: { coins: 150, xp: 120, bait: { deep: 5, glow: 5 } },
      },
      {
        id: 'ch5_talk_han', type: 'talk', target: 'hanzhao',
        hint: '沿着熔岩小径上到火山营地，和韩照对质。', scene: 'ch5_han_1',
        reward: { xp: 150 },
      },
      {
        id: 'ch5_eels', type: 'catch', species: ['magma_eel'], count: 3,
        hint: '在热泉与冷水的交界处钓上 3 条熔纹鳗。', scene: 'ch5_eels_done',
        reward: { coins: 200, xp: 200 },
      },
      {
        id: 'ch5_obsidian', type: 'collect', item: 'obsidian', count: 3,
        hint: '在火山口边缘拾取 3 块黑曜潮晶。', scene: 'ch5_obsidian_done',
        reward: { coins: 220, xp: 180 },
      },
      {
        id: 'ch5_bait', type: 'talk', target: 'hanzhao',
        hint: '把熔纹鳗与黑曜潮晶交给韩照，制作渊心饵。', scene: 'ch5_han_2',
        reward: { bait: { boss5: 1 }, coins: 200, xp: 160 },
      },
      {
        id: 'ch5_boss', type: 'boss', species: 'abyss_whale', target: 'boss_whale',
        hint: '火山口已经裂开。把渊心饵投入潮心，面对噬潮鲸。',
        scene: 'ch5_whale_done', startScene: 'ch5_boss_brief',
        reward: { coins: 1200, xp: 1800 },
      },
      {
        id: 'ch5_heart', type: 'interact', target: 'tideheart',
        hint: '潮心就在鲸落之下。走过去，做出你的选择。', scene: 'ch5_choice',
        ending: true, reward: { xp: 500 },
      },
    ],
  },
];

export const TOTAL_OBJECTIVES = CHAPTERS.reduce((n, c) => n + c.objectives.length, 0);

export function getChapter(n) {
  return CHAPTERS.find((c) => c.id === n) || CHAPTERS[0];
}

export function getObjective(chapter, index) {
  return CHAPTERS[chapter - 1]?.objectives[index] || null;
}

export const SCENES = {
  // ── Prologue / Chapter I ──────────────────────────────────────────
  ch1_arrival: [
    { who: 'narrator', text: '十年前的夏天，你从归潮岛离开。那天的海很平，像一块没有写完的蓝纸。' },
    { who: 'narrator', text: '现在，柴油机在身后咳嗽。咸味、铁锈味、还有一点旧木头的甜味，一起涌上来。' },
    { who: 'radio', text: '阿屿。船靠南栈桥，别走错了。灯又灭了。', tone: 'radio' },
    { who: 'you', text: '我回来了。' },
    { who: 'narrator', text: '潮声比记忆里更低。像有人把耳朵贴在海螺上，听见了很远的地方。' },
  ],
  ch1_shen_1: [
    { who: 'shen', text: '你比照片里高了。也比信里写得沉默。' },
    { who: 'you', text: '灯怎么了？' },
    { who: 'shen', text: '不是灯。是海。昨晚它又唱了，和十年前一个调子。' },
    { who: 'shen', text: '你祖父留下那根竿，我一直没敢动。拿去吧。不是让你去逞能，是让你先学会听。' },
    { who: 'you', text: '听见什么？' },
    { who: 'shen', text: '听见线下面那个东西，到底是在咬饵，还是在看你。' },
    { who: 'shen', text: '去栈桥，钓两条银鳍鲷上来。手生了的人，听不见潮声。' },
  ],
  ch1_bream_done: [
    { who: 'radio', text: '竿没生锈，人也没废。', tone: 'radio' },
    { who: 'shen', text: '回你祖父的小屋看看。桌上那个抽屉，钥匙在花盆底下。' },
    { who: 'you', text: '你早就知道里面有什么。' },
    { who: 'shen', text: '我知道。可有些东西，得自己翻开才算数。' },
  ],
  ch1_log: [
    { who: 'narrator', text: '抽屉里是一本被盐雾泡硬的航海日志。纸页粘在一起，像一片片旧鳞。' },
    { who: 'log', text: '九月十七。黑潮提前了。韩照说潮心能救很多人。我知道他在骗自己。海不是矿。', tone: 'log' },
    { who: 'log', text: '九月二十。灯还能亮。阿屿问我为什么每年都要修它。我没答上来。也许只是想让回家的人有个方向。', tone: 'log' },
    { who: 'narrator', text: '日志最后一页夹着一张旧照片。年轻时的沈叔、祖父，还有一个戴眼镜的男人，站在灯塔下笑。' },
    { who: 'you', text: '韩照……' },
  ],
  ch1_iron_done: [
    { who: 'radio', text: '潮铁？黑礁那只老蟹在换壳。它在给灯攒东西。', tone: 'radio' },
    { who: 'shen', text: '把潮铁带回来。我教你做饵。锈味会让它从礁缝里出来。' },
  ],
  ch1_shen_2: [
    { who: 'shen', text: '铁潮饵，老法子。潮铁磨粉，拌上灯油和一点海藻。' },
    { who: 'shen', text: '铁甲潮蟹守着一枚潮鸣片。灯要亮，得把铜片拿回来。' },
    { who: 'you', text: '它很大？' },
    { who: 'shen', text: '比你的船大一点。它上岸的时候，别站在它正前方。' },
    { who: 'you', text: '那该站在哪？' },
    { who: 'shen', text: '站在它够不着的地方。小子，这不是玩笑。' },
  ],
  ch1_boss_brief: [
    { who: 'narrator', text: '潮水退到很低。黑礁像一排从海底翻上来的牙。' },
    { who: 'radio', text: '铁潮饵挂好了没有？它闻到锈味了。听见那声音没有——像锚链在石头上拖。', tone: 'radio' },
    { who: 'you', text: '听见了。' },
    { who: 'radio', text: '那就别让它把线拖到礁石上。稳住。' },
  ],
  ch1_crab_done: [
    { who: 'narrator', text: '铁甲潮蟹翻倒在浅水里。它背甲上的铆钉一颗颗脱落，露出底下柔软的、苍白的肉。' },
    { who: 'narrator', text: '一枚铜片卡在它的鳃下，温热，像刚被人从火里夹出来。' },
    { who: 'echo', text: '阿屿。如果你听见这首歌，说明我还是没来得及回去。', tone: 'echo' },
    { who: 'you', text: '……祖父？' },
    { who: 'echo', text: '别学我。灯要亮着，但人也要回家。', tone: 'echo' },
    { who: 'narrator', text: '潮声吞掉了后半句。铜片在你手心里轻轻震了一下。' },
  ],
  ch1_lamp: [
    { who: 'narrator', text: '塔顶的旧灯是一座被海风磨花的星辰仪。铜片嵌进凹槽时，整座塔像叹了一口气。' },
    { who: 'shen', text: '二十年了。它还记得怎么亮。' },
    { who: 'narrator', text: '光柱切开海雾。远处，一条被红树覆盖的水道慢慢显出来。' },
    { who: 'shen', text: '雾苇泽。你祖父最后去的地方。' },
    { who: 'alan', text: '船我加满油了。不过先说好，回来要给我带一条会发光的鱼。', tone: 'radio' },
    { who: 'you', text: '你怎么知道会发光？' },
    { who: 'alan', text: '因为你在笑。你祖父每次准备去送死之前，也这么笑。', tone: 'radio' },
    { who: 'shen', text: '别听她胡说。去吧。潮水不等人。' },
  ],

  // ── Chapter II ────────────────────────────────────────────────────
  ch2_arrival: [
    { who: 'narrator', text: '雾苇泽没有海平线。红树从浑水里长出来，根须像无数只向下抓的手。' },
    { who: 'narrator', text: '船底擦过一根沉木。有什么东西在雾里拍了一下尾巴。' },
    { who: 'linman', text: '沈屿？把你那根竿收好。这里的鱼，最近不太讲道理。' },
    { who: 'you', text: '你是林蔓。' },
    { who: 'linman', text: '你祖父救过我的采样船，也把我拉进了这摊浑水。先上岸。水里有东西在听。' },
  ],
  ch2_lin_1: [
    { who: 'linman', text: '黑潮不是自然现象。是潮心被刺穿之后，海做出的免疫反应。' },
    { who: 'you', text: '免疫反应？' },
    { who: 'linman', text: '海在把体内的东西变凶，逼它们离开。鱼只是第一批。' },
    { who: 'linman', text: '帮我钓三条萤光鳉。它们只在有萤藻的水里出现，体内会积黑潮孢子。' },
    { who: 'linman', text: '用这个，萤潮藻饵。别用蛮力。它们的嘴很小。' },
  ],
  ch2_glowfish_done: [
    { who: 'linman', text: '浓度太高了。这不是扩散，是有人在抽。' },
    { who: 'you', text: '抽去哪里？' },
    { who: 'linman', text: '往上。往火山的方向。' },
    { who: 'linman', text: '去找老陶。他住在沉木潭，是唯一还记得那首旧歌的人。' },
  ],
  ch2_laotao_1: [
    { who: 'narrator', text: '沉木潭边坐着一个戴斗笠的老人。他脚边的水是黑的，却浮着一层细碎的绿光。' },
    { who: 'laotao', text: '你身上有铁锈味。去过黑礁了。' },
    { who: 'you', text: '你认识我祖父？' },
    { who: 'laotao', text: '认识。他每次来都带酒，不带你。' },
    { who: 'laotao', text: '灯要亮，得五片潮鸣。五片归潮，一灯不灭；莫向深渊，问海要心。' },
    { who: 'laotao', text: '沉木潭底下那只东西，吞了第二片。想让它开口，得先喂它一点光。' },
    { who: 'laotao', text: '去采三株萤潮藻来。要长在静水里的，别碰被雾打湿的。' },
  ],
  ch2_algae_done: [
    { who: 'laotao', text: '手别抖。萤藻的光会跟着人的心跳变。你刚才看见它闪了几下？' },
    { who: 'you', text: '三下。' },
    { who: 'laotao', text: '那是它在数你。把藻给林蔓。她会做饵。' },
    { who: 'narrator', text: '雾里传来一声很长的、像木头断裂的闷响。老陶抬头看了一眼。' },
    { who: 'laotao', text: '它醒了。快去。' },
  ],
  ch2_lin_2: [
    { who: 'linman', text: '萤骨饵。把萤藻汁灌进鱼骨，再封一层蜡。入水会亮，亮到它能看见。' },
    { who: 'linman', text: '狗鱼吞了潮鸣片。它现在不仅是掠食者，还是一座会游的共鸣箱。' },
    { who: 'you', text: '它会攻击人？' },
    { who: 'linman', text: '它已经攻击过三个人了。两个是偷猎的，一个是我的学生。' },
    { who: 'linman', text: '别让它把你拖进沉木底下。那里的水，没有底。' },
  ],
  ch2_boss_brief: [
    { who: 'narrator', text: '月亮沉进雾里。沉木潭的水面开始发光，像有一整片星空被按进了泥里。' },
    { who: 'radio', text: '萤骨饵在发亮。它来了——别急着收线。先让它咬死。', tone: 'radio' },
    { who: 'you', text: '它咬死了。' },
    { who: 'radio', text: '那就别松手。', tone: 'radio' },
  ],
  ch2_pike_done: [
    { who: 'narrator', text: '蚀鳞狗鱼翻起白肚。它鳞片里的孔洞一颗颗熄灭，像一座沉没的城市关掉了最后的灯。' },
    { who: 'narrator', text: '第二枚潮鸣片从它的鳃腔里滑出来，落在浅水上，发出一声清脆的、几乎像钟的响声。' },
    { who: 'linman', text: '它肚子里还有别的东西。一个防水袋。' },
    { who: 'you', text: '上面有潮生研究所的编号。' },
    { who: 'linman', text: '不是我学生的。这个编号……比研究所还早十年。' },
  ],
  ch2_outro: [
    { who: 'narrator', text: '两枚潮鸣片在沉木碑上并排贴住。碑面原本模糊的纹路亮起来，连成半张海图。' },
    { who: 'laotao', text: '五片归潮，一灯不灭。现在还差三片。' },
    { who: 'narrator', text: '海图指向东南。那里有一圈几乎被海平面抹掉的环礁。' },
    { who: 'linman', text: '琥珀环礁。我联系上那边一个潜水员，叫阿澈。他哥哥去年失踪了。' },
    { who: 'radio', text: '环礁的沉钟下面，有你祖父的潜钟。坐标我发给你了。', tone: 'radio' },
    { who: 'laotao', text: '小子。下次来，记得带酒。' },
  ],

  // ── Chapter III ───────────────────────────────────────────────────
  ch3_arrival: [
    { who: 'narrator', text: '环礁像一枚被遗忘在海上的戒指。白沙、浅碧的潟湖，以及一圈沉默的沉船。' },
    { who: 'narrator', text: '水下传来一声很远的金属震动。不是钟，却像钟的回声。' },
    { who: 'ache', text: '别站在船头。这里的浅水会骗人，昨天还是路，今天就成沟了。' },
    { who: 'you', text: '阿澈？' },
    { who: 'ache', text: '是我。你祖父欠我一家两瓶酒。先上来，太阳快把礁盘晒裂了。' },
  ],
  ch3_ache_1: [
    { who: 'ache', text: '你祖父？那个在潜钟里刻字的老头。他上来过一次，只待了半小时，又下去了。' },
    { who: 'ache', text: '我哥去年在沉钟湾失踪。我找到了他的氧气瓶，没找到人。' },
    { who: 'you', text: '你觉得他还活着？' },
    { who: 'ache', text: '我觉得海把他留下了。这不一样。' },
    { who: 'ache', text: '帮我个忙。钓五条不同的鱼上来，我要看它们的鳃。潟湖的鱼最近开始在夜里叫。' },
    { who: 'ache', text: '别嫌麻烦。海不会骗人。骗人的是看海的人。' },
  ],
  ch3_species_done: [
    { who: 'ache', text: '鳃里有黑潮孢子。它们不是病了，是在逃。' },
    { who: 'ache', text: '沉钟下面有东西在敲。你祖父的潜钟就在那片阴影里。' },
    { who: 'ache', text: '潜钟的绞盘坏了。崖滩上散着三件旧零件，帮我捡回来。' },
  ],
  ch3_parts_done: [
    { who: 'ache', text: '阀、齿轮，还有一截缆绳。够用了。' },
    { who: 'ache', text: '但潜钟下面那位不会让我们安静地捞。它把钟当成了自己的壳。' },
    { who: 'you', text: '河豚？' },
    { who: 'ache', text: '胀潮河豚。它吞了钟舌，现在每次呼吸，整片潟湖都会跟着鼓。' },
  ],
  ch3_ache_2: [
    { who: 'ache', text: '胀潮饵。用气囊鱼鳔和一点钟铜屑。它闻到钟声就会发疯。' },
    { who: 'ache', text: '钓它的时候，别站在浅水里。它鼓起来会把水抽走，然后一下子放回来。' },
    { who: 'you', text: '听起来像一堵会呼吸的墙。' },
    { who: 'ache', text: '比墙快。你会知道的。' },
  ],
  ch3_boss_brief: [
    { who: 'narrator', text: '潟湖中央的水面开始一鼓一缩，像某种巨大的肺。沉钟在下面发出低低的共鸣。' },
    { who: 'radio', text: '它在吸沙。别踩实底，会被吸住。', tone: 'radio' },
    { who: 'you', text: '看见了。' },
    { who: 'radio', text: '那就钓它。别让它把线绕到钟架上。', tone: 'radio' },
  ],
  ch3_puffer_done: [
    { who: 'narrator', text: '胀潮河豚泄了气，像一座慢慢塌下去的山。它吐出的钟舌在浅水里打了个转，敲出一声很轻的响。' },
    { who: 'narrator', text: '第三枚潮鸣片卡在钟舌的裂缝里。潜钟的舱门随之打开，一股陈年的空气涌出来。' },
    { who: 'ache', text: '你祖父的字。刻在舱壁上。' },
    { who: 'narrator', text: '“若我没能回来，告诉阿屿：灯不是留给海的，是留给人回家的。”' },
    { who: 'ache', text: '……我哥的名字也在旁边。他来过这里。' },
  ],
  ch3_log: [
    { who: 'narrator', text: '防水日志的最后一页被撕掉了一半。剩下的字迹很急，墨水被水洇开。' },
    { who: 'log', text: '九月廿二。韩照把钻头插进潮心。他说只取一点。海不需要很多理由才发怒。', tone: 'log' },
    { who: 'log', text: '九月廿三。我听见鲸歌。它在数我们。一个，两个，三个……', tone: 'log' },
    { who: 'log', text: '九月廿四。如果阿屿看到这里，别去烬潮。至少，别一个人去。', tone: 'log' },
    { who: 'ache', text: '烬潮岛。风暴眼里那座火山。' },
    { who: 'you', text: '他去了。' },
    { who: 'ache', text: '那你也得去。但我先说明，我的船不载疯子。' },
    { who: 'you', text: '……' },
    { who: 'ache', text: '好吧。看在你祖父那瓶酒的份上。' },
  ],

  // ── Chapter IV ────────────────────────────────────────────────────
  ch4_arrival: [
    { who: 'narrator', text: '断帆崖的天压得很低。云像一块浸满铁锈的布，把海和岛一起裹住。' },
    { who: 'narrator', text: '浪撞在崖壁上，声音不是“哗”，而是“咚”。整座岛像一面被敲响的鼓。' },
    { who: 'huoxiao', text: '把船系紧！别用那种活结，风一扯就开！' },
    { who: 'you', text: '霍骁船长？' },
    { who: 'huoxiao', text: '你祖父欠我一条船。你也欠。先帮我把船修好，再谈别的。' },
  ],
  ch4_huo_1: [
    { who: 'huoxiao', text: '三个月前，有条金枪鱼把我的舵撞断了。三个月后，它还在外面转。' },
    { who: 'you', text: '你在等它？' },
    { who: 'huoxiao', text: '我在等风。风来了，它才会浮上来。' },
    { who: 'huoxiao', text: '船坞缺三根浮木、三枚船钉。崖滩和沉船里都有。别空手回来。' },
  ],
  ch4_wood_done: [
    { who: 'huoxiao', text: '浮木不错。你祖父以前也这么挑木头，先看纹，再看直不直。' },
    { who: 'you', text: '他教过你？' },
    { who: 'huoxiao', text: '他教过所有人。只是大部分人没在听。' },
  ],
  ch4_nails_done: [
    { who: 'huoxiao', text: '船钉够粗。行了，把木头抬上来。' },
    { who: 'narrator', text: '你们在风里敲了半个钟头。每一下锤响，都被崖壁反弹回来，像有人在深处回应。' },
  ],
  ch4_huo_2: [
    { who: 'huoxiao', text: '船能走了，但鱼饵还不够。风暴金枪只追风暴鲭。' },
    { who: 'huoxiao', text: '去浪涌边钓三条。要活的。死的它看都不看。' },
    { who: 'you', text: '它那么大，为什么还挑食？' },
    { who: 'huoxiao', text: '活到这个岁数的东西，都有自己的规矩。' },
  ],
  ch4_mackerel_done: [
    { who: 'huoxiao', text: '三条，够肥。风也到了。' },
    { who: 'narrator', text: '远处云层里亮了一下。不是闪电，像有什么东西在云里翻了个身。' },
    { who: 'huoxiao', text: '把鱼给我。做饵。' },
  ],
  ch4_huo_3: [
    { who: 'huoxiao', text: '风暴饵。鲭鱼块、雷雨水、还有一根从旧桅杆上拆下来的铜线。' },
    { who: 'huoxiao', text: '抛出去之后，别急着收。让它沉。沉到看不见。' },
    { who: 'you', text: '然后？' },
    { who: 'huoxiao', text: '然后抓紧你的竿。它会把你的手臂拉脱臼。' },
    { who: 'you', text: '你呢？' },
    { who: 'huoxiao', text: '我负责把船开走。别死在船后面。' },
  ],
  ch4_boss_brief: [
    { who: 'narrator', text: '雷声在云层里滚动。海面被风压出一道长长的凹槽，像有什么东西在水下高速穿行。' },
    { who: 'radio', text: '标枪一样的那道白浪——看见没有？它来了！', tone: 'radio' },
    { who: 'you', text: '看见了。' },
    { who: 'radio', text: '别让它把线拉到船底下！往外侧带！', tone: 'radio' },
  ],
  ch4_tuna_done: [
    { who: 'narrator', text: '风暴金枪最后一次跃出水面。它背鳍上的船缆在雷光里像一面裂开的旗。' },
    { who: 'narrator', text: '它落下来时，海面安静了一瞬。然后第四枚潮鸣片从它嘴里滑出，沉向你的脚边。' },
    { who: 'huoxiao', text: '它拖上来的不止是鱼线。还有一只旧录音箱。' },
    { who: 'you', text: '上面有祖父的名字。' },
    { who: 'huoxiao', text: '打开它。有些话，海替你存了十年。' },
  ],
  ch4_recorder: [
    { who: 'narrator', text: '录音箱里只有一段磁带。海浪声很大，两个人的声音忽远忽近。' },
    { who: 'log', text: '望潮，我打开了潮心。不是为钱。阿遥的病……你看见她咳出来的东西了。', tone: 'log' },
    { who: 'log', text: '韩照，你听见了吗？它在唱歌。它在叫我们停手。', tone: 'log' },
    { who: 'log', text: '再给我三天。三天之后，不管成不成，我跟你回去。', tone: 'log' },
    { who: 'narrator', text: '录音最后是一声很长的鲸鸣。然后，磁带断了。' },
    { who: 'huoxiao', text: '烬潮岛在风暴眼里。只进不出。你想清楚。' },
    { who: 'you', text: '他已经等了我十年。' },
    { who: 'huoxiao', text: '那就去吧。这条船，我借你。' },
  ],

  // ── Chapter V ─────────────────────────────────────────────────────
  ch5_arrival: [
    { who: 'narrator', text: '烬潮岛从风暴眼里升起来，像一块被烧黑的骨头。' },
    { who: 'narrator', text: '空气里有硫磺、盐和某种很淡的甜味。你认得这个味道——祖父的灯油。' },
    { who: 'shen', text: '你比我快。灯我点着了，可海在往下沉。' },
    { who: 'you', text: '沈叔？你怎么……' },
    { who: 'shen', text: '我开另一条船来的。别骂，先上来。韩照在火山口。' },
  ],
  ch5_shen_1: [
    { who: 'shen', text: '韩照不是要毁掉海。他是想把她换回来。' },
    { who: 'you', text: '她是谁？' },
    { who: 'shen', text: '他女儿。二十年前死在黑潮里的第一批人。' },
    { who: 'shen', text: '你祖父知道。所以他最后没有阻止韩照，只是把潮心的门锁上了。' },
    { who: 'you', text: '然后呢？' },
    { who: 'shen', text: '然后海把他留下了。现在轮到你了。' },
    { who: 'shen', text: '去火山营地。韩照在等你。别带竿。' },
    { who: 'you', text: '为什么？' },
    { who: 'shen', text: '因为这一次，你得先听他把话说完。' },
  ],
  ch5_han_1: [
    { who: 'narrator', text: '火山营地搭在熔岩小径的尽头。韩照坐在一箱旧仪器上，白衬衫被灰烬染成灰色。' },
    { who: 'hanzhao', text: '沈屿。你的眼睛和他一模一样。' },
    { who: 'you', text: '你害死了他。' },
    { who: 'hanzhao', text: '是。也不全是。' },
    { who: 'hanzhao', text: '潮心不是宝石。是这整片海的神经。二十年前我刺伤它，现在黑潮在替它疼。' },
    { who: 'hanzhao', text: '噬潮鲸是它最后的守卫。要修好潮心，得先让它安静。' },
    { who: 'you', text: '怎么让它安静？' },
    { who: 'hanzhao', text: '渊心饵。需要熔纹鳗的血，和火山口的黑曜潮晶。' },
    { who: 'you', text: '然后呢？' },
    { who: 'hanzhao', text: '然后你会有一次选择。我只能帮你走到那里。' },
  ],
  ch5_eels_done: [
    { who: 'hanzhao', text: '熔纹鳗的血还是温的。它们活在冷水和热泉之间，最能记住海的温度。' },
    { who: 'hanzhao', text: '还差黑曜潮晶。火山口边缘有，别站太近。' },
    { who: 'you', text: '你在关心我？' },
    { who: 'hanzhao', text: '我在关心潮心。你是目前唯一能靠近它的人。' },
    { who: 'you', text: '你和我祖父，到底算什么？' },
    { who: 'hanzhao', text: '……两个以为自己来得及的人。' },
  ],
  ch5_obsidian_done: [
    { who: 'narrator', text: '潮晶在掌心发烫。火山口下面传来一阵很低沉的震动，像海在很深的地方翻了个身。' },
    { who: 'hanzhao', text: '它在醒了。把东西给我。' },
  ],
  ch5_han_2: [
    { who: 'hanzhao', text: '渊心饵。不是用来钓的，是用来让潮心听见的。' },
    { who: 'hanzhao', text: '它会引来噬潮鲸。那东西是潮心的守卫，也是它的伤口。' },
    { who: 'you', text: '如果我失败了？' },
    { who: 'hanzhao', text: '海会重新学会安静。只是不会再有人记得你。' },
    { who: 'you', text: '如果我成功了呢？' },
    { who: 'hanzhao', text: '那你就能听见你祖父最后没说完的那句话。' },
    { who: 'hanzhao', text: '最后一件事。不管你听见谁的声音，别停下收线。' },
  ],
  ch5_boss_brief: [
    { who: 'narrator', text: '火山口裂开了。海水从裂缝里倒灌进去，和岩浆相遇，腾起一整片白色的雾。' },
    { who: 'narrator', text: '雾里亮起两盏灯。不是灯塔，是一双眼睛。' },
    { who: 'echo', text: '阿屿。', tone: 'echo' },
    { who: 'you', text: '……祖父。' },
    { who: 'echo', text: '别停下收线。', tone: 'echo' },
  ],
  ch5_whale_done: [
    { who: 'narrator', text: '噬潮鲸缓缓沉入潮心。它身体里的星河一盏盏熄灭，最后一盏没有灭——它停在你的浮漂下面，像一颗等了你很久的星。' },
    { who: 'narrator', text: '潮心就在鲸落之下。一枚巨大的、半透明的脉动，像海自己露出的心脏。' },
    { who: 'hanzhao', text: '到了。现在，选吧。' },
    { who: 'shen', text: '不管你选什么，我都在岸上等你。', tone: 'radio' },
    { who: 'you', text: '……' },
  ],
  ch5_choice: [
    { who: 'narrator', text: '潮心在你面前一开一合。你能听见里面有很多声音：祖父的、韩照的、阿澈哥哥的，还有那些从没被人记住名字的鱼。' },
    { who: 'echo', text: '阿屿。灯要亮着，但人也要回家。', tone: 'echo' },
  ],

  // ── Endings ───────────────────────────────────────────────────────
  ending_keep: [
    { who: 'narrator', text: '你把手放在潮心上。它很凉，像一块泡了太久的月光。' },
    { who: 'narrator', text: '你想起祖父修灯的样子。灯不是为了照亮海，是为了让回来的人知道该往哪里靠。' },
    { who: 'narrator', text: '潮心重新开始跳动。黑潮退去，火山口的雾一点点散开。' },
    { who: 'shen', text: '灯亮了。' },
    { who: 'you', text: '我知道。' },
    { who: 'narrator', text: '从那以后，归潮岛的灯塔每晚都会亮。有时，塔顶会多坐一个年轻人，手里握着一根旧竿。' },
    { who: 'narrator', text: '他在等潮声。也等每一个回家的人。' },
  ],
  ending_quiet: [
    { who: 'narrator', text: '你把手放在潮心上。它很凉，像一块泡了太久的月光。' },
    { who: 'narrator', text: '你想起那些被黑潮改变的东西。它们不再叫了，也不再疼了。' },
    { who: 'narrator', text: '你收紧了线，然后松开。潮心在你的掌心下慢慢安静，像一盏被吹灭的灯。' },
    { who: 'narrator', text: '黑潮停了。海恢复了它本来的颜色。' },
    { who: 'shen', text: '阿屿？阿屿，回答我。' },
    { who: 'narrator', text: '你想回答，却发现自己已经想不起“阿屿”是谁。' },
    { who: 'narrator', text: '从那以后，归潮岛的灯塔每晚都会亮。只是再也没有人知道，是谁把它点起来的。' },
  ],
};
