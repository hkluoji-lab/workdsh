# P1-03：任务技能浏览复用记录

## 2026-09-11：Skill 0.1 候选闭环

skills alpha.22 / bundle alpha.34 增加真实批量管理和卸载依赖影响。其他领域模块通过 `registerDependencyInspector` 向全局 Host 管理器声明依赖；卸载确认展示依赖对象，操作携带影响 revision，Host 在技能锁内重新检查并拒绝已变化或仍有强依赖的请求。批量操作逐项返回结果，失败项继续保持选择，刷新不会抹掉错误。浏览器验收还发现并修复了卡片菜单被相邻卡片遮挡，以及安装详情关闭后导入遮罩仍拦截页面的问题。

创建继续进入 Harness 原生 Conversation，`skill-creator` 只调用官方 `ctx.tools.register(defineTool(...))` 注册的草稿、校验和确认发布工具。页面不复制 `/`、`@`、附件、权限、模型或发送控件。组合验收覆盖受管导入完整 `SKILL.md` 与资源、Host 销毁、冷进程重新发现以及官方 Skill 工具调用。Node 22.23.2 下 typecheck、build 与 18/18 集成测试通过；真实打包浏览器完成全局目录、详情、编辑、资源、导入、原生创建交接、依赖确认、菜单可点击、重连、移除与重装。人工 1920 宽度复核显示 16 个真实技能、5 个禁用规划分类、批量模式 15 个可管理选择项且没有混入单项开关。

官方文档：../deepseek-harness-docs/subsystems/skills.zh.md。版本 rc.1；公开 dsh-api-remotes/client 的 remote.session.list、remote.skills.list 与 dsh-api-session-controller/client 的 sessions.open。现有 Remote 与 Session 技能消费证据见 d01-client.md、d01-presets.md。

WorkDSH 增加独立 skills Client 插件的全局目录展示、搜索、说明、复制 /name 和新增技能入口；实际 Session 与技能列表仍归官方。无全局技能缓存，无自有解析器、传输或执行器。rc.1 的公开 Remote 需要 Session，当前页面对已有 Session 目录做去重投影，不能冒充完整的组织安装台账。

首片验收：真实 Host 数据加载、空目录/错误/搜索无结果、任务切换及返回、键盘详情、1440/1920/390 布局。导入、正文资源浏览、不可变业务修订和团队权限尚未实现，不显示成功占位。

## 实现与结果

实现路径 packages/plugins/skills/src/client.tsx；导出 applySkillsClient，由 bundle 显式组合。业务只读查询通过公开 Remote，创建/打开任务通过官方 Client sessions。使用 esbuild 编译自有模块为单一客户端制品，React 外置；不是新增运行时加载器。

真实 Chromium 在隔离 DSH_HOME 与 DSH_AGENTS_HOME 下创建任务并发现测试 SKILL.md，验证搜索、详情、Escape、返回任务；1440/1920/390 截图位于 .artifacts/client-probe-skills-*.png。390 原生侧栏默认占位，使用公开 toggleSidebar 折叠后检查内容无横溢。首轮并行读取效应有竞争，已合并为单一顺序读取且丢弃卸载/切换后的过期结果；额外声明 remote.session 启动依赖。错误状态不显示旧目录。

build/typecheck/check:versions/check:plan、集成 8/8 通过。浏览器卸载/重装和官方连接重连既有回归通过。页面数据为真实目录摘要，未发送模型请求，未验证命令执行质量、正文文件读取、导入或多人授权。首个目录页面不是整个 P1-03 完成。

## 原型对齐修正（2026-09-10）

用户反馈正式页面偏离原型。本轮复用公开 dsh-client-ui-theme/client 的 register/setTheme 与官方 sidebar.panellist；注册 WorkDSH 中性深色主题，不通过全局 CSS 隐藏或改写原生 DOM。恢复能力分类工具栏，任务范围折叠到次级区域，保留真实目录。分类未实现时显式禁用。验收关注同视口截图与现有查询/详情交互。

