import { randomUUID } from 'node:crypto';
import type { Context } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection';
import type { ActorContext } from 'workdsh-contracts';
import type { AssistantRevisionInput } from '../shared.js';
import { errorCode } from '../domain/values.js';

export const assistantManagementPath = '/api/workdsh-assistant';
const ok = <T>(value: T): ConnectionRpcResult<T> => ({ ok: true, value });
const fail = (code: string, message: string): ConnectionRpcResult<never> => ({ ok: false, error: { code, message, details: {} } });
const record = (value: unknown): Record<string, unknown> | undefined => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
/**
 * The trusted actor is established here, on the Host, from the injected identity
 * service. Nothing in the request body or in a model call can supply an owner,
 * organization or confirmation flag.
 */
const actor = (ctx: Context): ActorContext => {
  const profile = ctx.workdshIdentity.profile();
  return { principalId: profile.principalId, organizationId: profile.organization.id, requestId: `assistant-ui-${randomUUID()}`, resolvedBy: profile.resolvedBy };
};

/** Structural read of one authored revision payload; every field is re-validated by the domain. */
function readInput(payload: Record<string, unknown>): AssistantRevisionInput {
  const brief = record(payload.brief);
  const triggers = record(payload.triggers);
  const references = Array.isArray(payload.references) ? payload.references : [];
  return {
    name: String(payload.name ?? ''),
    description: String(payload.description ?? ''),
    brief: { goal: String(brief?.goal ?? ''), style: String(brief?.style ?? ''), boundary: String(brief?.boundary ?? '') },
    references: references.flatMap(value => {
      const row = record(value);
      if (!row || typeof row.kind !== 'string' || typeof row.id !== 'string') return [];
      return [{
        kind: row.kind as AssistantRevisionInput['references'][number]['kind'],
        id: row.id,
        label: String(row.label ?? row.id),
        ...(typeof row.revision === 'string' ? { revision: row.revision } : {}),
      }];
    }),
    triggers: { manual: triggers?.manual === true, ...(typeof triggers?.schedule === 'string' ? { schedule: triggers.schedule } : {}), ...(typeof triggers?.inbound === 'string' ? { inbound: triggers.inbound } : {}) },
    ...(typeof payload.workspacePath === 'string' ? { workspacePath: payload.workspacePath } : {}),
  };
}

export function registerAssistantConnection(ctx: Context): void {
  const connection = (ctx as Context & { connection: HostConnectionHandle }).connection;
  const unregister = connection.fetch.register({
    path: assistantManagementPath, methods: ['POST'], requestBody: 'buffered',
    fetch: async request => {
      try {
        const body = record(await request.json()); const endpoint = body?.endpoint; const payload = record(body?.payload) ?? {};
        const current = actor(ctx); const manager = ctx.workdshAssistant;
        if (endpoint === 'list') return Response.json(ok(await manager.list(current, typeof payload.query === 'string' ? payload.query : '')));
        if (endpoint === 'list-archived') return Response.json(ok(await manager.listArchived(current, typeof payload.query === 'string' ? payload.query : '')));
        if (endpoint === 'get' && typeof payload.assistantId === 'string') return Response.json(ok(await manager.get(current, payload.assistantId)));
        if (endpoint === 'create') return Response.json(ok(await manager.create(current, readInput(payload))));
        if (endpoint === 'update' && typeof payload.assistantId === 'string' && typeof payload.expectedRevisionId === 'string') {
          return Response.json(ok(await manager.update(current, payload.assistantId, readInput(payload), payload.expectedRevisionId)));
        }
        if (endpoint === 'archive' && typeof payload.assistantId === 'string') return Response.json(ok(await manager.archive(current, payload.assistantId)));
        if (endpoint === 'restore' && typeof payload.assistantId === 'string') return Response.json(ok(await manager.restore(current, payload.assistantId)));
        if (endpoint === 'catalog') return Response.json(ok(await manager.catalog(current, request.signal)));
        return Response.json(fail('assistant/invalid-request', '助理请求无效。'), { status: 400 });
      } catch (cause) {
        const code = errorCode(cause);
        const messages: Record<string, string> = {
          'assistant/not-found': '助理不存在或无权访问。',
          'assistant/revision-conflict': '助理已被更新，请刷新后重试。',
          'assistant/reference-stale': '引用的能力已变化，请重新选择后再保存。',
          'assistant/invalid-name': '助理名称无效。',
          'assistant/invalid-description': '助理说明无效。',
          'assistant/invalid-brief': '职责描述无效，请填写工作目标。',
          'assistant/invalid-triggers': '至少需要一种触发方式。',
          'assistant/invalid-reference': '引用的能力格式无效。',
          'assistant/invalid-workspace': '工作目录无效。',
          'assistant/invalid-input': '助理内容无效。',
          'assistant/not-ready': '助理服务尚未就绪。',
          'governance/invalid-context': '当前身份无法完成该操作。',
        };
        return Response.json(fail(code, messages[code] ?? '助理操作失败。'), { status: code === 'assistant/internal' ? 500 : 400 });
      }
    },
  });
  ctx.effect(() => unregister, 'workdsh.assistant.fetch');
}
