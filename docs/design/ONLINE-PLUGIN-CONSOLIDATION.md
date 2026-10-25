# 线上插件工程化归并方案（P1-15）

状态：**已批准（2026-10-15）**。作为专项 D19 执行，一次一批。
依据：[ADR-0035](../adr/0035-online-plugin-ownership-consolidation.md)（Accepted）、[线上一致性审计](../evidence/online-consistency-audit-2026-10-15.md)、[AGENTS.md](../../AGENTS.md) 插件目录规则、[PLUGIN-DELIVERY](../PLUGIN-DELIVERY.md) 执行规则。

## 0. 目标与非目标

**目标**：把 `deploy/tools/` 下 10 个线上独有的手写 JS 插件对象，按**业务所有权**归并进 `packages/plugins/` 的既有模块，补齐 TypeScript、契约、测试、typecheck/build、`docs/modules.json` 登记与官方能力复用记录，消除「同一领域两套实现 / 同一算法两份实现」。

**非目标**：不改线上部署；不改上游 dsh 与官方包；不新建 npm 发布包；不做企业 SSO 与多组织。新建模块仅 1 个（`packages/plugins/web-runtime`）。

## 1. 归并总表

| # | 线上对象（`deploy/tools/`） | 形态 | 判定 | 目标 | 处理 |
| --- | --- | --- | --- | --- | --- |
| 1 | `workdsh-grant-admin` | Host 插件 + `cordis.patch.yml` | 与 access 职责重叠 | `packages/plugins/access` | 并入：面板「资源授权」Host 路由 + Client 页 |
| 2 | `workdsh-grant-baseline`（顶层，542 行） | Host 迁移工具 | access 一次性迁移 | `packages/plugins/access` | 并入为迁移工具子入口 |
| 3 | `workdsh-access-lab/grant-baseline`（581 行） | **同包名重复副本** | 重复 | — | **删除**，只保留一份 |
| 4 | `workdsh-access-lab/access-enforce` | 运行时织入补丁（无 `dsh` 字段） | access 判定点 C4/P2 | `packages/plugins/access` | 并入：补 `dsh.bundle.patch`，弃 `apply-c4.sh` 现场生成 loader 块 |
| 5 | `workdsh-access-probe` | 沙箱诊断 | 测试探针 | `packages/plugins/access/tests` | 并入为探针，非产品插件 |
| 6 | `workdsh-identity-portal` | Host 插件（`workdshIdentity`） | 身份提供者 | `packages/plugins/identity` | **升为 0.1 实现**（用户裁决） |
| 7 | `workdsh-portal-auth/index.js` | 共享签名（**无 package.json**） | 两方协议 | `packages/contracts` 子路径 | 唯一化；门户与 identity 各自引用 |
| 8 | `workdsh-plugin-schedule` | Host + Client（**已部署**） | 与 automations 同域 | `packages/plugins/automations` | 并入；删 `workdsh-bundle` 占位导航行与 priority 遮蔽 |
| 9 | `workdsh-plugin-users` | 纯 Client（Host 空） | 用户管理呈现 | `packages/plugins/admin` | 并入为首个切片（P1-10） |
| 10 | `workdsh-remote-shell` | Cordis 插件（`webserver/index-inject`） | 反代下 Web 运行时兼容 | **`packages/plugins/web-runtime`（新建）** | 迁入为 0.1 实现；修浮动 peerDep `"*"` |
| — | `workdsh-webruntime-patches/*.patch` | 成品补丁 ×2 | 同一能力域制品 | **`packages/plugins/web-runtime`（新建）** | 迁入模块 `patches/` |

对照的仓库既有模块状态：`access`（implemented 0.1.0-alpha.5）／`identity`（planned，空壳）／`automations`（in_progress 0.1.0-alpha.1，**`src/client.tsx` 缺失、`dist/client.browser.js` 未生成**）／`admin`（planned，空壳）／`providers/identity-local`（implemented 0.1.0-alpha.6）。

## 2. 分批执行

顺序按「线上在跑优先 + 依赖前置」：批 1 的基线工具是批 2 切主体前的必要前置。

### 批 1 —— access 域收敛（输入 4 件 → 1 个模块）

- 产出（`packages/plugins/access`）：
  - Host 路由 + Client 页面（「资源授权」），按官方 `Remote`/`Slot` 契约，不新建第二套服务；
  - 迁移工具（基线 grant 签发），保留**默认 dry-run** 语义；
  - 授权判定点（C4/P2，包装破坏性方法），由模块 `dsh.bundle.patch` 声明，删除 `apply-c4.sh`；
  - 测试探针移入 `tests/`。
