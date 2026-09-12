# WorkDSH Office 浏览器编辑插件

Word 文本预览版 `0.1.0-alpha.1`，按官方 Loader/Profile 安装。插件接入原生右侧文件 Tab，文件授权读取与刷新继续由 Harness 拥有；不使用服务端 Office 转换，不依赖本机 Office/LibreOffice，不向第三方上传文件。

后续交付范围已扩展为Word、PPT、Excel、PDF、画布、多维表格、HTML、Markdown八类，见[组件采用方案](../../../docs/design/office/OPEN-SOURCE-STACK.md)与[统一AI接口](../../../docs/design/office/UNIFIED-API.md)。HTML源码/实时预览、Markdown正文/源码编辑均须接入同一内容服务。当前原生 document 新建/编辑/修订同步已打通；以下文件表格是原有适配器范围，完整八类统一接口尚未完成。

插件复审后的实施边界见[PLUGIN-ARCHITECTURE](../../../docs/design/office/PLUGIN-ARCHITECTURE.md)：本包独立分发；Host根通过官方ctx.plugin组合内容服务、工具和Connection，Client进入官方模块图，默认WorkDSH组合仅装配本包。Host 内容服务、六个原生工具和原生 Tiptap 页现已实现；package的private标记不等于已发布npm。新增能力必须通过OP-T01—07的干净安装、生命周期、恢复和资源制品验收。

新原生文档：AI 调用 `content_open` 新建即自动打开当前会话右侧、`content_edit` 分批提交后页面自动更新；`content_present` 仅用于再次展示；用户点击“编辑”后直接在正文修改，完成编辑后 AI 用 `content_read` 获取最新内容。`content_capabilities` 列出已实现操作。Host/页面共享有修订和幂等收据的工作副本，不需要子智能体或外部 MCP。只接受可信 Session 绑定及同工作区授权。

普通文档写作由本插件通过 Harness `systemPrompt.section` 提供默认实时写作引导：先打开文档再分批写入，已有编辑器提供默认字体/层级样式；不替换专家 persona 或修改用户 Skill。短报告真实模型验证及范围见[U2证据](../../../docs/evidence/office-natural-writing-u2.md)。

该链路暂不导入 DOCX，也未提供 `content_export`；不是文件保真编辑已完成。验证、运行方式和剩余门槛见[证据](../../../docs/evidence/office-live-u1.md)。

| 格式 | 当前能力 | 当前限制 |
| --- | --- | --- |
| `.xlsx` | Univer 表格编辑、单元格值/普通公式导出副本 | 原生图表不显示，含已检测高级对象禁止导出；不支持结构/格式修改导出 |
| `.docx` | 浏览器排版预览、正文文字片段修改、更新预览、导出副本 | 不是完整排版编辑器，不能编辑页眉页脚等未列出的内容 |
| `.pptx` | 浏览器幻灯片预览、文字片段修改、更新预览、导出副本 | 不是完整幻灯片设计器，不能调整图形/布局 |

Word/PPT 修改基于原始 ZIP 包，未修改条目保留；多文字 run 保持原有格式边界，编辑面板显示文字片段，不把它们混成整段而丢失格式。复杂对象与高级 Office 保真仍未签收。暂不支持旧 `.doc/.ppt/.xls`、密码文档，当前文件上限10MB；压缩展开限制等生产保护仍待完善。

```sh
corepack pnpm --filter workdsh-plugin-office build
corepack pnpm --filter workdsh-plugin-office typecheck
corepack pnpm probe:office
corepack pnpm probe:office:native
corepack pnpm probe:office:live
corepack pnpm test:office:content
corepack pnpm preview:install
```

`probe:office:native` 依赖前一个探针产生的测试文件，在隔离 Home 使用真实七包 Profile＋仅测试的诊断插件验证；不发送模型请求。图形预览不会由构建/测试自动打开。

依赖：Univer 0.25.1、ExcelJS 4.4.0、docx-preview 0.4.0、pptx-preview 1.0.7。PPT 预览库是原样 npm 依赖，作者明确 npm 包可免费使用，但其源码不是完整开放许可；不可宣称所有依赖都是完全开源。没有修改或复制该库私有实现。

