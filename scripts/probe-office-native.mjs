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
  await writeFile(join(fixture, 'client.js'), `window.__ModuleLoader__.load({id:'workdsh-office-native-probe',factory:function(){return {inject:['sidebarRight','documentPreviews'],apply:function(ctx){ctx.effect(function(){window.officeNativeProbe={files:function(sid){ctx.sidebarRight.openTabIn(sid,'files')},registered:function(){return ctx.documentPreviews.getSnapshot().map(d=>d.id)}};return function(){delete window.officeNativeProbe}})}}}});`);
  await command(pnpm, ['pack', '--pack-destination', artifacts], fixture); tarballs.push(join(artifacts, 'workdsh-office-native-probe-0.0.0.tgz'));
  for (const kind of ['docx','pptx','xlsx']) await writeFile(join(workspace, 'input.'+kind), await readFile(join(root, '.artifacts/office-integration/input.'+kind)));
  await cli('--profile', 'experts', '--from-default-profile', 'web', '--dump-config');
  await cli('plugin', '--profile', 'experts', 'add', ...tarballs, '--offline');
  pass('Seven product Profile layers plus isolated diagnostic installed outside checkout');
  let host = await start();
  const listed = await api(host, 'list');
  assert.ok(listed.items.length >= 3);
  pass('Packaged expert Host and real local identity/access/audit serve defaults');
  const expertId = listed.items[0].id;
  const plan = await api(host, 'prepare-execution', { expertId });
  assert.equal(plan.missing.length, 0, JSON.stringify(plan.missing));
  const creation = await api(host, 'create-execution', { executionPlanId: plan.executionPlanId, operationId: 'packaged-create' });
  assert.ok(creation.sessionId);
  await api(host, 'verify-binding', { sessionId: creation.sessionId });
  pass('Real native Session created and fixed binding verified');
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', error => browserErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') browserErrors.push(message.text()); });
  await page.context().addCookies(host.cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: host.address }; }));
  await page.goto(host.address);
  for (const name of ['Continue', 'Configure later']) await page.getByRole('button', { name, exact: true }).click({ timeout: 4000 }).catch(() => {});
  await page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true }).click();
  await page.getByRole('button', { name: '专家', exact: true }).click();
  await expect(page.getByTestId('workdsh-experts')).toBeVisible();
  await expect(page.getByText(listed.items[0].name, { exact: true }).first()).toBeVisible();
  await page.waitForFunction(() => window.officeNativeProbe);
  assert.ok((await page.evaluate(() => window.officeNativeProbe.registered())).includes('workdsh-office'));
  await page.getByRole('button', { name: `查看专家 ${listed.items[0].name}`, exact: true }).click();
  const summonedResponse = page.waitForResponse(response => response.url().endsWith('/api/workdsh-experts') && response.request().postDataJSON()?.endpoint === 'create-execution');
  await page.getByTitle('用此示例召唤专家（仅填入草稿，不会自动发送）', { exact: true }).first().click();
  const summoned = (await (await summonedResponse).json()).value;
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
  await page.evaluate(sid => window.officeNativeProbe.files(sid), summoned.sessionId);
  await page.screenshot({path:join(artifacts,'files.png')});
  for (const kind of ['docx','pptx','xlsx']) {
    await page.evaluate(sid => window.officeNativeProbe.files(sid), summoned.sessionId);
    await page.getByText('input.'+kind, {exact:true}).first().click();
    const child = page.frameLocator('iframe[title="Office 文档编辑"]').last();
    await child.locator('#status').filter({hasText:kind==='docx'?'Word 支持':kind==='pptx'?'PPT 支持':'Excel 支持'}).waitFor({timeout:30000});
    await page.screenshot({path:join(artifacts,'native-'+kind+'.png')});
    pass('Official resource read and native Office Tab: '+kind);
  }
  await writeFile(join(artifacts,'result.json'),JSON.stringify({checks,browserErrors},null,2));
} catch(error) {
  await writeFile(join(artifacts,'failure.txt'),String(error));
  const page=browser?.contexts()[0]?.pages()[0];
  if(page) {await page.screenshot({path:join(artifacts,'failure.png')}); await writeFile(join(artifacts,'failure-dom.txt'),await page.locator('body').innerText());}
  throw error;
} finally {await browser?.close();await stop();}
