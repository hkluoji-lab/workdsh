/**
 * 2026Q3 产品页管理服务（后端）
 *
 * 定位：门户边缘面的一部分，复用门户的会话鉴权，不新建身份体系。
 * 能力：
 *  - 管理端：读取/校验/保存产品数据、渲染并发布产品页、查看与回滚历史版本
 *  - 公开端：接收客户在线提交的订购需求单（供管理端查看线索）
 *
 * 安全边界：
 *  - 所有 /api/admin/* 均要求门户有效会话（直接读门户 Cookie 验签，不依赖 Caddy）
 *  - 写操作要求同源（Origin/Referer 校验）+ CSRF 令牌
 *  - 公开订单提交端点不需要登录，但要求同源 + 字段校验 + 按 IP 限流 + 体积上限
 *  - 数据写入采用「校验 → 临时文件 → rename」原子替换，并在替换前归档历史版本
 *  - 不记录凭据；日志只写事件名与非敏感字段（订单日志不落手机号明文）
 */
import { createServer } from 'node:http';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, writeFile, rename, stat, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

// 门户模块路径：默认按部署位置解析，可用 PORTAL_MODULE_DIR 覆盖
const PORTAL_DIR = resolve(process.env.PORTAL_MODULE_DIR ?? '/data/dsh/portal');

const { COOKIE_NAME, parseCookies } = await import(`file://${join(PORTAL_DIR, 'src', 'session.mjs')}`);
const { authenticate, createAccountDirectory, sessionKeyFor } = await import(`file://${join(PORTAL_DIR, 'src', 'session-key.mjs')}`);
const { loadAccounts, loadConfig: loadPortalConfig } = await import(`file://${join(PORTAL_DIR, 'src', 'config.mjs')}`);
import { renderProduct } from '../tools/render-product.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const config = {
  bind: process.env.ADMIN_BIND ?? '127.0.0.1',
  port: Number(process.env.ADMIN_PORT ?? 3084),
  dataDir: resolve(process.env.ADMIN_DATA_DIR ?? join(root, 'data')),
  publicDir: resolve(join(root, 'public')),
  templatePath: resolve(join(root, 'tools', 'product.template.html')),
  backupDir: resolve(process.env.ADMIN_BACKUP_DIR ?? join(root, 'backups')),
  // 产品页发布目标（门户站点目录）
  publishDir: resolve(process.env.ADMIN_PUBLISH_DIR ?? '/data/dsh/portal/site/products'),
  maxBackups: Number(process.env.ADMIN_MAX_BACKUPS ?? 30),
  maxBodyBytes: 4 * 1024 * 1024,
  // 客户需求单：公开提交（无需登录），落盘为 JSONL，供管理端查看
  ordersDir: resolve(process.env.ADMIN_ORDERS_DIR ?? join(root, 'orders')),
  orderMaxPerHour: Number(process.env.ADMIN_ORDER_MAX_PER_HOUR ?? 30),
  orderMaxBytes: Number(process.env.ADMIN_ORDER_MAX_BYTES ?? 64 * 1024),
};

// 复用门户账号表与会话密钥（共享实现 session-key.mjs），使门户会话 Cookie 可直接用于管理后台。
// 不要在本文件里自行派生密钥：三个进程口径一旦错位，就会互相否定对方签发的会话。
const portalConfig = loadPortalConfig();
const { accounts } = loadAccounts(portalConfig); // 仅用于启动日志
const portalKey = sessionKeyFor(portalConfig);
// 账号可被动态增删改。只在启动时读一次会放过已停用账号，也会不认识新建账号，
// 因此按请求（带 5s TTL）重新读取账号表。
const currentAccounts = createAccountDirectory({ load: loadAccounts, config: portalConfig, ttlMs: 5000 });


