// 配置装载：只读环境变量与账号表，不读取或写入任何业务数据。
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeCredential } from './session.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const moduleDir = resolve(here, '..');
export const repoRoot = resolve(moduleDir, '..', '..');

export function loadConfig(env = process.env) {
  return {
    bind: env.PORTAL_BIND ?? '127.0.0.1',
    port: Number(env.PORTAL_PORT ?? 3083),
    // 与官方 dsh Web 共用同一组口令；门户不注册、不修改、不落库。
    username: (env.DSH_AUTH_USERNAME ?? '').trim(),
    password: env.DSH_AUTH_PASSWORD ?? '',
    // 额外账号表。环境变量不适合承载列表，且容器 compose 的 environment 列表会在应用升级时被模板覆盖，
    // 因此额外账号放门户自己的数据目录；默认与门户模块同目录，可用 PORTAL_ACCOUNTS_FILE 覆盖。
    accountsFile: resolve(env.PORTAL_ACCOUNTS_FILE ?? resolve(moduleDir, 'accounts.json')),
    sessionTtlMs: Number(env.PORTAL_SESSION_TTL_HOURS ?? 12) * 3600 * 1000,
    // 浏览器侧是 HTTPS（Cloudflare 边缘）；本机 http 预览时用 PORTAL_COOKIE_SECURE=0 关闭。
    cookieSecure: env.PORTAL_COOKIE_SECURE !== '0',
    siteDir: resolve(moduleDir, 'site'),
    // 只引用仓库内已发布的真实应用截图，不复制第二份二进制素材。
    assetsDir: env.PORTAL_ASSETS_DIR ? resolve(env.PORTAL_ASSETS_DIR) : resolve(repoRoot, 'website', 'assets'),
    throttle: { windowMs: 15 * 60 * 1000, maxFailures: 10 },
  };
}

// 账号表：主账号复用官方同一组环境变量，额外账号来自 accounts.json（`{ "accounts": [{ "username", "password" }] }`）。
// 用户名与口令都归一化后再入库，登录比较、会话归属与会话签名口径因此完全一致。
// 账号表读不到或写坏时只登记告警并继续：门禁保持可用，主账号仍可登录，不会因配置错误把整站锁死。
export function loadAccounts({ username, password, accountsFile }) {
  const accounts = new Map();
  const warnings = [];
  const add = (name, secret, source) => {
    const user = normalizeCredential(name);
    const pass = normalizeCredential(secret);
    if (user === '' || pass === '') {
      warnings.push(`${source}: 用户名或口令为空，已跳过`);
      return;
    }
    if (accounts.has(user)) {
      warnings.push(`${source}: 用户名 ${user} 已存在，已跳过`);
      return;
    }
    accounts.set(user, pass);
  };

  // 官方那组口令完全未配置属正常形态（服务端另有专门的未配置告警），只有"配了一半"才算配置错误。
  if (normalizeCredential(username) !== '' || normalizeCredential(password) !== '') {
    add(username, password, 'DSH_AUTH_USERNAME/DSH_AUTH_PASSWORD');
  }

  let raw;
  try {
    raw = readFileSync(accountsFile, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') warnings.push(`${accountsFile}: 读取失败（${error?.code ?? error?.message}）`);
    return { accounts, warnings };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    warnings.push(`${accountsFile}: 不是合法 JSON，额外账号已忽略`);
    return { accounts, warnings };
  }
  if (!Array.isArray(parsed?.accounts)) {
    warnings.push(`${accountsFile}: 缺少 accounts 数组，额外账号已忽略`);
    return { accounts, warnings };
  }
  for (const [index, entry] of parsed.accounts.entries()) {
    if (!entry || typeof entry !== 'object') {
      warnings.push(`${accountsFile}: accounts[${index}] 不是对象，已跳过`);
      continue;
    }
    add(entry.username, entry.password, `${accountsFile}: accounts[${index}]`);
  }
  return { accounts, warnings };
}
