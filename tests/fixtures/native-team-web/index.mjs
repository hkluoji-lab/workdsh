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
      if (member?.role === 'teammate') assert.ok(system.includes(`ROLE_${member.name.toUpperCase()}`), 'member role must come from its published asset');
      requests.push({ id: agent.id, name: member?.name });
      assert.ok(requests.length < 30, 'bounded fixture requests');
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
    try {
      const input = await request.json();
      let value;
      if (input.action === 'create') {
        const actor = await ctx.workdshIdentity.resolve({}, request.signal);
        const draft = await ctx.workdshExperts.createDraft(actor, { ...definition('lead'), team: { members: ['analyst', 'reviewer'].map(key => ({ key, definition: definition(key) })), workflows: [{ id: 'report', title: '测试报告', trigger: '核对测试数据', deliverable: '测试结论', stages: [{ id: 'draft', worker: 'analyst', reviewer: 'reviewer', dependsOn: [] }] }] } }, { operationId: 'web-team-create' });
        const validation = await ctx.workdshExperts.validate(actor, draft.expertId, draft.revision);
        assert.ok(validation.publishable, JSON.stringify(validation.issues));
        const confirmation = await ctx.workdshExperts.requestPublishConfirmation(actor, draft.expertId, draft.revision);
        const proof = await ctx.workdshExperts.confirmPublish(actor, confirmation.confirmationToken);
        await ctx.workdshExperts.publish(actor, draft.expertId, draft.revision, validation.dependencyLockDigest, proof, { operationId: 'web-team-publish' });
        const plan = await ctx.workdshExperts.prepareExecution(actor, draft.expertId, undefined, input.cwd, undefined, undefined, request.signal, input.workspaceId);
        const execution = await ctx.workdshExperts.createExecution(actor, plan.executionPlanId, { operationId: 'web-team-execution' });
        await ctx.sessionController.selectModel({ sessionId: execution.sessionId, provider: 'native-team-fixture', model: 'fixture' });
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(execution.sessionId, request.signal);
        assert.ok(agent);
        agent.followup(createMessage({ role: 'user', source: { kind: 'user' }, content: blocks('WEB_SPAWN_ANALYST：用官方 Team 处理本次隔离验证。') }));
        await settle(agent.id);
        const analyst = ctx.agentTeams.listMembers(agent).find(m => m.name === 'analyst');
        assert.ok(analyst, 'real model tool call created analyst'); await settle(analyst.id);
        assert.ok((await history(agent.id)).events.some(e => e.type === 'tool/call' && e.data.name === 'spawn_teammate'));
        for (const name of ['reviewer']) {
          const result = await ctx.agentTeams.spawnTeammate(agent, { name, description: name, prompt: blocks('Verify the supplied fixture.'), provider: 'spawn', context: 'fresh', signal: request.signal });
          await settle(result.member.id);
        }
        const draftTask = await ctx.agentTeams.createTask(agent, { subject: '核对测试数据', description: '实际官方任务', writeScopes: ['fixture/report.md'] });
        await ctx.agentTeams.createTask(agent, { subject: '复核测试结论', description: '依赖前一个任务', blockedBy: [draftTask.id] });
        value = { sessionId: agent.id, view: ctx.agentTeams.remoteView(agent), requests };
      } else if (input.action === 'view') {
        const { agent } = await ctx.workdshSessionAccess.resolveAgent(input.sessionId, request.signal);
        assert.ok(agent); value = ctx.agentTeams.remoteView(agent);
      } else throw Error('Unknown probe action');
      return Response.json({ ok: true, value });
    } catch (error) { return Response.json({ ok: false, error: error.stack }); }
  } }));
}
