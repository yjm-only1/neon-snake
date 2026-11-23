// localStorage 持久化：每档最高分 / 生涯统计 / 成就 / 设置
import { STORAGE_KEY, DIFFICULTY_LIST, SETTINGS_DEFAULTS } from './config.js';

function defaultState() {
  const bests = {};
  for (const id of DIFFICULTY_LIST) bests[id] = 0;
  return {
    version: 1,
    bests,
    stats: { games: 0, fruits: 0, longest: 3, totalScore: 0, totalTimeMs: 0 },
    achievements: [],
    settings: { ...SETTINGS_DEFAULTS },
  };
}

export function loadState() {
  const state = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return state;
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return state;
    for (const id of DIFFICULTY_LIST) {
      const v = Number(saved.bests && saved.bests[id]);
      if (Number.isFinite(v) && v > 0) state.bests[id] = v;
    }
    const st = saved.stats || {};
    for (const key of Object.keys(state.stats)) {
      const v = Number(st[key]);
      if (Number.isFinite(v) && v >= 0) state.stats[key] = v;
    }
    if (Array.isArray(saved.achievements)) {
      state.achievements = saved.achievements.filter((id) => typeof id === 'string');
    }
    const cfg = saved.settings || {};
    for (const key of Object.keys(state.settings)) {
      if (typeof cfg[key] === 'boolean') state.settings[key] = cfg[key];
    }
    return state;
  } catch (err) {
    return state;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    // 隐私模式或配额满：静默降级为单局游玩
  }
}