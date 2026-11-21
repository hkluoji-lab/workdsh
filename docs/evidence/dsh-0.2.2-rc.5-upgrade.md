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
| `deploy/profile/compatibility.json` | `agent-teams@0.1.23 → ["0.2.1-rc.3","0.2.2-rc.1","0.2.2-rc.3"]` | 阶段 1 先追加 `"0.2.2-rc.5"`（四值并存，便于回滚）；**阶段 6 已整体回填为线上实况 20 键**（见 9.7） |
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
- **~~未回填仓库 `compatibility.json`~~ 已回填**：仓库原为「1 条 agent-teams」快照口径，线上 20 键（16 workdsh + 4 官方）的豁免差异**已于 2026-11-21 阶段 6 回填入库**，见 9.7。
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
- ~~npm 发布（无版本要发布）~~ → **已执行**为「打包制品」路径，未发布到 registry，见 9.8 节。
- `zq.10ge.cn` 隧道链路修复（外部账号，需授权）。
- login 后逐页业务点测（无凭据）。

### 9.7 阶段 6｜线上 20 键豁免回填仓库（PASS）

> 执行时间：2026-11-21。用户指令「执行线上 20 键豁免回填」。**纯配置快照更新，未改任何源码，未写线上。**

- **目标**：把线上 `dsh.10ge.cn` profile 实况的 20 条版本兼容豁免回填仓库 `deploy/profile/compatibility.json`，消除「线上 20 键 / 仓库 1 键」的已知差异（原记录见 rc.5 第 9.6 节与 8 节，以及 [dsh-0.2.2-rc.3-upgrade](dsh-0.2.2-rc.3-upgrade.md) 第八节）。
- **线上只读取证**（`sudo cat …/profiles/web/compatibility.json`，1789 B，属主 `luoji:luoji`）：
  - 键数 **20**（workdsh **16** + 官方 **4**），`agent-teams` 键命中数 = **0**。
  - 每键值均为 `["0.2.2-rc.3","0.2.2-rc.5"]` 双值（沿用 9.3.1 修复①后的形态，便于回滚）。
  - 官方 4 键的已装版本后缀：`@deepseek-ai/dsh-computer-use@0.2.2-rc.1`；`dsh-browser-use`、`dsh-experimental-browser-use-playwright-mcp`、`dsh-experimental-computer-use-cua-driver-native` 均为 `@0.2.2-rc.3`（即 9.3.1 修复②把陈旧 `@0.2.2-rc.1` 改为实际安装版本后的结果）。
  - workdsh 16 键中，键名带版本后缀者与 `deploy/profile/package.json` 声明的 workdsh 依赖版本**并非逐一相等**（如线上 `workdsh-plugin-skills@0.1.0-alpha.50` vs 快照 α.32、`workdsh-bundle@0.1.0-alpha.53` vs 快照 α.58、`workdsh-plugin-office@0.1.0-alpha.10` vs 快照 α.12）。**本目录保留线上逐字形态**，快照 `package.json` 的 workdsh 依赖版本差异属既有边界，未在本轮改动。
- **回填动作**：以线上内容**逐字重写** `deploy/profile/compatibility.json`（缩进 2 空格、键序对齐线上），并将 `deploy/profile/README.md` 的 `compatibility.json` 行口径从「本快照 1 条 + 线上实际 20 键（未入库）」改为「已回填 20 键」。
- **`@nanmicoder/dsh-agent-teams` 差异处理**：线上 profile 已**不含**该包（`compatibility.json` 键 0 处、`package.json` 依赖声明 0 处，前一阶段探针中 `node_modules` 亦无此目录）。因本目录定位为「线上配置真源」，回填**以线上为准删除该键**。`deploy/profile/package.json` 第 11 行依赖与第 54 行 bundles 中残留的 `@nanmicoder/dsh-agent-teams` 声明**不在本轮范围内**，未改动，记为**已知边界**（快照内部该条与线上不一致，待后续单独轮次按线上实况收敛 `package.json`/`bundles`）。
- **复验（PASS）**：

  | 检查项 | 结果 |
  | --- | --- |
  | `JSON.parse` 有效性 | 通过 |
  | 键数 | **20** |
  | `keys missing rc5` | **`[]`** |
  | workdsh / 官方 键数 | **16 / 4** |
  | `agent-teams` 键数 | **0** |
  | **逐字比对（关键证据）** | 仓库文件前 **1789** 字节 `sha256 = 4d7ab63bef428a1a6c6fb04420fbae293d190fac96b00ed569f8f684b5f5e751`，与线上文件 `sha256` **完全相同**；仓库版仅尾部多一个 POSIX 换行（1790 vs 1789 B）。即豁免内容与线上**逐字节一致** |
  | `git diff --stat deploy/profile/` | `compatibility.json` 1 文件 / +77 −3（README 1 文件 / +1 −1） |
  | `pnpm check:plan` | PASS（34 modules / 50 documents） |
  | `pnpm check:versions` | PASS（664 DSH lock entries pinned to `0.2.2-rc.5`） |

- **未执行**：`git commit` / `git push`（需用户授权）。本轮改动文件：`deploy/profile/compatibility.json`、`deploy/profile/README.md`、本证据文档、`docs/STATUS.md`。
- **回滚锚点**：`git checkout -- deploy/profile/compatibility.json deploy/profile/README.md` 可整体还原（改动未 commit）；线上文件未触碰。

### 9.8 阶段 7｜npm 发布按「打包制品」执行（PASS，21 个 workspace 成员）

> 执行时间：2026-11-21。用户指令「执行 npm 发布」，经确认**发布方式 = 打包制品**（不发布到 npm registry，符合本项目既有政策）、**范围 = 全部 workspace 包**。**未改任何源码，未写线上，零 `.ts` 改动。**

- **真发布前置事实（实测，构成不发布到 registry 的依据）**：

  | 探针 | 结果 |
  | --- | --- |
  | `npm whoami` | `ENEEDAUTH`（未登录） |
  | `~/.npmrc` 的 `_authToken`/`_auth`/`username` 键 | **0 处** |
  | 环境变量 `NPM_TOKEN`/`NODE_AUTH_TOKEN` | **0 处** |
  | `npm config get registry` | `https://registry.npmmirror.com/`（**只读镜像，不可发布**） |
  | 根 `package.json` | `private: true`；无 publish 脚本；无 `publishConfig` |
  | `.github/workflows/` | 仅 `pages.yml`，**无发布流水线** |
  | 既有政策 | `scripts/pack-project-release.mjs` manifest `limitations` 明载 `packages are GitHub assets and are not published to the npm registry` |

- **包集合澄清**：`corepack pnpm -r list --depth -1` = **22 行** = **21 个 workspace 成员 + 根聚合包 `workdsh@0.1.0-alpha.8`**。根包 `private`、无 `files`/`main`/`bin`，`pnpm pack` 产出 ~34 MB 全源码 tarball（非可分发包）⇒ **实际打包 21 成员，根部排除**。
- **命令链**：
  1. `corepack pnpm -r --if-present --filter '!workdsh-plugin-automations' build`（20 成员成功；`portal`/`survey`/`vas` 无 build 脚本）
  2. 逐成员 `corepack pnpm --filter <name> pack --pack-destination .artifacts/0.2.2-rc.5-release`（**21/21 `ok`**）
  3. `node /tmp/gen-release-manifest.mjs` → `OK: SHA256SUMS 21 lines; release-manifest.json 21 packages; private 12 public 9`（工具为临时脚本，非交付物；`corepack pnpm -r list --depth -1 --json` 取成员，对 `*.tgz` 计 `sha256`/`bytes`，按 `<name>-<version>.tgz` 反查成员 `package.json`，`dshPeers` = `peerDependencies` 中 `@deepseek-ai/dsh` 前缀键数）
- **产出**：`.artifacts/0.2.2-rc.5-release/`（**gitignored，本地交付资产**）含 21 个 `.tgz` + `SHA256SUMS` + `release-manifest.json`，目录 21 MB。
- **manifest 头部**：`project=WorkDSH`、`scope=plugin-refresh-0.2.2-rc.5`、`channel=local-artifact`、`sourceCommit=8ce4eec32edc965cd11d0abc2bb36d1676d11705`、`worktreeDirty=false`、`harness=0.2.2-rc.5`、`node=v24.15.0`、`packageManager=pnpm@10.34.5`。schema（顶层 9 键 `project/scope/channel/sourceCommit/worktreeDirty/harness/node/packageManager/packages`；包项 7 键 `name/version/private/filename/bytes/sha256/dshPeers`）与既有范本 `.artifacts/0.2.1-alpha.2-release/` **完全一致**。
- **21 包清单**（bytes 与 sha256 前 12 位）：

  | private | name | version | bytes | dshPeers | sha256(12) |
  | --- | --- | --- | --- | --- | --- |
  | PRIV | workdsh-bundle | 0.1.0-alpha.58 | 30506 | 0 | `e529d625fd62` |
  | PRIV | workdsh-contracts | 0.1.0-alpha.13 | 26532 | 0 | `f3efbf67a761` |
  | PRIV | workdsh-plugin-access | 0.1.0-alpha.6 | 34656 | 5 | `baa7da39b864` |
  | pub | workdsh-plugin-activity | 0.1.0-alpha.7 | 28789 | 6 | `ef219c8f4b80` |
  | pub | workdsh-plugin-assistant | 0.1.0-alpha.1 | 38249 | 7 | `ed1fbd0f1db3` |
  | PRIV | workdsh-plugin-audit | 0.1.0-alpha.4 | 4672 | 1 | `569302a0ce53` |
  | pub | workdsh-plugin-automations | 0.1.0-alpha.1 | 31453 | 15 | `50670c6b53ce` |
  | pub | workdsh-plugin-connectors | 0.1.0-alpha.3 | 35578 | 11 | `a8056806027f` |
  | pub | workdsh-plugin-drive | 0.1.0-alpha.9 | 63717 | 19 | `8d4798dfc84b` |
  | pub | workdsh-plugin-experts | 0.1.0-alpha.11 | 186164 | 10 | `7eb7c4d1ecb0` |
  | PRIV | workdsh-plugin-identity | 0.1.0-alpha.1 | 16663 | 3 | `aa076edf85e4` |
  | pub | workdsh-plugin-library | 0.1.0-alpha.4 | 61754 | 16 | `c0f8ba159e75` |
  | PRIV | workdsh-plugin-office | 0.1.0-alpha.12 | 19626528 | 7 | `4a143422b7f0` |
  | pub | workdsh-plugin-projects | 0.1.0-alpha.4 | 63944 | 15 | `da6a28576964` |
  | pub | workdsh-plugin-skills | 0.1.0-alpha.32 | 146631 | 3 | `9fa50bfa078d` |
  | PRIV | workdsh-plugin-workbench | 0.1.0-alpha.16 | 19750 | 0 | `d00570ca4601` |
  | PRIV | workdsh-portal | 0.1.0-alpha.5 | 545029 | 0 | `b400d28a2407` |
  | PRIV | workdsh-provider-identity-local | 0.1.0-alpha.6 | 6875 | 1 | `bf2ccb94c170` |
  | PRIV | workdsh-survey | 0.1.0-alpha.1 | 42318 | 0 | `9afdbab8be6d` |
  | PRIV | workdsh-ui | 0.1.0-alpha.6 | 9604 | 0 | `2d99e22e310f` |
  | PRIV | workdsh-vas | 0.1.0-alpha.1 | 60812 | 0 | `64216787d9a3` |

  TOTAL bytes = **21080224**（约 21.1 MB）；private **12** / public **9**。
- **office 体量说明**：单包 19.6 MB，源出 `dist/office-runtime.js` 25 146 532 B、`dist/index.js` 22 988 314 B、`dist/editor.html` 19 985 906 B（打包前体量，压缩后落入 19.6 MB tgz），属 bundled office runtime，非异常膨胀。
- **复验（PASS）**：

  | 检查项 | 结果 |
  | --- | --- |
  | `ls *.tgz \| wc -l` | **21** |
  | `(cd $D && shasum -a 256 -c SHA256SUMS)` | **21 行全 `OK`** |
  | 21 个 tarball `tar -xzf` 解包 | 全部成功，各含 `package/package.json` |
  | manifest schema 与 `.artifacts/0.2.1-alpha.2-release/` 比对 | **完全一致**（顶层 9 键 / 包项 7 键） |
  | `pnpm check:plan` | PASS（34 modules / 50 documents） |
  | `pnpm check:versions` | PASS（664 DSH lock entries pinned to `0.2.2-rc.5`） |

- **已发现并如实登记——automations 制品不完整（既有骨架缺陷，非本轮引入）**：
  - `packages/plugins/automations/package.json` 第 12–15 行 `exports["./client"]` 声明 `./dist/client.d.ts` + `./dist/client.browser.js`；`tar -tzf workdsh-plugin-automations-0.1.0-alpha.1.tgz` 输出**无这两个文件**（仅有 `dist/index.js`、`dist/services/**`、`dist/domain/**`、`dist/scheduler/**`、`dist/storage/**`、`dist/shared.*` 等）。
  - 根因：`scripts/build-automations.mjs` 第 2 行硬编码 `entryPoints:[fileURLToPath(new URL('src/client.tsx',entry))]`，而 `packages/plugins/automations/src/client.tsx` **不存在**（`src/client/` 仅含 `.gitkeep`）⇒ 该包 `build` 必失败，故本轮打包**以 `--filter '!workdsh-plugin-automations'` 跳过其 build**。
  - 范围边界：该包**不在根 `build` 脚本的过滤器内**、**不在任何 profile bundles 内**（仓库引用 0 / 线上引用 0，仅 4 处为自指：`src/index.ts`、`package.json`、`cordis.patch.yml`、`scripts/build-automations.mjs`），属既有 WIP 骨架。其 `.tgz` 已产出且 sha256 校验通过，但**包内 `./client` 入口不可解析**。
- **入库口径**：`.artifacts/` 在 `.gitignore:10` 被忽略，历史制品目录（含 `0.2.1-alpha.2-release`）**0 文件入库**；仓库仅跟踪 1 个 tgz = `packages/plugins/experts/workdsh-plugin-experts-0.1.0-alpha.11.tgz`（供 `deploy/profile` 的 `file:` 依赖），其 sha256 = `7544c3f4…`，与本次重打包**同名同版本**包 `7eb7c4d1…` **不同**（`pnpm pack` 非确定性：mtime/顺序差异）。**本轮制品沿用既有惯例，仅作本地交付资产，不入库、不改已跟踪的 experts tgz。**
- **未执行**：① 发布到 npm registry（无凭据 + 只读镜像 + 根包 `private` + 违背既有政策；用户已选择制品路径）；② `git commit` / `git push`（需授权；`docs/**` 在 `/docs/` 忽略规则下需 `git add -f`）；③ 制品入库（不符既有惯例）；④ `workdsh-plugin-automations` 的 `src/client.tsx` 缺失修复（既有骨架缺陷，范围外）。
- **回滚锚点**：`rm -rf .artifacts/0.2.2-rc.5-release` 即整体移除（gitignored，零仓库影响）；本轮无源码改动，`git status` 仅 `docs/**`（受 `/docs/` 忽略规则，须 `git add -f` 才可见）。

