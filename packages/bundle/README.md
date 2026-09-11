# 默认组合包

状态：**P0 实现中，含 P1 展示切片**。当前包含安装/生命周期探针、公共侧栏、全局技能目录和真实新任务入口；完整产品组合尚未实现。

- 实现阶段：P0
- 主任务：P0-02，详见 [开发计划](../../docs/PLAN.md)
- 职责：组合各功能插件，预构建 tgz 可安装。
- 边界：不实现 Agent loop 或私有启动器。

## 开发前阅读

[规则](../../AGENTS.md)、[状态](../../docs/STATUS.md)、[契约](../../docs/CONTRACTS.md)、[团队设计](../../docs/TEAM-DESIGN.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

## 验收与下一步

完成对应 PLAN 任务及 [验收矩阵](../../docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。先验证公开接口，再实现；Host 入口输出激活/清理标记；Client 通过官方 Slots 提供 WorkDSH 导航、业务面板及诊断面板。新任务直接进入原生 Conversation，诊断页调用真实 pluginInventory Remote，不提供假业务响应。

本地候选版本 0.1.0-alpha.38。build/typecheck 使用包内脚本，安装验证由根 scripts/probe-install.mjs 提供。源码经 TypeScript/TSX 编译后打包，不依赖上游 checkout。随包 `skill-creator` 与本地技能管理 Host 服务的源码归技能插件所有，并在构建时组合进可安装包；技能仍由官方文件提供方发现和执行。

浏览器验收：根目录先 build，再运行 corepack pnpm probe:browser。`workdsh-view=home` 为旧地址兼容并归一化到原生 `conversation`；接入诊断必须显式使用 `diagnostics=1&workdsh-view=diagnostics`，普通产品 URL 不注册诊断页面或导航。新任务使用 Harness 原生空会话编辑器。无需模型 API Key。
