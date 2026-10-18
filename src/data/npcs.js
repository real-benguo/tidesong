export const NPCS = {
  shen: {
    id: 'shen', name: '沈叔', title: '归潮灯塔守望人', age: 63,
    look: 'weathered', build: 0.96, height: 1.76,
    skin: '#b88768', hair: '#8b8d89', beard: '#9a9b96', eyes: '#40352b',
    coat: '#263c43', coat2: '#1a2b31', shirt: '#7d8c84', pants: '#2f3739',
    hat: 'woolcap', hatColor: '#533d34', beardStyle: 'full', glasses: false,
    accent: '#c49a5e',
  },
  alan: {
    id: 'alan', name: '阿岚', title: '潮汐杂货铺 · 店主', age: 27,
    look: 'bright', build: 0.9, height: 1.66,
    skin: '#d7a37d', hair: '#3c2b25', beard: null, eyes: '#5b3f2c',
    coat: '#b65d45', coat2: '#8e4534', shirt: '#e8d6b6', pants: '#39494b',
    hat: null, beardStyle: null, glasses: false, accent: '#e4b45f',
    freckles: true,
  },
  linman: {
    id: 'linman', name: '林蔓', title: '潮生研究所 · 海洋生物学家', age: 31,
    look: 'sharp', build: 0.88, height: 1.69,
    skin: '#c99773', hair: '#22201f', beard: null, eyes: '#3b3029',
    coat: '#4e5c3d', coat2: '#39442c', shirt: '#d9d2ba', pants: '#3a3f3c',
    hat: null, beardStyle: null, glasses: true, accent: '#8fb9a5',
  },
  laotao: {
    id: 'laotao', name: '老陶', title: '沉木潭 · 守歌人', age: 76,
    look: 'ancient', build: 0.82, height: 1.63,
    skin: '#a97958', hair: '#d8d4c6', beard: '#e2ddcf', eyes: '#45372c',
    coat: '#5b5341', coat2: '#403b30', shirt: '#b3a98e', pants: '#474237',
    hat: 'straw', hatColor: '#b49a62', beardStyle: 'long', glasses: false, accent: '#c8b077',
  },
  ache: {
    id: 'ache', name: '阿澈', title: '环礁 · 自由潜水员', age: 22,
    look: 'young', build: 1.0, height: 1.78,
    skin: '#b97b55', hair: '#1d1b19', beard: null, eyes: '#382b20',
    coat: '#20525a', coat2: '#173c42', shirt: '#e1c9a8', pants: '#6b5f4b',
    hat: 'bandana', hatColor: '#d06d4c', beardStyle: null, glasses: false, accent: '#69c4b7',
  },
  huoxiao: {
    id: 'huoxiao', name: '霍骁', title: '断帆崖 · 船长', age: 46,
    look: 'weathered', build: 1.1, height: 1.84,
    skin: '#9d6749', hair: '#3e342d', beard: '#4a3d33', eyes: '#33271f',
    coat: '#8f6d28', coat2: '#6b501c', shirt: '#3c4a4d', pants: '#2f3435',
    hat: 'woolcap', hatColor: '#2c3c43', beardStyle: 'short', glasses: false, accent: '#d9ad57',
  },
  hanzhao: {
    id: 'hanzhao', name: '韩照', title: '潮心计划 · 发起人', age: 58,
    look: 'sharp', build: 0.94, height: 1.77,
    skin: '#c5a58c', hair: '#b9b7b2', beard: null, eyes: '#37302b',
    coat: '#d6d4cc', coat2: '#a8aaa5', shirt: '#f0ede2', pants: '#47494b',
    hat: null, beardStyle: null, glasses: true, accent: '#9b6b5b',
  },
  you: {
    id: 'you', name: '沈屿', title: '归潮者', age: 27,
  },
  narrator: { id: 'narrator', name: '', title: '' },
  radio: { id: 'radio', name: '无线电', title: '' },
};

export const ISLAND_NPCS = {
  hub: ['shen', 'alan'],
  mangrove: ['linman', 'laotao'],
  atoll: ['ache', 'alan'],
  cliffs: ['huoxiao', 'linman'],
  volcano: ['hanzhao', 'shen'],
};
