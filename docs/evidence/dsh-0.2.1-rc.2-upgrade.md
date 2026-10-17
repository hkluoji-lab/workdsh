# DSH 版本分析与升级证据（0.2.1-alpha.2 → 0.2.1-rc.2）

2026-10-17 盘点与执行。本文件回答两件事：① 当前网站所用 DeepSeek Harness 的版本、模块、差异、兼容性与缺口；② 将其对齐到官方最新发布版本的方案与证据。

## 一、结论摘要

| 项 | 结论 |
| --- | --- |
| 当前仓库基线 | `0.2.1-alpha.2`（devDependencies 精确 + `pnpm.overrides` 292 条官方包精确） |
| 当前本地预览 Profile | `.test-runtime/preview/profiles/preview` 仍为 `0.1.7-alpha.2`，**落后仓库 3 个版本线**（生成物，需重建） |
| 线上（`dsh.10ge.cn`） | 记录值 `0.2.1-alpha.2`（镜像 tag `0.2.0-rc.2` + standalone 挂载树换版）；本次无法直连服务器复验（SSH 无可用凭据） |
| npm `latest` | `0.2.0-rc.2` —— **比当前基线更旧**，不能作为升级目标 |
| npm `next` | **`0.2.1-rc.2`**（2026-10-17T08:36Z 发布）= 官方最新发布版本 |
| npm `alpha` | `0.2.1-alpha.5` |
| 升级目标判定 | **`0.2.1-rc.2`**。它是 0.2.1 线的首个正式候选版本族，晚于 alpha.2，且官方 `next` 通道指向它；按 `latest` 执行会变成降级 |
| 闭包差异 | 顶层依赖 85 → **86**（新增 `dsh-experimental-plugin-market-bundle`，无移除）；82 个包版本推进；cordis 家族由 alpha 通道回到**正式版** |
| 可升级性 | 292 条 override 对应的官方包在 `0.2.1-rc.2` **全部存在**（0 缺失） |

## 二、当前版本盘点（实测）

### 2.1 仓库

| 面 | 实测 |
| --- | --- |
| 根 `package.json` | `version 0.1.0-alpha.8`；`packageManager pnpm@10.34.5`；`engines.node ^22.19.0 || >=24.0.0` |
| devDependencies | 22 个 `@deepseek-ai/dsh*` 精确 `0.2.1-alpha.2`；`@deepseek-ai/cordis 4.0.5-alpha.1` |
| `pnpm.overrides` | 300 条；其中 `@deepseek-ai/dsh*` **292** 条全部 `0.2.1-alpha.2`；非 dsh 8 条：cordis 族 6 + `prosemirror-model 1.25.11` + `prosemirror-state 1.4.4` |
| `pnpm-lock.yaml` | 6190 处 `0.2.1-alpha.2`，dsh 唯一命中版本；`scripts/check-published-versions.mjs` 断言 578 条锁定 |
| workspace | `packages/{bundle,contracts,plugins,portal,providers,survey,ui,vas}`；`docs/modules.json` 登记 34 模块 |
| 插件模块 | 21 个目录：access / activity / admin / applications / assistant / audit / automations / connectors / drive / experts / identity / library / model-policy / office / pages / projects / skills / tables / usage / workbench（部分为规划占位） |
| 模块 dsh 依赖 | 13 个已实现模块 + bundle 的 peer 为 `^0.2.1-alpha.2`、devDep 为精确 `0.2.1-alpha.2` |
| 模块 cordis/schemastery | devDep 仍写 `4.0.4` / `3.18.4`（靠根 override 收敛到 alpha 版），**与基线声明不一致** |

### 2.2 本地预览 Profile（生成物）

`.test-runtime/preview/profiles/preview/package.json`：4 个官方包 `0.1.7-alpha.2` + 12 个 workdsh `file:` tgz（bundle `0.1.0-alpha.54`）。与仓库基线差 `0.1.7-alpha.2 → 0.2.1-alpha.2`。该目录由 `scripts/install-preview.mjs` 生成，不作为版本真源，但会误导人工预览的版本判断，需随升级重建。

### 2.3 线上

