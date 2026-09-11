# 0.1.0-alpha.2

- 注册 `ctx.workdshIdentity` Cordis Host 服务，并由 `Service.init` 管理启动顺序。
- 通过官方 `ctx.storageDomain` 原子保存本地主体、个人组织和 owner 成员关系。
- 冷启动保持身份稳定；Host 配置与持久身份冲突时明确拒绝启动。

# 0.1.0-alpha.1

- 增加可信本地 Profile 身份提供方，主体和个人组织由 Host 配置固定。
- 每次解析生成新的 requestId，并只接收可选的 Host session/run 关联。
- 忽略输入对象中的伪造 principalId、organizationId、requestId 和 resolvedBy 字段。
