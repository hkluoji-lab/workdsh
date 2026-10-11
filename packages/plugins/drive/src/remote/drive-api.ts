import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { ActorContext } from 'workdsh-contracts';

export const driveManagementPath = '/api/workdsh-drive';
const ok = <T>(value: T): ConnectionRpcResult<T> => ({ ok: true, value });
const fail = (code: string, message: string): ConnectionRpcResult<never> => ({ ok: false, error: { code, message, details: {} } });
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const actor = (ctx: Context): ActorContext => {
  const profile = ctx.workdshIdentity.profile();
  return { principalId: profile.principalId, organizationId: profile.organization.id, requestId: `drive-ui-${randomUUID()}`, resolvedBy: profile.resolvedBy };
};

const MESSAGES: Record<string, string> = {
  'drive/not-found': '网盘文件不存在或无权访问。',
  'drive/name-conflict': '同一目录已有同名项目。',
  'drive/invalid-name': '网盘名称无效。',
  'drive/not-folder': '目标不是文件夹。',
  'drive/cycle': '文件夹不能移动到自己的子目录。',
  'drive/file-size': '文件为空或超过限制。',
  'drive/quota-exceeded': '网盘容量不足。',
  'drive/operation-conflict': '相同操作标识的内容不一致。',
  'drive/invalid-attachment': '附件引用无效。',
  'drive/invalid-actor': '无法确认当前身份。',
  'drive/unavailable': '网盘服务暂不可用。',
};

export function registerDriveConnection(ctx: Context): void {
  const connection = (ctx as Context & { connection: HostConnectionHandle }).connection;
  const unregister = connection.fetch.register({
    path: driveManagementPath, methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      try {
        const body = record(await request.json()); const endpoint = body?.endpoint; const payload = record(body?.payload) ?? {};
        const current = actor(ctx); const manager = ctx.workdshDrive;
        if (endpoint === 'space') return Response.json(ok(await manager.space(current, request.signal)));
        if (endpoint === 'list' && (payload.parentId === undefined || typeof payload.parentId === 'string')) return Response.json(ok(await manager.list(current, payload.parentId as string | undefined, request.signal)));
        if (endpoint === 'create-folder' && typeof payload.name === 'string' && (payload.parentId === undefined || typeof payload.parentId === 'string')) return Response.json(ok(await manager.createFolder(current, payload.name, payload.parentId as string | undefined, request.signal)));
        if (endpoint === 'save' && typeof payload.name === 'string' && typeof payload.base64 === 'string' && typeof payload.operationId === 'string') {
          const source = payload.source === 'ai-generated' || payload.source === 'user-upload' || payload.source === 'tool-output' ? payload.source : undefined;
          return Response.json(ok(await manager.save(current, { name: payload.name, bytes: Buffer.from(payload.base64, 'base64'), operationId: payload.operationId, source: source ?? 'user-upload', ...(typeof payload.mediaType === 'string' ? { mediaType: payload.mediaType } : {}), ...(typeof payload.parentId === 'string' ? { parentId: payload.parentId } : {}), ...(typeof payload.sessionId === 'string' ? { sessionId: payload.sessionId } : {}) }, request.signal)));
        }
        if (endpoint === 'read-bytes' && typeof payload.fileId === 'string') return Response.json(ok({ base64: Buffer.from(await manager.readBytes(current, payload.fileId, typeof payload.revisionId === 'string' ? payload.revisionId : undefined, request.signal)).toString('base64') }));
        if (endpoint === 'search' && typeof payload.query === 'string') {
          const kinds = Array.isArray(payload.kinds) && payload.kinds.every(value => typeof value === 'string') ? payload.kinds as never[] : undefined;
          const sources = Array.isArray(payload.sources) && payload.sources.every(value => typeof value === 'string') ? payload.sources as never[] : undefined;
          return Response.json(ok(await manager.search(current, payload.query, { ...(kinds ? { kinds } : {}), ...(sources ? { sources } : {}), ...(typeof payload.sessionId === 'string' ? { sessionId: payload.sessionId } : {}), ...(typeof payload.updatedAfter === 'string' ? { updatedAfter: payload.updatedAfter } : {}), ...(typeof payload.updatedBefore === 'string' ? { updatedBefore: payload.updatedBefore } : {}) }, request.signal)));
        }
        if (endpoint === 'sessions') return Response.json(ok(await manager.listSessions(current, request.signal)));
        if (endpoint === 'rename' && typeof payload.nodeId === 'string' && typeof payload.name === 'string') return Response.json(ok(await manager.rename(current, payload.nodeId, payload.name, request.signal)));
        if (endpoint === 'move' && typeof payload.nodeId === 'string' && (payload.parentId === undefined || typeof payload.parentId === 'string')) return Response.json(ok(await manager.move(current, payload.nodeId, payload.parentId as string | undefined, request.signal)));
        if (endpoint === 'archive' && typeof payload.nodeId === 'string') { await manager.archive(current, payload.nodeId, request.signal); return Response.json(ok({ archived: true })); }
        return Response.json(fail('drive/invalid-request', '网盘请求无效。'), { status: 400 });
      } catch (cause) {
        const code = cause instanceof Error && cause.message.startsWith('drive/') ? cause.message : 'drive/internal';
        return Response.json(fail(code, MESSAGES[code] ?? '网盘操作失败。'), { status: code === 'drive/internal' ? 500 : 400 });
      }
    },
  });
  ctx.effect(() => unregister, 'workdsh.drive.fetch');
}
