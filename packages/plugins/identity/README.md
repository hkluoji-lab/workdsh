# 身份和组织

状态：**0.1 实现中**。`0.1.0-alpha.1` 把线上 `deploy/tools/workdsh-identity-portal` 按业务所有权并入本模块（P1-15 批 2，见 [归并方案](../../../docs/design/ONLINE-PLUGIN-CONSOLIDATION.md) 第 2、7 节）；仍是规划中的企业 SSO / 多组织能力之前的单组织实现，并非完整身份平台。

- 实现阶段：P0/P1
- 主任务：P1-09；专项 P1-15（批 2），详见 [开发计划](../../../docs/PLAN.md)
- 职责：主体、组织、成员关系、身份提供方契约。
- 边界：身份由服务端建立，不信任模型或客户端自报身份。

## P1-15 批 2：线上门户身份并入（2026-10-15）

线上 `deploy/tools/workdsh-identity-portal` 与 `workdsh-portal-auth` 两件按业务所有权并入本模块（不新建 npm 包），由模块 `cordis.patch.yml` 的 `dsh.bundle.patch` 声明 `insert`，取代部署侧手工铺放 `.mjs`：

- 以 `workdshIdentity` 服务提供方运行，替代仓库既有 `workdsh-provider-identity-local`；二者同名互斥，线上切换写法是 `disabled: true` + `insert` 本模块。
- **解析顺序（保守优先，保证上线不打断既有会话）**：① 会话已有归属绑定（`workdsh_runtime_binding`）→ 以绑定为准；② 请求作用域内有已验签的门户身份 → 用该账号；③ 都无 → 兜底主账号。
- **信任锚**：门户用共享密钥对身份做 HMAC 签名（头名与算法取 `workdsh-contracts/portal-identity`），本服务验签后才认。密钥缺失或验签失败**不抛错、不阻断请求**，只退回兜底主账号。
- `src/host/portal-signature.ts` 是签名协议的同构内建副本（[ADR-0019](../../../docs/adr/0019-installable-host-self-containment-and-governance-assembly.md) 自包含要求）；`tests/portal-signature.test.mjs` 逐向量交叉校验两端同值，守护「签名静默恒失败」风险。
- 仓库内测试 2 个文件共 12 条用例（签名 4 + 解析 8），等价迁移自线上探针。

**边界与未验证**：本批明确**不改 `deploy/profile`**，`disabled` local + `insert` portal 的补丁写法保留到切流时统一处理；`deploy/tools/` 两件尚未删除（前置＝线上引用已切换）。服务标识由线上 `workdsh-identity-portal` 归一为模块名 `workdsh-identity`，`ActorContext.resolvedBy` 随之变化，依赖旧值的诊断断言与探针需在切流时同步。未验证：真实 Loader/Profile 下的加载与路由可达性、`workdsh-grant-admin` 面板在归一后服务标识下的端到端链路、企业多组织与外部 SSO。

## 开发前阅读

[规则](../../../AGENTS.md)、[状态](../../../docs/STATUS.md)、[契约](../../../docs/CONTRACTS.md)、[团队设计](../../../docs/TEAM-DESIGN.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

## 验收与下一步

完成对应 PLAN 任务及 [验收矩阵](../../../docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。先验证公开接口，再实现；未实现部分不声明加载入口、假工具或成功响应。

下一步：把本模块的 `disabled local + insert portal` 作为一次部署动作切流，切换前先跑 P1-15 批 1 的 grant 基线（否则既有资源被拒），并同步删除 `deploy/tools/` 两件。
