# DSH 0.1.7-alpha.1 升级证据（alpha.2 → alpha.1）

2026-09-24 至 2026-09-25 执行，工作线 `main`（HEAD `9b8215a070`，工作树含本批全部未提交改动）。设计与逐项依据见 [DSH-0.1.7-alpha.1-UPGRADE-PLAN.md](../DSH-0.1.7-alpha.1-UPGRADE-PLAN.md)；本文件记录实际命令、结果、判定口径与未覆盖边界，不重复设计理由。事实依据为 npm `0.1.7-alpha.1` 发布包、仓库内官方文档镜像 `docs/dsh-v0.1.7-alpha.1/`（tag `dsh-v0.1.7-alpha.1`，commit `c36a83ff6bb95e3f82cf79f9be7c724270a8aa61`）与本地实测。

破坏性变化摘要（迁移设计依据，详见计划 §2.1）：B1 专家预设注册表换主（`agent-presets` 拆为 `dsh-agent-preset` + `dsh-agent-preset-registry`，注册/释放归官方 `ctx.agentPresets`）；B2 Session 持久化格式 V4（新增迁移包 `dsh-session-format-v3-to-v4`）；B3 官方原生预览优先（自建预览退到 builtin 备选位）；B4 工作过程与 Team 面板由原生拥有；B5 主题语义 token 词表统一 `--dsw-alias-*`；B6 安装链要求 Profile 与 CLI 共用同一物理 app-boot 模块。

## 依赖面（P1）

命令：P0 快照 24 个版本承载文件到 `.artifacts/dsh-0.1.7-alpha.1-upgrade/backup/` + `backup-manifest.sha256` → 全量替换 → `corepack pnpm install --no-frozen-lockfile` → `check:versions`。

- 根 `devDependencies` 21 条、`pnpm.overrides` 257 → **284 条**、17 个模块 `package.json`、脚本与测试引用全量精确锁定 `0.1.7-alpha.1`。
- 改名 1 条：`@deepseek-ai/dsh-agent-presets` 按官方移除，改由 `@deepseek-ai/dsh-agent-preset`（声明式预设行）+ `@deepseek-ai/dsh-agent-preset-registry`（服务名 `agentPresets`）承载；`@deepseek-ai/dsh-web-app`（`dsh.bundle.patch` 五文件）作为 preset 承载层进入根依赖。
- 版本族外：Cordis `4.0.2` → **`4.0.3`**，伴生包按批次逐条 override 钉版（`include@1.0.8`、`timer@1.1.5`、`loader@1.0.4`、`group@1.0.3`、`schemastery@3.18.3`）。
- 结果：`check:versions` → **PASS: 539 DSH lock entries pinned to 0.1.7-alpha.1; Cordis 4.0.3 only**。
- 未混搭：`dist-tags` 中 `alpha` 指向 `0.1.7-alpha.2`、`next` 指向 `0.1.7-rc.1`，本批只锁 `alpha.1`。

## 兼容迁移面（P2–P5）

### B1 专家预设（P2）

- `experts/src/runtime/preset-compiler.ts` 改经官方 `AgentPresetRegistry.register` 注册并由 `ctx.effect` 释放；基线预设从 Loader 条目 + 官方 `@deepseek-ai/dsh-agent-preset` 解析。`experts-manager.ts` 的 `resolve('standard')` / `list()` 改读官方注册表；`index.ts` 把 `agentPresets` 纳入必需注入。
- 退出证据：`node --test tests/integration/expert-manager.test.mjs tests/integration/expert-native-presets.test.mjs tests/integration/expert-results.test.mjs` → **25 tests / 25 pass / 0 fail**（含预设编译同内容复用、跨重启绑定、原生 Slot 名单过滤、professional 结果判定）。

### B2 Session V4 读取面（P3）

- `activity` 事件投影按 V4 改写：`tool/result` 改读一等 tool 消息的 `message.toolCallId` / `message.isError`（官方 `ContentBlockMap` 已移除 `tool-result` 块）；子代理观测从已移除的 `subagentsByParent` / `refreshSubagents` 改读 `SessionListState.projectionsBySession[root].values.subagentCatalog` 配合 `sessions.refreshProjections`。探针、脚本与集成测试里 `session.v3.jsonl.zstd` 全量改 `.v4.`。
- `projects` / `library` 绑定复核：`deliverable-attribution.ts` 只读 `event.data.files` 与 `session.header.cwd`，V4 下无破坏点。
- 退出证据：`activity` build PASS、`projection.test.mjs` **14/14 pass**、`skill-session` + `skill-persistence` **5/5 pass**、`probe:activity` 正例与 `--disabled` 反例均 PASS。
- 迁移机制（读自发布包与镜像 `persistence-changes/2026-09-16-session-format-v4.zh.md`）：经 `dsh-session-format-catalog` 注册 `v3→v4`，**只读 open 只在内存准备、写 open 才发布后继 generation**。

### B3 原生预览优先 + 安装链（P4）