alpha.4 结果：build/typecheck/check:plan 与完整 probe:browser 通过；真实预览 18989 已升级并重启，目录加载后截图 `.artifacts/skills-preview-aligned.png`。正常地址没有诊断导航；任务范围默认折叠。尚未完成整套原型导航与公共组件迁移，不能视为 UI 完整验收。

## 2026-09-10：全局技能库纠偏

skills alpha.3 / bundle alpha.9 移除技能页的任务选择、新建任务和任务跳转。页面按 WorkBuddy 参考图改为全局库结构，包含搜索、已安装计数、添加入口、已安装/SkillHub/套件和分类；未接入的写操作保持禁用。全新 Profile 无任务时可直接打开技能库并显示诚实空状态，不创建隐藏 Session。

官方依据：`ctx.skills.list()` 在省略 scope 时读取全局层；`ctx.remote.skills.list({ sessionId })` 是 Session 最终组合视图。当前 rc.1 外部包 Remote 生成仍未过门槛，因此 Client 暂时汇总已有 Session 的官方只读目录，不能当作完整安装事实。浏览器验收覆盖无任务页面、无任务选择控件、响应式、重连、卸载与重装；Node 22.23.2 下通过。

## 2026-09-11：添加技能菜单与原生任务交接

skills alpha.8 / bundle alpha.20 按 WorkBuddy 参考补齐“查找技能、上传技能、创建技能”菜单。查找只过滤当前真实已安装目录；上传和创建使用官方 Session Controller 创建任务，进入官方 Conversation，并通过 `conversation.input.overlay` 的公开 `InputActions.setDraft` 交接一次性草稿。创建草稿为 `/skill-creator 请帮我创建一个可以实现「……」的 skill`；上传草稿引导用户使用原生附件按钮。未复制 `/`、`@`、附件、权限、模型、preset、发送或取消。

随包 `skill-creator` 通过 `ctx.skills.register()` 注册，增加导入结构、安全路径和不执行脚本的约束；产物仍写入官方文件技能目录，由官方 provider/watcher 发现。官方依据为 Skills、Conversation 与 Slots 文档及 rc.1 公开类型。

验证：Node 22.23.2 下 `check:plan`、planning 2/2、463 项版本锁定、typecheck、build 和完整 `probe:browser` 通过。隔离浏览器覆盖三项菜单、查找焦点、创建默认草稿、真实目录、重连、停服卸载与重装；真实 18989 预览另检查创建及上传草稿、原生附件、权限、模型和发送控件。未发送模型请求，也未把上传附件写入磁盘，因此完整导入成功、冲突、权限拒绝和重启后发现仍是后续 D03 验收项。

## 2026-09-11：筛选语义修正

skills alpha.9 / bundle alpha.21 移除当前官方目录未提供元数据的五个业务分类，并把无筛选作用的“我安装的”按钮改为静态已安装数量状态。当前页面数据范围本身就是已安装技能，搜索与添加技能仍为真实动作；分类等到领域契约提供可验证字段后再出现。

验证：完整 Chromium 回归覆盖分类缺席、静态数量状态、搜索、添加菜单、真实目录、重连、停服卸载与重装。18989 人工预览读取当前用户 Agents home，显示 15 个技能，其中包含用户新建的 `file-count-by-category`；页面没有上述五个分类及“我安装的”按钮。

## 2026-09-11：Host 归属与共享范围修正

skills alpha.10 / bundle alpha.22 将 `skill-creator` 注册实现迁入技能插件根入口，组合包通过构建装配，不再拥有技能领域正文。面向所有任务的默认目标改为官方共享 Agents root；Profile 私有与工作区范围需明确选择。同名目标必须读取并确认，禁止覆盖无关技能。公共技能及分类保留在产品设计中，等待真实目录契约后再进入运行页面。

