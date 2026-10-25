# ADR-0035：线上插件工程化归并与所有权收敛

状态：Accepted（用户 2026-10-15 裁决：线上插件「全量迁入 `packages/plugins/`」、不接受留在 `deploy/`、identity 域「portal 升为 identity 实现」、推进方式「先出 ADR+方案，再分域分批」）。日期：2026-10-15。

## 背景

2026-10-15 完成 `dsh.10ge.cn` 线上与本地的一致性审计并按用户裁决回填（见 [线上一致性审计](../evidence/online-consistency-audit-2026-10-15.md)，5 个提交已推送，HEAD `3632502b1a`）。回填后，线上独有的 10 个插件对象停在 `deploy/tools/`，形态是**手写纯 JS**（带完整中文 docblock，全目录无 `.ts`、无 `.map`、无 `tsconfig.json`、无 build 脚本）。

因此这批文件**不是编译产物，是源码**；真实缺口不是「源码丢失」，而是**工程化与所有权**：

- 未进 `docs/modules.json`，无 `moduleVersion`，无仓库内测试与 typecheck，无官方能力复用记录；
- 同一个业务领域在仓库与线上各有一份，且形态不同：

| 领域 | 线上 | 仓库 | 关系 |
| --- | --- | --- | --- |
| access | `grant-admin`、`grant-baseline`（**两份同名重复副本**：顶层 542 行 / `access-lab` 581 行）、`access-lab/access-enforce`、`access-probe` | `packages/plugins/access`（0.1.0-alpha.5，implemented，三服务 `workdshAccess`/`workdshSessionAccess`/`workdshToolAccess`） | 职责重叠，线上 4 件散落 |
| identity | `identity-portal`（提供 `workdshIdentity`） | `packages/providers/identity-local`（0.1.0-alpha.6）；`packages/plugins/identity`（planned，空壳） | 线上 profile 明确 `disabled` local + `insert` portal，是**替换关系** |
| 自动化 | `plugin-schedule`（已部署，侧栏「定时任务」） | `packages/plugins/automations`（P2-03，in_progress，**未部署**） | 两套实现，同一业务领域 |
| 用户管理 | `plugin-users`（纯 Client，数据源门户 `/api/portal/*`） | `packages/plugins/admin`（P1-10，planned，空壳） | 概念交叠 |
| 共享签名 | `portal-auth/index.js`（**无 package.json**） | `packages/portal/src/identity-bridge.mjs` | 同一算法两份实现，须同步 |

用户已明确要求把这批插件**全量迁入 `packages/plugins/`**（不再是「只回填到 `deploy/`」）；identity 域按**门户身份桥顶替仓库 `identity-local`** 收敛。硬约束来自 [AGENTS.md](../../AGENTS.md)：插件位于 `packages/plugins/<domain>`、父目录仅分类不建统一 npm 包、每个子插件独立版本化并同步登记 `docs/modules.json`、不得以 UI 不同或赶进度另造同类底座。

## 决策

1. **归属按业务所有权判定，不按线上文件名。** 线上对象一旦被判定为某个既有或规划模块的实现，就并入该模块目录，不再保留独立 npm 包；只有官方与仓库都不拥有、且确实是独立能力领域的，才建立新模块。按此判定：**10 个对象并入 4 个既有模块**（access / identity / automations / admin），**1 个能力域建立新模块** `packages/plugins/web-runtime`（见第 9 条）。`deploy/tools/` 不再保留任何插件源码真源；剩余的运维 `.sh`/`.mjs` 帮手仍归部署面。

2. **access 域四件收敛进 `packages/plugins/access`。**
   - `workdsh-grant-admin`（面板「资源授权」后端，验签门户身份后按调用者身份授予/撤销 grant）→ 该模块的 Host 路由 + Client 页面；
   - `workdsh-grant-baseline`（为活跃账号签发 read/use 基线 grant 的一次性迁移工具）→ 该模块的**迁移工具子入口**；两份同名副本只保留一份，删除 `workdsh-access-lab/grant-baseline` 重复件；
   - `workdsh-access-lab/access-enforce`（包装 `workdshSkills`/`workdshConnectors`/`workdshAccess` 破坏性方法的授权判定点，C4/P2）→ 该模块的判定点实现；
   - `workdsh-access-probe`（沙箱授权决策探针）→ 该模块的**测试探针**（`tests/`），不是产品插件。

