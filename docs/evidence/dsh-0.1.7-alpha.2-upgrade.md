# DSH 0.1.7-alpha.2 升级证据（alpha.1 → alpha.2）

2026-09-25 执行，工作线 `main`（HEAD `9b8215a070`，工作树含 0.1.7-alpha.1 与 0.1.7-alpha.2 两批全部未提交改动）。本文件记录实际命令、结果、判定口径与未覆盖边界。事实依据为 npm `0.1.7-alpha.2` 发布包、仓库内官方文档镜像 `docs/dsh-v0.1.7-alpha.2/`（tag `dsh-v0.1.7-alpha.2`，commit `00102833dfaee1da9f48a3a8eae9d34005a75218`；上一批 tag `dsh-v0.1.7-alpha.1` = `c36a83ff6bb95e3f82cf79f9be7c724270a8aa61`）与本地实测。

批次性质：本批是**同族小版本递进**，与上一批（`0.1.6-alpha.2 → 0.1.7-alpha.1`，见 [0.1.7-alpha.1 升级证据](dsh-0.1.7-alpha.1-upgrade.md)）不同——上游全树 **0 文件删除**，仓库内 **0 处需要改代码**，兼容面为「已知默认值/契约语义变化 + 主题词表扩张」。**线上 `dsh.10ge.cn` 本批未动**（仍为 `0.1.7-alpha.1`），按用户裁决「先仓库升级批次」。

## 依赖面（P1）

命令：根与模块 `package.json` 全量替换 → `corepack pnpm install --no-frozen-lockfile` → `check:versions`。

- 实测值：根 `devDependencies` 32 条（其中 `@deepseek-ai/dsh*` **23 条**全部 `0.1.7-alpha.2`）；`pnpm.overrides` **279 条**（`@deepseek-ai/dsh*` **271 条**全部精确 `0.1.7-alpha.2` + Cordis 及 5 个伴生包 + 2 条 `prosemirror-*`）；**14 个**版本承载 `package.json`（根 + `bundle` + 11 个 `plugins/*` + `providers/identity-local`）同步替换。
- 版本族外（本批的实质变化）：Cordis `4.0.3 → 4.0.4`，伴生包按官方 alpha.2 声明逐条 override：`cordis-plugin-group 1.0.3→1.0.4`、`cordis-plugin-loader 1.0.4→1.0.5`、`cordis-plugin-include 1.0.8→1.0.9`、`cordis-plugin-timer 1.1.5→1.1.6`、`schemastery 3.18.3→3.18.4`。模块 `peerDependencies` 的 caret 同步 `^4.0.3 → ^4.0.4`（`bundle` 由 `^4.0.2` 一并前移），`packages/plugins/experts` 的 `dependencies["@deepseek-ai/cordis-plugin-loader"]` 由 `1.0.4 → 1.0.5`。
- `install` 结果：`Packages: +277 -277`，EXIT 0。已知告警不变：`Ignored build scripts: @deepseek-ai/dsh-subprocess-local@0.1.7-alpha.2`（仓库未配置 `onlyBuiltDependencies`，与 alpha.1 批次行为一致，未处置）。
- 结果：`check:versions` → **PASS: 539 DSH lock entries pinned to 0.1.7-alpha.2; Cordis 4.0.4 only**（539 与 alpha.1 批次相同，闭包条目零增删）。
- 依赖闭包：`@deepseek-ai/dsh@0.1.7-alpha.2` 依赖总数 **80 条**（与 alpha.1 相同，零增删），其中 **72 条**为精确 `0.1.7-alpha.2`；8 条非精确范围全部逐个核实已发布：`js-yaml ^4.2.0`、`commander ^15.0.0`、`node-addon-require-builtin ^0.1.6`、`@deepseek-ai/cordis ~4.0.4`、`@deepseek-ai/schemastery ~3.18.4`、`@deepseek-ai/cordis-plugin-timer ~1.1.6`、`@deepseek-ai/cordis-plugin-loader ~1.0.5`、`@deepseek-ai/cordis-plugin-include ~1.0.9`。
- **伴生包收紧证据**（本批必须同批升级的原因）：官方把 caret 收紧为 tilde——`cordis-plugin-group@1.0.3` peer `cordis ^4.0.3` / `@1.0.4` peer `cordis ~4.0.4` + `loader ~1.0.5`；`cordis-plugin-loader@1.0.4` peer `cordis ^4.0.3` / `@1.0.5` peer `cordis ~4.0.4`。仅升 Cordis 而留旧伴生包会直接 peer 冲突。另：`dsh-app-boot@0.1.7-alpha.2` 把 `cordis-plugin-group ~1.0.4` 声明为 **peer**，故 `autoInstallPeers` **不可关闭**（与 alpha.1 批次的安装链结论一致）。
- 未混搭：`alpha` dist-tag = `0.1.7-alpha.2`、`next` = `0.1.7-rc.2`、`latest` = `0.1.5-rc.3`；本批只锁 alpha 通道的 alpha.2。`dsh-sdk-jsonrpc-server@0.1.7-rc.2` 已发布，alpha.1 批次登记的 rc 通道缺口不再是阻塞项。

