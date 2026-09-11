# 工作台

状态：**约束实现，0.1.0-alpha.8**。主任务 P1-01；不是工作台整体完成。

工作区、会话、新会话、搜索、筛选、创建工作区、工作区菜单、会话菜单和设置全部保留 Harness 官方 Sidebar occupant。WorkDSH 不替换整块 sidebar，也不复制这些行为；通过公开 Slot 增量加入助理、项目、“专家 · 技能 · 连接器”、定时任务、资料库和更多。能力中心保持 WorkBuddy 参考的单入口，内部再分专家、技能、连接器。新任务继续使用原生 Conversation，因此 `/`、`@`、附件、权限、模型和 preset 均由 Harness 处理。

规范与边界见 [UI 规范](../../../docs/UI-DESIGN.md)、[公共外壳证据](../../../docs/evidence/workbench-sidebar.md)、[ADR 0014](../../../docs/adr/0014-workbench-sidebar-presentation.md)。

本版本通过 bundle 组合，子包不独立声明 dsh 加载入口。领域入口目前只展示清晰的未接入状态，不伪造团队权限、业务对象或管理能力。共用弹框和其余页面组件待迁移。
