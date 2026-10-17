// WorkDSH 企业门户与登录门禁服务。
// 部署边缘面：只提供门户静态页、登录/退出与 /api/portal/auth（供 Caddy forward_auth 使用）。
// 不注册 Agent 工具、不代理应用流量、不写业务数据、不做任何业务授权判断。
import { createServer, request as httpRequest } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { loadAccounts, loadConfig } from './config.mjs';
import {
  COOKIE_NAME,
  LoginThrottle,
  clearedCookie,
  issueSession,
  normalizeCredential,
  parseCookies,
  safeNext,
  sessionCookie,
} from './session.mjs';
import { authenticate, sessionKeyFor } from './session-key.mjs';
import { loginView, readLoginInfo, recordLogin } from './login-info.mjs';
import { loadOrCreateBridgeSecret, signedIdentityHeaders } from './identity-bridge.mjs';
// 签名算法只有一份：门户与 `workdsh-contracts/portal-identity` 同源（见 identity-bridge.mjs 顶部说明）。
import { computePortalSignature } from './portal-identity.mjs';
import {
  MIN_PASSWORD_LENGTH,
  ROLES,
  STATES,
  hashPassword,
  publicView,
  verifyRecord,
  writeUserStore,
} from './users.mjs';
import {
  JOB_ROLE_UNASSIGNED,
  capabilityCatalog,
  effectiveCapabilities,
  jobRoleCatalog,
  normalizeJobRole,
} from './roles.mjs';
// HANDBOOK_ADMIN_V1：手册管理后台（内容仓库 + 管理 API + 公开内容 API）。
// 自包含模块，只通过 handleHandbook(req,res,ctx) 取用会话与鉴权上下文。
import { handleHandbook, isHandbookPath } from './handbook.mjs';

const config = loadConfig();
const { accounts, warnings: accountWarnings } = loadAccounts(config);
const throttle = new LoginThrottle(config.throttle);
const accountsConfigured = () => accounts.size > 0;

// 会话签名密钥与会话校验都走共享实现（session-key.mjs）：
// 门户、产品页后台、增值业务后台三个进程必须用同一口径，否则会互相否定对方签发的会话。
const key = sessionKeyFor(config, {
  warn: (message) => log('warning', { scope: 'session-key', message }),
});

// P1 身份桥共享密钥：签发身份头用，与 DSH 侧 workdsh-identity-portal 插件共用同一文件。
// 创建/读取失败不阻断门户——DSH 侧会退回兜底主体（与启用身份桥之前的行为一致）。
const bridgeSecret = loadOrCreateBridgeSecret(config.identityBridgeKeyFile, log);

// 登录台账：内存快照 + 原子落盘。写失败只告警，绝不影响登录本身。
let loginInfo = readLoginInfo(config.loginInfoFile);
function noteLogin({ username, ip, ok }) {
  try {
    loginInfo = recordLogin(config.loginInfoFile, loginInfo, {
      username,
      ip,
      ok,
      at: new Date().toISOString(),
    });
  } catch (error) {
    log('warning', { scope: 'login-info', message: String(error?.message ?? error) });
  }
}

// 所有用户表变更都经这里落盘：内存与磁盘不会分叉。
function persistUsers() {
  writeUserStore(config.usersFile, [...accounts.values()]);
}

function isAdminSession(session) {
  return session?.record?.role === 'admin';
}

// 用户表变更后的统一收尾：更新 updatedAt 并立即落盘。
function touchRecord(record, by) {
  record.updatedAt = new Date().toISOString();
  if (by) record.createdBy = record.createdBy ?? by;
}

// 缓存策略与安全头分离。此前 no-store 被合并进每一个响应，连图片一起，导致每次访问都要重下门户全部素材。
const CACHE_HTML = 'no-cache'; // 可复用但每次必须回源校验：配合 ETag 拿 304，且绝不陈旧。
const CACHE_CODE = 'no-cache'; // 站内 CSS/JS 文件名无内容指纹，禁用盲缓存：一律回源校验，命中即 304。
const CACHE_ASSET = 'public, max-age=604800'; // 图片素材文件名固定、内容极少变动，给 7 天。

const SITE_FILES = new Map([
  ['/portal/styles.css', ['styles.css', 'text/css; charset=utf-8', CACHE_CODE]],
  ['/portal/portal.js', ['portal.js', 'text/javascript; charset=utf-8', CACHE_CODE]],
]);

// 门户首页与登录页都按 CACHE_HTML 处理：必须回源校验，因此不会出现陈旧页面。
const INDEX_HTML = ['index.html', 'text/html; charset=utf-8', CACHE_HTML];

// 公开产品资料页（/portal/products/<name>.html）。
// 这些页面是单文件自包含站点（内联样式与脚本），因此仅对该路径放宽 CSP。
const PRODUCT_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/;
const PRODUCT_CSP = [
  "default-src 'none'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  // 自托管视频：手册自由画布页可内嵌本站图库里的 mp4/webm。只放行同源，
  // 第三方视频（含 iframe 播放器）依旧不可用 —— 没有 frame-src。
  "media-src 'self'",
  // 产品页可在线提交需求单，故允许同源请求（仅发往本站 /api/portal/orders，不发往任何第三方）
  "connect-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join('; ');

const ASSET_TYPES = new Map([
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.mp4', 'video/mp4'],
]);

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'none'",
    "img-src 'self'",
    "style-src 'self'",
    "script-src 'self'",
    // 2026-10-01 首页改版新增：首页的合作意向表单要 POST 到本站 /api/portal/orders。
    // 此前没有 connect-src，它回落到 default-src 'none'，fetch 会被浏览器直接拦掉，
    // 表单点了没有任何反应。这里只放开同源，不发往任何第三方（与产品页同口径）。
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  // 默认不可缓存：接口、跳转与错误页一律走最保守策略。
  // 只有静态页面与素材由 sendConditional 显式传入 Cache-Control 覆盖此处（见 CACHE_* 常量）。
  'Cache-Control': 'no-store',
};

