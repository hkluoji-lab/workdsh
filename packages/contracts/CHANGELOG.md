# 0.1.0-alpha.2

- 增加 `IdentityProfile` 与 `IdentityService`，让 Host 身份提供方同时暴露可信主体、组织和成员快照。

# 0.1.0-alpha.1

- 定义服务端解析的 ActorContext、组织、成员、资源归属、授权、运行绑定和审计契约。
- 提供受信边界运行时校验与稳定治理错误，不接受浏览器或模型自报身份。
- 定义 identity、access 与 audit 提供方接口，不绑定数据库、认证协议或 Harness 私有实现。
