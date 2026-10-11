import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as JsonStorage from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';
import { DriveManager } from '../dist/index.js';

const actor = { principalId: 'owner-a', organizationId: 'organization-a', requestId: 'request-a', resolvedBy: 'test' };
const text = value => new TextEncoder().encode(value);

async function boot(home, options = {}) {
  const ctx = new Context();
  await mkdir(join(home, 'ws'), { recursive: true });
  await ctx.plugin(Storage);
  await ctx.plugin(JsonStorage, { root: join(home, 'storage') });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  await ctx.plugin(LocalAttachmentStore, { dshHome: home });
  await ctx.plugin(LocalFileSystem, { cwd: join(home, 'ws') });
  await ctx.plugin(DriveManager, options);
  return ctx;
}

test('drive persists tree, content-addressable files, search, ops and restarts cleanly', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-drive-lifecycle-')); let ctx;
  try {
    ctx = await boot(root);
    assert.equal((await ctx.workdshDrive.space(actor)).title, '我的网盘');
    const folder = await ctx.workdshDrive.createFolder(actor, '项目甲');
    const saved = await ctx.workdshDrive.save(actor, { name: '方案.md', bytes: text('# 方案\n\n唯一词 DriveAlpha'), mediaType: 'text/markdown', source: 'ai-generated', sessionId: 'session-1', operationId: 'drive-op-1' });
    assert.equal(saved.kind, 'file');
    assert.equal(saved.file.kind, 'document');
    assert.match(saved.revision.attachmentId, /^sha256:[0-9a-f]{64}$/);
    // 幂等：相同 operationId + 相同内容 → 同一节点
    const repeated = await ctx.workdshDrive.save(actor, { name: '方案.md', bytes: text('# 方案\n\n唯一词 DriveAlpha'), mediaType: 'text/markdown', source: 'ai-generated', sessionId: 'session-1', operationId: 'drive-op-1' });
    assert.equal(repeated.id, saved.id, 'same operation + same content is idempotent');
    // 幂等冲突：相同 operationId + 不同内容 → 拒绝
    await assert.rejects(ctx.workdshDrive.save(actor, { name: '方案.md', bytes: text('different'), source: 'ai-generated', operationId: 'drive-op-1' }), /drive\/operation-conflict/);
    // 同名自动加后缀
    const second = await ctx.workdshDrive.save(actor, { name: '方案.md', bytes: text('# 方案2'), source: 'ai-generated', operationId: 'drive-op-2' });
    assert.equal(second.name, '方案 (2).md');
    // 用户上传附件只登记引用
    const ref = await ctx.attachments.saveFile({ data: text('图片字节'), name: '图片.png' });
    const referenced = await ctx.workdshDrive.saveReference(actor, { name: '图片.png', attachmentId: ref.attachmentId, byteLength: ref.bytes, mediaType: 'image/png', sessionId: 'session-1', operationId: 'drive-ref-1' });
    assert.equal(referenced.file.kind, 'image');
    assert.equal(referenced.file.source, 'user-upload');
    assert.equal(referenced.revision.attachmentId, ref.attachmentId);
    // 目录移动 + 重命名
    const moved = await ctx.workdshDrive.move(actor, saved.id, folder.id);
    assert.equal(moved.parentId, folder.id);
    const referencedMoved = await ctx.workdshDrive.move(actor, referenced.id, folder.id);
    assert.equal(referencedMoved.parentId, folder.id);
    const renamed = await ctx.workdshDrive.rename(actor, folder.id, '项目甲（归档）');
    assert.equal(renamed.name, '项目甲（归档）');
    // 搜索：按文件名命中、路径、类型/来源/会话筛选
    assert.equal((await ctx.workdshDrive.search(actor, '方案.md'))[0].name, '方案.md');
    assert.equal((await ctx.workdshDrive.search(actor, '方案.md'))[0].folderPath, '我的网盘 / 项目甲（归档）');
    assert.equal((await ctx.workdshDrive.search(actor, '', { kinds: ['image'] }))[0].name, '图片.png');
    assert.equal((await ctx.workdshDrive.search(actor, '', { sources: ['user-upload'] })).length, 1);
    assert.equal((await ctx.workdshDrive.search(actor, '', { sessionId: 'session-1' })).length, 2);
    // 会话维度引用
    assert.deepEqual((await ctx.workdshDrive.listSessions(actor)).map(row => row.sessionId), ['session-1']);
    assert.equal((await ctx.workdshDrive.listSessions(actor))[0].fileCount, 2);
    // readBytes 一致
    assert.deepEqual(Buffer.from(await ctx.workdshDrive.readBytes(actor, saved.file.id)), Buffer.from(text('# 方案\n\n唯一词 DriveAlpha')));
    // 归档：从列表与搜索移除（含会话维度），历史引用仍可读
    assert.equal((await ctx.workdshDrive.search(actor, '方案', { sessionId: 'session-1' })).length, 1);
    await ctx.workdshDrive.archive(actor, saved.id);
    assert.equal((await ctx.workdshDrive.search(actor, '方案', { sessionId: 'session-1' })).length, 0);
    assert.equal((await ctx.workdshDrive.listSessions(actor))[0].fileCount, 1, 'archived file no longer counts toward session');
    assert.deepEqual(Buffer.from(await ctx.workdshDrive.readBytes(actor, saved.file.id, saved.revision.id)), Buffer.from(text('# 方案\n\n唯一词 DriveAlpha')), 'archived revisions stay readable by explicit reference');
    // 重启持久化
    await ctx.fiber.dispose(); ctx = undefined;
    ctx = await boot(root);
    const roots = await ctx.workdshDrive.list(actor);
    assert.equal(roots[0].name, '项目甲（归档）');
    assert.equal((await ctx.workdshDrive.list(actor, folder.id)).length, 1, 'referenced file persists in folder; archived file excluded from list');
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('drive rejects name conflicts, cycles, quota, invalid actors and cross-owner reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-drive-boundary-')); let ctx;
  try {
    ctx = await boot(root, { maxTotalBytes: 40 });
    await ctx.workdshDrive.createFolder(actor, '合同');
    await assert.rejects(ctx.workdshDrive.createFolder(actor, '合同'), /drive\/name-conflict/);
    const folder = await ctx.workdshDrive.createFolder(actor, '目录');
    await assert.rejects(ctx.workdshDrive.move(actor, folder.id, folder.id), /drive\/cycle/);
    await assert.rejects(ctx.workdshDrive.saveReference(actor, { name: '坏引用.txt', attachmentId: 'not-a-sha', byteLength: 3, mediaType: 'text/plain', operationId: 'bad-ref' }), /drive\/invalid-attachment/);
    await assert.rejects(ctx.workdshDrive.save(actor, { name: '超限.txt', bytes: text('123456789012345678901234567890123456789012345678901234567890'), source: 'user-upload', operationId: 'quota-1' }), /drive\/quota-exceeded/);
    const revoked = { ...actor, requestId: '' };
    await assert.rejects(ctx.workdshDrive.list(revoked), /drive\/invalid-actor/);
    const item = await ctx.workdshDrive.save(actor, { name: '私有.txt', bytes: text('private'), source: 'user-upload', operationId: 'private' });
    // 同组织另一主体：独立空间，不能读取
    const peer = { ...actor, principalId: 'owner-b', requestId: 'request-b' };
    assert.equal((await ctx.workdshDrive.list(peer)).length, 0, 'per-principal records stay isolated');
    await assert.rejects(ctx.workdshDrive.readBytes(peer, item.file.id), /drive\/not-found/);
    await assert.rejects(ctx.workdshDrive.rename(peer, item.id, '篡改'), /drive\/not-found/);
    // 另一组织：同样隔离，跨组织引用默认拒绝
    const foreign = { principalId: 'owner-c', organizationId: 'organization-c', requestId: 'request-c', resolvedBy: 'test' };
    assert.equal((await ctx.workdshDrive.list(foreign)).length, 0);
    await assert.rejects(ctx.workdshDrive.readBytes(foreign, item.file.id), /drive\/not-found/);
    // 无效附件引用（大小为零）
    await assert.rejects(ctx.workdshDrive.saveReference(actor, { name: '空.txt', attachmentId: `sha256:${'0'.repeat(64)}`, byteLength: 0, mediaType: 'text/plain', operationId: 'empty-ref' }), /drive\/file-size/);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('drive capture idempotently archives user attachments and presented deliverables', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-drive-capture-')); let ctx;
  try {
    ctx = await boot(root);
    Object.defineProperty(ctx, 'workdshIdentity', { value: { resolve: async () => actor }, configurable: true });
    const { registerDriveCapture } = await import('../dist/services/capture.js');
    registerDriveCapture(ctx);
    const session = { id: 'session-capture' };
    const ref = await ctx.attachments.saveFile({ data: text('截图字节'), name: '截图.png' });
    const message = { id: 'm1', role: 'user', content: [{ type: 'image', attachment: { attachmentId: ref.attachmentId, mediaType: 'image/png', bytes: ref.bytes, width: 8, height: 8 } }] };
    ctx.emit('session/event', session, { type: 'user/message', seq: 1, data: message });
    await waitFor(() => (ctx.workdshDrive.list(actor)).then(rows => rows.length >= 1));
    const roots = await ctx.workdshDrive.list(actor);
    assert.equal(roots[0].file.source, 'user-upload');
    assert.match(roots[0].name, /^图片-/);
    // 重复发送同一事件不重复登记（receipts 幂等）
    ctx.emit('session/event', session, { type: 'user/message', seq: 2, data: message });
    await waitFor(async () => { const rows = await ctx.workdshDrive.list(actor); return rows.length >= 1 && (await ctx.workdshDrive.list(actor, undefined)).length === 1; });
    assert.equal((await ctx.workdshDrive.list(actor)).length, 1, 'duplicate user/message does not duplicate the archive');
    // 呈现文件：fs 读字节 → tool-output 归档
    await writeFile(join(root, 'ws', '交付.md'), Buffer.from('# 交付物\n\ncapture-presented-bytes'));
    ctx.emit('session/event', session, { type: 'deliverables/presented', seq: 3, data: { turn: 1, callId: 'call-1', files: [{ path: join(root, 'ws', '交付.md') }] } });
    await waitFor(async () => { const rows = await ctx.workdshDrive.list(actor); return rows.length >= 2; });
    const entries = await ctx.workdshDrive.list(actor);
    const presented = entries.find(row => row.name === '交付.md');
    assert.ok(presented, 'presented deliverable is archived');
    assert.equal(presented.file.source, 'tool-output');
    assert.deepEqual(Buffer.from(await ctx.workdshDrive.readBytes(actor, presented.file.id)), Buffer.from('# 交付物\n\ncapture-presented-bytes'));
    // 重复 presented 事件不重复
    ctx.emit('session/event', session, { type: 'deliverables/presented', seq: 4, data: { turn: 1, callId: 'call-1', files: [{ path: join(root, 'ws', '交付.md') }] } });
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal((await ctx.workdshDrive.list(actor)).length, 2, 'duplicate presented event is idempotent');
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('drive remote endpoint forwards whitelisted sources and exposes sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-drive-remote-')); let ctx;
  try {
    ctx = await boot(root);
    let handler;
    Object.defineProperty(ctx, 'connection', { value: { fetch: { register: spec => { handler = spec.fetch; return () => {}; } } }, configurable: true });
    Object.defineProperty(ctx, 'workdshIdentity', { value: { profile: () => ({ principalId: actor.principalId, organization: { id: actor.organizationId }, resolvedBy: actor.resolvedBy }) }, configurable: true });
    const { registerDriveConnection } = await import('../dist/remote/drive-api.js');
    registerDriveConnection(ctx);
    const post = async (endpoint, payload) => {
      const response = await handler(new Request('http://127.0.0.1/api/workdsh-drive', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }) }));
      return { status: response.status, body: await response.json() };
    };
    const base64 = value => Buffer.from(text(value)).toString('base64');
    const upload = await post('save', { name: '上传.txt', base64: base64('上传内容'), mediaType: 'text/plain', operationId: 'remote-1' });
    assert.equal(upload.body.value.file.source, 'user-upload', 'omitted source defaults to user-upload');
    const forged = await post('save', { name: '伪造.txt', base64: base64('伪造内容'), mediaType: 'text/plain', operationId: 'remote-2', source: 'admin' });
    assert.equal(forged.body.value.file.source, 'user-upload', 'unknown source falls back instead of being persisted');
    const sessioned = await post('save', { name: '带会话.txt', base64: base64('会话内容'), mediaType: 'text/plain', operationId: 'remote-3', sessionId: 'session-remote' });
    assert.equal(sessioned.body.value.file.sessionId, 'session-remote');
    assert.deepEqual((await post('sessions', {})).body.value.map(row => row.sessionId), ['session-remote']);
    const bad = await post('rename', { nodeId: 'missing-node', name: 'x' });
    assert.equal(bad.body.error.code, 'drive/not-found');
    assert.equal(bad.status, 400);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

async function waitFor(check, timeout = 3000) {
  const started = Date.now();
  for (;;) {
    if (await check()) return;
    if (Date.now() - started > timeout) throw new Error('waitFor timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}
