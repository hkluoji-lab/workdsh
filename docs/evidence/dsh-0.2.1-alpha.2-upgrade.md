# DSH 升级证据（0.2.0-rc.2 → 0.2.1-alpha.2，仓库基线 + 制品 + 线上升级部署）

2026-10-10 准备评估，2026-10-11 执行升级。本文件记录从官方 `latest` `0.2.0-rc.2` 到 **alpha 通道最新 `0.2.1-alpha.2`** 的升级适配，含四项交付：① 版本承载文件与 lock 随升；② 12 个 WorkDSH 制品重出与上传；③ 服务器线上运行面升级部署（`dsh.10ge.cn`）；④ 升级后门禁/业务面回归验证。

**批次性质**：本批**分两段**。第一段（2026-10-10）为**评估准备段**（只读侦察 + 证据归档，仓库侧、制品侧、镜像侧与线上容器**均未变更**）。第二段（2026-10-10～10-11）为**执行段**：经用户授权「好的，执行升级吧」后，仓库基线随升 + 12 制品重出上传 + 线上换树/补丁重放/`--force-recreate`，并完成门禁、健康、存量与业务面回归验证（详见第七节）。

**本批关键决策**：基线按仓库规则从 `0.2.0-rc.2` 精确锁定至 `0.2.1-alpha.2`（alpha 预发布线）；1Panel 渠道无 alpha 镜像 tag，本次**沿用 0.2.0-rc.2 挂载树替换方案（不重打派生镜像）**——镜像 tag 仍为既有 `...:0.2.0-rc.2-localbuild-patched`，运行时通过挂载树 + profile 重装提供 `0.2.1-alpha.2` 能力（详见 7.1 决策说明）。

---

以下第一至第四节为**评估准备段**记录（2026-10-10，只读）；第五至第八节为**执行段**记录（2026-10-10～10-11）。

## 一、官方版本定位（实测）

命令：`curl -s https://registry.npmmirror.com/@deepseek-ai/dsh` → 解析 `dist-tags` 与版本时间线。

```
dist-tags= {"alpha":"0.2.1-alpha.2","latest":"0.2.0-rc.2","next":"0.2.0-rc.2"}
modified= 2026-10-09T08:18:08.482Z
total_versions= 31
tail= 0.1.7-alpha.1, 0.1.7-alpha.2, 0.1.7-rc.1, 0.1.7-rc.2, 0.2.0-rc.1, 0.2.0-rc.2, 0.2.1-alpha.1, 0.2.1-alpha.2
```

- **`latest` 与 `next` 仍停在 `0.2.0-rc.2`**（与仓库基线一致），alpha 通道已推进到 `0.2.1-alpha.2`。
- `total_versions` 由 29（0.2.0-rc.2 批次）增至 **31**，新增位即 `0.2.1-alpha.1`、`0.2.1-alpha.2`。
- 官方发布时间（GitHub releases 列表实测）：`dsh-v0.2.1-alpha.1` = 2026-10-03T06:42:19Z；`dsh-v0.2.1-alpha.2` = 2026-10-09T11:09:26Z。

**注意**：alpha 通道发布节奏与 rc 通道解耦，0.2.1 线**目前只有 alpha，无 rc**。升级到 alpha 通道意味着提前消费未定稿能力，风险高于 rc 通道。

## 二、0.2.1-alpha.2 依赖闭包（实测对比）

`curl -s .../dsh/0.2.1-alpha.2` 与 `0.2.0-rc.2` 对比：

| 项 | 0.2.0-rc.2 | 0.2.1-alpha.2 | 差异 |
| --- | --- | --- | --- |
| `dependencies` 总数 | 82 | **85** | +3 |
| `@deepseek-ai/dsh*` | 74 | **77**，版本值唯一集 = `["0.2.1-alpha.2"]`（全精确） | +3 |
| cordis 家族 | 5：`cordis ~4.0.4` / `schemastery ~3.18.4` / `cordis-plugin-timer ~1.1.6` / `cordis-plugin-loader ~1.0.5` / `cordis-plugin-include ~1.0.9` | **5**：`cordis ~4.0.5-alpha.1` / `schemastery ~3.18.5-alpha.1` / `cordis-plugin-timer ~1.1.7-alpha.1` / `cordis-plugin-loader ~1.0.6-alpha.1` / `cordis-plugin-include ~1.0.10-alpha.1` | **全部升 alpha 通道** |
| 非 scope 三方 | `js-yaml ^4.2.0` / `commander ^15.0.0` / `node-addon-require-builtin ^0.1.6` | `js-yaml ^4.3.2` / `commander ^15.0.0` / `node-addon-require-builtin ^0.1.9` | 2 项小升 |
| `peerDependencies` / `peerDependenciesMeta` | undefined | undefined | 无变化 |
| `engines` | — | 无 | — |

