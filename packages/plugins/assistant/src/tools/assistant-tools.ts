import type { Context } from '@deepseek-ai/cordis';
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ActorContext } from 'workdsh-contracts';
import type { AssistantDetail, AssistantReference, AssistantRevisionInput, AssistantTriggers } from '../shared.js';

async function actor(ctx: Context, exec: ToolRunContext): Promise<ActorContext> {
  const sessionId = exec.agent ? String(exec.agent.id) : undefined;
  return ctx.workdshIdentity.resolve(sessionId ? { sessionId } : undefined, exec.signal);
}

/** Parameters are per-property; every nested value is re-validated by the domain before it is stored. */
const referenceParameters = {
  type: 'array' as const,
  items: {
    type: 'object' as const,
    additionalProperties: false,
    properties: {
      kind: { type: 'string' as const, enum: ['skill', 'expert', 'connector'] as const, required: true as const, description: 'skill 用技能名，expert 用专家 id，connector 用连接器实例 id。' },
      id: { type: 'string' as const, required: true as const },
      label: { type: 'string' as const, required: true as const, description: '展示名称，仅用于列表与详情显示。' },
      revision: { type: 'string' as const, description: '技能或专家的固定修订 id；连接器实例不支持修订。' },
    },
  },
};

const revisionParameters = {
  name: { type: 'string' as const, required: true as const, description: '助理名称。' },
  description: { type: 'string' as const },
  goal: { type: 'string' as const, required: true as const, description: '这个助理要完成的工作目标。' },
  style: { type: 'string' as const, description: '沟通与产出风格。' },
  boundary: { type: 'string' as const, description: '这个助理不做的事。' },
  workspace_path: { type: 'string' as const, description: '记录工作目录；创建助理不会打开或修改该目录。' },
  trigger_manual: { type: 'boolean' as const, description: '是否允许手动发起。' },
  trigger_schedule: { type: 'string' as const, description: '期望的周期（仅记录为意图，定时任务由「定时任务」模块执行）。' },
  trigger_inbound: { type: 'string' as const, description: '期望的入站来源（仅记录为意图）。' },
  references: { ...referenceParameters, description: '引用的技能、专家修订与连接器实例。' },
};

function revisionInput(args: Record<string, unknown>): AssistantRevisionInput {
  const references: AssistantReference[] = Array.isArray(args.references) ? args.references as AssistantReference[] : [];
  const triggers: AssistantTriggers = {
    manual: args.trigger_manual === undefined ? !args.trigger_schedule && !args.trigger_inbound : args.trigger_manual === true,
    ...(typeof args.trigger_schedule === 'string' ? { schedule: args.trigger_schedule } : {}),
    ...(typeof args.trigger_inbound === 'string' ? { inbound: args.trigger_inbound } : {}),
  };
  return {
    name: String(args.name ?? ''),
    description: String(args.description ?? ''),
    brief: { goal: String(args.goal ?? ''), style: String(args.style ?? ''), boundary: String(args.boundary ?? '') },
    references,
    triggers,
    ...(typeof args.workspace_path === 'string' ? { workspacePath: args.workspace_path } : {}),
  };
}

const revisionOutput = {
  type: 'object' as const, additionalProperties: false,
  properties: {
    assistant_id: { type: 'string' as const, required: true as const },
    revision_id: { type: 'string' as const, required: true as const },
    revision_number: { type: 'integer' as const, required: true as const },
    name: { type: 'string' as const, required: true as const },
    unavailable_references: { type: 'array' as const, required: true as const, items: { type: 'string' as const } },
  },
};

const receipt = (detail: AssistantDetail) => ({
  assistant_id: detail.assistant.id,
  revision_id: detail.revision.id,
  revision_number: detail.revision.number,
  name: detail.assistant.name,
  unavailable_references: detail.resolutions.filter(row => !row.available).map(row => `${row.reference.label}：${row.reason ?? '当前不可用'}`),
});

