# 自动化（定时任务）：开发交接文档

日期：2026-09-25 · 状态：**设计包，不是功能交付声明**。

`packages/plugins/automations` 目前只有规划 README 与 `.gitkeep`，没有可加载实现。本包不改变 [顺序台账](../../development-order.json) 的 `currentStep`（仍为 D04），不改变 D12 的 `dependsOn`，也不声称定时任务可用。线上侧栏「定时任务」是工作台登记的待开放占位入口，不是坏掉的功能。

## 1. 交付范围与结论

| 对象 | 本包交付 | 实施范围 |
| --- | --- | --- |
| 触发形态 | 定时 cron、立即运行、Webhook 入站的取舍与首期顺序 | D12 / P2-03，自动化模块 `0.1` |
| 领域对象 | AutomationRule、ScheduleOccurrence、AutomationRun、WebhookDelivery 的归属与语义 | 同上 |
| 执行衔接 | 每次触发创建一次真实官方 Session；不新建执行器 | 同上 |
| 页面 | 列表、详情、运行历史、未来运行时间预览的交互规范 | D12 / P2-03 |
| 恢复与去重 | 同次触发去重、同任务不重叠、错过合并、跨重启恢复的用例 | D12 / P2-04 |
| 代码 | 本次不改动 `packages/plugins/automations` 实现、不升级依赖、不宣布功能可用 | 未修改业务实现 |

核心结论：**定时任务是「按计划把一件事交给执行主体跑一次」，不是第二套执行器。** 每次触发创建一次真实官方 Session，执行事实仍由 Harness 日志拥有；automations 只拥有规则、应发生的时刻、入站交付与运行归属。

## 2. 阅读顺序

1. [需求 PRD](PRD.md)：用户目标、首期范围、稳定需求编号、市场对标结论、成功指标。
2. [交互与视觉规范](UX.md)：入口所有权、页面骨架、运行历史呈现、状态覆盖。
3. [拟新增领域契约](CONTRACTS.md)：数据对象、方法语义、错误码、幂等与并发、官方边界。
4. [验收矩阵与前置产物](ACCEPTANCE.md)：用例、关联既有用例、必须先补的探针。

前提约束：[AGENTS.md](../../../AGENTS.md)、[UI 规范](../../UI-DESIGN.md)、[架构](../../ARCHITECTURE.md)、[领域契约](../../CONTRACTS.md)、[团队设计](../../TEAM-DESIGN.md)、[Harness 官方开发规范](../../HARNESS-OFFICIAL-DEVELOPMENT.md)、[逐插件交付规则](../../PLUGIN-DELIVERY.md)、[模块版本规划](../../MODULE-VERSIONS.md)。

决策依据：[ADR-0007 执行与交接边界](../../adr/0007-execution-and-transfer-boundaries.md)、[ADR-0012 Session 与业务事实边界](../../adr/0012-session-and-business-fact-boundaries.md)、[ADR-0018 可组合功能插件与共享技能](../../adr/0018-composable-feature-plugins-and-shared-skills.md)。

## 3. 官方能力复用记录

按 [逐插件交付规则](../../PLUGIN-DELIVERY.md) 的六字段填写。本记录在开始编码前完成，四个待验证探针已于 2026-09-25 执行并按实测结果回填。

