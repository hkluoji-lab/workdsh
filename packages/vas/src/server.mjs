/**
 * 增值业务产品页 —— 独立管理后台服务
 *
 * 设计约束（来自对现有部署的实测）：
 *  - 与既有 FTTR 后台（/data/dsh/portal/admin，3084）**完全独立**：
 *    独立数据目录、独立订单目录、独立端口、独立模板与校验器。
 *  - 登录复用门户会话 Cookie（同源 SSO），不新增账号体系、不落任何凭据。
 *  - 订单接口对公开产品页开放（同源 + 限流 + 指纹去重），与 FTTR 的订单链路互不影响。
 *  - 发布产物写入门户静态目录，文件名即公开 URL，无需重启任何服务。
 *
 * 路径约定（由门户 server.mjs 转发后到达本服务）：
 *  - /portal/admin            → 管理界面 HTML
 *  - /portal/admin/admin.js   → 管理界面脚本
 *  - /portal/admin/admin.css  → 管理界面样式
 *  - /api/admin/orders        → 公开提交（POST）/ 登录后列表（GET）
 *  - /api/admin/...           → 登录后接口
 */
import { createServer, request as httpRequest } from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, stat, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProduct, renderSite, renderOverview, pageName } from '../tools/render-product.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

/* 门户模块：复用其会话实现，实现登录态互通（不复制第二套鉴权）。 */
const PORTAL_DIR = resolve(process.env.PORTAL_MODULE_DIR ?? '/data/dsh/portal');
const { COOKIE_NAME, deriveKey, parseCookies } = await import(`file://${join(PORTAL_DIR, 'src', 'session.mjs')}`);
const { authenticate, createAccountDirectory, sessionKeyFor } = await import(`file://${join(PORTAL_DIR, 'src', 'session-key.mjs')}`);
const { loadAccounts, loadConfig: loadPortalConfig } = await import(`file://${join(PORTAL_DIR, 'src', 'config.mjs')}`);

const config = {
  bind: process.env.VAS_BIND ?? '127.0.0.1',
  port: Number(process.env.VAS_PORT ?? 3085),
  dataDir: resolve(process.env.VAS_DATA_DIR ?? join(root, 'data')),
  publicDir: resolve(process.env.VAS_PUBLIC_DIR ?? join(root, 'public')),
  publishDir: resolve(process.env.VAS_PUBLISH_DIR ?? '/data/dsh/portal/site/products'),
  backupDir: resolve(process.env.VAS_BACKUP_DIR ?? join(root, 'backups')),
  ordersDir: resolve(process.env.VAS_ORDERS_DIR ?? join(root, 'data', 'orders')),
  maxBackups: Number(process.env.VAS_MAX_BACKUPS ?? 30),
  orderMaxPerHour: Number(process.env.VAS_ORDER_MAX_PER_HOUR ?? 30),
  orderMaxBytes: Number(process.env.VAS_ORDER_MAX_BYTES ?? 64 * 1024),
  productId: process.env.VAS_PRODUCT_ID ?? '2026Q3-zengzhi',
};

const portalConfig = loadPortalConfig();
const { accounts } = loadAccounts(portalConfig); // 仅用于启动日志
// 会话密钥取共享实现（session-key.mjs），与门户、产品页后台完全同一口径。
// 历史教训：三处各自派生密钥时，口径一旦错位，门户签发的会话在本服务就验不过。
const portalKey = sessionKeyFor(portalConfig);
// 账号可被动态增删改：按请求（带 5s TTL）重读，避免放过已停用账号或漏认新建账号。
const currentAccounts = createAccountDirectory({ load: loadAccounts, config: portalConfig, ttlMs: 5000 });
const CSRF_KEY = deriveKey((portalConfig.password || '') + '::vas-admin');

const PRODUCT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ORDER_STATUSES = ['new', 'contacted', 'won', 'lost'];

function log(event, data = {}) {
  process.stdout.write(JSON.stringify({ at: new Date().toISOString(), event, ...data }) + '\n');
}

/* ------------------------------------------------------------------ 工具 */

