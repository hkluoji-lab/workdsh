/**
 * The single Host domain service for automations (D12 / P2-03, P2-04, module 0.1).
 *
 * The page, the Agent tools and the scheduler all call exactly this surface, so a rule
 * behaves identically no matter who triggered it. Every read and write takes a
 * Host-resolved `ActorContext`; no method accepts an owner, organization or confirmation
 * flag from a client or a model.
 *
 * What this service owns: rules and their append-only revisions, the persisted due
 * instants (occurrences) that make repeated delivery of one instant impossible, run
 * records with their provenance and receipt, and the idempotency indexes for manual
 * requests and inbound deliveries. What it deliberately does not own: the Session, the
 * Agent loop, tool approval and sandboxing, model routing and the official Job table —
 * all of those stay with the Harness. Execution reaches this service only through
 * `AutomationExecutionBridge`, which the scheduler sub-plugin implements, so a Host
 * without the scheduler reports `not_ready` instead of a fabricated run.
 *
 * No run status is a cached execution state: `running` means the Session was created and
 * the prompt admitted, and everything after that is derived from the official Session
 * facts through `reconcileRun` / the scheduler pass.
 */
import { randomUUID } from 'node:crypto';
import { Context, Service } from '@deepseek-ai/cordis';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { ActorContext } from 'workdsh-contracts';
import { AutomationError } from '../domain/error.js';
import { assertActorContext, AUTOMATION_LIMITS, normalizeRuleInput, previewRuns } from '../domain/values.js';
import { assertSchedule, isoAt, upcomingRuns } from '../domain/cron.js';
import type {
  AutomationBinding,
  AutomationClaim,
  AutomationExecutionBridge,
  AutomationMaintenance,
  AutomationRunOutcome,
} from '../domain/bridge.js';
import {
  automationDomainSpec,
  automationOccurrenceKey,
  automationRevisionKey,
  automationStateKey,
  emptyState,
  type AutomationState,
  type AutomationStoredState,
} from '../storage/domain.js';
import type {
  AutomationRule,
  AutomationRuleDetail,
  AutomationRuleInput,
  AutomationRuleRevision,
  AutomationRuleSummary,
  AutomationRun,
  AutomationRunQuery,
  AutomationRunStatus,
  AutomationRunView,
  AutomationSchedule,
  AutomationTarget,
  AutomationsService,
  ScheduleOccurrence,
} from '../shared.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshAutomations: AutomationsService;
  }
}

const timestamp = (): string => new Date().toISOString();

/** Statuses that mean the previous run has not finished; a new trigger must not overlap it. */
const ACTIVE_RUN_STATUSES: readonly AutomationRunStatus[] = ['queued', 'running', 'uncertain'];

/** Most missed instants one catch-up merge records, so a long outage cannot write unbounded rows. */
const CATCH_UP_LIMIT = 100;

/** Default and maximum pages of the run history. */
const DEFAULT_RUN_LIMIT = 50;

/** Readable text of a skip; the code travels separately so both stay stable. */
const SKIP_REASONS = {
  rule_busy: '上一次运行尚未结束，本次触发已跳过。',
  rule_paused: '规则已暂停，本次待触发时刻不再执行。',
  rule_archived: '规则已归档，本次待触发时刻不再执行。',
  rule_revised: '规则已被新修订替代，本次待触发时刻按旧组合取消。',
} as const;

type Stored = AutomationStoredState;

/** Immutable map helpers; stored records are replaced, never mutated in place. */
const withEntry = <T>(map: Record<string, T>, key: string, value: T): Record<string, T> => ({ ...map, [key]: value });
const withoutEntry = <T>(map: Record<string, T>, key: string): Record<string, T> =>
  Object.fromEntries(Object.entries(map).filter(([name]) => name !== key));

export class AutomationsManager extends Service implements AutomationsService {
  static inject = ['storageDomain'];

  private table?: KvTable<string, AutomationState>;
  private serial: Promise<unknown> = Promise.resolve();
  private execution?: AutomationExecutionBridge;

  constructor(ctx: Context) {
    super(ctx, 'workdshAutomations');
  }

