// TM-01 test-only Host composition. Reuses the expert plugin's business policy
// and published native execution/storage/tools. Never installed in a Profile.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import * as policy from '../packages/plugins/experts/dist/domain/team-sop.js';
import { registerExpertDelegationProvider } from '../packages/plugins/experts/dist/runtime/delegation-provider.js';

const requireDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const { finalAssistantOutput } = await import(pathToFileURL(requireDsh.resolve('@deepseek-ai/dsh-subagent')).href);
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const content = value => [{ type: 'text', text: value }];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

export async function runSopProbe({ ctx, actor, experts, model, load, signal, pass, report, settle, observedAgents }) {
  const domain = await ctx.storageDomain.open(defineDomain({ name: 'workdsh_sop_probe', version: 1, layout: 'per-record',
    tables: { cases: domainTable(z.object({ json: z.string() })) } }));
  ctx.effect(() => () => domain.close());
  const table = domain.table('cases');
  const cases = new Set();
  const parent = experts[0].agent;
  const memberRefs = { alpha: experts[0].ref, beta: experts[1].ref };
  const observations = [];
  const scripts = new Map();
  const runs = [];
  let serial = 0;
  const state = async id => JSON.parse((await table.get(id)).json);
  const mutate = async (id, fn) => JSON.parse((await table.update(id, current => ({ json: JSON.stringify(fn(JSON.parse(current.json))) }))).json);
  const plan = (maxAttempts = 2, maxTotalAttempts = 4) => ({ maxTotalAttempts, stages: [
    { id: 'draft', worker: 'alpha', reviewer: 'beta', dependsOn: [], maxAttempts },
    { id: 'publish', worker: 'beta', reviewer: 'alpha', dependsOn: ['draft'], maxAttempts: 1 },
  ] });
  async function createCase(id, definition = plan()) {
    cases.add(id); await table.put(id, { json: JSON.stringify(policy.createSop(definition)) });
  }
  const currentAttempt = (snapshot, stageId) => snapshot.attempts[stageId].at(-1);

  // Host chooses member revision; model cannot supply actor, preset or child id.
  async function reserve(id, stageId, kind) {
    const snapshot = await state(id);
    const transition = kind === 'work' ? policy.admitSopWork : policy.admitSopReview;
    transition(snapshot, snapshot.revision, stageId, 'preflight-candidate');
    const stage = snapshot.plan.stages.find(s => s.id === stageId);
    const ref = memberRefs[kind === 'work' ? stage.worker : stage.reviewer];
    const binding = await ctx.workdshExperts.reserveDelegation(actor, parent.id, ref, { operationId: `sop-${++serial}` }, signal);
    // A lost CAS may leave an unused expert reservation. authorizeStart below
    // fails closed for it. No automatic redispatch after an uncertain write.
    await mutate(id, s => transition(s, snapshot.revision, stageId, binding.sessionId));
    return binding;
  }
  let beforeRunCheck;
  const provider = registerExpertDelegationProvider(ctx, { admission: { async authorizeStart({ actor: caller, parent: actualParent, sessionId, phase }) {
    if (phase === 'run') await beforeRunCheck?.(sessionId);
    assert.equal(actualParent, parent, 'sop/wrong-parent');
    await ctx.workdshExperts.verifyBinding(caller, parent.id, signal);
    for (const id of cases) {
      const snapshot = await state(id);
      for (const stage of snapshot.plan.stages) {
        const attempt = currentAttempt(snapshot, stage.id);
        if (!attempt || attempt.abandoned || attempt.decision) continue;
        const member = attempt.workSessionId === sessionId && !attempt.output ? stage.worker
          : attempt.reviewSessionId === sessionId && attempt.output && (phase === 'run' || !attempt.proposal) ? stage.reviewer : undefined;
        if (member) {
          return { expertRevisionRef: memberRefs[member] };
        }
      }
    }
    throw new Error('sop/no-current-admission');
  } } });

  function script(actions = [], waitAfter) {
    const marker = `SOP_SCRIPT_${++serial}_END`;
    scripts.set(marker, { actions, waitAfter });
    return marker;
  }
  model.sopBlock = async (options, messages) => {
    const entry = [...scripts.entries()].reverse().find(([marker]) => messages.includes(marker));
    if (!entry) return;
    const [marker, instruction] = entry;
    for (let index = 0; index < instruction.actions.length; index++) {
      const id = `${marker}_call_${index}`;
      if (!messages.includes(id)) return { type: 'tool-call', id, ...instruction.actions[index], arguments: JSON.stringify(instruction.actions[index].arguments) };
    }
    if (instruction.waitAfter) {
      instruction.waitAfter.resolve();
      await new Promise(resolve => { if (options.signal.aborted) resolve(); else options.signal.addEventListener('abort', resolve, { once: true }); });
    }
    return { type: 'text', text: `DELIVERABLE ${marker}` };
  };
  function completedReceipt(run) {
    const events = run.localAgent.session.snapshotEvents();
    const terminal = events.filter(e => e.type === 'turn/end').at(-1);
    assert.equal(terminal?.data.reason.kind, 'completed', 'sop/native-not-completed');
    const output = finalAssistantOutput(events);
    assert.ok(output?.length, 'sop/no-native-output');
    return { sessionId: run.id, terminalSeq: terminal.seq, digest: hash({ sessionId: run.id, terminalSeq: terminal.seq, output }) };
  }
  async function start(binding, marker, runSignal = signal) {
    const run = await ctx.subagents.start(provider, { parent, label: binding.sessionId, prompt: content(marker), signal: runSignal });
    runs.push(run); return run;
  }
  async function work(id, stageId = 'draft') {
    const run = await start(await reserve(id, stageId, 'work'), script());
    assert.equal((await run.result).stopReason, 'completed');
    const snapshot = await state(id);
    await mutate(id, s => policy.recordSopOutput(s, snapshot.revision, stageId, completedReceipt(run)));
    return run;
  }
  async function finalize(id, run, stageId = 'draft') {
    assert.equal((await run.result).stopReason, 'completed', 'sop/native-not-completed');
    const receipt = completedReceipt(run);
    const snapshot = await state(id);
    return mutate(id, s => policy.finalizeSopReview(s, snapshot.revision, stageId, receipt));
  }
  const proposal = (id, digest, verdict = 'accepted') => ({ name: 'sop_probe_review', arguments: { case_id: id, stage_id: 'draft', output_digest: digest, verdict } });

  ctx.tools.register(defineTool({ name: 'sop_probe_review', description: 'Probe-only review proposal; Host finalization still required.',
    parameters: { case_id: { type: 'string', required: true }, stage_id: { type: 'string', required: true },
      output_digest: { type: 'string', required: true }, verdict: { type: 'string', required: true, enum: ['accepted', 'changes-requested', 'blocked'] } },
    output: { schema: { type: 'string' }, render: (_args, value) => content(value) },
    async execute(args, exec) {
      try {
        assert.ok(exec.agent && ctx.agents.get(exec.agent.id) === exec.agent, 'sop/no-live-caller');
        const caller = await ctx.workdshIdentity.resolve({ sessionId: exec.agent.id }, exec.signal);
        await ctx.workdshExperts.verifyBinding(caller, exec.agent.id, exec.signal);
        const snapshot = await state(args.case_id);
        exec.signal.throwIfAborted();
        await mutate(args.case_id, s => policy.proposeSopReview(s, snapshot.revision, args.stage_id, exec.agent.id, args.output_digest, args.verdict));
        observations.push({ caller: exec.agent.id, status: 'proposed', digest: args.output_digest });
        return 'SOP_TOOL_RESULT proposal recorded; not accepted yet';
      } catch (error) {
        observations.push({ caller: exec.agent?.id, status: 'rejected', error: error.message }); throw error;
      }
    },
  }));
  async function driveParent(actions) {
    parent.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: content(script(actions)) }));
    await settle(parent);
  }
  try {
    await createCase('main');
    const initialCalls = model.requests.length;
    await assert.rejects(reserve('main', 'publish', 'work'), /predecessor-not-accepted/);
    assert.equal(model.requests.length, initialCalls);
    const first = await work('main');
    await assert.rejects(reserve('main', 'publish', 'work'), /predecessor-not-accepted/);
    const output1 = currentAttempt(await state('main'), 'draft').output;
    await driveParent([proposal('main', output1.digest)]);
    assert.match(observations.at(-1).error, /wrong-reviewer/);
    const review1 = await start(await reserve('main', 'draft', 'review'), script([proposal('main', output1.digest, 'changes-requested')]));
    assert.equal((await review1.result).stopReason, 'completed');
    await assert.rejects(reserve('main', 'publish', 'work'), /predecessor-not-accepted/);
    await finalize('main', review1);
    await assert.rejects(reserve('main', 'publish', 'work'), /predecessor-not-accepted/);
    pass('sop-native-completion-and-review-proposal-do-not-release-successor', { work: first.id, reviewer: review1.id, wrongCallerRejected: parent.id });

    await work('main');
    const output2 = currentAttempt(await state('main'), 'draft').output;
    assert.notEqual(output1.digest, output2.digest);
    const beforeStale = await state('main');
    assert.throws(() => policy.proposeSopReview(beforeStale, beforeStale.revision, 'draft', review1.id, output1.digest, 'accepted'), /wrong-reviewer/);
    const review2 = await start(await reserve('main', 'draft', 'review'), script([proposal('main', output1.digest), proposal('main', output2.digest)]));
    const accepted = await finalize('main', review2);
    assert.ok(observations.some(o => o.caller === review2.id && /stale-output/.test(o.error)));
    assert.equal(currentAttempt(accepted, 'draft').decision.verdict, 'accepted');
    await assert.rejects(finalize('main', review2), /review-not-finalizable/);
    await assert.rejects(reserve('main', 'draft', 'work'), /attempt-not-retryable/);
    const downstream = await work('main', 'publish');
    assert.deepEqual(currentAttempt(await state('main'), 'publish').inputs, { draft: output2.digest });
    pass('sop-only-current-designated-reviewer-accepts-pinned-output', { oldDigest: output1.digest, acceptedDigest: output2.digest, reviewer: review2.id, downstream: downstream.id });

    await createCase('bounded');
    for (let attempt = 1; attempt <= 2; attempt++) {
      await work('bounded');
      const output = currentAttempt(await state('bounded'), 'draft').output;
      const review = await start(await reserve('bounded', 'draft', 'review'), script([proposal('bounded', output.digest, 'changes-requested')]));
      await finalize('bounded', review);
    }
    const beforeLimit = model.requests.length;
    await assert.rejects(reserve('bounded', 'draft', 'work'), /attempt-limit/);
    assert.equal(model.requests.length, beforeLimit);
    pass('sop-rework-stops-at-attempt-budget', { attempts: 2, extraModelCalls: 0 });

    await createCase('cancelled', plan(3, 2));
    await work('cancelled');
    const output = currentAttempt(await state('cancelled'), 'draft').output;
    const waiting = deferred();
    const abort = new AbortController();
    const review = await start(await reserve('cancelled', 'draft', 'review'), script([proposal('cancelled', output.digest)], waiting), abort.signal);
    await Promise.race([waiting.promise, new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('SOP wait timeout')), { once: true }))]);
    assert.equal(currentAttempt(await state('cancelled'), 'draft').proposal.verdict, 'accepted');
    assert.equal(currentAttempt(await state('cancelled'), 'draft').decision, undefined);
    await assert.rejects(reserve('cancelled', 'publish', 'work'), /predecessor-not-accepted/);
    abort.abort();
    assert.equal((await review.result).stopReason, 'aborted');
    await assert.rejects(finalize('cancelled', review), /native-not-completed/);
    let snapshot = await state('cancelled');
    await mutate('cancelled', s => policy.abandonSopAttempt(s, snapshot.revision, 'draft', 'native-review-aborted'));
    await assert.rejects(reserve('cancelled', 'draft', 'review'), /review-not-admissible/);
    // An explicitly abandoned second reservation also spends the global budget.
    // Stage cap is three, so the next rejection proves the independent total cap.
    await reserve('cancelled', 'draft', 'work');
    snapshot = await state('cancelled');
    await mutate('cancelled', s => policy.abandonSopAttempt(s, snapshot.revision, 'draft', 'Host cancelled before dispatch'));
    await assert.rejects(reserve('cancelled', 'draft', 'work'), /attempt-limit/);
    pass('sop-cancelled-review-cannot-sign-off-or-reset-global-budget', { reviewer: review.id, nativeStopReason: 'aborted', consumedAttempts: 2 });

    await createCase('race');
    snapshot = await state('race');
    const claims = await Promise.allSettled(['race-a', 'race-b'].map(id => mutate('race', s => policy.admitSopWork(s, snapshot.revision, 'draft', id))));
    assert.equal(claims.filter(c => c.status === 'fulfilled').length, 1);
    assert.match(claims.find(c => c.status === 'rejected').reason.message, /revision-conflict/);
    pass('sop-storage-cas-admits-one-concurrent-attempt', { winners: 1 });

    await createCase('withdrawn');
    const withdrawn = await reserve('withdrawn', 'draft', 'work');
    const beforeWithdrawal = model.requests.length;
    // Hold the creation -> first-step boundary, revoke admission durably, then
    // let the real pre-step gate read it. This deterministically covers the race.
    beforeRunCheck = async sessionId => {
      if (sessionId !== withdrawn.sessionId) return;
      beforeRunCheck = undefined;
      const prior = await state('withdrawn');
      await mutate('withdrawn', s => policy.abandonSopAttempt(s, prior.revision, 'draft', 'Host withdrew admission'));
    };
    const withdrawnRun = await start(withdrawn, script());
    assert.equal((await withdrawnRun.result).stopReason, 'error');
    assert.equal(model.requests.length, beforeWithdrawal);
    await assert.rejects(ctx.subagents.start(provider, { parent, label: withdrawn.sessionId, prompt: content('Retry withdrawn'), signal }), /no-current-admission/);
    pass('sop-withdrawn-admission-is-rechecked-before-first-model-step', { id: withdrawnRun.id, extraModelCalls: 0 });

    // Actual native provider direct call: existing binding guard remains active.
    const beforeBypass = model.requests.length;
    const stock = await ctx.subagents.start('probe-spawn', { parent, prompt: content('Bypass SOP'), signal });
    try { assert.equal((await stock.result).stopReason, 'error'); } finally { await stock.dispose(); }
    const orphan = await ctx.workdshExperts.reserveDelegation(actor, parent.id, experts[1].ref, { operationId: 'sop-orphan' }, signal);
    await assert.rejects(ctx.subagents.start(provider, { parent, label: orphan.sessionId, prompt: content('Bypass SOP'), signal }), /no-current-admission/);
    await assert.rejects(ctx.subagents.start(provider, { parent, label: review2.id, prompt: content('Replay approved reviewer'), signal }), /no-current-admission/);
    assert.equal(model.requests.length, beforeBypass);
    pass('sop-direct-provider-and-unbound-native-child-bypass-rejected', { extraModelCalls: 0, orphanReservation: orphan.sessionId });

    // Runtime guard is exercised by the real model -> tools pipeline, not just
    // hiding the schema. It also covers nested dispatch carrying exec.agent.
    await load('@deepseek-ai/dsh-tool-subagent', { provider: 'probe-spawn', toolName: 'sop_probe_native_subagent', enableRunInBackground: false });
    const denials = [];
    ctx.effect(() => ctx.tools.guard(exec => {
      if (exec.name === 'sop_probe_native_subagent' && (exec.agent === parent || runs.some(r => r.localAgent === exec.agent))) {
        denials.push(exec.agent.id); return 'sop/use-controlled-stage-admission';
      }
    }));
    const beforeIds = new Set(observedAgents.keys());
    await driveParent([{ name: 'sop_probe_native_subagent', arguments: { description: 'Bypass stage order', prompt: 'Start downstream immediately' } }]);
    assert.deepEqual(denials, [parent.id]);
    assert.deepEqual([...observedAgents.keys()].filter(id => !beforeIds.has(id)), []);
    pass('sop-visible-native-tool-is-denied-at-real-execution', { caller: parent.id, spawnedChildren: 0 });

    report.sopNativeChildren = runs.filter(run => run.localAgent.session.snapshotEvents().some(e => e.type === 'subagent/descriptor')).length;
    report.sopPolicyReady = true;
    report.sopStates = Object.fromEntries(await Promise.all([...cases].map(async id => [id, await state(id)])));
    report.sopToolObservations = observations;
    report.limitations.push('SOP Host/tool/storage wiring is test-only. Pure policy is internal to experts; no production team endpoint or Profile installed.',
      'Receipts pin native textual outputs, not mutable filesystem artifact bytes. Production artifact version verification remains required.',
      'Tool bypass evidence covers the loaded native subagent tool and providers, not arbitrary shell/HTTP or the complete production tool inventory.',
      'Storage CAS tested in one Host; no multi-process dispatch transaction, crash recovery, paid-model professional review or cold execution resume verified.');
  } finally {
    delete model.sopBlock;
    await Promise.all(runs.map(run => run.dispose()));
  }
}
