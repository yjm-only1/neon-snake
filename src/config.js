// 全部可调参数与静态数据（难度 / 食物 / 连击 / 成就 / 配色）

export const STORAGE_KEY = 'neonSnake.v1';

export const GRID = 24;           // 逻辑网格 24 x 24
export const START_LENGTH = 3;    // 初始蛇长

export const COMBO = {
  window: 3000,   // 连击窗口：3 秒内再吃即升档
  max: 5,         // 倍率上限 x5
};

export const BUFF = {
  slowMultiplier: 0.7,     // 减速期间速度倍率
  slowDuration: 8000,      // 减速持续
  doubleDuration: 10000,   // 双倍分持续
  shieldPhaseDuration: 1000, // 护盾破碎后的穿行无敌时长
};

export const DIFFICULTY_LIST = ['chill', 'classic', 'insane'];

export const DIFFICULTIES = {
  chill: {
    id: 'chill', name: '悠闲', tagline: '慢速 · 穿墙不死',
    baseSpeed: 6, maxSpeed: 9, growthPerFruit: 0, growthEvery: 0,
    wrap: true, color: '#39d98a',
  },
  classic: {
    id: 'classic', name: '经典', tagline: '中速 · 撞墙即死',
    baseSpeed: 8, maxSpeed: 14, growthPerFruit: 0.3, growthEvery: 5,
    wrap: false, color: '#19f9ff',
  },
  insane: {
    id: 'insane', name: '狂暴', tagline: '高速 · 越吃越快',
    baseSpeed: 11, maxSpeed: 18, growthPerFruit: 0.5, growthEvery: 3,
    wrap: false, color: '#ff4d6d',
  },
};

// weight 为刷新权重；普通果实之外的道具统一按权重随机
export const FOOD_DEFS = {
  normal: { id: 'normal', name: '果实', score: 10, weight: 70, color: '#ff4d6d', glow: '#ff8ba0' },
  gold:   { id: 'gold',   name: '金果实', score: 50, weight: 8, color: '#ffd23f', glow: '#ffe680', lifetime: 6000 },
  shield: { id: 'shield', name: '护盾', weight: 8,  color: '#4da3ff', glow: '#9ccaff' },
  slow:   { id: 'slow',   name: '减速', weight: 7,  color: '#a04dff', glow: '#c99bff' },
  double: { id: 'double', name: '双倍分', weight: 7, color: '#39d98a', glow: '#8ff0c0' },
};

export const FOOD_TYPES = ['normal', 'gold', 'shield', 'slow', 'double'];

export const ACHIEVEMENTS = [
  { id: 'first_bite',  name: '初尝禁果',   desc: '吃到第一个果实' },
  { id: 'len_15',      name: '小有成长',   desc: '单局蛇身长度达到 15' },
  { id: 'len_30',      name: '长蛇传说',   desc: '单局蛇身长度达到 30' },
  { id: 'combo_5',     name: '连击大师',   desc: '单局打出 ×5 连击' },
  { id: 'score_1000',  name: '四位数',     desc: '单局得分达到 1000' },
  { id: 'insane_500',  name: '狂暴幸存者', desc: '狂暴难度单局达到 500 分' },
  { id: 'shield_save', name: '千钧一发',   desc: '护盾抵消一次死亡' },
  { id: 'all_fruits',  name: '大满贯',     desc: '单局集齐全部 5 种果实' },
];

// 皮肤主题：与 3D 版同一套配色
export const THEMES = {
  neon: {
    id: 'neon', name: '霓虹',
    bgTop: '#0d1430', bgBottom: '#04050d',
    board: '#0b1228', boardAccent: '#16224a',
    grid: '#5a78ff', border: '#4f7bff', glow: '#19f9ff',
    snakeHead: '#19f9ff', snakeMid: '#5f7bff', snakeTail: '#a04dff',
  },
  aurora: {
    id: 'aurora', name: '极光',
    bgTop: '#062a2a', bgBottom: '#020b0c',
    board: '#06201f', boardAccent: '#0d3a34',
    grid: '#37e0c0', border: '#2fd8b0', glow: '#64ffda',
    snakeHead: '#64ffda', snakeMid: '#2fd8b0', snakeTail: '#1f9e88',
  },
  magma: {
    id: 'magma', name: '熔岩',
    bgTop: '#2a0d06', bgBottom: '#0b0302',
    board: '#1e0a08', boardAccent: '#3a140c',
    grid: '#ff8a5c', border: '#ff6a3d', glow: '#ffb347',
    snakeHead: '#ffb347', snakeMid: '#ff6a3d', snakeTail: '#b0301a',
  },
};

export const THEME_LIST = ['neon', 'aurora', 'magma'];
export const QUALITY_LIST = [
  { id: 'auto', name: '自动（手机流畅）' },
  { id: 'high', name: '高清' },
  { id: 'low', name: '流畅' },
];

export const COLORS = {
  shieldRing: 'rgba(77, 163, 255, 0.9)',
  text: '#eaf6ff',
};

export const SETTINGS_DEFAULTS = { sfx: true, music: true, grid: true, theme: 'neon', quality: 'auto' };