// Domain service of the automations module (ACCEPTANCE.md section 4 item 4:
// Rule / Occurrence / Run persistence, idempotency and conflict handling).
//
// The service runs against the real official storage stack (Storage + JSON backend +
// storage-domain) exactly as the product composes it, and against a stub
// `AutomationExecutionBridge` standing in for the scheduler that will implement it:
// this suite proves the *domain* half, and never claims a Session was created.
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

const actor = { principalId: 'alice', organizationId: 'org', requestId: 'test', resolvedBy: 'test' };
const other = { principalId: 'bob', organizationId: 'org', requestId: 'test', resolvedBy: 'test' };
const OWNER = 'host-1';

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

/** Records what the service asked for and returns scripted outcomes. */
function stubBridge() {
  const calls = { resolveTarget: [], dispatch: [], reconcile: [] };
  return {
    calls,
    /** Outcome the next `dispatch` reports; replaced per case. */
    next: () => ({ status: 'running', sessionId: `session-${calls.dispatch.length}` }),
    async resolveTarget(_actor, target) {
      calls.resolveTarget.push(target);
      return { ok: true, binding: { digest: `digest:${target.expertId ?? 'none'}:${target.permissionPreset}` } };
    },
    async dispatch(claim, binding) {
      calls.dispatch.push({ claim, binding });
      return this.next();
    },
    async reconcile(claim) {
      calls.reconcile.push(claim);
      return { status: 'succeeded', sessionId: claim.run.sessionId ?? 'session-reconciled' };
    },
  };
}

async function boot(root) {
  const ctx = new Context();
  await ctx.plugin(Storage);
  await ctx.plugin(JsonStorage, { root });
  await ctx.plugin(StorageDomain, { backend: 'json' });
  await ctx.plugin(AutomationsManager);
  const bridge = stubBridge();
  ctx.workdshAutomations.setExecution(bridge);
  return { ctx, bridge, service: ctx.workdshAutomations };
}

const pendingOf = async (service, ruleId) =>
  (await service.listOccurrences(actor, ruleId, 20)).find((row) => row.state === 'pending');