| 字段 | 内容 |
| --- | --- |
| 任务与范围 | D12 / P2-03、P2-04。本版可验收行为：cron 规则到期产生一次触发 → 创建一次真实 Session → 运行记录可回看；Host 重启后按持久规则恢复。 |
| 官方能力 | 文档（锁定版本相符）：[schedule.zh.md](../../dsh-v0.1.7-rc.2/subsystems/schedule.zh.md)、[jobs.zh.md](../../dsh-v0.1.7-rc.2/subsystems/jobs.zh.md)、[webhook.zh.md](../../dsh-v0.1.7-rc.2/subsystems/webhook.zh.md)、[session.zh.md](../../dsh-v0.1.7-rc.2/subsystems/session.zh.md)。精确包版本 `0.1.7-alpha.2`：`@deepseek-ai/dsh-schedule`、`@deepseek-ai/dsh-webhook`、`@deepseek-ai/dsh-webhook-github`、`@deepseek-ai/dsh-jobs`（抽象 seam，本地实现方 `dsh-jobs-local`）、`@deepseek-ai/dsh-client-ui-schedule`。原生所有者：Session Controller / Agent loop（执行）、`JobRegistry`（活跃运行与取消）、`WebhookRuntime`（入站验签与规范化）、Schedule（会话内提醒）。进程内唤醒依赖 Cordis `@deepseek-ai/cordis-plugin-timer@1.1.6`。 |
| 复用选择 | **公开扩展 + 自有业务差异**。入站走 `ctx.webhookRuntime.register`；活跃运行与取消走 `ctx.jobs`；执行走官方 Session 创建链。**不复用 Schedule 作调度器**：官方协议原文声明"不包含日历规则或 Cron 表达式、重复调度时区"，`ScheduleDeliveryMode` 只有 `'session-local'`，且"不存在外部通知渠道或 cold Session scheduler"，因此它无法表达跨重启的工作台级计划。 |
| 自有边界 | 新增 AutomationRule / ScheduleOccurrence / AutomationRun / WebhookDelivery 四个业务对象及其主体、组织、授权与绑定关系；新增 cron 求值、持久 occurrence、幂等去重、同任务不重叠、错过合并、跨重启恢复、运行历史与页面。**仍归官方**：Session 与 Agent 执行事实、工具审批与沙箱、模型路由、Job 活跃表与输出环、Webhook 验签与规范化事件。 |
| 证据与差异 | 已有证据：`package.json` 锁定清单（schedule/webhook/jobs 均为 `0.1.7-alpha.2`）、[0.1.7-alpha.2 升级证据](../../evidence/dsh-0.1.7-alpha.2-upgrade.md)、[领域契约 automations 行](../../CONTRACTS.md)、**[底座探针 P-AU-1～P-AU-4](../../evidence/automations-bases-probe.md)（2026-09-25 已执行，命令 `corepack pnpm probe:automations`）**。四项待验证假设的实测结论：① `preview` Profile 已加载 `@deepseek-ai/cordis-plugin-timer@1.1.6`，`ctx.interval` 类成员需 `inject: ['timer']`，可由 fiber 撤销且无残留句柄；② 本 Profile **不组合** `@deepseek-ai/dsh-webhook`，启用需显式加入并补齐六个 `inject`，`dispatch` 为 fire-and-forget 且**同 `deliveryId` 重复投递会被调用两次**（入站幂等必须自持）；③ 官方无跨进程运行表（`ctx.jobs` 为进程内），平台原语 `@deepseek-ai/node-addon-system/flock` 的 `tryLockExclusive` 可提供单所有者排他，官方 Session 持久化已用同一 flock 语义（争用即拒绝、持有者进程死亡即释放、刻意无过期）；④ 无人值守创建真实 Session 已实测（`headless` Profile 落盘 `session.v4.jsonl.zstd` 且无假成功），审批默认 `ask`、沙箱默认 `workspace-write`，无人应答不能自动放行。镜像与发布版本差异：无。 |
| 验收 | 正例：cron 规则到期创建一次 Session，运行记录可回看。反例：同次触发重复投递只产生一次 Run；上次运行未结束时新触发被跳过并记录原因；Host 重启后错过触发合并为一次；专家修订缺失或授权撤销时停止并诊断，不自动回退到标准组合；Webhook `202` 不写成功回执。命令与未覆盖范围见 [验收矩阵](ACCEPTANCE.md)。 |

## 4. 可直接给开发工具的接手说明

> 请在 WorkDSH 仓库中实施 D12 自动化模块 `0.1`。先读 AGENTS.md、docs/STATUS.md、docs/development-order.json 与 docs/design/automations/README.md，再按该目录 PRD、UX、CONTRACTS、ACCEPTANCE 实施。**开工前先核对 D12 依赖是否满足**；D11 未完成时不跳步，除非用户明确调整顺序并同步计划、台账与 ADR。
>
> 四个待验证探针已执行，结论见[底座探针证据](../../evidence/automations-bases-probe.md)与上方复用记录，不要重复采集。写业务代码前先按结论落实三处硬约束：定时唤醒必须经 `inject: ['timer']` 并由 `ctx.effect()`/fiber 拥有；调度所有者用 flock 排他（无过期，进程死亡即释放），去重与错过合并由持久 occurrence 承担；每次触发的权限 preset 与沙箱模式必须显式固定，不依赖无人应答的 `ask` 放行。不要假设拟新增接口已经存在；`docs/CONTRACTS.md` 的 automations 行是意图级草案，正式 API 必须与选定 Harness Client/Remote 公开接口一致，不自建传输。
>
> 调度器由 automations 自持，但**只能在官方底座之上做业务差异**：入站用 `ctx.webhookRuntime`，活跃运行与取消用 `ctx.jobs`，执行用官方 Session Controller / Agent loop。禁止新建 Agent loop、preset 组装、Skill 解析、模型路由、MCP 传输、Storage backend 或第二套 Conversation renderer；禁止新增等价于已退役自建专家团执行器的运行表。
>
> 每次触发创建一次真实 Session，并重新解析执行组合与主体、重查授权与连接状态。运行记录只记录归属、来源、时间与回执，不缓存会话执行状态，不把 Webhook `202` 或 Job 进程内终态当作 AutomationRun 完成。
>
> 页面用独立 TSX 组件与 `packages/ui` 共享组件；主导航只通过公开 `sidebar.panellist` 增量贡献，并与 `main` 同 key 配对。实现后按助理、项目、资料库的既有范式，把「定时任务」入口与其 `main` 面板从工作台占位移交 automations 自持；工作台的 `businessPanels` 同步移除该项，两包需同批安装。
>
> 任何"已完成"声明必须对应验收编号、真实命令与证据。完成本包定义的范围后停止，不自行扩展下一步。

## 5. 使用文档的规则

- "需求"表示目标；"已存在"必须有源码或证据链接；"建议/待验证"不是官方 API 承诺。
- 本包规定核心行为与默认决策。实现可以调整内部文件组织，但改变范围、运行语义、权限或版本边界必须更新 ADR/PRD 与验收映射。
- 市场同类产品的定义只作对标依据，不作为功能承诺。7 家产品的具体名称、字段与截图不写入产品文案。
- 页面视觉一律以 [UI-DESIGN.md](../../UI-DESIGN.md) 为准，不因对标同类产品另起视觉风格。
