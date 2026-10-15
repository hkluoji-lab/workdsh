// 会话密钥与会话校验的共享实现。
//
// 为什么必须共享：门户（3083）、产品页后台（3084）、增值业务后台（3085）是三个进程，
// 但共用同一个会话 Cookie。此前三处各写了一遍「密钥由全部账号派生」，
// 一旦派生口径改动就会静默错位——三个服务互相认为对方签发的会话无效，
// 表现是「登录成功却处处要求重新登录」。这里收敛为唯一实现。
import { randomBytes } from 'node:crypto';
import { chmodSync, closeSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { deriveKey, readSession } from './session.mjs';

/**
 * 解析会话密钥原文。优先环境变量，其次持久化文件；文件不存在则生成并写入 0600。
 * 密钥与账号表解耦：账号增删改不再牵连既有会话，改密只作废该用户自己的会话。
 */
export function resolveSessionSecret({ sessionKeyFile, env = process.env, warn } = {}) {
  const fromEnv = (env.PORTAL_SESSION_SECRET ?? '').trim();
  if (fromEnv !== '') return fromEnv;
  if (!sessionKeyFile) throw new Error('sessionKeyFile is required when PORTAL_SESSION_SECRET is unset');
  try {
    const existing = readFileSync(sessionKeyFile, 'utf8').trim();
    if (existing !== '') return existing;
  } catch (error) {
    if (error?.code !== 'ENOENT') warn?.(`会话密钥读取失败（${error?.code ?? error?.message}），将重新生成`);
  }
  const generated = randomBytes(32).toString('base64url');
  const fd = openSync(sessionKeyFile, 'w', 0o600);
  try {
    writeFileSync(fd, `${generated}\n`);
  } finally {
    closeSync(fd);
  }
  chmodSync(sessionKeyFile, 0o600);
  return generated;
}

/** 直接拿到用于签名/校验的密钥，供三个服务共用。 */
export function sessionKeyFor(config, options = {}) {
  return deriveKey(resolveSessionSecret({
    sessionKeyFile: config.sessionKeyFile,
    env: options.env ?? process.env,
    warn: options.warn,
  }));
}

/**
 * 完整会话校验：签名有效之后还要满足「用户仍存在」「仍为 active」
 * 「签发时间晚于该用户最后一次变更」——改密、改角色、停用都即刻作废本人旧会话。
 * 返回 { user, record, issuedAt, expiresAt } 或 null。
 */
export function authenticate({ key, token, users, now }) {
  const session = readSession({ key, token, users, now });
  if (!session) return null;
  const record = users.get?.(session.user);
  if (!record || record.state !== 'active') return null;
  const changedAt = record.updatedAt ? Date.parse(record.updatedAt) : 0;
  if (Number.isFinite(changedAt) && changedAt > 0 && session.issuedAt < changedAt) return null;
  return { ...session, record };
}

/**
 * 账号目录（带 TTL 的只读快照），供门户之外的进程使用。
 *
 * 为什么不能只在启动时读一次：账号现在是可动态增删改的。启动时读死的表会同时造成两个错误——
 *  ① 新建用户拿不到会话（对方进程不认识这个用户名）；
 *  ② 已删除/已停用的用户仍被放行，直到该进程重启为止。后者是安全漏洞。
 * 门户自己持有权威内存表，不需要这个；后台类进程按请求读取，最长滞后 TTL。
 */
export function createAccountDirectory({ load, config, ttlMs = 5000, onReload } = {}) {
  let snapshot = load(config).accounts;
  let loadedAt = Date.now();
  return function currentAccounts() {
    const now = Date.now();
    if (now - loadedAt >= ttlMs) {
      try {
        snapshot = load(config).accounts;
        loadedAt = now;
        onReload?.(snapshot);
      } catch (error) {
        // 读取失败时保留上一份快照：宁可短暂沿用旧表，也不要把所有人锁在门外。
        onReload?.(null, error);
      }
    }
    return snapshot;
  };
}
