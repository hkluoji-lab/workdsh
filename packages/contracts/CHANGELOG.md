# 0.1.0-alpha.4

- 增加持久 `SessionOwnerBinding`、运行期 `RuntimeBindingRequest` 与 `RuntimeBindingService`，让 Session 恢复和工具执行使用同一 Host 授权边界。
- `AuditService.flush()` 明确持久排空契约，供 Session flush 和插件卸载等待最终审计。

# 0.1.0-alpha.3

- `IdentityService` 增加统一成员资格查询，Access 不读取具体身份 Provider 的内部存储。

# 0.1.0-alpha.2

- 增加 `IdentityProfile` 与 `IdentityService`，让 Host 身份提供方同时暴露可信主体、组织和成员快照。

# 0.1.0-alpha.1

- 定义服务端解析的 ActorContext、组织、成员、资源归属、授权、运行绑定和审计契约。
- 提供受信边界运行时校验与稳定治理错误，不接受浏览器或模型自报身份。
- 定义 identity、access 与 audit 提供方接口，不绑定数据库、认证协议或 Harness 私有实现。
