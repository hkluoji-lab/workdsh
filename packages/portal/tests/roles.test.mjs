// 岗位角色与权限模型集成测试（P0）。
//
// 真起一个独立门户进程（自带沙箱用户表），走 HTTP 验证：
//   · 岗位角色能落盘、能读回、非法值不静默提权
//   · 「我有哪些权限」本人可读，且与岗位定义一致
//   · 平台角色 admin 是能力超集，不被岗位角色削弱
//   · 权限目录如实标注哪些已强制、哪些仍是声明式
//
// 运行：node tests/roles.test.mjs
//
// 为什么必须真发 HTTP：历史上出过「请求解析漏字段 → role/state 被静默忽略，
// 而测试仍然全绿」的事故。岗位角色同样走 loginFields，必须端到端验。
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { hashPassword } from '../src/users.mjs';
import { CAPABILITIES, JOB_ROLES } from '../src/roles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const portalDir = resolve(here, '..');

const PORT = Number(process.env.PORTAL_ROLES_TEST_PORT ?? 3998);
const BASE = `http://127.0.0.1:${PORT}`;
const SB = resolve(tmpdir(), `portal-roles-${process.pid}`);
rmSync(SB, { recursive: true, force: true });
mkdirSync(SB, { recursive: true });

const USERS_FILE = resolve(SB, 'users.json');
const KEY_FILE = resolve(SB, 'session.key');

const adminHash = await hashPassword('AdminPass12345');
const salesHash = await hashPassword('SalesPass123456');
const plainHash = await hashPassword('PlainPass123456');

