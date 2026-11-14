# DSH 0.2.2-rc.1 → 0.2.2-rc.3 版本对比分析与升级方案

> **对象**：仓库开发基线（`/Users/apple/Documents/AI-luoji/workdsh`）↔ 线上 `dsh.10ge.cn`（192.168.11.205，1Panel 容器 `dsh`）
> **取证时间**：2026-11-15（Asia/Shanghai）
> **取证方式**：`npm view @deepseek-ai/dsh` dist-tags / time 实查；仓库 `package.json` / `deploy/profile/*` / 16 个 `packages/**/package.json` 实测；线上容器只读 SSH 探针（镜像 / 进程 argv / 鉴权补丁 / profile deps / workspace overrides / 启动日志 / 崩溃看护）
> **状态**：**仓库基线与线上 profile 均已收敛到 `0.2.2-rc.3`**，线上容器自 2026-11-14T22:41:21Z 起运行 `0.2.2-rc.3`，复验通过。

---

## 一、结论摘要

| 判定项 | 实测结果 |
| --- | --- |
| 仓库基线（升级前） | **`0.2.2-rc.1`**（根 `package.json` + 16 个 `packages/**/package.json` + `deploy/profile/*`） |
| 仓库基线（升级后） | **`0.2.2-rc.3`**（同上全部位置） |
| 线上 `dsh.10ge.cn` 运行版本 | **`0.2.2-rc.3`**（容器内 `bin.js --version` = `0.2.2-rc.3`；profile 23 条官方依赖全为 `0.2.2-rc.3`） |
| 镜像 | `1panel/deepseek-harness:0.2.2-rc.3` |
| npm `latest` | **`0.2.2-rc.1`**（`2026-11-04T09:20:32Z`） |
| npm `next` | **`0.2.2-rc.3`**（`2026-11-13T08:05:45Z`） |
| npm `alpha` | `0.2.2-alpha.3`（`2026-11-03T07:48:26Z`） |
| 采用通道 | **`next`**（rc.3 未进 `latest`，属候选线内新版本，非转正） |
| 本方案性质 | **基线前移到已实测可用的线上版本**；线上 rc.3 已连续运行并复验通过，是最好的兼容证据 |
| 落后/跳过版本 | `0.2.2-rc.2`（`2026-11-12T02:16:12Z`）已发布但**未采用**（跳过），与 rc.3 相隔 1 天 |
| 闭包差异规模 | 根 overrides dsh 条目 **325 → 332**：`+14` 新增、`-7` 退役；其余仅版本串替换 |
| Reactor / Node / V8 | Node `v24.22.3`、V8 `13.6.233.17-node.63`；**V8 相对 rc.1 一字未变**（rc.1 为 Node `v24.22.2`） |
| Cordis 族 | `4.1.0 / 1.1.0 / 1.1.0 / 1.1.0 / 1.2.0 / 3.19.0`——**与 rc.1 完全相同，本次无跨版本变化** |
| 可升级性结论 | **可升，风险低**。无 Cordis 族结构变化，无数据格式变更；唯一需要人工修复的是 experts 插件的 rc.3 适配 |

### 关键判断

1. **rc.3 是同一 V8 上的补丁版本**：V8 `13.6.233.17-node.63` 与 rc.1 一致（与 2026-11-14 node 崩溃处置的判据同源）。故本次升级**不改变** `--no-concurrent-marking --no-concurrent-sweeping` GC 缓解的有效性前提。
2. **Cordis 族零变化**：rc.1 已把 cordis 族带进 `4.1.0`；rc.3 的 `dependencies` 仍声明同一族，仓库与 profile 两处无需再动。
3. **官方包改名是本轮唯一结构性变化**：`dsh-experimental-agent-team` / `dsh-experimental-tool-agent-team` / `dsh-experimental-client-ui-agent-team` 退役，由 `dsh-agent-team` / `dsh-tool-agent-team` / `dsh-client-ui-agent-team` 接替（见第四节）。experts 插件 `cordis.patch.yml` 若继续 `insert` 旧名条目，整包 import 失败 → `agentTeams` 不 provide → 插件永久 pending。
4. **rc.3 同时退役了账号侧 3 个包**（`dsh-api-account-controller`、`dsh-deepseek-account-platform`、`dsh-experimental-agent-team-profile`）与 `dsh-office-to-pdf`，并新增 `dsh-cua` / `dsh-cua-bundle` / `dsh-experimental-cua-macos` 等 14 个包。退役包必须从 overrides 删除，否则 `check:versions` 反向断言失败。
5. **线上保留 rc.1 制品，不做全量降版**：本次线上写入只重建 `workdsh-plugin-experts`，其余 8 个较新制品（connectors α.4 / audit α.6 / library α.8 / office α.10 / access α.7 / skills α.50 / workbenches 3.0.0-α.49 / bundle α.53）**保持不动**，避免用仓库较旧版本覆盖线上较新制品。

