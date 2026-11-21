# DSH 0.2.2-rc.3 → 0.2.2-rc.5 版本对比分析与升级方案

> **对象**：仓库开发基线（`/Users/apple/Documents/AI-luoji/workdsh`）↔ 线上 `dsh.10ge.cn`（192.168.11.205，1Panel 容器 `dsh`）
> **取证时间**：2026-11-21（Asia/Shanghai）
> **取证方式**：`npm view @deepseek-ai/dsh` dist-tags / time / dependencies 实查；仓库 `package.json` / `deploy/profile/*` / 16 个 `packages/**/package.json` 实测；`docs/dsh-v0.2.2-rc.3` ↔ `docs/dsh-v0.2.2-rc.5` 镜像逐文件比对；线上容器只读 SSH 探针（镜像 / 进程 argv / 鉴权补丁 / profile deps / workspace overrides / entrypoint 派生副本 / 镜像源 tag 列表）
> **状态**：升级方案已定，按第七节分阶段执行。

---

## 一、结论摘要

| 判定项 | 实测结果 |
| --- | --- |
| 仓库基线（升级前） | **`0.2.2-rc.3`**（根 `package.json` + 16 个 `packages/**/package.json` + `deploy/profile/*`） |
| 仓库基线（升级后） | **`0.2.2-rc.5`** |
| 线上 `dsh.10ge.cn` 运行版本 | **`0.2.2-rc.3`**（容器内 `bin.js --version` = `0.2.2-rc.3`；profile 23 条官方依赖全为 `0.2.2-rc.3`） |
| 镜像 | `1panel/deepseek-harness:0.2.2-rc.3` |
| npm `latest` | **`0.2.2-rc.5`**（`2026-11-18T13:17:23Z`）——本轮 rc.5 **已转正到 `latest`** |
| npm `next` | **`0.2.2-rc.5`**（同上） |
| npm `alpha` | `0.2.2-alpha.3`（`2026-11-03T07:48:26Z`） |
| 采用通道 | **`latest`**（rc.5 同时占据 `latest` 与 `next`，本次是转正版本跟进，非候选线内前移） |
| 落后/跳过版本 | `0.2.2-rc.4`（`2026-11-17T17:03:03Z`）已发布但**未单独采用**（被 rc.5 覆盖），与 rc.5 相隔 1 天 |
| 闭包差异规模 | `dependencies` **91 → 91**：`+0` 新增、`-0` 退役；**83 条 `@deepseek-ai/dsh*` 仅版本串 `0.2.2-rc.3` → `0.2.2-rc.5`**；companions 与第三方依赖**零变化** |
| 官方升级指南 | 新增 **2 份**：`upgrade-guide/v0.2.2-rc.3/`（deepseek-refusal-code）、`upgrade-guide/v0.2.2-rc.4/`（web-search-deepseek-model-default） |
| engines | `node >=24.9.0`（**与 rc.3 完全相同**） |
| Cordis 族 | `~4.1.0 / ~1.1.0 / ~1.1.0 / ~1.1.0 / ~1.2.0 / ~3.19.0`——**与 rc.3 完全相同** |
| 可升级性结论 | **可升，风险低**。**纯补丁式同步升版，无包改名/退役/新增，预计无需业务代码适配**（与 rc.1→rc.3 那次结构变化完全不同） |

### 关键判断

1. **本轮是纯版本串替换**：rc.3 与 rc.5 的 `dependencies` 均为 91 条，新增 0 / 移除 0；差异集中在 83 个 `@deepseek-ai/*` 包的版本串与 8 条非 dsh 依赖（`js-yaml` / `commander` / `zod` 等）逐条比对后**一字未变**。不存在 rc.1→rc.3 那样的包改名（`dsh-experimental-agent-team` → `dsh-agent-team`）与退役，因此 **experts 等插件的 `cordis.patch.yml` 与业务代码无需适配**。
2. **Cordis 族与 engines 零变化**：`~4.1.0 / ~1.1.0 / ~1.1.0 / ~1.1.0 / ~1.2.0 / ~3.19.0` 与 `node >=24.9.0` 均与 rc.3 一致，`scripts/check-published-versions.mjs` 的 `companions` 断言无需改动，仅 `expected` 常量随基线前移。
3. **两份新升级指南均不影响本站**（见第五节）：`deepseek-refusal-code` 只影响 DeepSeek 流式拒绝错误码分类，仓库全量 `grep MALFORMED_RESPONSE|CONTENT_REFUSED` 无业务匹配；`web-search-deepseek-model-default` 只影响 `deepseek-official` / `deepseek-account` 路由上的 Web 搜索默认提供方，本站模型 provider 为 `gxw` 网关路由（见 `deploy/tools/workdsh-prompt-optimize/cordis.patch.yml`），非官方 DeepSeek 路由。
4. **镜像源已备好 rc.5**：`docker.1ms.run/v2/1panel/deepseek-harness/tags/list` 实测返回含 `0.2.2-rc.4`、`0.2.2-rc.5`；`docker.1panel.live` 仍 DNS 解析失败（daemon.json 只配了它），拉取需显式指定可用源。
5. **线上升级的高危点不变**：profile 级 `pnpm install` 会把 `@deepseek-ai/*` 软链还原为实体目录 → 遮蔽镜像内鉴权补丁 `ONEPANEL_DSH_AUTH_PROXY` → 3080 匿名 401 → 崩溃循环 → 公网 502。**线上升级不得盲跑 profile install**，只换 compose `image` 后 `--force-recreate`。

