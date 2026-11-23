// Canvas 霓虹渲染：蛇身平滑插值 / 发光 / 食物 / 粒子 / 飘字 / 震屏 / 闪光
import { GRID, COLORS, FOOD_DEFS } from './config.js';

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

export class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.settings = settings;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.board = 0;
    this.ox = 0;
    this.oy = 0;
    this.cell = 1;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.floor(width * dpr));
    this.canvas.height = Math.max(1, Math.floor(height * dpr));
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;

    const margin = Math.max(10, Math.min(width, height) * 0.035);
    const board = Math.max(120, Math.min(width - margin * 2, height - margin * 2));
    this.board = board;
    this.cell = board / GRID;
    this.ox = (width - board) / 2;
    this.oy = (height - board) / 2;
  }

  cellToPx(x, y) {
    return {
      x: this.ox + (x + 0.5) * this.cell,
      y: this.oy + (y + 0.5) * this.cell,
    };
  }

  renderMenu(now, effects) {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx, now);
    // 主菜单的霓虹光点漂浮装饰
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) {
      const phase = now / 2400 + i * 0.71;
      const x = this.ox + (0.5 + Math.sin(phase) * 0.42) * this.board;
      const y = this.oy + (0.5 + Math.cos(phase * 0.8 + i) * 0.42) * this.board;
      const radius = this.cell * (0.1 + 0.06 * Math.sin(phase * 3));
      const color = i % 2 === 0 ? COLORS.snakeHead : COLORS.snakeTail;
      ctx.fillStyle = rgba(color, 0.35);
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, radius), 0, R_TAU);
      ctx.fill();
    }
    ctx.restore();
    this.drawParticles(ctx, effects);
    this.drawFloats(ctx, effects);
    this.drawVignette(ctx);
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
    this.drawBoardFrame(ctx);
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
    this.drawVignette(ctx);
  }

  drawBackground(ctx, now) {
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, this.width, this.height);
    const glow = ctx.createRadialGradient(
      this.width / 2, this.height / 2, this.board * 0.1,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.75,
    );
    glow.addColorStop(0, COLORS.bgGlow);
    glow.addColorStop(1, COLORS.bg);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);

    if (!this.settings.grid) return;
    ctx.save();
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID; i++) {
      const x = this.ox + i * this.cell;
      const y = this.oy + i * this.cell;
      ctx.moveTo(x, this.oy);
      ctx.lineTo(x, this.oy + this.board);
      ctx.moveTo(this.ox, y);
      ctx.lineTo(this.ox + this.board, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  drawBoardFrame(ctx) {
    ctx.save();
    ctx.strokeStyle = COLORS.border;
    ctx.lineWidth = 2;
    ctx.shadowColor = rgba(COLORS.snakeHead, 0.5);
    ctx.shadowBlur = 14;
    const r = Math.max(6, this.cell * 0.5);
    this.roundRect(ctx, this.ox, this.oy, this.board, this.board, r);
    ctx.stroke();
    ctx.restore();
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

  drawFood(ctx, game, now) {
    const food = game.food;
    if (!food) return;
    const def = FOOD_DEFS[food.type];
    const center = this.cellToPx(food.x, food.y);
    const pulse = 1 + 0.1 * Math.sin(now / 160);
    const radius = this.cell * 0.3 * pulse;

    ctx.save();
    ctx.shadowColor = def.glow;
    ctx.shadowBlur = 18;
    ctx.fillStyle = def.color;

    if (food.type === 'gold') {
      ctx.translate(center.x, center.y);
      ctx.rotate(Math.PI / 4);
      const size = radius * 0.95;
      ctx.fillRect(-size / 2, -size / 2, size, size);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 245, 200, 0.95)';
      ctx.lineWidth = Math.max(1.5, this.cell * 0.05);
      ctx.shadowBlur = 12;
      ctx.shadowColor = def.glow;
      const sparkle = this.cell * 0.42;
      ctx.beginPath();
      ctx.moveTo(center.x - sparkle, center.y);
      ctx.lineTo(center.x + sparkle, center.y);
      ctx.moveTo(center.x, center.y - sparkle);
      ctx.lineTo(center.x, center.y + sparkle);
      ctx.stroke();
      ctx.restore();
      // 剩余时间环
      if (food.remainingMs != null && def.lifetime) {
        const ratio = Math.max(0, Math.min(1, food.remainingMs / def.lifetime));
        ctx.save();
        ctx.strokeStyle = rgba('#ffd23f', 0.55);
        ctx.lineWidth = Math.max(1.5, this.cell * 0.06);
        ctx.beginPath();
        ctx.arc(center.x, center.y, this.cell * 0.46, -Math.PI / 2, -Math.PI / 2 + R_TAU * ratio);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, R_TAU);
    ctx.fill();
    ctx.restore();

    if (food.type === 'shield') {
      ctx.save();
      ctx.strokeStyle = 'rgba(220, 240, 255, 0.9)';
      ctx.lineWidth = Math.max(1.5, this.cell * 0.05);
      ctx.beginPath();
      ctx.arc(center.x, center.y, radius * 0.6, 0, R_TAU);
      ctx.stroke();
      ctx.restore();
    } else if (food.type === 'slow') {
      ctx.save();
      ctx.strokeStyle = 'rgba(235, 225, 255, 0.9)';
      ctx.lineWidth = Math.max(1.5, this.cell * 0.045);
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI;
        ctx.beginPath();
        ctx.moveTo(center.x - Math.cos(angle) * radius * 0.62, center.y - Math.sin(angle) * radius * 0.62);
        ctx.lineTo(center.x + Math.cos(angle) * radius * 0.62, center.y + Math.sin(angle) * radius * 0.62);
        ctx.stroke();
      }
      ctx.restore();
    } else if (food.type === 'double') {
      ctx.save();
      ctx.fillStyle = 'rgba(8, 20, 16, 0.9)';
      ctx.font = `bold ${Math.max(9, this.cell * 0.36)}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×2', center.x, center.y + this.cell * 0.01);
      ctx.restore();
    } else {
      // 普通果实高光
      ctx.save();
      ctx.fillStyle = 'rgba(255, 220, 228, 0.75)';
      ctx.beginPath();
      ctx.arc(center.x - radius * 0.3, center.y - radius * 0.35, radius * 0.22, 0, R_TAU);
      ctx.fill();
      ctx.restore();
    }
  }

  snakePoints(game) {
    const t = game.alive ? game.getTickProgress() : 1;
    const points = [];
    const snake = game.snake;
    const prev = game.prevSnake;
    for (let i = 0; i < snake.length; i++) {
      const cur = snake[i];
      const old = prev[i] || cur;
      const wrapped = Math.abs(cur.x - old.x) > 1.5 || Math.abs(cur.y - old.y) > 1.5;
      const x = wrapped ? cur.x : lerp(old.x, cur.x, t);
      const y = wrapped ? cur.y : lerp(old.y, cur.y, t);
      points.push({ x, y });
    }
    return points;
  }

  drawSnake(ctx, game, now) {
    const points = this.snakePoints(game);
    if (points.length === 0) return;
    const alpha = game.alive ? 1 : 0.55;

    // 发光底：整条路径描边
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(COLORS.snakeHead, 0.16);
    ctx.lineWidth = this.cell * 0.95;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = COLORS.snakeHead;
    ctx.shadowBlur = 20;
    this.strokeSnakePath(ctx, points);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    const headPx = this.cellToPx(points[0].x, points[0].y);
    const tailPx = this.cellToPx(points[points.length - 1].x, points[points.length - 1].y);
    const gradient = ctx.createLinearGradient(headPx.x, headPx.y, tailPx.x, tailPx.y);
    gradient.addColorStop(0, COLORS.snakeHead);
    gradient.addColorStop(0.5, COLORS.snakeMid);
    gradient.addColorStop(1, COLORS.snakeTail);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = this.cell * 0.68;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    this.strokeSnakePath(ctx, points);
    ctx.restore();

    // 头部
    const head = this.cellToPx(points[0].x, points[0].y);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#e8feff';
    ctx.shadowColor = COLORS.snakeHead;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(head.x, head.y, this.cell * 0.34, 0, R_TAU);
    ctx.fill();

    const dir = game.dir;
    const perp = { x: -dir.y, y: dir.x };
    const eyeForward = this.cell * 0.16;
    const eyeSide = this.cell * 0.14;
    const eyeRadius = Math.max(1.2, this.cell * 0.075);
    ctx.fillStyle = '#06121c';
    for (const side of [-1, 1]) {
      const ex = head.x + dir.x * eyeForward + perp.x * eyeSide * side;
      const ey = head.y + dir.y * eyeForward + perp.y * eyeSide * side;
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, R_TAU);
      ctx.fill();
    }
    ctx.restore();

    // 护盾光环 / 穿行相位闪烁
    if (game.buffs.shield || game.buffs.shieldPhase > 0) {
      const blinking = game.buffs.shieldPhase > 0;
      const flicker = blinking ? 0.45 + 0.55 * Math.abs(Math.sin(now / 55)) : 0.85;
      ctx.save();
      ctx.strokeStyle = rgba(COLORS.shieldRing, flicker);
      ctx.lineWidth = Math.max(2, this.cell * 0.08);
      ctx.shadowColor = '#4da3ff';
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(head.x, head.y, this.cell * (0.52 + 0.03 * Math.sin(now / 120)), 0, R_TAU);
      ctx.stroke();
      ctx.restore();
    }
  }

  strokeSnakePath(ctx, points) {
    // 穿墙跳变处断开路径，避免横穿屏幕的连线
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < points.length; i++) {
      const p = this.cellToPx(points[i].x, points[i].y);
      if (i > 0) {
        const prevP = this.cellToPx(points[i - 1].x, points[i - 1].y);
        const jump = Math.abs(points[i].x - points[i - 1].x) > 1.5 || Math.abs(points[i].y - points[i - 1].y) > 1.5;
        if (jump) started = false;
      }
      if (!started) {
        ctx.moveTo(p.x, p.y);
        started = true;
      } else {
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
  }

  drawParticles(ctx, effects) {
    if (effects.particles.length === 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of effects.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      const px = this.cellToPx(p.x - 0.5, p.y - 0.5);
      ctx.fillStyle = rgba(p.color, alpha);
      ctx.beginPath();
      ctx.arc(px.x, px.y, Math.max(1, p.size * this.cell), 0, R_TAU);
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
    for (const f of effects.floats) {
      const alpha = Math.max(0, f.life / f.maxLife);
      const px = this.cellToPx(f.x - 0.5, f.y - 0.5);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = f.color;
      ctx.shadowColor = f.color;
      ctx.shadowBlur = 10;
      ctx.fillText(f.text, px.x, px.y);
    }
    ctx.restore();
  }

  drawVignette(ctx) {
    const gradient = ctx.createRadialGradient(
      this.width / 2, this.height / 2, Math.min(this.width, this.height) * 0.35,
      this.width / 2, this.height / 2, Math.max(this.width, this.height) * 0.72,
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}