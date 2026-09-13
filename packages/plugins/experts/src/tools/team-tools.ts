import { waitForDelegation } from '../runtime/delegation-wait.js';
import type {} from '@deepseek-ai/dsh-session-query';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, relative } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
// Load the official Context augmentations this module references (ctx.agents,
// ctx.subagents) the same way the delegation provider does.
import type {} from '@deepseek-ai/dsh-agent';
import { finalAssistantOutput } from '@deepseek-ai/dsh-subagent';
import type { SubagentRun } from '@deepseek-ai/dsh-subagent';
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ActorContext, ExecutionBinding } from 'workdsh-contracts';
import { digestOf, sha256Bytes } from '../domain/digest.js';
import { ExpertsError } from '../domain/values.js';
import type { SopArtifact, SopAttempt, SopReceipt, SopVerdict } from '../domain/team-sop.js';
import type { TeamRun } from '../storage/team-domain.js';

/**
 * Model-facing team delegation tools (TM-01 closing slice).
 *
 * These are the AI-visible half of the team control plane: the host session
 * opens a run, delegates one stage to its member (through the plugin-owned
 * one-shot provider, never a second executor), a reviewer submits a proposal,
 * and the host session settles and delivers. Every call goes through the SAME
 * `ctx.workdshTeamRuns` service as the provider admission port, so SOP
 * ordering, attempt budgets, predecessor acceptance and the three byte gates
 * (sign-off, handoff, delivery) apply no matter which entry the model uses.
 *
 * Receipts are built from the member's native session log: the terminal
 * `turn/end` seq, the final assistant output digest, and the bytes of every
 * file the member wrote or presented. A missing or changed file fails the gate;
 * the model can never assert a version by restating a path.
 */

/** Registry name of the plugin-owned one-shot provider (`delegation-provider.ts`). */
const PROVIDER_NAME = 'workdsh-expert';

const artifactList = {
  type: 'array' as const,
  items: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      path: { type: 'string' as const, required: true as const },
      sha256: { type: 'string' as const, required: true as const },
      byte_length: { type: 'integer' as const, required: true as const },
    },
  },
};

const memberList = {
  type: 'array' as const,
  items: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      key: { type: 'string' as const, required: true as const },
      expert_id: { type: 'string' as const, required: true as const },
      revision_id: { type: 'string' as const, required: true as const },
    },
  },
};

const stageList = {
  type: 'array' as const,
  items: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      id: { type: 'string' as const, required: true as const },
      worker: { type: 'string' as const, required: true as const },
      reviewer: { type: 'string' as const },
      depends_on: { type: 'array' as const, required: true as const, items: { type: 'string' as const } },
      attempts: { type: 'integer' as const, required: true as const },
      phase: { type: 'string' as const, required: true as const, description: '该阶段最新尝试所处阶段。' },
      output_digest: { type: 'string' as const, description: '最新尝试记录的产物摘要；评审者提交结论时原样回传。' },
    },
  },
};

/** Resolve the trusted actor from the calling Session; the model never supplies it. */
async function resolveActor(ctx: Context, exec: ToolRunContext): Promise<ActorContext> {
  const sessionId = exec.agent ? String(exec.agent.id) : undefined;
  return ctx.workdshIdentity.resolve(sessionId === undefined ? undefined : { sessionId }, exec.signal);
}

function requireCallerAgent(exec: ToolRunContext): Agent {
  if (!exec.agent) throw new ExpertsError('experts/unavailable', '该工具只能在会话内调用。');
  return exec.agent;
}

/** Derive a stable idempotency key from the call id so pipeline retries replay instead of duplicating. */
function operationIdOf(exec: ToolRunContext): string {
  return `expert-team-${String(exec.callId)}`;
}

function renderResult(summary: string, value: unknown) {
  return [{ type: 'text' as const, text: `${summary}\n${JSON.stringify(value, null, 2)}` }];
}

function stopText(reason: string): string {
  return reason === 'aborted' ? '被取消' : reason === 'error' ? '执行失败'
    : reason === 'max-tokens' ? '达到输出上限' : reason === 'refusal' ? '被模型拒绝' : reason;
}

/** The member's local session; a run without one cannot produce a native receipt. */
function localSession(run: SubagentRun) {
  if (!run.localAgent) throw new ExpertsError('experts/conflict', '成员任务没有本地会话，不能生成产物回执。', { reason: 'no-local-agent' });
  return run.localAgent.session;
}