- `office/src/client.tsx` 两处 `documentPreviews.register`（`workdsh-office`、`workdsh-office-csv`）声明 `priority: "builtin"`；同档候选按注册顺序，官方 bundle 先注册，故官方原生预览恒为 `candidates[0]`，WorkDSH 编辑器保留为「打开方式」下拉备选（风险表第 3 行「保留编辑入口」据此满足，与另一条线整体删除 CSV 注册的做法不同）。
- `install-preview.mjs` 把根 `pnpm.overrides`（279 条）投影进 Preview Profile 的 `pnpm-workspace.yaml`：Profile 内安装不继承工作区 overrides，caret 链会在镜像站浮到 `0.1.7-rc.2` 并索取未发布的 `dsh-sdk-jsonrpc-server@0.1.7-rc.2`（`ERR_PNPM_NO_MATCHING_VERSION`）。随后断言 launcher 与 `dsh-config-editor` 解析同一物理 `dsh-app-boot`。
- 退出证据：`probe:office:native` **14 条断言全 PASS**（`browserErrors`/`diagnostics` 空）、`probe:office:word-only` **4 PASS**、`test:office:csv` **2/2**、`test:office:content` **21/21**；`preview:install` EXIT=0（Profile 内 258 个 `@deepseek-ai` 包无 rc 残留）；新增 `probe:settings` **PASS**（`settings/describe` 报 `writable`、`ui-theme.fontSize` 往返 `applies: live`）。

### B5 主题 token 词表（P5）

- 词表真源：`.test-runtime/preview/profiles/preview/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js`（根 overrides 钉 `0.1.7-alpha.1`，探针启动前断言版本）。解析出 **361 个 `--dsw-*` 名字**：light 基态 **361 条声明**（357 在裸 `body`、4 个 elevation 在 `body,body *`），`body[data-ds-dark-theme]` 块 **168 条只做 override**——dark 只覆盖、light 级联生效，故裸 `var()` 只需 light 基态有声明即可两主题存活，这是本次去 fallback 的前置条件。
- 词表外 8 个名字全部替换为官方语义变量，旧名连 fallback 一起删：`--dsw-bg-default`→`--dsw-alias-bg-base`、`--dsw-bg-elevated`→`--dsw-alias-bg-layer-1`、`--dsw-bg-subtle`→`--dsw-alias-bg-module-platform`、`--dsw-bg-hover`→`--dsw-alias-interactive-bg-hover`、`--dsw-border-default`→`--dsw-alias-border-l2`（`1px` 边框同步改 `.5px` 对齐 0.1.7 亚像素描边）、`--dsw-fg-default`→`--dsw-alias-label-primary`、`--dsw-fg-muted`→`--dsw-alias-label-secondary`。
- `--dsw-alias-fill-tsp-secondary` 为**上游自身缺陷**：`dsh-client-ui-agent-preset/lib/client.js` 引用了 `dsh-client-ui-theme` 从未声明的 token（theme 包内该名字出现 0 次），裸 `var()` 在 computed-value 阶段被丢弃；处置为删除该声明改 `background: transparent`，不计入本仓库词表。
- 全仓 fallback 清零：`var(--dsw-*,<fallback>)` **852 处 / 15 文件**（experts 191、skills 146、projects 144、library 84、connectors 65、assistant 57、ui/navigation 34、ConnectorPicker 33、workbench 31、office/csv.css 27、activity 25、ui/modal 8、LibrarySelectionChips 4、LibraryPicker 2、TaskExecutionNotice 1）收敛为裸 `var(--dsw-name)`；改写采用 paren-aware 扫描，只删 fallback、不动其它任何字符。
- 等价性复核：`git diff -U0` 逐 hunk 比对「`-` 行剥 fallback 后是否等于 `+` 行」→ **checked 262 changed lines, 0 not explained by fallback removal**。
- 新增门禁 `corepack pnpm probe:theme`（`scripts/probe-theme.mjs`）双向断言，退出码 0：**Static 887 fallback-free `var(--dsw-*)` references across 232 files, all declared by the 0.1.7-alpha.1 palette (361 names, 361 base declarations)**；**Live** `ui-theme.preference` light → dark → system 往返，`body[data-ds-dark-theme]`、`html color-scheme` 与 19 个采样 token 与官方调色板逐项相等。回执 `.artifacts/theme/result.json`：`vocabulary 361`、`scannedFiles 232`、`references 887`、`unknown 0`、`undeclared 0`。
- office 文档纸色豁免：`office/src/live/style.ts` 的 `.wd-office-paper` 及其正文/表格/图表/图片手柄保留固定色值（`.docx` 两主题下都是白纸，重新着色会破坏 WYSIWYG），头注释明示「these literals are content, not theme」。

## 编译与运行面（P6）

