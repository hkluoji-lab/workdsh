// 配置装载：只读环境变量与账号表，不读取或写入任何业务数据。
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCredential } from './session.mjs';
import { MIN_PASSWORD_LENGTH, readUserStore } from './users.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const moduleDir = resolve(here, '..');
export const repoRoot = resolve(moduleDir, '..', '..');

// 注册开关三档。默认 invite：开放注册等于把「容器内可执行 shell 的 AI 工作台」
// 向公网敞开，在资源隔离（P2）完成前不应默认 open。
export const REGISTRATION_MODES = ['closed', 'invite', 'open'];

/**
 * 读取可选的 `portal.env`（KEY=VALUE，每行一条，`#` 注释）。
 *
 * 为什么需要它：门户的这些开关目前由容器 entrypoint 以环境变量传入，
 * 而改 entrypoint 必须重启容器（会中断所有人）。放成卷上的文件后，
 * 改注册开关或邀请码只需重启门户进程（约 3 秒，容器与工作台不受影响）。
 * 语义：真实环境变量优先于文件，文件优先于内置默认值。
 */
export function loadEnvFile(file) {
  const out = {};
  let raw;
  try {
    raw = readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split('\n')) {
    const text = line.trim();
    if (text === '' || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq <= 0) continue;
    const key = text.slice(0, eq).trim();
    let value = text.slice(eq + 1).trim();
    // 允许两侧加引号以承载空格或 # 号
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key !== '') out[key] = value;
  }
  return out;
}

export function loadConfig(env = process.env) {
  const envFile = resolve(env.PORTAL_ENV_FILE ?? resolve(moduleDir, 'portal.env'));
  const merged = { ...loadEnvFile(envFile), ...env };
  const registration = REGISTRATION_MODES.includes(merged.PORTAL_REGISTRATION)
    ? merged.PORTAL_REGISTRATION
    : 'invite';
  const env2 = merged;
  return {
    bind: env2.PORTAL_BIND ?? '127.0.0.1',
    port: Number(env2.PORTAL_PORT ?? 3083),
    // 与官方 dsh Web 共用同一组口令；门户不注册、不修改、不落库。
    // 它同时是主账号：角色固定 admin、状态固定 active，且不出现在持久化用户表里。
    username: (env2.DSH_AUTH_USERNAME ?? '').trim(),
    password: env2.DSH_AUTH_PASSWORD ?? '',
    envFile,
    // 持久化用户表（含哈希口令、角色、状态）。默认与门户模块同目录。
    usersFile: resolve(env2.PORTAL_USERS_FILE ?? resolve(moduleDir, 'users.json')),
    // 会话签名密钥的落点。与账号表解耦，账号增删不再牵连既有会话。
    sessionKeyFile: resolve(env2.PORTAL_SESSION_KEY_FILE ?? resolve(moduleDir, 'session.key')),
    // 登录信息台账（最后登录时间/IP、次数、失败）。独立于 users.json：
    // 账号表的 updatedAt 是会话失效判据，不能被登录记账打扰。
    loginInfoFile: resolve(env2.PORTAL_LOGIN_INFO_FILE ?? resolve(moduleDir, 'login-info.json')),
    // P1 身份桥共享密钥：门户签发身份头，DSH 侧 workdsh-identity-portal 插件验签。
    // 必须放在三个后台与 DSH 容器都能读到的同一路径上。
    identityBridgeKeyFile: resolve(env2.PORTAL_IDENTITY_BRIDGE_KEY ?? resolve(moduleDir, 'identity-bridge.key')),
    // DSH 后端的服务端地址：资源授权管理需要门户替用户**带签名**转发过去。
    // 可覆盖，便于测试把门户指向沙箱实例。
    dshOrigin: (env2.PORTAL_DSH_ORIGIN ?? 'http://127.0.0.1:3080').replace(/\/$/, ''),

    // 旧账号表：仅在 users.json 不存在时作为回退读取，迁移完成后即被忽略。
    accountsFile: resolve(env2.PORTAL_ACCOUNTS_FILE ?? resolve(moduleDir, 'accounts.json')),
    registration,
    inviteCode: (env2.PORTAL_INVITE_CODE ?? '').trim(),
    minPasswordLength: MIN_PASSWORD_LENGTH,
    sessionTtlMs: Number(env2.PORTAL_SESSION_TTL_HOURS ?? 12) * 3600 * 1000,
    // 浏览器侧是 HTTPS（Cloudflare 边缘）；本机 http 预览时用 PORTAL_COOKIE_SECURE=0 关闭。
    cookieSecure: env2.PORTAL_COOKIE_SECURE !== '0',
    siteDir: resolve(moduleDir, 'site'),
    // 手册管理（HANDBOOK_ADMIN_V1）：内容仓库与后台页面目录。默认与门户模块同目录。
    handbookDir: resolve(env2.PORTAL_HANDBOOK_DIR ?? resolve(moduleDir, 'handbook')),
    handbookSiteDir: resolve(env2.PORTAL_HANDBOOK_SITE_DIR ?? resolve(moduleDir, 'handbook', 'site')),
    // 只引用仓库内已发布的真实应用截图，不复制第二份二进制素材。
    assetsDir: env2.PORTAL_ASSETS_DIR ? resolve(env2.PORTAL_ASSETS_DIR) : resolve(repoRoot, 'website', 'assets'),
    throttle: { windowMs: 15 * 60 * 1000, maxFailures: 10 },
  };
}

