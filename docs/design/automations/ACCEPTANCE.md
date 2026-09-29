# 定时任务验收矩阵与前置产物

状态：**全部用例待实现**。本表是设计级细化，不替换 [验收矩阵](../../ACCEPTANCE.md) 与 `acceptance.json`；后两者仍是阶段、任务、状态与证据的统一来源，本文件不改动它们。

## 1. 用例矩阵

| ID | 阶段 | 场景 | 必须观察到的结果 |
| --- | --- | --- | --- |
| AU01 | P2 | 单次 cron 触发 | 规则到期后恰好产生一次运行，运行可定位到真实 Session；页面显示的下次运行时刻与实际触发一致 |
| AU02 | P2 | 同次触发重复投递 | 以 `(ruleId, ruleRevision, scheduledAt)` 为幂等键，重复投递只产生一次运行，第二次返回 `duplicate_occurrence` |
| AU03 | P2 | 成果落库 | 运行产出的成果经资料库登记后返回修订引用并可被后续任务复用；模型回复"已完成"不算证据 |
| AU04 | P2 | 同任务不重叠 | 上一次运行未结束时到达的触发写为 `skipped` 并给出 `rule_busy` 与可读原因，不并行、不排队堆积 |
| AU05 | P2 | 跨重启恢复 | Host 停机期间错过的多个时刻合并为一次待执行，`mergedIntoOccurrenceId` 可查；不与已发生的运行重复 |
| AU06 | P2 | 失效不静默 | 专家修订缺失、连接不可用或授权撤销时停止触发并给出诊断；不回退到其他账号或最新组合（关联 EC06） |
| AU07 | P2 | 时区与生效区间 | IANA 时区正确；生效区间外不产生新 occurrence；夏令时边界行为与所选口径一致并可说明 |
| AU08 | P2 | 立即运行 | `runNow` 产生一次 `source: 'manual'` 的运行，走相同运行模型与不重叠规则；`requestId` 重放幂等 |
| AU09 | P2 | 暂停与归档 | 暂停后不产生新 occurrence，已认领的不受影响；归档后从默认列表消失，历史运行记录仍可查 |
| AU10 | P2 | 未来运行预览 | 对给定规则返回未来若干次真实触发时刻；非法表达式返回校验错误而不是空列表 |
| AU11 | P2 | 单 Host 调度所有者 | 两个调度所有者同时存在时第二个被拒绝；租约过期后的重领先核对运行是否已创建（关联 B05） |
| AU12 | P2 | 写入结果不确定 | 创建 Session 结果未知时标记 `uncertain`，`reconcileRun` 对账后才继续；不盲目重试创建 |
| AU13 | P2 | 执行组合重解析 | 每次触发重新解析专家/preset/资料/连接账号；父级 lineage 不带来权限继承（关联 B01） |
| AU14 | P2 | 主体与组织隔离 | 客户端或模型伪造 `ruleId`、`principalId`、`organizationId` 被 Host 拒绝；不回退账号 |
| AU15 | P2 | 个人可见性 | 规则只对创建者可见；项目侧栏卡片数量与列表一致，不泄露其他成员规则（关联 UI09、J10-P2） |
| AU16 | P2 | Webhook 入站（后置） | `source + deliveryId + ruleId` 幂等；`202` 只表示接收，不写成功回执；重复交付不创建重复 Session |
| AU17 | P2 | 生命周期 | 卸载/HMR 后调度器、定时器、监听、Remote 订阅全部停稳，无残留句柄；卸载保留用户数据 |
| AU18 | P2 | 工具与页面一致 | Agent 工具与页面调用同一领域服务，对同一动作返回一致授权结论；工具不接受伪造主体 |

## 2. 复用的既有用例

本表不重复已登记的用例，实施时按其原文执行并在证据中引用：

- [A18 自动化恢复](../../ACCEPTANCE.md)：同次触发去重、时区正确、错过规则符合文档。
- [UI09 项目定时任务卡片](../../ACCEPTANCE.md)：只显示本人可见规则，数量与列表一致。
- [EC06 自动化组合/授权失效](../../ACCEPTANCE.md)：停止并报告原因，不回退其他账号或最新组合。
- [B01](../../ACCEPTANCE.md)：暂停任务后改变连接账号或目标，恢复拒绝静默写入。
- [B05](../../ACCEPTANCE.md)：浏览器关闭/多标签不改变 Host 调度次数，Host 重启恢复一次，第二个调度所有者被拒绝。
- [A12 断连与重启](../../ACCEPTANCE.md)、[A13 提交结果不确定](../../ACCEPTANCE.md)：恢复与对账口径沿用。
- [J10-P2](../../ACCEPTANCE.md)：项目自动化及通知只对创建者可见。