function log(event, fields) {
  process.stderr.write(`${JSON.stringify({ at: new Date().toISOString(), scope: 'workdsh-portal', event, ...fields })}\n`);
}

function send(res, status, headers, body) {
  const payload = body === undefined ? '' : body;
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(payload);
}

// ETag 取自响应正文本身：静态文件与登录页（正文含注入的错误提示与回跳地址）用同一套判据，无需额外维护版本号。
function etagOf(buffer) {
  return `"${createHash('sha1').update(buffer).digest('base64url')}"`;
}

function matchesIfNoneMatch(header, etag) {
  if (typeof header !== 'string' || header === '') return false;
  return header.split(',').some((token) => {
    const value = token.trim();
    // GET 上是弱比较：客户端把强 ETag 回写成 W/"..." 也应命中。
    return value === '*' || value.replace(/^W\//, '') === etag;
  });
}

// 静态页面与素材的统一出口：命中条件请求时只回 304，不传正文。
// headers 用于覆盖安全头中的单条（目前只有产品页要放宽 CSP）。
function sendConditional(req, res, { type, cacheControl, body, headers = {} }) {
  const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '');
  const etag = etagOf(buffer);
  if (matchesIfNoneMatch(req.headers['if-none-match'], etag)) {
    return send(res, 304, { ...headers, 'Cache-Control': cacheControl, ETag: etag }, '');
  }
  return send(res, 200, { ...headers, 'Content-Type': type, 'Cache-Control': cacheControl, ETag: etag }, buffer);
}

function sendText(res, status, text) {
  send(res, status, { 'Content-Type': 'text/plain; charset=utf-8' }, text);
}

function redirect(res, status, location) {
  send(res, status, { Location: location }, '');
}

function clientIp(req) {
  // 门户经 Cloudflare 隧道进入时，Caddy 的 X-Forwarded-For 恒为隧道所在主机的地址，
  // 与真实终端无关——直接用它会让限流退化成「全站共用一个桶」，一个人失败十次就锁住所有人。
  // CF 会在边缘注入 cf-connecting-ip，优先取它；无 CF 的场景再回退到转发头与套接字地址。
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim() !== '') return cf.trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded !== '') return forwarded.split(',')[0].trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real !== '') return real.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

// 会话校验走共享实现：签名有效 → 用户仍存在 → 仍为 active → 签发时间晚于该用户最后一次变更。
function currentSession(req, now) {
  const token = parseCookies(req.headers.cookie).get(COOKIE_NAME);
  return authenticate({ key, token, users: accounts, now });
}

// 登录失败时只登记输入的形态（长度、是否含全角字符或首尾空白），不落任何凭据内容：
// 「看起来一样、字节不同」的输入是登录失败最常见的一类原因，形态足以判定。
function credentialShape({ username, password }) {
  const raw = typeof password === 'string' ? password : '';
  return {
    pwLength: raw.length,
    pwFullWidth: /[\uff01-\uff5e\u3000]/.test(raw),
    usernameNormalized: normalizeCredential(username) !== username,
  };
}

async function readBody(req, limit = 8192) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('body too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function loginFields(req) {
  const type = String(req.headers['content-type'] ?? '');
  const raw = await readBody(req);
  // 字段集合同时服务登录、注册与管理员用户管理：后两者还需要 password2/invite/role/state。
  // 这里必须覆盖所有会被下游读取的字段——漏掉一个，对应参数就会被静默忽略。
  if (type.includes('application/json')) {
    const parsed = JSON.parse(raw === '' ? '{}' : raw);
    const get = (key) => String(parsed?.[key] ?? '');
    return {
      username: get('username'),
      password: get('password'),
      password2: get('password2'),
      invite: get('invite'),
      role: get('role'),
      jobRole: get('jobRole'),
      state: get('state'),
      next: get('next'),
    };
  }
  const form = new URLSearchParams(raw);
  return {
    username: form.get('username') ?? '',
    password: form.get('password') ?? '',
    password2: form.get('password2') ?? '',
    invite: form.get('invite') ?? '',
    role: form.get('role') ?? '',
    jobRole: form.get('jobRole') ?? '',
    state: form.get('state') ?? '',
    next: form.get('next') ?? '',
  };
}

async function serveSiteFile(req, res, entry) {
  const [name, type, cacheControl] = entry;
  sendConditional(req, res, { type, cacheControl, body: await readFile(join(config.siteDir, name)) });
}

