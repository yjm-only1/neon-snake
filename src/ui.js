// DOM 界面：主菜单 / HUD / 暂停 / 结算 / 成就 / 设置 / Toast
import { DIFFICULTY_LIST, DIFFICULTIES, ACHIEVEMENTS } from './config.js';

function formatDuration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export class UI {
  constructor(state, handlers) {
    this.state = state;
    this.handlers = handlers;
    this.currentDiff = 'classic';
    this.hudCache = { score: null, best: null, combo: null };
    this.buffCache = { shield: null, slow: null, double: null };
    this.el = {};
    const ids = [
      'menu', 'hud', 'pauseOverlay', 'gameOverOverlay', 'achievementsOverlay', 'settingsOverlay', 'helpOverlay',
      'diffRow', 'menuStats', 'btnAchievements', 'btnSettings', 'btnHelp',
      'hudScore', 'hudBest', 'comboChip', 'comboValue', 'btnPause', 'diffChip', 'buffBar',
      'buffShield', 'buffSlow', 'buffDouble', 'buffSlowTime', 'buffSlowBar', 'buffDoubleTime', 'buffDoubleBar',
      'btnResume', 'btnRestart', 'btnQuit',
      'gameOverTitle', 'newRecord', 'resultScore', 'resultGrid', 'btnAgain', 'btnToMenu',
      'achCount', 'achList', 'btnAchClose',
      'setSfx', 'setMusic', 'setGrid', 'btnSetClose', 'btnHelpClose',
      'toastLayer',
    ];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.bind();
    this.buildDifficultyCards();
    this.applySettings();
  }

  bind() {
    const h = this.handlers;
    this.el.btnPause.addEventListener('click', () => h.onPauseToggle());
    this.el.btnResume.addEventListener('click', () => h.onPauseToggle());
    this.el.btnRestart.addEventListener('click', () => h.onRestart());
    this.el.btnQuit.addEventListener('click', () => h.onQuit());
    this.el.btnAgain.addEventListener('click', () => h.onRestart());
    this.el.btnToMenu.addEventListener('click', () => h.onQuit());
    this.el.btnAchievements.addEventListener('click', () => this.showAchievements());
    this.el.btnAchClose.addEventListener('click', () => this.hideAchievements());
    this.el.btnSettings.addEventListener('click', () => this.showSettings());
    this.el.btnSetClose.addEventListener('click', () => this.hideSettings());
    this.el.btnHelp.addEventListener('click', () => this.showHelp());
    this.el.btnHelpClose.addEventListener('click', () => this.hideHelp());

    for (const [key, input] of [['sfx', this.el.setSfx], ['music', this.el.setMusic], ['grid', this.el.setGrid]]) {
      input.addEventListener('change', () => {
        this.state.settings[key] = input.checked;
        h.onSettingsChanged();
      });
    }
  }

  buildDifficultyCards() {
    const row = this.el.diffRow;
    row.innerHTML = '';
    for (const id of DIFFICULTY_LIST) {
      const diff = DIFFICULTIES[id];
      const card = document.createElement('button');
      card.className = 'diff-card';
      card.style.setProperty('--accent', diff.color);
      card.dataset.diff = id;
      card.innerHTML = `
        <span class="diff-name">${diff.name}</span>
        <span class="diff-tag">${diff.tagline}</span>
        <span class="diff-best">最高分 <b data-best="${id}">0</b></span>`;
      card.addEventListener('click', () => this.handlers.onStart(id));
      row.appendChild(card);
    }
  }

  refreshMenu() {
    for (const id of DIFFICULTY_LIST) {
      const node = this.el.diffRow.querySelector(`[data-best="${id}"]`);
      if (node) node.textContent = String(this.state.bests[id] ?? 0);
    }
    const st = this.state.stats;
    this.el.menuStats.textContent =
      `总局数 ${st.games} · 果实 ${st.fruits} · 最长 ${st.longest} · 成就 ${this.state.achievements.length}/${ACHIEVEMENTS.length}`;
    this.applySettings();
  }

  applySettings() {
    this.el.setSfx.checked = this.state.settings.sfx;
    this.el.setMusic.checked = this.state.settings.music;
    this.el.setGrid.checked = this.state.settings.grid;
  }

  setScreen(name) {
    this.el.menu.classList.toggle('hidden', name !== 'menu');
    this.el.hud.classList.toggle('hidden', name === 'menu');
  }

  showMenu() {
    this.setScreen('menu');
    this.hidePause();
    this.hideGameOver();
    this.refreshMenu();
  }

  showPlaying(diffId) {
    this.currentDiff = diffId;
    this.setScreen('playing');
    this.el.diffChip.textContent = DIFFICULTIES[diffId].name;
    this.el.diffChip.style.color = DIFFICULTIES[diffId].color;
    this.hudCache.score = null;
    this.hudCache.best = null;
    this.hudCache.combo = null;
    this.buffCache = { shield: null, slow: null, double: null };
  }

  updateHud(game, best) {
    const combo = game.getComboMultiplier();
    if (this.hudCache.score !== game.score) {
      this.hudCache.score = game.score;
      this.el.hudScore.textContent = String(game.score);
    }
    if (this.hudCache.best !== best) {
      this.hudCache.best = best;
      this.el.hudBest.textContent = String(best);
    }
    const showCombo = combo >= 2;
    if (this.hudCache.combo !== combo) {
      this.hudCache.combo = combo;
      this.el.comboChip.classList.toggle('hidden', !showCombo);
      if (showCombo) {
        this.el.comboValue.textContent = String(combo);
        this.el.comboChip.classList.remove('pop');
        void this.el.comboChip.offsetWidth;
        this.el.comboChip.classList.add('pop');
      }
    }
    this.updateBuffs(game);
  }

  updateBuffs(game) {
    const shield = game.buffs.shield;
    if (this.buffCache.shield !== shield) {
      this.buffCache.shield = shield;
      this.el.buffShield.classList.toggle('hidden', !shield);
    }

    const slow = game.buffs.slowRemaining;
    const slowActive = slow > 0;
    if (this.buffCache.slow !== slowActive) {
      this.buffCache.slow = slowActive;
      this.el.buffSlow.classList.toggle('hidden', !slowActive);
    }
    if (slowActive) {
      this.el.buffSlowTime.textContent = `${(slow / 1000).toFixed(1)}s`;
      this.el.buffSlowBar.style.width = `${Math.min(100, (slow / 8000) * 100)}%`;
    }

    const double = game.buffs.doubleRemaining;
    const doubleActive = double > 0;
    if (this.buffCache.double !== doubleActive) {
      this.buffCache.double = doubleActive;
      this.el.buffDouble.classList.toggle('hidden', !doubleActive);
    }
    if (doubleActive) {
      this.el.buffDoubleTime.textContent = `${(double / 1000).toFixed(1)}s`;
      this.el.buffDoubleBar.style.width = `${Math.min(100, (double / 10000) * 100)}%`;
    }
  }

  showPause() {
    this.el.pauseOverlay.classList.remove('hidden');
  }

  hidePause() {
    this.el.pauseOverlay.classList.add('hidden');
  }

  showGameOver(result) {
    this.el.newRecord.classList.toggle('hidden', !result.isNewRecord);
    this.el.gameOverTitle.textContent = '游戏结束';
    this.el.resultScore.textContent = String(result.score);
    this.el.resultGrid.innerHTML = `
      <div><span>难度</span><b>${DIFFICULTIES[result.difficulty].name}</b></div>
      <div><span>最高分</span><b>${result.best}</b></div>
      <div><span>蛇身长度</span><b>${result.length}</b></div>
      <div><span>吃到果实</span><b>${result.fruits}</b></div>
      <div><span>最高连击</span><b>×${result.maxCombo}</b></div>
      <div><span>存活时间</span><b>${formatDuration(result.durationMs)}</b></div>`;
    this.el.gameOverOverlay.classList.remove('hidden');
  }

  hideGameOver() {
    this.el.gameOverOverlay.classList.add('hidden');
  }

  showAchievements() {
    this.renderAchievements();
    this.el.achievementsOverlay.classList.remove('hidden');
  }

  hideAchievements() {
    this.el.achievementsOverlay.classList.add('hidden');
  }

  renderAchievements() {
    const unlocked = new Set(this.state.achievements);
    this.el.achCount.textContent = `${unlocked.size}/${ACHIEVEMENTS.length}`;
    this.el.achList.innerHTML = ACHIEVEMENTS.map((a) => {
      const done = unlocked.has(a.id);
      return `<div class="ach-item ${done ? 'done' : ''}">
        <span class="ach-mark">${done ? '✓' : '·'}</span>
        <span class="ach-text"><b>${a.name}</b><i>${a.desc}</i></span>
      </div>`;
    }).join('');
  }

  showSettings() {
    this.applySettings();
    this.el.settingsOverlay.classList.remove('hidden');
  }

  hideSettings() {
    this.el.settingsOverlay.classList.add('hidden');
  }

  showHelp() {
    this.el.helpOverlay.classList.remove('hidden');
  }

  hideHelp() {
    this.el.helpOverlay.classList.add('hidden');
  }

  toast(text, kind = 'info') {
    const layer = this.el.toastLayer;
    const node = document.createElement('div');
    node.className = `toast ${kind}`;
    node.textContent = text;
    layer.appendChild(node);
    while (layer.children.length > 3) layer.removeChild(layer.firstChild);
    setTimeout(() => {
      node.classList.add('out');
      setTimeout(() => node.remove(), 350);
    }, 2200);
  }
}