`docs/STATUS.md`（续四十八、续五十一）记录：CLI / standalone 树 = `0.2.1-alpha.2`（镜像 `1panel/deepseek-harness:0.2.0-rc.2` + 挂载树换版），overrides 300 条同版本，无残留 `0.2.0-rc.2`；`deploy/profile` 签名版本与之吻合。本次 `ssh luoji@192.168.11.205` 返回 `Permission denied (publickey,password)`，**未取得线上实时复验证据**。

## 三、官方版本定位（实测）

`npm view @deepseek-ai/dsh dist-tags`：

```
alpha = 0.2.1-alpha.5
latest = 0.2.0-rc.2
next = 0.2.1-rc.2
```

发布时间（npm registry `time`）：

| 版本 | 发布时间（UTC） |
| --- | --- |
| 0.2.0-rc.2 | 2026-09-29T09:56 |
| 0.2.1-alpha.2（当前） | 2026-10-09T08:18 |
| 0.2.1-alpha.3 | 2026-10-14T12:35 |
| 0.2.1-alpha.4 | 2026-10-15T13:08 |
| 0.2.1-alpha.5 | 2026-10-16T12:31 |
| 0.2.1-rc.1 | 2026-10-17T03:17 |
| **0.2.1-rc.2（目标）** | **2026-10-17T08:36** |

GitHub Releases（`releases.atom` 实测可访问）同步存在 `dsh-v0.2.1-rc.2`，updated `2026-10-17T08:16Z`。官方 `latest` 标签仍停在 `0.2.0-rc.2`，说明 0.2.1 尚未转正；`next` 是官方对「最新候选版本」的声明，故选 `0.2.1-rc.2`。

## 四、增量变更清单（0.2.1-alpha.2 → 0.2.1-rc.2）

### 4.1 新增能力

| 版本 | 能力 |
| --- | --- |
| alpha.3 | Web 版本机 HTTP 访问可登录 DeepSeek 账号；已发送消息中的密钥/令牌识别与默认脱敏；极简模式读图与自动压缩（`/compact`）；子智能体可选择独立 Agent Preset；`/` 菜单与插件页联动；远程 Web 网络拥塞误判断线修复；崩溃后未完成任务显示「任务已停止」 |
| alpha.4 | 自定义模型 API 支持 UI 配置推理等级；自定义插件索引源发现/安装；`engines.dsh` 优先作为第三方插件兼容判断；命令与参数交界输入修复 |
| alpha.5 | 新增 `conversation.input.model.label` Slot（插件按模型渠道自定义输入框模型名） |
| rc.1 | 插件市场/自定义索引源、插件页「让 Agent 创建插件」、插件启停/卸载依赖同步与热重载、可选插件极简模式、Session 状态记录接口、Claude Code Mods 兼容层、开发者工具组合包、CoT 机器翻译、Git Worktrees 插件、`working_directory` 工具与 SDK 接口、SSH helper 运行时、Web 搜索设置、工作步骤收起时机、Markdown YAML 头字段化展示等 |
| rc.2 | 适配 **DeepSeek-V4.1-Flash-1017**；适配 **DeepSeek Search 与 Fetch API**（Web 搜索设置中开启） |

### 4.2 破坏性 / 需迁移项

| # | 变更 | 对 WorkDSH 的影响 |
| --- | --- | --- |
| B1 | **API Key 读取优先级变更**（alpha.3）：Web/桌面优先已保存凭据；headless 默认改用环境变量与 `.env`，不读已保存密钥 | 影响 headless/SDK 探针与无人值守脚本；`probe:*`、`test:integration` 若依赖已登录凭据需显式提供环境变量 |
| B2 | **Azure 提供方名统一为 `azure`**（alpha.3），旧名 `azure-openai-responses` 需迁移 | 若线上自定义模型配置使用旧名，升级后该提供方失效 |
| B3 | `--from-default-profile` 重建已有自定义配置会**替换**该配置及其插件与设置（alpha.3） | 禁止用该参数重建线上 profile |
| B4 | **第三方插件兼容优先按 `engines.dsh`**（alpha.4） | WorkDSH 插件当前**均未声明 `engines.dsh`**，继续走旧规则（peer 校验）；建议后续补声明，否则未来官方收紧时会失配 |
| B5 | Python SDK Office 引擎改为按需下载（alpha.3） | 仅影响 SDK 路径；本仓库 Office 插件走 Host 工具，不受影响 |
| B6 | cordis 家族由 alpha 通道回到正式版：`cordis 4.0.5` / `schemastery 3.18.5` / `timer 1.1.7` / `loader 1.0.6` / `include 1.0.10` / `group 1.0.5` | 根 override、模块 devDep、profile override 三处必须同步，否则会出现 alpha/正式双版本共存 |
| B7 | 新增依赖 `dsh-experimental-plugin-market-bundle` | 需补 override，否则精确锁定规则漏一条 |

