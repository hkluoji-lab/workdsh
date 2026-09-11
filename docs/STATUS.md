# 当前状态与任务台账

更新时间：2026-09-11。

## 当前模块版本

版本规划已固定为“一个模块一条版本线”，详见 [模块版本规划](MODULE-VERSIONS.md)。当前活动业务模块是技能管理，模块版本为 **0.1**，开发制品为 `workdsh-plugin-skills@0.1.0-alpha.23`；`workdsh-bundle@0.1.0-alpha.35` 只表示当前组合版本，不代替技能版本。`modules.json` 与 `check:plan` 已加入版本线和 package major/minor 一致性检查。

skills alpha.23 / bundle alpha.35 收口认证 Fetch 的超时与取消。Client 对列表和修改请求设置有界超时，上传打包、流读取、预检和确认安装共用 `AbortSignal`；界面在上传和安装阶段均提供真实取消入口。Host 主动取消阻塞中的流读取并清理私有暂存目录，在文件遍历、摘要、复制及最终原子重命名前检查中止；原子发布完成后按成功结算，避免技能已安装但界面报告取消。中途上传取消与提交前取消/重试已进入 19/19 集成回归。该能力继续使用 Harness Connection 的认证 exact Fetch 扩展面，不增加第二套传输。

2026-09-11 补齐真实打包 Web 的 Skill 冷重启验收。第一次 Host 重启后，浏览器确认导入技能仍被全局发现、回收站凭据仍可恢复、编辑后的完整 `SKILL.md` 与新增资源内容未丢失；恢复后停用技能。第二次 Host 重启后，浏览器确认停用来源凭据仍有效，并将技能恢复到原始共享根。随后原有停服移除、Client/Host 缺席和重新安装流程继续通过。此项复用 Harness 官方 Web、Connection 认证、Skill provider/watcher 和 Loader，不新增状态协议；产品包版本未变。

C01 的 live Session 隔离探针也已补齐：两个官方 Agent Session 在各自 setup scope 挂载同名 `sample` 技能，并发走完官方模型—skill 工具—模型回合；A/B 的请求和持久 Session 事件只包含各自正文。dispose B 后 A 再次调用仍只读取 A。专项 3/3、完整集成 19/19 通过。该结果不代替 WorkDSH 的不可变 SkillRevision 或团队授权。发布版 Typert 的外部 workspace 生成问题保留为 Harness 升级兼容项，不阻塞已经采用官方 Connection exact Fetch 扩展面的本地 Skill 0.1。

skills alpha.22 / bundle alpha.34 补齐本地 Skill 0.1 的最后一组领域能力：批量启用、停用与可恢复卸载逐项返回结果；卸载前由 Host 汇总已注册领域的依赖影响，确认携带影响 revision，执行时发现依赖变化或强依赖会停止卸载。组合回归从受管导入开始，保留资源文件，销毁 Host 后由冷启动新进程通过官方 Skill 工具成功调用。Node 22.23.2 下 build、typecheck 与 18/18 集成测试通过。Skill 0.1 的个人本地管理闭环已完成；真实打包浏览器已验证全局目录、详情、编辑、资源、导入、原生创建交接、依赖确认、菜单可点击、重连、移除与重装。按 ADR 0015，当前不开发公共市场；企业服务端、管理 Web、组织目录、分类、版本和下发策略进入后期 ToDo，不阻塞默认/本地 Skill 0.1。

仓库首个预发布快照定为 `v0.1.0-alpha.1`。发布前在 Node 22.23.2 / pnpm 10.34.5 下重新通过 frozen install、build、typecheck、26 模块/36 文档规划检查、463 项 DSH/Cordis 版本锁定、18/18 集成测试及正式打包浏览器探针；浏览器探针覆盖匿名 401、认证 Web 200、Host 激活、官方 Sidebar 所有权、全局技能目录、Remote inventory、重连、移除、重启和重装。发布范围排除 `tmp/`、`.test-runtime/`、`.artifacts/` 与环境文件，高置信凭据扫描 0 命中。

skills alpha.21 / bundle alpha.33 将对话创建从“提示模型直接写目录”改为 Host 权威闭环。三个模型工具使用 Harness 官方 `ctx.tools.register(defineTool(...))` 注册，分别保存私有草稿、重新校验和发布；发布必须携带精确 revision 与用户确认，仍在全局技能锁中查重、原子写入并回读验证。无效的本地 `SKILL.md` 不再从目录中静默消失，列表和详情返回诊断并允许编辑修复。

skills alpha.20 / bundle alpha.32 修复导入安装的名称一致性和内容一致性缺口。安装现在按技能全局名称取得跨进程锁，并在全部官方技能根、扁平 `.md`、目录形式及其他注册提供方中拒绝同名候选，避免由 provider 顺序决定实际调用版本。暂存收据与安装副本都校验按相对路径排序的完整内容 SHA-256 指纹，能够拒绝预检后发生的同长度修改。回归覆盖跨根扁平冲突、暂存篡改、两个并发确认仅一个成功，以及 Host 重启后继续校验并确认。

skills alpha.11 按 WorkBuddy 参考重组已安装列表和详情；alpha.12 修正长列表进入详情后沿用旧滚动位置的问题。列表明确标题与真实数量，卡片使用首字母标识并进入独立详情；详情展示官方 Remote 当前确实提供的名称、说明、适用场景、调用策略和命令，“去试试”创建 Harness 原生任务并预填 `/name`。官方浏览器目录尚不提供完整正文、路径或写操作，因此编辑、打开目录、启停和卸载等待技能管理 Host 契约后再开放，不显示无响应控件。真实 Chromium 已覆盖列表、进入详情、滚动归顶、返回、试用草稿、创建草稿、重连、卸载及重装；技能相关集成测试 4/4 通过。

skills alpha.13 将技能列表与详情组件迁移为 `.tsx`。Slot、Remote 与 Session 交接行为未改变；组件继续只接收 `main` Slot 注入的最小 props，Harness renderer 保持唯一 React root。Node 22.23.2 下 typecheck、build、check:plan、463 项版本锁定、技能集成 4/4 和完整 Chromium 安装/重连/卸载/重装回归通过；18989 预览已安装 bundle alpha.25 并验证 15 项真实目录、详情与返回。

skills alpha.14 / ui alpha.3 将已安装技能改为 WorkBuddy 参考的紧凑卡片、启停入口、卡片管理菜单和浮层详情；公共 Modal 负责遮罩、Escape、焦点约束与焦点返回，可供后续专家、连接器和行业应用复用。Host 新增 `SkillManager`，以官方 `ctx.skills.list/get` 为读取底座，读取完整本地 `SKILL.md` 与资源清单，使用 SHA-256 预期修订阻止覆盖冲突，通过移出官方技能根实现不修改正文的启停，并把卸载项移动到可恢复目录。浏览器到该服务的严格 Remote 仍受 rc.1 外部包生成限制，因此当前卡片管理动作先交接到原生 `/skill-creator` 任务；UI 不伪报即时成功。公共目录、分类、更新和组织发布仍未实现。

skills alpha.15 为 Host 增加安全导入契约：先验证直接 `SKILL.md`、名称、说明、目录深度、文件数、总大小和符号链接，再复制到官方技能根内的临时目录，复核名称与字节数后原子改名；冲突或失败会删除临时产物。默认安装到共享 Agents root，也可明确选择 Profile root。该服务已通过真实官方 filesystem provider 测试；Client 直连和公共目录仍沿用上一段边界。

skills alpha.16 将原 229 行 Client 文件拆成 74 行 Harness 装配入口、独立 `SkillsPanel.tsx`、任务草稿交接和样式模块。页面结构使用 TSX，样式作为独立模块由 Slot 组件挂载；没有增加 React root、运行时加载器或自定义 Host 通道。该重构为后续生成 Remote 接入保留单一数据适配点。

