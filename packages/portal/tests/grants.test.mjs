// 资源授权管理（A 方案缺口 1）端到端验证。
//
// 链路：门户会话 → /api/portal/grants*（requireAdmin）→ 带**已签名**身份头转发到
//       DSH /workdsh-grant-admin/* → workdshAccess.putGrant（以调用者身份）
//       → 再用授权探针确认"授予真的生效了"。
//
// 前置：沙箱 DSH 已在 3099 跑起来（含 workdsh-grant-admin），且门户用同一密钥。
// 运行：node tests/grants.test.mjs
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { hashPassword } from '../src/users.mjs';
import { loadOrCreateBridgeSecret, signedIdentityHeaders } from '../src/identity-bridge.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const portalDir = resolve(here, '..');

const PORT = Number(process.env.PORTAL_GRANTS_TEST_PORT ?? 3997);
const BASE = `http://127.0.0.1:${PORT}`;
const DSH = process.env.SANDBOX_DSH ?? 'http://127.0.0.1:3099';
const KEY = process.env.SANDBOX_KEY ?? '/data/dsh/tmp/p1sandbox-home/identity-bridge.key';
const RESOURCE = 'document-review-advisor';
const SUBJECT = 'portal:alice'; // 已在沙箱花名册里的主体

// 沙箱前置：本用例是端到端链路验证，需要 127.0.0.1:3099 上跑着含 workdsh-grant-admin /
// workdsh-access-probe 的 DSH 沙箱。沙箱不在（本地开发机、默认 CI 环境）时优雅跳过，
// 避免把「环境缺失」误报成回归；用 SANDBOX_DSH 指定沙箱地址即可正常跑满。
const sandboxReachable = await (async () => {
  try { const r = await fetch(`${DSH}/api`); return Boolean(r.status); } catch { return false; }
})();
if (!sandboxReachable) {
  console.log(`SKIP 沙箱 DSH 未在 ${DSH} 运行；grants 端到端用例需要沙箱，已跳过。`);
  process.exit(0);
}

const SB = resolve(tmpdir(), `portal-grants-${process.pid}`);
rmSync(SB, { recursive: true, force: true });
mkdirSync(SB, { recursive: true });
const USERS_FILE = resolve(SB, 'users.json');