## 官方变化面取证（P2）

- 全树 compare（tag `dsh-v0.1.7-alpha.1` → `dsh-v0.1.7-alpha.2`）：13146 → 13244 文件，**98 新增 / 0 删除 / 771 变化**。**0 文件删除 ⇒ 无移除型破坏性变化**。变化集中在 `packages/client` 235、`.agents/notes` 60、`apps/desktop` 47、`apps/web` 43、`packages/api` 36、`packages/experimental` 35、`packages/spill` 21、`packages/session` 20、`packages/boot` 15、`packages/llm` 14、`packages/core` 14。
- docs 子树：562 → 562 文件，**0 新增 / 0 删除 / 37 内容变化**（清单见下）。**文件集合完全一致**是本批与上一批的关键区别——镜像换批不需要重锚行号，只需重锚路径 token。

## 兼容点逐条裁定

37 个内容有变的镜像文件涉及的官方行为变化，逐条核对仓库引用面后的裁定如下（全部结论均为「**0 处硬冲突、0 处需改代码**」，判定依据是同名 grep 在全仓 `packages/`、`scripts/`、`tests/` 内 0 命中）：

| # | 官方变化 | 出处 | 仓库裁定 |
| --- | --- | --- | --- |
| 1 | spill 策略默认值由 `maxInlineBytes: 50000`（UTF-8 字节）改为 `maxInlineTokens: 12500`（估算 token）；「纯文本最终结果」扩为「图文结果、含图片描述与省略提示」 | `subsystems/spill.zh.md`、`packages/bundle/base/cordis.patch.yml`（525 行中唯一 diff） | 全仓 `maxInlineBytes` / `spill-policy` 仅出现在 `pnpm-lock.yaml`、`docs/evidence/p0-published-packages.json` 与根 override 条目，**无自有 patch 覆盖 ⇒ 不改代码**。语义差异登记为已知默认值变化 |
| 2 | `ToolDefinition` 新增可选回调 `projectContent?(exec, result): ContentBlock[] \| undefined`，流水线插入 `tools/execute → projectContent → tools/post-execute`；「绝不能泄漏到模型请求」清单新增 `projectContent` | `subsystems/tools.zh.md`、`tool-execution-pipeline.zh.md` | 仓库未定义工具级 `projectContent`，也未读 `finalizeContent` ⇒ 无需改；列为**可用扩展点**（如需在工具结果进入模型前改写内容，这是官方公开面） |
| 3 | 新增服务 `ctx.pluginRegistryProbe`（`PluginRegistryProbe`，`@Remote async fastest()`，Host 侧并发竞速 npm 与 npmmirror HTTPS ping） | `subsystems/boot.zh.md`、`capability-seams.zh.md` | 仓库未引用 `pluginRegistryProbe` ⇒ 无需改 |
| 4 | 新增 `@deepseek-ai/dsh-client-ui-plugin-manager` 的 `Config`（`registryProbeEnabled` / `registryProbeTimeoutMs` / `registryProbeCacheTtlMs`），该包从「未纳入 config 目录」列表中移出 | `config-catalog.zh.md` | 仓库未引用该包配置 ⇒ 无需改 |
| 5 | `maxConsecutiveWakes` 语义变化：原「默认 3」，现「缺省即每次空闲完成都唤醒其属主」，设为非缺省才限制自激链 | `config-catalog.zh.md` | 仓库未设置该项 ⇒ 无需改。**若未来依赖唤醒上限，必须显式配置**，不能沿用「默认 3」的旧理解 |
| 6 | `desktopPlatform` 注释由「null omits the client platform header」改为「null identifies the client as web」 | `config-catalog.zh.md` | 仓库未引用 ⇒ 无需改 |
| 7 | 自定义模型 API 协议的存储位置由 `settings.yaml` 改为**当前 profile 的 `cordis.patch.yml`**；并明确 `dsh web` 下 `<profile>` 即 `web`，完整路径 `$DSH_HOME/profiles/web/cordis.patch.yml` | `user/guide/providers.zh.md` | 仓库不写 `settings.yaml` 配置模型 ⇒ 无需改。登记为部署侧口径（改模型协议应落 `cordis.patch.yml`） |
| 8 | `workspace:^` → `workspace:*`（typert-protocol 引用） | `cookbook/adding-a-remote-api.zh.md` | 仓库无 `workspace:^` 用法 ⇒ 无需改 |
| 9 | `spill-policy` 依赖集由 `llm/output-retention/session/spill/tools` 扩为 `attachment/fs/llm/output-retention/session/spill/token-meter/tools` | `module-graph.zh.md` | 官方内部拓扑，仓库不装配 ⇒ 无需改 |
| 10 | `api-session/*` 五条事件在 `packages/api/session-controller/src/types.ts` 的行号整体平移（603→609、583→589、610→616、589→595、596→602） | `event-producer-consumer.zh.md` | 仓库按事件名订阅，不按行号 ⇒ 无需改；文档引用若需精确锚点须用新行号 |
| 11 | `packages/core/tools/src/index.ts` 行号 689 → 699 | `persistence-catalog.zh.md`、`persistence-schema.json` | 同上，仓库不按行号引用 ⇒ 无需改 |
| 12 | 新增 `client-ui-plugin-manager` 包节点与 `ctx.pluginRegistryProbe` 服务节点及三条边 | `capability-seams.zh.md` | 只读参考 ⇒ 无需改 |
| 13 | 依赖 range 段落改写为「Workspace 清单使用 `workspace:` 协议；仓库规则区分精确的 DSH 引用与 vendor/native tilde 范围」 | `rescope.zh.md` | 与 WorkDSH 现行做法（DSH 精确锁、vendor 用 tilde）一致，无需改 |