function log(event, fields = {}) {
  process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), scope: 'q3-admin', event, ...fields })}\n`);
}

/* ---------------- 基础响应 ---------------- */

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "img-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body === undefined ? '' : body);
}
const sendJson = (res, status, obj, headers = {}) =>
  send(res, status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }, JSON.stringify(obj));
const sendText = (res, status, text) =>
  send(res, status, { 'Content-Type': 'text/plain; charset=utf-8' }, text);

/* ---------------- 会话与来源校验 ---------------- */

// 完整会话记录（含角色）。管理台按角色放行，而不是只看「有没有登录」——
// 引入角色前，任何已登录账号都能进管理台；角色落地后必须显式要求 admin。
function currentRecord(req) {
  const cookies = parseCookies(req.headers.cookie ?? '');
  const token = cookies.get(COOKIE_NAME);
  if (!token) return null;
  // users 传账号 Map：账号被删除/停用/改名后旧会话立即失效，不依赖 Cookie 自证
  return authenticate({ key: portalKey, token, users: currentAccounts(), now: Date.now() });
}

function currentUser(req) {
  return currentRecord(req)?.user ?? null;
}

function isAdmin(req) {
  return currentRecord(req)?.record?.role === 'admin';
}

function sameOrigin(req) {
  const host = req.headers.host;
  if (!host) return false;
  const allowed = new Set([`https://${host}`, `http://${host}`]);
  const origin = req.headers.origin;
  if (origin) return allowed.has(origin);
  const referer = req.headers.referer;
  if (referer) {
    try { return allowed.has(new URL(referer).origin); } catch { return false; }
  }
  return false;
}

/**
 * CSRF 令牌 = HMAC(会话签名密钥, "csrf:" + 会话 token)。
 * 设计取舍：不用额外 Cookie 承载令牌，避免 Path/SameSite/Secure 组合在不同浏览器与
 * HTTP 预览场景下的漏发（本项目实测该路径会导致写接口恒 403）。
 * 令牌与当前会话绑定、随会话失效而失效，且攻击者无法从跨站页面读取页面内的令牌值。
 */
function csrfTokenFor(req) {
  const cookies = parseCookies(req.headers.cookie ?? '');
  const token = cookies.get(COOKIE_NAME);
  if (!token) return null;
  const session = authenticate({ key: portalKey, token, users: accounts, now: Date.now() });
  if (!session) return null;
  return createHmac('sha256', portalKey).update('csrf:' + token).digest('base64url');
}

function csrfOk(req) {
  const expected = csrfTokenFor(req);
  const supplied = req.headers['x-csrf-token'];
  if (!expected || typeof supplied !== 'string' || supplied === '') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function ensureCsrf(req) {
  return csrfTokenFor(req);
}

/* ---------------- 数据读写 ---------------- */

const PRODUCT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function dataPath(id) {
  if (!PRODUCT_ID_RE.test(id)) return null;
  return resolve(join(config.dataDir, 'products', `${id}.json`));
}

async function readData(id) {
  const p = dataPath(id);
  if (!p) return null;
  try { return JSON.parse(await readFile(p, 'utf8')); } catch { return null; }
}

/** 原子写入：先写临时文件再 rename，避免半截 JSON 被读到 */
async function writeAtomic(target, content) {
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(tmp, content);
  await rename(tmp, target);
}

async function archive(target, id) {
  if (!existsSync(target)) return null;
  await mkdir(config.backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const name = `${id}.${stamp}.json`;
  const dest = join(config.backupDir, name);
  await writeFile(dest, await readFile(target));
  // 只保留最近 N 份
  const files = (await readdir(config.backupDir)).filter(f => f.startsWith(id + '.') && f.endsWith('.json')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - config.maxBackups))) {
    await unlink(join(config.backupDir, f)).catch(() => {});
  }
  return name;
}

/* ---------------- 数据校验 ---------------- */

const REQUIRED_TIER_FIELDS = ['id', 'name', 'group', 'speed', 'gift', 'huabu', 'flow', 'voice', 'talk', 'gw', 'test', 'full2', 'full3', 'z2', 'z3', 'low', 'tags'];
const REQUIRED_SCENE_FIELDS = ['key', 'icon', 'title', 'who', 'need', 'points', 'tiers', 'main'];