const adminHash = await hashPassword('AdminPass12345');
const userHash = await hashPassword('UserPass123456');
writeFileSync(USERS_FILE, JSON.stringify({
  version: 1,
  users: [
    { username: 'admin1', role: 'admin', jobRole: 'management', state: 'active', passwordHash: adminHash, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
    { username: 'user1', role: 'user', jobRole: 'sales', state: 'active', passwordHash: userHash, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
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
    PORTAL_SESSION_KEY_FILE: resolve(SB, 'session.key'),
    PORTAL_LOGIN_INFO_FILE: resolve(SB, 'login-info.json'),
    PORTAL_ENV_FILE: resolve(SB, 'portal.env'),
    PORTAL_IDENTITY_BRIDGE_KEY: KEY,
    // 关键：把门户指向沙箱实例，而不是生产 3080
    PORTAL_DSH_ORIGIN: DSH,
    PORTAL_REGISTRATION: 'invite',
    PORTAL_INVITE_CODE: 'INVITE-2026',
    DSH_AUTH_USERNAME: 'rootadmin',
    DSH_AUTH_PASSWORD: 'RootPass123456',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = '';
child.stderr.on('data', (c) => { serverLog += c.toString(); });

let pass = 0;
let fail = 0;
const ok = (name, condition, extra = '') => {
  if (condition) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}  ${extra}`); }
};

async function waitReady() {
  for (let i = 0; i < 80; i += 1) {
    try { const r = await fetch(`${BASE}/api/portal/auth`); if (r.status) return true; } catch { /* 未监听 */ }
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
const login = async (username, password) => {
  const res = await fetch(`${BASE}/api/portal/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
    redirect: 'manual',
  });
  return cookieOf(res);
};
const api = (path, cookie, method = 'GET', body) => fetch(`${BASE}${path}`, {
  method,
  headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), Accept: 'application/json' },
  body: body ? JSON.stringify(body) : undefined,
  redirect: 'manual',
});
const probe = async (action) => (await (await fetch(
  `${DSH}/workdsh-access-probe/run?subject=${encodeURIComponent(SUBJECT)}&action=${action}&resourceId=${RESOURCE}`,
)).json())?.asSubject;

try {
  if (!(await waitReady())) throw new Error(`门户未就绪\n${serverLog}`);

  const admin = await login('admin1', 'AdminPass12345');
  const user = await login('user1', 'UserPass123456');
  ok('管理员登录成功', admin !== '');
  ok('普通用户登录成功', user !== '');

  console.log('\n[1] 门户门槛');
  ok('无会话 → 403', (await api('/api/portal/grants', '')).status === 403);
  ok('普通用户 → 403', (await api('/api/portal/grants', user)).status === 403);

  // 让沙箱 DSH 认识这个调用者：生产环境里 Caddy 的 forward_auth 会在**每个请求**上
  // 带上签名身份，因此主体在首次访问时就进入花名册；这里必须显式模拟这一步，
  // 否则访问层会以 access/inactive-membership 拒绝一个"从没见过的"主体。
  const secret = loadOrCreateBridgeSecret(KEY);
  const seed = await fetch(`${DSH}/api`, {
    headers: signedIdentityHeaders(secret, {
      user: 'admin1', role: 'admin', jobRole: 'management', expires: '1790599999999',
    }),
  });
  ok('调用者身份已被 DSH 记录（模拟 forward_auth 首次访问）', seed.status === 404 || seed.status === 200,
    `status=${seed.status}`);

  // 新主体出现后，ensure 循环会立刻收敛（花名册 watch），给管理岗位补上 manage 授权。
  // 这里轮询等它落地——而不是 sleep 一个固定值，避免把测试写成时序脆弱。
  let callerCanManage = false;
  for (let i = 0; i < 15; i += 1) {
    const decision = await (await fetch(
      `${DSH}/workdsh-access-probe/run?subject=portal:admin1&action=manage&resourceId=${RESOURCE}`,
    )).json();
    callerCanManage = decision?.asSubject?.effect === 'allow';
    if (callerCanManage) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  ok('新出现的管理岗位被自动授予 manage（无需等一个完整周期）', callerCanManage);

  console.log('\n[2] 管理员读摘要（转发到 DSH 并验签）');
  const summaryRes = await api('/api/portal/grants', admin);
  const summary = await summaryRes.json();
  ok('摘要 200', summaryRes.status === 200, JSON.stringify(summary).slice(0, 160));
  ok('DSH 侧认得调用者身份', summary?.caller?.principalId === 'portal:admin1', JSON.stringify(summary?.caller));
  ok('摘要含资源与主体清单', Array.isArray(summary?.resources) && summary.resources.length > 0
    && Array.isArray(summary?.subjects) && summary.subjects.length > 0,
    `resources=${summary?.resources?.length} subjects=${summary?.subjects?.length}`);

  console.log('\n[3] 授权生效（以管理员身份提交，判定在 DSH）');
  await api('/api/portal/grants/revoke', admin, 'POST', { grantId: `grant-workdsh-experts-${RESOURCE}-${SUBJECT.replace(/[^a-zA-Z0-9_-]/g, '-')}` });
  await fetch(`${DSH}/workdsh-access-probe/run?subject=${encodeURIComponent(SUBJECT)}&resourceId=${RESOURCE}&revoke=1`);
  const before = await probe('edit');
  ok('授权前 edit 被拒', before?.effect === 'deny', JSON.stringify(before));

  const granted = await api('/api/portal/grants/apply', admin, 'POST', {
    subjectPrincipalId: SUBJECT, domain: 'workdsh-experts', id: RESOURCE, actions: ['edit'],
  });
  const grantedBody = await granted.json();
  ok('授予 edit 成功', granted.status === 200 && grantedBody?.ok === true, JSON.stringify(grantedBody).slice(0, 160));

  const after = await probe('edit');
  ok('授权后 edit 放行（真源仍是 DSH 访问层）', after?.effect === 'allow' && after?.code === 'access/explicit-grant',
    JSON.stringify(after));

  console.log('\n[4] 撤销');
  const revoked = await api('/api/portal/grants/revoke', admin, 'POST', { grantId: grantedBody.id });
  ok('撤销成功', revoked.status === 200, `status=${revoked.status}`);
  const afterRevoke = await probe('edit');
  ok('撤销后 edit 重新被拒', afterRevoke?.effect === 'deny', JSON.stringify(afterRevoke));

  console.log('\n[5] 越权与伪造');
  const forged = await fetch(`${BASE}/api/portal/grants`, { headers: { Cookie: admin, 'X-Portal-Job-Role': 'management' } });
  ok('伪造请求头对门户无效（身份由门户签发，不由客户端声明）', forged.status === 200);
  const badSig = await fetch(`${DSH}/workdsh-grant-admin/summary`, {
    headers: {
      'X-Portal-User': 'admin1', 'X-Portal-Role': 'admin', 'X-Portal-Job-Role': 'management',
      'X-Portal-Expires': '1790599999999', 'X-Portal-Sig': 'v1=deadbeef',
    },
  });
  ok('直连 DSH 伪造签名 → 401', badSig.status === 401, `status=${badSig.status}`);
} catch (error) {
  fail += 1;
  console.log(`  FAIL 运行异常  ${error?.message ?? error}`);
  if (serverLog) console.log(`--- 服务端日志 ---\n${serverLog.slice(-1500)}`);
} finally {
  child.kill('SIGKILL');
  rmSync(SB, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