- 静态（`.artifacts/p6-static-verify.log`，逐步骤退出码）：`build`=0、`typecheck`=0、`check:plan`=0（`31 modules; 50 documents`）、`check:versions`=0、`test:planning`=0。`check:acceptance P1`=1 属相位门禁预期（`P1 gate: 42 unfinished cases (includes previous phases)`），非回归。
- 单测（`.artifacts/p6-tests.log`、`p6-pkg-tests.log`）：**185 tests / 185 pass / 0 fail**——`test:integration` 110、`test:activity` 14、`test:office:content` 21、`test:office:csv` 2、`test:skill-quality` 3、`test:remote:lifecycle` 4、`test:library` 5、`test:projects` 10、`test:assistant` 4、`portal` 12。
- 预览安装（`.artifacts/p6-preview-install.log`）：`preview:install` EXIT=0；八层官方 Profile 独立安装 Skill/Expert/Connector/Office/Library/Projects/Assistant/presentation，launcher 与 settings 共用同一 `dsh-app-boot`。
- 探针批 A/B1/B2 全部 EXIT=0、0 pageerror：`probe:theme`、`probe:settings`、`probe:activity`、`probe:office:native`、`probe:office:word-only`、`probe:experts:team`（9 PASS）、`probe:experts:team:web`（15 PASS）、`probe:experts:team:resilience`（15 PASS）、`probe:experts:team:real`（真实模型两阶段官方交接）、`probe:install`、`probe:browser`、`probe:skills`、`probe:experts`、`probe:experts:official`、`probe:experts:professional`、`probe:office`、`probe:office:live`、`probe:library`、`probe:headless`（`dshVersion "0.1.7-alpha.1"`）、`probe:mcp:resources`、`probe:computer-use:native`、`probe:subagent:activation-limit`、`probe:connectors`、`probe:presets`（6 PASS + 1 OBSERVED）。
- 公开面七项逐项复核通过（计划 §2.3 表）：`conversation.session.header.actions`、`ctx.layout.selectPanel`、`PropsRuntime`、`slots.inject`、`uiWorkspace.openSession`、`sessions.retain/ready/release`、`ctx.effect/ctx.on`。
- 两处**既有探针过期**修复（`git log` 定性，非 0.1.7 回归）：`probe-browser.mjs` 断言已不存在的「助理（待开放）」行（assistant 自 `96c4ea911f` 起自持 `main` + `sidebar.panellist`，而该 Profile 的 `cordis.patch.yml` 不含 assistant），改为断言现存三条待开放项与三条缺席行；`probe-office-live.mjs` 调用 `ctx.sessions.open()`（0.1.6 与 0.1.7 的 `ISessions` 都不含 `open()`），改用官方 `ctx.uiWorkspace.openSession(sid)` 并新增 `switchToWorkdshEditor()` 适配 B3 契约。修后分别 8 PASS / 16 PASS。

## 文档镜像 delta 记账（P7）

- 整批替换为 tag `dsh-v0.1.7-alpha.1` 的仓库根 `docs/` 子树（排除 `native/system/docs/`，与 0.1.6 批次同口径）：`docs/dsh-v0.1.7-alpha.1/` = **562 文件 / 347 md / 8 子目录**。旧镜像 `docs/dsh-v0.1.6-alpha.2/`（543 文件 / 337 md）保留为历史语料，不删除、不改写。
- 语料差异（逐文件 `comm` + `cmp`）：**0 删除、19 新增、157 个共有文件内容有变**。新增为 `persistence-changes/2026-09-16-session-format-v4.*`、`2026-09-20-unknown-child-catalog.*`、`finalized/v4.json`、`historical-formats/v3.*`、`subsystems/product-telemetry.*`、`subsystems/voice-input.*` 四件套；内容变化集中在会话 V4、流式/二进制 Remote（`api-gateway.zh.md` 新增 `@Remote({ mode: 'stream' })`）、账号与设置页、语音输入、产品遥测、样式 token 与开发工作流。
- 引用重锚：镜像路径 token `docs/dsh-v0.1.6-alpha.2` → `docs/dsh-v0.1.7-alpha.1`，**41 文件 78 处**；抽出 93 个唯一镜像相对路径逐个 `test -e`，**0 missing**。行号重锚（d07 证据 5 处）：`slots.md:25-41→27-43`、`:150→158`、`persistence-catalog.md:473-477→475-479`、`tool-catalog.md:624-630→629-635`、`tool-catalog.md:25` 不变。
- 文档门禁：`docs/research/deepseek-harness-review.json` 的 `corpusRoot` → `docs/dsh-v0.1.7-alpha.1`，`reviewed` 127 条不变（0.1.7 为超集且 0 删除）。`corepack pnpm audit:harness-docs` EXIT=0：`127/176 canonical documents reviewed; 49 pending`；canonical 171 → 176（+5 条 0.1.7 新增规范对象），pending 44 → 49。

## 线上切换与复验（P8）

线上容器 `dsh`（1Panel `deepseek-harness`，宿主 `192.168.11.205`）已从 `0.1.6-alpha.2` 切到 `0.1.7-alpha.1`。全程按计划 §4 只读约束复验，未触发 Session 写路径。逐项细节见计划 §7 P8 条与 [STATUS 2026-09-25（续十八）](../STATUS.md)，回执与截图见 `.artifacts/deploy-017/`。

