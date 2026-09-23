// WorkDSH 企业门户与登录门禁服务。
// 部署边缘面：只提供门户静态页、登录/退出与 /api/portal/auth（供 Caddy forward_auth 使用）。
// 不注册 Agent 工具、不代理应用流量、不写业务数据、不做任何业务授权判断。
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { loadConfig } from './config.mjs';
import {
  COOKIE_NAME,
  LoginThrottle,
  clearedCookie,
  deriveKey,
  issueSession,
  parseCookies,
  readSession,
  safeNext,
  sessionCookie,
  verifyPassword,
} from './session.mjs';

const config = loadConfig();
const key = deriveKey(config.password || 'unconfigured');
const throttle = new LoginThrottle(config.throttle);
const credentialsConfigured = config.username !== '' && config.password !== '';

// 缓存策略与安全头分离。此前 no-store 被合并进每一个响应，连图片一起，导致每次访问都要重下门户全部素材。
const CACHE_HTML = 'no-cache'; // 可复用但每次必须回源校验：配合 ETag 拿 304，且绝不陈旧。
const CACHE_CODE = 'public, max-age=3600'; // 站内 CSS/JS 文件名无内容指纹，用 1 小时窗口换取安全。
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
  // 门户只绑定 127.0.0.1，仅 Caddy 可达，因此转发头可信；否则退回套接字地址。
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded !== '') return forwarded.split(',')[0].trim();
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real !== '') return real.trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function currentSession(req, now) {
  const token = parseCookies(req.headers.cookie).get(COOKIE_NAME);
  return readSession({ key, token, user: config.username, now });
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
  if (type.includes('application/json')) {
    const parsed = JSON.parse(raw === '' ? '{}' : raw);
    return { username: String(parsed.username ?? ''), password: String(parsed.password ?? ''), next: String(parsed.next ?? '') };
  }
  const form = new URLSearchParams(raw);
  return { username: form.get('username') ?? '', password: form.get('password') ?? '', next: form.get('next') ?? '' };
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
]);

function escapeHtml(value) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, (char) => map[char]);
}

async function renderLogin(req, res, { error, next }) {
  const template = await readFile(join(config.siteDir, 'login.html'), 'utf8');
  const message = LOGIN_ERRORS.get(error);
  const body = template
    .replace('{{ERROR}}', message ? `<p class="form-error" role="alert">${escapeHtml(message)}</p>` : '')
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
  if (!credentialsConfigured) {
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

  const userOk = fields.username === config.username;
  const passwordOk = verifyPassword(fields.password, config.password);
  if (!userOk || !passwordOk) {
    throttle.fail(ip, now);
    log('login.failed', { ip, user: fields.username });
    return wantsJson
      ? send(res, 401, { 'Content-Type': 'application/json' }, '{"ok":false,"error":"credentials"}')
      : redirect(res, 303, `/login?error=credentials&next=${encodeURIComponent(next)}`);
  }

  const { token, expiresAt } = issueSession({ key, user: config.username, now, ttlMs: config.sessionTtlMs });
  throttle.reset(ip);
  log('login.succeeded', { ip, user: config.username });
  return wantsJson
    ? send(res, 200, { 'Content-Type': 'application/json', 'Set-Cookie': sessionCookie({ token, maxAgeMs: expiresAt - now, secure: config.cookieSecure }) }, JSON.stringify({ ok: true, user: config.username, redirect: next }))
    : send(res, 303, { Location: next, 'Set-Cookie': sessionCookie({ token, maxAgeMs: expiresAt - now, secure: config.cookieSecure }) }, '');
}

function handleLogout(req, res) {
  log('logout', { ip: clientIp(req) });
  send(res, 303, { Location: '/portal', 'Set-Cookie': clearedCookie({ secure: config.cookieSecure }) }, '');
}

async function route(req, res) {
  const url = new URL(req.url ?? '/', 'http://portal.local');
  const path = decodeURIComponent(url.pathname);
  const now = Date.now();

  if (req.method === 'POST' && path === '/api/portal/login') return handleLogin(req, res);
  if ((req.method === 'POST' && path === '/api/portal/logout') || path === '/logout') return handleLogout(req, res);

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return send(res, 405, { Allow: 'GET, HEAD, POST' }, '');
  }

  // 供 Caddy forward_auth 使用：只回答"会话是否有效"，不发跳转。
  if (path === '/api/portal/auth') {
    const session = currentSession(req, now);
    // 不带 WWW-Authenticate：它会让浏览器弹出原生凭据框，且这里的 401 是给 forward_auth 的判断信号。
    if (!session) return send(res, 401, {}, '');
    return send(res, 204, { 'X-Portal-User': session.user, 'X-Portal-Expires': String(session.expiresAt) }, '');
  }

  // 门户服务不是根路径的前门（根路径由 Caddy 判定会话后决定放行工作台或门户首页）。
  if (path === '/') return redirect(res, 302, '/portal');
  if (path === '/portal' || path === '/portal/') return serveSiteFile(req, res, INDEX_HTML);
  if (path === '/login') {
    const session = currentSession(req, now);
    if (session) return redirect(res, 303, safeNext(url.searchParams.get('next'), '/'));
    return renderLogin(req, res, { error: url.searchParams.get('error'), next: url.searchParams.get('next') });
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
  log('listening', { bind: config.bind, port: config.port, assetsDir: config.assetsDir, cookieSecure: config.cookieSecure });
  if (!credentialsConfigured) {
    log('warning', { message: 'DSH_AUTH_USERNAME / DSH_AUTH_PASSWORD 未配置：登录按失败关闭处理，不会放行任何会话。' });
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    log('stopping', { signal });
    server.close(() => process.exit(0));
  });
}
