// 无头逻辑自测：node tools/sim/selftest.mjs
// 覆盖：移动/转向缓冲/反转拒绝/吃果计分/连击/双倍/护盾/穿墙/自撞/尾格放行/金果过期/速度成长
import { SnakeGame, DIRS } from '../../src/game.js';
import { GRID } from '../../src/config.js';

let passed = 0;
let failed = 0;

function ok(cond, label, extra) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${extra ? ' — ' + extra : ''}`);
  }
}

function near(a, b, eps = 1e-9) {
  return Math.abs(a - b) <= eps;
}

function fresh(difficulty = 'classic') {
  return new SnakeGame({ difficulty, rng: () => 0.5 });
}

function tickMs(game) {
  return 1000 / game.currentSpeed();
}

// ---------- 1. 初始状态 ----------
console.log('1. 初始状态');
{
  const g = fresh();
  ok(g.snake.length === 3, '初始蛇长 3');
  ok(g.snake[0].x === 12 && g.snake[0].y === 12, '蛇头位于中心 (12,12)');
  ok(g.dir === DIRS.right, '初始朝右');
  ok(g.food !== null, '开局已刷新食物');
  ok(!(g.food.x === 12 && g.food.y === 12) && !g.snake.some((s) => s.x === g.food.x && s.y === g.food.y), '食物不与蛇重叠');
}

// ---------- 2. 移动与转向缓冲 ----------
console.log('2. 移动与转向缓冲');
{
  const g = fresh();
  g.update(tickMs(g));
  ok(g.snake[0].x === 13 && g.snake[0].y === 12 && g.snake.length === 3, '一个 tick 后蛇头右移一格且长度不变');

  ok(g.queueDirection('left') === false, '禁止 180° 反转');
  ok(g.queueDirection('up') === true, '缓存转向 up 成功');
  ok(g.queueDirection('down') === false, '缓存中拒绝与 up 相反的 down');
  ok(g.queueDirection('right') === true, '最多缓存 2 步');
  ok(g.queueDirection('down') === false, '超过 2 步被拒绝');

  g.update(tickMs(g));
  ok(g.snake[0].x === 13 && g.snake[0].y === 11, '第一步转向 up 生效');
  g.update(tickMs(g));
  ok(g.snake[0].x === 14 && g.snake[0].y === 11, '第二步转向 right 生效');
}

// ---------- 3. 吃果计分与连击 ----------
console.log('3. 吃果计分与连击');
{
  const g = fresh('chill');
  g.placeFood('normal', 13, 12);
  g.update(tickMs(g));
  ok(g.score === 10, '吃普通果 +10');
  ok(g.snake.length === 4, '吃果后长度 +1');
  ok(g.combo === 1, '首吃连击 x1');

  g.placeFood('normal', 14, 12);
  g.update(tickMs(g));
  ok(g.score === 30, '3 秒内第二颗 +20（连击 x2）', `score=${g.score}`);
  ok(g.getComboMultiplier() === 2, '连击倍率显示 x2');

  g.placeFood('gold', 15, 12);
  g.update(tickMs(g));
  ok(g.score === 30 + 150, '金果 +50 × 连击 x3 = +150', `score=${g.score}`);

  // 连击窗口过期（清空场上食物，避免直行途中误吃续连击）
  g.food = null;
  for (let i = 0; i < 30; i++) g.update(100);
  ok(g.combo === 1 && g.comboTimer === 0, '3 秒未吃连击重置 x1');
}

// ---------- 4. 双倍分 ----------
console.log('4. 双倍分');
{
  const g = fresh();
  g.placeFood('double', 13, 12);
  g.update(tickMs(g));
  ok(g.buffs.doubleRemaining > 0, '吃到双倍后增益生效');

  g.placeFood('normal', 14, 12);
  g.update(tickMs(g));
  ok(g.score === 40, '双倍 × 连击 x2 → +40', `score=${g.score}`);

  ok(g.buffs.doubleRemaining <= 10000 - tickMs(g), '双倍倒计时递减');
}

// ---------- 5. 护盾抵消死亡 ----------
console.log('5. 护盾抵消死亡');
{
  const g = fresh('classic');
  g.placeFood('shield', 13, 12);
  g.update(tickMs(g));
  ok(g.buffs.shield === true, '吃到护盾获得护盾');

  g.snake = [{ x: 23, y: 12 }, { x: 22, y: 12 }, { x: 21, y: 12 }];
  g.dir = DIRS.right;
  g.placeFood('normal', 0, 0);
  g.update(tickMs(g));
  ok(g.alive === true, '撞墙时护盾抵消死亡');
  ok(g.buffs.shield === false, '护盾被消耗');
  ok(g.buffs.shieldPhase > 0, '进入 1 秒穿行相位');
  ok(g.snake[0].x === 0 && g.snake[0].y === 12, '救回后从对面出现 (0,12)');

  for (let i = 0; i < 20; i++) g.update(100);
  ok(g.buffs.shieldPhase === 0, '相位结束');

  g.snake = [{ x: 23, y: 12 }, { x: 22, y: 12 }, { x: 21, y: 12 }];
  g.dir = DIRS.right;
  g.update(tickMs(g));
  ok(g.alive === false && g.deadReason === 'wall', '无护盾时撞墙死亡');
  ok(g.drainEvents().some((e) => e.type === 'death'), '死亡事件已产生');
}

// ---------- 6. 穿墙难度 ----------
console.log('6. 悠闲难度穿墙');
{
  const g = fresh('chill');
  g.snake = [{ x: 23, y: 12 }, { x: 22, y: 12 }, { x: 21, y: 12 }];
  g.dir = DIRS.right;
  g.placeFood('normal', 0, 0);
  g.update(200);
  ok(g.alive === true, '悠闲档撞边界不死亡');
  ok(g.snake[0].x === 0 && g.snake[0].y === 12, '从右侧穿到左侧');
}

// ---------- 7. 自撞与尾格放行 ----------
console.log('7. 自撞与尾格放行');
{
  const g = fresh('classic');
  g.snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }, { x: 4, y: 6 }];
  g.dir = DIRS.down;
  g.placeFood('normal', 0, 0);
  g.update(tickMs(g));
  ok(g.alive === false && g.deadReason === 'self', '撞到身体死亡');

  const h = fresh('classic');
  h.snake = [{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }, { x: 5, y: 6 }];
  h.dir = DIRS.down;
  h.placeFood('normal', 0, 0);
  h.update(tickMs(h));
  ok(h.alive === true, '追着尾巴走不算自撞');
  ok(h.snake[0].x === 5 && h.snake[0].y === 6, '蛇头进入原尾格');
  ok(h.snake.length === 4, '长度不变');
}

// ---------- 8. 金果过期 ----------
console.log('8. 金果过期');
{
  const g = fresh('chill');
  g.placeFood('gold', 0, 0);
  let expired = false;
  for (let i = 0; i < 40; i++) {
    g.update(167);
    if (g.drainEvents().some((e) => e.type === 'foodExpired' && e.food === 'gold')) expired = true;
  }
  ok(expired, '金果 6 秒后过期刷新');
}

// ---------- 9. 速度成长 ----------
console.log('9. 速度成长');
{
  const g = fresh('classic');
  ok(near(g.currentSpeed(), 8), '经典档初始速度 8');

  let expected = 10;
  for (let i = 0; i < 5; i++) {
    const h = g.snake[0];
    g.placeFood('normal', h.x + 1, h.y);
    g.update(tickMs(g));
  }
  ok(near(g.currentSpeed(), 8.3), '吃满 5 颗后 +0.3', `speed=${g.currentSpeed()}`);
  ok(g.combo === 5 && g.getComboMultiplier() === 5, '连续快吃连击封顶 x5');
  expected = 10 * 1 + 10 * 2 + 10 * 3 + 10 * 4 + 10 * 5;
  ok(g.score === expected, `连击总分 ${expected}`, `score=${g.score}`);

  // 减速增益
  const h = g.snake[0];
  g.placeFood('slow', h.x + 1, h.y);
  g.update(tickMs(g));
  ok(near(g.currentSpeed(), 8.3 * 0.7), '减速期间速度 ×0.7', `speed=${g.currentSpeed()}`);
}

// ---------- 10. 网格满时无食物 ----------
console.log('10. 边界');
{
  const g = fresh('classic');
  g.snake = [];
  for (let y = 0; y < GRID; y++) {
    for (let x = 0; x < GRID; x++) g.snake.push({ x, y });
  }
  g.spawnFood();
  ok(g.food === null, '满格时无空位不报错');
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
if (failed > 0) process.exit(1);