import type { Context } from '@deepseek-ai/cordis';
import { defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import type { ActorContext } from 'workdsh-contracts';

async function actor(ctx: Context, exec: ToolRunContext): Promise<ActorContext> {
  const sessionId = exec.agent ? String(exec.agent.id) : undefined;
  return ctx.workdshIdentity.resolve(sessionId ? { sessionId } : undefined, exec.signal);
}

export function registerLibraryTools(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'library_search',
    description: '搜索当前用户资料库中的已转换正文。返回固定资料与修订引用；不自动选择或修改资料。',
    parameters: { query: { type: 'string', required: true, description: '要查找的标题或正文关键词。' } },
    output: {
      schema: {
        type: 'object', additionalProperties: false,
        properties: { hits: { type: 'array', required: true, items: {
          type: 'object', additionalProperties: false,
          properties: { asset_id: { type: 'string', required: true }, revision_id: { type: 'string', required: true }, name: { type: 'string', required: true }, kind: { type: 'string', required: true }, excerpt: { type: 'string', required: true } },
        } } },
      },
      render: (_args, value) => [{ type: 'text', text: value.hits.length ? value.hits.map(hit => `${hit.name}: ${hit.excerpt}`).join('\n') : '没有找到匹配资料。' }],
    },
    async execute(args, exec) { const hits = await ctx.workdshLibrary.search(await actor(ctx, exec), args.query, exec.signal); return { hits: hits.map(hit => ({ asset_id: hit.assetId, revision_id: hit.revisionId, name: hit.name, kind: hit.kind, excerpt: hit.excerpt })) }; },
  }));
  ctx.tools.register(defineTool({
    name: 'library_read',
    description: '读取当前用户已授权资料的固定 Markdown 检索视图。必须使用资料库返回的 asset_id，可指定 revision_id。',
    parameters: { asset_id: { type: 'string', required: true }, revision_id: { type: 'string' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { asset_id: { type: 'string', required: true }, revision_id: { type: 'string' }, content: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: value.content }] },
    async execute(args, exec) { return { asset_id: args.asset_id, ...(args.revision_id ? { revision_id: args.revision_id } : {}), content: await ctx.workdshLibrary.readText(await actor(ctx, exec), args.asset_id, args.revision_id, exec.signal) }; },
  }));
  ctx.tools.register(defineTool({
    name: 'library_save_markdown',
    description: '把当前任务生成的 Markdown 成果保存到个人资料库。保存新文件，不覆盖已有资料。',
    parameters: { name: { type: 'string', required: true, description: '以 .md 或 .markdown 结尾的文件名。' }, content: { type: 'string', required: true }, parent_id: { type: 'string', description: '资料库目标文件夹 id；省略保存到根目录。' } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { asset_id: { type: 'string', required: true }, revision_id: { type: 'string', required: true }, node_id: { type: 'string', required: true }, name: { type: 'string', required: true } } }, render: (_args, value) => [{ type: 'text', text: `已保存到资料库：${value.name}` }] },
    async execute(args, exec) {
      const name = /\.md(?:arkdown)?$/i.test(args.name) ? args.name : `${args.name}.md`;
      const entry = await ctx.workdshLibrary.importAsset(await actor(ctx, exec), { name, bytes: new TextEncoder().encode(args.content), operationId: `library-tool-${String(exec.callId)}`, source: 'task', sourceTaskId: exec.agent ? String(exec.agent.id) : undefined, ...(args.parent_id ? { parentId: args.parent_id } : {}) }, exec.signal);
      return { asset_id: entry.asset!.id, revision_id: entry.revision!.id, node_id: entry.id, name: entry.name };
    },
  }));
}
