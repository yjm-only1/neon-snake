// 组装层：状态机（菜单/游戏中/暂停/死亡演出/结算）+ 主循环 + 成就判定
import { SnakeGame } from './game.js';
import { loadState, saveState } from './storage.js';
import { AudioEngine } from './audio.js';
import { InputController } from './input.js';
import { Effects } from './effects.js';
import { Renderer } from './render.js';
import { UI } from './ui.js';
import { ACHIEVEMENTS, FOOD_DEFS, DIFFICULTIES } from './config.js';

const state = loadState();
const unlockedAchievements = new Set(state.achievements);
const audio = new AudioEngine(state.settings);
const effects = new Effects();
const canvas = document.getElementById('game');
const renderer = new Renderer(canvas, state.settings);
const joystickEl = document.getElementById('joystick');
const isTouchDevice = window.matchMedia('(pointer: coarse)').matches;
function syncFullscreenClass() {
  document.body.classList.toggle('fullscreen', !!document.fullscreenElement);
}
document.addEventListener('fullscreenchange', syncFullscreenClass);
syncFullscreenClass();

document.body.classList.toggle('touch-device', isTouchDevice);

let game = null;
let mode = 'menu'; // menu | playing | paused | dying | gameover
let currentDiff = 'classic';
let bestAtStart = 0;
let maxCombo = 1;
let deathTimer = 0;
let shieldSaveSeen = false;
let hintShown = false;

const ui = new UI(state, {
  onStart: (diffId) => startGame(diffId),
  onPauseToggle: () => togglePause(),
  onRestart: () => startGame(currentDiff),
  onQuit: () => quitToMenu(),
  onConfirm: () => confirmAction(),
  onFullscreen: () => toggleFullscreen(),
  onSettingsChanged: () => {
    renderer.applySettings();
    audio.setSettings(state.settings);
    if (state.settings.music && mode === 'playing') audio.startMusic();
    saveState(state);
  },
});

const input = new InputController({
  onAim: (angle) => {
    if (mode === 'playing' && game && angle != null) game.setAim(angle);
  },
  onPauseToggle: () => togglePause(),
  onConfirm: () => confirmAction(),
  onMute: () => toggleMute(),
});
input.attach();

window.addEventListener('resize', () => renderer.resize());

function anyOverlayOpen() {
  return ['achievementsOverlay', 'settingsOverlay', 'helpOverlay']
    .some((id) => !document.getElementById(id).classList.contains('hidden'));
}

function startGame(diffId) {
  document.activeElement?.blur();
  audio.ensure();
  currentDiff = diffId;
  game = new SnakeGame({ difficulty: diffId });
  effects.reset();
  bestAtStart = state.bests[diffId] ?? 0;
  maxCombo = 1;
  shieldSaveSeen = false;
  deathTimer = 0;
  mode = 'playing';
  ui.showPlaying(diffId);
  ui.hidePause();
  ui.hideGameOver();
  audio.ui();
  audio.startMusic();
  audio.setIntensity(88 + game.currentSpeed() * 3.2);
  if (!hintShown) {
    hintShown = true;
    ui.toast(isTouchDevice ? '滑动屏幕或使用左下方向键转向' : '方向键 / WASD 转向 · 空格暂停 · 手机滑动屏幕', 'hint');
  }
}

function togglePause() {
  if (anyOverlayOpen()) {
    ui.hideAchievements();
    ui.hideSettings();
    ui.hideHelp();
    return;
  }
  if (mode === 'playing') {
    mode = 'paused';
    ui.showPause();
    audio.stopMusic();
    audio.ui();
  } else if (mode === 'paused') {
    mode = 'playing';
    ui.hidePause();
    audio.startMusic();
    audio.ui();
  }
}

function confirmAction() {
  if (anyOverlayOpen()) return;
  if (mode === 'menu') startGame(currentDiff);
  else if (mode === 'gameover') startGame(currentDiff);
  else if (mode === 'paused') togglePause();
}

function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
      return;
    }
    const root = document.documentElement;
    const request = root.requestFullscreen ? root.requestFullscreen() : null;
    const lock = () => {
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock('landscape').catch(() => ui.toast('已全屏；若未横屏请手动旋转手机', 'hint'));
      } else {
        ui.toast('已全屏；若未横屏请手动旋转手机', 'hint');
      }
    };
    if (request && request.then) request.then(lock).catch(() => ui.toast('当前浏览器不支持全屏，请手动旋转手机', 'error'));
    else if (request) lock();
    else ui.toast('当前浏览器不支持全屏，请手动旋转手机', 'error');
  } catch (err) {
    ui.toast('当前浏览器不支持全屏，请手动旋转手机', 'error');
  }
}

function toggleMute() {
  state.settings.sfx = !state.settings.sfx;
  saveState(state);
  ui.toast(state.settings.sfx ? '音效已开启' : '音效已关闭');
  if (state.settings.sfx) audio.ui();
}

function quitToMenu() {
  mode = 'menu';
  game = null;
  audio.stopMusic();
  effects.reset();
  ui.showMenu();
  saveState(state);
}

