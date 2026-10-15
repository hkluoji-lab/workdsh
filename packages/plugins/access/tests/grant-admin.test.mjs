// 资源授权面板后端（Host 路由）：验签 → 岗位门槛 → 以**调用者**身份提交授权。
//
// 两道防线各有用例：容器内 127.0.0.1:3080 可达，仅凭「客户端能发一个头」不构成身份依据，
// 所以没有有效签名一律 401；授权动作本身交给 workdshAccess 判定，本服务不做权限判定，
// 也不把 403 伪装成成功。线上件 deploy/tools/workdsh-grant-admin/dist/index.js 的语义逐条对应。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { GrantAdminService } from '../dist/index.js';
import { PORTAL_IDENTITY_HEADERS, computePortalSignature } from '../dist/host/portal-signature.js';

const SECRET = 'grant-admin-bridge-secret';
const OTHER_SECRET = 'not-the-bridge-secret';
const EXPIRES = String(Date.now() + 3_600_000);
const siteOwner = { organizationId: 'local-personal', ownerPrincipalId: 'local-user', scope: 'organization' };

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-grant-admin-'));
  const storageRoot = join(root, 'storages');
  await mkdir(join(storageRoot, 'workdsh_experts', 'experts'), { recursive: true });
  await mkdir(join(storageRoot, 'workdsh_office', 'documents'), { recursive: true });
  await writeFile(
    join(storageRoot, 'workdsh_experts', 'experts', 'expert-a.json'),
    JSON.stringify({ id: 'expert-a', name: '专家A', revision: 'r-1', owner: siteOwner }),
  );
  await writeFile(
    join(storageRoot, 'workdsh_office', 'documents', 'doc-a.json'),
    JSON.stringify({ documentId: 'doc-a', title: '文档A', revision: 'd-1', owner: siteOwner }),
  );
  const rosterFile = join(root, 'principals.json');
  await writeFile(rosterFile, JSON.stringify({
    principals: [
      { principalId: 'portal:alice', username: 'alice', role: 'user', jobRole: 'sales' },
      { principalId: 'portal:bob', username: 'bob', role: 'admin', jobRole: 'management' },
    ],
  }));
  const secretFile = join(root, 'identity-bridge.key');
  await writeFile(secretFile, `${SECRET}\n`, { mode: 0o600 });
  return { root, storageRoot, rosterFile, secretFile };
}

function makeAccess() {
  const grants = new Map();
  const puts = [];
  return {
    grants,
    puts,
    async putGrant(actor, owner, grant, expectedRevision) {
      const current = grants.get(grant.id);
      if (current && expectedRevision === undefined) throw new Error('access/revision-conflict');
      grants.set(grant.id, grant);
      puts.push({ actor, owner, grant });
      return grant;
    },
    async revokeGrant(actor, owner, id) {
      if (!grants.has(id)) throw new Error('access/not-granted');
      grants.delete(id);
      return true;
    },
  };
}

async function boot(fixture, access, overrides = {}) {
  const ctx = new Context();
  const routes = new Map();
  const webServer = { register(route) { routes.set(route.path, route); return () => routes.delete(route.path); } };
  const table = { entries: () => access.grants.entries(), get: (id) => access.grants.get(id) };
  const storageDomain = { get: (name) => (name === 'workdsh_access' ? { table: () => table } : undefined) };
  ctx.provide('workdshAccess', access);
  ctx.provide('workdshIdentity', { profile: () => ({ principalId: 'local-user' }) });
  ctx.provide('storageDomain', storageDomain);
  ctx.provide('webServer', webServer);
  await ctx.plugin(GrantAdminService, {
    organizationId: 'local-personal',
    siteOwnerPrincipalId: 'local-user',
    storageRoot: fixture.storageRoot,
    rosterFile: fixture.rosterFile,
    secretFile: fixture.secretFile,
    adminJobRoles: 'management,operations',
    ...overrides,
  });
  return { ctx, routes };
}

