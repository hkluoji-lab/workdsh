# D04 / P1-02 专家模块 0.1：EP-07 收尾验证与 AT-01～AT-27 证据矩阵

任务：EP-07（收尾验证：自动化检查复跑 + AT-01～AT-27 逐项签收 + 文档同步）。
核对日期：2026-09-22；**2026-09-23 追加第 8 节（MCP 重名缺陷的裁决、收敛注入处置、复验与线上影响面核实）**，第 1～7 节保留 2026-09-22 的原始裁定，凡被第 8 节更新处均已就地标注。环境：Node 24.15.0、pnpm@10.34.5、`@deepseek-ai/dsh@0.1.6-alpha.2`、`@deepseek-ai/cordis@4.0.2`。
模块版本：`workdsh-plugin-experts@0.1.0-alpha.7`（模块版本线 `0.1`）；组合包 `workdsh-bundle@0.1.0-alpha.52`（2026-09-23 处置后为 `0.1.0-alpha.53`，见第 8 节；对照 [MODULE-VERSIONS](../MODULE-VERSIONS.md) 第 33/35 行）。

本文件按测试层次如实区分证据，并在每一行标注该证据属于**本轮实测**还是**历史快照**。凡本轮未执行或被打断的检查，一律写「未执行」或「本轮阻断」，不以构建通过、历史通过或页面存在替代真实运行。

图例：

- **✅ 集成** —— 本轮实测，真实 Cordis Context + 官方 Storage Domain（defineDomain/CAS）+ 真实 AccessManager/AuditJournal；`workdshIdentity`、`sessionController`、`agentPresets`、`workdshSessionAccess` 为测试替身（`ctx.provide`）。
- **📦✅ 打包** —— 本轮实测，仓库外独立六包安装的真实 Profile + 真实 Host。
- **⛔ 阻断** —— 本轮实测无法到达（打包浏览器层被既有 MCP 重名缺陷打断，见第 3 节）。该阻断已于 2026-09-23 解除并复跑（第 8 节）。
- **🕓 历史** —— 该断言在更早基线（`0.1.5-rc.1` 期）有通过记录，但**不是**本轮锁定基线的复现证据。
- **◐ 部分** —— 领域/契约已实现并有确定性证据，端到端未验。
- **⬜ 未执行** —— 需要真实模型 / 真实原生路径，本轮未执行。

## 1. AT-01～AT-27 证据矩阵（本轮裁定）

