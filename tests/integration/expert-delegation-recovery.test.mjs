import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForDelegation } from '../../packages/plugins/experts/dist/runtime/delegation-wait.js';
import { registerExpertTeamTools } from '../../packages/plugins/experts/dist/tools/team-tools.js';
import { TeamRunsManager } from '../../packages/plugins/experts/dist/services/team-runs.js';

const never = () => new Promise(() => {});
const opts = () => ({ signal: new AbortController().signal, cancel() {}, idleMs: 30, maxMs: 200, pollMs: 5 });
test('stalled native request is cancelled and rejects instead of waiting forever', async () => {
  let cancelled = 0;
  await assert.rejects(waitForDelegation(never(), { ...opts(), cancel: () => cancelled++ }), { code: 'experts/delegation-stalled' });
  assert.equal(cancelled, 1);
});
test('real log progress resets inactivity deadline', async () => {
  let seq = 0;
  const timer = setInterval(() => seq++, 10);
  try { assert.equal(await waitForDelegation(new Promise(r => setTimeout(() => r('done'), 80)), { ...opts(), progress: () => seq }), 'done'); }
  finally { clearInterval(timer); }
});
test('progress cannot bypass total deadline', async () => {
  let seq = 0;
  await assert.rejects(waitForDelegation(never(), { ...opts(), maxMs: 35, progress: () => seq++ }), { code: 'experts/delegation-timeout' });
});
test('parent cancellation rejects even when child promise never settles', async () => {
  const controller = new AbortController();
  let cancelled = 0;
  const waiting = waitForDelegation(never(), { ...opts(), signal: controller.signal, cancel: () => cancelled++ });
  controller.abort();
  await assert.rejects(waiting, { code: 'experts/delegation-cancelled' });
  assert.equal(cancelled, 1);
});
test('normal completion and rejection remove cancellation listener', async () => {
  const controller = new AbortController();let cancelled = 0;
  assert.equal(await waitForDelegation(Promise.resolve(7), { ...opts(), signal: controller.signal, cancel: () => cancelled++ }), 7);
  const failure = new Error('network failure');
  await assert.rejects(waitForDelegation(Promise.reject(failure), { ...opts(), signal: controller.signal, cancel: () => cancelled++ }), error => error === failure);
  controller.abort();assert.equal(cancelled, 0);
});

function toolHarness(kind, failure) {
  const tools = new Map();
  const attempt = { number: 1, workSessionId: 'child', ...(kind === 'review' ? { reviewSessionId: 'reviewer' } : {}) };
  const run = { state: { plan: { stages: [{ id: 'stage', dependsOn: [] }] }, attempts: { stage: [attempt], predecessor: [{ decision: { verdict: 'accepted' } }] } } };
  const ctx = {
    tools: { register: tool => tools.set(tool.name, tool) },
    workdshIdentity: { resolve: async () => ({}) },
    workdshTeamRuns: {
      beginWork: async () => ({ binding: { sessionId: 'child' }, run }),
      beginReview: async () => ({ binding: { sessionId: 'reviewer' }, run }),
      get: async () => run,
      abandonAttempt: async (_actor, _host, _run, stage, reason) => { assert.equal(stage, 'stage'); attempt.abandoned = reason; },
    },
    subagents: { start: async () => { throw failure; } },
  };
  registerExpertTeamTools(ctx);
  return { run, attempt, tool: tools.get('workdsh_expert_team_delegate') };
}
for (const kind of ['work', 'review']) test(`${kind} creation exception closes only admitted attempt and keeps accepted predecessors`, async () => {
  const error = new Error('create failed');
  const { tool, attempt, run } = toolHarness(kind, error);
  await assert.rejects(tool.execute({ kind, run_id: 'run', stage_id: 'stage' }, { signal: new AbortController().signal, agent: { id: 'host' }, callId: 'op' }), e => e === error);
  assert.equal(attempt.abandoned, 'experts/delegation-failed');
  assert.equal(run.state.attempts.stage.length, 1);
  assert.equal(run.state.attempts.predecessor[0].decision.verdict, 'accepted');
});

function recoveryHarness(terminal, live = false, extra = {}) {
  const attempt = { number: 1, workSessionId: 'child', ...extra };let abandoned = 0;
  const service = {
    ctx: { agents: { get: () => live ? {} : undefined }, sessionQuery: { readSession: async () => ({ events: terminal ? [{ type: 'turn/end', data: { reason: { kind: terminal } } }] : [] }) } },
    get: async () => ({ state: { attempts: { stage: [attempt] } } }),
    requireHost: (_run, caller) => { assert.equal(caller, 'host'); },
    abandonAttempt: async () => { abandoned++; attempt.abandoned = 'recovered'; },
  };
  return { recover: () => TeamRunsManager.prototype.recoverInterruptedAttempt.call(service, {}, 'host', 'run', 'stage'), attempt, count: () => abandoned };
}
test('cold interrupted stage is explicitly closed without resetting attempts', async () => {
  const h = recoveryHarness('interrupted');assert.equal((await h.recover()).status, 'abandoned');assert.equal(h.attempt.number, 1);assert.equal(h.count(), 1);
});
test('live child cannot be recovered or duplicated', async () => {
  const h = recoveryHarness('interrupted', true);assert.equal((await h.recover()).status, 'running');assert.equal(h.count(), 0);
});
test('completed unrecorded child is retained for reconciliation, never blindly re-executed or accepted', async () => {
  const h = recoveryHarness('completed');assert.equal((await h.recover()).status, 'completed-needs-reconciliation');assert.equal(h.count(), 0);assert.equal(h.attempt.decision, undefined);
});
test('unknown child cannot be automatically abandoned', async () => {
  const h = recoveryHarness();assert.equal((await h.recover()).status, 'unknown');assert.equal(h.count(), 0);
});
test('recorded output proceeds to review rather than repeating work', async () => {
  const h = recoveryHarness('completed', false, { output: { digest: 'original-pin' } });assert.equal((await h.recover()).status, 'output-recorded');assert.equal(h.count(), 0);assert.equal(h.attempt.output.digest, 'original-pin');
});
