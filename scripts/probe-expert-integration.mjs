// TM-01 fourth batch: the actual target-Profile host composition, immutable
// file-version receipts and interruption reconciliation. Test-only Host built
// on the expert business policy, the existing delegation binding service and
// the published native seams (fs/bash/present/subagent tools + sandbox stack).
// Loads the same locked modules the real dsh-base bundle and compiled expert
// presets mount; never installed in a Profile and no user home is touched.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import * as policy from '../packages/plugins/experts/dist/domain/team-sop.js';
import { registerExpertDelegationProvider } from '../packages/plugins/experts/dist/runtime/delegation-provider.js';

const requireExperts = createRequire(new URL('../packages/plugins/experts/package.json', import.meta.url));
const requireDsh = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'));
const { finalAssistantOutput } = await import(pathToFileURL(requireDsh.resolve('@deepseek-ai/dsh-subagent')).href);
const { YAMLMap, YAMLSeq, parseDocument } = await import(pathToFileURL(requireExperts.resolve('yaml')).href);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const content = value => [{ type: 'text', text: value }];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const MODULE = '@deepseek-ai/';

export async function runIntegrationProbe({ ctx, actor, experts, model, load, signal, pass, gap, report, settle, observedAgents, home, root }) {
  const domain = await ctx.storageDomain.open(defineDomain({ name: 'workdsh_integration_probe', version: 1, layout: 'per-record',
    tables: { cases: domainTable(z.object({ json: z.string() })) } }));
  ctx.effect(() => () => domain.close());
  const table = domain.table('cases');
  const cases = new Set();
  const parent = experts[0].agent;
  const memberRefs = { alpha: experts[0].ref, beta: experts[1].ref };
  const workspace = join(home, 'workdir');
  await mkdir(workspace, { recursive: true });
  const deliverable = join(workspace, 'deliverable.md');
  const outside = join(root, '.test-runtime', `integration-outside-${basename(home)}.md`);
  const scripts = new Map();
  const runs = [];
  const observations = [];
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
  const attemptOf = (snapshot, stageId) => snapshot.attempts[stageId].at(-1);

  // Host chooses member revision; the model never supplies actor or child id.
  async function reserve(id, stageId, kind) {
    const snapshot = await state(id);
    const transition = kind === 'work' ? policy.admitSopWork : policy.admitSopReview;
    transition(snapshot, snapshot.revision, stageId, 'preflight-candidate');
    const stage = snapshot.plan.stages.find(s => s.id === stageId);
    const ref = memberRefs[kind === 'work' ? stage.worker : stage.reviewer];
    const binding = await ctx.workdshExperts.reserveDelegation(actor, parent.id, ref, { operationId: `int-${++serial}` }, signal);
    // A lost CAS would leave an unused reservation; authorizeStart fails closed
    // for it and no automatic redispatch happens.
    await mutate(id, s => transition(s, snapshot.revision, stageId, binding.sessionId));
    return binding;
  }
  const provider = registerExpertDelegationProvider(ctx, { name: 'workdsh-expert-integration',
    admission: { async authorizeStart({ actor: caller, parent: actualParent, sessionId, phase }) {
      assert.equal(actualParent, parent, 'integration/wrong-parent');
      await ctx.workdshExperts.verifyBinding(caller, parent.id, signal);
      for (const id of cases) {
        const snapshot = await state(id);
        for (const stage of snapshot.plan.stages) {
          const attempt = attemptOf(snapshot, stage.id);
          if (!attempt || attempt.abandoned || attempt.decision) continue;
          const member = attempt.workSessionId === sessionId && !attempt.output ? stage.worker
            : attempt.reviewSessionId === sessionId && attempt.output && (phase === 'run' || !attempt.proposal) ? stage.reviewer : undefined;
          if (member) return { expertRevisionRef: memberRefs[member] };
        }
      }
      throw new Error('integration/no-current-admission');
    } } });

  // Deterministic model hooks: one scripted action per request until exhausted,
  // then an optional wait-for-abort and the final text.
  function script(actions = [], waitAfter) {
    const marker = `INTEGRATION_SCRIPT_${++serial}_END`;
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
  async function start(binding, marker, runSignal = signal) {
    const run = await ctx.subagents.start(provider, { parent, label: binding.sessionId, prompt: content(marker), signal: runSignal });
    runs.push(run); return run;
  }
  function terminalReceipt(run) {
    const events = run.localAgent.session.snapshotEvents();
    const terminal = events.filter(e => e.type === 'turn/end').at(-1);
    assert.equal(terminal?.data.reason.kind, 'completed', 'integration/native-not-completed');
    const output = finalAssistantOutput(events);
    assert.ok(output?.length, 'integration/no-native-output');
    return { sessionId: run.id, terminalSeq: terminal.seq, digest: hash({ sessionId: run.id, terminalSeq: terminal.seq, output }) };
  }
  const pin = async path => { const bytes = await readFile(path); return { path, sha256: sha256(bytes), byteLength: bytes.byteLength }; };
  // Host re-reads every pinned path (work output and reviewer note) before trust.
  async function verifyStage(id, stageId) {
    const snapshot = await state(id);
    const attempt = attemptOf(snapshot, stageId);
    const pins = [...(attempt.output?.artifacts ?? []), ...(attempt.decision?.receipt.artifacts ?? [])];
    policy.verifySopArtifacts(snapshot, snapshot.revision, stageId, await Promise.all(pins.map(p => pin(p.path))));
    return pins;
  }
  // Versioned delivery: a write pins the file it touched; a present pins every
  // delivered path, so the handoff receipt carries the same bytes as the work.
  const writtenPaths = actions => [...new Set(actions.flatMap(action => action.name === 'write' ? [action.arguments.file_path]
    : action.name === 'present' ? (action.arguments.files ?? []).map(file => file.path) : []))];
  async function work(id, stageId, actions) {
    const run = await start(await reserve(id, stageId, 'work'), script(actions));
    assert.equal((await run.result).stopReason, 'completed', 'integration/work-not-completed');
    const snapshot = await state(id);
    const artifacts = await Promise.all(writtenPaths(actions).map(pin));
    await mutate(id, s => policy.recordSopOutput(s, snapshot.revision, stageId, { ...terminalReceipt(run), ...(artifacts.length ? { artifacts } : {}) }));
    return run;
  }
  async function review(id, stageId, actions) {
    const run = await start(await reserve(id, stageId, 'review'), script(actions));
    assert.equal((await run.result).stopReason, 'completed', 'integration/review-not-completed');
    const snapshot = await state(id);
    const artifacts = await Promise.all(writtenPaths(actions).map(pin));
    return mutate(id, s => policy.finalizeSopReview(s, snapshot.revision, stageId, { ...terminalReceipt(run), ...(artifacts.length ? { artifacts } : {}) }));
  }
  const proposal = (id, stageId, digest, verdict = 'accepted') => ({ name: 'integration_probe_review',
    arguments: { case_id: id, stage_id: stageId, output_digest: digest, verdict } });
  ctx.tools.register(defineTool({ name: 'integration_probe_review', description: 'Probe-only review proposal; Host finalization still required.',
    parameters: { case_id: { type: 'string', required: true }, stage_id: { type: 'string', required: true },
      output_digest: { type: 'string', required: true }, verdict: { type: 'string', required: true, enum: ['accepted', 'changes-requested', 'blocked'] } },
    output: { schema: { type: 'string' }, render: (_args, value) => content(value) },
    async execute(args, exec) {
      try {
        assert.ok(exec.agent && ctx.agents.get(exec.agent.id) === exec.agent, 'integration/no-live-caller');
        const caller = await ctx.workdshIdentity.resolve({ sessionId: exec.agent.id }, exec.signal);
        await ctx.workdshExperts.verifyBinding(caller, exec.agent.id, exec.signal);
        const snapshot = await state(args.case_id);
        exec.signal.throwIfAborted();
        await mutate(args.case_id, s => policy.proposeSopReview(s, snapshot.revision, args.stage_id, exec.agent.id, args.output_digest, args.verdict));
        observations.push({ caller: exec.agent.id, status: 'proposed', digest: args.output_digest });
        return 'INTEGRATION_TOOL_RESULT proposal recorded; not accepted yet';
      } catch (error) { observations.push({ caller: exec.agent?.id, status: 'rejected', error: error.message }); throw error; }
    } }));
  async function driveParent(actions) {
    parent.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: content(script(actions)) }));
    await settle(parent);
  }
  function resultOf(agent, name) {
    const events = agent.session.snapshotEvents();
    const call = events.filter(e => e.type === 'tool/call' && e.data.name === name).at(-1);
    if (!call) return;
    const result = events.find(e => e.type === 'tool/result' && e.data.message?.source?.callId === call.data.callId);
    const block = result?.data.message.content?.find(b => b.type === 'tool-result');
    const text = block?.content?.filter(b => b.type === 'text').map(b => b.text).join(' ').slice(0, 240) ?? '';
    return { callId: call.data.callId, isError: block?.isError === true, text };
  }

  try {
    // ── A. actual target-Profile composition: tool inventory, write paths, delegation ──
    await load(`${MODULE}dsh-subprocess-local`);
    await load(`${MODULE}dsh-sandbox-local`);
    await load(`${MODULE}dsh-sandbox-policy`, { mode: 'workspace-write', workspaceRoot: home });
    await load(`${MODULE}dsh-bash-sandbox`, { timeoutMs: 60000 });
    await load(`${MODULE}dsh-shell-env`);
    await load(`${MODULE}dsh-user-approval`, { policy: 'ask' });
    await load(`${MODULE}dsh-fs-sandbox`);
    await load(`${MODULE}dsh-fs-observation-policy`);
    await load(`${MODULE}dsh-tool-bash`);
    await load(`${MODULE}dsh-tool-fs`);
    await load(`${MODULE}dsh-tool-fs-search`, { sampleOverCapGlobResults: false });
    await load(`${MODULE}dsh-tool-present`);
    await load(`${MODULE}dsh-subagent-spawn-in-process`, { providerName: 'spawn' });
    await load(`${MODULE}dsh-subagent-fork-in-process`, { providerName: 'fork' });
    await load(`${MODULE}dsh-tool-subagent-control`);
    await load(`${MODULE}dsh-tool-subagent-control/list-agents`);
    await load(`${MODULE}dsh-tool-subagent`, { provider: 'spawn', toolName: 'subagent', backgroundMode: 'continuable' });
    await load(`${MODULE}dsh-tool-subagent`, { provider: 'fork', toolName: 'subagent_fork', backgroundMode: 'continuable' });
    await load(`${MODULE}dsh-workflow-worker-thread`, { provider: 'spawn' });
    await load(`${MODULE}dsh-tool-workflow`);
    await load(`${MODULE}dsh-tool-ralph`, { subagentProvider: 'spawn', maxRounds: 64 });
    assert.ok(ctx.subagents.getProvider('spawn') && ctx.subagents.getProvider('fork'), 'spawn/fork providers must register');
    assert.equal(ctx.sandboxPolicy.defaultMode, 'workspace-write');
    assert.equal(ctx.sandboxPolicy.resolve({ session: parent.session }).mode, 'workspace-write');
    assert.ok(ctx.shell && ctx.fs, 'sandboxed shell/fs providers must be registered');
    const names = ctx.tools.schemas().map(s => s.name);
    const core = ['bash', 'write', 'read', 'edit', 'present', 'send_message', 'interrupt_agent', 'list_agents', 'subagent', 'subagent_fork'];
    assert.deepEqual(core.filter(n => !names.includes(n)), [], JSON.stringify(names));
    const extended = ['workflow', 'ralph'].filter(n => !names.includes(n));
    if (extended.length) report.limitations.push(`Host-plane workflow/ralph rows not activated in this probe composition: ${extended.join(', ')}.`);
    const staticRows = { preset: 0, base: false, presetName: undefined };
    try {
      const presetsDir = join(root, '.test-runtime/preview/.agent-presets');
      const entry = (await readdir(presetsDir)).find(name => name.startsWith('wd-exp-expert-'));
      if (entry) {
        const doc = parseDocument(await readFile(join(presetsDir, entry, 'agent.cordis.yml'), 'utf8'));
        const rows = [];
        const walk = items => { for (const item of items) {
          if (!(item instanceof YAMLMap)) continue;
          const name = item.get('name'); if (typeof name === 'string') rows.push(name);
          const config = item.get('config'); if (config instanceof YAMLSeq) walk(config.items);
        } };
        walk(doc.contents.items);
        for (const row of ['dsh-tool-bash', 'dsh-tool-fs', 'dsh-tool-present', 'dsh-tool-subagent', 'dsh-tool-subagent-control', 'dsh-workflow-worker-thread', 'dsh-tool-workflow', 'dsh-tool-ralph']) {
          assert.ok(rows.some(name => name.includes(row)), `actual expert preset missing ${row}`);
        }
        staticRows.preset = rows.length; staticRows.presetName = entry;
      }
      const basePatch = await readFile(join(root, '.test-runtime/preview/profiles/node_modules/@deepseek-ai/dsh-base/cordis.patch.yml'), 'utf8');
      for (const row of ['dsh-sandbox-policy', 'dsh-bash-sandbox', 'dsh-user-approval', 'dsh-subagent-spawn-in-process', 'dsh-subagent-fork-in-process']) {
        assert.ok(basePatch.includes(row), `actual base bundle missing ${row}`);
      }
      staticRows.base = true;
    } catch (error) {
      report.limitations.push(`Static inventory of the installed preview profile unavailable: ${error.message}`);
    }
    pass('integration-actual-profile-tools-inventory', { tools: names.length, core: core.length, extended, staticRows });

    const allowPath = join(workspace, 'allow.md');
    const bashPath = join(workspace, 'bash.md');
    await driveParent([
      { name: 'write', arguments: { file_path: allowPath, content: '# allowed\n' } },
      { name: 'write', arguments: { file_path: outside, content: '# outside\n' } },
      { name: 'bash', arguments: { command: `printf INTEGRATION_BASH > '${bashPath}'`, description: 'write inside workspace' } },
      { name: 'bash', arguments: { command: `printf X > '${outside}'`, description: 'write outside workspace' } },
    ]);
    assert.equal(await readFile(allowPath, 'utf8'), '# allowed\n');
    assert.equal(await readFile(bashPath, 'utf8'), 'INTEGRATION_BASH');
    await assert.rejects(readFile(outside), error => error.code === 'ENOENT');
    const fsOutside = resultOf(parent, 'write');
    const bashOutside = resultOf(parent, 'bash');
    assert.equal(fsOutside.isError, true, 'write outside the session workspace must be denied');
    assert.match(fsOutside.text, /file access denied/, fsOutside.text);
    // Bash reports a sandbox denial as a non-zero exit plus stderr, not an isError result.
    assert.match(bashOutside.text, /Operation not permitted|file access denied/, bashOutside.text);
    pass('integration-write-paths-confined-to-session-workspace', { fsOutside: fsOutside.text, bashOutside: bashOutside.text });

    const beforeGuard = new Set(observedAgents.keys());
    const callsBeforeGuard = model.requests.length;
    await driveParent([{ name: 'subagent', arguments: { description: 'guard-check', prompt: 'INTEGRATION_GUARD_CHILD fixture turn.' } }]);
    const child = [...observedAgents.values()].find(agent => !beforeGuard.has(agent.id) && agent.session.header.parentSession === parent.id);
    assert.ok(child, 'stock subagent tool must create a real child');
    await settle(child);
    const childEvents = child.session.snapshotEvents();
    assert.equal(child.session.header.agentPreset, experts[0].preset);
    assert.equal(childEvents.filter(e => e.type === 'turn/end').at(-1)?.data.reason.kind, 'error');
    assert.deepEqual(childEvents.filter(e => e.type === 'tool/call'), [], 'guard must reject before any child model step');
    const guardRequests = model.requests.slice(callsBeforeGuard);
    // The guard rejects the child before any model step; the child session
    // proves it directly. The parent's remaining requests are its own: the
    // tool-call step, the closing text step, and one wake-up on the official
    // `subagent-settled` notice after the failed background child settles.
    assert.equal(childEvents.filter(e => e.type === 'request/header').length, 0, 'the blocked child must spend no model request');
    assert.equal(childEvents.filter(e => e.type === 'assistant/message').length, 0, 'the blocked child must produce no model output');
    if (guardRequests.length !== 3) console.log('GUARD-DEBUG', JSON.stringify(guardRequests.map(r => r.slice(-260)), null, 2));
    assert.equal(guardRequests.length, 3, 'the blocked child must spend no model request');
    assert.match(guardRequests[2], /subagent-settled/, 'the third request must be the official settled-notice wake-up');
    gap('integration-stock-delegation-tool-blocked-for-expert-parent', { child: child.id, inheritedPreset: experts[0].preset, childModelRequests: 0, parentSteps: guardRequests.length, settledNoticeWakeUp: true, parentToolResult: resultOf(parent, 'subagent')?.text });

    // ── B. immutable file versions across generation, review, handoff, delivery ──
    await createCase('artifact', plan(2, 4));
    const v1 = '# deliverable v1\n';
    await work('artifact', 'draft', [{ name: 'write', arguments: { file_path: deliverable, content: v1 } }]);
    const output1 = attemptOf(await state('artifact'), 'draft').output;
    const pinV1 = output1.artifacts[0];
    assert.equal(pinV1.sha256, sha256(await readFile(deliverable)));
    assert.equal(pinV1.byteLength, (await readFile(deliverable)).byteLength);
    assert.equal((await verifyStage('artifact', 'draft')).length, 1);
    const reviewNoteV1 = join(workspace, 'review-1.md');
    await review('artifact', 'draft', [
      { name: 'read', arguments: { file_path: deliverable } },
      { name: 'write', arguments: { file_path: reviewNoteV1, content: '# review 1: v1 needs stronger evidence\n' } },
      proposal('artifact', 'draft', output1.digest, 'changes-requested'),
    ]);
    assert.equal((await verifyStage('artifact', 'draft')).length, 2, 'output pin plus reviewer note pin');
    const v2 = '# deliverable v2\n';
    // fs-observation-policy: a session must read an existing file before
    // modifying it, so the rework session reads its own copy first.
    await work('artifact', 'draft', [
      { name: 'read', arguments: { file_path: deliverable } },
      { name: 'write', arguments: { file_path: deliverable, content: v2 } },
    ]);
    const output2 = attemptOf(await state('artifact'), 'draft').output;
    const pinV2 = output2.artifacts[0];
    assert.notEqual(pinV2.sha256, pinV1.sha256);
    const reworkState = await state('artifact');
    assert.throws(() => policy.verifySopArtifacts(reworkState, reworkState.revision, 'draft', [{ path: deliverable, sha256: pinV1.sha256, byteLength: pinV1.byteLength }]), /stale-artifact/);
    const reviewNoteV2 = join(workspace, 'review-2.md');
    await review('artifact', 'draft', [
      { name: 'read', arguments: { file_path: deliverable } },
      { name: 'write', arguments: { file_path: reviewNoteV2, content: '# review 2: v2 accepted against the pinned bytes\n' } },
      proposal('artifact', 'draft', output2.digest, 'accepted'),
    ]);
    assert.equal(attemptOf(await state('artifact'), 'draft').decision.verdict, 'accepted');
    const publishWork = await work('artifact', 'publish', [{ name: 'present', arguments: { files: [{ path: deliverable, description: 'final deliverable' }] } }]);
    const presented = publishWork.localAgent.session.snapshotEvents().filter(e => e.type === 'deliverables/presented');
    assert.equal(presented.length, 1, 'present must record the delivered version');
    assert.equal(presented[0].data.files[0].path, deliverable);
    const publishOutput = attemptOf(await state('artifact'), 'publish').output;
    assert.equal(publishOutput.artifacts[0].sha256, pinV2.sha256, 'handoff must pin the same accepted version');
    assert.equal(attemptOf(await state('artifact'), 'publish').inputs.draft, output2.digest);
    await review('artifact', 'publish', [
      { name: 'read', arguments: { file_path: deliverable } },
      proposal('artifact', 'publish', publishOutput.digest),
    ]);
    const finalPins = [...await verifyStage('artifact', 'draft'), ...await verifyStage('artifact', 'publish')];
    assert.ok(finalPins.every(p => p.path !== deliverable || p.sha256 === pinV2.sha256), 'every deliverable pin carries the v2 bytes');
    await appendFile(deliverable, 'drift');
    await assert.rejects(verifyStage('artifact', 'draft'), /stale-artifact|artifact-mismatch/);
    await writeFile(deliverable, v2);
    await verifyStage('artifact', 'draft');
    pass('integration-file-version-pinned-through-review-handoff-delivery', { v1: pinV1.sha256, v2: pinV2.sha256, presented: presented[0].data.files[0].path, driftDetected: true, driftRecovered: true });

    // ── C. interruption: cancellation and uncertain dispatch reconciliation ──
    await createCase('interrupt', plan(3, 5));
    const cancelFile = join(workspace, 'cancel.md');
    const waiting = deferred();
    const abort = new AbortController();
    const cancelledBinding = await reserve('interrupt', 'draft', 'work');
    const cancelMarker = script([{ name: 'write', arguments: { file_path: cancelFile, content: '# cancelled attempt\n' } }], waiting);
    const cancelled = await start(cancelledBinding, cancelMarker, abort.signal);
    await Promise.race([waiting.promise, new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('integration cancel wait timeout')), { once: true }))]);
    assert.equal(await readFile(cancelFile, 'utf8'), '# cancelled attempt\n', 'the file side effect exists before the turn finishes');
    const cancelCalls = model.requests.filter(r => r.includes(cancelMarker)).length;
    abort.abort();
    assert.equal((await cancelled.result).stopReason, 'aborted');
    await cancelled.dispose();
    assert.equal(ctx.agents.get(cancelled.id), undefined);
    assert.throws(() => terminalReceipt(cancelled), /native-not-completed/);
    let snapshot = await state('interrupt');
    assert.equal(attemptOf(snapshot, 'draft').output, undefined, 'an aborted turn records no output');
    // A claimed label can never be re-run; the operation key replays the same
    // reservation instead of dispatching a second child.
    await assert.rejects(ctx.subagents.start(provider, { parent, label: cancelledBinding.sessionId, prompt: content('Replay cancelled'), signal }), error => error.code === 'experts/conflict');
    const replayed = await ctx.workdshExperts.reserveDelegation(actor, parent.id, memberRefs.alpha, { operationId: cancelledBinding.creationOperationId }, signal);
    assert.equal(replayed.sessionId, cancelledBinding.sessionId);
    await assert.rejects(ctx.workdshExperts.reserveDelegation(actor, parent.id, memberRefs.beta, { operationId: cancelledBinding.creationOperationId }, signal), error => error.code === 'experts/idempotency-conflict');
    snapshot = await state('interrupt');
    await mutate('interrupt', s => policy.abandonSopAttempt(s, snapshot.revision, 'draft', 'native turn aborted after file write; side effect reconciled by the Host'));
    snapshot = await state('interrupt');
    assert.ok(attemptOf(snapshot, 'draft').abandoned, 'the aborted attempt must be explicitly abandoned');
    assert.throws(() => policy.recordSopOutput(snapshot, snapshot.revision, 'draft', { sessionId: cancelledBinding.sessionId, terminalSeq: 1, digest: 'a'.repeat(64) }), /output-immutable/);
    assert.equal(model.requests.filter(r => r.includes(cancelMarker)).length, cancelCalls, 'abort and replays must not re-execute the turn');
    pass('integration-cancelled-turn-reconciled-without-duplicate-execution', { binding: cancelledBinding.sessionId, callsAtAbort: cancelCalls, replayRefused: true, operationReplaySameBinding: true });
    const finalContent = '# final after reconciliation\n';
    await work('interrupt', 'draft', [
      { name: 'read', arguments: { file_path: cancelFile } },
      { name: 'write', arguments: { file_path: cancelFile, content: finalContent } },
    ]);
    assert.equal(await readFile(cancelFile, 'utf8'), finalContent);
    snapshot = await state('interrupt');
    assert.equal(snapshot.attempts.draft.length, 2, 'the aborted attempt and the fresh attempt');
    await review('interrupt', 'draft', [
      { name: 'read', arguments: { file_path: cancelFile } },
      proposal('interrupt', 'draft', attemptOf(await state('interrupt'), 'draft').output.digest),
    ]);
    assert.equal(attemptOf(await state('interrupt'), 'draft').decision.verdict, 'accepted');
    pass('integration-fresh-operation-after-abandon-completes-bounded-rework', { attempts: 2 });

    await createCase('reconcile', plan(1, 2));
    const reconcileMarker = script();
    const reconcileBinding = await reserve('reconcile', 'draft', 'work');
    const reconcileRun = await start(reconcileBinding, reconcileMarker);
    assert.equal((await reconcileRun.result).stopReason, 'completed');
    const reconcileCalls = model.requests.filter(r => r.includes(reconcileMarker)).length;
    // Uncertain host write: reconcile through the operation journal and the
    // native session before recording; the replay must not dispatch again.
    const reservedAgain = await ctx.workdshExperts.reserveDelegation(actor, parent.id, memberRefs.alpha, { operationId: reconcileBinding.creationOperationId }, signal);
    assert.equal(reservedAgain.sessionId, reconcileBinding.sessionId);
    assert.equal(ctx.agents.get(reconcileBinding.sessionId), reconcileRun.localAgent, 'the replay must not create a second child');
    assert.equal(model.requests.filter(r => r.includes(reconcileMarker)).length, reconcileCalls);
    const reconcileReceipt = terminalReceipt(reconcileRun);
    const reconcileState = await state('reconcile');
    await mutate('reconcile', s => policy.recordSopOutput(s, reconcileState.revision, 'draft', reconcileReceipt));
    await assert.rejects(mutate('reconcile', s => policy.recordSopOutput(s, s.revision, 'draft', reconcileReceipt)), /output-immutable/);
    pass('integration-uncertain-dispatch-reconciled-without-duplicate-execution', { binding: reconcileBinding.sessionId, calls: reconcileCalls, recordedOnce: true });

    report.integrationNativeChildren = runs.filter(run => run.localAgent.session.snapshotEvents().some(e => e.type === 'subagent/descriptor')).length;
    report.integrationStates = Object.fromEntries(await Promise.all([...cases].map(async id => [id, await state(id)])));
    report.integrationToolObservations = observations;
    report.limitations.push('Workflow/ralph and web/jobs/ask-user rows were inventoried statically from the installed base bundle and expert preset; only the delegation/write/sandbox rows were exercised dynamically.',
      'The operation journal applying-phase outcome-unknown branch depends on a crash mid-write and is not simulated here; replays are verified for committed operations.',
      'Sandbox enforcement was exercised on this macOS host; Windows/Linux runner differences are not covered.',
      'Integration Host/storage wiring is test-only; no production team endpoint or Profile row is installed.');
    report.integrationReady = true;
  } finally {
    delete model.sopBlock;
    await Promise.all(runs.map(run => run.dispose()));
  }
}