| AT | 需求 | 状态 | 证据 / 缺口 |
|---|---|---|---|
| AT-01 | REQ-EXP-001 | ✅ 集成 | `expert-manager.test.mjs`「AT-01」：默认目录 seed、搜索命中/无结果、分类过滤、分页、ownership-scoped |
| AT-02 | REQ-EXP-002,003 | ◐ 部分 | 📦✅ 本轮 API 路径已实测：`prepare-execution` → `create-execution` → `verify-binding` 返回真实原生 Session 并校验固定绑定（探针第 3 项 PASS）。⛔ 详情的「召唤专家/用示例召唤」按钮路径在本轮被打断（探针第 4 项），故「各示例到正确 workspace/Session、无模型请求、长名称/来源/版本准确」缺少本轮 UI 证据。🕓 该 UI 路径在 `0.1.5-rc.1` 期通过并有截图记录，但截图已被本轮失败运行覆盖（见第 3 节末） |
| AT-03 | REQ-EXP-004 | ⛔ 阻断 | 依赖原生输入 overlay 浏览器层（精确预填 expert-manager 文案、原生 `/`、`@`、附件、模型、权限可操作、已有草稿不丢）。本轮探针在该检查前失败，未执行 |
| AT-04 | REQ-EXP-005 | ✅ 集成 | 「AT-04 createDraft persists an incomplete draft, validate reports issues, limits are enforced」：缺字段草稿可存、发布必填报错、`EXPERT_LIMITS` 强制、无假成功 |
| AT-05 | REQ-EXP-005,011 | ✅ 集成 | 「AT-05」：同 `expectedRevision` 并发 `updateDraft`，一方成功一方 conflict，失败方内容保留（真实 CAS） |
| AT-06 | REQ-EXP-005,011 | ✅ 集成 | 「AT-06」：伪造/未确认 proof、错主体、改内容/依赖均拒绝；确认绑定精确内容 |
| AT-07 | REQ-EXP-007 | ✅ 集成 | 「AT-07/AT-08」：发布把真实 Skill 依赖冻结为不可变修订（快照 + `dependencyLock` 摘要） |
| AT-08 | REQ-EXP-007,008 | ✅ 集成 | 同上：v2 发布后冷重启（真实 Storage Domain 重开）仍读 v1 修订；同 preset 篡改/删除由 G03 guard 显式拒绝 |
| AT-09 | REQ-EXP-006,007 | ◐ 部分 | 契约（`resolve`/`retain`/`check`/`release`）+ 运行绑定 guard 已实现；「disabled equipped Skill blocks new expert tasks and existing native pre-step without fallback」+「expert publication requires standard…」为确定性证据。跨插件「停用/卸载时报告专家与任务引用」的端到端（真实打包 + 浏览器）未执行 |
| AT-10 | REQ-EXP-008 | ◐ 部分 | 「G03 native pre-step checks the actual immutable composition and rejects unbound expert forks」为确定性证据；冷恢复由 AT-08 覆盖。原生 Remote / 刷新 / fork / 换 preset 的真实路径未执行；「每轮 prompt 前强制重校验」在锁定版本无公开 seam，按 ADR-0017 §6 记为兼容性缺口（非 D04 验收项） |
| AT-11 | REQ-EXP-009 | ◐ 部分 | `prepareHandoff`/`createHandoff` 与一次性草稿交接由 AT-17 集成覆盖；「旧任务换专家→关联新任务、摘要/资料按选择、原任务不改」的 UI 浏览器路径本轮阻断 |
| AT-12 | REQ-EXP-003 | ⛔ 阻断 | 多任务切换、重复挂载/刷新只消费一次草稿、最近/置顶冷启动保留属原生输入 overlay + 浏览器层。🕓 历史通过（含「已有文本不被覆盖」检查） |
| AT-13 | REQ-EXP-008 | ⬜ 未执行 | 显式不支持模型返回错误不回退、权限/附件、取消复用原生、默认无专家任务回归——需真实模型 + 原生 Session，本轮未执行 |
| AT-14 | REQ-EXP-006 | ✅ 集成 | 「AT-14」：默认专家不可编辑/发布；`copy` 生成独立可编辑个人草稿；availability 真实持久 |
| AT-15 | REQ-EXP-011 | ✅ 集成 | 「AT-22/AT-15」：伪造 owner/organization 无效；跨 owner read/use/edit/manage 拒绝；关键操作落真实 AuditJournal |
| AT-16 | REQ-EXP-005,008 | ✅ 集成 | 「AT-16」：同 `operationId` 发布回放同一回执；重用 id 冲突（幂等） |
| AT-17 | REQ-EXP-008,009 | ✅ 集成 | 「AT-17」：`createExecution` 每 `operationId` 恰保留一个 Session、一次性草稿 handoff、绑定校验 |
| AT-18 | REQ-EXP-012 | ◐ 部分 | 🕓 历史：编辑器在 1440/768/390 三尺寸下单一关闭按钮、字段铺满、无横向溢出，详情头部为管理菜单留空并有几何断言。⬜ 未执行：360 宽、200% 缩放、暗/浅色双外观、键盘与焦点序、Escape、未保存离开确认、菜单溢出。⛔ 本轮阻断，无法补测 |
| AT-19 | REQ-EXP-001,012 | ⬜ 未执行 | Host 缺席/超时/取消/重连/分页 cursor 过期/错误 vs 空列表、主操作不只 toast：本轮未执行（打包 Host 已 ACTIVE 是其前置，已验证） |
| AT-20 | REQ-EXP-012 | ◐ 部分 | 📦✅ 本轮实测「Six independent Profile layers installed outside checkout」+「Packaged expert Host and real local identity/access/audit serve defaults」（独立制品安装、Host ACTIVE）。⬜ 未执行：独立移除后重装、依赖消失/恢复、dispose/reload 无重复导航/工具/订阅、对 Skill/工作台/工作区菜单的回归、公共 Modal 回归 Skill |
| AT-21 | REQ-EXP-010 | ◐ 部分 | `expert-package-authoring.test.mjs` 4 项：身份不匹配/缺 role/不安全资源/工具权限拒绝、二进制头像与可执行 CLI 精确字节往返、超长专业正文不被旧摘要长度限制、二进制包完整定义往返。⬜ 未执行：zip slip / 链接 / 重复路径 / 超限 / 未知版本 / 摘要错误 / 凭据字段反例的真实打包上传往返与取消清理 |
| AT-22 | REQ-EXP-001,011 | ✅ 集成 | 「AT-22/AT-15」：坏 actor / 坏权威 schema 被拒绝，不当作空列表 |
| AT-23 | REQ-EXP-007,008 | ⬜ 未执行 | 确定性一侧已过：「published expert persona and frozen Skill reach the official Agent Loop without leaking into an ordinary task」。⬜ 未执行：persona A/B 不串（两个真实 Session 对照）、用户模板表达式不能注入未知变量/抑制官方指导——需真实 Host persona + 真实模型 |
| AT-24 | REQ-EXP-013 | ◐ 部分 | 专业设定字段（role/methodology/boundaries/deliverables + 领域/经验/方法与交付标准）已进入默认模板与编辑器，使用详情可审阅；🕓 历史打包预览验证了完整专业正文与 6 个示例渲染。⬜ 未执行：「自然语言创建→精细编辑保持同一内容」的真实模型验证；⛔ 本轮阻断无法补测预览 |
| AT-25 | REQ-EXP-014,007 | ◐ 部分 | 集成：技能目录按编辑权限授权、响应不含路径/正文/凭据、停用不可选、失效配备拒绝新任务、发布仍冻结修订。🕓 历史打包：真实搜索/取消选择/移除引用/保存 stable ID/重载一致。⛔ 本轮阻断，未复现。「移除专家引用不卸载共享技能」在归档语义内实现（卸载默认保留用户数据） |
| AT-26 | REQ-EXP-015,002,005 | ◐ 部分 | 详情（使用入口）与编辑器（管理入口）已分离；详情展示真实配备技能名称/简介/状态；发布前可打开「专家使用预览」并有 stale digest 拒绝交换 proof 的确定性/历史打包证据。⬜ 未执行：两种页面的键盘/响应式与公共 Modal 回归本轮未测 |
| AT-27 | REQ-EXP-016,007,008,013 | ⬜ 未执行 | 🕓 历史（`0.1.5-rc.1` 期）已有真实模型四路径证据：normal/incomplete/dirty 完成原生任务、固定 Skill 回执、真实 read/Python、数值对账与冷启动绑定，停用技能路径为确定性覆盖。**但 dirty 报告存在专业语义缺口（反向单位假设、子集推断整体）且最后一轮复测仍失败**，当时即判定「AT-27 不整体签收」。⬜ 本轮锁定基线未复跑真实模型，四路径未重验 |