- P8-1 升级前全量备份（宿主 `/home/luoji/dsh-backup-017-20260924225010/`）：`baseline.txt`（`cli_version=0.1.6-alpha.2`、`sessions_v3=18`、`sessions_v4=0`、`storages/workdsh_{projects=1,library=1,experts=4,connectors=2,assistant=1,audit=1,office=1}`、`profile_deps=16`、`profile_bundles=14`）+ `profile-config.tgz` + `sessions.tgz` + `storages.tgz` + `SHA256SUMS.txt`。
- P8-2 本地 pack **12 包**（`workdsh-bundle` + 10 个 `workdsh-plugin-*` + `workdsh-provider-identity-local`）。
- P8-3 暂存 CLI 两处实测修正：① overrides（279 条）必须写进 `pnpm-workspace.yaml`，写在 `package.json` 的 `pnpm.overrides` 会被忽略 → 闭包浮到 `0.1.7-rc.1`；② 不可关 `autoInstallPeers`——`dsh-app-boot` 把 `cordis-plugin-group` 声明为 peer，关掉后整棵缺席、`node lib/bin.js --version` 直接 `ERR_MODULE_NOT_FOUND`。
- P8-4 副本上离线验证 V3→V4（只读、不启动 App、不发布后继）：`summary{total:18, migrated:18, failed:0}`、`problems:[]`、`catalogCurrentVersion=4`、`historicalCatalogCurrentVersion=3`、逐条 `roundTripOk=true`。
- P8-5 两阶段切换：Phase 1 备份 + Profile 4 个官方依赖 bump + 12 个 workdsh tgz 重指 + overrides 投影 + `pnpm install`（`PHASE1_OK`）；Phase 2 `mv` 原子换树 + 对新 standalone 与 profile 各自持有的 `dsh-client-connection` 重打 auth-bypass + 按真实挂载路径硬门禁 + `docker compose up -d --force-recreate`（bind mount 在创建时按路径解析，`restart` 不重新解析）→ `PHASE2_OK`、`Up (healthy)`、`Restarts=0`。
- P8-6 只读复验（回执 `p8-6-receipt.json`）：`health=healthy`、`restarts=0`、换树后 6 项错误模式计数 **0**；监听仅 4 个 loopback 服务 + docker DNS；属主门禁 `! -user 1000` = **0**；域名 `https://dsh.10ge.cn/` = **302 → `/portal`**（200）、`/login` 200；会话面 `files=36 / v3=18 / v4=0 / locks=18` 且与切换后快照 `cmp` 一致（`SESSIONS_UNCHANGED_SINCE_SWAP_OK`）；数据面顶层条目与备份完全一致，文件数 32341 → 32365 **全为新增、无删除无改写**，`workdsh_projects/states/local-personal_local-user.json` sha256 与备份**逐字节相等**；功能面 10 项只读 API `P8_6_READONLY_ALL_OK`（`experts/list` 12、`projects/templates` 15、`library/list` 3、`skills/list` 34、`connectors/list` 3 等）；浏览器面 `P8_6_BROWSER_CLEAN_OK` / `P8_6_PAGES_CLEAN_OK` / `P8_6_TABS_CLEAN_OK`，三份 totals 均 `pageErrors/consoleErrors/httpFailures: []`。
- 已定性的预期行为（非回归）：4 个 0.1.6 时代发布的专家 `readiness=broken`（UI「专家 preset 异常」），根因是 B1 契约换主——`revision.presetRevisionRef` 指向旧 `wd-exp-*`，0.1.7 新路径 `$DSH_AGENTS_HOME/.workdsh-state/experts/presets/<id>/preset.json` 下无对应文件 → `readExpertPreset()` 遇 `ENOENT` 抛 `experts/preset-broken` → `readinessMap()` 判 `broken`；旧制品 `/data/dsh/.agent-presets/wd-exp-*/` 只读保留，新旧 dist 对照证明是契约换主而非部署失误，**数据无损**。属 §6 风险表第 1 行已登记的缓解路径（**该行口径已于 2026-09-25 由 P10 改写**——3 个默认专家不可发布，改为服务侧自愈，见「4 个 `readiness=broken` 专家处置（P10）」节）。
- 另一项既有运行态：连接器「企查查（工商信息）」显示「连接异常 0 个工具」，升级前既有，非本次引入。
- 复验用只读回环代理（容器 `172.19.0.3:3080` → `127.0.0.1:3080`）绕过门户外壳 302；**复验后代理进程与全部临时文件已清理**，属主门禁复跑仍为 0、容器 `restarts=0`。

## 版本与收口（P9）

- **模块版本裁决（用户 2026-09-25 明确选择）**：本批**不整体 bump**。
  - 折叠进现有未发布增量（版本号不变，仅加 CHANGELOG 条目）：experts `α.8`、office `α.8`、projects `α.4`、library `α.3`、skills `α.32`、assistant `α.1`、workbench `α.16`、ui `α.6`、bundle `α.54`——它们的当前版本号本就高于公开发行版本，单独 bump 会让仓库版本号与线上已部署制品脱节。
  - 重定版 3 个：**activity `α.4→α.5`**、**connectors `α.2→α.3`**、**identity-local `α.5→α.6`**——这三个模块的原版本号已是公开发行制品（`v0.1.0-alpha.7` 批次 / 2026-09-15 专家发行附件），沿用会把不同内容挂在同一版本号上，按本项目「撞号必须重新定版」规则处置。
  - 代价已于 2026-09-25 消除：线上 `dsh.10ge.cn` 曾部署的 12 个 tgz 是这三个模块**重定版之前**的构建（源码相同、仅版本字段不同）；**已完成重打包与线上重新部署**，见下节「重定版再部署与只读复验（P9-R）」。
