// 无头逻辑自测（360° 连续移动）：node tools/sim/selftest.mjs
import { SnakeGame } from '../../src/game.js';
import { GRID as GRID_SOLO, BODY } from '../../src/config.js';

let passed = 0;
let failed = 0;
function ok(cond, label, extra) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
}
function near(a, b, eps = 0.02) { return Math.abs(a - b) <= eps; }

function fresh(difficulty = 'classic') {
  const game = new SnakeGame({ difficulty, rng: () => 0.5 });
  return game;
}

function clearFood(game) {
  game.food = null;
}

// ---------- 1. 初始状态 ----------
console.log('1. 初始状态');
{
  const g = fresh();
  ok(g.snake.length === 3, '初始蛇长 3 节');
  ok(near(g.body.head.x, GRID_SOLO / 2 - 1) && near(g.body.head.y, GRID_SOLO / 2), '蛇头位于地图中部');
  ok(near(g.heading, 0), '初始朝向向右');
  ok(g.food !== null, '开局已刷新食物');
  ok(g.distanceToBody(g.food.x, g.food.y) >= 1.2, '食物与蛇身保持距离');
}

// ---------- 2. 连续移动 ----------
console.log('2. 连续移动');
{
  const g = fresh();
  clearFood(g);
  const startX = g.body.head.x;
  g.update(250);
  ok(near(g.body.head.x, startX + 2, 0.05), '250ms 按 8 格/秒前进约 2 格', `x=${g.body.head.x}`);
  ok(near(g.body.head.y, GRID_SOLO / 2), '未转向时 y 不变');
  ok(g.snake.length === 3, '未吃食物长度不变');
}

// ---------- 3. 360° 转向 ----------
console.log('3. 360° 转向');
{
  const g = fresh();
  clearFood(g);
  g.setAim(-Math.PI / 2); // 向上
  for (let i = 0; i < 20; i++) g.update(16);
  ok(near(g.heading, -Math.PI / 2, 0.05), '朝向转到目标角', `heading=${g.heading.toFixed(3)}`);
  ok(g.body.head.y < GRID_SOLO / 2 - 0.8, '蛇头向上移动');

  g.setAim(Math.PI * 0.25); // 右下 45°
  const before = g.heading;
  g.update(16);
  ok(g.heading > before, '多角度目标：朝向连续靠近');
}

// ---------- 4. 吃食物与连击 ----------
console.log('4. 吃食物与连击');
{
  const g = fresh('chill');
  const head = g.body.head;
  g.placeFood('normal', head.x + 0.4, head.y);
  g.update(16);
  ok(g.score === 10, '吃到普通果实 +10', `score=${g.score}`);
  ok(g.snake.length === 4, '吃食物后长度 +1');
  ok(g.combo === 1, '首吃连击 x1');

  const h2 = g.body.head;
  g.placeFood('normal', h2.x + 0.4, h2.y);
  g.update(16);
  ok(g.score === 30, '3 秒内第二颗 +20（连击 x2）', `score=${g.score}`);

  const h3 = g.body.head;
  g.placeFood('gold', h3.x + 0.4, h3.y);
  g.update(16);
  ok(g.score === 30 + 150, '金果 +50 × 连击 x3 = +150', `score=${g.score}`);

  g.food = null;
  for (let i = 0; i < 60; i++) g.update(60);
  ok(g.combo === 1 && g.comboTimer === 0, '3 秒未吃连击重置 x1');
}

// ---------- 5. 双倍与减速 ----------
console.log('5. 双倍与减速');
{
  const g = fresh('chill');
  let head = g.body.head;
  g.placeFood('double', head.x + 0.4, head.y);
  g.update(16);
  ok(g.buffs.doubleRemaining > 0, '吃到双倍后增益生效');
  head = g.body.head;
  g.placeFood('normal', head.x + 0.4, head.y);
  g.update(16);
  ok(g.score === 40, '双倍 × 连击 x2 → +40', `score=${g.score}`);

  head = g.body.head;
  g.placeFood('slow', head.x + 0.4, head.y);
  g.update(16);
  ok(near(g.currentSpeed(), 6 * 0.7, 0.001), '减速期间速度 ×0.7（悠闲档 6×0.7）');
}