**未改代码的直接证据**：对 `projectContent`、`finalizeContent`、`maxConsecutiveWakes`、`pluginRegistryProbe`、`registryProbe`、`settings.yaml`（作为模型协议写入目标）在全仓 `packages/`、`scripts/`、`tests/` 检索均 **0 命中**。

## 编译与运行面

- 静态（逐步骤退出码）：`typecheck` = **0**（13 个 workspace filter 全通过）、`build` = **0**、`check:versions` = **0**（PASS 539）、`audit:harness-docs` = **0**、`check:plan` = **0**。
- 单测（日志 `.artifacts/dsh-0.1.7-alpha.2-upgrade/`）：**127 tests / 127 pass / 0 fail**——`test:integration` **111/111**（`duration_ms 16039.49`）、`test:activity` **14/14**、`test:planning` **2/2**。
- 预览安装：`preview:install` EXIT 0，`Pinned official CLI 0.1.7-alpha.2 from the Profile dependency graph`；八层官方 Profile 层（Skill / Expert / Connector / Office / Library / Projects / Assistant / presentation）重装成功，launcher 与 settings 共用同一 `dsh-app-boot`。装前该 Profile 实为 `0.1.7-alpha.1`（`.test-runtime/preview/profiles/preview/node_modules/@deepseek-ai/dsh/package.json`），装后为 `0.1.7-alpha.2`——**探针门禁必须先重装 Profile，否则是在旧基线上取样**。
- 探针门禁（7 项全部 EXIT 0，无 pageerror）：
  - `probe:theme` **PASS**：Static **887 fallback-free `var(--dsw-*)` references across 232 files, all declared by the 0.1.7-alpha.2 palette（367 names, 367 base declarations）**；Live `ui-theme.preference` light → dark → system 往返，`body[data-ds-dark-theme]`、`html color-scheme` 与 19 个采样 token 在两种方案下均与官方调色板相等。
  - `probe:settings` **PASS**（`ui-theme.fontSize (inherited) -> 16 -> 14`，`16 namespaces described`）。
  - `probe:activity` **PASS**（官方 Profile/Client 加载、46px 条、原生 body 保留、动效关闭持久、系统 reduced-motion、Escape、无浏览器错误）。
  - `probe:install` **3 PASS**（打包 bundle 安装后 Host 激活、匿名 401 / 已认证 Web 200；移除后配置与重启均无残留；重装重启后激活）。
  - `probe:skills` **6 PASS**、`probe:experts` **6 PASS**、`probe:office:native` **6 PASS**（含官方 builtin 预览对 xls/csv/tsv 的默认占有与 WorkDSH 编辑器作为「打开方式」备选，以及真实原生 Session 创建与固定绑定）。
