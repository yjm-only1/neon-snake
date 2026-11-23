// 截图工具：node tools/e2e/screenshots.mjs → screenshots/*.png
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9347;
const PROFILE = path.join(ROOT, 'Temp', 'chrome-shot-profile');
const URL = 'file:///' + path.join(ROOT, 'deploy-site', 'index.html').replace(/\\/g, '/');
const OUT = path.join(ROOT, 'screenshots');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

async function shot(cdp, name) {
  const data = await cdp.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, name);
  fs.writeFileSync(file, Buffer.from(data.data, 'base64'));
  console.log('  ·', name);
}

async function main() {
  fs.rmSync(PROFILE, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

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
        target = list.find((t) => t.type === 'page' && t.url.includes('index.html'));
      } catch (err) { /* wait */ }
      if (!target) await sleep(200);
    }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); });
    const cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await sleep(700);

    await shot(cdp, 'menu-mobile.png');

    // 皮肤切换截图
    for (const theme of ['aurora', 'magma']) {
      await evaluate(cdp, `(() => {
        document.getElementById('btnSettings').click();
        const el = document.getElementById('setTheme');
        el.value = '${theme}';
        el.dispatchEvent(new Event('change'));
        document.getElementById('btnSetClose').click();
      })()`);
      await sleep(400);
      await shot(cdp, `menu-${theme}.png`);
    }
    await evaluate(cdp, `(() => {
      document.getElementById('btnSettings').click();
      const el = document.getElementById('setTheme');
      el.value = 'neon';
      el.dispatchEvent(new Event('change'));
      document.getElementById('btnSetClose').click();
    })()`);
    await sleep(300);

    // 悠闲档（穿墙不死）：吃两颗金果展示连击飘字
    await evaluate(cdp, 'document.querySelector(\'[data-diff="chill"]\').click()');
    await sleep(500);
    await evaluate(cdp, '(() => { const g = __neonSnake.getGame(); const h = g.snake[0]; g.placeFood("gold", (h.x + 3) % 24, h.y); })()');
    await sleep(420);
    await evaluate(cdp, '(() => { const g = __neonSnake.getGame(); const h = g.snake[0]; g.placeFood("gold", (h.x + 3) % 24, h.y); })()');
    await sleep(300);
    await shot(cdp, 'game-mobile.png');

    // 桌面尺寸
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await shot(cdp, 'game-desktop.png');

    // 强制死亡 → 结算
    await evaluate(cdp, '__neonSnake.getGame().die("wall")');
    await sleep(1400);
    await shot(cdp, 'gameover-desktop.png');

    // 回主菜单 + 桌面菜单
    await evaluate(cdp, 'document.getElementById("btnToMenu").click()');
    await sleep(400);
    await shot(cdp, 'menu-desktop.png');
  } finally {
    try { execFileSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (err) { /* done */ }
  }
}

main().catch((err) => { console.error(err); process.exit(1); });