/** Absolute paths of every file the member wrote or presented, read back from its native log. */
function pinnedPaths(run: SubagentRun): string[] {
  const paths = new Set<string>();
  const events = localSession(run).snapshotEvents();
  for (const event of events) {
    if (event.type !== 'tool/call') continue;
    const result = events.find(item => item.type === 'tool/result' && item.data.message?.source?.kind === 'tool' && item.data.message.source.callId === event.data.callId);
    const block = result?.type === 'tool/result' ? result.data.message.content.find(item => item.type === 'tool-result') : undefined;
    if (!block || block.type !== 'tool-result' || block.isError) continue;
    let args: unknown;
    try { args = JSON.parse(event.data.arguments); } catch { continue; }
    if (event.data.name === 'write' || event.data.name === 'edit') {
      const path = (args as { file_path?: unknown } | null)?.file_path;
      if (typeof path === 'string') paths.add(path);
    } else if (event.data.name === 'present') {
      const files = (args as { files?: unknown } | null)?.files;
      if (Array.isArray(files)) for (const file of files) {
        const path = (file as { path?: unknown } | null)?.path;
        if (typeof path === 'string') paths.add(path);
      }
    }
  }
  return [...paths];
}

/** Pin the observed bytes of each path; an unreadable or empty file is never pinned. */
async function capturePins(paths: readonly string[], workspaceRef: string | undefined): Promise<SopArtifact[]> {
  const resolved = new Set<string>();
  if (!workspaceRef) return [];
  const root = await realpath(workspaceRef);
  for (const raw of paths) {
    let path: string;
    try { path = await realpath(isAbsolute(raw) ? raw : resolve(root, raw)); } catch { continue; }
    const local = relative(root, path);
    if (!local || local === '..' || local.startsWith('../') || isAbsolute(local)) throw new ExpertsError('experts/forbidden', '成果文件不在绑定工作区中。');
    resolved.add(path);
  }
  const artifacts: SopArtifact[] = [];
  for (const path of resolved) {
    try {
      const bytes = await readFile(path);
      if (bytes.byteLength === 0) continue;
      artifacts.push({ path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength });
    } catch { /* the Host pins only bytes it can re-read */ }
  }
  return artifacts;
}

/** The verified settlement receipt: terminal seq plus the exact bytes the member left behind. */
function terminalReceipt(run: SubagentRun, artifacts: readonly SopArtifact[]): SopReceipt {
  const events = localSession(run).snapshotEvents();
  const terminal = events.filter(event => event.type === 'turn/end').at(-1);
  if (terminal?.data.reason.kind !== 'completed') {
    throw new ExpertsError('experts/conflict', '成员任务没有正常结束，不能生成产物回执。', { reason: 'native-not-completed' });
  }
  const output = finalAssistantOutput(events);
  if (!output?.length) {
    throw new ExpertsError('experts/conflict', '成员任务没有产生可回执的最终输出。', { reason: 'no-native-output' });
  }
  return {
    sessionId: run.id,
    terminalSeq: terminal.seq,
    digest: digestOf({ sessionId: run.id, terminalSeq: terminal.seq, output }),
    ...(artifacts.length ? { artifacts: [...artifacts] } : {}),
  };
}

function attemptPhase(attempt: SopAttempt | undefined): string {
  if (!attempt) return 'empty';
  if (attempt.abandoned) return 'abandoned';
  if (attempt.decision) return attempt.decision.verdict;
  if (attempt.proposal) return `proposed:${attempt.proposal.verdict}`;
  if (attempt.reviewSessionId) return 'in-review';
  if (attempt.output) return 'output-recorded';
  return 'in-work';
}

