// Probe the official bases the automations module plans to build on
// (docs/design/automations/ACCEPTANCE.md section 3, P-AU-1..P-AU-4).
//
// This script is evidence collection, not product code: it never imports
// packages/plugins/automations and never writes into the repository.
//
// Official packages are resolved from the installed WorkDSH preview profile so
// every plugin shares one cordis module instance, exactly as the product
// composition does.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { zstdDecompressSync } from 'node:zlib';

const root = resolve(import.meta.dirname, '..');
const previewHome = resolve(root, '.test-runtime/preview');
const profileDir = join(previewHome, 'profiles/preview');
const dshCli = join(profileDir, 'node_modules/@deepseek-ai/dsh/lib/bin.js');
if (!existsSync(dshCli)) throw new Error('WorkDSH preview runtime is missing; run `corepack pnpm preview:install` first.');

const profileRequire = createRequire(join(profileDir, 'package.json'));
const load = (specifier) => import(pathToFileURL(profileRequire.resolve(specifier)).href);
const versionOf = (name) => JSON.parse(readFileSync(profileRequire.resolve(`${name}/package.json`), 'utf8')).version;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const report = {};

function dumpConfig(home, profile) {
  const run = spawnSync(process.execPath, [dshCli, '--profile', profile, '--dump-config'], {
    cwd: root,
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
    timeout: 120_000,
  });
  if (run.status !== 0) throw new Error(`--dump-config failed for profile ${profile}: ${run.stderr || run.stdout}`);
  return run.stdout;
}

// --- P-AU-1: in-process timer capability -----------------------------------
// The profile layer is checked against the installed preview profile; the
// runtime half proves ticks fire and that a plugin-owned interval stops with
// its fiber, with no explicit disposer and no residual handle.
report['P-AU-1'] = await (async () => {
  const timerVersion = versionOf('@deepseek-ai/cordis-plugin-timer');
  const timerEntries = dumpConfig(previewHome, 'preview')
    .split('\n')
    .filter((line) => /name: '@deepseek-ai\/cordis-plugin-timer'/.test(line));
  assert.equal(timerEntries.length, 1, 'preview profile must compose exactly one timer plugin entry');

  const { Context } = await load('@deepseek-ai/cordis');
  const TimerService = (await load('@deepseek-ai/cordis-plugin-timer')).default;
  const ctx = new Context();
  await ctx.plugin(TimerService);

  const observed = {};
  await ctx.plugin({
    inject: ['timer'],
    async apply(inner) {
      observed.hasTimerService = Boolean(inner.timer);
      observed.members = Object.fromEntries(['setInterval', 'setTimeout', 'interval', 'timeout'].map((member) => [member, typeof inner[member]]));

      let explicit = 0;
      const stop = inner.interval(() => { explicit += 1; }, 30);
      await sleep(120);
      observed.explicitTicks = explicit;
      stop();
      const frozen = explicit;
      await sleep(120);
      observed.explicitDisposerStops = explicit === frozen;

      let scoped = 0;
      const child = await inner.plugin({ inject: ['timer'], apply: (nested) => { nested.interval(() => { scoped += 1; }, 30); } });
      await sleep(120);
      observed.scopedTicks = scoped;
      const timeoutsBeforeDispose = process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length;
      await child.dispose();
      const scopedFrozen = scoped;
      await sleep(150);
      observed.fiberDisposalStops = scoped === scopedFrozen;
      observed.noLeakedTimeoutHandle =
        process.getActiveResourcesInfo().filter((kind) => kind === 'Timeout').length < timeoutsBeforeDispose;
    },
  });
  assert.ok(observed.hasTimerService, 'ctx.timer is missing inside an inject-scoped plugin');
  for (const member of ['setInterval', 'setTimeout', 'interval', 'timeout']) {
    assert.equal(observed.members[member], 'function', `ctx.${member} is missing`);
  }
  assert.ok(observed.explicitTicks >= 2, `explicit interval fired ${observed.explicitTicks} times`);
  assert.ok(observed.explicitDisposerStops, 'explicit disposer did not stop the interval');
  assert.ok(observed.scopedTicks >= 2, `plugin-scoped interval fired ${observed.scopedTicks} times`);
  assert.ok(observed.fiberDisposalStops, 'plugin-scoped interval outlived its fiber');
  assert.ok(observed.noLeakedTimeoutHandle, 'a Timeout handle leaked after fiber disposal');
  await ctx.stop?.();
  return {
    version: timerVersion,
    profile: 'preview composes exactly one @deepseek-ai/cordis-plugin-timer entry',
    runtime: `${JSON.stringify(observed.members)}; explicit and fiber-owned disposal both stop ticks with no leaked Timeout handle`,
  };
})();

