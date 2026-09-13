// TM-01 closing slice: the production team flow on the existing experts plugin.
// Two published experts collaborate through the AI-visible tools
// (workdsh_expert_team_*), the plugin-owned one-shot provider and the three
// fail-closed file-version gates. The host session, member children, tool
// registry, storage domain and sandbox rows are the actual composition; no
// experimental agent-team module and no second executor is involved.
// Requires the WorkDSH packages to be built first.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createMessage } from '@deepseek-ai/dsh-llm';
import { TeamRunsManager } from '../packages/plugins/experts/dist/index.js';
import { registerExpertTeamTools } from '../packages/plugins/experts/dist/tools/team-tools.js';
import { registerExpertManagementTools } from '../packages/plugins/experts/dist/tools/management-tools.js';
import { preflightPackage } from '../packages/plugins/experts/dist/services/portability.js';
import { definitionFromDocuments } from '../packages/plugins/experts/dist/authoring/documents.js';
import { registerExpertDelegationProvider } from '../packages/plugins/experts/dist/runtime/delegation-provider.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const content = value => [{ type: 'text', text: value }];
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runProductionProbe({ ctx, actor, experts, model, load, signal, pass, report, settle, observedAgents, home }) {
  // ── the same sandbox / fs / present rows the target Profile mounts ───────
  await load('@deepseek-ai/dsh-subprocess-local');
  await load('@deepseek-ai/dsh-sandbox-local');
  await load('@deepseek-ai/dsh-sandbox-policy', { mode: 'workspace-write', workspaceRoot: home });
  await load('@deepseek-ai/dsh-bash-sandbox', { timeoutMs: 60000 });
  await load('@deepseek-ai/dsh-shell-env');
  await load('@deepseek-ai/dsh-user-approval', { policy: 'ask' });
  await load('@deepseek-ai/dsh-fs-sandbox');
  await load('@deepseek-ai/dsh-fs-observation-policy');
  await load('@deepseek-ai/dsh-tool-fs');
  await load('@deepseek-ai/dsh-tool-present');
  await load('@deepseek-ai/dsh-tool-bash');
  registerExpertManagementTools(ctx, ctx.workdshExperts);

  // ── the same plugin entries the production Host apply mounts ─────────────
  await ctx.plugin(TeamRunsManager);
  registerExpertTeamTools(ctx);
  registerExpertDelegationProvider(ctx, {
    admission: { authorizeStart: input => ctx.workdshTeamRuns.authorizeDelegation(input) },
  });
  const names = new Set(ctx.tools.schemas().map(row => row.name));
  for (const name of ['workdsh_expert_team_status', 'workdsh_expert_team_open', 'workdsh_expert_team_delegate',
    'workdsh_expert_team_review', 'workdsh_expert_team_abandon', 'workdsh_expert_team_deliver', 'write', 'read', 'present']) {
    assert.ok(names.has(name), `production team flow requires tool ${name}`);
  }
  assert.equal(ctx.subagents.getProvider('workdsh-expert') !== undefined, true);
  pass('production-team-entries-mounted-on-existing-plugin', {
    tools: names.size,
    provider: 'workdsh-expert',
    authority: 'ctx.workdshTeamRuns.admission',
  });

  const host = experts[0].agent;
  const deliverable = join(home, 'team-deliverable.md');
  const driftFile = join(home, 'team-drift.md');
  const cancelFile = join(home, 'team-cancel.md');
  const memberRefs = { alpha: experts[0].ref, beta: experts[1].ref };
  const memberArgument = key => ({ key, expert_id: memberRefs[key].expertId, revision_id: memberRefs[key].revisionId });
  const stages = [
    { id: 'draft', worker: 'alpha', reviewer: 'beta', depends_on: [], max_attempts: 2 },
    { id: 'publish', worker: 'beta', reviewer: 'alpha', depends_on: ['draft'], max_attempts: 1 },
  ];

  // ── deterministic model scripts: one action per request until exhausted ──
  const scripts = new Map();
  const memberScripts = [];
  let serial = 0;
  function define(actions, kind, waitAfter) {
    const marker = `TEAM_${++serial}_END`;
    const entry = { marker, actions, kind, waitAfter };
    scripts.set(marker, entry);
    if (kind !== 'host') memberScripts.push(entry);
    return entry;
  }
  const hostScript = actions => define(actions, 'host');
  const workScript = (actions, waitAfter) => define(actions, 'work', waitAfter);
  const reviewScript = actions => define(actions, 'review');

  const decodedText = messages => messages.replaceAll('\\"', '"');
  const lastOf = (messages, regex) => [...decodedText(messages).matchAll(regex)].at(-1)?.[1];
  const requireMatch = (text, regex, label) => {
    const found = lastOf(text, regex);
    assert.ok(found, `team-probe/${label} :: ${String(text).slice(-320)}`);
    return found;
  };
  // Run ids appear both as JSON (`"run_id": "team-..."`) in tool results and in
  // prose inside the member prompts (`任务 team-...`).
  const runIdOf = messages => requireMatch(messages, /(team-[a-f0-9]{32})/g, 'no-run-id');
  // Review digests come from the reviewer's own status read; the latest
  // recorded stage digest is the stage under review in this sequential SOP.
  const digestOf = messages => requireMatch(messages, /"output_digest":\s*"([a-f0-9]{64})"/g, 'no-output-digest');

  model.teamBlock = async (options, messages) => {
    const memberTurn = messages.includes('的执行成员') || messages.includes('的评审成员') || messages.includes('主理人委派的专业问题');
    const entry = [...scripts.values()].reverse()
      .find(candidate => (memberTurn ? candidate.kind !== 'host' : candidate.kind === 'host') && messages.includes(candidate.marker));
    if (!entry) throw new Error(`team-probe/unmatched-model-request ${messages.slice(-400)}`);
    for (let index = 0; index < entry.actions.length; index++) {
      const id = `${entry.marker}_call_${index}`;
      if (messages.includes(id)) continue;
      const action = entry.actions[index];
      const args = typeof action.arguments === 'function' ? action.arguments(messages) : action.arguments;
      return { type: 'tool-call', id, name: action.name, arguments: JSON.stringify(args) };
    }
    if (entry.waitAfter) {
      entry.waitAfter.resolve();
      await new Promise(resolveWait => { if (options.signal.aborted) resolveWait(); else options.signal.addEventListener('abort', resolveWait, { once: true }); });
    }
    return { type: 'text', text: `DELIVERABLE ${entry.marker}` };
  };

  // ── host driving and evidence helpers ────────────────────────────────────
  async function drive(marker) {
    host.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: content(marker) }));
    await settle(host);
  }
  function collect(name) {
    const events = host.session.snapshotEvents();
    return events.filter(event => event.type === 'tool/call' && event.data.name === name).map(call => {
      const result = events.find(event => event.type === 'tool/result' && event.data.message?.source?.callId === call.data.callId);
      const block = result?.data.message.content?.find(item => item.type === 'tool-result');
      return {
        callId: call.data.callId,
        isError: block?.isError === true,
        text: block?.content?.filter(item => item.type === 'text').map(item => item.text).join(' ') ?? '',
      };
    });
  }
  const marks = new Map();
  const drain = name => {
    const rows = collect(name);
    const from = marks.get(name) ?? 0;
    marks.set(name, rows.length);
    return rows.slice(from);
  };
  const stateOf = runId => ctx.workdshTeamRuns.get(actor, runId, signal);
  const attemptOf = (run, stageId) => run.state.attempts[stageId]?.at(-1);
  async function waitFor(check, label, timeoutMs = 6000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      if (await check()) return;
      if (Date.now() > deadline) throw new Error(`team-probe/${label}-timeout`);
      await sleep(50);
    }
  }

  const beforeProbe = new Set(observedAgents.keys());
  const openCall = { name: 'workdsh_expert_team_open' };

  try {
    // ── case 1: two existing experts collaborate and deliver ───────────────
    const v1 = '# deliverable v1\n';
    const mainDraftWork = workScript([{ name: 'write', arguments: { file_path: deliverable, content: v1 } }]);
    const mainDraftReview = reviewScript([
      { name: 'read', arguments: { file_path: deliverable } },
      { name: 'workdsh_expert_team_status', arguments: messages => ({ run_id: runIdOf(messages) }) },
      { name: 'workdsh_expert_team_review', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', output_digest: digestOf(messages), verdict: 'accepted' }) },
    ]);
    const mainPublishWork = workScript([
      { name: 'read', arguments: { file_path: deliverable } },
      { name: 'present', arguments: { files: [{ path: deliverable, description: 'reviewed deliverable' }] } },
    ]);
    const mainPublishReview = reviewScript([
      { name: 'read', arguments: { file_path: deliverable } },
      { name: 'workdsh_expert_team_status', arguments: messages => ({ run_id: runIdOf(messages) }) },
      { name: 'workdsh_expert_team_review', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'publish', output_digest: digestOf(messages), verdict: 'accepted' }) },
    ]);
    const mainHost = hostScript([
      { ...openCall, arguments: { members: [memberArgument('alpha'), memberArgument('beta')], stages, max_total_attempts: 8 } },
      // Wrong order: the dependent stage is delegated before its predecessor is accepted.
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'publish', kind: 'work' }) },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'work', instructions: mainDraftWork.marker }) },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'review', instructions: mainDraftReview.marker }) },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'publish', kind: 'work', instructions: mainPublishWork.marker }) },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'publish', kind: 'review', instructions: mainPublishReview.marker }) },
      { name: 'workdsh_expert_team_deliver', arguments: messages => ({ run_id: runIdOf(messages) }) },
      // Duplicate delivery after success.
      { name: 'workdsh_expert_team_deliver', arguments: messages => ({ run_id: runIdOf(messages) }) },
      // Duplicate work delegation after the accepted decision.
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'work' }) },
      { name: 'workdsh_expert_team_status', arguments: messages => ({ run_id: runIdOf(messages) }) },
    ]);
    await drive(mainHost.marker);
    const mainRunId = runIdOf(drain('workdsh_expert_team_open')[0].text);
    const mainDelegates = drain('workdsh_expert_team_delegate');
    const mainDeliveries = drain('workdsh_expert_team_deliver');
    const mainStatus = drain('workdsh_expert_team_status');
    assert.equal(mainDelegates.length, 6);
    assert.equal(mainDelegates[0].isError, true, 'the skipped stage must be rejected');
    assert.match(mainDelegates[0].text, /predecessor-not-accepted/);
    assert.equal(mainDelegates[1].isError, false);
    assert.match(mainDelegates[1].text, /"status": "completed"/);
    assert.equal(mainDelegates[2].isError, false);
    assert.match(mainDelegates[2].text, /"verdict": "accepted"/);
    assert.equal(mainDelegates[3].isError, false);
    assert.equal(mainDelegates[4].isError, false);
    assert.equal(mainDelegates[5].isError, true, 'a closed accepted attempt must not be re-delegated');
    assert.match(mainDelegates[5].text, /attempt-not-retryable/);
    assert.equal(mainDeliveries.length, 2);
    assert.equal(mainDeliveries[0].isError, false);
    assert.equal(mainDeliveries[1].isError, true, 'duplicate delivery must be rejected');
    assert.match(mainDeliveries[1].text, /已交付|already-delivered/);
    assert.match(mainStatus[0].text, /"delivered": true/);
    const mainRun = await stateOf(mainRunId);
    assert.equal(mainRun.state.attempts.draft.length, 1, 'the rejected skip must leave no attempt');
    assert.equal(mainRun.state.attempts.publish.length, 1);
    assert.equal(attemptOf(mainRun, 'draft').decision.verdict, 'accepted');
    assert.equal(attemptOf(mainRun, 'publish').decision.verdict, 'accepted');
    const draftPin = attemptOf(mainRun, 'draft').output.artifacts.find(pin => pin.path === deliverable);
    const publishPin = attemptOf(mainRun, 'publish').output.artifacts.find(pin => pin.path === deliverable);
    const mainDelivery = mainRun.delivery.artifacts.find(pin => pin.path === deliverable);
    assert.ok(draftPin && publishPin && mainDelivery, 'each stage and the delivery must pin the deliverable');
    assert.equal(draftPin.sha256, sha256(v1));
    assert.equal(publishPin.sha256, draftPin.sha256, 'handoff must pin the accepted bytes');
    assert.equal(mainDelivery.sha256, draftPin.sha256, 'delivery must pin the accepted bytes');
    assert.equal(await readFile(deliverable, 'utf8'), v1);
    pass('production-team-collaboration-generate-review-deliver', {
      runId: mainRunId, version: draftPin.sha256, delegated: mainDelegates.length,
      skipRejected: mainDelegates[0].text.slice(0, 80), duplicateDeliveryRejected: true, duplicateWorkRejected: true,
    });

    // ── case 2: file drift must block sign-off, handoff and delivery ────────
    const driftV1 = '# drift v1\n';
    const driftV2 = '# drift v2\n';
    const driftIssue = '# tampered externally\n';
    const driftDraftWork = workScript([{ name: 'write', arguments: { file_path: driftFile, content: driftV1 } }]);
    const driftDraftReview = reviewScript([
      { name: 'read', arguments: { file_path: driftFile } },
      { name: 'workdsh_expert_team_status', arguments: messages => ({ run_id: runIdOf(messages) }) },
      { name: 'workdsh_expert_team_review', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', output_digest: digestOf(messages), verdict: 'accepted' }) },
    ]);
    const driftRework = workScript([
      // fs-observation policy: an existing file is read before modification.
      { name: 'read', arguments: { file_path: driftFile } },
      { name: 'write', arguments: { file_path: driftFile, content: driftV2 } },
    ]);
    const driftReworkReview = reviewScript([
      { name: 'read', arguments: { file_path: driftFile } },
      { name: 'workdsh_expert_team_status', arguments: messages => ({ run_id: runIdOf(messages) }) },
      { name: 'workdsh_expert_team_review', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', output_digest: digestOf(messages), verdict: 'accepted' }) },
    ]);
    const driftPublishWork = workScript([
      { name: 'read', arguments: { file_path: driftFile } },
      { name: 'present', arguments: { files: [{ path: driftFile, description: 'drift-checked deliverable' }] } },
    ]);
    const driftPublishReview = reviewScript([
      { name: 'read', arguments: { file_path: driftFile } },
      { name: 'workdsh_expert_team_status', arguments: messages => ({ run_id: runIdOf(messages) }) },
      { name: 'workdsh_expert_team_review', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'publish', output_digest: digestOf(messages), verdict: 'accepted' }) },
    ]);
    const driftOpen = hostScript([
      { ...openCall, arguments: { members: [memberArgument('alpha'), memberArgument('beta')], stages, max_total_attempts: 8 } },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'work', instructions: driftDraftWork.marker }) },
    ]);
    const driftReviewTampered = hostScript([
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'review', instructions: driftDraftReview.marker }) },
    ]);
    const driftReworkHost = hostScript([
      { name: 'workdsh_expert_team_abandon', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', reason: '签收时文件版本漂移，作废该尝试' }) },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'work', instructions: driftRework.marker }) },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'review', instructions: driftReworkReview.marker }) },
    ]);
    const driftHandoffTampered = hostScript([
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'publish', kind: 'work', instructions: driftPublishWork.marker }) },
    ]);
    const driftPublishHost = hostScript([
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'publish', kind: 'work', instructions: driftPublishWork.marker }) },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'publish', kind: 'review', instructions: driftPublishReview.marker }) },
    ]);
    const driftDeliverTampered = hostScript([
      { name: 'workdsh_expert_team_deliver', arguments: messages => ({ run_id: runIdOf(messages) }) },
    ]);
    const driftDeliverHost = hostScript([
      { name: 'workdsh_expert_team_deliver', arguments: messages => ({ run_id: runIdOf(messages) }) },
    ]);

    await drive(driftOpen.marker);
    const driftRunId = runIdOf(drain('workdsh_expert_team_open')[0].text);
    assert.equal(drain('workdsh_expert_team_delegate').length, 1);
    assert.equal(attemptOf(await stateOf(driftRunId), 'draft').output.artifacts[0].sha256, sha256(driftV1));
    await writeFile(driftFile, driftIssue);
    await drive(driftReviewTampered.marker);
    const signoff = drain('workdsh_expert_team_delegate');
    assert.equal(signoff.length, 1);
    assert.equal(signoff[0].isError, true, 'a drifted file must not be signed off');
    assert.match(signoff[0].text, /stale-artifact|不一致/);
    let driftRun = await stateOf(driftRunId);
    assert.equal(attemptOf(driftRun, 'draft').decision, undefined, 'no decision may be attached to drifted bytes');
    assert.equal(attemptOf(driftRun, 'draft').proposal.verdict, 'accepted');
    await writeFile(driftFile, driftV1);
    await drive(driftReworkHost.marker);
    assert.equal(drain('workdsh_expert_team_delegate').length, 2);
    driftRun = await stateOf(driftRunId);
    assert.equal(driftRun.state.attempts.draft.length, 2);
    assert.equal(driftRun.state.attempts.draft[0].abandoned !== undefined, true, 'the drifted attempt must be explicitly abandoned');
    assert.equal(attemptOf(driftRun, 'draft').decision.verdict, 'accepted');
    const driftPinV2 = attemptOf(driftRun, 'draft').output.artifacts.find(pin => pin.path === driftFile);
    assert.equal(driftPinV2.sha256, sha256(driftV2));
    await writeFile(driftFile, driftIssue);
    await drive(driftHandoffTampered.marker);
    const handoff = drain('workdsh_expert_team_delegate');
    assert.equal(handoff.length, 1);
    assert.equal(handoff[0].isError, true, 'a dependent stage must not start on drifted bytes');
    assert.match(handoff[0].text, /stale-artifact|不一致/);
    driftRun = await stateOf(driftRunId);
    assert.equal(driftRun.state.attempts.publish.length, 0, 'the rejected handoff must leave no attempt and no reservation');
    await writeFile(driftFile, driftV2);
    await drive(driftPublishHost.marker);
    assert.equal(drain('workdsh_expert_team_delegate').length, 2);
    driftRun = await stateOf(driftRunId);
    assert.equal(attemptOf(driftRun, 'publish').decision.verdict, 'accepted');
    assert.equal(attemptOf(driftRun, 'publish').output.artifacts.find(pin => pin.path === driftFile).sha256, driftPinV2.sha256);
    await writeFile(driftFile, driftIssue);
    await drive(driftDeliverTampered.marker);
    const blockedDelivery = drain('workdsh_expert_team_deliver');
    assert.equal(blockedDelivery.length, 1);
    assert.equal(blockedDelivery[0].isError, true, 'delivery must be refused while bytes drifted');
    assert.match(blockedDelivery[0].text, /stale-artifact|不一致/);
    assert.equal((await stateOf(driftRunId)).delivery, undefined);
    await writeFile(driftFile, driftV2);
    await drive(driftDeliverHost.marker);
    const delivered = drain('workdsh_expert_team_deliver');
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0].isError, false);
    driftRun = await stateOf(driftRunId);
    const driftDelivery = driftRun.delivery.artifacts.find(pin => pin.path === driftFile);
    assert.equal(driftDelivery.sha256, driftPinV2.sha256, 'delivered bytes must equal the accepted bytes');
    assert.equal(await readFile(driftFile, 'utf8'), driftV2);
    pass('production-team-file-drift-blocked-at-signoff-handoff-delivery', {
      runId: driftRunId,
      signoff: signoff[0].text.slice(0, 90),
      handoffAttempts: 0,
      deliveryBlocked: true,
      acceptedVersion: driftPinV2.sha256,
      deliveredVersion: driftDelivery.sha256,
    });

    // ── case 3: user cancellation abandons the attempt, retry succeeds ─────
    const cancelStart = '# cancelled attempt\n';
    const cancelFinal = '# final after cancellation\n';
    const abandoned = deferred();
    const cancelWork = workScript(
      [{ name: 'write', arguments: { file_path: cancelFile, content: cancelStart } }],
      abandoned,
    );
    const cancelRetry = workScript([
      { name: 'read', arguments: { file_path: cancelFile } },
      { name: 'write', arguments: { file_path: cancelFile, content: cancelFinal } },
    ]);
    const cancelReview = reviewScript([
      { name: 'read', arguments: { file_path: cancelFile } },
      { name: 'workdsh_expert_team_status', arguments: messages => ({ run_id: runIdOf(messages) }) },
      { name: 'workdsh_expert_team_review', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', output_digest: digestOf(messages), verdict: 'accepted' }) },
    ]);
    const cancelOpen = hostScript([
      { ...openCall, arguments: { members: [memberArgument('alpha'), memberArgument('beta')], stages: [stages[0]], max_total_attempts: 2 } },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'work', instructions: cancelWork.marker }) },
    ]);
    const cancelResume = hostScript([
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'work', instructions: cancelRetry.marker }) },
      { name: 'workdsh_expert_team_delegate', arguments: messages => ({ run_id: runIdOf(messages), stage_id: 'draft', kind: 'review', instructions: cancelReview.marker }) },
    ]);

    const beforeCancel = new Set(observedAgents.keys());
    host.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: content(cancelOpen.marker) }));
    await Promise.race([abandoned.promise, new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('team-probe/cancel-wait-timeout')), { once: true }))]);
    assert.equal(await readFile(cancelFile, 'utf8'), cancelStart, 'the file side effect must exist before cancellation');
    host.cancel({ kind: 'user' });
    await settle(host);
    const cancelRunId = runIdOf(drain('workdsh_expert_team_open')[0].text);
    const hostTerminal = host.session.snapshotEvents().filter(event => event.type === 'turn/end').at(-1);
    assert.equal(hostTerminal.data.reason.kind, 'aborted', 'host cancellation must interrupt the live turn');
    let cancelledMember;
    await waitFor(() => {
      cancelledMember = [...observedAgents.values()].find(agent => agent.id.startsWith('delegation-')
        && agent.session.header.parentSession === host.id && !beforeCancel.has(agent.id));
      return Boolean(cancelledMember) && cancelledMember.session.snapshotEvents()
        .some(event => event.type === 'turn/end' && event.data.reason.kind === 'aborted');
    }, 'cancelled-member-aborted');
    await waitFor(async () => attemptOf(await stateOf(cancelRunId), 'draft')?.abandoned !== undefined, 'cancelled-attempt-abandoned');
    const cancelDelegates = drain('workdsh_expert_team_delegate');
    assert.equal(cancelDelegates.length, 1);
    let cancelRun = await stateOf(cancelRunId);
    assert.equal(attemptOf(cancelRun, 'draft').output, undefined, 'an aborted turn records no output');
    await drive(cancelResume.marker);
    cancelRun = await stateOf(cancelRunId);
    assert.equal(cancelRun.state.attempts.draft.length, 2);
    assert.equal(attemptOf(cancelRun, 'draft').decision.verdict, 'accepted');
    assert.equal(await readFile(cancelFile, 'utf8'), cancelFinal);
    const retryDelegates = drain('workdsh_expert_team_delegate');
    assert.equal(retryDelegates.length, 2);
    assert.equal(retryDelegates[0].isError, false);
    assert.equal(retryDelegates[1].isError, false);
    pass('production-team-cancel-abandons-attempt-and-retry-succeeds', {
      runId: cancelRunId,
      cancelledMember: cancelledMember.id,
      abandonedReason: cancelRun.state.attempts.draft[0].abandoned,
      retriedAttempts: cancelRun.state.attempts.draft.length,
    });

    // ── member accounting against the native session log ───────────────────
    const members = [...observedAgents.values()].filter(agent => agent.id.startsWith('delegation-')
      && agent.session.header.parentSession === host.id && !beforeProbe.has(agent.id));
    assert.equal(members.length, memberScripts.length, 'every scripted member must map to one native child');
    assert.equal(members.length, 13);
    for (const agent of members) {
      assert.equal(agent.session.snapshotEvents().filter(event => event.type === 'subagent/descriptor' && event.data.mode === 'one-shot').length, 1);
    }
    report.teamNativeChildren = members.length;

    // Whole authored team: direct question is a real frozen-member child, no extra review.
    const md = (id, role, skill) => `---\nname: ${id}\ndescription: Frozen professional fixture\nskills: [${skill}]\n---\n# ${role}\nUse your fixed fixture skill and return complete independent output.\n`;
    const directFiles = {
      '.workdsh-expert/plugin.json': JSON.stringify({ name: 'direct-team', expertType: 'team', agentName: 'direct-team-lead', agents: ['./agents/direct-team-lead.md', './agents/direct-analyst.md', './agents/direct-editor.md'], teamInfo: { leadAgent: 'direct-team-lead', memberAgents: ['direct-analyst', 'direct-editor'] } }),
      'agents/direct-team-lead.md': md('direct-team-lead', 'EXPERT_ALPHA', 'probe-alpha'),
      'agents/direct-analyst.md': md('direct-analyst', 'EXPERT_BETA', 'probe-beta'),
      'agents/direct-editor.md': md('direct-editor', 'EXPERT_ALPHA', 'probe-alpha'),
      'settings.json': JSON.stringify({ agent: 'direct-team-lead' }),
    };
    for (const name of ['alpha', 'beta']) await writeFile(join(process.env.DSH_AGENTS_HOME, 'skills', `probe-${name}`, 'SKILL.md'), `---\nname: probe-${name}\ndescription: Fixed fixture\n---\nRESOURCE_${name.toUpperCase()}_V1\n`);
    let directDraft = await ctx.workdshExperts.createDraft(actor, definitionFromDocuments(directFiles), { operationId: 'direct-team-create' });
    const sourceCli = join(home, 'fixture-inspect');
    const cliBytes = Buffer.from('#!/bin/sh\necho inspect\n');
    await writeFile(sourceCli, cliBytes);
    const directBeforeResources = await ctx.workdshExperts.get(actor, directDraft.expertId);
    const resourceRequest = hostScript([{ name: 'workdsh_expert_save_resources', arguments: {
      expert_id: directDraft.expertId, expected_revision: directBeforeResources.expert.revision,
      resources: [{ path: 'bin/inspect', source_path: sourceCli, executable: true }],
    } }]);
    await drive(resourceRequest.marker);
    const savedResources = drain('workdsh_expert_save_resources');
    assert.equal(savedResources.length, 1);
    assert.equal(savedResources[0].isError, false, savedResources[0].text);
    directDraft = (await ctx.workdshExperts.get(actor, directDraft.expertId)).draft;
    assert.equal(directDraft.definition.packageAssets['bin/inspect'].base64, cliBytes.toString('base64'));
    pass('authoring-resources-real-workspace-bytes-saved', { resource: 'bin/inspect', bytes: cliBytes.length, executable: true });
    const directValidation = await ctx.workdshExperts.validate(actor, directDraft.expertId, directDraft.revision);
    assert.equal(directValidation.publishable, true, JSON.stringify(directValidation.issues));
    const directConfirmation = await ctx.workdshExperts.requestPublishConfirmation(actor, directDraft.expertId, directDraft.revision);
    const directProof = await ctx.workdshExperts.confirmPublish(actor, directConfirmation.confirmationToken);
    await ctx.workdshExperts.publish(actor, directDraft.expertId, directDraft.revision, directValidation.dependencyLockDigest, directProof, { operationId: 'direct-team-publish' });
    const directPlan = await ctx.workdshExperts.prepareExecution(actor, directDraft.expertId, undefined, home);
    const directCreated = await ctx.workdshExperts.createExecution(actor, directPlan.executionPlanId, { operationId: 'direct-team-execute' });
    const directHost = ctx.agents.get(directCreated.sessionId);
    const directChild = workScript([]);
    const packageFile = join(home, "direct team's delivery.expert.zip");
    const directRequest = hostScript([
      { name: 'workdsh_expert_team_ask', arguments: { member: 'direct-analyst', instructions: directChild.marker } },
      { name: 'workdsh_expert_export_file', arguments: { expert_id: directDraft.expertId, file_path: packageFile } },
    ]);
    directHost.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: content(directRequest.marker) }));
    await settle(directHost);
    const directEvents = directHost.session.snapshotEvents();
    const directCall = directEvents.find(e => e.type === 'tool/call' && e.data.name === 'workdsh_expert_team_ask');
    assert.ok(directCall, JSON.stringify(directEvents).slice(-5000));
    const directResult = directEvents.find(e => e.type === 'tool/result' && e.data.message?.source?.callId === directCall.data.callId);
    const directBlock = directResult.data.message.content.find(b => b.type === 'tool-result');
    assert.equal(directBlock.isError, false, JSON.stringify(directBlock));
    assert.match(JSON.stringify(directBlock), new RegExp(`DELIVERABLE ${directChild.marker}`));
    const exportCall = directEvents.find(e => e.type === 'tool/call' && e.data.name === 'workdsh_expert_export_file');
    assert.ok(exportCall);
    const exportResult = directEvents.find(e => e.type === 'tool/result' && e.data.message?.source?.callId === exportCall.data.callId);
    const exportBlock = exportResult.data.message.content.find(b => b.type === 'tool-result');
    assert.equal(exportBlock.isError, false, JSON.stringify(exportBlock));
    const deliveredPackage = preflightPackage(await readFile(packageFile));
    assert.deepEqual(deliveredPackage.candidate.packageDocuments, directFiles);
    assert.deepEqual(deliveredPackage.candidate.packageAssets, directDraft.definition.packageAssets);
    pass('authoring-complete-package-real-native-file-present', { file: packageFile, bytes: (await readFile(packageFile)).length });
    const actualDirectChildren = [...observedAgents.values()].filter(a => a.session.header.parentSession === directHost.id);
    assert.equal(actualDirectChildren.length, 1);
    assert.match(JSON.stringify(actualDirectChildren[0].session.snapshotEvents()), /RESOURCE_BETA/);
    const directRunId = runIdOf(JSON.stringify(directBlock));
    const directRun = await ctx.workdshTeamRuns.get(actor, directRunId);
    assert.equal(directRun.state.attempts.answer[0].decision.verdict, 'accepted');
    assert.equal(directRun.state.attempts.answer[0].reviewSessionId, undefined);
    pass('authored-team-direct-member-real-child-full-output', { runId: directRunId, memberSession: actualDirectChildren[0].id, reviewChildren: 0 });
    report.teamNativeChildren = members.length + actualDirectChildren.length;
    report.teamReady = true;
    report.limitations.push(
      'Team creation/edit pages are not part of this batch; runs are opened through the AI tools only.',
      'The deterministic fixture model scripts both host and member turns; paid-model professional judgment is not covered.',
      'Cancellation coverage is a user cancel of the host turn mid-delegation; process-kill recovery remains with the earlier probes.',
      'Sandbox enforcement was exercised on this macOS host; Windows/Linux runner differences are not covered.',
    );
  } finally {
    delete model.teamBlock;
  }
}