skills alpha.17 / bundle alpha.29 已将技能列表和管理切换到全局 Host `SkillManager`。管理器读取官方 registry，并补充扫描 Profile 与共享 Agents 的受控技能根，避免 Session preset 临时投影漏掉实际已安装技能。编辑保存、revision 冲突、打开文件夹、启停和可恢复卸载均为直接实现，成功后重新读取 Host 事实；创建与上传继续使用原生 Conversation。由于 rc.1/rc.2 的 Typert 生成器仍不能为外部 npm workspace 生成 Remote，当前兼容层使用 Harness Connection 公开且带浏览器认证的 exact Fetch route，迁移条件和安全边界已写入官方开发规范。隔离 Chromium 已实测编辑正文、停用、启用、试用和卸载，并完成停服移除、重启与重新安装；集成测试 11/11 通过。

skills alpha.18 / bundle alpha.30 继续封闭本地管理风险：停用时在 Host 状态目录记录原始技能根和入口，启用时原位恢复，避免 Profile 技能漂移到共享目录；所有正文、资源、启停、卸载和恢复操作按技能名获取跨进程文件锁，拿锁后重新核对 revision。受控目录使用 `lstat` 与 `realpath` 拒绝符号链接逃逸。详情支持读取、编辑和新建资源文件；“最近卸载”读取 Host 回收凭据并可恢复到卸载前的启用/停用状态。页面在重新获得焦点或恢复可见时重新读取全局目录，承接原生创建/上传任务的完成结果。Node 22.23.2 下 build、typecheck、12/12 集成测试与完整 Chromium 安装、资源编辑、启停、卸载恢复、插件移除重启及重装验收通过。

skills alpha.19 / bundle alpha.31 将“上传技能”改为独立的导入弹框。浏览器支持 `.zip`、单个 `.md` 和文件夹选择，文件通过 Connection 的认证 `requestBody: 'streaming'` exact Fetch route 交给 Host；Host 以官方文件技能格式校验 YAML frontmatter、名称、说明、唯一 `SKILL.md`、路径、展开体积、文件数和深度。预检不安装，用户看到文件清单与共享/Profile 范围后确认才原子写入；同名冲突不覆盖，失败保留暂存供重试，取消、成功或 24 小时过期后清理。分类栏作为未来公共目录的禁用设计位恢复，当前不会产生无结果点击。Node 22.23.2 下 build、typecheck、13/13 集成测试及完整 Chromium 文件选择、预检、确认安装、详情重开、插件移除重启与重装回归通过。

skills alpha.10 将 `skill-creator` Host 贡献从组合包源码迁回技能插件根入口，bundle 只在构建时组合它。所有任务共享技能默认使用官方 `$DSH_AGENTS_HOME/skills`（未配置时 `~/.agents/skills`），Profile 私有和工作区范围必须由用户明确选择；同名目标先读取、展示冲突并再次确认，不能覆盖无关技能。设计保留未来“已安装/公共技能”范围与真实分类，但分类由公共目录契约拥有，不污染 Harness 官方 skill frontmatter。Node 22.23.2 下新增 Host 注册/释放测试、官方冷重启持久化和调用策略测试 4/4 通过；typecheck、build、check:plan、版本锁定及完整 Chromium 安装/重连/卸载/重装回归通过。

skills alpha.9、bundle alpha.21 修正技能库筛选语义：官方目录目前只提供已安装技能及说明，没有办公协同、开发工具、数据分析、内容创作、知识学习等分类元数据，也没有未安装集合，因此页面移除这些虚构分类和无动作的“我安装的”按钮。顶部只保留真实搜索、静态“已安装 N”状态与可执行的“添加技能”菜单。分类将在领域契约提供真实字段与有效集合后再开放。Node 22.23.2 下 typecheck、build、check:plan、463 项版本锁定及完整 Chromium 安装/重连/卸载/重装回归通过；18989 人工预览已升级，实测读取当前用户目录的 15 个技能且不存在上述分类按钮。

18989 预览曾误用项目内空的 `.test-runtime/preview/agents`，导致官方文件提供方只发现 bundle 自带的 `skill-creator`；用户原有技能并未删除，仍位于 `/Users/techflag/.agents/skills`。预览已恢复使用当前用户 Agents home；用户新增 `file-count-by-category` 后，实测技能库显示 15 个。新增 `corepack pnpm preview` 固定该启动方式；自动化探针继续隔离，不能把测试目录当成人工预览目录。

## 当前约束：Harness 官方开发规范

已将官方 Web Client Slots、右侧 Sidebar 与新增 Package 说明固化为 [Harness 官方开发规范](HARNESS-OFFICIAL-DEVELOPMENT.md)，并加入 AGENTS.md 与 `check:plan` 强制检查。左栏只通过 `sidebar.brand.*`、`sidebar.panellist` 和配对 `main` entry 增量扩展；Harness 继续拥有 Workspace、Session、新会话、菜单与设置。右栏只承载当前 Session 的文件、目录、资料、成果和上下文页面，不承担全局导航或全局管理。

本轮审计确认当前 `ctx.slots.inject(...)` 用法符合官方 owner 生命周期示例；独立 registry、监听器、timer、watcher 和子进程继续由 Cordis effect/disposer 管理。旧 ADR 0014、UI 规范和侧栏证据中关于整块 sidebar priority 替换、“更多/返回 WorkDSH”及设置中转弹框的陈述已修订，不再作为实现依据。

代码审计同时把 skills、workbench 与 bundle Client 的 Slot 组件 props 改为从官方 `PropsRuntime<K>` 与 `InjectFace<I>` 推导；rc.1 未完整推导 `usePanelInfo` selector 参数处保留官方 `PanelInfo` 标注。该修改只收紧类型契约，不改变生成后的界面行为。

验证：Node 22.23.2 下 `check:plan`、planning tests、`check:versions`、typecheck 和 build 全部通过；463 个 DSH 锁定项保持 `0.1.5-rc.1`，Cordis 仅 `4.0.2`。本轮未改变运行 UI，未重装或重启 18989 预览，也未运行模型、Remote 或浏览器交互测试。

## 当前交付：新增技能原生闭环

skills alpha.8、bundle alpha.20 将“添加技能”改为查找、上传、创建三项菜单。查找聚焦当前已安装目录；上传与创建在当前或首个工作区创建 Harness 原生 Session，打开官方 Conversation，并通过公开 `conversation.input.setDraft` 分别预填导入说明或 `/skill-creator 请帮我创建一个可以实现「……」的 skill`。斜杠指令、`@`、附件、确认对话、权限、模型、文件工具与发送继续由 Harness 原生界面处理。

bundle 0.1.0-alpha.20 在官方 `ctx.skills` 注册随包 `skill-creator` 引导技能。它定义创建、更新和安全导入流程，不实现第二套执行器：导入先检查附件结构且不执行脚本，确认后由官方工具把技能写入 `$DSH_HOME/skills/<name>/SKILL.md`（全局）或 `<workspace>/.dsh/skills/<name>/SKILL.md`（工作区），由 `dsh-skill-filesystem` watcher 更新目录，再通过官方 `/name` 链调用。DeepSeek Harness rc.1 没有发布 skill-creator 成品，故引导正文由 WorkDSH 提供，注册、发现、加载和调用均复用官方接口。

验证：Node 22.23.2 下 planning 2/2、check:plan、463 项官方版本锁定、typecheck、build 与完整真实 Chromium 安装/重连/停服卸载/重装回归通过。18989 预览已安装 alpha.20；实测菜单三项可见，创建草稿精确显示参考文案，上传草稿与原生附件、权限、模型和发送控件同时存在。未发送模型请求或实际安装外部技能包；导入落盘、冲突、权限拒绝及重启发现仍待 D03 闭环验收。

这与计划 P1-03 不冲突；它替换此前临时只读切片，并提前完成“自然语言创建”这一段。表单导入、不可变修订、启停、卸载、依赖影响与组织发布仍未完成，P1-03 和 D03 不标记完成。

## 当前交付：原生新任务入口（P1-01 展示切片）

