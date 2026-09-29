# DSH 0.1.7-alpha.1 升级计划

更新：2026-09-25。状态：**P0–P9-R 全部完成**（含线上 `dsh.10ge.cn` 切换、只读复验，以及 3 个重定版模块的重打包与线上重新部署）。基线 `0.1.6-alpha.2` → 目标 `0.1.7-alpha.1`。证据见 [证据文档](evidence/dsh-0.1.7-alpha.1-upgrade.md)。

独立升级专项：不代表 D04（专家）或 D07（项目）等业务模块整体完成，也不替代任何已发布制品的验收结论。用户 2026-09-24 决定本批一并升级线上 `dsh.10ge.cn`（含 Session V3→V4 迁移）。

## 1. 目标与范围

- 全局精确锁定 `0.1.6-alpha.2` → `0.1.7-alpha.1`：根 `devDependencies`（21 条）与 `pnpm.overrides`（257 → 284 条）、17 个模块 `package.json`、脚本与测试引用、锁文件。
- 适配 0.1.7 的破坏性变化（§2.1）。
- 不改变业务功能范围；不动 contracts 领域模型；不新增业务模块；不改写已发布的既有验收结论。
- 官方文档镜像整批换为 0.1.7-alpha.1 快照（严格 `/docs/` 前缀 **562 文件 / 347 md**），旧镜像 `docs/dsh-v0.1.6-alpha.2/`（543 文件 / 337 md）保留为历史语料，不做删除或改写。

## 2. 官方变化核验

依据三类证据分开登记：

- **发布包**：npm `0.1.7-alpha.1` 已发布（2026-09-22T06:23:31Z），`@deepseek-ai/dsh@0.1.7-alpha.1` 直接依赖 80 项，`dist-tags` 中 `alpha` 指向 `0.1.7-alpha.2`、`next` 指向 `0.1.7-rc.1`（本批只锁 alpha.1，不混搭）。
- **官方文档镜像**：`docs/dsh-v0.1.7-alpha.1/`（含 `release.txt` 与 `docs/subsystems/`、`docs/persistence-changes/`）。
- **交叉核对**：本项目另一条线 `techflag/workdsh` 的 `5c613fb68c` 已完成同一版本升级并留 `docs/evidence/dsh-0.1.7-acceptance.md`（U17-1～6、UI-017-01～04、DEV-017-02）。该记录作为方向性交叉参考，**不作为本仓库验收证据**；本地结论一律以本地实测回填。

### 2.1 破坏性变化（影响本仓库）

| # | 变化 | 官方依据 | 本仓库影响面 |
| --- | --- | --- | --- |
| B1 | 专家预设注册表换主：`agent-presets` 拆为 `dsh-agent-preset` + `dsh-agent-preset-registry`，预设注册/释放归官方 `ctx.agentPresets` | `@deepseek-ai/dsh-agent-preset-registry@0.1.7-alpha.1`；镜像 `docs/subsystems/core.zh.md` | `packages/plugins/experts`：`preset-compiler.ts`、`experts-manager.ts`、`index.ts`、`execution-guard.ts`；相关测试与探针 |
| B2 | Session 持久化格式 V4，新增迁移包 `dsh-session-format-v3-to-v4` | 镜像 `docs/persistence-changes/2026-09-16-session-format-v4.zh.md` | `activity` 事件投影与子代理观测；`projects`/`library` 的 Session 绑定与 `present` 归因 |
| B3 | 官方原生预览优先：原生已支持 XLSX/XLS/CSV/TSV，自建预览须退到 builtin 备选位 | 镜像 `docs/subsystems/sidebar-right.zh.md` | `packages/plugins/office`：CSV/TSV 让位、`documentPreviews` 候选顺序 |
| B4 | 工作过程与 Team 面板由原生拥有 | `release.txt`；镜像子系统文档 | `activity` 不得再注册重复展示；事件投影兼容 V3/V4 |
| B5 | 主题语义 token 词表：统一 `--dsw-alias-*` | 镜像 `docs/web-styling.zh.md` | 全量 client 样式；本地线现为 0.1.6 词表且带硬编码 fallback，须切到 0.1.7 词表（`label-caption`、`state-error-*`、`bg-mask-2` 等） |
| B6 | 安装链一致性：`/api/settings/mutate` 要求 Profile 与 CLI 共用同一物理 app-boot 模块 | 镜像 `docs/subsystems/settings.zh.md` | `scripts/install-preview.mjs` 与预览启动链 |

### 2.2 依赖面差异（npm 实测，§3 执行）

- 254 条共有 override 全量 bump；新增 28 条；**改名 1 条**（`dsh-agent-presets` 移除）。
- 改名处置（P1 落地）：删除 `@deepseek-ai/dsh-agent-presets`，改由 `@deepseek-ai/dsh-agent-preset`（声明式预设行）+ `@deepseek-ai/dsh-agent-preset-registry`（服务名 `agentPresets`）承载；`@deepseek-ai/dsh-web-app`（`dsh.bundle.patch` 五文件）作为 preset 承载层进入根依赖。
- 版本族外：`@deepseek-ai/cordis` 4.0.2 → 4.0.3，新增 `@deepseek-ai/schemastery@3.18.3`。
- 新增类别：账号（`dsh-deepseek-account`、`-platform`、`dsh-api-account-controller`、`client-ui-settings-account`）、设置页 5 个（`client-ui-settings-{agent-loop,shell,subagent,web-search,account}`）、语音输入 4 个、`dsh-config-editor`、`dsh-skill-office`、`dsh-tool-workspace-dependencies`、`dsh-api-job-controller`、`dsh-session-format-v3-to-v4`。

### 2.3 公开面兼容复核（P6 实测完成）

`conversation.session.header.actions`、`ctx.layout.selectPanel`、`PropsRuntime`、`slots.inject`、`uiWorkspace.openSession`、`sessions.retain/ready/release`、`ctx.effect/ctx.on` 七项 alpha.2 已用公开面，已在 0.1.7-alpha.1 发布包 types 下逐个复核**通过**。定位手段：按包名 + 相对路径枚举 `node_modules/.pnpm/**/{lib,dist}/**/*.d.ts` 全文检索（首轮误在 `@deepseek-ai/dsh` 包内直查而未命中，真实落点分散在 client/api 子包）。

| 公开面 | 0.1.7-alpha.1 落点 | 结论 |
| --- | --- | --- |
| `ctx.layout.selectPanel` | `dsh-client-ui-layout/lib/types/client/service.d.ts`：`selectPanel(panelId: MainPanelId \| null): void`（`MainPanelId` 为 branded，未注册的 main key 抛错） | 保留；职责收窄为全局中央面板选择，当前会话的活动视图已并入 ui-conversation 的 session store |
| `uiWorkspace.openSession` | `dsh-client-ui-workspace/lib/types/client/navigation.d.ts`：`openSession(target: SessionTarget): void`，`SessionTarget = SessionId \| SubagentAddress` | 官方导航面新增；`ctx.sessions.open()` 在 0.1.6/0.1.7 的 `ISessions` 中均不存在，探针已改用它 |
| `PropsRuntime` | 0.1.7 侧 167 个 `.d.ts` 命中，含 `dsh-client-ui-agent-preset/{AgentPresetLabel,AgentPresetSeat,AgentPresetSection}.d.ts`、`dsh-client-ui-approval/.../contract/slots.d.ts`、`dsh-client-ui-chat/{chat/ApprovalCommand,contract/slots,settings/*}.d.ts`、`dsh-client-ui-conversation/.../contract/slots.d.ts` | 保留 |
| `slots.inject` | `dsh-client-ui-renderer/lib/types/client/registry.d.ts`：`SlotRegistry.inject(key, callback): () => void`（服务名 `slots`） | 保留；slot 已声明时回调 setup 失败会同步抛出，释放仍由 caller 的 `ctx.effect` 经 fiber 级联拥有 |
| `sessions.retain/ready/release` | `dsh-api-session-controller/lib/types/client/contract/sessions.d.ts`：`SessionReference.ready: Promise<SessionBinding>`、`release(): void` | 保留；`ISessions` 不含 `open()` |
| `ctx.effect/ctx.on` | `@deepseek-ai/cordis/lib/types/fiber.d.ts`（`Context extends Pick<Fiber,'effect'>`，重载 Sync/Async Effect，fiber 已释放时抛 `INACTIVE_EFFECT`）、`lib/types/events.d.ts`（`on(name, listener, options?)`） | 保留 |
| `conversation.session.header.actions` | owner 在 `dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts`；0.1.7 消费方含 `dsh-client-ui-agent-preset/AgentPresetLabel.d.ts`、`dsh-client-ui-jobs/JobListAction.d.ts`、`dsh-client-ui-schedule/ScheduleCatalogAction.d.ts`、`dsh-client-ui-sidebar-terminal/TerminalRecovery.d.ts`、`dsh-client-ui-subagent/SubagentHeaderLineage.d.ts`、`dsh-experimental-client-ui-agent-team/TeamAction.d.ts` | 保留 |

