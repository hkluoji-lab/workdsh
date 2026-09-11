# D01 / P0-04 治理契约证据

日期：2026-09-11。状态：实施中。

## 官方复用与自有差异

Harness 的 User、Permission Preset、Approval、Sandbox、Credentials、Session 和 scope 继续拥有各自运行职责。WorkDSH 不复制这些实现。官方能力没有 Organization、Membership、业务 ResourceOwner、AccessGrant 和企业 AuditEvent 的统一契约，因此建立纯 TypeScript `workdsh-contracts` 包承载业务差异，决策见 [ADR-0016](../adr/0016-governance-contracts-first.md)。

首版无 Cordis 插件入口、数据库、Remote、页面和认证实现。IdentityProvider 只能在 Host 受信边界从提供方证据解析 ActorContext；浏览器、模型或 Agent 工具提交的 principalId/organizationId 不能直接成为可信上下文。AccessService 和 AuditService 接收同一上下文，后续本地与企业 provider 不改变消费方契约。

## 当前验证

- TypeScript 严格构建与无输出类型检查。
- 运行时校验接受完整 Host-resolved ActorContext。
- 拒绝空 provider、空组织、空 requestId 和控制字符主体。
- ResourceOwner 强制 project scope 与 projectId 一致。
- sameOrganization 只做显式边界比较，不隐式授予权限。
- `workdsh-provider-identity-local` 从 Host 固定配置解析唯一主体和个人组织；输入对象夹带的身份字段不会覆盖配置。
- 每次解析生成独立 requestId，返回只读 ActorContext，并在已取消信号下拒绝解析。
- Cordis class plugin 注入官方 `storageDomain`，在 `Service.init` 打开自有领域，并由 effect 关闭句柄。
- 主体、个人组织和 owner 成员关系作为同一 global 记录原子提交；真实 JSON provider 冷重启后快照和 revision 保持一致。
- 同一介质使用冲突的 Host 主体配置会以 `identity-local/config-conflict` 拒绝启动，不会静默换人。
- 未使用 Harness 匿名安装 ID 充当用户；官方包说明该 ID 只用于安装范围遥测/反馈/请求关联，不能识别用户。

## 尚未验证

授权决策、审计追加、两主体/两组织负例、撤权、Session/文件/工具入口绑定及团队 runtime 失败关闭尚未实现。完成这些证据前 P0-04/P0-05 和 D01 保持进行中，团队远程入口保持关闭。
