// TM-01: published native runtime with deterministic model I/O, no user Profile.
// First run: node scripts/probe-expert-team.mjs --prepare
// Rerun cached archives: node scripts/probe-expert-team.mjs
// Independent one-shot adapter: node scripts/probe-expert-team.mjs --adapter
// SOP gates on that native adapter: node scripts/probe-expert-team.mjs --sop
// Actual target-Profile composition, file versions and interruption:
//   node scripts/probe-expert-team.mjs --integration
// Production team flow on the experts plugin (AI tools + one-shot provider):
//   node scripts/probe-expert-team.mjs --team
// Requires the existing WorkDSH packages to be built. Exit 2 means reproduced
// integration gaps; --adapter exits 0 only for its limited adapter checks.
// Exit 1 means a failed probe. Neither mode is a product release gate pass.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Context } from '@deepseek-ai/cordis';
import { LlmAdapter, createMessage } from '@deepseek-ai/dsh-llm';
import { COMPOSITION_FILE } from '@deepseek-ai/dsh-agent-presets';
import { ExpertsManager } from '../packages/plugins/experts/dist/index.js';
import { SkillManager } from '../packages/plugins/skills/dist/index.js';
import { AccessManager } from '../packages/plugins/access/dist/index.js';
import { AuditJournal } from '../packages/plugins/audit/dist/index.js';
import { registerExpertExecutionGuard } from '../packages/plugins/experts/dist/runtime/execution-guard.js';
import { registerExpertDelegationProvider } from '../packages/plugins/experts/dist/runtime/delegation-provider.js';
import { runSopProbe } from './probe-expert-sop.mjs';
import { runIntegrationProbe } from './probe-expert-integration.mjs';
import { runProductionProbe } from './probe-expert-production.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = join(root, '.artifacts/expert-team-probe');
await mkdir(artifacts, { recursive: true });
await mkdir(join(root, '.test-runtime'), { recursive: true });
const home = await mkdtemp(join(root, '.test-runtime/team-probe-'));
const requireRoot = createRequire(import.meta.url);
const dshManifest = requireRoot.resolve('@deepseek-ai/dsh/package.json');
const requireDsh = createRequire(dshManifest);
const requireExperts = createRequire(join(root, 'packages/plugins/experts/package.json'));
const baseUrl = pathToFileURL(dirname(dshManifest) + '/').href;
const version = '0.1.5-rc.1';
const sopMode = process.argv.includes('--sop');
const integrationMode = process.argv.includes('--integration');
const teamMode = process.argv.includes('--team');
const adapterMode = process.argv.includes('--adapter') || sopMode || integrationMode || teamMode;
const report = { version, mode: teamMode ? 'expert-team/production-tools-with-native-children/deterministic-model' : integrationMode ? 'expert-integration/production-host-composition/deterministic-model' : sopMode ? 'sop/native-one-shot/deterministic-model' : adapterMode ? 'one-shot-adapter/deterministic-model' : 'agent-teams-baseline/deterministic-model', checks: [], packages: [], limitations: [] };
const pass = (name, evidence) => { report.checks.push({ name, status: 'passed', evidence }); console.log(`PASS ${name}`); };
const gap = (name, evidence) => { report.checks.push({ name, status: 'failed', evidence }); console.log(`GAP ${name}`); };
const savedEnv = { DSH_HOME: process.env.DSH_HOME, DSH_AGENTS_HOME: process.env.DSH_AGENTS_HOME };
process.env.DSH_HOME = join(home, 'dsh');
process.env.DSH_AGENTS_HOME = join(home, 'agents');
const ctx = new Context();
const handles = [];
const observedAgents = new Map();
ctx.on('agent/created', ({ agent }) => { observedAgents.set(agent.id, agent); });

function resolvePackage(name) {
  for (const req of [requireDsh, requireRoot, requireExperts]) {
    try { return dirname(req.resolve(`${name}/package.json`)); } catch { /* next public resolver */ }
  }
  throw new Error(`Missing installed published dependency ${name}`);
}

