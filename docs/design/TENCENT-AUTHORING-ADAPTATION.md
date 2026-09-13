# 腾讯 / WorkBuddy 内容制作方法接入 WorkDSH

2026-09-13，用户授权检查网页、PPT、Word、Excel并增强系统。参考本机 /Users/techflag/project/workbuddy 的商业产品化方法，不复制专属执行引擎、转换代码或市场包装，不将它们自动称作开源依赖。

## 官方复用记录：AUTHORING-01

使用 docs/deepseek-harness-docs/subsystems/skills.md、锁定 @deepseek-ai/dsh-skill@0.1.5-rc.1 的公开 SkillRegistration/resourceBase 与 ctx.skills.register，及已验证 systemPrompt.section 注入。沿用官方 get/render、加载优先级和可撤销注册；不增加执行器、解析器、MCP或通用流水线。已有 skill-creator-host、office-content 集成测试作为回归基础。

## 来源、价值与适配

| 类别 | 实际来源与重点阅读 | 保留的方法 | 不照搬的宿主能力 |
| --- | --- | --- | --- |
| PPT | builtin-plugins/tencent-pptx/skills/tencent-pptx：入口、story/design-principle、component-chart；素材/渲染脚本依赖检查 | 受众与目标、逐页结论、节奏、视觉系统、数据含义与可编辑图表 | slidep、.slide/JSX、强制中间文件、LibreOffice渲染、机械字数/比例配额 |
| Word | builtin-plugins/tencent-docx：入口、tdoc-orchestrator、design-token、doc-typeset/base与business-report、结构/排版review、html-to-docx入口 | 体裁、创作/美化/编辑分工、具体样式、层级与资源检查、最终制品 | HTML→DOCX专属转换器、托管Python环境、角色声明流水线、未支持页码/分页 |
| Excel | builtin-plugins/sheetagent：excel-generation/handler、schema_principle、sheet-agent-prompt入口、audit-spreadsheet、骨架脚本依赖检查 | 场景原型、来源/单位/类型、实际行号先于公式、空/零保护、跨表验证与使用体验 | sheetagent MCP、强制子代理、自动pip、把空骨架称完整结果 |
| 网页 | ardot-ui-design、design-to-code 的landing/web-app、code与style-extraction重点段落 | 内容先于视觉、目标与CTA、令牌、真实功能、参考提炼与响应式 | Ardot工具、固定画布布局、强制每次多选章节、模拟访谈当真实背书 |

阅读范围是相关入口与上述重点参考/脚本依赖，不宣称审完全部子目录、所有专家、所有脚本或许可。方法由 WorkDSH 按当前架构重新编写为八份参考，没有原样复制转换代码。

## 接入

Skills插件新增四个独立可发现的 bundled只读指南：workdsh-ppt-design、workdsh-word-design、workdsh-excel-design、workdsh-web-design。准确描述使用范围；包内 references 通过 directory resourceBase 按需读取。Office默认引导在打开Word/PPT后使用相应设计建议，普通短文不强制加载全部参考。专家可通过真实技能目录选择这些指南；它们是专业方法，不替代底层编辑/数据能力。

Word与PPT仍使用同一 content_* 权威服务和官方导出文件卡。统一 spreadsheet/html新建API未实现，指南明确不能猜分支或伪造成功；已有XLSX副本编辑、真实工程网页制作遵循当前工具。新指南不扩充编辑器格式保真或图表支持范围。不能把指南上线描述成Excel/HTML统一编辑器已完成。

## 验收范围

需验证官方get/render保留资源定位、全部引用文件存在、注册可卸载、独立包包含资源、两类Office工具链回归和preview实际目录。真实模型的四类成品、视觉效果、公式重算和最终文件仍需分别验证；静态与确定性测试不是这些专业效果的替代。

## 已执行证据

两包标准build/typecheck通过；skill-creator-host及office-content共10项、skill-plugin-lifecycle1项通过，参考路径与可撤销注册验证。preview两个候选包经官方CLI安装，Host/Client与八份参考逐字节一致；重启后已认证list HTTP200，四指南readonly。Office现有构建cwd问题已修复为脚本相对路径。不声称真实模型成品或视觉质量通过。
