## 0.1.0-alpha.5 — 2026-09-25

- 适配 DeepSeek Harness 0.1.7-alpha.1：事件投影改按 Session 格式 V4 读取——`tool/result` 改读一等 tool 消息的 `message.toolCallId` / `message.isError`（官方 `ContentBlockMap` 已移除 `tool-result` 块）；子代理观测从已移除的 `subagentsByParent` / `refreshSubagents` 改读 `SessionListState.projectionsBySession[root].values.subagentCatalog` 配合 `sessions.refreshProjections`。
- 客户端样式改用 0.1.7 语义 token 词表：清除 `var(--dsw-*)` 硬编码 fallback，词表外旧名字按官方 `--dsw-alias-*` 逐项替换。
- 版本号重定：`0.1.0-alpha.4` 已作为公开发行制品发布（`v0.1.0-alpha.7` 批次），本批代码变化按本项目「撞号必须重新定版」规则递增为 `alpha.5`。
- 退出证据：`projection.test.mjs` 14/14 pass；隔离 Profile `probe:activity` 正例与 `--disabled` 反例均 PASS；`probe:theme` 静态 + 实况 PASS。

## 0.1.0-alpha.4 — 2026-09-18

- 适配 DeepSeek Harness 0.1.6-alpha.2：成员会话观测改用官方 `retain`/`ready`/`release` 世代语义（`workdshActivityMember` source），未 retain 的成员会话不强行绑定；运行期卸载可完整撤销。

## 0.1.0-alpha.3 — 2026-09-16

- 专家成员失败或失活但仍持有进行中任务时，活动条保留专家与任务并显示“本轮未完成”。
- 已打开成员的官方 Session 终态可区分失败与人工停止，停止后的任务显示可继续。
- 增加官方 Team 打包 Web 的失败状态、人工停止和恢复验收。

## 0.1.0-alpha.2 — 2026-09-15

- 适配 DeepSeek Harness 0.1.6-alpha.1 官方 Team 事件与 Web Client。
- 团队协作栏仅展示官方 Team 的成员和活动，不再依赖 WorkDSH 自建团队执行状态。

