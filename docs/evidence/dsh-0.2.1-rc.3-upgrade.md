# DSH 0.2.1-rc.2 → 0.2.1-rc.3 版本对比分析与升级方案

> **对象**：线上 `dsh.10ge.cn`（192.168.11.205，1Panel 容器 `dsh`）↔ npm 官方发布通道
> **取证时间**：2026-10-25（Asia/Shanghai）
> **取证方式**：`npm view` dist-tags / time 实查；78 个 `@deepseek-ai/dsh-*` 子包 tarball 逐文件制品级比对（版本号归一化后区分真实代码变化与纯版本串变化）；线上容器只读 SSH 探针
> **状态**：**分析完成，升级未执行**。可执行命令见 [dsh-0.2.1-rc.3-runbook](dsh-0.2.1-rc.3-runbook.md)；线上写入需单独授权。

---

## 一、结论摘要

| 判定项 | 实测结果 |
| --- | --- |
| 线上 `dsh.10ge.cn` 实际运行版本 | **`0.2.1-rc.2`**（CLI、挂载树、profile 四处官方依赖一致） |
| npm `latest`（官网稳定通道） | **`0.2.1-rc.2`** |
| npm `next`（官网候选通道） | **`0.2.1-rc.3`**，发布于 `2026-10-23T07:54:30.267Z` |
| npm `alpha` | `0.2.1-alpha.5`（`2026-10-16T12:31:49.659Z`） |
| 与官网 `latest` 的落差 | **零**。线上已等于官网最新稳定版，不存在「落后于官网」的事实 |
| 唯一待同步目标 | `0.2.1-rc.3`（`next` 通道，非 `latest`） |
| 闭包差异规模 | 78 包中 **5 包有真实变化** + **1 个新增包**，其余 73 包仅版本号字符串变化 |
| 运行时代码增量 | 约 **+11.2 KB**（`dsh-cordis-client-runner` +2.34%、`dsh-client-ui-agent-preset` +1.47%）；新增包解包 **64 KB** |
| 破坏性变更 | **1 处类型签名变更**（`AgentPresetSeatController.select()/apply()`），WorkDSH 仓库**未直接使用** |
| 数据格式迁移 | **未发现**。`dsh-session-projection`、`dsh-session-reference`、`dsh-storage*`、`dsh-tool-bash-persistent` 等零改动 |
| 安全补丁 | 官方无 changelog、无安全公告；逐文件比对**未见**鉴权 / 路径校验 / 凭据 / 沙箱相关文件变化 |
| 可升级性结论 | **技术上可升，风险可控**；但需同步 **6 处版本真源** + 重放 **4 处线上派生补丁** + 重新豁免 **13 个第三方插件** |

### 关键判断

1. **前提需要纠偏**：用户要求「同步到官网最新版本」，而线上当前版本恰好就是官网 `latest`。真正可升的只有 `next` 通道的 `0.2.1-rc.3`——这是一个**预发布候选版**，不属于稳定发布。因此本方案的性质是「跟进候选版」，而非「补齐落后版本」。
2. **rc.3 是一次小步迭代**：变更集中在三处——新增「区域更多菜单」（新包 + 装配 + 3 个 slot）、预设应用结果三态化、草稿初始化选项。无数据库/存储层改动，无 API 路由改动。
3. **升级的主要成本不在代码，而在装配**：4 处线上派生补丁（auth-proxy / profile 热重载 / webRuntime 路由 / 兼容豁免）必须重放并逐项验证锚点唯一性，这是历史上最容易出问题的一环。
4. **收益判断**：rc.3 带来的能力（更多菜单、创建插件草稿入口）对 WorkDSH 是**非必需新增 UI**，且会主动在左导航/会话头/右栏插入官方入口，存在信息架构冲突风险。**建议：先按本方案在影子实例验证，再决定是否正式切换；若仅为「跟随最新」，可暂缓至 rc.3 转 `latest` 或 `0.2.2` 正式版。**

---

## 二、当前版本盘点

### 2.1 线上 dsh.10ge.cn（2026-10-25 只读复验）

| 项目 | 实测值 |
| --- | --- |
| 容器 | `dsh` \| `Up 6 hours (healthy)` \| 镜像 `1panel/deepseek-harness:0.2.0-rc.2` |
| `dsh --version` | `0.2.1-rc.2` |
| 挂载树 | `/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json` → `0.2.1-rc.2` |
| profile 官方依赖 | `dsh-base` / `dsh-schedule` / `dsh-time-context` / `dsh-web-app` 均 `0.2.1-rc.2` |
| profile 锁文件 | `pnpm-lock.yaml` 11808 行 |
| `dsh-client-ui-entry-customization` | **不存在**（`ENTRY_CUSTOMIZATION_ABSENT`） |
| 部署形态 | 镜像 tag 停留在 `0.2.0-rc.2` + `standalone` 挂载树换版；rootfs 只读；`/data/dsh`、`/workspace` 为 bind mount |

> **判断陷阱（R10）**：镜像 tag 是 `0.2.0-rc.2`，但实际运行的是 `0.2.1-rc.2`。**任何版本判定都不能看镜像 tag**，必须查 CLI、挂载树 `package.json`、profile 依赖三处。

### 2.2 仓库基线（`/Users/apple/Documents/AI-luoji/workdsh`）

