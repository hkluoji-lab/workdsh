# 定时任务拟新增领域契约

状态：**草案，未实现，未发布**。对应 D12 / P2-03、P2-04。

本文定义 automations 领域想要的接口语义，不定义 wire 格式。正式 API 必须与选定 Harness Client/Remote 公开接口一致（Host 定义生成 Client 代码、稳定领域错误码、验证取消），不自建传输。仓库内既有 [CONTRACTS.md](../../CONTRACTS.md) 的 automations 行是本文件的来源，本文件对它做展开，不新增第二个真源。

## 1. 领域对象

四个对象都归 automations 领域所有（[CONTRACTS.md 任务与 Session 适配](../../CONTRACTS.md)）。全部具有组织与主体归属，不先建无 owner 数据再补字段（[TEAM-DESIGN](../../TEAM-DESIGN.md)）。

### 1.1 AutomationRule

| 字段 | 说明 |
| --- | --- |
| `ruleId` | 领域内稳定标识 |
| `organizationId` / `ownerPrincipalId` | 服务端建立的主体与组织，拒绝客户端或模型伪造 actor |
| `name` / `description` | 用户可读名称与说明 |
| `schedule` | `{ kind: 'once' \| 'cron', cron?, at?, timeZone, activeFrom?, activeUntil? }` |
| `target` | 执行主体与范围：专家修订引用（可空）、项目引用（可空）、连接器实例引用、工作区路径、任务描述、agent preset 与 permission preset 引用 |
| `state` | `enabled` / `paused` / `archived` |
| `revision` | 不可变修订号；已发布修订不原地改写 |
| `nextRunAt` | 派生值，来自 occurrence，不作为真源 |

`timeZone` 必填且为 IANA `Area/Location`。`cron` 为 5 字段 POSIX 表达式；最小触发间隔 300 秒（AU-R-04）。生效区间之外不产生新 occurrence。

### 1.2 ScheduleOccurrence

| 字段 | 说明 |
| --- | --- |
| `occurrenceId` | 持久标识（[D00 边界补全](../../CONTRACTS.md) 已定：使用持久 occurrenceId 和单一 Host 所有者） |
| `ruleId` / `ruleRevision` | 产生该时刻的规则与其修订 |
| `scheduledAt` | 规范化后的 UTC 时刻 |
| `state` | `pending` / `claimed` / `dispatched` / `skipped` / `merged` |
| `claimedBy` / `claimedAt` | 认领该 occurrence 的 Host 标识与时间，用于租约与重领 |
| `skipReason` | 跳过原因（同任务不重叠、规则已暂停等） |
| `mergedIntoOccurrenceId` | 错过合并时指向被合并到的 occurrence |

唯一性：`(ruleId, ruleRevision, scheduledAt)` 唯一。这是同次触发去重的底层保证。

### 1.3 AutomationRun

| 字段 | 说明 |
| --- | --- |
| `runId` | 领域内稳定标识 |
| `ruleId` / `occurrenceId` | 归属；手动运行只有 `ruleId` 与 `requestId` |
| `source` | `schedule` / `manual` / `webhook` |
| `sessionId` | 真实官方 Session 标识，创建成功后才写入 |
| `status` | `queued` / `running` / `succeeded` / `failed` / `canceled` / `skipped` / `uncertain` |
| `startedAt` / `finishedAt` | 运行区间 |
| `failureReason` | 稳定错误码与可读说明 |
| `resolvedBindingDigest` | 本次触发重新解析出的执行组合指纹，与规则修订记录比对 |
| `requestId` | 与外部对账使用 |

`status` 不缓存会话执行状态：`running` 之后的状态由官方 Session 的持久事件推导，automations 只保存归属与回执。`uncertain` 表示创建 Session 的结果未知，必须先对账而不是重试。

### 1.4 WebhookDelivery

| 字段 | 说明 |
| --- | --- |
| `sourceId` / `deliveryId` | 提供方来源与提供方交付 id |
| `ruleId` | 命中的规则 |
| `receivedAt` | 接收时间 |
| `payloadDigest` | 规范化事件的摘要，用于审计与幂等核对 |
| `state` | `accepted` / `duplicate` / `rejected` / `dispatched` |

幂等键固定为 `source + deliveryId + ruleId`。`state` 只表示接收与分发事实，不表示自动化成功。

## 2. 接口语义

下表中的前 8 项来自 [CONTRACTS.md](../../CONTRACTS.md) 既有清单，后 4 项为本文件补充。