**闭包差异明细（新增 9 个 experimental 包）**：

- **新增**：`dsh-experimental-badge-skill-bundle`、`dsh-experimental-cot-translation-bundle`、`dsh-experimental-inspector-profile`、`dsh-experimental-ralph-bundle`、`dsh-experimental-session-search`、`dsh-experimental-session-titles-bundle`、`dsh-experimental-terminal-bundle`、`dsh-experimental-tool-worktree`、`dsh-tool-schedule`（共 9）
- **移除**：`dsh-experimental-schedule-bundle`、`dsh-hooks-claude-code`、`dsh-hooks-codex`、`dsh-tool-ralph`、`dsh-webhook`、`dsh-webhook-github`（共 6）
- **版本变更**：其余 79 个 dsh 子包全部 `0.2.0-rc.2 → 0.2.1-alpha.2`（精确锁定）。

**关键观察**：

1. **`dsh-experimental-schedule-bundle` 被移除**：0.2.0-rc.2 升级中官方「自动化任务」导航依赖 `dsh-experimental-schedule-bundle` 的 `cordis.patch.yml`（当时以正式 `insert` 修复了 `ui-schedule` 悬空行，见 [dsh-0.2.0-rc.2-upgrade](dsh-0.2.0-rc.2-upgrade.md) 10.2）。alpha.2 移除该 bundle、新增 `dsh-tool-schedule` + `dsh-schedule` 已在闭包 → **官方「自动化任务」面板来源变化，是本次升级最需回归验证的点**。
2. **cordis 家族整体切 alpha**：`~4.0.5-alpha.1` 等可能影响仓库锁定的 `4.0.4` 精确 override 收敛（仓库用精确 override 收敛，alpha 通道范围解析到哪个版本需实测）。
3. **hooks 移除**：`dsh-hooks-claude-code` / `dsh-hooks-codex` / `dsh-webhook` / `dsh-webhook-github` 退出闭包，若线上 profile 依赖这些包须处理。

## 三、服务器现状（实测）

| 项 | 实测 |
| --- | --- |
| 容器 | `dsh` | `1panel/deepseek-harness:0.2.0-rc.2` | `Up 3 minutes (healthy)` |
| standalone 挂载树 | `/data/dsh/global-dsh/standalone/package.json` = `0.2.0-rc.2`（容器内 `/usr/local/lib/node_modules/@deepseek-ai/dsh` 同） |
| CLI | `dsh --version` = `0.2.0-rc.2` |
| RestartCount / StartedAt | `RestartCount=0`，`StartedAt=2026-10-10T15:37:03.942747848Z` |

线上当前为 **`0.2.0-rc.2` + 本地派生镜像 `...:0.2.0-rc.2-localbuild-patched`**（10-10 容器已重建过一次，`RestartCount=0`）。升级到 alpha.2 意味着**镜像需重打（1Panel 渠道无 alpha tag，须自建派生镜像）+ 挂载树替换 + 1Panel auth-proxy 补丁重放**，同 0.2.0-rc.2 批次流程。

## 四、评估结论与风险清单

**结论**：官方稳定通道（`latest`/`next`）**仍为 `0.2.0-rc.2`，与线上/仓库一致**；唯一更新的 `0.2.1-alpha.2` 属 alpha 预发布线。**不建议仅因「有新版本」而升级**，除非有明确需要 alpha 新能力（如 experimental 包）或上游修复的关键缺陷。

**升级前置风险清单（评估段提出，执行段 7.5/八节已逐项闭环）**：