## 3. 阶段与交付

| 阶段 | 内容 | 退出证据 |
| --- | --- | --- |
| P0 | 版本承载文件快照备份 + 本计划落盘 | `.artifacts/dsh-0.1.7-alpha.1-upgrade/backup/`（24 文件）+ `backup-manifest.sha256` |
| P1 | 依赖面全量 bump + 改名 + install + 版本门禁 | `check:versions` PASS、`pnpm install` 日志、锁文件条目核对 |
| P2 | 专家预设迁移到官方 AgentPresetRegistry | 专家集成测试、注册/释放/重启回归 |
| P3 | Session V4 兼容（activity 投影、项目/资料库绑定） | 隔离数据下的 V3→V4 迁移与冷恢复 |
| P4 | 原生预览优先（office 让位）+ 安装链 app-boot 一致性 | 六种格式预览探针、settings/mutate 回执 |
| P5 | 主题 token 切 0.1.7 语义变量 | 浅色/深色往返探针、计算样式核对 |
| P6 | 全仓 build/typecheck/测试 + 预览安装 + 浏览器探针 | 各阶段日志与结构化结果、0 pageerror |
| P7 | 文档镜像换 0.1.7-alpha.1 + 引用重锚 + 文档门禁 | `audit:harness-docs`、引用同步清单 |
| P8 | 线上升级 + Session V3→V4 迁移 + 复验 | 线上 Profile 备份、迁移前后数据核对、域名复验 |
| P9 | 收口：证据文档、STATUS、AGENTS.md 基线、模块版本 | `docs/evidence/dsh-0.1.7-alpha.1-upgrade.md`、`check:plan` PASS |
| P9-R | 3 个重定版模块重打包 + 线上重新部署与只读复验 | `.artifacts/deploy-017/p9r-receipt.json`、`p9r-verify/`、`TREE_RESOLUTION_ALL_OK` |

## 4. 验证

- 本地：`pnpm build`、全仓 `typecheck`、集成测试、`check:plan`、`check:versions`。
- 运行面：隔离 Profile 安装（不覆盖用户既有 Profile）→ 预览启动 → 浏览器探针（项目、资料库、专家、连接器、Office、Activity）。
- Session V4：官方迁移路径，**先测试副本**；不直接改写用户 Session 日志。
- 线上：Profile 与数据备份后再升级；迁移前后核对会话数、项目、资料库资产；失败回退。

## 5. 回退方案

- 版本面：`.artifacts/dsh-0.1.7-alpha.1-upgrade/backup/`（24 文件，含根 `package.json`、17 个模块 `package.json`、`pnpm-lock.yaml`、5 个脚本、1 个测试）+ `backup-manifest.sha256` 逐文件校验。
- 运行面：恢复备份 → `pnpm install` → `preview:install` 回 `0.1.6-alpha.2`；用户数据保留。
- 部署面：线上升级前备份 `/data/dsh/profiles/web/` 与 Session 数据目录，回退时整体还原。
- 代码面：迁移改动集中在专家预设、activity 投影、office 预览、client 样式与安装脚本，边界清晰。
- **线上回退锚点（P8 实测登记，均保留原样）**：

  | 锚点 | 位置 | 内容 |
  | --- | --- | --- |
  | 旧 CLI 树 | `/data/dsh/global-dsh/standalone.017.old.20260924231611`（容器内） | `0.1.6-alpha.2`（实测 `package.json` version） |
  | Profile 副本 | `/data/dsh/profiles/web.bak.017.20260924231414`（容器内） | 升级前整个 `profiles/web` |
  | 重装前依赖 | `/data/dsh/profiles/web/node_modules.pre017.20260924231414`（容器内） | 升级前 `node_modules` |
  | 升级前配置 | `/home/luoji/dsh-backup-017-switch-20260924231414/`（宿主） | `profile-config/` 5 文件 + `pnpm-install.log`、`pre/post-sessions.txt`、`pre-cli-version.txt`、`pre-peer-resolution.txt` |
  | 切换前后凭据 | `/home/luoji/dsh-backup-017-swap-20260924231611/`（宿主） | `cli-before/after`、`container-before/after`、`gate-a/gate-b`、`sessions-after.txt`、`logs-after.txt`、`new-tree-version.txt` |
  | 升级前数据 | `/home/luoji/dsh-backup-017-20260924225010/`（宿主） | `baseline.txt` + `profile-config/sessions/storages` tarball + `SHA256SUMS.txt` |
  | 重定版前配置（P9-R） | `/home/luoji/dsh-backup-018-reversion-20260924235141/`（宿主） | `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` + 前后 Session 指纹 + 安装日志 + 版本核对 |
  | 重启前后状态（P9-R） | `/home/luoji/dsh-backup-018-restart-20260924235457/`（宿主） | `before/after.txt`、前后 Session 指纹、启动日志、CLI 版本 |
  | 只读复验输出（P9-R） | `/home/luoji/p9r-verify/`（宿主） | `listen.txt`、`sessions.txt`、`storages.txt`、`owner.txt`、`startup.log`、`api.log` |
  | 重定版前制品（P9-R） | `<app>/data/workspace/wd-upload-017/`（宿主） | 旧 tgz（activity `α.4` / connectors `α.2` / identity-local `α.5`），最小回退用 |
  | 专家自愈前配置（P10） | `/home/luoji/dsh-backup-p10-experts-20260925001601/`（宿主） | 换指针前 `package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` + 前后 Session 指纹 + 安装日志 |
  | 自愈重启前后状态（P10） | `/home/luoji/dsh-backup-p10-restart-20260925001658/`（宿主） | `before/after.txt`、修订与预设目录指纹、启动窗口日志、CLI 版本 |
  | 专家旧制品（P10） | `<app>/data/workspace/wd-upload-017/workdsh-plugin-experts-0.1.0-alpha.8.tgz`（宿主） | `α.8` 旧 tgz 保留，改回 1 个 `file:` 指针 + 重装 + 重启即可回退（最小回退，不换树） |

  回退步骤：① 容器内把 `/usr/local/lib/node_modules/@deepseek-ai/dsh` 换回旧树（当前挂载 `…/data/dsh/global-dsh/standalone`，旧树为同级 `standalone.017.old.20260924231611`）；② 还原 Profile 配置与 `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`/`cordis*.yml`；③ `node_modules` 换回 `.pre017.20260924231414`（或 `rm -rf node_modules` 后重装）；④ `docker compose up -d --force-recreate`；⑤ 核对 `dsh --version` 回 `0.1.6-alpha.2` 与会话数不变。用户数据（storages / sessions）保留不动。

## 6. 风险

| 风险 | 缓解 |
| --- | --- |
| 专家预设机制换主导致既有修订不可运行 | 过期修订由专家服务在启动／读取时自动重编译为派生修订并前移 `publishedRevisionRef`，旧行只读保留（ADR-0010）；`experts/preset-broken` 收窄为「该修订迁移未成功」。**2026-09-25 更新（P10）**：原口径「不静默重编、提示用户重新发布」已作废——3 个内置默认专家 `publish()` 被 `default-immutable` 拒绝，无法靠重新发布恢复，故改为服务侧自愈（experts `α.9`） |
| Session V3→V4 迁移损坏线上历史 | 先备份再迁移；先测试副本；不直接改写日志 |
| CSV/TSV 让位后编辑入口丢失 | Office 注册为 builtin 备选并保留编辑入口，探针验证可切换 |
| 主题 token 词表错配产生能编译但语义错的样式 | 按 `web-styling` 语义变量列表逐项核对 + 明暗往返探针 |
| 版本遗漏 override | `check:versions` 对锁文件断言 + install 输出核对 |
| 线上不可用 | 备份 + 回退路径；迁移失败即还原 |

## 7. 执行记录

- [x] P0 备份与计划落盘（2026-09-24）
  - 工作树干净，HEAD `9b8215a070`（projects α.4）。
  - 备份 24 文件至 `.artifacts/dsh-0.1.7-alpha.1-upgrade/backup/`（根 `package.json`、17 个模块 `package.json`、`pnpm-lock.yaml`、`check-published-versions.mjs`、`install-preview.mjs`、3 个 pack 脚本、`project-installer.test.mjs`），`backup-manifest.sha256` 29 → 24 行（剔除误带入的 `node_modules` 副本后重算）。
  - 环境：Node v24.15.0（AGENTS.md 允许）、pnpm 10.34.5。
