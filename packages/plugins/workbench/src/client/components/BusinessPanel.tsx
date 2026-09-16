import * as React from 'react';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import { Icon, type IconName } from 'workdsh-ui';
import { workbenchPanelCss } from '../styles.js';

export type BusinessPanelDefinition = {
  readonly id: string;
  readonly label: string;
  readonly icon: IconName;
  readonly order: number;
  readonly description?: string;
  /** 未实现说明与当前可用的下一步。规划状态以 development-order.json 的步骤 ID 为准。 */
  readonly boundary: string;
};

export const businessPanels = [
  {
    id: 'workdsh-assistant',
    label: '助理',
    icon: 'assistant',
    order: 10,
    description: '创建和管理面向具体工作的 AI 助理。',
    boundary: '助理尚未实现（开发顺序 D16 / P1-12），本页没有可读取的助理对象，不会返回任何数据。下一步：先到「专家 · 技能 · 连接器」创建专家，再用原生新任务开始对话。',
  },
  {
    id: 'workdsh-projects',
    label: '项目',
    icon: 'project',
    order: 20,
    description: '组织团队任务、资料、成员和共享能力。',
    boundary: '项目尚未实现（开发顺序 D07 / P1-11，且为首期发布前置），本页没有可读取的项目、成员与资产数据。下一步：先在原生工作区中用目录和会话组织当前工作。',
  },
  {
    id: 'workdsh-automation',
    label: '定时任务',
    icon: 'automation',
    order: 40,
    description: '查看和管理周期性工作。',
    boundary: '定时任务尚未实现（开发顺序 D12 / P2-03），本页没有可读取的周期任务或其运行记录。下一步：周期性工作仍需每次手动在原生会话里发起。',
  },
  {
    id: 'workdsh-library',
    label: '资料库',
    icon: 'library',
    order: 50,
    description: '集中管理工作资料与任务成果。',
    boundary: '资料库尚未实现（开发顺序 D06 / P1-06），本页没有可读取的资料数据。下一步：当前会话的文件与成果可在右侧栏查看。',
  },
  {
    id: 'workdsh-more',
    label: '更多',
    icon: 'more',
    order: 60,
    description: '进入 WorkDSH 的更多业务能力。',
    boundary: '「更多」汇总的后续业务能力均未实现：行业应用 D08、企业后台 D09、团队部署 D14、在线表格与业务页面 D15。下一步：现在可用的是原生工作区与会话、「专家 · 技能 · 连接器」以及 Office 文档能力。',
  },
] as const satisfies readonly BusinessPanelDefinition[];

export type BusinessPanelProps = PropsRuntime<'main'> & InjectFace<{
  readonly label: string;
  readonly description: string;
  readonly boundary: string;
}>;

export function BusinessPanel({ label, description, boundary }: BusinessPanelProps) {
  return (
    <section className="wd-workbench-panel">
      <style>{workbenchPanelCss}</style>
      <p className="wd-workbench-eyebrow">WORKDSH</p>
      <h1>{label}</h1>
      <p className="wd-workbench-description">{description}</p>
      <p className="wd-workbench-boundary">{boundary}</p>
    </section>
  );
}

export type BusinessPanelIconProps = InjectFace<{ readonly icon: IconName }>;

export function BusinessPanelIcon({ icon }: BusinessPanelIconProps) {
  return <Icon name={icon} />;
}