## 五、依赖闭包差异（实测）

| 项 | 0.2.1-alpha.2 | 0.2.1-rc.2 | 差异 |
| --- | --- | --- | --- |
| `@deepseek-ai/dsh` 直接依赖 | 85 | **86** | +1 |
| 新增包 | — | `dsh-experimental-plugin-market-bundle` | — |
| 移除包 | — | 无 | — |
| 版本推进 | — | 82 个包 | 全部 → `0.2.1-rc.2` |
| cordis | `~4.0.5-alpha.1` | `~4.0.5` | 回正式版 |
| schemastery | `~3.18.5-alpha.1` | `~3.18.5` | 回正式版 |
| cordis-plugin-timer | `~1.1.7-alpha.1` | `~1.1.7` | 回正式版 |
| cordis-plugin-loader | `~1.0.6-alpha.1` | `~1.0.6` | 回正式版 |
| cordis-plugin-include | `~1.0.10-alpha.1` | `~1.0.10` | 回正式版 |
| js-yaml / commander / node-addon-require-builtin | `^4.3.2` / `^15.0.0` / `^0.1.9` | 同 | 无变化 |

**可用性核验**：对根 `pnpm.overrides` 的 292 个 `@deepseek-ai/dsh*` 包逐一请求 registry `/0.2.1-rc.2`，**292/292 存在，0 缺失**（含 `dsh-typert-generator`）。`dsh-experimental-schedule-bundle` 仅有 `0.2.0-rc.1/rc.2` 两个版本，已不在官方闭包，但 `deploy/profile` 仍保留其 override；因无包依赖它，不会参与解析。

## 六、现有代码与官方的差异点

WorkDSH **不 fork 官方源码**，差异全部在装配与锁定层：

1. **精确版本锁定**：292 条 override 防止浮动解析，这是官方不提供的收敛手段。
2. **派生 Profile**：`deploy/profile` 自带 `pnpm-workspace.yaml` overrides（287 条）+ `cordis.patch.yml`（19KB，含 schedule / ui-schedule / workdsh 面板插入）+ `compatibility.json`（1 条 agent-teams 豁免）。
3. **1Panel auth-proxy 补丁**：`dsh-client-connection/lib/index.js` 的 `isAuthenticated` 首行插入 `ONEPANEL_DSH_AUTH_PROXY` 判定，standalone 树与 profile 各一份，升级后必须重放。
4. **第三方 bundle**：`dshmarket`、`dsh-mcp-connector`、`@nanmicoder/dsh-agent-teams` 等不在官方闭包内，需单独做 peer 兼容判定。
5. **模块声明落后**：模块 devDep 仍写 cordis `4.0.4` / schemastery `3.18.4`；`packages/bundle` 同样写 `4.0.4`（靠根 override 才没装错）。
6. **本地预览 Profile 落后**：停在 `0.1.7-alpha.2`，与仓库/线上不一致。

## 七、兼容性风险与处置

