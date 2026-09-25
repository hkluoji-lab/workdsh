## 0.1.0-alpha.6 — 2026-09-25

- 适配 DeepSeek Harness 0.1.7-alpha.1：Schemastery 3.18.3 给 `Schema.object` 加上 `NoInfer` 后，`: Schema<Config>` 显式注解不再接受带默认值的字段（推断出的对象类型要求 `providerId` 必填）。改为让 schema 自行推断类型，手写 `Config` 接口继续作为文档化的输入形状，与官方 0.1.7 包同款写法。
- 官方依赖精确锁定同步至 `0.1.7-alpha.1`；身份、组织与 owner 成员关系的存储语义与首次启动/后续启动一致性校验未变。
- 版本号重定：`0.1.0-alpha.5` 已作为公开发行制品发布（2026-09-15 专家发行附件），本批代码变化按本项目「撞号必须重新定版」规则递增为 `alpha.6`。
- 退出证据：全仓 `typecheck` 退出码 0；线上 `dsh.10ge.cn` 升级后本地身份插件随 Profile 正常加载。

## 0.1.0-alpha.5 — 2026-09-15

- 将本地身份存储依赖升级至 DeepSeek Harness 0.1.6-alpha.1。
- 作为本批官方 Team 专家组合的配套身份包重新发布，避免复用旧制品版本。

# 0.1.0-alpha.3

## 0.1.0-alpha.4 — 2026-09-12

- 单个专家 alpha.1 配套：独立 Host 组合、共享 Skill 修订与受控任务入口。
- Companion for Experts alpha.1: standalone Host composition, shared Skill revisions and governed task entry points.


- 实现统一 `IdentityService.membership()` 查询，供 Access 服务检查本地成员资格。

# 0.1.0-alpha.2

- 注册 `ctx.workdshIdentity` Cordis Host 服务，并由 `Service.init` 管理启动顺序。
- 通过官方 `ctx.storageDomain` 原子保存本地主体、个人组织和 owner 成员关系。
- 冷启动保持身份稳定；Host 配置与持久身份冲突时明确拒绝启动。

# 0.1.0-alpha.1

- 增加可信本地 Profile 身份提供方，主体和个人组织由 Host 配置固定。
- 每次解析生成新的 requestId，并只接收可选的 Host session/run 关联。
- 忽略输入对象中的伪造 principalId、organizationId、requestId 和 resolvedBy 字段。