| 位置 | 现状 |
| --- | --- |
| 根 `package.json` devDependencies | 官方 26 条：25 个 `@deepseek-ai/dsh*` + `@deepseek-ai/cordis@4.0.5`，全部 `0.2.1-rc.2` |
| 根 `package.json` `pnpm.overrides` | **308 条**，其中 `@deepseek-ai/dsh*` **300 条全部 `0.2.1-rc.2`**，非 dsh 8 条 |
| 根 `.npmrc` | 不存在 |
| 根 `pnpm-workspace.yaml` | 仅 packages 列表，无 `minimumReleaseAge` 配置 |
| `deploy/profile/package.json` | 官方 4 条 `0.2.1-rc.2` + 第三方 13 个 + workdsh 自有 14 个 tgz；`dsh.profile.bundles` 27 条；`patchReload: live` |
| `deploy/profile/pnpm-workspace.yaml` | `minimumReleaseAgeExclude` **249 条**（其中 **227 条为 `@deepseek-ai/*@0.2.0-rc.2` 死条目**）；官方 override **294 条** = 288 × `0.2.1-rc.2` + `cordis 4.0.5` / `plugin-group 1.0.5` / `plugin-include 1.0.10` / `plugin-loader 1.0.6` / `plugin-timer 1.1.7` / `schemastery 3.18.5` |
| `deploy/profile/compatibility.json` | 仅 1 条：`@nanmicoder/dsh-agent-teams@0.1.23 → ["0.2.1-rc.2"]` |
| `packages/**/package.json` 含 `0.2.1-rc.2` | **16 个文件**（bundle 15 条精确 devDep；各插件 peer `^0.2.1-rc.2` + 精确 devDep） |

### 2.3 本地预览 Profile

由 `pnpm preview:install` 维护，官方依赖同仓库基线 `0.2.1-rc.2`。升级后需重建。

---

## 三、官方版本定位

```
$ npm view @deepseek-ai/dsh dist-tags --json
{ "alpha": "0.2.1-alpha.5", "latest": "0.2.1-rc.2", "next": "0.2.1-rc.3" }
```

| 版本 | 发布时间（UTC） | 通道 | 与线上关系 |
| --- | --- | --- | --- |
| `0.2.1-alpha.5` | 2026-10-16T12:31:49Z | alpha | 线上历史上用过的更早版本 |
| `0.2.1-rc.1` | 2026-10-17T03:17:24Z | — | 过渡 |
| `0.2.1-rc.2` | 2026-10-17T08:36:31Z | **latest** | **线上当前版本** |
| `0.2.1-rc.3` | 2026-10-23T07:54:30Z | **next** | 本方案升级目标 |

**通道语义**：`latest` 由 `rc.2` 占据已 8 天；`rc.3` 进入 `next` 已 2 天，尚未转正。发布节奏表明 `0.2.1` 仍在候选期。

**官方 changelog 缺失**：npm 与 GitHub 均无 rc.2→rc.3 的变更说明。本报告的全部变更结论来自**制品级逐文件比对**（先对 `0.2.1-rc.[23]` 版本串做归一化，再比 md5），因此「哪些文件变了」是确定事实；「变更的业务语义」由代码与类型声明反推，可能存在仅运行时才暴露的语义差异（见第十一节）。

---

## 四、核心变更清单

### 4.1 变更总览（78 包全量比对结果）

| 包 | 变化文件 | 字节变化 | 性质 |
| --- | --- | --- | --- |
| `dsh-cordis-client-runner` | `lib/client.js` | 402285 → 411698（**+9413**） | 新增 3 个 slot + 草稿选项 |
| `dsh-client-ui-agent-preset` | 6 个文件 | `client.js` 111824→113472（+1648）；`seat-store.d.ts` 5882→6280；`README.md` 6134→7554；`README.zh.md` 5652→7040；`README.i18n.yaml` 1484→1484；`package.json` 2609→2672 | 三态结果 + 埋点 + 草稿入口 |
| `dsh-web-app` | `cordis.patch.yml` / `package.json` | 22796→22981（+185）；9983→10051（+68） | 装配新增 1 行 + 新增 1 个依赖 |
| `dsh-agent-preset` | `skills/cordis-composition-reference/references/packages.md` | 41003 → 41180 | 纯文档 |
| `dsh-tool-cordis` | `lib/types/api-catalog.js` | 663240 → 663394 | 纯类型目录 |
| **新增包** `dsh-client-ui-entry-customization` | — | 解包 64 KB（`lib/client.js` 仅 6239 B / gzip 2141 B） | 全新客户端插件 |

其余 **73 包**：仅 `0.2.1-rc.2` → `0.2.1-rc.3` 版本串变化，代码零改动。

### 4.2 功能更新

**F1｜区域级「更多」菜单（More menus）——本轮唯一用户可见功能**

三段式实现，缺一不可：

1. **新包** `@deepseek-ai/dsh-client-ui-entry-customization@0.2.1-rc.3`
   - 纯客户端插件（无 host 侧）；`peerDependencies: { "@deepseek-ai/cordis": "~4.0.5" }`
   - `dsh.client.inject`：`dsh-client-locale`、`dsh-client-ui-plugin-manager`、`dsh-client-ui-workspace`
   - 文案（实测）：en `install: "Browse other plugins"` / `create: "Create your plugin"`；zh `install: "浏览更多插件"` / `create: "创建你的插件"`
   - 行为：`createPlugin` 用 **Creator preset 开新 Session**，把本地化请求**追加到草稿区，绝不发送**（`createPrompt.sidebar` / `conversation` / `rightbar` 三套文案）
   - 埋点：`more_menu_item_click`，参数 `region ∈ {sidebar, conversation, rightbar}`