## 3. 编码前必须先补的探针

以下四项是复用记录中的待验证假设。未取得实际证据前不写业务代码，不按印象实现。**四项已于 2026-09-25 执行完毕**，命令 `corepack pnpm probe:automations`，结果见[底座探针证据](../../evidence/automations-bases-probe.md)。

| 探针 | 目的 | 通过判据 | 结果 |
| --- | --- | --- | --- |
| P-AU-1 | `@deepseek-ai/cordis-plugin-timer@1.1.6` 在 WorkDSH Profile 中是否加载，`ctx.setInterval` 类能力是否可用并由 `ctx.effect()` 托管撤销 | 进程内定时唤醒可注册、可撤销、卸载后无残留句柄 | 通过：`preview` 已加载；成员需 `inject: ['timer']`；显式与 fiber 撤销均生效且无残留句柄 |
| P-AU-2 | `ctx.webhookRuntime` 在本 Profile 的可用性与路由挂载方式（是否需独立 WebServer，参考官方 GitHub 适配器把路由挂在隔离的第二个 WebServer 上） | 能注册受信任规则、完成验签并规范化事件；不暴露浏览器 API | 部分通过：`register`/`dispatch` 可用且 fire-and-forget，但**运行时不去重**；本 Profile 未组合 webhook，需显式加入并挂独立 WebServer 才能暴露入口 |
| P-AU-3 | 单 Host 调度所有者唯一性：租约/认领机制在现有 Host 模型下的可行实现 | 第二个所有者被拒绝，租约过期可重领且不重复创建运行 | 通过（原语层）：官方无跨进程运行表；`node-addon-system/flock` 排他可用、争用拒绝、持有者进程死亡即释放；官方 Session 持久化使用同一语义且刻意无过期 ⇒ 「过期重领」不成立，失配防护必须由持久 occurrence 承担 |
| P-AU-4 | 从业务服务创建官方 Session 的受控入口在自动化场景（无浏览器、无用户在场）下的可用性与审批语义 | 能创建 Session 并附加初始消息；审批/沙箱语义明确且不绕过 | 通过（创建与审批）：无人值守入口创建并落盘真实 Session 且无假成功；审批 `ask`、沙箱 `workspace-write` 未被绕过。初始消息落盘未观察到（缺少真实模型凭据） |

## 4. 前置产物清单

按顺序完成，缺一项不进入下一项：

1. ~~四个探针的证据文档（放 `docs/evidence/`），并把结论回填到 [复用记录](README.md#3-官方能力复用记录)。~~ 已完成：[evidence/automations-bases-probe.md](../../evidence/automations-bases-probe.md)，结论已回填复用记录与第 3 节。
2. [modules.json](../../modules.json) 为 `packages/plugins/automations` 写入 `moduleVersion`（`0.1`），并将 status 由 `planned` 改为 `in_progress`。
3. `packages/contracts` 导出 `automations` 子路径契约；当前**未导出**。
4. 领域服务与持久化（Rule / Occurrence / Run / Delivery + 迁移）。
5. 调度循环（cron 求值、认领、错过合并、幂等、恢复）。
6. 执行衔接（创建 Session、主体与连接重解析、失败可见）。
7. 页面与 Agent 工具。
8. 入口移交：automations 自持 `main` 与同名 `sidebar.panellist` 行，工作台 `businessPanels` 移除「定时任务」；两包同批安装并验收。

## 5. 未执行声明

本包为设计文档。截至 2026-09-25：

- 未编写任何 automations 业务代码；`packages/plugins/automations` 除 README 与目录占位外无实现。
- 四项底座探针已执行并留证（见[证据](../../evidence/automations-bases-probe.md)）；探针只覆盖官方底座能力，未验证 automations 自身的调度、去重、恢复与页面行为。
- 未改动 `docs/development-order.json`、`docs/PLAN.md` 与 D12 依赖；D12 状态仍为 `todo`。
- 未修改 [docs/ACCEPTANCE.md](../../ACCEPTANCE.md) 与 `acceptance.json`。
- 未变更模块版本，未发布任何制品，未修改线上。
