/**
 * 通用截图工具（设计评审用）
 *
 * 用法：
 *   node tools/shot.mjs <url> <out.png> [width] [height] [--full] [--scroll=<px|sel>] [--wait=<ms>]
 *
 * 与 browser-check.mjs 使用同一个 headless Chromium 与字体环境，
 * 保证截图里的中文渲染与验收套件一致。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';

const [url, out, w = '1440', h = '950', ...flags] = process.argv.slice(2);
if (!url || !out) {
  console.error('用法: node tools/shot.mjs <url> <out.png> [width] [height] [--full] [--scroll=<px|sel>] [--wait=<ms>]');
  process.exit(2);
}
const W = Number(w), H = Number(h);
const full = flags.includes('--full');
const scrollArg = (flags.find((f) => f.startsWith('--scroll=')) || '').slice(9);
const selArg = (flags.find((f) => f.startsWith('--sel=')) || '').slice(6);
const waitMs = Number((flags.find((f) => f.startsWith('--wait=')) || '--wait=700').slice(7));

const PORT = 9246;
const BIN = '/data/dsh/home/dsh/.tmp/pw/browsers/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell';
const ENV = {
  ...process.env,
  FONTCONFIG_PATH: '/data/dsh/home/dsh/tmp/q3-opt/root/etc/fonts',
  XDG_DATA_HOME: '/data/dsh/home/dsh/tmp/q3-opt/root/usr/share',
  LD_LIBRARY_PATH: '/data/dsh/home/dsh/tmp/q3-opt/root/usr/lib/x86_64-linux-gnu:/data/dsh/home/dsh/tmp/q3-opt/root/lib/x86_64-linux-gnu',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(BIN, ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  `--user-data-dir=/tmp/vas-shot-ud-${PORT}`, `--remote-debugging-port=${PORT}`,
  '--headless', '--hide-scrollbars', '--force-color-profile=srgb', 'about:blank'], { env: ENV, stdio: 'ignore' });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((x) => x.type === 'page');
      if (p?.webSocketDebuggerUrl) return p.webSocketDebuggerUrl;
    } catch { /* not ready */ }
    await sleep(250);
  }
  throw new Error('无法连接 headless 浏览器');
}

const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r));
let id = 0;
const pend = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (x) => (await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true })).result?.result?.value;

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: W < 500, screenWidth: W, screenHeight: H });
await send('Page.navigate', { url });
await sleep(waitMs);

if (scrollArg) {
  const expr = /^\d+$/.test(scrollArg)
    ? `window.scrollTo(0,${scrollArg}); 'y'`
    : `(()=>{const e=document.querySelector(${JSON.stringify(scrollArg)}); if(!e) return 'notfound'; const y=e.getBoundingClientRect().top+window.scrollY-70; window.scrollTo(0,y); return String(Math.round(y));})()`;
  const r = await ev(expr);
  console.log('scroll →', r);
  await sleep(600);
}

// 元素取景：滚动到该元素（留出粘性头部高度），再按视口截图——
// captureBeyondViewport + clip 会让 sticky 元素重排，整段错位，不采用。
if (selArg) {
  const top = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selArg)});
    return e? Math.round(e.getBoundingClientRect().top+window.scrollY) : null;})()`);
  if (top === null) throw new Error(`选择器未匹配：${selArg}`);
  await ev(`window.scrollTo(0,${Math.max(0, top - 80)})`);
  console.log(`scroll to ${selArg} @ ${top}`);
  await sleep(500);
}

const shotArgs = { format: 'png', captureBeyondViewport: !!full };
const r = await send('Page.captureScreenshot', shotArgs);
await fs.mkdir(path.dirname(path.resolve(out)), { recursive: true });
await fs.writeFile(out, Buffer.from(r.result.data, 'base64'));
const dims = await ev('({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight})');
console.log(`saved ${out}  viewport=${W}x${H}  doc=${dims?.w}x${dims?.h}`);
ws.close();
child.kill('SIGKILL');
process.exit(0);