- `docs/MODULE-VERSIONS.md` 当前版本表同步三个重定版行，并新增 2026-09-25 条目记录上述裁决。
- 基线表述更新（消除「镜像路径已 0.1.7 / 基线版本号仍 0.1.6」的不一致）：`AGENTS.md` 第 2 条基线声明与第 37 行官方 Agent Teams 版本引用、`docs/HARNESS-OFFICIAL-DEVELOPMENT.md:3,81`；包 README 的**当前基线表述**：`packages/bundle/README.md:3`、`packages/plugins/skills/README.md:3,15`（Cordis `4.0.2`→`4.0.3`）、`packages/plugins/experts/README.md:3,66`（同时把候选版本号 `α.7`→`α.8`）、`packages/plugins/connectors/README.md:22`、`packages/plugins/office/README.md:81`、`packages/portal/README.md:129`。
- **保留清单（判定口径：「当前基线表述」改，「事实对象 / 已发布历史」不改，与 0.1.6 批次 `docs/evidence/dsh-0.1.6-alpha.2-upgrade.md` 第 49 行口径一致）**：
  - 根 `README.md` / `README.zh-CN.md` 的 L32/L94/L166/L344 与 `website/*.html`：描述的是**已发布验证批次**（公开发行仍为 `v0.1.0-alpha.7`，其制品按当时的客户端面构建），随下次发布批次更新。
  - `docs/RELEASES.md`、`docs/releases/**`、各包 `CHANGELOG.md` 的历史条目、`docs/STATUS.md` 历史台账、`docs/DSH-0.1.6-alpha.2-UPGRADE-PLAN.md`、本文件与 0.1.6 证据文档自身——均为已发布事实或历史记录。
  - `docs/development-order.json` 第 86 行 D04 note 内 `check:versions PASS 513 条 … 0.1.6-alpha.2`：该 note 是 2026-09-22 当日门禁的**快照记录**，改写会篡改历史，不改；当前值见本节门禁结果。
  - `packages/plugins/activity/DESIGN.md` 的设计时基线表述（「基线 0.1.6-alpha.1」）与 `packages/plugins/office/README.md:130` 对已发布 Word-only prerelease（`office-v0.1.0-alpha.1`，面向 0.1.6-alpha.1）的制品描述，均为设计/发布时点事实。
- 门禁复跑（P9 实测，逐项退出码）：见下节。

## 重定版再部署与只读复验（P9-R）

承接 P9 收口登记为「未执行」的第 ① 项，2026-09-25 完成 3 个重定版模块的重打包与线上重新部署。全程**不改锁版本**（仍 `@deepseek-ai/dsh@0.1.7-alpha.1`、Cordis `4.0.3`），**不换树、不动 standalone**；与 P8-5 的 `mv` 换树 + `--force-recreate` 相比，本次只改线上 profile 的 3 个 `file:` 指针 + 容器内 `pnpm install` + `restart`，风险面更小。回执与原始输出见 `.artifacts/deploy-017/p9r-receipt.json`、`.artifacts/deploy-017/p9r-verify/`。

| 模块 | 版本变化 | bytes | sha256 |
| --- | --- | --- | --- |
| `workdsh-plugin-activity` | `α.4 → α.5` | 28183 | `94fd3509ace2e993ef9a341048234199d06f4791a5a21e70337b897a2dfabb1b` |
| `workdsh-plugin-connectors` | `α.2 → α.3` | 35026 | `cd832042c86bc5b061900178d1f6643d5f255c44126660918ab50f4d1aef369b` |
| `workdsh-provider-identity-local` | `α.5 → α.6` | 6869 | `efeb69cf9757c5e844180309dc240e4af5bf8555ddc2037ea8341984601be3cc` |