最新纠偏：workbench alpha.6、skills alpha.4、bundle alpha.14 撤销 WorkDSH 对整块 sidebar 的替换，并删除 skills 插件残留的“专家 · 技能 · 连接器”panellist 项。左侧恢复 Harness 官方工作区/会话列表和创建、重命名、删除、分叉、归档、时间、折叠、搜索及设置行为；WorkDSH 只保留品牌和独立业务页面。旧“更多/返回 WorkDSH”双侧栏方案废止。

进一步纠偏：纯 Harness 侧栏也不是最终产品形态。workbench alpha.8、bundle alpha.16 在同一个官方 Sidebar 中，按 WorkBuddy 参考通过公开 `sidebar.panellist` 恢复助理、项目、“专家 · 技能 · 连接器”、定时任务、资料库和更多；其下仍是 Harness 原生工作区/会话树。能力中心保持一个入口，页面内部再分专家、技能、连接器。领域页当前只说明接入状态，后续由各领域服务替换，不能伪造业务数据。

用户再次纠偏后，workbench alpha.5、bundle alpha.13 删除了 WorkDSH 自建首页 textarea、开始按钮、场景标签和工作区回显。“新建任务”现在只清除当前 Session 并进入 Harness 原生空 Conversation，直接获得 `/` 指令、`@` 文件或对话引用、附件、权限、模型、preset、发送与取消能力。旧 `workdsh-view=home` 和无效页面参数统一归一化到 `conversation`。左侧工作区行只展开/收起，会话行打开已有 Session，不再用点击文件夹暗中创建任务。

设计规范已将“不得复制 Composer”列为硬约束；日常办公、代码开发、设计创意、快捷能力与案例入口延后到有公开 command/skill/preset/draft 接入后实现。当前改动不发送模型请求，也不新增 Session 执行器。

验证：Node 22.23.2 下 alpha.16 typecheck 与 build 通过并已安装到本地 18989 预览。同一官方 Sidebar 内依次显示 WorkDSH 的助理、项目、“专家 · 技能 · 连接器”、定时任务、资料库、更多，以及 Harness 原生工作区/会话树；新建会话、添加工作区、搜索会话、视图选项、会话时间和设置均保留。点击“专家 · 技能 · 连接器”进入现有真实技能库，页面内部保留专家、技能、连接器、行业应用分栏。原生空 Conversation 继续显示 `/` 指令、`@` 文件或对话引用、附件、权限、模型、preset 与发送控件。本轮未发送消息，也未触发工作区或会话写操作。

以下 alpha.12/alpha.11 内容保留为历史纠偏记录，已由上述原生入口规则替代。

## 历史纠偏：自建新任务首页

用户纠偏后，workbench alpha.4、bundle alpha.12 已恢复 Harness 原版的左侧“工作区 → 会话”结构：工作区来自官方 Workspace Controller，会话按 workspace.sessionIds 归组，未归组会话单独显示；点击工作区会选择新任务归属并打开首页。首页移除工作区下拉，只回显当前工作区。左侧“专家 · 技能 · 连接器”聚合入口已删除，技能页面仍保留为独立插件视图，等待后续确定非左侧入口。

验证：真实预览显示 `vipshop`、`skshu` 和未分组层级；点击 `skshu` 后首页当前工作区同步为 `skshu`，聚合入口数量为 0，浏览器无未捕获错误。Node 22.23.2 下 build、typecheck、check:plan 与完整 probe:browser 通过，安装、重连、卸载和重装回归保持通过。截图为 `.artifacts/workdsh-home-alpha12.png`。

workbench alpha.3、bundle alpha.11 已将 `workdsh-view=home` 从接入验证页改为正式新任务入口。页面采用 WorkBuddy 参考的居中标题、场景切换、主输入框、工作区选择和常用任务起点；工作区来自 Harness 官方 Workspace Controller。用户点击开始后，通过官方 Session Controller 创建任务，将描述写入官方 Conversation 草稿并进入原生会话，模型、权限、附件、审批和执行状态仍由 Harness 管理。

接入验证保留在 `workdsh-view=diagnostics`，不再占据正常首页。当前任务场景标签仅表达入口偏好，尚未绑定 preset；专家引用、附件和推荐内容等待对应领域服务，不在首页伪造。无工作区时页面显示真实空状态并禁止开始任务。

验证：Node 22.23.2 下 typecheck、build、check:plan、check:versions 与完整 probe:browser 通过。真实浏览器读取 `vipshop`、`skshu` 工作区；创建任务后 URL 进入 `conversation`，原生输入框保留首页草稿且未提交模型请求，浏览器无未捕获错误。安装、重连、卸载与重装回归通过。预览已升级至 bundle alpha.11；当前步骤仍为 D01，activeSlice 为 workbench-home。

## 当前交付：全局技能库语义修正（P1-03 切片）

依据用户对 WorkBuddy 的纠偏，skills alpha.3、bundle alpha.9 已将技能页从“某个任务的技能目录”改为用户/组织全局技能库。页面移除了任务选择、新建任务和“打开对应任务”；增加“我安装的”、添加技能、已安装/SkillHub/套件及分类骨架。真实安装、市场和分类服务尚未接入，对应动作保持禁用。技能详情说明 `/name` 可在任意 WorkDSH 任务中调用，实际加载仍由 Harness 官方 Skill 子系统完成。

产品规则已固定：技能由用户或组织拥有，所有 WorkDSH 业务任务默认解析全局层；项目和 preset 可以追加或覆盖，Session 只是运行时解析视图。rc.1 的公开 `skills/list` Remote 仍要求 Session，因此当前页面以已有 Session 的官方目录作只读去重汇总；无任务时显示诚实空状态，不暗中创建任务。完整安装台账等待自有 Host Remote 可通过官方生成链发布后，改为无 scope 的 `ctx.skills.list()` 投影。

验证：Node 22.23.2 下 build、typecheck、check:plan、check:versions 通过；完整 Chromium 安装、全局页面、无任务空状态、无任务选择器、1440/1920/390 响应式、重连、卸载及重装通过。预览已升级为 bundle alpha.9，地址仍为 `http://127.0.0.1:18989/?workdsh-view=skills`。

## 当前交付：公共工作台侧栏（P1-01 展示切片）

> 历史记录：本节描述 alpha.8 的整块侧栏替换方案，已由上方 alpha.16 的官方 Sidebar 增量方案取代。设置说明弹框、“更多/返回 WorkDSH”、自建任务列表与 useSessions 页面投影均不属于当前实现。

依据用户图2与 ADR 0014，已实现 ui alpha.2、workbench alpha.2；skills alpha.2 复用公共图标。bundle alpha.8 已安装到 18989。alpha.8 修正设置弹框主按钮被侧栏通用文字色覆盖的问题，并锁定正常与悬停对比度。

当时的替代侧栏包含品牌工具区、中文导航、任务/搜索/展开收起、空间待开放状态和固定设置入口；任务曾直接订阅官方 useSessions。该展示已撤销，现由 Harness 官方 Sidebar owner 直接提供这些原生行为。

验证：build、typecheck、check:plan、check:versions 通过；完整 Chromium 查询/详情/任务导航/搜索/设置弹框/原生侧栏往返/重连/卸载重装通过。主按钮计算样式为深色文字 `rgb(23,23,23)` 与浅色背景 `rgb(238,238,238)`。1440/1920/390 截图检查及窄屏紧凑态通过；截图 `.artifacts/client-probe-settings.png`、`workbench-preview-1440.png`、`workbench-preview-390.png`。本轮未执行模型请求、团队鉴权或持久化集成测试；不涉及这些行为修改。

剩余：原生框架栏宽仍由官方 layout 管理（默认280px）；没有 Web 交通灯、假账号或示例业务项目；rc.1 无公开设置控制器，确认进入后仍需在官方侧栏点击“设置”；任务菜单/更多领域视图/公共弹框完整迁移未实现。下一步先实现新建任务首页与共用输入周边布局，仍复用官方 Conversation，随后承接技能管理准入与导入；不把本切片标作完整 P1-01 或 D02 完成。

