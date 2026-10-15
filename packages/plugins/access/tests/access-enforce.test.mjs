// 授权判定点（C4/P2）：包装 workdshSkills / workdshConnectors 的破坏性方法。
//
// 等价用例来自线上沙箱验证脚本 deploy/tools/workdsh-access-lab/verify-enforce.mjs，
// 但那支脚本需要一台跑起来的实例（HTTP + 真实门户签名）；这里把它压成进程内单元测试，
// 判定语义必须逐条保持：dry-run 只记不拦、enforce 抛**精确错误码**、只读方法不受影响、
// 包装幂等、判定异常放行（不 fail-closed）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { AccessEnforceService } from '../dist/index.js';

const SKILL_METHODS = [
  'update', 'saveDraft', 'publishDraft', 'installImport', 'setEnabled',
  'uninstall', 'batch', 'restore', 'installFromCatalog', 'writeResource',
];
const CONNECTOR_METHODS = ['create', 'update', 'remove', 'setEnabled'];

/** 每次调用都重新造，因为包装会就地改写这些方法（与线上同一份对象被包装的语义一致）。 */
function makeStubs() {
  const skills = { detail: () => 'detail-ok', list: () => 'list-ok' };
  for (const method of SKILL_METHODS) skills[method] = (...args) => `skills.${method}:${JSON.stringify(args)}`;
  const connectors = { list: () => 'connectors-list-ok', capability: () => 'capability-ok' };
  for (const method of CONNECTOR_METHODS) connectors[method] = (...args) => `connectors.${method}:${JSON.stringify(args)}`;
  return { skills, connectors };
}

async function boot({ enforce, decisions = [], stubs = makeStubs(), statusFile }) {
  const ctx = new Context();
  const seen = [];
  const access = {
    async authorize(request) {
      seen.push(request);
      const next = decisions.shift();
      if (next instanceof Error) throw next;
      return next ?? { effect: 'deny', code: 'access/not-granted', authorizationRevision: 'auth-1' };
    },
  };
  const identity = { profile: () => ({ principalId: 'portal:alice' }) };
  ctx.provide('workdshSkills', stubs.skills);
  ctx.provide('workdshConnectors', stubs.connectors);
  ctx.provide('workdshAccess', access);
  ctx.provide('workdshIdentity', identity);
  await ctx.plugin(AccessEnforceService, { enforce, statusFile });
  return { ctx, seen, stubs };
}