3. **identity 域：`workdsh-identity-portal` 升为 `packages/plugins/identity` 的 0.1 实现。** 该模块此前只有空壳（planned），现以身份桥为首个实现，继续以 `workdshIdentity` 服务名注册，解析顺序保持「**会话绑定优先 → 请求作用域门户身份 → 兜底主账号**」。`packages/providers/identity-local` **降级保留为提供方**（本地单用户模式的一种实现），不再作为唯一真源。线上 profile 用 `disabled` local + `insert` portal 的补丁写法，在身份模块可用后改为**模块内的提供方选择**，不再由补丁层替换。

4. **身份签名实现唯一化。** `workdsh-portal-auth` 与 `packages/portal/src/identity-bridge.mjs` 是同一算法的两份实现（载荷为字段数组 JSON，防换行拼接歧义；`timingSafeEqual` 常量时间比对），任何一处写法不同都会让验签**静默恒失败**。收敛为**单份实现**，落 `packages/contracts` 子路径——它是边缘与插件之间的**线上协议**，不是业务实现；门户与身份模块各自引用，不再各写一份。

5. **自动化域：`workdsh-plugin-schedule` 并入 `packages/plugins/automations`，不保留两个模块。** `automations`（P2-03）是仓库既有所有权；schedule 的侧栏「定时任务」入口与官方 `@deepseek-ai/dsh-schedule` 面板复用能力并入其中。`workdsh-bundle` 中的 `workdsh-automation` 占位导航行与 schedule 侧的 `priority -10` 遮蔽 hack 一并删除，导航行由 `automations` 模块自持。

6. **用户管理归 `packages/plugins/admin`（P1-10）的首个切片。** `workdsh-plugin-users` 是纯客户端呈现层（Host 半边有意为空），数据源是同源门户 `/api/portal/*`；迁入后仍**不复制账号真源**，`admin` 模块只做呈现与操作入口。其 `package.json` description（「左侧导航左下角」）与客户端 docblock（「设置 → 用户与权限一节，不做左侧导航行」）自相矛盾，迁移时**以已上线行为为准并修正描述**。

7. **迁入的插件不新建 npm 发布包。** 它们共用所属模块的版本线（`docs/MODULE-VERSIONS.md`），随模块登记与版本推进，不单独发 alpha。

8. **工程化门槛（不满足不算迁入完成）：** TypeScript 源码 + `tsconfig.json` + `build`/`typecheck` 脚本；`workdsh-contracts` 契约；仓库内测试；`docs/modules.json` 的 `moduleVersion`/`status`/`acceptanceNote` 同步；官方能力复用记录（按 [PLUGIN-DELIVERY](../PLUGIN-DELIVERY.md) 模板，写明任务 ID、官方文档路径、锁定发布包公开入口、WorkDSH 需补的业务差异、验收与缺口）。**禁止直接把 `dist/*.js` 复制进 `packages/plugins/`**——那会造出 JS/TS 双形态与第二套构建。

9. **`workdsh-remote-shell` 与 `workdsh-webruntime-patches` 迁入新建模块 `packages/plugins/web-runtime`（0.1）。** 二者共同构成一个能力域：**官方 Web 运行时在反向代理部署下的兼容适配**——`remote-shell` 经官方 `webserver/index-inject` 扩展点向 boot HTML 注入 `__DSH_TRANSPORT__.ownsHost`（使「设置 → 模型」在反代下可用），两个 `.patch` 是同一能力的制品形态。仓库既有模块无一拥有该能力，故独立成模块（用户 2026-10-15 裁决：不接受留在 `deploy/`，全部迁入 `packages/`）。迁入时同时修正 `remote-shell` 的浮动 peerDep `@deepseek-ai/cordis: "*"`（违反锁定规则）并补 `dsh.bundle.patch` 声明与官方能力复用记录。

10. **迁移期间线上继续使用 `deploy/tools/` 现件，仓库真源切换到新模块属部署动作，必须单独授权、单独留证。** 本次迁移**不改线上任何东西**；`deploy/profile/package.json` 的 13 条 `file:` 依赖（指向容器内 `/workspace/wd-upload-*` 的 tgz）需重新打包并更新，属另一次部署。

## 权衡与失败边界