- **新旧制品比对**：解包后 `diff -r` 证明差异**仅** `package.json` 的 `version` 字段 + 新增 `CHANGELOG` 条目；`connectors` 另含 `README.md:22` 的 `dsh-mcp-client@0.1.6-alpha.2`→`0.1.7-alpha.1`（P9 基线表述修正）。`dist/` 全部**逐字节相同**，文件清单零增删——即本次线上重部署**不引入任何行为变化**。
- **Phase 1 安装**（`stage-018-reversion.sh`）：备份 `/home/luoji/dsh-backup-018-reversion-20260924235141`（`package.json` / `pnpm-lock.yaml` / `pnpm-workspace.yaml` + 前后 Session 指纹）；3 个 tgz 上传至 `wd-upload-017` 后 `sha256sum -c` **3/3 OK**（旧 tgz 保留供回退）；`changed=3 file_deps=12 stale=0`；容器内 `pnpm install`（uid `1000:1000`、`npmmirror`）`PNPM_RC=0`、`Packages: +3 -91`；实装 activity `α.5` / connectors `α.3` / identity-local `α.6`（均 `dist=true`），另 9 个 workdsh 包版本未变；`pnpm-lock.yaml` 内旧版本引用数 **0**；`SESSIONS_UNTOUCHED_OK`；属主门禁 0。`PHASE1_OK`。
- **闭包解析门禁**（`p9r-check-tree.mjs`，自 profile 16 条依赖逐包展开）：resolved **893** 包（其中 `@deepseek-ai/dsh*` **220** 个），`dsh versions: ["0.1.7-alpha.1"]`，12 个 workdsh 包版本全对，`missingRequired=0`，`TREE_RESOLUTION_ALL_OK`。peer 缺口 157 条、可选/平台件缺席 88 条均为**非致命**（`optionalDependencies` 里非 linux-x64 平台件本就该缺席；客户端 peer 由 Host standalone 树满足）。
- **两处口径澄清**（避免后续误判）：① `Packages: +3 -91` 的 `-91` 是 store 陈旧条目清理，不是本次删除依赖——闭包门禁 893 包全解析、dsh 版本唯一、12 个 workdsh 版本全对可证；② 早期外壳核对出现的 `MISS @deepseek-ai/libreoffice-kit-linux-x64` 属**误判**：该包并不存在，`libreoffice-kit@0.0.1` 只声明 `-darwin-x64 / -darwin-arm64 / -win32-arm64 / -win32-x64 / -wasm` 五个可选件，linux 平台件是 `libreoffice-kit-wasm`（在位）。
- **Phase 2 重启**（`stage-018b-restart.sh`）：`docker compose restart`（**未换树**），11s 到 `running/healthy`，`Restarts=0`，`StartedAt=2026-09-24T23:54:57.85073513Z`；`dsh --version` = `0.1.7-alpha.1`；本次启动窗口 `duplicate loader entry` / `plugin tree failed to load` / `ERR_MODULE_NOT_FOUND` / `exited during startup` / `Error:` 计数**全为 0**；3 个重定版包实装版本复核一致；`SESSIONS_UNTOUCHED_OK`；属主门禁 0。`PHASE2_OK`。
- **Phase 3 只读复验**（`stage-018c-verify.sh` → `/home/luoji/p9r-verify/`）：4 个监听服务俱在（`127.0.0.1:3080` dsh web / `3081` sse-keepalive / `3082` survey / `3083` portal，`accounts=2`）；会话面 `files=36 / v3=18 / v4=0 / locks=18`，与换树快照 `cmp` 一致（`SESSIONS_UNCHANGED_SINCE_SWAP_OK`）；数据面 `fileCount=32366`，`workdsh_projects/states/local-personal_local-user.json` sha256 `68e2ee76…bec4b5` 与基线**逐字节相等**；属主门禁 0；启动错误模式 6 项全 0。`PHASE3_OK`。
- **域名面**：`https://dsh.10ge.cn/` = **302 → `/portal`**、`/login` **200**、`/portal` **200**，`server: cloudflare`，无 `WWW-Authenticate`——与 P8-6 基线一致。
- **功能面**：沿用 P8-6 同一脚本与口径的 10 项只读 API 复跑 `P8_6_READONLY_ALL_OK`（`experts/list` 12 / `projects/list` 0 / `projects/templates` 15 / `library/space` 1 / `library/list` 3 / `skills/list` 34 / `skills/catalog` 1 / `connectors/list` 3 / `assistant/list` 0），**逐项与 P8-6 相等**。
- **浏览器面**：沿用 P8-6 同款 `probe / pages / tabs` 三脚本（经容器内只读回环代理 `172.19.0.3:3080 → 127.0.0.1:3080`，对外地址 `127.0.0.1:13080`，本地 SSH 转发接入），三份 totals 均 `pageErrors: [] / consoleErrors: [] / httpFailures: []`（`P8_6_BROWSER_CLEAN_OK` / `P8_6_PAGES_CLEAN_OK` / `P8_6_TABS_CLEAN_OK`）；4 个业务页（项目 / 资料库 / 专家·技能·连接器 / 助理）与 2 个页签（专家 / 连接器）全部打开且零新增错误；截图 7 张存 `.artifacts/deploy-017/p9r-verify/`。
- **清理**：回环代理进程已杀、容器 `tmp` 内 3 个临时文件与宿主 2 个临时脚本已删、SSH 转发已停；清理后属主门禁 0、`Restarts=0`、容器内仅剩 4 个 loopback 服务。
- **未执行**：Session V4 后继文件的线上写路径实证、提交与推送。（4 个 `readiness=broken` 专家的处置已于 2026-09-25 由 P10 完成，见下节。）

## 4 个 `readiness=broken` 专家处置（P10）

承接 P8-6 F1 / P9-R 登记为「未执行」的 4 个 broken 专家。复核发现它们并非同一类：**3 个是内置默认专家**（需求分析顾问 / 文档评审顾问 / 工作复盘顾问），`publish()` 对 `origin === 'default'` 抛 `experts/forbidden`（`reason: 'default-immutable'`）——**代码禁止重新发布**，故 P8-6 原处置「用户重新发布后即可用」对它们不成立；**1 个是可发布个人专家**（大客户经营顾问，4 技能 + 2 包资源）。用户 2026-09-25 裁决：前者走泛化过期修订重编译（服务侧自愈），后者由用户驱动完整发布流程。

路径与 P9-R 同构：**不改锁版本**（仍 `0.1.7-alpha.1`、Cordis `4.0.3`），**不换树、不动 standalone**，只改线上 profile 的 1 个 `file:` 指针 + 容器内 `pnpm install` + `restart`。回执与原始输出见 `.artifacts/deploy-017/p10-receipt.json`、`.artifacts/deploy-017/p10-expert-repub/`。