/** 结构 + 业务一致性校验；返回 {ok, errors, warnings} */
export function validateProduct(data) {
  const errors = [];
  const warnings = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };

  need(data && typeof data === 'object', '数据不是对象');
  if (!data || typeof data !== 'object') return { ok: false, errors, warnings };

  need(typeof data.id === 'string' && PRODUCT_ID_RE.test(data.id), 'id 缺失或含非法字符');
  need(data.groups && typeof data.groups === 'object', 'groups 缺失');
  need(data.universal && typeof data.universal === 'object', 'universal 缺失');
  need(Array.isArray(data.tiers) && data.tiers.length > 0, 'tiers 必须是非空数组');
  need(Array.isArray(data.scenes) && data.scenes.length > 0, 'scenes 必须是非空数组');
  need(data.tierScene && typeof data.tierScene === 'object', 'tierScene 缺失');
  need(Array.isArray(data.faq), 'faq 必须是数组');
  if (errors.length) return { ok: false, errors, warnings };

  // 档位字段完整性 + id 唯一
  const ids = new Set();
  for (const [i, t] of data.tiers.entries()) {
    for (const f of REQUIRED_TIER_FIELDS) {
      if (!(f in t)) errors.push(`tiers[${i}](${t.id ?? '?'}) 缺少字段 ${f}`);
    }
    if (ids.has(t.id)) errors.push(`tiers 中 id 重复：${t.id}`);
    ids.add(t.id);
    if (t.group && !data.groups[t.group]) errors.push(`tiers[${i}] 的 group「${t.group}」不在 groups 中`);
    if (!(t.monthly === null || (Array.isArray(t.monthly) && t.monthly.every(v => typeof v === 'number' && v > 0)))) {
      errors.push(`tiers[${i}] monthly 必须是正整数数组或 null`);
    }
    if (!Array.isArray(t.tags)) errors.push(`tiers[${i}] tags 必须是数组`);
  }

  // 场景：tiers 与 tierScene 双向一致
  const sceneKeys = new Set();
  for (const [i, s] of data.scenes.entries()) {
    for (const f of REQUIRED_SCENE_FIELDS) {
      if (!(f in s)) errors.push(`scenes[${i}](${s.key ?? '?'}) 缺少字段 ${f}`);
    }
    if (sceneKeys.has(s.key)) errors.push(`scenes 中 key 重复：${s.key}`);
    sceneKeys.add(s.key);
    if (!Array.isArray(s.tiers)) { errors.push(`scenes[${i}] tiers 必须是数组`); continue; }
    for (const id of s.tiers) {
      if (!ids.has(id)) errors.push(`场景 ${s.key} 引用了不存在的档位 ${id}`);
      else if (data.tierScene[id]?.key !== s.key) {
        errors.push(`场景 ${s.key} 含档位 ${id}，但该档 tierScene.key=${data.tierScene[id]?.key ?? '未定义'}`);
      }
    }
    if (!s.tiers.includes(s.main)) errors.push(`场景 ${s.key} 的 main「${s.main}」不在本场景 tiers 中`);
    if (s.next && (!Array.isArray(s.next) || s.next.length < 2 || !sceneKeys.has(s.next[0]))) {
      // next 可能指向尚未遍历到的场景，延后统一校验
    }
  }

  // tierScene 必须与 tiers 一一对应
  for (const id of ids) {
    const ts = data.tierScene[id];
    if (!ts) { errors.push(`tierScene 缺少档位 ${id}`); continue; }
    if (!sceneKeys.has(ts.key)) errors.push(`tierScene.${id}.key「${ts.key}」不是有效场景`);
    for (const f of ['who', 'pain', 'solve', 'fit']) {
      if (!(f in ts)) errors.push(`tierScene.${id} 缺少字段 ${f}`);
    }
    if (!Array.isArray(ts.solve)) errors.push(`tierScene.${id}.solve 必须是数组`);
    // 「※」标记必须与数据层礼包一致
    const dataHas = /※/.test(String(data.tiers.find(t => t.id === id)?.gift ?? ''));
    const sceneHas = /※/.test([...(ts.solve ?? []), ts.fit ?? ''].join(' '));
    if (dataHas !== sceneHas) {
      errors.push(`档位 ${id} 的「※」标记不一致：数据层${dataHas ? '有' : '无'}、场景层${sceneHas ? '有' : '无'}`);
    }
  }
  for (const id of Object.keys(data.tierScene)) {
    if (!ids.has(id)) errors.push(`tierScene 含多余档位 ${id}（不在 tiers 中）`);
  }

  // 场景 next 链校验
  for (const s of data.scenes) {
    if (!s.next) continue;
    if (!Array.isArray(s.next) || s.next.length < 2) { errors.push(`场景 ${s.key} 的 next 格式应为 [场景key, 提示语]`); continue; }
    if (!sceneKeys.has(s.next[0])) errors.push(`场景 ${s.key} 的 next 指向不存在的场景 ${s.next[0]}`);
  }

  // 合规提醒：原表未标注月租的档位必须保留「确认」提醒
  for (const id of Object.keys(data.tierScene)) {
    const t = data.tiers.find(x => x.id === id);
    if (t && t.monthly === null) {
      const fit = String(data.tierScene[id].fit ?? '');
      if (!/确认|未单列/.test(fit)) warnings.push(`档位 ${id} 月租未标注，建议在场景 fit 中保留「需与客户经理确认」提醒`);
    }
  }
  if (!data.faq.some(f => /选型建议|不是产品表原文/.test(String(f?.a ?? '')))) {
    warnings.push('FAQ 中未见「场景为选型建议、非产品表原文」的口径说明');
  }

  return { ok: errors.length === 0, errors, warnings };
}

