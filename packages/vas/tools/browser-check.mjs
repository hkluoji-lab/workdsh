/**
 * 增值业务多页站点 —— 真实浏览器验收
 *
 * 重点：在门户下发的真实 CSP 下确认每页脚本确实执行（数据渲染出来），
 *       逐页核对月租/套餐内容，走通站内导航与需求单提交。
 *
 * 用法：node tools/browser-check.mjs [baseUrl]   （默认容器内直连门户 3083）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://127.0.0.1:3083';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHOTS = path.join(ROOT, 'shots');
const PORT = 9245;
const ID = '2026Q3-zengzhi';

const BIN = '/data/dsh/home/dsh/.tmp/pw/browsers/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell';
const ENV = {
  ...process.env,
  FONTCONFIG_PATH: '/data/dsh/home/dsh/tmp/q3-opt/root/etc/fonts',
  XDG_DATA_HOME: '/data/dsh/home/dsh/tmp/q3-opt/root/usr/share',
  LD_LIBRARY_PATH: '/data/dsh/home/dsh/tmp/q3-opt/root/usr/lib/x86_64-linux-gnu:/data/dsh/home/dsh/tmp/q3-opt/root/lib/x86_64-linux-gnu',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, c, x = '') => { results.push({ n, c: !!c, x }); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
await fs.mkdir(SHOTS, { recursive: true });

const child = spawn(BIN, ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
  '--user-data-dir=/tmp/vas-mp-ud', `--remote-debugging-port=${PORT}`,
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
const cspViol = [], consoleErrs = [], pageErrs = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Log.entryAdded' && /Content Security Policy|Refused to/i.test(m.params.entry.text || '')) cspViol.push(m.params.entry.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrs.push(m.params.args.map((a) => a.value ?? a.description ?? '').join(' '));
  if (m.method === 'Runtime.exceptionThrown') pageErrs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(x) {
  const r = await send('Runtime.evaluate', { expression: x, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error('页面异常: ' + (r.result.exceptionDetails.exception?.description || ''));
  return r.result?.result?.value;
}
async function waitFor(sel, timeout = 12000) {
  for (let t = 0; t < timeout; t += 250) {
    try { if (await ev(`!!document.querySelector(${JSON.stringify(sel)})`)) return true; } catch { /* navigating */ }
    await sleep(250);
  }
  return false;
}
async function shot(n) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fs.writeFile(path.join(SHOTS, n + '.png'), Buffer.from(r.result.data, 'base64'));
}
async function vp(w, h, mobile = false) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile, screenWidth: w, screenHeight: h });
  await sleep(300);
}
const overflow = `(()=>{const de=document.documentElement;const over=[];
 document.querySelectorAll('body *').forEach(el=>{const r=el.getBoundingClientRect();
  if(!r.width||!r.height)return; if(el.closest('.tw')||getComputedStyle(el).position==='fixed')return;
  if(r.right>de.clientWidth+2||r.left<-2)over.push(el.tagName+'.'+String(el.className).slice(0,30));});
 return {docScroll:de.scrollWidth,client:de.clientWidth,over:over.slice(0,6)};})()`;

await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
await vp(1440, 950);

/* ============ 1. 总览页（业务表核心） ============ */
await send('Page.navigate', { url: `${BASE}/portal/products/${ID}.html` });
ok('总览页加载', await waitFor('#biztable table'), '#biztable');
await sleep(400);

const ov = await ev(`({
  h1: (document.querySelector('.phead h1')||{}).textContent||'',
  kpis: document.querySelectorAll('.kpis .kpi').length,
  bizRows: document.querySelectorAll('#biztable tbody tr').length,
  bizRentCells: [...document.querySelectorAll('#biztable tbody tr')].map(tr=>{const e=tr.querySelector('.rent');return e?e.textContent.trim().slice(0,48):''}),
  cards: document.querySelectorAll('#products .pc').length,
  cardTiers: document.querySelectorAll('#products .pc__tiers li').length,
  faq: document.querySelectorAll('.faq details').length,
  navItems: document.querySelectorAll('#nav a').length,
  external: [...document.querySelectorAll('link[href^="http"],script[src],img[src]')].length
})`);
ok('总览页 H1 正确', ov.h1.includes('增值业务'), ov.h1);
ok('总览页 KPI 4 项', ov.kpis === 4, String(ov.kpis));
ok('业务表 5 行（每产品一行）', ov.bizRows === 5, String(ov.bizRows));
ok('业务表每行都有月租单元格', ov.bizRentCells.length === 5, String(ov.bizRentCells.length));
ok('月租为填空项的产品显示「受理时填写」', ov.bizRentCells.some((t) => t.includes('受理时填写')),
  (ov.bizRentCells.find((t) => t.includes('受理时填写')) || '未找到').slice(0, 30));