**统计（本轮裁定，合计 27 项）**：

| 裁定 | 项数 | AT |
|---|---|---|
| ✅ 集成通过 | 11 | AT-01 / 04 / 05 / 06 / 07 / 08 / 14 / 15 / 16 / 17 / 22 |
| ◐ 部分（领域或契约已过，端到端未验） | 10 | AT-02（另含 📦✅）/ 09 / 10 / 11 / 18 / 20（另含 📦✅）/ 21 / 24 / 25 / 26 |
| ⛔ 本轮阻断（MCP 重名，无法到达） | 2 | AT-03 / 12 |
| ⬜ 未执行（真实模型 / 真实原生路径） | 4 | AT-13 / 19 / 23 / 27 |

即：**AT-01～AT-27 未全部通过，D04 不满足签收标准**（第 7 节）。

## 2. 本轮实测的自动化检查（真实输出）

| 检查 | 命令 | 结果 |
|---|---|---|
| 计划/脚手架完整性 | `node scripts/check-plan.mjs` | `PASS: 30 modules; 50 documents; task references, team acceptance and relative links checked.` |
| 规划测试 | `corepack pnpm test:planning` | tests 2 / pass 2 / fail 0 |
| 全量集成 | `corepack pnpm test:integration` | **tests 110 / pass 110 / fail 0**（`duration_ms 16594.83`） |
| 版本锁定 | `corepack pnpm check:versions` | `PASS: 513 DSH lock entries pinned to 0.1.6-alpha.2; Cordis 4.0.2 only` |
| 类型检查 | `corepack pnpm typecheck` | 退出码 0（contracts → providers → audit → access → skills → experts → connectors → office → library → projects → bundle → activity） |
| 构建 | `corepack pnpm build` | 退出码 0 |
| 打包专家探针 | `corepack pnpm probe:experts` | **失败，退出码 1**；前 3 项 PASS，第 4 项起被阻断（第 3 节） |

集成层次同上（真实 Cordis Context + 官方 Storage Domain + 真实 AccessManager/AuditJournal；identity/session/agentPresets/sessionAccess 为替身），因此**不覆盖**打包安装态、真实浏览器与真实模型。历史文档中出现的 42/42、44/44、46/46、47/47、52/52、108/108 均为各时点快照，不作为本轮证据。

`acceptance.json` 口径（本轮核对）：该文件是 P0～P3 的**任务级**用例台账（`A00`～`A21`、`T01`～`T13`、`J01`～`J15`、`UI01`～`UI15`、`B01`～`B05`、`Q01`～`Q04`，共 74 条），**不含任何 `AT-*` 条目，也没有引用 `P1-02` 的用例**（已实测检索）。D04 的验收真源是本文与 [实施顺序、验证关卡与验收](../design/experts/IMPLEMENTATION-AND-ACCEPTANCE.md) §3，故本轮**不**向 `acceptance.json` 增补 AT 条目（会与 `scripts/validate-acceptance.mjs` 的用例语义冲突）；此口径在此登记。

## 3. 打包浏览器层本轮阻断：同一 Host 内第二次 `session.create` 必失败（既有已登记缺陷）

**本轮实测**：

