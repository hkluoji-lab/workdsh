import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-storage-domain';
import type {} from '@deepseek-ai/dsh-client-connection';
import { ProjectManager } from './services/project-manager.js';
import { registerProjectConnection } from './remote/connection-api.js';
export * from './services/project-manager.js'; export * from './storage/domain.js';
export const name='workdsh-plugin-projects';
export const inject=['storageDomain','connection','workdshIdentity'];
export async function apply(ctx:Context){
  await ctx.plugin(ProjectManager);
  await ctx.plugin({
    name:'workdsh-projects-integration',
    inject:[...inject,'workdshProjects'],
    apply(integration:Context){registerProjectConnection(integration);},
  });
}
