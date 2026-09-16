import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

async function boot(storageRoot, libraryRoot) {
  const ctx = new Context();
  try {
    await ctx.plugin(Storage);
    await ctx.plugin(JsonStorage, { root: storageRoot });
    await ctx.plugin(StorageDomain, { backend: 'json' });
    await ctx.plugin(LibraryManager, { root: libraryRoot });
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
    const repeated = await ctx.workdshLibrary.importAsset(actor, { parentId: folder.id, name: '规则.md', bytes: samples[0][1], operationId: 'operation-规则.md' });
    assert.equal(repeated.asset.id, imported[0].asset.id);
    assert.equal((await ctx.workdshLibrary.list(actor, folder.id)).length, 5);
    assert.equal((await ctx.workdshLibrary.search(actor, 'DocxCharlie'))[0].name, '报告.docx');
    assert.equal((await ctx.workdshLibrary.search(actor, 'PptxDelta'))[0].name, '简报.pptx');
    assert.equal((await ctx.workdshLibrary.search(actor, 'UniquePdfEcho'))[0].name, '附件.pdf');
    assert.deepEqual(await ctx.workdshLibrary.readOriginal(actor, imported[1].asset.id), samples[1][1]);
    const selected = await ctx.workdshLibrary.setTaskSelection(actor, 'session-a', [folder.id]);
    assert.equal(selected.length, 5);
    const pinnedRevision = selected.find(row => row.assetId === imported[0].asset.id).revisionId;
    const draft = await ctx.workdshLibrary.createDraft(actor, imported[0].asset.id);
    const changed = await ctx.workdshLibrary.updateDraft(actor, draft.id, '# 新规则\n\n唯一词 RevisedFoxtrot', draft.revision);
    await assert.rejects(ctx.workdshLibrary.updateDraft(actor, draft.id, 'stale', draft.revision), /library\/revision-conflict/);
    const published = await ctx.workdshLibrary.publishDraft(actor, draft.id, changed.revision);
    assert.equal(published.revision.number, 2);
    assert.equal((await ctx.workdshLibrary.search(actor, 'RevisedFoxtrot')).length, 1);
    assert.equal((await ctx.workdshLibrary.taskSelection(actor, 'session-a')).find(row => row.assetId === imported[0].asset.id).revisionId, pinnedRevision);
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
    const item = await ctx.workdshLibrary.importAsset(actor, { name: '私有.txt', bytes: new TextEncoder().encode('private'), operationId: 'private' });
    const other = { ...actor, principalId: 'owner-b', requestId: 'request-b' };
    await assert.rejects(ctx.workdshLibrary.readText(other, item.asset.id), /library\/not-found/);
  } finally { if (ctx) await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }); }
});