| 接口 | 语义 | 权限与校验 |
| --- | --- | --- |
| `createRule` | 校验计划表达式与执行主体后创建草稿或启用态规则 | 服务端主体；专家/项目/连接器引用必须可解析且当前主体有权使用 |
| `updateRule` | 携带 `expectedRevision` 提交新修订；冲突拒绝静默覆盖 | 同上；规则所有者 |
| `enable` | 从 `paused` / `archived` 恢复为 `enabled`，重建后续 occurrence | 所有者；执行主体重新校验 |
| `disable` | 转为 `paused`，不再产生新 occurrence；已认领的不受影响 | 所有者 |
| `archiveRule` | 转为 `archived`，从默认列表消失；历史运行记录保留 | 所有者；危险操作需解释影响 |
| `runNow` | 以 `source: 'manual'` 立即产生一次运行，走与定时触发相同的模型；以客户端 `requestId` 幂等 | 所有者；同任务重叠规则同样生效 |
| `acceptDelivery` | 先提交 `source + deliveryId + ruleId` 幂等事实，再请求创建 Session | 提供方验签后由受信任规则调用；不接受模型直接伪造 delivery |
| `listRuns` | 按规则或主体分页查询运行记录 | 只返回当前主体有权查看的记录 |
| `listOccurrences` | 查询某规则的 occurrence 与状态，用于排障与预览 | 所有者 |
| `previewNextRuns` | 按给定计划表达式与时区返回未来若干次触发时刻，不落库 | 仅读取；规则非法时返回校验错误 |
| `reconcileRun` | 对 `uncertain` 运行与远端事实对账：确认 Session 是否创建、是否已有运行 | 所有者；对账前不重试创建 |
| `claimOccurrence` | 调度器认领到期 occurrence；第二所有者被拒绝 | 仅限持有调度租约的 Host，不接受客户端调用 |

## 3. 错误码

稳定领域错误码，不向客户端暴露内部异常。

| 错误码 | 含义 |
| --- | --- |
| `rule_not_found` | 规则不存在或不可见 |
| `stale_revision` | `expectedRevision` 不匹配 |
| `invalid_cron` | cron 表达式非法 |
| `invalid_time_zone` | 时区非法或缺失 |
| `interval_too_short` | 触发间隔低于 300 秒 |
| `target_unavailable` | 执行主体或连接不可用 |
| `authorization_revoked` | 触发时重查发现授权已撤销 |
| `revision_missing` | 引用的专家/技能/Preset 修订已不存在 |
| `rule_busy` | 同任务上一次运行未结束，本次被跳过 |
| `duplicate_occurrence` | 同次触发已存在 occurrence 或运行 |
| `occurrence_claimed` | occurrence 已被其他 Host 认领 |
| `persistence_uncertain` | 持久化结果未知，需先对账 |
| `delivery_signature_invalid` | 入站验签失败 |

## 4. 幂等与并发

- **幂等键**：定时触发用 `(ruleId, ruleRevision, scheduledAt)`；手动运行用客户端 `requestId`；入站交付用 `source + deliveryId + ruleId`。
- **不重叠**：同规则默认单实例。上一次运行未结束时到达的触发写为 `skipped` 并记录 `skipReason`，不排队堆积。
- **错过合并**：Host 停机期间错过的多个时刻合并为一次待执行，`mergedIntoOccurrenceId` 记录被合并对象；不与已发生的运行重复。
- **单一所有者**：调度由持租约的单一 Host 执行（B05）；租约过期的 occurrence 可被重领，重领必须先核对运行是否已创建。
- **不确定写入**：`reconcileRun` 完成前不重复创建 Session；重试不能自动重复不确定的远端提交。

## 5. 与官方底座的边界

| 能力 | 归属 | 说明 |
| --- | --- | --- |
| Session 创建与 Agent 执行 | 官方 | 经官方 Session Controller / Agent 生命周期，禁止以裸 `ctx.sessions.create()` 作为产品入口 |
| 会话内提醒 | 官方 Schedule | 不复用为工作台级调度器：无 cron、无重复调度时区、仅 `session-local` |
| 活跃运行与取消 | 官方 `ctx.jobs` | 只作进程内活跃表与取消入口；进程内终态不算崩溃恢复证据 |
| 外部事件接入 | 官方 `ctx.webhookRuntime` | 验签与规范化由 provider 负责；runtime 无队列、重试、去重、状态，`202` 不算成功回执 |
| 触发条件的业务语义、持久调度、幂等去重、跨重启恢复、运行历史 | automations | 本文件全部内容 |
| 授权判定 | access | 触发时重查；规则修订与本包只引用授权结论，不自建权限模型 |
| 项目范围与绑定 | projects | `ProjectTaskLink` 只表示归属，不构成会话共享授权 |

## 6. Agent 工具与对话入口

- 工具与页面调用同一领域服务，工具是消费者而不是第二套实现。
- 允许的工具动作限定为：列出规则、创建规则草稿、启用/暂停、立即运行、查询运行记录。工具不直接写数据库，不接受客户端伪造主体。
- 创建/启停需要用户在界面确认；模型不能在无人确认的情况下新建对外写入类规则。
- 不新增 `workdsh_expert_team_*` 类等价运行工具，也不恢复任何已退役的自建执行器。