function statusProjection(run: TeamRun, ctx?: Context) {
  return {
    run_id: run.runId,
    revision: run.state.revision,
    host_session_id: run.hostSessionId,
    delivered: run.delivery !== undefined,
    ...(run.delivery === undefined ? {} : {
      delivery: {
        delivered_at: run.delivery.deliveredAt,
        artifacts: run.delivery.artifacts.map(pin => ({ path: pin.path, sha256: pin.sha256, byte_length: pin.byteLength })),
      },
    }),
    members: Object.entries(run.members).map(([key, ref]) => ({ key, expert_id: ref.expertId, revision_id: ref.revisionId })),
    stages: run.state.plan.stages.map((stage) => {
      const attempt = run.state.attempts[stage.id]?.at(-1);
      return {
        id: stage.id,
        worker: stage.worker,
        ...(stage.reviewer ? { reviewer: stage.reviewer } : {}),
        depends_on: [...stage.dependsOn],
        attempts: run.state.attempts[stage.id]?.length ?? 0,
        phase: ctx && attempt && (!attempt.output || !!attempt.reviewSessionId) && !attempt.abandoned && !attempt.decision && !attempt.proposal && !ctx.agents.get((attempt.reviewSessionId ?? attempt.workSessionId) as Agent['id']) ? 'recovery-required' : attemptPhase(attempt),
        ...(attempt?.output === undefined ? {} : { output_digest: attempt.output.digest }),
      };
    }),
    max_total_attempts: run.state.plan.maxTotalAttempts,
  };
}

function artifactsProjection(artifacts: readonly SopArtifact[]) {
  return artifacts.map(pin => ({ path: pin.path, sha256: pin.sha256, byte_length: pin.byteLength }));
}

function workPrompt(runId: string, stageId: string, instructions: string | undefined): string {
  return [
    `你是 WorkDSH 专家团任务 ${runId} 的阶段「${stageId}」的执行成员，由团队主持人按 SOP 委派。`,
    '请完成该阶段应交出的工作产物：生成或修改文件使用实际文件工具或原生 bash，产物保存在你的工作区内；如有 present 工具，用它在结束时呈现最终交付文件。',
    '不要执行后续阶段、不要代为交付、不要修改上游阶段已验收的文件；不要调用 workdsh_expert_team_* 工具（状态查询除外）。',
    '结束时用简短文本总结你产出的文件与要点，然后结束。',
    ...(instructions ? [`主持人的补充说明：${instructions}`] : []),
  ].join('\n');
}

function reviewPrompt(runId: string, stageId: string, instructions: string | undefined): string {
  return [
    `你是 WorkDSH 专家团任务 ${runId} 的阶段「${stageId}」的评审成员。你的职责是独立核验执行成员的真实产物，而不是重做工作。`,
    '步骤：',
    `1. 调用 workdsh_expert_team_status（run_id=${runId}），在 stages 中找到「${stageId}」并读取 latest.output_digest 与产物位置。`,
    '2. 用 read 工具逐个读取被评审文件，核对内容是否满足阶段要求。',
    `3. 调用 workdsh_expert_team_review 提交结论：run_id=${runId}、stage_id=${stageId}、output_digest=<上一步读取的摘要>、verdict=accepted/changes-requested/blocked。`,
    '4. 用简短文本给出核验要点与结论；若 changes-requested 或 blocked，列出具体返工要求。',
    '不要修改被评审的文件；不要调用其他 workdsh_expert_team_* 工具。',
    ...(instructions ? [`主持人的补充说明：${instructions}`] : []),
  ].join('\n');
}

/** Run one delegated member turn through the plugin-owned provider and release it afterwards. */
async function runMember(ctx: Context, exec: ToolRunContext, binding: ExecutionBinding, prompt: string): Promise<SubagentRun> {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([exec.signal, cancellation.signal]);
  const pending = ctx.subagents.start(PROVIDER_NAME, {
    parent: requireCallerAgent(exec), label: binding.sessionId,
    prompt: [{ type: 'text', text: prompt }], signal,
  });
  // An implementation settling creation after cancellation must not leak its child.
  void pending.then(handle => { if (signal.aborted) return handle.dispose(); }).catch(() => {});
  const handle = await waitForDelegation(pending, { signal: exec.signal, cancel: () => cancellation.abort(), idleMs: 180_000, maxMs: 180_000 });
  return handle;
}

/** Cleanup is authorized by the admitted host, independent of a cancelled tool signal. */
async function settleFailedAttempt(ctx: Context, actor: ActorContext, host: string, runId: string, stageId: string, error: unknown) {
  const run = await ctx.workdshTeamRuns.get(actor, runId);
  const attempt = run.state.attempts[stageId]?.at(-1);
  if (attempt && !attempt.decision && !attempt.abandoned) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'experts/delegation-failed';
    await ctx.workdshTeamRuns.abandonAttempt(actor, host, runId, stageId, code);
  }
}

