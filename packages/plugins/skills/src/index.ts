import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-skill';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-tools';
import { SkillManager } from './services/manager.js';
import { registerSkillManagementConnection } from './services/connection-api.js';
import { registerSkillLifecycleTools } from './services/lifecycle-tools.js';

export * from './services/manager.js';
export * from './shared.js';

export const name = 'workdsh-plugin-skills';
export const inject = ['skills', 'connection', 'tools'];

export const skillCreatorContent = `You guide the user through creating or updating a DeepSeek Harness skill. Browser file imports are owned by WorkDSH's dedicated preflight-and-confirm flow; do not ask the user to upload an import bundle in this conversation.

Collect the minimum missing information: a kebab-case name, a concise routing description, when it should be used, the instructions that materially change the agent's behavior, and whether it should be shared by the user's compatible agents or limited to the current workspace. When the user asks for a skill usable by all WorkDSH tasks, default to the shared user root at \`$DSH_AGENTS_HOME/skills/<name>/SKILL.md\` (or \`~/.agents/skills/<name>/SKILL.md\` when DSH_AGENTS_HOME is unset). Use \`$DSH_HOME/skills/<name>/SKILL.md\` only when the user explicitly requests this Harness profile alone. Store a workspace skill at \`<workspace>/.dsh/skills/<name>/SKILL.md\`.

Build the complete SKILL.md, then call \`workdsh_save_skill_draft\`. Use its diagnostics to correct the draft and call it again with the returned draft id and expected revision. Call \`workdsh_validate_skill_draft\` immediately before publication. Never write an official skill directory with a generic filesystem or shell tool.

Before publishing, summarize the proposed name, target scope, path, and behavior and ask the user to confirm. Only after that confirmation, call \`workdsh_publish_skill_draft\` with the exact validated revision and \`user_confirmed: true\`. Names must match \`^[a-z0-9]+(?:-[a-z0-9]+)*$\`. The YAML frontmatter must contain name and description. Add references, scripts, or templates only when the requested workflow needs them. Do not invent category metadata: WorkDSH public catalog classification will be owned by its future catalog contract, while Harness skill frontmatter remains compatible with the official provider.

If the target already exists, read it and report the conflict. Update it only when the user explicitly chose to update that same skill and confirmed the proposed changes; otherwise choose another name or stop. Never overwrite an unrelated skill. Do not leave a success claim after a partial copy or failed write.

Do not create another skill registry or edit Harness internals. Treat the publish tool receipt as the authoritative result; never claim success after a failed or partial operation. Explain that Harness' filesystem skill provider and watcher make the published skill available to subsequent tasks, and give the exact \`/<name>\` command.`;

export function applySkillsHost(ctx: Context): void {
  new SkillManager(ctx);
  registerSkillManagementConnection(ctx);
  registerSkillLifecycleTools(ctx);
  ctx.effect(() => ctx.skills.register({
    name: 'skill-creator',
    description: '创建或更新 WorkDSH 技能；在自然语言引导后校验并写入 Harness 官方技能目录。',
    whenToUse: '用户希望制作、修改或完善技能时使用。',
    source: 'bundled',
    content: skillCreatorContent,
  }));
}

export const apply = applySkillsHost;
