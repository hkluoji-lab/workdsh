import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// The Preview launcher and the ConfigEditor register settings writers in
// module-local dsh-app-boot state, so the official CLI installed inside the
// Profile must resolve the same physical copy as the installed Profile
// packages. When they split, the page still renders and every settings write is
// rejected with a root-Include diagnostic. This probe boots the installed
// Profile the same way scripts/start-preview.mjs does and round-trips one theme
// value through the official settings Remote.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const previewHome = resolve(process.env.WORKDSH_PREVIEW_HOME ?? join(root, '.test-runtime/preview'));
const profile = resolve(previewHome, 'profiles/preview');
const artifacts = join(root, '.artifacts/preview-settings');
mkdirSync(join(root, '.test-runtime'), { recursive: true });
mkdirSync(artifacts, { recursive: true });
// Automated probes run on a throwaway Agents home so user skills cannot decide
// the outcome.
const agentsHome = mkdtempSync(join(root, '.test-runtime/settings-agents-'));

const expected = JSON.parse(readFileSync(join(root, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8')).version;
const installed = JSON.parse(readFileSync(join(profile, 'node_modules/@deepseek-ai/dsh/package.json'), 'utf8'));
assert.equal(installed.version, expected, 'Preview runtime is out of date. Run corepack pnpm preview:install first.');
const profileRequire = createRequire(join(profile, 'package.json'));
const bootFor = consumer => realpathSync(createRequire(profileRequire.resolve(`${consumer}/package.json`)).resolve('@deepseek-ai/dsh-app-boot'));
assert.equal(bootFor('@deepseek-ai/dsh'), bootFor('@deepseek-ai/dsh-config-editor'), 'Preview runtime has split settings dependencies. Run corepack pnpm preview:install first.');

let output = '';
const child = spawn(process.execPath, [`--max-old-space-size=${process.env.WORKDSH_PREVIEW_HEAP_MB ?? '8192'}`, join(profile, 'node_modules/@deepseek-ai/dsh/lib/bin.js'), '--profile', 'preview', '--host', '127.0.0.1', '--port', '0', '--no-open'], {
  cwd: root,
  env: { ...process.env, DSH_HOME: previewHome, DSH_AGENTS_HOME: agentsHome },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });

const until = async (predicate, label) => {
  const deadline = Date.now() + 180_000;
  while (!predicate()) {
    if (child.exitCode !== null) throw new Error(`Preview exited before ${label}: ${output}`);
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${label}: ${output}`);
    await new Promise(wait => setTimeout(wait, 250));
  }
};

const stop = async () => {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise(done => child.once('close', done));
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 5_000);
  await closed;
  clearTimeout(timer);
};

try {
  await until(() => /http:\/\/127\.0\.0\.1:\d+\/\?token=/.test(output), 'the local bootstrap URL');
  const address = output.match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  const login = await fetch(output.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/)[0], { redirect: 'manual', signal: AbortSignal.timeout(10_000) });
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  assert.ok(cookie, 'bootstrap sets an authenticated session cookie');

  const call = async (method, args) => {
    const response = await fetch(`${address}/api/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method, payload: { args } }),
      signal: AbortSignal.timeout(30_000),
    });
    assert.equal(response.status, 200, `${method} answered ${response.status}`);
    const body = await response.json();
    assert.equal(body.result?.ok, true, `${method} failed: ${JSON.stringify(body)}`);
    return body.result.value;
  };

  const described = await call('settings/describe', {});
  assert.equal(described.writable, true, 'the Preview settings document is not writable');
  assert.equal(described.hasDocument, true, 'the Preview Profile has no settings document');
  const theme = described.namespaces.find(entry => entry.ns === 'ui-theme');
  assert.ok(theme, `ui-theme namespace missing: ${JSON.stringify(described.namespaces.map(entry => entry.ns))}`);
  const original = theme.user?.fontSize;
  const next = typeof original === 'number' && original !== 15 ? 15 : 16;

  const written = await call('settings/mutate', { ns: 'ui-theme', ops: [{ op: 'set', path: ['fontSize'], value: next }], expectedRevision: undefined });
  assert.equal(written.value.fontSize, next, `the receipt did not carry the written value: ${JSON.stringify(written)}`);
  assert.match(written.applies, /^live$/, 'the receipt must report a live apply');
  const restored = await call('settings/mutate', typeof original === 'number'
    ? { ns: 'ui-theme', ops: [{ op: 'set', path: ['fontSize'], value: original }], expectedRevision: undefined }
    : { ns: 'ui-theme', ops: [{ op: 'unset', path: ['fontSize'] }], expectedRevision: undefined });
  assert.equal(restored.value.fontSize, original ?? 14, `restore did not return the original value: ${JSON.stringify(restored.value)}`);

  const receipt = { address, writable: described.writable, namespaceCount: described.namespaces.length, written: written.value, restored: restored.value };
  writeFileSync(join(artifacts, 'result.json'), `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Settings write accepted by the Preview runtime at ${address}: ui-theme.fontSize ${original ?? '(inherited)'} -> ${next} -> ${restored.value.fontSize}.`);
  console.log(`Receipt written to .artifacts/preview-settings/result.json (${described.namespaces.length} namespaces described).`);
} finally {
  await stop();
}