---

## 二、版本盘点

### 2.1 仓库基线（2026-11-21）

| 位置 | 升级前 | 升级后 |
| --- | --- | --- |
| 根 `package.json` `version` | `0.1.0-alpha.8` | 不变 |
| 根 `pnpm.overrides` | 341 条 = dsh **332** + 其他 9 | dsh **332** 全 `0.2.2-rc.5`（条目数不变） |
| 根 `devDependencies` | 官方 25 个 dsh `0.2.2-rc.3` + `cordis@4.1.0` | 25 个 dsh `0.2.2-rc.5` + `cordis@4.1.0` |
| 根 `pnpm-lock.yaml` | dsh 锁定 `0.2.2-rc.3` | dsh 锁定 `0.2.2-rc.5`（重生成） |
| `packages/**/package.json` | **16 个**含 `0.2.2-rc.3` | 16 个全 `0.2.2-rc.5`（deps 精确、peer 保留 `^`） |
| `deploy/profile/package.json` | 官方 4 条 `0.2.2-rc.3` | 官方 4 条 `0.2.2-rc.5` |
| `deploy/profile/pnpm-workspace.yaml` | overrides dsh **292** 条 `0.2.2-rc.3` | 292 条全 `0.2.2-rc.5` |
| `deploy/profile/compatibility.json` | `agent-teams@0.1.23 → ["0.2.1-rc.3","0.2.2-rc.1","0.2.2-rc.3"]` | 追加 `"0.2.2-rc.5"`（四值并存，便于回滚） |
| `scripts/check-published-versions.mjs` | `expected = '0.2.2-rc.3'` | `expected = '0.2.2-rc.5'` |

实测计数（`grep -c '0.2.2-rc.3'`，升级前）：

| 文件 | 命中数 | 说明 |
| --- | --- | --- |
| `pnpm-lock.yaml` | 3820 | 锁定条目，`pnpm install` 重生成 |
| 根 `package.json` | 357 | 25 devDeps + 332 overrides（值直方图 = 332 条全 `0.2.2-rc.3`） |
| `deploy/profile/pnpm-workspace.yaml` | 292 | overrides dsh |
| 16 个 `packages/**/package.json` | drive 42 / library 36 / experts 35 / projects 32 / automations 32 / office 23 / connectors 23 / skills 16 / assistant 16 / bundle 14 / workbench 12 / activity 12 / access 10 / identity 6 / audit 2 / identity-local 2 | deps + peer |
| `scripts/check-published-versions.mjs` | 5 | `expected` 常量（L5）+ 文案 |
| `deploy/profile/package.json` | 4 | 官方 4 条 |
| `deploy/profile/compatibility.json` | 1 | `agent-teams` 值数组 |

`deploy/profile/pnpm-workspace.yaml` 中 `patchedDependencies` 键锚定 `@deepseek-ai__dsh-client-connection@0.2.2-rc.1.patch`（**rc.1 文件名锚定，不同步**）；`minimumReleaseAgeExclude` 的 `0.2.0-rc.2` 死条目**保持不动**（与 rc.3 evidence 同口径）。

### 2.2 线上 `dsh.10ge.cn`（2026-11-21 只读探针）

