// 会话与口令：无状态签名 Cookie + 常量时间口令校验 + 进程内失败限流。
// 仅使用 Node 内置模块；不落库、不写业务数据、不拥有第二套账号真源。
import { createHmac, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export const COOKIE_NAME = 'dsh_portal_session';

// 签名密钥由同一口令派生：重启后会话仍有效，改口令即全量失效，无需新增密钥管理。
export function deriveKey(secret) {
  return createHmac('sha256', 'workdsh-portal-session-v1').update(secret).digest();
}

// 凭据归一化：登录失败的两类现场原因是「看起来一样、字节不同」——
//  ① 中文输入法把半角符号打成全角（！＠．－ 等，U+FF01—U+FF5E）；
//  ② 从聊天工具、备忘录粘贴时带上首尾空白（含全角空格 U+3000）。
// 提交值与配置值都过同一函数后再比较，比较口径保持一致；不做大小写折叠，也不截断。
export function normalizeCredential(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[\uff01-\uff5e]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .trim();
}

// 两侧都先归一化、再过 scrypt 常量时间比较，避免通过长度或提前返回泄漏口令信息。
// 使用异步 scrypt：KDF 走 libuv 线程池，不再阻塞与 forward_auth 共用的单线程事件循环
// （此前两次 scryptSync 会让同一进程内所有并发请求排队等 KDF）。
export async function verifyPassword(submitted, expected) {
  const given = normalizeCredential(submitted);
  const want = normalizeCredential(expected);
  if (given === '' || want === '') return false;
  const salt = 'workdsh-portal-password-v1';
  const [a, b] = await Promise.all([scryptAsync(given, salt, 32), scryptAsync(want, salt, 32)]);
  return timingSafeEqual(a, b);
}

export function issueSession({ key, user, now, ttlMs }) {
  const expiresAt = now + ttlMs;
  const payload = Buffer.from(JSON.stringify({ u: user, i: now, e: expiresAt })).toString('base64url');
  const mac = createHmac('sha256', key).update(payload).digest('base64url');
  return { token: `${payload}.${mac}`, expiresAt };
}

// users 为当前有效账号集合（Set 或 Map，只要有 has()）：
// 账号被删除或改名后，旧会话在下一次校验即失效，不依赖 Cookie 里的用户名自证。
export function readSession({ key, token, users, now }) {
  if (typeof token !== 'string' || token === '') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const supplied = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(createHmac('sha256', key).update(payload).digest('base64url'));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;
  let data;
  try {
    data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || typeof users?.has !== 'function' || !users.has(data.u)) return null;
  if (typeof data.e !== 'number' || data.e <= now) return null;
  return { user: data.u, issuedAt: data.i, expiresAt: data.e };
}

// 只允许同源相对路径，拦截绝对 URL、协议相对跳转 //evil、反斜杠变体与门户自身路径。
export function safeNext(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  const candidate = value.trim();
  if (candidate === '' || candidate.length > 512) return fallback;
  if (!candidate.startsWith('/')) return fallback;
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return fallback;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(candidate)) return fallback;
  const path = candidate.split('?')[0];
  for (const reserved of ['/login', '/logout', '/portal', '/api']) {
    if (path === reserved || path.startsWith(`${reserved}/`)) return fallback;
  }
  return candidate;
}

export function parseCookies(header) {
  const out = new Map();
  if (typeof header !== 'string') return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    out.set(part.slice(0, eq).trim(), part.slice(eq + 1).trim());
  }
  return out;
}

export function sessionCookie({ token, maxAgeMs, secure }) {
  const attrs = [`${COOKIE_NAME}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${Math.floor(maxAgeMs / 1000)}`];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

export function clearedCookie({ secure }) {
  const attrs = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) attrs.push('Secure');
  return attrs.join('; ');
}

// 单实例部署下的进程内限流。多副本时限流计数不共享，会话校验仍然正确（无状态签名）。
export class LoginThrottle {
  constructor({ windowMs, maxFailures } = {}) {
    this.windowMs = windowMs ?? 15 * 60 * 1000;
    this.maxFailures = maxFailures ?? 10;
    this.entries = new Map();
  }

  #entry(id, now) {
    const current = this.entries.get(id);
    if (!current || now - current.since >= this.windowMs) {
      const fresh = { since: now, failures: 0 };
      this.entries.set(id, fresh);
      return fresh;
    }
    return current;
  }

  blocked(id, now = Date.now()) {
    return this.#entry(id, now).failures >= this.maxFailures;
  }

  fail(id, now = Date.now()) {
    this.#entry(id, now).failures += 1;
  }

  reset(id) {
    this.entries.delete(id);
  }

  retain(now = Date.now()) {
    for (const [id, entry] of this.entries) if (now - entry.since >= this.windowMs) this.entries.delete(id);
    return this.entries.size;
  }
}