- 门槛：`typecheck` / `build` / `node --test` 全绿；`node scripts/check-plan.mjs` PASS；模块版本线递增并在 `docs/modules.json` 记 release；官方能力复用记录落 `docs/design/`。
- 清理：删 `deploy/tools/workdsh-grant-admin`、`workdsh-grant-baseline`、`workdsh-access-lab`、`workdsh-access-probe`（**先确认线上引用已切换**，见第 5 节）。

### 批 2 —— identity 域收敛（输入 2 件 + 门户去重）

- 产出：
  - `packages/plugins/identity` 0.1：`package.json`（`dsh.bundle.patch`）、`tsconfig.json`、契约、测试；提供 `workdshIdentity`，解析顺序「会话绑定优先 → 请求作用域门户身份 → 兜底主账号」；
  - `packages/contracts` 新增签名子路径（`signaturePayload` / `computeSignature` / `verifySignature` / `readSecret` / `identityFromHeaders`，载荷为字段数组 JSON）；
  - `packages/portal` 的 `src/identity-bridge.mjs` 改为引用同一实现，删除重复算法。
- 门槛：**同一签名向量两端同值**用例通过；ActorContext 三种来源的解析顺序用例通过；门户既有测试不回归。
- 前置约束：切主体前必须先跑批 1 的 grant 基线，否则既有资源被拒。
- 清理：删 `deploy/tools/workdsh-identity-portal`、`workdsh-portal-auth`。
- **不改 `deploy/profile`**：`disabled` local + `insert` portal 的补丁写法保留到切流时统一处理。

### 批 3 —— automations 域收敛（输入 1 件）

- 产出（`packages/plugins/automations`）：补齐 `src/client.tsx` 与 `dist/client.browser.js`；侧栏「定时任务」入口由本模块自持；官方 `@deepseek-ai/dsh-schedule` 的持久化与交付语义复用，不另造调度底座。
- 门槛：全仓 grep 无重复导航行 id；侧栏只出现一行「定时任务」；`workdsh-bundle` 的 `workdsh-automation` 占位行与 schedule 侧 `priority -10` 遮蔽均已删除。
- 清理：删 `deploy/tools/workdsh-plugin-schedule`。
- 注意：原 `dsh.bundle.patch: ./cordis.patch.yml` 指向不存在文件的缺陷，随并入自然消失，但要确认无其他入口依赖该路径。

### 批 4 —— admin 域首个切片（输入 1 件）

- 产出（`packages/plugins/admin` 0.1）：`settings.section` 呈现层（设置 → 用户与权限，order 16）；数据源仍为同源 `/api/portal/*`，**不复制账号真源**。
- 门槛：双主体断言（管理员可见、非管理员拒绝）；按组织与所有权记录；`modules.json` 的 `admin` 从 planned 更新为 `in_progress` 并登记 moduleVersion。
- 修正项：`package.json` description 与客户端 docblock 的矛盾，以已上线行为（设置页）为准改写描述。
- 清理：删 `deploy/tools/workdsh-plugin-users`。

### 批 5 —— web-runtime 新模块（输入 2 件，唯一新建模块）

- 产出（`packages/plugins/web-runtime` 0.1，新建）：
  - `package.json`（`dsh.bundle.patch: ./cordis.patch.yml`、`exports`、`files`）、`tsconfig.json`、`README.md`、`CHANGELOG.md`；
  - `remote-shell` 迁入为 TS 实现，保持经官方 `webserver/index-inject` 扩展点注入 `__DSH_TRANSPORT__.ownsHost` 的既有语义，`peerDependencies` 重钉到基线口径（去掉 `"*"`）；
  - `webruntime-patches/*.patch` 迁入模块 `patches/`，并在 README 写明每个补丁的作用、目标文件与失效判据。
- 门槛：注入行为在反代场景下可验证（boot HTML 含 `ownsHost`）；`check-plan` 承认新模块；`modules.json` 新增登记（`planned → in_progress`，`moduleVersion: 0.1`，task `P1-15`）。
- 清理：删 `deploy/tools/workdsh-remote-shell`、`deploy/tools/workdsh-webruntime-patches`。

### 收口 —— 部署侧

- 部署侧引用切换（`deploy/profile/package.json` 的 13 条 `file:` 依赖改指向新模块制品）：**属部署动作，另行授权、另行留证**，不在本方案内。

## 3. 每批的完成定义（DoD）