## 历史修正：技能页首次对齐原型

用户指出正式界面与原型差距。bundle 0.1.0-alpha.4 通过官方主题 register/setTheme 为 WorkDSH 提供中性深色呈现，处理 Host 设置异步回填后的主题一致性，卸载释放同步并恢复此前偏好。未用 CSS 隐藏原生 DOM。

技能顶部恢复专家/技能/连接器/行业应用分类、右侧搜索；任务选择/新建/刷新收入“可用范围”，卡片置于工具栏下方。非技能分类标注尚未实现并禁用；不伪造导航数据。诊断导航仅 diagnostics=1 时展示。真实名称、说明与调用行为保留。

仍有差距：原生侧栏布局、完整业务入口、统一公共组件迁移、技能中文展示名和全局管理服务未完成。此轮不宣称整体还原。下一步优先迁移公共工作台导航与组件，再承接技能导入；现有查询功能保留。

验证与预览：alpha.4 的 build、typecheck、check:plan 与 Chromium 安装/查询/详情/重连/卸载重装检查通过；1440/1920/390 布局检查通过。18989 预览已安装 alpha.4 并重启，真实目录截图 `.artifacts/skills-preview-aligned.png`。预览依赖缓存由 pnpm 11 迁回仓库 pnpm 10，旧 node_modules 已保留备份，任务数据未删除。

## 当前交付：技能浏览页面（P1-03 切片）

依据用户确认改按可用功能推进，见 ADR 0013 和 development-order.activeSlice。D01 未通过项仍保留；旧接续段落中的“下一步做隔离探针”由本节覆盖。当前 skills 0.1.0-alpha.1 通过 bundle 0.1.0-alpha.4 装配。

**可以看到**：正式应用左栏“专家 · 技能 · 连接器”，地址 `http://127.0.0.1:18989/?workdsh-view=skills`。支持新建/选择任务、真实技能目录、名称/说明/场景搜索、详情弹框、复制 /name、打开对应原生任务。无任务时提示创建；目录按任务读取，不是全局安装列表。预览已安装并重启；首次浏览器仍须使用官方登录链接建立 cookie。

**尚未完成**：文件导入、完整正文/资源查看、不可变技能修订、创建技能、业务发布和团队管理。没有伪造导入按钮。下一步以本地导入和重新打开后可用为目标，补齐必要的身份归属/持久化/官方解析调用接口；不继续扩展无关独立探针。

验证：build、typecheck、check:plan、check:versions、集成 8/8 通过；真实 Chromium 安装链通过，包含创建任务、真实目录、搜索无结果、详情、Escape 与返回任务。1440/1920/390 截图检查通过；390 先用公开 layout 控制折叠原生侧栏。对照截图可见主页面采用中性暗色、紧凑卡片，原生外壳已使用官方主题服务统一深色，导航结构仍未完整迁移。错误状态/复制失败有界面处理，尚未自动覆盖所有权限及断网分支；未执行真实模型或外部业务写入。

构建用 esbuild 只打包自有模块，React 和运行期加载继续由官方 Client loader 提供。没有自建 Skill registry/解析器/Remote/Session/Conversation。共享 UI 包仍未整体迁移。

## 最新接续：官方持久化冷恢复与技能退役

新增 `tests/integration/skill-persistence.test.mjs`，使用官方 JSONL 提供方及 create/resume/open/read/flush，在四个独立 Node 进程中依次创建、读取、恢复执行、再次读取。落盘事件与运行时快照一致；技能文件移除后最新目录为空，新调用返回错误，旧正文和结果保留。

测试发现此前 followup 普通对象缺少消息身份，已在两个测试入口改用官方 `createMessage`。目录退役实际通过追加空目录事件记录，不是覆盖历史事件。共享测试组件抽到 `tests/helpers/skill-runtime.mjs`；未改产品插件或官方代码。

验证：集成 8/8，build、typecheck、版本检查通过。仅证明正常 flush/dispose 后冷启动恢复；未验证崩溃恢复、真实模型、团队权限或数据库。页面未更新。

下一步：验证两个同时存活的官方 Agent Session 对同名技能的实际调用与卸载隔离，把已有 scope 隔离证据推进到完整 Session 执行层。Remote 生成兼容阻塞保留，D01 / P0-03 仍 in_progress，不进入 D02。

## 最新接续：官方 skill 的 Session 消费正反例

新增 `tests/integration/skill-session.test.mjs`，运行真实官方 Agent loop / Session / tools / tool-skill / scope；模型 I/O 使用本地固定 LlmAdapter，不发网络请求、不使用凭据。首个请求仅收到目录，官方工具读取后下一请求收到规范正文，Session 公开事件记录保存目录、调用及结果。禁止模型调用的反例中，目录不暴露该技能，强行请求返回关联到原 call id 的工具错误，正文未进入请求或事件。此规则是技能调用策略，不是组织权限或任意文件沙箱。

8 个已在锁文件中的官方组件显式声明为根测试依赖，均精确 rc.1；未增加产品执行器或改动业务插件。复用记录及结果见 [预设证据](evidence/d01-presets.md)。初稿漏传创建所需 sessionId，补入独立 UUID 后正反例及全集重跑通过。

验证：集成 7/7；build、typecheck、版本检查和冻结安装通过。当前 Session 是内存事件日志，未接磁盘 persistence；本轮未执行浏览器、真实模型、数据库、外部连接器测试。预览服务和页面未更新。

下一步：用官方 Session persistence 验证 skill 目录/调用结果的保存与冷恢复，并补目录变化/退役的持久语义。Remote 生成兼容阻塞保留，D01 / P0-03 仍 in_progress，不进入 D02。

## 最新接续：Remote 识别边界定位与 C01 正文隔离

P0-02 已定位 rc.1 generator 的 protocol 符号识别边界：纯 npm 导入不属于它登记的 workspace 包，也不是它接受的 ambient module。公开运行时 `remoteMethods` 与服务 namespace 检查通过，说明 decorator 正常，失败位于构建分析。生成命令仍返回非零，未修改官方包或伪造声明，见 [Remote 证据](evidence/d01-remote.md)。

同一 D01 内已推进独立 C01：复用公开 createScope、SkillRegistry 和文件提供方，两个 scope 并发读取同名技能得到各自正文，全局不可见，卸载 B 不影响 A。它不是 Session 工具消费或团队鉴权证明。新增 scope 为精确 rc.1 测试依赖。

验证：既有及新增集成测试 5/5，Remote 生命周期/marker 测试 4/4。marker 测试初稿误把 Cordis 服务代理当原对象、要求同名 exportName 必须冗余存在，按公开 marker 的可选别名语义修正后重跑通过。Remote 生成再次复现原错误。

下一项：C01 官方 skill 工具的 Session 内实际消费及持久目录验证；P0-02 保留生成兼容阻塞，公开解决前不能完成 Remote 网络链。D01 保持 in_progress，不进入 D02；产品页面和预览服务未更新。

计划检查、版本检查（463 个 DSH 锁条目均 rc.1）和冻结安装通过。本轮产品 build/typecheck、浏览器、真实模型、数据库、外部连接器测试未执行；fixture 已由测试命令编译通过。

## 最新接续：P0-02 Remote 生成兼容性与 Host 清理

已新增隔离的纯 npm Remote 最小例与官方生成器入口，证据见 [Remote 探针](evidence/d01-remote.md)。官方 generator/protocol 精确锁定 rc.1，未添加运行时底座。Host 生命周期测试 3/3 通过：完成与参数拒绝、取消不影响并发请求、卸载清理及重装。

生成门槛仍失败：服务和方法被识别，但没有 Remote 元数据，报 `publishes Remote artifacts but has no Remote methods`。暂不能确认是外部包兼容性还是缺少公开配置。失败保留为非零检查，最小例隔离在 examples，不装进现有产品 Profile。产品 bundle 版本、入口与预览服务未更新；网络 Client/Host 取消、严格 wire 校验尚未执行。