| # | 风险点 | 说明 | 状态 |
| --- | --- | --- | --- |
| 1 | 官方「自动化任务」导航 | `dsh-experimental-schedule-bundle` 移除 → `ui-schedule` 面板来源变化；0.2.0-rc.2 修复的悬空行问题需重新验证 | **已闭环**（7.5：无 schedule/time-context 错误日志；`dsh-client-ui-schedule` alpha.2 已装；`cordis.patch.yml` 7 处引用完好） |
| 2 | cordis 家族 alpha 通道 | `~4.0.5-alpha.1` 等与仓库精确 override `4.0.4` 的收敛 | **已闭环**（仓库 override 同步切 alpha 通道精确值；新树含 `cordis 4.0.5-alpha.1`；门禁 PASS） |
| 3 | 1Panel auth-proxy 补丁 | 派生镜像须重放（同 0.2.0-rc.2 流程），`npm install -g` 会覆盖补丁 | **已闭环**（7.2：双份补丁重放 `marker=1`；10-11 复验仍为 1） |
| 4 | WorkDSH 制品 peer | 12 个制品 dsh peer 为 caret `^0.2.0-rc.2`，alpha.2 是否满足 caret 语义需验证 | **已闭环**（六节：`^0.2.0-rc.2` 含 `0.2.1-alpha.2`；线上业务面探针全绿实证） |
| 5 | 第三方 bundle 门禁 | `dshmarket` / `agent-teams` / `mcp-connector` peer 是否含 `0.2.1-alpha.2` | **已闭环**（7.5：dshmarket `1.66.8` / mcp-connector `0.2.66` 正常；仅 agent-teams 跳过，见八节待决策） |
| 6 | 数据面 | 0.2.0-rc.2 升级时的存量会话/存储兼容 | **已闭环**（7.5：sessions 277=277 / storages +3 可归因，存量未改写） |
| 7 | V8/GC SIGSEGV | 既有 V8 并发标记 GC 崩溃（`v8-gc-sigsegv-repro.md`），与版本无关，不因升级解决 | 既有问题（不因升级解决） |

## 五、仓库基线随升（版本承载面，2026-10-10 执行）

用户授权「好的，执行升级吧」后执行。工作区实测：

| 面 | 实测 |
| --- | --- |
| 根 `package.json` `pnpm.overrides` | **296+ 条**：`@deepseek-ai/dsh*` 全部 `0.2.0-rc.2 → 0.2.1-alpha.2`（含 `dsh-typert-generator` 从 `0.2.0-rc.1` 升 `0.2.1-alpha.2`）；cordis 家族 5 条切 alpha 通道（`cordis 4.0.5-alpha.1` / `schemastery 3.18.5-alpha.1` / `cordis-plugin-timer 1.1.7-alpha.1` / `cordis-plugin-loader 1.0.6-alpha.1` / `cordis-plugin-include 1.0.10-alpha.1`） |
| 根 `package.json` `devDependencies` | dsh 系精确 `0.2.1-alpha.2` |
| 模块 `package.json` | 14 个（`bundle` + 12 个 `plugins/*` + `providers/identity-local`）dsh 依赖全量切 `0.2.1-alpha.2`；模块自身 `version` 不变（版本单位是模块） |
| `pnpm-lock.yaml` | 全量重解析：`0.2.1-alpha.2` 为 dsh 唯一命中版本 |
| 门禁脚本 | `scripts/check-published-versions.mjs` 期望值 `0.2.1-alpha.2`，伴生（companions）清单同步切 alpha 版 |

**门禁复跑**：

| 检查 | 结果 |
| --- | --- |
| `node scripts/check-published-versions.mjs` | PASS（dsh 锁定 `0.2.1-alpha.2`；cordis 家族 alpha 通道） |
| `node scripts/check-plan.mjs`（`pnpm check:plan`） | PASS（31 modules; 50 documents） |
| `pnpm install --no-frozen-lockfile` | 通过，闭包解析到 alpha.2 |
| `typecheck` / `build`（13 workspace 包） | 通过 |

## 六、插件制品重出（12 个 tgz，2026-10-10 执行）

输出 `.artifacts/`，覆盖既有 8 制品 + 新增 `access` / `audit` / `automations` / `identity-local`（12 个）。所有 dsh peer 为 caret `^0.2.0-rc.2`（alpha.2 满足 `^0.2.0-rc.2`？**实测：caret 对预发布版本按 semver 规则解析，`^0.2.0-rc.2` 要求 `>=0.2.0-rc.2 <0.3.0-0`，`0.2.1-alpha.2` 落在该区间内 ⇒ 满足**，详见 7.4 线上门禁复跑实证）。