```
PASS: Six independent Profile layers installed outside checkout
PASS: Packaged expert Host and real local identity/access/audit serve defaults
PASS: Real native Session created and fixed binding verified
A [Error]: expect(locator).toContainText(expected) failed
  Locator: locator('[contenteditable="true"]').first()
  Expected substring: "我们刚结束一个项目阶段，这是目标、实际结果和过程中的关键事件。…"
  Error: element(s) not found      （scripts/probe-experts-package.mjs:124）
ELIFECYCLE Command failed with exit code 1.
```

即：探针 API 路径的**第 1 次** `create-execution` 成功（真实原生 Session + 固定绑定校验通过），浏览器点击「用此示例召唤专家」触发的**第 2 次** `create-execution` 失败，页面未进入原生输入框，故第 4 项及其后全部检查（草稿预填、已有文本不被覆盖、创建专家入口、编辑器三尺寸、技能选择、使用预览与发布、草稿/已发布分离、浏览器零错误、两次冷重启）**本轮未执行**。

**这不是本轮的 experts 域缺陷，也不是本轮新发现**：同一现象已在 [STATUS](../STATUS.md) 的 2026-09-17 章节完整定位并随提交 `9802707 docs: trace the packaged experts probe failure to a duplicated dsh-scope` 登记。要点（引用既有结论，不重复推断）：

1. 触发条件是**同一 Host 进程内的第二个 Agent/Session**；第 1 次 create 必成功，与 `workspaceId`/`cwd`/`workspaceRef` 取值无关（已由受控实验与逐进程对照实验确认）。
2. 真实异常为 `RemoteError gateway/internal: failed to create session "…": Error: mcp-client(playwright-mcp): initial connection or tool synchronization failed`，上游为 `MCP resource server "playwright-mcp" is already registered in this scope` / `prompt section "mcp:playwright-mcp" is already registered` / `tool "mcp__playwright-mcp__browser_close" is already registered`。
3. 链路起点是 WorkDSH 自有改动 `b8e562d`（2026-09-15）在 `workdsh-bundle` 的 `cordis.patch.yml` 中 insert 官方 `@deepseek-ai/dsh-browser-use` 与 `@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`（当时为 `cordis.patch.yml` 第 8～15 行；该两条 insert 已于 2026-09-23 按裁决移除，见第 8 节）。
4. 机制：`@deepseek-ai/dsh-experimental-browser-use-runtime` 把 `@deepseek-ai/dsh-scope` 声明为 dependencies，Profile 安装因此落地第二份副本；`dsh-scope` 用模块私有 `Symbol("dsh.scope")` 而非 `Symbol.for`，两份副本的 scope 标签互不可见，官方 runtime 的 per-agent `createScope` 附着失效，重名注册落到全局层。
5. **归属裁定（本轮新增去 WorkDSH 化探针后判定）：官方缺陷本体 + WorkDSH 为唯一触发方。** 该结论由以下 4 条本轮实测证据支持，取代此前「归属未决定」的表述。**处置方式已由用户于 2026-09-23 裁决为「收敛注入、立即解锁」，并已执行完毕（见第 8 节）。**
   - (a) **声明不一致**：`@deepseek-ai/dsh-experimental-browser-use-runtime@0.1.6-alpha.2` 的 `dependencies` = `{dsh-mcp-client, dsh-scope, schemastery}`，而同包 `peerDependencies` 已含 `cordis`/`dsh-tools`/`dsh-browser-use`/`dsh-agent`/`dsh-system-prompt`；`dsh-scope` 与 `dsh-mcp-client` 在其它官方包中**一律**是 peer（实测 `dsh-mcp-client` 自己把 `dsh-scope` 声明为 peer）。实测全仓 0.1.6-alpha.2 官方包中仅 `dsh-experimental-browser-use-runtime` 与 `dsh-sdk-minimal` 把 `dsh-scope` 当硬依赖（故 computer-use 链路不受影响）。
   - (b) **该类包先天禁止跨副本**：`dsh-scope` 的 `const kScope = Symbol("dsh.scope")`（`lib/index.js` 第 229 行）在 `0.1.6-alpha.2` 与 `0.1.7-alpha.2` **两版完全一致**，均为模块私有 Symbol；把这种「按约定单例」的包当硬依赖，在「Host 核心根 ≠ Profile 根」的官方安装拓扑下必然产生互不可见的两份。
   - (c) **官方已按同一方向修复**：`@deepseek-ai/dsh-experimental-browser-use-runtime@0.1.7-alpha.1` 的 `dependencies` 只剩 `schemastery`，`dsh-scope` 与 `dsh-mcp-client` 均已移入 `peerDependencies`——与上述 (a)(b) 指出的问题完全对应。
   - (d) **去 WorkDSH 化的最小探针（本轮新增，可复现）**：用纯官方模板建 Profile（`dsh --profile stockcheck --from-default-profile web --dump-config`，实测输出中 `browser-use` 计数为 **0**，即官方模板不含该能力），只执行 `dsh plugin add @deepseek-ai/dsh-experimental-browser-use-playwright-mcp@<版本>`，**完全不经过 `workdsh-bundle`**。结果：
     | 安装版本 | Profile 根 `node_modules/@deepseek-ai/` | Profile 内 `dsh-scope` 实体 |
     |---|---|---|
     | `0.1.6-alpha.2`（dependencies 形态） | `dsh-experimental-browser-use-playwright-mcp`、`…-runtime`、`dsh-mcp-client`、**`dsh-scope`**、`dsh-util-values`、`schemastery`、`cosmokit` | **落地真实副本** `profiles/stockcheck/node_modules/@deepseek-ai/dsh-scope`（与核心 `node_modules/.pnpm/@deepseek-ai+dsh-scope@0.1.6-alpha.2_…/` 是两个不同物理目录） |
     | `0.1.7-alpha.1`（peer 形态） | `…-playwright-mcp`、`…-runtime`、`schemastery`、`cosmokit` | **不落地**（`find -type d -name dsh-scope` 无输出） |
     两次实验的 `$DSH_HOME/profiles/` 下均**无共享 `node_modules` 层**（只有 profile 目录本身），故 0.1.7 的插件改为从核心树解析 peer，不再产生第二份。⇒ **重复与 WorkDSH 的 bundle 组成无关**，也**不是** WorkDSH 的实现错误。
   - 责任边界：WorkDSH 无法在「不改上游、不另建插件加载器」的前提下于 `0.1.6-alpha.2` 基线上就地消除该重复；但 WorkDSH 是唯一触发方，可通过收敛注入自行解除。定位阶段（2026-09-22）按既有指令「只定位、不改产品行为」**未改**任何产品代码、bundle 组成或 registry，也未向官方上报；2026-09-23 用户裁决后按「收敛注入」处置，改动范围见第 8 节。
   探针现场：`/tmp/wd-stock`（0.1.6）、`/tmp/wd-stock17`（0.1.7），均为临时 `$DSH_HOME`，未进版本控制、未触碰用户 Profile。