- [x] P1 依赖面全量升级到 `0.1.7-alpha.1`（2026-09-24）
  - 根 `devDependencies`（21 条）、`pnpm.overrides`（257 → 284 条）、17 个模块 `package.json`、脚本与测试引用全量锁定；`@deepseek-ai/dsh-agent-presets` 按官方改名移除。
  - `corepack pnpm install --no-frozen-lockfile` 通过；Cordis 伴生包按批次逐条 override 钉版（`cordis@4.0.3`、`include@1.0.8`、`timer@1.1.5`、`loader@1.0.4`、`group@1.0.3`、`schemastery@3.18.3`）。
  - 退出证据 `corepack pnpm check:versions` → **PASS: 539 DSH lock entries pinned to 0.1.7-alpha.1; Cordis 4.0.3 only**（本条为写入时复跑结果）。
- [x] P2 专家预设迁移到官方 `ctx.agentPresets`（2026-09-24）
  - 代码面：`experts/src/runtime/preset-compiler.ts` 经官方 `AgentPresetRegistry.register` 注册并由 `ctx.effect` 释放，基线预设从 Loader 条目 + 官方 `@deepseek-ai/dsh-agent-preset` 解析；`experts-manager.ts` 的 `resolve('standard')`/`list()` 改读官方注册表；`index.ts` 把 `agentPresets` 纳入必需注入。
  - 退出证据：`node --test tests/integration/expert-manager.test.mjs tests/integration/expert-native-presets.test.mjs tests/integration/expert-results.test.mjs` → **25 tests / 25 pass / 0 fail**（含预设编译同内容复用、跨重启绑定、原生 Slot 名单过滤、professional 结果判定）。
- [x] P3 Session 格式 V4 兼容（2026-09-24）
  - 读取面：`activity` 事件投影按 V4 改写（`tool/result` 改读一等 tool 消息的 `message.toolCallId` / `message.isError`，官方 `ContentBlockMap` 已移除 `tool-result` 块）；子代理观测从已移除的 `subagentsByParent`/`refreshSubagents` 改读 `SessionListState.projectionsBySession[root].values.subagentCatalog` + `sessions.refreshProjections`；探针、脚本与集成测试里 `session.v3.jsonl.zstd` 全量改 `.v4.`。
  - `projects`/`library` 绑定复核：`deliverable-attribution.ts` 只读 `event.data.files` 与 `session.header.cwd`，V4 下无破坏点。
  - 退出证据：`activity` build PASS、`projection.test.mjs` **14/14 pass**、`skill-session`+`skill-persistence` **5/5 pass**、全仓 `corepack pnpm typecheck` 退出码 0；隔离 Profile 浏览器探针 `probe:activity` **PASS**（官方 Profile/Client 加载、46px 单行、原生正文保留、关闭动画后刷新保留、系统减少动效、Escape、0 pageerror）与 `probe:activity --disabled` **PASS**（停用后恢复原生 header/正文、无插件样式）。
  - 本轮同时修复既有探针缺陷：`probe-activity.mjs` 原先假定隔离目录内已有 `preview` Profile，且手写夹具缺少 `step/start`（V4 生命周期准入拒绝 `assistant/message`）。现改为官方 CLI 组合隔离 Profile（web 模板 + 本插件 bundle 层），夹具补齐 `step/start`/`step/end`。
  - 未执行（留给 P8）：线上 Session V3→V4 迁移本体；迁移包路径已核验（经 `dsh-session-format-catalog` 注册 `v3→v4`，只读 open 不发布后继、写 open 才发布新 generation，父目录需完整直属子证据，缺失时以 `subagent/catalog` 保留 header 身份）。
- [x] P4 原生预览优先（office 让位）+ 安装链 app-boot 一致性（2026-09-24）
  - P4a 让位：`office/src/client.tsx` 两处 `documentPreviews.register`（`workdsh-office`、`workdsh-office-csv`）声明 `priority: "builtin"`。候选排序同档时由注册顺序决定，官方 bundle 先注册，故官方原生预览恒为 `candidates[0]`，WorkDSH 编辑器保留为「打开方式」下拉备选——风险表第 3 行的「保留编辑入口」据此满足，与 techflag 线整体删除 CSV 注册的做法不同。
  - P4b 安装链：`install-preview.mjs` 把根 `pnpm.overrides`（279 条精确钉版）投影进 Preview Profile 的 `pnpm-workspace.yaml`（Profile 内安装不继承工作区 overrides，caret 链会在镜像站浮到 `0.1.7-rc.2` 并索取未发布的 `dsh-sdk-jsonrpc-server@0.1.7-rc.2`，直接导致 `ERR_PNPM_NO_MATCHING_VERSION`）；随后仍装 Profile 内官方 CLI 与平台账号 peer，并断言 launcher 与 `dsh-config-editor` 解析同一物理 `dsh-app-boot`。`start-preview.mjs` 从 Profile 内 CLI 启动并复做版本与实例 preflight。
  - P4c 六格式预览探针：`corepack pnpm probe:office:native` → **14 条断言全 PASS**，`browserErrors` 与 `diagnostics` 均为空。docx/pptx 默认走官方 office 预览（经 `dsh-office-to-pdf` 转 PDF，以 `[data-pdf-preview]` + 页 canvas 核对），xlsx/csv 默认走官方 excel 预览（`[data-excel-preview]`），xls/tsv 只有官方候选（本仓库不覆盖）；docx/pptx/xlsx/csv 经「打开方式」下拉切回 WorkDSH 编辑器成功。夹具迁到 `tests/fixtures/office-native/`（docx/pptx/xlsx/xls 二进制 + 内联 tsv），探针不再依赖先跑 `probe:office`。
  - P4d 回归：`--filter workdsh-plugin-office build`、`typecheck` 退出码 0；`probe:office:word-only` **4 条 PASS**（含两处注册 `priority: "builtin"` 断言，`failures: []`）；`test:office:csv` **2/2 pass**。
  - P4e 回执：`preview:install` 退出码 0，Profile 内 258 个 `@deepseek-ai` 包无 rc 残留（`dsh`、`dsh-base`、`dsh-app-boot`、`dsh-config-editor`、`dsh-sdk-app`、`dsh-sdk-jsonrpc-server` 均为 `0.1.7-alpha.1`）；`corepack pnpm preview` 正常起在 3031。新增 `probe:settings`（`scripts/probe-preview-settings.mjs`）→ **PASS**：`settings/describe` 报 `writable`，`ui-theme.fontSize` 往返写入回执 `applies: live`，未再出现 `settings/rejected: dsh: profile reload requires the root Include entry`（回执 `.artifacts/preview-settings/result.json`）。
  - 未执行：P6 的全仓构建、类型检查与浏览器探针回归；P8 线上升级与 Session V3→V4 迁移。
