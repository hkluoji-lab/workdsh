# 0.1.0-alpha.1

- 增加可信本地 Profile 身份提供方，主体和个人组织由 Host 配置固定。
- 每次解析生成新的 requestId，并只接收可选的 Host session/run 关联。
- 忽略输入对象中的伪造 principalId、organizationId、requestId 和 resolvedBy 字段。