  async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(automationDomainSpec);
    this.table = domain.table('states');
    this.ctx.effect(() => () => domain.close(), 'workdshAutomations.domainClose');
  }

  /**
   * Point this service at the executing half of the package. Called by the scheduler
   * sub-plugin on load and with `undefined` on unload, so an unloaded scheduler can never
   * leave a stale dispatcher behind.
   */
  setExecution(bridge: AutomationExecutionBridge | undefined): void {
    this.execution = bridge;
  }

  // ---------------------------------------------------------------- readable surface

  list(actor: ActorContext, query = '', signal?: AbortSignal): Promise<readonly AutomationRuleSummary[]> {
    return this.enqueue(async () => {
      const state = await this.read(actor);
      return this.summaries(actor, state, row => row.state !== 'archived', query, signal);
    });
  }

  listArchived(actor: ActorContext, query = '', signal?: AbortSignal): Promise<readonly AutomationRuleSummary[]> {
    return this.enqueue(async () => {
      const state = await this.read(actor);
      return this.summaries(actor, state, row => row.state === 'archived', query, signal);
    });
  }

  /**
   * Read-only surface of the project configuration sidebar: the rules the actor can see,
   * narrowed to one project. It shares `list`'s filtering so the sidebar count and the
   * automations page can never disagree.
   */
  listRules(actor: ActorContext, projectId?: string): Promise<readonly AutomationRuleSummary[]> {
    return this.enqueue(async () => {
      const state = await this.read(actor);
      const rows = await this.summaries(actor, state, row => row.state !== 'archived', '');
      return projectId === undefined ? rows : rows.filter(row => row.projectId === projectId);
    });
  }

  get(actor: ActorContext, ruleId: string, signal?: AbortSignal): Promise<AutomationRuleDetail> {
    return this.enqueue(async () => {
      const state = await this.read(actor);
      return this.detail(actor, state, this.requireRule(state, ruleId), signal);
    });
  }

  listOccurrences(actor: ActorContext, ruleId: string, limit?: number, signal?: AbortSignal): Promise<readonly ScheduleOccurrence[]> {
    return this.enqueue(async () => {
      const state = await this.read(actor);
      this.requireRule(state, ruleId);
      const max = this.pageSize(limit, 20, AUTOMATION_LIMITS.occurrencePageMax);
      return Object.values(state.occurrences)
        .filter(row => row.ruleId === ruleId)
        .sort((left, right) => right.scheduledAt.localeCompare(left.scheduledAt))
        .slice(0, max);
    });
  }

  listRuns(actor: ActorContext, query: AutomationRunQuery = {}, signal?: AbortSignal): Promise<readonly AutomationRunView[]> {
    return this.enqueue(async () => {
      const state = await this.read(actor);
      const owned = new Set(Object.keys(state.rules));
      const max = this.pageSize(query.limit, DEFAULT_RUN_LIMIT, AUTOMATION_LIMITS.runPageMax);
      return Object.values(state.runs)
        .filter((run): run is AutomationRun => owned.has(run.ruleId)
          && (query.ruleId === undefined || run.ruleId === query.ruleId)
          && (query.status === undefined || run.status === query.status)
          && (query.source === undefined || run.source === query.source))
        .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
        .slice(0, max)
        .map(run => this.runView(state, run));
    });
  }

  /** Pure evaluation: nothing is stored, so an unsaved draft can be previewed too. */
  previewNextRuns(actor: ActorContext, schedule: AutomationSchedule, count?: number, signal?: AbortSignal): Promise<readonly string[]> {
    return this.enqueue(async () => {
      assertActorContext(actor);
      assertSchedule(schedule);
      return previewRuns(schedule, Date.now(), count);
    });
  }

  // ------------------------------------------------------------------- write surface

  create(actor: ActorContext, input: AutomationRuleInput, signal?: AbortSignal): Promise<AutomationRuleDetail> {
    return this.enqueue(async () => {
      assertActorContext(actor);
      const clean = normalizeRuleInput(input);
      await this.assertTargetResolvable(actor, clean.target, signal);
      const state = await this.read(actor);
      const now = timestamp();
      const ruleId = randomUUID();
      const revision: AutomationRuleRevision = {
        ruleId,
        revision: 1,
        schedule: clean.schedule,
        target: clean.target,
        createdBy: actor.principalId,
        createdAt: now,
      };
      const rule: AutomationRule = {
        ruleId,
        organizationId: actor.organizationId,
        ownerPrincipalId: actor.principalId,
        name: clean.name,
        description: clean.description,
        state: clean.startPaused === true ? 'paused' : 'enabled',
        revision: 1,
        createdAt: now,
        updatedAt: now,
      };
      let next: Stored = {
        ...state,
        rules: withEntry(state.rules, ruleId, rule),
        revisions: withEntry(state.revisions, automationRevisionKey(ruleId, 1), revision),
      };
      if (rule.state === 'enabled') next = this.materialize(next, rule, revision, Date.now());
      await this.put(actor, next);
      return this.detail(actor, next, rule);
    });
  }

  update(actor: ActorContext, ruleId: string, input: AutomationRuleInput, expectedRevision: number, signal?: AbortSignal): Promise<AutomationRuleDetail> {
    return this.enqueue(async () => {
      assertActorContext(actor);
      const clean = normalizeRuleInput(input);
      await this.assertTargetResolvable(actor, clean.target, signal);
      const state = await this.read(actor);
      const current = this.requireRule(state, ruleId);
      if (current.state === 'archived') throw new AutomationError('invalid_input', '已归档的规则不能编辑，请先恢复。');
      if (current.revision !== expectedRevision) throw new AutomationError('stale_revision', '规则已被更新，请刷新后重试。');
      const now = timestamp();
      const revisionNumber = current.revision + 1;
      const revision: AutomationRuleRevision = {
        ruleId,
        revision: revisionNumber,
        schedule: clean.schedule,
        target: clean.target,
        createdBy: actor.principalId,
        createdAt: now,
      };
      const rule: AutomationRule = { ...current, name: clean.name, description: clean.description, revision: revisionNumber, updatedAt: now };
      // A pending instant still belongs to the superseded revision. Cancel it instead of
      // firing a combination the user just replaced; an already claimed instant keeps its
      // own revision, so a running task is never silently re-combined.
      let next: Stored = {
        ...state,
        rules: withEntry(state.rules, ruleId, rule),
        revisions: withEntry(state.revisions, automationRevisionKey(ruleId, revisionNumber), revision),
        occurrences: this.cancelPending(state.occurrences, ruleId, SKIP_REASONS.rule_revised),
        diagnoses: withoutEntry(state.diagnoses, ruleId),
      };
      if (rule.state === 'enabled') next = this.materialize(next, rule, revision, Date.now());
      await this.put(actor, next);
      return this.detail(actor, next, rule);
    });
  }

  enable(actor: ActorContext, ruleId: string, signal?: AbortSignal): Promise<AutomationRuleDetail> {
    return this.enqueue(async () => {
      assertActorContext(actor);
      const state = await this.read(actor);
      const current = this.requireRule(state, ruleId);
      const revision = this.requireRevision(state, current);
      await this.assertTargetResolvable(actor, revision.target, signal);
      const rule: AutomationRule = { ...current, state: 'enabled', updatedAt: timestamp() };
      let next: Stored = {
        ...state,
        rules: withEntry(state.rules, ruleId, rule),
        diagnoses: withoutEntry(state.diagnoses, ruleId),
      };
      next = this.materialize(next, rule, revision, Date.now());
      await this.put(actor, next);
      return this.detail(actor, next, rule);
    });
  }

  disable(actor: ActorContext, ruleId: string, signal?: AbortSignal): Promise<AutomationRuleDetail> {
    return this.setPaused(actor, ruleId, 'paused', SKIP_REASONS.rule_paused);
  }

  archive(actor: ActorContext, ruleId: string, signal?: AbortSignal): Promise<AutomationRule> {
    return this.enqueue(async () => (await this.pauseRule(actor, ruleId, 'archived', SKIP_REASONS.rule_archived)).rule);
  }

  /**
   * One `source: 'manual'` run, idempotent on `requestId`. The queued record is durable
   * before the Session is created, so a crash mid-dispatch leaves evidence to reconcile
   * instead of a silently lost run.
   *
   * The Session is created outside the mutation tail: dispatch takes as long as the
   * Harness needs, and non-overlap is enforced by the durable `queued` run — not by
   * holding the queue, which would stall every page and tool call meanwhile.
   */
  async runNow(actor: ActorContext, ruleId: string, requestId: string, signal?: AbortSignal): Promise<AutomationRunView> {
    const prepared = await this.enqueue(async () => {
      assertActorContext(actor);
      const clean = requestId?.trim();
      if (!clean || clean.length > AUTOMATION_LIMITS.idMax) throw new AutomationError('invalid_input', '请求标识无效。');
      const state = await this.read(actor);
      const rule = this.requireRule(state, ruleId);
      if (rule.state === 'archived') throw new AutomationError('invalid_input', '已归档的规则不能立即运行。');
      const replay = state.manualRequests[clean];
      const previous = replay === undefined ? undefined : state.runs[replay];
      if (previous) return { replay: this.runView(state, previous) };
      const busy = this.busyRun(state, ruleId);
      if (busy) {
        throw new AutomationError('rule_busy', '上一次运行尚未结束，无法立即运行。', { runId: busy.runId, status: busy.status });
      }
      const execution = this.requireExecution();
      const revision = this.requireRevision(state, rule);
      const binding = await this.resolveTarget(actor, revision.target, signal);
      const now = timestamp();
      const run: AutomationRun = {
        runId: randomUUID(),
        ruleId,
        ruleRevision: rule.revision,
        source: 'manual',
        status: 'queued',
        startedAt: now,
        resolvedBindingDigest: binding.digest,
        requestId: clean,
      };
      await this.put(actor, {
        ...state,
        runs: withEntry(state.runs, run.runId, run),
        manualRequests: withEntry(state.manualRequests, clean, run.runId),
      });
      return { execution, claim: { stateKey: this.keyOf(actor), actor, rule, revision, run }, binding };
    });
    if (prepared.replay !== undefined) return prepared.replay;
    return this.settle(prepared.claim, await prepared.execution.dispatch(prepared.claim, prepared.binding, signal));
  }

  /** Reconcile an unfinished run against the official Session facts before any retry. */
  async reconcileRun(actor: ActorContext, runId: string, signal?: AbortSignal): Promise<AutomationRunView> {
    const prepared = await this.enqueue(async () => {
      assertActorContext(actor);
      const state = await this.read(actor);
      const run = state.runs[runId];
      if (!run) throw new AutomationError('run_not_found', '运行记录不存在或无权访问。');
      if (run.status !== 'running' && run.status !== 'queued' && run.status !== 'uncertain') {
        throw new AutomationError('invalid_input', '该运行已有最终状态，无需对账。');
      }
      const execution = this.requireExecution();
      const rule = this.requireRule(state, run.ruleId);
      const revision = this.requireRevision(state, rule);
      return { execution, claim: { stateKey: this.keyOf(actor), actor, rule, revision, run } };
    });
    return this.settle(prepared.claim, await prepared.execution.reconcile(prepared.claim, signal));
  }

  // ------------------------------------------------------- scheduler-facing surface

  /**
   * One scheduler pass over every principal's records. It advances the bookkeeping the
   * design assigns to persisted occurrences — materialize the next instant, merge the
   * instants missed while the Host was down, skip an instant whose rule is still busy —
   * and returns what the scheduler must dispatch and reconcile. Called by the holding
   * scheduler only; it is deliberately absent from `AutomationsService`.
   */
  maintain(nowMs: number, ownerId: string): Promise<AutomationMaintenance> {
    return this.enqueue(async () => {
      const claims: AutomationClaim[] = [];
      const reconcilable: AutomationClaim[] = [];
      for (const [key, raw] of this.entries()) {
        let state = raw as Stored;
        let dirty = false;
        for (const run of Object.values(state.runs)) {
          if (!ACTIVE_RUN_STATUSES.includes(run.status)) continue;
          const rule = state.rules[run.ruleId];
          const revision = rule ? this.revisionOf(state, rule) : undefined;
          if (!rule || !revision) continue;
          const occurrence = run.occurrenceId === undefined ? undefined : state.occurrences[run.occurrenceId];
          reconcilable.push({
            stateKey: key,
            actor: this.ownerActor(rule, run.runId),
            rule,
            revision,
            ...(occurrence ? { occurrence } : {}),
            run,
          });
        }
        for (const rule of Object.values(state.rules)) {
          if (rule.state !== 'enabled') continue;
          const revision = this.revisionOf(state, rule);
          if (!revision) {
            // A rule whose revision is gone can never run again; stop it with a diagnosis
            // rather than skipping quietly on every pass.
            state = this.stop(state, rule, 'revision_missing: 规则修订已不存在，已停止触发。');
            dirty = true;
            continue;
          }
          const advanced = this.advance(state, rule, revision, nowMs, ownerId);
          if (advanced.state !== state) {
            state = advanced.state;
            dirty = true;
          }
          if (advanced.claim) claims.push({ ...advanced.claim, stateKey: key });
        }
        if (dirty) await this.put2(key, state);
      }
      return { claims, reconcilable };
    });
  }

  /** Record what the scheduler observed for one claim. */
  settle(claim: AutomationClaim, outcome: AutomationRunOutcome): Promise<AutomationRunView> {
    return this.enqueue(() => this.recordOutcome(claim, outcome));
  }

  private async recordOutcome(claim: AutomationClaim, outcome: AutomationRunOutcome): Promise<AutomationRunView> {
    const state = await this.requireState(claim.stateKey);
    const run = state.runs[claim.run.runId] ?? claim.run;
    const rule = state.rules[run.ruleId];
    if (!rule) throw new AutomationError('rule_not_found', '规则不存在或无权访问。');
    const revision = this.revisionOf(state, rule) ?? claim.revision;
    const next = this.applyOutcome(state, rule, revision, run, outcome);
    await this.put2(claim.stateKey, next.state);
    return next.view;
  }

  // ------------------------------------------------------------------------- helpers

  private setPaused(actor: ActorContext, ruleId: string, state_: 'paused' | 'archived', reason: string): Promise<AutomationRuleDetail> {
    return this.enqueue(() => this.pauseRule(actor, ruleId, state_, reason));
  }

  /**
   * Non-queued core of {@link setPaused}, so a caller already holding the mutation tail
   * (`archive`) can reuse it. A nested `enqueue` would wait on the task awaiting it.
   */
  private async pauseRule(actor: ActorContext, ruleId: string, state_: 'paused' | 'archived', reason: string): Promise<AutomationRuleDetail> {
    assertActorContext(actor);
    const state = await this.read(actor);
    const current = this.requireRule(state, ruleId);
    if (current.state === state_) return this.detail(actor, state, current);
    const rule: AutomationRule = { ...current, state: state_, updatedAt: timestamp() };
    // A claimed instant is left alone: the run it belongs to is already in flight.
    const next: Stored = {
      ...state,
      rules: withEntry(state.rules, ruleId, rule),
      occurrences: this.cancelPending(state.occurrences, ruleId, reason),
    };
    await this.put(actor, next);
    return this.detail(actor, next, rule);
  }

  /**
   * Advance one enabled rule for this pass: materialize its next instant, or act on one
   * that has arrived. A missed window is merged into a single pending dispatch, and a rule
   * whose previous run is unfinished records a skip instead of queueing up.
   */
  private advance(
    state: Stored,
    rule: AutomationRule,
    revision: AutomationRuleRevision,
    nowMs: number,
    ownerId: string,
  ): { state: Stored; claim?: Omit<AutomationClaim, 'stateKey'> } {
    const pending = this.pendingOf(state, rule.ruleId);
    if (!pending) return { state: this.materialize(state, rule, revision, nowMs) };
    if (Date.parse(pending.scheduledAt) > nowMs) return { state };
    const nowIso = isoAt(nowMs);
    const busy = this.busyRun(state, rule.ruleId);
    if (busy) {
      const skipped: ScheduleOccurrence = {
        ...pending,
        state: 'skipped',
        skipReason: SKIP_REASONS.rule_busy,
      };
      const run: AutomationRun = {
        runId: randomUUID(),
        ruleId: rule.ruleId,
        ruleRevision: revision.revision,
        occurrenceId: pending.occurrenceId,
        source: 'schedule',
        status: 'skipped',
        startedAt: nowIso,
        finishedAt: nowIso,
        // `failureReason` carries the stable code plus its readable text, while
        // `skipReason` is the readable sentence the page shows (CONTRACTS.md 1.3 / 1.2).
        failureReason: `rule_busy: ${SKIP_REASONS.rule_busy}`,
        requestId: pending.occurrenceId,
      };
      const next: Stored = {
        ...state,
        occurrences: withEntry(state.occurrences, skipped.occurrenceId, skipped),
        runs: withEntry(state.runs, run.runId, run),
      };
      return { state: this.materialize(next, rule, revision, nowMs) };
    }
    const merged = this.mergeMissed(state, rule, revision, pending, nowMs);
    const occurrence: ScheduleOccurrence = { ...pending, state: 'claimed', claimedBy: ownerId, claimedAt: nowIso };
    const run: AutomationRun = {
      runId: randomUUID(),
      ruleId: rule.ruleId,
      ruleRevision: revision.revision,
      occurrenceId: occurrence.occurrenceId,
      source: 'schedule',
      status: 'queued',
      startedAt: nowIso,
      requestId: occurrence.occurrenceId,
    };
    const claimed: Stored = {
      ...merged,
      occurrences: withEntry(merged.occurrences, occurrence.occurrenceId, occurrence),
      runs: withEntry(merged.runs, run.runId, run),
    };
    return {
      state: this.materialize(claimed, rule, revision, nowMs),
      claim: { actor: this.ownerActor(rule, run.runId), rule, revision, occurrence, run },
    };
  }

  /** Record these instants as merged into the one that will actually run. */
  private mergeMissed(
    state: Stored,
    rule: AutomationRule,
    revision: AutomationRuleRevision,
    keeper: ScheduleOccurrence,
    nowMs: number,
  ): Stored {
    let occurrences = state.occurrences;
    let cursor = Date.parse(keeper.scheduledAt);
    for (let index = 0; index < CATCH_UP_LIMIT; index += 1) {
      const [instant] = upcomingRuns(revision.schedule, cursor, 1);
      if (instant === undefined || instant > nowMs) break;
      cursor = instant;
      const key = automationOccurrenceKey(rule.ruleId, revision.revision, isoAt(instant));
      if (occurrences[key]) continue;
      occurrences = withEntry(occurrences, key, {
        occurrenceId: key,
        ruleId: rule.ruleId,
        ruleRevision: revision.revision,
        scheduledAt: isoAt(instant),
        state: 'merged',
        mergedIntoOccurrenceId: keeper.occurrenceId,
      });
    }
    return occurrences === state.occurrences ? state : { ...state, occurrences };
  }

  /** Add the rule's next future instant as a pending occurrence, if the schedule has one. */
  private materialize(state: Stored, rule: AutomationRule, revision: AutomationRuleRevision, fromMs: number): Stored {
    const [instant] = upcomingRuns(revision.schedule, fromMs, 1);
    if (instant === undefined) return state;
    const scheduledAt = isoAt(instant);
    const key = automationOccurrenceKey(rule.ruleId, revision.revision, scheduledAt);
    // The triple already exists — including as a merged or skipped record — so this instant
    // is known. Re-inserting it is exactly the duplicate the idempotency key prevents.
    if (state.occurrences[key]) return state;
    return {
      ...state,
      occurrences: withEntry(state.occurrences, key, {
        occurrenceId: key,
        ruleId: rule.ruleId,
        ruleRevision: revision.revision,
        scheduledAt,
        state: 'pending',
      }),
    };
  }

  private applyOutcome(
    state: Stored,
    rule: AutomationRule,
    revision: AutomationRuleRevision,
    run: AutomationRun,
    outcome: AutomationRunOutcome,
  ): { state: Stored; view: AutomationRunView } {
    const nowIso = timestamp();
    const terminal = outcome.status !== 'running';
    const recorded: AutomationRun = {
      ...run,
      status: outcome.status,
      ...(outcome.sessionId === undefined ? {} : { sessionId: outcome.sessionId }),
      ...(outcome.failureReason === undefined ? {} : { failureReason: outcome.failureReason }),
      ...(outcome.digest === undefined ? {} : { resolvedBindingDigest: outcome.digest }),
      ...(terminal ? { finishedAt: nowIso } : {}),
    };
    const occurrence = run.occurrenceId === undefined ? undefined : state.occurrences[run.occurrenceId];
    const occurrences = occurrence === undefined
      ? state.occurrences
      : withEntry(state.occurrences, occurrence.occurrenceId, this.occurrenceAfter(occurrence, outcome));
    let next: Stored = {
      ...state,
      runs: withEntry(state.runs, recorded.runId, recorded),
      occurrences,
      diagnoses: outcome.stop === undefined && (outcome.status === 'running' || outcome.status === 'succeeded')
        // A trigger that resolved and reached a Session proves the combination works again.
        ? withoutEntry(state.diagnoses, rule.ruleId)
        : state.diagnoses,
    };
    if (outcome.stop !== undefined) {
      // A stopped rule must not keep a materialized instant either: `pauseRule` discards
      // pending ones for the same reason, and an instant left pending here would fire the
      // moment the user re-enables — a trigger the stop decision already threw away.
      const stopped = this.stop(next, rule, outcome.stop.reason);
      return { state: stopped, view: this.runView(stopped, recorded) };
    }
    if (rule.state === 'enabled') next = this.materialize(next, rule, revision, Date.now());
    return { state: next, view: this.runView(next, recorded) };
  }

  /**
   * What the instant's record becomes after one observed outcome.
   *
   * `dispatched` is written only on positive evidence that a Session exists. An
   * `uncertain` dispatch keeps `claimed`: whether the Session was created is exactly what
   * `reconcileRun` still has to find out, and claiming it reached a Session would be a
   * fabricated fact. An outcome with no Session and no run is `skipped`, with the readable
   * reason the page shows.
   */
  private occurrenceAfter(occurrence: ScheduleOccurrence, outcome: AutomationRunOutcome): ScheduleOccurrence {
    if (outcome.sessionId !== undefined || outcome.status === 'running' || outcome.status === 'succeeded') {
      return { ...occurrence, state: 'dispatched' };
    }
    if (outcome.status === 'uncertain' || outcome.status === 'queued') return occurrence;
    return {
      ...occurrence,
      state: 'skipped',
      skipReason: outcome.failureReason ?? outcome.stop?.reason ?? 'dispatch_failed',
    };
  }

  private stop(state: Stored, rule: AutomationRule, diagnosis: string): Stored {
    return {
      ...state,
      rules: withEntry(state.rules, rule.ruleId, { ...rule, state: 'paused', updatedAt: timestamp() }),
      diagnoses: withEntry(state.diagnoses, rule.ruleId, diagnosis),
      occurrences: this.cancelPending(state.occurrences, rule.ruleId, diagnosis),
    };
  }

  /** Cancel the rule's not-yet-claimed instants. A claimed or merged instant keeps its record. */
  private cancelPending(occurrences: Record<string, ScheduleOccurrence>, ruleId: string, reason: string): Record<string, ScheduleOccurrence> {
    let next = occurrences;
    for (const occurrence of Object.values(occurrences)) {
      if (occurrence.ruleId !== ruleId || occurrence.state !== 'pending') continue;
      next = withEntry(next, occurrence.occurrenceId, { ...occurrence, state: 'skipped', skipReason: reason });
    }
    return next;
  }

  private pendingOf(state: Stored, ruleId: string): ScheduleOccurrence | undefined {
    return Object.values(state.occurrences)
      .filter(row => row.ruleId === ruleId && row.state === 'pending')
      .sort((left, right) => left.scheduledAt.localeCompare(right.scheduledAt))[0];
  }

  private busyRun(state: Stored, ruleId: string): AutomationRun | undefined {
    return Object.values(state.runs)
      .filter(run => run.ruleId === ruleId && ACTIVE_RUN_STATUSES.includes(run.status))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt))[0];
  }

  private async summaries(
    actor: ActorContext,
    state: Stored,
    keep: (rule: AutomationRule) => boolean,
    query: string,
    signal?: AbortSignal,
  ): Promise<readonly AutomationRuleSummary[]> {
    const needle = query.trim().toLocaleLowerCase().slice(0, AUTOMATION_LIMITS.searchMaxChars);
    const latest = new Map<string, AutomationRun>();
    for (const run of Object.values(state.runs)) {
      const previous = latest.get(run.ruleId);
      if (!previous || run.startedAt > previous.startedAt) latest.set(run.ruleId, run);
    }
    const rows = Object.values(state.rules)
      .filter(rule => keep(rule) && (!needle || `${rule.name} ${rule.description}`.toLocaleLowerCase().includes(needle)))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const summaries: AutomationRuleSummary[] = [];
    for (const rule of rows) summaries.push(await this.summary(actor, state, rule, latest, signal));
    return summaries;
  }

  private async summary(
    actor: ActorContext,
    state: Stored,
    rule: AutomationRule,
    latest: Map<string, AutomationRun>,
    signal?: AbortSignal,
  ): Promise<AutomationRuleSummary> {
    const revision = this.revisionOf(state, rule);
    const pending = this.pendingOf(state, rule.ruleId);
    const last = latest.get(rule.ruleId);
    const diagnosis = await this.diagnose(actor, state, rule, revision, signal);
    return {
      ruleId: rule.ruleId,
      name: rule.name,
      state: rule.state,
      ...(revision?.target.projectId === undefined ? {} : { projectId: revision.target.projectId }),
      ...(revision?.target.expertLabel === undefined ? {} : { expertLabel: revision.target.expertLabel }),
      ...(pending === undefined ? {} : { nextRunAt: pending.scheduledAt }),
      ...(last === undefined ? {} : {
        lastRunAt: last.startedAt,
        lastRunStatus: last.status,
        ...(last.failureReason === undefined ? {} : { lastRunFailureReason: last.failureReason }),
      }),
      ...(diagnosis === undefined ? {} : { diagnosis }),
      updatedAt: rule.updatedAt,
    };
  }

  private async detail(actor: ActorContext, state: Stored, rule: AutomationRule, signal?: AbortSignal): Promise<AutomationRuleDetail> {
    const revision = this.requireRevision(state, rule);
    const diagnosis = await this.diagnose(actor, state, rule, revision, signal);
    return { rule, revision, ...(diagnosis === undefined ? {} : { diagnosis }) };
  }

  /**
   * Whether the stored combination still resolves. A diagnosis recorded when a trigger
   * stopped the rule wins over a fresh look, so the page keeps showing why it stopped until
   * the user fixes and re-enables it. Resolution failures never fail a list: an unavailable
   * sibling service or a broken reference only means "no diagnosis established here".
   */
  private async diagnose(
    actor: ActorContext,
    state: Stored,
    rule: AutomationRule,
    revision: AutomationRuleRevision | undefined,
    signal?: AbortSignal,
  ): Promise<string | undefined> {
    const stored = state.diagnoses[rule.ruleId];
    if (stored !== undefined && stored !== '') return stored;
    if (rule.state === 'archived' || revision === undefined || this.execution === undefined) return undefined;
    try {
      const resolution = await this.execution.resolveTarget(actor, revision.target, signal);
      return resolution.ok ? undefined : resolution.reason;
    } catch {
      return undefined;
    }
  }

  private runView(state: Stored, run: AutomationRun): AutomationRunView {
    const occurrence = run.occurrenceId === undefined ? undefined : state.occurrences[run.occurrenceId];
    const skippedReason = run.status === 'skipped' ? occurrence?.skipReason : undefined;
    return { ...run, ...(skippedReason === undefined ? {} : { skippedReason }) };
  }

  private requireRule(state: Stored, ruleId: string): AutomationRule {
    const rule = state.rules[ruleId];
    if (!rule) throw new AutomationError('rule_not_found', '规则不存在或无权访问。');
    return rule;
  }

  private revisionOf(state: Stored, rule: AutomationRule): AutomationRuleRevision | undefined {
    return state.revisions[automationRevisionKey(rule.ruleId, rule.revision)];
  }

  private requireRevision(state: Stored, rule: AutomationRule): AutomationRuleRevision {
    const revision = this.revisionOf(state, rule);
    if (!revision) throw new AutomationError('revision_missing', '规则修订已不存在，无法执行。');
    return revision;
  }

  /** Actor of a scheduled or webhook trigger: the rule owner, established by the Host. */
  private ownerActor(rule: AutomationRule, requestId: string): ActorContext {
    return {
      principalId: rule.ownerPrincipalId,
      organizationId: rule.organizationId,
      requestId,
      resolvedBy: 'workdsh-automations-scheduler',
    };
  }

  private async assertTargetResolvable(actor: ActorContext, target: AutomationTarget, signal?: AbortSignal): Promise<void> {
    await this.resolveTarget(actor, target, signal);
  }

  private async resolveTarget(actor: ActorContext, target: AutomationTarget, signal?: AbortSignal): Promise<AutomationBinding> {
    const resolution = await this.requireExecution().resolveTarget(actor, target, signal);
    if (!resolution.ok) throw new AutomationError(resolution.code, resolution.reason);
    return resolution.binding;
  }

  private requireExecution(): AutomationExecutionBridge {
    if (!this.execution) throw new AutomationError('not_ready', '定时任务调度器尚未就绪，请稍后重试。');
    return this.execution;
  }

  private pageSize(requested: number | undefined, fallback: number, max: number): number {
    const value = Math.trunc(requested ?? fallback);
    if (!Number.isFinite(value) || value < 1) return fallback;
    return Math.min(value, max);
  }

  private keyOf(actor: ActorContext): string {
    return automationStateKey(actor.organizationId, actor.principalId);
  }

  private async read(actor: ActorContext): Promise<Stored> {
    const key = this.keyOf(actor);
    const found = await this.requireState(key).catch(() => undefined);
    if (found) return found;
    const created = emptyState();
    await this.put2(key, created);
    return created;
  }

  private async requireState(key: string): Promise<Stored> {
    const found = this.table_().get(key);
    if (!found) throw new AutomationError('persistence_uncertain', '定时任务数据尚未建立，请重试。');
    return found as Stored;
  }

  private put(actor: ActorContext, state: Stored): Promise<void> {
    return this.put2(this.keyOf(actor), state);
  }

  private put2(key: string, state: Stored): Promise<void> {
    return this.table_().put(key, state);
  }

  private entries(): IterableIterator<[string, AutomationState]> {
    return this.table_().entries();
  }

  private table_(): KvTable<string, AutomationState> {
    if (!this.table) throw new AutomationError('not_ready', '定时任务存储尚未就绪。');
    return this.table;
  }

  /** Single mutation tail: every write below sees the previous one's result. */
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.serial.then(work, work);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }
}
