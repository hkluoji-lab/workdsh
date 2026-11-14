# DSH 0.2.1-rc.3 → 0.2.2-rc.1 版本对比分析与升级方案

> **对象**：仓库开发基线（`/Users/apple/Documents/AI-luoji/workdsh`）↔ 线上 `dsh.10ge.cn`（192.168.11.205，1Panel 容器 `dsh`）
> **取证时间**：2026-11-10（Asia/Shanghai）
> **取证方式**：`npm view` dist-tags / time / dependencies 实查；331 个 `@deepseek-ai/dsh-*` 0.2.2-rc.1 目标包发布核验；线上容器只读 SSH 探针（挂载树、profile `package.json` / `pnpm-workspace.yaml`）
> **状态**：**仓库基线同步执行中**。线上容器与 profile **已运行 0.2.2-rc.1**（2026-11-08 完成），本方案是把仓库开发基线补齐到同一版本线。

---

## 一、结论摘要

| 判定项 | 实测结果 |
| --- | --- |
| 仓库开发基线 | **`0.2.1-rc.3`**（根 `package.json` + 16 个 `packages/**/package.json` + `deploy/profile/*`） |
| 线上 `dsh.10ge.cn` 实际运行版本 | **`0.2.2-rc.1`**（挂载树 `package.json` 实测；profile 39 条依赖中 23 个 `@deepseek-ai/dsh*` 全为 `0.2.2-rc.1`） |
| npm `latest` | **`0.2.2-rc.1`**，发布于 `2026-11-04T09:20:32Z` |
| npm `next` | `0.2.2-rc.1`（与 latest 同版） |
| npm `alpha` | `0.2.2-alpha.3` |
| 本方案性质 | **仓库基线向已知可用的线上版本收敛**，而非“跟随未知新版本”。线上 0.2.2-rc.1 已连续运行，是最好的兼容证据 |
| 落后中间版本 | `0.2.1-rc.4`（2026-10-26）、`0.2.1-rc.5`（2026-10-29）已发布但未被仓库或线上采用，**跳过** |
| 闭包差异规模 | 根 overrides dsh 条目 **301 → 325**：`+25` 新增包、`-1` 退役包（`dsh-client-ui-deepseek-model-label-1017`），其余仅版本串替换 |
| Cordis 族跨大版本 | `cordis 4.0.5→4.1.0`、`plugin-group 1.0.5→1.1.0`、`plugin-include 1.0.10→1.1.0`、`plugin-loader 1.0.6→1.1.0`、`plugin-timer 1.1.7→1.2.0`、`schemastery 3.18.5→3.19.0`（**根与 profile 两处都要改**） |
| 可升级性结论 | **可升，风险低**。线上已验证同版本可用；本轮改动集中在版本真源，无数据格式变更 |

### 关键判断

1. **这是“收敛”不是“追新”**：线上容器自 2026-11-08 起已运行 `0.2.2-rc.1`，仓库基线却停在 `0.2.1-rc.3`。两者分叉，仓库与线上不一致。
2. **官方通道已把 `0.2.2-rc.1` 置为 `latest` + `next`**：该版本已转正，不再是纯候选版。
3. **Cordis 族是本次唯一的结构性依赖变化**：从 `4.0.5` 族跨到 `4.1.0` 族。线上 profile 实测正是 `4.1.0 / 1.1.0 / 1.1.0 / 1.1.0 / 1.2.0 / 3.19.0`，可直接作为目标值。
4. **退役包处理有先例**：`dsh-client-ui-deepseek-model-label-1017` 官方仅发布到 `0.2.1-rc.5`，无 0.2.2 族。沿用 rc.2 evidence 的退役包处置（从 overrides 直接删除，否则 `check:versions` 反向断言失败）。

---

## 二、当前版本盘点

### 2.1 线上 dsh.10ge.cn（2026-11-10 只读复验）

