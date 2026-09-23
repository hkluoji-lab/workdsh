/**
 * Assistant domain runtime values, owned locally by the assistant plugin (D16 / P1-12).
 *
 * ADR-0019 (installable Host self-containment): an installed Host `dist/*.js` may only
 * import official `@deepseek-ai/*` packages, declared npm dependencies, Node builtins
 * and its own workspace source — never the private `workdsh-contracts` package. The
 * shared governance/assistant types are therefore imported `type`-only and erased from
 * the emitted JavaScript, while the runtime guards below stay local.
 */
import type { ActorContext } from 'workdsh-contracts';
import type { AssistantBrief, AssistantReference, AssistantReferenceKind, AssistantRevisionInput, AssistantTriggers } from '../shared.js';

/** Field limits. String maxima are Unicode code points. */
export const ASSISTANT_LIMITS = Object.freeze({
  nameMax: 80,
  descriptionMax: 300,
  proseMax: 2000,
  referencesMax: 32,
  triggerTextMax: 200,
  workspacePathMax: 1024,
  searchMaxChars: 200,
} as const);

const REFERENCE_KINDS: readonly AssistantReferenceKind[] = ['skill', 'expert', 'connector'];

/** Domain error carrying a stable `assistant/…` code. Never leaks another owner's content. */
export class AssistantError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

/**
 * Structural actor-context error, kept separate from `AssistantError` so the transport
 * maps it exactly as the governance contract expects.
 */
export class ActorContextError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ActorContextError';
  }
}

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

const text = (value: unknown, code: string, max: number, { required = false } = {}): string => {
  if (typeof value !== 'string') throw new AssistantError(code, `Invalid text field for ${code}.`);
  const next = value.trim();
  if ((required && !next) || [...next].length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(next)) {
    throw new AssistantError(code, `Invalid text field for ${code}.`);
  }
  return next;
};

function normalizeReference(value: AssistantReference): AssistantReference {
  if (!value || typeof value !== 'object') throw new AssistantError('assistant/invalid-reference', '引用格式无效。');
  if (!REFERENCE_KINDS.includes(value.kind)) throw new AssistantError('assistant/invalid-reference', '引用类型无效。');
  const id = text(value.id, 'assistant/invalid-reference', 256, { required: true });
  const label = text(value.label, 'assistant/invalid-reference', 256, { required: true });
  const revision = value.revision === undefined ? undefined : text(value.revision, 'assistant/invalid-reference', 256, { required: true });
  if (value.kind === 'connector' && revision !== undefined) throw new AssistantError('assistant/invalid-reference', '连接器实例不支持修订引用。');
  return { kind: value.kind, id, label, ...(revision === undefined ? {} : { revision }) };
}

function normalizeBrief(value: AssistantBrief): AssistantBrief {
  if (!value || typeof value !== 'object') throw new AssistantError('assistant/invalid-brief', '职责描述格式无效。');
  return {
    goal: text(value.goal, 'assistant/invalid-brief', ASSISTANT_LIMITS.proseMax, { required: true }),
    style: text(value.style ?? '', 'assistant/invalid-brief', ASSISTANT_LIMITS.proseMax),
    boundary: text(value.boundary ?? '', 'assistant/invalid-brief', ASSISTANT_LIMITS.proseMax),
  };
}

function normalizeTriggers(value: AssistantTriggers): AssistantTriggers {
  if (!value || typeof value !== 'object') throw new AssistantError('assistant/invalid-triggers', '触发方式格式无效。');
  const manual = value.manual === true;
  const schedule = value.schedule === undefined ? undefined : text(value.schedule, 'assistant/invalid-triggers', ASSISTANT_LIMITS.triggerTextMax);
  const inbound = value.inbound === undefined ? undefined : text(value.inbound, 'assistant/invalid-triggers', ASSISTANT_LIMITS.triggerTextMax);
  if (!manual && !schedule && !inbound) throw new AssistantError('assistant/invalid-triggers', '至少需要一种触发方式。');
  return { manual, ...(schedule ? { schedule } : {}), ...(inbound ? { inbound } : {}) };
}

/** Validate and clean one authored revision. Rejections are explicit; nothing is silently dropped. */
export function normalizeInput(input: AssistantRevisionInput): AssistantRevisionInput {
  if (!input || typeof input !== 'object') throw new AssistantError('assistant/invalid-input', '助理内容无效。');
  const name = text(input.name, 'assistant/invalid-name', ASSISTANT_LIMITS.nameMax, { required: true });
  const description = text(input.description ?? '', 'assistant/invalid-description', ASSISTANT_LIMITS.descriptionMax);
  const brief = normalizeBrief(input.brief);
  const triggers = normalizeTriggers(input.triggers);
  const raw = input.references ?? [];
  if (!Array.isArray(raw) || raw.length > ASSISTANT_LIMITS.referencesMax) throw new AssistantError('assistant/invalid-reference', '引用数量超出限制。');
  const seen = new Map<string, AssistantReference>();
  for (const value of raw) {
    const reference = normalizeReference(value);
    seen.set(`${reference.kind}:${reference.id}`, reference);
  }
  const workspacePath = input.workspacePath === undefined
    ? undefined
    : text(input.workspacePath, 'assistant/invalid-workspace', ASSISTANT_LIMITS.workspacePathMax, { required: true });
  return { name, description, brief, references: [...seen.values()], triggers, ...(workspacePath ? { workspacePath } : {}) };
}

/** Extract a stable `assistant/…` code from an unknown thrown value, else fall back. */
export function errorCode(error: unknown, fallback = 'assistant/internal'): string {
  if (error instanceof AssistantError && typeof error.code === 'string') return error.code;
  if (error instanceof ActorContextError) return error.code;
  if (error instanceof Error && error.message.startsWith('assistant/')) return error.message;
  return fallback;
}