// 旧账号表读取：`{ "accounts": [{ "username", "password" }] }`。
// 只在持久化用户表缺失时调用，避免「已删除的用户被旧文件复活」。
function loadLegacyAccounts(accountsFile) {
  const warnings = [];
  let raw;
  try {
    raw = readFileSync(accountsFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') warnings.push(`${accountsFile}: 读取失败（${error?.code ?? error?.message}）`);
    return { entries: [], warnings };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(`${accountsFile}: 不是合法 JSON，额外账号已忽略`);
    return { entries: [], warnings };
  }
  if (!Array.isArray(parsed?.accounts)) {
    warnings.push(`${accountsFile}: 缺少 accounts 数组，额外账号已忽略`);
    return { entries: [], warnings };
  }
  return { entries: parsed.accounts, warnings };
}

/**
 * 装配最终账号表：Map<username, record>。
 *   record = { username, role, state, verify:{kind:'plain'|'scrypt',...}, source, ... }
 * 优先级固定为「环境变量主账号 > users.json > 旧 accounts.json（仅回退时）」，
 * 主账号永远无法被持久化用户覆盖，也不会被误删。
 */
export function loadAccounts({ username, password, usersFile, accountsFile }) {
  const accounts = new Map();
  const warnings = [];
  const add = (record) => {
    if (record.username === '' || accounts.has(record.username)) return false;
    accounts.set(record.username, record);
    return true;
  };

  // 1) 环境变量主账号。完全未配置属正常形态；只有「配了一半」才算配置错误。
  const envUser = normalizeCredential(username);
  const envPass = normalizeCredential(password);
  if (envUser !== '' || envPass !== '') {
    if (envUser === '' || envPass === '') {
      warnings.push('DSH_AUTH_USERNAME/DSH_AUTH_PASSWORD 只配置了一半，主账号已跳过');
    } else {
      add({
        username: envUser,
        role: 'admin',
        // 内置主账号即站长：岗位显示为「管理」，与它实际拥有的全量能力一致。
        jobRole: 'management',
        state: 'active',
        verify: { kind: 'plain', value: envPass },
        source: 'env',
        createdAt: null,
        createdBy: null,
        updatedAt: null,
      });
    }
  }

  // 2) 持久化用户表。
  const store = readUserStore(usersFile);
  warnings.push(...store.warnings);
  for (const record of store.records) {
    if (!add(record)) warnings.push(`${usersFile}: 用户名 ${record.username} 与环境变量主账号冲突，已跳过`);
  }

  // 3) 旧账号表仅在持久化用户表不存在时回退读取。
  if (!store.exists) {
    const legacy = loadLegacyAccounts(accountsFile);
    warnings.push(...legacy.warnings);
    let migrated = 0;
    for (const [index, entry] of legacy.entries.entries()) {
      if (!entry || typeof entry !== 'object') {
        warnings.push(`${accountsFile}: accounts[${index}] 不是对象，已跳过`);
        continue;
      }
      const user = normalizeCredential(entry.username);
      const pass = normalizeCredential(entry.password);
      if (user === '' || pass === '') {
        warnings.push(`${accountsFile}: accounts[${index}] 用户名或口令为空，已跳过`);
        continue;
      }
      if (add({
        username: user,
        role: 'user',
        state: 'active',
        verify: { kind: 'plain', value: pass },
        source: 'legacy-accounts',
        createdAt: null,
        createdBy: null,
        updatedAt: null,
      })) migrated += 1;
    }
    if (migrated > 0) {
      warnings.push(`正在使用旧账号表 ${accountsFile}（${migrated} 个用户，明文口令）；请执行 node tools/migrate-accounts.mjs 迁移到 ${usersFile}`);
    }
  } else if (store.records.length === 0) {
    warnings.push(`${usersFile}: 用户表存在但为空，仅有环境变量主账号可用`);
  }

  return { accounts, warnings };
}