6. 同一机制另有独立旁证：`corepack pnpm probe:browser` 也停在同一 `mcp-client(playwright-mcp)` 失败点（STATUS 2026-09-19 章节），说明它不是专家路径专有。

**由此产生的证据缺口（须登记，不得掩饰）**：

- `.artifacts/experts-package/` 采用固定文件名，2026-09-22 的失败运行**覆盖了历史上成功运行的截图与 `report.json`**；该目录未纳入版本控制，历史成功截图无存档。该目录现存 `failure.png` / `failure-text.txt` / `failure-errors.json`（`[]`）/ `failure-inputs.json`（`[]`）四个**失败运行遗留文件**（时间戳 09-22 23:58）。
- 2026-09-23 处置后同一探针复跑**全绿**，已重新产出 `report.json` 与 20 张成功截图（时间戳 09-23 06:21），「真实打包截图」这一签收要件恢复可用；失败遗留文件按原样保留（不删除证据），与本轮成功产物以时间戳区分。
- 该缺陷于 2026-09-22 使打包浏览器层的第 4～10 项断言全部未执行，其中包含 AT-03/12 的全部内容以及 AT-18/24/25/26 的打包部分；该阻断已于 2026-09-23 解除并复跑（第 8 节）。

## 4. ADR-0019 阻塞状态更正（前一版本文档的结论已过时）

本文件前一版（2026-09-12，26 模块口径）曾把 AT-18/19/20 记为「被 [ADR-0019](../adr/0019-installable-host-self-containment-and-governance-assembly.md) 阻塞 1/2 挡住」。该结论**已不再成立**，本轮以实测与源码核对更正：

1. ADR-0019「本轮实施修订」采用备选 **iii**：identity-local / audit / access 各贡献独立 `dsh.bundle.patch`，`access` 公开 `./session`、`./tool` 插件子路径，安装脚本明确安装六包，bundle 不隐藏治理初始化。**本轮探针第 1、2 项 PASS 即该路线的直接证据**（六包仓库外独立安装 → 打包 Host + 真实本地 identity/access/audit 正常服务默认目录）。
2. 决策 1/3 的「Host 自包含」已落地并经本轮源码核对：`packages/plugins/experts/dist`、`packages/plugins/access/dist`、`packages/plugins/audit/dist`、`packages/providers/identity-local/dist` 的 **`.js` 对 workspace 包零运行时导入**（仅剩 `.d.ts` 的 `import type`，其中 experts 仍有 16 处类型引用指向 private `workdsh-contracts`）；`workdsh-contracts` 仍为 `private: true`、未发布，但不进入安装态运行时解析路径。仓库外 **TypeScript** 消费（`d.ts` 解析）仍未验证。
3. 因此 AT-18/19/20 当前的缺口**不是** ADR-0019，而是：(a) 第 3 节的 MCP 阻断使打包浏览器层无法执行；(b) 若干场景（200% 缩放、暗/浅色、未保存离开、Host 缺席/超时/重连、移除重装、跨功能回归）尚未被任何探针覆盖。

