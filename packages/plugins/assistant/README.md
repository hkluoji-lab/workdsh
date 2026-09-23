# 助理

状态：**首期切片已实现**（`workdsh-plugin-assistant@0.1.0-alpha.1`）；开发顺序步骤 D16 仍为 `todo`，依赖 D08 未完成，与 D05/D06/D07「模块已实现、步骤未验收」同一口径。

- 实现阶段：P1
- 主任务：P1-12，详见 [开发计划](../../../docs/PLAN.md)
- 设计决定：[ADR-0027 助理作为引用型工作入口包](../../../docs/adr/0027-assistant-entry-pack-boundary.md)
- 模块设计与官方能力复用记录：[助理模块设计](../../../docs/design/assistant/README.md)
- 职责：创建与管理面向具体固定工作的 AI 助理入口；引用技能修订、专家修订与连接器实例（含本地工作目录）。
- 边界：助理是只读的引用约定，不拥有执行、会话、凭据、数据与权限；不新建 Agent loop；本地文件继续走原生工作区与 office 内容服务；唤起本机应用或小程序须走官方 computer-use 或显式授权命令并经过审批；出站写入遵守 ADR-0007，入站的机器人常驻服务属部署形态，不在本模块范围。

## 首期实现范围

- 单一 Host 领域服务 `ctx.workdshAssistant`（[`src/services/assistant-manager.ts`](src/services/assistant-manager.ts)）：列表（使用中／已归档）、详情、创建、只追加修订、归档与恢复；状态键为「组织_主体」，由服务端从解析出的 actor 推导。
- 引用解析在 Host 侧完成：技能走 `ctx.workdshSkills`、专家走 `ctx.workdshExperts`、连接器实例走 `ctx.workdshConnectors`，全部按公开服务读取，缺席时降级为「X服务当前不可用」而不是伪造可用。
- 页面与 Agent 工具共用同一领域服务：`/api/workdsh-assistant`（[`src/remote/connection-api.ts`](src/remote/connection-api.ts)）与 `workdsh_assistant_list` / `_get` / `_create` / `_update`（[`src/tools/assistant-tools.ts`](src/tools/assistant-tools.ts)）。actor 一律由 Host 解析，请求体与模型都不能自带所有者。
- 页面自持入口：[`src/client.tsx`](src/client.tsx) 同时注册 `main`（`key: workdsh-assistant`）与同名的 `sidebar.panellist` 行（`order: 10`）；工作台不再代注册该占位。
- 触发方式首期只作为修订字段记录：不注册调度器、不建立外部消息入口，调度归「定时任务」模块。

## 开发前阅读

[规则](../../../AGENTS.md)、[状态](../../../docs/STATUS.md)、[契约](../../../docs/CONTRACTS.md)、[团队设计](../../../docs/TEAM-DESIGN.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

## 验收与下一步

首期验证：`corepack pnpm test:assistant`（领域单测）、`corepack pnpm check:plan`、`corepack pnpm typecheck`、`corepack pnpm build`、`corepack pnpm test:integration`。

未验证、不得宣称完成的项：真实模型执行助理、定时触发与外部消息入站、多主体多组织端到端鉴权与撤权。完成 PLAN P1-12 与 [验收矩阵](../../../docs/ACCEPTANCE.md) 对应场景并记录真实证据后才更新 D16 步骤状态。
