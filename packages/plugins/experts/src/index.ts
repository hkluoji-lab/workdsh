import { expertManagerSkillContent } from './authoring/guide.js';
import { Context } from '@deepseek-ai/cordis';
// Load the official Context augmentations this entry references (ctx.skills) and
// the carriers its wire layer uses (connection, tools), mirroring the skills plugin.
import type {} from '@deepseek-ai/dsh-skill';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-tools';
import { ExpertsManager } from './services/experts-manager.js';
import { registerExpertsConnection } from './services/connection-api.js';
import { registerExpertManagementTools } from './tools/management-tools.js';
import { registerExpertExecutionGuard } from './runtime/execution-guard.js';

export * from './services/experts-manager.js';
export * from './services/connection-api.js';
export * from './tools/management-tools.js';

/**
 * Host plugin entry for WorkDSH experts (D04 / P1-02, expert module 0.1).
 *
 * This is an independent, Loader-recognised entry: `cordis.patch.yml` inserts
 * `workdsh-plugin-experts`, and the official Loader calls `apply(ctx)` after the
 * injected services resolve. It does NOT rely on the bundle calling a shared
 * helper, so experts owns its own service, transport, tools and bundled skill and
 * can be disposed completely without touching other plugins.
 */

export const name = 'workdsh-plugin-experts';

/** Every service `apply` and `ExpertsManager` require, resolved before load. */
export const inject = [
  'storageDomain', 'agentPresets', 'sessionController',
  'workdshIdentity', 'workdshAccess', 'workdshAudit', 'workdshSessionAccess', 'workdshSkills',
  'connection', 'tools', 'skills',
];

/**
 * The bundled `expert-manager` skill: conversational authoring guidance over the
 * SAME Host tools the UI uses. It can only prepare drafts and request a publish
 * confirmation; the trusted confirm + publish and every task summon/handoff stay
 * user-driven, so the skill never claims a publish or an auto-sent task.
 */
export { expertManagerSkillContent } from './authoring/guide.js';

/** Independent Host apply: own service, transport, tools and bundled skill. */
export async function applyExpertsHost(ctx: Context): Promise<void> {
  await ctx.plugin(ExpertsManager);
  await ctx.plugin({ name: 'workdsh-experts-integration', inject: [...inject, 'workdshExperts'], apply: applyIntegration });
}

/** The consumer declares the service provided by the manager child Fiber. */
function applyIntegration(ctx: Context): void {
  registerExpertExecutionGuard(ctx);
  registerExpertsConnection(ctx);
  registerExpertManagementTools(ctx);
  ctx.effect(() => ctx.skills.register({
    name: 'expert-manager',
    description: '以对话方式创建或修改 WorkDSH 专家草稿，校验并引导用户在界面确认发布。',
    whenToUse: '用户希望制作、修改、校验专家，或询问如何发布/召唤专家时使用。',
    source: 'bundled',
    content: expertManagerSkillContent,
  }));
}

/** Official Loader entry point (see cordis.patch.yml). Not a bundle-only helper. */
export const apply = applyExpertsHost;