验证：技能 Host 注册与 disposer、官方 cold restart 持久化、允许/禁止模型调用策略 4/4 通过；typecheck、build、规划和版本检查通过。打包后的 Host 制品不保留私有 workspace 运行时依赖，完整 Chromium 安装、真实目录、重连、卸载和重装回归通过。

## 2026-09-11：已安装列表与技能详情

skills alpha.11 / bundle alpha.23 参考 WorkBuddy 的列表和详情层级，将真实目录命名为“我安装的”，卡片进入独立详情，并通过“去试试”把 `/name` 草稿交给 Harness 原生 Conversation。详情只显示当前官方 Remote 的摘要与调用策略；正文、路径、编辑、启停和卸载等待 Host 管理契约，不用假数据或无动作按钮补齐截图。真实 Chromium 覆盖列表、详情、返回、试用草稿、创建草稿、重连、卸载与重装；技能相关集成测试 4/4 通过。

alpha.12 / bundle alpha.24 在人工窄屏检查中修正详情继承列表滚动位置的问题；进入详情时内容容器回到顶部，标题、摘要与“去试试”不会因原卡片位置而被遮住。

alpha.13 / bundle alpha.25 将技能页面从嵌套 `React.createElement` 调用改写为 TSX。运行契约保持不变：仍使用公开 `main` 与 `conversation.input.overlay` Slot，组件只接收 Slot 注入的 props，不持有 Cordis Context。此项改善页面结构可读性和后续详情管理开发的可维护性，不新增另一套前端运行时。

验证：Node 22.23.2 下 typecheck、build、check:plan、463 项版本锁定、技能集成测试 4/4 及完整 Chromium probe 通过。真实预览读取 15 项共享技能，进入 `skill-creator` 详情后可查看摘要、适用场景、调用命令和策略并返回列表。此轮是源代码结构重构，没有扩张现有管理能力范围。

## 2026-09-11：公共弹框与本地管理服务

skills alpha.14 / ui alpha.3 将详情改为共用 Modal，并按 WorkBuddy 参考加入紧凑卡片、启停入口与编辑/打开目录/卸载菜单。`packages/ui` 的复杂组件统一使用 TSX；Modal 提供遮罩、Escape、焦点约束和焦点返回，领域插件只装配内容。

Host `SkillManager` 直接复用官方全局 `ctx.skills.list/get`，不解析或执行模型侧技能。它为本地官方技能目录补充完整文档与资源清单、基于内容摘要的预期修订写入、移动到隔离目录的启停，以及移动到恢复目录的卸载。上述写操作不改技能正文中的启停字段，路径只允许落在当前 Profile 或共享 Agents 的官方技能根。严格 Client Remote 尚受 rc.1 已记录生成兼容问题约束；在该接口可发布前，页面管理动作进入原生 `/skill-creator` 任务，不显示虚假完成状态。公共目录、版本和组织发布仍为后续契约。

skills alpha.15 / bundle alpha.27 继续补齐 Host 导入闭环。服务接受目录或单个 `SKILL.md`，拒绝缺少正文、无效名称、符号链接、过深目录及超限文件集合；安装只进入官方共享 Agents 或明确选择的 Profile root。复制先进入同一根内的临时目录，复核后原子改名，任何失败都清理临时产物。集成测试覆盖资源保留、重复目标冲突和符号链接拒绝。浏览器端仍通过原生附件与 `/skill-creator` 交接，尚未宣称 Client 直装完成。

skills alpha.16 / bundle alpha.28 将 Client 的官方 Slot 装配、页面组件、原生会话草稿交接和样式拆成独立模块。入口仍只向组件注入 `listSkills`、任务交接和侧栏切换动作；组件不接收 Cordis Context。此项只修正源码边界和可维护性，运行数据与能力声明没有扩大。

## 2026-09-11：直接技能管理闭环