function send(res, status, headers, body) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) =>
  send(res, status, { 'Content-Type': 'application/json; charset=utf-8' }, JSON.stringify(obj));
const sendText = (res, status, text) =>
  send(res, status, { 'Content-Type': 'text/plain; charset=utf-8' }, text);

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('too_large'), { code: 'too_large' });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function writeAtomic(target, content) {
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, target);
}

async function archive(file, label) {
  try {
    if (!existsSync(file)) return null;
    await mkdir(config.backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const dest = join(config.backupDir, `${label}.${stamp}`);
    await writeFile(dest, await readFile(file));
    // 只保留最近 N 份
    const all = (await readdir(config.backupDir)).filter((f) => f.startsWith(label + '.')).sort().reverse();
    for (const old of all.slice(config.maxBackups)) await unlink(join(config.backupDir, old)).catch(() => {});
    return dest;
  } catch { return null; }
}

/* ------------------------------------------------------------------ 鉴权 */

// 完整会话记录（含角色）。管理台按角色放行，而不是只看「有没有登录」——
// 引入角色前，任何已登录账号都能进管理台；角色落地后必须显式要求 admin。
function currentRecord(req) {
  const cookies = parseCookies(req.headers.cookie ?? '');
  const token = cookies.get(COOKIE_NAME);
  if (!token) return null;
  return authenticate({ key: portalKey, token, users: currentAccounts(), now: Date.now() });
}

function currentUser(req) {
  return currentRecord(req)?.user ?? null;
}

function isAdmin(req) {
  return currentRecord(req)?.record?.role === 'admin';
}

function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function csrfFor(user) {
  return createHmac('sha256', CSRF_KEY).update(String(user)).digest('hex').slice(0, 32);
}
function csrfOk(req, user) {
  const sent = req.headers['x-csrf-token'];
  if (!sent || typeof sent !== 'string') return false;
  const expected = csrfFor(user);
  if (sent.length !== expected.length) return false;
  try { return timingSafeEqual(Buffer.from(sent), Buffer.from(expected)); } catch { return false; }
}

/* ------------------------------------------------------------------ 数据 */

function dataPath(id) {
  if (!PRODUCT_ID_RE.test(id)) return null;
  return join(config.dataDir, 'products', `${id}.json`);
}

async function readData(id) {
  const p = dataPath(id);
  if (!p) return null;
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

async function listProducts() {
  const dir = join(config.dataDir, 'products');
  if (!existsSync(dir)) return [];
  return (await readdir(dir)).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

async function saveData(id, data, { publish }) {
  const p = dataPath(id);
  if (!p) throw new Error('bad_id');
  data.id = id;
  data.updatedAt = new Date().toISOString();
  data.history = Array.isArray(data.history) ? data.history.slice(-20) : [];
  data.history.push({ at: data.updatedAt, action: publish ? 'publish' : 'save' });

  const backup = await archive(p, `${id}.json`);
  await mkdir(dirname(p), { recursive: true });
  await writeAtomic(p, JSON.stringify(data, null, 2) + '\n');

  let published = false;
  let bytes = 0;
  const archived = [];
  let pages = [];
  if (publish) {
    // 多页站点：总览 + 逐产品详情 + 资费总表 + 需求登记，一次性全部写盘。
    pages = renderSite(data);
    bytes = pages.reduce((n, pg) => n + Buffer.byteLength(pg.html), 0);
    await mkdir(config.publishDir, { recursive: true });
    for (const pg of pages) {
      const target = join(config.publishDir, pg.name);
      const a = await archive(target, pg.name);
      if (a) archived.push(a);
      await writeAtomic(target, pg.html);
    }
    published = true;
  }
  return { backup, published, bytes, archived, pages: pages.map((pg) => pg.name) };
}

/* ------------------------------------------------------------------ 订单 */

const orderIndex = new Map(); // fingerprint -> {id, at}
const rateBuckets = new Map(); // ip -> [ts]

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress ?? 'unknown';
}
function orderFingerprint(o) {
  return createHash('sha256')
    .update([o.org, o.contact, o.tel, o.products.slice().sort().join(',')].join('|'))
    .digest('hex');
}
function rateLimited(ip) {
  const now = Date.now();
  const win = 3600_000;
  const arr = (rateBuckets.get(ip) ?? []).filter((t) => now - t < win);
  arr.push(now);
  rateBuckets.set(ip, arr);
  return arr.length > config.orderMaxPerHour;
}

/** 校验公开提交的需求单。products 必须来自当前产品数据的真实 id，避免脏数据。 */
export function validateOrder(payload, knownProductIds) {
  const errors = [];
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['提交内容格式不正确'], order: null };
  }
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const org = str(payload.org, 120);
  const contact = str(payload.contact, 60);
  const tel = str(payload.tel, 40);
  const addr = str(payload.addr, 240);
  const scale = str(payload.scale, 40);
  const note = str(payload.note, 2000);
  const products = Array.isArray(payload.products)
    ? payload.products.slice(0, 20).map((v) => str(v, 60)).filter(Boolean)
    : [];

  if (!org) errors.push('单位名称不能为空');
  if (!contact) errors.push('联系人不能为空');
  if (!tel) errors.push('联系电话不能为空');
  else if (!/^[0-9+\-()\s]{6,40}$/.test(tel)) errors.push('联系电话格式不正确');
  if (!products.length) errors.push('请至少选择一个意向产品');
  for (const id of products) {
    if (knownProductIds && knownProductIds.size && !knownProductIds.has(id)) {
      errors.push(`意向产品 ${id} 不存在`);
    }
  }
  if (errors.length) return { ok: false, errors, order: null };

  return {
    ok: true,
    errors: [],
    order: {
      id: randomUUID(),
      at: new Date().toISOString(),
      org, contact, tel, addr, scale, note, products,
      status: 'new',
      source: `portal/products/${config.productId}.html`,
      kind: 'zengzhi',
    },
  };
}