export function registerAssistantTools(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'workdsh_assistant_list',
    description: '列出当前用户可见的助理入口。助理只描述面向什么工作、引用哪些能力；它不保存会话、凭据，也不触发执行。',
    parameters: { query: { type: 'string', description: '按名称或说明过滤。' } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { assistants: { type: 'array', required: true, items: {
          type: 'object', additionalProperties: false,
          properties: {
            assistant_id: { type: 'string', required: true }, name: { type: 'string', required: true }, description: { type: 'string', required: true },
            revision_number: { type: 'integer', required: true }, reference_count: { type: 'integer', required: true },
            unavailable_count: { type: 'integer', required: true }, updated_at: { type: 'string', required: true },
          },
        } } },
      },
      render: (_args, value) => [{ type: 'text', text: value.assistants.length ? value.assistants.map(row => `${row.name}：${row.description || '未填写说明'}（修订 ${row.revision_number}，引用 ${row.reference_count}${row.unavailable_count ? `，${row.unavailable_count} 项不可用` : ''}）`).join('\n') : '尚未创建助理。' }],
    },
    async execute(args, exec) {
      const rows = await ctx.workdshAssistant.list(await actor(ctx, exec), args.query ?? '');
      return { assistants: rows.map(row => ({ assistant_id: row.id, name: row.name, description: row.description, revision_number: row.revisionNumber, reference_count: row.referenceCount, unavailable_count: row.unavailableCount, updated_at: row.updatedAt })) };
    },
  }));
  ctx.tools.register(defineTool({
    name: 'workdsh_assistant_get',
    description: '读取一个助理的当前修订与引用解析结果。available 为 false 的引用在保存时会被拒绝。',
    parameters: { assistant_id: { type: 'string', required: true } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: {
          assistant_id: { type: 'string', required: true }, name: { type: 'string', required: true }, description: { type: 'string', required: true },
          revision_id: { type: 'string', required: true }, revision_number: { type: 'integer', required: true },
          goal: { type: 'string', required: true }, style: { type: 'string', required: true }, boundary: { type: 'string', required: true },
          workspace_path: { type: 'string' }, manual: { type: 'boolean', required: true }, schedule: { type: 'string' }, inbound: { type: 'string' },
          references: { type: 'array', required: true, items: {
            type: 'object', additionalProperties: false,
            properties: { kind: { type: 'string', required: true }, id: { type: 'string', required: true }, label: { type: 'string', required: true }, revision: { type: 'string' }, available: { type: 'boolean', required: true }, reason: { type: 'string' } },
          } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: `${value.name}（修订 ${value.revision_number}）\n目标：${value.goal}\n风格：${value.style || '未填写'}\n边界：${value.boundary || '未填写'}\n引用：${value.references.length ? value.references.map(row => `${row.label}${row.available ? '' : `（不可用：${row.reason ?? '未知'}）`}`).join('、') : '无'}` }],
    },
    async execute(args, exec) {
      const detail = await ctx.workdshAssistant.get(await actor(ctx, exec), args.assistant_id);
      const byReference = new Map(detail.resolutions.map(row => [`${row.reference.kind}:${row.reference.id}`, row]));
      return {
        assistant_id: detail.assistant.id, name: detail.assistant.name, description: detail.assistant.description,
        revision_id: detail.revision.id, revision_number: detail.revision.number,
        goal: detail.revision.brief.goal, style: detail.revision.brief.style, boundary: detail.revision.brief.boundary,
        ...(detail.revision.workspacePath ? { workspace_path: detail.revision.workspacePath } : {}),
        manual: detail.revision.triggers.manual,
        ...(detail.revision.triggers.schedule ? { schedule: detail.revision.triggers.schedule } : {}),
        ...(detail.revision.triggers.inbound ? { inbound: detail.revision.triggers.inbound } : {}),
        references: detail.revision.references.map(reference => {
          const row = byReference.get(`${reference.kind}:${reference.id}`);
          return { kind: reference.kind, id: reference.id, label: reference.label, ...(reference.revision ? { revision: reference.revision } : {}), available: row?.available ?? false, ...(row?.reason ? { reason: row.reason } : {}) };
        }),
      };
    },
  }));
  ctx.tools.register(defineTool({
    name: 'workdsh_assistant_create',
    description: '创建一个助理入口。只保存职责描述、引用的能力与触发意图；不会启动任务、不会保存凭据。引用的技能或专家必须先由用户在「专家 · 技能 · 连接器」里创建。',
    parameters: revisionParameters,
    output: { schema: revisionOutput, render: (_args, value) => [{ type: 'text', text: `已创建助理「${value.name}」（修订 ${value.revision_number}）。${value.unavailable_references.length ? `注意：${value.unavailable_references.join('；')}` : ''}` }] },
    async execute(args, exec) {
      return receipt(await ctx.workdshAssistant.create(await actor(ctx, exec), revisionInput(args)));
    },
  }));
  ctx.tools.register(defineTool({
    name: 'workdsh_assistant_update',
    description: '追加一个新的助理修订。expected_revision_id 必须来自最近一次读取；不匹配时拒绝覆盖。不会原地改写历史修订。',
    parameters: { assistant_id: { type: 'string', required: true }, expected_revision_id: { type: 'string', required: true, description: '最近一次读取到的 revision_id。' }, ...revisionParameters },
    output: { schema: revisionOutput, render: (_args, value) => [{ type: 'text', text: `已保存助理「${value.name}」的新修订 ${value.revision_number}。${value.unavailable_references.length ? `注意：${value.unavailable_references.join('；')}` : ''}` }] },
    async execute(args, exec) {
      return receipt(await ctx.workdshAssistant.update(await actor(ctx, exec), String(args.assistant_id), revisionInput(args), String(args.expected_revision_id)));
    },
  }));
}