ok('产品卡 5 张', ov.cards === 5, String(ov.cards));
ok('产品卡显示月租档位', ov.cardTiers >= 10, String(ov.cardTiers));
ok('站内导航 8 项', ov.navItems === 8, String(ov.navItems));
ok('总览页零外部资源标签', ov.external === 0, String(ov.external));
ok('总览页无 CSP 违规', cspViol.length === 0, cspViol.slice(0, 2).join(' | '));
ok('总览页无控制台报错', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));
await shot('mp-01-overview');

const bizText = await ev(`document.querySelector('#biztable').textContent`);
const checks = [
  ['挂机短信 38 元月租', '38'],
  ['挂机短信 88 元月租', '88'],
  ['挂机短信含 300 条短信', '含 300 条短信'],
  ['来电名片 29 元', '29'],
  ['来电名片含 350 条闪信', '含 350 条闪信'],
  ['终端版 10 元', '10'],
  ['终端版覆盖华为荣耀', '华为、荣耀'],
  ['挂机5G 100 元档', '100'],
  ['挂机5G 可 5 个号码共用', '可 5 个号码共用'],
  ['彩铃制作费 400', '400'],
];
for (const [name, needle] of checks) ok(`业务表含「${name}」`, bizText.includes(needle));

/* ============ 2. 逐产品详情页 ============ */
consoleErrs.length = 0; pageErrs.length = 0; cspViol.length = 0;
const prodPages = [
  [`${ID}-ringback.html`, '商务音频/音视频彩铃', true],
  [`${ID}-hangup-sms.html`, '挂机短信', false],
  [`${ID}-caller-id.html`, '来电名片（单产品）', false],
  [`${ID}-caller-id-terminal.html`, '来电名片终端版', false],
  [`${ID}-hangup-5g.html`, '挂机 5G 消息', false],
];
for (const [file, name, noRent] of prodPages) {
  await send('Page.navigate', { url: `${BASE}/portal/products/${file}` });
  const loaded = await waitFor('.blk');
  const info = await ev(`({
    h1:(document.querySelector('.phead h1')||{}).textContent||'',
    plans:document.querySelectorAll('.plan').length,
    blocks:document.querySelectorAll('.blk').length,
    quotes:document.querySelectorAll('.quotes li').length,
    emptyPlan:document.querySelectorAll('.plan--empty').length
  })`);
  ok(`${name} 详情页加载`, loaded && info.h1 === name, info.h1);
  ok(`${name} 有资费方案`, info.plans >= 1, `${info.plans} 个方案`);
  ok(`${name} 有原文依据`, info.quotes >= 1, `${info.quotes} 条`);
  if (noRent) ok(`${name} 月租如实显示为填空项`, info.emptyPlan >= 1, `空态方案 ${info.emptyPlan} 个`);
  if (file.includes('hangup-sms')) {
    const t = await ev(`document.body.textContent`);
    ok('挂机短信详情含 300 条与 800 条套餐内容', t.includes('含 300 条短信') && t.includes('含 800 条短信'));
  }
  if (file.includes('caller-id-terminal')) {
    const t = await ev(`document.body.textContent`);
    ok('终端版详情含三档终端覆盖范围', t.includes('华为、荣耀') && t.includes('小米') && t.includes('vivo'));
  }
  if (file.includes('hangup-5g')) {
    const t = await ev(`document.body.textContent`);
    ok('挂机5G 详情含回落短信条数', t.includes('回落文本短信 360 条') && t.includes('1000'));
  }
}
await shot('mp-02-product-detail');
ok('产品页无控制台报错', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

/* 详情页 → 需求登记 预选
   注意：页面上有两个指向 -order.html 的链接——导航里的「需求登记」（无参数）
   与 CTA「登记该产品需求」（带 ?p=）。必须点 CTA，用 .phead__acts 限定。 */
await send('Page.navigate', { url: `${BASE}/portal/products/${ID}-hangup-5g.html` });
await waitFor('.phead__acts');
const ctaHref = await ev(`(document.querySelector('.phead__acts a[href*="-order.html"]')||{}).getAttribute?document.querySelector('.phead__acts a[href*="-order.html"]').getAttribute('href'):''`);
ok('详情页 CTA 带产品参数（?p=）', String(ctaHref).includes('?p='), String(ctaHref));
await ev(`document.querySelector('.phead__acts a[href*="-order.html"]').click()`);
ok('详情页「登记该产品需求」可跳转', await waitFor('#orderForm'));
await sleep(400);
const pre = await ev(`({path:location.pathname, search:location.search, checked:document.querySelectorAll('#orderChips input:checked').length, on:document.querySelectorAll('.chip.on').length})`);
ok('跳转后自动预选该产品', String(pre.path).includes('-order.html') && pre.checked === 1 && pre.on === 1, JSON.stringify(pre));

/* ============ 3. 资费总表页 ============ */
await send('Page.navigate', { url: `${BASE}/portal/products/${ID}-pricing.html` });
await waitFor('.tw table');
const pr = await ev(`({
  rows: document.querySelectorAll('tbody tr').length,
  monthly: [...document.querySelectorAll('tbody tr')].filter(tr=>tr.textContent.includes('包月')).length,
  onetime: [...document.querySelectorAll('tbody tr')].filter(tr=>tr.textContent.includes('一次性')).length,
  quotes: [...document.querySelectorAll('tbody tr')].filter(tr=>{const q=tr.querySelector('.q');return q&&q.textContent.trim()!=='—'}).length
})`);
ok('资费总表 15 行', pr.rows === 15, String(pr.rows));
ok('含包月 11 行 / 一次性 4 行', pr.monthly === 11 && pr.onetime === 4, JSON.stringify(pr));
ok('15 行全部带原文依据', pr.quotes === 15, String(pr.quotes));
await shot('mp-03-pricing');

/* ============ 4. 需求登记页 + 真实提交 ============ */
await send('Page.navigate', { url: `${BASE}/portal/products/${ID}-order.html` });
ok('需求登记页加载', await waitFor('#orderForm'));
await ev(`document.querySelector('#orderForm').requestSubmit()`);
await sleep(500);
const fe = await ev(`({vis:!document.querySelector('#orderAlert').hidden, cls:document.querySelector('#orderAlert').className, inv:document.querySelectorAll('[aria-invalid="true"]').length})`);
ok('空表单被前端拦截', fe.vis && fe.cls.includes('alert--err') && fe.inv >= 3, JSON.stringify(fe));

await ev(`(()=>{
  const c=document.querySelector('#orderChips input');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));
  document.querySelector('#o-org').value='多页站点验收科技有限公司';
  document.querySelector('#o-contact').value='周八';
  document.querySelector('#o-tel').value='13500000001';
  document.querySelector('#o-consent').checked=true;
})()`);
await sleep(200);
await ev(`document.querySelector('#previewBtn').click()`);
await sleep(400);
const prev = await ev(`({open:!document.querySelector('#docPreview').hidden, hasRent:(document.querySelector('#docBody').textContent||'').includes('元')})`);
ok('需求单预览可生成', prev.open && prev.hasRent);
await ev(`document.querySelector('#docPreview [data-close]').click()`);
await ev(`document.querySelector('#orderForm').requestSubmit()`);
await sleep(2000);
const sub = await ev(`({cls:document.querySelector('#orderAlert').className, id:(document.querySelector('#orderAlert code')||{}).textContent})`);
ok('需求单在真实 CSP 下提交成功', sub.cls.includes('alert--ok') && sub.id, JSON.stringify(sub));
await shot('mp-04-order');

/* ============ 5. 站内导航逐页走通 ============ */
const navOk = await ev(`(async()=>{
  const links=[...document.querySelectorAll('#nav a')].map(a=>a.getAttribute('href'));
  const out=[];
  for(const h of links){ const r=await fetch(h,{method:'GET'}); out.push({h,status:r.status}); }
  return out;})()`);
const badNav = navOk.filter((x) => x.status !== 200);
ok('站内导航 8 个链接全部可达', badNav.length === 0, badNav.length ? JSON.stringify(badNav) : `${navOk.length} 个链接均 200`);

/* ============ 6. 响应式 ============ */
await vp(390, 844, true);
await send('Page.navigate', { url: `${BASE}/portal/products/${ID}.html` });
await waitFor('#biztable table');
const mob = await ev(overflow);
ok('总览页 390px 无横向溢出', mob.docScroll <= 392, JSON.stringify(mob));
ok('移动端导航默认折叠', (await ev(`getComputedStyle(document.querySelector('#nav')).display`)) === 'none');
await ev(`document.querySelector('#navToggle').click()`);
await sleep(300);
ok('移动端导航可展开', (await ev(`getComputedStyle(document.querySelector('#nav')).display`)) === 'flex');
await shot('mp-05-mobile-overview');

await send('Page.navigate', { url: `${BASE}/portal/products/${ID}-pricing.html` });
await waitFor('.tw table');
const mobT = await ev(`({page:document.documentElement.scrollWidth, wrap:(()=>{const w=document.querySelector('.tw');return {scroll:w.scrollWidth,client:w.clientWidth}})()})`);
ok('资费表在自身容器内滚动，页面不溢出', mobT.page <= 392, JSON.stringify(mobT));
await shot('mp-06-mobile-pricing');

await vp(1440, 950);
await send('Page.navigate', { url: `${BASE}/portal/products/${ID}-order.html` });
await waitFor('#orderForm');
ok('整轮无未捕获异常', pageErrs.length === 0, pageErrs.slice(0, 2).join(' | '));
ok('整轮无控制台报错', consoleErrs.length === 0, consoleErrs.slice(0, 2).join(' | '));

const failed = results.filter((r) => !r.c);
console.log(`\n=== 多页站点浏览器验收：${results.length - failed.length}/${results.length} 通过 ===`);
console.log(`截图目录：${SHOTS}`);
if (failed.length) failed.forEach((f) => console.log(`  - ${f.n} ${f.x}`));
ws.close(); child.kill('SIGKILL');
process.exit(failed.length ? 1 : 0);