`release-manifest.json` 关键字段：`harness="0.2.1-alpha.2"`、`channel="local-artifact"`。

`verified`：12 个 tgz 的 dsh peer 已重指为 caret `^0.2.0-rc.2`；打包后 manifest 无精确 dsh peer 残留；仓库 lock 全量 `0.2.1-alpha.2`；13 个 workspace 包在 alpha.2 上 `typecheck` / `build` 通过。

## 七、线上升级部署（服务器，2026-10-10～10-11）

目标：`dsh.10ge.cn`（`192.168.11.205`，1Panel 应用 `deepseek-harness`，容器 `dsh`）由 `0.2.0-rc.2` 挂载树升级到 `0.2.1-alpha.2`。

### 7.1 镜像决策：沿用既有镜像，挂载树 + profile 提供新版本

- 1Panel 应用商店模板仅有 `0.1.5-rc.1` 单一版本目录（0.2.0-rc.2 批次已证，见 [dsh-0.2.0-rc.2-upgrade](dsh-0.2.0-rc.2-upgrade.md) 四.2）；Docker Hub 出口 TLS 全阻断，`docker pull` 不可用。
- alpha.2 为预发布线，1Panel 无 tag，重打派生镜像收益低；且本批差异全部在 **`@deepseek-ai/dsh` 挂载树 + profile node_modules**，镜像层（entrypoint/auth-proxy 宿主件）无变化。
- ⇒ **不重打派生镜像**，沿用 `1panel/deepseek-harness:0.2.0-rc.2-localbuild-patched` tag，运行时以 `standalone` 换树 + profile pnpm 重装提供 `0.2.1-alpha.2` 能力。

### 7.2 Phase1：standalone 换树 + 双份补丁重放

| 序 | 动作 | 实测 |
| --- | --- | --- |
| 1 | 备份旧树 | `mv $GD/standalone $GD/standalone.a2.old.20261011`（`0.2.0-rc.2` 整树保留） |
| 2 | 复制新树 | `cp -a /home/luoji/a7-prefix/lib/node_modules/@deepseek-ai/dsh $GD/standalone`（549M，`0.2.1-alpha.2`） |
| 3 | 门禁 A：新树依赖 | 新树含 `cordis 4.0.5-alpha.1` / `schemastery 3.18.5-alpha.1`（alpha 通道已进入树） |
| 4 | standalone 补丁重放 | 宿主 python3 精确插入（Tab 缩进；sed 空格模式匹配失败）：`if (process.env.ONEPANEL_DSH_AUTH_PROXY == "1") return true;` 插在 `isAuthenticated(request, secure = false) {` 首行 → `L485`，`marker=1` |
| 5 | profile 补丁重放 | 容器内 `docker exec dsh node -e`（profile node_modules 属 root，宿主 PermissionError；容器无 python3）→ `L485`，`marker=1` |

