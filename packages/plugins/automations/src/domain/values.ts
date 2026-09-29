/**
 * Automations domain runtime values (D12 / P2-03, automation module 0.1).
 *
 * ADR-0019 (installable Host self-containment): an installed Host `dist/*.js` may only
 * import official `@deepseek-ai/*` packages, declared npm dependencies, Node builtins
 * and its own workspace source — never the private `workdsh-contracts` package. The
 * shared contract types are therefore imported `type`-only and erased from the emitted
 * JavaScript, while every runtime guard below stays local.
 */
import { isAbsolute } from 'node:path';
import type { ActorContext } from 'workdsh-contracts';
import type { AutomationRuleInput, AutomationSchedule, AutomationTarget } from 'workdsh-contracts/automations';
import { AUTOMATION_MIN_INTERVAL_SECONDS, assertSchedule, isoAt, upcomingRuns } from './cron.js';
import { ActorContextError, AutomationError } from './error.js';

export { AUTOMATION_MIN_INTERVAL_SECONDS };

/** Field limits. String maxima are Unicode code points. */
export const AUTOMATION_LIMITS = Object.freeze({
  nameMax: 80,
  descriptionMax: 300,
  taskMax: 4000,
  connectorMax: 32,
  idMax: 256,
  pathMax: 1024,
  searchMaxChars: 200,
  previewMax: 10,
  occurrencePageMax: 100,
  runPageMax: 100,
});
/** Longest accepted cron/zone text, so a hostile field cannot outgrow the limits above. */
const scheduleTextMax = 128;

function requireContextString(value: unknown, field: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value.length > 256 || /[\u0000-\u001f]/.test(value)) {
    throw new ActorContextError('governance/invalid-context', `Invalid ${field}.`);
  }
}

/** Minimal structural guard for a Host-resolved actor context (defence in depth). */
export function assertActorContext(value: unknown): asserts value is ActorContext {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ActorContextError('governance/invalid-context', 'Actor context must be a record.');
  }
  const actor = value as Partial<ActorContext>;
  requireContextString(actor.principalId, 'principalId');
  requireContextString(actor.organizationId, 'organizationId');
  requireContextString(actor.requestId, 'requestId');
  requireContextString(actor.resolvedBy, 'resolvedBy');
  if (actor.sessionId !== undefined) requireContextString(actor.sessionId, 'sessionId');
  if (actor.runId !== undefined) requireContextString(actor.runId, 'runId');
}

/** The Host service resolves this actor for scheduler-driven work; no client supplies it. */
export function systemActor(principalId: string, organizationId: string, resolvedBy: string): ActorContext {
  return { principalId, organizationId, requestId: `automations-${Date.now().toString(36)}`, resolvedBy };
}

const text = (value: unknown, code: AutomationError['code'], max: number, { required = false } = {}): string => {
  if (typeof value !== 'string') throw new AutomationError(code, '字段类型无效。');
  const next = value.trim();
  if ((required && !next) || [...next].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(next)) {
    throw new AutomationError(code, '字段内容无效或超出长度限制。');
  }
  return next;
};

const optional = (value: unknown, code: AutomationError['code'], max: number): string | undefined =>
  value === undefined || value === null ? undefined : text(value, code, max, { required: true });

function normalizeSchedule(value: AutomationSchedule): AutomationSchedule {
  if (!value || typeof value !== 'object') throw new AutomationError('invalid_schedule', '计划配置无效。');
  const timeZone = text(value.timeZone, 'invalid_time_zone', scheduleTextMax, { required: true });
  const activeFrom = optional(value.activeFrom, 'invalid_schedule', 64);
  const activeUntil = optional(value.activeUntil, 'invalid_schedule', 64);
  const window = { ...(activeFrom === undefined ? {} : { activeFrom }), ...(activeUntil === undefined ? {} : { activeUntil }) };
  const schedule: AutomationSchedule = value.kind === 'once'
    ? { kind: 'once', at: text(value.at, 'invalid_schedule', 64, { required: true }), timeZone, ...window }
    : { kind: 'cron', cron: text(value.cron, 'invalid_cron', scheduleTextMax, { required: true }), timeZone, ...window };
  assertSchedule(schedule);
  return schedule;
}

function normalizeTarget(value: AutomationTarget): AutomationTarget {
  if (!value || typeof value !== 'object') throw new AutomationError('invalid_input', '执行配置无效。');
  const rawConnectors = value.connectorIds ?? [];
  if (!Array.isArray(rawConnectors) || rawConnectors.length > AUTOMATION_LIMITS.connectorMax) {
    throw new AutomationError('invalid_input', '连接器数量超出限制。');
  }
  const connectorIds = [...new Set(rawConnectors.map(id => text(id, 'invalid_input', AUTOMATION_LIMITS.idMax, { required: true })))];
  const expertId = optional(value.expertId, 'invalid_input', AUTOMATION_LIMITS.idMax);
  const expertRevisionId = optional(value.expertRevisionId, 'invalid_input', AUTOMATION_LIMITS.idMax);
  if (expertRevisionId !== undefined && expertId === undefined) {
    throw new AutomationError('invalid_input', '固定专家修订时必须同时指定专家。');
  }
  const workspacePath = optional(value.workspacePath, 'invalid_input', AUTOMATION_LIMITS.pathMax);
  if (workspacePath !== undefined && !isAbsolute(workspacePath)) {
    throw new AutomationError('invalid_input', '工作区必须是绝对路径。');
  }
  const expertLabel = optional(value.expertLabel, 'invalid_input', AUTOMATION_LIMITS.nameMax);
  const projectId = optional(value.projectId, 'invalid_input', AUTOMATION_LIMITS.idMax);
  return {
    ...(expertId === undefined ? {} : { expertId }),
    ...(expertRevisionId === undefined ? {} : { expertRevisionId }),
    ...(expertLabel === undefined ? {} : { expertLabel }),
    ...(projectId === undefined ? {} : { projectId }),
    connectorIds,
    ...(workspacePath === undefined ? {} : { workspacePath }),
    task: text(value.task, 'invalid_input', AUTOMATION_LIMITS.taskMax, { required: true }),
    agentPreset: text(value.agentPreset, 'invalid_input', AUTOMATION_LIMITS.idMax, { required: true }),
    permissionPreset: text(value.permissionPreset, 'invalid_input', AUTOMATION_LIMITS.idMax, { required: true }),
  };
}

/**
 * Validate and clean one authored rule submission. The schedule is checked with the same
 * evaluator the scheduler uses, so a rule that cannot be previewed cannot be saved either.
 */
export function normalizeRuleInput(input: AutomationRuleInput): AutomationRuleInput {
  if (!input || typeof input !== 'object') throw new AutomationError('invalid_input', '定时任务内容无效。');
  return {
    name: text(input.name, 'invalid_input', AUTOMATION_LIMITS.nameMax, { required: true }),
    description: text(input.description ?? '', 'invalid_input', AUTOMATION_LIMITS.descriptionMax),
    schedule: normalizeSchedule(input.schedule),
    target: normalizeTarget(input.target),
    ...(input.startPaused === true ? { startPaused: true } : {}),
  };
}

/** Coerce a requested preview length into the accepted range. */
export const previewCount = (count: number | undefined): number =>
  Math.max(1, Math.min(Math.trunc(count ?? 5) || 1, AUTOMATION_LIMITS.previewMax));

/** Preview helper shared by the page, the Agent tool and the service. */
export const previewRuns = (schedule: AutomationSchedule, fromMs: number, count?: number): readonly string[] =>
  upcomingRuns(schedule, fromMs, previewCount(count)).map(isoAt);
