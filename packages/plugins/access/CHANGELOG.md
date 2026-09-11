# 0.1.0-alpha.2

- 增加独立 Storage Domain 保存不可替换的 Session owner binding，冷重启后仍可解析当前 RuntimeBinding。
- 增加官方工具流水线桥接：`tools/pre-execute` 执行 Host 身份解析与授权，`tools/result` 观察最终结果，`session/flush` 排空审计。
- 个人 Profile 可在首次 Agent 工具调用时安全自动绑定；企业式组合可关闭自动绑定并要求创建入口显式登记。

# 0.1.0-alpha.1

- 增加持久化 `AccessService` Cordis Host 服务和操作级授权判定。
- 跨组织默认拒绝；资源 owner、成员资格和显式 grant 分别检查。
- 增加带预期修订的授权与撤权管理，并将判定和修改写入审计服务。