// 登录页在服务端注入错误提示与回跳地址：禁用 JavaScript 时表单仍可提交并看到结果。
const LOGIN_ERRORS = new Map([
  ['credentials', '用户名或密码不正确。'],
  ['missing', '请填写用户名和密码。'],
  ['throttled', '尝试次数过多，请稍后再试。'],
  ['unconfigured', '本站尚未完成登录配置，请联系管理员。'],
  ['malformed', '请求格式不正确，请重试。'],
  ['disabled', '该账号已被停用，请联系管理员。'],
  ['pending', '该账号正在等待管理员审核。'],
  ['register-closed', '本站当前未开放注册。'],
  ['register-invite', '邀请码不正确。'],
  ['register-exists', '该用户名已被占用。'],
  ['register-weak', `密码至少需要 ${MIN_PASSWORD_LENGTH} 位。`],
  ['register-invalid', '用户名或密码不符合要求。'],
  ['forbidden', '当前账号没有执行该操作的权限。'],
]);

// 成功类提示与错误分开渲染，避免用红色错误样式报「注册成功」。
const LOGIN_NOTICES = new Map([
  ['registered', '注册成功，请使用新账号登录。'],
  ['deleted', '账号已删除。'],
]);

function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => map[char]);
}

// 提示块统一出口：错误用红色 alert，成功/中性用绿色 status，避免用错误样式报「注册成功」。
function alertBlock(kind, message) {
  if (!message) return '';
  const cls = kind === 'notice' ? 'form-notice' : 'form-error';
  const role = kind === 'notice' ? 'status' : 'alert';
  return `<p class="${cls}" role="${role}">${escapeHtml(message)}</p>`;
}

async function renderLogin(req, res, { error, notice, next }) {
  const template = await readFile(join(config.siteDir, 'login.html'), 'utf8');
  const registerSlot = config.registration === 'closed'
    ? ''
    : '<p class="auth-back">还没有账号？<a href="/register">注册新账号</a></p>';
  const body = template
    .replace('{{NOTICE}}', alertBlock('notice', LOGIN_NOTICES.get(notice)))
    .replace('{{ERROR}}', alertBlock('error', LOGIN_ERRORS.get(error)))
    .replace('{{REGISTER}}', registerSlot)
    .replace('{{NEXT}}', escapeHtml(safeNext(next)));
  sendConditional(req, res, { type: 'text/html; charset=utf-8', cacheControl: CACHE_HTML, body });
}

async function renderRegister(req, res, { error, notice, next }) {
  if (config.registration === 'closed') return redirect(res, 303, '/login?error=register-closed');
  const template = await readFile(join(config.siteDir, 'register.html'), 'utf8');
  const inviteSlot = config.registration === 'invite'
    ? '<div class="field"><label for="invite">邀请码</label><input id="invite" name="invite" type="text" autocomplete="off" required spellcheck="false"></div>'
    : '';
  const policy = config.registration === 'invite'
    ? `本站当前为邀请注册，需填写管理员发放的邀请码。密码至少 ${config.minPasswordLength} 位。`
    : `本站当前开放注册。密码至少 ${config.minPasswordLength} 位。`;
  const body = template
    .replace('{{NOTICE}}', alertBlock('notice', LOGIN_NOTICES.get(notice)))
    .replace('{{ERROR}}', alertBlock('error', LOGIN_ERRORS.get(error)))
    .replace('{{INVITE}}', inviteSlot)
    .replace('{{POLICY}}', escapeHtml(policy))
    .replace('{{NEXT}}', escapeHtml(safeNext(next)));
  sendConditional(req, res, { type: 'text/html; charset=utf-8', cacheControl: CACHE_HTML, body });
}

// 产品页正文含套餐与价格，按 HTML 档处理：改版后立即生效（no-cache 强制回源校验）且未改时拿 304。
async function serveProductPage(req, res, requestPath) {
  const name = requestPath.slice('/portal/products/'.length);
  if (!PRODUCT_NAME_RE.test(name) || name.includes('..')) return sendText(res, 404, 'Not found');
  const base = resolve(config.siteDir, 'products');
  const target = resolve(base, name);
  if (!target.startsWith(base + sep)) return sendText(res, 404, 'Not found');
  try {
    if (!(await stat(target)).isFile()) return sendText(res, 404, 'Not found');
    sendConditional(req, res, {
      type: 'text/html; charset=utf-8',
      cacheControl: CACHE_HTML,
      headers: { 'Content-Security-Policy': PRODUCT_CSP },
      body: await readFile(target),
    });
  } catch {
    sendText(res, 404, 'Not found');
  }
}

async function serveAsset(req, res, requestPath) {
  const name = requestPath.slice('/portal/assets/'.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name.includes('..')) return sendText(res, 404, 'Not found');
  const type = ASSET_TYPES.get(extname(name).toLowerCase());
  if (!type) return sendText(res, 404, 'Not found');
  const target = resolve(config.assetsDir, name);
  if (!target.startsWith(config.assetsDir + sep)) return sendText(res, 404, 'Not found');
  try {
    if (!(await stat(target)).isFile()) return sendText(res, 404, 'Not found');
    sendConditional(req, res, { type, cacheControl: CACHE_ASSET, body: await readFile(target) });
  } catch {
    sendText(res, 404, 'Not found');
  }
}