function orderFile(iso) {
  return join(config.ordersDir, `${iso.slice(0, 7)}.jsonl`);
}
async function appendOrder(order) {
  await mkdir(config.ordersDir, { recursive: true });
  const line = JSON.stringify(order) + '\n';
  const file = orderFile(order.at);
  let prev = '';
  try { prev = await readFile(file, 'utf8'); } catch { /* 新文件 */ }
  await writeAtomic(file, prev + line);
}
async function readOrders({ status, limit = 200 } = {}) {
  if (!existsSync(config.ordersDir)) return [];
  const files = (await readdir(config.ordersDir)).filter((f) => f.endsWith('.jsonl')).sort().reverse();
  const out = [];
  for (const f of files) {
    const text = await readFile(join(config.ordersDir, f), 'utf8').catch(() => '');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (!status || o.status === status) out.push(o);
      } catch { /* 跳过坏行 */ }
    }
    if (out.length >= limit) break;
  }
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, limit);
}
async function updateOrderStatus(id, status) {
  if (!ORDER_STATUSES.includes(status)) return null;
  if (!existsSync(config.ordersDir)) return null;
  const files = (await readdir(config.ordersDir)).filter((f) => f.endsWith('.jsonl'));
  for (const f of files) {
    const file = join(config.ordersDir, f);
    const text = await readFile(file, 'utf8').catch(() => '');
    const lines = text.split('\n');
    let hit = null;
    const next = lines.map((line) => {
      if (!line.trim()) return line;
      try {
        const o = JSON.parse(line);
        if (o.id === id) { o.status = status; o.updatedAt = new Date().toISOString(); hit = o; return JSON.stringify(o); }
      } catch { /* 原样保留 */ }
      return line;
    });
    if (hit) { await writeAtomic(file, next.join('\n')); return hit; }
  }
  return null;
}

/* ------------------------------------------------------------------ 静态资源 */

const STATIC = new Map([
  ['/portal/admin', ['admin.html', 'text/html; charset=utf-8']],
  ['/portal/admin/', ['admin.html', 'text/html; charset=utf-8']],
  ['/portal/admin/admin.js', ['admin.js', 'text/javascript; charset=utf-8']],
  ['/portal/admin/admin.css', ['admin.css', 'text/css; charset=utf-8']],
]);