| 项目 | 实测值 |
| --- | --- |
| 容器 | `dsh`，挂载树 `/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json` → **`0.2.2-rc.1`** |
| 挂载树内 `node_modules/@deepseek-ai/` | **330** 条目（其中 `dsh*` 319，另 11 个非 dsh：cordis 族 5 + schemastery + cosmokit + libreoffice-kit ×2 + node-addon-system ×2） |
| profile 目录 | `/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/profiles/web/` |
| profile `package.json` | **39 条依赖**：23 个 `@deepseek-ai/dsh*` 全为 `0.2.2-rc.1`；`cordis-plugin-group@1.0.5`（残留单条）；第三方 + workdsh tgz 若干 |
| profile `pnpm-workspace.yaml` | overrides **316 条**（dsh 309 + cordis 族/schemastery 6 + libreoffice-kit 1）；`allowBuilds` 存在；已无退役孤儿 |
| profile `dsh.profile.bundles` | 27 项；`patchReload` 见配置 |
| node_modules | 392 条目（已是完整安装形态，**非裸重建**） |
| 目录最后修改 | 2026-11-08 |

> **重要纠正**：上一轮 rc.3 evidence 记录的“线上是裸重建形态、无 node_modules”已不再成立。线上 profile 现为**完整安装形态**，且已运行 0.2.2-rc.1。

### 2.2 仓库基线（`/Users/apple/Documents/AI-luoji/workdsh`）

| 位置 | 现状 |
| --- | --- |
| 根 `package.json` devDependencies | 官方 **26 条**：25 个 `@deepseek-ai/dsh*@0.2.1-rc.3` + `@deepseek-ai/cordis@4.0.5` |
| 根 `package.json` `pnpm.overrides` | **309 条** = dsh **301** + cordis 族/schemastery **6** + prosemirror **2**；301 条 dsh 全部 `0.2.1-rc.3` |
| 根 `pnpm-lock.yaml` | dsh 条目 **301** |
| `packages/**/package.json` 含 `0.2.1-rc.3` | **16 个文件**（bundle、access、activity、assistant、audit、automations、connectors、drive、experts、identity、library、office、projects、skills、workbench、providers/identity-local） |
| `deploy/profile/package.json` | 官方 4 条 `0.2.1-rc.3`（`dsh-base` / `dsh-schedule` / `dsh-time-context` / `dsh-web-app`）+ 第三方 13 + workdsh 14 tgz |
| `deploy/profile/pnpm-workspace.yaml` | overrides **297 条** = dsh **289** + cordis 族/schemastery 6 + prosemirror 2；`minimumReleaseAgeExclude` 227 条 `@deepseek-ai/*@0.2.0-rc.2` 死条目（**本次不动**） |
| `deploy/profile/compatibility.json` | `@nanmicoder/dsh-agent-teams@0.1.23 → ["0.2.1-rc.3"]` |
| `scripts/check-published-versions.mjs` | `expected = '0.2.1-rc.3'`；companions 6 条为 4.0.5 族 |

### 2.3 本地预览 Profile

由 `pnpm preview:install` 维护，官方依赖同仓库基线 `0.2.1-rc.3`。升级后需重建。

---

## 三、官方版本定位

```
$ npm view @deepseek-ai/dsh dist-tags --json
{ "alpha": "0.2.2-alpha.3", "latest": "0.2.2-rc.1", "next": "0.2.2-rc.1" }
```

| 版本 | 发布时间（UTC） | 通道 | 与仓库/线上关系 |
| --- | --- | --- | --- |
| `0.2.1-rc.3` | 2026-10-23T07:54:30Z | — | **仓库当前基线** |
| `0.2.1-rc.4` | 2026-10-26T15:28:13Z | — | 未采用（跳过） |
| `0.2.1-rc.5` | 2026-10-29T14:15:23Z | — | 未采用（跳过） |
| `0.2.2-rc.1` | 2026-11-04T09:20:32Z | **latest + next** | **升级目标；线上已运行** |

**通道语义**：`0.2.2-rc.1` 同时占据 `latest` 与 `next`，已转正为当前稳定候选。

**官方 changelog 缺失**：npm 与 GitHub 均无 rc.3→0.2.2-rc.1 的变更说明。本报告的变更结论来自 **registry 依赖闭包比对** + **线上运行实测**；未做 tarball 逐文件比对（与线上同版本，无必要）。

---

## 四、依赖闭包差异（实测 registry）

`@deepseek-ai/dsh@0.2.2-rc.1` 顶层 `dependencies` **90 条**（rc.3 为 86 条）。

