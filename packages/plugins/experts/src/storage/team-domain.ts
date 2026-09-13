import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import type { ExpertRevisionRef, ResourceOwner } from 'workdsh-contracts';
import type { SopArtifact, SopAttempt, SopReceipt, SopState, SopVerdict } from '../domain/team-sop.js';
import { bounded, iso, resourceOwnerSchema, revisionRefSchema } from './domain.js';

/**
 * Storage layout for the `workdsh_expert_teams` domain (TM-01 closing slice).
 *
 * One row per team run: the frozen member revisions, the Host-owned SOP state
 * machine and the recorded delivery. Independent from `workdsh_experts` so a
 * corrupted run row can never take expert authoring down (and vice versa);
 * every write goes through `KvTable.update` for compare-and-swap. Runtime facts
 * (turns, tools, tokens) stay in the Harness session log — this domain only
 * owns the business object.
 */

/** The immutable delivery record: the bytes re-read at delivery time. */
export interface TeamRunDelivery {
  readonly deliveredAt: string;
  readonly artifacts: readonly SopArtifact[];
}

export interface TeamRun {
  readonly runId: string;
  readonly owner: ResourceOwner;
  /** The host session the team hangs off; MUST be an expert-bound, non-delegated task. */
  readonly hostSessionId: string;
  readonly hostRevisionRef: ExpertRevisionRef;
  readonly workspaceRef?: string;
  /** Logical SOP member key (worker/reviewer) → frozen published expert revision. */
  readonly members: Record<string, ExpertRevisionRef>;
  readonly state: SopState;
  readonly delivery?: TeamRunDelivery;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const sopArtifactSchema: z.ZodType<SopArtifact> = z.object({
  path: bounded,
  sha256: sha256Schema,
  byteLength: z.number().int().positive(),
});

const sopReceiptSchema: z.ZodType<SopReceipt> = z.object({
  sessionId: bounded,
  terminalSeq: z.number().int().positive(),
  digest: sha256Schema,
  artifacts: z.array(sopArtifactSchema).optional(),
});

const sopVerdictSchema: z.ZodType<SopVerdict> = z.enum(['accepted', 'changes-requested', 'blocked']);

const sopAttemptSchema: z.ZodType<SopAttempt> = z.object({
  number: z.number().int().positive(),
  workSessionId: bounded,
  inputs: z.record(bounded, sha256Schema),
  output: sopReceiptSchema.optional(),
  reviewSessionId: bounded.optional(),
  proposal: z.object({ outputDigest: sha256Schema, verdict: sopVerdictSchema }).optional(),
  decision: z.object({ verdict: sopVerdictSchema, receipt: sopReceiptSchema }).optional(),
  abandoned: bounded.optional(),
});

const sopStateSchema: z.ZodType<SopState> = z.object({
  revision: z.number().int().nonnegative(),
  plan: z.object({
    stages: z.array(z.object({
      id: bounded,
      worker: bounded,
      reviewer: bounded.optional(),
      instructions: z.string().max(64000).optional(),
      dependsOn: z.array(bounded),
      maxAttempts: z.number().int().positive(),
    })),
    maxTotalAttempts: z.number().int().positive(),
  }),
  attempts: z.record(bounded, z.array(sopAttemptSchema)),
});

const teamRunSchema: z.ZodType<TeamRun> = z.object({
  runId: bounded,
  owner: resourceOwnerSchema,
  hostSessionId: bounded,
  hostRevisionRef: revisionRefSchema,
  workspaceRef: bounded.optional(),
  members: z.record(bounded, revisionRefSchema),
  state: sopStateSchema,
  delivery: z.object({ deliveredAt: iso, artifacts: z.array(sopArtifactSchema) }).optional(),
  createdAt: iso,
  updatedAt: iso,
});

export const teamDomainSpec = defineDomain({
  name: 'workdsh_expert_teams',
  version: 1,
  layout: 'per-record',
  tables: {
    runs: domainTable<string, TeamRun>(teamRunSchema),
  },
});

/** Path-safe composite keys (same charset contract as the experts domain). */
export const teamKeys = {
  run: (runId: string) => runId.replace(/[^a-zA-Z0-9_-]+/g, '-'),
};