2. **装配** `dsh-web-app/cordis.patch.yml`：在 `ui-agent-preset` 与 `ui-settings-session-log` 之间插入
```yaml
    # Region-local More menus: pin or unpin plugin launchers and start a
    # plugin draft.
    - id: entry-customization
      name: '@deepseek-ai/dsh-client-ui-entry-customization'
```

3. **宿主 Slot** `dsh-cordis-client-runner` 新增 3 个 `kind: "list"` slot，全部 `replaceRisk: "none"`：
   - `conversation.session.header.views.actions`（`ConversationViewActionsOwnerProps`）
   - `sidebar.panellist.actions`（`SidebarPanelActionsOwnerProps`；语义原文：「Rows of the panel list's More menu; the sidebar shows More only while this list has registrations.」）
   - `sidebar.right.tab.guide.actions`（`SidebarRightGuideActionsOwnerProps`）

> **对 WorkDSH 的直接后果**：官方入口会自动出现在左导航面板行、会话头部、右栏起始页。WorkDSH 的左导航由自有插件以 `order` 递增占据（`projects` 5 / `assistant` 10 / `library` 50 / `drive` 55 / `workdsh-probe` 90），感官上是「多出官方更多按钮」，需视觉回归确认是否挤压。

**F2｜预设应用结果三态化**

`dsh-client-ui-agent-preset/lib/types/client/seat-store.d.ts`（**破坏性**）：

```ts
export type AgentPresetApplyOutcome = {
    readonly kind: 'applied' | 'staged' | 'unchanged';
} | {
    readonly kind: 'refused';
    readonly reason: string;
};
select(id: string): Promise<AgentPresetApplyOutcome>;   // 旧：Promise<string | undefined>
apply(): Promise<AgentPresetApplyOutcome>;              // 旧：Promise<string | undefined>
```

语义：从「返回错误字符串 / undefined」改为结构化结果，区分「已应用 / 已暂存（等新会话生效）/ 无变化 / 拒绝（带原因）」。

配套新增埋点 `agent_preset_switch`，上报条件实测为：
```js
(outcome.kind === "applied" || outcome.kind === "staged" && sessionId === void 0)
  && from !== void 0 && to !== void 0 && to !== "other" && from !== to && enabled !== void 0
```
`analyticsMode(id)` 映射：`""` → `undefined`；`cordis` → `creator`；`ptc` / `minimal` / `standard` 原样；其他 → `other`。

**F3｜草稿初始化选项**

```ts
export interface DraftInitializationOptions {
    readonly prompt?: string;
    readonly clearPreviousDraft?: boolean;
    readonly whenDraftExists?: 'replace' | 'append' | 'keep';
}
```
`clearPreviousDraft` 的语义被 `whenDraftExists` 取代（保留字段兼容）。这是 F1「创建你的插件」把文案追加进草稿的技术前提。

**F4｜`startCreatorDraft` 入口**：`agent-preset/lib/client.js` 第 2427 行定义，供 `CreatePluginMenuItem`（第 1045 行）与 `AgentPresetSection`（第 1689 行）调用。

**F5｜文档与类型目录**：`dsh-agent-preset` 的 cordis 组合参考文档、`dsh-tool-cordis` 的 API catalog 同步更新，无运行时影响。

### 4.3 依赖包升级

| 类别 | rc.2 | rc.3 | 说明 |
| --- | --- | --- | --- |
| 根 `dsh` 的 86 条依赖 | 86 个 key | **完全相同的 86 个 key** | 零增删，仅版本串替换为 `0.2.1-rc.3` |
| Cordis 族 | `cordis 4.0.5` / `group 1.0.5` / `include 1.0.10` / `loader 1.0.6` / `timer 1.1.7` / `schemastery 3.18.5` | **不变** | WorkDSH override 无需调整 |
| `dsh-client-ui-agent-preset` | — | 新增 devDep `@deepseek-ai/dsh-client-product-analytics@0.2.1-rc.3` | 埋点依赖 |
| `dsh-web-app` | — | 新增依赖 `@deepseek-ai/dsh-client-ui-entry-customization@0.2.1-rc.3` | 唯一新增运行时依赖 |
| 第三方（13 个） | — | **零变化** | 升级不涉及第三方版本变更 |

### 4.4 安全补丁

- 官方未发布安全公告，仓库无 `CHANGELOG`。
- 对 78 包逐文件比对：**未见** `dsh-credentials`、`dsh-client-connection`（认证）、`dsh-fs-local`（路径校验）、`dsh-mcp-client`（传输）、沙箱/审批相关文件发生变化。
- **结论：rc.3 不含已披露的安全修复。因此「不升级」不产生已知安全敞口；「升级」也不能作为安全加固措施。**
- 唯一与安全相关的间接影响：新增埋点 `more_menu_item_click` / `agent_preset_switch` 属于产品分析上报，携带内容为枚举值（region、preset id 类别），**不含会话正文**。

### 4.5 性能影响