- [x] P5 主题 token 切 0.1.7 语义变量 + 全仓去硬编码 fallback + 门禁落地（2026-09-24）
  - 词表真源：`.test-runtime/preview/profiles/preview/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js`（根 `pnpm.overrides` 钉在 `0.1.7-alpha.1`，探针启动前断言版本）。其 8 个 CSS 字符串字面量解析出 **361 个 `--dsw-*` 名字**：light 基态 **361 条声明**（357 在裸 `body`、4 个 elevation 在 `body,body *`），`body[data-ds-dark-theme]` 块 **168 条只做 override**。dark 只覆盖、light 级联生效，故**裸 `var()` 只需 light 基态有声明即可两主题存活**——这是本次去 fallback 的前置条件。
  - 词表外名字 8 个（本轮全部替换为官方语义变量；旧名连 fallback 一起删，**fallback 正是让它们静默存活 8 个月的原因**）：

    | 原名字 | 处置 |
    | --- | --- |
    | `--dsw-bg-default` | → `--dsw-alias-bg-base`（light `#fff` / dark `#151517`） |
    | `--dsw-bg-elevated` | → `--dsw-alias-bg-layer-1`（`#fff` / `#232324`） |
    | `--dsw-bg-subtle` | → `--dsw-alias-bg-module-platform`（`#f5f6f7` / `#353638`） |
    | `--dsw-bg-hover` | → `--dsw-alias-interactive-bg-hover`（`#2631480f` / `#ffffff14`） |
    | `--dsw-border-default` | → `--dsw-alias-border-l2`（`#0000001a` / `#ffffff1f`），原 `1px` 边框同步改 `.5px` 以对齐 0.1.7 亚像素描边 |
    | `--dsw-fg-default` | → `--dsw-alias-label-primary`（`#0f1115` / `#f9fafb`） |
    | `--dsw-fg-muted` | → `--dsw-alias-label-secondary`（`#61666b` / `#cfd3d6`） |
    | `--dsw-alias-fill-tsp-secondary` | 删除该声明改为 `background:transparent`：该名字**官方 0.1.7-alpha.1 自身也写错**——`dsh-client-ui-agent-preset/lib/client.js` 的 `.SVAs4q_label{background:var(--dsw-alias-fill-tsp-secondary);max-width:180px;height:22px;color:var(…)}` 引用了 `dsh-client-ui-theme` 从未声明的 token（实测 theme 包内该名字出现 0 次），裸 `var()` 在 computed-value 阶段被丢弃；属上游缺陷，不计入本仓库词表 |
  - 全仓 fallback 清零：`var(--dsw-*,<fallback>)` **852 处 / 15 文件**（`experts` 191、`skills` 146、`projects` 144、`library` 84、`connectors` 65、`assistant` 57、`ui/navigation` 34、`ConnectorPicker` 33、`workbench` 31、`office/csv.css` 27、`activity` 25、`ui/modal` 8、`LibrarySelectionChips` 4、`LibraryPicker` 2、`TaskExecutionNotice` 1）收敛为裸 `var(--dsw-name)`；改写采用 paren-aware 扫描，**只删 fallback、不动其它任何字符**。
  - 等价性复核：`git diff -U0` 对上述 15 文件逐 hunk 比对「`-` 行剥 fallback 后是否等于 `+` 行」→ **checked 262 changed lines, 0 not explained by fallback removal**；另外 `office/live/style.ts` 与 `ProjectLineageChip.tsx` 的 19 行差异属上表语义替换（有意），非误改。改写脚本复跑 dry-run：**0 fallbacks in 0 files**（全仓已无 fallback）。
  - 通用样式词表来源：`packages/ui/src/styles/tokens.ts` 7 个裸 alias（canvas/sidebar/card/selected/border/text/secondary），头注释已同步为「名字须属官方词表**且**带基态声明，全树 fallback-free，`probe:theme` 双向断言」。
  - office 文档纸色豁免：`office/src/live/style.ts` 中 `.wd-office-paper` 及其渲染内容（正文字色、表格、图表、图片缩放手柄）保留固定色值，不接语义 token——`.docx` 页面在两主题下都是白纸，与官方 PDF 文档预览一致，重新着色会破坏 WYSIWYG；头注释明示「these literals are content, not theme」，`probe:theme` 只扫 `var(--dsw-*)` 引用故不受影响。
  - 新增门禁 `corepack pnpm probe:theme`（`scripts/probe-theme.mjs`，注册于 `package.json`）：①**静态**——`packages/` 下每个 `var(--dsw-*)` 名字必须属官方词表**且**在官方 light 基态有声明（未声明则裸 `var()` 会被整条丢弃），并核对不存在硬编码 fallback；②**实况**——经官方 `ui-theme` settings Remote 走 `light → dark → 原值` 往返（`settings/describe` 读 `namespace.user.preference`、`settings/mutate` 断言回执 `preference` 且 `applies: live`），核对 `body[data-ds-dark-theme]`、`html color-scheme`、`data-ds-theme-source` 与 **19 个采样 token** 的计算值与官方调色板逐项相等，且 `.wd-projects` 面板背景/前景分别等于 `--dsw-alias-bg-base` / `--dsw-alias-label-secondary`、两主题确实重绘、还原后回到原色，0 pageerror。探针使用临时 `DSH_AGENTS_HOME`（`.test-runtime/theme-agents-*`），不读用户技能目录。
  - 退出证据（2026-09-24 实跑，2 次均退出码 0）：
    ```
    Static: 887 fallback-free var(--dsw-*) references across 232 files, all declared by the 0.1.7-alpha.1 palette (361 names, 361 base declarations).
    Live: ui-theme.preference light -> dark -> system; body[data-ds-dark-theme], html color-scheme and 19 token values match the official palette in both schemes.
    Receipt written to .artifacts/theme/result.json.
    ```
    回执 `.artifacts/theme/result.json`：`themeVersion 0.1.7-alpha.1`、`vocabulary 361`、`scannedFiles 232`、`references 887`、`unknown 0`、`undeclared 0`；light 面板 `rgb(255,255,255)` / `rgb(97,102,107)`，dark 面板 `rgb(21,21,23)` / `rgb(207,211,214)`，原始偏好 `system`（本机解析为 dark）还原后与 dark 一致。
  - 回归：`corepack pnpm build` 退出码 0；`corepack pnpm preview:install` 退出码 0（Profile 内 258 个 `@deepseek-ai` 包仍为 `0.1.7-alpha.1`，无 rc 残留）。
  - 未执行：`scripts/probe-presets.mjs` 的 0.1.7 迁移（P2 未纳入，留待 P6 一并处理）；`activity/projection.ts` 残留的 `kind === 'cancelled'` 启发式；`probe-activity.mjs` 两处写死 `profiles/preview` 路径与 `profile='preview'`；`office/CHANGELOG.md` 两处 CSV 预览措辞待复核。P6 全仓测试与浏览器探针回归、P8 线上升级与 Session V3→V4 迁移均未开始。
- [x] P6 全仓静态/单测回归 + 预览安装 + 浏览器探针回归（2026-09-24）
  - 静态（`.artifacts/p6-static-verify.log`，逐步骤退出码）：`build`=0、`typecheck`=0、`check:plan`=0（`31 modules; 50 documents`）、`check:versions`=0（**539 DSH lock entries pinned to 0.1.7-alpha.1; Cordis 4.0.3 only**）、`test:planning`=0；`check:acceptance P1`=1 属相位门禁预期（`P1 gate: 42 unfinished cases (includes previous phases)`），非回归——该脚本必须带相位参数，无参时报 usage 并退出 2。
  - 单测（`.artifacts/p6-tests.log`、`.artifacts/p6-pkg-tests.log`）：**185 tests / 185 pass / 0 fail**，各步退出码均为 0——`test:integration` 110、`test:activity` 14、`test:office:content` 21、`test:office:csv` 2、`test:skill-quality` 3、`test:remote:lifecycle` 4、`test:library` 5、`test:projects` 10、`test:assistant` 4、`portal` 12。
  - 预览安装（`.artifacts/p6-preview-install.log`）：`preview:install` EXIT=0；八层官方 Profile 独立安装 Skill/Expert/Connector/Office/Library/Projects/Assistant/presentation，launcher 与 settings 共用同一 `dsh-app-boot`（0.1.7-alpha.1）。
  - 探针批 A（`.artifacts/p6-probes-a.log`）：`probe:theme`、`probe:settings`、`probe:activity`、`probe:office:native`、`probe:office:word-only` 全 EXIT=0。
  - 探针批 B1 与补跑（`.artifacts/p6-probes-b1.log`、`.artifacts/p6-probes-fix2.log`）：`probe:experts:team`（9 PASS）、`probe:experts:team:web`（15 PASS，含 `official-web-team-panel-is-read-only-over-native-team-state`、`no-browser-page-errors`）、`probe:experts:team:resilience`（15 PASS，含冷重启、中断恢复、失败成员保留未完成任务）、`probe:experts:team:real`（真实模型两阶段官方交接）全 EXIT=0。
  - 探针批 B2（`.artifacts/p6-probes-b2.log`）：`probe:install`、`probe:browser`、`probe:skills`、`probe:experts`、`probe:experts:official`、`probe:experts:professional`、`probe:office`、`probe:office:live`、`probe:library`、`probe:headless`（`dshVersion: "0.1.7-alpha.1"`）、`probe:mcp:resources`、`probe:computer-use:native`、`probe:subagent:activation-limit`、`probe:connectors`、`probe:presets` 全 EXIT=0，0 pageerror。
  - `probe:presets` 迁移补齐（P5 遗留项）：`.artifacts/probe-presets-0.1.7.log` → 6 PASS + 1 OBSERVED，预设切换与技能目录经官方 Remote（`agentPresets/list|select`、`skills/list`，`with-cordis (26)` / `without-cordis (0)`）跑通，退出 0。
  - §2.3 公开面七项逐项复核通过，落点见 §2.3。
  - 两处既有探针缺陷修复（`.artifacts/p6-probes-fix.log`；`git log` 定性为**既有测试过期，非 0.1.7 回归**）：
    1. `scripts/probe-browser.mjs` 断言 `助理（待开放）`：assistant 自 `96c4ea911f`（2026-09-24「助理侧栏入口实现为可用功能」）起自持 `main` + `sidebar.panellist` 行，而 `packages/bundle/cordis.patch.yml` 不含 assistant，故该 Profile 本就没有该行。改为断言现存三条待开放项（`专家 · 技能 · 连接器`、`定时任务（待开放）`、`更多（待开放）`）与三条缺席行（`资料库`、`项目`、`助理`），点击目标改为「定时任务（待开放）」。修后 8 PASS、EXIT=0。
    2. `scripts/probe-office-live.mjs` fixture 调用 `ctx.sessions.open()`：核对 0.1.6 与 0.1.7 的 `ISessions` 契约**都不含 `open()`**（`open()` 只在内部 `Session` 类上），改用官方 `ctx.uiWorkspace.openSession(sid)` 并把 `uiWorkspace` 加入 `inject`；另新增 `switchToWorkdshEditor()` 适配 P4a「官方 builtin DOCX 预览占默认位」契约，三处打开工作区 DOCX 后先经「打开方式」菜单切回 WorkDSH 编辑器再断言其 region。修后 16 PASS、EXIT=0，`result.json` 的 `browserErrors: []`。
  - 未执行：`probe:office:live --real-model` 在本机被环境前置阻断——探针从用户全局技能目录复制 `~/.agents/skills/officecli`（`ENOENT: lstat '/Users/apple/.agents/skills/officecli'`），本机未安装该技能；属环境前置缺失而非升级回归，其结果不作本批证据。因此 `switchToWorkdshEditor()` 在 realModel 分支（``Preview ${delivery.path} in sidebar`` 之后）的调用点未实测；非 realModel 分支的另外两处调用点（首次打开文件、reload 后重开）已实测通过。
  - 未执行：P7 文档镜像换 0.1.7-alpha.1 快照与引用重锚；P8 线上升级与 Session V3→V4 迁移；P9 收口（证据文档、STATUS、AGENTS.md 基线）。