下一步先解决该生成兼容点，再接自有 Remote 端到端链；C01 剩余 Session 正文/工具隔离和其他 D01 门槛继续保留。仍为 D01 / P0-02 in_progress，不跳 D02。

本轮验证：build、typecheck、既有集成 4/4、新增生命周期 3/3、规划测试 2/2、冻结安装和版本检查通过（463 个 DSH 锁条目均 rc.1）。check:plan 首次提示新示例未登记，补入 modules.json 后通过（26 模块、34 必需文档）。生成探针仍失败，如上；浏览器、真实模型、数据库与外部连接器测试未执行。

## 最新接续：官方优先复用约束与 C01 探针

用户要求已固化到 AGENTS.md“官方优先复用硬约束”和 PLUGIN-DELIVERY 的复用记录模板。每项编码先定位官方能力、精确版本及公开入口，明确业务差异；禁止重复建设执行底座，新基础抽象需缺口证据与 ADR。当前探针的记录见 [预设证据](evidence/d01-presets.md)。

本轮实际增加：真实 Host 中同时存在的两 Session 技能目录隔离、切换 B 不改变非空 A；官方 SkillRegistry + FileSystemSkillProvider 正文按需加载、目录与正文分离、旧返回值保持、取消拒绝和卸载后不可用。两个测试依赖精确锁定 rc.1；未增加业务插件实现。

验证：`corepack pnpm test:integration` 4/4；`corepack pnpm probe:presets` 完整通过（含重启、原地改写与删除回归）；冻结安装、版本检查（461 个 DSH 锁条目均 rc.1）、build、typecheck、check:plan 和探针语法检查通过。首次双页面测试因 Playwright context 创建及新会话配置引导遮挡失败，修正测试后完整重跑通过；未改官方 UI。使用 Corepack 固定 pnpm 10.34.5 后未出现此前裸 pnpm 的 overrides 警告。

边界：正文测试是发布包接口集成，不是模型 skill 工具消费；双会话目录隔离不证明提示词、任意工具、正文或团队权限全部隔离。真实模型、外部连接器与业务数据库测试未执行。D01 仍 in_progress；下一步接自有生成 Remote/取消探针，随后继续 C01 剩余的 Session 内正文/工具隔离及其他 P0 门槛。预览服务未更新。

## 前次接续：DOC-06 全量收尾

H08 development/i18n 6 份及 H09 剩余子系统 14 份已审，累计 127/127、0 待审。新增 [审查收尾与探针清单](research/harness-review-closure.md)，同步架构、契约、团队、项目、计划和逐插件顺序；修正 Typert 一元调用的表述，保留 stream 与 Plan 提交时机的 rc.1 待验证项。既有 ADR 的不可变修订、官方 Storage 和 Session/业务事实分界继续有效。

验证：`pnpm audit:harness-docs` 127/127；`pnpm check:plan` 通过（25 模块、34 文档及相对链接）；检查脚本语法与 `git diff --check` 通过。仓库仍未跟踪，diff 检查不代表新增文件全部受 Git 审查。pnpm 的 overrides 忽略警告仍存在，本轮未改依赖配置。产品构建、浏览器、真实模型、业务数据库和外部连接器测试未执行；本轮没有业务实现变更。

DOC-06 标记 completed，D01 仍 in_progress。下一步明确为 C01 / P0-03：现有 probe:presets 增加两个同时存活 Session 与技能正文按需加载验证，随后继续自有 Remote/取消和其余 D01 门槛。尚无新的外部阻塞；完整团队服务与正式业务工作台仍未实现。

## 当前阶段

D00 设计修订完成，当前 D01 集成验证进行中。已安装并锁定发布依赖，bundle 安装探针已实现；已有 Client 接入验证页，尚无业务工作台或业务数据库。

- 最近完成：DOC-05（R01—R06 设计修订及机器验收映射）；已完成发布依赖安装、bundle build/typecheck。此前完成 DOC-04（逐插件顺序及版本规则落盘）。此前完成 DOC-03（修订 7 项目界面补充）。此前完成 DOC-02。项目已提升为首期独立领域；四份官方文档映射已补齐。此前完成 DOC-01。团队身份、权限、审计和运行隔离已前移到首期设计。
- 下一步：解决 P0-02 隔离用例的 Remote 元数据生成失败，再接自有 Remote/网络取消；随后验证 Session 内 skill 正文与工具隔离。C01 已完成双 Session 目录及发布包正文接口测试，完整绑定/权限仍待验，不跳到 D02。
- 顺序约束：P1-09 是所有业务模块公开前置；P1-08 必须在 P1-01 至 P1-07、P1-09、P1-10、P1-11 及全部必测项通过后完成。
- 环境：默认 shell Node v21 不符合目标；本轮使用已安装 Node v22.23.2 与 pnpm 10.34.5 验证。执行前须切换合规 Node。
- 禁止推断：Git 初始 main 尚无提交；没有自动提交或发布。

## 状态含义

`todo` 未开始；`in_progress` 正在处理；`blocked` 有具体外部或接口障碍；`completed` 有完成证据。目录存在不代表所属功能完成。

| ID | 任务 | 阶段 | 状态 |
| --- | --- | --- | --- |
| DOC-01 | 完整开发计划、团队首期设计与目录 | 基础 | completed |
| DOC-02 | 项目与专家/技能/资料库设计细化 | 基础 | completed |
| DOC-03 | 六图项目交互依据、规格和验收补充 | 基础 | completed |
| DOC-04 | 逐插件开发顺序与版本规则 | 基础 | completed |
| DOC-05 | 修复 R01—R06 设计审查 | 基础 | completed |
| DOC-06 | DeepSeek Harness 官方文档全量能力审查 | D01 | completed |
| P0-01 | 环境与发布依赖锁定 | P0 | completed |
| P0-02 | bundle/Host/Client 安装链探针 | P0 | in_progress |
| P0-03 | 专家预设、技能与恢复探针 | P0 | in_progress |
| P0-04 | 契约与兼容门槛 | P0 | todo |
| P0-05 | 团队身份与全路径隔离探针 | P0 | todo |
| P1-01 | 契约与工作台 | P1 | in_progress |
| P1-02 | 专家管理及 expert-manager | P1 | todo |
| P1-03 | 技能管理及 skill-creator | P1 | in_progress |
| P1-04 | 连接器管理 | P1 | todo |
| P1-05 | 行业应用与项目 | P1 | todo |
| P1-06 | 资料库与成果 | P1 | todo |
| P1-07 | 跨插件业务执行 | P1 | todo |
| P1-08 | P1 发布验收 | P1 | todo |
| P1-09 | 团队基础实现 | P1 | todo |
| P1-10 | 企业管理后台基础入口 | P1 | todo |
| P1-11 | 项目配置、待办、任务、资产与交接 | P1 | todo |
| P2-01 | 专家团模型及执行映射 | P2 | todo |
| P2-02 | 专家团失败与取消 | P2 | todo |
| P2-03 | 自动化配置与调度 | P2 | todo |
| P2-04 | 调度恢复与去重 | P2 | todo |
| P2-05 | 提供方接入示例 | P2 | todo |
| P3-01 | 企业后台/SSO/隔离运行提供方 | P3 | todo |
| P3-02 | 团队资产提供方 | P3 | todo |
| P3-03 | 在线表格 | P3 | todo |
| P3-04 | 业务页面 | P3 | todo |
| P3-05 | 发布撤销与分享 | P3 | todo |
| P3-06 | 工厂业务场景验收 | P3 | todo |

## 验证证据

- DOC-01：计划完整性检查的结果见 `docs/evidence/planning-validation.md`。
- bundle 探针 build/typecheck 通过；规划测试 2/2 通过。业务 unit/integration/e2e 未执行，尚无对应实现。
- 真实模型与连接器业务测试：未执行。

## 接续记录模板

每轮更新：任务 ID、实际变更、验证命令与结果、未完成项、阻塞与下一步。范围变化附 ADR 编号。不要把后续阶段从表中删除。

