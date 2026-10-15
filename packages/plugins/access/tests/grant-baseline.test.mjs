// 迁移工具（基线授权签发）：默认 dry-run、幂等收敛、管理岗位超集、只回收自己签发的授权。
//
// 等价用例来自线上沙箱 deploy/tools/workdsh-grant-baseline/tests/baseline-verify.mjs；
// 那支脚本跑在真实实例上，这里压成进程内测试，保留它守的全部语义：
//   · **默认 dry-run**（不带 apply 只统计不写盘）——这是切主体时的安全闸门；
//   · 管理岗位发超集并带 `-mgr` 后缀（不与基线授权互相覆盖）；
//   · 重跑幂等（修订号只由动作集合决定）；
//   · 回收只认 `baseline-` 前缀，不碰别人给的授权。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { GrantBaselineService } from '../dist/index.js';

const SITE_OWNER = 'local-user';
const siteOwner = { organizationId: 'local-personal', ownerPrincipalId: SITE_OWNER, scope: 'organization' };

async function makeFixture() {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-baseline-'));
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
      { principalId: 'portal:alice', username: 'alice', role: 'user', jobRole: 'sales', state: 'active' },
      { principalId: 'portal:bob', username: 'bob', role: 'admin', jobRole: 'management', state: 'active' },
      { principalId: 'portal:gone', username: 'gone', role: 'user', jobRole: 'sales', state: 'suspended' },
    ],
  }));
  return { root, storageRoot, rosterFile };
}

function makeAccess() {
  const grants = new Map();
  const puts = [];
  const revokes = [];
  return {
    grants,
    puts,
    revokes,
    async putGrant(actor, owner, grant, expectedRevision) {
      const current = grants.get(grant.id);
      if (current && expectedRevision === undefined) throw new Error('access/revision-conflict');
      grants.set(grant.id, grant);
      puts.push({ actor, owner, grant });
      return grant;
    },
    async revokeGrant(actor, owner, id) {
      if (!grants.has(id)) throw new Error('access/not-found');
      grants.delete(id);
      revokes.push({ actor, owner, id });
      return true;
    },
  };
}

function makeStubs(access, grants) {
  const routes = new Map();
  const webServer = {
    register(route) {
      routes.set(route.path, route);
      return () => routes.delete(route.path);
    },
  };
  const table = { entries: () => grants.entries(), get: (id) => grants.get(id) };
  const storageDomain = { get: (name) => (name === 'workdsh_access' ? { table: () => table } : undefined) };
  const identity = { resolve: async () => ({ principalId: SITE_OWNER }) };
  return { routes, webServer, storageDomain, identity };
}

async function boot(fixture, access, options = {}) {
  const ctx = new Context();
  const stubs = makeStubs(access, access.grants);
  const config = {
    storageRoot: fixture.storageRoot,
    rosterFile: fixture.rosterFile,
    skillsRoot: join(fixture.root, 'no-skills'),
    connectorFile: join(fixture.root, 'no-connectors.json'),
    manageJobRoles: 'management,operations',
    ensureIntervalMs: 0,
    changeDebounceMs: 0,
    rosterWatchMs: 0,
    ensureOnStartMs: 0,
    ...(options.config ?? {}),
  };
  ctx.provide('workdshAccess', access);
  ctx.provide('workdshIdentity', stubs.identity);
  ctx.provide('storageDomain', stubs.storageDomain);
  ctx.provide('webServer', stubs.webServer);
  await ctx.plugin(GrantBaselineService, config);
  return { ctx, stubs, config };
}