test('one due instant becomes one run, later triggers skip while busy, and a merged outage stays single', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-automations-'));
  let ctx;
  try {
    ({ ctx } = await boot(root));
    const service = ctx.workdshAutomations;

    // --- create: an enabled rule materializes exactly one pending instant -----------
    const created = await service.create(actor, input());
    const ruleId = created.rule.ruleId;
    assert.equal(created.rule.state, 'enabled');
    assert.equal(created.rule.organizationId, 'org');
    assert.equal(created.rule.ownerPrincipalId, 'alice');
    assert.equal(created.revision.revision, 1);
    assert.equal(created.revision.schedule.cron, '*/5 * * * *');

    const first = await pendingOf(service, ruleId);
    assert.ok(first, 'an enabled cron rule must have a materialized pending instant');
    assert.equal(first.occurrenceId, `${ruleId}:1:${first.scheduledAt}`);
    assert.equal((await service.listOccurrences(actor, ruleId, 20)).length, 1);

    // A pass that is not yet due re-materializes the same triple instead of adding a second.
    await service.maintain(Date.parse(first.scheduledAt) - 1000, OWNER);
    assert.equal((await service.listOccurrences(actor, ruleId, 20)).length, 1, 'the (ruleId, revision, scheduledAt) triple was duplicated');

    // --- due: one claim, one run ---------------------------------------------------
    const pass = await service.maintain(Date.parse(first.scheduledAt), OWNER);
    assert.equal(pass.claims.length, 1);
    assert.equal(pass.reconcilable.length, 0);
    const claim = pass.claims[0];
    assert.equal(claim.occurrence.occurrenceId, first.occurrenceId);
    assert.equal(claim.actor.principalId, 'alice', 'a scheduled trigger acts as the rule owner, not as a client');
    assert.equal((await service.listOccurrences(actor, ruleId, 20)).find((row) => row.occurrenceId === first.occurrenceId).state, 'claimed');

    const running = await service.settle(claim, { status: 'running', sessionId: 'session-1' });
    assert.equal(running.status, 'running');
    assert.equal(running.sessionId, 'session-1');
    const afterDispatch = await service.listOccurrences(actor, ruleId, 20);
    assert.equal(afterDispatch.find((row) => row.occurrenceId === first.occurrenceId).state, 'dispatched');
    const second = afterDispatch.find((row) => row.state === 'pending');
    assert.ok(second, 'the next future instant must be materialized after a dispatch');
    assert.ok(Date.parse(second.scheduledAt) > Date.parse(first.scheduledAt));

    // --- no overlap: the next due instant is recorded as skipped, not queued --------
    const busyPass = await service.maintain(Date.parse(second.scheduledAt), OWNER);
    assert.equal(busyPass.claims.length, 0, 'an unfinished run must not overlap');
    assert.equal(busyPass.reconcilable.length, 1, 'the unfinished run must be offered for reconciliation');
    const runs = await service.listRuns(actor, { ruleId });
    const skipped = runs.find((row) => row.status === 'skipped');
    assert.ok(skipped, 'the overlapping trigger must leave a skipped run');
    assert.match(skipped.failureReason, /^rule_busy: /);
    assert.ok(skipped.skippedReason, 'the skipped run must carry the readable reason the page shows');
    assert.doesNotMatch(skipped.skippedReason, /^rule_busy: /);
    assert.equal(skipped.requestId, skipped.occurrenceId);

    // --- manual run while busy is refused with the contract code --------------------
    await assert.rejects(service.runNow(actor, ruleId, 'manual-1'), (error) => error.code === 'rule_busy');

    // --- outcome bookkeeping: uncertain stays claimed until reconciled ---------------
    await service.settle(claim, { status: 'succeeded', sessionId: 'session-1' });
    assert.equal((await service.listRuns(actor, { ruleId })).find((row) => row.runId === claim.run.runId).status, 'succeeded');

    const third = await pendingOf(service, ruleId);
    const failPass = await service.maintain(Date.parse(third.scheduledAt), OWNER);
    const failClaim = failPass.claims[0];
    const uncertain = await service.settle(failClaim, { status: 'uncertain', failureReason: 'dispatch_uncertain: 创建结果未知。' });
    assert.equal(uncertain.status, 'uncertain');
    const stillClaimed = (await service.listOccurrences(actor, ruleId, 20)).find((row) => row.occurrenceId === failClaim.occurrence.occurrenceId);
    assert.equal(stillClaimed.state, 'claimed', 'an unknown dispatch must not claim it reached a Session');
    assert.equal(uncertain.sessionId, undefined);

    // Reconciliation settles it against the remote facts; only then does it count as dispatched.
    const reconciled = await service.reconcileRun(actor, failClaim.run.runId);
    assert.equal(reconciled.status, 'succeeded');
    assert.equal(
      (await service.listOccurrences(actor, ruleId, 20)).find((row) => row.occurrenceId === failClaim.occurrence.occurrenceId).state,
      'dispatched',
    );

    // --- manual runs are idempotent on the client request id ------------------------
    const manual = await service.runNow(actor, ruleId, 'manual-2');
    assert.equal(manual.source, 'manual');
    assert.equal(manual.status, 'running');
    const replay = await service.runNow(actor, ruleId, 'manual-2');
    assert.equal(replay.runId, manual.runId, 'a repeated requestId must replay the same run');
    assert.equal(replay.sessionId, manual.sessionId);
    await service.reconcileRun(actor, manual.runId);

    // --- a long outage merges into the one instant that actually runs ---------------
    const stale = await pendingOf(service, ruleId);
    const farFuture = Date.parse(stale.scheduledAt) + 30 * 60 * 1000;
    const outagePass = await service.maintain(farFuture, OWNER);
    assert.equal(outagePass.claims.length, 1);
    const merged = await service.listOccurrences(actor, ruleId, 100);
    const mergedRows = merged.filter((row) => row.state === 'merged');
    assert.ok(mergedRows.length >= 5, `expected the missed instants to be recorded, saw ${mergedRows.length}`);
    for (const row of mergedRows) assert.equal(row.mergedIntoOccurrenceId, outagePass.claims[0].occurrence.occurrenceId);
    const keeperRuns = (await service.listRuns(actor, { ruleId })).filter((row) => row.occurrenceId === outagePass.claims[0].occurrence.occurrenceId);
    assert.equal(keeperRuns.length, 1, 'a merged outage must create exactly one run');
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('revisions are append-only, conflicts are refused, archiving keeps history, and records survive a restart', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-automations-'));
  let ctx;
  try {
    ({ ctx } = await boot(root));
    const service = ctx.workdshAutomations;
    const created = await service.create(actor, input());
    const ruleId = created.rule.ruleId;
    const before = await pendingOf(service, ruleId);

    // --- a stale expectedRevision never overwrites the current revision -------------
    const updated = await service.update(actor, ruleId, input({ name: '每 5 分钟汇总' }), 1);
    assert.equal(updated.rule.revision, 2);
    assert.equal(updated.revision.revision, 2);
    assert.equal(updated.rule.name, '每 5 分钟汇总');
    await assert.rejects(
      service.update(actor, ruleId, input({ name: '并发覆盖' }), 1),
      (error) => error.code === 'stale_revision',
    );
    assert.equal((await service.get(actor, ruleId)).rule.name, '每 5 分钟汇总');

    // The superseded revision's instant is cancelled rather than fired later.
    const occurrences = await service.listOccurrences(actor, ruleId, 20);
    const cancelled = occurrences.find((row) => row.occurrenceId === before.occurrenceId);
    assert.equal(cancelled.state, 'skipped');
    assert.match(cancelled.skipReason, /新修订/);
    const current = occurrences.find((row) => row.state === 'pending');
    assert.equal(current.ruleRevision, 2);

    // --- another principal in the same organization sees nothing -------------------
    assert.deepEqual(await service.list(other, ''), []);
    await assert.rejects(service.get(other, ruleId), (error) => error.code === 'rule_not_found');
    await assert.rejects(service.runNow(other, ruleId, 'intruder'), (error) => error.code === 'rule_not_found');

    // --- one real dispatch, so the restart below has history to restore ------------
    const due = await pendingOf(service, ruleId);
    const pass = await service.maintain(Date.parse(due.scheduledAt), OWNER);
    assert.equal(pass.claims.length, 1);
    await service.settle(pass.claims[0], { status: 'succeeded', sessionId: 'session-restart' });

    // --- archiving is the delete path and must not block on its own mutation tail --
    const archived = await service.archive(actor, ruleId);
    assert.equal(archived.state, 'archived');
    assert.deepEqual(await service.list(actor, ''), []);
    assert.equal((await service.listArchived(actor, '')).length, 1);
    assert.equal((await service.listOccurrences(actor, ruleId, 20)).every((row) => row.state !== 'pending'), true);
    const archivedPass = await service.maintain(Date.now() + 60 * 60 * 1000, OWNER);
    assert.equal(archivedPass.claims.length, 0, 'an archived rule must never be claimed');

    // --- restart: rules, revisions and run history come back from the medium -------
    const beforeRestart = await service.listRuns(actor, { ruleId });
    assert.ok(beforeRestart.length > 0, 'the case above must have produced run history');
    await ctx.fiber.dispose();
    ctx = undefined;
    ({ ctx } = await boot(root));
    const restored = ctx.workdshAutomations;
    const detail = await restored.get(actor, ruleId);
    assert.equal(detail.rule.revision, 2);
    assert.equal(detail.rule.state, 'archived');
    assert.equal(detail.revision.schedule.cron, '*/5 * * * *');
    assert.equal(detail.revision.target.permissionPreset, 'read-only');
    assert.equal((await restored.listArchived(actor, '')).length, 1);
    assert.deepEqual(
      (await restored.listRuns(actor, { ruleId })).map((row) => row.runId).sort(),
      beforeRestart.map((row) => row.runId).sort(),
      'run history must survive a restart unchanged',
    );
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});

test('preview is pure evaluation and invalid schedules are refused before anything is stored', async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-automations-'));
  let ctx;
  try {
    ({ ctx } = await boot(root));
    const service = ctx.workdshAutomations;
    const created = await service.create(actor, input());

    const runs = await service.previewNextRuns(actor, { kind: 'cron', cron: '0 9 * * *', timeZone: 'Asia/Shanghai' }, 3);
    assert.equal(runs.length, 3);
    for (const instant of runs) assert.equal(new Date(instant).toISOString(), instant);
    assert.equal((await service.listOccurrences(actor, created.rule.ruleId, 20)).length, 1, 'preview must not store anything');

    await assert.rejects(
      service.create(actor, input({ schedule: { kind: 'cron', cron: 'not a cron', timeZone: 'UTC' } })),
      (error) => error.code === 'invalid_cron',
    );
    await assert.rejects(
      service.create(actor, input({ schedule: { kind: 'cron', cron: '* * * * *', timeZone: 'UTC' } })),
      (error) => error.code === 'interval_too_short',
    );
    await assert.rejects(
      service.create(actor, input({ schedule: { kind: 'cron', cron: '0 9 * * *', timeZone: 'Mars/Olympus' } })),
      (error) => error.code === 'invalid_time_zone',
    );
    await assert.rejects(
      service.create(actor, input({ target: { ...input().target, workspacePath: 'relative/dir' } })),
      (error) => error.code === 'invalid_input',
    );
    assert.equal((await service.list(actor, '')).length, 1, 'a refused create must not leave a rule behind');
  } finally {
    if (ctx) await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
