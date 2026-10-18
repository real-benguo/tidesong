// Island art direction + level layout.
// Coordinates are metres; the builder finds the shoreline and places the pier.

export const ISLANDS = {
  hub: {
    id: 'hub', name: '归潮岛', en: 'GUI CHAO ISLAND', chapter: 1,
    seed: 1027, radius: 94, dockAngle: 0.04, dockLength: 17,
    sky: 'hub', skyRotation: 0.4,
    terrain: { profile: 'green', maxHeight: 21, hills: 9, rockiness: 0.55, beach: 1.1, tint: '#fff5df' },
    sun: { elevation: 15, azimuth: 216, color: '#ffd0a0', intensity: 3.0, ambient: '#9fb9c4' },
    fog: { color: '#e0bd97', density: 0.0024 },
    water: {
      shallow: '#2f8e8b', deep: '#102f3b', foam: '#f3e3cc', sun: '#ffd49b',
      clarity: 0.78, storm: 0.05,
    },
    weather: 'clear',
    palette: {
      grass: '#91a664', grassDry: '#c2b482', sand: '#f0ddb6', rock: '#958878',
      leaf: '#55703f', leaf2: '#7b8f4d', bark: '#5c4b3a', accent: '#e8b969',
    },
    vegetation: { palms: 14, shrubs: 48, grass: 32000, trees: 4, rocks: 34, fireflies: 0, ash: 0 },
    npcs: { shen: [31, -13], alan: [16, 51] },
    interactables: [
      { id: 'logbook', type: 'interact', pos: [-16, 44], label: '航海日志', icon: 'book' },
      { id: 'lamp', type: 'interact', pos: [26, -18], label: '灯塔旧灯', icon: 'lamp', radius: 4 },
      { id: 'tide_iron_a', type: 'collect', item: 'tide_iron', pos: [-38, 26], label: '潮铁' },
      { id: 'tide_iron_b', type: 'collect', item: 'tide_iron', pos: [43, 31], label: '潮铁' },
      { id: 'tide_iron_c', type: 'collect', item: 'tide_iron', pos: [-46, -8], label: '潮铁' },
    ],
    boss: { id: 'boss_crab', species: 'iron_crab', angle: 0.44, distance: 14, label: '黑礁 · 铁甲潮蟹' },
    props: ['lighthouse', 'cabin', 'shop', 'pier', 'boat', 'campfire', 'nets', 'sign', 'clothesline', 'rowboat'],
    music: 'hub',
  },
  mangrove: {
    id: 'mangrove', name: '雾苇泽', en: 'THE MIST REEDS', chapter: 2,
    seed: 2718, radius: 98, dockAngle: 0.08, dockLength: 18,
    sky: 'mangrove', skyRotation: 1.3,
    terrain: { profile: 'marsh', maxHeight: 6.2, hills: 2.5, rockiness: 0.25, beach: 0.4, tint: '#dfe7ce' },
    sun: { elevation: 23, azimuth: 110, color: '#e6e7c9', intensity: 1.9, ambient: '#8aa39a' },
    fog: { color: '#879d90', density: 0.0095 },
    water: {
      shallow: '#335e50', deep: '#152d2b', foam: '#bac7a9', sun: '#d8ddba',
      clarity: 0.5, storm: 0.12,
    },
    weather: 'mist',
    palette: {
      grass: '#5d6e45', grassDry: '#898862', sand: '#8f8870', rock: '#5c5e52',
      leaf: '#3d5940', leaf2: '#64784b', bark: '#463d31', accent: '#8fe3ba',
    },
    vegetation: { palms: 0, shrubs: 58, grass: 23000, trees: 40, rocks: 20, fireflies: 180, ash: 0 },
    npcs: { linman: [6, 52], laotao: [-27, 7] },
    interactables: [
      { id: 'resonance', type: 'interact', pos: [-27, 2], label: '沉木碑', icon: 'stone' },
      { id: 'glow_algae_a', type: 'collect', item: 'glow_algae', pos: [-45, 28], label: '萤潮藻' },
      { id: 'glow_algae_b', type: 'collect', item: 'glow_algae', pos: [38, 18], label: '萤潮藻' },
      { id: 'glow_algae_c', type: 'collect', item: 'glow_algae', pos: [-7, -34], label: '萤潮藻' },
    ],
    boss: { id: 'boss_pike', species: 'giant_pike', angle: 5.22, distance: 18, label: '沉木潭 · 蚀鳞狗鱼' },
    props: ['stiltHut', 'pier', 'boat', 'campfire', 'nets', 'totem', 'canoe', 'lanterns'],
    music: 'mangrove',
  },
  atoll: {
    id: 'atoll', name: '琥珀环礁', en: 'AMBER ATOLL', chapter: 3,
    seed: 3391, radius: 104, dockAngle: 0.02, dockLength: 20,
    sky: 'atoll', skyRotation: 2.1,
    terrain: { profile: 'atoll', maxHeight: 4.8, hills: 1.8, rockiness: 0.3, beach: 2.2, tint: '#fff8e3' },
    sun: { elevation: 57, azimuth: 145, color: '#fff2d2', intensity: 3.1, ambient: '#86b7bf' },
    fog: { color: '#b7ddd8', density: 0.0016 },
    water: {
      shallow: '#39b7b0', deep: '#0d5466', foam: '#f7f0dd', sun: '#fff0c6',
      clarity: 0.92, storm: 0.02,
    },
    weather: 'clear',
    palette: {
      grass: '#809b61', grassDry: '#b0a975', sand: '#f0dfb9', rock: '#9e927e',
      leaf: '#59774a', leaf2: '#8b9d5c', bark: '#695542', accent: '#79d9d0',
    },
    vegetation: { palms: 24, shrubs: 34, grass: 18000, trees: 4, rocks: 18, fireflies: 0, ash: 0 },
    npcs: { ache: [22, 54], alan: [-9, 48] },
    interactables: [
      { id: 'dive_log', type: 'interact', pos: [-24, 37], label: '潜钟残骸', icon: 'bell' },
      { id: 'dive_part_a', type: 'collect', item: 'dive_part', pos: [-55, 24], label: '潜钟零件' },
      { id: 'dive_part_b', type: 'collect', item: 'dive_part', pos: [51, 28], label: '潜钟零件' },
      { id: 'dive_part_c', type: 'collect', item: 'dive_part', pos: [43, -36], label: '潜钟零件' },
    ],
    boss: { id: 'boss_puffer', species: 'puffer_king', angle: 2.92, distance: 37, label: '潟湖中央 · 胀潮河豚' },
    props: ['wreck', 'pier', 'boat', 'hammock', 'diveGear', 'campfire', 'buoys', 'lookout'],
    music: 'atoll',
  },
  cliffs: {
    id: 'cliffs', name: '断帆崖', en: 'THE BROKEN SAIL', chapter: 4,
    seed: 4127, radius: 96, dockAngle: 0.06, dockLength: 15,
    sky: 'cliffs', skyRotation: 3.7,
    terrain: { profile: 'cliff', maxHeight: 34, hills: 8, rockiness: 0.9, beach: 0.5, tint: '#e3e8e5' },
    sun: { elevation: 34, azimuth: 70, color: '#cedde7', intensity: 1.75, ambient: '#8198a1' },
    fog: { color: '#607684', density: 0.0068 },
    water: {
      shallow: '#2f5d61', deep: '#142b38', foam: '#d6e2df', sun: '#b7d2df',
      clarity: 0.4, storm: 0.9,
    },
    weather: 'storm',
    palette: {
      grass: '#6b8160', grassDry: '#9a946e', sand: '#c8c0ad', rock: '#7b8382',
      leaf: '#40533e', leaf2: '#64734e', bark: '#494236', accent: '#8eb8da',
    },
    vegetation: { palms: 0, shrubs: 48, grass: 26000, trees: 12, rocks: 45, fireflies: 0, ash: 0 },
    npcs: { huoxiao: [15, 55], linman: [-19, 31] },
    interactables: [
      { id: 'recorder', type: 'interact', pos: [18, 49], label: '旧录音箱', icon: 'box' },
      { id: 'driftwood_a', type: 'collect', item: 'driftwood', pos: [-45, 25], label: '浮木' },
      { id: 'driftwood_b', type: 'collect', item: 'driftwood', pos: [34, 37], label: '浮木' },
      { id: 'driftwood_c', type: 'collect', item: 'driftwood', pos: [7, -31], label: '浮木' },
      { id: 'ship_nail_a', type: 'collect', item: 'ship_nail', pos: [-34, -27], label: '船钉' },
      { id: 'ship_nail_b', type: 'collect', item: 'ship_nail', pos: [45, 8], label: '船钉' },
      { id: 'ship_nail_c', type: 'collect', item: 'ship_nail', pos: [13, 18], label: '船钉' },
    ],
    boss: { id: 'boss_tuna', species: 'storm_tuna', angle: 0.55, distance: 27, label: '断崖外海 · 风暴金枪' },
    props: ['boatyard', 'pier', 'boat', 'wreck', 'campfire', 'nets', 'flag', 'crane'],
    music: 'cliffs',
  },
  volcano: {
    id: 'volcano', name: '烬潮岛', en: 'EMBER TIDE', chapter: 5,
    seed: 5521, radius: 108, dockAngle: 0.05, dockLength: 13,
    sky: 'volcano', skyRotation: 4.4,
    terrain: { profile: 'caldera', maxHeight: 42, hills: 9, rockiness: 1, beach: 1.2, tint: '#d8c1b2' },
    sun: { elevation: 17, azimuth: 250, color: '#ff9c6e', intensity: 2.15, ambient: '#7d6468' },
    fog: { color: '#5b3831', density: 0.0078 },
    water: {
      shallow: '#314a47', deep: '#0d1b22', foam: '#d5b7a2', sun: '#ff8e5e',
      clarity: 0.34, storm: 0.3,
    },
    weather: 'ash',
    palette: {
      grass: '#6a6652', grassDry: '#9d8463', sand: '#b09a84', rock: '#5a524c',
      leaf: '#3a4436', leaf2: '#5a6046', bark: '#3c332d', accent: '#ff9166',
    },
    vegetation: { palms: 0, shrubs: 22, grass: 8000, trees: 0, rocks: 60, fireflies: 0, ash: 500 },
    npcs: { shen: [11, 58], hanzhao: [20, -25] },
    interactables: [
      { id: 'tideheart', type: 'interact', pos: [0, -19], label: '潮心', icon: 'heart', radius: 10 },
      { id: 'obsidian_a', type: 'collect', item: 'obsidian', pos: [-39, -3], label: '黑曜潮晶' },
      { id: 'obsidian_b', type: 'collect', item: 'obsidian', pos: [35, -13], label: '黑曜潮晶' },
      { id: 'obsidian_c', type: 'collect', item: 'obsidian', pos: [4, -56], label: '黑曜潮晶' },
    ],
    boss: { id: 'boss_whale', species: 'abyss_whale', angle: 0, distance: 0, custom: [0, -3], label: '潮心 · 噬潮鲸' },
    props: ['fieldCamp', 'pier', 'boat', 'lavaFlow', 'drillRig', 'tents', 'beacon', 'blackSand'],
    music: 'volcano',
  },
};

export const ISLAND_ORDER = ['hub', 'mangrove', 'atoll', 'cliffs', 'volcano'];

export const ISLAND_NAMES = {
  hub: '归潮岛', mangrove: '雾苇泽', atoll: '琥珀环礁', cliffs: '断帆崖', volcano: '烬潮岛',
};

export function getIsland(id) {
  return ISLANDS[id] || ISLANDS.hub;
}