- **主题词表扩张（本批新观测）**：`probe-theme` 在 alpha.2 解析出 **367 个 `--dsw-*` 名字 / 367 条 light 基态声明**，上一批为 **361 / 361**。仓库侧引用面 887 条、232 文件**不变且全部落在新词表内**（`unknown 0`、`undeclared 0`），即官方向后兼容地新增 6 个 token，**无需改代码**。

## 文档镜像 delta 记账

- 新增 `docs/dsh-v0.1.7-alpha.2/` = **562 文件 / 347 md / 8 子目录**，来源为 GitHub tag tarball `codeload.github.com/deepseek-ai/deepseek-harness/tar.gz/refs/tags/dsh-v0.1.7-alpha.2` 的仓库根 `docs/` 子树（排除 `native/system/docs/`，与既往批次同口径）。与 alpha.1 镜像逐文件 `cmp`：**562 vs 562，0 新增 / 0 删除 / 37 内容变化**。
- 37 个变化文件：`capability-seams.*`、`config-catalog.*`、`cookbook/adding-a-remote-api.*`、`event-producer-consumer.*`、`module-graph.*`、`persistence-catalog.*`、`persistence-schema.json`、`rescope.*`、`subsystems/boot.*`、`subsystems/spill.*`、`subsystems/tools.*`、`tool-execution-pipeline.*`、`user/guide/providers.*`（多数为 `.md` + `.zh.md` + `.i18n.yaml` 三件套）。
- 历史镜像保留不删不改：`docs/dsh-v0.1.6-alpha.2/`（543 文件）、`docs/dsh-v0.1.7-alpha.1/`（562 文件）。
- 引用重锚：镜像路径 token `docs/dsh-v0.1.7-alpha.1` → `docs/dsh-v0.1.7-alpha.2`，**22 文件 60 处**（`docs/design/**` 17、`docs/adr/**` 4、`packages/portal/README.md` 1）**另加 `AGENTS.md` 2 处**（第 37 行官方 Agent Teams 版本表述、第 41 行 Harness 优先复用硬约束的镜像路径）。抽出 **36 个唯一镜像相对路径**逐个 `existsSync` → **35 命中 / 1 假阳性**（`subsystems/workflow.zh.md与subagent.zh.md` 是 `EXPERT-TEAMS.md` 里两路径被中文连词直接拼接的既有写法，非断链）。
- 文档门禁：`docs/research/deepseek-harness-review.json` 的 `corpusRoot` → `docs/dsh-v0.1.7-alpha.2`。因两镜像**文件集合完全相同**，`audit:harness-docs` 输出与上一批**逐字相等**：`127/176 canonical documents reviewed; 49 pending`（EXIT 0）。pending 非空是脚本既定语义。
- 保留清单（判定口径：「当前基线表述」改，「事实对象 / 已发布历史」不改，与 alpha.1 批次第 85 行同口径）：
  - **不改**：`docs/evidence/**` 各批次证据与 `docs/DSH-0.1.7-alpha.1-UPGRADE-PLAN.md`（记录当时读取的锚点）、`docs/STATUS.md` 历史台账、`docs/development-order.json` 第 86 行 D04 note（2026-09-22 当日门禁快照）、`docs/research/harness-review-closure.md` 与 `deepseek-harness-capability-review.md`（正文均自陈「保留原语料锚点以如实反映来源」）、各包 `CHANGELOG.md` 历史条目、`docs/RELEASES.md` 与 `docs/releases/**`。
  - **已改**：`AGENTS.md` 第 2 条（基线声明与两批证据链接）、第 37 行（官方 Agent Teams 版本）、第 41 行（Harness 优先复用硬约束的镜像路径）；`docs/HARNESS-OFFICIAL-DEVELOPMENT.md`（基线状态行 + 依据优先级 + 6 条本地镜像链接）；`docs/MODULE-VERSIONS.md`（本批条目）；`docs/research/deepseek-harness-review.json`（`corpusRoot`）；`docs/design/**` 与 `docs/adr/**` 的镜像路径 token；`packages/bundle|plugins/skills|plugins/experts|plugins/connectors|plugins/office|portal` 的 README 当前基线表述（同时修正 experts README 的候选版本号 `α.8 → α.9`，与 MODULE-VERSIONS 对齐）。
  - **脚本与测试硬编码**：`scripts/check-published-versions.mjs`（期望版本 + 6 条伴生包 + PASS 串）、`scripts/pack-project-release.mjs`、`pack-office-release.mjs`、`pack-library-release.mjs`、`probe-official-expert-composition.mjs`、`probe-native-expert-team.mjs`、`probe-native-team-web.mjs`、`probe-subagent-activation-limit.mjs`、`tests/integration/project-installer.test.mjs` 全部改指 `0.1.7-alpha.2`。