/* ---------------- 客户需求单（公开提交 + 管理端查看） ---------------- */

/**
 * 需求单校验：只接受产品页真实存在的字段，全部长度受限，拒绝未知字段。
 * 返回 {ok, errors, order}。order 为归一化后的安全对象。
 */
export function validateOrder(payload, knownTierIds) {
  const errors = [];
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, errors: ['提交内容格式不正确'], order: null };
  }
  const org = str(payload.org, 120);
  const contact = str(payload.contact, 60);
  const tel = str(payload.tel, 40);
  const addr = str(payload.addr, 240);
  const pay = str(payload.pay, 40);
  const term = str(payload.term, 40);
  const note = str(payload.note, 2000);
  const addons = Array.isArray(payload.addons)
    ? payload.addons.slice(0, 12).map(v => str(v, 120)).filter(Boolean)
    : [];
  const tiers = Array.isArray(payload.tiers)
    ? payload.tiers.slice(0, 20).map(v => str(v, 60)).filter(Boolean)
    : [];
  // 2026-10-01 首页改版：新增 intent 区分入口。
  //   product —— 产品页选「意向档位」，沿用原校验口径；
  //   consult —— 首页「合作与签约」的直接意向，没有档位可选，改按业务域收集。
  // 两者选择口径不同，不能合并成同一个必填项，否则首页访客会因为"没有档位可选"而永远提交不了。
  const intent = str(payload.intent, 40) === 'consult' ? 'consult' : 'product';
  const domains = Array.isArray(payload.domains)
    ? payload.domains.slice(0, 10).map(v => str(v, 60)).filter(Boolean)
    : [];

  if (!org) errors.push('单位名称不能为空');
  if (!contact) errors.push('联系人不能为空');
  if (!tel) errors.push('联系电话不能为空');
  else if (!/^[0-9+\-()\s]{6,40}$/.test(tel)) errors.push('联系电话格式不正确');
  if (intent === 'consult') {
    if (!domains.length) errors.push('请至少选择一个想优先解决的场景');
  } else {
    if (!tiers.length) errors.push('请至少选择一个意向档位');
    for (const id of tiers) {
      if (knownTierIds && knownTierIds.size && !knownTierIds.has(id)) errors.push(`意向档位 ${id} 不存在`);
    }
  }
  if (errors.length) return { ok: false, errors, order: null };

  return {
    ok: true,
    errors: [],
    order: {
      id: randomUUID(),
      at: new Date().toISOString(),
      intent,
      org, contact, tel, addr,
      pay: pay || '待定 / 需咨询',
      term: term || '待定 / 需咨询',
      addons, tiers, domains, note,
      status: 'new',
      // 来源按入口如实记录：首页合作意向与产品页选档位是两条不同的线索来源，
      // 混记会让后续线索归因失真（首页线索被记成增值业务产品页线索）。
      source: intent === 'consult' ? 'portal/index.html' : 'portal/products/2026Q3.html',
    },
  };
}

