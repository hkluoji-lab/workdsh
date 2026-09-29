/**
 * Cross-plugin contract of the automations domain (D12 / P2-03, P2-04, module 0.1).
 *
 * The automations plugin owns the four objects below. Other plugins read them
 * through the Host service (`ctx.workdshAutomations`) or this type surface — never
 * through the plugin's tables or internal modules. The design source is
 * `docs/design/automations/CONTRACTS.md`; this file is its compilable form, not a
 * second set of rules.
 *
 * A rule triggers one real official Session per occurrence. Execution facts stay in
 * the Harness session log; these records only hold ownership, provenance, time and
 * receipt.
 */
import type { ActorContext } from './governance.js';

/** Scheduling lifecycle of one rule. Archived rules keep their run history. */
export type AutomationRuleState = 'enabled' | 'paused' | 'archived';

/** What caused one run. */
export type AutomationTriggerSource = 'schedule' | 'manual' | 'webhook';

/**
 * Run status. `running` means a Session was created and the prompt admitted;
 * the outcome after that derives from the official Session log through
 * {@link AutomationRun.reconcile}, not from a cached execution state.
 */
export type AutomationRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'skipped' | 'uncertain';

/** Lifecycle of one due instant. `merged` points at the occurrence that absorbed it. */
export type AutomationOccurrenceState = 'pending' | 'claimed' | 'dispatched' | 'skipped' | 'merged';

/** Reception state of one inbound delivery; never a statement about automation success. */
export type AutomationDeliveryState = 'accepted' | 'duplicate' | 'rejected' | 'dispatched';

/** Smallest accepted gap between two triggers of the same rule, in seconds. */
export const AUTOMATION_MIN_INTERVAL_SECONDS = 300;

/** `once` fires at one instant; `cron` is a 5-field POSIX expression. Both need an IANA zone. */
export interface AutomationSchedule {
  readonly kind: 'once' | 'cron';
  readonly cron?: string;
  readonly at?: string;
  readonly timeZone: string;
  readonly activeFrom?: string;
  readonly activeUntil?: string;
}

/**
 * What one run executes and with which resolved combination. The scheduler
 * re-resolves every entry at trigger time; a stored value is the request, not a grant.
 */
export interface AutomationTarget {
  readonly expertId?: string;
  /** Pinned expert revision; a missing revision stops the rule instead of falling back. */
  readonly expertRevisionId?: string;
  readonly expertLabel?: string;
  readonly projectId?: string;
  readonly connectorIds: readonly string[];
  /** Absolute working directory for the run. */
  readonly workspacePath?: string;
  /** The instruction handed to the run. */
  readonly task: string;
  readonly agentPreset: string;
  /** Fixed per trigger so an unattended run never waits on an unanswered approval. */
  readonly permissionPreset: string;
}