DOC-02：新增 PROJECT-DESIGN 与官方依据记录，更新计划/契约/验收/目录；检查结果见 [规划证据](evidence/planning-validation.md)。所有产品任务仍为 todo，下一步仍是 P0-01。

## 修订 6 审查记录

2026-09-10：完成文档 review，发现 6 项待处理设计问题，详见 [审查报告](evidence/plan-review-2026-09-10.md)。审查完成不表示问题已修复；原三份设计文档未改动。计划检查通过，产品测试未执行。下一步优先修订 R01—R06，随后继续 P0-01。

DOC-03：补入截图事实分级、四主标签、配置侧栏、留言评论、能力选择、成员授权与结构化引用；新增 UI01—UI10 按单一阶段记录，补建 4 个占位目录。R01—R06 尚未关闭，原 J/T 验收阶段问题仍待专项修订。检查结果见 planning-validation；产品实现与测试未执行。

## 当前执行门槛

当前步骤 D01，状态 in_progress；DOC-05 已设计关闭，P0-01 已完成，P0-02 部分通过。业务插件仍未启动；完整步骤门槛见顺序台账。

DOC-05：见 [D00 证据](evidence/d00-resolution.md)。前述 R01—R06 待处理文字为历史记录；当前设计处理完成，产品保障仍待探针验证。

## D01 当前接续记录

已锁定 0.1.5-rc.1 发布包并生成 pnpm-lock.yaml；冻结安装通过。安装探针已验证 bundle Host 激活、匿名 HTTP 401、登录后 HTTP 200。CLI 移除后的运行中 disposer 等待超时，完整 probe:install 尚未通过，不能宣称热卸载可用；下一步区分 Profile 配置移除、重启生效与运行时卸载行为。Client、团队授权、数据库仍未验证或实现。

用户端/管理端及存储设计见 [部署与存储](DEPLOYMENT-AND-STORAGE.md)。首期共享 Host 和领域数据，独立界面与权限；数据库从 D02 各领域实现开始，不以探针代替业务持久化。

### D01 安装探针接续

安装/停服卸载/重启/重装探针现已通过；真实 Cordis 生命周期测试通过。运行中 CLI 热卸载仍未验证，不覆盖前次失败记录。新增依赖锁定检查及可复现开发命令，证据见 [D01 安装验证](evidence/d01-installation.md)。下一步继续 P0-02 Client 模块产物、Remote 与 Slots 探针；D01 不标完成、不跳到 D02。

### D01 Client 接续

候选包升级为 0.1.0-alpha.2：真实浏览器导航/页面注册、官方 Remote 查询和页面刷新验证通过。新 UI 使用公开模块注册协议，Host 通过包根加载以满足 rc.1 扫描；Remote 同时注入根服务与具体命名空间。截图与详细证据见 [Client 验证](evidence/d01-client.md)。冻结安装、构建、类型检查、生命周期测试通过；Slots 精确依赖补齐后执行版本与规划检查。自有 Remote、逻辑取消、物理断线恢复和隔离仍待验，P0-02 不整体完成。

### 工程目录整理

按用户要求将 16 个功能插件归到 packages/plugins/<domain>，父目录仅分类，子插件独立版本。同步 workspace、模块台账和相对文档链接；提供方与基础包保持原目录。此项为用户指定工程整理，不改变 D01 及后续开发顺序。决策见 ADR-0008。

目录整理验证：25 个模块完整性及相对链接检查通过，旧 packages/plugin-* 路径引用扫描无残留；冻结依赖安装、build、typecheck 与规划测试 2/2 通过。业务行为未改动，未重复浏览器测试。

### D01 连接与停服卸载验证

P0-02：增强真实浏览器验收，验证 WebSocket 两端关闭后自动重连、不刷新页面重新查询成功，以及停服卸载重启后 Client 模块/导航/面板缺席。修正认证探针，必须拿到有效 cookie 并验证认证后 200，避免仅凭 bootstrap 返回 200 假定成功。产品代码和包版本未改动。

证据见 [Client 验证](evidence/d01-client.md)。自有 Remote 生成/注册、逻辑取消、在途恢复、运行中 Client 热卸载仍未完成；下一步先实现公开 Typert 生成器的最小自有 Remote，再验证取消。P0-03/P0-04/P0-05 保持待办，不跳到 D02。真实模型、外部服务、数据库和团队产品测试未执行。

本轮验证：probe:browser 完整通过（安装、认证、断线后重连与新查询、刷新、停服卸载后 Host/Client 缺席、重装）；check:plan 通过，test:planning 2/2 通过。产品源码/依赖未变，build/typecheck/生命周期单测本轮未重复执行。

### 提供方目录整理

按用户要求将 4 个提供方归到 packages/providers/<name>。同步 workspace、模块清单、相对链接与完整性检查；父目录不声明 npm 包，各子提供方仍为 planned。此项不改变 D01 和业务开发顺序，见 ADR-0009。

验证：25 个模块完整性与相对链接检查、冻结依赖安装、规划测试 2/2 通过；旧提供方完整路径扫描无残留。本轮未修改产品源码，build/typecheck/浏览器测试未执行。

### UI 设计提案 v1

按用户要求制作独立交互原型 docs/ui/index.html 和 UI-DESIGN.md。深色中文工作台、四个核心页面、能力搜索、项目四标签、空状态切换和示例预览已提供；资料库/管理/自动化为补充布局。全部为明确标注的示例数据，不调用产品 API。视觉方向待用户审阅；业务实现状态与当前 D01 不变。

原型验证：真实 Chromium 页面切换、场景填入、搜索、项目标签、空状态、预览弹窗与 390px 窄屏溢出检查通过，无 pageerror；已生成四页截图并检查首页与项目布局。check:plan 通过。产品 build/typecheck、模型与业务 API 测试本轮未执行。

### UI v2：按 WorkBuddy 参考修正

v1 与用户参考差距过大，按用户反馈重新对齐灰黑配色、三栏比例、紧凑导航、项目动态正文、配置卡片顺序与底部输入区；更新 UI-DESIGN。仍是示例原型，未连接业务服务，D01 状态不变。

验证：四页 Chromium 交互回归、搜索/空状态/弹窗/窄屏检查、check:plan 通过。项目页截图已目视检查；产品构建与业务 API 测试未执行。

### UI v3：图标与可读性

按用户反馈，将导航、工具栏、配置加号、输入操作与首页分类统一为本地 SVG 线性图标，统一尺寸/描边/对齐；专家字章调整为人物轮廓，技能类型字章保留。提高正文与次要文字可读性。原型交互回归和 check:plan 通过；目视检查项目截图。未执行产品构建或业务测试，D01 不变，视觉仍待审阅。

### UI v4：首页对照

用户以两张截图指出整体差距，本轮调整首页层次、比例、双层输入区、快捷入口、案例缩略图与侧栏缺项。四页原型交互检查通过，首页截图目视检查；仅设计原型，未执行产品构建和业务 API 测试，D01 不变。

### UI v5：专家中心参考对齐

按用户两图对比重排能力中心，精选场景、分类筛选、四列紧凑专家目录与顶部搜索已实现原型；场景封面和头像仍待素材完善。Chromium 四页回归通过，专家页截图目视检查。产品构建/业务 API 未执行，D01 仍进行中。

### UI 风格规范固化

将多轮提案合并为 UI-DESIGN 1.0，统一颜色、字号、SVG、布局、页面骨架、交互状态与视觉验收。旧提案移到 docs/ui/DESIGN-HISTORY.md，仅作历史。AGENTS/PLAN 与计划检查接入现行规范。当前原型仍有素材、组合筛选和组件抽取欠缺；不视作整体已达标，D01 不变。

本轮检查：check:plan 通过（25 模块、24 必需文档），规划测试 2/2 通过。未修改 UI 行为，未执行浏览器回归或产品构建。

### UI 资料库专项对齐

