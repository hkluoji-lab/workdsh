import { TaskExecutionNotice } from '../client/components/TaskExecutionNotice.js';
import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import {
  BusinessPanel,
  BusinessPanelIcon,
  businessPanels,
  sidebarLabel,
} from '../client/components/BusinessPanel.js';

/**
 * Keep the official Sidebar and Conversation occupants in place. WorkDSH only
 * contributes business navigation and paired main panels through public Slots.
 *
 * Only still-unimplemented entries are listed here: each one registers both its
 * `sidebar.panellist` row and its explanatory `main` panel, so a row never
 * outlives its page. Entries that own a real page (the library, the capability
 * centre) register their row and `main` key in their own plugin instead.
 */
export const name = 'workdsh-workbench-client';
export const inject = ['slots'];

export function apply(ctx: Context): void {
  ctx.slots.inject('conversation.input.dock', () => ctx.slots.register({ name: 'conversation.input.dock', id: 'workdsh-task-execution-notice' }, TaskExecutionNotice));
  for (const panel of businessPanels) {
    ctx.slots.inject('main', () => ctx.slots.register({
      name: 'main',
      key: panel.id,
      inject: () => ({ label: panel.label, description: panel.pending.description, boundary: panel.pending.boundary }),
    }, BusinessPanel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: panel.id,
      label: sidebarLabel(panel),
      order: panel.order,
      inject: () => ({ icon: panel.icon }),
    }, BusinessPanelIcon));
  }
}
