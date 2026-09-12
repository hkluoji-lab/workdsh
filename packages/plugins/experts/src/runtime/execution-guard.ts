import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import { ExpertsError } from '../domain/values.js';

/** Native loop admission, including resumed agents; never a parallel executor. */
export function registerExpertExecutionGuard(ctx: Context): void {
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const header = agent.session.header;
    const actor = await ctx.workdshIdentity.resolve({ sessionId: String(agent.session.id) }, signal);
    try {
      const binding = await ctx.workdshExperts.verifyBinding(actor, String(agent.session.id), signal);
      if (binding.presetRevisionRef !== header.agentPreset) {
        throw new ExpertsError('experts/conflict', '任务当前 preset 与固定专家修订不一致。');
      }
    } catch (error) {
      if (!(error instanceof ExpertsError && error.code === 'experts/not-found' && error.details?.reason === 'unbound' && !header.agentPreset?.startsWith('wd-exp-'))) throw error;
      // Ordinary unbound tasks stay native. An unbound expert fork never falls back.
    }
    return next();
  });
}
