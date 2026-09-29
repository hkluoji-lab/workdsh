/**
 * The scheduling loop of the automations module (D12 / P2-03, P2-04, module 0.1).
 *
 * One pass is: ask the domain service what is due (`maintain`), reconcile the runs whose
 * outcome is still unknown, then dispatch the due instants. Reconciliation comes first
 * because CONTRACTS.md section 4 forbids creating a Session for a trigger whose previous
 * attempt is unresolved; the domain service enforces the same order by refusing to claim
 * an instant while a run of that rule is still active.
 *
 * The loop owns no records and no execution state. Everything it observes goes straight
 * back through `settle`, so the stored run stays the only account of what happened and a
 * crash between two steps leaves evidence to reconcile instead of a lost trigger.
 *
 * Only the Host holding the scheduler lock runs passes (`./owner.ts`); the lock is what
 * makes the persisted occurrence the single source of truth about who claims an instant.
 */
import type { AutomationBinding, AutomationClaim, AutomationExecutionBridge, AutomationMaintenance, AutomationRunOutcome } from '../domain/bridge.js';

/**
 * The scheduler-facing half of the automations service. It is a structural view of
 * `AutomationsManager` — deliberately not part of `AutomationsService`, because a client
 * or a model must never be able to claim an instant or write an outcome it did not
 * observe. The plugin checks these two members at load time before using the view.
 */
export interface AutomationSchedulerHost {
  maintain(nowMs: number, ownerId: string): Promise<AutomationMaintenance>;
  settle(claim: AutomationClaim, outcome: AutomationRunOutcome): Promise<unknown>;
}

/** Which step of a pass failed; used for the diagnostic log only. */
export type SchedulerPhase = 'maintain' | 'resolve' | 'dispatch' | 'reconcile';

export interface AutomationSchedulerOptions {
  readonly host: AutomationSchedulerHost;
  readonly bridge: AutomationExecutionBridge;
  /** Identity stamped on claimed occurrences; see `schedulerOwnerId()`. */
  readonly ownerId: string;
  /** Clock of one pass. Injectable so tests drive due instants instead of waiting. */
  readonly now?: () => number;
  readonly report?: (error: unknown, phase: SchedulerPhase) => void;
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export class AutomationScheduler {
  private readonly host: AutomationSchedulerHost;
  private readonly bridge: AutomationExecutionBridge;
  private readonly ownerId: string;
  private readonly now: () => number;
  private readonly report: (error: unknown, phase: SchedulerPhase) => void;
  private running = false;
  private stopped = false;

  constructor(options: AutomationSchedulerOptions) {
    this.host = options.host;
    this.bridge = options.bridge;
    this.ownerId = options.ownerId;
    this.now = options.now ?? Date.now;
    this.report = options.report ?? (() => undefined);
  }

  /**
   * Run one pass.
   *
   * A pass that outlives the tick interval must not overlap itself, otherwise one Host
   * would dispatch through two interleaved passes and double an instant it has not
   * settled yet. Nothing is lost by returning early: the next tick sees the same due
   * instants, because claiming them is a durable write.
   */
  async pass(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;
    try {
      const maintenance = await this.host.maintain(this.now(), this.ownerId);
      for (const claim of maintenance.reconcilable) await this.reconcile(claim);
      for (const claim of maintenance.claims) await this.dispatch(claim);
    } catch (error) {
      // The pass wrote nothing, so the next tick retries the same due instants.
      this.report(error, 'maintain');
    } finally {
      this.running = false;
    }
  }

  /** Stop accepting passes; used when the owning fiber is disposed. */
  stop(): void {
    this.stopped = true;
  }

  /**
   * Turn one claimed instant into one real Session.
   *
   * Resolution happens per trigger and is never cached: the stored target is the request,
   * not the grant. A combination the bridge reports as unresolvable stops the rule with a
   * diagnosis rather than falling back to another account or a newer revision (EC06).
   */
  private async dispatch(claim: AutomationClaim): Promise<void> {
    let binding: AutomationBinding;
    try {
      const resolution = await this.bridge.resolveTarget(claim.actor, claim.revision.target);
      if (!resolution.ok) {
        await this.record(claim, {
          status: 'failed',
          failureReason: `${resolution.code}: ${resolution.reason}`,
          stop: { code: resolution.code, reason: resolution.reason },
        }, 'resolve');
        return;
      }
      binding = resolution.binding;
    } catch (error) {
      // Resolution threw before anything was created, so this attempt is a known failure:
      // record it and let the rule fire again on its next instant.
      await this.record(claim, {
        status: 'failed',
        failureReason: `internal: 触发前无法解析执行组合，未创建会话（${messageOf(error)}）。`,
      }, 'resolve');
      return;
    }
    try {
      await this.host.settle(claim, await this.bridge.dispatch(claim, binding));
    } catch (error) {
      // The Session may or may not exist. Record the unknown — never a fabricated
      // success — and let `reconcile` establish whether it was created before the next
      // trigger of this rule is allowed to run.
      await this.record(claim, {
        status: 'uncertain',
        failureReason: `persistence_uncertain: 会话创建结果未知（${messageOf(error)}）。`,
      }, 'dispatch');
    }
  }

  /**
   * Settle one unfinished run against the official Session facts.
   *
   * Reconciliation never creates a Session, so when it fails the safe outcome is to leave
   * the record exactly as it is and retry on the next pass with the same facts.
   */
  private async reconcile(claim: AutomationClaim): Promise<void> {
    try {
      await this.host.settle(claim, await this.bridge.reconcile(claim));
    } catch (error) {
      this.report(error, 'reconcile');
    }
  }

  private async record(claim: AutomationClaim, outcome: AutomationRunOutcome, phase: SchedulerPhase): Promise<void> {
    try {
      await this.host.settle(claim, outcome);
    } catch (error) {
      this.report(error, phase);
    }
  }
}
