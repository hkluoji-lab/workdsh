// 授权决策回归（原线上沙箱探针 deploy/tools/workdsh-access-probe 的等价物）。
//
// 原探针存在的唯一理由：P1「按账号主体」的阻塞不是"身份能不能解析"，而是
// **切换之后既有资源还能不能被授权**——读代码只能推断，推断不是证据。
// 它当时要用一台跑起来的实例 + 真实资源才能回答；这里改成进程内回归：
// 用真实的 AccessManager + 真实存储，对「站点所有者拥有的资源」跑一遍
// 「未授权 → 签发 → 已授权 → 撤销 → 又未授权」的完整决策链，把答案钉进仓库。
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as JsonStorage from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { AccessManager } from '../dist/index.js';

const ORGANIZATION = 'local-personal';
const SITE_OWNER = 'local-user';
// 真实资源的形态（取自线上 workdsh_experts/experts/document-review-advisor.json）
const resource = { domain: 'workdsh-experts', id: 'expert-a', revision: 'r-1' };
const owner = { organizationId: ORGANIZATION, ownerPrincipalId: SITE_OWNER, scope: 'organization' };
const membership = {
  membership(organizationId, principalId) {
    if (organizationId !== ORGANIZATION) return undefined;
    return {
      organizationId, principalId, principalKind: 'human', role: 'member', state: 'active', revision: `membership-${principalId}-1`,
    };
  },
  async resolve() { return { principalId: SITE_OWNER }; },
  profile() { throw new Error('not used by this Host-side decision test'); },
};

const actor = (principalId) => ({ principalId, organizationId: ORGANIZATION, requestId: `request-${principalId}`, resolvedBy: 'workdsh-access-probe' });

// AccessManager 的判定链每个分支都要落审计，这里用最小在内存实现替代 AuditJournal：
// 本用例关心的是决策结果，不是审计落盘（后者由 tests/integration/access-audit.test.mjs 覆盖）。
const audit = { events: [], async append(event) { this.events.push(event); } };

async function boot(root) {
  const ctx = new Context();
  try {
    ctx.provide('workdshIdentity', membership);
    ctx.provide('workdshAudit', audit);
    await ctx.plugin(Storage);
    await ctx.plugin(JsonStorage, { root });
    await ctx.plugin(StorageDomain, { backend: 'json' });
    await ctx.plugin(AccessManager);
    return ctx;
  } catch (error) {
    await ctx.fiber.dispose();
    throw error;
  }
}

const decide = (ctx, principalId, action = 'read') =>
  ctx.workdshAccess.authorize({ actor: actor(principalId), action, resource, owner });

test('切换主体后既有资源仍可授权：未授权 → 签发 → 已授权 → 撤销 → 又未授权', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-access-decision-'));
  let ctx;
  try {
    ctx = await boot(root);

    // ① 站点所有者本人：无需 grant（所有者即授权来源）
    const asOwner = await decide(ctx, SITE_OWNER, 'manage');
    assert.equal(asOwner.effect, 'allow');

    // ② 刚切换主体、还没跑基线：普通成员拿不到任何权限——这正是必须跑基线的理由
    const before = await decide(ctx, 'portal:alice');
    assert.equal(before.effect, 'deny');
    assert.equal(before.code, 'access/not-granted');
    const beforeUse = await decide(ctx, 'portal:alice', 'use');
    assert.equal(beforeUse.effect, 'deny');

    // ③ 所有者签发 read + use（基线授权的做法）
    await ctx.workdshAccess.putGrant(actor(SITE_OWNER), owner, {
      id: 'baseline-workdsh-experts-expert-a-portal-alice',
      organizationId: ORGANIZATION,
      subjectPrincipalId: 'portal:alice',
      resource,
      actions: ['read', 'use'],
      revision: 'baseline-1',
    });
    const after = await decide(ctx, 'portal:alice');
    assert.equal(after.effect, 'allow');
    assert.equal(after.code, 'access/explicit-grant');
    assert.deepEqual(after.grantIds, ['baseline-workdsh-experts-expert-a-portal-alice']);

    // ④ 授予动作之外仍是拒绝（read/use ≠ edit/manage）
    const edit = await decide(ctx, 'portal:alice', 'edit');
    assert.equal(edit.effect, 'deny');
    assert.equal(edit.code, 'access/not-granted');

    // ⑤ 撤销后立刻回到未授权初态（岗位变动必须真的失去权限）
    assert.equal(
      await ctx.workdshAccess.revokeGrant(actor(SITE_OWNER), owner, 'baseline-workdsh-experts-expert-a-portal-alice', 'baseline-1'),
      true,
    );
    const revoked = await decide(ctx, 'portal:alice');
    assert.equal(revoked.effect, 'deny');
    assert.equal(revoked.code, 'access/not-granted');

    // ⑥ 跨组织引用默认拒绝
    const crossOrg = await ctx.workdshAccess.authorize({
      actor: { principalId: 'portal:alice', organizationId: 'other-org', requestId: 'request-cross', resolvedBy: 'workdsh-access-probe' },
      action: 'read', resource, owner,
    });
    assert.equal(crossOrg.effect, 'deny');
    assert.equal(crossOrg.code, 'access/cross-organization');
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
