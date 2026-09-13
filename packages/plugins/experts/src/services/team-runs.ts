import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Context, Service } from '@deepseek-ai/cordis';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type {
  AccessAction,
  ActorContext,
  AuditEvent,
  AuditService,
  AccessService,
  ExecutionBinding,
  ExpertRevisionRef,
  ResourceOwner,
} from 'workdsh-contracts';
import { ActorContextError, ExpertsError, assertActorContext } from '../domain/values.js';
import { digestOf, sha256Bytes } from '../domain/digest.js';
import {
  abandonSopAttempt,
  admitSopReview,
  admitSopWork,
  createSop,
  finalizeSopReview,
  proposeSopReview,
  recordSopOutput,
  verifySopArtifacts,
} from '../domain/team-sop.js';
import type { SopArtifact, SopPlan, SopReceipt, SopStage, SopState, SopVerdict } from '../domain/team-sop.js';
import { teamDomainSpec, teamKeys } from '../storage/team-domain.js';
import type { TeamRun } from '../storage/team-domain.js';
import type { DelegationAdmissionInput } from '../runtime/delegation-provider.js';
import type { ExpertsManager } from './experts-manager.js';

/**
 * Host-owned team runs (TM-01 closing slice).
 *
 * One business object per team run: frozen member revisions, the SOP state
 * machine from `team-sop.ts` and the delivery record. This service is the only
 * writer of that object; the AI tools and the one-shot delegation provider both
 * call exactly this surface. Runtime facts (turns, tools, files) stay in the
 * Harness session log — nothing here caches model or child state.
 *
 * Three fail-closed byte gates re-read every file pinned by a stage receipt:
 * before a review is settled (sign-off), before a dependent stage starts
 * (handoff) and before delivery. Missing or changed bytes raise
 * `experts/conflict` with `details.reason`, so a drifted file can never be
 * signed off or delivered as if it were the accepted version.
 */

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshTeamRuns: TeamRunsManager;
  }
}

const TEAM_DOMAIN = 'workdsh-expert-teams';
const MEMBER_KEY_PATTERN = /^[a-z][a-z0-9_-]{0,63}$/;

export interface TeamRunMemberInput {
  readonly key: string;
  readonly expertId: string;
  readonly revisionId?: string;
}

export interface TeamRunOpenInput {
  readonly hostSessionId: string;
  readonly members: readonly TeamRunMemberInput[];
  readonly plan: SopPlan;
}

export interface TeamRunStageBegin {
  readonly run: TeamRun;
  readonly binding: ExecutionBinding;
  readonly memberRef: ExpertRevisionRef;
}

export class TeamRunsManager extends Service {
  static inject = ['storageDomain', 'workdshExperts', 'workdshAccess', 'workdshAudit'];

  private runs?: KvTable<string, TeamRun>;

  constructor(ctx: Context) {
    super(ctx, 'workdshTeamRuns');
  }

