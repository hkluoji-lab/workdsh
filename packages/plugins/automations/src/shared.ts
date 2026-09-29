/**
 * Shared contract of the automations module (D12 / P2-03, P2-04, module 0.1).
 *
 * The domain TYPES come from `workdsh-contracts/automations`, imported type-only and
 * erased from the emitted JavaScript; the runtime VALUES are owned locally by this
 * plugin (ADR-0019), so an installed Host `dist/*.js` and the esbuild-inlined browser
 * bundle both stay self-contained and never import the private contracts package at
 * runtime.
 *
 * The augmented {@link Context} names the sibling services this module reads. They are
 * reached through the public service store — never by importing another feature
 * plugin's modules or reading its tables — and a service that is not loaded degrades to
 * an explicit diagnosis instead of a fabricated success.
 */
import type { Context } from '@deepseek-ai/cordis';
import type { ExpertsService, IdentityService, ProjectService } from 'workdsh-contracts';
import type { AutomationsService } from 'workdsh-contracts/automations';

export type * from 'workdsh-contracts/automations';
export {
  ActorContextError,
  AutomationError,
  errorCode,
  type AutomationDomainCode,
} from './domain/error.js';
export { assertSchedule, assertTimeZone, isoAt, parseCron, upcomingRuns } from './domain/cron.js';
export { assertActorContext, AUTOMATION_LIMITS, normalizeRuleInput, previewRuns, systemActor } from './domain/values.js';

/**
 * Read-only slice of the connector plugin, mirrored structurally so automations never
 * imports another feature plugin's modules. A trigger re-resolves every requested
 * instance here and stops the rule when one is gone or disabled.
 */
export interface AutomationConnectorCatalog {
  list(signal?: AbortSignal): Promise<readonly {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly enabled: boolean;
    readonly state: string;
  }[]>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshAutomations: AutomationsService;
    workdshIdentity: IdentityService;
    workdshExperts: ExpertsService;
    workdshProjects: ProjectService;
    workdshConnectors: AutomationConnectorCatalog;
  }
}

export type AutomationsContext = Context;