- [x] P7 文档镜像换 0.1.7-alpha.1 + 引用重锚 + 文档门禁（2026-09-24）
  - 镜像配方（与 0.1.6 批次同一口径）：GitHub 公开仓库 `deepseek-ai/deepseek-harness` tag `dsh-v0.1.7-alpha.1`（commit `c36a83ff6bb95e3f82cf79f9be7c724270a8aa61`）的**仓库根 `docs/` 子树**，排除 `native/system/docs/`（0.1.6 镜像同排除：远端 550 / 本地 543，差异恰为该 7 文件）。
  - 落盘：`docs/dsh-v0.1.7-alpha.1/` = **562 文件 / 347 md**、8 个子目录（`cookbook/ cordis-api/ cordis-tutorial/ i18n/ persistence-changes/ postmortem/ subsystems/ user/`）；`web-styling.zh.md`、`subsystems/{core,sidebar-right,settings,client-modules}.zh.md`、`persistence-changes/2026-09-16-session-format-v4.zh.md`、`cookbook/adding-a-tool.zh.md`、`api-gateway.zh.md` 已核验存在。计划 §1 原写「563 文件」把 `docs/` 目录条目本身计了进去，已校正为 562。
  - 语料差异（逐文件 `comm` + `cmp` 对比 0.1.6 镜像）：**0 删除、19 新增、157 个共有文件内容有变**。新增为 `persistence-changes/2026-09-16-session-format-v4.{md,zh.md,i18n.yaml,schema.json}`、`persistence-changes/2026-09-20-unknown-child-catalog.{同四件}`、`persistence-changes/finalized/v4.json`、`persistence-changes/historical-formats/v3.{同四件}`、`subsystems/product-telemetry.{md,zh.md,i18n.yaml}`、`subsystems/voice-input.{同三件}`；内容变化集中在会话 V4、流式/二进制 Remote（`api-gateway.zh.md` 新增 `@Remote({ mode: 'stream' })` 一节为典型）、账号与设置页、语音输入、产品遥测、样式 token 与开发工作流。
  - **引用重锚**：全仓镜像路径 token `docs/dsh-v0.1.6-alpha.2` → `docs/dsh-v0.1.7-alpha.1`，**41 文件 78 处**（`AGENTS.md` 1、`docs/HARNESS-OFFICIAL-DEVELOPMENT.md` 7、`docs/adr/{0015,0018,0019,0026}` 6、`docs/design/**` 17 文件 40、`docs/evidence/**` 16 文件 22、`packages/portal/README.md` 1、`docs/research/deepseek-harness-review.json` 1）。可达性复核：抽出 93 个唯一镜像相对路径逐个 `test -e`，**0 missing**。
  - **判定口径（谁改谁不改）**：只重锚「指向官方说明的查证入口」；把该路径当作**事实对象**陈述的句子保留原 token。保留清单 = `docs/DSH-0.1.6-alpha.2-UPGRADE-PLAN.md`（2）、`docs/DSH-0.1.7-alpha.1-UPGRADE-PLAN.md`（1，本次决定「旧镜像保留」）、`docs/evidence/dsh-0.1.6-alpha.2-upgrade.md`（2，alpha.1→alpha.2 替换事实）、`docs/evidence/dsh-0.1.6-official-integration.md`（1，文件名声明 0.1.6 批次）、`docs/research/deepseek-harness-capability-review.md`（2）、`docs/research/harness-review-closure.md`（15）、`docs/STATUS.md`（6，历史台账条目），共 **29 处 / 7 文件**。口径与 0.1.6 批次 `docs/evidence/dsh-0.1.6-alpha.2-upgrade.md:76`「全仓 44 文件 117 处旧路径 token 更新；`.idea` 与 `.artifacts` 历史证据不改写」一致，本批另把「路径即事实」的句子纳入保留面。
  - **行号重锚**（d07 证据 5 处，按新语料实测）：`subsystems/slots.md:25-41→27-43`、`:150→158`、`persistence-catalog.md:473-477→475-479`、`tool-catalog.md:624-630→629-635`、`tool-catalog.md:25` 不变；证据表内已加 2026-09-24 补记，并注明该表结论**未按新语料复审**。
  - **文档门禁**：`docs/research/deepseek-harness-review.json` 的 `corpusRoot` → `docs/dsh-v0.1.7-alpha.1`，`reviewed` 127 条不变（0.1.7 为超集且 0 删除，127 条全部仍属 canonical）。`corepack pnpm audit:harness-docs` → **退出 0**：`127/176 canonical documents reviewed; 49 pending`（证据 `.artifacts/dsh-0.1.7-alpha.1-upgrade/p7-doc-mirror-audit.log`）。canonical 171 → 176（+5：`persistence-changes/2026-09-16-session-format-v4.zh.md`、`persistence-changes/2026-09-20-unknown-child-catalog.zh.md`、`persistence-changes/historical-formats/v3.zh.md`、`subsystems/product-telemetry.zh.md`、`subsystems/voice-input.zh.md`）；pending 44 → 49（其中 5 条属 0.1.7 新增规范对象、44 条为 0.1.6 批次既有待审）。pending 非空是脚本既定语义（退出 0，不判失败），不表示本批已审完。
  - **未执行（登记，不得写成已完成）**：① 157 个内容有变的共有文件**未逐文件复审**——本阶段只完成「语料重新定界 + 台账重锚 + 门禁」；`docs/research/harness-review-closure.md` 的 H01–H09 结论仍以 0.1.6 语料为准，需另批复审（已在该文件与 `deepseek-harness-capability-review.md` 加 2026-09-24 补记）。② 裸版本号 `0.1.6-alpha.2`（`AGENTS.md` 第 2 条基线声明与第 3 段 Agent Teams 版本、`docs/HARNESS-OFFICIAL-DEVELOPMENT.md:3,81`、`packages/portal/README.md:129`、各包 README/CHANGELOG、根 `README.md`、`docs/MODULE-VERSIONS.md`、`docs/development-order.json`）属 P9 收口项，本阶段未改；`AGENTS.md` 的镜像路径已是 0.1.7、基线版本号仍为 0.1.6，此不一致在 P9 一并消除。
  - **门禁复跑**（本条为实测结论，与未执行项分开登记）：P7 落盘后 `corepack pnpm check:plan` PASS（`31 modules; 50 documents`）、`corepack pnpm check:versions` PASS（`539 DSH lock entries pinned to 0.1.7-alpha.1; Cordis 4.0.3 only`）、`corepack pnpm audit:harness-docs` PASS（`127/176 canonical documents reviewed; 49 pending`），退出码均 0。
  - 未执行：P8 线上升级与 Session V3→V4 迁移；P9 收口（证据文档、STATUS、AGENTS.md 基线、模块版本与门禁）。
