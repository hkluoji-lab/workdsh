import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as JsonStorage from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import LocalAttachmentStore from '@deepseek-ai/dsh-attachment-local';
import LocalFileSystem from '@deepseek-ai/dsh-fs-local';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

async function boot(home) {
  const ctx = new Context();
  await mkdir(join(home, 'ws'), { recursive: true });
  await ctx.plugin(Storage);
  await ctx.plugin(JsonStorage, { root: join(home, 'storage') });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  await ctx.plugin(LocalAttachmentStore, { dshHome: home });
  await ctx.plugin(LocalFileSystem, { cwd: join(home, 'ws') });
  return ctx;
}

test('drive capture interface probe: attachments / session-event / fs', async () => {
  const home = await mkdtemp(join(tmpdir(), 'workdsh-drive-probe-'));
  const ctx = await boot(home);
  try {
    // ① ctx.attachments: saveFile → FileAttachmentRef { attachmentId(sha256), name, bytes }
    const data = new TextEncoder().encode('网盘探针 payload-1');
    const ref = await ctx.attachments.saveFile({ data, name: '探针.txt' });
    assert.equal(ref.attachmentId, `sha256:${sha256(data)}`, 'attachmentId is content-addressed sha256 reference');
    assert.equal(ref.bytes, data.length, 'ref.bytes matches byte length');
    assert.equal(ref.name, '探针.txt', 'display name preserved');

    // ② readFileStream → verbatim bytes
    const chunks = [];
    for await (const chunk of ctx.attachments.readFileStream(ref)) chunks.push(chunk);
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(data), 'readFileStream returns verbatim bytes');

    // ③ fileHostPath → absolute host path on disk (host-file-backed backend)
    const hostPath = ctx.attachments.fileHostPath(ref);
    assert.ok(hostPath && hostPath.startsWith('/'), 'fileHostPath returns absolute path');
    await access(hostPath); // must exist on disk
    assert.deepEqual(await readFile(hostPath), Buffer.from(data), 'host object matches submitted bytes');

    // ④ session/event listener wiring in plugin context
    const seen = [];
    ctx.on('session/event', (session, event) => { seen.push({ session, event }); });
    const fakeSession = { id: 'session-probe' };
    ctx.emit('session/event', fakeSession, { type: 'user/message', seq: 1, message: { id: 'm1', role: 'user', content: [{ type: 'text', text: 'hi' }] } });
    assert.equal(seen.length, 1, 'session/event listener receives emission');
    assert.equal(seen[0].session.id, 'session-probe');
    assert.equal(seen[0].event.type, 'user/message');

    // ⑤ ctx.fs: resolve + readBytes for presented-file capture path
    await writeFile(join(home, 'ws', 'deliverable.md'), Buffer.from('# 交付物\n\n字节内容-abc'));
    const target = await ctx.fs.resolve(join(home, 'ws', 'deliverable.md'));
    const bytes = await ctx.fs.readBytes(target, undefined, 1024);
    assert.deepEqual(Buffer.from(bytes), Buffer.from('# 交付物\n\n字节内容-abc'), 'fs.readBytes returns exact file bytes');
    console.log(`PASS: attachments(saveFile/readFileStream/fileHostPath), session/event wiring, fs(resolve/readBytes) verified. ref=${ref.attachmentId}`);
  } finally {
    await ctx.fiber.dispose();
    await rm(home, { recursive: true, force: true });
  }
});
