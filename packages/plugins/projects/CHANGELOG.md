# Changelog

## 0.1.0-alpha.4 — 2026-09-24

- 适配 DeepSeek Harness `0.1.7-alpha.1`（2026-09-25，并入本未发布增量，不单独 bump）：清除 `var(--dsw-*)` 硬编码 fallback，词表外旧名字替换为官方语义变量；`ProjectLineageChip.tsx` 另删除官方自身也写错的 `--dsw-alias-fill-tsp-secondary` 引用（该名字官方 theme 包从未声明），改为 `background: transparent`。
- 会话绑定复核：`deliverable-attribution.ts` 只读 `event.data.files` 与 `session.header.cwd`，Session 格式 V4 下无破坏点。
- 项目模板由 5 个扩充到 15 个：新增内容营销与社媒运营、客户跟进与商机管理、数据分析与经营报表、活动策划与执行、招投标与解决方案、招聘与人才选拔、培训与课程开发、财务预算与成本核算、品牌与视觉设计、网站建设与 SEO 增长。
- 模板仍是纯预填数据：选中模板只预填项目名称、场景描述与初始指令，创建后可编辑，不自动执行、不预先绑定专家或技能，也不改变项目权限语义。

## 0.1.0-alpha.3 — 2026-09-22

- 侧栏「项目」行 `order` 由 20 调整为 5：按 2026-09-22 用户要求排在「新建任务（0）」之后、「助理（10）」之前。
- 与 `workdsh-bundle@0.1.0-alpha.51` 同批安装。

## 0.1.0-alpha.2 — Unreleased（2026-09-18）

- Align with DeepSeek Harness 0.1.6-alpha.2 Client Session generations: retain the target Session (`sessions.retain` → `ready` → send → `release`) before sending a project task message, and open/switch Sessions through the official `uiWorkspace.openSession` navigation.
- Open project tasks through official Session navigation: the Session becomes current and the built-in conversation view owns messages, streaming, composer, model and permissions; remove the WorkDSH-side conversation feed, composer and run-state rendering.
- Add confirmed project archiving, archived-project filtering, and restoration while preserving project history.
- Show a project lineage chip beside the Session title for project task Sessions through the official `conversation.session.header.actions` slot; clicking it opens the project panel focused on that project, non-project Sessions render nothing.
- Cache the lineage verdict per Session in the client: header remounts reuse the first `task-context` answer instead of re-issuing the RPC on every render, misses included; lookup failures are not cached, so a transient error cannot hide the chip permanently.
- Attribute files the model delivers with the official `present` tool inside project task Sessions: import them into the Library (source=task, source session recorded) and link them idempotently as project asset references.
- Make deliverable attribution idempotent by a content digest (session + original name + bytes + attempt index) instead of tool call identity, so a repeated delivery of the same file resolves to the same Library entry; Library-side skips (unsupported format, name-conflict retries exhausted) are recorded as project activity gaps instead of log-only warnings.
- Link the project task right before the first message send: a failed Session open or an unsendable Session leaves no orphan task record, and a send failure states the created task explicitly. Selection sync now validates the service envelope before sending.
- Make project context injection fail open: a project lookup failure during `system-prompt/assemble` is logged and skipped instead of rejecting the shared assembly waterfall for unrelated Sessions.
- Remove the abort listener of the send-readiness wait on the normal path (previously one listener leaked per poll until the plugin scope aborted).
- Open the composer reference menu from a trailing `@` through keydown interception instead of comparing the previous draft's trailing character: rapid or repeated `@` keystrokes no longer leave literal characters in the draft, and a non-keyboard insertion that appends exactly one `@` still opens the menu.

## 0.1.0-alpha.1

- Add project center, project templates and persistent project workspaces.
- Add activity, planning, native task links and Library asset references.
- Add revisioned instructions and optional Skill, Expert and Connector configuration.
- Submit Project composer messages into native Sessions and reopen linked tasks from the task list.