1. 源码为 TypeScript，有 `tsconfig.json` 与 `build`/`typecheck` 脚本；
2. 契约走 `workdsh-contracts` 子路径，不横导其他功能插件；
3. 仓库内测试可运行且有断言；
4. `docs/modules.json` 的 `status`/`moduleVersion`/`acceptanceNote` 同步；
5. 官方能力复用记录（任务 ID / 官方文档路径 / 锁定发布包公开入口 / 业务差异 / 验收与缺口）；
6. 依赖统一钉基线 `0.2.1-alpha.2`（含 `zod 4.4.3`），不保留线上浮动口径；
7. `node scripts/check-plan.mjs` PASS；
8. 未验证范围显式写明「未执行」。

## 4. 台账变更（2026-10-15 落定）

- 新增 `docs/adr/0035-online-plugin-ownership-consolidation.md`，状态 `Proposed → Accepted`；
- `docs/development-order.json`：新增 step `D19`（`tasks: ["P1-15"]`、`dependsOn: ["D01"]`、`status: "todo"`、`note` 指向本方案），与 D17/D18 同口径（数组位置在末位，保持既有编号不变）；新增批次 `B7「线上插件工程化归并」`（`steps: ["D19"]`）；**`currentStep` 保留 `D04`**，不因本专项跳步；
- `docs/modules.json`：**新增 1 条** `packages/plugins/web-runtime`（批 5 落地时登记，task `P1-15`，`moduleVersion: 0.1`）；`access` / `identity` / `automations` / `admin` 四条按各批落地时更新 `status`、`moduleVersion`、`acceptanceNote`；
- `docs/PLUGIN-DELIVERY.md`：追加 D19 专项说明（输入、产出、门槛、清理项）；
- `docs/STATUS.md`：登记本次决策与后续每批证据。

## 5. 风险与回退

| 风险 | 处置 |
| --- | --- |
| 双真源并存期双向漂移 | 并存期**禁止双写**：改动 `deploy/tools/` 或 `packages/plugins/` 的任一侧都必须登记；删除前确认线上引用已切 |
| 删除 `deploy/tools` 导致线上加载失败 | 删除动作放在「线上引用已切到新模块制品」之后；profile 的 `file:` 依赖指向容器内 tgz，切换需重打包 |
| 判定点迁入后强制失效 | 批 1 回归 `verify-enforce` 等价用例，确认包装与 dry-run 语义保留 |
| 导航行重复 | 批 3 门槛里显式检查占位行与遮蔽 hack 已删 |
| 切主体后既有资源被拒 | 批 2 强制前置批 1 的 grant 基线 |
| 签名静默恒失败 | 批 2 用同一向量两端断言，落在仓库测试里长期守护 |

**回退**：本方案全部改动都在仓库内，回退即 `git revert` 对应提交；线上不受影响（因为不改线上）。

## 6. 未验证 / 未执行（截至 2026-10-15）

- 未在本地加载运行任何线上插件；
- 未执行任何线上切换；
- 未跑 access / identity 的端到端鉴权（**未执行**：没有企业远程入口，端到端鉴权需要部署侧配合）；
- 批 3～5 尚未开始；**批 1、批 2 已落码并通过仓库门禁（见第 7、8 节），但均未部署、未在真实 Loader 下加载**；
- 门户**未启动过独立进程**验证去重后的模块导入（`packages/portal/tests/portal-identity-sync.test.mjs` 只断言副本与契约产物逐字节一致，不覆盖进程启动；`grants.test.mjs` 端到端用例在本机无 `127.0.0.1:3099` 沙箱时自动跳过）。

## 7. 批 1 官方能力复用记录（2026-10-15）

按 [PLUGIN-DELIVERY](../PLUGIN-DELIVERY.md) 模板登记。6 字段：任务 ID / 官方文档路径 / 锁定发布包公开入口 / 已有探针 / WorkDSH 需补的业务差异 / 验收与缺口。

**任务 ID**：P1-15（专项 D19，批 1 —— access 域收敛，输入 4 件 → `packages/plugins/access`）。

**官方文档路径**：`docs/dsh-v0.1.7-rc.2/`（本地镜像）。**边界**：基线已被用户推进到 `0.2.1-alpha.2`，而 `docs/dsh-v0.2.0-rc.2/` 镜像**尚未落盘**（见 [AGENTS.md](../../AGENTS.md) 与 [dsh-0.2.0-rc.2-upgrade](../evidence/dsh-0.2.0-rc.2-upgrade.md)「未覆盖项与边界」）；因此本批**以锁定发布包的 `exports` / `types` 实测决定可用接口**，镜像仅作交叉核对，不据镜像推断接口。