| 项目 | 实测值 |
| --- | --- |
| 容器 | `dsh`，`Image=1panel/deepseek-harness:0.2.2-rc.3`，`Up 12 hours (healthy)` |
| 运行时版本 | `node /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js --version` = **`0.2.2-rc.3`** |
| compose `image` | `/opt/1panel/apps/deepseek-harness/deepseek-harness/docker-compose.yml:8` → `1panel/deepseek-harness:0.2.2-rc.3` |
| profile `package.json` | 官方 `@deepseek-ai/dsh*` **23 条全 `0.2.2-rc.3`** |
| profile `pnpm-workspace.yaml` | overrides dsh **309 条全 `0.2.2-rc.3`** |
| 鉴权补丁 | `ONEPANEL_DSH_AUTH_PROXY` 在镜像树 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js` 命中 **1 文件**（补丁在位） |
| entrypoint | `/usr/local/bin/docker-entrypoint.sh` 为 1Panel 派生副本（6910 B，`Nov 14 20:30`），宿主机挂载源 `data/dsh/tmp/docker-entrypoint.sh`；含 `start_dsh()` 重试、门户看护 3083、SSE 心跳 3081、`wait_for_port` |
| 镜像 tag 源 | `docker.1ms.run` 返回含 `0.2.2-rc.4`、`0.2.2-rc.5` |

---

## 三、官方版本定位

```
$ npm view @deepseek-ai/dsh dist-tags --json
{ "alpha": "0.2.2-alpha.3", "latest": "0.2.2-rc.5", "next": "0.2.2-rc.5" }

$ npm view @deepseek-ai/dsh time --json
0.2.2-rc.3  2026-11-13T08:05:45.455Z
0.2.2-rc.4  2026-11-17T17:03:03.170Z
0.2.2-rc.5  2026-11-18T13:17:23.604Z
```

| 版本 | 发布时间（UTC） | 通道 | 与仓库/线上关系 |
| --- | --- | --- | --- |
| `0.2.2-alpha.3` | 2026-11-03T07:48:26Z | `alpha` | 未采用 |
| `0.2.2-rc.3` | 2026-11-13T08:05:45Z | — | 上一次升级目标；**线上当前运行** |
| `0.2.2-rc.4` | 2026-11-17T17:03:03Z | — | **未单独采用（被 rc.5 覆盖）** |
| `0.2.2-rc.5` | 2026-11-18T13:17:23Z | **`latest` + `next`** | **本次目标** |

**通道语义**：rc.5 同时占据 `latest` 与 `next`，属**转正版本跟进**；rc.3 当时只占 `next`。故回滚时需注意 `latest` 已前移。

---

## 四、依赖闭包差异（实测 registry）

`npm view @deepseek-ai/dsh@{rc.3,rc.5} dependencies --json` 逐条比对：

| 类别 | 结果 |
| --- | --- |
| `dependencies` 条目数 | rc.3 **91** → rc.5 **91**（不变） |
| 新增 | **0** |
| 退役 | **0** |
| 版本发生变化 | **83** 条，全部为 `@deepseek-ai/dsh*`，`0.2.2-rc.3` → `0.2.2-rc.5` |
| 非 dsh 依赖变化 | **0**（`js-yaml ^4.3.2`、`commander ^15.0.0`、`zod` 等完全一致） |
| companions | `@deepseek-ai/cordis ~4.1.0`、`cordis-plugin-include ~1.1.0`、`cordis-plugin-loader ~1.1.0`、`cordis-plugin-timer ~1.2.0`、`@deepseek-ai/schemastery ~3.19.0`——**全部不变** |
| engines | `node >=24.9.0`——**不变** |

**结论**：rc.3 → rc.5 是**同结构补丁同步**，仓库侧只需把版本串从 `0.2.2-rc.3` 替换为 `0.2.2-rc.5`，overrides 条目集**不增不减**；`deploy/profile/pnpm-workspace.yaml` 的 overrides 条目集同样不增不减（292 条）。

---

## 五、官方升级指南核对（rc.5 镜像新增 2 份）

`docs/dsh-v0.2.2-rc.3` ↔ `docs/dsh-v0.2.2-rc.5` 逐文件比对（`diff -rq`）：除 `upgrade-guide/` 新增 `v0.2.2-rc.3`、`v0.2.2-rc.4` 两目录外，仅 3 组文件有改动：`config-catalog.{md,zh.md}`、`subsystems/web.{md,zh.md,i18n.yaml}`（内容为 `web.searchProvider` 默认值语义与 `llmProvider` 字段补记，与第二份指南同源）。

### 5.1 `v0.2.2-rc.3` → deepseek-refusal-code

- **变更**：DeepSeek 以 `stop_reason: "refusal"` 结束模型流时，DSH 在 LLM 错误 finish 与失败轮次 `turn/end` error 中报告 `CONTENT_REFUSED`（此前报 `MALFORMED_RESPONSE`）。
- **迁移**：①在分类 LLM 错误 finish 或 `turn/end` error 的代码中处理 `CONTENT_REFUSED`；②回放以 `refusal` 结束的 Messages 流验证。
- **本站影响**：**无**。仓库全量 `grep MALFORMED_RESPONSE|CONTENT_REFUSED`（ts/tsx/json/yaml/yml/mjs）**业务代码零匹配**（仅 `pnpm-lock.yaml` 等依赖清单命中同名包名）。WorkDSH 不实现自有错误码分类器，走官方底座。

### 5.2 `v0.2.2-rc.4` → web-search-deepseek-model-default

- **变更**：共享 base 组合不再固定 `web.searchProvider = deepseek-search-api`，改由 `dsh-web` 按模型 provider 路由选择。`deepseek-official` / `deepseek-account` 路由上的模型请求所发起的搜索运行 `deepseek-official` 提供方（对 `web-search-deepseek` 端点的辅助 Messages 请求，不按次收费、按模型 token 计费，并追加 `web/deepseek-search-llm-request` 事件）；其他路由或模型请求之外的搜索仍运行 `deepseek-search-api`。
- **迁移**：①接受新默认（不做改动）；②想对所有模型保留 DeepSeek Search API → 在菜单选 DeepSeek Search API 保存，或 `config.searchProvider: deepseek-search-api`；③想经网关走 Messages 搜索 → 选 DeepSeek server-side search 并填网关 Anthropic 兼容 base URL（到 `/messages` 之前）。
- **本站影响**：**无**。本站模型 provider 为 `gxw` 网关路由（`deploy/tools/workdsh-prompt-optimize/cordis.patch.yml` 注释明确 `deepseek-official` 是 api-key provider、`deepseek-account` 需登录态），非 `deepseek-official`/`deepseek-account` 路由；搜索落到「其他路由 → `deepseek-search-api`」分支，行为与升级前一致。若后续人为把模型切到官方 DeepSeek 路由，再按迁移步骤 ②/③ 处理。

---

## 六、兼容性风险

| # | 风险 | 判据 | 处置 |
| --- | --- | --- | --- |
| 1 | **profile 级 `pnpm install` 遮蔽鉴权补丁** | 既往证据：软链还原实体目录 → `ONEPANEL_DSH_AUTH_PROXY` 被遮蔽 → 3080 匿名 401 → 崩溃循环 → 502 | 线上**只换 compose `image`**，不跑 profile install；`--force-recreate` 后 `grep -c ONEPANEL_DSH_AUTH_PROXY` 必须 = 1 |
| 2 | 1Panel 派生 entrypoint 与 rc.5 镜像原生 entrypoint 不兼容 | 派生副本由 rc.3 镜像增量生成；rc.5 镜像原生 entrypoint 可能变化 | 升级前核对 rc.5 镜像原生 `/usr/local/bin/docker-entrypoint.sh` 与派生副本的 `start_dsh`/门户/SSE 差异；宿主机挂载副本优先 |
| 3 | `docker.1panel.live` DNS 失败 | daemon.json 只配该源 | 拉取显式走 `docker.1ms.run` 或 `hub.rat.dev`；或先 `docker pull` 指定源后改 tag |
| 4 | V8 GC SIGSEGV 缓解前提 | `--no-concurrent-marking --no-concurrent-sweeping` 有效性依赖 Node/V8 版本 | rc.5 engines 与 rc.3 同为 `node >=24.9.0`；派生 entrypoint 保留该 GC 参数与 `start_dsh` 重试，前提不变 |
| 5 | 回滚路径 | `latest` 已前移到 rc.5 | 保留 rc.3 镜像 tag 与 profile 备份（`package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml` / `compatibility.json` / compose）；回滚 = compose `image` 改回 rc.3 + `--force-recreate` |

---

## 七、分阶段方案

### 阶段 1｜仓库基线同步

1. 根 `package.json`：25 条 devDeps + 332 条 dsh override → `0.2.2-rc.5`。
2. 16 个 `packages/**/package.json`：`dependencies` 精确 `0.2.2-rc.5`，`peerDependencies` `^0.2.2-rc.5`。
3. `scripts/check-published-versions.mjs`：`expected → '0.2.2-rc.5'`；`companions` 保持 4.1.0 族；文案同步。
4. `deploy/profile/package.json`：官方 4 条 → `0.2.2-rc.5`。
5. `deploy/profile/pnpm-workspace.yaml`：292 条 dsh override → `0.2.2-rc.5`。
6. `deploy/profile/compatibility.json`：`agent-teams@0.1.23` 追加 `0.2.2-rc.5`（保留旧值）。
7. 操作性文档中 `docs/dsh-v0.2.2-rc.3` 路径引用重锚到 `docs/dsh-v0.2.2-rc.5`（AGENTS.md、HARNESS-OFFICIAL-DEVELOPMENT.md、各 `docs/design/**`、ADR 等）；**历史证据文档 `docs/evidence/dsh-0.2.2-rc.3-upgrade.md` 与 `docs/dsh-v0.2.2-rc.3/` 镜像目录保持不动**。

### 阶段 2｜门禁

1. `corepack pnpm install`（重生成 `pnpm-lock.yaml`）。
2. `node scripts/check-published-versions.mjs`（PASS：锁定 rc.5；Cordis 4.1.0 族 only）。
3. `node scripts/check-plan.mjs`。
4. `build` / `typecheck` / 相关 `test`。

### 阶段 3｜线上写入

1. 备份 `data/dsh/profiles/web/`（4 文件）与 compose。
2. compose `image` 改 `1panel/deepseek-harness:0.2.2-rc.5`。
3. 经可用镜像源拉取（`docker.1ms.run`）。
4. 核对 rc.5 镜像原生 entrypoint 与派生副本兼容、鉴权补丁在镜像树内。
5. `docker compose up -d --force-recreate`。
6. 复验：`127.0.0.1:3080` = 200、`did not activate` = 0、`healthy`/`RestartCount=0`、公网 `/` = 302、`ONEPANEL_DSH_AUTH_PROXY` 命中 = 1。

### 阶段 4｜回填与排查

1. 回填 `docs/STATUS.md`（新增条目）与 `docs/MODULE-VERSIONS.md`（如有模块版本引用）。
2. 排查 `dsh.10ge.cn` / `zq.10ge.cn` 的 502（先给方案；隧道侧改动需用户授权）。

---

## 八、未覆盖项与边界

- **未做 tarball 逐文件比对**：依赖结论来自 registry 元数据闭包比对，非发布包内容 diff。（阶段 2 已对 20 个官方包做 `lib/` 逐包 byte-diff 补充验证，见第九节 9.2。）
- **未在升级前实测 rc.5 镜像的 1Panel 派生 entrypoint 兼容性**：留待阶段 3 步骤 4 现场核对（已执行，见 9.3）。
- **未验证 rc.4 单版本**：rc.4 被 rc.5 覆盖，未单独评估。
- **未回填仓库 `compatibility.json`**：仓库仍为「1 条 agent-teams」快照口径，线上 20 键（16 workdsh + 4 官方）的豁免差异**未回填仓库**，与 rc.3 轮次同口径（见 9.4）。
- **未执行**：npm 发布、`git commit`/`push`（按硬约束不自动执行）。

---

## 九、执行结果

> 执行时间：2026-11-21（Asia/Shanghai）。全部通过 SSH 只读/受控写入完成；**未自动 commit / push / 发布 npm**。

### 9.1 阶段 1｜仓库基线同步（PASS）

- 6 处版本真源全部 `0.2.2-rc.3` → `0.2.2-rc.5`：根 `package.json`（25 devDeps + 332 overrides）、16 个 `packages/**/package.json`、`scripts/check-published-versions.mjs`（`expected`）、`deploy/profile/package.json`、`deploy/profile/pnpm-workspace.yaml`（292 条）、`deploy/profile/compatibility.json`（`agent-teams@0.1.23` 追加 `0.2.2-rc.5`，四值并存）。
- 版本 pin 实跑：**PIN total = 971**（临时脚本 `/tmp/rc5-pins.mjs`，未入库）。
- 操作性文档镜像路径重锚 `docs/dsh-v0.2.2-rc.3` → `docs/dsh-v0.2.2-rc.5`；**历史证据文档与 rc.3 镜像目录保持不动**。
- 仓库本轮改动**零源码 `.ts`**，仅版本串 + 文档重锚。

### 9.2 阶段 2｜门禁（PASS，测试失败定性为升级前既有）

- `corepack pnpm install --no-frozen-lockfile` → 退出码 **0**（`pnpm-lock.yaml` 重生成）。
- `node scripts/check-published-versions.mjs` → **PASS**。
- `node scripts/check-plan.mjs` → **PASS**。
- `corepack pnpm build` → 退出码 **0**（`grep -ciE '^(error|.*: error)'` = 0）。
- `corepack pnpm typecheck` → 退出码 **0**。
- `corepack pnpm test:integration` → **20 个失败**，**定性为升级前既有、非 rc.5 引入**：
  - 证据①：rc.3↔rc.5 全部相关官方包 `lib/` 逐包 byte-diff（`/tmp/cmpall.sh`）**仅 3 个包有差异**——`dsh-llm`（`lib/index.js` / `lib/types/error.js` 各加一行 `CONTENT_REFUSED: {}`）、`dsh-session-persistence-jsonl`（`worker.cjs` 同名枚举）、`dsh-api-remotes`（`client.js` 仅 sourcemap 行号注释 `line:152`→`line:174`）；其余（`dsh-subagent`/`dsh-agent-team`/`dsh-tool-agent-team`/`dsh-client-ui-agent-team`/`dsh-skill-filesystem`/`dsh-tool-skill`/`dsh-office-kit`/`dsh-tools`/`dsh-session`/`dsh-agent`/`dsh-agent-loop` 等）byte-identical。
  - 证据②：本轮仓库改动零源码 `.ts`，仅为版本串 + 文档。
  - 证据③：rc.3 迁移 commit `912d52a09b` 改了 experts 源码（`ctx.subagents.rootOf/namesOf`）但 `git show --name-only 912d52a09b | grep '^tests/'` **为空**——未同步 `tests/integration/*` 中仍 mock rc.1 时代 `ctx.agentTeams.tryMembership` 的 fixture。
  - 失败文件：`expert-manager.test.mjs`、`office-content.test.mjs`、`office-download.test.mjs`、`skill-creator-host.test.mjs`、`skill-persistence.test.mjs`、`skill-session.test.mjs`、`tool-access-bridge.test.mjs`。
  - **未修复**，待用户决定是否本轮修复。
- `check:acceptance` 因缺 phase 参数报用法错误（非回归，未计入）。

### 9.3 阶段 3｜线上写入（PASS）

- 备份：`.upgrade-rc5-$TS/docker-compose.yml` + `profile-{package.json,pnpm-workspace.yaml,pnpm-lock.yaml,compatibility.json,cordis.patch.yml}`。
- compose `image`：`1panel/deepseek-harness:0.2.2-rc.3` → `0.2.2-rc.5`（`/opt/1panel/apps/deepseek-harness/deepseek-harness/docker-compose.yml`）。
- 拉取：经 `docker.1ms.run` 拉取 rc.5（2.09 GB，~150–350 KiB/s，耗时约 40 分钟；`docker.1panel.live` 仍 DNS 失败），本地 tag 为 `1panel/deepseek-harness:0.2.2-rc.5`。
- **entrypoint 兼容核对（PASS）**：rc.5 镜像原生 `/usr/local/bin/docker-entrypoint.sh` 与 rc.3 原生**同 sha256**（byte-identical）→ 宿主机挂载的 1Panel 派生副本继续兼容，GC 旗标与 `start_dsh` 重试前提不变。
- **鉴权补丁核对（PASS）**：rc.5 镜像树 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js` 中 `ONEPANEL_DSH_AUTH_PROXY` 命中 = **1**。
- **运行对象解析核对**：容器进程 argv 为 `/usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js`（镜像树），profile 内 `@deepseek-ai/*` 为**绝对路径软链**指向镜像树 `…/dsh/node_modules/@deepseek-ai/*`；镜像换版即同步前移（容器内实测 `dsh-web-app`/`dsh-agent`/`dsh-session`/`dsh-tools`/`dsh-brand`/`dsh-computer-use` 全部 = **`0.2.2-rc.5`**）。
- `docker compose up -d --force-recreate` → 容器 `running (healthy)`，`RestartCount=0`，`bin.js --version` = **`0.2.2-rc.5`**，容器内 `127.0.0.1:3080` = **200**，宿主机 `https://127.0.0.1:3090` = **200**，公网 `https://dsh.10ge.cn/` = **302 → /portal → 200**。

#### 9.3.1 升级中发现的真实回归与修复（官方可选行被禁用）

- **现象**：首次 `--force-recreate` 后，全部 20 个 profile 插件行被禁用（`did not activate`），因为 profile `compatibility.json` 的 20 个键值**只含 `["0.2.2-rc.3"]`**，运行时已是 rc.5 → 精确版本豁免无匹配 → 官方闸门整体跳过。此为**线上 profile 数据未随镜像前移**，非仓库缺陷。
- **修复①**：将 20 个键值逐一追加 `"0.2.2-rc.5"`（保留 rc.3 便于回滚）→ 重启后 `workdsh-bundle` 与 16 个 workdsh 插件全部恢复，`did not activate` = 0。
- **修复②（真实回归）**：仍有 **3 个官方可选行**（`dsh-browser-use`、`dsh-experimental-browser-use-playwright-mcp`、`dsh-experimental-computer-use-cua-driver-native`）被禁用。根因：这 3 个包**不在任一镜像树内**，而是 profile 内**实体 rc.3 目录**（由 `workdsh-bundle` 声明），其 `dsh` 需求精确锁 `0.2.2-rc.3`；rc.3 时代需求匹配故可用，rc.5 时代失配 → 禁用。且其豁免键仍是**陈旧的 `@0.2.2-rc.1`** 后缀，无匹配。经 `npm pack` 比对确认这 3 个包 rc.3↔rc.5 **仅 `package.json` 版本串不同、`lib/` byte-identical**。
- **修复动作**：把 3 个陈旧键 `@…@0.2.2-rc.1` 改为实际安装版本 `@…@0.2.2-rc.3`，并追加 `0.2.2-rc.5` 目标 → 重启后 **0 禁用 / 0 跳过 / 0 `did not activate`**。
- **回归判据（升级引入，非既有）**：`docker logs -t` 中 `< 13:30` 的 `disabling profile plugin row` 计数 = **0**；升级后 = **3**。修复后 = **0**。
- 备份：`compatibility.json.bak.rc5.<ts>`（改键前）。

#### 9.3.2 复验结果（PASS）

| 检查项 | 结果 |
| --- | --- |
| 容器 | `1panel/deepseek-harness:0.2.2-rc.5` / `running (healthy)` |
| `RestartCount` | **0** |
| `bin.js --version` | **`0.2.2-rc.5`** |
| 容器内 `127.0.0.1:3080` | **200** |
| 宿主机 `https://127.0.0.1:3090` | **200** |
| 公网 `https://dsh.10ge.cn/` | **302 → /portal → 200** |
| `ONEPANEL_DSH_AUTH_PROXY` 命中 | **1** |
| 重启后 `did not activate` / `disabling row` / `skipping bundle` | **0 / 0 / 0** |
| `--since <StartedAt>` 口径复测（`StartedAt=2026-11-21T13:48:31Z`） | `disabling profile plugin row` = **0**、`did not activate` = **0**、`skipping profile bundle` = **0**（不依赖时间窗猜测，直接以容器启动时刻为下界） |
| 插件自检 | `[workdsh:probe] activated`、`[skillhub] self-check ok` |
| profile `compatibility.json` | 20 键**全部**含 `0.2.2-rc.5`（`keys missing rc.5 = []`） |
| 公网复核 | `https://dsh.10ge.cn/` = **302**、`/portal` = **200**；`https://zq.10ge.cn/` = **302** |

### 9.4 阶段 4｜502 排查（已定位，非升级缺陷）

- **`dsh.10ge.cn`**：公网 `/` 与 `/api/workdsh-connectors` 均 **302/200** 正常；`cloudflared` `active`（remote-managed，`--protocol quic`，本地 `/etc/cloudflared/config.yml` 不生效）。日志中的 `Unable to reach … dial tcp 192.168.11.205:3090: connect: connection refused` **全部落在容器重启窗口**（13:48:37–38，共 86 条）；`--since 13:49:30` 计数 = **0**。宿主机 `3090` 由 `docker-proxy` 正常监听（`0.0.0.0:3090->8443`），`127.0.0.1:3090` 与 `192.168.11.205:3090` 均 200。**结论：502 是升级重启的瞬时现象，重启完成后自动消失，无需改隧道。**
- **`zq.10ge.cn`**：公网 `/` = **302**（正常）。历史 `tls: first record does not look like a TLS handshake` 属该隧道另一链路（明文 8082/8088 + https origin 配置），**与本轮升级无关，未改动**。
- **未执行**：隧道 ingress 配置变更（remote-managed，属外部账号，按硬约束需用户单独授权）。

### 9.4.1 阶段 5｜`tests/integration` 既有失败修复（PASS）

- **定性**：这 20 个失败**非 rc.5 引入**，根因是 rc.2/rc.3 官方接口迁移后 `tests/` fixture 未同步（旧单调用工具形状、`sessionController.inspect`、`agentTeams.tryMembership`、`spawn_teammate`）。修复方向 = 更新测试适配新官方接口，**未回滚任何 `packages/plugins/**/src` 适配代码**。
- **依赖补充**：根 `package.json` devDependencies 新增 `@deepseek-ai/dsh-tool-executor-native`（`0.2.2-rc.5`）。rc.2 官方迁移指南明确「原生/PTC 执行分别要求 `dsh-tool-executor-native`/`dsh-tool-executor-ptc`；内置 profile 已挂载，**自定义组合必须添加一个**」。此前该包仅在 `pnpm.overrides` 中声明版本约束，未列入根依赖，导致测试自建 Cordis 组合无法解析 executor。
- **改动清单（仅 `tests/` 与根依赖）**：
  | 文件 | 改动 |
  | --- | --- |
  | `package.json` / `pnpm-lock.yaml` | 新增 `@deepseek-ai/dsh-tool-executor-native@0.2.2-rc.5` |
  | `tests/helpers/skill-runtime.mjs` | 转出新 executor 模块供各 fixture 复用 |
  | `tests/helpers/skill-persistence-worker.mjs` | 组合中挂载 `nativeToolExecutor` |
  | `tests/integration/skill-session.test.mjs` | 组合中挂载 `nativeToolExecutor` |
  | `tests/integration/skill-creator-host.test.mjs` | 挂载 `nativeToolExecutor`；`runTool` 改批次契约 |
  | `tests/integration/office-content.test.mjs` | 3 处 executor mock 改批次契约（`calls`/`results[].result`/`additionalContexts`） |
  | `tests/integration/office-download.test.mjs` | 3 处 executor mock 改批次契约；移除已不存在的 `input.parent` 断言 |
  | `tests/integration/tool-access-bridge.test.mjs` | 挂载 executor；`execute()` 改批次契约；`sessionController` mock `inspect`→`state` |
  | `tests/integration/expert-manager.test.mjs` | 补 `ctx.subagents = {rootOf,namesOf}`；`agentTeams.tryMembership`→`agentTeams.isEnabled`；挂载 executor；`/spawn_teammate/`→`subagent`/`subagent_fork`/`list_agents` |
- **契约依据（官方发布包类型定义实测）**：`ctx.tools.execute(input)` 输入为 `ToolBatchInput { calls: ToolCallBlock[]; signal; agent?; maxParallelToolCalls?; toolSet?; log? }`，`ToolCallBlock = { type:'tool-call', id, name, arguments: string(JSON) }`；输出 `ToolBatchResult { results: {callId,result}[], additionalContexts, concluded }`。旧单调用形状 `execute({callId,name,arguments})` 会因 `input.calls` 为 `undefined` 在 `pipeline.js` `toolCalls.map` 抛 `TypeError`。
- **rc.3 执行守卫迁移**：`agentTeams.tryMembership` → `ctx.subagents.rootOf`/`namesOf` + `agentTeams.isEnabled`（`packages/plugins/experts/src/runtime/execution-guard.ts`）。
- **复验（PASS）**：

  | 检查项 | 结果 |
  | --- | --- |
  | `node --test tests/integration/*.test.mjs` | `tests 111 / pass 111 / fail 0 / skipped 0` |
  | 改前基线（同命令） | `tests 111 / pass 90 / fail 20`（上一轮报告记 21 属单次抖动；本轮以实测 20 为准） |
  | `pnpm check:plan` | PASS |
  | `pnpm check:versions` | PASS |
  | `pnpm build` | exit 0 |
  | `pnpm typecheck` | exit 0 |

### 9.5 回滚锚点

- 线上：`.upgrade-rc5-$TS/`（compose + profile 5 文件）、`compatibility.json.bak.rc5.<ts>`；rc.3 镜像 tag 仍在本地。回滚 = compose `image` 改回 rc.3 + `--force-recreate` + 还原 profile 备份。
- 仓库：本轮改动未 commit，`git checkout` 可整体还原。

> ⚠️ **提交时的忽略规则**：`.gitignore:15` 有 `/docs/`，因此 `docs/dsh-v0.2.2-rc.5/`（1134 文件）与本证据文档**均被忽略**，`git status` 不可见。rc.3 轮次的镜像（1128 文件，commit `55e7aef4f6`）与证据文档（commit `912d52a09b`）均为 **`git add -f` 强制入库**；本轮若提交需同样处理，否则镜像与证据会漏提交。

### 9.6 未执行清单（本轮）

- `git commit` / `git push`（硬约束：需用户授权；且 `docs/dsh-v0.2.2-rc.5/` 与证据文档在 `/docs/` 忽略规则下，需 `git add -f`）。
- npm 发布（无版本要发布）。
- 线上 20 键豁免回填仓库 `deploy/profile/compatibility.json`（与 rc.3 轮次同口径保留为已知差异）。
- `zq.10ge.cn` 隧道链路修复（外部账号，需授权）。
- login 后逐页业务点测（无凭据）。
