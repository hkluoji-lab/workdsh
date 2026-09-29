/**
 * Automations storage domain (D12 / P2-03, automation module 0.1).
 *
 * One record per `organization + principal`, laid out by the official storage domain
 * backend, which owns durability and the schema version. Records inside that state are
 * keyed by the identity that makes them unique, so the medium itself carries the
 * deduplication keys the design requires:
 *
 * - a revision by `ruleId:revision`;
 * - an occurrence by `ruleId:ruleRevision:scheduledAt` — the triple
 *   `docs/design/automations/CONTRACTS.md` declares unique, which is what makes a
 *   repeated delivery of the same instant impossible to turn into a second run;
 * - an inbound delivery by `sourceId:deliveryId:ruleId`;
 * - a run by its own `runId`, plus a manual `requestId` index for `runNow` idempotency.
 *
 * The whole state is one document, so one rule change plus its revisions and occurrence
 * bookkeeping land in a single durable write. There is deliberately no scheduler-lease
 * table: the `flock` in `src/scheduler/` is the single authority on who schedules (the
 * probe in `docs/evidence/automations-bases-probe.md` proved it is exclusive, expires
 * never, and is released by the kernel when the holder dies), and occurrence `claimedBy`
 * carries the audit trail. A stored lease would be a second source of truth.
 */
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import type {
  AutomationRule,
  AutomationRuleRevision,
  AutomationRun,
  ScheduleOccurrence,
  WebhookDelivery,
} from 'workdsh-contracts/automations';

const anyRecord = z.record(z.string(), z.unknown());

export const automationStateSchema = z.object({
  schemaVersion: z.literal(1),
  rules: anyRecord,
  revisions: anyRecord,
  occurrences: anyRecord,
  runs: anyRecord,
  deliveries: anyRecord,
  /** `requestId` → `runId`, for one manual run per client request. */
  manualRequests: anyRecord,
  /** `ruleId` → readable reason why the rule stopped triggering. */
  diagnoses: anyRecord,
});

export type AutomationState = z.infer<typeof automationStateSchema>;

/** Typed view of the records the service reads and writes. */
export interface AutomationStoredState {
  schemaVersion: 1;
  rules: Record<string, AutomationRule>;
  revisions: Record<string, AutomationRuleRevision>;
  occurrences: Record<string, ScheduleOccurrence>;
  runs: Record<string, AutomationRun>;
  deliveries: Record<string, WebhookDelivery>;
  manualRequests: Record<string, string>;
  diagnoses: Record<string, string>;
}

export const automationDomainSpec = defineDomain({
  name: 'workdsh_automations',
  version: 1,
  layout: 'per-record',
  tables: { states: domainTable<string, AutomationState>(automationStateSchema) },
});

export const emptyState = (): AutomationStoredState => ({
  schemaVersion: 1,
  rules: {}, revisions: {}, occurrences: {}, runs: {}, deliveries: {}, manualRequests: {}, diagnoses: {},
});

export const automationStateKey = (organizationId: string, principalId: string): string =>
  `${organizationId}_${principalId}`.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 240);

/** Key of one immutable rule revision. */
export const automationRevisionKey = (ruleId: string, revision: number): string => `${ruleId}:${revision}`;

/** Key of one due instant. The triple is unique, so the key is the deduplication key. */
export const automationOccurrenceKey = (ruleId: string, ruleRevision: number, scheduledAt: string): string =>
  `${ruleId}:${ruleRevision}:${scheduledAt}`;

/** Idempotency key of one inbound delivery. */
export const automationDeliveryKey = (sourceId: string, deliveryId: string, ruleId: string): string =>
  `${sourceId}:${deliveryId}:${ruleId}`;
