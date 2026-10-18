// Fish are original creations. Shape parameters feed the procedural fish atelier;
// every species gets its own hand-tuned silhouette, skin pattern and fin language.

export const RARITY = {
  common: { label: '常见', color: '#b8d4cf', weight: 68 },
  uncommon: { label: '少见', color: '#8fd9b6', weight: 22 },
  rare: { label: '稀有', color: '#6ab7ff', weight: 7.4 },
  epic: { label: '史诗', color: '#c89bff', weight: 2.2 },
  legendary: { label: '传说', color: '#ffc76b', weight: 0.4 },
  boss: { label: '潮主', color: '#ff8d66', weight: 0 },
};

export const BAITS = {
  worm: {
    id: 'worm', name: '沙虫饵', short: '沙虫', color: '#d9a66b', price: 8,
    desc: '从潮间带翻出的沙虫。朴素，但近岸的鱼无法拒绝。',
    tag: '近岸',
  },
  shrimp: {
    id: 'shrimp', name: '活虾饵', short: '活虾', color: '#ff9d87', price: 18,
    desc: '活蹦乱跳的浅海虾。礁盘与红树区的硬通货。',
    tag: '礁盘',
  },
  lure: {
    id: 'lure', name: '月鳞拟饵', short: '拟饵', color: '#9bd8ff', price: 32,
    desc: '手工打磨的金属亮片，模仿受伤的小鱼。掠食者会为它发疯。',
    tag: '掠食',
  },
  glow: {
    id: 'glow', name: '萤潮藻饵', short: '藻饵', color: '#80ffd0', price: 46,
    desc: '以雾泽萤藻调制的发光饵。夜色与深水中，像一颗小小的心脏。',
    tag: '夜行',
  },
  deep: {
    id: 'deep', name: '深海腥饵', short: '腥饵', color: '#c896ff', price: 72,
    desc: '用鱼骨和冷海油脂捣成。气味能让深渊里的东西抬头。',
    tag: '深水',
  },
  boss1: { id: 'boss1', name: '铁潮饵', short: '铁潮', color: '#c4d4df', price: 0, quest: true, desc: '潮铁、锈与旧灯油揉成的饵。黑礁下的甲壳在等它。' },
  boss2: { id: 'boss2', name: '萤骨饵', short: '萤骨', color: '#7df0c0', price: 0, quest: true, desc: '萤藻裹着鱼骨。水面会先亮起来，然后水下的獠牙才出现。' },
  boss3: { id: 'boss3', name: '胀潮饵', short: '胀潮', color: '#ffc46b', price: 0, quest: true, desc: '会自己鼓起来的气囊饵。环礁的旧钟声一响，它就发烫。' },
  boss4: { id: 'boss4', name: '风暴饵', short: '风暴', color: '#8fb7d9', price: 0, quest: true, desc: '浸过雷雨的羽毛与鲭鱼块。断崖的风会替你把它送下去。' },
  boss5: { id: 'boss5', name: '渊心饵', short: '渊心', color: '#ff826b', price: 0, quest: true, desc: '最后一枚潮鸣片磨成的饵。它不诱鱼，它在呼唤。' },
};

const c = (back, mid, belly, fin, accent, eye = '#e8d9a0') => ({ back, mid, belly, fin, accent, eye });