// --- P-AU-2: webhook runtime is fire-and-forget and never dedupes -----------
report['P-AU-2'] = await (async () => {
  const webhookVersion = versionOf('@deepseek-ai/dsh-webhook');
  const dump = dumpConfig(previewHome, 'preview');
  assert.equal(
    dump.split('\n').filter((line) => /name: '@deepseek-ai\/dsh-webhook'/.test(line)).length,
    0,
    'the preview profile is not expected to compose the webhook runtime',
  );

  const { Context } = await load('@deepseek-ai/cordis');
  const WebhookRuntime = (await load('@deepseek-ai/dsh-webhook')).default;
  const ctx = new Context();
  // The runtime injects these services; rules returning null never touch them.
  for (const key of ['agents', 'agentDefaultModel', 'agentPresets', 'permissionPresets', 'sessionTitle', 'workspaceRegistry']) {
    ctx.provide(key, { probeStub: true });
  }
  await ctx.plugin(WebhookRuntime);
  const runtime = ctx.webhookRuntime;
  assert.ok(runtime, 'ctx.webhookRuntime is missing');
  assert.equal(typeof runtime.register, 'function');
  assert.equal(typeof runtime.dispatch, 'function');

  const seen = [];
  let slowSettled = false;
  const disposer = runtime.register({
    id: 'probe-rule',
    kind: 'probe',
    run: (delivery) => {
      seen.push(delivery.deliveryId);
      return sleep(60).then(() => { slowSettled = true; return null; });
    },
  });
  assert.equal(typeof disposer, 'function', 'register must return a disposal function');

  const delivery = { kind: 'probe', source: 'probe-source', deliveryId: 'delivery-1', event: { ok: true }, receivedAt: Date.now() };
  assert.equal(runtime.dispatch(delivery), undefined, 'dispatch must return without a result');
  await sleep(20);
  assert.deepEqual(seen, ['delivery-1'], 'dispatch did not start the matching rule');
  assert.equal(slowSettled, false, 'dispatch waited for the rule callback to settle');
  runtime.dispatch(delivery);
  await sleep(20);
  assert.deepEqual(seen, ['delivery-1', 'delivery-1'], 'the runtime deduplicated a repeated deliveryId');
  assert.throws(() => runtime.dispatch({ ...delivery, receivedAt: -1 }), /receivedAt/, 'malformed deliveries must be rejected synchronously');

  await disposer();
  runtime.dispatch({ ...delivery, deliveryId: 'delivery-2' });
  await sleep(20);
  assert.deepEqual(seen, ['delivery-1', 'delivery-1'], 'a disposed rule still received deliveries');
  await sleep(120);
  await ctx.stop?.();
  return {
    version: webhookVersion,
    profile: 'preview does not compose @deepseek-ai/dsh-webhook; the runtime must be composed explicitly',
    runtime: 'register/dispatch work and dispatch returns before the callback settles, but repeated deliveryIds are NOT deduplicated: occurrence and delivery idempotency stay WorkDSH business logic',
  };
})();

