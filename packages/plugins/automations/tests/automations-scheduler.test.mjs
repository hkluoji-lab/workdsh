// Scheduling loop of the automations module (ACCEPTANCE.md section 4 item 5: cron
// evaluation, claiming, missed-instance combination, idempotency, recovery).
//
// The loop runs against the real domain service and the real official storage stack, with
// a scripted `AutomationExecutionBridge` standing in for Session creation: this suite
// proves what the loop asks for, what it records, and how it recovers. It never claims a
// Session was created — that is the execution seam's own evidence (section 4 item 6).
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import * as JsonStorage from '@deepseek-ai/dsh-storage-json';
import * as StorageDomain from '@deepseek-ai/dsh-storage-domain';
import { AutomationsManager } from '../dist/services/automations-manager.js';
import { AutomationScheduler } from '../dist/scheduler/loop.js';
import { acquireSchedulerOwnership, schedulerOwnerId } from '../dist/scheduler/owner.js';

const actor = { principalId: 'alice', organizationId: 'org', requestId: 'test', resolvedBy: 'test' };
const OWNER = 'host-under-test';
/** Every 5 minutes: the shortest interval the 300s floor still accepts. */
const EVERY_5 = { kind: 'cron', cron: '*/5 * * * *', timeZone: 'UTC' };

const input = (overrides = {}) => ({
  name: '每日进展汇总',
  description: '把当天进展汇总成一条记录',
  schedule: EVERY_5,
  target: {
    connectorIds: [],
    task: '汇总今天的进展并输出结论。',
    agentPreset: 'default',
    permissionPreset: 'read-only',
  },
  ...overrides,
});

/** Records every call and returns whatever the case scripts. */
function stubBridge(overrides = {}) {
  const calls = { resolveTarget: [], dispatch: [], reconcile: [] };
  return {
    calls,
    async resolveTarget(_actor, target) {
      calls.resolveTarget.push(target);
      if (overrides.resolve) return overrides.resolve(target, calls.resolveTarget.length);
      return { ok: true, binding: { digest: 'digest:1' } };
    },
    async dispatch(claim, binding) {
      calls.dispatch.push({ claim, binding });
      if (overrides.dispatch) return overrides.dispatch(claim, binding);
      return { status: 'running', sessionId: 'session-1', digest: binding.digest };
    },
    async reconcile(claim) {
      calls.reconcile.push({ claim });
      if (overrides.reconcile) return overrides.reconcile(claim);
      return { status: 'succeeded', sessionId: claim.run.sessionId ?? 'session-reconciled' };
    },
  };
}

/** The real domain service, wrapped so the pass's maintenance call is observable. */
function hostOf(service) {
  const counts = { maintain: 0, settle: 0 };
  return {
    counts,
    async maintain(nowMs, ownerId) {
      counts.maintain += 1;
      return service.maintain(nowMs, ownerId);
    },
    async settle(claim, outcome) {
      counts.settle += 1;
      return service.settle(claim, outcome);
    },
  };
}

async function boot(root, bridge) {
  const ctx = new Context();
  await ctx.plugin(Storage);
  await ctx.plugin(JsonStorage, { root });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  await ctx.plugin(AutomationsManager);
  ctx.workdshAutomations.setExecution(bridge);
  return ctx;
}

const pendingOf = async (service, ruleId) =>
  (await service.listOccurrences(actor, ruleId, 20)).find((row) => row.state === 'pending');

const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) return;
    await new Promise((resume) => setTimeout(resume, 5));
  }
  throw new Error('the expected call never happened');
};

