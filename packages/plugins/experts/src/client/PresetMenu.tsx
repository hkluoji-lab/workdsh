import * as React from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ExpertManagementClient } from './management.js';
import { isNativePreset, nativePresetRows, requireNativePreset } from './preset-policy.js';

/** A summoned expert is already bound; this surface names it without offering a preset swap. */
function SummonedExpertSeat(props: any) {
  const state = props.useAgentPresetSeat((snapshot: any) => snapshot);
  React.useEffect(() => { void props.load(); }, [props.load]);
  const name = state.options.find((row: any) => row.id === state.current)?.name;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'inherit', color: 'inherit' }} title={name || '已召唤专家'}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="12" cy="6" r="3"/><circle cx="5" cy="17" r="3"/><circle cx="19" cy="17" r="3"/><path d="M10 9 6.5 14M14 9l3.5 5M8 17h8"/></svg>
    {name || '已召唤专家'}
  </span>;
}

/** Native controllers stay owned by Harness; expert execution uses the binding-aware summon path. */
export function installExpertPresetMenu(ctx: Context, _management: ExpertManagementClient): void {
  const install = (key: string, entryId?: string) => {
    let dispose: (() => void) | undefined;
    const ready = () => {
      if (dispose) return;
      const original = ctx.slots.entriesOfSlot(key as any).find((entry: any) => entryId ? entry.options.id === entryId : !!entry.inject);
      if (!original?.inject) return;
      const Native = original.component as React.ComponentType<any>;
      function PublicPresets(props: any) {
        if (entryId) {
          const useSection = (selector: (state: any) => unknown) => props.useAgentPresetSection((state: any) => selector({ ...state, rows: nativePresetRows(state.rows) }));
          return <Native {...props} useAgentPresetSection={useSection} makeDefault={async (id: string) => { requireNativePreset(id); await props.makeDefault(id); }} beginCopy={(id: string) => { requireNativePreset(id); props.beginCopy(id); }}/>;
        }
        const current = props.useAgentPresetSeat((state: any) => state.current);
        if (current && !isNativePreset(current)) return <SummonedExpertSeat {...props}/>;
        const useSeat = (selector: (state: any) => unknown) => props.useAgentPresetSeat((state: any) => selector({ ...state, options: nativePresetRows(state.options) }));
        return <Native {...props} useAgentPresetSeat={useSeat} select={async (id: string) => { requireNativePreset(id); return props.select(id); }} />;
      }
      dispose = ctx.slots.register({ name: key, ...(entryId ? { id: entryId, order: original.options.order, label: original.options.label } : {}), priority: -10, locale: 'settings.agentPreset', inject: original.inject } as any, PublicPresets);
    };
    ctx.effect(() => { const stop = ctx.slots.subscribe(key as any, ready); ready(); return () => { stop(); dispose?.(); }; }, `workdsh.expert-preset-menu.${entryId ?? 'seat'}`);
  };
  install('conversation.hero.agentPreset');
  install('settings.section', 'agent-presets');
}