  async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(teamDomainSpec);
    this.ctx.effect(() => () => domain.close(), 'workdshTeamRuns.domainClose');
    this.runs = domain.table('runs');
  }

  // ── table and common helpers ─────────────────────────────────────────────

  private runsTable(): KvTable<string, TeamRun> {
    if (!this.runs) throw new ExpertsError('experts/unavailable', '专家团服务尚未就绪。');
    return this.runs;
  }

  /** Map internal SOP policy errors onto the public conflict code, fail closed. */
  private async wrap<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ExpertsError || error instanceof ActorContextError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('sop/')) {
        throw new ExpertsError('experts/conflict', `SOP 状态转换被拒绝：${message}`, { reason: message.slice(4) });
      }
      throw new ExpertsError('experts/internal', message);
    }
  }

  private async authorize(actor: ActorContext, action: AccessAction, resourceId: string, revision: number, owner: ResourceOwner, signal?: AbortSignal): Promise<void> {
    const decision = await this.ctx.workdshAccess.authorize({
      actor, action, resource: { domain: TEAM_DOMAIN, id: resourceId, revision: String(revision) }, owner,
    }, signal);
    if (decision.effect !== 'allow') {
      throw new ExpertsError('experts/forbidden', '没有权限执行该团队操作。', { reason: decision.code });
    }
  }

  private async audit(
    actor: ActorContext,
    action: string,
    runId: string,
    outcome: AuditEvent['outcome'],
    code: string,
    references?: Readonly<Record<string, string>>,
  ): Promise<void> {
    await this.ctx.workdshAudit.append({
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      requestId: actor.requestId,
      principalId: actor.principalId,
      organizationId: actor.organizationId,
      action,
      target: { domain: TEAM_DOMAIN, id: runId },
      outcome,
      code,
      ...(actor.sessionId === undefined ? {} : { sessionId: actor.sessionId }),
      ...(references === undefined ? {} : { references }),
    });
  }

  private newOwner(actor: ActorContext): ResourceOwner {
    return Object.freeze({ organizationId: actor.organizationId, ownerPrincipalId: actor.principalId, scope: 'personal' as const });
  }

  private loadRun(actor: ActorContext, runId: string): TeamRun {
    const run = this.runsTable().get(teamKeys.run(runId));
    if (!run) throw new ExpertsError('experts/not-found', '未找到该专家团任务。');
    if (run.owner.ownerPrincipalId !== actor.principalId || run.owner.organizationId !== actor.organizationId) {
      throw new ExpertsError('experts/forbidden', '没有权限访问该团队任务。');
    }
    return run;
  }

  private requireHost(run: TeamRun, callerSessionId: string | undefined): void {
    if (typeof callerSessionId !== 'string' || callerSessionId !== run.hostSessionId) {
      throw new ExpertsError('experts/forbidden', '只有团队主持人任务可以执行该操作。', { reason: 'not-host' });
    }
  }

  /** Compare-and-swap one run row; a concurrent change is a conflict, never a silent overwrite. */
  private async mutate(run: TeamRun, update: (current: TeamRun) => TeamRun, signal?: AbortSignal, stageId?: string): Promise<TeamRun> {
    signal?.throwIfAborted();
    return this.runsTable().update(teamKeys.run(run.runId), (current) => {
      if (digestOf(current) !== digestOf(run) && (!stageId || digestOf(current.state.attempts[stageId]) !== digestOf(run.state.attempts[stageId]) || digestOf(current.delivery ?? null) !== digestOf(run.delivery ?? null))) {
        throw new ExpertsError('experts/conflict', '团队任务状态已被并发修改，请刷新后重试。', { reason: 'concurrent-modification' });
      }
      const next = update(current);
      return { ...next, updatedAt: new Date().toISOString() };
    });
  }

  // ── file-version gates (fail closed on drift) ────────────────────────────

  /** Re-read every pinned path; a missing file is drift, not an empty result. */
  private async readPins(pins: readonly SopArtifact[]): Promise<SopArtifact[]> {
    const actual: SopArtifact[] = [];
    for (const pin of pins) {
      let bytes: Uint8Array;
      try {
        bytes = await readFile(pin.path);
      } catch {
        throw new ExpertsError('experts/conflict', `文件版本校验失败：无法读取 ${pin.path}，视为已漂移。`, { reason: 'stale-artifact', path: pin.path });
      }
      actual.push({ path: pin.path, sha256: sha256Bytes(bytes), byteLength: bytes.byteLength });
    }
    return actual;
  }

  /**
   * Host-owned byte check for one stage: re-read the output pins (and the
   * accepted decision's pins, when present) and compare against the recorded
   * digests. A text-only stage pins nothing and passes.
   */
  private async verifyStageBytes(run: TeamRun, stageId: string): Promise<void> {
    const attempt = run.state.attempts[stageId]?.at(-1);
    if (!attempt?.output) {
      throw new ExpertsError('experts/conflict', `阶段 ${stageId} 还没有产物回执，不能继续。`, { reason: 'no-output', stageId });
    }
    const expected = [...(attempt.output.artifacts ?? []), ...(attempt.decision?.receipt.artifacts ?? [])];
    if (expected.length === 0) return;
    const actual = await this.readPins(expected);
    try {
      verifySopArtifacts(run.state, run.state.revision, stageId, actual);
    } catch (error) {
      const reason = error instanceof Error && error.message.startsWith('sop/') ? error.message.slice(4) : 'artifact-mismatch';
      throw new ExpertsError('experts/conflict', `文件版本校验失败：阶段 ${stageId} 的文件与审核记录的版本不一致（${reason}）。`, { reason, stageId });
    }
  }

  private topologicalStages(plan: SopPlan): SopStage[] {
    const done = new Set<string>();
    const order: SopStage[] = [];
    const pending = [...plan.stages];
    while (pending.length) {
      const index = pending.findIndex((stage) => stage.dependsOn.every((dep) => done.has(dep)));
      if (index < 0) throw new ExpertsError('experts/internal', 'SOP 计划存在环，无法排序。');
      const [stage] = pending.splice(index, 1)!;
      done.add(stage.id);
      order.push(stage);
    }
    return order;
  }

  // ── open ─────────────────────────────────────────────────────────────────

  /** Natural-language lead uses Agent MD to select a plan; identities remain Host-resolved. */
  async openSavedPlan(actor: ActorContext, hostSessionId: string, plan: SopPlan, context: { operationId: string }, signal?: AbortSignal): Promise<TeamRun> {
    const binding = await this.ctx.workdshExperts.verifyBinding(actor, hostSessionId, signal);
    if (binding.delegation) throw new ExpertsError('experts/forbidden', '成员不能自行创建团队。');
    const detail = await this.ctx.workdshExperts.get(actor, binding.expertRevisionRef.expertId, binding.expertRevisionRef.revisionId, signal);
    if (!detail.revision?.teamMembers) throw new ExpertsError('experts/not-found', '当前任务不是已发布的完整专家团。');
    return this.open(actor, { hostSessionId, members: Object.entries(detail.revision.teamMembers).map(([key, ref]) => ({ key, ...ref })), plan }, context, signal);
  }

  async startSaved(actor: ActorContext, hostSessionId: string, workflowId: string, context: { operationId: string }, signal?: AbortSignal): Promise<TeamRun> {
    const binding = await this.ctx.workdshExperts.verifyBinding(actor, hostSessionId, signal);
    const detail = await this.ctx.workdshExperts.get(actor, binding.expertRevisionRef.expertId, binding.expertRevisionRef.revisionId, signal);
    const revision = detail.revision;
    const workflow = revision?.definition.team?.workflows.find(item => item.id === workflowId);
    if (!workflow || !revision?.teamMembers) throw new ExpertsError('experts/not-found', '当前固定团队版本中没有该协作场景。');
    if (!workflow.stages.length) throw new ExpertsError('experts/invalid-request', '此场景由主理人直接处理，无需创建团队任务。');
    return this.open(actor, { hostSessionId, members: Object.entries(revision.teamMembers).map(([key, ref]) => ({ key, ...ref })), plan: { stages: workflow.stages.map(stage => ({ ...stage, dependsOn: [...stage.dependsOn], maxAttempts: 2 })), maxTotalAttempts: Math.min(20, workflow.stages.length * 2) } }, context, signal);
  }

  async open(actor: ActorContext, input: TeamRunOpenInput, context: { operationId: string }, signal?: AbortSignal): Promise<TeamRun> {
    return this.wrap(async () => {
      signal?.throwIfAborted();
      assertActorContext(actor);
      if (!input || typeof input.hostSessionId !== 'string' || !input.hostSessionId.trim()) {
        throw new ExpertsError('experts/invalid-request', '缺少主持人任务。');
      }
      if (!context || typeof context.operationId !== 'string' || !context.operationId.trim()) {
        throw new ExpertsError('experts/invalid-request', '缺少有效的 operationId。');
      }
      const hostBinding = await this.ctx.workdshExperts.verifyBinding(actor, input.hostSessionId, signal);
      if (hostBinding.delegation) throw new ExpertsError('experts/forbidden', '团队主持人必须是顶层专家任务，不能是子任务。');
      if (!hostBinding.workspaceRef) throw new ExpertsError('experts/unsupported-capability', '团队任务需要已解析的主持人工作区。');
      const members = await this.resolveMembers(actor, input.members, signal);
      const hostDetail = await this.ctx.workdshExperts.get(actor, hostBinding.expertRevisionRef.expertId, hostBinding.expertRevisionRef.revisionId, signal);
      if (hostDetail.revision?.teamMembers && digestOf(hostDetail.revision.teamMembers) !== digestOf(members)) throw new ExpertsError('experts/conflict', '团队成员必须匹配本任务固定的整团版本。');
      let state: SopState;
      try {
        state = createSop(input.plan);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new ExpertsError('experts/invalid-request', `SOP 计划无效：${reason}`, { reason });
      }
      for (const stage of state.plan.stages) {
        if (!members[stage.worker] || (stage.reviewer && !members[stage.reviewer])) {
          throw new ExpertsError('experts/invalid-request', `阶段 ${stage.id} 引用了未定义的成员。`, { reason: 'unknown-member', stageId: stage.id });
        }
      }
      const runId = `team-${digestOf({ organizationId: actor.organizationId, operationId: context.operationId }).slice(0, 32)}`;
      await this.authorize(actor, 'use', runId, 0, this.newOwner(actor), signal);
      const prior = this.runsTable().get(teamKeys.run(runId));
      if (prior) {
        if (prior.owner.ownerPrincipalId !== actor.principalId || prior.owner.organizationId !== actor.organizationId) {
          throw new ExpertsError('experts/forbidden', '没有权限访问该团队任务。');
        }
        const replay = prior.hostSessionId === input.hostSessionId
          && digestOf(prior.members) === digestOf(members)
          && digestOf(prior.state.plan) === digestOf(state.plan);
        if (replay) return prior;
        throw new ExpertsError('experts/idempotency-conflict', '相同操作号已用于不同的团队任务。');
      }
      const now = new Date().toISOString();
      const run: TeamRun = {
        runId, owner: this.newOwner(actor), hostSessionId: input.hostSessionId,
        hostRevisionRef: hostBinding.expertRevisionRef,
        ...(hostBinding.workspaceRef === undefined ? {} : { workspaceRef: hostBinding.workspaceRef }),
        members, state, createdAt: now, updatedAt: now,
      };
      await this.runsTable().put(teamKeys.run(runId), run);
      await this.audit(actor, 'experts.team-open', runId, 'succeeded', 'experts/team-opened', { members: Object.keys(members).join(',') });
      return run;
    });
  }

  /** Resolve every member to a published, enabled, ready revision; the model never supplies ids. */
  private async resolveMembers(actor: ActorContext, members: readonly TeamRunMemberInput[], signal?: AbortSignal): Promise<Record<string, ExpertRevisionRef>> {
    if (!Array.isArray(members) || members.length < 2 || members.length > 8) {
      throw new ExpertsError('experts/invalid-request', '团队成员必须为 2 到 8 位专家。');
    }
    const resolved: Record<string, ExpertRevisionRef> = {};
    for (const member of members) {
      if (!member || typeof member.key !== 'string' || !MEMBER_KEY_PATTERN.test(member.key)) {
        throw new ExpertsError('experts/invalid-request', '成员 key 必须是小写字母开头的合法标识。');
      }
      if (resolved[member.key]) throw new ExpertsError('experts/invalid-request', `成员 key 重复：${member.key}。`);
      if (typeof member.expertId !== 'string' || !member.expertId.trim()) {
        throw new ExpertsError('experts/invalid-request', `成员 ${member.key} 缺少 expertId。`);
      }
      const detail = await this.ctx.workdshExperts.get(actor, member.expertId, member.revisionId, signal);
      if (detail.expert.availability !== 'enabled') {
        throw new ExpertsError('experts/disabled', `成员「${detail.draft.definition.name}」已停用或归档。`, { memberKey: member.key });
      }
      if (detail.readiness !== 'ready') {
        throw new ExpertsError('experts/dependency-missing', `成员「${detail.draft.definition.name}」的固定组合尚未就绪。`, { memberKey: member.key });
      }
      const revisionId = member.revisionId ?? detail.expert.publishedRevisionRef?.revisionId;
      if (!revisionId) {
        throw new ExpertsError('experts/not-published', `成员「${detail.draft.definition.name}」尚未发布。`, { memberKey: member.key });
      }
      resolved[member.key] = { expertId: member.expertId, revisionId };
    }
    return resolved;
  }

  // ── read ─────────────────────────────────────────────────────────────────

  async get(actor: ActorContext, runId: string, signal?: AbortSignal): Promise<TeamRun> {
    signal?.throwIfAborted();
    assertActorContext(actor);
    const run = this.loadRun(actor, runId);
    await this.authorize(actor, 'read', runId, run.state.revision, run.owner, signal);
    return run;
  }

  // ── stage admission (handoff gate included) ──────────────────────────────

  async beginWork(actor: ActorContext, callerSessionId: string | undefined, runId: string, stageId: string, context: { operationId: string }, signal?: AbortSignal): Promise<TeamRunStageBegin> {
    return this.wrap(async () => {
      signal?.throwIfAborted();
      assertActorContext(actor);
      if (!context || typeof context.operationId !== 'string' || !context.operationId.trim()) {
        throw new ExpertsError('experts/invalid-request', '缺少有效的 operationId。');
      }
      const run = this.loadRun(actor, runId);
      this.requireHost(run, callerSessionId);
      await this.authorize(actor, 'use', runId, run.state.revision, run.owner, signal);
      const stage = run.state.plan.stages.find((candidate) => candidate.id === stageId);
      if (!stage) throw new ExpertsError('experts/not-found', `未找到阶段 ${stageId}。`);
      // In-memory policy pre-check so an illegal attempt (missing acceptance,
      // exhausted budget) leaves no reservation and reports the policy reason.
      admitSopWork(run.state, run.state.revision, stageId, 'preflight-candidate');
      // Handoff gate: a predecessor's accepted bytes are re-read before the
      // dependent stage may even reserve a member.
      for (const dep of stage.dependsOn) await this.verifyStageBytes(run, dep);
      const memberRef = run.members[stage.worker];
      if (!memberRef) throw new ExpertsError('experts/invalid-request', `阶段 ${stageId} 的工作成员未定义。`, { reason: 'unknown-member' });
      const binding = await this.ctx.workdshExperts.reserveDelegation(actor, run.hostSessionId, memberRef, { operationId: context.operationId }, signal);
      // The reservation is issued before the state CAS; a lost CAS leaves only
      // an admission-less reservation that the provider refuses to run.
      const next = await this.runsTable().update(teamKeys.run(run.runId), current => ({
        ...current, state: admitSopWork(current.state, current.state.revision, stageId, binding.sessionId), updatedAt: new Date().toISOString(),
      }));
      await this.audit(actor, 'experts.team-begin-work', runId, 'succeeded', 'experts/team-work-admitted', { stageId, sessionId: binding.sessionId, member: stage.worker });
      return { run: next, binding, memberRef };
    });
  }

  async beginReview(actor: ActorContext, callerSessionId: string | undefined, runId: string, stageId: string, context: { operationId: string }, signal?: AbortSignal): Promise<TeamRunStageBegin> {
    return this.wrap(async () => {
      signal?.throwIfAborted();
      assertActorContext(actor);
      if (!context || typeof context.operationId !== 'string' || !context.operationId.trim()) {
        throw new ExpertsError('experts/invalid-request', '缺少有效的 operationId。');
      }
      const run = this.loadRun(actor, runId);
      this.requireHost(run, callerSessionId);
      await this.authorize(actor, 'use', runId, run.state.revision, run.owner, signal);
      const stage = run.state.plan.stages.find((candidate) => candidate.id === stageId);
      if (!stage) throw new ExpertsError('experts/not-found', `未找到阶段 ${stageId}。`);
      admitSopReview(run.state, run.state.revision, stageId, 'preflight-candidate');
      if (!stage.reviewer) throw new ExpertsError('experts/invalid-request', '此阶段未要求独立评审。');
      const memberRef = run.members[stage.reviewer];
      if (!memberRef) throw new ExpertsError('experts/invalid-request', `阶段 ${stageId} 的评审成员未定义。`, { reason: 'unknown-member' });
      const binding = await this.ctx.workdshExperts.reserveDelegation(actor, run.hostSessionId, memberRef, { operationId: context.operationId }, signal);
      const next = await this.mutate(run, (current) => ({
        ...current, state: admitSopReview(current.state, current.state.revision, stageId, binding.sessionId),
      }), signal, stageId);
      await this.audit(actor, 'experts.team-begin-review', runId, 'succeeded', 'experts/team-review-admitted', { stageId, sessionId: binding.sessionId, member: stage.reviewer });
      return { run: next, binding, memberRef };
    });
  }

  // ── outputs, proposals, settlement ───────────────────────────────────────

  async recordWorkOutput(actor: ActorContext, runId: string, stageId: string, receipt: SopReceipt, signal?: AbortSignal): Promise<TeamRun> {
    return this.wrap(async () => {
      signal?.throwIfAborted();
      assertActorContext(actor);
      const run = this.loadRun(actor, runId);
      await this.authorize(actor, 'use', runId, run.state.revision, run.owner, signal);
      const next = await this.mutate(run, (current) => ({
        ...current, state: recordSopOutput(current.state, current.state.revision, stageId, receipt),
      }), signal, stageId);
      await this.audit(actor, 'experts.team-record-output', runId, 'succeeded', 'experts/team-output-recorded', { stageId, sessionId: receipt.sessionId });
      return next;
    });
  }

  async proposeReview(actor: ActorContext, runId: string, stageId: string, callerSessionId: string, outputDigest: string, verdict: SopVerdict, signal?: AbortSignal): Promise<TeamRun> {
    return this.wrap(async () => {
      signal?.throwIfAborted();
      assertActorContext(actor);
      const run = this.loadRun(actor, runId);
      const next = await this.mutate(run, (current) => ({
        ...current, state: proposeSopReview(current.state, current.state.revision, stageId, callerSessionId, outputDigest, verdict),
      }), signal, stageId);
      await this.audit(actor, 'experts.team-propose-review', runId, 'succeeded', 'experts/team-review-proposed', { stageId, callerSessionId, verdict });
      return next;
    });
  }

  /**
   * Sign-off. Re-reads the stage's pinned bytes BEFORE the decision is written,
   * so a drifted file can never be attached to an accepted review.
   */
  async settleReview(actor: ActorContext, runId: string, stageId: string, receipt: SopReceipt, signal?: AbortSignal): Promise<{ run: TeamRun; verdict: SopVerdict }> {
    return this.wrap(async () => {
      signal?.throwIfAborted();
      assertActorContext(actor);
      const run = this.loadRun(actor, runId);
      const attempt = run.state.attempts[stageId]?.at(-1);
      if (!attempt?.proposal) {
        throw new ExpertsError('experts/conflict', '评审尚未提交签收意见，不能终结签收。', { reason: 'review-without-proposal', stageId });
      }
      await this.verifyStageBytes(run, stageId);
      const next = await this.mutate(run, (current) => ({
        ...current, state: finalizeSopReview(current.state, current.state.revision, stageId, receipt),
      }), signal, stageId);
      await this.audit(actor, 'experts.team-settle-review', runId, 'succeeded', 'experts/team-review-settled', { stageId, verdict: attempt.proposal.verdict });
      return { run: next, verdict: attempt.proposal.verdict };
    });
  }

  async abandonAttempt(actor: ActorContext, callerSessionId: string | undefined, runId: string, stageId: string, reason: string, signal?: AbortSignal): Promise<TeamRun> {
    return this.wrap(async () => {
      signal?.throwIfAborted();
      assertActorContext(actor);
      if (typeof reason !== 'string' || !reason.trim()) throw new ExpertsError('experts/invalid-request', '缺少放弃原因。');
      const run = this.loadRun(actor, runId);
      this.requireHost(run, callerSessionId);
      const next = await this.mutate(run, (current) => ({
        ...current, state: abandonSopAttempt(current.state, current.state.revision, stageId, reason.trim().slice(0, 256)),
      }), signal, stageId);
      await this.audit(actor, 'experts.team-abandon-attempt', runId, 'succeeded', 'experts/team-attempt-abandoned', { stageId });
      return next;
    });
  }

  /** Explicit cold-run reconciliation. Never executes a child or signs off reconstructed bytes. */
  async recoverInterruptedAttempt(actor: ActorContext, callerSessionId: string, runId: string, stageId: string, signal?: AbortSignal): Promise<{ status: string; detail: string }> {
    const run = await this.get(actor, runId, signal);
    this.requireHost(run, callerSessionId);
    const attempt = run.state.attempts[stageId]?.at(-1);
    if (!attempt) throw new ExpertsError('experts/not-found', '该阶段没有已开始的尝试。');
    if (attempt.decision || attempt.abandoned) return { status: 'closed', detail: '当前尝试已经结束，不修改成果或尝试次数。' };
    if (attempt.output && !attempt.reviewSessionId) return { status: 'output-recorded', detail: '执行成果已记录，请继续委派指定评审者；不要重做执行阶段。' };
    const sessionId = attempt.reviewSessionId ?? attempt.workSessionId;
    const nativeId = sessionId as Parameters<Context['sessionQuery']['readSession']>[0];
    if (this.ctx.agents.get(nativeId)) return { status: 'running', detail: '成员仍在本Host装配中，不允许恢复重派。' };
    const snapshot = await this.ctx.sessionQuery.readSession(nativeId);
    const terminal = snapshot.events.filter(event => event.type === 'turn/end').at(-1);
    if (terminal?.data.reason.kind === 'completed') return { status: 'completed-needs-reconciliation', detail: '子会话已完成，但阶段回执未结算。保留文件；不得盲目重派或自动签收，请核验已有产物。' };
    if (!terminal) return { status: 'unknown', detail: '子会话未能确认终态，不自动作废或重派。' };
    // Recheck after the asynchronous history read; a concurrent remount wins.
    if (this.ctx.agents.get(nativeId)) return { status: 'running', detail: '成员已重新装配，不允许恢复重派。' };
    await this.abandonAttempt(actor, callerSessionId, runId, stageId, `恢复对账：成员${terminal.data.reason.kind}，保留已有文件`, signal);
    return { status: 'abandoned', detail: '中断尝试已结算，已有文件和前置验收成果保留；可在剩余尝试预算内重新委派该阶段。' };
  }

  // ── delivery ─────────────────────────────────────────────────────────────

  /**
   * Record the delivery. Every stage must be accepted, and every pinned path
   * is re-read against its LAST recorded pin (downstream pins supersede
   * upstream ones), so the delivered version is exactly the reviewed version.
   */
  async deliver(actor: ActorContext, callerSessionId: string | undefined, runId: string, signal?: AbortSignal): Promise<TeamRun> {
    return this.wrap(async () => {
      signal?.throwIfAborted();
      assertActorContext(actor);
      const run = this.loadRun(actor, runId);
      this.requireHost(run, callerSessionId);
      await this.authorize(actor, 'use', runId, run.state.revision, run.owner, signal);
      if (run.delivery) {
        throw new ExpertsError('experts/conflict', '该团队任务已交付，拒绝重复交付。', { reason: 'already-delivered', deliveredAt: run.delivery.deliveredAt });
      }
      for (const stage of run.state.plan.stages) {
        const attempt = run.state.attempts[stage.id]?.at(-1);
        if (!attempt || !attempt.decision || attempt.decision.verdict !== 'accepted' || attempt.abandoned) {
          throw new ExpertsError('experts/conflict', `阶段 ${stage.id} 尚未通过验收，不能交付。`, { reason: 'stages-not-accepted', stageId: stage.id });
        }
      }
      const expected = new Map<string, SopArtifact>();
      for (const stage of this.topologicalStages(run.state.plan)) {
        const attempt = run.state.attempts[stage.id]?.at(-1);
        if (!attempt) continue;
        for (const pin of [...(attempt.output?.artifacts ?? []), ...(attempt.decision?.receipt.artifacts ?? [])]) {
          expected.set(pin.path, pin);
        }
      }
      const actual = await this.readPins([...expected.values()]);
      for (const pin of actual) {
        const recorded = expected.get(pin.path)!;
        if (recorded.sha256 !== pin.sha256 || recorded.byteLength !== pin.byteLength) {
          throw new ExpertsError('experts/conflict', `交付前文件版本校验失败：${pin.path} 已与验收版本不一致。`, { reason: 'stale-artifact', path: pin.path });
        }
      }
      const deliveredAt = new Date().toISOString();
      const next = await this.mutate(run, (current) => ({
        ...current, delivery: { deliveredAt, artifacts: actual }, updatedAt: deliveredAt,
      }), signal);
      await this.audit(actor, 'experts.team-deliver', runId, 'succeeded', 'experts/team-delivered', { artifacts: String(actual.length) });
      return next;
    });
  }

  // ── provider admission port ──────────────────────────────────────────────

  /**
   * Resolve the member revision a one-shot start is authorized for. Called by
   * the delegation provider before claim and before every model step, so a
   * withdrawn or superseded admission fails closed. Throws when no live stage
   * attempt matches the label/id.
   */
  async authorizeDelegation(input: DelegationAdmissionInput): Promise<{ expertRevisionRef: ExpertRevisionRef } | undefined> {
    const { actor, parent, sessionId, phase } = input;
    assertActorContext(actor);
    for (const [, run] of this.runsTable().entries()) {
      if (run.hostSessionId !== parent.id) continue;
      if (run.owner.ownerPrincipalId !== actor.principalId || run.owner.organizationId !== actor.organizationId) continue;
      for (const stage of run.state.plan.stages) {
        const attempt = run.state.attempts[stage.id]?.at(-1);
        if (!attempt || attempt.abandoned || attempt.decision) continue;
        const memberKey = attempt.workSessionId === sessionId && !attempt.output ? stage.worker
          : attempt.reviewSessionId === sessionId && attempt.output && (phase === 'run' || !attempt.proposal) ? stage.reviewer : undefined;
        if (memberKey) {
          // The host binding must still be live for any member to run.
          await this.ctx.workdshExperts.verifyBinding(actor, run.hostSessionId, input.signal);
          const memberRef = run.members[memberKey];
          if (!memberRef) break;
          return { expertRevisionRef: memberRef };
        }
      }
    }
    throw new ExpertsError('experts/forbidden', '该子任务没有有效的团队 SOP 准入。', { reason: 'no-current-admission' });
  }
}