async function handleLogin(req, res) {
  const ip = clientIp(req);
  const now = Date.now();
  const wantsJson = String(req.headers.accept ?? '').includes('application/json');
  let fields;
  try {
    fields = await loginFields(req);
  } catch {
    return wantsJson ? send(res, 400, { 'Content-Type': 'application/json' }, '{"ok":false,"error":"malformed"}') : redirect(res, 303, '/login?error=malformed');
  }
  const next = safeNext(fields.next, '/');

  if (throttle.blocked(ip, now)) {
    log('login.blocked', { ip, user: fields.username, next });
    return wantsJson
      ? send(res, 429, { 'Content-Type': 'application/json' }, '{"ok":false,"error":"throttled"}')
      : redirect(res, 303, `/login?error=throttled&next=${encodeURIComponent(next)}`);
  }
  if (!accountsConfigured()) {
    log('login.rejected', { ip, reason: 'credentials-unconfigured' });
    return wantsJson
      ? send(res, 503, { 'Content-Type': 'application/json' }, '{"ok":false,"error":"unconfigured"}')
      : redirect(res, 303, `/login?error=unconfigured&next=${encodeURIComponent(next)}`);
  }
  if (fields.username === '' || fields.password === '') {
    return wantsJson
      ? send(res, 401, { 'Content-Type': 'application/json' }, '{"ok":false,"error":"missing"}')
      : redirect(res, 303, `/login?error=missing&next=${encodeURIComponent(next)}`);
  }

  // 用户名与口令都先归一化再比对（见 session.mjs）：全角符号与首尾空白不再造成「看着一样却登不上」。
  // 口令校验按记录形态分发：迁移期间明文（环境变量主账号）与 scrypt 哈希并存。
  const user = normalizeCredential(fields.username);
  const record = accounts.get(user);
  const passwordOk = await verifyRecord(fields.password, record);
  if (!record || !passwordOk) {
    throttle.fail(ip, now);
    // 只给「确实存在的账号」记失败：否则任意伪造用户名都能把台账撑大。
    if (record) noteLogin({ username: user, ip, ok: false });
    log('login.failed', { ip, user, ...credentialShape(fields) });
    return wantsJson
      ? send(res, 401, { 'Content-Type': 'application/json' }, '{"ok":false,"error":"credentials"}')
      : redirect(res, 303, `/login?error=credentials&next=${encodeURIComponent(next)}`);
  }
  // 停用与待审账号口令正确也不放行：状态是管理员的显式决定。
  if (record.state !== 'active') {
    throttle.fail(ip, now);
    log('login.rejected', { ip, user, reason: `state-${record.state}` });
    return wantsJson
      ? send(res, 403, { 'Content-Type': 'application/json' }, `{"ok":false,"error":"${record.state}"}`)
      : redirect(res, 303, `/login?error=${record.state}&next=${encodeURIComponent(next)}`);
  }

  const { token, expiresAt } = issueSession({ key, user, now, ttlMs: config.sessionTtlMs });
  throttle.reset(ip);
  noteLogin({ username: user, ip, ok: true });
  log('login.succeeded', { ip, user });
  return wantsJson
    ? send(res, 200, { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie({ token, maxAgeMs: expiresAt - now, secure: config.cookieSecure }) }, JSON.stringify({ ok: true, user, redirect: next }))
    : send(res, 303, { Location: next, 'Set-Cookie': sessionCookie({ token, maxAgeMs: expiresAt - now, secure: config.cookieSecure }) }, '');
}

function handleLogout(req, res) {
  log('logout', { ip: clientIp(req) });
  send(res, 303, { Location: '/portal', 'Set-Cookie': clearedCookie({ secure: config.cookieSecure }) }, '');
}

/* ------------------------------------------------------------------ *
 * 账号生命周期（P1）：自助注册 + 管理员用户管理。
 * 这一层只回答「谁能进站、以什么角色进站」；业务侧资源授权在 Host 内另有其层。
 * ------------------------------------------------------------------ */

const USERNAME_RE = /^[A-Za-z0-9._-]{3,64}$/;

function jsonOut(res, status, obj) {
  send(res, status, { 'Content-Type': 'application/json' }, JSON.stringify(obj));
}

function countActiveAdmins() {
  let count = 0;
  for (const record of accounts.values()) {
    if (record.role === 'admin' && record.state === 'active') count += 1;
  }
  return count;
}

// 管理员接口统一入口校验：非管理员一律 403，并留一条审计日志。
function requireAdmin(session, res, action) {
  if (isAdminSession(session)) return true;
  log('admin.rejected', { user: session?.user ?? null, action, reason: 'not-admin' });
  jsonOut(res, 403, { ok: false, error: 'forbidden' });
  return false;
}

// 落盘失败必须回滚内存，否则磁盘与内存分叉，重启后行为突变。
function commitOrRollback(res, undo, action, user) {
  try {
    persistUsers();
    return true;
  } catch (error) {
    undo();
    log('users.persist-failed', { action, user, message: String(error?.message ?? error) });
    jsonOut(res, 500, { ok: false, error: 'persist-failed' });
    return false;
  }
}

