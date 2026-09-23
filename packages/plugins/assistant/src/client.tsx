import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-connection/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';
import { Icon } from 'workdsh-ui';
import { createAssistantClient } from './client/management.js';
import { AssistantPanel } from './client/AssistantPanel.js';

export const name = 'workdsh-assistant-client';
export const inject = ['slots', 'layout', 'connection'];

export function apply(ctx: Context): void {
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(), 'workdsh.assistant.client');
  const management = createAssistantClient(ctx, lifetime.signal);
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main', key: 'workdsh-assistant',
    inject: () => ({ toggleNavigation: () => ctx.layout.toggleSidebar(), management }),
  }, AssistantPanel));
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: 'workdsh-assistant', label: '助理', order: 10 }, AssistantNavigationIcon));
}

/**
 * 助理自持的侧栏入口。
 *
 * 页面所属插件同时注册 `main` 与同名的 `sidebar.panellist` 行，这样插件缺席时
 * 不会留下「有入口、无页面」的行——官方 Sidebar 的行按钮直接调用
 * `ctx.layout.selectPanel(id)`，对未注册的 main 会抛
 * `layout.selectPanel: main panel "workdsh-assistant" is not registered`。
 * order 10 与 UI-DESIGN 第 5 节的导航顺序一致（项目之后、能力中心之前）。
 */
export function AssistantNavigationIcon() {
  return <Icon name="assistant" />;
}
