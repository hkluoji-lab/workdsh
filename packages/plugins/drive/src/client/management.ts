import type { Context } from '@deepseek-ai/cordis';
import type { DriveNode, DriveSearchHit, DriveSessionRef, DriveSpace, DriveTreeEntry } from 'workdsh-contracts/drive';

const path = '/api/workdsh-drive';
const invoke = async <T>(endpoint: string, payload: unknown, signal?: AbortSignal): Promise<T> => {
  const timeout = AbortSignal.timeout(60_000);
  const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint, payload }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  const result = await response.json() as { ok?: boolean; value?: T; error?: { message?: string } };
  if (!result.ok) throw new Error(result.error?.message ?? '网盘操作失败。');
  return result.value as T;
};
const fileBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onerror = () => reject(reader.error ?? new Error('读取文件失败。'));
  reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? ''); reader.readAsDataURL(file);
});
const decodeBase64 = (value: string): Uint8Array => {
  const binary = atob(value); const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
};

export function createDriveClient(_ctx: Context, lifetime?: AbortSignal) {
  return {
    space: () => invoke<DriveSpace>('space', {}, lifetime),
    list: (parentId?: string) => invoke<readonly DriveTreeEntry[]>('list', { parentId }, lifetime),
    createFolder: (name: string, parentId?: string) => invoke<DriveNode>('create-folder', { name, parentId }, lifetime),
    saveFile: async (file: File, parentId?: string, operationId?: string) => invoke<DriveTreeEntry>('save', { name: file.name, mediaType: file.type, base64: await fileBase64(file), operationId: operationId ?? crypto.randomUUID(), source: 'user-upload', ...(parentId ? { parentId } : {}) }, lifetime),
    readBytes: async (fileId: string, revisionId?: string, signal?: AbortSignal) => decodeBase64((await invoke<{ base64: string }>('read-bytes', { fileId, revisionId }, signal ? AbortSignal.any([...(lifetime ? [lifetime] : []), signal]) : lifetime)).base64),
    search: (query: string, filters: { sources?: readonly ('ai-generated' | 'user-upload' | 'tool-output')[]; kinds?: readonly ('document' | 'image' | 'video' | 'audio' | 'archive' | 'other')[]; sessionId?: string } = {}) => invoke<readonly DriveSearchHit[]>('search', { query, ...filters }, lifetime),
    sessions: () => invoke<readonly DriveSessionRef[]>('sessions', {}, lifetime),
    rename: (nodeId: string, name: string) => invoke<DriveNode>('rename', { nodeId, name }, lifetime),
    move: (nodeId: string, parentId?: string) => invoke<DriveNode>('move', { nodeId, parentId }, lifetime),
    archive: (nodeId: string) => invoke<{ archived: true }>('archive', { nodeId }, lifetime),
    listArchived: () => invoke<readonly DriveTreeEntry[]>('list-archived', {}, lifetime),
    restore: (nodeId: string) => invoke<{ restored: true }>('restore', { nodeId }, lifetime),
    purge: (nodeId: string) => invoke<{ purged: true }>('purge', { nodeId }, lifetime),
  };
}
export type DriveClient = ReturnType<typeof createDriveClient>;