async function handleRegister(req, res) {
  const ip = clientIp(req);
  const now = Date.now();
  const wantsJson = String(req.headers.accept ?? '').includes('application/json');
  const fail = (code, status = 400) => {
    throttle.fail(ip, now);
    log('register.rejected', { ip, reason: code });
    return wantsJson ? jsonOut(res, status, { ok: false, error: code }) : redirect(res, 303, `/register?error=${code}`);
  };

  if (config.registration === 'closed') return fail('register-closed', 403);
  // 注册接口与登录共用一个限流桶：两边都是「口令猜测面」。
  if (throttle.blocked(ip, now)) {
    return wantsJson ? jsonOut(res, 429, { ok: false, error: 'throttled' }) : redirect(res, 303, '/login?error=throttled');
  }

  let fields;
  try {
    fields = await loginFields(req);
  } catch {
    return fail('malformed');
  }

  if (config.registration === 'invite') {
    const supplied = normalizeCredential(fields.invite);
    if (config.inviteCode === '') {
      // 邀请码未配置时不得退化成开放注册——按失败关闭。
      log('register.rejected', { ip, reason: 'invite-code-unconfigured' });
      return fail('register-closed', 403);
    }
    if (supplied === '' || supplied !== config.inviteCode) return fail('register-invite', 403);
  }

  const username = normalizeCredential(fields.username);
  const password = String(fields.password ?? '');
  if (username === '' || password === '' || fields.password !== fields.password2) return fail('register-invalid');
  if (!USERNAME_RE.test(username)) return fail('register-invalid');
  if (normalizeCredential(password).length < config.minPasswordLength) return fail('register-weak');
  if (accounts.has(username)) return fail('register-exists', 409);

  let stored;
  try {
    stored = await hashPassword(password);
  } catch {
    return fail('register-invalid');
  }

  const stamp = new Date().toISOString();
  const record = {
    username,
    role: 'user',
    state: 'active',
    verify: { kind: 'scrypt', stored },
    source: config.usersFile,
    createdAt: stamp,
    createdBy: username,
    updatedAt: stamp,
  };
  accounts.set(username, record);
  if (!commitOrRollback(res, () => accounts.delete(username), 'register', username)) return undefined;

  throttle.reset(ip);
  log('register.succeeded', { ip, user: username });
  return wantsJson
    ? jsonOut(res, 201, { ok: true, user: username })
    : redirect(res, 303, '/login?notice=registered');
}

function handleMe(req, res, session) {
  if (!session) return jsonOut(res, 401, { ok: false, error: 'unauthenticated' });
  const jobRole = normalizeJobRole(session.record.jobRole);
  return jsonOut(res, 200, {
    ok: true,
    user: session.user,
    role: session.record.role,
    jobRole,
    capabilities: effectiveCapabilities({ role: session.record.role, jobRole }),
    state: session.record.state,
    expiresAt: session.expiresAt,
    registration: config.registration,
  });
}

/**
 * 角色与权限目录。任何已登录账号都可读——「我有哪些权限」必须是本人可见的，
 * 这本身不泄露他人信息；管理视图所需的账号列表另有 requireAdmin 把关。
 */
function handleRoles(req, res, session) {
  if (!session) return jsonOut(res, 401, { ok: false, error: 'unauthenticated' });
  const jobRole = normalizeJobRole(session.record.jobRole);
  return jsonOut(res, 200, {
    ok: true,
    roles: jobRoleCatalog(),
    capabilities: capabilityCatalog(),
    mine: {
      username: session.user,
      role: session.record.role,
      jobRole,
      capabilities: effectiveCapabilities({ role: session.record.role, jobRole }),
    },
  });
}

/**
 * 资源授权管理（A 方案缺口 1）：门户替登录用户**带签名**转发到 DSH 的 workdsh-grant-admin。
 *
 * 门户在这里只做两件事：校验会话与管理员门槛、把"你是谁"用共享密钥签好。
 * **真正的授权判定发生在 DSH 访问层**——否则就会出现第二套权限口径，
 * 而"谁能不能管这个资源"只有一个真源。
 */
async function handleGrantProxy(req, res, session, subpath) {
  if (bridgeSecret === null) return jsonOut(res, 503, { ok: false, error: 'bridge-unavailable' });
  const target = { '': '/summary', '/apply': '/apply', '/revoke': '/revoke' }[subpath];
  if (target === undefined) return jsonOut(res, 404, { ok: false, error: 'not-found' });
  const method = target === '/summary' ? 'GET' : 'POST';
  if (req.method !== method) return send(res, 405, { Allow: method }, '');

  let raw = '';
  if (method === 'POST') {
    try {
      raw = await readBody(req);
    } catch {
      return jsonOut(res, 400, { ok: false, error: 'malformed' });
    }
  }

  const headers = signedIdentityHeaders(bridgeSecret, {
    user: session.user,
    role: session.record.role,
    jobRole: normalizeJobRole(session.record.jobRole),
    expires: session.expiresAt,
  });
  if (headers === null) return jsonOut(res, 503, { ok: false, error: 'bridge-unavailable' });

  try {
    const upstream = await fetch(`${config.dshOrigin}/workdsh-grant-admin${target}`, {
      method,
      headers: { ...headers, ...(raw ? { 'content-type': 'application/json' } : {}) },
      body: raw || undefined,
    });
    const text = await upstream.text();
    return send(res, upstream.status, { 'Content-Type': 'application/json; charset=utf-8' }, text);
  } catch (error) {
    log('grants.proxy-failed', { by: session.user, target, message: String(error?.message ?? error) });
    return jsonOut(res, 502, { ok: false, error: 'dsh-unreachable' });
  }
}

function handleUsersList(req, res, session) {
  const users = [...accounts.values()]
    .map((record) => ({
      ...publicView(record),
      login: loginView(loginInfo[record.username]),
      // 内置主账号不可由门户改动，前端据此禁用对应操作按钮。
      editable: record.source !== 'env',
      isSelf: record.username === session?.user,
    }))
    .sort((a, b) => {
      // 管理员在前，其余按用户名稳定排序：列表顺序不应随 Map 插入顺序漂移。
      if (a.role !== b.role) return a.role === 'admin' ? -1 : 1;
      return a.username.localeCompare(b.username);
    });
  return jsonOut(res, 200, { ok: true, users, now: new Date().toISOString() });
}