| # | 风险 | 判定 | 处置 |
| --- | --- | --- | --- |
| R1 | 插件 peer `^0.2.1-alpha.2` 是否覆盖 `0.2.1-rc.2` | **覆盖**（caret 预发布区间 `>=0.2.1-alpha.2 <0.3.0-0`） | 仍统一改为 `^0.2.1-rc.2`，避免语义漂移 |
| R2 | cordis 4.0.5（正式）与 4.0.5-alpha.1 的 API 差异 | 需编译验证 | typecheck/build 全量跑；`bundle` 与模块 devDep 同步到 `4.0.5` |
| R3 | `@nanmicoder/dsh-agent-teams@0.1.22` peer 仅到 `0.2.0-rc.2` | **不覆盖 rc.2**（豁免条目也仅 `0.2.1-alpha.2`） | 线上部署前二选一：升级到 `0.1.24-rc.1`（peer 含 `0.2.1-rc.1`）或重新 `allow-version`；本次不改线上 |
| R4 | `dshmarket` peer 含 `^0.2.1-rc.1` | 覆盖 rc.2 | 无需处理 |
| R5 | `dsh-mcp-connector 0.2.75` peer `>=0.2.0-rc.1 <0.3.0-0` | 覆盖 rc.2 | 无需处理 |
| R6 | headless 凭据读取规则变化（B1） | 影响探针 | 回归时显式设置环境变量；记录未执行项 |
| R7 | Azure 提供方改名（B2） | 条件性 | 检查线上模型配置；本次不改线上 |
| R8 | auth-proxy 补丁路径漂移 | 高 | 换树后按 `marker=1` 双份复验（线上步骤） |
| R9 | `prosemirror-model 1.25.11`（最新 1.25.12）/ `prosemirror-state 1.4.4`（最新） | 覆盖 rc.2 需求 | 维持现锁定，升级后由 typecheck/build 验证；不为追新而改 |
| R10 | 292 条 override 中可能含已退市包 | 全部存在 | 无需处理；新增 `dsh-experimental-plugin-market-bundle` 需补 override |
| R11 | 本地预览 Profile 落后 | 中 | 升级后 `pnpm preview:install` 重建 |
| R12 | 工作区存在未提交的 P1-15 批 2 变更（identity 域、portal 签名） | 中 | 升级只叠加版本改动，不触碰这些文件；不提交 |

## 八、升级方案（执行顺序）

### 阶段 A：仓库基线

1. 根 `package.json`：22 个 dsh devDep + 292 条 dsh override → `0.2.1-rc.2`；cordis 族 6 条 → `4.0.5 / 1.0.5 / 1.0.10 / 1.0.6 / 1.1.7 / 3.18.5`；新增 `@deepseek-ai/dsh-experimental-plugin-market-bundle: 0.2.1-rc.2`。
2. 13 个模块 + `packages/bundle` 的 `package.json`：peer `^0.2.1-alpha.2 → ^0.2.1-rc.2`，devDep 精确 `0.2.1-rc.2`；cordis `4.0.4 → 4.0.5`、`^4.0.4 → ^4.0.5`，schemastery `3.18.4 → 3.18.5`、`^3.18.4 → ^3.18.5`。
3. `scripts/check-published-versions.mjs`：`expected` 与 companions 同步。
4. `pnpm install --no-frozen-lockfile` 全量重解析。

### 阶段 B：部署真源

5. `deploy/profile/package.json` 4 个官方依赖 → `0.2.1-rc.2`。
6. `deploy/profile/pnpm-workspace.yaml` 287 条 override → `0.2.1-rc.2` + cordis 族正式版。
7. `deploy/profile/README.md` / `compatibility.json` 的版本文字同步（豁免条目**不改语义**，仅记录）。

### 阶段 C：本地验证

8. `check:versions`、`check:plan`、`check:acceptance`、`check:env`。
9. `pnpm install --no-frozen-lockfile` 后 `typecheck`、`build`（14 个聚合包）。
10. `test:integration`、`test:activity`、`test:access`、`test:identity`、`test:projects`、`test:assistant`、`test:planning`。
11. `preview:install` 重建 preview profile，确认其官方依赖 = `0.2.1-rc.2`。
12. `probe:install`（临时 Agents home）与 `probe:presets`。

### 阶段 D：线上（需单独授权）

13. 服务器：备份 standalone 树与 profile 配置 → 换 `0.2.1-rc.2` 树 → 双份 auth-proxy 补丁重放（`marker=1`）→ profile `package.json` + `pnpm-workspace.yaml` 双处改版本 → `pnpm install` → `docker compose up -d --force-recreate deepseek-harness`。
14. 验证：CLI/树版本、`RestartCount=0`、三层健康、存量会话/存储计数、业务面探针（experts/projects/skills/connectors/library）、启动窗口 0 条未激活。
15. 第三方 bundle：`agent-teams` 先升 `0.1.24-rc.1` 或执行 `allow-version`；`dshmarket` / `mcp-connector` 复验。

