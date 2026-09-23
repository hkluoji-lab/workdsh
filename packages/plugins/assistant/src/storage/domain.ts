import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';

/**
 * Assistant storage domain. One record per `organization + principal`, laid out by the
 * official storage domain backend, which owns durability and the schema version.
 */
const anyRecord = z.record(z.string(), z.unknown());

export const assistantStateSchema = z.object({
  schemaVersion: z.literal(1),
  assistants: anyRecord,
  revisions: anyRecord,
});

export type AssistantState = z.infer<typeof assistantStateSchema>;

export const assistantDomainSpec = defineDomain({
  name: 'workdsh_assistant',
  version: 1,
  layout: 'per-record',
  tables: { states: domainTable<string, AssistantState>(assistantStateSchema) },
});

export const assistantStateKey = (organizationId: string, principalId: string): string =>
  `${organizationId}_${principalId}`.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 240);