async function receiptOutput(ctx: Context, receipt: SopReceipt): Promise<string> {
  if (!ctx.sessionQuery) throw new ExpertsError('experts/unavailable', '完整结果回传需要官方session-query服务。');
  const snapshot = await ctx.sessionQuery.readSession(receipt.sessionId as Parameters<Context['sessionQuery']['readSession']>[0]);
  const events = snapshot.events.filter(event => event.seq <= receipt.terminalSeq);
  const terminal = events.at(-1);
  const output = finalAssistantOutput(events);
  if (terminal?.type !== 'turn/end' || terminal.data.reason.kind !== 'completed' || !output?.length || digestOf({ sessionId: receipt.sessionId, terminalSeq: receipt.terminalSeq, output }) !== receipt.digest) throw new ExpertsError('experts/conflict', '成员原生结果与固定回执不一致。');
  return JSON.stringify(output);
}

async function predecessorOutputs(ctx: Context, run: TeamRun, stageId: string): Promise<string> {
  const stage = run.state.plan.stages.find(stage => stage.id === stageId);
  const outputs = [];
  for (const id of stage?.dependsOn ?? []) {
    const receipt = run.state.attempts[id]?.at(-1)?.output;
    if (!receipt) throw new ExpertsError('experts/conflict', '前序阶段尚无结果。');
    outputs.push({ stage: id, output: await receiptOutput(ctx, receipt), artifacts: receipt.artifacts ?? [] });
  }
  return outputs.length ? `主持人中转的完整前序产出：\n${JSON.stringify(outputs)}` : '';
}