**锁定发布包公开入口**（全部取自已安装的 `0.2.1-alpha.2` 树，非推测）：

| 官方能力 | 锁定入口 | 本批用法 |
| --- | --- | --- |
| Cordis 插件基类 | `@deepseek-ai/cordis`：`Service`、`static inject`、`static Config`、`[Service.init]()`、`ctx.effect(fn, name)`、`ctx.on(event, handler)`、`ctx.provide(name, value)`（打桩） | 三个服务均为 `extends Service`；`inject` 声明依赖；`[Service.init]()` 注册路由/定时器；**每个独立注册（路由、定时器、事件监听）都由 `ctx.effect()` 承载并可完整撤销** |
| 官方 Web 服务器 | `@deepseek-ai/dsh-host-webserver@0.2.1-alpha.2`：`ctx.webServer.register({ kind: 'exact', path, handler }) => () => void` | `grant-admin` / `grant-baseline` 两条面板路由；返回的 disposer 交给 `ctx.effect` |
| 官方领域存储（只读） | `@deepseek-ai/dsh-storage-domain@0.2.1-alpha.2`：`ctx.storageDomain.get('workdsh_access')?.table('grants')` | 基线工具**只 `get` 不 `open`**（同名重复 open 会抛 already-open），避免与 access 模块抢所有权 |
| 官方配置模式 | `@deepseek-ai/schemastery`：`Schema.object({ ... }).default(...)` | 三个服务的 `static Config`；devDep 钉 `3.18.4`（根 overrides 解析为 `3.18.5-alpha.1`），peer 走根锁定 |
| 官方 bundle 补丁层 | `dsh.bundle` / `dsh.bundle.patch` → `cordis.patch.yml` 的 `insert` | 取代 `apply-c4.sh` 现场生成 loader 块：6 条 `insert` 由模块制品自带 |

**已有探针**：`packages/plugins/access/tests/`（进程内用例，`new Context()` + `ctx.provide(...)` + `await ctx.plugin(...)` + `ctx.fiber.dispose()`）。其中三条语义直接由线上探针/脚本等价迁移：`access-enforce.test.mjs` ← `deploy/tools/workdsh-access-lab/verify-enforce.mjs`；`grant-baseline.test.mjs` ← `deploy/tools/workdsh-grant-baseline/tests/baseline-verify.mjs`；`access-decision.test.mjs` ← `deploy/tools/workdsh-access-probe/dist/index.js`。

**WorkDSH 需补的业务差异**（官方不拥有、必须自实现的部分）：门户身份 HMAC 签名协议与头名、岗位角色门槛（`management` / `operations`）、基线 grant 的签发/回收与幂等收敛策略、破坏性方法的运行时包装判定点、专家与 Office 文档资源的「站点所有者」归属判定。官方侧只需要扩展点（Slot / service / storage / webserver / bundle patch），不需要新底座。

**验收与缺口**：

- 已验收：`typecheck` 退出码 0；`build` 退出码 0；`test` 21/21 通过（签名两端同值 4 + 判定点语义 5 + 迁移工具 dry-run 与幂等 5 + 面板后端 6 + 授权决策链 1）；`node scripts/check-plan.mjs` PASS。
- 缺口 ①：三个新服务**未在真实 Loader / Profile 下加载验证**，路由可达性只到进程内级别。
- 缺口 ②：`domain/changed` 事件在仓库内**当前无发出方**，基线迁移的「变更去抖触发」在仓库侧不会自然触发（线上由 `deploy/tools` 侧写入方产生）；迁入后需在部署侧确认写入方归属。
- 缺口 ③：`ctx.logger` 的 `%s` / `%d` 占位符调用签名通过了 `typecheck`，**运行时输出格式未观测**。
- 缺口 ④：**未部署**；`deploy/tools/` 四件尚未删除（删除前置＝线上引用已切换）。

## 8. 批 2 官方能力复用记录（2026-10-15）

按 [PLUGIN-DELIVERY](../PLUGIN-DELIVERY.md) 模板登记。6 字段：任务 ID / 官方文档路径 / 锁定发布包公开入口 / 已有探针 / WorkDSH 需补的业务差异 / 验收与缺口。

**任务 ID**：P1-15（专项 D19，批 2 —— identity 域收敛，输入 2 件 → `packages/plugins/identity`，含门户签名去重）。

**官方文档路径**：`docs/dsh-v0.1.7-rc.2/`（本地镜像）。**边界同批 1**：基线已推进到 `0.2.1-alpha.2`，`docs/dsh-v0.2.0-rc.2/` 镜像尚未落盘，故本批**以锁定发布包的 `exports` / `types` 实测决定可用接口**（尤其 `dsh-storage-domain` 与 `dsh-client-connection` 的类型签名），镜像只作交叉核对。