导出目前是浏览器下载副本，未实现覆盖 Host 原件及冲突检测。切换文件、刷新或关闭 Tab 可能丢弃未导出内容，请先导出副本。不要用此开发版本覆盖重要原件。

`node scripts/probe-office-live.mjs --real-model` 显式使用已配置 preview 模型进行隔离真实验收；临时凭据结束清理，不写入制品。默认探针仍不调用模型。

`probe:office:live` 单独安装 Office 与显式治理依赖，通过官方 Tools 和浏览器验证三批提交、人工编辑及重载；不发真实模型请求。构建生成 `dist/THIRD-PARTY-LICENSES.txt`、`dist/bundled-dependencies.json` 和 `dist/license-review.json`。新增 Tiptap 为 MIT；旧依赖仍有许可文本缺口，未完成最终商业分发签收。


### U2/U3 原生文件交付与下载

完成文档后 AI 调用 content_export，将当前保存修订生成真实 DOCX，再通过官方 present 显示 Harness 文件交付卡，不使用自绘成果卡。卡片打开实际文件；右侧实时工作副本继续保留，可以编辑、跟随阅读和下载最新修订。导出文件是当时的修订，后续工作副本修改不会静默改写它。导出输出到当前 Session 的 output 目录，清理标题加 UUID 命名，独占创建，不覆盖原件。

导出工具复用官方 bash/present 的作用域、沙箱/审批和取消信号，不使用本地 Office/服务器转换。当前需要执行世界提供 Node/bash/present，最大 DOCX 1 MiB；拒绝/失败不声明成功文件，仍可右侧浏览器下载。文件写入成功但 present 失败时对已有路径重试 present；不要重新导出造成重复文件。未知写入结果、幂等导出收据和跨类型导出仍是后续 U3 门槛。旧工作副本不会自动生成历史交付声明，可请求 AI 导出已有文档，内容数据保留。DOCX 保真导入和表格仍未实现。

### 原生文档常用排版

支持字体/字号、颜色/高亮、标题1—6、对齐、行距/缩进、项目符号与编号列表（最多六级）、撤销重做、全选/清除格式、段内文字查找替换、缩放。人工和 AI 使用同一套语义样式，保存重开与浏览器 DOCX 下载保留上述格式。按钮分组换行；不等同于 Word 完整功能，表格、图片、页眉页脚、分页和旧 DOCX 保真迁移尚待后续。见[工具栏证据](../../../docs/evidence/office-document-toolbar-u2.md)。

工具栏现已复用 Tiptap 官方 MIT UI Components 的 Toolbar/ToolbarGroup、Button 和 SVG（锁定来源及适配差异见 src/live/tiptap-ui/SOURCE.md），44px 单行，窄栏横向滚动。未引入收费 DOCX 模板；文档格式操作继续使用同一实时保存服务。

## `/office` 输出选择与 `@` 文档引用

在已有原生任务输入框输入 `/office`，选择 Word、PPT、Excel、PDF、画布、多维表格、HTML 或 Markdown；原生输入框插入可删除的输出标签，例如「Word · 新建」。直接继续输入需求并发送，新建无需 `@`。标签由官方 reference chip 拥有删除、撤销和提交序列化，不替换附件、模型、权限、队列与发送器。

输入 `@` 时，Office 分组列出当前任务授权可访问的工作副本，每份提供「参考资料」与「修改此文档」两项。参考资料保留原件、生成新文档；修改对象序列化为明确 target，读取最新修订后修改。类型和引用用途直接展示在原生输入标签内，不额外占用一行说明。未选择类型时仍可使用自然语言。原生 `@` 文件和任务引用入口保留；本增量的显式 reference/target 标签针对 Office 工作副本，不宣称已支持任意文件保真导入。

