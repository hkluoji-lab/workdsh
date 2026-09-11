import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import { PendingSkillDraft, pendingDraftKey, skillManagementDraft, skillTaskDrafts, type SkillTaskKind } from './client/drafts.js';
import { SkillsPanel } from './client/SkillsPanel.js';
import { createSkillManagementClient } from './client/management.js';
import { SkillNavigationIcon } from './client/SkillNavigationIcon.js';

export const name = 'workdsh-skills-client';
export const inject = ['slots', 'layout', 'sessions', 'workspaces', 'remote', 'remote.session', 'connection'];

export function apply(ctx: Context): void {
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(), 'workdsh.skills.client');
  const waitForInput = (milliseconds: number) => new Promise<void>((resolve, reject) => {
    lifetime.signal.throwIfAborted();
    const abort = () => { window.clearTimeout(timer); reject(lifetime.signal.reason); };
    const timer = window.setTimeout(() => { lifetime.signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    lifetime.signal.addEventListener('abort', abort, { once: true });
  });
  // Host and Client faces are emitted from one package. Importing the official
  // Host tool runtime also declaration-merges its SessionStore onto Context, so
  // keep browser calls explicitly bound to the Session Controller client face.
  const sessions = ctx.sessions as unknown as ISessions;
  const management = createSkillManagementClient(ctx, lifetime.signal);
  const startSkillTask = async (kind: SkillTaskKind, name?: string): Promise<void> => {
    lifetime.signal.throwIfAborted();
    const sessionState = sessions.list.getSnapshot();
    const current = sessionState.current ? sessionState.byId[sessionState.current] : undefined;
    const workspaces = ctx.workspaces.list.getSnapshot().items;
    const workspace = workspaces.find(row => row.sessionIds.includes(sessionState.current!))
      ?? workspaces.find(row => row.path === current?.cwd)
      ?? workspaces[0];
    if (!workspace) throw new Error('workspace required');
    const draft = kind === 'create' ? skillTaskDrafts[kind] : skillManagementDraft(kind, name!);
    const sessionId = await sessions.create({ workspaceId: workspace.workspaceId, cwd: workspace.path });
    lifetime.signal.throwIfAborted();
    window.sessionStorage.setItem(pendingDraftKey, draft);
    sessions.open(sessionId);
    ctx.layout.selectPanel(null);
    // Selection/addressability resolves before the native Lexical editor has
    // restored its persisted draft. Seed only after that first paint so the
    // editor's restore effect cannot overwrite this hand-off.
    await waitForInput(150);
    for (let attempt = 0; attempt < 40; attempt++) {
      const scope = sessions.scope(sessionId);
      if (scope) {
        try { scope.conversation.input.for(scope).setDraft(draft); return; }
        catch { /* Conversation input mounts after the selected Session paints. */ }
      }
      await waitForInput(25);
    }
    // The official overlay consumes the sessionStorage hand-off when the
    // Conversation input mounts. A direct action may be unavailable during
    // first-paint setup, so leave the one-time draft pending instead of
    // reporting a false failure after the native editor already accepted it.
  };
  const startSkillTrial = async (skillName: string): Promise<void> => {
    lifetime.signal.throwIfAborted();
    const draft = `/${skillName} `;
    const sessionState = sessions.list.getSnapshot();
    const current = sessionState.current ? sessionState.byId[sessionState.current] : undefined;
    const workspaces = ctx.workspaces.list.getSnapshot().items;
    const workspace = workspaces.find(row => row.sessionIds.includes(sessionState.current!)) ?? workspaces.find(row => row.path === current?.cwd) ?? workspaces[0];
    if (!workspace) throw new Error('workspace required');
    const sessionId = await sessions.create({ workspaceId: workspace.workspaceId, cwd: workspace.path });
    lifetime.signal.throwIfAborted();
    window.sessionStorage.setItem(pendingDraftKey, draft);
    sessions.open(sessionId);
    ctx.layout.selectPanel(null);
  };
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'workdsh-skills', inject: () => ({ toggleNavigation: () => ctx.layout.toggleSidebar(), management, startSkillTask, startSkillTrial }) }, SkillsPanel));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist', id: 'workdsh-skills', label: '专家 · 技能 · 连接器', order: 30,
  }, SkillNavigationIcon));
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({ name: 'conversation.input.overlay', id: 'workdsh-skill-draft' }, PendingSkillDraft));
}
