// Installed only in a disposable probe Profile. Production owns every service
// below; this fixture substitutes model I/O and exposes local test orchestration.
import { LlmAdapter, createMessage } from '@deepseek-ai/dsh-llm';
import assert from 'node:assert/strict';
export const inject = ['connection', 'llm', 'agents', 'agentTeams', 'sessionController', 'sessionPersistence', 'workdshSessionAccess', 'workdshExperts', 'workdshIdentity'];
const blocks = text => [{ type: 'text', text }];
export function apply(ctx) {
  const requests = [];
  class Model extends LlmAdapter {
    async listModels(provider) { return [{ provider, id: 'fixture', name: 'Isolated Team fixture' }]; }
    async *stream(options) {
      const agent = ctx.agents.currentInitiator();
      const member = ctx.agentTeams.tryMembership(agent);
      const system = JSON.stringify(options.messages.filter(m => m.role === 'system'));
      const all = JSON.stringify(options.messages);
      const latest = JSON.stringify(options.messages.at(-1));
      if (all.includes('WEB_HOLD_MEMBER')) await new Promise(resolve => setTimeout(resolve, 20000));
      if (all.includes('WEB_HANDOFF')) await new Promise(resolve => setTimeout(resolve, 8000));
      if (member?.role === 'teammate') assert.ok(system.includes(`ROLE_${member.name.toUpperCase()}`), 'member role must come from its published asset');
      requests.push({ id: agent.id, name: member?.name });
      assert.ok(requests.length < 30, 'bounded fixture requests');
      if (latest.includes('WEB_FAIL_ONCE')) throw new Error('WEB_FIXTURE_MEMBER_FAILURE');
      let block;
      if (member?.role === 'lead' && all.includes('WEB_SPAWN_ANALYST') && !all.includes('"name":"spawn_teammate"')) {
        block = { type: 'tool-call', id: `spawn-${requests.length}`, name: 'spawn_teammate', arguments: JSON.stringify({ name: 'analyst', description: 'Fixture analyst', prompt: 'Read your method and verify the fixture.', context: 'fresh' }) };
      } else if (member?.role === 'teammate' && !all.includes(`METHOD_${member.name.toUpperCase()}`)) {
        block = { type: 'tool-call', id: `skill-${requests.length}`, name: 'skill', arguments: JSON.stringify({ name: `method-${member.name}` }) };
      } else block = { type: 'text', text: `${member?.name ?? 'lead'}：官方 Team 隔离验证完成。` };
      yield { type: 'block-start', index: 0, blockType: block.type };
      yield { type: 'block-end', index: 0, block };
      yield { type: 'finish', reason: { kind: block.type === 'tool-call' ? 'tool-calls' : 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['native-team-fixture'], new Model());
  const definition = name => ({ name, description: '官方 Team 隔离验证配置', role: `ROLE_${name.toUpperCase()}`, methodology: 'Inspect the supplied fixture.', boundaries: 'Synthetic data only.', deliverables: 'A fixture result.', tags: [], examples: [{ id: 'one', prompt: 'Verify native Team.' }], skillRequirements: name === 'lead' ? [] : [{ name: `method-${name}` }], futureRequirements: [] });
  const waitFor = async test => {
    const stop = AbortSignal.timeout(15000);
    while (!await test()) { stop.throwIfAborted(); await new Promise(r => setTimeout(r, 30)); }
  };
  const history = async id => { const handle = await ctx.sessionPersistence.open(id, 'read'); try { return await handle.read(); } finally { await handle.close(); } };
  const settle = async id => {
    await waitFor(() => requests.some(r => r.id === id));
    await waitFor(async () => (await history(id)).events.some(e => e.type === 'turn/end'));
    assert.equal((await history(id)).events.filter(e => e.type === 'turn/end').at(-1).data.reason.kind, 'completed');
  };
  ctx.effect(() => ctx.connection.fetch.register({ path: '/api/native-team-probe', methods: ['POST'], requestBody: 'buffered', async fetch(request) {
    let stage = 'request';
    try {
      const input = await request.json();
      let value;
      if (input.action === 'create') {
        stage = 'identity';
        const actor = await ctx.workdshIdentity.resolve({}, request.signal);
        stage = 'draft';
        const draft = await ctx.workdshExperts.createDraft(actor, { ...definition('lead'), team: { members: ['analyst', 'reviewer'].map(key => ({ key, definition: definition(key) })), workflows: [{ id: 'report', title: '测试报告', trigger: '核对测试数据', deliverable: '测试结论', stages: [{ id: 'draft', worker: 'analyst', reviewer: 'reviewer', dependsOn: [] }] }] } }, { operationId: 'web-team-create' });
        stage = 'validate';
        const validation = await ctx.workdshExperts.validate(actor, draft.expertId, draft.revision);
        assert.ok(validation.publishable, JSON.stringify(validation.issues));
        const confirmation = await ctx.workdshExperts.requestPublishConfirmation(actor, draft.expertId, draft.revision);
        const proof = await ctx.workdshExperts.confirmPublish(actor, confirmation.confirmationToken);
        await ctx.workdshExperts.publish(actor, draft.expertId, draft.revision, validation.dependencyLockDigest, proof, { operationId: 'web-team-publish' });
        stage = 'prepare-execution';
        const plan = await ctx.workdshExperts.prepareExecution(actor, draft.expertId, undefined, input.cwd, undefined, undefined, request.signal, input.workspaceId);
        stage = 'create-execution';
        const execution = await ctx.workdshExperts.createExecution(actor, plan.executionPlanId, { operationId: 'web-team-execution' });
        await ctx.sessionController.selectModel({ sessionId: execution.sessionId, provider: 'native-team-fixture', model: 'fixture' });
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(execution.sessionId, request.signal);
        assert.ok(agent);
        agent.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: blocks('WEB_SPAWN_ANALYST：用官方 Team 处理本次隔离验证。') }));
        stage = 'settle-lead';
        await settle(agent.id);
        const analyst = ctx.agentTeams.listMembers(agent).find(m => m.name === 'analyst');
        assert.ok(analyst, 'real model tool call created analyst'); stage = 'settle-analyst'; await settle(analyst.id);
        assert.ok((await history(agent.id)).events.some(e => e.type === 'tool/call' && e.data.name === 'spawn_teammate'));
        for (const name of ['reviewer']) {
          stage = `spawn-${name}`;
          const result = await ctx.agentTeams.spawnTeammate(agent, { name, description: name, prompt: blocks('Verify the supplied fixture.'), provider: 'spawn', context: 'fresh', signal: request.signal });
          stage = `settle-${name}`;
          await settle(result.member.id);
        }
        const draftTask = await ctx.agentTeams.createTask(agent, { subject: '核对测试数据', description: '实际官方任务', writeScopes: ['fixture/report.md'] });
        await ctx.agentTeams.createTask(agent, { subject: '复核测试结论', description: '依赖前一个任务', blockedBy: [draftTask.id] });
        value = { sessionId: agent.id, view: ctx.agentTeams.remoteView(agent), requests };
      } else if (input.action === 'view') {
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(input.sessionId, request.signal);
        assert.ok(agent); value = ctx.agentTeams.remoteView(agent);
      } else if (input.action === 'begin-long-task') {
        stage = 'resolve-resumed-team';
        const before = (await history(input.memberId)).events.filter(e => e.type === 'turn/end').length;
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(input.sessionId, request.signal);
        assert.ok(agent);
        stage = 'assign-long-task';
        const created = await ctx.agentTeams.createTask(agent, { subject: '长任务与重连验收', description: '运行中刷新浏览器后，成员与任务归属必须保持可见。', writeScopes: ['fixture/long-report.md'] });
        const task = await ctx.agentTeams.updateTask(agent, { taskId: created.id, expectedRevision: created.revision, action: 'reassign', owner: input.memberName });
        stage = 'continue-resumed-member';
        const delivered = await ctx.agentTeams.sendMessage(agent, { target: input.memberName, content: blocks('WEB_HOLD_MEMBER：冷恢复后继续官方 Team 成员任务。'), signal: request.signal });
        assert.ok(['accepted', 'queued'].includes(delivered.status));
        value = { memberId: input.memberId, before, task };
      } else if (input.action === 'wait-member') {
        stage = 'wait-resumed-member';
        await waitFor(async () => (await history(input.memberId)).events.filter(e => e.type === 'turn/end').length > input.before);
        const latest = (await history(input.memberId)).events.filter(e => e.type === 'turn/end').at(-1);
        assert.equal(latest.data.reason.kind, 'completed');
        value = { memberId: input.memberId, completed: true };
      } else if (input.action === 'complete-task') {
        stage = 'complete-member-task';
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(input.sessionId, request.signal);
        assert.ok(agent);
        const task = ctx.agentTeams.getTask(agent, input.taskId);
        assert.equal(task.ownerName, input.memberName, 'Lead may sign off only the expected member-owned task');
        value = await ctx.agentTeams.updateTask(agent, { taskId: task.id, expectedRevision: task.revision, action: 'complete' });
      } else if (input.action === 'begin-handoff') {
        stage = 'resolve-handoff-team';
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(input.sessionId, request.signal);
        assert.ok(agent);
        const members = ctx.agentTeams.listMembers(agent);
        assert.ok(members.some(member => member.id === input.fromMemberId && member.name === input.fromMemberName));
        assert.ok(members.some(member => member.id === input.toMemberId && member.name === input.toMemberName));
        const before = (await history(input.toMemberId)).events.filter(e => e.type === 'turn/end').length;
        stage = 'assign-handoff-source';
        const created = await ctx.agentTeams.createTask(agent, { subject: '交接复核验收', description: '分析成员交给复核成员继续处理。', writeScopes: ['fixture/handoff-report.md'] });
        const sourceTask = await ctx.agentTeams.updateTask(agent, { taskId: created.id, expectedRevision: created.revision, action: 'reassign', owner: input.fromMemberName });
        stage = 'reassign-handoff-target';
        const task = await ctx.agentTeams.updateTask(agent, { taskId: sourceTask.id, expectedRevision: sourceTask.revision, action: 'reassign', owner: input.toMemberName });
        stage = 'deliver-handoff-summary';
        const delivered = await ctx.agentTeams.sendMessage(agent, { target: input.toMemberName, content: blocks(`WEB_HANDOFF：任务 ${task.id} 已由 ${input.fromMemberName} 交给 ${input.toMemberName}，请复核并继续。`), signal: request.signal });
        value = { before, delivery: delivered.status, task };
      } else if (input.action === 'begin-failure') {
        stage = 'resolve-failure-team';
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(input.sessionId, request.signal);
        assert.ok(agent);
        const member = ctx.agentTeams.listMembers(agent).find(row => row.id === input.memberId && row.name === input.memberName);
        assert.ok(member);
        const before = (await history(input.memberId)).events.filter(e => e.type === 'turn/end').length;
        stage = 'assign-failure-task';
        const created = await ctx.agentTeams.createTask(agent, { subject: '失败恢复验收', description: '成员首次处理失败，重启后由同一成员恢复。', writeScopes: ['fixture/recovery-report.md'] });
        const task = await ctx.agentTeams.updateTask(agent, { taskId: created.id, expectedRevision: created.revision, action: 'reassign', owner: input.memberName });
        stage = 'inject-member-failure';
        const delivered = await ctx.agentTeams.sendMessage(agent, { target: input.memberName, content: blocks('WEB_FAIL_ONCE：本轮确定性失败，任务不得标记完成。'), signal: request.signal });
        assert.ok(['accepted', 'queued'].includes(delivered.status));
        value = { before, task };
      } else if (input.action === 'wait-failure') {
        stage = 'wait-member-failure';
        await waitFor(async () => (await history(input.memberId)).events.filter(e => e.type === 'turn/end').length > input.before);
        const latestEnd = (await history(input.memberId)).events.filter(e => e.type === 'turn/end').at(-1);
        assert.notEqual(latestEnd.data.reason.kind, 'completed');
        value = { memberId: input.memberId, reason: latestEnd.data.reason.kind };
      } else if (input.action === 'recover-failure') {
        stage = 'resolve-failed-team-after-restart';
        const before = (await history(input.memberId)).events.filter(e => e.type === 'turn/end').length;
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(input.sessionId, request.signal);
        assert.ok(agent);
        const member = ctx.agentTeams.listMembers(agent).find(row => row.id === input.memberId && row.name === input.memberName);
        assert.ok(member);
        stage = 'resume-failed-member';
        const delivered = await ctx.agentTeams.sendMessage(agent, { target: input.memberName, content: blocks('WEB_RECOVER_AFTER_FAILURE：沿用原任务归属继续完成。'), signal: request.signal });
        assert.ok(['accepted', 'queued'].includes(delivered.status));
        value = { memberId: input.memberId, before };
      } else throw Error('Unknown probe action');
      return Response.json({ ok: true, value });
    } catch (error) { return Response.json({ ok: false, stage, error: error.stack }); }
  } }));
}