async function serveStatic(res, name, type, replacements) {
  try {
    let body = await readFile(join(config.publicDir, name), 'utf8');
    for (const [k, v] of Object.entries(replacements ?? {})) body = body.replaceAll(k, v);
    send(res, 200, { 'Content-Type': type }, body);
  } catch {
    sendText(res, 404, 'Not found');
  }
}

/* ------------------------------------------------------------------ 路由 */

async function route(req, res) {
  const url = new URL(req.url ?? '/', 'http://vas.local');
  let path = decodeURIComponent(url.pathname);
  const method = req.method ?? 'GET';

  /* 路径归一化：门户把 /portal/zengzhi/* 与 /api/portal/zengzhi/* 原样转发过来，
     本服务同时接受「公开前缀」与「内部路径」两种形式，便于直连自测与经门户访问。 */
  if (path === '/portal/zengzhi/admin' || path === '/portal/zengzhi/admin/') path = '/portal/admin';
  else if (path.startsWith('/portal/zengzhi/admin/')) path = '/portal/admin' + path.slice('/portal/zengzhi/admin'.length);
  else if (path === '/api/portal/zengzhi') path = '/api/admin';
  else if (path.startsWith('/api/portal/zengzhi/')) path = '/api/admin/' + path.slice('/api/portal/zengzhi/'.length);

  /* --- 公开：产品页提交需求单 --- */
  if (method === 'POST' && path === '/api/admin/orders') {
    if (!sameOrigin(req)) {
      log('order.bad_origin', { ip: clientIp(req).slice(0, 12) });
      return sendJson(res, 403, { ok: false, error: 'bad_origin' });
    }
    let raw;
    try { raw = await readBody(req, config.orderMaxBytes); }
    catch { return sendJson(res, 413, { ok: false, error: 'too_large' }); }
    let payload;
    try { payload = JSON.parse(raw); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }

    const data = await readData(config.productId);
    const known = new Set(data ? data.products.map((p) => p.id) : []);
    const result = validateOrder(payload, known);
    if (!result.ok) return sendJson(res, 422, { ok: false, error: 'invalid', errors: result.errors });

    const fp = orderFingerprint(result.order);
    const dup = orderIndex.get(fp);
    if (dup && Date.now() - dup.at < 3600_000) {
      log('order.duplicate', { id: dup.id });
      return sendJson(res, 200, { ok: true, id: dup.id, duplicate: true });
    }
    const ip = clientIp(req);
    if (rateLimited(ip)) {
      log('order.ratelimited', { ip: ip.slice(0, 12) });
      return sendJson(res, 429, { ok: false, error: 'too_many_requests' });
    }
    try { await appendOrder(result.order); }
    catch (e) {
      log('order.write_failed', { message: String(e?.message ?? e) });
      return sendJson(res, 500, { ok: false, error: 'write_failed' });
    }
    orderIndex.set(fp, { id: result.order.id, at: Date.now() });
    log('order.created', { id: result.order.id, products: result.order.products.length, telTail: result.order.tel.slice(-4) });
    return sendJson(res, 200, { ok: true, id: result.order.id, at: result.order.at });
  }

  /* --- 登录后接口 --- */
  if (!path.startsWith('/api/admin/')) {
    const s = STATIC.get(path);
    if (!s) return sendText(res, 404, 'Not found');
    if (method !== 'GET' && method !== 'HEAD') return sendText(res, 405, 'Method not allowed');
    // 管理界面本身需要登录，且必须是管理员；其 JS/CSS 同样受限，避免暴露内部结构
    const user = currentUser(req);
    if (!user) return sendText(res, 401, '未登录');
    if (!isAdmin(req)) return sendText(res, 403, '需要管理员权限');
    return serveStatic(res, s[0], s[1], { '{{CSRF}}': csrfFor(user), '{{USER}}': escapeHtml(user) });
  }

  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
  if (!isAdmin(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' });

  const isWrite = method !== 'GET' && method !== 'HEAD';
  if (isWrite) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'bad_origin' });
    if (!csrfOk(req, user)) return sendJson(res, 403, { ok: false, error: 'bad_csrf' });
  }

  const api = path.slice('/api/admin/'.length);

  if (method === 'GET' && api === 'session') return sendJson(res, 200, { ok: true, user });
  if (method === 'GET' && api === 'products') return sendJson(res, 200, { ok: true, products: await listProducts() });

  if (method === 'GET' && api === 'orders') {
    const status = url.searchParams.get('status') || '';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, 500);
    const orders = await readOrders({ status, limit });
    const counts = { new: 0, contacted: 0, won: 0, lost: 0 };
    for (const o of await readOrders({ limit: 1000 })) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return sendJson(res, 200, { ok: true, orders, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
  }

  const om = api.match(/^orders\/([A-Za-z0-9-]{8,64})\/status$/);
  if (method === 'POST' && om) {
    let payload;
    try { payload = JSON.parse(await readBody(req, 8192)); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
    const updated = await updateOrderStatus(om[1], String(payload?.status ?? ''));
    if (!updated) return sendJson(res, 404, { ok: false, error: 'not_found_or_bad_status' });
    log('order.status', { id: om[1], status: updated.status, user });
    return sendJson(res, 200, { ok: true, order: updated });
  }

  const m = api.match(/^products\/([A-Za-z0-9._-]+)(?:\/(validate|render|save|publish))?$/);
  if (m) {
    const [, id, action] = m;
    const target = dataPath(id);
    if (!target) return sendJson(res, 400, { ok: false, error: 'bad_id' });

    if (method === 'GET' && !action) {
      const data = await readData(id);
      if (!data) return sendJson(res, 404, { ok: false, error: 'not_found' });
      return sendJson(res, 200, { ok: true, data });
    }

    if (method === 'POST' && (action === 'validate' || action === 'render' || action === 'save' || action === 'publish')) {
      let payload;
      try { payload = JSON.parse(await readBody(req, 4 * 1024 * 1024)); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
      const data = payload?.data ?? payload;
      data.id = id;
      const result = validateProduct(data);

      if (action === 'validate') {
        return sendJson(res, 200, { ok: result.ok, errors: result.errors, warnings: result.warnings });
      }
      if (!result.ok) return sendJson(res, 422, { ok: false, error: 'invalid', errors: result.errors, warnings: result.warnings });

      if (action === 'render') {
        try {
          const pages = renderSite(data);
          return sendJson(res, 200, {
            ok: true,
            bytes: pages.reduce((n, pg) => n + Buffer.byteLength(pg.html), 0),
            pages: pages.map((pg) => pg.name),
            warnings: result.warnings,
          });
        } catch (e) {
          return sendJson(res, 500, { ok: false, error: 'render_failed', message: String(e?.message ?? e) });
        }
      }

      const shouldPublish = action === 'publish';
      try {
        const info = await saveData(id, data, { publish: shouldPublish });
        log(shouldPublish ? 'publish.ok' : 'save.ok', { id, user, bytes: info.bytes, pages: (info.pages || []).length });
        return sendJson(res, 200, {
          ok: true, published: info.published, bytes: info.bytes, pages: info.pages || [],
          backup: info.backup, archived: info.archived, warnings: result.warnings,
          url: shouldPublish ? `/portal/products/${id}.html` : null,
        });
      } catch (e) {
        log(shouldPublish ? 'publish.failed' : 'save.failed', { id, message: String(e?.message ?? e) });
        return sendJson(res, 500, { ok: false, error: shouldPublish ? 'publish_failed' : 'save_failed', message: String(e?.message ?? e) });
      }
    }
  }

  return sendText(res, 404, 'Not found');
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => {
    log('request.error', { path: req.url, message: String(error?.message ?? error) });
    if (!res.headersSent) sendText(res, 500, 'Internal error');
    else res.end();
  });
});

server.listen(config.port, config.bind, () => {
  log('listening', { bind: config.bind, port: config.port, dataDir: config.dataDir, publishDir: config.publishDir, accounts: accounts.size, product: config.productId });
});
