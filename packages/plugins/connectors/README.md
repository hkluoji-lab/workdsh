# 连接器管理

状态：**规划中，尚未实现**。目录已建立，不代表功能完成。

- 实现阶段：P1
- 主任务：P1-04，详见 [开发计划](../../../docs/PLAN.md)
- 职责：多服务、多账号实例、MCP、配置草稿、授权和健康。
- 边界：成员使用权限不允许读取密钥；禁止跨账号回退。

## 开发前阅读

[规则](../../../AGENTS.md)、[状态](../../../docs/STATUS.md)、[契约](../../../docs/CONTRACTS.md)、[团队设计](../../../docs/TEAM-DESIGN.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

MCP client 是一种执行适配，复用官方 stdio/Streamable HTTP 生命周期、工具发现和重连；ConnectorDefinition 与 ConnectionInstance 仍拥有安装前置、凭据引用、外部身份、目标指纹、健康和审计。工具暂时仍列出不表示 ready。stdio 仅传显式最小 env，HTTP headers 由凭据层解析；专用 API 与 Web provider 不强制转换成 MCP。

## 验收与下一步

完成对应 PLAN 任务及 [验收矩阵](../../../docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。先验证公开接口，再实现；目前仅保留骨架，不声明加载入口、假工具或成功响应。

## 项目界面联动

按 [项目设计第 7 节](../../../docs/PROJECT-DESIGN.md) 实现本领域相关交互，验收 UI01—UI08 适用项。领域对象与项目关联分离，取消不提交选择，个人连接按当前主体解析。新增目录仍为 planned。

实现前必须阅读 [ADR-0007](../../../docs/adr/0007-execution-and-transfer-boundaries.md)，完成相应 B/Q 边界用例；不可只用提示词或 UI 达成权限保障。