## 九、验证矩阵（本地）

| 检查 | 期望 |
| --- | --- |
| `node scripts/check-published-versions.mjs` | PASS：lock 全量 `0.2.1-rc.2`；cordis 族仅正式版 |
| `node scripts/check-plan.mjs` | PASS（34 模块 / 50 文档） |
| `pnpm install --no-frozen-lockfile` | 退出码 0，无 alpha.2 残留 |
| `pnpm typecheck` | 退出码 0 |
| `pnpm build` | 退出码 0 |
| 单元/集成测试 | 全部 pass，0 fail |
| `pnpm preview:install` | preview profile 官方依赖 = `0.2.1-rc.2` |
| `pnpm probe:install` | 安装与激活探针通过 |

## 十、回退锚点

- 仓库：本批改动集中且可枚举，`git checkout -- <files>` 或 `git revert` 即可；`pnpm-lock.yaml` 由重装重建。
- 线上（未执行）：保留 `standalone.rc2-old.<date>` 整树与 profile 配置备份，回退 = 换回旧树 + 恢复配置 + `--force-recreate`。

## 十一、未覆盖项与边界

| 项 | 说明 |
| --- | --- |
| 线上实时复验 / 部署 | 未执行。SSH `Permission denied`，无可用凭据；线上步骤见阶段 D，需单独授权与访问方式 |
| 真实模型验收 | 未执行；本批为版本对齐与本地回归 |
| 官方文档镜像 | `docs/dsh-v0.2.1-rc.2/` 未落盘；版本判定以 npm registry 与 GitHub Releases 为准 |
| `engines.dsh` 声明 | 本批未给 WorkDSH 插件补 `engines.dsh`；作为后续建议记录 |
| 第三方 bundle 升级 | `agent-teams` 未改；线上部署前处理 |
| git commit / push | 未执行（需用户授权） |

## 十二、执行结果（2026-10-17 本地）

阶段 A、B、C 已执行；阶段 D（线上）未执行。

### 12.1 版本与锁定

| 面 | 结果 |
| --- | --- |
| 根 `package.json` | devDependencies 官方 dsh/cordis **26 条**、`pnpm.overrides` **308 条**（dsh **300** + 非 dsh 8）；dsh 条目 **300/300 = `0.2.1-rc.2`**，非 rc.2 残留 **0** |
| cordis 族 | `@deepseek-ai/cordis 4.0.5`、`cordis-plugin-group 1.0.5`、`cordis-plugin-include 1.0.10`、`cordis-plugin-loader 1.0.6`、`cordis-plugin-timer 1.1.7`、`schemastery 3.18.5`（全正式版） |
| `pnpm-lock.yaml` | `pnpm install --no-frozen-lockfile` 退出码 0（+313 / −304）；`check-published-versions` 断言 **598 条**锁定 `0.2.1-rc.2` |
| `deploy/profile/package.json` | 4 个官方依赖全部 `0.2.1-rc.2` |
| `deploy/profile/pnpm-workspace.yaml` | **294 条**官方包 override 全部对齐；已含 `dsh-experimental-plugin-market-bundle`，已移除 `dsh-experimental-schedule-bundle` |
| `deploy/profile/compatibility.json` | `agent-teams@0.1.22` 豁免接受 `0.2.1-alpha.2` 与 `0.2.1-rc.2` |

执行中修正的锁定缺口：

- **补 8 条 override**（lock 已解析但根 override 缺失，`check:versions` 反向校验失败）：`dsh-api-remote-access`、`dsh-client-ui-deepseek-model-label-1017`、`dsh-client-ui-plugin-market`、`dsh-client-ui-secret-mask`、`dsh-harness-dev-context`、`dsh-plugin-market`、`dsh-plugin-market-index`、`dsh-web-deepseek-api`。
- **删 1 条 override**：`dsh-client-ui-primitives` 已不在 rc.2 闭包，保留会让 `check:versions` 的正向校验失败。
- 根与 `deploy/profile` 两处同步，避免部署真源与仓库漂移。

