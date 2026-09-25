import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { expertDraftUrl } from '../packages/plugins/experts/dist/domain/navigation.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = join(root, '.artifacts/office-native');
const home = await realpath(await mkdtemp(join(tmpdir(), 'workdsh-office-native-')));
await mkdir(artifacts, { recursive: true });
const workspace = join(home, 'workspace');
await mkdir(workspace);
const skillRoot = join(home, 'agents/skills/expert-authoring-test');
await mkdir(skillRoot, { recursive: true });
await writeFile(join(skillRoot, 'SKILL.md'), '---\nname: expert-authoring-test\ndescription: Safe expert authoring acceptance fixture\n---\nReturn a deterministic acceptance fixture.\n');
await mkdir(join(home, 'storages'));
const workspaceId = randomUUID();
const now = new Date().toISOString();
await writeFile(join(home, 'storages/workspace.json'), JSON.stringify({
  unit: { name: 'workspace', version: 2 },
  global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [] },
  tables: { workspaces: { [workspaceId]: { path: workspace, title: 'Expert test', sessionIds: [], createdAt: now, updatedAt: now } } },
}));
const env = { ...process.env, DSH_HOME: home, DSH_AGENTS_HOME: join(home, 'agents'), PATH: `${join(root, 'node_modules/.bin')}:${dirname(process.execPath)}:${process.env.PATH}` };
const dsh = join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const pnpm = join(root, 'node_modules/pnpm/bin/pnpm.cjs');
const exec = promisify(execFile);
const command = async (bin, args, cwd = home) => (await exec(process.execPath, [bin, ...args], { cwd, env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })).stdout;
const cli = (...args) => command(dsh, args);
let server, browser, log = '';
const browserErrors = [];
const checks = [];
const diagnostics = [];
const pass = text => { checks.push(text); console.log(`PASS: ${text}`); };
async function start() {
  log = '';
  server = spawn(process.execPath, [dsh, '--profile', 'experts', '--host', '127.0.0.1', '--port', '0', '--no-open'], { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', value => { log += value; });
  server.stderr.on('data', value => { log += value; });
  const deadline = Date.now() + 25_000;
  while (!/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/.test(log)) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Host startup failed: ${log.replace(/token=[^\s]+/g, 'token=[redacted]').slice(-2500)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const loginUrl = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)[0];
  let response;
  while (!response) {
    try { response = await fetch(loginUrl, { redirect: 'manual', signal: AbortSignal.timeout(2000) }); }
    catch {
      if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Host unavailable: ${log.replace(/token=[^\s]+/g, 'token=[redacted]').slice(-4500)}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie);
  return { address: new URL(loginUrl).origin, cookie };
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise(resolve => server.once('close', resolve));
  server.kill('SIGTERM');
  const timer = setTimeout(() => server.kill('SIGKILL'), 3000);
  await stopped; clearTimeout(timer);
}
async function api(host, endpoint, payload = {}) {
  const response = await fetch(`${host.address}/api/workdsh-experts`, { method: 'POST', headers: { cookie: host.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }), signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
}
// The Web client consumes the first activation slot on load (it auto-creates a
// blank Session, or restores the newest one). While the browser-use defect is
// active, any create issued while a page is open is a second activation whose
// MCP tool sync fails. So the probe issues its first create-execution through
// the plugin API BEFORE the browser opens (T10 debug8 evidence): that request is
// the first activation, succeeds, and leaves a real bound Session that the page
// then restores. The UI summon at the end stays as a tolerant canary instead of
// the acceptance gate.
try {
  const tarballs = [];
  for (const directory of ['packages/providers/identity-local', 'packages/plugins/audit', 'packages/plugins/access', 'packages/plugins/skills', 'packages/plugins/experts', 'packages/plugins/office', 'packages/bundle']) {
    const manifest = JSON.parse(await readFile(join(root, directory, 'package.json'), 'utf8'));
    await command(pnpm, ['--filter', manifest.name, 'pack', '--pack-destination', artifacts], root);
    tarballs.push(join(artifacts, `${manifest.name}-${manifest.version}.tgz`));
  }
  const fixture = join(home, 'probe-client'); await mkdir(fixture);
  await writeFile(join(fixture, 'package.json'), JSON.stringify({ name: 'workdsh-office-native-probe', version: '0.0.0', type: 'module', exports: { '.': './index.js', './client': './client.js' }, dsh: { bundle: { patch: './patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-sidebar-right', '@deepseek-ai/dsh-client-ui-sidebar-documentpreview'] } } }));
  await writeFile(join(fixture, 'patch.yml'), '- insert:\n    - id: office-native-probe\n      name: workdsh-office-native-probe\n');
  await writeFile(join(fixture, 'index.js'), 'export function apply() {}');
  await writeFile(join(fixture, 'client.js'), `window.__ModuleLoader__.load({id:'workdsh-office-native-probe',factory:function(){return {inject:['sidebarRight','documentPreviews'],apply:function(ctx){ctx.effect(function(){window.officeNativeProbe={files:function(sid){ctx.sidebarRight.openTabIn(sid,'files')},registered:function(){return ctx.documentPreviews.getSnapshot().map(d=>d.id)},candidates:function(path){return ctx.documentPreviews.candidates(path).map(d=>({id:d.id,title:d.title()}))}};return function(){delete window.officeNativeProbe}})}}}});`);
  await command(pnpm, ['pack', '--pack-destination', artifacts], fixture); tarballs.push(join(artifacts, 'workdsh-office-native-probe-0.0.0.tgz'));
  // The four binary formats come from committed fixtures; the two text formats
  // are written inline. .artifacts is build output, so the probe no longer
  // depends on probe:office having run first.
  const fixtures = join(root, 'tests/fixtures/office-native');
  for (const kind of ['docx','pptx','xlsx','xls']) await writeFile(join(workspace, 'input.'+kind), await readFile(join(fixtures, 'input.'+kind)));
  await writeFile(join(workspace, 'input.tsv'), '名称\t数量\nTSV_ACCEPTANCE\t42\n');
  await writeFile(join(workspace, 'input.csv'), [
    '单号,供应商,物料编码,物料名称,数量,单价,金额,交货日期,备注',
    'CG2026091701,深圳市华强电子科技集团股份有限公司宝安分公司采购中心,MAT-001,"贴片电容 0402, 100nF",500,0.12,60.00,2026-09-20,常规采购',
    'CG2026091701,深圳市华强电子科技集团股份有限公司宝安分公司采购中心,MAT-002,贴片电阻 0603 10kΩ,1000,0.05,50.00,2026-09-20,"含""加急""备注"',
    'CG2026091702,东莞市立讯精密工业股份有限公司,MAT-010,连接器 Type-C 16P,200,1.85,370.00,2026-09-25,',
  ].join('\n'));
  await cli('--profile', 'experts', '--from-default-profile', 'web', '--dump-config');
  // Exercise the same fresh-profile path used by users. Prefer the local pnpm
  // store, but allow missing transitive metadata to be fetched: a clean machine
  // cannot satisfy a first install with --offline. protobufjs is the sole
  // transitive package in this stack that declares an install script, so keep
  // pnpm's build policy explicit and narrowly scoped.
  await cli('plugin', '--profile', 'experts', 'add', ...tarballs, '--prefer-offline', '--allow-build=protobufjs');
  pass('Seven product Profile layers plus isolated diagnostic installed outside checkout');
  let host = await start();
  const listed = await api(host, 'list');
  assert.ok(listed.items.length >= 3);
  pass('Packaged expert Host and real local identity/access/audit serve defaults');
  const expertId = listed.items[0].id;
  // First create-execution before any page load (T10 debug8 evidence): the Web
  // client consumes the first activation slot on load, so a page-open create is
  // always a second activation and its tool sync fails while the browser-use
  // defect is active. Issuing prepare/create through the plugin API here - the
  // same service the UI summon uses - makes it the first activation: it
  // succeeds and leaves a real bound Session that the page then restores.
  const summonPlan = await api(host, 'prepare-execution', { expertId, workspaceRef: workspace, workspaceId: String(workspaceId), draftText: '探针：首个工作区会话。' });
  const summonCreated = await api(host, 'create-execution', { executionPlanId: summonPlan.executionPlanId, operationId: 'probe-first-session' });
  const boundSessionId = summonCreated.sessionId ?? summonCreated.binding?.sessionId;
  assert.ok(boundSessionId, 'first create-execution returned no sessionId: ' + JSON.stringify(summonCreated).slice(0, 400));
  await api(host, 'verify-binding', { sessionId: boundSessionId });
  pass('First create-execution before any page load produced a real bound Session');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  page.on('response', async response => {
    if (!response.url().endsWith('/api/workdsh-experts')) return;
    try { const body = await response.json(); if (!body?.ok) browserErrors.push('expert API failure: ' + JSON.stringify(body?.error ?? body).slice(0, 400)); } catch {}
  });
  await page.context().addCookies(host.cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: host.address }; }));
  await page.goto(host.address);
  for (const name of ['Continue', 'Configure later']) await page.getByRole('button', { name, exact: true }).click({ timeout: 4000 }).catch(() => {});
  // The page restores the bound Session created above (T10 debug8); let the
  // client settle before touching the right sidebar.
  await page.locator('[contenteditable="true"]').first().waitFor({ timeout: 20_000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.waitForFunction(() => window.officeNativeProbe);
  const registered = await page.evaluate(() => window.officeNativeProbe.registered());
  for (const id of ['workdsh-office', 'workdsh-office-csv']) assert.ok(registered.includes(id), `Client registry lost ${id}: ${JSON.stringify(registered)}`);
  // Fresh-load UI race insurance (T10): a pointer click can hang without
  // dispatching anything; a DOM click still runs the real handler.
  const clickWithFallback = async (locator, timeout) => {
    const failure = await locator.click({ timeout }).then(() => null).catch(error => String(error.message).split('\n')[0]);
    if (!failure) return;
    console.log('DIAGNOSTIC: pointer click hung (' + failure + '); dispatching DOM click');
    await locator.evaluate(el => el.click()).catch(() => {});
  };
  // The right sidebar keeps a collapsed default in a fresh home, and
  // sidebarRight.openTabIn is a silent no-op unless the Session's tab store was
  // adopted by mounting the panel. Native path proven in T10 debug7: open the
  // sidebar, click the guide's 'Workspace files' card, and the Files tab lists
  // the session workspace; openTabIn stays as the belt-and-braces fallback.
  const openSidebar = page.getByRole('button', { name: 'Open right sidebar', exact: true });
  if (await openSidebar.isVisible().catch(() => false)) {
    await clickWithFallback(openSidebar, 8000);
    await page.waitForTimeout(1200);
  }
  const filesCard = page.getByText('Workspace files', { exact: true }).first();
  if (await filesCard.isVisible().catch(() => false)) {
    await clickWithFallback(filesCard, 8000);
    await page.waitForTimeout(1500);
  }
  const docxEntry = page.getByText('input.docx', { exact: true }).first();
  if (!(await docxEntry.isVisible().catch(() => false))) {
    await page.evaluate(sid => window.officeNativeProbe.files(sid), boundSessionId).catch(() => {});
    await page.waitForTimeout(2000);
  }
  assert.ok(await docxEntry.isVisible().catch(() => false), 'Files tab never listed input.docx after the sidebar prologue');
  await page.screenshot({path:join(artifacts,'files.png')});
  // Six suffixes split by the official builtin owner: docx/pptx convert to PDF
  // through the Host's dsh-office-to-pdf Remote, xlsx/xls/csv/tsv render in the
  // browser parser. WorkDSH registers the same suffixes as builtin candidates,
  // so the native preview owns the default view and the editor stays one menu
  // entry away.
  const officialOffice = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/office';
  const officialExcel = '@deepseek-ai/dsh-client-ui-sidebar-documentpreview/excel';
  const formats = {
    docx: { viewer: officialOffice, editors: ['workdsh-office'] },
    pptx: { viewer: officialOffice, editors: ['workdsh-office'] },
    xlsx: { viewer: officialExcel, editors: ['workdsh-office'] },
    xls: { viewer: officialExcel, editors: [] },
    csv: { viewer: officialExcel, editors: ['workdsh-office-csv'] },
    tsv: { viewer: officialExcel, editors: [] },
  };
  // Inactive document tabs stay mounted, so viewer assertions read only the
  // visible containers instead of the first match in document order.
  const visibleViewers = () => page.evaluate(() => [...document.querySelectorAll('[data-document-preview]')].filter(node => node.offsetParent !== null).map(node => node.getAttribute('data-document-preview')));
  const waitForViewer = async id => {
    const deadline = Date.now() + 90_000;
    while (!(await visibleViewers()).includes(id)) {
      if (Date.now() > deadline) throw new Error(`viewer ${id} never became visible; visible=${JSON.stringify(await visibleViewers())}`);
      await page.waitForTimeout(250);
    }
  };
  for (const [kind, expected] of Object.entries(formats)) {
    const entry = page.getByText('input.'+kind, {exact:true}).first();
    if (!(await entry.isVisible().catch(() => false))) {
      // The previous kind leaves its editor tab active; bring the Files tab
      // forward, then fall back to openTabIn once before clicking the entry.
      const filesTab = page.getByRole('tab', { name: 'Files', exact: true }).first();
      if (await filesTab.isVisible().catch(() => false)) await clickWithFallback(filesTab, 5000);
      await page.waitForTimeout(800);
      if (!(await entry.isVisible().catch(() => false))) {
        await page.evaluate(sid => window.officeNativeProbe.files(sid), boundSessionId).catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
    await clickWithFallback(entry, 30000);
    const candidates = await page.evaluate(kind => window.officeNativeProbe.candidates('input.'+kind), kind);
    const ids = candidates.map(row => row.id);
    assert.ok(ids.length > 0, `input.${kind}: no preview implementation registered`);
    for (const editor of expected.editors) assert.ok(ids.includes(editor), `input.${kind}: WorkDSH candidate ${editor} missing from ${JSON.stringify(ids)}`);
    assert.equal(candidates[0].id, expected.viewer, `input.${kind}: default viewer is not the official preview: ${JSON.stringify(candidates)}`);
    await waitForViewer(expected.viewer);
    if (kind === 'docx' || kind === 'pptx') {
      await page.locator('[data-pdf-preview]:visible').first().waitFor({timeout: 90_000});
      assert.ok(await page.locator('[data-pdf-preview] canvas').count(), `input.${kind}: converted PDF rendered no page canvas`);
    } else {
      await page.locator('[data-excel-preview]:visible').first().waitFor({timeout: 60_000});
    }
    const viewerText = await page.locator(`[data-document-preview="${expected.viewer}"]:visible`).first().innerText();
    assert.doesNotMatch(viewerText, /File not found|文件不存在|Unable to preview|Failed to load|无法显示 PDF|无法打开此表格/i);
    await writeFile(join(artifacts,kind+'-candidates.json'), JSON.stringify(candidates,null,2));
    await writeFile(join(artifacts,kind+'-viewer.txt'), viewerText);
    await page.screenshot({path:join(artifacts,'native-'+kind+'.png')});
    pass('Official builtin preview owns input.'+kind+' by default: '+expected.viewer);
    if (!expected.editors.length) continue;
    // The registry keeps every match, so the viewer menu must still reach the
    // WorkDSH editor for the suffix it shares with the official builtin.
    const editor = expected.editors[0];
    const label = editor === 'workdsh-office-csv' ? 'CSV 表格' : 'Office 浏览器编辑';
    await clickWithFallback(page.locator('[data-document-viewer-menu]:visible').first(), 15_000);
    await clickWithFallback(page.getByText(label, {exact:true}).first(), 15_000);
    await waitForViewer(editor);
    if (kind === 'docx') {
      await page.getByRole('region', {name: 'DOCX文档编辑', exact: true}).waitFor({timeout: 30_000});
      await page.getByRole('button', {name: '下载 Word', exact: true}).waitFor({timeout: 30_000});
    } else if (kind === 'pptx') {
      const pptEditor = page.getByRole('region', {name: 'PPTX 编辑', exact: true});
      await pptEditor.waitFor({timeout: 30_000});
      await pptEditor.getByRole('tab', {name: '开始', exact: true}).waitFor({timeout: 30_000});
    } else if (kind === 'xlsx') {
      const child = page.frameLocator('iframe[title="Office 文档编辑"]').last();
      await child.locator('#status').filter({hasText: 'Excel 支持'}).waitFor({timeout:30_000});
    } else {
      const csv = page.getByRole('region', {name: 'CSV 表格预览', exact: true});
      await csv.waitFor({timeout: 30_000});
      await csv.getByRole('columnheader', {name: '单号', exact: true}).waitFor({timeout: 30_000});
      await csv.getByRole('cell', {name: '贴片电阻 0603 10kΩ', exact: true}).waitFor({timeout: 30_000});
    }
    await page.screenshot({path:join(artifacts,'editor-'+kind+'.png')});
    pass('Viewer menu still opens the WorkDSH editor for input.'+kind+': '+editor);
  }
  // UI summon canary (T10 finding #3), deliberately tolerant: the page is
  // open, so the Web client has already consumed the first activation slot and
  // this UI summon's create-execution is a second activation. While the
  // browser-use cross-install dsh-scope defect is active it is expected to be
  // rejected; the canary records the real error instead of aborting and flips
  // back to the strict PASS (binding verified) by itself once upstream fixes
  // the defect. The Office acceptance above already ran on the bound Session.
  await page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true }).click();
  await page.getByRole('button', { name: '专家', exact: true }).click();
  await expect(page.getByTestId('workdsh-experts')).toBeVisible({ timeout: 15_000 });
  const detailButton = page.getByRole('button', { name: `查看专家 ${listed.items[0].name}`, exact: true });
  await detailButton.waitFor({ timeout: 15_000 });
  await clickWithFallback(detailButton, 15_000);
  const exampleButton = page.getByTitle('用此示例召唤专家（仅填入草稿，不会自动发送）', { exact: true }).first();
  await exampleButton.waitFor({ state: 'visible', timeout: 15_000 });
  let prepareSeen = false;
  const isExpertCall = endpoint => response => {
    if (!response.url().endsWith('/api/workdsh-experts')) return false;
    try { const value = response.request().postDataJSON()?.endpoint; if (value === 'prepare-execution') prepareSeen = true; return value === endpoint; } catch { return false; }
  };
  // Each attempt re-arms its own listener pair (born with their own catch), so
  // a hung pointer click can never leave the summon window unobserved.
  const armSummon = () => [
    page.waitForResponse(isExpertCall('prepare-execution'), { timeout: 25_000 }).catch(() => null),
    page.waitForResponse(isExpertCall('create-execution'), { timeout: 25_000 }).catch(() => null),
  ];
  let pending = armSummon();
  let domClickUsed = false;
  let clickFailure = await exampleButton.click({ timeout: 15_000 }).then(() => null).catch(error => String(error.message).split('\n')[0]);
  if (clickFailure && !prepareSeen) {
    console.log('DIAGNOSTIC: first example-summon click produced no request, retrying: ' + clickFailure);
    await page.waitForTimeout(1000);
    pending = armSummon();
    clickFailure = await exampleButton.click({ timeout: 15_000 }).then(() => null).catch(error => String(error.message).split('\n')[0]);
  } else if (prepareSeen) clickFailure = null;
  if (clickFailure && !prepareSeen) {
    // Fresh-load UI race (T10): the button can hang without dispatching
    // anything; a DOM click still runs the real handler, keeping the summon
    // flow and its genuine rejection observable instead of leaving a dead probe.
    console.log('DIAGNOSTIC: pointer clicks produced no request; dispatching DOM click');
    pending = armSummon();
    domClickUsed = true;
    await exampleButton.evaluate(el => el.click()).catch(error => { clickFailure = String(error).split('\n')[0]; });
  }
  const [prepareResponse, createResponse] = await Promise.all(pending);
  let summoned;
  if (createResponse) { try { summoned = (await createResponse.json())?.value; } catch { /* non-JSON rejection body */ } }
  if (summoned?.sessionId) {
    await api(host, 'verify-binding', { sessionId: summoned.sessionId });
    pass('UI summon created a real native Session and fixed binding verified');
  } else {
    const rejection = createResponse ? await createResponse.json().catch(() => undefined) : undefined;
    diagnostics.push({
      step: 'UI summon create-execution (page-open second activation)',
      error: rejection?.error ?? { code: 'probe/no-create-request', clickFailure, domClickUsed, prepareRequested: prepareSeen, prepareAccepted: Boolean(prepareResponse) },
      officeSessionId: boundSessionId,
      note: 'expected rejection while the browser-use cross-install dsh-scope defect is active: the first activation was consumed before the page opened, so this page-open create is a second activation and its MCP tool sync fails. Flips back to the strict PASS automatically once the defect is fixed.',
    });
    console.log('DIAGNOSTIC: UI summon blocked: ' + JSON.stringify(rejection?.error ?? { clickFailure, prepareSeen }).slice(0, 400));
    await page.getByRole('button', { name: '关闭', exact: true }).first().click({ timeout: 3000 }).catch(() => {});
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(300);
  }
  await writeFile(join(artifacts,'result.json'),JSON.stringify({checks,browserErrors,diagnostics},null,2));
} catch(error) {
  await writeFile(join(artifacts,'failure.txt'),String(error));
  await writeFile(join(artifacts,'failure-server.log'),log.replace(/token=[^\s]+/g,'token=[redacted]').slice(-20000));
  const page=browser?.contexts()[0]?.pages()[0];
  if(page) {await page.screenshot({path:join(artifacts,'failure.png')}); await writeFile(join(artifacts,'failure-dom.txt'),await page.locator('body').innerText());}
  await writeFile(join(artifacts,'failure-errors.json'),JSON.stringify(browserErrors,null,2));
  throw error;
} finally {await browser?.close();await stop();}
