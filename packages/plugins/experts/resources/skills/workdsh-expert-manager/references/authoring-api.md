# WorkDSH 接入与真实能力

专业文件内容直接采用 agent-md-spec.md、team-spec.md、plugin-json-spec.md、avatar-spec.md 的原规范。不要把完整正文缩减成四个字段。只有平台接入采用本说明。

## 制作文件包

先在工作区制作一个完整专家目录：
- .workdsh-expert/plugin.json：采用 plugin-json-spec 的身份、双语展示和角色资源声明。也接受 .codebuddy-plugin/plugin.json 输入。
- agents/<business-id>.md：采用原版 Agent frontmatter 和自由 Markdown 正文，无需四段标记。
- 团队包含 agents/<team>-team-lead.md 与各成员 MD，settings.json 的 agent 与入口一致。
- 按需包含 skills/<name>/SKILL.md、references、scripts、templates 和 bin。不要丢弃用户提供的领域材料。
- README 写用途、示例、依赖、实际完成状态和交付方法。
- 头像按原规范设计；目前 save_documents 接收文本，不能把二进制头像伪装成文本传入。

name 是稳定标识；displayName 是名称，profession 是职业。完整 Agent MD 原样保存，并以完整正文编译执行；旧四段定义只用于兼容已有专家。

## 保存、注册与发布

调用 workdsh_expert_save_documents，documents=[{path,content}] 为包内相对路径和真实文件内容。更新时先 get，传 expert_id、expected_revision。Host 校验角色文件、稳定标识、默认入口和成员关联，再保存一个整团草稿；不生成每成员独立 npm 插件。

保存返回草稿链接，validate 检查定义和可冻结的已安装技能；request_publish 引导用户在界面统一预览确认。发布固定成员和技能快照，旧任务保持原修订。注册、公开上架、运行授权不是同一件事，不能虚构成功。

get_documents 读取原包文件内容，供 write/present 实际输出；只返回内容不表示已经写入工作区。界面导出完整 .expert.zip，包含原包文本、二进制资源和校验清单；导入生成新草稿，不继承权限或执行脚本。

## 资源与完整交付

save_resources 接收 documents=[{path,content}]、resources=[{path,source_path,executable?}]、remove_paths。资源路径是包内路径，source_path 是绑定工作区的真实文件。更新带 expert_id、expected_revision，未改动资源保留；头像由真实图片字节生成预览，bin 文件可声明 executable。Host 原字节保存、固定到 preset 的 expert-package，核对字节和目录清单；包内 Skill 使用官方 customSkillDirs。安装资源不等于允许执行脚本，执行仍通过原生 bash/沙箱，不依赖本 Skill 的 Python 安装程序。

export_file(expert_id,revision_id?,file_path) 通过原生 bash 写真实完整包，读回核对并调用原生 present。已有不同字节文件拒绝覆盖；同字节可重放。仅返回 get_documents 内容不算文件交付。导入接受原始 WorkBuddy ZIP 和带校验清单的 WorkDSH ZIP，保留文本、头像、CLI 与资源，不继承权限或自动执行。

## 团队运行映射

单成员问题用 workdsh_expert_team_ask(member,instructions)，member 是包声明的业务标识。运行真实固定版本子 Session，返回完整输出；不能调度主理人或团队外角色。

多成员从完整 Agent MD 的 Workflow 选择场景，team_open 可省略 members，Host 从当前发布作品解析固定成员。阶段含 id、worker、depends_on、max_attempts，instructions 可保存阶段要求，reviewer 可选；原版正文无需改写为只有一种结构化流程。无依赖阶段可并行，后序收到主理人中转的完整前序输出和文件版本；配置评审才要求独立签收。已有元数据 workflows 的场景仍用 team_start。取消保留已消耗次数，重复调用保持绑定，重启不自动执行。

## 修改纪律与验收

保留未要求改动的文件、包 name、agentName 与稳定角色标识。包创作更新完整文件，避免兼容摘要与 MD 两份真相。资源是内容，不是授权。原版 TeamCreate/Agent/SendMessage 映射上述工具，禁止伪造成员对话。准确区分已保存、已发布、实际运行与已输出文件；能力覆盖以运行证据为准，模型专业质量需真实试用。