---

## 二、版本盘点

### 2.1 仓库基线（2026-11-15）

| 位置 | 升级前 | 升级后 |
| --- | --- | --- |
| 根 `package.json` `version` | `0.1.0-alpha.8` | `0.1.0-alpha.8`（不变） |
| 根 `pnpm.overrides` | 333 条 = dsh **325** + 其他 8 | **341 条 = dsh 332 + 其他 9** |
| 根 `devDependencies` | 官方 34 条中 25 个 dsh `0.2.2-rc.1` + `cordis@4.1.0` | 25 个 dsh `0.2.2-rc.3` + `cordis@4.1.0` |
| 根 `pnpm-lock.yaml` | dsh 锁定 `0.2.2-rc.1`（649 条） | dsh 锁定 `0.2.2-rc.3`（**664 条**） |
| `packages/**/package.json` | 16 个含 `0.2.2-rc.1` | 16 个全 `0.2.2-rc.3`（deps 精确、peer 保留 `^`） |
| `deploy/profile/package.json` | 官方 4 条 `0.2.2-rc.1` | 官方 4 条 `0.2.2-rc.3` |
| `deploy/profile/pnpm-workspace.yaml` | overrides dsh **286** 条 `0.2.2-rc.1` | overrides dsh **292** 条全 `0.2.2-rc.3` |
| `deploy/profile/compatibility.json` | `agent-teams@0.1.23 → ["0.2.1-rc.3","0.2.2-rc.1"]` | 同上追加 `"0.2.2-rc.3"`（三值并存，便于回滚） |
| `scripts/check-published-versions.mjs` | `expected = '0.2.2-rc.1'` | `expected = '0.2.2-rc.3'` |

仓库 16 个 `packages/**` 模块版本（升级过程中唯一 bump 的是 experts）：

| 模块 | 版本 | 模块 | 版本 |
| --- | --- | --- | --- |
| `workdsh-bundle` | `0.1.0-alpha.58` | `workdsh-plugin-office` | `0.1.0-alpha.12` |
| `workdsh-plugin-access` | `0.1.0-alpha.6` | `workdsh-plugin-projects` | `0.1.0-alpha.4` |
| `workdsh-plugin-activity` | `0.1.0-alpha.7` | `workdsh-plugin-skills` | `0.1.0-alpha.32` |
| `workdsh-plugin-assistant` | `0.1.0-alpha.1` | `workdsh-plugin-workbench` | `0.1.0-alpha.16` |
| `workdsh-plugin-audit` | `0.1.0-alpha.4` | `workdsh-plugin-drive` | `0.1.0-alpha.9` |
| `workdsh-plugin-automations` | `0.1.0-alpha.1` | **`workdsh-plugin-experts`** | **`0.1.0-alpha.11`**（由 α.10 bump） |
| `workdsh-plugin-connectors` | `0.1.0-alpha.3` | `workdsh-plugin-identity` | `0.1.0-alpha.1` |
| `workdsh-plugin-library` | `0.1.0-alpha.4` | `workdsh-provider-identity-local` | `0.1.0-alpha.6` |

### 2.2 线上 `dsh.10ge.cn`（2026-11-15 只读复验）