test('默认 dry-run：只统计不写盘，且不签发任何 grant', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const { ctx } = await boot(fixture, access);
  try {
    const result = await ctx.workdshGrantBaseline.ensure({});
    assert.equal(result.mode, 'dry-run');
    assert.equal(access.puts.length, 0);
    // 2 条真实记录 + 2 条域级（workdsh-skills / workdsh-connectors 的 '*'）
    assert.equal(result.counts.resources, 4);
    assert.equal(result.counts.ownedBySite, 4);
    assert.equal(result.counts.planned, 8); // 4 资源 × 2 个活跃主体
    assert.equal(result.counts.pending, 8);
    assert.equal(result.counts.created, 0);
    assert.deepEqual(result.principals, ['portal:alice', 'portal:bob']);
    assert.equal(result.ok, true);
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('apply：按花名册签发基线 grant，管理岗位拿超集并带 -mgr 后缀', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const activationFile = join(fixture.root, 'activated');
  const { ctx } = await boot(fixture, access, { config: { activationFile } });
  try {
    const result = await ctx.workdshGrantBaseline.ensure({ apply: true, trigger: 'test' });
    assert.equal(result.mode, 'apply');
    assert.equal(result.counts.created, 8);
    assert.equal(result.counts.failed, 0);
    assert.deepEqual(result.errors, []);

    const alice = access.grants.get('baseline-workdsh-experts-expert-a-portal-alice');
    const bob = access.grants.get('baseline-workdsh-experts-expert-a-portal-bob-mgr');
    assert.deepEqual(alice.actions, ['read', 'use']);
    assert.deepEqual(bob.actions, ['read', 'use', 'edit', 'manage']);
    assert.equal(alice.subjectPrincipalId, 'portal:alice');
    assert.deepEqual(alice.resource, { domain: 'workdsh-experts', id: 'expert-a', revision: 'r-1' });
    assert.equal(bob.organizationId, 'local-personal');
    // 签发者身份必须是站点所有者本人，不冒充任何其他主体
    assert.ok(access.puts.every((entry) => entry.actor.principalId === SITE_OWNER));
    // 暂停成员不签发
    assert.ok(![...access.grants.keys()].some((id) => id.includes('portal-gone')));
    // 一轮完全成功才写「授权就绪」标记（身份服务据此决定是否开始认门户身份）
    assert.equal(((await stat(activationFile)).mode & 0o777), 0o600);
    const marker = JSON.parse(await readFile(activationFile, 'utf8'));
    assert.equal(marker.counts.created, 8);
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('重跑幂等：修订号只由动作集合决定，第二轮全部 unchanged', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const { ctx } = await boot(fixture, access);
  try {
    await ctx.workdshGrantBaseline.ensure({ apply: true });
    const firstPuts = access.puts.length;
    const second = await ctx.workdshGrantBaseline.ensure({ apply: true });
    assert.equal(access.puts.length, firstPuts);
    assert.equal(second.counts.created, 0);
    assert.equal(second.counts.updated, 0);
    assert.equal(second.counts.unchanged, 8);
    assert.equal(second.counts.pending, 0);
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('回收：只撤销自己签发且已不在计划内的 baseline- 授权，不碰他人授予', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  access.grants.set('baseline-workdsh-experts-expert-a-portal-old', {
    id: 'baseline-workdsh-experts-expert-a-portal-old',
    organizationId: 'local-personal',
    subjectPrincipalId: 'portal:old',
    resource: { domain: 'workdsh-experts', id: 'expert-a', revision: 'r-1' },
    actions: ['read'],
    revision: 'baseline-stale',
  });
  access.grants.set('manual-grant-keep', {
    id: 'manual-grant-keep',
    organizationId: 'local-personal',
    subjectPrincipalId: 'portal:carol',
    resource: { domain: 'workdsh-experts', id: 'expert-a', revision: 'r-1' },
    actions: ['read'],
    revision: 'manual-1',
  });
  const { ctx } = await boot(fixture, access);
  try {
    const result = await ctx.workdshGrantBaseline.ensure({ apply: true });
    assert.equal(result.counts.pruned, 1);
    assert.deepEqual(access.revokes.map((entry) => entry.id), ['baseline-workdsh-experts-expert-a-portal-old']);
    assert.ok(!access.grants.has('baseline-workdsh-experts-expert-a-portal-old'));
    assert.ok(access.grants.has('manual-grant-keep'), '别人给的授权不能被回收');
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test('路由：status 回显配置与状态，run 不带 apply 时是 dry-run', async () => {
  const fixture = await makeFixture();
  const access = makeAccess();
  const { ctx, stubs } = await boot(fixture, access);
  try {
    assert.ok(stubs.routes.has('/workdsh-grant-baseline/status'));
    const statusResponse = fakeResponse();
    await stubs.routes.get('/workdsh-grant-baseline/status').handler({ headers: {}, url: '/workdsh-grant-baseline/status' }, statusResponse);
    const status = JSON.parse(statusResponse.body);
    assert.equal(status.ok, true);
    assert.equal(status.config.siteOwnerPrincipalId, SITE_OWNER);
    assert.equal(status.config.baselineActions, 'read,use');
    assert.equal(status.state.runs, 0);

    const runResponse = fakeResponse();
    await stubs.routes.get('/workdsh-grant-baseline/run').handler({ headers: {}, url: '/workdsh-grant-baseline/run' }, runResponse);
    const run = JSON.parse(runResponse.body);
    assert.equal(run.mode, 'dry-run');
    assert.equal(run.counts.created, 0);
    assert.equal(access.puts.length, 0);
  } finally {
    await ctx.fiber.dispose();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

function fakeResponse() {
  const response = { statusCode: 0, headers: {}, body: '' };
  response.setHeader = (name, value) => { response.headers[name] = value; };
  response.end = (chunk) => { response.body = String(chunk ?? ''); };
  return response;
}
