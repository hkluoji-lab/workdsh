import type { Context } from '@deepseek-ai/cordis';
import type { LibraryNode, LibrarySearchHit, LibrarySpace, LibraryTreeEntry } from 'workdsh-contracts/library';

const path = '/api/workdsh-library';
const invoke = async <T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> => {
  const timeout = AbortSignal.timeout(60_000);
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const result = await response.json() as { ok?: boolean; value?: T; error?: { message?: string } };
  if (!result.ok) throw new Error(result.error?.message ?? '资料库操作失败。');
  return result.value as T;
};
const fileBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onerror = () => reject(reader.error ?? new Error('读取文件失败。'));
  reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? ''); reader.readAsDataURL(file);
});

export function createLibraryClient(_ctx: Context, lifetime?: AbortSignal) {
  return {
    space: () => invoke<LibrarySpace>('space', {}, lifetime),
    list: (parentId?: string) => invoke<readonly LibraryTreeEntry[]>('list', { parentId }, lifetime),
    createFolder: (name: string, parentId?: string) => invoke<LibraryNode>('create-folder', { name, parentId }, lifetime),
    importFile: async (file: File, parentId?: string) => invoke<LibraryTreeEntry>('import', { name: file.name, mediaType: file.type, parentId, base64: await fileBase64(file), operationId: crypto.randomUUID() }, lifetime),
    search: (query: string) => invoke<readonly LibrarySearchHit[]>('search', { query }, lifetime),
    readText: (assetId: string, revisionId?: string) => invoke<string>('read-text', { assetId, revisionId }, lifetime),
    rename: (nodeId: string, name: string) => invoke<LibraryNode>('rename', { nodeId, name }, lifetime),
    move: (nodeId: string, parentId?: string) => invoke<LibraryNode>('move', { nodeId, parentId }, lifetime),
    remove: (nodeId: string) => invoke<{ removed: true }>('remove', { nodeId }, lifetime),
  };
}
export type LibraryClient = ReturnType<typeof createLibraryClient>;