| 维度 | 评估 |
| --- | --- |
| 首屏体积 | 新增 client 插件 `entry-customization`：未压缩 6239 B / gzip **2141 B**，相对 runner 402 KB <0.6%，可忽略 |
| runner 解析开销 | +9413 B（+2.34%），纯声明式 slot 注册，无新增轮询/监听证据 |
| 启动时间 | 装配新增 1 个 client 插件，无 host 侧插件，预期不影响 `start_period` |
| 数据路径 | 无变化（session/storage 包零改动） |

无性能优化类改动。

### 4.6 破坏性变更

| 编号 | 变更 | 影响面 | WorkDSH 是否受影响 |
| --- | --- | --- | --- |
| **B1** | `AgentPresetSeatController.select()/apply()` 返回类型改为 `AgentPresetApplyOutcome` | 任何直接调用该控制器的客户端代码 | **否**。仓库仅 `tests/integration/expert-native-presets.test.mjs:27` 有假实现 `select: async () => { writes++; }`，没有消费返回值 |
| **B2** | `dsh-web-app/cordis.patch.yml` 装配序列新增 `entry-customization` | 所有使用 `dsh-web-app` 的 profile | **是（间接）**。WorkDSH profile 有 27 个 bundle + `patchReload: live`，需验无 duplicate id / 装配冲突 |
| **B3** | 宿主版本变更触发兼容闸门 | 13 个第三方插件 | **是**。`compatibility.json` 只登记了 `0.2.1-rc.2`，换 rc.3 后必须重新 `allow-version`，否则插件被 `skipping profile bundle` 跳过 |

---

## 五、依赖闭包差异

- 官方子包集合：rc.2 与 rc.3 **同为 78 个**（`@deepseek-ai/dsh*`），无增无删。
- 根依赖 key 集合：**86 条完全相同**。
- 唯一结构变化：rc.3 的 `dsh-web-app` 多声明 `dsh-client-ui-entry-customization`，使实际安装树多出 1 个顶层包。

**升级后预期的解析形态**（沿用 rc.2 的硬门禁口径）：
`resolved 88 packages (79 @deepseek-ai/dsh)` ← 相比 rc.2 的 87/78 各 +1，仅因新包。

> 注意：上一轮 rc.2 升级时官方 override 记录为 296 条，本次实测文件为 288 条 `0.2.1-rc.2` + 6 条 cordis 族/schemastery。**升级以实际文件为准**，不按历史数字机械替换。

---

## 六、WorkDSH 现有代码与官方差异点

### 6.1 Slot 使用面（实测 `slots.inject` 全部命中点）

| 插件 | 注入的 slot |
| --- | --- |
| `packages/bundle` `harness/client.ts` | `sidebar.brand.name`、`sidebar.brand.mark`、`shell.overlay`、`main`、`sidebar.panellist`（`workdsh-probe`，order 90） |
| `packages/plugins/projects` | **`conversation.session.header.actions`**、`main`、`sidebar.panellist`（order 5） |
| `packages/plugins/assistant` | `main`、`sidebar.panellist`（order 10） |
| `packages/plugins/library` | `sidebar.right.pane.tab`、`main`、`sidebar.panellist`（order 50）、`conversation.input.left` |
| `packages/plugins/drive` | `sidebar.right.pane.tab`、`main`、`sidebar.panellist`（order 55） |
| `packages/plugins/workbench` | `conversation.input.dock`、`main`、`conversation.input.overlay`、`sidebar.panellist` ×2 |
| `packages/plugins/office` | `sidebar.right.tab.document`、`sidebar.right.pane.tab` |
| `packages/plugins/connectors` | `main`、`conversation.input.left` |
| `packages/plugins/skills` | `main` |

**结论**：rc.3 新增的 3 个 `.actions` slot **WorkDSH 均未使用**；`projects` 用的是 `conversation.session.header.actions`（≠ 新的 `...views.actions`），不受影响。

### 6.2 预设控制器依赖

WorkDSH 未直接消费 `AgentPresetSeatController` 的返回值。B1 变更不触碰源码。

### 6.3 版本真源缺口（**升级必改**）

`dsh-client-ui-entry-customization` 在三处真源中**全部 0 命中**：

| 文件 | 命中数 |
| --- | --- |
| 根 `package.json`（overrides 308 条） | 0 |
| `deploy/profile/pnpm-workspace.yaml`（官方 override 294 条） | 0 |
| `deploy/profile/package.json` | 0 |

按 rc.2 的经验，`check:versions` 会反向校验 overrides 覆盖全部官方子包，缺条目将直接判失败。

### 6.4 线上派生补丁（必须在换树后重放）

| 补丁 | 脚本 | 判据 |
| --- | --- | --- |
| 1Panel auth-proxy | `deploy/ops/derived/ensure-rc2-auth-proxy.mjs` | 锚点 `\tisAuthenticated(request) {` 必须**恰好 1 次**，否则 exit 1 且不改文件；standalone 树 + profile **双份** `ONEPANEL_DSH_AUTH_PROXY`，`marker=1` |
| profile 热重载 | `deploy/tools/workdsh-fix-profile-reload.sh` | 支持 `--revert`；entrypoint 第 162/374 行会自动重打 |
| webRuntime 路由 | `deploy/tools/workdsh-fix-webruntime-routes.sh` + `workdsh-webruntime-patches/dream-skin.patch` | 日志 `/data/dsh/tmp/webruntime-fix.log` |
| 兼容扫描 | `deploy/tools/workdsh-compat-scan.mjs` | 静态 inject 服务缺口扫描；`--profile` / `--core` / `--json`；exit 0/1/2 |

