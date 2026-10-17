// 身份解析顺序：**会话绑定优先 → 请求作用域门户身份 → 兜底主账号**。
//
// 等价用例来自线上沙箱 `deploy/tools/workdsh-identity-portal/tests/sandbox-verify.mjs`
// （17 项，跑在真实实例上）。这里把它压成进程内测试，保留它守的全部语义：
//   · 启用前的行为不被改变（无身份头 → 兜底主账号）；
//   · 请求作用域内的已验签身份成为**独立主体**，作用域外不受影响；
//   · 已绑定的老会话仍归原所有者（上线不打断历史）—— 绑定压过请求身份；
//   · 授权就绪标记不存在时 fail-closed（不认任何门户身份），避免「人人独立主体却谁都没权限」；
//   · 篡改签名一律拒绝并计数；
//   · 花名册跨重启保留，重启后仍承认既有主体；
//   · 初始化与解析都不抛错（宿主插件加载期抛错会让整棵插件树失败）。
//
// `connection/request` 是官方 waterfall（`@deepseek-ai/dsh-client-connection` 声明），
// 测试用 `ctx.waterfall` 按官方派发方式驱动它，而不是直接调私有方法。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { computePortalSignature, PORTAL_IDENTITY_HEADERS } from 'workdsh-contracts/portal-identity';
import { PortalIdentityService } from '../dist/index.js';

const SECRET = 'identity-bridge-secret-for-tests';
const FALLBACK = 'local-user';
const ORG = 'local-personal';
const EXPIRES = '1770000000000';
const LEGACY_SESSION = 'session-legacy-1';
const NEW_SESSION = 'session-new-1';
const WHOAMI = '/workdsh-identity/whoami';

/** 门户侧签发的身份头（用唯一真源计算，与门户 identity-bridge.mjs 同算法）。 */
function signedHeaders(fields, tamper = false) {
  const signature = computePortalSignature(SECRET, fields);
  const broken = tamper ? `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}` : signature;
  return {
    [PORTAL_IDENTITY_HEADERS.user]: fields.username,
    [PORTAL_IDENTITY_HEADERS.role]: fields.role,
    [PORTAL_IDENTITY_HEADERS.jobRole]: fields.jobRole,
    [PORTAL_IDENTITY_HEADERS.expires]: fields.expires,
    [PORTAL_IDENTITY_HEADERS.signature]: `v1=${broken}`,
  };
}

const alice = { username: 'alice', role: 'user', jobRole: 'sales', expires: EXPIRES };
const bob = { username: 'bob', role: 'admin', jobRole: 'management', expires: EXPIRES };

function makeStorage(bindings = new Map()) {
  const sessions = { get: (key) => bindings.get(key), entries: () => bindings.entries() };
  return {
    get: (name) => (name === 'workdsh_runtime_binding'
      ? { table: (table) => (table === 'sessions' ? sessions : undefined) }
      : undefined),
  };
}

async function makeFixture(prefix = 'workdsh-identity-') {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const secretFile = join(root, 'identity-bridge.key');
  await writeFile(secretFile, `${SECRET}\n`, { mode: 0o600 });
  return { root, secretFile, rosterFile: join(root, 'principals.json'), activationFile: join(root, 'activated') };
}

/** 起一个进程内实例；返回带 `whoami()` / `dispatch()` 的句柄，避免测试里直接摸私有细节。 */
async function boot(fixture, options = {}) {
  const ctx = new Context();
  const routes = new Map();
  ctx.provide('storageDomain', options.storageDomain ?? makeStorage(options.bindings));
  ctx.provide('webServer', {
    register(route) {
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    },
  });
  if (options.captureLogs) {
    // 官方 logger 默认阈值是 1（INFO），WARN(2) 会被过滤掉，必须显式放行到 DEBUG 才看得到告警。
    ctx.logger.exporter({
      levels: { default: 3 },
      export: (message) => options.captureLogs.push(message.args.map((arg) => String(arg)).join(' ')),
    });
  }
  await ctx.plugin(PortalIdentityService, {
    secretFile: fixture.secretFile,
    rosterFile: fixture.rosterFile,
    activationFile: options.activationFile ?? '',
    newSessionProbeId: NEW_SESSION,
    legacySessionProbeId: LEGACY_SESSION,
    ...(options.config ?? {}),
  });

  return {
    ctx,
    routes,
    identity: ctx.workdshIdentity,
    /** 按官方 waterfall 方式派发一次请求；`inside` 在请求作用域内执行。 */
    async dispatch(headers, inside = async () => undefined) {
      const waterfall = ctx.waterfall ?? ctx.events?.waterfall;
      assert.equal(typeof waterfall, 'function', 'cordis 事件服务必须提供 waterfall 派发');
      let observed;
      await waterfall('connection/request', { url: '/api', headers }, {}, async () => {
        observed = await inside();
      });
      return observed;
    },
    /** 直接调用已注册的诊断路由 handler（测试不另起 HTTP 服务）。 */
    async whoami(url = WHOAMI) {
      const path = url.split('?')[0];
      const route = routes.get(path);
      assert.ok(route, `路由 ${path} 必须已注册`);
      assert.equal(route.kind, 'exact');
      const response = {
        statusCode: 0,
        headers: {},
        body: '',
        setHeader(name, value) { this.headers[name] = value; },
        end(chunk) { this.body = String(chunk ?? ''); },
      };
      await route.handler({ url, headers: {} }, response);
      assert.equal(response.statusCode, 200);
      assert.equal(response.headers['cache-control'], 'no-store');
      return JSON.parse(response.body);
    },
  };
}

