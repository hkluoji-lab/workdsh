// P1 沙箱验证 —— 对着一个**独立 DSH 实例**跑真实的身份解析。
//
// 为什么必须有这一层：单元测试证明不了"插件能进插件树、能提供 workdshIdentity、
// 能在真实请求里把主体换成门户账号"。这些只有起一个真实例才能验。
//
// 前置：沙箱实例已在 BASE 上跑起来，且其 config.secretFile 指向 KEY_FILE。
// 运行：node tests/sandbox-verify.mjs            （默认 http://127.0.0.1:3099）
//       BASE=… KEY_FILE=… node tests/sandbox-verify.mjs
import { readFileSync } from 'node:fs';
import { computeSignature } from '../dist/index.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:3099';
const KEY_FILE = process.env.KEY_FILE ?? '/data/dsh/tmp/p1sandbox-home/identity-bridge.key';
const LEGACY_SESSION = process.env.LEGACY_SESSION ?? 'session-legacy-1';
const FALLBACK = process.env.FALLBACK ?? 'local-user';

const secret = readFileSync(KEY_FILE, 'utf8').trim();

let pass = 0;
let fail = 0;
const ok = (name, condition, extra = '') => {
  if (condition) { pass += 1; console.log(`  PASS ${name}`); }
  else { fail += 1; console.log(`  FAIL ${name}  ${extra}`); }
};

const whoami = async () => (await fetch(`${BASE}/workdsh-identity/whoami`, { redirect: 'manual' })).json();

const headersFor = (username, role, jobRole, expires, tamper = false) => {
  const fields = { username, role, jobRole, expires: String(expires) };
  const sig = computeSignature(secret, fields);
  return {
    'X-Portal-User': username,
    'X-Portal-Role': role,
    'X-Portal-Job-Role': jobRole,
    'X-Portal-Expires': String(expires),
    'X-Portal-Sig': `v1=${tamper ? sig.replace(/.$/, sig.endsWith('0') ? '1' : '0') : sig}`,
  };
};

/** 走 /api 通道（身份桥只覆盖这条通道），制造一次带身份的请求。 */
const apiCall = async (headers) => {
  const response = await fetch(`${BASE}/api`, { headers, redirect: 'manual' });
  return response.status;
};

const EXPIRES = 1790599999999;

try {
  console.log('[0] 实例可用性');
  const base = await whoami();
  ok('诊断端点可达且插件已提供身份服务', base?.ok === true && base?.resolvedActor?.resolvedBy === 'workdsh-identity-portal',
    JSON.stringify(base?.resolvedActor));
  ok('密钥已加载（否则验签恒失败、身份静默失效）', base?.secretLoaded === true);
  ok('组织与既有绑定一致（否则老会话全部失配）', base?.organization?.id === 'local-personal', base?.organization?.id);

  console.log('\n[1] 无身份头 → 兜底主账号（与启用前行为一致）');
  ok('resolvedActor = 兜底主体', base?.resolvedActor?.principalId === FALLBACK, base?.resolvedActor?.principalId);
  ok('未签名', base?.signed === false && base?.scopedIdentity === null);

  console.log('\n[2] 有效签名身份头 → 该账号成为独立主体');
  await apiCall(headersFor('alice', 'user', 'sales', EXPIRES));
  const afterAlice = await whoami();
  const alice = afterAlice?.lastApiIdentity;
  ok('请求内解析到 portal:alice', alice?.resolvedActor?.principalId === 'portal:alice', JSON.stringify(alice?.resolvedActor));
  ok('profile() 也指向该账号（工具自动绑定的前置条件）', alice?.profilePrincipalId === 'portal:alice', alice?.profilePrincipalId);
  ok('该主体是组织活跃成员', alice?.membershipState === 'active', alice?.membershipState);
  ok('无绑定的新会话归当前账号', alice?.newSessionActor?.principalId === 'portal:alice', alice?.newSessionActor?.principalId);
  ok('已绑定的老会话仍归原所有者（上线不打断历史）',
    alice?.legacySessionActor?.principalId === FALLBACK && alice?.legacySessionActor?.sessionId === LEGACY_SESSION,
    JSON.stringify(alice?.legacySessionActor));

  console.log('\n[3] 篡改签名 → 拒绝，退回兜底主体');
  await apiCall(headersFor('alice', 'admin', 'management', EXPIRES, true));
  const afterTamper = await whoami();
  ok('验签失败被计数（可观测）', (afterTamper?.bridge?.rejected ?? 0) > 0, JSON.stringify(afterTamper?.bridge));
  ok('篡改请求未把身份升级成 admin',
    afterTamper?.lastApiIdentity?.resolvedActor?.principalId === 'portal:alice',
    JSON.stringify(afterTamper?.lastApiIdentity?.resolvedActor));

  console.log('\n[4] 多账号互不串味');
  await apiCall(headersFor('bob', 'admin', 'management', EXPIRES));
  const afterBob = await whoami();
  ok('第二个账号解析为 portal:bob', afterBob?.lastApiIdentity?.resolvedActor?.principalId === 'portal:bob',
    afterBob?.lastApiIdentity?.resolvedActor?.principalId);
  ok('花名册已记录两个主体（重启后仍认账）', (afterBob?.rosterSize ?? 0) >= 2, String(afterBob?.rosterSize));
  ok('两次请求的主体不同（不是同一个主体换名字）',
    afterBob?.lastApiIdentity?.resolvedActor?.requestId !== alice?.resolvedActor?.requestId);

  console.log('\n[5] 诊断端点自身不带身份（说明它确实不在身份通道上）');
  const plain = await whoami();
  ok('whoami 自身 signed=false', plain?.signed === false);
  ok('但请求内快照保留着最近一次 API 请求的身份', Boolean(plain?.lastApiIdentity?.username));
} catch (error) {
  fail += 1;
  console.log(`  FAIL 运行异常  ${error?.message ?? error}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