/** 重复提交去重：同一单位+电话+档位在 10 分钟内视为同一次提交，返回既有结果 */
const orderRecent = new Map();
function orderFingerprint(o) {
  return [o.org, o.tel, [...o.tiers].sort().join(',')].join('|');
}
function rememberOrder(fp, result, now = Date.now()) {
  orderRecent.set(fp, { ...result, seenAt: now });
  if (orderRecent.size > 2000) {
    for (const [k, v] of orderRecent) if (now - v.seenAt > 10 * 60 * 1000) orderRecent.delete(k);
  }
}
function findRecentOrder(fp, now = Date.now()) {
  const hit = orderRecent.get(fp);
  if (hit && now - hit.seenAt < 10 * 60 * 1000) return hit;
  if (hit) orderRecent.delete(fp);
  return null;
}

/** 简单滑动窗口限流（进程内，按客户端 IP） */
const orderHits = new Map();
function orderRateLimited(ip, now = Date.now()) {
  const WINDOW = 3600 * 1000;
  const list = (orderHits.get(ip) ?? []).filter(t => now - t < WINDOW);
  if (list.length >= config.orderMaxPerHour) { orderHits.set(ip, list); return true; }
  list.push(now);
  orderHits.set(ip, list);
  // 防止 Map 无限增长
  if (orderHits.size > 5000) {
    for (const [k, v] of orderHits) if (!v.some(t => now - t < WINDOW)) orderHits.delete(k);
  }
  return false;
}

function clientIp(req) {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff) return xff.split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function orderFileFor(ts) {
  // 按月分文件，避免单文件无限增长
  return join(config.ordersDir, `${ts.slice(0, 7)}.jsonl`);
}

async function appendOrder(order) {
  await mkdir(config.ordersDir, { recursive: true });
  const file = orderFileFor(order.at);
  const line = JSON.stringify(order) + '\n';
  const prev = existsSync(file) ? await readFile(file, 'utf8') : '';
  await writeFile(file, prev + line);
  return file;
}

/** 读取需求单（管理端），支持按状态过滤与分页 */
async function readOrders({ status, limit = 100 } = {}) {
  if (!existsSync(config.ordersDir)) return [];
  const files = (await readdir(config.ordersDir)).filter(f => f.endsWith('.jsonl')).sort().reverse();
  const out = [];
  for (const f of files) {
    const text = await readFile(join(config.ordersDir, f), 'utf8').catch(() => '');
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line);
        if (status && o.status !== status) continue;
        out.push(o);
      } catch { /* 跳过损坏行 */ }
    }
    if (out.length >= limit) break;
  }
  // 最新在前
  out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  return out.slice(0, limit);
}

/** 更新需求单状态（管理端）：按 id 重写所在文件 */
async function updateOrderStatus(id, status) {
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return null;
  if (!['new', 'contacted', 'won', 'lost'].includes(status)) return null;
  if (!existsSync(config.ordersDir)) return null;
  const files = (await readdir(config.ordersDir)).filter(f => f.endsWith('.jsonl'));
  for (const f of files) {
    const p = join(config.ordersDir, f);
    const text = await readFile(p, 'utf8').catch(() => '');
    const lines = text.split('\n');
    let hit = null;
    const next = lines.map(line => {
      if (!line.trim()) return line;
      try {
        const o = JSON.parse(line);
        if (o.id === id) { hit = { ...o, status, updatedAt: new Date().toISOString() }; return JSON.stringify(hit); }
      } catch { /* 保留原行 */ }
      return line;
    });
    if (hit) {
      await writeFile(p, next.join('\n'));
      return hit;
    }
  }
  return null;
}