test('未签名/伪造头的请求：兜底主账号，与启用本模块之前完全一致', async () => {
  const fixture = await makeFixture();
  const app = await boot(fixture);
  try {
    const actor = await app.identity.resolve({});
    assert.equal(actor.principalId, FALLBACK);
    assert.equal(actor.organizationId, ORG);
    assert.equal(actor.resolvedBy, 'workdsh-identity');
    assert.equal(app.identity.profile().membership.role, 'owner');
    assert.equal(app.identity.profile().organization.id, ORG);
    // 从未见过的账号不认账（否则任意字符串都能当成员用）
    assert.equal(app.identity.membership(ORG, 'portal:alice'), undefined);
    assert.equal(app.identity.membership('other-org', FALLBACK), undefined);

    // 无头请求：不增加 rejected 计数
    const insideNoHeader = await app.dispatch({}, async () => (await app.identity.resolve({})).principalId);
    assert.equal(insideNoHeader, FALLBACK);

    // 伪造头（没有签名）：仍然兜底，且被单独计数（排障最需要的信号）
    const forged = await app.dispatch({ [PORTAL_IDENTITY_HEADERS.user]: 'alice' }, async () => (await app.identity.resolve({})).principalId);
    assert.equal(forged, FALLBACK);
    const body = await app.whoami();
    assert.equal(body.bridge.rejected, 1);
    assert.equal(body.bridge.accepted, 0);
    assert.equal(body.signed, false);
  } finally {
    await app.ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('已验签的请求：作用域内成为独立主体，作用域外不受影响', async () => {
  const fixture = await makeFixture();
  const app = await boot(fixture, {
    bindings: new Map([[LEGACY_SESSION, { sessionId: LEGACY_SESSION, organizationId: ORG, ownerPrincipalId: FALLBACK }]]),
  });
  try {
    const inside = await app.dispatch(signedHeaders(alice), async () => {
      const scoped = await app.identity.resolve({});
      return {
        principalId: scoped.principalId,
        requestId: scoped.requestId,
        profile: app.identity.profile().principalId,
        role: app.identity.profile().membership.role,
        state: app.identity.membership(ORG, 'portal:alice')?.state,
        // 未绑定会话也归当前账号 → 工具执行时的自动绑定会绑到它
        newSession: (await app.identity.resolve({ sessionId: NEW_SESSION })).principalId,
      };
    });
    assert.equal(inside.principalId, 'portal:alice');
    assert.equal(inside.profile, 'portal:alice');
    assert.equal(inside.role, 'member');
    assert.equal(inside.state, 'active');
    assert.equal(inside.newSession, 'portal:alice');

    // 作用域外仍是兜底主体：身份不会因为「上一条请求是谁」而漂移
    const outside = await app.identity.resolve({});
    assert.equal(outside.principalId, FALLBACK);
    assert.notEqual(outside.requestId, inside.requestId); // 每次解析都是新的请求上下文

    const body = await app.whoami();
    assert.equal(body.bridge.accepted, 1);
    // 请求内快照：这是「身份真的生效了」的唯一有说服力证据
    assert.equal(body.lastApiIdentity.username, 'alice');
    assert.equal(body.lastApiIdentity.resolvedActor.principalId, 'portal:alice');
    assert.equal(body.lastApiIdentity.profilePrincipalId, 'portal:alice');
    assert.equal(body.lastApiIdentity.membershipState, 'active');
    assert.equal(body.lastApiIdentity.newSessionActor.principalId, 'portal:alice');
    // 已有归属绑定的老会话仍归原所有者：同一请求内两种结果并存，才是「上线不打断历史」的证据
    assert.equal(body.lastApiIdentity.legacySessionActor.principalId, FALLBACK);
  } finally {
    await app.ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('会话归属绑定优先：老会话仍归原所有者，绑定压过请求身份', async () => {
  const fixture = await makeFixture();
  const bindings = new Map([
    [LEGACY_SESSION, { sessionId: LEGACY_SESSION, organizationId: ORG, ownerPrincipalId: FALLBACK }],
    ['session-broken', { sessionId: 'session-broken', organizationId: ORG, ownerPrincipalId: '' }],
  ]);
  const app = await boot(fixture, { bindings });
  try {
    const inside = await app.dispatch(signedHeaders(alice), async () => ({
      bound: await app.identity.resolve({ sessionId: LEGACY_SESSION }),
      unbound: await app.identity.resolve({ sessionId: NEW_SESSION }),
      broken: await app.identity.resolve({ sessionId: 'session-broken' }),
    }));
    // 绑定优先：老会话继续以绑定主体工作，不因引入按账号身份而整体失配
    assert.equal(inside.bound.principalId, FALLBACK);
    assert.equal(inside.bound.sessionId, LEGACY_SESSION);
    assert.equal(inside.unbound.principalId, 'portal:alice');
    // 绑定记录不合法 → 视为「没有绑定」，回落请求作用域身份，而不是信任坏数据
    assert.equal(inside.broken.principalId, 'portal:alice');
    assert.equal(inside.broken.sessionId, 'session-broken');
  } finally {
    await app.ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('激活闸门 fail-closed：授权未就绪时不认任何门户身份', async () => {
  const fixture = await makeFixture();
  const app = await boot(fixture, { activationFile: fixture.activationFile });
  try {
    const blocked = await app.dispatch(signedHeaders(alice), async () => (await app.identity.resolve({})).principalId);
    assert.equal(blocked, FALLBACK, '标记文件不存在时必须退回兜底主体');
    const before = await app.whoami();
    assert.equal(before.activation.ready, false);
    assert.equal(before.secretLoaded, true); // 密钥在，只是闸门没开

    // 标记出现后，同一实例在 2 秒缓存窗口内仍按未就绪处理（有意的限频，避免每请求 stat）
    await writeFile(fixture.activationFile, '{}\n', { mode: 0o600 });
    assert.equal((await app.whoami()).activation.ready, false);
  } finally {
    await app.ctx.fiber.dispose();
  }

  // 新实例（等价于重启后）立即就绪并开始认身份
  const restarted = await boot(fixture, { activationFile: fixture.activationFile });
  try {
    assert.equal((await restarted.whoami()).activation.ready, true);
    const allowed = await restarted.dispatch(signedHeaders(alice), async () => (await restarted.identity.resolve({})).principalId);
    assert.equal(allowed, 'portal:alice');
  } finally {
    await restarted.ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('篡改签名与非法头一律拒绝；密钥缺失时同样不认身份且不抛错', async () => {
  const fixture = await makeFixture();
  const app = await boot(fixture);
  try {
    const tampered = await app.dispatch(signedHeaders({ ...alice, role: 'admin', jobRole: 'management' }, true), async () => (await app.identity.resolve({})).principalId);
    assert.equal(tampered, FALLBACK);
    // 篡改者不能把自己升级成 admin/management：花名册里也不该留下他
    const body = await app.whoami();
    assert.equal(body.bridge.rejected, 1);
    assert.equal(body.rosterSize, 0);

    for (const username of ['ab', 'has space', 'a'.repeat(65)]) {
      const inside = await app.dispatch(signedHeaders({ ...alice, username }), async () => (await app.identity.resolve({})).principalId);
      assert.equal(inside, FALLBACK, `用户名「${username}」不应被接受`);
    }
  } finally {
    await app.ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }

  // 密钥文件不存在：不认身份、不抛错（失败关闭到既有行为），并留下可观测的告警
  const noKey = await makeFixture('workdsh-identity-nokey-');
  const warnings = [];
  const keyless = await boot(noKey, {
    config: { secretFile: join(noKey.root, 'missing.key') },
    captureLogs: warnings,
  });
  try {
    const inside = await keyless.dispatch(signedHeaders(alice), async () => (await keyless.identity.resolve({})).principalId);
    assert.equal(inside, FALLBACK);
    assert.equal((await keyless.whoami()).secretLoaded, false);
    assert.ok(warnings.some((line) => line.includes('共享密钥不可用')));
  } finally {
    await keyless.ctx.fiber.dispose();
    await rm(noKey.root, { recursive: true, force: true });
  }
});

test('密钥晚到：写入后 reloadSecret() 即可认身份，无需重启', async () => {
  const fixture = await makeFixture('workdsh-identity-late-key-');
  const lateFile = join(fixture.root, 'not-yet.key');
  const app = await boot(fixture, { config: { secretFile: lateFile } });
  try {
    assert.equal((await app.whoami()).secretLoaded, false);
    await writeFile(lateFile, `${SECRET}\n`, { mode: 0o600 });
    assert.equal(app.identity.reloadSecret(), true);
    const inside = await app.dispatch(signedHeaders(alice), async () => (await app.identity.resolve({})).principalId);
    assert.equal(inside, 'portal:alice');
  } finally {
    await app.ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('花名册：0600 落盘且跨重启保留，重启后仍承认既有主体', async () => {
  const fixture = await makeFixture();
  const first = await boot(fixture);
  await first.dispatch(signedHeaders(alice), async () => first.identity.resolve({}));
  await first.dispatch(signedHeaders(bob), async () => first.identity.resolve({}));
  await first.ctx.fiber.dispose();

  assert.equal((await stat(fixture.rosterFile)).mode & 0o777, 0o600);
  const persisted = JSON.parse(await readFile(fixture.rosterFile, 'utf8'));
  assert.deepEqual(
    persisted.principals.map((entry) => entry.principalId).sort(),
    ['portal:alice', 'portal:bob'],
  );
  assert.equal(persisted.principals.find((entry) => entry.principalId === 'portal:bob').jobRole, 'management');

  const second = await boot(fixture);
  try {
    // 重启后（无请求作用域）不把任何人当作「当前主体」，但已见主体仍算组织活跃成员
    assert.equal((await second.identity.resolve({})).principalId, FALLBACK);
    assert.equal(second.identity.membership(ORG, 'portal:alice')?.state, 'active');
    assert.equal(second.identity.membership(ORG, 'portal:bob')?.role, 'member');
    assert.equal((await second.whoami()).rosterSize, 2);
  } finally {
    await second.ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('诊断端点：只回显调用者自身；存储不可读时也不阻断解析', async () => {
  const fixture = await makeFixture();
  const bindings = new Map([[LEGACY_SESSION, { sessionId: LEGACY_SESSION, organizationId: ORG, ownerPrincipalId: FALLBACK }]]);
  const app = await boot(fixture, { bindings });
  try {
    const plain = await app.whoami();
    assert.equal(plain.ok, true);
    assert.equal(plain.signed, false);
    assert.equal(plain.scopedIdentity, null);
    assert.equal(plain.resolvedActor.principalId, FALLBACK);
    assert.equal(plain.organization.id, ORG);
    assert.equal(plain.fallbackPrincipalId, FALLBACK);
    assert.equal(plain.requireSignature, true);
    assert.equal(plain.bindingStore.domainResolved, true);
    assert.equal(plain.bindingStore.probeRecord.ownerPrincipalId, FALLBACK);

    const withSession = await app.whoami(`${WHOAMI}?sessionId=${LEGACY_SESSION}`);
    assert.equal(withSession.sessionBinding.ownerPrincipalId, FALLBACK);
    assert.equal(withSession.resolvedActor.sessionId, LEGACY_SESSION);
  } finally {
    await app.ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }

  // 绑定存储整体不可读：诊断如实报错、解析退回兜底，且初始化不抛错
  const broken = await makeFixture('workdsh-identity-broken-');
  const app2 = await boot(broken, {
    storageDomain: { get() { throw new Error('storage-domain-exploded'); } },
  });
  try {
    assert.equal((await app2.identity.resolve({ sessionId: LEGACY_SESSION })).principalId, FALLBACK);
    const body = await app2.whoami();
    assert.equal(body.bindingStore.error, 'storage-domain-exploded');
    assert.equal(body.bindingStore.domainResolved, false);
  } finally {
    await app2.ctx.fiber.dispose();
    await rm(broken.root, { recursive: true, force: true });
  }
});
