import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import { ExpertsPanel } from './client/ExpertsPanel.js';
import { PendingExpertDraft, pendingExpertDraftKey, pendingExpertDraftEvent, expertManagerGuide } from './client/drafts.js';
import { createExpertManagementClient } from './client/management.js';

export const name = 'workdsh-experts-client';
export const inject = ['slots', 'layout', 'sessions', 'workspaces', 'remote', 'remote.session', 'connection'];

type SessionId = Parameters<ISessions['open']>[0];

/**
 * Expert Client assembly (D04 / P1-02).
 *
 * Contributes exactly one `main` panel (`workdsh-experts`) and one native-input draft
 * overlay. It deliberately does NOT register a `sidebar.panellist` entry: the shared
 * capability center ("专家 · 技能 · 连接器") stays a single navigation item owned by the
 * Skill plugin, and the two panels switch through the in-panel capability tabs via
 * `layout.selectPanel`. This keeps AT-20 (no duplicate navigation) and lets the Skill
 * panel keep working when experts is removed.
 *
 * Summon creates the bound native Session on the Host (so the expert's compiled preset
 * is attached at creation), then opens it here and seeds a one-shot draft hand-off; the
 * draft is never auto-sent. "制作专家" opens an ordinary Session seeded with the
 * `/workdsh-expert-manager` guide.
 */
export function apply(ctx: Context): void {
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(), 'workdsh.experts.client');
  const waitForInput = (milliseconds: number) => new Promise<void>((resolve, reject) => {
    lifetime.signal.throwIfAborted();
    const abort = () => { window.clearTimeout(timer); reject(lifetime.signal.reason); };
    const timer = window.setTimeout(() => { lifetime.signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    lifetime.signal.addEventListener('abort', abort, { once: true });
  });
  // Host and Client faces ship from one package; keep browser calls bound to the client face.
  const sessions = ctx.sessions as unknown as ISessions;
  const management = createExpertManagementClient(ctx, lifetime.signal);

  const resolveWorkspace = () => {
    const sessionState = sessions.list.getSnapshot();
    const current = sessionState.current ? sessionState.byId[sessionState.current] : undefined;
    const workspaces = ctx.workspaces.list.getSnapshot().items;
    return workspaces.find(row => row.sessionIds.includes(sessionState.current!))
      ?? workspaces.find(row => row.path === current?.cwd)
      ?? workspaces[0];
  };

  /** Seed an empty native input once through the addressed overlay hand-off. */
  const seedDraft = async (sessionId: SessionId, text: string): Promise<void> => {
    window.sessionStorage.setItem(pendingExpertDraftKey, JSON.stringify({ sessionId, text, expiresAt: Date.now() + 60_000 }));
    // Select after staging so the Session overlay mounts with its addressed seed.
    sessions.open(sessionId);
    window.dispatchEvent(new Event(pendingExpertDraftEvent));
  };

  /** Pull the Host-created native Session into the client list, then select it. */
  const openSession = async (sessionId: SessionId): Promise<void> => {
    for (let attempt = 0; attempt < 30; attempt++) {
      lifetime.signal.throwIfAborted();
      await sessions.refresh();
      if (sessions.list.getSnapshot().byId[sessionId]) { sessions.open(sessionId); return; }
      await waitForInput(120);
    }
    throw new Error('未能打开专家任务，请稍后在会话列表中查看。');
  };

  const summon = async (expertId: string, revisionId: string | undefined, draftText: string | undefined): Promise<void> => {
    lifetime.signal.throwIfAborted();
    const workspace = resolveWorkspace();
    const plan = await management.prepareExecution(expertId, {
      ...(revisionId === undefined ? {} : { revisionId }),
      ...(workspace ? { workspaceRef: workspace.path, workspaceId: String(workspace.workspaceId) } : {}),
      ...(draftText ? { draftText } : {}),
    });
    if (plan.missing.length > 0) {
      throw new Error(plan.missing.map(issue => issue.message).join('；') || '该专家暂不可召唤。');
    }
    const creation = await management.createExecution(plan.executionPlanId, management.newOperationId('create-execution'));
    const sessionId = creation.sessionId as SessionId;
    await openSession(sessionId);
    ctx.layout.selectPanel(null);
    if (creation.handoffId) {
      const handoff = await management.consumeHandoff(creation.handoffId, creation.handoffId);
      if (handoff.text) await seedDraft(sessionId, handoff.text);
    }
  };

  const createExpertTask = async (): Promise<void> => {
    lifetime.signal.throwIfAborted();
    const workspace = resolveWorkspace();
    if (!workspace) throw new Error('需要先选择一个工作区再制作专家。');
    const sessionId = await sessions.create({ workspaceId: workspace.workspaceId, cwd: workspace.path });
    lifetime.signal.throwIfAborted();
    sessions.open(sessionId);
    ctx.layout.selectPanel(null);
    await seedDraft(sessionId, expertManagerGuide);
  };

  const openCapability = (key: string): void => { ctx.layout.selectPanel(key as Parameters<typeof ctx.layout.selectPanel>[0]); };
  const hasCapability = (key: string): boolean => ctx.slots.entriesOfSlot('main').some(entry => entry.options.key === key);

  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: 'workdsh-experts',
    inject: () => ({ toggleNavigation: () => ctx.layout.toggleSidebar(), management, openCapability, hasCapability, summon, createExpertTask }),
  }, ExpertsPanel));
  ctx.slots.inject('conversation.input.overlay', () => ctx.slots.register({ name: 'conversation.input.overlay', id: 'workdsh-expert-draft' }, PendingExpertDraft));
}