- **W1 可发布个人专家按设计流程重新发布（生产写入）**：线上认证用户路由 `validate → request-publish-confirmation → confirm-publish → publish` → **`P10_PUBLISH_OK`**。`publishedRevisionRef` `rev-6e415f237e39 → rev-1c818f86c7c3`，`presetRevisionRef=wd-exp-expert-24abaea2f5e5-3bca3a312bfb`，`compilerVersion=workdsh-expert-compiler/0.4-declarative-presets`，readiness `missing-dependency → ready`（`validate` 报 `publishable=true`、`issues=[]`）。
- **W2 代码：过期修订自愈（experts `α.8 → α.9`）**：`ensureCurrentExecutionRevision` 的入口守卫由「仅团队修订」泛化为任意 `compilerVersion` 过期的已发布修订；新增 `ensureCompilerCurrent()`，在 `[Service.init]` 启动时与 `list()`／`get()` 读取前扫描全表并重编译（跳过团队成员、无 `publishedRevisionRef` 者、已为当前编译器者）。旧修订行按 [ADR-0010](../adr/0010-immutable-preset-revisions.md) **保持只读不改写**，结果写成派生修订并前移发布指针，审计码 `experts/compiler-migration-succeeded`（失败记 `experts/compiler-migration-failed`，逐专家 best-effort，不阻断启动与列表）。`readExpertPreset` 仍是**永不重编译、永不改写声明**的读取器；仍收到 `experts/preset-broken` 即表示该修订迁移未成功，**不回退成默认组合**。默认专家的 `publish()` 被 `default-immutable` 拒绝，此前无恢复路径，现在与个人专家走同一自愈路径。
- **制品与部署**：`workdsh-plugin-experts-0.1.0-alpha.9.tgz`（183343 B，`sha256=a1bddfa3da8f326b0aeac2f470743020bd9461bb82a47dd4f4117d8f49394c4e`）→ 上传 `wd-upload-017`（宿主 `sha256sum -c` OK）→ **Phase 1**（`p10-stage1-swap.sh`）→ `PHASE1_OK`：备份 `/home/luoji/dsh-backup-p10-experts-20260925001601`；`changed=1 file_deps=12 stale=0`；容器内 `pnpm install`（uid `1000:1000`）后 12 个 workdsh 包 `dist=true` 齐备；`SESSIONS_UNTOUCHED_OK`；属主门禁 0。
- **Phase 2 重启**（`p10-stage2-restart.sh`）→ `PHASE2_OK`：`docker compose restart`（**未换树**），6s 到 `running/healthy`，`Restarts=0`，`StartedAt=2026-09-25T00:16:59.429299794Z`，`dsh --version = 0.1.7-alpha.1`；启动窗口 26 行日志中 `duplicate loader entry` / `plugin tree failed to load` / `ERR_MODULE_NOT_FOUND` / `exited during startup` / `Error:` / `compiler-migration-failed` / `preset-broken` **全为 0**；派生修订 **5 → 8**（新增 `document-review-advisor rev-92faf4af90d7`、`requirement-analysis-advisor rev-fa7f23332190`、`work-retrospective-advisor rev-7b56b723c16b`，**零消失**）、新格式预设 **1 → 4**、旧 `data/dsh/.agent-presets/wd-exp-*` **4 个目录原样保留**（`LEGACY_PRESET_DIRS_UNTOUCHED_OK`）、`SESSIONS_UNTOUCHED_OK`、属主门禁 0。
- **只读复验**（`p10-verify.mjs`）：`byReadiness = {ready: 4, unknown: 8}`；4 个目标专家详情权威 `readiness=ready / canUse=true`，`compiler=0.4-declarative-presets`。8 个 `unknown` 与 `p8-6-experts-readiness.json` / `p8-6-receipt.json` 基线逐项比对，**部署前即为 `unknown`**（从未发布过，UI 显示「未发布」），非本次回归。
- **浏览器复验**（`p10-browser-badges.mjs`，经容器内只读回环代理 + SSH 转发）→ `P10_BROWSER_OK`：页头「共 12 个专家」、4 张卡片全部含「可用」徽标、`brokenCards=[]`、`expectedReadyMissing=[]`；详情「工作复盘顾问」召唤按钮可用（`summonDisabled=false`、无 broken 提示）；`pageErrors / consoleErrors / httpFailures` 全空。报告与 2 张截图存 `.artifacts/deploy-017/p10-expert-repub/`。
- **门禁（改动模块实测）**：`typecheck` / `build` EXIT=0；`expert-manager` **20/20**（新增 `published revisions of an older compiler self-heal at boot and on catalog reads`，覆盖个人专家、默认专家冷启动与不可重建修订的 best-effort 语义）；`expert-native-presets` + `expert-results` + `expert-package-authoring` + `expert-authoring-skill` **14/14**；`check:plan` PASS（31 modules / 50 documents）；`check:versions` PASS（539 条锁 `0.1.7-alpha.1`）；`audit:harness-docs` 127/176（49 pending，脚本既定语义）。
- **口径推翻（本批需注意的三处旧表述）**：① 本文件「线上切换与复验（P8）」的「属 §6 风险表第 1 行已登记的缓解路径」——风险表第 1 行已改写；② 本文件「未覆盖项」表第 4 行；③ `.artifacts/deploy-017/p8-6-receipt.json` 的 `findings[F1].disposition`（已加 `dispositionSupersededBy` 指向本节）。三处原口径「旧修订不静默重编、用户重新发布后即可用」**已作废**：默认专家不可发布，改为服务侧自愈。
- **清理**：SSH 转发已停、容器内回环代理进程已杀、宿主 `data/workspace/.p10-probe/` 已删；清理后 `healthy`、`Restarts=0`、属主门禁 0、启动错误模式 0、仅剩 4 个 loopback 服务（3080/3081/3082/3083）。
- **回退（最小回退，不换树）**：把 profile 的 experts `file:` 指针改回 `wd-upload-017` 内的 `workdsh-plugin-experts-0.1.0-alpha.8.tgz` + `pnpm install` + `restart`；配置原件在 `/home/luoji/dsh-backup-p10-experts-20260925001601`，重启前状态在 `/home/luoji/dsh-backup-p10-restart-20260925001658`。注意：回退会重新出现 4 个 broken（自愈能力随 α.8 一起消失）。
- **未执行**：Session V4 后继文件线上写路径实证、提交与推送。

