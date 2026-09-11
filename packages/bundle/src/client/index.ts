import { applyWorkbenchClient } from 'workdsh-plugin-workbench';
import type {} from '@deepseek-ai/dsh-client-ui-theme/client';
import { applySkillsClient } from 'workdsh-plugin-skills/client';
import type { Context } from '@deepseek-ai/cordis';
import { createElement as h, useEffect, useState, useRef } from 'react';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type { PanelInfo } from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-api-remotes/client';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

export const name = 'workdsh-client-probe';
export const inject = ['slots', 'layout', 'remote', 'remote.pluginInventory', 'remote.skills', 'remote.session', 'sessions', 'workspaces', 'theme', 'connection'];
type Inventory = { total: number; modules: readonly { module: string; phase: string | null }[] };
type ProbePanelProps = PropsRuntime<'main'> & InjectFace<{ inspect: () => Promise<Inventory>; returnToConversation: () => void }>;

/** Transient diagnostic result only; no business objects or session mirror. */
function ProbePanel({ inspect, returnToConversation }: ProbePanelProps) {
  const [state, setState] = useState<{ result?: Inventory; error?: string; busy: boolean }>({ busy: false });
  const [request, setRequest] = useState(0);
  useEffect(() => {
    if (!request) return;
    let current = true;
    setState({ busy: true });
    inspect().then(result => { if (current) setState({ busy: false, result }); },
      (error: unknown) => { console.error('[workdsh:probe] Remote failed', error instanceof Error ? error.message : 'unknown'); if (current) setState({ busy: false, error: '读取失败，请检查 Host 连接后重试。' }); });
    return () => { current = false; };
  }, [inspect, request]);
  return h('section', { 'data-testid': 'workdsh-probe', style: { maxWidth: 880, margin: 'auto', padding: '56px 32px', fontFamily: '"PingFang SC", sans-serif', color: '#18372b', background: '#f2f6f3', borderRadius: 16 } },
    h('p', { style: { color: '#496c5d', letterSpacing: 3, fontSize: 12 } }, 'WORKDSH / D01'),
    h('h1', { style: { fontSize: 32, margin: '18px 0', fontWeight: 600 } }, '接入验证'),
    h('button', { type: 'button', onClick: returnToConversation }, '返回 Harness 会话'),
    h('p', { style: { lineHeight: 1.8, opacity: .8 } }, '此页面验证官方 Client 插件与 Host 的通信。业务工作台、专家和资料库尚未实现。'),
    h('div', { style: { borderTop: '1px solid #46534d', marginTop: 36, paddingTop: 24 } },
      h('h2', { style: { fontSize: 18 } }, 'Host 插件清单'),
      h('p', null, '通过官方 Remote 读取当前实例的真实加载状态。'),
      h('button', { type: 'button', disabled: state.busy, onClick: () => setRequest(n => n + 1), style: { background: '#bee5d2', color: '#142b22', padding: '12px 22px', border: 0, borderRadius: 8, cursor: 'pointer' } }, state.busy ? '正在读取…' : '读取 Host 状态'),
      h('div', { role: 'status', 'aria-live': 'polite', style: { paddingTop: 24, lineHeight: 1.8 } },
        state.error || (state.result ? `Remote 已返回 · 共 ${state.result.total} 个 Host 条目` : '尚未发起查询')),
      state.result && h('ul', { style: { paddingLeft: 20 } }, ...state.result.modules.map(row =>
        h('li', { key: row.module }, `${row.module} · ${row.phase ?? '未激活'}`)))));
}

/** URL stores presentation only, never Session identity or authority. */
type NavigationLocationProps = PropsRuntime<'shell.overlay'> & InjectFace<{ selectView: (view: string | null) => void }>;