**锁定发布包公开入口**（全部取自已安装的 `0.2.1-alpha.2` 树，非推测）：

| 官方能力 | 锁定入口 | 本批用法 |
| --- | --- | --- |
| Cordis 插件基类 | `@deepseek-ai/cordis`：`Service`、`static inject`、`static Config`、`[Service.init]()`、`ctx.effect(fn, name)`、`ctx.waterfall(name, ...args, next)` | `PortalIdentityService extends Service`，`inject: ['storageDomain', 'webServer']`；每项独立注册（诊断路由、请求桥）都由 `ctx.effect()` 承载并可完整撤销 |
| 官方请求瀑布 | `@deepseek-ai/dsh-client-connection@0.2.1-alpha.2`：`connection/request` 事件，签名 `(request, response, next) => Promise<void>` | 在 `next()` 外层套 `AsyncLocalStorage.run()`，把「当前请求的已验签门户身份」暴露给同请求内后续的身份解析；不调 `next()` 即否决，本批**始终调 `next()`**（身份不可信只降级，不拦截请求） |
| 官方 Web 服务器 | `@deepseek-ai/dsh-host-webserver@0.2.1-alpha.2`：`ctx.webServer.register({ kind: 'exact', path, handler }) => () => void` | `whoami` 诊断路由；返回的 disposer 交给 `ctx.effect` |
| 官方领域存储（只读） | `@deepseek-ai/dsh-storage-domain@0.2.1-alpha.2`：`ctx.storageDomain.get('workdsh_runtime_binding')?.table('sessions')`，返回 `KvTable<string, unknown>` | 读会话归属绑定做**第一优先级**解析；**只 `get` 不 `open`**，不抢 access 模块的所有权（同名重复 open 会抛 already-open） |
| 官方配置模式 | `@deepseek-ai/schemastery`：`Schema.object({ ... })` | 15 字段 `static Config`；devDep 钉 `3.18.4`（根 overrides 解析为 `3.18.5-alpha.1`） |
| 官方 bundle 补丁层 | `dsh.bundle.patch` → `cordis.patch.yml` 的 `insert` | 取代部署侧手工铺放 `.mjs`：1 条 `insert` 由模块制品自带 |

**已有探针**：`packages/plugins/identity/tests/`（进程内用例，`new Context()` + `ctx.provide(...)` + `await ctx.plugin(Service, config)` + `ctx.fiber.dispose()`）。`identity-resolution.test.mjs` 等价迁移自线上 `deploy/tools/workdsh-identity-portal` 的沙箱探针；`portal-signature.test.mjs` 交叉校验 `src/host/portal-signature.ts` 内建副本与 `workdsh-contracts/portal-identity` 真源逐向量同值。告警用例用官方 `ctx.logger.exporter({ levels: { default: 3 } })` 收集（**默认阈值 1 会吞掉 WARN**，必须显式放宽）。

**WorkDSH 需补的业务差异**（官方不拥有、必须自实现的部分）：门户身份 HMAC 签名协议与头名、三种来源的解析优先级与失败降级策略、会话归属绑定的只读消费、兜底主账号、主体花名册（0600 落盘 + 跨重启保留）、诊断端点。官方侧只提供扩展点（service / waterfall / webserver / storage / bundle patch），不需要新底座。

**验收与缺口**：

- 已验收：`typecheck` 退出码 0；`build` 退出码 0；`test:identity` 12/12 通过（签名两端同值 4 + 解析与降级 8）；`packages/portal` 既有测试全绿且不回归（新增同步用例 2 条通过）；`node scripts/check-plan.mjs` PASS。
- 缺口 ①：本服务**未在真实 Loader / Profile 下加载验证**，`connection/request` 桥接只到进程内 waterfall 级别；`workdsh-grant-admin` 面板链路未在归一后的服务标识下端到端跑过。
- 缺口 ②：服务标识由线上 `workdsh-identity-portal` 归一为 `workdsh-identity`，`ActorContext.resolvedBy` 随之变化；依赖旧值的诊断断言/探针需在切流时同步（**未执行**）。
- 缺口 ③：本批**不改 `deploy/profile`**，`disabled` local + `insert` portal 的切流写法与两件的删除均未执行（删除前置＝线上引用已切换）。
- 缺口 ④：门户去重只在**测试层**验证同步与算法自洽，**未启动门户进程**验证导入路径。