skills alpha.17 / bundle alpha.29 删除编辑、打开目录、启停和卸载对 `/skill-creator` 管理任务的占位交接。Client 通过 Harness Connection 的鉴权 exact Fetch route 调用 Host `SkillManager`：列表覆盖已启用、已停用与只读来源；详情读取完整 `SKILL.md` 和资源清单；编辑携带 SHA-256 revision 并原子替换；停用移至隔离目录；卸载移至带时间戳的回收目录。打开目录继续调用官方 `session.openWorkspacePath`，没有引入 shell 命令或浏览器文件 API。

Exact Fetch route 是 rc.1/rc.2 外部包 Remote 生成失败期间的兼容适配。Host 使用公开 `connection.fetch.register` 注册 `/api/workdsh-skills`，继承官方浏览器认证与 Host/Origin 校验；Client 使用同源 `fetch`。Host 对 endpoint、名称、布尔状态、正文类型、请求体和 1 MiB 文档上限做运行时验证；错误不暴露堆栈或任意路径。技能插件不直接注入 `webServer`。生成器兼容外部包后迁移到生成 Remote。

真实 Chromium 验收使用隔离的共享 Agents root 创建 `workdsh-browser-fixture`，验证全局列表发现、完整正文读取、编辑后原子保存并重新读取新正文、停用、重新启用、试用草稿、确认卸载及列表移除；随后完成 bundle 停服移除、Host 重启、Client 模块缺席和重新安装。集成测试 11/11、build、typecheck、规划与版本锁定检查通过。打开目录的产品动作直接调用官方 `session.openWorkspacePath({ action: 'reveal' })`；自动化未主动弹出系统 Finder。

skills alpha.18 / bundle alpha.30 增加三层持久状态：跨进程技能锁、停用来源凭据和卸载回收凭据，全部位于共享 Agents home 的 WorkDSH 私有状态目录，不写入 `SKILL.md`。12/12 集成测试覆盖同 revision 并发写只允许一个成功、资源文件 revision、新资源、停用后原位恢复、卸载列表及恢复。官方 filesystem watcher 测试验证停用后运行目录撤销技能、重新启用后再次发现同一正文。完整 Chromium 验收覆盖新建资源、卸载、最近卸载列表、恢复、再次清理、插件移除后的 Host/Client 缺席与重新安装。

## 2026-09-11：浏览器导入闭环

skills alpha.20 / bundle alpha.32 在原导入契约上补齐安装一致性。技能名称被视为全局地址：确认安装在跨进程名称锁内检查所有官方技能根、扁平与目录形式及其他已注册 provider，任何同名候选都停止安装。Host 为暂存树记录按相对路径排序的完整内容指纹，确认时再次计算；复制到目标根后还会再次比对，名称或任意文件字节变化均不会发布。集成回归覆盖跨根扁平冲突、同长度篡改、并发确认单胜者和 Host 重启后继续确认。

skills alpha.19 / bundle alpha.31 以 WorkBuddy 的导入弹框为交互参考，但传输和安装遵守 Harness 公开边界。官方 `ctx.fileUploads` 的 staged receipt 属于 Agent 与提示词，不用于全局技能管理；上传改用 `dsh-client-connection` 的 exact Fetch route，并声明 `requestBody: 'streaming'`。该路由继续经过 Connection 的 Host/Origin 栅栏和浏览器认证，业务插件没有直接接入 `webServer`。

Client 支持 `.zip`、单个 `.md` 与文件夹选择，Host 预检通过后返回不含本地路径的 opaque receipt、名称、说明、文件清单和体积。用户明确选择共享 Agents 或当前 Profile 并确认后才调用原子安装；同名目标停止安装且保留暂存，取消、成功或过期会清理。ZIP 解包拒绝越界路径，限制 50 MiB、400 个文件和 6 层资源目录，导入期间不执行脚本。分类设计位恢复为禁用按钮，等待公共目录契约提供真实分类数据。

单元/集成覆盖 staged Markdown 的“预检不安装—确认安装—凭据失效”、无效扩展名、认证路由元数据和 Host 路径不回传；总计 13/13。Chromium probe 增加真实文件选择、预检信息、确认安装、详情打开与列表重新发现。