test('one due instant becomes one dispatch, and a pass never overlaps itself', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-automations-loop-'));
  let ctx;
  try {
    let release;
    const gate = new Promise((done) => { release = done; });
    const bridge = stubBridge({ dispatch: async (claim, binding) => { await gate; return { status: 'running', sessionId: 'session-1', digest: binding.digest }; } });
    ctx = await boot(root, bridge);
    const service = ctx.workdshAutomations;
    const created = await service.create(actor, input());
    const ruleId = created.rule.ruleId;
    const due = await pendingOf(service, ruleId);
    assert.ok(due, 'an enabled cron rule must have a materialized pending instant');
    // `create` resolves the combination too (to validate it and to look for a diagnosis).
    const resolvedAtCreate = bridge.calls.resolveTarget.length;

    const host = hostOf(service);
    const failures = [];
    const scheduler = new AutomationScheduler({
      host,
      bridge,
      ownerId: OWNER,
      now: () => Date.parse(due.scheduledAt),
      report: (error, phase) => failures.push({ error, phase }),
    });

    // A pass is in flight (its dispatch is gated); the overlapping call must not run one.
    const running = scheduler.pass();
    await waitFor(() => bridge.calls.dispatch.length === 1);
    await scheduler.pass();
    assert.equal(host.counts.maintain, 1, 'an overlapping pass must not run a second maintenance');
    release();
    await running;

    // The trigger resolved the pinned combination and wrote it onto the run.
    assert.deepEqual(failures, []);
    assert.equal(bridge.calls.resolveTarget.length, resolvedAtCreate + 1, 'the trigger must resolve the combination again');
    assert.equal(bridge.calls.resolveTarget.at(-1).permissionPreset, 'read-only', 'the trigger must re-resolve the pinned preset');
    assert.equal(bridge.calls.dispatch[0].binding.digest, 'digest:1');
    const runs = await service.listRuns(actor, { ruleId });
    assert.equal(runs.length, 1);
    assert.equal(runs[0].source, 'schedule');
    assert.equal(runs[0].status, 'running');
    assert.equal(runs[0].sessionId, 'session-1');
    assert.equal(runs[0].resolvedBindingDigest, 'digest:1');
    const occurrence = (await service.listOccurrences(actor, ruleId, 20)).find((row) => row.occurrenceId === due.occurrenceId);
    assert.equal(occurrence.state, 'dispatched');
    assert.equal(occurrence.claimedBy, OWNER, 'the claim must record which Host owns the instant');
    assert.ok(occurrence.claimedAt);

    // The same instant is claimed once: the next pass reconciles the live run instead.
    await scheduler.pass();
    assert.equal(bridge.calls.dispatch.length, 1, 'the same triple must never dispatch twice');
    assert.equal(bridge.calls.reconcile.length, 1, 'an unfinished run must be offered for reconciliation');
    assert.equal((await service.listRuns(actor, { ruleId }))[0].status, 'succeeded');
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('a combination that no longer resolves stops the rule with a diagnosis instead of falling back', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-automations-loop-'));
  let ctx;
  try {
    // The rule could be created (its combination resolved then), and stops once the
    // pinned revision is gone at trigger time.
    const bridge = stubBridge({
      resolve: (_target, callIndex) => (callIndex === 1
        ? { ok: true, binding: { digest: 'digest:1' } }
        : { ok: false, code: 'revision_missing', reason: '专家修订已不存在，无法执行。' }),
    });
    ctx = await boot(root, bridge);
    const service = ctx.workdshAutomations;
    const created = await service.create(actor, input());
    const ruleId = created.rule.ruleId;
    const due = await pendingOf(service, ruleId);

    const host = hostOf(service);
    const scheduler = new AutomationScheduler({ host, bridge, ownerId: OWNER, now: () => Date.parse(due.scheduledAt) });
    await scheduler.pass();

    const run = (await service.listRuns(actor, { ruleId }))[0];
    assert.equal(run.status, 'failed');
    assert.match(run.failureReason, /^revision_missing: /);
    assert.equal(run.sessionId, undefined, 'a trigger that never created a Session must not record one');
    const occurrence = (await service.listOccurrences(actor, ruleId, 20)).find((row) => row.occurrenceId === due.occurrenceId);
    assert.equal(occurrence.state, 'skipped');
    assert.equal(occurrence.skipReason, run.failureReason);

    // The stop is visible on the rule and no later instant fires from the discarded one.
    const detail = await service.get(actor, ruleId);
    assert.equal(detail.rule.state, 'paused');
    assert.equal(detail.diagnosis, '专家修订已不存在，无法执行。');
    assert.equal((await service.listOccurrences(actor, ruleId, 20)).every((row) => row.state !== 'pending'), true);
    assert.equal(bridge.calls.dispatch.length, 0, 'a trigger that cannot resolve must never reach Session creation');
    const resolvesAtStop = bridge.calls.resolveTarget.length;
    await scheduler.pass();
    assert.equal(bridge.calls.resolveTarget.length, resolvesAtStop, 'a stopped rule must not be claimed again');
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('an unknown dispatch is recorded as uncertain and only a later reconciliation settles it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-automations-loop-'));
  let ctx;
  try {
    const bridge = stubBridge({ dispatch: async () => { throw new Error('connection reset'); } });
    ctx = await boot(root, bridge);
    const service = ctx.workdshAutomations;
    const created = await service.create(actor, input());
    const ruleId = created.rule.ruleId;
    const due = await pendingOf(service, ruleId);
    const host = hostOf(service);
    const now = () => Date.parse(due.scheduledAt);

    await new AutomationScheduler({ host, bridge, ownerId: OWNER, now }).pass();

    const unknown = (await service.listRuns(actor, { ruleId }))[0];
    assert.equal(unknown.status, 'uncertain');
    assert.match(unknown.failureReason, /^persistence_uncertain: /);
    assert.equal(unknown.sessionId, undefined, 'an unknown result must not claim a Session exists');
    const claimed = (await service.listOccurrences(actor, ruleId, 20)).find((row) => row.occurrenceId === due.occurrenceId);
    assert.equal(claimed.state, 'claimed', 'an unknown dispatch keeps the instant claimed for reconciliation');

    // Reconciliation against the official facts is what proves the Session exists.
    const recovered = stubBridge({ reconcile: () => ({ status: 'succeeded', sessionId: 'session-late' }) });
    await new AutomationScheduler({ host, bridge: recovered, ownerId: OWNER, now }).pass();
    const settled = (await service.listRuns(actor, { ruleId })).find((row) => row.runId === unknown.runId);
    assert.equal(settled.status, 'succeeded');
    assert.equal(settled.sessionId, 'session-late');
    assert.equal((await service.listOccurrences(actor, ruleId, 20)).find((row) => row.occurrenceId === due.occurrenceId).state, 'dispatched');

    // A reconciliation that itself fails changes nothing, and the next pass retries it.
    const second = await pendingOf(service, ruleId);
    const phases = [];
    const failing = stubBridge({
      dispatch: async () => { throw new Error('timed out'); },
      reconcile: async () => { throw new Error('session store unavailable'); },
    });
    const later = new AutomationScheduler({ host, bridge: failing, ownerId: OWNER, now: () => Date.parse(second.scheduledAt), report: (_error, phase) => phases.push(phase) });
    await later.pass();
    const stuck = (await service.listRuns(actor, { ruleId })).find((row) => row.occurrenceId === second.occurrenceId);
    assert.equal(stuck.status, 'uncertain');
    await later.pass();
    assert.deepEqual(phases, ['reconcile']);
    assert.equal((await service.listRuns(actor, { ruleId })).find((row) => row.runId === stuck.runId).status, 'uncertain');

    // A stopped loop takes no further passes at all.
    const before = host.counts.maintain;
    later.stop();
    await later.pass();
    assert.equal(host.counts.maintain, before, 'a stopped scheduler must not maintain');
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('the scheduler lock admits one owner per home and frees the next owner on release', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-automations-lock-'));
  try {
    const lockPath = join(root, 'scheduler.lock');
    const ownerId = schedulerOwnerId();
    assert.match(ownerId, /^.+-\d+$/, 'the owner identity must identify host and process');

    const held = await acquireSchedulerOwnership(lockPath, ownerId);
    assert.ok(held, 'the first owner must take the lock');
    assert.equal(held.ownerId, ownerId);
    assert.equal(await acquireSchedulerOwnership(lockPath, 'other-host-1'), undefined, 'a second live owner must be refused');

    await held.release();
    const successor = await acquireSchedulerOwnership(lockPath, 'other-host-1');
    assert.ok(successor, 'a released lock must be reusable');
    assert.equal(successor.ownerId, 'other-host-1');
    await successor.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
