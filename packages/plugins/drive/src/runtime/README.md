# runtime（预留）

按计划模块结构仿 library 声明 `src/runtime/context-injection.ts`，但本首期切片**不需要模型上下文注入**：

- 网盘的数据源来自 `AttachmentStore`（用户上传附件）与 `ctx.fs`（工具输出文件），均通过 `ctx.attachments` / `ctx.fs` 官方服务注入；
- 会话事件捕获由 `src/services/capture.ts` 注册，无模型可见输入注入需求；
- 未实现的能力不允许声明可加载 exports（AGENTS.md 规则 9），故本目录仅保留此说明，不导出运行时接口。

若后续网盘需要将文件内容注入模型上下文（例如「把网盘文档加入对话」），在此新增对应注入模块并同步登记证据。