async function handleUserCreate(req, res, session) {
  let fields;
  try {
    fields = await loginFields(req);
  } catch {
    return jsonOut(res, 400, { ok: false, error: 'malformed' });
  }
  const username = normalizeCredential(fields.username);
  const password = String(fields.password ?? '');
  const role = ROLES.includes(fields.role) ? fields.role : 'user';
  const state = STATES.includes(fields.state) ? fields.state : 'active';
  const jobRole = normalizeJobRole(fields.jobRole);

  if (username === '' || password === '') return jsonOut(res, 400, { ok: false, error: 'register-invalid' });
  if (!USERNAME_RE.test(username)) return jsonOut(res, 400, { ok: false, error: 'register-invalid' });
  if (normalizeCredential(password).length < config.minPasswordLength) return jsonOut(res, 400, { ok: false, error: 'register-weak' });
  if (accounts.has(username)) return jsonOut(res, 409, { ok: false, error: 'register-exists' });

  const stored = await hashPassword(password);
  const stamp = new Date().toISOString();
  const record = {
    username,
    role,
    jobRole,
    state,
    verify: { kind: 'scrypt', stored },
    source: config.usersFile,
    createdAt: stamp,
    createdBy: session.user,
    updatedAt: stamp,
  };
  accounts.set(username, record);
  if (!commitOrRollback(res, () => accounts.delete(username), 'create', username)) return undefined;
  log('users.created', { by: session.user, user: username, role, jobRole, state });
  return jsonOut(res, 201, { ok: true, user: publicView(record) });
}

async function handleUserUpdate(req, res, session) {
  let fields;
  try {
    fields = await loginFields(req);
  } catch {
    return jsonOut(res, 400, { ok: false, error: 'malformed' });
  }
  const username = normalizeCredential(fields.username);
  const record = accounts.get(username);
  if (!record) return jsonOut(res, 404, { ok: false, error: 'not-found' });
  // 环境变量主账号是运维口径，门户不得改写它的角色、状态或口令。
  if (record.source === 'env') return jsonOut(res, 403, { ok: false, error: 'env-account-readonly' });

  const before = {
    role: record.role,
    jobRole: record.jobRole,
    state: record.state,
    verify: record.verify,
    updatedAt: record.updatedAt,
  };
  const nextRole = ROLES.includes(fields.role) ? fields.role : record.role;
  const nextJobRole = fields.jobRole === '' ? normalizeJobRole(record.jobRole) : normalizeJobRole(fields.jobRole);
  const nextState = STATES.includes(fields.state) ? fields.state : record.state;

  // 不允许把最后一个可用管理员降级或停用，否则会把自己锁在门外。
  const losingAdmin = record.role === 'admin' && record.state === 'active'
    && (nextRole !== 'admin' || nextState !== 'active');
  if (losingAdmin && countActiveAdmins() <= 1) {
    return jsonOut(res, 409, { ok: false, error: 'last-admin' });
  }

  if (typeof fields.password === 'string' && fields.password !== '') {
    if (normalizeCredential(fields.password).length < config.minPasswordLength) {
      return jsonOut(res, 400, { ok: false, error: 'register-weak' });
    }
    record.verify = { kind: 'scrypt', stored: await hashPassword(fields.password) };
  }
  record.role = nextRole;
  record.jobRole = nextJobRole;
  record.state = nextState;
  record.updatedAt = new Date().toISOString();

  if (!commitOrRollback(res, () => Object.assign(record, before), 'update', username)) return undefined;
  log('users.updated', { by: session.user, user: username, role: nextRole, jobRole: nextJobRole, state: nextState });
  return jsonOut(res, 200, { ok: true, user: publicView(record) });
}

async function handleUserDelete(req, res, session) {
  let fields;
  try {
    fields = await loginFields(req);
  } catch {
    return jsonOut(res, 400, { ok: false, error: 'malformed' });
  }
  const username = normalizeCredential(fields.username);
  const record = accounts.get(username);
  if (!record) return jsonOut(res, 404, { ok: false, error: 'not-found' });
  if (record.source === 'env') return jsonOut(res, 403, { ok: false, error: 'env-account-readonly' });
  if (record.role === 'admin' && record.state === 'active' && countActiveAdmins() <= 1) {
    return jsonOut(res, 409, { ok: false, error: 'last-admin' });
  }

  accounts.delete(username);
  if (!commitOrRollback(res, () => accounts.set(username, record), 'delete', username)) return undefined;
  log('users.deleted', { by: session.user, user: username });
  return jsonOut(res, 200, { ok: true, user: username });
}


/* ADMIN_CONSOLE_PROXY_V1
 * 转发到管理服务。管理服务独立进程，崩溃不影响门禁；未启动时返回 503 而非 500，
 * 便于区分「管理服务没起来」与「门户自身故障」。 */
const ADMIN_ORIGIN = { host: '127.0.0.1', port: Number(process.env.PORTAL_ADMIN_PORT ?? 3084) };
// 增值业务产品页的独立后台（模块：/data/dsh/vas）。与 FTTR 后台完全隔离，仅在本层做路径转发。
const VAS_ORIGIN = { host: '127.0.0.1', port: Number(process.env.PORTAL_VAS_PORT ?? 3085) };
function proxyAdmin(req, res, path) {
  const target = path.replace(/^\/api\/portal\/admin\//, '/api/admin/')
                     .replace(/^\/api\/portal\/orders$/, '/api/admin/orders')
                     .replace(/^\/portal\/admin\/?/, '/portal/admin/')
                     .replace(/\/portal\/admin\/$/, '/portal/admin');
  const upstream = httpRequest(
    {
      host: ADMIN_ORIGIN.host,
      port: ADMIN_ORIGIN.port,
      method: req.method,
      path: target + (new URL(req.url ?? '/', 'http://x').search || ''),
      headers: { ...req.headers, host: req.headers.host },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('管理服务未启动（127.0.0.1:' + ADMIN_ORIGIN.port + '）');
    } else res.end();
  });
  req.pipe(upstream);
}