### 12.2 rc.2 破坏性 API 适配（本地代码）

| # | 变更 | 实际影响与处置 |
| --- | --- | --- |
| A1 | `@deepseek-ai/dsh-tool-skill` 的 `inject` 新增 `workingDirectory`（`["agents","tools","skills","workingDirectory"]`） | 集成测试宿主缺少 `workingDirectory` 服务，`skill` 工具不注册、调用报 `unknown tool "skill"`。在 `tests/helpers/skill-runtime.mjs`、`skill-persistence-worker.mjs`、`skill-session.test.mjs`、`expert-manager.test.mjs`、`preset-authoring.test.mjs` 按官方 sdk-minimal 顺序补装 `@deepseek-ai/dsh-fs-local` + `@deepseek-ai/dsh-working-directory`；根 devDependencies 显式声明两包 |
| A2 | `@deepseek-ai/dsh-session-persistence-jsonl` 取消 default export，改为命名导出 `apply` | `skill-persistence-worker.mjs` 改为 `import { apply as JsonlPersistence }`；否则报 `does not provide an export named 'default'` |
| A3 | 全新的「Get started」登录引导弹层（`role=dialog`，Add API Key / Sign In / Close） | 无凭据 Profile 启动时覆盖页面并拦截指针事件。`probe-presets`、`probe-skills-package`、`probe-experts-package`、`probe-activity` 增加「通过弹层自身 Close 按钮关闭」的步骤（带容错，弹层不存在时不失败） |
| A4 | `agentTeams.remoteView()` 在 `dsh-experimental-agent-team@0.2.1-rc.2` 移除 | 官方组合探针改用公开 `ctx.agentTeams.listMembers(lead)` 断言同一事实 |
| A5 | 会话侧栏标题不再显示 cwd basename（`workspace`），显示会话标题（fixture 为 `Untitled`） | `probe-activity` 改为点击真实会话行；同时该探针的持久 Profile 会复用同版本旧 tgz，增加 `plugin remove` 后再 `add`，确保安装的是当前源码 |
| A6 | 主题词汇移除 `--dsw-alias-state-info-tertiary` | `packages/plugins/drive/src/client/styles.ts` 文档图标底色改为 `color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent)`；`probe:theme` 恢复 0 未知 / 0 未声明 |
| A7 | `@deepseek-ai/dsh-webhook` 退出 0.2.1-rc 基础闭包（仍以 `0.2.1-rc.2` 单独发布） | `scripts/install-preview.mjs` 在 preview Profile 中显式安装该版本（不组合进运行时）；`probe:automations` 的 P-AU-2 证据恢复 |
| A8 | 官方组合探针硬编码 `0.2.0-rc.2` | `probe-official-expert-composition.mjs` 改为从已安装 `@deepseek-ai/dsh` 读取版本，并补装 `fs-local` / `working-directory` |

### 12.3 验证结果

| 检查 | 结果 |
| --- | --- |
| `pnpm check:versions` | **PASS**：598 条锁定 `0.2.1-rc.2`；Cordis 4.0.5 family only |
| `pnpm check:plan` | **PASS**（34 模块 / 50 文档） |
| `pnpm check:env` | **PASS**（Node 24.15.0 / pnpm 10.34.5） |
| `pnpm typecheck` | **PASS** |
| `pnpm build` | **PASS** |
| `pnpm test:integration` | **111/111 pass，0 fail**（适配 A1/A2 前为 104/111） |
| `pnpm test:identity` | 12/12 pass |
| `pnpm test:activity` | 14/14 pass |
| `pnpm test:planning` | 2/2 pass |
| `pnpm test:library` | 6/6 pass |
| `pnpm test:projects` | 10/10 pass |
| `pnpm test:skill-quality` | 3/3 pass |
| `pnpm test:assistant` / `test:access` / `test:office:content` / `test:office:csv` | PASS |
| `pnpm preview:install` | PASS：preview Profile 官方依赖 = `0.2.1-rc.2`，CLI/ConfigEditor 共享同一 `dsh-app-boot` 与 `dsh-scope` |
| `pnpm probe:install` | PASS |
| `pnpm probe:presets` | PASS（含 A3） |
| `pnpm probe:activity` | PASS（含 A3/A5） |
| `pnpm probe:settings` | PASS（21 个命名空间，主题写入回执） |
| `pnpm probe:theme` | PASS：959 处 `var(--dsw-*)`、311 文件全部命中 403 个官方词元；light/dark 实际值一致（含 A6） |
| `pnpm probe:skills` | PASS（9 项） |
| `pnpm probe:experts` | PASS（13 项） |
| `probe-official-expert-composition.mjs`（`probe:experts:official`） | PASS（含 A4/A8；冷重启续跑通过） |
| `pnpm probe:experts:professional` | PASS（真实原生任务、durable tool receipt、冷重启绑定） |
| `pnpm probe:connectors` | PASS |
| `pnpm probe:automations` | PASS（P-AU-1..4；含 A7） |
| `pnpm probe:library` | PASS |
| `pnpm probe:headless` | PASS |
| `pnpm check:acceptance P1` | 42 个 pending；属历史基线，不由本次升级引入 |