test('dry-run（enforce=false）：破坏性调用照常落到原方法，判定结果只被记录', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-enforce-dry-'));
  const statusFile = join(root, 'status.json');
  const { ctx, seen } = await boot({ enforce: false, statusFile });
  try {
    assert.equal(ctx.workdshAccessEnforce.config.enforce, false);
    const result = await ctx.workdshSkills.setEnabled('skill-a', false);
    assert.equal(result, 'skills.setEnabled:["skill-a",false]');
    assert.equal(await ctx.workdshConnectors.remove('conn-a'), 'connectors.remove:["conn-a"]');
    assert.equal(seen.length, 2);
    assert.deepEqual(seen[0].resource, { domain: 'workdsh-skills', id: 'skill-a', revision: 'v1' });
    assert.deepEqual(seen[0].owner, {
      organizationId: 'local-personal',
      ownerPrincipalId: 'local-user',
      scope: 'organization',
    });
    assert.equal(seen[0].action, 'manage');
    assert.equal(seen[0].actor.principalId, 'portal:alice');
    assert.equal(seen[0].actor.resolvedBy, 'workdsh-access-enforce');

    const status = JSON.parse(await readFile(statusFile, 'utf8'));
    assert.equal(status.enforce, false);
    assert.equal(status.wrapped.length, 14);
    assert.equal(status.already.length, 0);
    assert.deepEqual(status.missing, []);
    assert.deepEqual(status.failed, []);
    assert.equal(status.decisions.length, 2);
    assert.ok(status.decisions.every((entry) => entry.effect === 'deny' && entry.enforced === false));
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('enforce=true：被拒时抛精确错误码（连接器插件按整条 message 匹配已知码）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-enforce-on-'));
  const { ctx } = await boot({ enforce: true, statusFile: join(root, 'status.json') });
  try {
    await assert.rejects(ctx.workdshSkills.uninstall('skill-a'), (error) => {
      assert.equal(error.message, 'skill/access-not-granted');
      assert.equal(error.code, 'skill/access-not-granted');
      return true;
    });
    await assert.rejects(ctx.workdshConnectors.setEnabled('conn-a', true), (error) => {
      assert.equal(error.message, 'connector/access-not-granted');
      assert.equal(error.code, 'connector/access-not-granted');
      return true;
    });
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('放行：判定 allow 时原方法正常执行；只读方法不进入判定', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-enforce-allow-'));
  const allow = { effect: 'allow', code: 'access/explicit-grant', authorizationRevision: 'auth-2' };
  const { ctx, seen } = await boot({
    enforce: true,
    decisions: [allow],
    statusFile: join(root, 'status.json'),
  });
  try {
    assert.equal(await ctx.workdshConnectors.update('conn-a', { name: 'x' }), 'connectors.update:["conn-a",{"name":"x"}]');
    assert.equal(seen.length, 1);
    // 只读入口既没有包装、也不产生判定（否则「读一下列表」都会被拒）
    assert.equal(await ctx.workdshConnectors.list(), 'connectors-list-ok');
    assert.equal(await ctx.workdshSkills.detail('skill-a'), 'detail-ok');
    assert.equal(seen.length, 1);
    const status = JSON.parse(await readFile(join(root, 'status.json'), 'utf8'));
    assert.ok(status.wrapped.includes('skills.uninstall'));
    assert.ok(!status.wrapped.includes('skills.detail'));
    assert.ok(!status.wrapped.includes('connectors.list'));
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('无 id 的入口按域级 * 判定；判定异常放行且高声记录（不 fail-closed）', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-enforce-star-'));
  const statusFile = join(root, 'status.json');
  const { ctx, seen } = await boot({
    enforce: true,
    decisions: [
      { effect: 'allow', code: 'access/explicit-grant', authorizationRevision: 'auth-3' },
      new Error('resource id 笔误'),
    ],
    statusFile,
  });
  try {
    // create / installFromCatalog 这类入口没有资源 id → 域级 '*'
    assert.equal(await ctx.workdshSkills.installFromCatalog({ source: 'catalog-a' }), 'skills.installFromCatalog:[{"source":"catalog-a"}]');
    assert.equal(seen[0].resource.id, '*');
    assert.equal(seen[0].resource.domain, 'workdsh-skills');

    // 判定器抛错 = 判定器坏了，不等于「无权限」：放行并记录，否则一个笔误会瘫掉管理面
    const passed = await ctx.workdshConnectors.remove('conn-a');
    assert.equal(passed, 'connectors.remove:["conn-a"]');
    const status = JSON.parse(await readFile(statusFile, 'utf8'));
    assert.ok(status.decisions.some((entry) => typeof entry.error === 'string' && entry.error.includes('resource id 笔误')));
  } finally {
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('包装幂等：同一进程内第二次加载只登记 already，不叠加包装层', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-enforce-idem-'));
  const stubs = makeStubs();
  const first = await boot({ enforce: false, stubs, statusFile: join(root, 'a.json') });
  const second = await boot({ enforce: false, stubs, statusFile: join(root, 'b.json') });
  try {
    const firstStatus = JSON.parse(await readFile(join(root, 'a.json'), 'utf8'));
    const secondStatus = JSON.parse(await readFile(join(root, 'b.json'), 'utf8'));
    assert.equal(firstStatus.wrapped.length, 14);
    assert.equal(firstStatus.already.length, 0);
    assert.equal(secondStatus.wrapped.length, 0);
    assert.equal(secondStatus.already.length, 14);
    // 第二层实例的判定仍然生效（包装函数属于第一层实例，enforce 取第一层的值）
    await second.ctx.workdshConnectors.remove('conn-a');
    assert.equal(second.seen.length, 0);
    assert.equal(first.seen.length, 1);
  } finally {
    await first.ctx.fiber.dispose();
    await second.ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