## 5. 历史证据指向（不同基线，仅供追溯，不作为本轮通过依据）

| 主题 | 制品 / 文档 | 基线 |
|---|---|---|
| EP-07 前置修复、官方复用记录、专家 UI 与官方 Agent Loop 补充、A/B/C/D 切片 | [d04-experts-review-fixes.md](d04-experts-review-fixes.md) | `0.1.5-rc.1` |
| 真实模型四路径（normal / incomplete / dirty）、数值对账、冷启动绑定、专业复核边界 | `.artifacts/experts-professional-*`、`.artifacts/experts-professional-dirty-review{,-2}-20260913`、`.artifacts/experts-professional-dirty-pdf-followup-20260913`；边界登记见 review-fixes 末三节 | `0.1.5-rc.1` |
| 跨领域（写作 / 资料研究 / 代码）真实创建—发布—执行—交付 | `.artifacts/experts-crossdomain-{writing,research,code}-20260913`、`…-holdout-20260913` | `0.1.5-rc.1` |
| G01～G06 官方公开面验证 | [d04-experts-g01-g06.md](d04-experts-g01-g06.md) | `0.1.5-rc.1` |

这些记录里「52/52 集成」「46 项集成」等数字均属其自身时点，且真实模型结论明确带限制（AT-27 未签收）。本轮不继承其通过状态。

**版本记录核对**：模块版本线 `0.1` 与 `experts@0.1.0-alpha.7`、`bundle@0.1.0-alpha.52` 在 [MODULE-VERSIONS](../MODULE-VERSIONS.md) 第 33/35 行一致（bundle 已于 2026-09-23 处置时 bump 至 `0.1.0-alpha.53`，见第 8 节）。**发现一处台账滞后（不属 D04 自身、归 X4）**：`docs/modules.json` 的 experts `release.version` 仍为 `0.1.0-alpha.4`（2026-09-16），而 MODULE-VERSIONS 记载的公开 prerelease 为 α.5，本地候选已是 α.7；本轮未改该字段，登记为 X4「台账与版本回填」的待办。

## 6. 未执行 / 待回填清单

- **本轮阻断（MCP 重名）**：探针第 4～10 项全部未执行 → AT-03、AT-12 全部内容，及 AT-02/18/24/25/26 的打包浏览器部分。**已于 2026-09-23 解除并复跑全绿（第 8 节）。**
- **未执行的场景**：AT-13（真实模型不支持模型/权限/附件/取消回归）、AT-19（Host 缺席/超时/取消/重连/cursor 过期/错误 vs 空列表）、AT-23（真实 Host persona A/B 不串与模板表达式约束）、AT-27（锁定基线下的四路径真实模型复验）。
- **未执行的部分项**：AT-09 的跨插件停用/卸载影响端到端；AT-10 的原生 Remote/刷新/fork/换 preset；AT-11 的关联交接 UI；AT-18 的 360/200%/暗浅色/键盘/未保存离开/菜单溢出；AT-20 的移除重装/dispose/reload/跨功能回归；AT-21 的反例包真实上传往返与取消清理；AT-26 的键盘/响应式与公共 Modal 回归。
- **签收要件的材料缺口**：2026-09-22 起「真实打包截图」不可用（被失败运行覆盖）；**2026-09-23 复跑后已恢复**（`report.json` + 20 张成功截图，第 3 节末）。
- **归属未定项**：**已于 2026-09-23 裁定并处置**——归属为官方缺陷本体 + WorkDSH 为唯一触发方，处置为「收敛注入」（第 8 节）；仍未向官方上报，保留为后续可选项。
- **非 D04 项**：`docs/modules.json` experts `release` 字段滞后（X4）。

## 7. D04 签收判定（本轮结论）