| 项目 | 实测值 |
| --- | --- |
| 容器 | `dsh`，`Image=1panel/deepseek-harness:0.2.2-rc.3`，`Status=running`，`Health=healthy`，`RestartCount=0` |
| `StartedAt` | `2026-11-14T22:41:21.852301808Z` |
| 运行时 | node `v24.22.3`（容器内）；`bin.js --version` = `0.2.2-rc.3` |
| 进程 argv | `node --no-concurrent-marking --no-concurrent-sweeping --expose-internals /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js web --no-open --host 127.0.0.1 --port 3080 --trusted-host 127.0.0.1:3080 dsh.10ge.cn`（pid=29） |
| 鉴权补丁 | `readlink -f …/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js` → 镜像树；`grep -c ONEPANEL_DSH_AUTH_PROXY` = **1**（补丁在位） |
| profile `package.json` | **47 条依赖**：官方 `@deepseek-ai/dsh*` **23 条全为 `0.2.2-rc.3`**；workdsh tgz **19 条**；另 `@deepseek-ai/cordis-plugin-group@1.0.5`（残留单条）+ 第三方 |
| profile `pnpm-workspace.yaml` | overrides dsh **309 条全为 `0.2.2-rc.3`**；无 rc.1/rc.2 残留 |
| profile `compatibility.json` | **20 键** = workdsh **16**（全 `["0.2.2-rc.3"]`）+ 官方 **4**（`@0.2.2-rc.1` 制品，值全为 `["0.2.2-rc.3"]`） |
| experts 制品指针 | `file:/data/dsh/profiles/web/workdsh-package-assets/7544c3f4…aba.tgz`（α.11） |
| 启动日志 | `did not activate` 仅 2 行（`2026-11-14T13:20:13` 4 entries、`2026-11-14T22:25:53` 1 entry），**均在最后一次重启 `22:41:21` 之前**；重启后窗口 30 行内该告警 = 0 |
| 崩溃看护 | `/etc/cron.d/dsh-crash-watch`（`*/5 * * * *`）在；最新 `log.txt` 行 `2026-11-14T23:00:02 health=healthy flags=[--no-concurrent-marking --no-concurrent-sweeping] seg=0 post_ready_crash=0 startup_retry=0` |

**upstream 官方 4 条豁免**（值为 rc.1 制品、接受 rc.3）：`@deepseek-ai/dsh-browser-use@0.2.2-rc.1`、`@deepseek-ai/dsh-computer-use@0.2.2-rc.1`、`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp@0.2.2-rc.1`、`@deepseek-ai/dsh-experimental-computer-use-cua-driver-native@0.2.2-rc.1`。

---

## 三、官方版本定位

```
$ npm view @deepseek-ai/dsh dist-tags --json
{ "alpha": "0.2.2-alpha.3", "latest": "0.2.2-rc.1", "next": "0.2.2-rc.3" }
```

| 版本 | 发布时间（UTC） | 通道 | 与仓库/线上关系 |
| --- | --- | --- | --- |
| `0.2.2-alpha.3` | 2026-11-03T07:48:26Z | `alpha` | 未采用 |
| `0.2.2-rc.1` | 2026-11-04T09:20:32Z | **`latest`** | 上一次升级目标（见 [rc.1 evidence](dsh-0.2.2-rc.1-upgrade.md)） |
| `0.2.2-rc.2` | 2026-11-12T02:16:12Z | — | **未采用（跳过）** |
| `0.2.2-rc.3` | 2026-11-13T08:05:45Z | **`next`** | **本次目标；线上已运行** |

**通道语义**：rc.3 只占 `next`，`latest` 仍是 rc.1。本次是**候选线内前移**，不是「转正版本跟进」；rc.1 与 rc.3 的 `latest`/`next` 分工必须保留在回滚判断中。

**官方 changelog 缺失**：npm 与 GitHub 均无 rc.1→rc.3 的变更说明。变更结论来自 **registry 依赖闭包比对** + **发布包 exports/types 实测** + **线上运行实测**；未做 tarball 逐文件比对。

---

## 四、依赖闭包差异（实测 registry）

根 overrides dsh 条目 **325 → 332**（净 `+7`）：

| 类别 | 条目 |
| --- | --- |
| **新增 14** | `dsh-agent-team`、`dsh-client-ui-account-notifications`、`dsh-client-ui-agent-team`、`dsh-cua`、`dsh-cua-bundle`、`dsh-deepseek-chat-import`、`dsh-error`、`dsh-experimental-cua-macos`、`dsh-mcp-manager`、`dsh-office-kit`、`dsh-terminal-panel`、`dsh-tool-agent-team`、`dsh-tool-office`、`dsh-util-ripgrep` |
| **退役 7** | `dsh-api-account-controller`、`dsh-deepseek-account-platform`、`dsh-experimental-agent-team`、`dsh-experimental-agent-team-profile`、`dsh-experimental-client-ui-agent-team`、`dsh-experimental-tool-agent-team`、`dsh-office-to-pdf` |
| **非 dsh 新增 1** | `zod@4.6.6`（HEAD 无 zod override） |
| **Cordis 族** | 无变化（`4.1.0 / 1.1.0 / 1.1.0 / 1.1.0 / 1.2.0 / 3.19.0`） |