// ---------- 6. 护盾抵消死亡 ----------
console.log('6. 护盾抵消死亡');
{
  const g = fresh();
  g.buffs.shield = true;
  clearFood(g);
  g.body.segments = [{ x: GRID_SOLO - 0.5, y: 10 }, { x: GRID_SOLO - 1, y: 10 }, { x: GRID_SOLO - 1.5, y: 10 }];
  g.body.heading = 0;
  g.body.targetHeading = 0;
  g.update(100);
  ok(g.alive === true, '撞墙时护盾抵消死亡');
  ok(g.buffs.shield === false, '护盾被消耗');
  ok(g.buffs.shieldPhase > 0, '进入 1 秒穿行相位');
}

// ---------- 7. 撞墙与穿墙 ----------
console.log('7. 撞墙与穿墙');
{
  const g = fresh();
  clearFood(g);
  g.body.segments = [{ x: GRID_SOLO - 0.5, y: 10 }, { x: GRID_SOLO - 1, y: 10 }, { x: GRID_SOLO - 1.5, y: 10 }];
  g.body.heading = 0;
  g.body.targetHeading = 0;
  g.update(100);
  ok(g.alive === false && g.deadReason === 'wall', '经典档撞墙死亡');
}
{
  const g = fresh('chill');
  clearFood(g);
  g.body.segments = [{ x: GRID_SOLO - 0.3, y: 10 }, { x: GRID_SOLO - 0.8, y: 10 }, { x: GRID_SOLO - 1.3, y: 10 }];
  g.body.heading = 0;
  g.body.targetHeading = 0;
  g.update(100);
  ok(g.alive === true, '悠闲档穿墙不死');
  ok(g.body.head.x < 1, '蛇头从右侧穿到左侧', `x=${g.body.head.x.toFixed(2)}`);
}

// ---------- 8. 自撞 ----------
console.log('8. 自撞');
{
  const g = fresh();
  clearFood(g);
  g.body.segments = [
    { x: 10, y: 10 },
    { x: 9.5, y: 10 },
    { x: 9, y: 10 },
    { x: 8.5, y: 10 },
    { x: 8, y: 10 },
    { x: 8, y: 10.5 },
    { x: 8, y: 11 },
    { x: 8.5, y: 11 },
    { x: 9, y: 11 },
    { x: 9.5, y: 11 },
    { x: 10, y: 11 },
    { x: 10.5, y: 11 },
    { x: 10.5, y: 10.5 },
    { x: 10.55, y: 10.35 },
  ];
  g.body.heading = 0;
  g.body.targetHeading = 0;
  g.update(16);
  ok(g.alive === false && g.deadReason === 'self', '头部碰到身体死亡');
}

// ---------- 9. 速度成长 ----------
console.log('9. 速度成长');
{
  const g = fresh('classic');
  ok(near(g.currentSpeed(), 8), '经典档初始速度 8');
  for (let i = 0; i < 5; i++) {
    const head = g.body.head;
    g.placeFood('normal', head.x + 0.3, head.y);
    g.update(16);
  }
  ok(near(g.currentSpeed(), 8.3, 0.001), '吃满 5 颗后 +0.3', `speed=${g.currentSpeed()}`);
  ok(g.combo === 5 && g.getComboMultiplier() === 5, '连续快吃连击封顶 x5');
  ok(g.score === 10 * 1 + 10 * 2 + 10 * 3 + 10 * 4 + 10 * 5, '连击总分 150', `score=${g.score}`);
}

// ---------- 10. 金果过期 ----------
console.log('10. 金果过期');
{
  const g = fresh('chill');
  g.placeFood('gold', 2, 2);
  let expired = false;
  for (let i = 0; i < 12; i++) {
    g.update(600);
    if (g.drainEvents().some((event) => event.type === 'foodExpired' && event.food === 'gold')) expired = true;
  }
  ok(expired, '金果 6 秒后过期刷新');
  ok(g.food !== null, '过期后重新刷新食物');
}

// ---------- 11. 距离拾取 ----------
console.log('11. 边界');
{
  const g = fresh('chill');
  const head = g.body.head;
  g.placeFood('normal', head.x + BODY.eatRadius - 0.05, head.y);
  g.update(1);
  ok(g.score === 10, '进入拾取半径即吃到');
}
{
  const g = fresh('chill');
  const head = g.body.head;
  g.placeFood('normal', head.x + BODY.eatRadius + 1, head.y);
  g.update(1);
  ok(g.score === 0, '半径外不误吃');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);