function enterDying() {
  mode = 'dying';
  deathTimer = 1.05;
  audio.stopMusic();
  audio.death();
  effects.deathBurst(game.snake);
  const head = game.snake[0];
  effects.burst(head.x, head.y, '#ffffff', 26, 9);
  effects.addShake(16);
  effects.addFlash(0.45, game.deadReason === 'wall' ? '#ff4d6d' : '#a04dff');
}

function finishGame() {
  mode = 'gameover';
  const score = game.score;
  const prevBest = state.bests[currentDiff] ?? 0;
  const isNewRecord = score > prevBest;
  if (isNewRecord) state.bests[currentDiff] = score;
  state.stats.games += 1;
  state.stats.fruits += game.fruitsEaten;
  state.stats.longest = Math.max(state.stats.longest, game.snake.length);
  state.stats.totalScore += score;
  state.stats.totalTimeMs += game.elapsed;
  saveState(state);
  if (isNewRecord) audio.newRecord();
  ui.showGameOver({
    score,
    best: state.bests[currentDiff],
    isNewRecord,
    length: game.snake.length,
    fruits: game.fruitsEaten,
    maxCombo,
    durationMs: game.elapsed,
    difficulty: currentDiff,
  });
}

function handleEvents(events) {
  for (const event of events) {
    if (event.type === 'eat') {
      const def = FOOD_DEFS[event.food];
      const cx = event.head.x;
      const cy = event.head.y;
      if (event.food === 'gold') {
        audio.gold();
        effects.addFlash(0.28, '#ffd23f');
        effects.addShake(5);
        effects.burst(cx, cy, def.color, 24, 7.5);
      } else {
        audio.eat(event.combo);
        effects.burst(cx, cy, def.color, event.combo >= 2 ? 18 : 10, 5);
      }
      if (event.food === 'shield' || event.food === 'slow' || event.food === 'double') {
        audio.buff(event.food);
        const label = event.food === 'shield'
          ? '护盾：抵挡一次'
          : event.food === 'slow'
            ? '减速 30% · 8 秒'
            : '双倍得分 · 10 秒';
        effects.floatText(cx, cy - 0.45, label, def.color);
      } else if (event.gained > 0) {
        const label = event.combo >= 2 ? `+${event.gained} ×${event.combo}` : `+${event.gained}`;
        effects.floatText(cx, cy - 0.35, label, def.color);
      }
      if (event.combo >= 2) effects.addShake(1.5 + event.combo);
    } else if (event.type === 'shieldBreak') {
      shieldSaveSeen = true;
      audio.shieldBreak();
      effects.addFlash(0.35, '#4da3ff');
      effects.addShake(10);
      const head = game.snake[0];
      effects.floatText(head.x, head.y - 0.5, '护盾破碎！', '#9ccaff');
    }
  }
}

function checkAchievements() {
  let changed = false;
  const unlock = (id) => {
    if (unlockedAchievements.has(id)) return;
    unlockedAchievements.add(id);
    state.achievements.push(id);
    changed = true;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    ui.toast(`成就解锁：${def ? def.name : id}`, 'achievement');
    audio.gold();
  };
  if (game.fruitsEaten >= 1) unlock('first_bite');
  if (game.snake.length >= 15) unlock('len_15');
  if (game.snake.length >= 30) unlock('len_30');
  if (game.getComboMultiplier() >= 5) unlock('combo_5');
  if (game.score >= 1000) unlock('score_1000');
  if (currentDiff === 'insane' && game.score >= 500) unlock('insane_500');
  if (shieldSaveSeen) unlock('shield_save');
  if (game.fruitTypesEaten.size >= 5) unlock('all_fruits');
  if (changed) saveState(state);
}

let lastTime = performance.now();

function frame(now) {
  const dtSec = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  effects.update(dtSec);

  if (mode === 'playing' && game) {
    game.update(dtSec * 1000); // 模拟层统一毫秒计时
    handleEvents(game.drainEvents());
    maxCombo = Math.max(maxCombo, game.getComboMultiplier());
    audio.setIntensity(88 + game.currentSpeed() * 3.2);
    ui.updateHud(game, Math.max(bestAtStart, game.score));
    if (!game.alive) enterDying();
    else checkAchievements();
  } else if (mode === 'dying') {
    deathTimer -= dtSec;
    if (deathTimer <= 0) finishGame();
  }

  if (game) renderer.render(game, effects, now);
  else renderer.renderMenu(now, effects);

  if (joystickEl) joystickEl.classList.toggle('visible', mode === 'playing');

  requestAnimationFrame(frame);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && mode === 'playing') togglePause();
});

// 调试句柄：供自动化冒烟脚本读取与驱动
window.__neonSnake = { getGame: () => game, getMode: () => mode };

ui.showMenu();
requestAnimationFrame(frame);

// 调试/截图入口：index.html#play=classic 直接开局
const autoDiff = new URLSearchParams(location.hash.slice(1)).get('play');
if (autoDiff && DIFFICULTIES[autoDiff]) startGame(autoDiff);