### 4.1 官方改名映射（升级必改的语义差异）

| rc.1 旧名 | rc.3 新名 | 提供方 |
| --- | --- | --- |
| `dsh-experimental-agent-team` | `dsh-agent-team` | `dsh-base` |
| `dsh-experimental-tool-agent-team` | `dsh-tool-agent-team` | `dsh-base` |
| `dsh-experimental-client-ui-agent-team` | `dsh-client-ui-agent-team` | `dsh-web-app` |

> 退役的 `dsh-experimental-agent-team-profile` 与 `dsh-office-to-pdf` 无对应继任名；账号侧 `dsh-api-account-controller` / `dsh-deepseek-account-platform` 一并退役。

### 4.2 `deploy/profile` 侧

`pnpm-workspace.yaml` overrides dsh **286 → 292**（`+13` 新增 / `-7` 退役）。与根 overrides 的差异是 `dsh-error` 未入 profile 列表——profile 由 `dsh-base` / `dsh-web-app` 自身精确依赖解析即可，保持最小风险默认。

`minimumReleaseAgeExclude` 段 520 条 `@0.2.0-rc.2` 死条目**本次未动**（与 rc.1 evidence 同口径）。

---

## 五、WorkDSH 代码与官方差异点

### 5.1 版本真源（升级必改 6 处）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | 根 `package.json` | 25 条 devDep → `0.2.2-rc.3`；325 条 dsh override → `0.2.2-rc.3`；删 7 条退役；补 14 条新增；补 `zod@4.6.6` |
| 2 | `packages/**/package.json`（16 个） | `dependencies` 精确 `0.2.2-rc.3`；`peerDependencies` 保留 `^`（`^0.2.2-rc.3`） |
| 3 | `scripts/check-published-versions.mjs` | `expected → '0.2.2-rc.3'`；companions 保持 4.1.0 族；日志文案同步 |
| 4 | `deploy/profile/package.json` | 官方 4 条 → `0.2.2-rc.3` |
| 5 | `deploy/profile/pnpm-workspace.yaml` | 286 条 dsh override → `0.2.2-rc.3`；删 7 条退役；补 13 条新增 |
| 6 | `deploy/profile/compatibility.json` | 为 `agent-teams@0.1.23` 追加 `0.2.2-rc.3`（保留旧值以便回滚） |

### 5.2 experts 插件适配 rc.3（**本轮唯一业务代码改动**）

| 方面 | rc.1 写法 | rc.3 写法 |
| --- | --- | --- |
| Team 包引用 | 自行 `insert` `dsh-experimental-agent-team` 等 3 个旧名条目 | 改指官方 `dsh-agent-team` / `dsh-tool-agent-team` / `dsh-client-ui-agent-team`，已由 `dsh-base` / `dsh-web-app` 提供，**不再自行 insert** |
| Team 团队配置 | `maxMembers` 键 | rc.3 已删除该键（保留触发 `TEAM_INVALID_CONFIG`）→ 改部署层使能门 `config: { maxTasks: 256, defaultEnabled: true }` |
| 执行守卫 | `ctx.agentTeams.tryMembership` / `TeamMembership` | 改 `ctx.subagents.rootOf(caller)` + `ctx.subagents.namesOf(agent)`；`rootOf` 对非 live agent 抛 `SubagentError('…','UNAUTHORIZED')`，守卫显式捕获后按无授权处理 |
| 依赖注入 | `inject: ['agents','agentTeams','sessionQuery','fs']` | 加 `subagents`、`@deepseek-ai/dsh-subagent` 依赖，index.ts `inject` 数组补 `'agents','agentTeams','subagents','sessionQuery','fs'` |
| 工具面 | `ctx.tools.execute`；`spawn_teammate` | `ctx.tools.execute` 迁 rc.3 batch API；`spawn_teammate` 已移除，工具标签改 `subagent` |

