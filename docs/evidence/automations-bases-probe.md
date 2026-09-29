# 定时任务底座探针 P-AU-1～P-AU-4

日期：2026-09-25 · 状态：**探针已执行，四项假设全部取得实际证据；automations 尚未开工**。

本文件是 [定时任务设计包](../design/automations/README.md) 第 3 节登记的四个待验证假设的证据记录。命令：`corepack pnpm probe:automations`（等价于 `node scripts/probe-automation-bases.mjs`）。脚本从已安装的 WorkDSH `preview` Profile 解析官方包，使所有插件共用同一 cordis 模块实例，与产品组合一致；不导入 `packages/plugins/automations`，不写入仓库。

锁定版本：`@deepseek-ai/dsh@0.1.7-alpha.2`，Cordis `4.0.4`，`@deepseek-ai/cordis-plugin-timer@1.1.6`。原始输出：`.artifacts/automations-bases-probe.json`（该目录不入库）。

## P-AU-1 进程内定时唤醒

| 判据 | 实际观察 |
| --- | --- |
| Profile 是否加载 | 安装的 `preview` Profile `--dump-config` 中恰好一条 `name: '@deepseek-ai/cordis-plugin-timer'` 条目（`id: timer`），解析版本 `1.1.6` |
| `ctx.*` 能力 | 在声明 `inject: ['timer']` 的插件内：`ctx.timer` 存在，`setInterval`/`setTimeout`/`interval`/`timeout` 均为函数 |
| 显式撤销 | `ctx.interval(cb, 30ms)` 到期前触发 ≥2 次；调用返回的 disposer 后计数冻结 |
| 生命周期撤销 | 嵌套插件 fiber 内的 interval 在 `fiber.dispose()` 后停止计时，且活动 `Timeout` 句柄数下降 |

结论：定时唤醒依赖已满足，且必须由 `ctx.effect()`/fiber 拥有；`setInterval` 类成员需要 `inject: ['timer']`，不能在未注入的上下文里直接取用。**不新增 `setTimeout`/`setInterval` 裸调用**。

## P-AU-2 Webhook 入站运行时

| 判据 | 实际观察 |
| --- | --- |
| Profile 是否加载 | 安装的 `preview` Profile **没有** `@deepseek-ai/dsh-webhook` 条目；包在 Profile 内可解析，版本 `0.1.7-alpha.2` |
| 服务可用性 | 补齐其 `inject`（`agents`/`agentDefaultModel`/`agentPresets`/`permissionPresets`/`sessionTitle`/`workspaceRegistry`）后 `ctx.webhookRuntime` 提供 `register`/`dispatch` |
| 分发语义 | `dispatch(delivery)` 返回 `undefined`，回调 20ms 后仍未结算（fire-and-forget）；同一 `deliveryId` 连续投递两次，规则被调用两次 ⇒ **运行时不去重** |
| 校验与撤销 | `receivedAt: -1` 的投递同步抛错；`register` 返回的 disposer 生效后该规则不再收到投递 |
| 路由挂载 | 官方 GitHub 适配器把精确路由注册到**被注入的独立 WebServer** 上，使 webhook 入口不暴露浏览器 API（`webhook.zh.md`、`web-server.zh.md` 的 `ctx.webServer.register`） |

结论：Webhook 在首期范围外（PRD 已后置），但组合方式已明确——需显式加入 webhook 包并为其准备完整 `inject`，且必须挂到独立 WebServer。运行时不提供队列、重试、去重与完成状态，**WebhookDelivery 幂等必须由 WorkDSH 自持**。

## P-AU-3 单 Host 调度所有者

| 判据 | 实际观察 |
| --- | --- |
| 官方运行表范围 | `ctx.jobs`（`dsh-jobs-local`）暴露 `start/list/get/read/readAt/kill/wait/remove/attachController`；新进程内注册表为空，同进程一份注册表，**没有跨进程运行表** |
| 平台原语 | `@deepseek-ai/node-addon-system@0.1.2` 公开子路径 `./flock` 的 `tryLockExclusive(fd)`：首个 fd 取得排他锁；第二个 fd 拒绝 `EAGAIN`；释放后后续 fd 可取得 |
| 崩溃恢复 | 子进程持锁后被 `SIGKILL`，父进程随即成功取得同一路径的锁 ⇒ 内核在持有者进程死亡时释放 |
| 官方先例 | `@deepseek-ai/dsh-session-persistence-jsonl` 对每个 Session 用同一 flock 锁 `session.lock`（Windows 用命名内核信号量），争用映射为 `SessionAlreadyOwnedError`，**刻意不设过期**：卡死但存活的持有者保持锁，避免续写撕裂日志 |

运行时验证还观察到真实创建的 Session 目录内含 `session.lock`（P-AU-4 产物）。

结论：调度所有者租约可按官方同一模型实现——单 Host 持有 flock 排他锁，第二所有者被拒绝，持有者进程死亡即自动释放，无需过期时间；**这同时意味着「租约过期重领」不是内核语义，重领只发生在原持有者进程真的退出之后**，错过合并与重复创建防护仍由 WorkDSH 的持久 occurrence 承担。

## P-AU-4 无浏览器、无人在场的 Session 创建

| 判据 | 实际观察 |
| --- | --- |
| 受控入口可用 | 隔离 home 内 `dsh --profile headless --json "<task>"` 输出首行 `{"type":"session","sessionId":"session-…"}`，随后 `status/turn_start`；无浏览器、无用户参与 |
| 真实落盘 | `$DSH_HOME/sessions/<cwd-key>/<sessionId>/session.v4.jsonl.zstd` 存在，首行为 `type: session`、`cwd` 等于启动目录；同目录含 `session.lock` |
| 结果诚实 | 未配置模型凭据时回合以 `MISSING_CREDENTIAL` 结束、进程退出码 1，**未出现假成功** |
| 审批语义 | `headless` Profile 组合 `dsh-user-approval`（策略 `ask`，仅当 `DSH_PERMISSION_MODE=danger-full-access` 时为 `never`）与 `dsh-permission-presets`（`read-only`/`workspace-write` → `ask`；`danger-full-access` → `never`），沙箱模式默认 `workspace-write` |

结论：业务服务可以走官方无人值守入口创建真实 Session 并落盘，无需浏览器；但**审批不会因无人值守自动放行**，`ask` 在无人应答时无法满足。因此每次触发必须显式固定目标权限 preset 与沙箱模式，且不能把「无人应答的 `ask`」当作可继续执行。

## 未验证与残留风险

- 未用真实模型凭据复跑 P-AU-4：初始 user 消息是否在首个模型请求前落盘未观察到（本次在模型凭据错误处中止）。真实模型验证需显式选择。
- 未在真实双 Host 进程上端到端验证调度所有者冲突；P-AU-3 验证的是官方 flock 原语与官方先例语义，不是 automations 的实现。
- 未验证 webhook 路由在独立 WebServer 上的实际挂载与验签（首期范围外）。
- 未执行任何 automations 业务代码、迁移、页面或工具验证。
