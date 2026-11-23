// 真实鼠标事件回归：node tools/e2e/real-click.mjs
// 覆盖「页面 JS 未加载 / 有元素挡住按钮」这类 DOM .click() 测不出的问题
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.BROWSER_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9348;
const PROFILE = path.join(ROOT, 'Temp', 'chrome-click-profile');
const URL = process.env.GAME_URL || ('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'));
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
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

async function waitFor(cdp, expression, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      if (await evaluate(cdp, expression)) return true;
    } catch (err) { /* 页面尚未就绪 */ }
    await sleep(200);
  }
  return false;
}

async function clickReal(cdp, selector) {
  const rect = await evaluate(cdp, `(() => {
    const el = document.querySelector('${selector}');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!rect) throw new Error('找不到元素: ' + selector);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
  await sleep(250);
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--window-size=1080,1920', URL,
  ], { stdio: 'ignore' });

  try {
    let target = null;
    for (let i = 0; i < 60 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
        target = list.find((t) => t.type === 'page' && !t.url.startsWith('about:'));
      } catch (err) { /* wait */ }
      if (!target) await sleep(200);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    const cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await sleep(800);

    console.log('1. 页面脚本已加载');
    ok(await waitFor(cdp, 'document.querySelectorAll("[data-diff]").length === 3'), '页面生成 3 张难度卡（本地/线上均适用）');

    console.log('2. 真实鼠标点击菜单按钮');
    await clickReal(cdp, '#btnAchievements');
    ok(await evaluate(cdp, '!document.getElementById("achievementsOverlay").classList.contains("hidden")'), '「成就」可点开');
    await clickReal(cdp, '#btnAchClose');
    ok(await evaluate(cdp, 'document.getElementById("achievementsOverlay").classList.contains("hidden")'), '「关闭」可点');
    await clickReal(cdp, '#btnSettings');
    ok(await evaluate(cdp, '!document.getElementById("settingsOverlay").classList.contains("hidden")'), '「设置」可点开');
    await evaluate(cdp, `(() => {
      const theme = document.getElementById('setTheme');
      theme.value = 'aurora';
      theme.dispatchEvent(new Event('change'));
      const quality = document.getElementById('setQuality');
      quality.value = 'low';
      quality.dispatchEvent(new Event('change'));
    })()`);
    await sleep(400);
    const savedSettings = JSON.parse(await evaluate(cdp, 'localStorage.getItem("neonSnake.v1")')).settings;
    ok(savedSettings.theme === 'aurora' && savedSettings.quality === 'low', '皮肤与画质设置已保存');
    await evaluate(cdp, `(() => {
      const theme = document.getElementById('setTheme');
      theme.value = 'neon';
      theme.dispatchEvent(new Event('change'));
      const quality = document.getElementById('setQuality');
      quality.value = 'high';
      quality.dispatchEvent(new Event('change'));
    })()`);
    await sleep(300);
    await clickReal(cdp, '#btnSetClose');
    await clickReal(cdp, '#btnHelp');
    ok(await evaluate(cdp, '!document.getElementById("helpOverlay").classList.contains("hidden")'), '「玩法」可点开');
    await clickReal(cdp, '#btnHelpClose');

    console.log('3. 真实鼠标点击开局');
    await clickReal(cdp, '[data-diff="classic"]');
    ok(await evaluate(cdp, '!document.getElementById("hud").classList.contains("hidden")'), '点击难度卡进入对局');
    await clickReal(cdp, '#btnPause');
    ok(await evaluate(cdp, '!document.getElementById("pauseOverlay").classList.contains("hidden")'), 'HUD 暂停按钮可点');

    console.log(`\n结果：${passed} 通过，${failed} 失败`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    try { execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (err) { /* done */ }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });