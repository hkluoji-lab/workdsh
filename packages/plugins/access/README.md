# 资源授权

状态：**0.1 实现中**。`0.1.0-alpha.6` 在 `0.1.0-alpha.5` 的 Host 侧资源授权、持久 grant、Session owner/runtime binding、受控 Session Host 入口、预期修订更新、撤权和官方工具流水线审计之上，并入线上四件手写插件（P1-15 批 1，见下）；尚未生成企业外部 Session Remote，也未接入文件与其他 Remote 入口。

- 实现阶段：P0/P1
- 主任务：P1-09；专项 P1-15（批 1 已完成落码，见 [归并方案](../../../docs/design/ONLINE-PLUGIN-CONSOLIDATION.md) 第 2、7 节），详见 [开发计划](../../../docs/PLAN.md)
- 职责：操作级资源授权与组织/项目/个人范围。
- 边界：跨组织默认拒绝；管理员不隐式读取个人内容；所有 allow/deny 均先写入 Audit，页面过滤不构成授权。

## P1-15 批 1：线上四件并入（2026-10-15）

线上 `deploy/tools/` 的三件 Host 对象按业务所有权并入本模块（不新建 npm 包），由模块 `cordis.patch.yml` 的 `dsh.bundle.patch` 声明 `insert`，不再靠 `apply-c4.sh` 现场生成 loader 块：

- `./grant-admin`（`grant-admin.ts` → `host/grant-admin.ts`）：面板「资源授权」后端。门户 HMAC 签名鉴权（头名与算法取 `workdsh-contracts/portal-identity`）→ 岗位角色门槛（`management` / `operations`）→ 资源摘要 / 授权签发 / 撤销；写路径以调用者身份提交并带修订做乐观并发。
- `./grant-baseline`（`host/grant-baseline.ts`）：基线 grant 一次性迁移 + 持续幂等收敛。**默认 dry-run**，只有显式 `apply` 才写盘；定时循环与事件触发才显式 `apply: true`。只撤销自己签发（`baseline-` 前缀）且已不在计划内的授权。对既有 grants 表**只 `get` 不 `open`**，不抢所有权。
- `./access-enforce`（`host/access-enforce.ts`）：在技能与连接器的破坏性方法上做运行时授权判定（默认 dry-run，`enforce` 打开后才抛 `*/access-not-granted`）；判定器自身异常一律放行并记 decisions，不因判定点故障阻断业务。
- 测试：`tests/` 5 个文件 21 条用例，等价迁移自线上 `verify-enforce.mjs`、`baseline-verify.mjs` 与 `workdsh-access-probe` 探针；`portal-signature.test.mjs` 交叉校验签名内建副本与契约真源逐向量同值。

**边界**：Client「资源授权」页当前由线上 `workdsh-plugin-users` 提供（归批 4 的 admin 域），本批只交付 Host 路由与三个服务，不新建第二套 client。**未验证**：新服务未在真实 Loader/Profile 下加载与路由可达性验证；`domain/changed` 在仓库内暂无发出方，基线迁移的去抖触发路径线上仍依赖既有写入方；未部署，`deploy/tools/` 四件尚未删除。

## 开发前阅读

[规则](../../../AGENTS.md)、[状态](../../../docs/STATUS.md)、[契约](../../../docs/CONTRACTS.md)、[团队设计](../../../docs/TEAM-DESIGN.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

## 验收与下一步

`AccessManager` 注入 `storageDomain`、统一 `workdshIdentity` 和 `workdshAudit`，只从 IdentityService 查询成员资格。资源 owner 在有效成员关系下拥有操作权，其他成员必须命中同组织、同资源、同操作的显式 grant。grant 更新和撤销在插件内串行，并校验 expectedRevision；授权状态通过成员与相关 grant revision 的摘要返回。

`ToolAccessBridge` 使用官方 `tools/pre-execute` 做异步授权，并用最终 `tools/result` 形成结果审计；`session/flush` 和插件卸载会等待审计排空。个人 Profile 可在首次工具调用时绑定 Session，企业组合必须关闭该选项并在受信创建入口显式调用 `bindSession()`。

`SessionAccessBridge` 是 WorkDSH 内部 Host 入口：创建时先生成 Session id 并持久绑定 owner，再委托官方 `sessionController.create()`；显式 id 首次绑定前用官方 `inspect()` 拒绝采用已有但无 owner 的 Session。恢复时先按当前身份和 grant 授权，再委托 `resolveAgent()`。它不会修改或包装官方服务，也不会在本版本声明为生成式 Remote。企业组合后续必须只暴露 WorkDSH 受控 Remote，并撤下外部裸 Session Remote。

下一步生成受控 Session Remote，再将相同服务装配到文件、其他 Remote 与订阅入口，并验证成员撤权后的在途取消。完成对应 PLAN 任务及 [验收矩阵](../../../docs/ACCEPTANCE.md) 场景后才结束 P1-09。
