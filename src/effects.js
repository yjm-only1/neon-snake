// 粒子 / 飘字 / 震屏 / 闪光。坐标以「格」为单位存储，渲染时再换算像素，窗口缩放安全
export class Effects {
  constructor() {
    this.particles = [];
    this.floats = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#ffffff';
  }

  burst(cx, cy, color, count = 14, speed = 5) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const vel = speed * (0.35 + Math.random());
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * vel,
        vy: Math.sin(angle) * vel,
        life: 0.55 + Math.random() * 0.35,
        maxLife: 0.9,
        size: 0.06 + Math.random() * 0.1,
        color,
      });
    }
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);
  }

  deathBurst(cells) {
    const palette = ['#19f9ff', '#5f7bff', '#a04dff', '#ff4d6d'];
    for (let i = 0; i < cells.length; i++) {
      const seg = cells[i];
      this.burst(seg.x + 0.5, seg.y + 0.5, palette[i % palette.length], 5, 6.5);
    }
  }

  floatText(cx, cy, text, color = '#eaf6ff') {
    this.floats.push({ x: cx, y: cy, text, color, life: 0.9, maxLife: 0.9 });
    if (this.floats.length > 24) this.floats.shift();
  }

  addShake(magnitude) {
    this.shake = Math.max(this.shake, magnitude);
  }

  addFlash(alpha, color = '#ffffff') {
    this.flash = Math.max(this.flash, alpha);
    this.flashColor = color;
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.94;
      p.vy *= 0.94;
    }
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.life -= dt;
      f.y -= dt * 1.4;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    this.shake = Math.max(0, this.shake - dt * 55);
    this.flash = Math.max(0, this.flash - dt * 3.2);
  }

  reset() {
    this.particles.length = 0;
    this.floats.length = 0;
    this.shake = 0;
    this.flash = 0;
  }
}