/** Register the model-facing team tools against the same Host authority as the UI and provider. */
export function registerExpertTeamTools(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_ask',
    description: '主理人直接请一位固定团队成员处理专业问题，等待其真实子任务完成并回传完整输出。不会额外安排独立评审；复杂问题仍按主理人MD的SOP协作。成员不能调用本工具。',
    parameters: { member: { type: 'string', required: true, description: '已发布团队中的成员Agent ID，不能是主理人。' }, instructions: { type: 'string', required: true, description: '完整问题、资料和成果要求。' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { run_id: { type: 'string', required: true }, session_id: { type: 'string', required: true }, status: { type: 'string', required: true }, output: { type: 'string', required: true } } }, render: (_args, value) => renderResult('成员真实结果已回传给主理人。', value) },
    async execute(args, exec) {
      const actor = await resolveActor(ctx, exec), host = requireCallerAgent(exec), operationId = operationIdOf(exec);
      const run = await ctx.workdshTeamRuns.openSavedPlan(actor, host.id, { stages: [{ id: 'answer', worker: args.member, instructions: args.instructions, dependsOn: [], maxAttempts: 1 }], maxTotalAttempts: 1 }, { operationId }, exec.signal);
      const prior = run.state.attempts.answer?.at(-1);
      if (prior?.output && prior.decision?.verdict === 'accepted') return { run_id: run.runId, session_id: prior.output.sessionId, status: 'completed', output: await receiptOutput(ctx, prior.output) };
      const { binding } = await ctx.workdshTeamRuns.beginWork(actor, host.id, run.runId, 'answer', { operationId: `${operationId}-member` }, exec.signal);
      let child: SubagentRun | undefined;
      try {
        child = await runMember(ctx, exec, binding, `主理人委派的专业问题：\n${args.instructions}\n请以你的独立专业身份处理，回传完整成果。不要创建团队、调度其他成员或模拟他人。`);
        const result = await child.result;
        if (result.stopReason !== 'completed') throw new ExpertsError('experts/conflict', `成员任务${stopText(result.stopReason)}。`);
        const pins = await capturePins(pinnedPaths(child), binding.workspaceRef);
        const receipt = terminalReceipt(child, pins);
        await ctx.workdshTeamRuns.recordWorkOutput(actor, run.runId, 'answer', receipt, exec.signal);
        return { run_id: run.runId, session_id: child.id, status: 'completed', output: JSON.stringify(result.output) };
      } catch (error) {
        const current = await ctx.workdshTeamRuns.get(actor, run.runId);
        const attempt = current.state.attempts.answer?.at(-1);
        if (attempt && !attempt.decision && !attempt.abandoned) await ctx.workdshTeamRuns.abandonAttempt(actor, host.id, run.runId, 'answer', '成员调用失败或已取消');
        throw error;
      } finally { await child?.dispose(); }
    },
  }));
  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_start',
    description: '按当前会话固定的专家团版本启动已保存协作场景。Host 自动装配成员修订和阶段；不需要逐人发布或填写运行配置。',
    parameters: { workflow_id: { type: 'string', required: true, description: '已保存团队中的协作场景 id。' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { run_id: { type: 'string', required: true }, status: { type: 'string', required: true } } }, render: (_args, value) => renderResult('协作场景已创建；用 status 查看阶段，再委派执行。', value) },
    async execute(args, exec) {
      const actor = await resolveActor(ctx, exec);
      const run = await ctx.workdshTeamRuns.startSaved(actor, String(requireCallerAgent(exec).id), args.workflow_id, { operationId: operationIdOf(exec) }, exec.signal);
      return { run_id: run.runId, status: JSON.stringify(statusProjection(run)) };
    },
  }));
  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_status',
    description: '读取一个 WorkDSH 专家团任务的当前 SOP 状态：阶段进度、最新产物摘要、签收意见与交付记录。只读；主持人与成员都可用，评审提交结论前必须先用它获取 output_digest。',
    parameters: {
      run_id: { type: 'string', required: true, description: '团队任务 id，来自 workdsh_expert_team_open。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          run_id: { type: 'string' as const, required: true as const },
          revision: { type: 'integer' as const, required: true as const },
          host_session_id: { type: 'string' as const, required: true as const },
          delivered: { type: 'boolean' as const, required: true as const },
          delivery: {
            type: 'object' as const,
            additionalProperties: false,
            properties: {
              delivered_at: { type: 'string' as const, required: true as const },
              artifacts: artifactList,
            },
          },
          members: { ...memberList, required: true as const },
          stages: { ...stageList, required: true as const },
          max_total_attempts: { type: 'integer' as const, required: true as const },
        },
      },
      render: (_args, value) => renderResult(`团队任务 ${value.run_id} 状态：${value.stages.map(stage => `${stage.id}=${stage.phase}`).join('，')}${value.delivered ? '；已交付' : ''}`, value),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const actor = await resolveActor(ctx, exec);
      const run = await ctx.workdshTeamRuns.get(actor, args.run_id, exec.signal);
      exec.signal.throwIfAborted();
      return statusProjection(run, ctx);
    },
  }));

  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_open',
    description: '主持人会话创建一个专家团任务：固定 2 到 8 位已有专家作为成员，并按 SOP 定义阶段（每个阶段有执行者、评审者与依赖）。只写团队任务记录；不会自动运行任何成员，也不会创建专家或技能。',
    parameters: {
      members: {
        type: 'array' as const,
        description: '团队成员：key 是阶段引用的角色名（小写字母开头），expert_id 用 workdsh_expert_list 查到的真实专家，未给 revision_id 时使用当前已发布修订。',
        items: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            key: { type: 'string' as const, required: true as const },
            expert_id: { type: 'string' as const, required: true as const },
            revision_id: { type: 'string' as const, description: '可选：指定固定修订。' },
          },
        },
      },
      stages: {
        type: 'array' as const,
        required: true as const,
        description: 'SOP 阶段：worker/reviewer 引用成员 key，depends_on 引用前置阶段 id，最多 3 次尝试。',
        items: {
          type: 'object' as const,
          additionalProperties: false,
          properties: {
            id: { type: 'string' as const, required: true as const },
            worker: { type: 'string' as const, required: true as const },
            reviewer: { type: 'string' as const },
            instructions: { type: 'string' as const, description: '该阶段的任务、上下文和成果要求。' },
            depends_on: { type: 'array' as const, required: true as const, items: { type: 'string' as const } },
            max_attempts: { type: 'integer' as const, description: '可选：该阶段最多尝试次数（1-3，默认 2）。' },
          },
        },
      },
      max_total_attempts: { type: 'integer' as const, description: '可选：整个任务的总尝试预算（默认 2 倍阶段数）。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          run_id: { type: 'string' as const, required: true as const },
          revision: { type: 'integer' as const, required: true as const },
          host_session_id: { type: 'string' as const, required: true as const },
          delivered: { type: 'boolean' as const, required: true as const },
          members: { ...memberList, required: true as const },
          stages: { ...stageList, required: true as const },
          max_total_attempts: { type: 'integer' as const, required: true as const },
        },
      },
      render: (_args, value) => renderResult(`已创建团队任务 ${value.run_id}，成员 ${value.members.length} 位、阶段 ${value.stages.length} 个：${value.stages.map(stage => stage.id).join(' → ')}。`, value),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const actor = await resolveActor(ctx, exec);
      const host = requireCallerAgent(exec);
      const stages = args.stages.map(stage => ({
        id: stage.id,
        worker: stage.worker,
        ...(stage.reviewer ? { reviewer: stage.reviewer } : {}),
        ...(stage.instructions ? { instructions: stage.instructions } : {}),
        dependsOn: stage.depends_on,
        maxAttempts: stage.max_attempts ?? 2,
      }));
      const plan = {
        maxTotalAttempts: args.max_total_attempts ?? Math.min(2 * stages.length, 20),
        stages,
      };
      const run = args.members ? await ctx.workdshTeamRuns.open(actor, {
        hostSessionId: String(host.id),
        members: args.members.map(member => ({
          key: member.key, expertId: member.expert_id,
          ...(member.revision_id === undefined ? {} : { revisionId: member.revision_id }),
        })),
        plan,
      }, { operationId: operationIdOf(exec) }, exec.signal) : await ctx.workdshTeamRuns.openSavedPlan(actor, String(host.id), plan, { operationId: operationIdOf(exec) }, exec.signal);
      exec.signal.throwIfAborted();
      return statusProjection(run, ctx);
    },
  }));

  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_delegate',
    description: '主持人把一个 SOP 阶段正式委派给成员并等待其完成：kind=work 让执行成员产出文件并登记产物回执；kind=review 让评审成员核验产物并提交结论后由主持人签收。受 SOP 前置验收、尝试限额与文件版本校验约束；被取消或失败的尝试会被显式作废。',
    parameters: {
      run_id: { type: 'string' as const, required: true, description: '团队任务 id。' },
      stage_id: { type: 'string' as const, required: true, description: '要推进的阶段 id。' },
      kind: { type: 'string' as const, required: true, enum: ['work', 'review'] as const, description: 'work=执行成员产出；review=评审成员核验。' },
      instructions: { type: 'string' as const, description: '可选：随委派一并转达给成员的补充说明。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          status: { type: 'string' as const, required: true as const, description: 'completed=成员正常完成；settled=评审已签收；abandoned=尝试已作废；review-missing-proposal=评审未提交结论，尝试已作废。' },
          run_id: { type: 'string' as const, required: true as const },
          stage_id: { type: 'string' as const, required: true as const },
          kind: { type: 'string' as const, required: true as const },
          attempt: { type: 'integer' as const },
          output_digest: { type: 'string' as const },
          output: { type: 'string' as const },
          verdict: { type: 'string' as const },
          artifacts: artifactList,
          stop_reason: { type: 'string' as const },
          detail: { type: 'string' as const },
        },
      },
      render: (_args, value) => renderResult(`阶段 ${value.stage_id}（${value.kind}）：${value.status}${value.verdict ? `（${value.verdict}）` : ''}${value.stop_reason ? `，原因 ${value.stop_reason}` : ''}。${value.status === 'completed' ? '按阶段要求继续协作。' : ''}`, value),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const actor = await resolveActor(ctx, exec);
      const hostSessionId = String(requireCallerAgent(exec).id);
      const operationId = operationIdOf(exec);

      if (args.kind === 'work') {
        const { binding, run: admitted } = await ctx.workdshTeamRuns.beginWork(actor, hostSessionId, args.run_id, args.stage_id, { operationId }, exec.signal);
        let member: SubagentRun | undefined;
        try {
        const handoff = await predecessorOutputs(ctx, admitted, args.stage_id);
        member = await runMember(ctx, exec, binding, [workPrompt(args.run_id, args.stage_id, [admitted.state.plan.stages.find(stage => stage.id === args.stage_id)?.instructions, args.instructions].filter(Boolean).join('\n')), handoff].filter(Boolean).join('\n\n'));
          const result = await member.result;
          if (result.stopReason !== 'completed') {
            await ctx.workdshTeamRuns.abandonAttempt(actor, hostSessionId, args.run_id, args.stage_id, `执行成员${stopText(result.stopReason)}`);
            return { status: 'abandoned', run_id: args.run_id, stage_id: args.stage_id, kind: args.kind, stop_reason: result.stopReason };
          }
          const artifacts = await capturePins(pinnedPaths(member), binding.workspaceRef);
          const receipt = terminalReceipt(member, artifacts);
          const run = await ctx.workdshTeamRuns.recordWorkOutput(actor, args.run_id, args.stage_id, receipt, exec.signal);
          const attempt = run.state.attempts[args.stage_id]?.at(-1);
          return {
            status: 'completed', run_id: args.run_id, stage_id: args.stage_id, kind: args.kind,
            attempt: attempt?.number,
            output_digest: receipt.digest,
            output: JSON.stringify(result.output),
            ...(artifacts.length ? { artifacts: artifactsProjection(artifacts) } : {}),
          };
        } catch (error) {
          await settleFailedAttempt(ctx, actor, hostSessionId, args.run_id, args.stage_id, error);
          throw error;
        } finally {
          await member?.dispose();
        }
      }

      const { binding, run: reviewRun } = await ctx.workdshTeamRuns.beginReview(actor, hostSessionId, args.run_id, args.stage_id, { operationId }, exec.signal);
      let reviewer: SubagentRun | undefined;
      try {
      const workReceipt = reviewRun.state.attempts[args.stage_id]?.at(-1)?.output;
      const workOutput = workReceipt ? await receiptOutput(ctx, workReceipt) : '';
      reviewer = await runMember(ctx, exec, binding, [reviewPrompt(args.run_id, args.stage_id, args.instructions), `主理人中转的被评审完整产出：${workOutput}`].join('\n\n'));
        const result = await reviewer.result;
        if (result.stopReason !== 'completed') {
          await ctx.workdshTeamRuns.abandonAttempt(actor, hostSessionId, args.run_id, args.stage_id, `评审成员${stopText(result.stopReason)}`);
          return { status: 'abandoned', run_id: args.run_id, stage_id: args.stage_id, kind: args.kind, stop_reason: result.stopReason };
        }
        const current = await ctx.workdshTeamRuns.get(actor, args.run_id, exec.signal);
        const attempt = current.state.attempts[args.stage_id]?.at(-1);
        if (!attempt?.proposal) {
          // A reviewer that never called the proposal tool leaves an
          // un-finalizable attempt; it is consumed, never silently re-admitted.
          await ctx.workdshTeamRuns.abandonAttempt(actor, hostSessionId, args.run_id, args.stage_id, '评审成员未通过 workdsh_expert_team_review 提交结论');
          return { status: 'review-missing-proposal', run_id: args.run_id, stage_id: args.stage_id, kind: args.kind, detail: '评审未提交结论，该尝试已作废；修正后重新委派。' };
        }
        const artifacts = await capturePins(pinnedPaths(reviewer), binding.workspaceRef);
        const receipt = terminalReceipt(reviewer, artifacts);
        const settled = await ctx.workdshTeamRuns.settleReview(actor, args.run_id, args.stage_id, receipt, exec.signal);
        return {
          status: 'settled', run_id: args.run_id, stage_id: args.stage_id, kind: args.kind,
          attempt: attempt.number,
          verdict: settled.verdict,
          ...(settled.verdict === 'accepted' ? {} : { detail: '该阶段未通过验收；按评审意见返工后重新委派。' }),
        };
      } catch (error) {
        await settleFailedAttempt(ctx, actor, hostSessionId, args.run_id, args.stage_id, error);
        throw error;
      } finally {
        await reviewer?.dispose();
      }
    },
  }));

  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_review',
    description: '评审成员提交对一个阶段产物的核验结论（提案）。只能在评审会话内调用，output_digest 必须来自 workdsh_expert_team_status 的当前值；提交后由主持人完成签收，本工具不构成验收。',
    parameters: {
      run_id: { type: 'string' as const, required: true, description: '团队任务 id。' },
      stage_id: { type: 'string' as const, required: true, description: '被评审阶段 id。' },
      output_digest: { type: 'string' as const, required: true, description: '来自 workdsh_expert_team_status 的阶段 output_digest，原样回传。' },
      verdict: { type: 'string' as const, required: true, enum: ['accepted', 'changes-requested', 'blocked'] as const, description: '核验结论。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          status: { type: 'string' as const, required: true as const },
          run_id: { type: 'string' as const, required: true as const },
          stage_id: { type: 'string' as const, required: true as const },
          output_digest: { type: 'string' as const, required: true as const },
          verdict: { type: 'string' as const, required: true as const },
          note: { type: 'string' as const, required: true as const },
        },
      },
      render: (_args, value) => renderResult(`阶段 ${value.stage_id} 的评审结论「${value.verdict}」已提交，等待主持人签收。`, value),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const actor = await resolveActor(ctx, exec);
      const callerSessionId = String(requireCallerAgent(exec).id);
      await ctx.workdshTeamRuns.proposeReview(
        actor, args.run_id, args.stage_id, callerSessionId, args.output_digest,
        args.verdict as SopVerdict, exec.signal,
      );
      return {
        status: 'proposed', run_id: args.run_id, stage_id: args.stage_id,
        output_digest: args.output_digest, verdict: args.verdict,
        note: '结论已记录为提案；签收由主持人在评审结束后完成，不要声称已验收。',
      };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_recover',
    description: '主持人在应用重启或委派中断后核对一个悬空阶段。仍运行或已完成但未结算的成员不会自动重派；确认中断才作废当前尝试，保留已有文件与前置成果，不重置次数。随后按返回状态继续评审或在剩余预算内重新委派。',
    parameters: {
      run_id: { type: 'string' as const, required: true, description: '已有团队任务id，不创建新任务。' },
      stage_id: { type: 'string' as const, required: true, description: '需要核对的已开始阶段。' },
    },
    output: { schema: { type: 'object' as const, additionalProperties: false, properties: {
      status: { type: 'string' as const, required: true as const },
      detail: { type: 'string' as const, required: true as const },
    } }, render: (_args, value) => renderResult(value.detail, value) },
    async execute(args, exec) {
      const actor = await resolveActor(ctx, exec);
      return ctx.workdshTeamRuns.recoverInterruptedAttempt(actor, String(requireCallerAgent(exec).id), args.run_id, args.stage_id, exec.signal);
    },
  }));

  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_abandon',
    description: '主持人显式作废一个阶段的当前尝试（评审未通过、文件被外部改动或成员中断后无法继续时使用）。作废后该尝试永久消费，可重新委派执行成员重做。',
    parameters: {
      run_id: { type: 'string' as const, required: true, description: '团队任务 id。' },
      stage_id: { type: 'string' as const, required: true, description: '要作废当前尝试的阶段 id。' },
      reason: { type: 'string' as const, required: true, description: '作废原因（会记录在任务状态中）。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          status: { type: 'string' as const, required: true as const },
          run_id: { type: 'string' as const, required: true as const },
          stage_id: { type: 'string' as const, required: true as const },
          reason: { type: 'string' as const, required: true as const },
        },
      },
      render: (_args, value) => renderResult(`阶段 ${value.stage_id} 的当前尝试已作废（${value.reason}）；可重新委派执行成员。`, value),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const actor = await resolveActor(ctx, exec);
      const hostSessionId = String(requireCallerAgent(exec).id);
      await ctx.workdshTeamRuns.abandonAttempt(actor, hostSessionId, args.run_id, args.stage_id, args.reason, exec.signal);
      return { status: 'abandoned', run_id: args.run_id, stage_id: args.stage_id, reason: args.reason };
    },
  }));

  ctx.tools.register(defineTool({
    name: 'workdsh_expert_team_deliver',
    description: '主持人完成团队任务交付：要求所有阶段已通过验收，并逐个重读被验收文件，任一文件与验收版本不一致（或缺失）即拒绝交付。已交付的任务拒绝重复交付。',
    parameters: {
      run_id: { type: 'string' as const, required: true, description: '团队任务 id。' },
    },
    output: {
      schema: {
        type: 'object' as const,
        additionalProperties: false,
        properties: {
          status: { type: 'string' as const, required: true as const },
          run_id: { type: 'string' as const, required: true as const },
          delivered_at: { type: 'string' as const, required: true as const },
          artifacts: { ...artifactList, required: true as const },
        },
      },
      render: (_args, value) => renderResult(`团队任务 ${value.run_id} 已交付，共 ${value.artifacts.length} 个文件；所有文件与验收版本一致。`, value),
    },
    async execute(args, exec) {
      exec.signal.throwIfAborted();
      const actor = await resolveActor(ctx, exec);
      const hostSessionId = String(requireCallerAgent(exec).id);
      const run = await ctx.workdshTeamRuns.deliver(actor, hostSessionId, args.run_id, exec.signal);
      const delivery = run.delivery!;
      return {
        status: 'delivered', run_id: run.runId, delivered_at: delivery.deliveredAt,
        artifacts: artifactsProjection(delivery.artifacts),
      };
    },
  }));
}