- [x] P8 线上升级 `dsh.10ge.cn` + Session V3→V4 迁移 + 复验（2026-09-24 执行 / 2026-09-25 复验收尾）
  - **P8-1 升级前全量备份**（宿主 `/home/luoji/dsh-backup-017-20260924225010/`，5 文件，`ts=20260924225010`）：`baseline.txt`（`cli_version=0.1.6-alpha.2`、`image=sha256:a2ee56aa…c99b6d`、`sessions_v3=18`、`sessions_v4=0`、`session_dirs=18`、`storages/workdsh_{projects=1,library=1,experts=4,connectors=2,assistant=1,audit=1,office=1}`、`profile_deps=16`、`profile_bundles=14`）+ `profile-config.tgz`（114609B）+ `sessions.tgz`（10491676B）+ `storages.tgz`（3393534B）+ `SHA256SUMS.txt`。
  - **P8-2 workdsh 0.1.7 适配制品**：本地 pack **12 包**（`workdsh-bundle` + 10 个 `workdsh-plugin-*` + `workdsh-provider-identity-local`），与 P8-5 后 profile 内实际依赖逐条对应；制品落在 `.artifacts/deploy-017/*.tgz`。
  - **P8-3 暂存 `0.1.7-alpha.1` CLI**（`stage-017{,b,c,d}.sh`，全程 uid 1000，不触碰运行中的 standalone）：容器内 `pnpm install` → 宿主机物化扁平闭包到 `data/dsh/global-dsh/_a3-standalone`。两处实测修正：① overrides（279 条）必须写进 `pnpm-workspace.yaml`，写在 `package.json` 的 `pnpm.overrides` 会被 pnpm 忽略 → 闭包浮到 `0.1.7-rc.1`（017b 实测 257 个 rc.1）；② 不可关 `autoInstallPeers`——`dsh-app-boot` 把 `cordis-plugin-group` 声明为 peer，关掉后整棵缺席、`node lib/bin.js --version` 直接 `ERR_MODULE_NOT_FOUND`（017c 实测）；线上 0.1.6 树同样依赖默认自动装 peer。硬门禁（解析完整性 + 可执行 + auth-bypass 锚点）PASS，`_a3-standalone` version = `0.1.7-alpha.1`。
  - **P8-4 副本上离线验证 Session V3→V4**（`stage-017e-v4probe.sh`，只读、不驱动写路径）：只用官方公开纯迁移面（`dsh-session-format-catalog` 的 `sessionFormatCatalog`），不启动 App → 不发布任何后继文件。退出证据 `.artifacts/deploy-017/p8-4-result-live.json`：`tree=/data/dsh/global-dsh/_a3-standalone`、`root=/data/dsh/sessions`、`node=v24.21.0`、`catalogCurrentVersion=4`、`historicalCatalogCurrentVersion=3`、`generations=18`、`problems=[]`、`summary{total:18, migrated:18, failed:0}`、逐条 `roundTripOk=true`（含 1 条 `origin=subagent`/`hasParent` 的子代理产物）；副本文件数复核对显示探针零新增，同一探针只读线上 `sessions` 得同一结论，线上目录前后字节一致。
  - **P8-5 线上切换**（两阶段，`stage-017f1-prep.sh` / `stage-017f2-swap.sh`）：
    - Phase 1 预备：备份 profile 配置与整棵 `profiles/web` 到 `/home/luoji/dsh-backup-017-switch-20260924231414/`；`profiles/web/package.json` 4 个官方依赖 `0.1.6-alpha.2 → 0.1.7-alpha.1`、12 个 workdsh tgz 重指适配制品；`pnpm-workspace.yaml` 投影根 overrides 279 条（理由同 `install-preview.mjs`）；容器内 uid 1000 跑 `pnpm install`。退出 `PHASE1_OK`。
    - Phase 2 换树：`mv` 原子换树（`standalone` → `standalone.017.old.<TS>`，`_a3-standalone` → `standalone`）；`patch-auth-bypass.mjs` 对新 standalone 与 profile 各自持有的 `dsh-client-connection` 各补一次（profile 侧在 Phase 1 被覆盖，必须重打）；硬门禁用一次性容器按**真实挂载路径**验证换树后 standalone；`docker compose up -d --force-recreate`（bind mount 在创建时按路径解析，`restart` 不重新解析）。退出 `PHASE2_OK`，容器 `Up (healthy)`、`Restarts=0`、CLI `0.1.7-alpha.1`。
  - **P8-6 升级后只读复验**（回执 `.artifacts/deploy-017/p8-6-receipt.json`，7 张截图见 `p8-6-screens/`）：
    - 运行面：`health=healthy`、`restarts=0`、`StartedAt=2026-09-24T23:16:18.52323078Z`（换树后无重启）；监听仅 4 个 loopback 服务（3080 dsh web / 3081 sse-keepalive / 3082 survey / 3083 portal）+ docker DNS；属主门禁 `! -user 1000` = **0**；换树后 6 项错误模式计数 **0**。
    - 域名面：`https://dsh.10ge.cn/` → **302 → `/portal`**（200）、`/login` 200、`server: cloudflare`；官方 bootstrap token 只对容器内 `127.0.0.1:3080` 直连有效（门户外壳按既有设计 302）。
    - 会话面：`/data/dsh/sessions/--data-dsh-home-dsh--` `files=36 / v3=18 / v4=0 / locks=18`；`find . -type f -printf '%P %s %T@\n' | sort` 与 `dsh-backup-017-swap-20260924231611/sessions-after.txt` **`cmp` 一致 → `SESSIONS_UNCHANGED_SINCE_SWAP_OK`**（升级后未触碰任何 Session 日志）。`v4=0` 符合官方语义（读 open 只在内存准备，写 open 才发布后继）；本次按 §4「不直接改写用户 Session 日志」**未触发写路径**。
    - 数据面：`storages` 顶层条目与 P8-1 备份**完全一致**，顶层计数 `projects=1 library=1 experts=4 connectors=2 assistant=1 audit=1 office=1` 与基线逐项相等；文件数 32341 → **32365**，增量**全部为新增**（`workdsh_audit/events/*.json`、`session_projcache`、`workdsh_runtime_binding` 的正常写入），**无删除、无改写**；`workdsh_projects/states/local-personal_local-user.json` sha256 与备份**逐字节相等**（`68e2ee76…ec4b5`）。业务实体：`experts=12 / revisions=4 / drafts=12`、`connectors=3`、`office=9`。
    - 功能面（只读 API 10 项，`P8_6_READONLY_ALL_OK` total 10 / failed 0）：`experts/list` 12、`projects/list` 0（空集非故障）、`projects/templates` 15、`library/space` 1 / `library/list` 3、`skills/list` 34 / `skills/catalog` 1、`connectors/list` 3、`assistant/list` 0。
    - 浏览器面：`P8_6_BROWSER_CLEAN_OK`（外壳）、`P8_6_PAGES_CLEAN_OK`（项目 / 资料库 / 专家·技能·连接器 / 助理四页）、`P8_6_TABS_CLEAN_OK`（专家、连接器两页签）；三份 totals 均 `pageErrors: [] / consoleErrors: [] / httpFailures: []`；标题 `DeepSeek Harness`；`/plugins/events` SSE 35 秒观测零重连。宿主 `playwright-core@1.62.1` 与已装 `chromium_headless_shell-1228` 不符，探针以 `P8_CHROME_PATH` 显式注入可执行文件；复验经自建只读回环代理（容器 `172.19.0.3:3080` → `127.0.0.1:3080`）绕过门户外壳 302，**复验后代理进程与全部临时文件已清理**，属主门禁复跑仍为 0。
    - **功能面新增观察（登记为「已定性的预期行为」，非本次回归）**：
      1. **4 个 0.1.6 时代发布的专家 `readiness=broken`，UI 徽标「专家 preset 异常」**（`experts/list` 实测 `byReadiness{unknown:8, broken:4}`；broken 为 `大客户经营顾问`/`工作复盘顾问`/`文档评审顾问`/`需求分析顾问`）。根因取证：`revision.presetRevisionRef` 指向旧 `wd-exp-*`；旧制品在 `/data/dsh/.agent-presets/wd-exp-*/`（`agent.cordis.yml` 格式，只读保留）；0.1.7 新路径 `$DSH_AGENTS_HOME/.workdsh-state/experts/presets/<id>/preset.json` 下无对应文件 → `preset-compiler.ts` 的 `readExpertPreset()` 遇 `ENOENT` 抛 `experts/preset-broken` → `experts-manager.ts:readinessMap()` 判 `broken`。新旧 dist 对照证明是**契约换主**而非部署失误（`workdsh-plugin-experts` 两侧同为 `0.1.0-alpha.8`；OLD 从 `@deepseek-ai/dsh-agent-presets` 导入且 `.workdsh-state` 出现 0 次，NEW 从 `@deepseek-ai/dsh-agent-preset-registry` 导入且 `.workdsh-state` 出现 1 次）。**属 §2.1 B1 + §6 风险表第 1 行已登记的预期破坏性变化**：旧数据保留只读；**数据无损**（4 个 revision 定义与 4 个旧 preset 目录原样保留）。当时口径为「旧修订不静默重编、显式诊断并提示重新发布」——**该口径已于 2026-09-25 由 P10 作废**（3 个默认专家不可发布，改为服务侧自愈，见下 P10 条）。
      2. 连接器「企查查（工商信息）」（远端 `streamable-http`）显示「连接异常 0 个工具」——**升级前既有运行态**，非本次引入。
  - **P8-7 回退路径登记**：六类锚点与五步回退流程见 §5「线上回退锚点」。
  - 未执行：Session V4 后继文件的**线上实证**（需走官方写路径；本次按 §4 只读约束未触发，故线上仍为 18 个 `session.v3.jsonl.zstd` + 18 个 `session.lock`，`v4=0`）；~~4 个 broken 专家的「重新发布」动作（用户侧决策，本次不代为执行）~~ → **已于 2026-09-25 由 P10 处置**（3 个默认专家走服务侧自愈、1 个个人专家走完整发布流程，见下 P10 条；原「用户重新发布」口径随之作废）；P9 收口（证据文档、STATUS、AGENTS.md 基线、模块版本与门禁）。