writeFileSync(USERS_FILE, JSON.stringify({
  version: 1,
  users: [
    { username: 'admin1', role: 'admin', jobRole: 'management', state: 'active', passwordHash: adminHash, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { username: 'sales1', role: 'user', jobRole: 'sales', state: 'active', passwordHash: salesHash, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    // 老记录形态：没有 jobRole 字段，必须落成「未分配」而不是被默许某些权限。
    { username: 'plain1', role: 'user', state: 'active', passwordHash: plainHash, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
  ],
}, null, 2));

const child = spawn(process.execPath, ['src/server.mjs'], {
  cwd: portalDir,
  env: {
    ...process.env,
    PORTAL_PORT: String(PORT),
    PORTAL_BIND: '127.0.0.1',
    PORTAL_COOKIE_SECURE: '0',
    PORTAL_USERS_FILE: USERS_FILE,
    PORTAL_ACCOUNTS_FILE: resolve(SB, 'accounts.json'),
    PORTAL_SESSION_KEY_FILE: KEY_FILE,
    PORTAL_LOGIN_INFO_FILE: resolve(SB, 'login-info.json'),
    // 身份桥密钥也必须落在沙箱：否则测试会去写生产的 /data/dsh/portal/identity-bridge.key。
    PORTAL_IDENTITY_BRIDGE_KEY: resolve(SB, 'identity-bridge.key'),
    PORTAL_ENV_FILE: resolve(SB, 'portal.env'),
    PORTAL_REGISTRATION: 'invite',
    PORTAL_INVITE_CODE: 'INVITE-2026',
    DSH_AUTH_USERNAME: 'rootadmin',
    DSH_AUTH_PASSWORD: 'RootPass123456',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stderr.on('data', (chunk) => { serverLog += chunk.toString(); });

let pass = 0;
let fail = 0;
const ok = (name, condition, extra = '') => {
  if (condition) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}  ${extra}`); }
};

async function waitReady() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/portal/auth`);
      if (res.status) return true;
    } catch { /* 尚未监听 */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

const cookieOf = (res) => {
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    if (raw.startsWith('dsh_portal_session=')) return raw.split(';')[0];
  }
  return '';
};

async function login(username, password) {
  const res = await fetch(`${BASE}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
  });
  return { status: res.status, cookie: cookieOf(res) };
}

const api = (path, cookie, method = 'GET', body) => fetch(`${BASE}${path}`, {
  method,
  headers: {
    ...(cookie ? { Cookie: cookie } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    Accept: 'application/json',
  },
  body: body ? JSON.stringify(body) : undefined,
  redirect: 'manual',
});

const me = async (cookie) => (await api('/api/portal/me', cookie)).json();
const roles = async (cookie) => (await api('/api/portal/roles', cookie)).json();

try {
  if (!(await waitReady())) throw new Error(`服务未就绪\n${serverLog}`);

  const admin = await login('admin1', 'AdminPass12345');
  const sales = await login('sales1', 'SalesPass123456');
  const plain = await login('plain1', 'PlainPass123456');

  console.log('\n[1] 权限目录的可见性');
  ok('无 Cookie /api/portal/roles 401', (await api('/api/portal/roles', '')).status === 401);
  const catalog = await roles(sales.cookie);
  ok('普通用户可读权限目录（自我视图底座）', catalog.ok === true, JSON.stringify(catalog).slice(0, 120));
  ok('目录含未分配 + 8 个部门岗位', catalog.roles?.length === JOB_ROLES.length + 1, `len=${catalog.roles?.length}`);
  ok('目录含全部能力条目', catalog.capabilities?.length === CAPABILITIES.length, `len=${catalog.capabilities?.length}`);
  ok('能力目录带 enforced 标记', catalog.capabilities?.every((entry) => typeof entry.enforced === 'boolean'));
  const byId = Object.fromEntries((catalog.capabilities ?? []).map((entry) => [entry.id, entry]));
  ok('门户侧已强制的项标注为 enforced', byId['users.manage']?.enforced === true && byId['portal.admin']?.enforced === true);
  ok('DSH 侧未强制的项如实标注为未强制', byId['library.write']?.enforced === false && byId['model.manage']?.enforced === false);

  console.log('\n[2] 岗位角色读回');
  const salesMe = await me(sales.cookie);
  ok('sales1 岗位角色 = sales', salesMe.jobRole === 'sales', `got=${salesMe.jobRole}`);
  ok('sales1 能力含 library.read', salesMe.capabilities?.includes('library.read'));
  ok('sales1 能力不含 users.manage', !salesMe.capabilities?.includes('users.manage'));
  ok('sales1 能力不含 usage.read（财务项）', !salesMe.capabilities?.includes('usage.read'));

  const plainMe = await me(plain.cookie);
  ok('老记录无 jobRole → 未分配', plainMe.jobRole === 'unassigned', `got=${plainMe.jobRole}`);
  ok('未分配 = 零岗位能力（不静默提权）', Array.isArray(plainMe.capabilities) && plainMe.capabilities.length === 0,
    JSON.stringify(plainMe.capabilities));

  const adminMe = await me(admin.cookie);
  ok('admin 能力为全量超集', adminMe.capabilities?.length === CAPABILITIES.length, `len=${adminMe.capabilities?.length}`);

  console.log('\n[3] 管理员指派岗位');
  ok('普通用户不能列账号（403）', (await api('/api/portal/users', sales.cookie)).status === 403);
  const updated = await api('/api/portal/users/update', admin.cookie, 'POST',
    { username: 'sales1', jobRole: 'finance' });
  ok('指派 sales1 → finance 成功', updated.status === 200, `status=${updated.status}`);
  const salesAfter = await me(sales.cookie === '' ? '' : (await login('sales1', 'SalesPass123456')).cookie);
  ok('指派后读回 finance', salesAfter.jobRole === 'finance', `got=${salesAfter.jobRole}`);
  ok('指派后能力随岗位变化（含 billing.manage）', salesAfter.capabilities?.includes('billing.manage'));
  ok('指派后不再含 library.write（岗位已换）', !salesAfter.capabilities?.includes('library.write'));

  // 非法岗位值必须落到「未分配」，绝不能因为拼错就留在原岗位或被当成合法值写入。
  const bogus = await api('/api/portal/users/update', admin.cookie, 'POST',
    { username: 'sales1', jobRole: 'ceo' });
  ok('非法岗位值被接受为请求但归一化', bogus.status === 200, `status=${bogus.status}`);
  const bogusMe = await me((await login('sales1', 'SalesPass123456')).cookie);
  ok('非法岗位值 → 未分配', bogusMe.jobRole === 'unassigned', `got=${bogusMe.jobRole}`);
  ok('非法岗位值不留下任何岗位能力', bogusMe.capabilities?.length === 0);

  const created = await api('/api/portal/users', admin.cookie, 'POST',
    { username: 'legal1', password: 'LegalPass123456', role: 'user', jobRole: 'legal' });
  ok('新建账号可带岗位角色', created.status === 201, `status=${created.status}`);
  const legalMe = await me((await login('legal1', 'LegalPass123456')).cookie);
  ok('新账号岗位 = legal', legalMe.jobRole === 'legal', `got=${legalMe.jobRole}`);
  ok('法务能力含 audit.read、不含 billing.manage',
    legalMe.capabilities?.includes('audit.read') && !legalMe.capabilities?.includes('billing.manage'));

  console.log('\n[4] 落盘与保密');
  const onDisk = readFileSync(USERS_FILE, 'utf8');
  ok('users.json 持久化 jobRole 字段', onDisk.includes('"jobRole"'));
  ok('users.json 含 legal1 且岗位为 legal', /"username": "legal1"[\s\S]{0,120}"jobRole": "legal"/.test(onDisk));
  ok('落盘不含任何明文口令', !onDisk.includes('LegalPass123456') && !onDisk.includes('SalesPass123456'));
  ok('落盘不含 scrypt 哈希本体以外的口令痕迹', !onDisk.includes('"password": "'));
} catch (error) {
  fail += 1;
  console.log(`  FAIL 运行异常  ${error?.message ?? error}`);
  if (serverLog) console.log(`--- 服务端日志 ---\n${serverLog.slice(-2000)}`);
} finally {
  child.kill('SIGKILL');
  rmSync(SB, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
