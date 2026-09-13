import { waitForDelegation } from './delegation-wait.js';
import { createMessage } from '@deepseek-ai/dsh-llm';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentHandle } from '@deepseek-ai/dsh-agent';
import {
  appendDelegatedPolicyOverrides,
  captureDelegatedPolicyOverrides,
  childSessionMeta,
  finalAssistantOutput,
  resolveChildAgentOptions,
  resolveChildDepth,
} from '@deepseek-ai/dsh-subagent';
import type {
  ResolvedSubagentStartRequest,
  SubagentProvider,
  SubagentRun,
  SubagentResult,
} from '@deepseek-ai/dsh-subagent';
import type { ActorContext, ExpertRevisionRef } from 'workdsh-contracts';

/**
 * The production one-shot expert delegation provider (TM-01 closing slice).
 *
 * This is the published-provider adaptation validated by the probe batches,
 * moved into the plugin's own lifecycle: `registerExpertDelegationProvider`
 * runs inside the experts Host apply, registers through the official
 * `ctx.subagents.registerProvider` (whose disposer is owned by this plugin's
 * Cordis effect), cancels a run through the request signal, and disposes every
 * still-live run when the plugin unloads. All execution stays in the published
 * AgentRegistry / AgentLoop; this module only adapts one-shot creation, frozen
 * expert admission and native settlement. The SOP control-plane check is an
 * injected port (`admission`), so the production team service and the fixture
 * probes share exactly this code path instead of a copied probe implementation.
 */

/** A start-time control-plane check, run before claim and again before each model step. */
export interface DelegationAdmissionInput {
  readonly actor: ActorContext;
  readonly parent: Agent;
  /** The reserved one-shot label (`start` phase) or the published child id (`run` phase). */
  readonly sessionId: string;
  readonly phase: 'start' | 'run';
  readonly signal?: AbortSignal;
}

export interface DelegationAdmissionPort {
  /** Resolve the member revision this start is authorized for, or throw to fail closed. */
  authorizeStart(input: DelegationAdmissionInput): Promise<{ expertRevisionRef: ExpertRevisionRef } | undefined>;
}

export interface ExpertDelegationProviderOptions {
  /** Registry name; defaults to the production `workdsh-expert`. */
  readonly name?: string;
  /** Team/SOP admission port; absent means only the reservation service checks apply. */
  readonly admission?: DelegationAdmissionPort;
}

type ChildSessionId = NonNullable<Parameters<Context['agents']['create']>[0]['sessionId']>;

/** Map the last turn's terminal reason onto a published stop reason. */
function stopReasonOf(kind: string | undefined): SubagentResult['stopReason'] {
  return kind === 'completed' || kind === 'aborted' || kind === 'max-tokens' || kind === 'refusal' ? kind : 'error';
}

/**
 * Register the production one-shot provider on `ctx.subagents` under this
 * plugin's lifecycle. Returns the registry name (the value callers pass to
 * `ctx.subagents.start`).
 */