function NavigationLocation({ usePanelInfo, selectView }: NavigationLocationProps) {
  const active = usePanelInfo((info: PanelInfo) => info.activePanelId);
  const initialized = useRef(false);
  const restoring = useRef(false);
  useEffect(() => {
    const restore = () => {
      restoring.current = true;
      selectView(new URL(window.location.href).searchParams.get('workdsh-view'));
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, [selectView]);
  useEffect(() => {
    const panelToView: Record<string, string> = {
      'workdsh-probe': 'diagnostics',
      'workdsh-skills': 'skills',
      'workdsh-assistant': 'assistant',
      'workdsh-projects': 'projects',
      'workdsh-library': 'library',
      'workdsh-automation': 'automation',
      'workdsh-more': 'more',
    };
    if (active !== null && !(active in panelToView)) return;
    const url = new URL(window.location.href);
    const view = active === null ? 'conversation' : panelToView[active];
    if (url.searchParams.get('workdsh-view') !== view) {
      url.searchParams.set('workdsh-view', view);
      if (!initialized.current || restoring.current) window.history.replaceState(window.history.state, '', url);
      else window.history.pushState(window.history.state, '', url);
    }
    initialized.current = true;
    restoring.current = false;
  }, [active]);
  return null;
}

export function apply(ctx: Context): void {
  const previousTheme = ctx.theme.getTheme().preference;
  const unregisterTheme = ctx.theme.register({ id: 'workdsh', colorScheme: 'dark', tokens: {
    '--dsw-alias-bg-layer-1': '#121212', '--dsw-alias-bg-layer-2': '#202020',
    '--dsw-alias-bg-layer-3': '#242424', '--dsw-alias-label-primary': '#e7e7e7',
    '--dsw-alias-label-secondary': '#a5a5a5', '--dsw-specific-sidebar-fill': '#202020',
    '--dsw-specific-sidebar-nav-item-active': '#3a3a3a',
  } });
  // The WorkDSH presentation is dark, including after asynchronous Host settings hydration.
  const stopThemeSync = ctx.on('theme/change', snapshot => { if (snapshot.active.colorScheme !== 'dark') ctx.theme.setTheme('workdsh'); });
  ctx.theme.setTheme('workdsh');
  ctx.effect(() => () => { stopThemeSync(); if (ctx.theme.getTheme().active.id === 'workdsh') ctx.theme.setTheme(previousTheme); unregisterTheme(); });
  applySkillsClient(ctx);
  applyWorkbenchClient(ctx);
  const viewToPanel: Record<string, string> = {
    skills: 'workdsh-skills',
    diagnostics: 'workdsh-probe',
    assistant: 'workdsh-assistant',
    projects: 'workdsh-projects',
    library: 'workdsh-library',
    automation: 'workdsh-automation',
    more: 'workdsh-more',
  };
  const selectView = (view: string | null) => ctx.layout.selectPanel(view && viewToPanel[view] ? viewToPanel[view] as Parameters<typeof ctx.layout.selectPanel>[0] : null);
  const inspect = async (): Promise<Inventory> => {
    const response = await ctx.remote.pluginInventory.list();
    if (!response.ok) throw new Error(response.error.code);
    return { total: response.value.entries.length, modules: response.value.entries
      .filter(row => row.moduleName.startsWith('workdsh-'))
      .map(row => ({ module: row.moduleName, phase: row.fiberPhase })) };
  };
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -10 }, () => h('span', { 'data-testid': 'workdsh-brand' }, 'WorkDSH')));
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -10 }, () => h('span', { 'aria-hidden': true, style: { fontWeight: 700 } }, 'W')));
  ctx.slots.inject('main', () => {
    const dispose = ctx.slots.register({ name: 'main', key: 'workdsh-probe', inject: () => ({ inspect, returnToConversation: () => ctx.layout.selectPanel(null) }) }, ProbePanel);
    const requested = new URL(window.location.href).searchParams.get('workdsh-view');
    const diagnostics = new URL(window.location.href).searchParams.get('diagnostics') === '1';
    ctx.layout.selectPanel(requested && viewToPanel[requested] ? viewToPanel[requested] as Parameters<typeof ctx.layout.selectPanel>[0] : !requested && diagnostics ? 'workdsh-probe' as Parameters<typeof ctx.layout.selectPanel>[0] : null);
    return dispose;
  });
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({ name: 'shell.overlay', id: 'workdsh-location', inject: () => ({ selectView }) }, NavigationLocation));
  if (new URL(window.location.href).searchParams.get('diagnostics') === '1') ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'workdsh-probe', label: 'WorkDSH 接入验证', order: 90 }, () => h('span', { 'aria-hidden': true }, 'W')));
}
