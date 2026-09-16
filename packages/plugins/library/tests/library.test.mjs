import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as JsonStorage from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { LibraryManager } from '../dist/index.js';

const actor = {
  principalId: 'owner-a', organizationId: 'organization-a', requestId: 'request-a', resolvedBy: 'test',
};

async function boot(storageRoot, libraryRoot, options = {}) {
  const ctx = new Context();
  try {
    await ctx.plugin(Storage);
    await ctx.plugin(JsonStorage, { root: storageRoot });
    await ctx.plugin(StorageDomain, { backend: 'json' });
    await ctx.plugin(LibraryManager, { root: libraryRoot, ...options });
    return ctx;
  } catch (error) { await ctx.fiber.dispose(); throw error; }
}

async function docxBytes(text) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<w:document xmlns:w="urn:w"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

async function pptxBytes(title, body) {
  const zip = new JSZip();
  zip.file('ppt/slides/slide1.xml', `<p:sld xmlns:p="urn:p" xmlns:a="urn:a"><a:t>${title}</a:t><a:t>${body}</a:t></p:sld>`);
  return new Uint8Array(await zip.generateAsync({ type: 'uint8array' }));
}

async function pdfBytes(text) {
  const document = await PDFDocument.create(); const page = document.addPage([400, 300]);
  const font = await document.embedFont(StandardFonts.Helvetica); page.drawText(text, { x: 40, y: 240, size: 18, font });
  return new Uint8Array(await document.save());
}

