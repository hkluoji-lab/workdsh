// 门户账号生命周期集成测试（P1）。
//
// 真起一个门户进程，走 HTTP 验证注册、登录、角色与账号增删改停。
// 只使用 Node 内置模块，运行方式：
//   node tests/integration.test.mjs
//
// 覆盖的重点是「参数确实生效」而非仅仅返回 200：
// 角色与状态变更后必须能从 /me 与用户列表读回，否则测试无意义
// （历史上曾因请求解析漏字段，导致 role/state 被静默忽略而测试仍然全绿）。
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { hashPassword } from '../src/users.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const portalDir = resolve(here, '..');

const PORT = Number(process.env.PORTAL_TEST_PORT ?? 3999);
const BASE = `http://127.0.0.1:${PORT}`;
const SB = resolve(tmpdir(), `portal-tests-${process.pid}`);
rmSync(SB, { recursive: true, force: true });
mkdirSync(SB, { recursive: true });

const INVITE = 'INVITE-2026';
const USERS_FILE = resolve(SB, 'users.json');
const ACCOUNTS_FILE = resolve(SB, 'accounts.json');
const KEY_FILE = resolve(SB, 'session.key');

const adminHash = await hashPassword('AdminPass12345');
const userHash = await hashPassword('UserPass123456');
writeFileSync(USERS_FILE, JSON.stringify({
  version: 1,
  users: [
    { username: 'admin1', role: 'admin', state: 'active', passwordHash: adminHash, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { username: 'user1', role: 'user', state: 'active', passwordHash: userHash, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
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
    PORTAL_ACCOUNTS_FILE: ACCOUNTS_FILE,
    PORTAL_SESSION_KEY_FILE: KEY_FILE,
    // 台账也必须指向沙箱：否则会写进生产的 /data/dsh/portal/login-info.json。
    PORTAL_LOGIN_INFO_FILE: resolve(SB, 'login-info.json'),
    // 身份桥密钥也必须落在沙箱：否则测试会去写生产的 /data/dsh/portal/identity-bridge.key。
    PORTAL_IDENTITY_BRIDGE_KEY: resolve(SB, 'identity-bridge.key'),
    // 指向沙箱内不存在的文件：避免读到生产 /data/dsh/portal/portal.env 而污染用例。
    PORTAL_ENV_FILE: resolve(SB, 'portal.env'),
    PORTAL_REGISTRATION: 'invite',
    PORTAL_INVITE_CODE: INVITE,
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
  if (condition) {
    pass += 1;
    console.log(`  PASS ${name}`);
  } else {
    fail += 1;
    console.log(`  FAIL ${name}  ${extra}`);
  }
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

const register = (payload) => fetch(`${BASE}/api/portal/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  body: JSON.stringify(payload),
  redirect: 'manual',
});

const findUser = async (cookie, username) => {
  const list = await (await api('/api/portal/users', cookie)).json();
  return list.users?.find((entry) => entry.username === username) ?? null;
};

try {
  if (!(await waitReady())) throw new Error(`服务未就绪\n${serverLog}`);

  console.log('\n[1] 未认证面');
  ok('无 Cookie 校验端点 401', (await fetch(`${BASE}/api/portal/auth`)).status === 401);
  ok('无 Cookie /api/portal/me 401', (await api('/api/portal/me', '')).status === 401);
  ok('无 Cookie 用户列表 403', (await api('/api/portal/users', '')).status === 403);

  console.log('\n[2] 登录（scrypt 哈希口令）');
  const admin = await login('admin1', 'AdminPass12345');
  ok('管理员登录成功', admin.status === 200 && admin.cookie !== '', `status=${admin.status}`);
  ok('错误口令 401', (await login('admin1', 'WrongPass12345')).status === 401);
  const u1 = await login('user1', 'UserPass123456');
  ok('普通用户登录成功', u1.status === 200 && u1.cookie !== '');
  const root = await login('rootadmin', 'RootPass123456');
  ok('环境变量主账号（明文形态）登录成功', root.status === 200 && root.cookie !== '');
  ok('全角符号输入仍可登录', (await login('admin1', 'ＡｄｍｉｎＰａｓｓ12345')).status === 200);

  console.log('\n[3] 会话与角色');
  ok('管理员 me 角色 admin', (await (await api('/api/portal/me', admin.cookie)).json()).role === 'admin');
  ok('普通用户 me 角色 user', (await (await api('/api/portal/me', u1.cookie)).json()).role === 'user');
  const list = await (await api('/api/portal/users', admin.cookie)).json();
  ok('管理员可列用户（3 个含主账号）', list.users?.length === 3, JSON.stringify(list.users?.map((u) => u.username)));
  ok('列表不泄漏哈希或口令', !JSON.stringify(list).includes('scrypt$') && !JSON.stringify(list).includes('Pass123'));
  ok('普通用户列用户 403', (await api('/api/portal/users', u1.cookie)).status === 403);

  console.log('\n[4] 自助注册（邀请码模式）');
  ok('错误邀请码 403', (await register({ username: 'newbie1', password: 'NewbiePass1234', password2: 'NewbiePass1234', invite: 'WRONG' })).status === 403);
  ok('弱口令 400', (await register({ username: 'newbie1', password: 'short', password2: 'short', invite: INVITE })).status === 400);
  ok('两次口令不一致 400', (await register({ username: 'newbie1', password: 'NewbiePass1234', password2: 'OtherPass12345', invite: INVITE })).status === 400);
  ok('非法用户名 400', (await register({ username: 'bad name!', password: 'NewbiePass1234', password2: 'NewbiePass1234', invite: INVITE })).status === 400);
  ok('正确邀请码注册 201', (await register({ username: 'newbie1', password: 'NewbiePass1234', password2: 'NewbiePass1234', invite: INVITE })).status === 201);
  ok('重复用户名 409', (await register({ username: 'newbie1', password: 'NewbiePass1234', password2: 'NewbiePass1234', invite: INVITE })).status === 409);
  const newbie = await login('newbie1', 'NewbiePass1234');
  ok('新注册账号可登录', newbie.status === 200);
  ok('新注册账号角色为 user', (await (await api('/api/portal/me', newbie.cookie)).json()).role === 'user');

  console.log('\n[5] 管理员创建用户：角色与状态必须真正生效');
  ok('创建普通用户 201', (await api('/api/portal/users', admin.cookie, 'POST', { username: 'madebyadmin', password: 'MadeByAdmin123', role: 'user', state: 'active' })).status === 201);
  ok('创建的管理员账号 201', (await api('/api/portal/users', admin.cookie, 'POST', { username: 'admin2', password: 'AdminTwoPass123', role: 'admin', state: 'active' })).status === 201);
  ok('读回 madebyadmin 角色为 user', (await findUser(admin.cookie, 'madebyadmin'))?.role === 'user');
  ok('读回 admin2 角色为 admin', (await findUser(admin.cookie, 'admin2'))?.role === 'admin');
  const admin2 = await login('admin2', 'AdminTwoPass123');
  ok('新管理员可登录且 me 为 admin', (await (await api('/api/portal/me', admin2.cookie)).json()).role === 'admin');
  ok('新管理员可列用户', (await api('/api/portal/users', admin2.cookie)).status === 200);
  ok('普通用户创建账号 403', (await api('/api/portal/users', newbie.cookie, 'POST', { username: 'x1', password: 'WhateverPass123' })).status === 403);

  console.log('\n[6] 停用 / 改角色 / 改口令：立即生效');
  const madeLogin = await login('madebyadmin', 'MadeByAdmin123');
  ok('被创建账号可登录', madeLogin.status === 200);
  ok('停用用户 200', (await api('/api/portal/users/update', admin.cookie, 'POST', { username: 'madebyadmin', state: 'disabled' })).status === 200);
  ok('停用后状态读回为 disabled', (await findUser(admin.cookie, 'madebyadmin'))?.state === 'disabled');
  ok('停用后旧会话失效', (await api('/api/portal/me', madeLogin.cookie)).status === 401);
  ok('停用后登录被拒 403', (await login('madebyadmin', 'MadeByAdmin123')).status === 403, '停用未生效');

  ok('降级 admin2 为 user 200', (await api('/api/portal/users/update', admin.cookie, 'POST', { username: 'admin2', role: 'user' })).status === 200);
  ok('降级后角色读回为 user', (await findUser(admin.cookie, 'admin2'))?.role === 'user');
  ok('降级后旧会话失效', (await api('/api/portal/me', admin2.cookie)).status === 401);
  const admin2b = await login('admin2', 'AdminTwoPass123');
  ok('降级后重新登录 me 为 user', (await (await api('/api/portal/me', admin2b.cookie)).json()).role === 'user');
  ok('降级后不能再列用户 403', (await api('/api/portal/users', admin2b.cookie)).status === 403);

  const before = await login('user1', 'UserPass123456');
  ok('user1 改密前可登录', before.status === 200);
  ok('管理员重置口令 200', (await api('/api/portal/users/update', admin.cookie, 'POST', { username: 'user1', password: 'BrandNewPass123' })).status === 200);
  ok('重置后旧会话失效', (await api('/api/portal/me', before.cookie)).status === 401);
  ok('旧口令不可登录', (await login('user1', 'UserPass123456')).status === 401);
  ok('新口令可登录', (await login('user1', 'BrandNewPass123')).status === 200);
  ok('管理员自身会话不因改他人而失效', (await api('/api/portal/me', admin.cookie)).status === 200);

  console.log('\n[7] 保护约束');
  ok('环境变量主账号不可删除 403', (await api('/api/portal/users/delete', admin.cookie, 'POST', { username: 'rootadmin' })).status === 403);
  ok('环境变量主账号不可改角色 403', (await api('/api/portal/users/update', admin.cookie, 'POST', { username: 'rootadmin', role: 'user' })).status === 403);
  ok('环境变量主账号不可改口令 403', (await api('/api/portal/users/update', admin.cookie, 'POST', { username: 'rootadmin', password: 'HijackPass12345' })).status === 403);
  ok('环境变量主账号口令未被改动', (await login('rootadmin', 'RootPass123456')).status === 200);
  // 用只剩一个管理员的主账号来验证「最后管理员」保护
  ok('停用另一个管理员 200', (await api('/api/portal/users/update', admin.cookie, 'POST', { username: 'admin1', state: 'disabled' })).status === 200);
  const lastAdminTry = await api('/api/portal/users/update', root.cookie, 'POST', { username: 'rootadmin', role: 'user' });
  ok('最后一个管理员不可自我降级 403（环境账号只读）', lastAdminTry.status === 403, `status=${lastAdminTry.status}`);
  ok('不存在的用户更新 404', (await api('/api/portal/users/update', root.cookie, 'POST', { username: 'ghost', role: 'user' })).status === 404);
  ok('不存在的用户删除 404', (await api('/api/portal/users/delete', root.cookie, 'POST', { username: 'ghost' })).status === 404);

  console.log('\n[8] 删除');
  ok('管理员删除用户 200', (await api('/api/portal/users/delete', root.cookie, 'POST', { username: 'newbie1' })).status === 200);
  ok('删除后旧会话失效', (await api('/api/portal/me', newbie.cookie)).status === 401);
  ok('删除后无法登录', (await login('newbie1', 'NewbiePass1234')).status === 401);
  ok('删除后列表不再包含', (await findUser(root.cookie, 'newbie1')) === null);

  console.log('\n[9] 页面渲染');
  const loginHtml = await (await fetch(`${BASE}/login`)).text();
  const regHtml = await (await fetch(`${BASE}/register`)).text();
  ok('登录页含注册入口', loginHtml.includes('/register'));
  ok('注册页含邀请码字段', regHtml.includes('name="invite"'));
  ok('注册页无未替换占位符', !/\{\{[A-Z]+\}\}/.test(regHtml), regHtml.match(/\{\{[A-Z]+\}\}/)?.[0]);
  ok('登录页无未替换占位符', !/\{\{[A-Z]+\}\}/.test(loginHtml), loginHtml.match(/\{\{[A-Z]+\}\}/)?.[0]);

  console.log('\n[10] 落盘一致性与权限');
  const disk = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
  const names = disk.users.map((u) => u.username).sort();
  ok('磁盘已同步（无 newbie1，含 madebyadmin）', !names.includes('newbie1') && names.includes('madebyadmin'), JSON.stringify(names));
  ok('磁盘无任何明文口令', !/AdminPass|UserPass|NewbiePass|BrandNewPass|MadeByAdmin|AdminTwoPass|RootPass/.test(JSON.stringify(disk)));
  ok('磁盘全部为 scrypt 哈希', disk.users.every((u) => String(u.passwordHash ?? '').startsWith('scrypt$')));
  ok('磁盘不含环境变量主账号', !names.includes('rootadmin'));
  ok('会话密钥文件已生成', existsSync(KEY_FILE));
  ok('会话密钥权限 600', (statSync(KEY_FILE).mode & 0o777) === 0o600, (statSync(KEY_FILE).mode & 0o777).toString(8));
  ok('用户表权限 600', (statSync(USERS_FILE).mode & 0o777) === 0o600, (statSync(USERS_FILE).mode & 0o777).toString(8));

  console.log('\n[11] 登录信息台账');
  const listWithLogin = await (await api('/api/portal/users', root.cookie)).json();
  const byName = Object.fromEntries(listWithLogin.users.map((u) => [u.username, u]));
  ok('列表每条都带登录信息', listWithLogin.users.every((u) => u.login && typeof u.login.loginCount === 'number'));
  ok('admin1 有成功登录记录', byName.admin1?.login?.loginCount >= 1 && Boolean(byName.admin1?.login?.lastLoginAt), JSON.stringify(byName.admin1?.login));
  ok('admin1 记到过失败次数', byName.admin1?.login?.failureCount >= 1, JSON.stringify(byName.admin1?.login));
  ok('来源 IP 按网段掩码', byName.rootadmin?.login?.lastLoginIp === '127.0.0.x', String(byName.rootadmin?.login?.lastLoginIp));
  ok('内置主账号标记为不可编辑', byName.rootadmin?.editable === false);
  ok('持久化用户标记为可编辑', byName.user1?.editable === true);
  ok('管理员排在普通用户之前', listWithLogin.users[0]?.role === 'admin');
  ok('列表仍不泄漏哈希', !JSON.stringify(listWithLogin).includes('scrypt$'));
  ok('台账文件权限 600', (statSync(resolve(SB, 'login-info.json')).mode & 0o777) === 0o600);
  ok('台账不含任何口令', !/Pass123|pass123/.test(readFileSync(resolve(SB, 'login-info.json'), 'utf8')));

  console.log(`\n${pass} passed, ${fail} failed`);
} catch (error) {
  fail += 1;
  console.error('\n测试异常：', error.message);
  console.error('服务端日志：\n', serverLog.slice(-3000));
} finally {
  child.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 300));
  child.kill('SIGKILL');
  rmSync(SB, { recursive: true, force: true });
}
process.exit(fail === 0 ? 0 : 1);