/* ---------------- 路由 ---------------- */

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > config.maxBodyBytes) throw new Error('body too large');
    chunks.push(c);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function serveStatic(res, name, type) {
  const p = resolve(join(config.publicDir, name));
  if (!p.startsWith(config.publicDir)) return sendText(res, 404, 'Not found');
  try {
    const buf = await readFile(p);
    return send(res, 200, { 'Content-Type': type, 'Cache-Control': 'no-cache' }, buf);
  } catch { return sendText(res, 404, 'Not found'); }
}

async function route(req, res) {
  const url = new URL(req.url ?? '/', 'http://admin.local');
  const path = decodeURIComponent(url.pathname);
  const method = req.method ?? 'GET';

  // 管理台静态资源与页面：要求登录 **且为管理员**，避免普通账号探测或改动管理台内容
  if (method === 'GET' && (path === '/portal/admin' || path === '/portal/admin/')) {
    const user = currentUser(req);
    if (!user) return redirectToLogin(req, res);
    // 已登录但非管理员：不能回登录页（会绕圈），直接明确拒绝
    if (!isAdmin(req)) return sendText(res, 403, '需要管理员权限');
    const csrf = ensureCsrf(req);
    const html = (await readFile(join(config.publicDir, 'admin.html'), 'utf8'))
      .replace('{{CSRF}}', csrf)
      .replace('{{USER}}', escapeHtml(user));
    return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, html);
  }
  if (method === 'GET' && (path === '/portal/admin/admin.js' || path === '/portal/admin/admin.css')) {
    if (!currentUser(req)) return redirectToLogin(req, res);
    if (!isAdmin(req)) return sendText(res, 403, '需要管理员权限');
    return path.endsWith('.js')
      ? serveStatic(res, 'admin.js', 'text/javascript; charset=utf-8')
      : serveStatic(res, 'admin.css', 'text/css; charset=utf-8');
  }

  // 公开端点：客户在线提交需求单（无需登录）。
  // 保护：同源校验 + 字段白名单校验 + 按 IP 限流 + 体积上限；不写入任何凭据。
  if (method === 'POST' && path === '/api/admin/orders') {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'bad_origin' });
    let raw;
    try { raw = await readBody(req, config.orderMaxBytes); }
    catch { return sendJson(res, 413, { ok: false, error: 'too_large' }); }
    let payload;
    try { payload = JSON.parse(raw); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }

    // 用当前产品的真实档位 id 校验，避免脏数据
    let known = new Set();
    try {
      const prod = await readData('2026Q3');
      if (prod) known = new Set(prod.tiers.map(t => t.id));
    } catch { /* 无产品数据时跳过存在性校验 */ }

    const result = validateOrder(payload, known);
    if (!result.ok) return sendJson(res, 422, { ok: false, error: 'invalid', errors: result.errors });

    // 去重优先于限流：客户连点或网络重试不应被当作刷单，也不重复落盘
    const fp = orderFingerprint(result.order);
    const dup = findRecentOrder(fp);
    if (dup) {
      log('order.duplicate', { id: dup.id });
      return sendJson(res, 200, { ok: true, id: dup.id, at: dup.at, duplicate: true });
    }

    const ip = clientIp(req);
    if (orderRateLimited(ip)) {
      log('order.ratelimited', { ip: ip.slice(0, 12) });
      return sendJson(res, 429, { ok: false, error: 'too_many_requests', message: '提交过于频繁，请稍后再试或直接联系客户经理。' });
    }

    try {
      await appendOrder(result.order);
    } catch (e) {
      log('order.write_failed', { message: String(e?.message ?? e) });
      return sendJson(res, 500, { ok: false, error: 'write_failed' });
    }
    rememberOrder(fp, { id: result.order.id, at: result.order.at });
    // 日志不落手机号明文
    log('order.created', { id: result.order.id, tiers: result.order.tiers.length, telTail: String(result.order.tel).slice(-4) });
    return sendJson(res, 200, { ok: true, id: result.order.id, at: result.order.at });
  }

  if (!path.startsWith('/api/admin/')) return sendText(res, 404, 'Not found');

  // 以下均要求登录，并且必须是管理员
  const user = currentUser(req);
  if (!user) return sendJson(res, 401, { ok: false, error: 'unauthorized' });
  if (!isAdmin(req)) return sendJson(res, 403, { ok: false, error: 'forbidden' });

  // 写操作额外要求同源 + CSRF
  const isWrite = method !== 'GET' && method !== 'HEAD';
  if (isWrite) {
    if (!sameOrigin(req)) return sendJson(res, 403, { ok: false, error: 'bad_origin' });
    if (!csrfOk(req)) return sendJson(res, 403, { ok: false, error: 'bad_csrf' });
  }

  const api = path.slice('/api/admin/'.length);

  if (method === 'GET' && api === 'session') {
    return sendJson(res, 200, { ok: true, user });
  }

  // 管理端：客户需求单列表（可按状态过滤）
  if (method === 'GET' && api === 'orders') {
    const status = url.searchParams.get('status') || '';
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 100) || 100, 500);
    const orders = await readOrders({ status, limit });
    const counts = { new: 0, contacted: 0, won: 0, lost: 0 };
    for (const o of await readOrders({ limit: 1000 })) counts[o.status] = (counts[o.status] ?? 0) + 1;
    return sendJson(res, 200, { ok: true, orders, counts, total: Object.values(counts).reduce((a, b) => a + b, 0) });
  }

  // 管理端：更新需求单跟进状态
  const om = api.match(/^orders\/([A-Za-z0-9-]{8,64})\/status$/);
  if (method === 'POST' && om) {
    let payload;
    try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
    const updated = await updateOrderStatus(om[1], String(payload?.status ?? ''));
    if (!updated) return sendJson(res, 404, { ok: false, error: 'not_found_or_bad_status' });
    log('order.status', { id: om[1], status: updated.status, user });
    return sendJson(res, 200, { ok: true, order: updated });
  }

  if (method === 'GET' && api === 'products') {
    const files = existsSync(join(config.dataDir, 'products'))
      ? (await readdir(join(config.dataDir, 'products'))).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''))
      : [];
    return sendJson(res, 200, { ok: true, products: files });
  }

  const m = api.match(/^products\/([A-Za-z0-9._-]+)(?:\/(validate|render|publish|history|rollback))?$/);
  if (m) {
    const [, id, action] = m;
    const target = dataPath(id);
    if (!target) return sendJson(res, 400, { ok: false, error: 'bad_id' });

    if (method === 'GET' && !action) {
      const data = await readData(id);
      if (!data) return sendJson(res, 404, { ok: false, error: 'not_found' });
      return sendJson(res, 200, { ok: true, data });
    }

    if (method === 'POST' && action === 'validate') {
      let payload;
      try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
      const data = payload?.data ?? payload;
      const result = validateProduct(data);
      return sendJson(res, 200, { ok: result.ok, errors: result.errors, warnings: result.warnings });
    }

    if (method === 'POST' && action === 'render') {
      let payload;
      try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
      const data = payload?.data ?? payload;
      const result = validateProduct(data);
      if (!result.ok) return sendJson(res, 422, { ok: false, error: 'invalid', errors: result.errors, warnings: result.warnings });
      try {
        const html = renderProduct(data, { templatePath: config.templatePath });
        return sendJson(res, 200, { ok: true, bytes: Buffer.byteLength(html), html });
      } catch (e) {
        return sendJson(res, 500, { ok: false, error: 'render_failed', message: String(e?.message ?? e) });
      }
    }

    if (method === 'POST' && action === 'publish') {
      let payload;
      try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
      const data = payload?.data ?? payload;
      const result = validateProduct(data);
      if (!result.ok) return sendJson(res, 422, { ok: false, error: 'invalid', errors: result.errors, warnings: result.warnings });

      let html;
      try { html = renderProduct(data, { templatePath: config.templatePath }); }
      catch (e) { return sendJson(res, 500, { ok: false, error: 'render_failed', message: String(e?.message ?? e) }); }

      // 归档旧数据与新数据快照，再落盘
      const archived = await archive(target, id).catch(() => null);
      await writeAtomic(target, JSON.stringify(data, null, 2) + '\n');

      const publishTarget = resolve(join(config.publishDir, `${id}.html`));
      let published = false;
      try {
        await archive(resolve(join(config.publishDir, `${id}.html.archived`)), `${id}.html`).catch(() => {});
        await writeAtomic(publishTarget, html);
        published = true;
      } catch (e) {
        log('publish.failed', { id, message: String(e?.message ?? e) });
        return sendJson(res, 500, { ok: false, error: 'publish_failed', message: String(e?.message ?? e), saved: true });
      }

      log('publish.ok', { id, user, bytes: Buffer.byteLength(html), archived });
      return sendJson(res, 200, { ok: true, bytes: Buffer.byteLength(html), published, archived, warnings: result.warnings });
    }

    if (method === 'GET' && action === 'history') {
      const files = existsSync(config.backupDir)
        ? (await readdir(config.backupDir)).filter(f => f.startsWith(id + '.') && f.endsWith('.json')).sort().reverse()
        : [];
      const items = [];
      for (const f of files.slice(0, 20)) {
        const s = await stat(join(config.backupDir, f)).catch(() => null);
        items.push({ name: f, bytes: s?.size ?? 0, at: s?.mtime?.toISOString?.() ?? null });
      }
      return sendJson(res, 200, { ok: true, history: items });
    }

    if (method === 'POST' && action === 'rollback') {
      let payload;
      try { payload = JSON.parse(await readBody(req)); } catch { return sendJson(res, 400, { ok: false, error: 'bad_json' }); }
      const name = String(payload?.name ?? '');
      if (!name.startsWith(id + '.') || !name.endsWith('.json') || name.includes('/') || name.includes('..')) {
        return sendJson(res, 400, { ok: false, error: 'bad_name' });
      }
      const src = join(config.backupDir, name);
      if (!existsSync(src)) return sendJson(res, 404, { ok: false, error: 'not_found' });
      const data = JSON.parse(await readFile(src, 'utf8'));
      const result = validateProduct(data);
      if (!result.ok) return sendJson(res, 422, { ok: false, error: 'invalid_backup', errors: result.errors });
      const html = renderProduct(data, { templatePath: config.templatePath });
      await archive(target, id).catch(() => {});
      await writeAtomic(target, JSON.stringify(data, null, 2) + '\n');
      await writeAtomic(resolve(join(config.publishDir, `${id}.html`)), html);
      log('rollback.ok', { id, user, name });
      return sendJson(res, 200, { ok: true, restored: name, bytes: Buffer.byteLength(html) });
    }

    return sendJson(res, 405, { ok: false, error: 'method_not_allowed' });
  }

  return sendJson(res, 404, { ok: false, error: 'not_found' });
}

function redirectToLogin(req, res) {
  const next = encodeURIComponent('/portal/admin');
  return send(res, 302, { Location: `/login?next=${next}` }, '');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const server = createServer((req, res) => {
  route(req, res).catch((e) => {
    log('request.error', { path: req.url, message: String(e?.message ?? e) });
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'internal' });
    else res.end();
  });
});

server.listen(config.port, config.bind, () => {
  log('listening', {
    bind: config.bind, port: config.port, accounts: accounts.size,
    dataDir: config.dataDir, publishDir: config.publishDir, cookieSecure: portalConfig.cookieSecure,
  });
});
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { log('stopping', { signal: s }); server.close(() => process.exit(0)); });