| 类别 | 变化 |
| --- | --- |
| 新增 4 条 | `dsh-experimental-forge-bundle`、`dsh-experimental-liveshare`、`dsh-official-bundles`、`dsh-personalized-recommendations`（均 `0.2.2-rc.1`） |
| 删除 | 0 条 |
| Cordis 族 | `cordis ~4.0.5 → ~4.1.0`；`plugin-timer ~1.1.7 → ~1.2.0`；`plugin-loader ~1.0.6 → ~1.1.0`；`plugin-include ~1.0.10 → ~1.1.0` |
| schemastery | `~3.18.5 → ~3.19.0` |
| 其余 | 版本串 `0.2.1-rc.3 → 0.2.2-rc.1`，无结构变化 |

### 4.1 根 overrides 目标集合（325 条）

用两种独立方法交叉确认：

1. **权威闭包复现**：以 `dsh@0.2.1-rc.3` 依赖闭包（301）为基，减去 1 个退役包，加入 25 个新增包 → 325。落盘 `/tmp/final-closure.json`（keys：`rc3=301`、`rc022=325`、`addList=25`、`removeList=1`）。
2. **容器树比对**：线上容器树除平台/内联差异外与 325 目标一致（无“在树不在目标”的包）。

**新增 25 条**（字母序）：`dsh-action-cards`、`dsh-client-ui-action-cards`、`dsh-client-ui-context-menu`、`dsh-client-ui-creation-recommendations`、`dsh-client-ui-file-actions`、`dsh-client-ui-file-drag`、`dsh-client-ui-plugin-recommendations`、`dsh-creation-recommendations`、`dsh-deliverable-file-references`、`dsh-experimental-client-ui-forge`、`dsh-experimental-client-ui-stats`、`dsh-experimental-forge`、`dsh-experimental-forge-bundle`、`dsh-experimental-forge-github`、`dsh-experimental-forge-session`、`dsh-experimental-liveshare`、`dsh-experimental-liveshare-protocol`、`dsh-fs-patch`、`dsh-message-quotes`、`dsh-official-bundles`、`dsh-personalized-recommendations`、`dsh-plugin-detail`、`dsh-plugin-recommendations`、`dsh-tool-executor-native`、`dsh-tool-executor-ptc`。

**退役 1 条**：`dsh-client-ui-deepseek-model-label-1017`（npm 仅到 `0.2.1-rc.5`，无 0.2.2 族；依据 rc.2 evidence 先例从 overrides 删除）。

### 4.2 发布核验

331 个 0.2.2-rc.1 目标包在 registry 上核验：`checked 331 | bad 0`（全部已发布）。落盘 `/tmp/pub-check.json`。

Cordis 族 6 个目标版本 registry 实测均已发布：`cordis@4.1.0`、`cordis-plugin-group@1.1.0`、`cordis-plugin-include@1.1.0`、`cordis-plugin-loader@1.1.0`、`cordis-plugin-timer@1.2.0`、`schemastery@3.19.0`。`cordis@4.1.0` 的 `dependencies` 为空（无传递依赖）。

---

## 五、WorkDSH 现有代码与官方差异点

### 5.1 版本真源缺口（**升级必改 6 处**）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | 根 `package.json` | 25 条 devDep → `0.2.2-rc.1`；301 条 dsh override → `0.2.2-rc.1`；cordis 族 6 条 → 4.1.0 族；**删除** 1017 override；**新增** 25 条 override |
| 2 | `packages/**/package.json`（16 个） | `dependencies` 精确 `0.2.2-rc.1`；`peerDependencies` 保留 `^`（`^0.2.2-rc.1`）；cordis peer `^4.0.5 → ^4.1.0` |
| 3 | `scripts/check-published-versions.mjs` | `expected → '0.2.2-rc.1'`；companions 6 条 → 4.1.0 族；日志文案同步 |
| 4 | `deploy/profile/package.json` | 官方 4 条 → `0.2.2-rc.1` |
| 5 | `deploy/profile/pnpm-workspace.yaml` | 289 条 dsh override → `0.2.2-rc.1`；cordis 族 6 条 → 4.1.0 族；**删除** 3 条不可解析孤儿 |
| 6 | `deploy/profile/compatibility.json` | 为 `agent-teams@0.1.23` 追加 `0.2.2-rc.1`（追加式，保留旧值以便回滚） |

