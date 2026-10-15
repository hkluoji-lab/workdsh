/**
 * 增值业务管理后台 —— 浏览器端验收
 * 登录：复用门户会话（CDP 注入 Cookie，等价于已登录浏览器）。
 * 覆盖：加载数据、编辑保存（仅保存不发布）、发布并回写线上页、校验拦截非法数据、需求单展示与状态流转。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.argv[2] || 'http://127.0.0.1:3098';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SHOTS = path.join(ROOT, 'shots');
const PORT = 9243;
const PW = process.env.VAS_TEST_PASSWORD;
const USER = process.env.VAS_TEST_USER;

const BIN = '/data/dsh/home/dsh/.tmp/pw/browsers/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell';
const ENV = { ...process.env,
  FONTCONFIG_PATH: '/data/dsh/home/dsh/tmp/q3-opt/root/etc/fonts',
  XDG_DATA_HOME: '/data/dsh/home/dsh/tmp/q3-opt/root/usr/share',
  LD_LIBRARY_PATH: '/data/dsh/home/dsh/tmp/q3-opt/root/usr/lib/x86_64-linux-gnu:/data/dsh/home/dsh/tmp/q3-opt/root/lib/x86_64-linux-gnu' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (n, c, x = '') => { results.push({ n, c: !!c, x }); console.log(`${c ? 'PASS' : 'FAIL'}  ${n}${x ? '  ' + x : ''}`); };
await fs.mkdir(SHOTS, { recursive: true });

// 通过真实登录页表单登录（比注入 Cookie 更贴近真实用户路径）
const loginPage = await fetch(BASE + '/login');
ok('登录页可访问', loginPage.status === 200, 'HTTP ' + loginPage.status);

const child = spawn(BIN, ['--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
  `--user-data-dir=/tmp/vas-ud-admin`, `--remote-debugging-port=${PORT}`,
  '--headless','--hide-scrollbars','--force-color-profile=srgb','about:blank'], { env: ENV, stdio: 'ignore' });
async function wsUrl(){for(let i=0;i<80;i++){try{const l=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
 const p=l.find(x=>x.type==='page');if(p?.webSocketDebuggerUrl)return p.webSocketDebuggerUrl;}catch(e){}await sleep(250);}throw new Error('no ws');}
const ws = new WebSocket(await wsUrl());
await new Promise((r) => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const errs = []; const consoleErrs = [];
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrs.push(m.params.args.map(a=>a.value??a.description??'').join(' ')); });
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
async function ev(x){const r=await send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true});
  if(r.result?.exceptionDetails)throw new Error('页面异常: '+(r.result.exceptionDetails.exception?.description||''));return r.result?.result?.value;}
/** 轮询等待页面出现选择器，替代固定 sleep，避免慢启动时的偶发失败 */
async function waitFor(selector, timeout = 15000) {
  const step = 250;
  for (let t = 0; t < timeout; t += step) {
    try { if (await ev(`!!document.querySelector(${JSON.stringify(selector)})`)) return true; } catch { /* 页面切换中 */ }
    await sleep(step);
  }
  return false;
}
async function shot(n){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});
  await fs.writeFile(path.join(SHOTS,n+'.png'),Buffer.from(r.result.data,'base64'));}
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Emulation.setDeviceMetricsOverride',{width:1440,height:950,deviceScaleFactor:1,mobile:false});

// 真实登录：/login → 填表 → 提交
await send('Page.navigate', { url: BASE + '/login' });
ok('登录表单已渲染', await waitFor('#username'), '#username');
await ev(`(()=>{document.querySelector('#username').value=${JSON.stringify(USER)};
  document.querySelector('#password').value=${JSON.stringify(PW)};})()`);
await ev(`document.querySelector('form.auth-form').submit()`);
await sleep(2600);
const afterLogin = await ev(`location.pathname + location.search`);
ok('登录表单提交成功（已离开登录页）', !String(afterLogin).startsWith('/login'), String(afterLogin));

await send('Page.navigate', { url: BASE + '/portal/zengzhi/admin' });
await waitFor('.ah', 12000);
await waitFor('#productList .item', 12000);
await sleep(600);

const loaded = await ev(`({
  hasShell: !!document.querySelector('.ah'),
  user: (document.querySelector('#userLabel')||{}).textContent||'',
  products: document.querySelectorAll('#productList .item').length,
  tiers: document.querySelectorAll('[data-tiers] .row').length,
  scenes: document.querySelectorAll('#sceneList .item').length,
  benefits: document.querySelectorAll('#benefitList .item').length,
  faq: document.querySelectorAll('#faqList .item').length,
  title: (document.querySelector('#m-title')||{}).value||'',
  dirty: (document.querySelector('#dirtyHint')||{}).textContent||''
})`);
ok('后台界面加载（SSO 会话有效）', loaded.hasShell, 'user=' + loaded.user);
ok('产品编辑器渲染 5 个产品', loaded.products === 5, String(loaded.products));
ok('资费档位共 15 行', loaded.tiers === 15, String(loaded.tiers));
ok('场景 5 / 价值 5 / FAQ 8', loaded.scenes === 5 && loaded.benefits === 5 && loaded.faq === 8, JSON.stringify({s:loaded.scenes,b:loaded.benefits,f:loaded.faq}));
ok('页面标题已载入', !!loaded.title, loaded.title.slice(0, 30));
ok('初始状态为「已与服务端一致」', loaded.dirty.includes('一致'), loaded.dirty);
await shot('admin-01-editor');