export interface AutomationRule {
  readonly ruleId: string;
  readonly organizationId: string;
  readonly ownerPrincipalId: string;
  readonly name: string;
  readonly description: string;
  readonly state: AutomationRuleState;
  /** Current immutable revision number; `nextRunAt` is derived from occurrences. */
  readonly revision: number;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** One append-only authored revision. Published revisions are never rewritten in place. */
export interface AutomationRuleRevision {
  readonly ruleId: string;
  readonly revision: number;
  readonly schedule: AutomationSchedule;
  readonly target: AutomationTarget;
  readonly createdBy: string;
  readonly createdAt: string;
}

export interface ScheduleOccurrence {
  readonly occurrenceId: string;
  readonly ruleId: string;
  readonly ruleRevision: number;
  /** Normalized UTC instant. `(ruleId, ruleRevision, scheduledAt)` is unique. */
  readonly scheduledAt: string;
  readonly state: AutomationOccurrenceState;
  readonly claimedBy?: string;
  readonly claimedAt?: string;
  readonly skipReason?: string;
  readonly mergedIntoOccurrenceId?: string;
}

export interface AutomationRun {
  readonly runId: string;
  readonly ruleId: string;
  readonly ruleRevision: number;
  readonly occurrenceId?: string;
  readonly source: AutomationTriggerSource;
  readonly status: AutomationRunStatus;
  /** Official Session identity; written only after the Session is created. */
  readonly sessionId?: string;
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly failureReason?: string;
  /** Digest of the combination resolved at trigger time, compared against the rule revision. */
  readonly resolvedBindingDigest?: string;
  readonly requestId: string;
}

export interface WebhookDelivery {
  readonly sourceId: string;
  readonly deliveryId: string;
  readonly ruleId: string;
  readonly receivedAt: string;
  readonly payloadDigest: string;
  readonly state: AutomationDeliveryState;
}

/** List row of the automations page and of the project configuration sidebar card. */
export interface AutomationRuleSummary {
  readonly ruleId: string;
  readonly name: string;
  readonly state: AutomationRuleState;
  readonly projectId?: string;
  readonly expertLabel?: string;
  readonly nextRunAt?: string;
  readonly lastRunAt?: string;
  readonly lastRunStatus?: AutomationRunStatus;
  readonly lastRunFailureReason?: string;
  /** Set when the stored combination no longer resolves; the rule stops instead of falling back. */
  readonly diagnosis?: string;
  readonly updatedAt: string;
}

export interface AutomationRuleDetail {
  readonly rule: AutomationRule;
  readonly revision: AutomationRuleRevision;
  readonly diagnosis?: string;
}

/** Read-only projection the page renders; the client never derives run state itself. */
export interface AutomationRunView extends AutomationRun {
  readonly skippedReason?: string;
}

/**
 * Stable domain error codes. They cross the transport as-is; clients map them to
 * readable text and never see an internal exception.
 */
export const AUTOMATION_ERROR_CODES = [
  'rule_not_found',
  'stale_revision',
  'invalid_cron',
  'invalid_time_zone',
  'interval_too_short',
  'target_unavailable',
  'authorization_revoked',
  'revision_missing',
  'rule_busy',
  'duplicate_occurrence',
  'occurrence_claimed',
  'persistence_uncertain',
  'delivery_signature_invalid',
] as const;

export type AutomationErrorCode = (typeof AUTOMATION_ERROR_CODES)[number];

/** One authored create/update submission. Every field is re-validated by the domain. */
export interface AutomationRuleInput {
  readonly name: string;
  readonly description: string;
  readonly schedule: AutomationSchedule;
  readonly target: AutomationTarget;
  /** Create the rule paused instead of enabled. */
  readonly startPaused?: boolean;
}

/** Run-history filter of the detail page. The service always narrows it to the actor's own rules. */
export interface AutomationRunQuery {
  readonly ruleId?: string;
  readonly status?: AutomationRunStatus;
  readonly source?: AutomationTriggerSource;
  readonly limit?: number;
}

/**
 * Read-only surface another plugin may depend on. The project sidebar uses
 * {@link listRules} to show only the rules the current principal can see, so the
 * count always matches the automations page. The actor is resolved by the Host, so
 * a caller cannot widen its own visibility by passing an owner.
 */
export interface AutomationCatalog {
  listRules(actor: ActorContext, projectId?: string): Promise<readonly AutomationRuleSummary[]>;
}

/**
 * The single domain service of the automations module: the page, the Agent tools and
 * the scheduler all call exactly this surface. Every method that reads or writes a rule
 * takes a Host-resolved {@link ActorContext}; none accepts an owner, organization or
 * confirmation flag from a client or a model.
 *
 * `previewNextRuns` is pure evaluation and stores nothing. `runNow` uses the same run
 * model as a scheduled trigger, so the no-overlap rule applies to it too.
 */
export interface AutomationsService extends AutomationCatalog {
  list(actor: ActorContext, query?: string, signal?: AbortSignal): Promise<readonly AutomationRuleSummary[]>;
  listArchived(actor: ActorContext, query?: string, signal?: AbortSignal): Promise<readonly AutomationRuleSummary[]>;
  get(actor: ActorContext, ruleId: string, signal?: AbortSignal): Promise<AutomationRuleDetail>;
  create(actor: ActorContext, input: AutomationRuleInput, signal?: AbortSignal): Promise<AutomationRuleDetail>;
  /** Appends a new revision. `expectedRevision` guards against overwriting a concurrent edit. */
  update(actor: ActorContext, ruleId: string, input: AutomationRuleInput, expectedRevision: number, signal?: AbortSignal): Promise<AutomationRuleDetail>;
  /** Resume an enabled lifecycle. The target is resolved again before the rule can fire. */
  enable(actor: ActorContext, ruleId: string, signal?: AbortSignal): Promise<AutomationRuleDetail>;
  disable(actor: ActorContext, ruleId: string, signal?: AbortSignal): Promise<AutomationRuleDetail>;
  archive(actor: ActorContext, ruleId: string, signal?: AbortSignal): Promise<AutomationRule>;
  /** One `source: 'manual'` run, idempotent on `requestId`. */
  runNow(actor: ActorContext, ruleId: string, requestId: string, signal?: AbortSignal): Promise<AutomationRunView>;
  previewNextRuns(actor: ActorContext, schedule: AutomationSchedule, count?: number, signal?: AbortSignal): Promise<readonly string[]>;
  listOccurrences(actor: ActorContext, ruleId: string, limit?: number, signal?: AbortSignal): Promise<readonly ScheduleOccurrence[]>;
  listRuns(actor: ActorContext, query?: AutomationRunQuery, signal?: AbortSignal): Promise<readonly AutomationRunView[]>;
  /** Reconcile an `uncertain` run against the official Session facts before any retry. */
  reconcileRun(actor: ActorContext, runId: string, signal?: AbortSignal): Promise<AutomationRunView>;
}
