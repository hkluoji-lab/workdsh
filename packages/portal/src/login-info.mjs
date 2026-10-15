// 登录信息台账：记录每个账号的登录时间、来源 IP、次数与最近失败。
//
// 为什么单独一个文件、而不写进 users.json：
//   users.json 的 `updatedAt` 是会话失效的判据（改密/改角色/停用即刻作废旧会话）。
//   登录记账如果也去动 users.json，就会在每次成功登录后把刚签发的会话作废。
//   因此登录信息放独立文件，按用户名索引。
//
// 另一个原因：环境变量主账号并不落盘在 users.json 里，但它同样需要登录台账。
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MAX_ENTRIES = 500;

/** 读取台账。文件缺失或写坏都只返回空表——登录记账绝不能拖垮登录本身。 */
export function readLoginInfo(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const users = parsed?.users;
    if (!users || typeof users !== 'object' || Array.isArray(users)) return {};
    return users;
  } catch {
    return {};
  }
}

function writeLoginInfo(file, users) {
  const payload = { version: 1, updatedAt: new Date().toISOString(), users };
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}

/**
 * 记账。失败一律吞掉并回调上报——登录流程不能因为写台账失败而失败。
 * 返回更新后的台账（供调用方替换内存快照）。
 */
export function recordLogin(file, users, { username, ip, at, ok, keep = MAX_ENTRIES }) {
  if (typeof username !== 'string' || username === '') return users;
  const next = { ...users };
  const prev = next[username] ?? {};
  if (ok) {
    next[username] = {
      ...prev,
      lastLoginAt: at,
      lastLoginIp: ip ?? null,
      loginCount: Number(prev.loginCount ?? 0) + 1,
      firstLoginAt: prev.firstLoginAt ?? at,
    };
  } else {
    next[username] = {
      ...prev,
      lastFailureAt: at,
      lastFailureIp: ip ?? null,
      failureCount: Number(prev.failureCount ?? 0) + 1,
    };
  }
  // 台账只服务于展示；条目过多时按最后活动时间淘汰，避免无限增长。
  const names = Object.keys(next);
  if (names.length > keep) {
    const sorted = names.sort((a, b) => {
      const ta = Date.parse(next[a]?.lastLoginAt ?? next[a]?.lastFailureAt ?? 0) || 0;
      const tb = Date.parse(next[b]?.lastLoginAt ?? next[b]?.lastFailureAt ?? 0) || 0;
      return tb - ta;
    });
    for (const name of sorted.slice(keep)) delete next[name];
  }
  writeLoginInfo(file, next);
  return next;
}

/** 台账条目的展示视图：IP 只保留到网段，避免在管理界面里铺开完整地址。 */
export function loginView(entry, { maskIp = true } = {}) {
  if (!entry) {
    return { lastLoginAt: null, lastLoginIp: null, loginCount: 0, firstLoginAt: null, lastFailureAt: null, failureCount: 0, everLoggedIn: false };
  }
  return {
    lastLoginAt: entry.lastLoginAt ?? null,
    lastLoginIp: maskIp ? maskAddress(entry.lastLoginIp) : (entry.lastLoginIp ?? null),
    loginCount: Number(entry.loginCount ?? 0),
    firstLoginAt: entry.firstLoginAt ?? null,
    lastFailureAt: entry.lastFailureAt ?? null,
    failureCount: Number(entry.failureCount ?? 0),
    everLoggedIn: Boolean(entry.lastLoginAt),
  };
}

/** IPv4 保留前三段、IPv6 保留前四组；非地址原样返回。 */
export function maskAddress(value) {
  if (typeof value !== 'string' || value === '') return null;
  if (value.includes(':')) {
    const groups = value.split(':').filter(Boolean);
    return groups.length > 4 ? `${groups.slice(0, 4).join(':')}:…` : value;
  }
  const parts = value.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.x`;
  return value;
}
