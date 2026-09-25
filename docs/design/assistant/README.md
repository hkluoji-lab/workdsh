# 助理模块设计（D16 / P1-12，模块 `0.1`）

状态：首期切片已实现（本机）。设计依据 [ADR-0027](../../adr/0027-assistant-entry-pack-boundary.md)（已批准实施）。

## 范围

首期只做**引用型工作入口包**的对象面，即 [PLAN](../../PLAN.md) 第 13 节 P1-12 的首期范围：

- 具名助理对象的创建与修订（修订只追加、不原地改写）；
- 引用解析：引用的技能、专家、连接器实例在 Host 侧投影为可用性结果，客户端只显示；
- 列表与详情／编辑分离；
- 归档与恢复；
- 按主体与组织隔离（每个 `组织 + 主体` 一份独立状态）。

## 明确不做（与 ADR-0027 一致）

不建 Agent loop、不复制 Composer 与原生新任务、不拥有会话与凭据、不默认唤起本机应用、不自建机器人入站后端、不复制技能或专家实现。

首期的「触发方式」只是**记录在修订里的字段**（手动／定时／外部消息），不注册调度器、不建立入站端点；真正的定时执行属 D12 自动化，入站属部署形态。

## 官方能力复用记录

| 字段 | 内容 |
| --- | --- |
| 任务与范围 | D16 / P1-12。可验收行为：创建、修订、归档、恢复具名助理；引用技能／专家／连接器实例并显示其可用性；两个主体与两个组织互相隔离。 |
| 官方能力 | [客户端模块](../../dsh-v0.1.7-alpha.2/subsystems/client-modules.zh.md)（`dsh.client` + `exports["./client"]` combo）；[Storage Domain](../../dsh-v0.1.7-alpha.2/subsystems/storage.zh.md)（`@deepseek-ai/dsh-storage-domain@0.1.6-alpha.2` 的 `defineDomain`/`domainTable`，拥有持久化与 schema 版本）；官方 Slot `main` 与 `sidebar.panellist`（`@deepseek-ai/dsh-client-ui-slots@0.1.6-alpha.2`，Sidebar/Workspace/Session owner 保持官方）；官方 Connection exact fetch（`@deepseek-ai/dsh-client-connection@0.1.6-alpha.2`，拥有 HTTP 路由与鉴权）；`@deepseek-ai/dsh-tools@0.1.6-alpha.2`（拥有工具注册、schema 与结果持久化）；`@deepseek-ai/cordis@4.0.2`（`ctx.effect`/`ctx.get` 拥有生命周期与可选依赖读取）。 |
| 复用选择 | 直接复用：持久化、HTTP 路由、工具注册、Slot 渲染、生命周期。公开扩展：兄弟业务对象（技能／专家／连接器）通过 `ctx.get(name, strict)` 读取其公开服务，不导入其内部实现、不读其数据表。自有业务差异：助理对象、修订、引用与归档语义。 |
| 自有边界 | 新增：`workdsh_assistant` 域与 `WorkdshAssistant` 服务、`/api/workdsh-assistant` 端点、`workdsh_assistant_*` 工具、`workdsh-assistant` 的 `main` + `sidebar.panellist` 行。仍归官方：Session 与任务正文、Agent loop、preset 组装、Skill 解析与运行、模型路由、MCP 传输、凭据写入与审批。 |
| 证据与差异 | 已运行：`node --test packages/plugins/assistant/tests/*.test.mjs`（领域、修订冲突、归档、隔离、引用降级）、`check:plan`、`typecheck`、`build`。待验证假设：多主体多组织端到端鉴权（属 D14 企业阶段）、真实入站机器人（另行 ADR）。镜像与发布版本差异：本模块依赖锁定 `0.1.6-alpha.2`，与基线一致。 |
| 验收 | 正例：创建 → 修订 → 归档 → 恢复，引用可用时显示已解析、不可用时显示原因。反例：旧修订覆盖被拒（`assistant/revision-conflict`）；未归属主体的对象不可见（`assistant/not-found`）；兄弟服务缺席时创建仍成功但引用标记为不可用，不静默伪装。未覆盖：真实模型执行、定时触发、外部消息入站。 |

## 所有权与安全

- 对象、修订与归档状态都带 `organizationId` 与 `ownerPrincipalId`，状态键由服务端从 actor 推导，客户端与模型都不能传 actor。
- 引用只保存 `{kind, id, revision, label}`；凭据、会话与执行状态一律不进入助理数据。
- 兄弟服务的读取经 `ctx.get(name, true)`，只在提供方 fiber 处于活动状态时返回；缺席时降级为「引用不可用」而不是伪造成功。
