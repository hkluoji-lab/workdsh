import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ReferenceInsert } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { InputTriggerSource } from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import { createLibraryClient } from './client/management.js';
import { LibraryPanel } from './client/LibraryPanel.js';
import { LibraryPicker } from './client/LibraryPicker.js';
import { createLibraryPreviewRegistry } from './client/preview-registry.js';
import type { LibraryOriginalPreviewRegistry } from 'workdsh-contracts/library';

declare module '@deepseek-ai/cordis' { interface Context { workdshLibraryPreview: LibraryOriginalPreviewRegistry; } }

export const name = 'workdsh-library-client';
export const inject = ['slots', 'layout', 'connection', 'sessions', 'conversation', 'inputTriggers'];
export function apply(ctx: Context): void {
  const lifetime = new AbortController(); ctx.effect(() => () => lifetime.abort(), 'workdsh.library.client');
  const management = createLibraryClient(ctx, lifetime.signal);
  const previewRegistry = createLibraryPreviewRegistry();
  ctx.provide('workdshLibraryPreview', previewRegistry);
  const sessions = ctx.sessions as unknown as ISessions;
  type LibraryRef = { assetId: string; revisionId: string; nodeId: string; name: string; kind: string; sessionId?: string };
  const encodeRef = (value: LibraryRef) => encodeURIComponent(JSON.stringify(value));
  const decodeRef = (value: string) => JSON.parse(decodeURIComponent(value)) as LibraryRef;
  const referenceOf = (value: LibraryRef): ReferenceInsert => ({ source: 'workdsh-library', ref: encodeRef(value), label: value.name, appearance: 'file', clipboardText: `@资料库/${value.name}` });
  const insertReference = (sessionId: string, value: LibraryRef): boolean => {
    const binding = sessions.binding(sessionId as never);
    if (!binding) return false;
    const input = ctx.conversation.input.for(binding.ctx);
    const state = input.state.getSnapshot();
    const offset = state.draft.length;
    const scoped = { ...value, sessionId };
    const inserted = binding.ctx.bail(binding.ctx, 'slash/input-insert-reference', { reference: referenceOf(scoped), span: { start: offset, end: offset, draftRev: state.draftRev } }) === true;
    if (inserted) void management.taskSelection(sessionId).then(current => management.setTaskSelection(sessionId, [...new Set([...current.map(row => row.nodeId), value.nodeId])])).catch(() => []);
    return inserted;
  };
  const source: InputTriggerSource = {
    trigger: '@', name: 'workdsh-library', order: 30, showGroupTitle: false,
    candidates: async (_session, request) => {
      if (!request.query.trim()) {
        const collect = async (parentId?: string): Promise<LibraryRef[]> => (await Promise.all((await management.list(parentId)).map(row => row.kind === 'folder' ? collect(row.id) : Promise.resolve(row.asset && row.revision ? [{ assetId: row.asset.id, revisionId: row.revision.id, nodeId: row.id, name: row.name, kind: row.asset.kind }] : [])))).flat();
        const values = await collect();
        return values.map(value => ({ name: value.name, label: value.name, description: value.kind.toUpperCase(), icon: 'file' as const, value: encodeRef(value) }));
      }
      const hits = await management.search(request.query).catch(() => []);
      return hits.map(hit => ({ name: hit.name, label: hit.name, description: [hit.folderPath, hit.excerpt].filter(Boolean).join(' · '), icon: 'file' as const, value: encodeRef(hit) }));
    },
    onPick: pick => {
      if (!pick.candidate.value) return undefined;
      const value = decodeRef(pick.candidate.value);
      const sessionId = String(pick.session.sessionId);
      void management.taskSelection(sessionId).then(current => management.setTaskSelection(sessionId, [...new Set([...current.map(row => row.nodeId), value.nodeId])])).catch(() => []);
      return { insert: referenceOf({ ...value, sessionId }) };
    },
    codec: {
      clipboardText: ref => `@资料库/${decodeRef(ref).name}`,
      serialize: async ref => {
        const value = decodeRef(ref);
        if (value.sessionId) {
          const current = await management.taskSelection(value.sessionId);
          if (!current.some(row => row.nodeId === value.nodeId)) await management.setTaskSelection(value.sessionId, [...current.map(row => row.nodeId), value.nodeId]);
        }
        return `@资料库/${value.name}`;
      },
    },
  };
  ctx.effect(() => ctx.inputTriggers.registerSource(source));
  ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'workdsh-library', inject: () => ({ management, previewRegistry, toggleNavigation: () => ctx.layout.toggleSidebar(), currentSessionId: () => { const id = sessions.list.getSnapshot().current; return id ? String(id) : undefined; }, addToConversation: (sessionId: string, entry: import('workdsh-contracts/library').LibraryTreeEntry) => entry.asset && entry.revision ? insertReference(sessionId, { assetId: entry.asset.id, revisionId: entry.revision.id, nodeId: entry.id, name: entry.name, kind: entry.asset.kind }) : false, returnToConversation: () => ctx.layout.selectPanel(null) }) }, LibraryPanel));
  ctx.slots.inject('conversation.input.left', () => ctx.slots.register({
    name: 'conversation.input.left', id: 'workdsh-library-picker', order: 35,
    inject: () => ({ management, openLibrary: () => ctx.layout.selectPanel('workdsh-library' as Parameters<typeof ctx.layout.selectPanel>[0]), openPicker: (sessionId: string, draft: string, draftRev: number) => { const binding = sessions.binding(sessionId as never); if (!binding) return; const offset = draft.length; ctx.inputTriggers.sessionOf(binding.ctx).toggleSource('workdsh-library', { trigger: '@', query: '', quoted: false, position: offset === 0 ? 'leading' : 'inline', span: { start: offset, end: offset, draftRev } }); } }),
  }, LibraryPicker));
}
