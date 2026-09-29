/**
 * Execution seam of the automations module (D12 / P2-03, P2-04, module 0.1).
 *
 * The manager owns records — rules, revisions, occurrences, runs and their idempotency
 * keys. Everything that touches execution belongs to the scheduler sub-plugin
 * (`src/scheduler/`), which is the only part of this package that injects the official
 * preset/agent/session services and reads the sibling feature services. The manager
 * therefore loads on its own and reports an explicit `not_ready` instead of pretending a
 * trigger happened, which is what keeps a fabricated success impossible.
 *
 * These types are plugin-internal: they never cross the transport and are not part of
 * `workdsh-contracts`. The page and the Agent tools only ever call `AutomationsService`.
 */
import type { ActorContext } from 'workdsh-contracts';
import type { AutomationRule, AutomationRuleRevision, AutomationRun, AutomationRunStatus, AutomationTarget, ScheduleOccurrence } from '../shared.js';
import type { AutomationDomainCode } from './error.js';

/** One dispatchable unit: the claimed instant, its run record and the rule state behind it. */
export interface AutomationClaim {
  /** Storage record the claim lives in; the scheduler hands it back to `settle`. */
  readonly stateKey: string;
  /** Actor the Host resolved for this trigger — the rule owner, never a client or a model. */
  readonly actor: ActorContext;
  readonly rule: AutomationRule;
  readonly revision: AutomationRuleRevision;
  /** Absent for a manual run, which has no due instant. */
  readonly occurrence?: ScheduleOccurrence;
  readonly run: AutomationRun;
}

/** What the scheduler observed and must record. The manager never invents an outcome. */
export interface AutomationRunOutcome {
  readonly status: AutomationRunStatus;
  /** Official Session identity, written only after the Session really exists. */
  readonly sessionId?: string;
  readonly failureReason?: string;
  /** Digest of the combination actually resolved at trigger time. */
  readonly digest?: string;
  /**
   * Set when the trigger must stop the rule: the combination no longer resolves, the
   * pinned revision is gone or the authorization was revoked. The rule moves to `paused`
   * with this diagnosis — never to a different account or a newer combination.
   */
  readonly stop?: { readonly code: AutomationDomainCode; readonly reason: string };
}

/** Digest plus refreshed label of one successfully resolved combination. */
export interface AutomationBinding {
  readonly digest: string;
  readonly expertLabel?: string;
}

/** Resolution result; a failure carries the stable code the page shows. */
export type AutomationTargetResolution =
  | { readonly ok: true; readonly binding: AutomationBinding }
  | { readonly ok: false; readonly code: AutomationDomainCode; readonly reason: string };

/** One scheduler pass: what to dispatch now, and what to reconcile first. */
export interface AutomationMaintenance {
  readonly claims: readonly AutomationClaim[];
  /** Non-terminal runs whose status must come from the official Session facts. */
  readonly reconcilable: readonly AutomationClaim[];
}

/**
 * Implemented by the scheduler sub-plugin. `resolveTarget` re-resolves every reference at
 * trigger time (a stored value is the request, not a grant), `dispatch` creates the one
 * real Session, and `reconcile` reads the official facts before any retry.
 */
export interface AutomationExecutionBridge {
  resolveTarget(actor: ActorContext, target: AutomationTarget, signal?: AbortSignal): Promise<AutomationTargetResolution>;
  dispatch(claim: AutomationClaim, binding: AutomationBinding, signal?: AbortSignal): Promise<AutomationRunOutcome>;
  reconcile(claim: AutomationClaim, signal?: AbortSignal): Promise<AutomationRunOutcome>;
}