/** 增值业务后台转发：路径原样透传，由 VAS 服务自行归一化。 */
function proxyVas(req, res, path) {
  const upstream = httpRequest(
    {
      host: VAS_ORIGIN.host,
      port: VAS_ORIGIN.port,
      method: req.method,
      path: path + (new URL(req.url ?? '/', 'http://x').search || ''),
      headers: { ...req.headers, host: req.headers.host },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      up.pipe(res);
    },
  );
  upstream.on('error', () => {
    if (!res.headersSent) {
      res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end('增值业务管理服务未启动（127.0.0.1:' + VAS_ORIGIN.port + '）');
    } else res.end();
  });
  req.pipe(upstream);
}

// EDGE_HTTPS_UPGRADE_V1（2026-10-08）：Cloudflare 未开启 Always Use HTTPS 时，明文入口会把
// 带 Secure 的会话 Cookie 交给浏览器，而浏览器在 http 连接上会直接丢弃它——现场表现为
// 「账号密码正确、登录也返回成功，却永远落回门户首页」。源站 Caddy 已有一条同类 301 规则，
// 但它判定的是 X-Forwarded-Proto，而 cloudflared 把该头恒写成 https，故规则永不命中；
// 真正携带终端原始协议的是 CF-Visitor。此处只对「浏览器顶层页面导航」补齐 301，
// 不碰 /api/portal/auth（Caddy forward_auth 的内部调用），也不改任何 POST/接口语义。
function originalRequestScheme(req) {
  const cfVisitor = req.headers['cf-visitor'];
  if (typeof cfVisitor === 'string') {
    try {
      const scheme = JSON.parse(cfVisitor)?.scheme;
      if (scheme === 'http' || scheme === 'https') return scheme;
    } catch {
      // 头不合规按「未知」处理，继续走下面的兜底，绝不因此跳转。
    }
  }
  const forwarded = req.headers['x-forwarded-proto'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0].trim().toLowerCase();
    if (first === 'http' || first === 'https') return first;
  }
  return null;
}

function isDocumentNavigation(req) {
  const method = req.method ?? 'GET';
  if (method !== 'GET' && method !== 'HEAD') return false;
  const dest = String(req.headers['sec-fetch-dest'] ?? '');
  const mode = String(req.headers['sec-fetch-mode'] ?? '');
  if (dest !== '' || mode !== '') return dest === 'document' || mode === 'navigate';
  return String(req.headers.accept ?? '').includes('text/html');
}