export const FISH = {
  // ── Chapter I · 归潮岛 ─────────────────────────────────────────────
  silver_bream: {
    id: 'silver_bream', name: '银鳍鲷', latin: 'Acanthopagrus argenteus', chapter: 1,
    rarity: 'common', price: 24, weight: [0.4, 1.9], length: [0.24, 0.46], strength: 0.34,
    baits: ['worm', 'shrimp'], habitat: '栈桥 · 近岸', active: '晨昏',
    desc: '归潮湾最常见的住民。鳞片像被海风擦亮的旧银器，尾鳍边缘有一道很淡的蓝。',
    clue: '在栈桥附近用沙虫饵，几乎不会落空。',
    shape: {
      type: 'fish', h: 0.34, w: 0.17, snout: 0.16, head: 0.82, tail: 'fork',
      dorsal: 'spiny', pectoral: 'round', pattern: 'scales',
      colors: c('#4e7184', '#a9c6ce', '#e8e3cf', '#7595a6', '#d6b86a'),
      iridescence: 0.24,
    },
  },
  sand_sardine: {
    id: 'sand_sardine', name: '沙丁鱼', latin: 'Sardina harenae', chapter: 1,
    rarity: 'common', price: 12, weight: [0.08, 0.28], length: [0.12, 0.2], strength: 0.18,
    baits: ['worm'], habitat: '近岸 · 水面', active: '全天',
    desc: '成群时像一小片会移动的雨。单独钓上来时，掌心能感到它急促的心跳。',
    clue: '用沙虫饵，注意浮漂周围细碎的银光。',
    shape: {
      type: 'fish', h: 0.22, w: 0.12, snout: 0.1, head: 0.86, tail: 'fork',
      dorsal: 'small', pectoral: 'small', pattern: 'gradient',
      colors: c('#2d5669', '#8db9c5', '#f0eee3', '#8faeb7', '#7ab6c8'),
    },
  },
  golden_thread: {
    id: 'golden_thread', name: '金线鱼', latin: 'Nemipterus aureolineatus', chapter: 1,
    rarity: 'uncommon', price: 42, weight: [0.3, 1.3], length: [0.2, 0.38], strength: 0.44,
    baits: ['shrimp', 'worm'], habitat: '礁石 · 沙底', active: '黄昏',
    desc: '体侧有三条金线，落日时几乎会自己发光。老人们说它是潮水写下的账本。',
    clue: '黄昏的礁石边，活虾比沙虫更受青睐。',
    shape: {
      type: 'fish', h: 0.4, w: 0.18, snout: 0.14, head: 0.78, tail: 'fork',
      dorsal: 'spiny', pectoral: 'round', pattern: 'stripes',
      colors: c('#7b4d48', '#d9a96e', '#f5e8ce', '#e3a75e', '#ffe08a'),
      iridescence: 0.12,
    },
  },
  shore_crab: {
    id: 'shore_crab', name: '青蟹', latin: 'Scylla viridis', chapter: 1,
    rarity: 'common', price: 34, weight: [0.25, 1.1], length: [0.14, 0.26], strength: 0.5,
    baits: ['worm'], habitat: '潮池 · 礁缝', active: '夜间',
    desc: '壳青得像一块浸过海水的玉。它上岸时横着走，被钓起时也横着挣扎。',
    clue: '把饵放到礁石缝边，等那一声轻微的钳响。',
    shape: {
      type: 'crab', h: 0.42, w: 0.58, snout: 0, head: 0, tail: 'none',
      dorsal: 'none', pectoral: 'none', pattern: 'mottle',
      colors: c('#274c42', '#4f8a6a', '#a6c49b', '#3f6b58', '#d7a35e'),
    },
  },
  moon_jelly: {
    id: 'moon_jelly', name: '海月水母', latin: 'Aurelia lunaris', chapter: 1,
    rarity: 'uncommon', price: 52, weight: [0.5, 2.2], length: [0.2, 0.42], strength: 0.3,
    baits: ['shrimp', 'glow'], habitat: '静水 · 夜色', active: '夜间',
    desc: '半透明的伞盖里浮着四枚月亮。它不会挣扎，只会随着钓线安静地升上来。',
    clue: '夜里，用活虾在静水区下钩。',
    shape: {
      type: 'jelly', h: 0.5, w: 0.9, snout: 0, head: 0, tail: 'none',
      dorsal: 'none', pectoral: 'none', pattern: 'gradient',
      colors: c('#8ecad4', '#c7eef0', '#f4fbff', '#bde9ec', '#ffe2f0'),
      transparent: 0.55, glow: '#bff6ff',
    },
  },
  clown_anemone: {
    id: 'clown_anemone', name: '小丑鱼', latin: 'Amphiprion corallinus', chapter: 1,
    rarity: 'uncommon', price: 58, weight: [0.08, 0.32], length: [0.08, 0.14], strength: 0.25,
    baits: ['shrimp'], habitat: '珊瑚 · 浅礁', active: '全天',
    desc: '橙白相间，像一小段被海水点亮的夕阳。它总在珊瑚缝里探头，又在你靠近时消失。',
    clue: '在浅礁用活虾，别被它的小个子骗了。',
    shape: {
      type: 'fish', h: 0.38, w: 0.18, snout: 0.12, head: 0.76, tail: 'round',
      dorsal: 'spiny', pectoral: 'round', pattern: 'bands',
      colors: c('#d75a2f', '#f58d38', '#ffd9a2', '#f4a35d', '#fff2d8'),
    },
  },
  sea_bass: {
    id: 'sea_bass', name: '海鲈', latin: 'Lateolabrax pelagicus', chapter: 1,
    rarity: 'rare', price: 86, weight: [1.1, 4.6], length: [0.42, 0.78], strength: 0.72,
    baits: ['lure', 'shrimp'], habitat: '深水 · 断层', active: '晨昏',
    desc: '潮湾的猎手。上钩后第一波冲刺会拖得卸力器尖叫，鳞片在空气里泛着冷铁色。',
    clue: '亮片拟饵在断层边拖过，会激怒它。',
    shape: {
      type: 'fish', h: 0.3, w: 0.16, snout: 0.18, head: 0.8, tail: 'fork',
      dorsal: 'spiny', pectoral: 'round', pattern: 'scales',
      colors: c('#344d5e', '#9fb3b8', '#e7e1d0', '#657e8b', '#b49a6c'),
      iridescence: 0.3,
    },
  },
  lantern_snapper: {
    id: 'lantern_snapper', name: '灯鳍鲷', latin: 'Pristipomoides lucernus', chapter: 1,
    rarity: 'rare', price: 128, weight: [0.6, 2.2], length: [0.26, 0.42], strength: 0.55,
    baits: ['glow'], habitat: '深水 · 夜礁', active: '深夜',
    desc: '眼下有一枚会呼吸的蓝绿光点，像海底遗落的一盏航标灯。',
    clue: '入夜后，用萤潮藻饵在深水区下钩。',
    shape: {
      type: 'fish', h: 0.42, w: 0.2, snout: 0.12, head: 0.76, tail: 'fork',
      dorsal: 'spiny', pectoral: 'round', pattern: 'spots',
      colors: c('#293e58', '#6e7f9d', '#d7d2c4', '#667c9e', '#6ff3d2'),
      glow: '#62f6d4', iridescence: 0.2,
    },
  },
  iron_crab: {
    id: 'iron_crab', name: '铁甲潮蟹', latin: 'Scylla ferrea', chapter: 1, boss: true,
    rarity: 'boss', price: 0, weight: [24, 31], length: [2.1, 2.6], strength: 2.2,
    baits: ['boss1'], habitat: '黑礁 · 潮穴', active: '低潮',
    desc: '背甲上嵌着历代沉船的铆钉与铁片。它守着的不是巢穴，而是一块会唱歌的铜片。',
    clue: '铁潮饵的锈味会把它从黑礁下引出来。',
    shape: {
      type: 'crab', h: 0.5, w: 0.74, snout: 0, head: 0, tail: 'none',
      dorsal: 'none', pectoral: 'none', pattern: 'mottle',
      colors: c('#2c3337', '#59646a', '#a38e73', '#4a5258', '#d0a45d'),
      iridescence: 0.15,
    },
    boss: { chapter: 1, title: '黑礁的守门人', core: 'tide_shard_1', element: '甲壳', color: '#d4a15c' },
  },

  // ── Chapter II · 雾苇泽 ───────────────────────────────────────────
  mud_catfish: {
    id: 'mud_catfish', name: '泥须鲶', latin: 'Silurus lutulentus', chapter: 2,
    rarity: 'common', price: 20, weight: [0.5, 2.4], length: [0.3, 0.55], strength: 0.48,
    baits: ['worm'], habitat: '红树根 · 泥底', active: '全天',
    desc: '嘴边拖着两缕泥色的须，像从旧梦里长出来的东西。离水后会发出低低的咕噜声。',
    clue: '红树根下的泥底，用沙虫饵。',
    shape: {
      type: 'fish', h: 0.24, w: 0.2, snout: 0.12, head: 0.86, tail: 'round',
      dorsal: 'small', pectoral: 'round', pattern: 'mottle',
      colors: c('#3b342b', '#786a52', '#d8c7a4', '#5b4f3e', '#b39762'),
    },
  },
  mangrove_shrimp: {
    id: 'mangrove_shrimp', name: '红树虾', latin: 'Palaemon rhizophorae', chapter: 2,
    rarity: 'common', price: 14, weight: [0.02, 0.08], length: [0.04, 0.08], strength: 0.12,
    baits: ['worm'], habitat: '红树根 · 潮沟', active: '夜间',
    desc: '半透明的身体里有细细的红线。受惊时会弹出一小团水雾，像玻璃碎掉。',
    clue: '潮沟边用沙虫饵，耐心等一个很小的咬口。',
    shape: {
      type: 'shrimp', h: 0.18, w: 0.1, snout: 0.3, head: 0.9, tail: 'fan',
      dorsal: 'none', pectoral: 'none', pattern: 'gradient',
      colors: c('#9d4b49', '#e69b82', '#ffe5cf', '#e8a18c', '#ffcf9d'),
      transparent: 0.25,
    },
  },
  glow_killifish: {
    id: 'glow_killifish', name: '萤光鳉', latin: 'Aplocheilus lucens', chapter: 2,
    rarity: 'uncommon', price: 62, weight: [0.03, 0.12], length: [0.05, 0.1], strength: 0.2,
    baits: ['glow'], habitat: '静水 · 萤藻丛', active: '夜间',
    desc: '尾鳍里藏着一粒萤火。它们会在无风的夜里聚成一条发光的河，绕着红树根打转。',
    clue: '萤潮藻饵。找那些没有波纹的水面。',
    shape: {
      type: 'fish', h: 0.28, w: 0.14, snout: 0.1, head: 0.8, tail: 'fan',
      dorsal: 'small', pectoral: 'small', pattern: 'spots',
      colors: c('#1f3f3c', '#5ca77f', '#dff5cb', '#83d6ac', '#a7ffcb'),
      glow: '#8dffc2', transparent: 0.1,
    },
  },
  spiny_ray: {
    id: 'spiny_ray', name: '刺尾鳐', latin: 'Dasyatis spinicauda', chapter: 2,
    rarity: 'rare', price: 146, weight: [2.1, 7.8], length: [0.8, 1.5], strength: 1.02,
    baits: ['deep', 'shrimp'], habitat: '泥滩 · 深沟', active: '夜间',
    desc: '像一片会飞的阴影。尾刺在月光下泛着蓝，它贴着泥底滑行，几乎没有声音。',
    clue: '深水腥饵沉底。它会在最后一刻才动。',
    shape: {
      type: 'ray', h: 0.2, w: 1.0, snout: 0.2, head: 0.55, tail: 'whip',
      dorsal: 'none', pectoral: 'none', pattern: 'spots',
      colors: c('#454b55', '#7b7e7f', '#d8d1be', '#676d78', '#8fb5c9'),
      iridescence: 0.12,
    },
  },
  needle_gar: {
    id: 'needle_gar', name: '针吻雀鳝', latin: 'Belone aculeata', chapter: 2,
    rarity: 'uncommon', price: 52, weight: [0.3, 1.2], length: [0.4, 0.75], strength: 0.58,
    baits: ['lure', 'worm'], habitat: '水面 · 潮沟', active: '黄昏',
    desc: '一张极长的喙，像一截被拉直的银色铁丝。它跃出水面时，会在空气里留下一道针线。',
    clue: '用亮片在水面快速拖拽。',
    shape: {
      type: 'fish', h: 0.12, w: 0.09, snout: 0.42, head: 0.72, tail: 'fork',
      dorsal: 'small', pectoral: 'small', pattern: 'gradient',
      colors: c('#345962', '#a6c5c0', '#edf5e8', '#96b9b4', '#c8d7c3'),
    },
  },
  mist_eel: {
    id: 'mist_eel', name: '雾泽鳗', latin: 'Anguilla nebulosa', chapter: 2,
    rarity: 'rare', price: 118, weight: [0.8, 2.7], length: [0.7, 1.3], strength: 0.86,
    baits: ['glow', 'worm'], habitat: '沉木 · 浑水', active: '夜间',
    desc: '身上有雾一样的白斑。它游过的地方，水面会短暂地失去倒影。',
    clue: '在沉木潭用萤潮藻饵，等一口很沉的咬钩。',
    shape: {
      type: 'eel', h: 0.15, w: 0.12, snout: 0.16, head: 0.9, tail: 'whip',
      dorsal: 'long', pectoral: 'small', pattern: 'mottle',
      colors: c('#2c3a36', '#5d7669', '#c9d3bb', '#6b8b78', '#e0e3c6'),
      glow: '#9ab8a4',
    },
  },
  giant_pike: {
    id: 'giant_pike', name: '蚀鳞狗鱼', latin: 'Esox corrosus', chapter: 2, boss: true,
    rarity: 'boss', price: 0, weight: [54, 68], length: [4.1, 5.0], strength: 2.8,
    baits: ['boss2'], habitat: '沉木潭 · 深沟', active: '无月之夜',
    desc: '鳞片被黑潮蚀出蜂窝般的孔洞，孔里透出幽绿的光。它吞下的每一块金属，都会在夜里唱歌。',
    clue: '萤骨饵入水时，沉木潭会先安静下来。',
    shape: {
      type: 'fish', h: 0.27, w: 0.17, snout: 0.4, head: 0.8, tail: 'fork',
      dorsal: 'spiny', pectoral: 'round', pattern: 'mottle',
      colors: c('#25392f', '#5b6b4a', '#ad9e72', '#627357', '#8affb5'),
      glow: '#77e6a1', iridescence: 0.25,
    },
    boss: { chapter: 2, title: '沉木潭的獠牙', core: 'tide_shard_2', element: '腐鳞', color: '#86e39e' },
  },

  // ── Chapter III · 琥珀环礁 ─────────────────────────────────────────
  parrotfish: {
    id: 'parrotfish', name: '鹦嘴鱼', latin: 'Scarus psittacus', chapter: 3,
    rarity: 'common', price: 38, weight: [0.9, 3.8], length: [0.4, 0.8], strength: 0.6,
    baits: ['shrimp', 'worm'], habitat: '珊瑚 · 浅礁', active: '白天',
    desc: '喙状的牙齿啃食珊瑚，排出细白的沙。环礁的每一粒沙，几乎都经过它的身体。',
    clue: '活虾在珊瑚礁边缘最有效。',
    shape: {
      type: 'fish', h: 0.36, w: 0.2, snout: 0.2, head: 0.72, tail: 'fan',
      dorsal: 'long', pectoral: 'round', pattern: 'gradient',
      colors: c('#1f6b6a', '#45c0a2', '#f3e6b5', '#f0946c', '#f5c95c'),
      iridescence: 0.36,
    },
  },
  bluering_ray: {
    id: 'bluering_ray', name: '蓝环鳐', latin: 'Taeniura caerulea', chapter: 3,
    rarity: 'uncommon', price: 98, weight: [1.2, 4.5], length: [0.6, 1.1], strength: 0.9,
    baits: ['shrimp', 'deep'], habitat: '沙底 · 潟湖', active: '白天',
    desc: '背上散落着钴蓝色的圆环，像一张被海图师遗落的星图。它拂过白沙时，影子比身体更先消失。',
    clue: '在潟湖沙底用活虾，慢慢等它贴底巡游。',
    shape: {
      type: 'ray', h: 0.18, w: 0.94, snout: 0.15, head: 0.55, tail: 'whip',
      dorsal: 'none', pectoral: 'none', pattern: 'rings',
      colors: c('#756a58', '#b9a985', '#f2e6c8', '#8b7b63', '#3d8dff'),
      iridescence: 0.2,
    },
  },
  coral_trout: {
    id: 'coral_trout', name: '珊瑚鳟', latin: 'Plectropomus corallinus', chapter: 3,
    rarity: 'uncommon', price: 76, weight: [1.0, 4.2], length: [0.4, 0.72], strength: 0.68,
    baits: ['shrimp', 'lure'], habitat: '礁脊 · 洞穴', active: '晨昏',
    desc: '红色底子上布满蓝色小点，像一块会游动的珊瑚。它伏击时纹丝不动，连鳃盖都像岩石。',
    clue: '在礁脊背流处下饵，它会从洞穴里冲出来。',
    shape: {
      type: 'fish', h: 0.36, w: 0.2, snout: 0.15, head: 0.78, tail: 'round',
      dorsal: 'spiny', pectoral: 'round', pattern: 'spots',
      colors: c('#7d2d2c', '#c2543e', '#efcbb0', '#b74b3d', '#59b7e8'),
    },
  },
  moorish_idol: {
    id: 'moorish_idol', name: '旗鲷', latin: 'Zanclus vexillum', chapter: 3,
    rarity: 'rare', price: 136, weight: [0.2, 0.7], length: [0.16, 0.26], strength: 0.4,
    baits: ['shrimp', 'glow'], habitat: '礁盘 · 光影', active: '白天',
    desc: '背鳍拉成一条长长的白旗，身上三道黑带像被墨笔认真画过。它游动时几乎不摆尾。',
    clue: '在阳光最好的礁盘，用活虾。',
    shape: {
      type: 'fish', h: 0.5, w: 0.15, snout: 0.22, head: 0.72, tail: 'fan',
      dorsal: 'sail', pectoral: 'small', pattern: 'bands',
      colors: c('#e5d7ac', '#f3e6b6', '#fff8de', '#f0dfaa', '#25282a'),
      iridescence: 0.1,
    },
  },
  porcupine_puffer: {
    id: 'porcupine_puffer', name: '刺河豚', latin: 'Diodon spinosus', chapter: 3,
    rarity: 'uncommon', price: 68, weight: [0.4, 1.6], length: [0.2, 0.38], strength: 0.62,
    baits: ['shrimp', 'deep'], habitat: '礁洞 · 沙坑', active: '夜间',
    desc: '一生气就把自己吹成一颗带刺的月亮。牙齿像两片小铡刀，能把贝壳咬成沙。',
    clue: '活虾沉到礁洞边，它会慢慢鼓起来。',
    shape: {
      type: 'puffer', h: 0.55, w: 0.48, snout: 0.1, head: 0.8, tail: 'fan',
      dorsal: 'small', pectoral: 'small', pattern: 'spots',
      colors: c('#8a7049', '#d6b46f', '#f8e8bf', '#c4a46e', '#6b5742'),
      spikes: true,
    },
  },
  napoleon_wrasse: {
    id: 'napoleon_wrasse', name: '苏眉', latin: 'Cheilinus napoleonis', chapter: 3,
    rarity: 'rare', price: 210, weight: [6.5, 18], length: [0.8, 1.3], strength: 1.15,
    baits: ['lure', 'deep'], habitat: '外礁 · 深沟', active: '白天',
    desc: '额头隆起像一顶旧王冠。它活得很久，久到记得每一艘沉船的名字。',
    clue: '外礁深沟，亮片或腥饵都可能引来它的注视。',
    shape: {
      type: 'fish', h: 0.34, w: 0.24, snout: 0.2, head: 0.7, tail: 'round',
      dorsal: 'long', pectoral: 'round', pattern: 'mottle',
      colors: c('#2e5b54', '#5b8f74', '#d7d7a4', '#4f7d67', '#b9d8a2'),
    },
  },
  puffer_king: {
    id: 'puffer_king', name: '胀潮河豚', latin: 'Diodon regalis', chapter: 3, boss: true,
    rarity: 'boss', price: 0, weight: [88, 112], length: [3.2, 4.1], strength: 2.6,
    baits: ['boss3'], habitat: '沉钟 · 潟湖底', active: '退潮',
    desc: '它吞下了沉钟的铜舌，从此每一次呼吸都带着钟声。鼓起来时，整片潟湖会抬高半尺。',
    clue: '胀潮饵会随着钟声鼓动。把它投向潟湖中央的阴影。',
    shape: {
      type: 'puffer', h: 0.68, w: 0.62, snout: 0.12, head: 0.82, tail: 'fan',
      dorsal: 'small', pectoral: 'small', pattern: 'mottle',
      colors: c('#6b4a32', '#c88c4e', '#f4d896', '#b7834c', '#f4b24e'),
      spikes: true, glow: '#ffbc5e',
    },
    boss: { chapter: 3, title: '沉钟下的胀潮', core: 'tide_shard_3', element: '气囊', color: '#f3b45c' },
  },

  // ── Chapter IV · 断帆崖 ───────────────────────────────────────────
  storm_mackerel: {
    id: 'storm_mackerel', name: '风暴鲭', latin: 'Scomber tempestas', chapter: 4,
    rarity: 'common', price: 44, weight: [0.5, 1.8], length: [0.28, 0.46], strength: 0.52,
    baits: ['worm', 'lure'], habitat: '断崖 · 浪涌', active: '风暴前',
    desc: '背上有闪电状的波纹。气压一低，它们就成群浮到水面，像海在提前呼吸。',
    clue: '风起之前，用沙虫或亮片在浪涌边。',
    shape: {
      type: 'fish', h: 0.24, w: 0.14, snout: 0.14, head: 0.84, tail: 'fork',
      dorsal: 'small', pectoral: 'small', pattern: 'stripes',
      colors: c('#1d4054', '#6f9cb3', '#ece8d5', '#5f8da5', '#9fd7e8'),
      iridescence: 0.25,
    },
  },
  yellowfin_tuna: {
    id: 'yellowfin_tuna', name: '黄鳍金枪', latin: 'Thunnus flavipinnis', chapter: 4,
    rarity: 'uncommon', price: 168, weight: [8, 24], length: [0.7, 1.2], strength: 1.35,
    baits: ['lure', 'deep'], habitat: '外海 · 断层', active: '全天',
    desc: '一枚梭形的肌肉。第二背鳍和臀鳍是明亮的柠檬黄，像两把燃烧的小刀。',
    clue: '亮片拟饵。它上钩后的第一分钟，你只能握紧。',
    shape: {
      type: 'tuna', h: 0.28, w: 0.2, snout: 0.18, head: 0.82, tail: 'crescent',
      dorsal: 'small', pectoral: 'long', pattern: 'gradient',
      colors: c('#1c3d5a', '#6f97b8', '#e9e5d6', '#f2c64d', '#f7d568'),
      iridescence: 0.3,
    },
  },
  flying_fish: {
    id: 'flying_fish', name: '飞鱼', latin: 'Exocoetus alatus', chapter: 4,
    rarity: 'rare', price: 156, weight: [0.2, 0.6], length: [0.22, 0.34], strength: 0.5,
    baits: ['lure'], habitat: '海面 · 风线', active: '风暴前',
    desc: '胸鳍展开时像两片薄薄的银纸。它能贴着浪尖滑出几十米，落水时几乎没有声音。',
    clue: '风大的时候，亮片贴着水面拖过。',
    shape: {
      type: 'fish', h: 0.2, w: 0.13, snout: 0.18, head: 0.8, tail: 'fork',
      dorsal: 'small', pectoral: 'wing', pattern: 'gradient',
      colors: c('#315675', '#9bc3d8', '#f4f3e7', '#b7d7e6', '#e8f6ff'),
      iridescence: 0.4,
    },
  },
  oarfish: {
    id: 'oarfish', name: '皇带鱼', latin: 'Regalecus longus', chapter: 4,
    rarity: 'epic', price: 330, weight: [12, 32], length: [3.2, 5.6], strength: 1.55,
    baits: ['deep'], habitat: '深渊 · 断层', active: '深夜',
    desc: '银色的身体像一条被拉长的月光，背鳍是一条没有尽头的红缨。水手叫它“地震鱼”。',
    clue: '深海腥饵。它从很远的地方来，咬钩也像一场地震。',
    shape: {
      type: 'eel', h: 0.14, w: 0.1, snout: 0.14, head: 0.94, tail: 'whip',
      dorsal: 'long', pectoral: 'small', pattern: 'gradient',
      colors: c('#53697a', '#c4d4d8', '#f6f3e7', '#d64b46', '#e8eef0'),
      iridescence: 0.55, glow: '#dfeef2',
    },
  },
  anglerfish: {
    id: 'anglerfish', name: '深海鮟鱇', latin: 'Melanocetus abyssi', chapter: 4,
    rarity: 'epic', price: 386, weight: [2.5, 6.8], length: [0.5, 0.9], strength: 1.2,
    baits: ['deep', 'glow'], habitat: '深渊 · 海沟', active: '深夜',
    desc: '额前挑着一盏冷光。它不在乎光里有什么，只在乎谁会游过来。',
    clue: '深水区用腥饵。那点冷光比浮漂更早出现。',
    shape: {
      type: 'angler', h: 0.52, w: 0.44, snout: 0.2, head: 0.62, tail: 'fan',
      dorsal: 'small', pectoral: 'round', pattern: 'mottle',
      colors: c('#1e2024', '#3c3b3e', '#77706a', '#25272b', '#a7ffdc'),
      glow: '#92ffe1', transparent: 0.04,
    },
  },
  blue_shark: {
    id: 'blue_shark', name: '蓝鲨', latin: 'Prionace caerulea', chapter: 4,
    rarity: 'rare', price: 310, weight: [18, 46], length: [1.6, 2.6], strength: 1.9,
    baits: ['lure', 'deep'], habitat: '外海 · 深蓝', active: '全天',
    desc: '背脊是一道很纯的蓝，腹部白得像被浪洗过。它绕着船游的时候，从不着急。',
    clue: '外海深水，腥饵或亮片。它会先绕一圈，再决定咬不咬。',
    shape: {
      type: 'shark', h: 0.24, w: 0.2, snout: 0.32, head: 0.82, tail: 'crescent',
      dorsal: 'sail', pectoral: 'long', pattern: 'gradient',
      colors: c('#1b4f83', '#4f83b2', '#eef0e5', '#375c7e', '#b9d4e4'),
      iridescence: 0.18,
    },
  },
  storm_tuna: {
    id: 'storm_tuna', name: '风暴金枪', latin: 'Thunnus tempestatis', chapter: 4, boss: true,
    rarity: 'boss', price: 0, weight: [186, 224], length: [3.4, 4.2], strength: 3.4,
    baits: ['boss4'], habitat: '断帆崖 · 雷潮', active: '雷暴',
    desc: '它的尾鳍上缠着断裂的船缆，背鳍高得像一面黑帆。每次冲刺，都会把海面犁出一道白沟。',
    clue: '风暴饵必须在雷声之间抛下。',
    shape: {
      type: 'tuna', h: 0.32, w: 0.24, snout: 0.2, head: 0.82, tail: 'crescent',
      dorsal: 'sail', pectoral: 'long', pattern: 'stripes',
      colors: c('#142d44', '#496d88', '#d7d6c6', '#c9a13e', '#8fe6ff'),
      iridescence: 0.3, glow: '#87ddff',
    },
    boss: { chapter: 4, title: '雷潮的黑色鱼雷', core: 'tide_shard_4', element: '雷潮', color: '#8ec9ef' },
  },

  // ── Chapter V · 烬潮岛 ────────────────────────────────────────────
  magma_eel: {
    id: 'magma_eel', name: '熔纹鳗', latin: 'Anguilla ignis', chapter: 5,
    rarity: 'uncommon', price: 190, weight: [1.2, 3.8], length: [0.8, 1.4], strength: 1.05,
    baits: ['deep', 'glow'], habitat: '热泉 · 黑岩', active: '退潮',
    desc: '体侧有熔岩一样的橙色裂纹，摸上去是温的。它活在冷水与热泉交界的地方。',
    clue: '火山热泉边，用腥饵或藻饵。',
    shape: {
      type: 'eel', h: 0.16, w: 0.13, snout: 0.16, head: 0.9, tail: 'whip',
      dorsal: 'long', pectoral: 'small', pattern: 'stripes',
      colors: c('#1b1b1d', '#4a2822', '#b66b45', '#c74d24', '#ff7a36'),
      glow: '#ff6b35', iridescence: 0.1,
    },
  },
  obsidian_snapper: {
    id: 'obsidian_snapper', name: '黑曜鲷', latin: 'Pagrus obsidianus', chapter: 5,
    rarity: 'rare', price: 268, weight: [1.4, 4.2], length: [0.35, 0.55], strength: 0.95,
    baits: ['deep', 'lure'], habitat: '黑岩 · 深沟', active: '全天',
    desc: '鳞片像磨薄的黑曜石，边缘有一线灰白。它吞下的光，会在身体里停留很久。',
    clue: '在黑岩断层用腥饵，它会从熔岩阴影里游出来。',
    shape: {
      type: 'fish', h: 0.42, w: 0.2, snout: 0.16, head: 0.78, tail: 'fork',
      dorsal: 'spiny', pectoral: 'round', pattern: 'scales',
      colors: c('#111417', '#2a3035', '#77746c', '#20262b', '#e0b36b'),
      iridescence: 0.45,
    },
  },
  abyss_jelly: {
    id: 'abyss_jelly', name: '深渊水母', latin: 'Atolla abyssalis', chapter: 5,
    rarity: 'epic', price: 310, weight: [1.1, 4.5], length: [0.3, 0.7], strength: 0.8,
    baits: ['glow', 'deep'], habitat: '海沟 · 无光带', active: '深夜',
    desc: '没有光的地方，它自己造一场小小的红色极光。触手拖得很长，像海在写一封没人读的信。',
    clue: '深渊藻饵。它的光会先于咬口抵达浮漂。',
    shape: {
      type: 'jelly', h: 0.55, w: 0.85, snout: 0, head: 0, tail: 'none',
      dorsal: 'none', pectoral: 'none', pattern: 'rings',
      colors: c('#3b1f45', '#713c77', '#e7b7d6', '#a83b5c', '#ff5b7c'),
      transparent: 0.5, glow: '#ff4f7b',
    },
  },
  stonefish: {
    id: 'stonefish', name: '石像鱼', latin: 'Synanceia statua', chapter: 5,
    rarity: 'rare', price: 348, weight: [1.8, 5.4], length: [0.35, 0.55], strength: 0.9,
    baits: ['deep'], habitat: '火山岩 · 沙坑', active: '全天',
    desc: '几乎就是一块长着眼的岩石。背鳍的毒刺沾着火山灰，连黑潮里的掠食者都绕开它。',
    clue: '腥饵沉到黑岩沙坑，等那块“石头”动一下。',
    shape: {
      type: 'angler', h: 0.5, w: 0.48, snout: 0.1, head: 0.7, tail: 'fan',
      dorsal: 'spiny', pectoral: 'round', pattern: 'mottle',
      colors: c('#2a2722', '#555044', '#8d8068', '#3b3831', '#c9a36d'),
      spikes: true,
    },
  },
  ghost_shark: {
    id: 'ghost_shark', name: '幽灵鲨', latin: 'Somniosus spectrum', chapter: 5,
    rarity: 'epic', price: 620, weight: [42, 96], length: [2.2, 3.4], strength: 2.3,
    baits: ['deep'], habitat: '海沟 · 黑潮', active: '深夜',
    desc: '皮肤像被海水磨薄的旧绸，能看见底下缓慢发亮的血管。它游过时，声呐会短暂地空白。',
    clue: '最后一章的海沟。深海腥饵，等一个没有声音的咬口。',
    shape: {
      type: 'shark', h: 0.26, w: 0.2, snout: 0.3, head: 0.82, tail: 'crescent',
      dorsal: 'sail', pectoral: 'long', pattern: 'mottle',
      colors: c('#3b4c54', '#7d9296', '#d8e2d9', '#5b7078', '#bff6ee'),
      glow: '#aef3e4', transparent: 0.18, iridescence: 0.5,
    },
  },
  abyss_whale: {
    id: 'abyss_whale', name: '噬潮鲸', latin: 'Balaenoptera vorago', chapter: 5, boss: true,
    rarity: 'boss', price: 0, weight: [6800, 8200], length: [19, 23], strength: 5.2,
    baits: ['boss5'], habitat: '烬潮 · 潮心', active: '黑潮之眼',
    desc: '它的身体里长着一条发光的潮脉，像一整片被囚禁的星河。每一次鸣叫，都会让海水忘记自己的方向。',
    clue: '渊心饵不是为了钓它。是为了让它听见你。',
    shape: {
      type: 'whale', h: 0.3, w: 0.26, snout: 0.28, head: 0.86, tail: 'fluke',
      dorsal: 'small', pectoral: 'long', pattern: 'mottle',
      colors: c('#111c2a', '#20344b', '#71868c', '#1a2c3d', '#ff875f'),
      glow: '#ff7b57', iridescence: 0.3,
    },
    boss: { chapter: 5, title: '海的最后一首歌', core: 'tideheart', element: '黑潮', color: '#ff8460' },
  },
};