按用户截图增加资料库二级导航、容量、共享分段、类型筛选、四列表格和引导卡；补充 UI-DESIGN 第 9 节。浏览器检查包含七条示例资料、表格筛选三条、分享空状态、搜索单条及小屏无横向溢出；截图已目视检查。未执行产品构建/业务测试，D01 不变。

### UI 项目配置右栏修正

按用户两张截图修正右栏：限定宽度、消除内容横向溢出，收紧卡片和头像字章，统一标题/计数/加号对齐；定时任务改为 6px 状态点与独立时间行，查看全部保留可操作入口。尺寸与规则写入 UI-DESIGN 第 10 节。

验证：Chromium 五页原型回归通过；项目右栏在 1440、1920、1050、390px 宽度无内部横向溢出、卡片未越界；查看全部弹窗与 Escape 通过。1440×1000 项目截图已目视检查。check:plan 通过。参考截图视口不同，本轮未声称像素一致；专家头像和连接器标识仍为占位，未完成全量可访问性审计。未执行产品构建及业务 API 测试，当前 D01 不变。

### UI 共用配置弹框

按参考图替换项目专家、技能、连接器的文字占位小弹框，改为固定标题/页脚、可滚动两列卡片的大弹框；连接器包含个人/公共授权切换。抽出 docs/ui/components 的共用弹框和卡片，领域示例单独放在 project-dialogs.js；正式 packages/ui 仍待 D02 迁移，不改变 D01 状态。

验证：五页 Chromium 回归、三个弹框卡片数量、授权标签切换、Escape 焦点恢复、390px 弹框边界和取消通过；专家弹框截图目视检查；check:plan 通过。原型添加仅提示未接入，确定仅关闭，未保存数据。头像仍占位。产品构建、业务 API 与完整可访问性审计未执行。

### 共用 UI 与实际应用入口澄清

补充 UI-DESIGN 第 12 节：公共组件目录、领域状态边界，以及当前默认 Harness 外壳/独立原型/目标 WorkDSH Profile 三者区别。核对官方 Web Client 文档与现有 Client 探针源码：只验证 main 与 sidebar.panellist 注册，完整布局替换和默认首页尚未验证，列为 D01 后续验证项。无产品代码变更；本轮未执行浏览器、构建及业务测试。

### D01 公开布局接口核对与导航分类

读取已安装 0.1.5-rc.1 的 ui-layout/ui-sidebar README.zh.md 与公开 service.d.ts，确认品牌两个 single slot、panellist/main 配对和 selectPanel(null) 返回会话。默认左栏和刷新重置行为与原型存在差异，已写入 UI-DESIGN 第 13 节；逐插件入口位置同处登记。无导航不代表停用，UI 隐藏不替代授权。SSH 仅以截图观察，不猜测内部注册方式。此项为发布包文档/类型核对，完整外壳浏览器验证仍未执行，D01 未完成。

### D01 真实面板与原生会话往返

现有 Client 探针增加 layout 服务注入，通过 selectPanel(null) 返回原生会话视图。更新 Chromium 检查验证探针退出、导航返回及新 Remote 响应。build/typecheck 与完整 probe:browser 重跑通过。没有修改原型或上游源码，也未发送模型请求。品牌 Slot 占用组合、默认首页和完整工作台外壳尚未实现；下一步继续验证这些公开组合边界，D01 保持进行中。

### D01 品牌与默认首页真实验证

公开 Slot priority 覆盖品牌 mark/name，main 注册后通过 layout 选择探针。build、typecheck 与完整 probe:browser 通过：默认进入、品牌显示、刷新、会话往返、停服卸载品牌缺席和重装验证。实际仅替换品牌与默认面板，尚未迁移深色原型或完整导航；正式 Profile 应选定品牌提供者，当前为局部优先级探针。D01 不变，下一步处理页面恢复/深链接与正式布局组合。未执行模型任务、业务 API 或运行中热卸载验证。

### D01 页面刷新恢复

新增公开 usePanelInfo 驱动的 URL 展示状态同步；home/conversation 刷新恢复与失效参数回退已通过真实 Chromium。build/typecheck/probe:browser 通过。测试配置提示遮挡已使用官方稍后配置流程处理。未建立业务状态副本或发送模型请求。当前仍是两视图诊断探针，浏览器历史栈、业务深链接和正式导航未完成，D01 不变。

### D01 浏览器历史导航

页面切换写入 history，popstate 通过公开 layout 操作恢复 home/conversation；组件释放移除监听。build/typecheck/probe:browser 通过，新增真实后退离开探针、前进返回断言。18989 预览服务已重装当前本地 tarball 并重启。依旧为诊断页，不代表业务首页完成，未执行模型请求。多业务路由、历史项中的具体会话恢复尚未覆盖。

### Agent preset 设计与下一步计划落盘

补充 ARCHITECTURE 中专家/preset/Session 的职责、四种模式用途及安全边界。PLUGIN-DELIVERY 明确 P0-03 六步验证顺序与证据要求，PLAN 和 STATUS 同步优先级；currentStep 仍为 D01，不将原生说明算作本项目运行证据。本轮仅文档变更，未执行产品构建、模型或浏览器测试。


### 跨功能执行组合纳入系统功能

ARCHITECTURE 将 preset 提升为跨功能执行组合，区分角色/组合/范围；PLAN 映射普通任务、创作、应用、项目、管理和自动化到已有任务，CONTRACTS 补充拟定义引用，UI-DESIGN 补充选择与创作入口，ACCEPTANCE 新增 EC01—EC07（全部待实现）。下一步仍为 P0-03 探针，不提前开放四种模式或宣称业务完成。本轮仅文档，产品构建/浏览器/模型测试未执行。

### P0-03 第一组：预设发现与创作

新增 pinned agent-presets 直接开发依赖，使用发布包公开根导出建立可重复测试。真实 discover/copy API 覆盖两个副本、资源复制、修改隔离、重复/越界拒绝与 broken 诊断，1/1 通过。证据见 evidence/d01-presets.md。该测试仅文件发现与创作，不是可运行专家或安全隔离证据。下一步验证原生服务/Session 挂载及技能可见性，D01 仍进行中。本轮未修改预览服务、未执行模型或浏览器测试。

### P0-03 投影与切换入口边界

补充公开预设投影测试，验证选择后的组合优先于创建头，重放结果一致；集成测试 3/3 通过、冻结安装通过。P0-03 表格状态修正为 in_progress。明确 recompose 不执行空会话检查，业务入口必须使用受保护的选择接口。详见 evidence/d01-presets.md。真实 Host 挂载、技能发现及重启恢复仍未完成；下一步保持这些验证，不进入 D02。产品构建、浏览器和模型测试本轮未执行。

### P0-03 官方 Skill 运行探针

新增 `probe:presets`：隔离官方 Web Host 中复制 Cordis/Minimal 两个预设，真实 Chromium 创建空白 Session 并通过官方 `agentPresets/select` 往返切换。`skills/list` 实测为 Cordis 组合 15 项（含两项随包技能）、Minimal 组合 0 项、切回后恢复 15 项；`/` 菜单同步更新。非空 Session 切换被官方 Host 以 `agent-preset/locked` 拒绝；同一 DSH_HOME 重启后，原 Session 的 Cordis 技能目录恢复为 15 项。ARCHITECTURE 固定官方 Skill 子系统为唯一技能执行底座。证据见 evidence/d01-presets.md；P0-03 仍为 in_progress，下一步验证预设修改/删除、技能正文加载及两会话隔离。探针显式移除模型密钥，`MISSING_CREDENTIAL` 仅用于形成非空记录，未执行模型、外部连接器或业务数据库测试。

### P0-03 preset 修订与删除边界

真实重启探针确认：相同 preset ID 的组装文件改写后，历史 Session 会采用新组合；删除目录后，官方 `skills/list` 对历史 Session 成功返回空数组，没有明确缺失失败。新增 ADR-0010，规定已发布组合使用不可变 preset 修订 ID、引用存续期间不得物理删除、恢复前校验摘要和健康状态。官方 Skill 仍是唯一执行底座，WorkDSH 只补业务修订与保留策略。下一步验证两会话状态隔离和技能正文按需加载；P0-03 保持 in_progress。

