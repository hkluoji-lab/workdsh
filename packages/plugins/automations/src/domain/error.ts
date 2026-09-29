/**
 * Automations domain error vocabulary (D12 / P2-03, automation module 0.1).
 *
 * The codes are the stable contract from `docs/design/automations/CONTRACTS.md`
 * section 3. They cross the transport as-is; a client maps them to readable text and
 * never sees an internal exception. Kept in its own module so the cron/tz evaluator
 * and the input normalizer can both throw without importing each other.
 */

/**
 * Domain error codes thrown inside the plugin: the contract's stable codes plus the
 * failures the page and the transport must still report distinctly
 * (`run_not_found`, `invalid_input`, `invalid_schedule`, `not_ready`, `internal`). Named
 * apart from the contracts' `AutomationErrorCode` so the published vocabulary and this
 * superset are never confused; only the contract codes are promised to a client.
 */
export type AutomationDomainCode =
  | 'rule_not_found'
  | 'run_not_found'
  | 'stale_revision'
  | 'invalid_cron'
  | 'invalid_time_zone'
  | 'interval_too_short'
  | 'target_unavailable'
  | 'authorization_revoked'
  | 'revision_missing'
  | 'rule_busy'
  | 'duplicate_occurrence'
  | 'occurrence_claimed'
  | 'persistence_uncertain'
  | 'delivery_signature_invalid'
  | 'invalid_input'
  | 'invalid_schedule'
  | 'not_ready'
  | 'internal';

/** Domain failure carrying one stable code. Never leaks another owner's content. */
export class AutomationError extends Error {
  constructor(
    readonly code: AutomationDomainCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = 'AutomationError';
  }
}

/**
 * Structural actor-context error, kept separate from {@link AutomationError} so the
 * transport maps it exactly as the governance contract expects.
 */
export class ActorContextError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ActorContextError';
  }
}

/** Extract a stable code from an unknown thrown value, else fall back. */
export function errorCode(error: unknown, fallback: AutomationDomainCode = 'internal'): string {
  if (error instanceof AutomationError) return error.code;
  if (error instanceof ActorContextError) return error.code;
  return fallback;
}