[完成标准](../design/experts/IMPLEMENTATION-AND-ACCEPTANCE.md#L96) 要求同时具备「创建→发布→召唤→实际执行→重启恢复闭环；更新/启停/归档/导入闭环；**全部 AT-01～AT-27**；官方复用记录；真实打包截图；模块 0.1 和 bundle 的正确版本记录；已知限制公开且没有核心功能被假按钮替代」。

逐项核对：

| 要件 | 本轮状态 |
|---|---|
| 全部 AT-01～AT-27 | **不满足**：11 项 ✅、10 项部分、2 项本轮阻断、4 项未执行（第 1 节）；AT-27 在历史基线上即未整体签收 |
| 创建→发布→召唤→实际执行→重启恢复闭环 | 部分：集成层闭环（AT-17/AT-16/AT-08）与打包层 API 闭环（本轮 📦✅）可证；**打包浏览器层的「召唤→实际执行」本轮不可复现**（该条已于 2026-09-23 复跑取得实测证据，第 8.3 节） |
| 更新/启停/归档/导入闭环 | 部分：AT-04/05/14/16 与导入导出包级测试 ✅；AT-21 反例往返与 AT-09 跨插件联动未执行 |
| 官方复用记录 | 满足（[d04-experts-review-fixes.md](d04-experts-review-fixes.md) 各节「官方能力复用记录」） |
| 真实打包截图 | **不满足**：材料被覆盖（第 3 节末）。**2026-09-23 复跑后已恢复**（第 8.3 节） |
| 模块 0.1 与 bundle 版本记录 | 满足（MODULE-VERSIONS 第 33/35 行）；另登记 modules.json `release` 滞后一项 |
| 已知限制公开、无假按钮替代核心功能 | 满足（本文件与 STATUS 如实登记；未实现入口标注「待开放」） |

**判定：D04 保持 `in_progress`，不予签收。** 阻塞收口的是第 3 节的 MCP 重名缺陷（其修法归属未定，需用户裁决）与随后的打包浏览器层复跑；其后才是 AT-13/19/23/27 的真实模型与原生路径验收。本轮（2026-09-22）不递增包版本、不改 bundle 组成、不修改上游、不发布。该判定在 2026-09-23 处置后仍然成立——阻断已解除、材料缺口已补齐，但 AT-01～27 仍未全部通过（第 8 节）。

## 8. 2026-09-23：裁决、处置执行与复验

### 8.1 用户裁决

对第 3 节的两问裁决为：**处置方式 =「收敛注入、立即解锁」**；**线上影响面 = 本轮一并核实**。

### 8.2 处置（收敛注入）——改动范围

| 位置 | 改动 |
|---|---|
| `packages/bundle/cordis.patch.yml` | 删除 `browser-use`（`@deepseek-ai/dsh-browser-use`）与 `browser-use-playwright-mcp`（`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`，含 `mode/headless/executablePath` config）两条 insert，即原第 8～15 行 |
| `packages/bundle/package.json` | 删除上述两条 `dependencies`；版本 `0.1.0-alpha.52` → **`0.1.0-alpha.53`** |
| 根 `package.json` | 删除 `pnpm.overrides` 中 `@deepseek-ai/dsh-browser-use`、`@deepseek-ai/dsh-experimental-browser-use-playwright-mcp`、`@deepseek-ai/dsh-experimental-browser-use-runtime` 三条 |
| `scripts/probe-install.mjs` | 删除配置断言与移除负例各两条（`b8e562d` 引入） |
| `scripts/probe-native-team-web.mjs` | 删除向 native-team Profile 写 `browser-use-playwright-mcp` disabled 行的隔离 hack 与相应注释（目标条目已不存在） |
| `scripts/probe-browser-use-playwright.mjs` + `probe:browser-use:playwright` script | **删除**：该探针只直连 `@playwright/mcp/cli.js`、不经过 Host/Profile/loader，其唯一依赖路径即被移除的包，保留会变成会失败的假命令 |

**未改动**：上游官方包与源码、Host/Profile 生命周期、`computer-use` 链路（其依赖链未把 `dsh-scope` 当硬依赖，实不受影响）、官方浏览器使用能力的恢复路线。

**代价（已登记）**：2026-09-15 上线的「官方浏览器使用（browser-use）」能力随本版暂缓。恢复条件为官方修复版本进入基线（`@deepseek-ai/dsh-experimental-browser-use-runtime@0.1.7-alpha.1` 起已把 `dsh-scope`/`dsh-mcp-client` 改回 peer，见第 3 节 (c)），届时单独恢复注入与探针。

### 8.3 复验（真实输出）

| 检查 | 命令 | 结果 |
|---|---|---|
| 计划/脚手架完整性 | `corepack pnpm check:plan` | `PASS: 30 modules; 50 documents; task references, team acceptance and relative links checked.` |
| 版本锁定 | `corepack pnpm check:versions` | `PASS: 507 DSH lock entries pinned to 0.1.6-alpha.2; Cordis 4.0.2 only`（513 → 507，与移除 6 个包一致） |
| 类型检查 | `corepack pnpm typecheck` | 退出码 0 |
| 构建 | `corepack pnpm build` | 退出码 0 |
| 依赖解析 | `corepack pnpm install --no-frozen-lockfile` | `Packages: -6`；`pnpm-lock.yaml` 中 `browser-use` 残留计数 **0** |
| 安装探针 | `corepack pnpm probe:install` | 三项全 PASS（打包安装、移除后配置不含 bundle、重装激活） |
| 打包专家探针 | `corepack pnpm probe:experts` | **全绿，退出码 0：13 项断言全部 PASS**（含此前被阻断的第 4～13 项） |

`probe:experts` 的 13 项断言（含此前全部未执行的浏览器层）逐条 PASS：六包仓库外独立安装 / 打包 Host + 真实 identity·access·audit 服务默认目录 / 真实原生 Session 与固定绑定 / **示例召唤生成真实任务并预填一次原生草稿、清空交接** / **定向草稿交接保留用户既有文本且不影响其他 Session** / 创建专家入口 / 编辑器桌面·平板·移动三尺寸 / **真实技能选择（搜索、取消、移除引用、稳定保存、重载，且不卸载共享技能）** / **完整使用预览（长专业正文、六个示例、取消、响应式固定确认；摘要变化不能交换 proof 或发布）** / **草稿深链只读直到显式确认，随后发布固定技能修订并召唤原生任务** / **草稿技能改动与已发布详情分离、可选能力声明分组、未发布编辑器明确标注** / 打包浏览器下专家面板零页面错误 / 两次冷重启保留专家与原生 Session 绑定。

产物：`.artifacts/experts-package/report.json`（`checks` 13 项）与 20 张成功截图（`expert-detail`、`expert-editor-1440/768/390`、`expert-professional-preview`、`expert-published`、`expert-skill-selection`、`expert-task-draft`、`expert-unpublished-1440/1920/390`、`expert-use-preview-1440/1920/390`、`experts-1440` 等），时间戳 2026-09-23 06:21；2026-09-22 的 `failure.*` 四个遗留文件按原样保留、以时间戳区分。

### 8.4 线上 `dsh.10ge.cn` 影响面核实（对应裁决第 2 问）

| 项 | 实测 |
|---|---|
| 线上组合包 | `workdsh-bundle@0.1.0-alpha.52`，其自带 `cordis.patch.yml` 确实 insert 了 `browser-use` 与 `browser-use-playwright-mcp` |
| 物理重复 | 已证实：全局 `/usr/local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/` 自带 **260** 个 `@deepseek-ai` 包（含 `dsh-scope`/`dsh-tools`/`dsh-mcp-resources`/`dsh-system-prompt`/`dsh-agent-loop`），Profile 根 `/data/dsh/profiles/web/node_modules/@deepseek-ai/` 另装 **210** 个（含第二份 `dsh-scope`） |
| 为何未触发 | Profile 根**同时具备完整核心包集**（`dsh-agent-loop`、`dsh-mcp-resources`、`dsh-system-prompt`、`dsh-tools`、`dsh-mcp-client`、`dsh-scope` 均在），Profile 内解析统一落在 Profile 根，实际只存在一份生效的 `dsh-scope` |
| 症状计数（当前容器运行期） | 容器 `StartedAt=2026-09-22T15:38:28Z`、`Up 7 hours (healthy)`、`Restarts=0`；`duplicate loader entry` **0**、`agent-team` **0**、`is already registered` **0**、`mcp-client(playwright-mcp)` **0**、`browser-use` **0** |
| 历史日志 | 最近 72h 内 3141 条 `duplicate loader entry id: agent-team` **全部在本次容器启动之前**（前一次运行期，时点与 2026-09-21 批次 A 隔离变量操作同期），本次启动后 0 条 |
| Profile 层 patch 现状 | 仅 `computer-use` / `computer-use-cua-driver-native` / `ui-plugin-manager` 三条 disabled + 批次 A 注释；**未**禁用 browser-use |

**结论：线上无需干预。** 口径为「物理重复已存在但未被解析命中」——当前拓扑下解析统一落在 Profile 根，故障条件（Host 核心根与 Profile 根各自解析到不同 `dsh-scope`）未被满足。登记为**潜伏风险**：若线上 Profile 核心包集被裁减、或拓扑变化使解析跨根，同一机制会复现。α.53 起新装/重装不再产生该重复；线上沿用 α.52 属既有制品，按用户既有指令不在本轮改动线上。

### 8.5 处置后的 D04 状态

阻断解除后，第 1 节矩阵中 **AT-03 / AT-12 的「⛔ 阻断」不再成立**，且 AT-02/12 的 UI 路径与 AT-18/24/25/26 的打包浏览器部分已取得本轮实测证据（8.3）；「真实打包截图」材料缺口已补齐。**但 AT 矩阵的重新裁定不在此处单方面改写**：AT-13/19/23/27 的真实模型与原生路径仍未执行，AT-09/10/11/18/20/21/26 的未执行项不变。因此 **D04 仍保持 `in_progress`、不予签收**，下一步为按第 6 节清单继续真实模型与原生路径验收，并在其完成后一次性回填矩阵与统计。