## 未覆盖项与边界

| 项 | 状态与说明 |
| --- | --- |
| 157 个内容有变的镜像文件 | **未逐文件复审**。P7 只完成「语料重新定界 + 台账重锚 + 门禁」；`docs/research/harness-review-closure.md` 的 H01–H09 结论仍以 0.1.6 语料为准，需另批复审（该文件与 `deepseek-harness-capability-review.md` 已加 2026-09-24 补记） |
| `audit:harness-docs` 49 条 pending | 其中 5 条属 0.1.7 新增规范对象、44 条为 0.1.6 批次既有待审。pending 非空是脚本既定语义（退出 0，不判失败），**不表示本批已审完** |
| Session V4 后继文件的线上实证 | **未执行**。需走官方写路径；本次按计划 §4「不直接改写用户 Session 日志」未触发，故线上仍为 18 个 `session.v3.jsonl.zstd` + 18 个 `session.lock`、`v4=0`。副本上已完成 18/18 离线迁移验证 |
| 4 个 broken 专家的处置 | **已完成**（2026-09-25，见「4 个 `readiness=broken` 专家处置（P10）」）：3 个内置默认专家不可发布，由 experts `α.9` 服务侧自愈；1 个个人专家按设计流程重新发布。4 个专家现行 readiness 均为 `ready`，旧修订与旧预设目录只读保留、数据无损 |
| 3 个重定版模块的制品 | **已重打包、已重新部署**（2026-09-25，见「重定版再部署与只读复验（P9-R）」）；线上制品现为 `activity α.5` / `connectors α.3` / `identity-local α.6`，`dist/` 与重定版前逐字节相同 |
| `probe:office:live --real-model` | 在本机被环境前置阻断（探针从用户全局技能目录复制 `~/.agents/skills/officecli`，本机未安装该技能）；属环境前置缺失而非升级回归，结果不作本批证据。`switchToWorkdshEditor()` 在 realModel 分支的调用点未实测，非 realModel 分支另两处已实测通过 |
| `activity/projection.ts` 的 `kind === 'cancelled'` 启发式 | 残留未清理（P5 登记项），列后续独立任务 |
| `scripts/probe-activity.mjs` | 两处写死 `profiles/preview` 路径与 `profile='preview'`，未参数化 |
| 付费模型全量验收 | 探针混合使用真实模型与确定性断言；未逐一覆盖全部业务场景 |
| 线上企业门户口径 | 需求 302 → `/portal` 为既有设计；官方 bootstrap token 只对容器内 `127.0.0.1:3080` 直连有效 |

## 回退

- 版本面：`.artifacts/dsh-0.1.7-alpha.1-upgrade/backup/`（24 文件，含根 `package.json`、17 个模块 `package.json`、`pnpm-lock.yaml`、5 个脚本、1 个测试）+ `backup-manifest.sha256` 逐文件校验。
- 运行面：恢复备份 → `pnpm install` → `preview:install` 回 `0.1.6-alpha.2`；用户数据（sessions / library / projects storage）保留。
- 部署面：六类线上锚点与五步回退流程见计划 §5「线上回退锚点」——旧 CLI 树 `standalone.017.old.20260924231611`（实测 `0.1.6-alpha.2`）、Profile 副本 `web.bak.017.20260924231414`、重装前 `node_modules.pre017.20260924231414`、宿主三份备份目录；回退后核对 `dsh --version` 与会话数不变，Session 目录保留不动。
- 重定版面（P9-R，最小回退，不换树）：把 profile 的 3 个 `file:` 指针改回 `wd-upload-017` 内的旧 tgz（`activity α.4` / `connectors α.2` / `identity-local α.5`）+ `pnpm install` + `restart` 即可；配置原件在 `/home/luoji/dsh-backup-018-reversion-20260924235141`，重启前状态与只读复验原始输出分别在 `/home/luoji/dsh-backup-018-restart-20260924235457` 与 `/home/luoji/p9r-verify/`。
- 专家自愈面（P10，最小回退，不换树）：把 profile 的 experts `file:` 指针改回 `wd-upload-017` 内的 `workdsh-plugin-experts-0.1.0-alpha.8.tgz` + `pnpm install` + `restart` 即可；配置原件在 `/home/luoji/dsh-backup-p10-experts-20260925001601`，重启前状态在 `/home/luoji/dsh-backup-p10-restart-20260925001658`。**注意**：回退 `α.8` 会重新出现 4 个 broken 专家（自愈能力随该版本一起消失）；派生修订与已前移的发布指针已是独立落库事实，回退后按旧修订读取仍会遇 `experts/preset-broken`。
- 代码面：迁移改动集中在专家预设、activity 投影、office 预览优先级、client 样式 token 与安装脚本，边界清晰。

日期：2026-09-25。本升级完成依赖面、兼容迁移面、编译与运行面回归、文档镜像换批、线上升级复验、P9 收口（基线表述更新 + 模块版本裁决 + 3 个重定版模块重打包与线上重新部署）与 P10 收口（4 个 `readiness=broken` 专家处置：experts `α.9` 服务侧自愈 + 1 个个人专家完整发布流程）。剩余边界以「未覆盖项」表内说明为准，表中标记「未执行」的项不得计入已完成。