**锚点稳定性评估**：rc.3 未修改 `dsh-client-connection`（auth-proxy 目标）与 `dsh-app-boot`（热重载目标）——两者在本次 78 包比对中均为零改动。因此锚点应仍唯一，但**必须实测 `marker=1`，不可假定**。

### 6.5 第三方兼容豁免

`deploy/profile/compatibility.json` 仅有 `@nanmicoder/dsh-agent-teams@0.1.23 → ["0.2.1-rc.2"]`。宿主换 rc.3 后该条目不再匹配，插件会被闸门跳过。其余 12 个第三方插件即使无显式豁免，也需通过 `workdsh-compat-scan` 静态确认 inject 服务在 rc.3 中仍存在。

---

## 七、兼容性风险与数据迁移风险

### 7.1 风险登记表

| 编号 | 风险 | 等级 | 判定依据 | 处置 |
| --- | --- | --- | --- | --- |
| **R1** | 官方「更多」入口出现在左导航面板行 / 会话头 / 右栏起始页，与 WorkDSH 自有导航视觉冲突或挤压 | **中** | 3 个新 slot 被 `entry-customization` 占用；`sidebar.panellist.actions` 语义为「面板行内的 More 菜单」 | 影子实例截图比对三个区域；若不可接受，在 profile 补丁层对 `entry-customization` 置 `disabled: true` |
| **R2** | `dsh-web-app/cordis.patch.yml` 新增装配条目，改变 client 插件加载次序 | 低 | 插入点位于 `ui-agent-preset` 与 `ui-settings-session-log` 之间 | 启动日志断言 `duplicate id` / `is incompatible with dsh` / `disabling profile plugin row` 均 0 |
| **R3** | `AgentPresetSeatController.select()/apply()` 返回类型破坏 | 低 | 仓库未消费返回值；测试仅为假实现 | 升级后跑 `test:integration`；若未来引入该控制器需按新类型改造 |
| **R4** | 兼容闸门拦截第三方插件 | **中** | `compatibility.json` 仅登记 rc.2；13 个第三方插件受影响 | 先跑 `workdsh-compat-scan.mjs --profile`，再逐个 `allow-version --dsh-version 0.2.1-rc.3 --accept-risk` |
| **R5** | 4 处派生补丁锚点漂移 | **中** | 历史两轮升级中各出现过一次签名/缩进变化 | 换树后立即重放并检查 `marker=1`；任一失败即按第十章回滚 |
| **R6** | 新增 client 插件影响首屏 | 低 | gzip 2141 B | 记录首屏耗时基线，切片对比 |
| **R7** | 数据迁移 | **极低** | session/storage/reference/search/titles 相关包**全部零改动** | 仍做 sessions / storages 文件计数前后比对 |
| **R8** | pnpm 11 `minimumReleaseAge` 拒绝新包 | **中** | rc.3 发布于 10-23，距今 2 天已过 24h 窗口；但 `entry-customization` 是首次安装，且 `minimumReleaseAgeExclude` 无任何 `0.2.1-rc.*` 条目 | `pnpm install` 带 `--config.minimumReleaseAge=0`；**不逐条补 288 条豁免** |
| **R9** | 仓库与线上单向漂移 | **中** | 续五十六已有同类教训（线上 0.2.73 / 仓库 0.2.72） | 严格执行第九章「6 处真源同步清单」，同一次变更内完成 |
| **R10** | 镜像 tag (`0.2.0-rc.2`) 与实际版本 (`0.2.1-rc.2`) 不一致导致误判 | 低（但误判代价高） | 2.1 节实测 | 版本判定只看 CLI + 挂载树 + profile 三处 |
| **R11** | 回退依赖旧树保留，磁盘不足 | 低 | 单树约 549–873 MB | 升级前 `df -h`，保留至少 2 个整树空间 |
| **R12** | 新增埋点引入 telemetry 外发 | 低 | 仅 `agent_preset_switch` / `more_menu_item_click`，参数为枚举 | 确认上报内容不含会话正文；如需关闭，在 profile 层禁用 `product-analytics` 插件 |

### 7.2 数据迁移风险专项

**结论：本轮无数据迁移。**

证据：
- 比对范围内 `dsh-session-projection`、`dsh-session-reference`、`dsh-experimental-session-search`、`dsh-experimental-session-titles-bundle`、`dsh-storage`、`dsh-storage-json`、`dsh-storage-domain`、`dsh-tool-bash-persistent`、`dsh-app-boot`、`dsh-client-connection` **全部零改动**。
- 无 schema 版本号变化，无迁移脚本引入。
- 历史数据以 JSONL / JSON 存储，写入侧未变，因此**理论上不存在不可逆的数据格式升级**。

验证方法（升级前后各跑一次，比对而非看绝对值）：
```bash
docker exec dsh sh -c 'find /data/dsh/sessions -type f | wc -l'
docker exec dsh sh -c 'find /data/dsh/storages -type f | wc -l'
```
> 注意：2026-10-17 记录的基线为 sessions 327 / storages 120317，**不得作为今日期望值**，必须以本次升级前的实测值为准。

### 7.3 对现有业务功能的潜在影响