// 校验按钮
await ev(`document.querySelector('#btnValidate').click()`); await sleep(1200);
const vIssues = await ev(`({txt:document.querySelector('#issues').textContent.slice(0,40), cls:document.querySelector('#issues').className})`);
ok('校验通过并显示结果（可含提示）', vIssues.cls.includes('issues--ok') || vIssues.cls.includes('issues--warn'), vIssues.txt);

// 修改一个字段 → 标记为脏
await ev(`(()=>{const el=document.querySelector('[data-f="tagline"]');el.value='浏览器验收修改的定位语';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await sleep(300);
ok('修改后提示未保存', (await ev(`document.querySelector('#dirtyHint').textContent`)).includes('未保存'));

// 仅保存（不发布）
await ev(`document.querySelector('#btnSave').click()`); await sleep(1600);
const afterSave = await ev(`({toast:document.querySelector('#toast').textContent, dirty:document.querySelector('#dirtyHint').textContent})`);
// 注意：提示语是「已保存（未发布，线上页未变）」，其中也含「发布」二字，
// 因此按明确语义判断，而不是用 includes('发布') 这种会误判的子串检查。
ok('「仅保存」成功且明确提示未发布', afterSave.toast.includes('已保存') && afterSave.toast.includes('未发布'), afterSave.toast);
const liveAfterSave = await (await fetch(BASE + '/portal/products/2026Q3-zengzhi.html')).text();
ok('未发布时线上页仍是旧内容', !liveAfterSave.includes('浏览器验收修改的定位语'));

// 发布 → 线上页应更新
await ev(`document.querySelector('#btnPublish').click()`); await sleep(2200);
const afterPub = await ev(`document.querySelector('#toast').textContent`);
ok('「保存并发布」成功', afterPub.includes('发布'), afterPub);
const liveAfterPub = await (await fetch(BASE + '/portal/products/2026Q3-zengzhi.html')).text();
ok('发布后线上页含新内容', liveAfterPub.includes('浏览器验收修改的定位语'));
await shot('admin-02-published');

// 还原并再次发布
await ev(`(()=>{const el=document.querySelector('[data-f="tagline"]');el.value='把客户等待接听的时间，变成企业的品牌时间。';el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
await sleep(300);
await ev(`document.querySelector('#btnPublish').click()`); await sleep(2200);
const restored = await (await fetch(BASE + '/portal/products/2026Q3-zengzhi.html')).text();
ok('已还原原始定位语并发布', restored.includes('把客户等待接听的时间，变成企业的品牌时间。') && !restored.includes('浏览器验收修改的定位语'));

// 非法数据应被服务端拒绝
const bad = await ev(`(async()=>{
  const r = await fetch('/api/portal/zengzhi/products/2026Q3-zengzhi/publish',{method:'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json','X-CSRF-Token':document.querySelector('meta[name="csrf"]').content},
    body:JSON.stringify({data:{id:'2026Q3-zengzhi',products:[],scenes:[],benefits:[],categories:[],faq:[],terms:[],meta:{},catalog:{}}})});
  const j = await r.json(); return {status:r.status, errs:(j.errors||[]).length};})()`);
ok('服务端拒绝非法数据（422 且返回具体错误）', bad.status === 422 && bad.errs > 0, JSON.stringify(bad));

// 需求单标签页
await ev(`document.querySelector('[data-tab="orders"]').click()`); await sleep(1500);
const orders = await ev(`({rows:document.querySelectorAll('#orderBody tr').length, stats:document.querySelector('#orderStats').textContent, empty:!document.querySelector('#orderEmpty').hidden})`);
ok('需求单列表可加载', orders.rows >= 1, orders.stats);
await shot('admin-03-orders');

// 状态流转
const changed = await ev(`(async()=>{
  const s=document.querySelector('[data-oid]'); if(!s) return null;
  const oid=s.getAttribute('data-oid'); s.value='contacted';
  s.dispatchEvent(new Event('change',{bubbles:true})); await new Promise(r=>setTimeout(r,1500));
  const r=await fetch('/api/portal/zengzhi/orders?status=contacted',{credentials:'same-origin'});
  const j=await r.json(); const hit=(j.orders||[]).find(o=>o.id===oid);
  return {oid, status:hit?hit.status:null};})()`);
ok('需求单状态可流转并持久化', changed && changed.status === 'contacted', JSON.stringify(changed));

// 发布标签页 & 移动端
await ev(`document.querySelector('[data-tab="meta"]').click()`); await sleep(600);
ok('发布标签页显示线上地址', (await ev(`document.querySelector('#publishedUrl').textContent`)) === '/portal/products/2026Q3-zengzhi.html');
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
await sleep(700);
await shot('admin-04-mobile');
const mob = await ev(`({docScroll:document.documentElement.scrollWidth, client:document.documentElement.clientWidth})`);
ok('后台 390px 无横向溢出', mob.docScroll <= 392, JSON.stringify(mob));

ok('后台无未捕获异常', errs.length === 0, errs.slice(0,2).join(' | '));
ok('后台无控制台报错', consoleErrs.length === 0, consoleErrs.slice(0,2).join(' | '));

const failed = results.filter(r => !r.c);
console.log(`\n=== 后台浏览器验收：${results.length-failed.length}/${results.length} 通过 ===`);
if (failed.length) failed.forEach(f => console.log(`  - ${f.n} ${f.x}`));
ws.close(); child.kill('SIGKILL');
process.exit(failed.length ? 1 : 0);