async function call(routes, suffix, { identity, body, url = '' } = {}) {
  const route = routes.get(`/workdsh-grant-admin${suffix}`);
  assert.ok(route, `路由 ${suffix} 未注册`);
  const fields = { username: 'admin1', role: 'admin', jobRole: 'management', expires: EXPIRES, ...(identity ?? {}) };
  const secret = identity?.secret ?? SECRET;
  const headers = identity === null ? {} : {
    [PORTAL_IDENTITY_HEADERS.user]: fields.username,
    [PORTAL_IDENTITY_HEADERS.role]: fields.role,
    [PORTAL_IDENTITY_HEADERS.jobRole]: fields.jobRole,
    [PORTAL_IDENTITY_HEADERS.expires]: fields.expires,
    [PORTAL_IDENTITY_HEADERS.signature]: `v1=${computePortalSignature(secret, fields)}`,
  };
  const response = fakeResponse();
  await route.handler(fakeRequest(headers, body, url), response);
  return { status: response.statusCode, json: response.body === '' ? null : JSON.parse(response.body) };
}

test('密钥不可用 → 503；无签名 → 401；签名不对 → 401（不做无身份放行）', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const { ctx, routes } = await boot(fixture, access, { secretFile: join(fixture.root, 'missing.key') });
  const { ctx: ctx2, routes: routes2 } = await boot(fixture, access);
  const { ctx: ctx3, routes: routes3 } = await boot(fixture, access);
  try {
    const unavailable = await call(routes, '/summary');
    assert.equal(unavailable.status, 503);
    assert.deepEqual(unavailable.json, { ok: false, error: 'bridge-unavailable' });

    const anonymous = await call(routes2, '/summary', { identity: null });
    assert.equal(anonymous.status, 401);
    assert.deepEqual(anonymous.json, { ok: false, error: 'unauthenticated' });

    const forged = await call(routes3, '/summary', { identity: { secret: OTHER_SECRET } });
    assert.equal(forged.status, 401);
    assert.equal(forged.json.error, 'unauthenticated');
  } finally {
    for (const handle of [ctx, ctx2, ctx3]) await handle.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('岗位门槛：普通岗位 403（回显岗位），管理岗位与平台管理员放行', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const { ctx, routes } = await boot(fixture, access);
  try {
    const denied = await call(routes, '/summary', { identity: { role: 'user', jobRole: 'sales' } });
    assert.equal(denied.status, 403);
    assert.deepEqual(denied.json, { ok: false, error: 'forbidden', jobRole: 'sales' });

    const byJobRole = await call(routes, '/summary', { identity: { role: 'user', jobRole: 'management' } });
    assert.equal(byJobRole.status, 200);
    assert.equal(byJobRole.json.caller.principalId, 'portal:admin1');

    const byPlatformRole = await call(routes, '/summary', { identity: { role: 'admin', jobRole: 'unassigned' } });
    assert.equal(byPlatformRole.status, 200);
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('summary：只读枚举资源与花名册，绝不 open 别人的 domain', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const { ctx, routes } = await boot(fixture, access);
  try {
    const response = await call(routes, '/summary');
    assert.equal(response.status, 200);
    assert.equal(response.json.caller.principalId, 'portal:admin1');
    assert.deepEqual(response.json.resources.map((entry) => `${entry.domain}/${entry.id}`), [
      'workdsh-experts/expert-a',
      'office/doc-a',
    ]);
    assert.equal(response.json.resources[0].ownerPrincipalId, 'local-user');
    assert.deepEqual(response.json.subjects.map((entry) => entry.principalId), ['portal:alice', 'portal:bob']);
    assert.deepEqual(response.json.grants, []);
    assert.deepEqual(response.json.allowedActions, ['read', 'use', 'edit', 'manage']);
    assert.deepEqual(response.json.adminJobRoles, ['management', 'operations']);
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('apply：动作白名单过滤、以调用者身份提交、返回签发的 id 与动作', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const { ctx, routes } = await boot(fixture, access);
  try {
    const response = await call(routes, '/apply', {
      body: { domain: 'workdsh-experts', id: 'expert-a', subjectPrincipalId: 'portal:alice', actions: ['read', 'manage', 'bogus'] },
    });
    assert.equal(response.status, 200);
    assert.equal(response.json.ok, true);
    assert.deepEqual(response.json.actions, ['read', 'manage']);
    assert.equal(response.json.resource, 'workdsh-experts/expert-a');
    assert.equal(access.puts.length, 1);
    // 判定交给唯一的授权真源：这里只以调用者身份提交
    assert.equal(access.puts[0].actor.principalId, 'portal:admin1');
    assert.equal(access.puts[0].actor.resolvedBy, 'workdsh-grant-admin');
    assert.deepEqual(access.puts[0].owner, siteOwner);
    assert.equal(access.puts[0].grant.subjectPrincipalId, 'portal:alice');
    assert.deepEqual(access.puts[0].grant.resource, { domain: 'workdsh-experts', id: 'expert-a', revision: 'r-1' });

    // 再次提交同一主体同一资源：带上当前修订号做乐观并发
    const again = await call(routes, '/apply', {
      body: { domain: 'workdsh-experts', id: 'expert-a', subjectPrincipalId: 'portal:alice', actions: ['read'] },
    });
    assert.equal(again.status, 200);
    assert.equal(access.puts[1].grant.id, access.puts[0].grant.id);
    assert.equal(typeof access.puts[1].actor.principalId, 'string');
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('apply 负例：无有效动作 / 缺主体 / 资源不存在 / 坏请求体', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const { ctx, routes } = await boot(fixture, access);
  try {
    const noActions = await call(routes, '/apply', {
      body: { domain: 'workdsh-experts', id: 'expert-a', subjectPrincipalId: 'portal:alice', actions: ['bogus'] },
    });
    assert.equal(noActions.status, 400);
    assert.equal(noActions.json.error, 'no-valid-actions');

    const noSubject = await call(routes, '/apply', {
      body: { domain: 'workdsh-experts', id: 'expert-a', actions: ['read'] },
    });
    assert.equal(noSubject.status, 400);
    assert.equal(noSubject.json.error, 'missing-subject');

    const noResource = await call(routes, '/apply', {
      body: { domain: 'workdsh-experts', id: 'nope', subjectPrincipalId: 'portal:alice', actions: ['read'] },
    });
    assert.equal(noResource.status, 404);
    assert.equal(noResource.json.error, 'resource-not-found');

    const malformed = await call(routes, '/apply', { body: '{not json' });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.json.error, 'malformed');

    assert.equal(access.puts.length, 0);
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('revoke：已知授权按当前修订撤销；未知 grantId 返回 404 而不是假成功', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  access.grants.set('grant-a', {
    id: 'grant-a',
    organizationId: 'local-personal',
    subjectPrincipalId: 'portal:alice',
    resource: { domain: 'workdsh-experts', id: 'expert-a', revision: 'r-1' },
    actions: ['read'],
    revision: 'grant-rev-1',
  });
  const { ctx, routes } = await boot(fixture, access);
  try {
    const revoked = await call(routes, '/revoke', { body: { grantId: 'grant-a' } });
    assert.equal(revoked.status, 200);
    assert.deepEqual(revoked.json, { ok: true, revoked: 'grant-a' });

    const missing = await call(routes, '/revoke', { body: { grantId: 'grant-a' } });
    assert.equal(missing.status, 404);
    assert.equal(missing.json.error, 'not-found');
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

function fakeRequest(headers, body, url = '/') {
  const listeners = { data: [], end: [], error: [] };
  const request = {
    headers,
    url,
    on(event, handler) {
      (listeners[event] ??= []).push(handler);
      return request;
    },
    destroy() {},
  };
  queueMicrotask(() => {
    if (typeof body === 'string') listeners.data.forEach((handler) => handler(body));
    else if (body !== undefined) listeners.data.forEach((handler) => handler(JSON.stringify(body)));
    listeners.end.forEach((handler) => handler());
  });
  return request;
}

function fakeResponse() {
  const response = { statusCode: 0, headers: {}, body: '' };
  response.setHeader = (name, value) => { response.headers[name] = value; };
  response.end = (chunk) => { response.body = String(chunk ?? ''); };
  return response;
}