| 业务面 | 影响判断 |
| --- | --- |
| 会话 / 消息 / 草稿 | 无数据变化；F3 草稿选项为**新增可选字段**，旧调用不受影响 |
| 专家 / 技能 / 预设 | `agent-preset` 变更集中在 UII 结果语义与埋点；WorkDSH 的 `workdsh-expert` 组合走自身插件，不受 B1 影响 |
| 左导航（projects / assistant / library / drive / workbench / probe） | 唯一可见风险面（R1），需视觉回归 |
| 右栏（library / drive / office 页签） | 新增 `.guide.actions` 仅在右栏起始页显示；不影响页签本身 |
| 门户登录 / Caddy 门禁 | 不涉及（镜像与 Caddyfile 未变） |
| 自动化 / 计划任务 | `dsh-schedule` 零改动 |
| 连接器 / MCP | `dsh-mcp-client` 零改动；`dsh-mcp-connector@0.2.75` peer 为 `>=0.2.0-rc.1 <0.3.0-0`，覆盖 rc.3 |

---

## 八、分阶段升级方案

> 详细命令见 [dsh-0.2.1-rc.3-runbook](dsh-0.2.1-rc.3-runbook.md)。本节说明阶段目标与出口条件。

### 阶段 0｜预升级检查（只读，零风险）

- 版本三处复验（CLI / 挂载树 / profile）
- 磁盘余量、容器健康、`RestartCount`、启动日志 error 计数
- 数据基线快照（sessions / storages 文件数）
- 当前 27 个 bundle 的激活状态导出
- `workdsh-compat-scan.mjs --profile` 静态扫描，记录基线缺口
- **出口**：基线值全部落表，磁盘足够放下 2 个整树

### 阶段 1｜仓库基线同步（6 处真源）

| # | 文件 | 改动 |
| --- | --- | --- |
| 1 | 根 `package.json` | 25 条 devDep + 300 条 override → `0.2.1-rc.3`；**新增** `@deepseek-ai/dsh-client-ui-entry-customization: 0.2.1-rc.3` override |
| 2 | `packages/**/package.json`（16 个） | peer `^0.2.1-rc.3` / devDep 精确 `0.2.1-rc.3` |
| 3 | `scripts/check-published-versions.mjs` | `expected` 与 companions 同步 |
| 4 | `deploy/profile/package.json` | 官方 4 条 → `0.2.1-rc.3`；`dsh-web-app` 走官方依赖自动带入新包，无需手写 |
| 5 | `deploy/profile/pnpm-workspace.yaml` | 288 条官方 override → `0.2.1-rc.3`；**新增** `entry-customization` override |
| 6 | `deploy/profile/compatibility.json` | 为 `agent-teams@0.1.23` 追加 `0.2.1-rc.3`（由 `allow-version` 自动写入，不手改） |

- **出口**：`pnpm install --no-frozen-lockfile` 退出码 0；`check:versions` PASS。

### 阶段 2｜测试环境验证（本地隔离）

- `check:versions` / `check:plan` / `check:acceptance` / `check:env`
- `typecheck` + `build`
- `test:integration`（覆盖 B1 相关断言）+ `test:activity` / `test:access` / `test:identity` / `test:projects` / `test:assistant` / `test:planning`
- `preview:install` 重建预览 Profile，确认官方依赖 = `0.2.1-rc.3`
- `probe:install`（临时 Agents home）+ `probe:presets`
- **出口**：全部 PASS，0 fail；预览 Profile 能启动并渲染

### 阶段 3｜灰度发布（影子实例）

> **现状约束**：本环境是单容器、单入口、Caddy 按主机名门禁，**无法做百分比流量切分**。因此「灰度」落地为两种等价物：

**3a 影子实例（技术灰度）**
- 复用同一镜像，新建临时容器 `dsh-rc3-canary`，映射独立端口（如 `3090`），挂载**新的 rc.3 standalone 树**；
- 数据侧：优先只读挂载 `profiles/web` 副本（`cp -a` 到 `/data/dsh/profiles/web-canary`），避免污染生产 profile；
- 验证启动、装配、日志、三个新 slot 渲染，全部通过后再进入 3b。

**3b 主体灰度（用户灰度）**
- 若实例仅有 1 个门户账号：等价于「正式切换 + 立即验证 + 快速回滚」，窗口应选低峰；
- 若存在多个门户账号：先由管理员账号登录验证全部业务面，再放开其他账号。

- **出口**：影子实例 `healthy`、`RestartCount=0`、启动日志 0 条 `did not activate`、三个新 slot 视觉可接受。

### 阶段 4｜正式上线

1. 备份：standalone 整树改名保留 + `profiles/web/{package.json,pnpm-workspace.yaml,compatibility.json,node_modules}` 副本 + `/home/luoji/dsh-backup-rc3-<ts>/`
2. 构建 rc.3 新树（容器内 `npm install -g --prefix …/_rc3-prefix @deepseek-ai/dsh@0.2.1-rc.3`，组装 hoisted 树，属主 `1000:1000`）
3. 硬门禁 A（解析）/ B（新树 CLI 版本）通过后才允许继续
4. profile 升位：`deploy/profile/package.json` + `pnpm-workspace.yaml` 双处改版本 → `pnpm install`（**以 uid 1000 执行，绝不 root**，带 `--config.minimumReleaseAge=0`）
5. **原子换树**：`mv standalone standalone.rc3old.<ts>` → `mv _rc3-standalone standalone` → `docker compose up -d --force-recreate`（普通 `up -d` 只输出 `Running`，不会重建）
6. 4 处派生补丁重放 + `marker=1` 断言
7. 兼容豁免：`dsh plugin allow-version <pkg>@<ver> --dsh-version 0.2.1-rc.3 --accept-risk`
8. **出口**：第九章 Gate A–H 全绿