async function route(req, res) {
  const url = new URL(req.url ?? '/', 'http://portal.local');
  const path = decodeURIComponent(url.pathname);
  const now = Date.now();

  const upgradeHost = String(req.headers.host ?? '');
  if (
    originalRequestScheme(req) === 'http'
    && isDocumentNavigation(req)
    && path !== '/api/portal/auth'
    && /^[A-Za-z0-9.-]+(:\d+)?$/.test(upgradeHost)
  ) {
    log('edge.https_upgrade', { path, host: upgradeHost });
    return redirect(res, 301, `https://${upgradeHost}${req.url ?? '/'}`);
  }

  if (req.method === 'POST' && path === '/api/portal/login') return handleLogin(req, res);
  if (req.method === 'POST' && path === '/api/portal/register') return handleRegister(req, res);
  if ((req.method === 'POST' && path === '/api/portal/logout') || path === '/logout') return handleLogout(req, res);

  // 账号生命周期与管理接口（P1）。/api/portal/* 在 Caddy 层属于免门禁前缀，
  // 因此这些端点必须在门户内部自行完成会话与角色校验，不能依赖边缘。
  if (path === '/api/portal/me') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { Allow: 'GET, HEAD' }, '');
    return handleMe(req, res, currentSession(req, now));
  }
  // 岗位角色与权限目录：本人可读（自我视图的底座），他人信息不在此端点暴露。
  if (path === '/api/portal/roles') {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { Allow: 'GET, HEAD' }, '');
    return handleRoles(req, res, currentSession(req, now));
  }
  // 资源授权管理（缺口 1）：管理员门槛与用户管理同口径，转发时带上签名身份。
  if (path === '/api/portal/grants' || path.startsWith('/api/portal/grants/')) {
    const session = currentSession(req, now);
    if (!requireAdmin(session, res, `${req.method} ${path}`)) return undefined;
    return handleGrantProxy(req, res, session, path.slice('/api/portal/grants'.length));
  }
  if (path === '/api/portal/users' || path.startsWith('/api/portal/users/')) {
    const session = currentSession(req, now);
    if (!requireAdmin(session, res, `${req.method} ${path}`)) return undefined;
    if (path === '/api/portal/users' && (req.method === 'GET' || req.method === 'HEAD')) return handleUsersList(req, res, session);
    if (path === '/api/portal/users' && req.method === 'POST') return handleUserCreate(req, res, session);
    if (path === '/api/portal/users/update' && req.method === 'POST') return handleUserUpdate(req, res, session);
    if (path === '/api/portal/users/delete' && req.method === 'POST') return handleUserDelete(req, res, session);
    return jsonOut(res, 405, { ok: false, error: 'method-not-allowed' });
  }

  // VAS_CONSOLE_PROXY_V1 —— 增值业务产品页的独立后台（/data/dsh/vas，默认 3085）。
  // 与上面的 FTTR 后台共用同一套会话 Cookie；订单提交端点也由此转发。
  // 刻意不修改上面 ADMIN_CONSOLE_PROXY_V1 的任何行为，避免影响既有 FTTR 产品页。
  if (path === '/portal/zengzhi/admin' || path === '/portal/zengzhi/admin/'
    || path === '/portal/zengzhi/admin/admin.js' || path === '/portal/zengzhi/admin/admin.css'
    || path.startsWith('/api/portal/zengzhi/')) {
    return proxyVas(req, res, path);
  }

  // ADMIN_CONSOLE_PROXY_V1 —— 产品页管理后台必须放在全局方法限制之前：
  // 管理 API 需要 POST，而下面的 GET/HEAD 限制会把 POST 直接判成 405。
  // 仅转发 /portal/admin*、/api/portal/admin/* 与公开的 /api/portal/orders。
  if (path === '/portal/admin' || path === '/portal/admin/'
    || path === '/portal/admin/admin.js' || path === '/portal/admin/admin.css'
    || path.startsWith('/api/portal/admin/')
    || path === '/api/portal/orders') {
    return proxyAdmin(req, res, path);
  }

  // HANDBOOK_ADMIN_V1 —— 手册管理后台（/portal/handbook）与内容 API（/api/portal/handbook/*）、
  // 公开媒体（/portal/handbook-media/*）。与 VAS / FTTR 后台共用同一套会话 Cookie。
  // 必须放在下面的全局方法限制之前：管理 API 需要 POST。管理端点由 handbook.mjs 自行校验 admin 角色。
  if (isHandbookPath(path)) {
    return handleHandbook(req, res, { path, url, now, currentSession, requireAdmin, config, log });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { Allow: 'GET, HEAD, POST' }, '');
  }

  // 供 Caddy forward_auth 使用：只回答"会话是否有效"，不发跳转。
  // 这里同时是 P1 身份桥的签发点：forward_auth 会把本响应头复制进上游请求，
  // 因此 DSH 侧能拿到账号、角色与签名（签名防止容器内直连伪造）。
  if (path === '/api/portal/auth') {
    const session = currentSession(req, now);
    // 不带 WWW-Authenticate：它会让浏览器弹出原生凭据框，且这里的 401 是给 forward_auth 的判断信号。
    if (!session) return send(res, 401, {}, '');
    const expires = String(session.expiresAt);
    const role = session.record.role;
    const jobRole = normalizeJobRole(session.record.jobRole);
    const headers = { 'X-Portal-User': session.user, 'X-Portal-Expires': expires };
    if (bridgeSecret !== null) {
      headers['X-Portal-Role'] = role;
      headers['X-Portal-Job-Role'] = jobRole;
      headers['X-Portal-Sig'] = `v1=${computePortalSignature(bridgeSecret, { username: session.user, role, jobRole, expires })}`;
    }
    return send(res, 204, headers, '');
  }

  // 门户服务不是根路径的前门（根路径由 Caddy 判定会话后决定放行工作台或门户首页）。
  if (path === '/') return redirect(res, 302, '/portal');
  if (path === '/portal' || path === '/portal/') return serveSiteFile(req, res, INDEX_HTML);
  if (path === '/login') {
    const session = currentSession(req, now);
    if (session) return redirect(res, 303, safeNext(url.searchParams.get('next'), '/'));
    return renderLogin(req, res, {
      error: url.searchParams.get('error'),
      notice: url.searchParams.get('notice'),
      next: url.searchParams.get('next'),
    });
  }
  if (path === '/register') {
    const session = currentSession(req, now);
    if (session) return redirect(res, 303, safeNext(url.searchParams.get('next'), '/'));
    return renderRegister(req, res, {
      error: url.searchParams.get('error'),
      notice: url.searchParams.get('notice'),
      next: url.searchParams.get('next'),
    });
  }
  if (SITE_FILES.has(path)) return serveSiteFile(req, res, SITE_FILES.get(path));
  if (path.startsWith('/portal/assets/')) return serveAsset(req, res, path);
  if (path.startsWith('/portal/products/')) return serveProductPage(req, res, path);
  return sendText(res, 404, 'Not found');
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => {
    log('request.error', { path: req.url, message: String(error?.message ?? error) });
    if (!res.headersSent) sendText(res, 500, 'Internal error');
    else res.end();
  });
});

const sweep = setInterval(() => throttle.retain(), 60_000);
sweep.unref();

server.listen(config.port, config.bind, () => {
  log('listening', { bind: config.bind, port: config.port, assetsDir: config.assetsDir, cookieSecure: config.cookieSecure, accounts: accounts.size });
  // 只登记账号数量与告警，不登记用户名与口令。
  for (const message of accountWarnings) log('warning', { scope: 'accounts', message });
  if (!accountsConfigured()) {
    log('warning', { message: 'DSH_AUTH_USERNAME / DSH_AUTH_PASSWORD 未配置：登录按失败关闭处理，不会放行任何会话。' });
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('stopping', { signal });
    server.close(() => process.exit(0));
  });
}