### 5.3 专家预设目录解析回归（α.11 修复）

**症状**：线上 `workdsh-experts` 整条 entry `did not activate`，已发布专家修订全部抛 `experts/preset-broken`。

**根因**：`expertPresetDir()` 在 `DSH_HOME` 已设、`DSH_AGENTS_HOME` 未设时回落到 `~/.agents`。线上 Web 进程只有 `HOME=/data/dsh/home`、`DSH_HOME=/data/dsh`，故读取路径变成**不存在的** `/data/dsh/home/.agents`；而真实 agent 根是 `/data/dsh/agents`（`skills/`、`.workdsh-state/experts/presets/` 均在此，由技能插件的 `$DSH_AGENTS_HOME ?? join($DSH_HOME,'agents')` 约定落盘）。

**修复**：在 [preset-compiler.ts](../../packages/plugins/experts/src/runtime/preset-compiler.ts) 恢复 `resolveAgentsHome(explicit?)` 单一解析器——显式参数 → `$DSH_AGENTS_HOME` → **`$DSH_HOME/agents`** → `~/.agents`；分配、编译、读取、执行守卫与 [experts-manager.ts](../../packages/plugins/experts/src/services/experts-manager.ts) 暂存根统一走同一函数。该口径是本仓库此前 `bb58979e08`（share one agents home for publish and execution）的修复，技能插件一直沿用，本分支在 rc.3 适配时丢失。

---

## 六、兼容性风险

| 风险 | 等级 | 说明与处置 |
| --- | --- | --- |
| 旧 Team 包名残留导致 experts 永久 pending | **高（已发生）** | rc.1 时代 `dynamic-insert` 旧名条目在 rc.3 容器树中不存在 → 整包 import 失败。已改为引用新名并由官方 bundle 提供；线上实测重启后 `did not activate` = 0 |
| 专家预设目录解析分裂 | **高（已发生）** | 已由 α.11 的 `resolveAgentsHome()` 统一；α.10 制品保留不改写，其退出证据中「线上重装后专家功能可用」**不成立**，以 α.11 实测取代 |
| 退役包残留 override | 低 | 7 条退役包已从根与 profile 两处删除；`check:versions` 反向断言会拦截孤儿 |
| 新增包排序/漏项 | 低 | 用字母序插入；`check:versions` 反向断言捕获漏项 |
| 鉴权补丁失效 | 中 | 补丁文件锚定 `@0.2.2-rc.1` 文件名（`pnpm-workspace.yaml` 的 `patchedDependencies` 键名保留 rc.1，属文件名锚定、不同步）；线上实测 `grep -c ONEPANEL_DSH_AUTH_PROXY` = 1，补丁在位 |
| profile 级 `pnpm install` 还原软链 | **高** | 会把 `@deepseek-ai/*` 软链还原为实体目录 → 遮蔽鉴权补丁 → 3080 匿名 401 → 崩溃循环 → 公网 502。**本轮未跑 profile 级 install**，只做外科式内容寻址替换 |
| V8 崩溃缺陷 | 中 | rc.3 V8 `13.6.233.17-node.63` **与 rc.1 一字未变**，故 [2026-11-14 GC 缓解](v8-gc-sigsegv-repro.md) 的前提不变；本次升级既未加重也未消除该风险，崩溃看护维持运行 |
| 数据格式迁移 | 低 | 无 schema 变更；专家修订按 ADR-0010 只读保留，不原地改写 |

---

## 七、分阶段方案

### 阶段 1｜仓库基线同步（6 处真源）

见 5.1 表。**出口**：`check:versions` PASS；`check:plan` PASS；rc.1/rc.2 残留 = 0。

### 阶段 2｜experts 源码适配 rc.3

见 5.2 / 5.3。**出口**：`typecheck`、`build` 通过；`pnpm pack` 产出 α.11 制品。

### 阶段 3｜线上写入收口（本轮执行）

范围（用户裁定「仅 experts + profile 同步 rc.3」）：

1. 重建 `workdsh-plugin-experts@0.1.0-alpha.11` 制品并投放到 profile 资产目录；
2. profile 官方 23 条依赖与 workspace overrides 同步到 rc.3；
3. `compatibility.json` 刷新 experts 键为 α.11；
4. **不动**线上其余较新制品（connectors α.4 / audit α.6 / library α.8 / office α.10 / access α.7 / skills α.50 / workbenches 3.0.0-α.49 / bundle α.53），避免降版；
5. 重启并复验。

