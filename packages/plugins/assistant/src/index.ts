import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-storage-domain';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-tools';
import { AssistantManager } from './services/assistant-manager.js';
import { registerAssistantConnection } from './remote/connection-api.js';
import { registerAssistantTools } from './tools/assistant-tools.js';

export * from './shared.js';
export * from './services/assistant-manager.js';
export * from './storage/domain.js';

export const name = 'workdsh-plugin-assistant';
export const inject = ['storageDomain', 'connection', 'tools', 'workdshIdentity'];

export async function apply(ctx: Context): Promise<void> {
  await ctx.plugin(AssistantManager);
  await ctx.plugin({
    name: 'workdsh-assistant-integration',
    inject: [...inject, 'workdshAssistant'],
    apply(integration: Context) { registerAssistantConnection(integration); registerAssistantTools(integration); },
  });
}
