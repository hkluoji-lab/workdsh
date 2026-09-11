# 0.1.0-alpha.1

- 增加持久化 `AuditService` Cordis Host 服务。
- 使用官方 Storage Domain 的 per-record 表保存不可变审计事件。
- 拒绝重复事件 ID、敏感引用键和超限引用值。