### 阶段 5｜上线后验证与观察

- 立即：Gate A–H
- 15 分钟：容器仍 `healthy`、`RestartCount=0`、日志无 error 增长
- 2 小时：真实会话创建/发送/切换专家/打开各业务页
- 24 小时：无用户反馈异常，决策是否保留

---

## 九、升级完成后的验证标准（Gate A–H）

| Gate | 检查项 | 通过标准 |
| --- | --- | --- |
| **A** | 依赖解析完整性 | 全部 `@deepseek-ai/dsh*` 解析到 `0.2.1-rc.3`；cordis 族保持 `4.0.5 / 1.0.5 / 1.0.10 / 1.0.6 / 1.1.7`，schemastery `3.18.5`；包数 88（79 dsh） |
| **B** | 新树 CLI | `dsh --version` = `0.2.1-rc.3` |
| **C** | 三处版本一致 | 容器 CLI = 挂载树 `package.json` = profile `dsh-base` = `0.2.1-rc.3`；profile 顶层 `@deepseek-ai/dsh*` 全部同版 |
| **D** | 装配无冲突 | 启动日志 `duplicate id` = 0、`is incompatible with dsh` = 0、`disabling profile plugin row` = 0、`did not activate` = 0；27 个 bundle 全部在位 |
| **E** | 派生补丁 | auth-proxy 双份 `marker=1`（standalone + profile）；profile-reload `marker=1`；webRuntime 路由 `--check` 通过；`workdsh-compat-scan --profile` exit 0 |
| **F** | 数据完整 | sessions / storages 文件数与升级前**完全一致**；随机抽 3 个会话可正常打开 |
| **G** | 功能正常 | `https://dsh.10ge.cn/` → `302 /portal`；登录成功；`127.0.0.1:3080` = 200；左导航 6 个自有入口全部可见且可点；专家/项目/技能/连接器/资料库/自动化只读 API 无 error 对象；新建会话可发送一条消息并收到回复 |
| **H** | 性能达标 | 容器 `healthy`；`RestartCount=0`；首屏耗时与升级前基线差值 ≤10%；启动时长在 `start_period 300s` 内完成 |

**「无遗留问题」判定**：Gate A–H 全绿 + 观察期内 0 条新增 error 日志 + 0 条 `did not activate`。任一 Gate 失败即触发第十章回滚判定，不做「先上线再修」。

---

## 十、回退锚点与回滚预案

### 10.1 必须保留的锚点

| 锚点 | 路径模板 |
| --- | --- |
| 旧 standalone 整树 | `/data/dsh/global-dsh/standalone.rc3old.<YYYYMMDDHHmmss>` |
| 旧 profile 依赖 | `/data/dsh/profiles/web/node_modules.pre-rc3.<ts>` |
| profile 配置三件 | `/data/dsh/profiles/web/{package.json,pnpm-workspace.yaml,compatibility.json}.bak.rc3.*` |
| 宿主侧配置备份 | `/home/luoji/dsh-backup-rc3-<ts>/` |

### 10.2 回滚触发条件（任一命中即回滚，不做局部修补）

- Gate B / C 不一致且 10 分钟内无法定位
- Gate D 出现 `did not activate` 或 `disabling profile plugin row` 且涉及自有插件
- Gate E 任一补丁 `marker != 1` 且脚本报锚点不匹配
- Gate F 数据计数变化
- Gate G 登录失败、主页面 5xx、会话无法发送
- 容器进入 restart 循环或健康检查在 `start_period` 后仍 `starting`

### 10.3 回滚步骤（约 3 分钟）

```bash
# 1. 停容器
docker compose stop deepseek-harness

# 2. 反向换树
cd /data/dsh/global-dsh && mv standalone standalone.rc3failed.<ts> && mv standalone.rc3old.<ts> standalone

# 3. 恢复 profile
cd /data/dsh/profiles/web && cp -a node_modules.pre-rc3.<ts> node_modules \
  && cp package.json.bak.rc3.<ts> package.json \
  && cp pnpm-workspace.yaml.bak.rc3.<ts> pnpm-workspace.yaml \
  && cp compatibility.json.bak.rc3.<ts> compatibility.json

# 4. 重建容器
docker compose up -d --force-recreate deepseek-harness
```

**回滚后验证**：`dsh --version` 回到 `0.2.1-rc.2`、三处版本一致、`healthy`、`RestartCount=0`、sessions/storages 计数与回滚前一致、登录与主页面正常。

> **注意**：回滚不需要恢复数据，因为本版本无数据格式变更。若将来版本引入迁移，回滚方案必须增加「数据快照」前置条件。

---

## 十一、未覆盖项与边界

