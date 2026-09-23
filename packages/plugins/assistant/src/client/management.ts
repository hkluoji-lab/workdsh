import type { Context } from '@deepseek-ai/cordis';
import type { AssistantCatalogEntry, AssistantDetail, AssistantRevisionInput, AssistantSummary } from '../shared.js';

const path = '/api/workdsh-assistant';
const invoke = async <T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> => {
  const timeout = AbortSignal.timeout(60_000);
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const result = await response.json() as { ok?: boolean; value?: T; error?: { message?: string } };
  if (!result.ok) throw new Error(result.error?.message ?? '助理操作失败。');
  return result.value as T;
};

export function createAssistantClient(_ctx: Context, lifetime?: AbortSignal) {
  return {
    list: (query = '') => invoke<readonly AssistantSummary[]>('list', { query }, lifetime),
    listArchived: (query = '') => invoke<readonly AssistantSummary[]>('list-archived', { query }, lifetime),
    get: (assistantId: string) => invoke<AssistantDetail>('get', { assistantId }, lifetime),
    create: (input: AssistantRevisionInput) => invoke<AssistantDetail>('create', input, lifetime),
    update: (assistantId: string, expectedRevisionId: string, input: AssistantRevisionInput) => invoke<AssistantDetail>('update', { assistantId, expectedRevisionId, ...input }, lifetime),
    archive: (assistantId: string) => invoke<unknown>('archive', { assistantId }, lifetime),
    restore: (assistantId: string) => invoke<unknown>('restore', { assistantId }, lifetime),
    catalog: () => invoke<readonly AssistantCatalogEntry[]>('catalog', {}, lifetime),
  };
}
export type AssistantManagementClient = ReturnType<typeof createAssistantClient>;
