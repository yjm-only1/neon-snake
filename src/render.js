// Canvas 霓虹渲染：皮肤 / 点阵玻璃底板 / 平滑蛇身 / 预渲染辉光 / 画质档
import { GRID, FOOD_DEFS, THEMES } from './config.js';

const R_TAU = Math.PI * 2;

function rgba(hex, alpha) {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value;
  const num = parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function resolveQuality(setting) {
  if (setting === 'low' || setting === 'high') return setting;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse ? 'low' : 'high';
}

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.theme = THEMES[settings.theme] || THEMES.neon;
    this.qualitySetting = settings.quality || 'auto';
    this.quality = resolveQuality(this.qualitySetting);
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.board = 0;
    this.ox = 0;
    this.oy = 0;
    this.cell = 1;
    this.glowCache = new Map();
    this.points = [];
    this.dust = [];
    this.bgCanvas = document.createElement('canvas');
    this.resize();
  }

  applySettings() {
    const theme = THEMES[this.settings.theme] || THEMES.neon;
    const setting = this.settings.quality || 'auto';
    const quality = resolveQuality(setting);
    if (theme.id === this.theme.id && quality === this.quality && setting === this.qualitySetting) return;
    this.theme = theme;
    this.qualitySetting = setting;
    this.quality = quality;
    this.glowCache.clear();
    this.resize();
  }

  resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cap = this.quality === 'low' ? 1 : 1.75;
    let dpr = Math.min(window.devicePixelRatio || 1, cap);
    const maxPixels = 4.2e6; // 高分屏/大窗口上限
    const pixels = width * height * dpr * dpr;
    if (pixels > maxPixels) dpr *= Math.sqrt(maxPixels / pixels);
    this.dpr = Math.max(0.75, dpr);
    this.width = width;
    this.height = height;
    this.canvas.width = Math.max(1, Math.floor(width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(height * this.dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const marginFactor = width < 600 ? 0.018 : 0.035;
    const margin = Math.max(8, Math.min(width, height) * marginFactor);
    const board = Math.max(120, Math.min(width - margin * 2, height - margin * 2));
    this.board = board;
    this.cell = board / GRID;
    this.ox = (width - board) / 2;
    const portrait = width / Math.max(1, height) < 0.8;
    this.oy = portrait ? margin + (height - board) * 0.28 : (height - board) / 2;
    this.buildBackground();
    this.buildDust();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 静态背景（渐变 / 底板 / 点阵 / 边框 / 暗角）一次烘焙，逐帧只需 drawImage
  buildBackground() {
    const canvas = this.bgCanvas;
    canvas.width = this.canvas.width;
    canvas.height = this.canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const { width, height, ox, oy, board, cell, theme } = this;

    ctx.fillStyle = theme.bgBottom;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(
      width / 2, height / 2, board * 0.1,
      width / 2, height / 2, Math.max(width, height) * 0.75,
    );
    glow.addColorStop(0, theme.bgTop);
    glow.addColorStop(1, theme.bgBottom);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    const radius = Math.max(8, cell * 0.7);
    this.roundRect(ctx, ox, oy, board, board, radius);
    ctx.fillStyle = theme.board;
    ctx.fill();
    const inner = ctx.createRadialGradient(
      width / 2, height / 2, board * 0.05,
      width / 2, height / 2, board * 0.75,
    );
    inner.addColorStop(0, rgba(theme.boardAccent, 0.9));
    inner.addColorStop(1, 'rgba(0, 0, 0, 0)');
    this.roundRect(ctx, ox, oy, board, board, radius);
    ctx.fillStyle = inner;
    ctx.fill();

    if (this.settings.grid) {
      ctx.fillStyle = rgba(theme.grid, 0.5);
      const dotRadius = Math.max(0.8, cell * 0.055);
      for (let i = 1; i < GRID; i++) {
        for (let j = 1; j < GRID; j++) {
          ctx.beginPath();
          ctx.arc(ox + i * cell, oy + j * cell, dotRadius, 0, R_TAU);
          ctx.fill();
        }
      }
    }

    ctx.save();
    ctx.strokeStyle = theme.border;
    ctx.lineWidth = 2;
    if (this.quality === 'high') {
      ctx.shadowColor = rgba(theme.glow, 0.55);
      ctx.shadowBlur = 16;
    }
    this.roundRect(ctx, ox + 1, oy + 1, board - 2, board - 2, radius);
    ctx.stroke();
    ctx.restore();

    const vignette = ctx.createRadialGradient(
      width / 2, height / 2, Math.min(width, height) * 0.38,
      width / 2, height / 2, Math.max(width, height) * 0.75,
    );
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  buildDust() {
    this.dust.length = 0;
    if (this.quality === 'low') return;
    const count = 26;
    for (let i = 0; i < count; i++) {
      this.dust.push({
        x: this.ox + Math.random() * this.board,
        y: this.oy + Math.random() * this.board,
        radius: 0.8 + Math.random() * 1.6,
        phase: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.5,
        alpha: 0.1 + Math.random() * 0.16,
      });
    }
  }

  glowSprite(color) {
    if (this.quality === 'low') return null;
    let sprite = this.glowCache.get(color);
    if (!sprite) {
      const size = 96;
      sprite = document.createElement('canvas');
      sprite.width = size;
      sprite.height = size;
      const ctx = sprite.getContext('2d');
      const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      gradient.addColorStop(0, rgba(color, 0.85));
      gradient.addColorStop(0.35, rgba(color, 0.32));
      gradient.addColorStop(1, rgba(color, 0));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      this.glowCache.set(color, sprite);
    }
    return sprite;
  }

  drawGlow(ctx, color, x, y, diameter) {
    const sprite = this.glowSprite(color);
    if (!sprite) return;
    ctx.drawImage(sprite, x - diameter / 2, y - diameter / 2, diameter, diameter);
  }

  cellToPx(x, y) {
    return {
      x: this.ox + (x + 0.5) * this.cell,
      y: this.oy + (y + 0.5) * this.cell,
    };
  }

  drawBackground(ctx, now) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.drawImage(this.bgCanvas, 0, 0, this.width, this.height);
    if (this.dust.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const mote of this.dust) {
      const x = mote.x + Math.sin(now / 3000 * mote.speed + mote.phase) * 18;
      const y = mote.y + Math.cos(now / 3600 * mote.speed + mote.phase) * 12;
      ctx.fillStyle = rgba(this.theme.glow, mote.alpha);
      ctx.beginPath();
      ctx.arc(x, y, mote.radius, 0, R_TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  renderMenu(now, effects) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx, now);

    const orbCount = this.quality === 'low' ? 8 : 16;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < orbCount; i++) {
      const phase = now / 2400 + i * 0.71;
      const x = this.ox + (0.5 + Math.sin(phase) * 0.42) * this.board;
      const y = this.oy + (0.5 + Math.cos(phase * 0.8 + i) * 0.42) * this.board;
      const radius = Math.max(1, this.cell * (0.1 + 0.06 * Math.sin(phase * 3)));
      const color = i % 2 === 0 ? this.theme.glow : this.theme.snakeTail;
      this.drawGlow(ctx, color, x, y, radius * 8);
      ctx.fillStyle = rgba(color, 0.7);
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, R_TAU);
      ctx.fill();
    }
    ctx.restore();

    this.drawParticles(ctx, effects);
    this.drawFloats(ctx, effects);
  }

  render(game, effects, now) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx, now);

    ctx.save();
    if (effects.shake > 0.3) {
      ctx.translate((Math.random() * 2 - 1) * effects.shake, (Math.random() * 2 - 1) * effects.shake);
    }
    if (game) {
      this.drawFood(ctx, game, now);
      this.drawSnake(ctx, game, now);
    }
    this.drawParticles(ctx, effects);
    this.drawFloats(ctx, effects);
    ctx.restore();

    if (effects.flash > 0.005) {
      ctx.fillStyle = rgba(effects.flashColor, Math.min(0.6, effects.flash));
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  drawFood(ctx, game, now) {
    const food = game.food;
    if (!food) return;
    const def = FOOD_DEFS[food.type];
    const center = this.cellToPx(food.x, food.y);
    const pulse = 1 + 0.1 * Math.sin(now / 160);
    const radius = this.cell * 0.3 * pulse;

    this.drawGlow(ctx, def.glow, center.x, center.y, this.cell * 2.6 * pulse);
    ctx.save();
    ctx.fillStyle = def.color;

    if (food.type === 'gold') {
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.rotate(Math.PI / 4);
      const size = radius * 0.95;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255, 245, 200, 0.95)';
      ctx.lineWidth = Math.max(1.5, this.cell * 0.05);
      const sparkle = this.cell * 0.42;
      ctx.beginPath();
      ctx.moveTo(center.x - sparkle, center.y);
      ctx.lineTo(center.x + sparkle, center.y);
      ctx.moveTo(center.x, center.y - sparkle);
      ctx.lineTo(center.x, center.y + sparkle);
      ctx.stroke();
      if (food.remainingMs != null && def.lifetime) {
        const ratio = Math.max(0, Math.min(1, food.remainingMs / def.lifetime));
        ctx.strokeStyle = rgba('#ffd23f', 0.55);
        ctx.lineWidth = Math.max(1.5, this.cell * 0.06);
        ctx.beginPath();
        ctx.arc(center.x, center.y, this.cell * 0.46, -Math.PI / 2, -Math.PI / 2 + R_TAU * ratio);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, R_TAU);
    ctx.fill();

    if (food.type === 'shield') {
      ctx.strokeStyle = 'rgba(220, 240, 255, 0.9)';
      ctx.lineWidth = Math.max(1.5, this.cell * 0.05);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * 0.6, 0, R_TAU);
      ctx.stroke();
    } else if (food.type === 'slow') {
      ctx.strokeStyle = 'rgba(235, 225, 255, 0.9)';
      ctx.lineWidth = Math.max(1.5, this.cell * 0.045);
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(center.x - Math.cos(angle) * radius * 0.62, center.y - Math.sin(angle) * radius * 0.62);
        ctx.lineTo(center.x + Math.cos(angle) * radius * 0.62, center.y + Math.sin(angle) * radius * 0.62);
        ctx.stroke();
      }
    } else if (food.type === 'double') {
      ctx.fillStyle = 'rgba(8, 20, 16, 0.9)';
      ctx.font = `bold ${Math.max(9, this.cell * 0.36)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×2', center.x, center.y + this.cell * 0.01);
    } else {
      ctx.fillStyle = 'rgba(255, 220, 228, 0.75)';
      ctx.beginPath();
      ctx.arc(center.x - radius * 0.3, center.y - radius * 0.35, radius * 0.22, 0, R_TAU);
      ctx.fill();
    }

    // 环绕光环
    ctx.strokeStyle = rgba(def.color, 0.35);
    ctx.lineWidth = Math.max(1, this.cell * 0.03);
    ctx.beginPath();
    ctx.arc(center.x, center.y, this.cell * 0.5 * pulse, now / 900, now / 900 + Math.PI * 1.2);
    ctx.stroke();
    ctx.restore();
  }

  computePoints(game) {
    const t = game.alive ? game.getTickProgress() : 1;
    const snake = game.snake;
    const prev = game.prevSnake;
    const points = this.points;
    points.length = snake.length;
    for (let i = 0; i < snake.length; i++) {
      const cur = snake[i];
      const old = prev[i] || cur;
      const wrapped = Math.abs(cur.x - old.x) > 1.5 || Math.abs(cur.y - old.y) > 1.5;
      const point = points[i] || (points[i] = { x: 0, y: 0 });
      point.x = wrapped ? cur.x : lerp(old.x, cur.x, t);
      point.y = wrapped ? cur.y : lerp(old.y, cur.y, t);
    }
    return points;
  }

  strokeSnakePath(ctx, points) {
    const { cell, ox, oy } = this;
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const px = ox + (point.x + 0.5) * cell;
      const py = oy + (point.y + 0.5) * cell;
      if (i > 0) {
        const prev = points[i - 1];
        if (Math.abs(point.x - prev.x) > 1.5 || Math.abs(point.y - prev.y) > 1.5) started = false;
      }
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();
  }

  drawSnake(ctx, game, now) {
    const points = this.computePoints(game);
    if (points.length === 0) return;
    const alpha = game.alive ? 1 : 0.55;
    const theme = this.theme;
    const headPx = this.cellToPx(points[0].x, points[0].y);

    // 外发光：宽描边 + 预渲染辉光球，避免整条路径逐帧 shadowBlur
    if (this.quality === 'high') {
      ctx.save();
      ctx.globalAlpha = alpha * 0.65;
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba(theme.snakeHead, 0.16);
      ctx.lineWidth = this.cell * 0.95;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      this.strokeSnakePath(ctx, points);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    const tailPx = this.cellToPx(points[points.length - 1].x, points[points.length - 1].y);
    const gradient = ctx.createLinearGradient(headPx.x, headPx.y, tailPx.x, tailPx.y);
    gradient.addColorStop(0, theme.snakeHead);
    gradient.addColorStop(0.5, theme.snakeMid);
    gradient.addColorStop(1, theme.snakeTail);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = this.cell * 0.68;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.strokeSnakePath(ctx, points);
    ctx.restore();

    // 头部
    ctx.save();
    ctx.globalAlpha = alpha;
    this.drawGlow(ctx, theme.snakeHead, headPx.x, headPx.y, this.cell * 2.2);
    ctx.fillStyle = '#e8feff';
    ctx.beginPath();
    ctx.arc(headPx.x, headPx.y, this.cell * 0.34, 0, R_TAU);
    ctx.fill();

    const dir = game.dir;
    const perp = { x: -dir.y, y: dir.x };
    const eyeForward = this.cell * 0.16;
    const eyeSide = this.cell * 0.14;
    const eyeRadius = Math.max(1.2, this.cell * 0.075);
    ctx.fillStyle = '#06121c';
    for (const side of [-1, 1]) {
      const ex = headPx.x + dir.x * eyeForward + perp.x * eyeSide * side;
      const ey = headPx.y + dir.y * eyeForward + perp.y * eyeSide * side;
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, R_TAU);
      ctx.fill();
    }
    ctx.restore();

    if (game.buffs.shield || game.buffs.shieldPhase > 0) {
      const blinking = game.buffs.shieldPhase > 0;
      const flicker = blinking ? 0.45 + 0.55 * Math.abs(Math.sin(now / 55)) : 0.85;
      ctx.save();
      ctx.strokeStyle = rgba(this.shieldColor(), flicker);
      ctx.lineWidth = Math.max(2, this.cell * 0.08);
      ctx.beginPath();
      ctx.arc(headPx.x, headPx.y, this.cell * (0.52 + 0.03 * Math.sin(now / 120)), 0, R_TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  shieldColor() {
    return '#4da3ff';
  }

  drawParticles(ctx, effects) {
    if (effects.particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const particle of effects.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      const px = this.cellToPx(particle.x - 0.5, particle.y - 0.5);
      ctx.fillStyle = rgba(particle.color, alpha);
      ctx.beginPath();
      ctx.arc(px.x, px.y, Math.max(1, particle.size * this.cell), 0, R_TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawFloats(ctx, effects) {
    if (effects.floats.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.max(12, this.cell * 0.5)}px "Segoe UI", system-ui, sans-serif`;
    for (const float of effects.floats) {
      const alpha = Math.max(0, float.life / float.maxLife);
      const px = this.cellToPx(float.x - 0.5, float.y - 0.5);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = float.color;
      ctx.fillText(float.text, px.x, px.y);
    }
    ctx.restore();
  }
}