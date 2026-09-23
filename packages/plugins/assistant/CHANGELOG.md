# CHANGELOG

## 0.1.0-alpha.1（2026-09-24）

首个本机切片，模块版本线 `0.1`。依据 [ADR-0027](../../../docs/adr/0027-assistant-entry-pack-boundary.md) 与 [助理模块设计](../../../docs/design/assistant/README.md)。

- 新增 `workdsh_assistant` 存储域与 `WorkdshAssistant`（`ctx.workdshAssistant`）Host 服务：具名助理对象的创建、追加式修订、列表、详情、归档与恢复。
- 引用技能修订、专家修订与连接器实例；解析在 Host 完成，客户端只显示可用性或不可用原因。
- 新增 `/api/workdsh-assistant` Connection 端点与 `workdsh_assistant_*` Agent 工具，页面与工具共用同一服务。
- 新增自持的 `main` + `sidebar.panellist`（`workdsh-assistant`）页面与列表／详情编辑分离的 UI。
- 边界：不拥有执行、会话、凭据与数据权限；触发方式只作为修订字段记录，不注册调度器，不建立入站端点。