八类输出选择均可用，但当前统一内容工具的实时适配仅 Word 文本工作副本就绪；其余菜单明确显示「实时编辑待接入」，输出意图告知 AI 不得误建为 Word 或假称完成实时编辑。类型和角色经原生 codec 在提交时序列化为模型可见 JSON；这是输入意图，不替代 Host 授权和严格操作校验。文档序列化重新检查访问，切换任务后的旧引用拒绝发送并要求重新选择。多个输出或 target 要求 AI 澄清。


## 安装、卸载与内容保留

发布物是独立 `.tgz`：Host入口、Client模块、`cordis.patch.yml`、编辑器资源、版本说明和许可说明都随包交付。安装使用官方 `dsh plugin --profile <名称> add <Office.tgz>`，并显式提供本地身份、授权、审计基础插件及匹配 Harness `0.1.5-rc.1` Web Profile。已有 WorkDSH Profile 可复用这些治理依赖，不需要装专家、技能管理或工作台插件。Word-only 预览制品见 [GitHub prerelease](https://github.com/techflag/workdsh/releases/tag/office-v0.1.0-alpha.1)；不将其宣称为完整 Office 正式版。

通过官方 `dsh plugin --profile <名称> remove workdsh-plugin-office` 移除安装，按官方Profile流程重新启动/加载配置。Office菜单、文档引用来源、六个工具、写作guide、预览与实时页注册一起撤销；保留用户已保存内容和原文件。已存在输入标签属于草稿，不能替用户删除，插件缺失时引用无法解析、发送失败；删除标签后可正常输入。重装对应制品后入口恢复，同一Profile中已保存记录和修订保留；未承诺自动恢复卸载时未保存的浏览器缓冲。

### 安装与卸载 Office 候选包

以下命令用于本仓库已配置的 `preview` Profile，要求完成开发环境准备且本地候选 `.tgz` 已存在；这是[开发预览版本](https://github.com/techflag/workdsh/releases/tag/office-v0.1.0-alpha.1)，可下载附件 `.tgz` 或在本仓库生成候选包。使用 Node.js 22.23.2。先在运行预览的终端按 `Ctrl+C` 停止应用，再执行安装和启动：

```bash
cd /Users/techflag/project/workdsh

# 安装本地候选包 / Install the local candidate
DSH_HOME="$PWD/.test-runtime/preview" \
  corepack pnpm exec dsh plugin --profile preview add \
  "$PWD/.artifacts/office-release/workdsh-plugin-office-0.1.0-alpha.1.tgz"

# 启动 / Start
corepack pnpm preview
```
卸载也先停止应用，再执行以下命令，随后运行 `corepack pnpm preview` 并刷新页面：

```bash
DSH_HOME="$PWD/.test-runtime/preview" \
  corepack pnpm exec dsh plugin --profile preview remove workdsh-plugin-office
```
请保持安装、卸载和启动使用同一 `DSH_HOME` 与 Profile。卸载撤销 Office 入口及工具，保留已保存文档和原文件；重新安装恢复入口。新建 Word 无需 `@` 引用，在任务输入框选择 `/office` → Word 即可。

生命周期与真实tgz冷启动重装证据见 `docs/evidence/office-word-release-u3.md`；当前Word文本范围见 CHANGELOG.md。完整表格、图片和页面排版仍是后续功能。

## Word alpha.1 分发范围与导出重试

运行 `corepack pnpm release:office:pack` 生成 Word-only tgz，许可缺失或未知依赖时打包失败。该制品仅注册 DOCX 文件预览，剔除旧 Univer/Excel/PPT 代码及运行依赖；上面的多格式适配表描述源码中的实验开发形态，不属于本版分发范围。八类输出菜单保留后续路线，其他七类实时适配仍待开发。

同一文档修订与内容产生稳定 DOCX 字节和路径。`content_export` 可传 `baseRevision`（来自 content_read）；文档已更新时拒绝旧修订导出。官方 bash 将完整临时文件独占链接到目标，已存在时核对摘要，不覆盖修改后的文件。写入回执丢失时同一修订重试可复用文件；交付失败/结果未知返回现有路径，先核对原生卡片再重试 present。取消后不继续交付。幂等文件不表示 present 卡片具备跨进程去重，跨 Host/执行世界迁移及掉电恢复尚未验收。
