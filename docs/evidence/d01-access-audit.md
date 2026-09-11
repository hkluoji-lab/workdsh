# D01 / P0-04 Access 与 Audit 验证

日期：2026-09-12。状态：Host 基础服务通过，全路径接入待完成。

## 官方复用

`workdsh-plugin-access` 与 `workdsh-plugin-audit` 均采用 Cordis class service 和生命周期注入，通过 Harness 官方 `@deepseek-ai/dsh-storage-domain` 建立各自 Domain。插件不直接选择或访问 Storage backend，不复制 Harness User、Permission Preset、Approval、Sandbox、Session 或 Credentials。Access 只调用 `IdentityService.membership()`，不会读取身份提供方内部存储。

## 当前语义

- 所有授权请求校验 Host 解析的 ActorContext、ResourceOwner 和 ResourceRef。
- 跨组织请求失败关闭；缺失或停用 membership 失败关闭。
- 资源 owner 拥有资源管理权；管理员角色本身不自动获得他人私有资源读取权。
- 其他成员必须取得同组织、同资源、同 action 的显式 AccessGrant。
- grant 新增、更新和撤销使用 expectedRevision 防止静默覆盖；撤销后下一次授权立即拒绝。
- 授权 decision 的 authorizationRevision 由成员修订与相关 grant 修订共同计算。
- allow 和 deny 均在返回前持久追加 AuditEvent；审计拒绝 secret、token、password、credential 和 prompt 等敏感引用键。
- Access 与 Audit 属于不同 Storage Domain，当前后端不提供跨 Domain 事务。grant/revoke 先记录 outcome=unknown 的操作意图，写入授权事实后再记录 succeeded，避免把部分成功伪装成原子成功。

## 验证

- 真实 Cordis Context、Storage、JSON backend、StorageDomain、IdentityService、AuditJournal 和 AccessManager 共同启动。
- 两个组织、四个主体覆盖 owner、admin、member 和另一组织 owner。
- 已验证 owner 管理允许、admin 私有读取拒绝、跨组织拒绝、显式 read grant 生效、未授予 edit 拒绝、revision 冲突、撤权后拒绝。
- 审计覆盖授权允许/拒绝、grant/revoke 意图及成功结果；重复事件 ID 和敏感引用被拒绝。
- 冷启动新 Host 后，grant 与审计均从官方 Storage Domain 恢复，成员授权结果保持一致。

## 尚未完成

该证据只覆盖 Host 服务直接调用。Session 创建与恢复、文件/资产服务、Agent 工具、Typert Remote/Connection、订阅和运行取消尚未统一绑定 guard 与 audit；企业身份、服务器端管理 Web、组织目录和审计查询 UI 属于后期范围。D01、P0-04、P0-05 与 P1-09 因此保持进行中。