### 5.2 profile 孤儿处置（实测 registry 发布状态）

| 包 | 0.2.2-rc.1 已发布？ | 处置 |
| --- | --- | --- |
| `dsh-client-ui-deepseek-model-label-1017` | 否（仅到 0.2.1-rc.5） | **删除** |
| `dsh-invariants` | 否 | **删除** |
| `dsh-subagent-in-process-driver` | 否 | **删除** |
| `dsh-hook-protocol` | 是 | 保留并升位 |
| `dsh-hooks-claude-code` | 是 | 保留并升位 |
| `dsh-hooks-codex` | 是 | 保留并升位 |
| `dsh-webhook` | 是 | 保留并升位 |
| `dsh-webhook-github` | 是 | 保留并升位 |
| `dsh-agent-tool-presentation` | 是 | 保留并升位（容器树中为孤儿，不在任何闭包） |

> **不新增** profile-closure 的 10 条：由 `dsh-base` / `dsh-web-app` 自身精确依赖解析即可（最小风险默认）。线上 profile 也只写了 309 条 dsh override，未写全闭包，佐证此口径。

### 5.3 线上派生补丁与第三方豁免

- 线上 profile 已随 2026-11-08 升级具备 0.2.2-rc.1 运行证据，本轮**不触碰线上**。
- `deploy/profile/compatibility.json` 仅登记 `agent-teams@0.1.23`。追加 `0.2.2-rc.1` 后，换版不会使该插件被闸门跳过。

---

## 六、兼容性风险

| 风险 | 等级 | 说明与处置 |
| --- | --- | --- |
| Cordis 4.0.5 → 4.1.0 跨次版本 | 中 | `cordis@4.1.0` `dependencies` 为空，`peerDependencies` 按大版本 `^4` 兼容；线上 profile 实测已在 4.1.0 族稳定运行 |
| 25 个新增 override 排序/漏项 | 低 | 用字母序插入；`check:versions` 反向断言会捕获漏项 |
| 退役包残留导致误解析 | 低 | 1017 从两处删除；`check:versions` 反向断言的“孤儿 override”逻辑会拦截 |
| `check-published-versions.mjs` companions 未同步 | 中 | 若 companions 仍写 4.0.5 族，锁文件解析到 4.1.0 会直接失败；必须同步 |
| 数据格式迁移 | 低 | 与当前线上同版本，线上已实际运行，无迁移事件 |
| 锁文件重装失败（网络/发布核验） | 低 | 331 目标包已核验发布；本地 `minimumReleaseAge` 不影响根 install |

---

## 七、分阶段方案

### 阶段 1｜仓库基线同步（6 处真源）

见 5.1 表。**出口**：`pnpm install --no-frozen-lockfile` 退出码 0；`check:versions` PASS；`check:plan` PASS。

### 阶段 2｜本地验证

- `check:versions` / `check:plan`
- 锁文件 dsh 条目 = 325；`grep -c "0.2.1-rc.3" package.json deploy/profile/pnpm-workspace.yaml` = 0
- **出口**：全 PASS。

### 阶段 3｜线上对齐（本轮不执行）

线上已运行 0.2.2-rc.1，无需换版；仅在后续产品层安装时按 `deploy/profile/*` 重装。**未授权前不动线上。**

---

## 八、未覆盖项与边界

| 项 | 说明 |
| --- | --- |
| tarball 逐文件比对 | **未执行**。线上已运行同版本，逐文件比对收益低于成本 |
| `docs/dsh-v0.2.2-rc.1/` 官方文档镜像 | **未落盘**。版本判定以 registry 与发布包实测为准；AGENTS.md 硬约束路径暂留 `docs/dsh-v0.1.7-rc.2/` |
| 25 个新增包的业务语义 | **未逐一验证**。仅为 overrides 覆盖，不主动安装为 bundle |
| 线上写入 | **未执行**。本轮仅改仓库文件，不动容器与 profile |
| AGENTS.md 基线版本号 | **待同步**。规则 2 仍写 `0.2.0-rc.2`，属历史遗留；用户确认后再改 |
| git commit / push | **未执行**。需用户授权 |