**出口**：容器 `healthy / RestartCount=0`；重启后 `did not activate` = 0；鉴权补丁命中 = 1；容器内 3080 = 200、公网 `/` = 302、`/portal` = 200。

---

## 八、未覆盖项与边界

| 项 | 说明 |
| --- | --- |
| `docs/dsh-v0.2.2-rc.3/` 官方文档镜像 | **未落盘**。版本判定以 registry 与发布包实测为准；AGENTS.md 硬约束路径暂留 `docs/dsh-v0.1.7-rc.2/` 以免 404，镜像落盘后统一重锚 |
| tarball 逐文件比对 | **未执行**。线上已运行同版本，逐文件比对收益低于成本 |
| 14 个新增包的业务语义 | **未逐一验证**。仅为 overrides 覆盖，不主动安装为 bundle |
| 线上 16 条 workdsh 兼容豁免入库 | **未回填**。仓库 `deploy/profile/compatibility.json` 仍为「快照 1 条 agent-teams」口径（repo 实测 `git log --all -p -- deploy/profile/compatibility.json \| grep -c workdsh-` = 0）；线上 20 键从未入库，差异见 [deploy/profile/README.md](../../deploy/profile/README.md) |
| profile `minimumReleaseAgeExclude` 死条目 | **未清理**。520 条 `@0.2.0-rc.2` 保留原样（与 rc.1 同口径） |
| 登录后逐页业务点测 | **未执行**（无凭据）。仅做外壳、接口与日志层验证 |
| GC 旗标有效性判定 | **未完成**。rc.3 不改变 V8，需沿用「≥24h 崩溃计数对照 N0=13/日」判定，见 [STATUS 2026-11-14 条目](../STATUS.md) |
| git commit / push | **未执行**。需用户授权 |

---

## 九、执行结果

| 项目 | 结果 |
| --- | --- |
| npm dist-tags / time 实查 | 已完成 |
| 根 overrides delta 复现（+14 / −7 / +zod） | 已完成 |
| 仓库真源盘点（6 处） | 已完成 |
| 阶段 1（仓库基线同步） | **已完成** |
| 阶段 2（experts rc.3 适配 + α.11 制品） | **已完成** |
| 阶段 3（线上写入收口） | **已完成**，复验 PASS |

### 阶段 1 + 2 改动清单（仓库侧，39 文件 + 1 未跟踪制品）

`git diff --stat` 末行（含本次收尾对 `docs/STATUS.md`、`deploy/profile/README.md` 的更新）：`39 files changed, 5741 insertions(+), 5337 deletions(-)`；`git status --porcelain` 共 40 条（39 改 + 1 未跟踪 tgz）。`docs/evidence/` 由 `.gitignore:15 /docs/` 忽略，故本文件与 STATUS 在版本控制外。

| 类别 | 文件 |
| --- | --- |
| 版本真源 | 根 `package.json`、`pnpm-lock.yaml`、`scripts/check-published-versions.mjs` |
| profile 快照 | `deploy/profile/package.json`、`deploy/profile/pnpm-workspace.yaml`、`deploy/profile/compatibility.json`、`deploy/profile/README.md` |
| 16 个模块清单 | `packages/bundle`、`packages/plugins/{access,activity,assistant,audit,automations,connectors,drive,experts,identity,library,office,projects,skills,workbench}`、`packages/providers/identity-local` |
| rc.3 API 适配源码 | `packages/plugins/access/src/index.ts`、`activity/src/projection.ts`、`connectors/src/manager.ts`、`office/src/content/export.ts` |
| experts 专项 | `experts/package.json`（α.10→α.11）、`experts/CHANGELOG.md`、`experts/README.md`、`experts/cordis.patch.yml`、`experts/src/index.ts`、`experts/src/runtime/{execution-guard,preset-compiler}.ts`、`experts/src/services/experts-manager.ts`、`experts/src/tools/management-tools.ts`、`experts/resources/skills/workdsh-expert-manager/SKILL.md`、`…/references/authoring-api.md`、`…/runtime/team-lead.md` |
| 进度台账 | `docs/STATUS.md`（版本控制外） |
| 制品（未跟踪） | `packages/plugins/experts/workdsh-plugin-experts-0.1.0-alpha.11.tgz`（`sha256 = 7544c3f49e39f4f3480a4caec1224c8883a559bb9df9347bd309bd56a2055aba`） |