// Archives are downloaded explicitly by --prepare; no install hooks or user config.
async function archivePackage(name) {
  const filename = `${name.slice(1).replaceAll('/', '-')}-${version}.tgz`;
  const archive = join(artifacts, 'packages', filename);
  if (process.argv.includes('--prepare')) {
    await mkdir(dirname(archive), { recursive: true });
    const packed = spawnSync('npm', ['pack', `${name}@${version}`, '--ignore-scripts', '--json', '--pack-destination', dirname(archive)], { cwd: home, encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr);
  }
  const bytes = await readFile(archive);
  const target = join(home, 'node_modules', name);
  await mkdir(target, { recursive: true });
  const unpack = spawnSync('tar', ['-xzf', archive, '--strip-components=1', '-C', target], { encoding: 'utf8' });
  assert.equal(unpack.status, 0, unpack.stderr);
  const manifest = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'));
  assert.equal(manifest.name, name); assert.equal(manifest.version, version);
  for (const dep of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
    if (dep === '@deepseek-ai/dsh-experimental-agent-team') continue;
    const dependencyRoot = resolvePackage(dep);
    const depManifest = JSON.parse(await readFile(join(dependencyRoot, 'package.json'), 'utf8'));
    if (dep.startsWith('@deepseek-ai/dsh-')) assert.equal(depManifest.version, version, dep);
    const link = join(target, 'node_modules', dep);
    await mkdir(dirname(link), { recursive: true });
    await symlink(dependencyRoot, link, 'dir');
  }
  report.packages.push({ name, version, sha512: createHash('sha512').update(bytes).digest('hex') });
  return pathToFileURL(join(target, manifest.exports['.'].default)).href;
}

class FixtureModel extends LlmAdapter {
  requests = [];
  async *stream(options) {
    const text = JSON.stringify(options.messages);
    this.requests.push(text);
    if (text.includes('WAIT_FOR_CANCEL')) {
      await new Promise(resolveWait => { if (options.signal.aborted) resolveWait(); else options.signal.addEventListener('abort', resolveWait, { once: true }); });
      return;
    }
    const skill = text.includes('EXPERT_ALPHA') ? 'probe-alpha' : text.includes('EXPERT_BETA') ? 'probe-beta' : undefined;
    const hasResult = skill && text.includes(`RESOURCE_${skill.slice(6).toUpperCase()}_V1`);
    const hook = this.teamBlock ?? this.sopBlock;
    const scripted = hasResult && hook ? await hook(options, text) : undefined;
    const block = scripted ?? (skill && !hasResult
      ? { type: 'tool-call', id: `load-${skill}`, name: 'skill', arguments: JSON.stringify({ name: skill }) }
      : { type: 'text', text: 'Deterministic fixture finished.' });
    if (this.requests.length > (sopMode || integrationMode ? 140 : teamMode ? 260 : 45)) throw new Error('Fixture loop exceeded its bound');
    yield { type: 'block-start', index: 0, blockType: block.type };
    yield { type: 'block-end', index: 0, block };
    yield { type: 'finish', reason: { kind: block.type === 'tool-call' ? 'tool-calls' : 'stop' } };
  }
}
const model = new FixtureModel();
const actor = { principalId: 'probe-owner', organizationId: 'probe-org', requestId: 'probe-request', resolvedBy: 'probe-identity' };
const text = value => [{ type: 'text', text: value }];
const signal = AbortSignal.timeout(teamMode ? 240_000 : sopMode || integrationMode ? 120_000 : 60_000);
async function load(name, config) { await ctx.loader.create({ name, ...(config ? { config } : {}) }); }
async function rootAgent(id, preset) {
  const handle = await ctx.agents.create({ sessionId: id, agentOptions: { provider: 'fixture', model: 'fixture', cwd: home },
    meta: { cwd: home, ...(preset ? { agentPreset: preset } : {}) },
    ...(preset ? { setup: agentCtx => ctx.agentPresets.mount(agentCtx, preset).then(() => undefined) } : {}) });
  handles.push(handle); return handle.agent;
}
async function settle(agent) { await Promise.race([agent.whenIdle(), new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Agent idle timeout')), 15_000); timer.unref(); })]); }

try {
  const teamModule = !adapterMode && await archivePackage('@deepseek-ai/dsh-experimental-agent-team');
  const toolModule = !adapterMode && await archivePackage('@deepseek-ai/dsh-experimental-tool-agent-team');
  const { default: Loader } = await import(pathToFileURL(requireDsh.resolve('@deepseek-ai/cordis-plugin-loader')).href);
  await ctx.plugin(Loader, { baseUrl });
  for (const name of ['dsh-session', 'dsh-session-projection', 'dsh-system-prompt', 'dsh-tools', 'dsh-llm', 'dsh-agent', 'dsh-agent-loop', 'dsh-subagent', 'dsh-invariants']) await load(`@deepseek-ai/${name}`);
  await load('@deepseek-ai/dsh-session-persistence-jsonl', { root: join(home, 'sessions'), compression: 'none' });
  await load('@deepseek-ai/dsh-session-query');
  await load('@deepseek-ai/dsh-subagent-spawn-in-process', { providerName: 'probe-spawn' });
  ctx.llm.registerAdapter(['fixture'], model);
  if (!adapterMode) {
  await load(teamModule, { maxMembers: 8, disposalTimeoutMs: 4000 });
  await load(toolModule);
  assert.ok(ctx.agentTeams); assert.ok(ctx.subagents.getProvider('probe-spawn'));
  pass('published-team-service-and-tool-loaded', { loaderEntries: [...ctx.loader.entries()].length });
  }
  const lead = await rootAgent('native-lead');
  if (!adapterMode) {
  const spawned = await Promise.all(['alpha', 'beta'].map(name => ctx.agentTeams.spawnTeammate(lead, { name, description: `${name} fixture`, prompt: text('Finish fixture.'), context: 'fresh', provider: 'probe-spawn', signal })));
  const children = spawned.map(result => observedAgents.get(result.member.id));
  assert.ok(children.every(Boolean), JSON.stringify(spawned)); assert.notEqual(children[0].id, children[1].id);
  for (const child of children) { assert.equal(child.session.header.parentSession, lead.id); await settle(child); }
  pass('two-real-native-team-children', { ids: children.map(c => c.id), modelCalls: model.requests.length });
  const first = await ctx.agentTeams.createTask(lead, { subject: 'draft', description: 'fixture draft' });
  const next = await ctx.agentTeams.createTask(lead, { subject: 'reviewed downstream', description: 'fixture downstream', blockedBy: [first.id] });
  await assert.rejects(ctx.agentTeams.updateTask(lead, { taskId: next.id, expectedRevision: next.revision, action: 'claim' }));
  const claimed = await ctx.agentTeams.updateTask(lead, { taskId: first.id, expectedRevision: first.revision, action: 'claim' });
  await ctx.agentTeams.updateTask(lead, { taskId: first.id, expectedRevision: claimed.revision, action: 'complete' });
  await assert.rejects(ctx.agentTeams.updateTask(lead, { taskId: first.id, expectedRevision: first.revision, action: 'reopen' }));
  const downstream = ctx.agentTeams.getTask(lead, next.id);
  assert.equal(downstream.ready, true);
  pass('native-task-dependencies-and-cas', { first: first.id, next: next.id });
  gap('native-task-completion-is-not-professional-acceptance', { downstreamReadyWithoutProfessionalReview: downstream.ready });
  }

  const presetRoot = join(home, 'presets');
  await mkdir(join(presetRoot, 'standard'), { recursive: true });
  await writeFile(join(presetRoot, 'standard', COMPOSITION_FILE), '- name: "@deepseek-ai/dsh-persona"\n  config:\n    prefix: "BASE_FIXTURE"\n- name: "@deepseek-ai/dsh-skill-filesystem"\n  config:\n    includeDefaultRoots: false\n    watch: false\n- name: "@deepseek-ai/dsh-tool-skill"\n');
  for (const name of ['alpha', 'beta']) {
    const dir = join(process.env.DSH_AGENTS_HOME, 'skills', `probe-${name}`);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'SKILL.md'), `---\nname: probe-${name}\ndescription: Fixed ${name} fixture\n---\nRESOURCE_${name.toUpperCase()}_V1\n`);
  }
  for (const [name, config] of [['dsh-storage'], ['dsh-storage-json', { root: join(home, 'storage') }], ['dsh-storage-domain', { backend: 'json' }], ['dsh-skill'], ['dsh-skill-filesystem', { agentsHome: process.env.DSH_AGENTS_HOME, dshHome: process.env.DSH_HOME, watch: false }], ['dsh-agent-presets', { default: 'standard', roots: [{ path: presetRoot, trust: 'user' }], includeShippedRoot: false, includeUserRoot: false }]]) await load(`@deepseek-ai/${name}`, config);
  ctx.provide('workdshIdentity', { id: actor.resolvedBy, async resolve() { return actor; }, membership(org, principal) { return org === actor.organizationId && principal === actor.principalId ? { organizationId: org, principalId: principal, principalKind: 'human', role: 'owner', state: 'active', revision: 'fixture-v1' } : undefined; } });
  for (const plugin of [AuditJournal, AccessManager, SkillManager]) await ctx.plugin(plugin);
  // Test transport seam only: business service creates a REAL native Agent/Session.
  ctx.provide('sessionController', { async inspect(id) { if (!ctx.agents.get(id)) throw Object.assign(new Error('not found'), { code: 'session/not-found' }); return { sessionId: id }; } });
  ctx.provide('workdshSessionAccess', { async create(request) { await rootAgent(request.sessionId, request.agentPreset); return { sessionId: request.sessionId }; } });
  await ctx.plugin(ExpertsManager);
  registerExpertExecutionGuard(ctx);
  const experts = [];
  for (const name of ['alpha', 'beta']) {
    const draft = await ctx.workdshExperts.createDraft(actor, { name: `Probe ${name}`, description: 'Deterministic team binding fixture.', role: `EXPERT_${name.toUpperCase()}`, methodology: 'Load the fixed fixture skill and report.', boundaries: 'Only fixture data.', deliverables: 'Fixture result.', tags: ['probe'], examples: [{ id: 'one', prompt: 'Run fixture.' }], skillRequirements: [{ name: `probe-${name}` }], futureRequirements: [] }, { operationId: `${name}-create` });
    const validation = await ctx.workdshExperts.validate(actor, draft.expertId, draft.revision);
    assert.equal(validation.publishable, true, JSON.stringify(validation.issues));
    const confirmation = await ctx.workdshExperts.requestPublishConfirmation(actor, draft.expertId, draft.revision);
    const proof = await ctx.workdshExperts.confirmPublish(actor, confirmation.confirmationToken);
    await ctx.workdshExperts.publish(actor, draft.expertId, draft.revision, validation.dependencyLockDigest, proof, { operationId: `${name}-publish` });
    await writeFile(join(process.env.DSH_AGENTS_HOME, 'skills', `probe-${name}`, 'SKILL.md'), `---\nname: probe-${name}\ndescription: Changed dynamic fixture\n---\nRESOURCE_${name.toUpperCase()}_CHANGED\n`);
    const plan = await ctx.workdshExperts.prepareExecution(actor, draft.expertId, undefined, home, undefined, 'Run fixture.');
    const created = await ctx.workdshExperts.createExecution(actor, plan.executionPlanId, { operationId: `${name}-execute` });
    const agent = ctx.agents.get(created.sessionId);
    agent.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: text('Load your fixture skill.') }));
    await settle(agent);
    assert.notEqual(agent.session.snapshotEvents().filter(e => e.type === 'turn/end').at(-1)?.data.reason.kind, 'error');
    const requestText = model.requests.join('\n');
    if (!requestText.includes(`RESOURCE_${name.toUpperCase()}_V1`)) await writeFile(join(artifacts, 'failed-agent-events.json'), JSON.stringify(agent.session.snapshotEvents(), null, 2));
    assert.ok(requestText.includes(`RESOURCE_${name.toUpperCase()}_V1`), 'Fixed resource absent; see failed-agent-events.json');
    assert.ok(!requestText.includes(`RESOURCE_${name.toUpperCase()}_CHANGED`), 'Published expert must read its frozen snapshot');
    await ctx.workdshExperts.verifyBinding(actor, agent.id);
    experts.push({ agent, preset: created.binding.presetRevisionRef, ref: created.binding.expertRevisionRef });
  }
  pass('existing-experts-publish-mount-fixed-skills-and-run', { presets: experts.map(e => e.preset) });
  if (!adapterMode) {
  const before = model.requests.length;
  const beforeIds = new Set(observedAgents.keys());
  let admissionError;
  try { await ctx.agentTeams.spawnTeammate(experts[0].agent, { name: 'requested-beta', description: `Use expert ${experts[1].preset}`, prompt: text(`Use expert ${experts[1].preset}.`), context: 'fresh', provider: 'probe-spawn', signal }); }
  catch (error) { admissionError = error.message; }
  const member = [...observedAgents.values()].find(agent => !beforeIds.has(agent.id) && agent.session.header.parentSession === experts[0].agent.id);
  assert.ok(member); await settle(member);
  assert.equal(member.session.header.agentPreset, experts[0].preset);
  await assert.rejects(ctx.workdshExperts.verifyBinding(actor, member.id), error => error.code === 'experts/not-found' && error.details?.reason === 'unbound');
  assert.equal(model.requests.length, before, 'guard must reject before any child model request');
  gap('default-team-child-does-not-bind-requested-expert', { requested: experts[1].preset, actual: member.session.header.agentPreset, ownBinding: 'missing', childModelRequests: 0, admissionError });

  // Factory registration is a single native owner, not an interception middleware.
  assert.throws(() => ctx.agents.setFactory({ createAgent: () => { throw new Error('must not run'); }, resume: () => { throw new Error('must not run'); } }));
  pass('native-factory-cannot-be-overwritten-by-feature-plugin', { implication: 'No factory replacement workaround' });

  // One-shot caller inputs do not resolve another expert either.
  const oneShot = await ctx.subagents.start('probe-spawn', { parent: experts[0].agent, prompt: text('Load beta skill.'), persona: 'EXPERT_BETA', signal });
  const oneShotResult = await oneShot.result;
  assert.equal(oneShotResult.stopReason, 'error');
  assert.equal(observedAgents.get(oneShot.id).session.header.agentPreset, experts[0].preset);
  await oneShot.dispose();
  gap('stock-one-shot-plus-persona-also-lacks-expert-binding', { stopReason: oneShotResult.stopReason, actualPreset: observedAgents.get(oneShot.id).session.header.agentPreset });

  // Public creation setup can choose B before publication; it still needs a
  // domain-owned delegation binding. This is not a workflow-provider pass.
  const explicit = await ctx.agents.create({ sessionId: 'explicit-member-setup', parentAgent: experts[0].agent,
    meta: { cwd: home, parentSession: experts[0].agent.id, origin: 'subagent', delegationDepth: 1, agentPreset: experts[1].preset },
    agentOptions: { provider: 'fixture', model: 'fixture', cwd: home },
    setup: agentCtx => ctx.agentPresets.mount(agentCtx, experts[1].preset).then(() => undefined) });
  handles.push(explicit);
  assert.equal(explicit.agent.session.header.agentPreset, experts[1].preset);
  const callsBeforeExplicit = model.requests.length;
  explicit.agent.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: text('Load fixture.') }));
  await settle(explicit.agent);
  await assert.rejects(ctx.workdshExperts.verifyBinding(actor, explicit.agent.id), error => error.details?.reason === 'unbound');
  assert.equal(model.requests.length, callsBeforeExplicit);
  pass('public-agent-setup-selects-member-preset-before-publication', { preset: experts[1].preset, businessBinding: 'still required', workflowProviderVerified: false });
  }

  if (sopMode) {
    await runSopProbe({ ctx, actor, experts, model, load, signal, pass, report, settle, observedAgents });
  }
  if (integrationMode) {
    await runIntegrationProbe({ ctx, actor, experts, model, load, signal, pass, gap, report, settle, observedAgents, home, root });
  } else if (teamMode) {
    await runProductionProbe({ ctx, actor, experts, model, load, signal, pass, report, settle, observedAgents, home });
  } else if (adapterMode && !sopMode) {
    for (const name of ['@deepseek-ai/dsh-agent', '@deepseek-ai/dsh-subagent', '@deepseek-ai/dsh-agent-presets']) {
      const installed = JSON.parse(await readFile(join(resolvePackage(name), 'package.json'), 'utf8'));
      assert.equal(installed.version, version);
      report.packages.push({ name, version: installed.version, source: 'locked-installed-package' });
    }
    const provider = registerExpertDelegationProvider(ctx);
    const parent = experts[0].agent;
    const reserve = operationId => ctx.workdshExperts.reserveDelegation(actor, parent.id, experts[1].ref, { operationId }, signal);
    const binding = await reserve('adapter-beta');
    assert.deepEqual(await reserve('adapter-beta'), binding);
    await assert.rejects(ctx.workdshExperts.verifyBinding(actor, binding.sessionId), error => error.code === 'experts/conflict');
    await assert.rejects(ctx.subagents.start(provider, { parent: experts[1].agent, prompt: text('Wrong parent'), label: binding.sessionId, signal }));
    const beforeAdapter = model.requests.length;
    const run = await ctx.subagents.start(provider, { parent, prompt: text('ADAPTER_MEMBER_B: Load your fixture skill.'), label: binding.sessionId, signal });
    let alphaRun;
    try {
      const alphaBinding = await ctx.workdshExperts.reserveDelegation(actor, parent.id, experts[0].ref, { operationId: 'adapter-alpha' }, signal);
      alphaRun = await ctx.subagents.start(provider, { parent, prompt: text('ADAPTER_MEMBER_A: Load your fixture skill.'), label: alphaBinding.sessionId, signal });
      assert.notEqual(alphaRun.id, run.id);
      assert.equal(alphaRun.localAgent.session.header.parentSession, parent.id);
      assert.equal(alphaRun.localAgent.session.header.agentPreset, experts[0].preset);
      assert.equal((await alphaRun.result).stopReason, 'completed');
      await ctx.workdshExperts.verifyBinding(actor, alphaRun.id);
      assert.equal(run.localAgent.session.header.parentSession, parent.id);
      assert.equal(run.localAgent.session.header.agentPreset, experts[1].preset);
      const own = await ctx.workdshExperts.verifyBinding(actor, run.id);
      assert.equal(own.delegation.admission, 'claimed');
      const adapterResult = await run.result;
      if (adapterResult.stopReason !== 'completed') await writeFile(join(artifacts, 'adapter-failed-events.json'), JSON.stringify(run.localAgent.session.snapshotEvents(), null, 2));
      assert.equal(adapterResult.stopReason, 'completed');
      const requests = model.requests.slice(beforeAdapter).filter(r => r.includes('ADAPTER_MEMBER_B')).join('\n');
      assert.ok(requests.includes('RESOURCE_BETA_V1'));
      assert.ok(!requests.includes('EXPERT_ALPHA') && !requests.includes('RESOURCE_BETA_CHANGED'));
      const alphaRequests = model.requests.slice(beforeAdapter).filter(r => r.includes('ADAPTER_MEMBER_A')).join('\n');
      assert.ok(alphaRequests.includes('RESOURCE_ALPHA_V1'));
      assert.ok(!alphaRequests.includes('EXPERT_BETA') && !alphaRequests.includes('RESOURCE_ALPHA_CHANGED'));
      assert.equal(run.localAgent.session.snapshotEvents().filter(e => e.type === 'subagent/descriptor').length, 1);
      await assert.rejects(ctx.subagents.start(provider, { parent, prompt: text('Duplicate'), label: binding.sessionId, signal }));
      pass('adapter-two-children-run-distinct-experts-and-frozen-skills', { ids: [alphaRun.id, run.id], presets: [alphaBinding.presetRevisionRef, own.presetRevisionRef], ownBindings: true, modelCalls: model.requests.length - beforeAdapter });
    } finally { await Promise.all([run.dispose(), alphaRun?.dispose()]); }
    assert.equal(ctx.agents.get(run.id), undefined);
    await assert.rejects(ctx.subagents.start(provider, { parent, prompt: text('Replay disposed'), label: binding.sessionId, signal }));
    await assert.rejects(ctx.subagents.start(provider, { parent, prompt: text('Change persona'), persona: 'EXPERT_ALPHA', signal }));
    await assert.rejects(ctx.subagents.startContinuable({ provider, label: binding.sessionId, request: { parent, prompt: text('Unsupported continuation') }, signal }));
    const early = await reserve('adapter-early-cancel');
    const earlyAbort = new AbortController();
    const callsBeforeEarly = model.requests.length;
    const off = ctx.on('agent/created', ({ agent }) => { if (agent.id === early.sessionId) earlyAbort.abort(); });
    try {
      await assert.rejects(ctx.subagents.start(provider, { parent, prompt: text('Must not run'), label: early.sessionId, signal: earlyAbort.signal }));
    } finally { off(); }
    assert.equal(ctx.agents.get(early.sessionId), undefined);
    assert.equal(model.requests.length, callsBeforeEarly);
    await assert.rejects(ctx.subagents.start(provider, { parent, prompt: text('Must not replay'), label: early.sessionId, signal }));
    pass('adapter-abort-before-handoff-cleans-agent-without-model-call', { id: early.sessionId, automaticallyRetried: false });
    const cancelledBinding = await reserve('adapter-cancel');
    const keptBinding = await reserve('adapter-keep');
    const abort = new AbortController();
    const cancelled = await ctx.subagents.start(provider, { parent, prompt: text('WAIT_FOR_CANCEL'), label: cancelledBinding.sessionId, signal: abort.signal });
    const kept = await ctx.subagents.start(provider, { parent, prompt: text('WAIT_FOR_CANCEL'), label: keptBinding.sessionId, signal });
    try {
      // Wait for both actual model requests, not merely allocated handles.
      await Promise.race([new Promise(resolveWait => {
        const timer = setInterval(() => {
          if (model.requests.filter(r => r.includes('WAIT_FOR_CANCEL')).length >= 2) { clearInterval(timer); resolveWait(); }
        }, 5);
        signal.addEventListener('abort', () => clearInterval(timer), { once: true });
      }), new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('Cancellation fixture timeout')), { once: true }))]);
      abort.abort();
      assert.equal((await cancelled.result).stopReason, 'aborted');
      await cancelled.dispose();
      assert.equal(ctx.agents.get(cancelled.id), undefined);
      assert.equal(ctx.agents.get(kept.id), kept.localAgent);
      assert.equal(kept.localAgent.status, 'running');
      pass('adapter-cancellation-stops-real-child-and-preserves-sibling', { cancelled: cancelled.id, kept: kept.id });
    } finally { await Promise.all([cancelled.dispose(), kept.dispose()]); }
    report.minimalAdapterReady = true;
  }

  if (!adapterMode) {
  const active = await ctx.agentTeams.spawnTeammate(lead, { name: 'active-cancel', description: 'cancellation fixture', prompt: text('WAIT_FOR_CANCEL'), context: 'fresh', provider: 'probe-spawn', signal });
  const unrelated = await ctx.subagents.startContinuable({ provider: 'probe-spawn', label: 'unrelated', request: { parent: lead, prompt: text('WAIT_FOR_CANCEL') }, signal });
  assert.ok(ctx.agents.get(active.member.id)); assert.ok(ctx.agents.get(unrelated.childId));
  await ctx.subagents.drainContinuableChildren(lead, [active.member.id]);
  assert.equal(ctx.agents.get(active.member.id), undefined);
  assert.ok(ctx.agents.get(unrelated.childId));
  pass('active-member-cleanup-preserves-unrelated-live-child', { cancelled: active.member.id, unrelated: unrelated.childId });
  await ctx.subagents.drainContinuableChildren(lead, [unrelated.childId]);
  }
  await ctx.sessionPersistence.flush();
  assert.ok((await ctx.sessionPersistence.list()).length >= 6);
  pass('native-session-facts-persist', { sessions: (await ctx.sessionPersistence.list()).length });
  if (!integrationMode && !teamMode) report.limitations.push('Cold execution resume and cancellation during external writes not executed.');
  report.limitations.push('One-shot and Agent Teams are separate probe compositions; no claim that the adapter fixes continuable Team members.', 'Identity and Session creation transport are fixture adapters; standard is a minimal preset fixture, not the complete production Profile/E2E authorization test.');
} catch (error) {
  report.error = { message: error.message, stack: error.stack };
  process.exitCode = 1;
  console.error(error.stack);
} finally {
  try {
    for (const handle of handles.reverse()) await handle.dispose();
    await ctx.fiber.dispose();
    report.cleanup = 'disposed';
    if (!report.error) {
      const cold = spawnSync(process.execPath, ['--input-type=module', '-e', `
        import { Context } from '@deepseek-ai/cordis';
        import assert from 'node:assert/strict';
        import Persistence from '@deepseek-ai/dsh-session-persistence-jsonl';
        const ctx = new Context();
        try {
          await ctx.plugin(Persistence, { root: process.argv[1], compression: 'none' });
          let sopRestored;
          let integrationRestored;
          let teamRestored;
          if (process.argv[3] === 'sop') {
            const [{ default: Storage }, JsonStorage, Domain, { z }, policy] = await Promise.all([
              import('@deepseek-ai/dsh-storage'), import('@deepseek-ai/dsh-storage-json'),
              import('@deepseek-ai/dsh-storage-domain'), import('zod'),
              import('./packages/plugins/experts/dist/domain/team-sop.js'),
            ]);
            await ctx.plugin(Storage);
            await ctx.plugin(JsonStorage, { root: process.argv[2] });
            await ctx.plugin(Domain, { backend: 'json' });
            const domain = await ctx.storageDomain.open(Domain.defineDomain({ name: 'workdsh_sop_probe', version: 1, layout: 'per-record',
              tables: { cases: Domain.domainTable(z.object({ json: z.string() })) } }));
            try {
              const table = domain.table('cases');
              const main = JSON.parse((await table.get('main')).json);
              const bounded = JSON.parse((await table.get('bounded')).json);
              const cancelled = JSON.parse((await table.get('cancelled')).json);
              assert.equal(main.attempts.draft.at(-1).decision.verdict, 'accepted');
              assert.equal(main.attempts.publish[0].inputs.draft, main.attempts.draft.at(-1).output.digest);
              assert.throws(() => policy.admitSopWork(bounded, bounded.revision, 'draft', 'cold-retry'), /attempt-limit/);
              assert.throws(() => policy.finalizeSopReview(cancelled, cancelled.revision, 'draft', main.attempts.draft.at(-1).decision.receipt), /review-not-finalizable/);
              sopRestored = { acceptedVersionPreserved: true, spentBudgetPreserved: true, cancelledReviewStillRejected: true, executionResumed: false };
            } finally { await domain.close(); }
          }
          if (process.argv[3] === 'integration') {
            const [{ default: Storage }, JsonStorage, Domain, { z }, policy, { readFile }, { createHash }] = await Promise.all([
              import('@deepseek-ai/dsh-storage'), import('@deepseek-ai/dsh-storage-json'),
              import('@deepseek-ai/dsh-storage-domain'), import('zod'),
              import('./packages/plugins/experts/dist/domain/team-sop.js'),
              import('node:fs/promises'), import('node:crypto'),
            ]);
            await ctx.plugin(Storage);
            await ctx.plugin(JsonStorage, { root: process.argv[2] });
            await ctx.plugin(Domain, { backend: 'json' });
            const domain = await ctx.storageDomain.open(Domain.defineDomain({ name: 'workdsh_integration_probe', version: 1, layout: 'per-record',
              tables: { cases: Domain.domainTable(z.object({ json: z.string() })) } }));
            try {
              const table = domain.table('cases');
              const sha = bytes => createHash('sha256').update(bytes).digest('hex');
              const artifact = JSON.parse((await table.get('artifact')).json);
              const draft = artifact.attempts.draft.at(-1);
              const publish = artifact.attempts.publish.at(-1);
              assert.equal(draft.decision.verdict, 'accepted');
              assert.equal(publish.output.artifacts[0].sha256, draft.output.artifacts[0].sha256);
              const reRead = async pins => Promise.all(pins.map(async pin => {
                const bytes = await readFile(pin.path);
                return { path: pin.path, sha256: sha(bytes), byteLength: bytes.byteLength };
              }));
              const draftBytes = await reRead([...(draft.output.artifacts ?? []), ...(draft.decision.receipt.artifacts ?? [])]);
              policy.verifySopArtifacts(artifact, artifact.revision, 'draft', draftBytes);
              policy.verifySopArtifacts(artifact, artifact.revision, 'publish', await reRead([...(publish.output.artifacts ?? []), ...(publish.decision?.receipt.artifacts ?? [])]));
              assert.throws(() => policy.verifySopArtifacts(artifact, artifact.revision, 'draft', draftBytes.map((pin, index) => index === 0 ? { ...pin, sha256: 'f'.repeat(64) } : pin)), /stale-artifact/);
              const interrupted = JSON.parse((await table.get('interrupt')).json);
              assert.equal(interrupted.attempts.draft.length, 2);
              assert.ok(interrupted.attempts.draft[0].abandoned && !interrupted.attempts.draft[0].output);
              assert.equal(interrupted.attempts.draft.at(-1).decision.verdict, 'accepted');
              const reconcile = JSON.parse((await table.get('reconcile')).json);
              assert.ok(reconcile.attempts.draft.at(-1).output);
              assert.equal(reconcile.attempts.draft.at(-1).decision, undefined);
              integrationRestored = { draftAccepted: true, handoffSameBytes: true, pinnedBytesReRead: true, tamperRejected: true, cancelledAttemptAbandoned: true, freshAttemptAccepted: true, reconcileRecordedOnce: true, executionResumed: false };
            } finally { await domain.close(); }
          }
          if (process.argv[3] === 'team') {
            const [{ default: Storage }, JsonStorage, Domain, { z }, teamDomain, { readFile: read }, { createHash: hashBytes }] = await Promise.all([
              import('@deepseek-ai/dsh-storage'), import('@deepseek-ai/dsh-storage-json'),
              import('@deepseek-ai/dsh-storage-domain'), import('zod'),
              import('./packages/plugins/experts/dist/storage/team-domain.js'),
              import('node:fs/promises'), import('node:crypto'),
            ]);
            await ctx.plugin(Storage);
            await ctx.plugin(JsonStorage, { root: process.argv[2] });
            await ctx.plugin(Domain, { backend: 'json' });
            const domain = await ctx.storageDomain.open(teamDomain.teamDomainSpec);
            try {
              const sha = bytes => hashBytes('sha256').update(bytes).digest('hex');
              const runs = [...domain.table('runs').entries()].map(([, run]) => run);
              let delivered = 0;
              let abandonedRuns = 0;
              let deliveryArtifactMatch = true;
              for (const run of runs) {
                if (run.delivery) {
                  delivered++;
                  const accepted = new Map();
                  for (const stage of run.state.plan.stages) {
                    const attempt = run.state.attempts[stage.id]?.at(-1);
                    if (!attempt) continue;
                    for (const pin of [...(attempt.output?.artifacts ?? []), ...(attempt.decision?.receipt.artifacts ?? [])]) accepted.set(pin.path, pin);
                  }
                  for (const pin of run.delivery.artifacts) {
                    const recorded = accepted.get(pin.path);
                    if (!recorded || recorded.sha256 !== pin.sha256 || recorded.byteLength !== pin.byteLength) deliveryArtifactMatch = false;
                    const bytes = await read(pin.path);
                    if (sha(bytes) !== pin.sha256 || bytes.byteLength !== pin.byteLength) deliveryArtifactMatch = false;
                  }
                }
                if (Object.values(run.state.attempts).flat().some(attempt => attempt.abandoned)) abandonedRuns++;
              }
              assert.equal(runs.length, 4);
              const direct = runs.find(run => run.state.plan.stages.length === 1 && run.state.plan.stages[0].id === 'answer');
              assert.equal(direct.state.attempts.answer[0].decision.verdict, 'accepted');
              assert.equal(direct.state.attempts.answer[0].reviewSessionId, undefined);
              assert.equal(delivered, 2);
              assert.equal(abandonedRuns, 2);
              assert.equal(deliveryArtifactMatch, true, 'delivered bytes must equal the accepted version on disk');
              teamRestored = { runs: runs.length, delivered, abandonedRuns, deliveryArtifactMatch, executionResumed: false };
            } finally { await domain.close(); }
          }
          const sessions = await ctx.sessionPersistence.list();
          let expertChildren = 0;
          for (const row of sessions) {
            const read = await ctx.sessionPersistence.open(row.header.id, 'read');
            try {
              const child = await read.read();
              if (row.header.id.startsWith('delegation-') && child.events.some(e => e.type === 'subagent/descriptor' && e.data.mode === 'one-shot')) expertChildren++;
            } finally { await read.close(); }
          }
          const handle = await ctx.sessionPersistence.open('native-lead', 'read');
          try {
            const { events } = await handle.read();
            console.log(JSON.stringify({ sessions: sessions.length, expertChildren, members: events.filter(e => e.type === 'team/member').length, tasks: events.filter(e => e.type === 'team/task').length, sopRestored, integrationRestored, teamRestored }));
          } finally { await handle.close(); }
        } finally { await ctx.fiber.dispose(); }
      `, join(home, 'sessions'), join(home, 'storage'), sopMode ? 'sop' : integrationMode ? 'integration' : teamMode ? 'team' : ''], { cwd: root, encoding: 'utf8', timeout: 15_000 });
      assert.equal(cold.status, 0, cold.stderr);
      const history = JSON.parse(cold.stdout.trim());
      assert.ok(history.sessions >= 6);
      if (sopMode) assert.equal(history.expertChildren, report.sopNativeChildren);
      else if (integrationMode) assert.equal(history.expertChildren, report.integrationNativeChildren);
      else if (teamMode) {
        assert.equal(history.expertChildren, report.teamNativeChildren);
        assert.equal(history.teamRestored?.deliveryArtifactMatch, true, 'cold read must reproduce delivered==accepted bytes');
        assert.equal(history.teamRestored?.abandonedRuns, 2);
      }
      else if (adapterMode) assert.equal(history.expertChildren, 4);
      else assert.ok(history.members >= 2 && history.tasks >= 2);
      pass('separate-process-reads-persisted-child-history', history);
    }
  }
  catch (error) { report.cleanup = error.message; report.integrationReady = false; process.exitCode = 1; }
  for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  report.integrationReady ??= false;
  report.teamReady ??= false;
  report.outcome = report.error || process.exitCode === 1 ? 'probe-error' : report.sopPolicyReady ? 'sop-policy-verified' : report.integrationReady ? 'expert-integration-verified' : report.teamReady ? 'expert-team-verified' : report.minimalAdapterReady ? 'one-shot-adapter-verified' : 'default-integration-blocked';
  if (!process.exitCode && !report.minimalAdapterReady && !report.sopPolicyReady && !report.integrationReady && !report.teamReady) process.exitCode = 2;
  await writeFile(join(artifacts, sopMode ? 'sop-result.json' : integrationMode ? 'integration-result.json' : teamMode ? 'team-result.json' : process.argv.includes('--adapter') ? 'adapter-result.json' : 'result.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`RESULT ${report.outcome}; integrationReady=${report.integrationReady}`);
}