- **线上不会自动切换。** 迁移完成后 `deploy/tools/` 与 `packages/plugins/` 会短暂并存。并存期间**禁止双写**：谁改哪一侧必须登记，直到线上引用切到新模块制品后再删除 `deploy/tools/` 一侧。删除前必须先确认 profile 引用已生效，否则线上加载失败。
- **`access-enforce` 目前没有 `dsh` 字段**，其 loader 块由 `apply-c4.sh` 现场生成。迁入后改由模块 `dsh.bundle.patch` 声明，必须回归验证强制点仍在原位（包装未失效、默认 dry-run 语义保留）。
- **`plugin-schedule` 的 `dsh.bundle.patch: ./cordis.patch.yml` 指向一个不存在的文件**（`files` 也声明了它）。并入 `automations` 后该缺陷自然消失，但必须确认没有其他入口依赖它。
- **`workdsh-automation` 导航行 id 靠 priority 遮蔽去重**：优先级 `-10` 排在 `workdsh-bundle` 占位行（`0`）之前赢得去重。合并后**必须删占位行**，否则会出现重复导航行。
- **identity 切换会改变主体解析结果**（从 `local-user` 单一主体变为按账号主体）。既有资源需先跑 grant 基线（批 1 的迁移工具）才能继续可用；未跑基线前不得切主体。
- **依赖版本以仓库锁为准。** 线上件带 `cordis ^4.0.4`、`dsh-storage-domain ^0.2.0-rc.2` 等旧口径，迁入时统一重钉到基线 `0.2.1-alpha.2`（含 `zod 4.4.3`），不以线上浮动版本为依据。
- **未验证边界：** 本 ADR 只定归属与门槛。迁移后的实际加载、类型通过、测试通过、以及线上切流后的回归，都必须单独执行并按证据登记，不得由本 ADR 的实施推断。

## 被否决的替代

1. **把 `dist/*.js` 直接复制进 `packages/plugins/`。** 会造成同一模块同时存在 JS 现件与 TS 源码两套形态、两套构建，且绕过类型与契约门槛。
2. **继续在 `deploy/tools/` 维护，只补 `modules.json` 登记。** 仍是第二真源：`deploy/` 是部署资产面，不承担模块版本线、测试与 typecheck；登记一个不在 `packages/` 下的模块也违反模块路径规则。
3. **为每个线上插件新建独立 npm 包（`workdsh-plugin-schedule`、`workdsh-plugin-users` …）。** 违反「父目录仅分类、每个子插件独立版本化」与本 ADR 第 1 条的按所有权归并原则，并把「同领域两套实现」固化成产品结构。
4. **让 `packages/plugins/automations` 与 `workdsh-plugin-schedule` 长期并存。** 同一业务领域两套实现、两个导航行 id、两处存储与调度假象，属于典型的第二套状态真源。
5. **把 `workdsh-remote-shell` 与 `webruntime-patches` 长期留在 `deploy/tools/` 作为源码真源。** `deploy/` 是部署资产面，不承担模块版本线、契约、测试与 typecheck；而 `remote-shell` 本身就是经官方 `webserver/index-inject` 扩展点生效的 Cordis 插件，留在部署面会让它永远无法被仓库验证。用户 2026-10-15 已裁决不接受该方案。
6. **由 `identity` 插件反向引用 `packages/portal`。** 跨层反向依赖（插件依赖边缘模块），且签名属两方协议而非门户私有实现；应落在共享契约而不是任一方的内部路径。
7. **按线上文件名逐个建模块（`packages/plugins/grant-admin`、`grant-baseline` …）。** 会把同一 `workdshAccess` 授权域切成多个模块，割裂授权真源。

## 范围

- 不改上游 dsh、不改任何官方发布包、不改官方 Web 客户端。
- **不改线上部署**：迁移只在仓库内进行；profile / 容器 / Caddy / 隧道的任何变更单独授权、单独留证。
- 新建 **1 个**模块（`packages/plugins/web-runtime`，第 9 条），不新增 npm 发布包；四条既有登记（access / identity / automations / admin）随各批更新。
- 不改 `packages/portal` 的门禁语义、路由分流与 Cookie 契约（除第 4 条的签名实现唯一化）。
- 企业 SSO（`identity-oidc`，B5）、多组织、多租户、组织目录与登录审计**不在本轮**。
- 本 ADR 不签收任何批次；每批的完成状态以各自的证据文档与 `docs/modules.json` 登记为准。