| 项 | 说明 |
| --- | --- |
| 线上升级执行 | **已执行（2026-10-25）**，Gate D/G 已判定；Gate A/B/C/E/F 计数项与 Gate H 因 SSH 不可达**未复核**，见 [runbook 执行记录](dsh-0.2.1-rc.3-runbook.md#执行记录2026-10-25) |
| 浏览器逐页视觉回归 | **部分执行**：Gate G 逐视图 `innerText` 与截图已做；R1（「更多」入口挤占）通过 profile 禁用 `entry-customization` 规避，未做人工视觉回归 |
| 13 个第三方插件在 rc.3 下的运行时行为 | **未验证**。仅做了静态 inject 依赖判断；实际激活需在影子实例观察 |
| 真实模型验收 | **未执行**（无凭据）。F3/F4 的草稿路径无法端到端验证 |
| 埋点实际外发 | **未验证**。仅从代码确认参数为枚举，未抓包 |
| 官方 changelog | **不存在**。变更语义由代码反推，可能遗漏仅运行时暴露的差异 |
| `docs/dsh-v0.2.1-rc.3/` 官方文档镜像 | **未落盘**。版本判定以 registry + 发布包实测为准（延续 rc.2 的边界处理） |
| 多用户灰度 | **未确认实例实际账号数**。3b 主体灰度需在执行前确认 |
| 镜像升级 | **不在范围**。继续沿用 `1panel/deepseek-harness:0.2.0-rc.2` + 挂载树换版 |
| git commit / push | **未执行**。`docs/` 被 gitignore，如需提交须 `git add -f` |

---

## 十二、执行结果

分析阶段（本章前十一节）为只读产出；执行阶段经用户「好的，执行吧」授权后完成线上 `0.2.1-rc.2 → 0.2.1-rc.3` 升级。

| 项目 | 结果 |
| --- | --- |
| npm dist-tags / time 实查 | 已完成 |
| 78 包制品级逐文件比对 | 已完成，5 包真实变化 + 1 新包 |
| 线上只读探针 | 已完成（容器状态、CLI、挂载树、profile、lock、新包缺失确认） |
| 仓库真源盘点 | 已完成（6 处） |
| 阶段 1–4 | 已完成（仓库基线同步、本地验证、影子实例灰度、线上换树与派生补丁） |
| 阶段 5 | 部分完成（D/G 已判定；A/B/C/E 已补齐；F/H 因阶段 0 基线未留存，比值项不判定） |
| Gate A/B/C | 通过（2026-10-25 LAN 恢复后复跑）：CLI `dsh --version` = `0.2.1-rc.3`；profile `@deepseek-ai` 下 237 个 dsh 包全为 `0.2.1-rc.3`（其余 8 个为第三方依赖）；`dsh-base` / `dsh-schedule` / `dsh-time-context` / `dsh-web-app` 一致，`dsh.profile.bundles` 27 项在册 |
| Gate D | 通过（修复后）：首启 `1 entry did not activate` → 禁用 `entry-customization` 后无 boot error；2026-10-25 三处复核（页面 / 控制台 / 容器日志）零命中 |
| Gate E | 通过：marker 两份各 1；`workdshRootIncludeEntry` 两份 `dsh-app-boot` 各 2；dream-skin `--check` = 已是补丁状态；entrypoint `reapply_profile_reload_fix` ×3 |
| Gate F | 部分通过：抽 3 个历史会话可打开；`sessions` 条目 = 1、`storages` 条目 = 19；阶段 0 的 S0 / T0 未留存，**差值未判定** |
| Gate G | 通过，1 项不符合预期（library / drive 视图右栏无 tab），详见 [runbook 执行记录](dsh-0.2.1-rc.3-runbook.md#执行记录2026-10-25) |
| Gate H | 部分通过：`healthy`、`RestartCount=0`、内部 3080 TLS 200（ttfb 3.6ms）、公网 `302 /portal`；首屏 FCP 400ms / load 708ms 已采样，阶段 0 基线未采集，`≤ 基线 × 1.1` **未判定** |
| 24 小时决策 | **2026-10-25 用户裁决：保留 `0.2.1-rc.3`**（未回滚 rc.2）。随后经用户授权**清理回滚锚点**：`standalone.rc3old.20261024175710`（873M）+ `node_modules.pre-rc3.20261025015343`（1.3G）+ 三份 `.bak.rc3.20261025015343` + `cordis.patch.yml.bak.rc3entry.20261024232846`，磁盘 176G → 174G；删除前后均 `healthy` / `RestartCount=0` / 内部 200 / 日志 0 错误。此后回滚须从 npm 重装 rc.2。详见 [runbook 第七节](dsh-0.2.1-rc.3-runbook.md#执行记录2026-10-25) |

**新增线上偏离**：`profiles/web/cordis.patch.yml` 追加 `- id: entry-customization / disabled: true`（根因：`pluginNavigation` 唯一 provide 点位于 `ctx.slots.inject("main", …)`，`main` 槽 owner 未激活导致 boot 永久 pending → 白屏）；该禁用块与既有 `ui-plugin-manager` 禁用块须成对保留（原随附备份 `cordis.patch.yml.bak.rc3entry.20261024232846` 已于 2026-10-25 清理，块内容见 runbook 第三节）。

---

日期：2026-10-25。证据来源：`npm view @deepseek-ai/dsh`（dist-tags / time / dependencies）、78 个官方子包 tarball 制品级比对（`/tmp/dsh-rc-diff/`，含 `diff-result.json`、`runner.diff`）、仓库 `package.json` / `deploy/profile/*` / `packages/**/package.json` 实测、线上容器只读 SSH 探针。
