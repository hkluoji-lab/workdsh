// 用户存储：门户自己的账号真源（口令哈希 + 角色 + 状态）。
// 只使用 Node 内置模块；任何写盘都是「临时文件 + rename」原子替换，
// 半截文件不会把门禁读坏——读坏时调用方按告警降级，主账号仍可登录。
//
// 与官方环境变量账号的关系：DSH_AUTH_USERNAME / DSH_AUTH_PASSWORD 仍是主账号与运维口径，
// 它只存在于环境变量里，无法也不需要哈希；本模块负责的是额外的持久化用户。
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, renameSync, mkdirSync, chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { normalizeCredential, verifyPassword } from './session.mjs';
import { JOB_ROLE_UNASSIGNED, normalizeJobRole } from './roles.mjs';

const scryptAsync = promisify(scrypt);

export const ROLES = ['admin', 'user'];
export const STATES = ['active', 'disabled', 'pending'];
// 岗位角色是第二层身份（按部门），与平台角色 role 正交。缺省一律「未分配」：
// 老记录升级上来时不会被静默授予任何岗位权限。
export { JOB_ROLE_UNASSIGNED };

// scrypt 参数显式写进哈希串本体：以后升级参数不会让旧记录失效。
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 32 };
const HASH_PREFIX = 'scrypt';

// 注册口令的下限。官方主账号有 ≥12 位的硬约束，普通用户沿用同一口径。
export const MIN_PASSWORD_LENGTH = 12;

export function isHashed(value) {
  return typeof value === 'string' && value.startsWith(`${HASH_PREFIX}$`);
}

/** 生成 `scrypt$N$r$p$salt$hash` 形式的自描述哈希串。 */
export async function hashPassword(plain) {
  const normalized = normalizeCredential(plain);
  if (normalized === '') throw new Error('empty password');
  const salt = randomBytes(16);
  const derived = await scryptAsync(normalized, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return [
    HASH_PREFIX,
    SCRYPT.N,
    SCRYPT.r,
    SCRYPT.p,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

/** 用记录里的参数校验明文口令；参数取自哈希串，非法串一律判失败。 */
export async function verifyHash(plain, stored) {
  const normalized = normalizeCredential(plain);
  if (normalized === '') return false;
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== HASH_PREFIX) return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  let salt;
  let expected;
  try {
    salt = Buffer.from(parts[4], 'base64url');
    expected = Buffer.from(parts[5], 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  // scrypt 的内存上限要随参数抬高，否则大 N 会直接抛错。
  const derived = await scryptAsync(normalized, salt, expected.length, {
    N, r, p, maxmem: 256 * N * r,
  });
  return timingSafeEqual(derived, expected);
}

/**
 * 口令校验统一入口：按记录形态分发到哈希校验或明文校验。
 * 调用方不再需要知道自己面对的是哪种记录——迁移期间两种会并存。
 */
export async function verifyRecord(submitted, record) {
  if (!record || !record.verify) return false;
  if (record.verify.kind === 'scrypt') return verifyHash(submitted, record.verify.stored);
  return verifyPassword(submitted, record.verify.value);
}

/** 会话签名密钥的用料：哈希用户用哈希串本身，明文（环境变量主账号）用口令。 */
export function keyMaterial(record) {
  return record?.verify?.kind === 'scrypt' ? record.verify.stored : (record?.verify?.value ?? '');
}

/** 对外视图：绝不包含任何口令或哈希。 */
export function publicView(record) {
  return {
    username: record.username,
    role: record.role,
    jobRole: normalizeJobRole(record.jobRole),
    state: record.state,
    source: record.source,
    createdAt: record.createdAt ?? null,
    createdBy: record.createdBy ?? null,
    updatedAt: record.updatedAt ?? null,
  };
}

function normalizeRecord(entry, source) {
  if (!entry || typeof entry !== 'object') return { error: '不是对象' };
  const username = normalizeCredential(entry.username);
  if (username === '') return { error: '用户名为空' };
  const role = ROLES.includes(entry.role) ? entry.role : 'user';
  const state = STATES.includes(entry.state) ? entry.state : 'active';

  // 新格式优先；旧的明文 password 字段仍接受，但会在告警里点名，推动迁移。
  let verify;
  if (isHashed(entry.passwordHash)) {
    verify = { kind: 'scrypt', stored: entry.passwordHash };
  } else if (typeof entry.password === 'string' && normalizeCredential(entry.password) !== '') {
    verify = { kind: 'plain', value: normalizeCredential(entry.password) };
  } else {
    return { error: '既无 passwordHash 也无 password' };
  }

  return {
    record: {
      username,
      role,
      jobRole: normalizeJobRole(entry.jobRole),
      state,
      verify,
      source,
      createdAt: entry.createdAt ?? null,
      createdBy: entry.createdBy ?? null,
      updatedAt: entry.updatedAt ?? null,
    },
  };
}

/**
 * 读取用户表。文件不存在属正常（返回空表），写坏只登记告警——
 * 门禁不会因为用户表损坏而把整站锁死，环境变量主账号始终可用。
 */
export function readUserStore(file) {
  const warnings = [];
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') warnings.push(`${file}: 读取失败（${error?.code ?? error?.message}）`);
    return { records: [], warnings, exists: false };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(`${file}: 不是合法 JSON，已忽略全部持久化用户`);
    return { records: [], warnings, exists: true };
  }
  const list = Array.isArray(parsed?.users) ? parsed.users : null;
  if (!list) {
    warnings.push(`${file}: 缺少 users 数组，已忽略全部持久化用户`);
    return { records: [], warnings, exists: true };
  }
  const records = [];
  const seen = new Set();
  for (const [index, entry] of list.entries()) {
    const { record, error } = normalizeRecord(entry, `${file}: users[${index}]`);
    if (error) {
      warnings.push(`${file}: users[${index}] ${error}，已跳过`);
      continue;
    }
    if (seen.has(record.username)) {
      warnings.push(`${file}: 用户名 ${record.username} 重复，已跳过后者`);
      continue;
    }
    if (record.verify.kind === 'plain') {
      warnings.push(`${file}: 用户 ${record.username} 仍是明文口令，建议执行迁移为哈希`);
    }
    seen.add(record.username);
    records.push(record);
  }
  return { records, warnings, exists: true };
}

/** 原子写入：先写同目录临时文件再 rename，权限收到 0600。 */
export function writeUserStore(file, records) {
  const payload = {
    version: 1,
    // 只持久化有独立口令的记录；环境变量主账号由配置层在内存里合并，不落盘。
    users: records.filter((record) => record.source !== 'env').map((record) => {
      const entry = {
        username: record.username,
        role: record.role,
        jobRole: normalizeJobRole(record.jobRole),
        state: record.state,
        createdAt: record.createdAt ?? null,
        createdBy: record.createdBy ?? null,
        updatedAt: record.updatedAt ?? null,
      };
      if (record.verify.kind === 'scrypt') entry.passwordHash = record.verify.stored;
      else entry.password = record.verify.value;
      return entry;
    }),
  };
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
  writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, file);
}
