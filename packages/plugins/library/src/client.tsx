import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import { createLibraryClient } from './client/management.js';
import { LibraryPanel } from './client/LibraryPanel.js';

export const name = 'workdsh-library-client';
export const inject = ['slots', 'layout', 'connection'];
export function apply(ctx: Context): void {
  const lifetime = new AbortController(); ctx.effect(() => () => lifetime.abort(), 'workdsh.library.client');
  const management = createLibraryClient(ctx, lifetime.signal);
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'workdsh-library', inject: () => ({ management, toggleNavigation: () => ctx.layout.toggleSidebar() }) }, LibraryPanel));
}

