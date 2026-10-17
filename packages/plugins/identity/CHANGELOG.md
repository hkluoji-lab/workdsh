## 0.1.0-alpha.1 — 2026-10-15

- P1-15 批 2（identity 域收敛，[ADR-0035](../../../docs/adr/0035-online-plugin-ownership-consolidation.md)）：把线上 `deploy/tools/workdsh-identity-portal` 与 `workdsh-portal-auth` 按业务所有权并入本模块，不新建 npm 包；模块首次从「规划中」变为 0.1 实现。
- 新增 Host 服务 `PortalIdentityService`：以 `workdshIdentity` 服务提供方运行，按「会话归属绑定优先 → 请求作用域门户身份 → 兜底主账号」解析 `ActorContext`，让门户登录账号在 DSH 内成为各自独立主体。`connection/request` 官方 waterfall 内用 `AsyncLocalStorage` 承接请求作用域身份，`registerWhoami()` 注册诊断路由。
- 解析器 fail-closed：共享密钥缺失、验签失败、绑定记录非法、激活未就绪时一律退回兜底主账号，**不抛错、不阻断请求**——宿主插件加载期抛错会让整棵插件树失败。
- 新增 `src/host/portal-signature.ts`：门户身份签名协议的同构内建副本（[ADR-0019](../../../docs/adr/0019-installable-host-self-containment-and-governance-assembly.md) 自包含要求），唯一真源为 `workdsh-contracts/portal-identity`。
- 新增仓库内测试 2 个文件共 12 条用例，等价迁移自线上探针：`portal-signature.test.mjs`（4）逐向量交叉校验内建副本与契约真源同值；`identity-resolution.test.mjs`（8）覆盖三种解析来源顺序、激活闸门 fail-closed、花名册跨重启与告警路径。
- 服务标识由线上 `workdsh-identity-portal` 归一为模块名 `workdsh-identity`（`ActorContext.resolvedBy` 随之变化）。
- 未部署；`deploy/tools/` 两件尚未删除（前置＝线上引用已切换）；`deploy/profile` 的 `disabled local + insert portal` 切换保留到切流时统一处理。未验证：真实 Loader/Profile 下的加载与路由可达性、切流后 `workdsh-grant-admin` 面板端到端链路。
