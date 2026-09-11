import type { Context } from '@deepseek-ai/cordis';
import { createElement as h } from 'react';
import { Icon, type IconName } from 'workdsh-ui';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';

const businessPanels = [
  { id: 'workdsh-assistant', label: '助理', icon: 'assistant', order: 10, description: '创建和管理面向具体工作的 AI 助理。' },
  { id: 'workdsh-projects', label: '项目', icon: 'project', order: 20, description: '组织团队任务、资料、成员和共享能力。' },
  { id: 'workdsh-skills', label: '专家 · 技能 · 连接器', icon: 'experts', order: 30 },
  { id: 'workdsh-automation', label: '定时任务', icon: 'automation', order: 40, description: '查看和管理周期性工作。' },
  { id: 'workdsh-library', label: '资料库', icon: 'library', order: 50, description: '集中管理工作资料与任务成果。' },
  { id: 'workdsh-more', label: '更多', icon: 'more', order: 60, description: '进入 WorkDSH 的更多业务能力。' },
] as const satisfies readonly { id: string; label: string; icon: IconName; order: number; description?: string }[];

type BusinessPanelProps = PropsRuntime<'main'> & InjectFace<{ label: string; description: string }>;

function BusinessPanel({ label, description }: BusinessPanelProps) {
  return h('section', { style: { minHeight: '100%', boxSizing: 'border-box', padding: '40px 48px', background: '#121212', color: '#e7e7e7', fontFamily: '"PingFang SC","Microsoft YaHei",sans-serif' } },
    h('p', { style: { margin: '0 0 12px', color: '#888', fontSize: 12, letterSpacing: 2 } }, 'WORKDSH'),
    h('h1', { style: { margin: 0, fontSize: 28, lineHeight: 1.4 } }, label),
    h('p', { style: { maxWidth: 560, marginTop: 18, color: '#aaa', lineHeight: 1.8 } }, description),
    h('p', { style: { maxWidth: 560, marginTop: 28, paddingTop: 20, borderTop: '1px solid #303030', color: '#777', lineHeight: 1.8 } }, '当前切片先接入导航位置；数据服务与操作将在对应领域模块接入后开放。工作区、会话与新任务继续使用 DeepSeek Harness 原生能力。'));
}

/**
 * WorkDSH deliberately leaves the official Sidebar and Conversation occupants in
 * place. Business panels may be contributed through additive public slots, but
 * workspace/session navigation and the new-session composer stay Harness-owned.
 */
export function applyWorkbenchClient(ctx: Context): void {
  for (const panel of businessPanels) {
    if ('description' in panel) ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: panel.id,
        inject: () => ({ label: panel.label, description: panel.description }),
      }, BusinessPanel));
    ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
      name: 'sidebar.panellist',
      id: panel.id,
      label: panel.label,
      order: panel.order,
    }, () => h(Icon, { name: panel.icon })));
  }
}
