import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as JsonStorage from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { AssistantManager } from '../dist/services/assistant-manager.js';

const actor = { principalId: 'alice', organizationId: 'org', requestId: 'test', resolvedBy: 'test' };
const other = { principalId: 'bob', organizationId: 'org', requestId: 'test', resolvedBy: 'test' };
const input = (overrides = {}) => ({ name: '周报助理', description: '每周汇总进展', brief: { goal: '汇总本周进展并给出下周计划。', style: '简洁', boundary: '不代发消息。' }, references: [], triggers: { manual: true }, ...overrides });
async function boot(root) {
  const ctx = new Context();
  await ctx.plugin(Storage); await ctx.plugin(JsonStorage, { root }); await ctx.plugin(StorageDomain, { backend: 'json' }); await ctx.plugin(AssistantManager);
  return ctx;
}

test('assistants persist, append revisions, isolate owners and keep references without starting work', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-assistant-'));
  let ctx;
  try {
    ctx = await boot(root);
    const created = await ctx.workdshAssistant.create(actor, input({ references: [{ kind: 'expert', id: 'expert-1', label: '交付专家', revision: 'rev-1' }], triggers: { manual: true, schedule: '每个工作日 09:00' } }));
    assert.equal(created.assistant.status, 'active');
    assert.equal(created.revision.number, 1);
    assert.equal(created.assistant.organizationId, 'org');
    assert.equal(created.assistant.ownerPrincipalId, 'alice');
    assert.equal((await ctx.workdshAssistant.list(actor, '周报')).length, 1);
    assert.equal((await ctx.workdshAssistant.list(actor, '不存在')).length, 0);
    // Another principal in the same organization sees its own empty store: the state key stays per owner.
    assert.equal((await ctx.workdshAssistant.list(other, '')).length, 0);
    await assert.rejects(ctx.workdshAssistant.get(other, created.assistant.id), (error) => error.code === 'assistant/not-found');
    // A stale expected revision never overwrites the current one.
    const revised = await ctx.workdshAssistant.update(actor, created.assistant.id, input({ brief: { goal: '汇总本周进展并给出下周计划。', style: '简洁', boundary: '不代发消息。' }, references: [{ kind: 'expert', id: 'expert-1', label: '交付专家', revision: 'rev-1' }], triggers: { manual: true, schedule: '每个工作日 09:00' } }), created.revision.id);
    assert.equal(revised.revision.number, 2);
    await assert.rejects(ctx.workdshAssistant.update(actor, created.assistant.id, input({ name: '并发覆盖' }), created.revision.id), (error) => error.code === 'assistant/revision-conflict');
    assert.equal((await ctx.workdshAssistant.get(actor, created.assistant.id)).assistant.name, '周报助理');
    // The owner plugin is absent, so the reference is reported as unknown rather than available.
    const unresolved = revised.resolutions[0];
    assert.equal(unresolved.available, false);
    assert.match(unresolved.reason ?? '', /服务当前不可用/);
    assert.equal((await ctx.workdshAssistant.list(actor, '')).at(0).unavailableCount, 1);
    assert.deepEqual(await ctx.workdshAssistant.catalog(actor), []);
    // Archival is the delete path and stays reversible.
    assert.equal((await ctx.workdshAssistant.archive(actor, created.assistant.id)).status, 'archived');
    assert.equal((await ctx.workdshAssistant.list(actor, '')).length, 0);
    assert.equal((await ctx.workdshAssistant.listArchived(actor, '')).length, 1);
    assert.equal((await ctx.workdshAssistant.get(actor, created.assistant.id)).assistant.status, 'archived');
    assert.equal((await ctx.workdshAssistant.restore(actor, created.assistant.id)).status, 'active');
    await ctx.fiber.dispose();
    ctx = await boot(root);
    const restored = await ctx.workdshAssistant.get(actor, created.assistant.id);
    assert.equal(restored.revision.number, 2);
    assert.equal(restored.revision.triggers.schedule, '每个工作日 09:00');
    assert.equal(restored.revision.references.length, 1);
    assert.equal(restored.revision.references[0].revision, 'rev-1');
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('assistant input rejects unusable drafts explicitly instead of dropping fields', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-assistant-'));
  let ctx;
  try {
    ctx = await boot(root);
    await assert.rejects(ctx.workdshAssistant.create(actor, input({ name: '   ' })), (error) => error.code === 'assistant/invalid-name');
    await assert.rejects(ctx.workdshAssistant.create(actor, input({ brief: { goal: '', style: '', boundary: '' } })), (error) => error.code === 'assistant/invalid-brief');
    await assert.rejects(ctx.workdshAssistant.create(actor, input({ triggers: { manual: false } })), (error) => error.code === 'assistant/invalid-triggers');
    await assert.rejects(ctx.workdshAssistant.create(actor, input({ references: [{ kind: 'connector', id: 'mcp-1', label: 'MCP', revision: 'rev-1' }] })), (error) => error.code === 'assistant/invalid-reference');
    // Duplicate references collapse to one row instead of failing the whole draft.
    const deduplicated = await ctx.workdshAssistant.create(actor, input({ references: [{ kind: 'skill', id: 'organizer', label: '资料整理' }, { kind: 'skill', id: 'organizer', label: '资料整理' }] }));
    assert.equal(deduplicated.revision.references.length, 1);
    assert.equal((await ctx.workdshAssistant.list(actor, '')).length, 1);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('a loaded owner plugin decides availability and blocks a definitely stale reference', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-assistant-'));
  let ctx;
  try {
    ctx = await boot(root);
    let revision = 'rev-1';
    ctx.provide('workdshSkills', { list: async () => [{ name: 'organizer', title: '资料整理', description: '', modelInvocable: true, state: 'enabled', manageable: true }], detail: async () => ({ revision }) });
    const live = await ctx.workdshAssistant.create(actor, input({ references: [{ kind: 'skill', id: 'organizer', label: '资料整理', revision: 'rev-1' }] }));
    assert.equal(live.resolutions[0].available, true);
    assert.deepEqual((await ctx.workdshAssistant.catalog(actor)).map(row => [row.kind, row.id, row.label, row.revision]), [['skill', 'organizer', '资料整理', 'rev-1']]);
    revision = 'rev-2';
    // Reading back re-resolves against the owner, so the stored pointer is reported as stale.
    const reread = await ctx.workdshAssistant.get(actor, live.assistant.id);
    assert.equal(reread.resolutions[0].available, false);
    assert.match(reread.resolutions[0].reason ?? '', /修订已变化/);
    // A write refuses to persist a reference the loaded owner just contradicted.
    await assert.rejects(ctx.workdshAssistant.update(actor, live.assistant.id, input({ references: [{ kind: 'skill', id: 'organizer', label: '资料整理', revision: 'rev-1' }] }), live.revision.id), (error) => error.code === 'assistant/reference-stale');
    await assert.rejects(ctx.workdshAssistant.create(actor, input({ references: [{ kind: 'skill', id: 'organizer', label: '资料整理', revision: 'rev-1' }] })), (error) => error.code === 'assistant/reference-stale');
    await assert.rejects(ctx.workdshAssistant.create(actor, input({ references: [{ kind: 'skill', id: 'missing', label: '不存在' }] })), (error) => error.code === 'assistant/reference-stale');
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('the connector catalog is mirrored structurally and never blocks on an absent owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-assistant-'));
  let ctx;
  try {
    ctx = await boot(root);
    ctx.provide('workdshConnectors', { list: async () => [{ id: 'mcp-1', title: 'MCP', description: '', enabled: true, state: 'ready' }] });
    const detail = await ctx.workdshAssistant.create(actor, input({ references: [{ kind: 'connector', id: 'mcp-1', label: 'MCP 实例' }] }));
    assert.equal(detail.resolutions[0].available, true);
    assert.deepEqual((await ctx.workdshAssistant.catalog(actor)).map(row => [row.kind, row.id, row.detail]), [['connector', 'mcp-1', '连接器 · ready']]);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});