export const FISH_LIST = Object.values(FISH);
export const REGULAR_FISH = FISH_LIST.filter((f) => !f.boss);
export const BOSS_FISH = FISH_LIST.filter((f) => f.boss);

export function speciesForIsland(islandId) {
  const chapter = { hub: 1, mangrove: 2, atoll: 3, cliffs: 4, volcano: 5 }[islandId];
  return REGULAR_FISH.filter((f) => f.chapter === chapter);
}

export function getBaitForSpecies(fish) {
  return fish.baits?.[0] || 'worm';
}

export function fishValue(fish, kg) {
  return Math.max(1, Math.round(fish.price * kg));
}

export function fishXp(fish, kg) {
  const rarityBonus = { common: 8, uncommon: 18, rare: 38, epic: 80, legendary: 150, boss: 400 }[fish.rarity] || 10;
  return Math.round(rarityBonus + Math.max(0, kg) * (fish.boss ? 4 : 6));
}

export function rollWeight(fish) {
  const [a, b] = fish.weight;
  // Bias toward the middle, with a rare push toward the record.
  const t = Math.pow(Math.random(), 1.55);
  const kg = a + (b - a) * t;
  return Math.round(kg * 100) / 100;
}

export function pickSpecies({ island, bait, caught = {}, rareBoost = 0 }) {
  const pool = speciesForIsland(island).filter((f) => f.baits.includes(bait));
  if (!pool.length) return null;
  const weights = pool.map((f) => {
    let w = RARITY[f.rarity].weight;
    if (!caught[f.id]) w *= 1.6;
    if (['rare', 'epic', 'legendary'].includes(f.rarity)) w *= 1 + rareBoost;
    return w;
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}
