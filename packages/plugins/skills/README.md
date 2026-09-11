# 技能管理

状态：**0.1 默认/本地技能管理闭环完成**。0.1.0-alpha.22 已将创建技能纳入 Host 管理闭环：`skill-creator` 通过 Harness 官方 `defineTool` 使用私有草稿、结构校验、精确 revision 和显式确认发布，不能再用通用文件工具绕过全局查重与原子写入。无效本地技能会出现在列表中并显示可修复诊断。

模块版本线：**0.1**。Host、Client、Remote、内置 `skill-creator` 与资源统一计入技能模块版本；当前开发制品为 `0.1.0-alpha.22`。默认组合包的版本不代替技能模块版本。

- 实现阶段：P1
- 主任务：P1-03，详见 [开发计划](../../../docs/PLAN.md)
- 职责：多技能管理、skill-creator、原生技能提供方适配。
- 边界：不重造技能执行器，导入不运行脚本。

## 开发前阅读

[规则](../../../AGENTS.md)、[状态](../../../docs/STATUS.md)、[契约](../../../docs/CONTRACTS.md)、[团队设计](../../../docs/TEAM-DESIGN.md)。

所有业务操作遵守服务端主体和组织上下文；页面与 Agent 工具调用相同领域服务。可选功能接入通过公开契约与生命周期注入。

执行目录复用官方 `ctx.skills`、Skill provider、`dsh-tool-skill` 与 Session Skill Catalog。已发布 SkillRevision 必须定位不可变正文；不能让历史 Session 通过同名目录读取后来改写的内容。`modelInvocable` 与 `userInvocable` 只控制调用面，不能替代组织、项目和对象授权。provider 目录观测不完整时保留 last-good 并重试，不把临时缺项解释成业务归档。

## 验收与下一步

完成对应 PLAN 任务及 [验收矩阵](../../../docs/ACCEPTANCE.md) 场景，记录真实测试证据后才更新状态。当前入口 `./client` 导出组合函数，由 bundle 编译并挂载；全局页面直接调用 Host `SkillManager`。rc.1/rc.2 的外部 workspace Typert 生成仍失败，因此 JSON 管理操作和流式上传使用官方 `dsh-client-connection` 的认证 exact Fetch route；生成器支持外部包后迁移管理调用，文件上传仍保留在官方的流式 Fetch 扩展面。默认/本地技能的功能闭环和浏览器验收已实现。当前不开发公共市场；企业服务端与管理 Web 按 [ADR 0015](../../../docs/adr/0015-skill-control-plane-and-runtime-projection.md) 列入后期 ToDo，不阻塞当前 Skill 0.1。

## 修订 6 的必做补充

详见 [项目设计](../../../docs/PROJECT-DESIGN.md) 和 [官方依据](../../../docs/research/workbuddy-core-domains.md)。新增目录仍为规划占位；各自实现 PLAN 的 P1 补充项并验证 J01—J10 适用项。

## 项目界面联动

按 [项目设计第 7 节](../../../docs/PROJECT-DESIGN.md) 实现本领域相关交互，验收 UI01—UI08 适用项。领域对象与项目关联分离，取消不提交选择，个人连接按当前主体解析。新增目录仍为 planned。

## 当前可用范围

全局技能库、搜索、完整详情、直接编辑、资源编辑、打开文件夹、启停、可恢复卸载、批量管理以及新增技能入口。卸载前由 Host 汇总已注册领域的依赖影响，并在执行时用影响 revision 重新确认。添加菜单提供查找、上传和创建：查找聚焦已安装目录，上传打开专用导入弹框并通过认证流式路由交给 Host，创建进入原生 Conversation 并预填 `/skill-creator`。导入支持 `.zip`、单个 `.md` 和文件夹；预检与安装分离，浏览器拿不到 Host 暂存路径，脚本不执行。页面不把技能归属于任务；命令发送与模型调用仍由原生 Conversation 执行。当前产品没有 SkillHub 和套件，因此不显示对应标签；分类在设计上保留；当前默认/本地技能没有真实 taxonomy，因此不提供可点击假筛选。

`skill-creator` 的 Host 注册由本包根入口拥有，默认把“所有 WorkDSH 任务可用”的技能写入官方共享 Agents root（`$DSH_AGENTS_HOME/skills`，未配置时为 `~/.agents/skills`）；只有用户明确选择当前 Harness Profile 时才使用 `$DSH_HOME/skills`。已有目标必须读取并再次确认，不能覆盖无关技能。