- [x] P9 收口：证据文档 + 基线表述 + 模块版本 + 门禁（2026-09-25）
  - **P9-1 证据文档**：新建 `docs/evidence/dsh-0.1.7-alpha.1-upgrade.md`（沿用 0.1.6 批次证据文档章节模板）：`依赖面（P1）`／`兼容迁移面（P2–P5）`（B1 专家预设换主、B2 Session V4 读取面、B3 原生预览优先 + 安装链、B5 主题 token 词表）／`编译与运行面（P6）`／`文档镜像 delta 记账（P7）`／`线上切换与复验（P8）`／`版本与收口（P9）`／`未覆盖项与边界`（10 行表）／`回退`。
  - **模块版本裁决（2026-09-25，用户两次明确裁决）**：
    - 第一项：本批 0.1.7 适配**不整体 bump**，实际改码的 **9 个模块**（experts `alpha.8`、office `alpha.8`、projects `alpha.4`、library `alpha.3`、skills `alpha.32`、assistant `alpha.1`、workbench `alpha.16`、ui `alpha.6`、bundle `alpha.54`）折叠进**现有未发布增量**，版本号不变。
    - 第二项：复核发现 **activity `alpha.4`、connectors `alpha.2`、identity-local `alpha.5`** 三者的当前版本号**已是公开发行制品**，沿用在项目规则下构成「同版本号不同内容」的撞号；用户裁决**只 bump 这 3 个**。实际重定版：activity `0.1.0-alpha.4 → alpha.5`、connectors `0.1.0-alpha.2 → alpha.3`、identity-local `0.1.0-alpha.5 → alpha.6`。
    - **因果依据（实测）**：P1–P5 全程未改任何 `package.json` 的 `version` 行（`git diff` 对 version 行零命中），故版本裁决是 P9 新决定，而非对既有 bump 的追述。
    - **代价（已于 2026-09-25 消除）**：线上 `dsh.10ge.cn` 曾部署的 **12 个 tgz 是这三个模块重定版之前的构建**（源码相同、仅版本字段不同）；**重打包与重新部署已在 P9-R 完成**（见下条）。
  - **落点**：3 个 `package.json` 版本字段；`packages/plugins/{activity,connectors,experts,office,projects,library,skills,assistant,workbench}/CHANGELOG.md`、`packages/providers/identity-local/CHANGELOG.md`、`packages/ui/CHANGELOG.md`、`packages/bundle/CHANGELOG.md` 共 **12 个 CHANGELOG** 补 0.1.7 条目（重定版 3 个开新版本段，折叠 9 个并入现有未发布段）；`docs/MODULE-VERSIONS.md` 三行版本表 + 新增 `2026-09-25 更新` 段完整记录该决定与线上制品状态。
  - **基线表述更新（当前基线才改）**：`AGENTS.md` L8（基线 `0.1.6-alpha.2 → 0.1.7-alpha.1`，证据链接改指 0.1.7 文档并保留 alpha.1→alpha.2 旧链接）、L37（官方 Agent Teams 版本）；`docs/HARNESS-OFFICIAL-DEVELOPMENT.md` L3（适用基线）、L81（第 6 条官网差异表述）；6 个包 README 共 8 处（`bundle/README.md:3`、`skills/README.md:3,15`〔后者 Cordis `4.0.2→4.0.3`〕、`experts/README.md:3,66`、`connectors/README.md:22`〔`dsh-mcp-client@0.1.7-alpha.1`〕、`office/README.md:81`、`portal/README.md:129`）。
  - **保留清单（判定口径：已发布事实 / 设计时快照不改写）**：根 `README.md`、`README.zh-CN.md`（L32/L94/L166/L344）、`website/*.html`（已发布验证批次）、`docs/RELEASES.md`、`docs/releases/**`、各包 CHANGELOG 历史条目、`docs/STATUS.md` 历史台账条目、`docs/DSH-0.1.6-alpha.2-UPGRADE-PLAN.md`、`docs/development-order.json:86` 的 D04 note（当日门禁快照，改写会篡改历史）、`packages/plugins/activity/DESIGN.md` 设计时基线、`packages/plugins/office/README.md:130`（对已发布 Word-only prerelease 的描述）。口径与 `docs/evidence/dsh-0.1.6-alpha.2-upgrade.md:49`「已发布事实保留 / 当前基线表述才改」一致。
  - **门禁复跑（2026-09-25 实测，退出码均 0，除注明者）**：
    ```
    PASS: 31 modules; 50 documents; task references, team acceptance and relative links checked.
    check:plan EXIT=0
    PASS: 539 DSH lock entries pinned to 0.1.7-alpha.1; Cordis 4.0.3 only
    Harness documentation review: 127/176 canonical documents reviewed; 49 pending.
    TYPECHECK_EXIT=0 / BUILD_EXIT=0
    ```
    过程中一次 `check:plan EXIT=1`：先写了指向 `docs/evidence/dsh-0.1.7-alpha.1-upgrade.md` 的链接、文档尚未落盘（`Broken link in docs/MODULE-VERSIONS.md` / `Broken link in AGENTS.md`）；P9-1 证据文档落盘后复跑即 PASS，**非遗留缺陷**。
  - **未执行（登记，不得写成已完成）**：① ~~3 个重定版模块的**重打包与线上重新部署**~~ → **已于 2026-09-25 由 P9-R 完成**；② P7 遗留的 **157 个内容有变的镜像文件未逐文件复审**，`docs/research/harness-review-closure.md` 的 H01–H09 仍以 0.1.6 语料为准；③ 删 `audit:harness-docs` 的 **49 条 pending**（5 条属 0.1.7 新增规范对象 + 44 条 0.1.6 批次既有待审）——pending 非空是脚本既定语义（退出 0，不判失败）；④ Session V4 后继文件的线上写路径实证；⑤ ~~4 个 `readiness=broken` 专家的重新发布（用户侧决策）~~ → **已于 2026-09-25 由 P10 完成**（experts `α.9` 自愈 + 个人专家完整发布流程）；⑥ 提交、推送与 GitHub 同步（**未获用户授权，本批全程未做**）。
