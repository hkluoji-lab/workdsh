import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { chromium, expect } from '@playwright/test';

const root = fileURLToPath(new URL('..', import.meta.url));
const artifacts = join(root, '.artifacts/skills-standalone');
await mkdir(artifacts, { recursive: true });
// Outside the checkout: an undeclared dependency cannot leak from ancestor node_modules.
const home = await mkdtemp(join(tmpdir(), 'workdsh-skills-package-'));
const workspace = join(home, 'workspace');
await mkdir(workspace);
const env = { ...process.env, DSH_HOME: home, DSH_AGENTS_HOME: join(home, 'agents'), PATH: `${join(root, 'node_modules/.bin')}:${dirname(process.execPath)}:${process.env.PATH}` };
const dsh = join(root, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
const pnpm = join(root, 'node_modules/pnpm/bin/pnpm.cjs');
const manifest = JSON.parse(await readFile(join(root, 'packages/plugins/skills/package.json'), 'utf8'));
const tarball = join(artifacts, `${manifest.name}-${manifest.version}.tgz`);
const exec = promisify(execFile);
const command = async (bin, args, cwd = home) => (await exec(process.execPath, [bin, ...args], { cwd, env, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })).stdout;
const cli = (...args) => command(dsh, args);
const fixture = 'standalone-skill';
const skillFile = join(home, 'agents/skills', fixture, 'SKILL.md');
await mkdir(dirname(skillFile), { recursive: true });
await writeFile(skillFile, `---\nname: ${fixture}\ndescription: Standalone package fixture\n---\nORIGINAL\n`);
const workspaceId = randomUUID();
const now = new Date().toISOString();
await mkdir(join(home, 'storages'), { recursive: true });
await writeFile(join(home, 'storages/workspace.json'), JSON.stringify({
  unit: { name: 'workspace', version: 2 },
  global: { initialized: true, workspaceIds: [workspaceId], archivedSessionIds: [] },
  tables: { workspaces: { [workspaceId]: { path: workspace, title: 'Standalone test', sessionIds: [], createdAt: now, updatedAt: now } } },
}));
let server, log = '', browser;
const results = [];
const pass = label => { results.push(label); console.log(`PASS: ${label}`); };
async function start() {
  log = '';
  server = spawn(process.execPath, [dsh, '--profile', 'skills', '--host', '127.0.0.1', '--port', '0', '--no-open'], { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', value => { log += value; }); server.stderr.on('data', value => { log += value; });
  const deadline = Date.now() + 25_000;
  while (!/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/.test(log)) {
    if (server.exitCode !== null || Date.now() > deadline) throw new Error(`Host startup failed: ${log.replace(/token=[^\s]+/g, 'token=[redacted]').slice(-3000)}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  const loginUrl = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[\w-]+/)[0];
  const address = new URL(loginUrl).origin;
  const response = await fetch(loginUrl, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie);
  return { address, cookie };
}
async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const stopped = new Promise(resolve => server.once('close', resolve));
  server.kill('SIGTERM');
  const timer = setTimeout(() => server.kill('SIGKILL'), 3000);
  await stopped; clearTimeout(timer);
}
async function pageFor({ address, cookie }) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.context().addCookies(cookie.split('; ').map(pair => { const at = pair.indexOf('='); return { name: pair.slice(0, at), value: pair.slice(at + 1), url: address }; }));
  await page.goto(address);
  for (const name of ['Continue', 'Configure later']) await page.getByRole('button', { name, exact: true }).waitFor({ state: 'visible', timeout: 4000 }).then(() => page.getByRole('button', { name, exact: true }).click()).catch(() => {});
  return page;
}
async function api(host, endpoint, payload = {}) {
  const response = await fetch(`${host.address}/api/workdsh-skills`, { method: 'POST', headers: { cookie: host.cookie, 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }), signal: AbortSignal.timeout(10_000) });
  return response.json();
}
try {
  await command(pnpm, ['--filter', 'workdsh-plugin-skills', 'pack', '--pack-destination', artifacts], root);
  await cli('--profile', 'skills', '--from-default-profile', 'web', '--dump-config');
  await cli('plugin', '--profile', 'skills', 'add', tarball, '--offline');
  const config = await cli('--profile', 'skills', '--dump-config');
  assert.equal(config.split('id: workdsh-skills').length - 1, 1);
  assert.ok(!config.includes('workdsh-bundle'));
  const installedRoot = join(home, 'profiles/skills/node_modules/workdsh-plugin-skills');
  const installed = JSON.parse(await readFile(join(installedRoot, 'package.json'), 'utf8'));
  assert.equal(installed.version, manifest.version);
  assert.ok(installed.dsh.bundle && installed.dsh.client);
  assert.ok(!(await readFile(join(installedRoot, 'dist/shared.d.ts'), 'utf8')).includes('workdsh-contracts/'));
  pass('Skill tarball installed outside checkout; one independent Profile layer; no product bundle');
  browser = await chromium.launch({ headless: true });
  let host = await start();
  let page = await pageFor(host);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const graph = await page.evaluate(() => window.__DSH_BOOT__.entries.map(row => row.id));
  assert.equal(graph.filter(id => id === manifest.name).length, 1);
  assert.ok(!graph.includes('workdsh-bundle'));
  const nav = page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true });
  await expect(nav).toHaveCount(1);
  await nav.click();
  await expect(page.getByRole('button', { name: `查看技能 ${fixture}`, exact: true })).toBeVisible();
  assert.equal((await api(host, 'list')).value.filter(row => row.name === 'skill-creator').length, 1);
  await page.getByRole('button', { name: `查看技能 ${fixture}`, exact: true }).click();
  await page.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'SKILL.md', exact: true });
  const modified = `---\nname: ${fixture}\ndescription: Standalone package fixture\n---\nINDEPENDENT_EDIT\n`;
  await editor.fill(modified);
  await page.getByRole('button', { name: '保存并重新发现', exact: true }).click();
  await expect(editor).toHaveCount(0);
  assert.equal(await readFile(skillFile, 'utf8'), modified);
  const conflict = await api(host, 'update', { name: fixture, document: modified, expectedRevision: 'stale' });
  assert.equal(conflict.error.code, 'skill/revision-conflict');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('switch', { name: `停用技能 ${fixture}`, exact: true }).click();
  await expect(page.getByRole('switch', { name: `启用技能 ${fixture}`, exact: true })).toBeVisible();
  await page.getByRole('switch', { name: `启用技能 ${fixture}`, exact: true }).click();
  await expect(page.getByRole('switch', { name: `停用技能 ${fixture}`, exact: true })).toBeVisible();
  await page.getByRole('button', { name: `管理技能 ${fixture}`, exact: true }).click();
  await page.getByRole('menuitem', { name: '卸载', exact: true }).click();
  await page.getByRole('button', { name: '确认卸载', exact: true }).click();
  await expect(page.getByRole('button', { name: `查看技能 ${fixture}`, exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '最近卸载', exact: true }).click();
  await page.getByRole('button', { name: '恢复', exact: true }).click();
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await expect(page.getByRole('button', { name: `查看技能 ${fixture}`, exact: true })).toBeVisible();
  await page.screenshot({ path: join(artifacts, 'standalone.png'), fullPage: true });
  assert.deepEqual(errors, []);
  pass('Independent Client navigation, edit/save/conflict, enable/disable, uninstall/restore write real files');
  await page.close(); await stop();
  await cli('plugin', '--profile', 'skills', 'remove', manifest.name);
  assert.ok(!(await cli('--profile', 'skills', '--dump-config')).includes('id: workdsh-skills'));
  host = await start(); page = await pageFor(host);
  await expect(page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true })).toHaveCount(0);
  await expect(page.getByText(/新会话|New Session/, { exact: true }).first()).toBeVisible();
  assert.ok(!(await page.evaluate(() => window.__DSH_BOOT__.entries.map(row => row.id))).includes(manifest.name));
  assert.equal((await fetch(`${host.address}/api/workdsh-skills`, { method: 'POST', headers: { cookie: host.cookie }, body: '{}' })).status, 404);
  assert.equal(await readFile(skillFile, 'utf8'), modified);
  pass('Cold removal withdraws Host route and Client/navigation while preserving native Web and user skill files');
  await page.close(); await stop();
  await cli('plugin', '--profile', 'skills', 'add', tarball, '--offline');
  // Repeating the same installation must not add another layer or registration.
  await cli('plugin', '--profile', 'skills', 'add', tarball, '--offline');
  assert.equal((await cli('--profile', 'skills', '--dump-config')).split('id: workdsh-skills').length - 1, 1);
  host = await start(); page = await pageFor(host);
  await page.getByRole('button', { name: '专家 · 技能 · 连接器', exact: true }).click();
  await expect(page.getByRole('button', { name: `查看技能 ${fixture}`, exact: true })).toHaveCount(1);
  assert.equal((await api(host, 'detail', { name: fixture })).value.document, modified);
  pass('Reinstall and repeat install activate once and recover edited skill data');
  await writeFile(join(artifacts, 'result.json'), JSON.stringify({ version: manifest.version, home, results, modelCalls: 0, liveCliRemoval: 'not claimed' }, null, 2));
} catch (error) {
  console.error(`${String(error)}\n${error.stdout ?? ''}`.replace(/token=[^\s]+/g, 'token=[redacted]'));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  await stop();
}