test('independent library plugin persists a tree, originals and searchable derived text across restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-library-test-'));
  const storageRoot = join(root, 'storage'); const libraryRoot = join(root, 'library'); let ctx;
  try {
    ctx = await boot(storageRoot, libraryRoot);
    assert.equal((await ctx.workdshLibrary.space(actor)).title, '我的资料');
    const folder = await ctx.workdshLibrary.createFolder(actor, '项目甲');
    const samples = [
      ['规则.md', new TextEncoder().encode('# 规则\n\n唯一词 MarkdownAlpha')],
      ['记录.txt', new TextEncoder().encode('唯一词 TextBravo')],
      ['报告.docx', await docxBytes('唯一词 DocxCharlie')],
      ['简报.pptx', await pptxBytes('季度简报', '唯一词 PptxDelta')],
      ['附件.pdf', await pdfBytes('UniquePdfEcho')],
    ];
    const imported = [];
    for (const [name, bytes] of samples) imported.push(await ctx.workdshLibrary.importAsset(actor, { parentId: folder.id, name, bytes, operationId: `operation-${name}` }));
    for (const entry of imported) {
      const conversion = JSON.parse(await readFile(join(libraryRoot, dirname(entry.revision.contentRelativePath), 'conversion.json'), 'utf8'));
      assert.equal(conversion.originalSha256, entry.revision.originalSha256);
      assert.ok(Array.isArray(conversion.locations));
    }
    assert.deepEqual(JSON.parse(await readFile(join(libraryRoot, dirname(imported[2].revision.contentRelativePath), 'conversion.json'), 'utf8')).locations[0], { kind: 'paragraph', index: 1, label: '段落 1' });
    assert.match(JSON.parse(await readFile(join(libraryRoot, dirname(imported[3].revision.contentRelativePath), 'conversion.json'), 'utf8')).locations[0].label, /第 1 页/);
    const repeated = await ctx.workdshLibrary.importAsset(actor, { parentId: folder.id, name: '规则.md', bytes: samples[0][1], operationId: 'operation-规则.md' });
    assert.equal(repeated.asset.id, imported[0].asset.id);
    await assert.rejects(ctx.workdshLibrary.importAsset(actor, { parentId: folder.id, name: '规则.md', bytes: new TextEncoder().encode('different'), operationId: 'operation-规则.md' }), /library\/operation-conflict/);
    assert.equal((await ctx.workdshLibrary.list(actor, folder.id)).length, 5);
    assert.equal((await ctx.workdshLibrary.search(actor, '')).length, 5, 'empty query powers recent assets');
    assert.deepEqual((await ctx.workdshLibrary.search(actor, '', { kinds: ['pptx'] })).map(hit => hit.name), ['简报.pptx']);
    assert.equal((await ctx.workdshLibrary.search(actor, '', { sources: ['task'] })).length, 0);
    assert.equal((await ctx.workdshLibrary.search(actor, 'DocxCharlie'))[0].name, '报告.docx');
    assert.equal((await ctx.workdshLibrary.search(actor, 'DocxCharlie'))[0].folderPath, '我的资料 / 项目甲');
    const pptxHit = (await ctx.workdshLibrary.search(actor, 'PptxDelta'))[0];
    assert.equal(pptxHit.name, '简报.pptx');
    assert.match(pptxHit.location, /第 1 页/);
    const pdfHit = (await ctx.workdshLibrary.search(actor, 'UniquePdfEcho'))[0];
    assert.equal(pdfHit.name, '附件.pdf');
    assert.match(pdfHit.location, /第 1 页/);
    assert.deepEqual(await ctx.workdshLibrary.readOriginal(actor, imported[1].asset.id), samples[1][1]);
    const selected = await ctx.workdshLibrary.setTaskSelection(actor, 'session-a', [folder.id]);
    assert.equal(selected.length, 5);
    const pinnedRevision = selected.find(row => row.assetId === imported[0].asset.id).revisionId;
    const draft = await ctx.workdshLibrary.createDraft(actor, imported[0].asset.id);
    const concurrentDraft = await ctx.workdshLibrary.createDraft(actor, imported[0].asset.id);
    const changed = await ctx.workdshLibrary.updateDraft(actor, draft.id, '# 新规则\n\n唯一词 RevisedFoxtrot', draft.revision);
    await assert.rejects(ctx.workdshLibrary.updateDraft(actor, draft.id, 'stale', draft.revision), /library\/revision-conflict/);
    const published = await ctx.workdshLibrary.publishDraft(actor, draft.id, changed.revision);
    assert.equal(published.revision.number, 2);
    await assert.rejects(ctx.workdshLibrary.publishDraft(actor, concurrentDraft.id, concurrentDraft.revision), /library\/base-revision-conflict/);
    assert.equal((await ctx.workdshLibrary.search(actor, 'RevisedFoxtrot')).length, 1);
    assert.equal((await ctx.workdshLibrary.taskSelection(actor, 'session-a')).find(row => row.assetId === imported[0].asset.id).revisionId, pinnedRevision);
    const disabled = await ctx.workdshLibrary.setAssetStatus(actor, imported[0].asset.id, 'disabled');
    assert.equal(disabled.asset.status, 'disabled');
    await assert.rejects(ctx.workdshLibrary.readText(actor, imported[0].asset.id), /library\/disabled/);
    await assert.rejects(ctx.workdshLibrary.setTaskSelection(actor, 'session-b', [imported[0].id]), /library\/disabled/);
    assert.equal((await ctx.workdshLibrary.search(actor, 'RevisedFoxtrot')).length, 0);
    await ctx.workdshLibrary.setAssetStatus(actor, imported[0].asset.id, 'active');
    assert.equal((await ctx.workdshLibrary.search(actor, 'RevisedFoxtrot')).length, 1);
    await ctx.workdshLibrary.rename(actor, folder.id, '项目甲（归档）');
    await ctx.fiber.dispose(); ctx = undefined;

    ctx = await boot(storageRoot, libraryRoot);
    const roots = await ctx.workdshLibrary.list(actor);
    assert.equal(roots[0].name, '项目甲（归档）');
    assert.equal((await ctx.workdshLibrary.search(actor, 'RevisedFoxtrot')).length, 1);
    await ctx.workdshLibrary.remove(actor, roots[0].id);
    assert.equal((await ctx.workdshLibrary.list(actor)).length, 0);
    assert.equal((await ctx.workdshLibrary.search(actor, 'MarkdownAlpha')).length, 0);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('library rejects name conflicts, unsupported files, cycles and cross-owner reads', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-library-boundary-')); let ctx;
  try {
    ctx = await boot(join(root, 'storage'), join(root, 'library'));
    const folder = await ctx.workdshLibrary.createFolder(actor, '合同');
    await assert.rejects(ctx.workdshLibrary.createFolder(actor, '合同'), /library\/name-conflict/);
    await assert.rejects(ctx.workdshLibrary.move(actor, folder.id, folder.id), /library\/cycle/);
    await assert.rejects(ctx.workdshLibrary.importAsset(actor, { name: '程序.exe', bytes: new Uint8Array([1]), operationId: 'bad-format' }), /library\/unsupported-format/);
    await assert.rejects(ctx.workdshLibrary.importAsset(actor, { name: '伪装.pdf', bytes: new TextEncoder().encode('not a pdf'), operationId: 'fake-pdf' }), /library\/invalid-pdf/);
    await assert.rejects(ctx.workdshLibrary.importAsset(actor, { name: '伪装.docx', bytes: new TextEncoder().encode('not a zip'), operationId: 'fake-docx' }), /library\/invalid-office-file/);
    await assert.rejects(ctx.workdshLibrary.importAsset(actor, { name: '坏编码.txt', bytes: new Uint8Array([0xff, 0xfe, 0xfd]), operationId: 'bad-utf8' }), /library\/invalid-text/);
    const bomb = new JSZip(); bomb.file('word/document.xml', 'A'.repeat(2 * 1024 * 1024));
    await assert.rejects(ctx.workdshLibrary.importAsset(actor, { name: '压缩炸弹.docx', bytes: new Uint8Array(await bomb.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 9 } })), operationId: 'zip-bomb' }), /library\/archive-limit/);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(ctx.workdshLibrary.importAsset(actor, { name: '取消.md', bytes: new TextEncoder().encode('cancelled'), operationId: 'cancelled' }, cancelled.signal), /AbortError/);
    assert.equal((await ctx.workdshLibrary.list(actor)).length, 1, 'failed and cancelled imports create no asset');
    const item = await ctx.workdshLibrary.importAsset(actor, { name: '私有.txt', bytes: new TextEncoder().encode('private'), operationId: 'private' });
    const other = { ...actor, principalId: 'owner-b', requestId: 'request-b' };
    await assert.rejects(ctx.workdshLibrary.readText(other, item.asset.id), /library\/not-found/);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('library enforces an aggregate immutable-revision quota', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-library-quota-')); let ctx;
  try {
    ctx = await boot(join(root, 'storage'), join(root, 'library'), { maxTotalBytes: 10 });
    await ctx.workdshLibrary.importAsset(actor, { name: '一.txt', bytes: new TextEncoder().encode('123456'), operationId: 'quota-1' });
    await assert.rejects(ctx.workdshLibrary.importAsset(actor, { name: '二.txt', bytes: new TextEncoder().encode('abcdef'), operationId: 'quota-2' }), /library\/quota-exceeded/);
    assert.deepEqual((await ctx.workdshLibrary.list(actor)).map(row => row.name), ['一.txt']);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});

test('library retains an original when an otherwise valid conversion crashes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-library-failed-conversion-')); let ctx;
  try {
    ctx = await boot(join(root, 'storage'), join(root, 'library'), { converter: async () => { throw new Error('converter crashed'); } });
    const bytes = new TextEncoder().encode('source remains intact');
    const entry = await ctx.workdshLibrary.importAsset(actor, { name: '保留原件.txt', bytes, operationId: 'failed-conversion' });
    assert.equal(entry.revision.conversionStatus, 'failed');
    assert.match(entry.revision.conversionWarnings[0], /converter crashed/);
    assert.deepEqual(await ctx.workdshLibrary.readOriginal(actor, entry.asset.id), bytes);
    await assert.rejects(ctx.workdshLibrary.readText(actor, entry.asset.id), /library\/conversion-failed/);
    assert.equal((await ctx.workdshLibrary.search(actor, 'source')).length, 0);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});
