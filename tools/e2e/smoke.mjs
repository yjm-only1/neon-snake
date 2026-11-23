// 真实浏览器端到端冒烟：node tools/e2e/smoke.mjs
// 依赖本机 Chrome；通过 CDP 驱动单文件产物，验证 开局→吃果计分→死亡→结算→存档→重开→暂停 全链路
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const GAME_URL = 'file:///' + path.join(ROOT, 'deploy-site', 'index.html').replace(/\\/g, '/');
const PROFILE = path.join(ROOT, 'Temp', 'chrome-e2e-profile');
const SHOT = path.join(ROOT, 'Temp', 'e2e-gameover.png');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
let failed = 0;

function ok(cond, label, extra) {
  if (cond) { passed++; console.log(`  ✓ ${label}`); }
  else { failed++; console.error(`  ✗ ${label}${extra ? ' — ' + extra : ''}`); }
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }

  send(method, params = {}) {
    const id = ++this.seq;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) {
    throw new Error('页面执行异常: ' + (result.exceptionDetails.exception?.description || result.exceptionDetails.text));
  }
  return result.result.value;
}

async function waitForTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
      if (page) return page;
    } catch (err) { /* Chrome 尚未就绪 */ }
    await sleep(200);
  }
  throw new Error('等待 Chrome 调试端口超时');
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(SHOT), { recursive: true });

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--window-size=1080,1920', GAME_URL,
  ], { stdio: 'ignore' });

  try {
    const target = await waitForTarget();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', reject, { once: true });
    });
    const cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await sleep(600);

    console.log('1. 开局');
    const cards = await evaluate(cdp, 'document.querySelectorAll("[data-diff]").length');
    ok(cards === 3, '主菜单生成 3 张难度卡');
    await evaluate(cdp, 'document.querySelector(\'[data-diff="classic"]\').click()');
    await sleep(300);
    ok(await evaluate(cdp, '!document.getElementById("hud").classList.contains("hidden")'), 'HUD 显示');
    ok(await evaluate(cdp, 'document.getElementById("menu").classList.contains("hidden")'), '主菜单隐藏');

    console.log('2. 吃金果计分与成就');
    await evaluate(cdp, `(() => { const g = window.__neonSnake.getGame(); const h = g.snake[0]; g.placeFood('gold', h.x + 3, h.y); return true; })()`);
    await sleep(650);
    const score = Number(await evaluate(cdp, 'document.getElementById("hudScore").textContent'));
    ok(score === 50, '吃金果后 HUD 显示 50 分', `score=${score}`);
    ok(await evaluate(cdp, 'document.querySelectorAll(".toast.achievement").length > 0'), '解锁成就 Toast 弹出');
    const saved = JSON.parse(await evaluate(cdp, 'localStorage.getItem("neonSnake.v1")'));
    ok(saved.achievements.includes('first_bite'), '成就 first_bite 已写入 localStorage');

    console.log('3. 撞墙死亡与结算');
    await sleep(2600);
    ok(await evaluate(cdp, '!document.getElementById("gameOverOverlay").classList.contains("hidden")'), '结算面板弹出');
    const resultScore = await evaluate(cdp, 'document.getElementById("resultScore").textContent');
    ok(resultScore === '50', '结算分数 50', `result=${resultScore}`);
    ok(await evaluate(cdp, '!document.getElementById("newRecord").classList.contains("hidden")'), '首局即新纪录横幅');
    const saved2 = JSON.parse(await evaluate(cdp, 'localStorage.getItem("neonSnake.v1")'));
    ok(saved2.bests.classic === 50, '最高分已写入经典档', `best=${saved2.bests.classic}`);
    ok(saved2.stats.games === 1, '生涯局数 +1');

    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(SHOT, Buffer.from(shot.data, 'base64'));
    console.log('  · 结算截图已保存 Temp/e2e-gameover.png');

    console.log('4. 再来一局与暂停');
    await evaluate(cdp, 'document.getElementById("btnAgain").click()');
    await sleep(300);
    ok(await evaluate(cdp, 'document.getElementById("gameOverOverlay").classList.contains("hidden")'), '结算面板关闭');
    ok(await evaluate(cdp, '!document.getElementById("hud").classList.contains("hidden")'), '重新进入对局');
    await evaluate(cdp, 'window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space" }))');
    await sleep(200);
    ok(await evaluate(cdp, '!document.getElementById("pauseOverlay").classList.contains("hidden")'), '空格弹出暂停面板');
    await evaluate(cdp, 'document.getElementById("btnQuit").click()');
    await sleep(300);
    ok(await evaluate(cdp, '!document.getElementById("menu").classList.contains("hidden")'), '返回主菜单');
    ok(await evaluate(cdp, 'document.querySelector(\'[data-best="classic"]\').textContent') === '50', '菜单显示经典档最高分 50');

    console.log('5. 成就面板');
    await evaluate(cdp, 'document.getElementById("btnAchievements").click()');
    await sleep(200);
    ok(await evaluate(cdp, 'document.querySelectorAll(".ach-item").length') === 8, '成就面板 8 项');
    ok(await evaluate(cdp, 'document.querySelectorAll(".ach-item.done").length') >= 1, '已解锁成就高亮');

    console.log('6. 刷新后持久化');
    await cdp.send('Page.reload');
    await sleep(900);
    ok(await evaluate(cdp, '!document.getElementById("menu").classList.contains("hidden")'), '刷新后回到主菜单');
    ok(await evaluate(cdp, 'document.querySelector(\'[data-best="classic"]\').textContent') === '50', '刷新后最高分保留');

    console.log(`\n结果：${passed} 通过，${failed} 失败`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    try { execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (err) { /* 已退出 */ }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});