- [x] P9-R 3 个重定版模块重打包 + 线上 `dsh.10ge.cn` 重新部署与只读复验（2026-09-25）
  - **范围**：只处理重定版 3 个模块——activity `α.4→α.5`、connectors `α.2→α.3`、identity-local `α.5→α.6`；**不整体重打包 12 个 tgz**（其余 9 个模块源码与线上制品一致，且线上制品仅版本字段与本批不同）。
  - **路径**：**不换树、不动 standalone**；只改线上 profile 的 3 个 `file:` 指针 → 容器内 `pnpm install`（uid `1000:1000`、`npmmirror`）→ `docker compose restart`。与 P8-5 的 `mv` 换树 + `--force-recreate` 相比风险面更小（详见证据文档 P9-R 节）。
  - **制品**：`.artifacts/deploy-017/reversion/` 3 个 tgz + `SHA256SUMS-reversion.txt`；`diff -r` 证明差异**仅** `version` 字段 + CHANGELOG 新增（connectors 另含 `README.md:22` 的 P9 基线修正），`dist/` 逐字节相同、文件清单零增删。
  - **实测**：`PHASE1_OK`（`changed=3 file_deps=12 stale=0`、`PNPM_RC=0`、`Packages: +3 -91`、三包实装版本正确且 `dist=true`、另 9 包未变、lock 旧引用 0）；闭包门禁 `TREE_RESOLUTION_ALL_OK`（893 包 / 220 个 dsh / 版本唯一 `0.1.7-alpha.1`）；`PHASE2_OK`（`compose restart` 11s 到 healthy、`Restarts=0`、CLI `0.1.7-alpha.1`、启动错误模式 5 项全 0）；`PHASE3_OK`（4 个 loopback 服务、会话 `files=36/v3=18/v4=0/locks=18` 与换树快照 `cmp` 一致、projects state sha256 逐字节相等、属主门禁 0）；域名 302→`/portal` + `/login` 200 + `/portal` 200；10 项只读 API `P8_6_READONLY_ALL_OK` 与 P8-6 逐项相等；浏览器 `probe/pages/tabs` 三份 totals 全空。
  - **口径澄清**：`-91` 为 store 陈旧条目清理（非删依赖）；早期外壳核对的 `MISS @deepseek-ai/libreoffice-kit-linux-x64` 属误判（该包不存在，linux 平台件为 `libreoffice-kit-wasm`，在位）。
  - **新锚点**：`/home/luoji/dsh-backup-018-reversion-20260924235141`（配置 3 文件）、`/home/luoji/dsh-backup-018-restart-20260924235457`（重启前后状态与 Session 指纹）、`/home/luoji/p9r-verify/`（只读复验原始输出）、`wd-upload-017` 内旧 tgz（最小回退用）；已登记入 §5。
  - **回执**：`.artifacts/deploy-017/p9r-receipt.json`、脚本 `stage-018-reversion.sh` / `stage-018b-restart.sh` / `stage-018c-verify.sh`、门禁 `p9r-check-tree.mjs`、浏览器产物 `.artifacts/deploy-017/p9r-verify/`。
  - **未执行**：Session V4 后继文件线上写路径实证、提交与推送。（4 个 broken 专家由 P10 处置，见下条。）
  - 收口后本专项 P0–P9-R 全部 `[x]`；承接的 4 个 broken 专家由 P10 收口，本专项无剩余步骤。
- [x] P10 4 个 `readiness=broken` 专家处置（experts `α.9` 自愈 + 个人专家重新发布）（2026-09-25）
  - **背景**：P8-6 F1 / P9-R 遗留的 4 个 0.1.6 时代专家 `readiness=broken`（UI「专家 preset 异常」）。复核发现其中 **3 个是内置默认专家**（需求分析顾问 / 文档评审顾问 / 工作复盘顾问），`publish()` 对 `origin === 'default'` 抛 `experts/forbidden`（`reason: 'default-immutable'`），**代码禁止重新发布**；仅 1 个个人专家（大客户经营顾问，4 技能 + 2 包资源）可按设计流程重新发布。用户裁决：3 个默认专家走**泛化过期修订重编译**，1 个个人专家由用户驱动**完整发布流程**。
  - **代码面（experts `α.8 → α.9`）**：`ensureCurrentExecutionRevision` 的入口守卫由「仅团队修订」泛化为任意 `compilerVersion` 过期的已发布修订；新增 `ensureCompilerCurrent()`，在 `[Service.init]` 启动时与 `list()`／`get()` 读取前扫描全表并重编译（跳过团队成员、无 `publishedRevisionRef` 者与已为当前编译器者）。旧修订行按 ADR-0010 **保持只读不改写**，结果写成派生修订并前移 `publishedRevisionRef`，审计码 `experts/compiler-migration-succeeded`（失败记 `experts/compiler-migration-failed`，逐专家 best-effort，不阻断启动与列表）。`readExpertPreset` 仍是**永不重编译、永不改写声明**的读取器，`experts/preset-broken` 收窄为「该修订迁移未成功」。
  - **W1 个人专家重新发布（生产写入）**：线上认证用户路由 `validate → request-publish-confirmation → confirm-publish → publish` → `P10_PUBLISH_OK`；`publishedRevisionRef` `rev-6e415f237e39 → rev-1c818f86c7c3`，preset `wd-exp-expert-24abaea2f5e5-3bca3a312bfb`，`compilerVersion=workdsh-expert-compiler/0.4-declarative-presets`，readiness `missing-dependency → ready`。
  - **W2 制品与部署**：本地 `pack` → `workdsh-plugin-experts-0.1.0-alpha.9.tgz`（183343 B，`sha256=a1bddfa3…394c4e`）→ 上传 `wd-upload-017`（宿主 `sha256sum -c` OK）→ Phase 1 换指针 + 容器内 `pnpm install`（uid `1000:1000`）→ `PHASE1_OK`（`changed=1 file_deps=12 stale=0`、12 包 `dist` 齐备、`SESSIONS_UNTOUCHED_OK`、属主门禁 0）→ Phase 2 `docker compose restart`（**未换树**）→ `PHASE2_OK`。
  - **实测结果**：healthy 6s、`Restarts=0`、CLI `0.1.7-alpha.1`；启动窗口 26 行日志中 `duplicate loader entry` / `plugin tree failed to load` / `ERR_MODULE_NOT_FOUND` / `exited during startup` / `Error:` / `compiler-migration-failed` / `preset-broken` **全为 0**；派生修订 **5 → 8**（新增 3 个，零消失）、新格式预设 **1 → 4**、旧 `data/dsh/.agent-presets/wd-exp-*` **4 个目录原样保留**（`LEGACY_PRESET_DIRS_UNTOUCHED_OK`）。
  - **只读复验**：`P10_VERIFY` → `byReadiness = {ready: 4, unknown: 8}`；4 个目标专家详情权威 `readiness=ready / canUse=true`，修订为 `work-retrospective-advisor rev-7b56b723c16b`、`requirement-analysis-advisor rev-fa7f23332190`、`document-review-advisor rev-92faf4af90d7`、`expert-24abaea2f5e5 rev-1c818f86c7c3`。8 个 `unknown` 与 P8-6 基线逐项比对**部署前即为 `unknown`**（从未发布，UI 显示「未发布」），非本次回归。
  - **浏览器复验**：`P10_BROWSER_OK` —— 页头「共 12 个专家」、4 张卡片全部含「可用」徽标、`brokenCards=[]`、`expectedReadyMissing=[]`；详情「工作复盘顾问」召唤可用（`summonDisabled=false`、无 broken 提示）；`pageErrors / consoleErrors / httpFailures` 全空。
  - **门禁（改动模块实测）**：`typecheck` / `build` EXIT=0；`expert-manager` **20/20**（新增 `published revisions of an older compiler self-heal at boot and on catalog reads`）；`expert-native-presets` + `expert-results` + `expert-package-authoring` + `expert-authoring-skill` **14/14**；`check:plan` PASS（31 modules / 50 documents）；`check:versions` PASS（539 条锁 `0.1.7-alpha.1`）；`audit:harness-docs` 127/176（49 pending，既定语义）。
  - **回退锚点（已登记入 §5）**：`/home/luoji/dsh-backup-p10-experts-20260925001601`（换指针前配置 3 文件 + Session 指纹）、`/home/luoji/dsh-backup-p10-restart-20260925001658`（重启前后状态与目录指纹）；`wd-upload-017` 内 `experts α.8` 旧 tgz 保留，改回 1 个 `file:` 指针 + 重装 + 重启即可（不换树）。
  - **回执**：`.artifacts/deploy-017/p10-receipt.json`；脚本与产物 `.artifacts/deploy-017/p10-expert-repub/`（`p10-publish.mjs`、`p10-stage1-swap.sh`、`p10-stage2-restart.sh`、`p10-verify.mjs`、`p10-browser-badges.mjs`、两个 stdout、浏览器报告与 2 张截图）。
  - **清理**：SSH 转发已停、容器内回环代理进程已杀（`/proc/240` 已消失）、宿主 `data/workspace/.p10-probe/` 已删；清理后 `healthy`、`Restarts=0`、属主门禁 0、启动错误模式 0、仅剩 4 个 loopback 服务（3080/3081/3082/3083）。
  - **未执行**：Session V4 后继文件线上写路径实证、提交与推送（未获用户授权）。
