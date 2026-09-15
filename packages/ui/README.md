# 共享展示组件

状态：**已实现，0.1.0-alpha.4**。作为 WorkDSH 插件共享的纯展示组件包，由官方 Client renderer 渲染。

当前提供 LogoMark、Icon、IconButton、NavItem、NavGroup、主题令牌、导航样式和公共 Modal。公开 `src/index.ts` 只导出 API；TSX 组件、设计令牌和 CSS 字符串分别位于 `components/` 与 `styles/`。共享包不创建 React root，不持有 Cordis Context、Remote、Host、账号、数据库或执行状态。领域插件只传入标题、正文、动作和关闭回调。

Modal 统一处理 `role=dialog`、遮罩与 Escape 关闭、焦点约束、关闭后的焦点返回和窄屏保留边距显示。技能详情已经复用该组件；专家、连接器和行业应用后续可以直接复用相同外壳，不复制弹框生命周期。

规范与边界见 [UI 规范](../../docs/UI-DESIGN.md)、[公共外壳证据](../../docs/evidence/workbench-sidebar.md)、[ADR 0014](../../docs/adr/0014-workbench-sidebar-presentation.md)。

本版本通过 bundle 组合，子包不独立声明 dsh 加载入口。共享包只负责展示和可访问性交互，不承载技能安装、权限、团队对象或其他领域事实。
