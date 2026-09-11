import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createMessage, Context, Agents, AgentLoop, Sessions, Projections, SystemPrompt, Tools, Llm, Skills, filesystem, skillTool, SkillRequestAdapter } from '../helpers/skill-runtime.mjs';

for (const allowed of [true, false]) {
test(`official Session skill consumption: model invocation ${allowed ? 'allowed' : 'denied'}`, { timeout: 15000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'workdsh-session-skill-'));
  const ctx = new Context();
  let handle;
  try {
    await mkdir(join(root, 'sample'));
    await writeFile(join(root, 'sample/SKILL.md'), `---\nname: sample\ndescription: Session skill fixture\ndisable-model-invocation: ${!allowed}\n---\nSESSION_BODY_SENTINEL\n`);
    for (const plugin of [Sessions, Projections, SystemPrompt, Tools, Llm, Agents, Skills, AgentLoop]) await ctx.plugin(plugin);
    const adapter = new SkillRequestAdapter();
    ctx.llm.registerAdapter(['workdsh-test'], adapter);
    handle = await ctx.agents.create({
      sessionId: randomUUID(),
      agentOptions: { provider: 'workdsh-test', model: 'fixed', cwd: root },
      setup: async agentCtx => {
        await agentCtx.plugin(filesystem, { includeDefaultRoots: false, customSkillDirs: [root], watch: false });
        await agentCtx.plugin(skillTool);
      },
    });
    handle.agent.followup(createMessage({ role: 'user', content: [{ type: 'text', text: 'Load the sample skill.' }], source: { kind: 'user' } }));
    await handle.agent.whenIdle();
    const events = handle.agent.session.snapshotEvents();
    assert.equal(adapter.requests.length, 2, JSON.stringify(events));
    const first = JSON.stringify(adapter.requests[0]);
    const second = JSON.stringify(adapter.requests[1]);
    assert.ok(adapter.schemas[0].some(tool => tool.name === 'skill'));
    assert.equal(first.includes('SESSION_BODY_SENTINEL'), false);
    const results = adapter.requests[1].flatMap(message => message.content).filter(block => block.type === 'tool-result');
    assert.equal(results.length, 1);
    assert.equal(results[0].toolCallId, 'skill-probe-call');
    if (allowed) {
      assert.match(first, /available_skills/);
      assert.match(first, /Session skill fixture/);
      assert.notEqual(results[0].isError, true);
      assert.match(JSON.stringify(results[0]), /SESSION_BODY_SENTINEL/);
      assert.match(second, /skill_content/);
      assert.match(JSON.stringify(events), /skill-catalog/);
      assert.match(JSON.stringify(events), /SESSION_BODY_SENTINEL/);
    } else {
      assert.equal(first.includes('Session skill fixture'), false);
      assert.equal(second.includes('SESSION_BODY_SENTINEL'), false);
      assert.equal(JSON.stringify(events).includes('SESSION_BODY_SENTINEL'), false);
      assert.equal(results[0].isError, true);
      assert.match(JSON.stringify(results[0]), /not available for model invocation/);
    }
    assert.match(JSON.stringify(events), /skill-probe-call/);
  } finally {
    await handle?.dispose();
    await ctx.fiber.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
}