### 12.4 未执行 / 边界

| 项 | 说明 |
| --- | --- |
| 阶段 D（线上 `dsh.10ge.cn`） | **已执行**（2026-10-17，用户授权「执行线上部署」），结果见 12.5 |
| 线上 auth-proxy 补丁 | **已重放并复验**：standalone 树 + profile 双份 `marker=1`；补丁脚本已适配 rc.2 新签名 |
| 线上 agent-teams | **已豁免**：`allow-version @nanmicoder/dsh-agent-teams@0.1.22 --dsh-version 0.2.1-rc.2`，`compatibility.json` 同时保留 alpha.2 / rc.2 |
| 真实模型验收 | 未执行（无凭据）；`probe:experts:professional` 走合成/离线证据路径 |
| 浏览器端逐页交互 | 未执行；线上仅验证 HTTP / 只读业务 API 层 |
| `docs/dsh-v0.2.1-rc.2/` 镜像 | 未落盘；版本判定仍以 registry / GitHub Releases / 发布包实测为准 |
| `engines.dsh` | WorkDSH 插件仍未声明；兼容判断继续走 peer 校验 |
| git commit / push | 未执行（需用户授权） |

### 12.5 阶段 D：线上部署执行结果（2026-10-17）

**形态**：沿用镜像 `1panel/deepseek-harness:0.2.0-rc.2` + 挂载树换版；容器 `dsh`（1Panel，`read_only` 根文件系统）。