---

## 九、执行结果

| 项目 | 结果 |
| --- | --- |
| npm dist-tags / time / dependencies 实查 | 已完成 |
| 331 目标包发布核验 | 已完成（bad 0） |
| 根 overrides 闭包复现（325） | 已完成（双方法交叉确认） |
| 线上只读探针（挂载树 / profile pkg / workspace yaml） | 已完成 |
| 仓库真源盘点（6 处） | 已完成 |
| 阶段 1（仓库基线同步） | **已完成**（22 文件，见下） |
| 阶段 2（本地验证） | **已完成**（全 PASS，见下） |
| 阶段 3（线上对齐） | **未执行**（无需换版） |

### 阶段 1 改动清单（22 个文件）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | `docs/evidence/dsh-0.2.2-rc.1-upgrade.md` | 本证据文档（新建） |
| 2 | `package.json` | 326 处版本串替换；cordis 族 6 条升 4.1.0 族；删退役 1017；补 25 条 override；overrides 333 条（dsh **325**） |
| 3-18 | `packages/**/package.json`（16 个） | dependencies 精确 `0.2.2-rc.1`；peer 保留 `^`（119 条 `^0.2.2-rc.1`）；automations 的 `cordis-plugin-timer→1.2.0`、experts 的 `cordis-plugin-loader→1.1.0` |
| 19 | `scripts/check-published-versions.mjs` | `expected→'0.2.2-rc.1'`；companions 6 条→4.1.0 族；日志文案同步 |
| 20 | `deploy/profile/package.json` | 官方 4 条→`0.2.2-rc.1` |
| 21 | `deploy/profile/pnpm-workspace.yaml` | 289 条 dsh override→`0.2.2-rc.1`；cordis 族→4.1.0 族；删 3 条不可解析孤儿；dsh override **286** 条 |
| 22 | `deploy/profile/compatibility.json` | 追加 `0.2.2-rc.1`（保留 `0.2.1-rc.3` 便于回滚） |

### 阶段 2 验证记录

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 锁文件重装 | `corepack pnpm install --no-frozen-lockfile` | **退出码 0**，7.5s，pnpm 10.34.5 |
| 版本断言 | `corepack pnpm check:versions` | **PASS：649 DSH lock entries pinned to 0.2.2-rc.1；Cordis 4.1.0 family only** |
| 计划完整性 | `corepack pnpm check:plan` | **PASS：34 modules; 50 documents** |
| 0.2.1-rc.3 残留 | `grep -c` on `package.json` / profile 两文件 / `packages/**` | **全 0** |
| 锁文件 dsh 版本唯一性 | `grep -oE` on `pnpm-lock.yaml` | 唯一值 `0.2.2-rc.1` |
| 锁文件 cordis 族 | `grep -oE` on `pnpm-lock.yaml` | `cordis 4.1.0`、`plugin-group 1.1.0`、`plugin-include 1.1.0`、`plugin-loader 1.1.0`、`plugin-timer 1.2.0`、`schemastery 3.19.0` |

> 注：`check:versions` 报告 649 条 = 325 条 dsh override 在锁文件中被多版本上下文引用后的去重前计数（含 peer 解析），断言的是「每个 dsh 锁条目版本 == 0.2.2-rc.1」且「每个 override 都有对应锁条目」。workdsh 26 个本地包与 16 个 packages 的 peer/依赖均通过。

**未执行**：`build` / `typecheck` / 真实模型 e2e（本轮仅版本真源对齐，不涉及业务代码）；线上部署与 git 提交。

---

日期：2026-11-10。证据来源：`npm view @deepseek-ai/dsh`（dist-tags / time / dependencies）、331 目标包 registry 核验（`/tmp/pub-check.json`）、闭包复现（`/tmp/final-closure.json`）、线上容器只读 SSH 探针（挂载树 330 条目、profile `package.json` 39 条、`pnpm-workspace.yaml` 316 条 override）、仓库 `package.json` / `deploy/profile/*` / `packages/**/package.json` 实测。
