/**
 * Host entry of the automations module (D12 / P2-03, P2-04, module 0.1).
 *
 * The Host side of this plugin is exactly the domain service: rules, revisions,
 * occurrences and run bookkeeping. It owns no Session, no Agent loop and no schedule
 * loop of its own — the scheduler sub-plugin (which provides `AutomationExecutionBridge`)
 * is assembled here as a sibling plugin, so both the scheduler and the page talk to the
 * one service below and a Host without the scheduler reports `not_ready` instead of a
 * fabricated run.
 */
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-storage-domain';
import { AutomationsManager } from './services/automations-manager.js';

export * from './shared.js';
export * from './services/automations-manager.js';
export * from './storage/domain.js';

export const name = 'workdsh-plugin-automations';

/**
 * `storageDomain` is the only hard dependency: it is where rules and occurrences live.
 * The scheduler's own `timer` injection stays with the scheduler plugin, so a missing
 * timer never keeps the rule store from loading.
 */
export const inject = ['storageDomain'];

export async function apply(ctx: Context): Promise<void> {
  await ctx.plugin(AutomationsManager);
}