| 步骤 | 实测结果 |
| --- | --- |
| 新树构建 | 容器内 `npm install -g --prefix …/_rc2-prefix @deepseek-ai/dsh@0.2.1-rc.2`，组装 hoisted `_rc2-standalone`（873M，属主 1000，非 1000 属主 0） |
| 硬门禁 A | `resolved 87 packages (78 @deepseek-ai/dsh)`，`dsh versions: ["0.2.1-rc.2"]`，cordis `4.0.5` / `plugin-include 1.0.10` / `plugin-loader 1.0.6` / `plugin-timer 1.1.7` / `schemastery 3.18.5` ⇒ `RESOLUTION_ALL_OK` |
| 硬门禁 B | 新树 CLI `0.2.1-rc.2` |
| auth-proxy 补丁 | rc.2 将 `isAuthenticated(request)` 改为 `isAuthenticated(request, secure = false) { return this.authenticate(…)…}`；补丁脚本改为双锚点（rc.2 + 旧版），输出 `PATCHED:rc2`，`node --check` 通过，双份 `marker=1` |
| profile 升位 | 4 个官方依赖 → `0.2.1-rc.2`；`pnpm-workspace.yaml` 296 条 override（288 条官方 dsh → rc.2；cordis 族回正式版；`schemastery` 3.18.5）；补 `dsh-mcp-connector@0.2.73` 到 `minimumReleaseAgeExclude`；移除 rc.2 已不存在的 `dsh-client-ui-primitives` / `dsh-experimental-schedule-bundle` 两条残留 override。`dsh-mcp-connector` 保持线上既有的 `0.2.73`（非本次 DSH 升级范围） |
| profile 重装 | `pnpm install`（uid 1000，17.4s）；顶层 `@deepseek-ai/dsh*` **236 个全部 `0.2.1-rc.2`**；13 个 workdsh 包实装版本与声明逐条一致（含 drive alpha.2） |
| app-boot 热重载补丁 | rc.2 中目标块缩进由 1 tab 变 2 tab；脚本改为「同缩进多行块」正则，兼容两代布局，应用后 `marker=1` + `node --check` 通过 |
| dream-skin webRuntime 补丁 | 重装后 `--check` 返回「已是补丁状态」 |
| agent-teams 豁免 | `allow-version @nanmicoder/dsh-agent-teams@0.1.22 --dsh-version 0.2.1-rc.2 --accept-risk` ⇒ `compatibility.json` = `["0.2.1-alpha.2","0.2.1-rc.2"]` |
| 原子换树 | 旧树 → `standalone.rc2old.20261017124556`（549M）；`_rc2-standalone` → `standalone`（873M）；`docker compose up -d --force-recreate`（bind mount 按路径重新解析） |
| 容器 | `healthy`（启动约 10s）；`RestartCount=0`；`StartedAt=2026-10-17T12:45:59Z` |
| 版本一致性 | 容器 CLI `0.2.1-rc.2`；挂载树 `0.2.1-rc.2`；profile `dsh-base` `0.2.1-rc.2` |
| 兼容闸门 | `skipping profile bundle` = 0；`is incompatible with dsh` = 0；`disabling profile plugin row` = 0 |
| 三层健康 | 容器内 `127.0.0.1:3080` = `200`；`https://dsh.10ge.cn/` = `302 → /portal` |
| 数据基线 | sessions **327** 文件、storages **120317** 文件，前后完全一致（`SESSIONS_UNTOUCHED_OK`） |
| 业务只读 API（带门户身份） | experts 22；projects 0 / templates 15；library space 1 / list 14；skills 54（plugin 10 + 本地 unknown 44）；connectors 1；assistant 0；无 error 对象 |
| 导航 | `dsh-client-ui-schedule@0.2.1-rc.2` 提供 `sidebar.panellist` 注入，「自动化任务」入口不依赖已移除的 `dsh-experimental-schedule-bundle` |

**遗留缺陷（既有，非本次引入，已修复）**：`workdsh-drive` 未激活，日志 `1 entry did not activate` ——
`DomainError: domain 'workdsh_drive': stored record 'local-personal_portal-18938845688' … textIndex … too_big, maximum 256`。
取证：① 该记录文件 mtime `2026-10-11 12:09`，早于本次升级；② 旧树与 rc.2 的 `dsh-storage-domain` `open()` 解析逻辑逐行一致；③ 根因是 `packages/plugins/drive/src/storage/domain.ts` 中 `textIndex: z.record(id, id)` 复用了 `id` 的 `max(256)`，而写入侧 `MAX_INDEX_CHARS = 128 * 1024`。**2026-10-17 已按「修 schema 值上限」处置并部署 `workdsh-plugin-drive@0.1.0-alpha.3`**，存量记录原样保留（值 2870 字符在合法范围内），启动日志 `did not activate` 归零；详见 [drive-plugin-alpha3](drive-plugin-alpha3.md)。

**回退锚点**：`…/global-dsh/standalone.rc2old.20261017124556`（旧树）、`…/profiles/web/node_modules.pre-rc2p2.20261017124350`（旧 profile 依赖）、`profiles/web/{package.json,pnpm-workspace.yaml,compatibility.json}.bak.rc2p2.*`、`/home/luoji/dsh-backup-rc2p2-20261017124350/`、`/home/luoji/dsh-backup-rc2p4-20261017124556/`。


---

日期：2026-10-17。证据来源：`npm view @deepseek-ai/dsh`（dist-tags / time / versions / dependencies）、GitHub `releases.atom`、registry 逐包 `/0.2.1-rc.2` 可用性探测（292/292）、仓库 `package.json` / `pnpm-lock.yaml` / `deploy/profile` / `docs/STATUS.md` 实测，以及第十二节列出的本地门禁与探针实跑输出。