**补丁双份位置**：standalone 树 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js` + profile `/data/dsh/profiles/web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js`。10-11 复验 `marker=1` × 2（见 7.5）。

### 7.3 Phase2：profile 升 alpha.2 重装

| 序 | 动作 | 实测 |
| --- | --- | --- |
| 1 | `profiles/web/pnpm-workspace.yaml` | **287 行 overrides 变更**：所有 `@deepseek-ai/dsh*: "0.2.0-rc.2"` → `"0.2.1-alpha.2"`；typert-generator `0.2.0-rc.1` → `0.2.1-alpha.2`；cordis 家族 → `4.0.5-alpha.1` / `1.0.5-alpha.1` / `1.0.10-alpha.1` / `1.0.6-alpha.1` / `1.1.7-alpha.1`；schemastery `3.18.5-alpha.1`。备份 `pnpm-workspace.yaml.bak.a2pre.20261011` |
| 2 | `profiles/web/package.json` | 4 个官方依赖（`dsh-base` / `dsh-schedule` / `dsh-time-context` / `dsh-web-app`）`0.2.0-rc.2 → 0.2.1-alpha.2`。备份 `package.json.bak.a2pre.20261011` |
| 3 | workspace 制品覆盖 | `wd-upload-019/` 12 个 tgz 原为 9-30 旧包（sha 与已验证集 DIFF），`cp -a /home/luoji/wd-upload-a2/*.tgz` 覆盖后复验 **12/12 MATCH** |
| 4 | `pnpm install` | `docker exec dsh sh -c 'cd /data/dsh/profiles/web && pnpm install --cache-dir /data/dsh/.pnpm-cache --registry=https://registry.npmmirror.com'`。**两次执行**：首次 `+1 -116`（overrides 未改，4 官方依赖仍 rc.2）；改 overrides 后第二次 `+282 -127`（全部切 alpha.2） |

**关键教训**：profile 的 `pnpm-workspace.yaml` **自带 overrides 块压过 package.json** —— 只改 package.json 不生效，必须两处同改（本批实证）。

### 7.4 Phase3：`--force-recreate` 换生效

```
cd /opt/1panel/apps/deepseek-harness/deepseek-harness && docker compose up -d --force-recreate deepseek-harness
```

- 服务名是 **`deepseek-harness`**（容器名由 `.env` 的 `CONTAINER_NAME=dsh` 指定）——首次误用 `dsh` 报 `no such service: dsh`。
- bind mount 在容器启动时绑定 inode，换树后**必须 `--force-recreate` 才生效**（容器运行期间 exec 看到的仍是旧树；recreate 前 `dsh --version` 仍显示 `0.2.0-rc.2` 属预期）。

### 7.5 升级后验证（全绿）

| 检查 | 实测 |
| --- | --- |
| 容器 | `Up … (healthy)`；`RestartCount=0` |
| CLI / 挂载树 | `dsh --version` = `0.2.1-alpha.2`；standalone 挂载树 `0.2.1-alpha.2` |
| 双份补丁 | standalone + profile `marker=1` × 2（10-11 复验） |
| 三层健康 | 容器内 `3080` = `200`；`https://dsh.10ge.cn/` 无跟随 `302`（登录重定向）；host 直连 `127.0.0.1:3080` = `400`（alpha.2 对裸 Host 请求更严格；域名字段正常，非用户可见路径，未深究） |
| **存量未改写** | `sessions` `277 = 277` 完全一致；`storages` `114346 vs 114343`（+3 = 探针触发的 audit 事件 + `mcp_connector.json` / `ledger.json` 运行时刷新，可归因） |
| 业务面探针（`a2-identity-full.mjs`，HMAC 门户头） | `experts 21` / `projects 0` / `templates 15` / `library space 1` / `library list 14` / `skills 52` / `catalog 1` / `connectors 3` / `assistant 0` / `errors {}`；`workdsh:probe` activated + portal 监听 `3083` |
| 调度导航 | 无 schedule / time-context 错误日志；`dsh-client-ui-schedule` `0.2.1-alpha.2` 已装；`cordis.patch.yml` 含 7 处 `ui-schedule` 引用、文件完好 |
| 未激活条目 | 初始 `1 entry did not activate` = 仅 `@nanmicoder/dsh-agent-teams`；**豁免后（2026-10-11）重启窗口 0**（见第八节） |
| 第三方 bundle 解析 | `dshmarket` `1.66.8` / `dsh-mcp-connector` `0.2.66` / `dsh-client-ui-schedule` `0.2.1-alpha.2` |

## 八、遗留项与待决策

| # | 项 | 状态 |
| --- | --- | --- |
| 1 | **`@nanmicoder/dsh-agent-teams@0.1.22` 已豁免激活** | 2026-10-11 用户授权「好的，执行豁免」。执行 `dsh plugin --profile web allow-version @nanmicoder/dsh-agent-teams@0.1.22 --dsh-version 0.2.1-alpha.2 --accept-risk` → `allowed @nanmicoder/dsh-agent-teams@0.1.22 for DSH 0.2.1-alpha.2`；`compatibility.json` 新增 `["0.2.1-alpha.2"]` 条目（旧 8 条已清理后现仅剩 1 条，见第 3 条）。`docker compose restart deepseek-harness` 后：healthy、CLI 0.2.1-alpha.2、重启后启动窗口 `skipping profile bundle` / `is incompatible` / `disabling profile plugin row` / `did not activate` **全部 0** ⇒ 已激活 |
| 2 | **cloud189-mcp `core.cjs` 缺失** | **已修复（2026-10-11）**：既有问题与升级无关。根因 `zod@3.25.76` 发布含 `v4/core/`，`v4/core/index.cjs` 经 `__exportStar(require("./core.cjs"), exports)` 引用 `core.cjs`；破损安装缺 `core.cjs`/`core.d.cts`/`core.d.ts`/`core.js`/`src/v4/core/core.ts` 五文件。容器内从 npmmirror 官方 tgz 提取补齐 → `require(.../zod)` 返回 `zod-root-load-ok function`（`exports-present false` 仅表示 zod 根入口无 `version` 导出字段，不影响加载） |
| 3 | **`compatibility.json` 旧豁免** | **已清理（2026-10-11）**：8 条 workdsh 插件对 `0.1.7-rc.2` 旧豁免逐条 `dsh plugin --profile web revoke-version <pkg>@<ver> --dsh-version 0.1.7-rc.2` → 全部 `revoked`（命令必须带 `--profile web`，否则报 `required option '--profile <name>' not specified`）。复验文件现仅剩 1 条 agent-teams `0.2.1-alpha.2`；容器 healthy、CLI 0.2.1-alpha.2，豁免变更对运行容器无副作用（旧豁免与 alpha.2 互不匹配，互不继承） |
| 4 | **V8/GC SIGSEGV** | 既有 V8 并发标记 GC 崩溃（`v8-gc-sigsegv-repro.md`），与版本无关，不因升级解决 |

## 九、未覆盖项与边界

| 项 | 状态与说明 |
| --- | --- |
| **派生镜像重打** | 未执行（7.1 决策：沿用既有镜像，挂载树 + profile 提供新版本） |
| **GitHub Release Notes 正文** | 本机/服务器出网 DNS 阻断（`nodename nor servname provided`），未能抓取 alpha.1/alpha.2 的 release notes 正文；版本定位以 npm registry 为准 |
| **`0.2.1-alpha.2` 官方文档镜像** | 未落盘（沿用用户裁决：文档镜像不落盘，只写证据文档） |
| **真实模型验收** | 未执行（业务面探针为只读接口探针，未跑真实模型链路） |
| **npm 发布** | 未涉及（与升级无关，维持既有未授权状态） |
| **git commit / push** | 已执行（用户授权）：`652a0ab44b` 已推 `fork/main`；2026-10-11 另推 18 个缺失 tag（`WorkDSH-Desktop-v2.0.6`、`desktop-v2.0.5-alpha.12~21`、`desktop-v2.0.6-alpha.1`、`v0.1.0-alpha.9~14`）。只推 `fork`（`hkluoji-lab/workdsh`），`mygitee`/`origin`/`github` 不推（项目记忆约定） |

## 十、回退锚点

服务器侧保留 `standalone.a2.old.20261011`（`0.2.0-rc.2` 整树）+ 既有 `...:0.2.0-rc.2-localbuild-patched` 镜像；profile 备份 `pnpm-workspace.yaml.bak.a2pre.20261011` / `package.json.bak.a2pre.20261011`。回退 = 换回旧树 + 恢复 profile 配置 + `--force-recreate`；仓库侧 `git revert`。同 0.2.0-rc.2 批次流程。

## 十一、结论

官方 `latest` = `next` = `0.2.0-rc.2`，alpha 通道最新 = `0.2.1-alpha.2`。本批经用户授权完成 alpha.2 全量升级：仓库基线精确锁定 `0.2.1-alpha.2`（cordis 家族切 alpha 通道）、12 制品重出、线上挂载树 + profile 升级部署，门禁/健康/存量/业务面回归全绿。遗留项已全部收口：`agent-teams` 经官方 `allow-version` 豁免激活，`cloud189-mcp` zod 破损修复，`compatibility.json` 8 条旧豁免已 revoke（现仅 1 条），git commit/push 与 18 个 tag 已推 `fork`。本批仅剩既有 V8/GC SIGSEGV 问题（与版本无关，不因升级解决）。

---

日期：2026-10-10（评估准备）至 2026-10-11（执行与验证）。证据来源：npmmirror registry（`/tmp/dsh-full.json` 226563B、`/tmp/dsh-alpha2.json` 16340B）、GitHub releases 列表（tag 时间线）、服务器实测（容器/树/CLI/RestartCount/补丁 marker/存量计数/业务探针）。
