import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import { createLibraryClient } from './client/management.js';
import { LibraryPanel } from './client/LibraryPanel.js';
import { LibraryPicker } from './client/LibraryPicker.js';

export const name = 'workdsh-library-client';
export const inject = ['slots', 'layout', 'connection', 'sessions'];
export function apply(ctx: Context): void {
  const lifetime = new AbortController(); ctx.effect(() => () => lifetime.abort(), 'workdsh.library.client');
  const management = createLibraryClient(ctx, lifetime.signal);
  const sessions = ctx.sessions as unknown as ISessions;
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'workdsh-library', inject: () => ({ management, toggleNavigation: () => ctx.layout.toggleSidebar(), currentSessionId: () => { const id = sessions.list.getSnapshot().current; return id ? String(id) : undefined; } }) }, LibraryPanel));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'workdsh-library-picker', order: 35,
    inject: () => ({ management, openLibrary: () => ctx.layout.selectPanel('workdsh-library' as Parameters<typeof ctx.layout.selectPanel>[0]) }),
  }, LibraryPicker));
}