export function registerExpertDelegationProvider(ctx: Context, options: ExpertDelegationProviderOptions = {}): string {
  const name = options.name ?? 'workdsh-expert';
  // Runs this plugin established but that no consumer has disposed yet. The
  // provider disposer below drains them so an unload never leaks working
  // children; consumer disposals stay independently idempotent.
  const liveRuns = new Set<SubagentRun>();
  const provider: SubagentProvider = {
    name,
    capabilities: { agentOptions: false, outputSchema: false, depthLimit: true, toolFilter: false, persona: false },
    inheritsParentContext: false,
    // No prepareContinuable: the published seam cannot select another preset.
    async start(request: ResolvedSubagentStartRequest): Promise<SubagentRun> {
      const { parent, signal } = request;
      const policy = captureDelegatedPolicyOverrides(parent);
      signal.throwIfAborted();
      if (ctx.agents.get(parent.id) !== parent) throw new Error('workdsh-expert/stale-parent');
      const depth = resolveChildDepth(parent, Math.min(request.maxDepth ?? 1, 1));
      if (!request.label) throw new Error('workdsh-expert/reservation-required');
      const actor = await ctx.workdshIdentity.resolve({ sessionId: parent.id }, signal);
      // Optional Host SOP gate, checked even when callers bypass tools. Failed
      // reservations cannot be converted into runnable raw labels.
      const admission = await options.admission?.authorizeStart({ actor, parent, sessionId: request.label, signal, phase: 'start' });
      // The label addresses a prior Host-authorized reservation, never a raw
      // expert/preset. Claim checks actor, organization, parent and one-shot use.
      const binding = await ctx.workdshExperts.claimDelegation(actor, request.label, parent.id, signal);
      if (admission && (admission.expertRevisionRef.expertId !== binding.expertRevisionRef.expertId
        || admission.expertRevisionRef.revisionId !== binding.expertRevisionRef.revisionId)) throw new Error('workdsh-expert/sop-member-mismatch');
      let handle: AgentHandle | undefined;
      let cancel: (() => void) | undefined;
      try {
        signal.throwIfAborted();
        if (ctx.agents.get(parent.id) !== parent) throw new Error('workdsh-expert/stale-parent');
        const meta = { ...childSessionMeta(parent, depth, false), agentPreset: binding.presetRevisionRef };
        if ((meta as { cwd?: string }).cwd !== binding.workspaceRef) throw new Error('workdsh-expert/workspace-mismatch');
        const created = await ctx.agents.create({
          sessionId: binding.sessionId as ChildSessionId, parentAgent: parent, meta, signal,
          agentOptions: resolveChildAgentOptions(parent, undefined, depth),
          setup: async (childCtx, child) => {
            await ctx.agentPresets.mount(childCtx, binding.presetRevisionRef);
            signal.throwIfAborted();
            appendDelegatedPolicyOverrides(child.session, policy);
            await ctx.workdshExperts.verifyBinding(actor, child.id, signal);
            let descriptorWritten = false;
            childCtx.on('agent/pre-step', async ({ agent }, next) => {
              if (agent !== child) throw new Error('workdsh-expert/scope-mismatch');
              // Recheck after async creation and before every model step. A
              // withdrawn SOP admission cannot survive as a stale reservation.
              await options.admission?.authorizeStart({ actor, parent, sessionId: child.id, signal, phase: 'run' });
              signal.throwIfAborted();
              if (!descriptorWritten) {
                child.session.append('subagent/descriptor', request.descriptor);
                descriptorWritten = true;
              }
              return next();
            });
          },
        });
        handle = created;
        signal.throwIfAborted();
        const child = created.agent;
        cancel = () => child.cancel({ kind: 'parent' });
        signal.addEventListener('abort', cancel, { once: true });
        child.followup(createMessage({ role: 'user', source: { kind: 'agent-message', form: 'relay', senderSessionId: parent.id }, content: request.prompt }));
        const result = waitForDelegation(child.whenIdle(), { signal, cancel: () => child.cancel({ kind: 'parent' }), progress: () => child.session.snapshotEvents().at(-1)?.seq }).then(() => {
          const events = child.session.snapshotEvents();
          const reason = events.filter(event => event.type === 'turn/end').at(-1)?.data.reason.kind;
          return { output: finalAssistantOutput(events) ?? [], stopReason: stopReasonOf(reason) };
        }).finally(() => signal.removeEventListener('abort', cancel!));
        let disposal: Promise<void> | undefined;
        const run: SubagentRun = {
          id: child.id,
          localAgent: child,
          result,
          dispose() {
            return disposal ??= created.dispose().finally(() => {
              signal.removeEventListener('abort', cancel!);
              liveRuns.delete(run);
            });
          },
        };
        liveRuns.add(run);
        return run;
      } catch (error) {
        if (cancel) signal.removeEventListener('abort', cancel);
        await handle?.dispose();
        throw error;
      }
    },
  };
  ctx.effect(() => {
    const unregister = ctx.subagents.registerProvider(provider);
    return () => {
      // Stop new starts first, then drain runs nobody disposed yet. Each
      // `dispose` is idempotent, so a consumer that already released its run
      // is a no-op here.
      unregister();
      return Promise.all([...liveRuns].map(run => run.dispose())).then(() => undefined);
    };
  }, 'workdshExperts.delegationProvider');
  return name;
}