### DOC-06 Harness 官方文档审查

用户提供 `docs/deepseek-harness-docs` 完整镜像后，将全量能力审查加入 D01 前置。机器盘点为 375 个文件、249 个 Markdown；按中文对侧优先及 5 个无中文对侧英文文档，共 127 份规范审查对象。新增审查计划、逐文件台账与 `audit:harness-docs`，当前 H01 进行中，4/127 已登记，禁止把目录扫描写成全量读完。首批结论确认 Cordis 插件树、Session/agent/能力事件分工、官方 Storage 候选和官方 Skill 执行底座；下一步依固定 H01—H09 审查并反查现有设计，未完成前不进入 D02。

H01 已完成，当前 8/127。补充约束：scope-local 能力不会自动传给 subagent，专家团必须显式重算组合与授权；人类命令不经过模型但也不自动成为持久事实；`agent/pre-step` 适配必须继续 waterfall；模块/事件关系不代表团队授权。H02 转为进行中。

H02 已完成，当前 25/127，H03 转为进行中。Cordis 约束已进入架构与交付门槛：配置顺序不表达依赖；必需服务用 inject；PENDING/FAILED 必须显式诊断；服务更换会重启消费方；所有外部资源归属 effect 并等待完全停稳；Loader 条目使用稳定 id；工具注册必须连同 systemPrompt、schema、结果持久化和注销验证。防御规则同时约束自动化运行区间、监听器异常隔离、子进程凭据环境和链接删除。下一步按 H03 审查 Web、Client modules、Slots、Conversation、Sidebar 与样式，确定原型到真实 WorkDSH Profile 的公开实现映射。

H03 已完成，当前 33/127，H04 转为进行中。正式形态固定为官方 Web Client 内的 WorkDSH Profile：品牌与业务导航通过公开 Slots 贡献，业务页面与原生 Conversation 往返，会话右栏用于资料/成果预览，官方 renderer 保持唯一 React root。功能组件按 Host → Remote → Client model → Slot props 取数，跨插件 UI 不导入运行时实现；可靠领域状态自行提供 baseline/cursor/query。UI-DESIGN 已加入正式页面映射和官方 theme/primitives 约束。下一步审查 Session、投影、持久化、附件、工作区与查询，校正项目、任务、资料库及数据库所有权。

H05 已完成，当前 59/127，H06 转为进行中。新增执行能力复用矩阵：官方 Skill 是唯一执行底座，但已发布正文必须投影为不可变修订；MCP 是连接器适配，不是连接器业务对象；Schedule/Webhook/Job/Workflow 是自动化底层候选，不拥有持久规则和运行历史；Web 私网阻断不等于敏感数据外发策略。工具单调 guard 必须覆盖 native/PTC/MCP 子调用，调用策略与工具可见性都不能替代业务授权。下一步审查 Settings、Credentials、Approval、Permission、Sandbox、Storage 与配置目录。

本轮校验：`test:integration` 3/3、`check:plan`、`audit:harness-docs`、`git diff --check` 与脚本语法检查通过。仅文档和计划校验清单发生变化；bundle build/typecheck、浏览器、真实模型、外部连接器及业务数据库测试未执行。

H06 第一批完成，当前 65/127。已审 Settings、Credentials、Approval、Permission Presets、Sandbox 与 API Gateway，并新增治理能力复用矩阵。设计已明确：Settings 只保存运行偏好；秘密由 Credentials 按操作解析；业务 access、连接授权、单次 Approval 和 runtime/sandbox 分层失败关闭；Permission Preset 不等于 RBAC；Sandbox 不约束网络且 partial 不满足团队强隔离；Typert Remote 只承载严格生成的一元方法，流与分页使用专用协议。ARCHITECTURE、ADMIN-DESIGN、TEAM-DESIGN、DEPLOYMENT-AND-STORAGE、CONTRACTS 和 PLAN 已同步。

下一步继续 H06 配置目录与 Loader/Profile 文档，核对配置文件、Settings、插件启停、重组和管理端入口的边界。当前只完成文档审查，治理服务和业务数据库仍未实现；本轮未执行产品构建、浏览器、真实模型、外部连接器或业务数据库测试。

H06 已完成，当前 66/127，H07 转为进行中。配置目录完整反查确认四类制品边界：有配置可加载、无配置可加载、seam 不可直接加载、纯库无插件入口；插件管理端不能以 npm 包存在推断可启停。正式 Profile 保留 user preset 等同 shell 的信任标记、sandbox 默认只读、Domain backend 路由、Settings/Credentials 分离，并禁止普通管理入口开放 literal secret 或绕过式 subagent permission mode。

H07 下一批先读 Agent lifecycle、Agent team、Subagent、scope 与模型/压缩专题。治理能力仍需 P0-04 锁定发布包探针；本轮未实现治理服务、业务数据库或正式 UI，也未执行浏览器、真实模型与外部连接器测试。

H07 第一批完成，当前 74/127。新增 Agent 与专家编排矩阵，固定 ExpertRevision、preset 和 Session 三层对象；子代理 flat scope 不继承父能力与权限；一次性/可继续子代理有不同结果、取消和停稳语义；实验性 Agent Team 只承载根 Session 内成员、mailbox 和 task DAG，不是组织、专家团或项目待办。精确模型能力由 adapter 解析，系统提示词与动态上下文走官方组装和 surface，Compaction 不删除业务资料，TokenMeter 不作为组织账单。ARCHITECTURE、CONTRACTS、TEAM-DESIGN 与 PLAN 已同步。

H07 已完成，当前 80/127，H08 转为进行中。第二批补读 Core/preset、LLM wire 扩展、适配器开发、扩展模式和 Python SDK；确认 `composeFrom` 是显式同代组合绑定而非权限继承，`followup` 回执不等于结果，preset `recompose` 不能绕过空会话保护。团队 Profile 默认关闭会外发完整会话后缀的 `dsh_session_log`；Python `sdk-minimal` 不作为 WorkDSH Web 或团队隔离方案。P0-03 的固定探针扩展为十步。

H08 Cookbook 第一批完成，当前 88/127。新增扩展交付清单，区分可用于外部插件的 Remote、Settings、Tool、Host/Client 配对规则与只适用于 Harness 上游仓库的 package/session-format/vendoring 流程。单插件门槛已补入稳定领域错误码、生成 Client、settings revision、规范工具结果、PTC 同链 guard、Client toolview 回退和公共 UI 组件边界。

下一批审查 User、Testing 与 Postmortem。上述均为文档契约结论，仍需 P0-03/P0-04 在锁定发布包上验证；本轮未实现正式业务插件或数据库，也未执行真实模型、浏览器和外部连接器测试。

### DOC-06 H08 用户指南与事故回归

已完成 User 13 份、Testing 1 份和 Postmortem 5 份，累计 107/127。扩展交付清单新增 bundle/Profile 分工、整行 config 覆盖、模型端点修订、动态 Cordis 实验隔离、代理和 Webhook 边界；开发计划新增真实 Loader、独立成果断言、确切 origin 验收及结构化错误保留。事故 0002 的历史 disabled 行为与现行 primer 存在时间差异，列入 rc.1 探针，不认定当前版本仍有该缺陷。

下一步：development/i18n 共 6 份及剩余 14 个子系统反查。当前仍为 D01，正式业务插件、数据库和完整工作台未开始。此轮仅文档与审查台账变更，产品构建、浏览器、真实模型和外部连接器测试未执行。

验证：`audit:harness-docs` 为 107/127、20 待审；`check:plan` 通过（25 模块、33 文档），检查脚本语法与 `git diff --check` 通过。仓库当前文件未跟踪，diff 检查不能代替新增文件审阅；本轮文档链接由计划检查器覆盖。pnpm 仍提示 package.json 的 overrides 被忽略，本轮未更改依赖配置。