## 版本与收口

- **模块版本裁决：本批不 bump 任何模块**。理由：alpha.2 相对 alpha.1 的仓库侧改动是「依赖与基线表述」，**0 行业务代码**（`git diff` 面为 `package.json` / `pnpm-lock.yaml` / 脚本常量 / 文档）。按 [模块版本规划](../MODULE-VERSIONS.md)「页面、任务和切片不单独建立产品版本」，适配折叠进 alpha.1 批次已登记的同一未发布增量（experts `α.9`、activity `α.5`、connectors `α.3`、identity-local `α.6` 等版本号不变，CHANGELOG 不新增条目）。
- `docs/MODULE-VERSIONS.md` 新增本批条目；`docs/STATUS.md` 新增本批台账节。
- 提交策略（用户 2026-09-25 裁决）：**与 alpha.1 批次合并提交**——`0.1.6-alpha.2 → 0.1.7-alpha.1` 与 `0.1.7-alpha.1 → 0.1.7-alpha.2` 的改动合并为单个提交 `c8a05e10a3`（1263 文件 / +1687541 −5657），并推送 `fork/main`（`9b8215a070..c8a05e10a3`）。**本批未发布 npm、未改线上。** GitHub PR [#4](https://github.com/techflag/workdsh/pull/4) 的 head 自动跟随到该提交。
- `.gitignore` 第 15 行 `/docs/`：`docs/` 下新建文件默认不入库。按用户裁决 `git add -f` 强加 4 项——两批升级证据与两份官方文档镜像（`docs/dsh-v0.1.7-alpha.1/`、`docs/dsh-v0.1.7-alpha.2/`）。加 alpha.1 镜像的理由是 19 个已跟踪 docs 文件共 26 处引用它，不加入会使本提交自身产生悬空引用。

## 未覆盖项与边界

| 项 | 状态与说明 |
| --- | --- |
| 线上 `dsh.10ge.cn` 切换 | **未执行**（用户裁决「先仓库升级批次，线上暂不动」）。线上仍为 `0.1.7-alpha.1`（P8/P9-R/P10 已部署）。 |
| 37 个内容有变的镜像文件 | **未逐文件复审**。本批只完成「语料重新定界 + 路径重锚 + 分类裁定表 + 门禁」；分类裁定覆盖了 13 条可观测行为变化，其余为文案/行号/译文类改动。`docs/research/harness-review-closure.md` 的 H01–H09 结论仍以 0.1.6 语料为准。 |
| `audit:harness-docs` 49 条 pending | 与 alpha.1 批次同集合（含 `subsystems/boot.zh.md` 等 canonical 文档）。pending 非空是脚本既定语义（退出 0，不判失败），**不表示本批已审完**。 |
| 未与 0.1.7-rc 通道交叉验证 | 本批只锁 alpha 通道；`next = 0.1.7-rc.2` 的差异面（若将来升 rc）未评估。 |
| `subprocess-local` 构建脚本 | `pnpm install` 持续告警 `Ignored build scripts`，未配置 `onlyBuiltDependencies`（与 alpha.1 批次一致），未处置；线上安装链是否受影响未在本批重验。 |
| 探针门禁覆盖面 | 本批跑了 7 项（theme / settings / activity / install / skills / experts / office:native）。alpha.1 批次登记的其余探针（`probe:browser`、`probe:experts:official|professional`、`probe:office`、`probe:office:live`、`probe:library`、`probe:headless`、`probe:mcp:resources`、`probe:computer-use:native`、`probe:subagent:activation-limit`、`probe:connectors`、`probe:presets`、`probe:remote:*`、`test:office:*`、`test:skill-quality`、`test:library`、`test:projects`、`test:assistant`、`portal`）**未在本批复跑**；理由是「0 行业务代码改动 + 0 文件删除」，但不等于这些路径已在 alpha.2 上取样。 |
| 真实模型验收 | 未跑（本批无模型相关代码或契约改动）。 |

## 回退

- 版本面：把根与 13 个模块 `package.json` 的 `0.1.7-alpha.2` 改回 `0.1.7-alpha.1`、Cordis 及 5 个伴生包改回 `4.0.3 / 1.0.3 / 1.0.8 / 1.0.4 / 1.1.5 / 3.18.3`、`scripts/check-published-versions.mjs` 与相关脚本常量回退，再 `corepack pnpm install --no-frozen-lockfile` 即可（`pnpm-lock.yaml` 一并回退）。
- 文档面：删除 `docs/dsh-v0.1.7-alpha.2/`、`corpusRoot` 改回 `docs/dsh-v0.1.7-alpha.1`、镜像路径 token 反向重锚。旧镜像 `docs/dsh-v0.1.7-alpha.1/` 与 `docs/dsh-v0.1.6-alpha.2/` 均原样在库，回退不需重新下载。
- 运行面：`corepack pnpm preview:install` 会把 Preview Profile 按当时 `pnpm.overrides` 重装，自动跟随回退后的版本。
- 线上无需回退（本批未触碰）。

日期：2026-09-25。本批为 0.1.7-alpha.1 批次的同族递进：依赖面与门禁全绿、官方变化面 13 条逐项裁定为「0 处需改代码」、文档镜像新增并完成路径重锚、探针与单测实测通过。已合并提交 `c8a05e10a3` 并推送 `fork/main`，**线上未动**。剩余边界以「未覆盖项」表内说明为准，表中标记「未执行」的项不得计入已完成。