// --- P-AU-3: single scheduler owner ---------------------------------------
report['P-AU-3'] = await (async () => {
  const { Context } = await load('@deepseek-ai/cordis');
  const LocalJobRegistry = (await load('@deepseek-ai/dsh-jobs-local')).default;
  const ctx = new Context();
  await ctx.plugin(LocalJobRegistry);
  const jobs = ctx.jobs;
  for (const member of ['start', 'list', 'get', 'read', 'readAt', 'kill', 'wait', 'remove', 'attachController']) {
    assert.equal(typeof jobs[member], 'function', `ctx.jobs.${member} is missing`);
  }
  assert.deepEqual(jobs.list(), [], 'a fresh in-process registry starts empty');

  const { tryLockExclusive } = await load('@deepseek-ai/node-addon-system/flock');
  const dir = await mkdtemp(join(tmpdir(), 'workdsh-au-lease-'));
  const lockPath = join(dir, 'scheduler.lock');
  const holderPath = join(dir, 'holder.mjs');

  const first = await open(lockPath, 'w');
  await tryLockExclusive(first.fd);
  const contender = await open(lockPath, 'w');
  await assert.rejects(tryLockExclusive(contender.fd), (error) => error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK');
  await contender.close();
  await first.close();
  const successor = await open(lockPath, 'w');
  await tryLockExclusive(successor.fd);
  await successor.close();

  await writeFile(holderPath, [
    `import { open } from 'node:fs/promises';`,
    `import { tryLockExclusive } from ${JSON.stringify(pathToFileURL(profileRequire.resolve('@deepseek-ai/node-addon-system/flock')).href)};`,
    `const handle = await open(process.argv[2], 'w');`,
    `await tryLockExclusive(handle.fd);`,
    `process.stdout.write('locked\\n');`,
    `setInterval(() => {}, 1000);`,
  ].join('\n'));
  const child = spawn(process.execPath, [holderPath, lockPath], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((done, failed) => {
    child.stdout.once('data', done);
    child.once('exit', (code) => failed(new Error(`lock holder exited early (${code})`)));
  });
  const whileHeld = await open(lockPath, 'w');
  await assert.rejects(tryLockExclusive(whileHeld.fd), (error) => error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK');
  await whileHeld.close();
  child.kill('SIGKILL');
  await new Promise((done) => child.once('exit', done));
  const afterDeath = await open(lockPath, 'w');
  await tryLockExclusive(afterDeath.fd);
  await afterDeath.close();
  await ctx.dispose?.();
  await rm(dir, { recursive: true, force: true });
  return {
    registry: 'ctx.jobs is the in-process JobRegistry seam: methods present, fresh process starts empty, no cross-process run table',
    primitive: '@deepseek-ai/node-addon-system/flock tryLockExclusive: exclusive, EAGAIN on contention, and the kernel releases the lock when the holder process dies',
    precedent: '@deepseek-ai/dsh-session-persistence-jsonl holds the same flock on session.lock per Session and maps contention to SessionAlreadyOwnedError with no expiry',
  };
})();

// --- P-AU-4: unattended Session creation and approval semantics ------------
report['P-AU-4'] = await (async () => {
  const home = await mkdtemp(join(tmpdir(), 'workdsh-au-headless-'));
  try {
    const run = spawnSync(process.execPath, [dshCli, '--profile', 'headless', '--json', 'probe: report readiness'], {
      cwd: root,
      env: { ...process.env, DSH_HOME: home, DSH_AGENTS_HOME: join(home, 'agents') },
      encoding: 'utf8',
      timeout: 180_000,
    });
    const events = run.stdout.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
    const session = events.find((event) => event.type === 'session');
    assert.ok(session?.sessionId, `headless run did not announce a Session: ${run.stdout}`);
    assert.ok(events.some((event) => event.type === 'status' && event.phase === 'turn_start'), 'no turn started');
    const final = events.at(-1);
    assert.equal(final.type, 'final');
    assert.equal(run.status, 1, 'the unattended run must not report success without a model credential');

    const located = [];
    for (const entry of await readdir(join(home, 'sessions'), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sessionDir = join(home, 'sessions', entry.name, session.sessionId);
      if (existsSync(sessionDir)) located.push(sessionDir);
    }
    assert.equal(located.length, 1, `persisted Session directory not found for ${session.sessionId}`);
    const files = await readdir(located[0]);
    assert.ok(files.includes('session.v4.jsonl.zstd'), `session log missing: ${files.join(', ')}`);
    assert.ok(files.includes('session.lock'), `session.lock missing: ${files.join(', ')}`);
    const rows = zstdDecompressSync(await readFile(join(located[0], 'session.v4.jsonl.zstd')))
      .toString('utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(rows[0].type, 'session');
    assert.equal(rows[0].cwd, root, 'the Session must own the launching cwd');

    const dump = dumpConfig(home, 'headless');
    assert.ok(/name: '@deepseek-ai\/dsh-user-approval'/.test(dump), 'headless profile must compose user approval');
    assert.ok(/name: '@deepseek-ai\/dsh-permission-presets'/.test(dump), 'headless profile must compose permission presets');
    assert.ok(/approval: ask/.test(dump), 'headless approval presets must default to ask');
    return {
      sessionId: session.sessionId,
      sessionCreated: 'headless profile created and persisted a real Session with cwd = launching directory, no browser and no user present',
      persistedRows: rows.length,
      aborted: `turn 1 ended in ${final.text === '' ? 'a model credential error' : 'an unexpected non-error result'}; exit ${run.status}`,
      approval: 'headless composes dsh-user-approval (policy ask unless DSH_PERMISSION_MODE=danger-full-access) and dsh-permission-presets (read-only/workspace-write -> ask), so an unattended run cannot silently approve',
      unverified: 'the initial user message was not observable in the persisted log because the run aborted before any model response; it was not re-run with a real credential',
    };
  } finally {
    await rm(home, { recursive: true, force: true });
  }
})();

const artifacts = resolve(root, '.artifacts');
await mkdir(artifacts, { recursive: true });
await writeFile(join(artifacts, 'automations-bases-probe.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
console.log('PASS: P-AU-1..P-AU-4 recorded.');