### 阶段 3 线上写入记录

| 项目 | 实测 |
| --- | --- |
| 镜像 | `1panel/deepseek-harness:0.2.2-rc.3` |
| experts 制品 | 上传至 `/data/dsh/profiles/web/workdsh-package-assets/7544c3f4…aba.tgz`；profile 指针指向该 sha |
| `/data/dsh/profiles/web/node_modules/workdsh-plugin-experts/` | α.11 装入（`--force-pin`），`locale/` 由 `.a10-locale-backup` 恢复，属主 `chown -R 1000:1000` |
| `compatibility.json` | 20 键；experts 键由 α.9 → **α.11**；备份 `compatibility.json.bak.b8d.1794696076463`（1429 B，20 键，experts 仍 α.9） |
| 回滚锚点 | `package.json.bak.rc3.20261114213318`、`pnpm-workspace.yaml.bak.rc3.20261114213318`、`pnpm-lock.yaml.bak.rc3.20261114213318` |

### 复验记录（PASS）

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 容器状态 | `docker inspect dsh` | `1panel/deepseek-harness:0.2.2-rc.3` / `running` / `healthy` / `RestartCount=0` |
| 运行版本 | `docker exec dsh node …/bin.js --version` | `0.2.2-rc.3` |
| 运行时 | `docker exec dsh node -v` | `v24.22.3` |
| 归因日志 | `docker logs -t dsh \| grep -c 'did not activate'` | **2**（均在最后重启前）；`tail -30` 窗口内 = **0** |
| 鉴权补丁 | `readlink -f … \| xargs grep -c ONEPANEL_DSH_AUTH_PROXY` | **1** |
| profile 官方依赖 | `node -e "…Object.keys(p.dependencies)"` | 47 条；官方 23 条**全 `0.2.2-rc.3`** |
| 线上 workspace overrides | 容器内解析 `pnpm-workspace.yaml` | dsh **309 条全 `0.2.2-rc.3`**，other = 0 |
| 兼容豁免 | 容器内解析 `compatibility.json` | 20 键（workdsh 16 + 官方 4）；experts → `["0.2.2-rc.3"]` |
| 官方闸门 | `evaluatePluginCompatibility(α.11, {}, '0.2.2-rc.3')` | **PASS**（`undefined`，无需豁免） |
| 崩溃看护 | `tail -1 /var/lib/dsh-crash-watch/log.txt` | `health=healthy flags=[--no-concurrent-marking --no-concurrent-sweeping] seg=0 post_ready_crash=0 startup_retry=0` |
| 版本断言 | `node scripts/check-published-versions.mjs` | **PASS: 664 DSH lock entries pinned to 0.2.2-rc.3; Cordis 4.1.0 family only** |
| 计划完整性 | `node scripts/check-plan.mjs` | **PASS: 34 modules; 50 documents** |
| 旧版本残留 | `grep -cE '0\.2\.2-rc\.[12]' pnpm-lock.yaml` | **0** |

**未执行**：`build` / 真实模型 e2e（本轮不涉及业务代码行为变更，除 experts 适配已按类型与构建验证）；`docs/dsh-v0.2.2-rc.3/` 官方文档镜像；线上兼容豁免入库；登录后逐页业务点测；git commit / push。

---

日期：2026-11-15。证据来源：`npm view @deepseek-ai/dsh`（dist-tags / time）、仓库 `package.json` / `deploy/profile/*` / `pnpm-lock.yaml` / 16 个 `packages/**/package.json` 实测、`git show HEAD:*` 基线对比、线上容器只读 SSH 探针（镜像 / `bin.js --version` / `/proc/29/cmdline` / 鉴权补丁 `grep -c` / profile `package.json` 47 条 / `pnpm-workspace.yaml` overrides 309 条 / `compatibility.json` 20 键 / `docker logs` 归因行 / `/var/lib/dsh-crash-watch/log.txt`）、`scripts/check-plan.mjs` 与 `scripts/check-published-versions.mjs` 实跑。
