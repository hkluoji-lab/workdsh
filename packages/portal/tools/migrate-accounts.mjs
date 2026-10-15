#!/usr/bin/env node
// 一次性迁移：把旧账号表（accounts.json，明文口令）迁移为持久化用户表（users.json，scrypt 哈希）。
//
// 安全默认：
//   * users.json 已存在时拒绝执行（除非 --force），避免覆盖掉线上已改过的用户表；
//   * 迁移前把 accounts.json 原样备份为 accounts.json.bak.migrate.<时间戳>；
//   * 写盘走原子替换，并在成功后校验哈希可回验一次。
//
// 用法：
//   node tools/migrate-accounts.mjs                 # 正式迁移
//   node tools/migrate-accounts.mjs --dry-run       # 只打印将要迁移的账号名，不写盘
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashPassword, verifyHash, writeUserStore, readUserStore } from '../src/users.mjs';
import { normalizeCredential } from '../src/session.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const moduleDir = resolve(here, '..');
const accountsFile = resolve(process.env.PORTAL_ACCOUNTS_FILE ?? resolve(moduleDir, 'accounts.json'));
const usersFile = resolve(process.env.PORTAL_USERS_FILE ?? resolve(moduleDir, 'users.json'));
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');

const now = new Date().toISOString();

if (existsSync(usersFile) && !force) {
  console.error(`拒绝执行：${usersFile} 已存在。迁移只在首次启用时运行一次。`);
  console.error('若确认要用旧表覆盖，请显式加 --force（会丢弃现有用户表内容）。');
  process.exit(2);
}

if (!existsSync(accountsFile)) {
  console.error(`未找到旧账号表 ${accountsFile}，无需迁移。`);
  process.exit(0);
}

let parsed;
try {
  parsed = JSON.parse(readFileSync(accountsFile, 'utf8'));
} catch (error) {
  console.error(`旧账号表不是合法 JSON：${error.message}`);
  process.exit(1);
}
const entries = Array.isArray(parsed?.accounts) ? parsed.accounts : [];
if (entries.length === 0) {
  console.error('旧账号表里没有可迁移的账号。');
  process.exit(0);
}

const records = [];
for (const [index, entry] of entries.entries()) {
  if (!entry || typeof entry !== 'object') {
    console.warn(`accounts[${index}] 不是对象，已跳过`);
    continue;
  }
  const username = normalizeCredential(entry.username);
  const password = normalizeCredential(entry.password);
  if (username === '' || password === '') {
    console.warn(`accounts[${index}] 用户名或口令为空，已跳过`);
    continue;
  }
  if (records.some((record) => record.username === username)) {
    console.warn(`${username} 重复，已跳过后者`);
    continue;
  }
  records.push({ username, password });
}

if (dryRun) {
  console.log(`[dry-run] 将迁移 ${records.length} 个账号到 ${usersFile}：`);
  for (const record of records) console.log(`  - ${record.username}（口令 ${record.password.length} 位 → scrypt 哈希）`);
  process.exit(0);
}

const persisted = [];
for (const { username, password } of records) {
  const stored = await hashPassword(password);
  // 自检：写盘前确认哈希确实能回验，避免把打不开的账号写进线上。
  if (!(await verifyHash(password, stored))) {
    console.error(`${username}: 哈希自检失败，已中止，未写入任何内容。`);
    process.exit(1);
  }
  persisted.push({
    username,
    role: 'user',
    state: 'active',
    verify: { kind: 'scrypt', stored },
    source: usersFile,
    createdAt: now,
    createdBy: 'migrate-accounts',
    updatedAt: now,
  });
  console.log(`${username}: 已生成 scrypt 哈希（口令长度 ${password.length}）`);
}

const backup = `${accountsFile}.bak.migrate.${Date.now()}`;
copyFileSync(accountsFile, backup);
writeUserStore(usersFile, persisted);

// 读回来再确认一次：确保写出的文件真的能被加载层解析。
const check = readUserStore(usersFile);
const names = check.records.map((record) => record.username);
const missing = records.filter((record) => !names.includes(record.username));
if (missing.length > 0 || check.warnings.length > 0) {
  console.error('写盘后校验失败，请从备份恢复：');
  for (const warning of check.warnings) console.error(`  - ${warning}`);
  for (const record of missing) console.error(`  - 缺失用户：${record.username}`);
  process.exit(1);
}

console.log(`\n完成：${persisted.length} 个账号已写入 ${usersFile}`);
console.log(`旧文件已备份为 ${backup}`);
console.log('下一步：重启门户进程，然后从门户登录验证。旧 accounts.json 已不再被读取。');
