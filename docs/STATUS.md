## 2026-09-13 中英文产品网站上线

按用户要求提供 WorkDSH 中英文产品展示网站，英文默认入口 https://techflag.github.io/workdsh/ ，中文入口 zh-CN.html。页面包含真实开发截图、PPT/技能/文档切换、架构与快速开始入口、开发预览边界及开源致谢。网站通过 GitHub Pages 官方 Actions 自动部署，首轮部署运行 34711881370 成功，双语更新运行 34712076797 成功。线上中文页面 lang=zh-CN、无控制台错误、手机无横向溢出。中英文页面经 Playwright 检查，截图切换正常、390px 手机布局无横向溢出。此网站为静态产品展示，不包含应用运行服务。

## 当前：技能弹框与市场卡片对齐 WorkBuddy（2026-09-13）

## 2026-09-13：英文产品网站与 GitHub Pages

- 用户授权参考 Hermes Studio 制作英文产品网站并托管 GitHub。新增独立 `website/` 静态目录及官方 Pages Actions，不运行模型或暴露工作区。
- 包含当前产品定位、PPT/技能/文档交互截图、独立插件说明、真实预览边界和开源致谢；不复制参考站代码和品牌。
- 桌面/390px 手机布局、截图加载、tab 切换、无控制台错误/横向溢出已验证。GitHub Pages 首轮部署成功，双语更新及线上验证见顶部记录。


## 2026-09-13：README 截图与 GitHub 源码预览发布

- 已推送源码 `0b042c5` 与 `office-v0.1.0-alpha.3` tag，并确认 GitHub prerelease 发布（无实验安装包附件）。用户授权推送与发布；中英文 README 增加最新 PPT 应用截图，开源组件、用途、许可和 WorkBuddy/CodeBuddy 致谢。
- 更新依赖后全量测试发现 ProseMirror model 双版本，统一为 1.25.11；全量类型检查、71 项集成测试、Office 构建和 PPT 浏览器回归已通过。
- Office alpha.3 本次为源码 GitHub prerelease，完整实验构建的第三方许可正文仍待核验，不上传未清理的实验安装包；npm 发布未执行。真实模型 PPT 视觉质量及新最终文件卡端到端未执行。
- 宣传文案已准备，Twitter 发送未执行。后续继续当前唯一 PPT 编辑器的品质验收和许可核验。


## 2026-09-13：PPT 最终产物与腾讯设计流程适配

- `content_export` 扩展原生 PPTX 分支，复用官方 bash/present 策略链路，直接交付已保存字节，保留组织授权、修订检查、稳定文件名、冲突拒绝与重试。
- 完整查阅本机 tencent-pptx 主技能及制作、叙事、设计规则，补每页观点、视觉节奏和具体日报版式指导；不重引入腾讯引擎或中间文件构建流程。
- Office 构建、类型检查已通过；新增文件交付字节/回执、同修订重试、修订冲突、文件覆盖冲突测试。官方真实会话产物卡端到端和模型美观度验证未执行，预览更新需服务重启生效。


## 2026-09-13：PPT 集成 UI 样式回归修复

- Word 容器的通用 button/select 样式原先穿透原生 PPT 子树，造成按钮边框和密度变化；现在明确排除 `.workdsh-ppt-editor` 后代。
- 固定版本构建适配移除重复原生 TitleBar，保留自定义中文文件标题与工具栏；补备注及状态语言文本。
- Office 构建、类型检查、浏览器回归通过；探针加入真实 Word 祖先样式，验证工具栏按钮无边框、无重复 AutoSave、原生图表数据修改保存及卸载。查看修复后截图确认紧凑灰黑工具栏和侧栏；剩余少量原生英文标签待后续处理。正式应用截图及真实模型视觉验收未执行。


## 2026-09-13：README 当前预览与来源致谢

- 中英文 README 新增用户提供的技能市场应用截图、当前原生 PPT 开发集成范围、主要开源依赖用途/许可及 WorkBuddy/CodeBuddy 体验和技能设计参考致谢。品牌、第三方技能及费用插件与随包依赖明确区分。
- Office 第三方声明移除已删除的旧 PPT 适配器描述，补当前 Apache-2.0 pptx-viewer 与本地化/图标来源。
- 核对本地包元数据与图片路径；未执行构建、产品测试或发布（仅文档和截图更新）。下一步仍为原生 PPT 实际模型流程与视觉验收。


## 2026-09-13：原生 PPT 生成路径与设计指导补强

- 截图对应 preview 会话包含现有原生 PPT 指导和通用 PPT 文件生成技能目录，仍执行了 `build_deck_v4.py`。这说明模型延续了文件生成流程，不能据此判断旧 CreatPPT 在运行；未证明模型实际读取了 `pptx-generator` 技能正文。
- Office 提示词明确普通制作、重新生成、压缩页数和美化请求默认使用原生 `content_*`，不执行其他 PPT 引擎或文件生成技能的构建命令。既有独立 PPTX 预览与 live working copy 的边界保持明确。
- 查阅本机 WorkBuddy 的 `ppt-implement`（网页演示模板流程）和 `tencent-pptx`（依赖腾讯 slidep 工具）。只借鉴叙事、字号层级、配色、视觉焦点和布局对齐建议；未安装其运行时或重新引入另一套 PPT 引擎。
- 已通过 Office 类型检查、构建及 8 项内容服务集成测试。实际模型在新指导下生成的美观度及流程遵循尚未验证；不能将提示词改进等同于视觉验收。


技能目录预览/详情弹框继续复用 workdsh-ui 公共 Modal（未改公共默认宽度与无障碍行为），仅经插件级高特异性类名收窄：预览 720px、详情 820px、确认 480px；图标 64px（原 112）、标题 24px（原 32）、关闭按钮 40px 与标题行垂直居中（实测中心 206.73=206.73），小节改名「基本信息」并修复「概述」缺失图标；修复预览弹框「＋ 安装」按钮被卡片圆形样式挤压致文字换行。市场卡片高度 190→152→131px（内容自然高度：内距 14px、描述上边距 6px、无底部空余），对齐 SkillHub 更扁的列表观感；分类标签栏隐藏滚动条（保留横向滚动）。探针弹框回归断言（宽度≤760、图标 64、标题 24px）不变，`probe:skills` 7/7；18989 实测卡片 131px、预览 720px/详情 820px、可安装 33 全图标、pageerror 0。截图 `.artifacts/skills-market-top.png`、`.artifacts/skills-market-preview.png`、`.artifacts/skills-market-detail.png`。注意：preview 的 office 存储中一条旧 schema 文档（用户 PPT 工作遗留）与新版 office 构建不兼容阻塞启动，已备份迁至 `.artifacts/office-documents-quarantine/`（可还原）。

## 当前：技能市场对标 WorkBuddy 完成（2026-09-13）

skills 0.1.0-alpha.26 把技能页升级为与 WorkBuddy 相同体验的一体式技能市场：14 个真实分类标签、「可安装 34」与「已安装 160」分区、卡片品牌图标＋中文名＋中文描述、未安装项「＋」直接安装（复用官方 installImport 名称锁与原子发布，不新增第二套安装路径）。目录为 WorkDSH 自有 `~/.agents/.workdsh-catalog`（170 条/13 分类/76 图标），缺失或损坏时返回 missing/invalid 诊断不造假，超限条目保留展示并禁用安装。验证：技能相关集成 20/20、`probe:skills` 7/7、skills/experts typecheck 通过、18989 活预览实测 pageerror 0（图标路由 200 image/svg+xml）。`check:plan` 失败为未跟踪的 packages/pptist-adapter 未注册，属 PPT 工作遗留，与本次无关。见 [evidence/skills-browser.md](evidence/skills-browser.md)。

PPT体验页恢复单一完整原生编辑器：原生右侧数据配置与画布同屏，撤掉进入返回流程；600px侧栏流布局和修改数据保存重开通过。中文工具栏完整整理仍待完成。

窄屏图表配置修复通过：600px实际点击入口、原生Inspector展开、修改数值与返回保存重开均通过；标题栏避免窄屏面板遮罩拦截。

图表配置试验入口通过：选中图表进入完整原生编辑器，修改后返回并保留内容；数据8/3保存重开通过。原生面板汉化、顶部遮挡及窄屏待完善。

<!-- PPT trial update: 2026-09-13 -->
中文分组工具栏新增切换、动画：原生 transition/animation callbacks；600px 视觉检查通过；probe-effects 验证应用全部、保存重开、画布选中后移除动画。美化、放映及图片选择仍待组合界面挂载。

## 当前：折线图插入按钮窄窗口可用（2026-09-13）

experience.html加入常驻图表类型与插入入口，复用原生onAddChart；600px折线图插入、保存独立回读、重新打开通过，pageerror0，缩略图同步显示。原下拉只选类型而插入按钮在右侧被挤出视口是本次根因。原生默认插入位置可与现有元素重叠，用户可移动。探针probe-insert-line.mjs，仍为隔离体验。

## 当前：完整原生图表面板修改保存重开通过（2026-09-13）

1400px full-desktop.html人工图表数值7→8、导出独立回读和完整组件重开通过，pageerror0；中文覆盖630/3620。背景与页面设置、放映、窄屏展开面板仍待验，当前experience.html保持组合布局并同步汉化。未接正式产品或发布。

## 当前：第7页缩略图与编辑后同步修复（2026-09-13）

experience.html由静态六图改为按页面ID实时生成预览，新增/修改/调换/删除后同步，生成中显示16:9占位。文字更新、新增第7页、快速调换删除、图片加载和pageerror0通过，视觉复核无破图。探针scripts/pptx-trial/probe-thumbnail-sync.mjs，原体验页刷新可看。全面汉化和完整面板仍继续验收，正式产品未替换。

## 当前：对标完整编辑体验，验证完整原生桌面承载（2026-09-13）

恢复完整PowerPointViewer隔离试验，构建内第三方移动判定桌面适配，700px六页/pageerror0及画布正常；1400px图表属性面板可显示。19093/full-desktop.html仅新隔离对照，展开两侧面板、全汉化、保存编辑与放映尚待验，原experience.html保留。该补丁不是公开SDK配置，正式采用需版本约束与完整回归。Word暂停，不替换18989。

## 当前：对照参考图补常用汉化和文件名（2026-09-13）

PPT体验样板中文词典覆盖507/3620，补设计菜单提示与文件名标题、缩小缩略图标题；隔离构建补6类硬编码英文标签，vendor源文件未改。可见标签浏览器检查及pageerror0通过。组合模式主题编辑及完整属性面板仍缺失，未宣称完整编辑能力，不接正式产品。体验19093/experience.html刷新可看，证据见office-pptx-react-trial。

## 当前：PPT样板补缩略图、缩放与常用汉化（2026-09-13）

复用公开SVG导出生成六张样板缩略图；600px加载、切页、公开缩放/适应窗口通过，pageerror0。中文覆盖372/3620，画布靠上显示。体验URL19093/experience.html不变。缩略图编辑后同步、全面汉化及完整属性弹窗尚未接，仍为隔离体验，不替换18989。

## 当前：600px PPT体验页改为桌面组合布局（2026-09-13）

使用公开Toolbar/SlideCanvas/useViewerBuildingBlocks，保留桌面顶部功能区和左侧页列表；600px六页加载/第三页焦点/画布元素/pageerror0通过。体验19093/experience.html刷新可看，不修改window断点或第三方内部实现。完整属性弹窗和编辑导出回归仍待验，仍为隔离布局原型，未接正式产品。

## 当前：中文PPT体验样板完成，窄侧栏未达标（2026-09-13）

19093/experience.html提供原生完整组件六页中文演示日报，含70%饼图；271/3620项翻译，六页/公开翻页/pageerror0通过。视觉复核宽窗口内容正常，800px窄窗口属性面板挤占画布和功能区截断，仍不满足桌面侧栏编辑要求。下一步验证公开组合组件布局与必要操作，不直接正式接线。详见[evidence/office-pptx-react-trial.md](evidence/office-pptx-react-trial.md)。原18989未替换，Word暂停。

## 当前：React PPT接入前两项边界试验通过（2026-09-13）

五类原生新建图表工作簿导出增强、原生面板修改后同步写回、重复补全及既有工作簿原字节保留通过；OpenXML验证0错误、LibreOffice打开通过。限定容器CSS挂载/卸载保持宿主按钮/边距/输入正常；图表数据面板文字对比度修正并视觉复核。脚本已保留到scripts/pptx-trial，见[evidence/office-pptx-react-trial.md](evidence/office-pptx-react-trial.md)。19093/scoped.html仅独立体验，默认原生下载尚未自动接补全；18989未替换、Word暂停、费用插件保留。下一步正式React Slot与同一Office服务/导出接线，实际AI逐页跟随、完整主题弹窗、PowerPoint/WPS及发布门禁仍待验。

## 当前：React PPT图表面板与导出边界验证（2026-09-13）

用户继续授权pptx-react-viewer候选。原生面板人工修改新建/导入饼图并保存回读通过；导入8图/8工作簿保留且chart缓存与xlsx数值同步；新建图表仍无工作簿。LibreOffice独立打开/导出5页和8页通过，不等于PowerPoint/WPS数据编辑签收。900px宿主外部输入及卸载后输入正常，但原样随包CSS全局重置body/button且卸载后保留，正式接入前必须解决。证据见[evidence/office-pptx-react-trial.md](evidence/office-pptx-react-trial.md)。本轮不替换18989、Word暂停、费用插件保留。下一步样式边界/新建工作簿可用路径→正式React Slot同服务接线；实际Harness联测/完整发布门禁未执行。

## 当前：iOfficeAI/OfficeCLI独立PPT验证（2026-09-13）

按用户指定测试既有officecli1.0.149，五类原生PPT图表创建、数据修改关闭重读、OpenXML验证、watch真实SSE刷新及五图视觉检查通过。导出无嵌入工作簿，Office/WPS数据编辑待验；watch goto不支持PPT元素且第五页修改不自动进入视口，不能视为实时焦点需求完成。19094原生预览供体验，原18989/19093不替换、不新增安装或模型配置。见[evidence/officecli-ppt-trial.md](evidence/officecli-ppt-trial.md)。下一步按用户选择明确文件操作工具/可视化编辑器职责；真实模型及Harness接入、全类型/图片表格、发布门禁未执行，Word暂停、费用插件保留。

## 当前：用户指定React PPT编辑器隔离测试（2026-09-13）

pptx-react-viewer3.16.5/core3.14.3独立测试通过：五种常见图表、多页原生React界面、人工文字编辑及翻页、公开API修改/焦点/撤销重做、PPTX保存重载、组件卸载，无pageerror；导出含5原生图表XML但没有嵌入工作簿，PowerPoint/WPS编辑数据未验证。19093本机试验供体验，不替换18989、Word暂停、费用插件保留。区分用户新发的两个同名OfficeCLI项目，仅核对文档和本机既有1.0.149帮助，不新增生成流程。证据见[evidence/office-pptx-react-trial.md](evidence/office-pptx-react-trial.md)。下一步核验图表手工数据编辑与工作簿导出后再确定接入；真实AI/Harness联测及产品全量门禁未执行。

## 当前：重新调查可嵌入React PPT编辑器（2026-09-13）

按用户要求暂停PPTist接入，调查项目官方文档与npm元数据，找到SlideWise（MIT，发布1.21.1、React19）及pptx-react-viewer（Apache-2.0，发布3.16.5、React18/19）；两者提供正式组件及内容/保存接口。ONLYOFFICE提供正式React集成及全面图表，但需Document Server，外部Automation API为Developer能力。见[候选比较](design/office/PPT-EDITOR-CANDIDATES.md)。建议先隔离验证SlideWise、第二候选pptx-react-viewer；具体图表/新建/UI/导出/焦点/卸载兼容尚未实测，不替换默认编辑器，不改18989。PPTist未完成候选代码保留，Word暂停、费用插件保留；产品全量门禁未执行。

## 当前：暂停PPTist实现，先核对官方接入契约（2026-09-13）

按用户要求只做技术核对，未继续接入代码或安装。核对本地官方Client Modules/Slots/Sidebar Right/Web Client/Resources说明及rc.1发布包公开声明：正式页面扩展为React Slot + Tab；没有找到Vue/iframe专用SDK，不能将浏览器隔离策略当作官方推荐。技术结论见[接入边界](design/office/PPTIST-INTEGRATION.md)，修正ADR-0027。下一步优先限定容器的Vue挂载兼容验证，验证后再确定承载。此前新增适配代码仍为未通过候选：隔离桥接未就绪，ProseMirror类型重复；正式接入/迁移/根全量门禁未执行。18989仍为旧候选加费用插件，19092独立演示；Word暂停。

## 当前：PPTist 直接挂载可行性验证（2026-09-13）

用户要求尽量复用原生能力。独立Vue挂载构建及浏览器探针通过：原生编辑器显示、组件卸载、无pageerror；确认全局CSS改变宿主body overflow，原生App的onbeforeunload卸载后未恢复。源码还存在body Teleport、document查询和全局拖动事件，原样直接挂载不能交付。见ADR-0027和scripts/probe-pptist-mount.mjs；只修改隔离试验，不替换18989。用户已确认商业授权后期付费，接入继续授权；下一步采用最少原生修改的文档隔离适配同一Office服务，或完成直接挂载全部边界改造。正式接入/旧数据转换/根完整门禁未执行。费用插件安装保留，Word暂停。

## 当前：安装第三方费用统计插件（2026-09-13）

按用户要求，暂缓PPTist接入，通过官方 npm 插件命令安装 `dsh-cost-meter`，解析版本1.7.21。实际命令为 `DSH_HOME="$PWD/.test-runtime/preview" node node_modules/@deepseek-ai/dsh/lib/bin.js plugin --profile preview add dsh-cost-meter`；当前18989属于preview，未改其他web Profile或默认产品bundle。已重启人工预览；日志确认Host加载账本，隔离浏览器确认Client资源加载、无pageerror。费用设置页及真实调用金额核对未执行；用户刷新18989后体验。PPTist接入尚未实现，用户已明确后期商业付费，继续保留单编辑器接入任务。

## 当前：PPTist 八类原生图表验证（2026-09-13）

用户要求常见PPT图表，暂停扩大CreatPPT，按ADR-0027验证单一PPTist底座。固定官方提交e4912589ffdbec389fcc1bf25a85852dfe3040a8/package2.0.0，AGPL-3.0，private应用无发布嵌入SDK。原生构建通过，4项浏览器验证通过：8类图表显示、饼图数据编辑、JSON文件保存重开、PPTX包含8个原生图表对象/8个嵌入工作簿。19092独立原生体验已打开，默认8页示例；仅替换公开mock数据，未改编辑器实现。见 evidence/office-pptist-u1.md。

18989仍使用原有候选，旧稿件保留，没有并行默认编辑器。下一步定义PPTist与现有Office服务/AI同一接口的受控接入，核对许可兼容和完整资源。原生AI按钮尚不是WorkDSH AI；完整字体资源、Office/WPS视觉验收、根完整门禁未执行。Word暂停及八类路线保留。

## 当前：PPT 逐页提交与明确制作页（2026-09-12）

按用户要求改为通用逐页制作契约：新建初始化一页；AI每次内容提交最多新增/更新一页，结构操作可以原子批量执行，原生人工整稿保存保持原有能力。快照持久化 focusSlideId，右侧优先展示该页，避免模板归一化错误选封面。CreatPPT statement 只渲染 title/body、agenda 渲染 bullets 的原生限制已进入能力描述。类型检查/构建、8项内容集成（含多页内容拒绝、结构批处理、冷重开焦点）、实际应用9项回归通过。真实模型自然语言“五页PPT”验收通过：约5.48秒建稿，7.64/8.73/9.86/12.04/13.12秒逐页提交，最终6次提交/5页，原日报保留，无脚本绕行，最终画布显示 focusSlideId 对应页。首次模型试验逐页成功但因列表版式说明不足查了本地实现，修正 API 描述后复测通过。

18989候选经官方CLI安装并重启，Host/Client编译字节核对一致；浏览器需刷新加载新版。连续快速提交时轮询可能合并中间帧，不承诺逐字动画。旧会话实际压缩7→5页、PPT文件卡、完整发布检查未执行；PPT未发布，Word暂停及八类路线保留。见 evidence/office-creatppt-u2.md。

## 当前：PPT 跟随实际变更页（2026-09-12）

用户反馈7页成稿但看不到制作变化。先前每次提交固定选最后页，改为对前后已提交DeckSpec比较，选择首个新增/内容变更页，删除/排序时选择受影响位置；初次打开仍从首页开始。仍以真实提交为刷新边界，不伪造逐字/逐页动画。类型检查/构建通过，实际应用9项回归通过（含中间页修改自动展示），18989候选已安装核对Host/Client字节并重启，浏览器需要刷新加载新Client。模型单批提交时不能声称有多个制作阶段；PPT原生文件卡仍未完成，八类范围与Word暂停不变。

## 当前：PPT 直接编辑与中文翻页修复（2026-09-12）

用户日志session.v32确认工作副本已保存多页，文件交付卡缺失因为PPT content_export未实现。中文原生按钮匹配错误导致就绪/翻页失败；全屏不能点击由于只读iframe被inert。按用户决定，PPT默认直接原生编辑，取消页面编辑模式及租约；人工保存仍经同一授权/审计/CAS服务，Word规则保留。页面有未保存输入时阻止AI修订重载，冲突保留缓冲。中文900px/展开1600px原生页面翻页/下载测试已通过；新版实际应用8项回归通过，18989修复候选已通过官方CLI安装、编译字节核对并重启；浏览器旧页需刷新加载新Client。PPT成品受控导出/官方文件卡仍是未完成项，不以浏览器下载替代。见evidence/office-creatppt-u2.md。

## 当前：PPT 原生应用闭环与真实模型验收（2026-09-12）

CreatPPT 0.1.4 已通过同一 Office ContentService/六工具/官方右侧 Tab 接入；采用发布包原生 Vue/SVG 页面与公开 DeckSpec API，不加载其 DSH 插件或另建存储/服务器。12项内容/原生页面集成、Office构建和类型检查通过；PPT实际Harness应用8项（自动打开、两批同步、人工保存、PPTX下载、刷新重开）及Word应用16项回归通过。详细证据见 [office-creatppt-u2](evidence/office-creatppt-u2.md)。

18989 人工预览已通过官方 CLI 安装并重启 alpha.3 本地候选，Host/Client编译字节核对一致；公开Word alpha.2未变，PPT未发布。真实模型新任务自然语言转换已通过：读取Word参考、保留原件、新建6页PPT、自动打开右侧；实际一次内容提交，无脚本/技能绕行。首个PPT约5.46秒、正文约9.81秒。加入全局pptx/elite-powerpoint-designer技能的隔离新任务复测也通过，无脚本/技能绕行；旧会话回放未执行。下一步根据实际工具选择与技能冲突证据收口；不写死“日报转PPT”或新增Agent loop。PPT文件导入、受控文件交付卡、原生浏览器包完整传递许可审查、PPT安装卸载重装全验收与Office/WPS视觉验证未执行；八类路线/D04/D15保留。

## 当前：CreatPPT 单编辑器接入（2026-09-12）

用户在 19091 体验后确认继续。采用 CreatPPT 0.1.4 发布包，停止自建 PPT 画布扩展；依据 [ADR-0026](adr/0026-creatppt-native-editor.md) 接既有 Office 服务与原生页面。独立页面不等于应用接入完成，PPT 菜单暂不启用。Word 与已发布 alpha.2 保持当前范围。

本轮薄适配器与原生保存/重开/PPTX 下载实测完成，10/10 内容回归和 Office 类型检查通过。无图默认封面原生阻止导出，纯文字生成改用原生 statement/planSlide；未关闭质量检查。证据 [office-creatppt-u1.md](evidence/office-creatppt-u1.md)。正式服务类型、六工具、右侧页面同步、真实模型与制品生命周期仍未执行；下一步从既有 ContentService 扩展 presentation 分支，不新建存储。

# 当前状态与任务台账

更新时间：2026-09-12。

## 当前：PPT方案校正与GenOffice源码复核（2026-09-12）

按用户质疑复核固定GenOffice提交de139a061537bea40f0cc81ef8f09a95f77ac52a：生产结构化页面由自研pptx-engine生成/保存，pptx-render负责布局和RenderTree，Konva/react-konva负责交互；不能把开发依赖PptxGenJS当对方完整生产方案。保留PPT-01新建导出探针，但不提前启用菜单。下一步在PPT-02接线前校正OOXML中心旋转语义和codec/画布边界，随后接原统一服务/工具/右栏。对方private源码包不是已核验发行SDK；本轮只静态审阅，未复制到产品，未决定源码分叉。具体见[复核记录](design/office/GENOFFICE-SLIDES-REVIEW.md)。本轮GenOffice构建/运行、导入往返、应用实时PPT和发布均未执行；Word和18989预览不变。

## 当前：PPT-01 原生适配器探针通过（2026-09-12）

Word后续开发暂停。新增独立presentation语义模型、原子幻灯片/文字/图片操作、MIT Konva10.5.0原生拖动与Transformer缩放、MIT PptxGenJS4.0.1可编辑PPTX导出。按用户要求核对Konva公开API，记录文字输入/绝对坐标/缩放/持久化/销毁边界；修正元素ID混入载荷、销毁期间图片decode中断、Konva原点与PPTX中心旋转偏移。源码alpha.3未发布，不启用PPT菜单，不改18989人工预览，不改变已发布alpha.2。

Office类型检查通过；4项PPT浏览器/模型/导出探针及7项既有内容服务回归合计11/11通过，git diff --check通过。实际画布截图已查看，仅是技术探针；样例PPTX XML核对可编辑中文文字、两页、尺寸和原图片字节。证据见[evidence/office-presentation-u1.md](evidence/office-presentation-u1.md)。全仓构建/检查、真实模型、应用右侧PPT、PPT插件制品安装/卸载/重装、Office/WPS视觉核验均未执行。下一步PPT-02扩展既有统一内容服务类型适配、六工具与右侧页面，并按官方示例接入DOM文字编辑；不复制第二套存储/授权/租约，不新增Agent执行框架。D04/D15不变。

## 最新范围：停止Word后续开发，下一阶段优先PPT（2026-09-12）

用户明确“不用再搞Word了”。保留并完成已授权的alpha.2发布，不继续实施Word列表/样式/图片/表格完善。上述后续项仅保留待办，下一阶段为PPT最小实时制作闭环，再依计划推进其他六类；直接复用开源组件原生能力，不重做工具栏/拖拽等交互。alpha.2已发布且6附件大小/摘要、源码标签及编译字节核对通过，收据见office-word-final-u3.md。

## 本轮：授权发布 Word alpha.2 与下一阶段计划（2026-09-12）

用户已明确授权推送版本。发布Word表格/图片预览，不将每次固定分批作为承诺：编辑器每次提交自动展示，模型可按任务单批或多批；最近自动化的多批/无文件绕行检查未通过，用户实际应用测试可用，保留该差异。构建/类型、69集成、16浏览器、6生命周期、规划检查通过，许可齐全。公开alpha.1保持不变；alpha.2只发布独立Word-only制品及匹配治理配套，不发布npm。GitHub发布验证完成后回填收据。

下一阶段依[开发计划](design/office/NEXT-STAGE.md)先完善Word导入列表/样式、图片定位、表格体验及写作验收语义，再实现PPT最小实时闭环，然后Excel/PDF/HTML/Markdown/画布/多维表格。仍是一个Office插件的类型适配器，不新增理解模块/子智能体/Agent loop。其他七类实时制作与完整Word分页仍待实现，D04/D15不变。

## 本轮：Word 候选收口（2026-09-12）

全仓构建/类型、69集成、check:plan及2规划测试通过；Word-only候选许可齐全，实际卸载重装6项及浏览器16项通过。修正README过时DOCX说明、候选安装路径和公开alpha.1/本地alpha.2边界。真实模型复测未通过多批/无文件绕行断言：任务idle、文档和导出存在，但仅修订1且调用bash/write，明确保留失败。用户催促，停止扩展和反复探针，更新人工preview候选供实际测试；公开发布不执行。详情[收口证据](evidence/office-word-final-u3.md)。完整Word/其他七类、Word/真实IME/完整分页仍未完成，下一步仅原生写作工具策略稳定性，不另做跨文档理解模块。主线D04/D15不变。

## 本轮：跨 Word 工作副本图片引用（2026-09-12）

用户最新范围澄清：文档理解/总结/改写交给模型，不继续扩大跨文档专项。本轮候选代码保留但未提交、未安装到人工预览；18989仍运行上一轮同文档引用版本。无需新增跨文档界面、智能体或理解引擎。

OFFICE-IMAGE-REF-02 扩展已有模型引用，增加源documentId，复用 ContentService 的来源读取与目标编辑检查、组织/工作区边界、哈希校验和原提交路径。跨文档复制保留源修订，目标保存独立图片字节，源删除不影响已复制内容；旧版同目标短引用兼容。工作副本以外文件资源/远程URL及其他七类实时制作仍待接入。源删除后的旧引用重试边界不变；未新增底座或资产真源。检查与制品/预览结果续记在 office-word-compatibility-u2.md；本次真实模型、WPS与全仓门槛未执行，未公开发布。

## 本轮：已存图片的模型引用（2026-09-12）

OFFICE-IMAGE-REF-01 在既有六工具/ContentService 内增加同目标文档图片短引用投影及授权解析，避免 AI 读取已存图时复制 Base64。页面和持久状态不变，未增加资源注册表、文件访问或上传底座。Office 类型检查、17项集成与 Word-only 构建打包通过；真实制品浏览器复测结果见 evidence/office-word-compatibility-u2.md。新资料图片/跨文档引用仍待接入；源删除后旧引用重试存在明确边界。全仓门槛和本次真实模型/WPS复测未执行，未提交/推送/发布。

## 本轮：Word 真实模型富文档与 WPS 验收（2026-09-12）

新增 OFFICE-WORD-03 真实模型图文表格场景，通过19项原生链路检查；模型首工具content_open，正文/表格/图片分批显示，图片数据原样保持，content_export产生官方卡片并可重开/下载/刷新，文件字节核对相等，任务idle且无bash/skill/write/edit绕行。首次长图片资料测试暴露模型重抄二进制并绕行shell，补插件既有写作引导明确参数/失败边界；最终紧凑PNG通过并不代表长二进制资料引用已解决。两个探针前置错误（缺少服务inject、原始预览隐藏导出按钮）已修复，未另建下载或Agent实现。详情见[发布前验收](evidence/office-word-compatibility-u2.md)。

WPS通过访达实际打开三份导出DOCX，无修复弹框；最终真实AI制品的一页正文、两列表格及完整居中PNG截图正常。测试文件关闭且无编辑保存。WPS有环境缺失字体提示，未安装系统字体。Office typecheck/build、16项Office集成、6项卸载重装、脚本语法及diff检查通过；全仓检查沿用上一轮，本轮未重跑。Microsoft Word、OS IME、复杂分页/页眉页脚/目录、390px/1920px完整应用未执行。最新alpha.2候选已更新preview并重启18989，其他插件和数据保留，未提交/推送/发布。下一步完善可授权图片资源引用，随后按Word预览版收口；完整Word与其他七类仍待开发，主线D04/D15不变。

## 本轮：Word 表格与图片候选接入（2026-09-12）

Office `0.1.0-alpha.2` 开发候选复用 MIT Tiptap 3.31.0 TableKit/Image：工具栏前部增加表格行列、标题行、合并拆分、原生列宽拖动及图片上传/缩放/对齐。AI 和页面共享 block DTO、修订/CAS、人工租约与批次回滚；表格原子块和嵌入 PNG/JPEG 保存在同一工作副本，保存重开及已支持 DOCX 导入导出保留结构和文字样式。修复新增节点保存后的 ID 映射、字段顺序引起的重复保存，以及非法图片校验异常。

全仓 build/typecheck、68项集成、check:plan及2项规划测试通过；实际 Word-only tgz 浏览器15项与卸载重装6项通过，无pageerror，另含原生鼠标列宽/图片缩放与 DOCX 往返测试。最新 tgz 仅 README 范围说明随最后重打包更新，安装后 Host/Client 字节与已验收构建一致。已通过官方CLI更新当前preview Profile并重启18989，保留其他6项插件依赖、文档存储和原文件。候选未提交、推送或公开发布，已发布 alpha.1不变。详细证据见[表格图片验收](evidence/office-tables-images-u2.md)。

当前限制：50行/50列、最多500单元格；每张嵌入 PNG/JPEG 512 KiB；批次1 MiB、文档2 MiB、Host DOCX交付1 MiB。单元格图片、嵌套表格、复杂浮动布局、完整页眉页脚/分页及部分导入列表编号仍未支持，原件保留并提示转换限制。未执行真实模型表格图片生成、Word/WPS打开、OS IME、390px/1920px完整应用验收；其余七类实时编辑待开发，主线D04/D15不变。

## 本轮：Office Word alpha.1 已发布（2026-09-12）

用户授权的 Word 预览发布已完成。源码提交 2c18bd79746381d9febb54ae4ef3f9ac4187d145 已推送 origin/main，标签 office-v0.1.0-alpha.1 指向该源码提交，GitHub [prerelease](https://github.com/techflag/workdsh/releases/tag/office-v0.1.0-alpha.1) 已公开。附件4个独立插件tgz（Office及配套identity-local/access/audit）、SHA256SUMS与release-manifest，上传返回摘要逐一核对本地SHA-256，Office包558347字节。中英文README特色、Word/选择入口及用户截图随源码提交。仅Word文本预览，其他能力边界与未执行项见上一条；本轮未安装新发行包到用户Profile、未重新启动用户应用，未发布npm/Desktop。下一步按原计划推进文档表格/图片、完整排版与其余七类，不将本次预览发布视为八类完成。

## 本轮：Word 文本预览发布收口（2026-09-12）

Word-only 打包独立阶段目录，剔除旧 Univer/Excel/PPT 适配器及运行依赖，保留源码实验与八类路线。实际50个打包依赖许可文本齐全，已知双许可按MIT分支，打包失败关闭。导出同修订稳定ZIP与路径，独占链接完整文件、核对已有摘要不覆盖人工修改、写入/交付回执未知及取消保护，新增故障测试。全仓build/typecheck、65项集成、check:plan、2项规划，以及Word-only tgz的12浏览器与6卸载重装通过，均无pageerror。真实模型沿用此前15项，本轮未重复执行；Word/WPS、OS IME、跨Host/掉电恢复未执行。准备office-v0.1.0-alpha.1预览标签，完整Word与八类尚未完成；主线D04/D15保持。发布结果在后续记录。

## 本轮：Word 条件发布核对（2026-09-12）

用户授权在 Word 开发完成后推送版本。复核实际代码、候选 CHANGELOG 与第三方 notices：当前仅 Word 文本工作副本预览，表格/图片/完整分页仍未完成；dist/license-review.json 有7项缺失许可文本记录，旧适配器仍随候选打包，尚未满足此前无商用限制要求的发布收口。此次 Office typecheck 与内容/输入/导入/下载12项集成测试通过。浏览器、真实模型、全仓构建/检查及新制品验收本轮未执行；此前证据保留。未创建发布标签、提交、推送或发布。下一步先收口可分发的 Word 预览制品依赖/许可及导出故障恢复，完整 Word 后续能力继续保留，不将文本预览声明为 Word 整体完成。

## 本轮：保存 Office 输出选择截图（2026-09-12）

保存用户原始截图为 docs/assets/screenshots/office-output-selector.png，中英文 README 加入引用及当前适配范围说明，截图目录登记来源。原图与副本 SHA-256 一致，图片引用存在，git diff --check 通过。仅文档与图片变更，未运行构建或运行测试；未提交、推送或发布。

## 本轮：重新安装 Office 并记录命令（2026-09-12）

按用户要求使用官方 CLI 将已验收的 alpha.1 本地候选 tgz 安装回当前 preview Profile，验证 dependencies 恢复 Office，随后重新启动18989。中英文 README 及 Office README 补充当前 Profile 的安装、卸载与启动命令，说明先停止应用、保持同一 DSH_HOME/Profile、新建无需引用及卸载保留内容。此轮未修改运行时代码，未额外运行测试；沿用此前候选制品验收。未提交、推送或发布。

## 本轮：用户观察 Office 实际卸载效果（2026-09-12）

按用户要求通过官方CLI从当前preview Profile移除workdsh-plugin-office，已验证Profile dependencies无Office并重新启动18989。保留文档存储及原文件，不自动重装，供用户刷新观察菜单/编辑入口撤销。此轮未执行额外测试，先前安装/卸载验收证据保留；未提交或发布。

## 本轮：Word 预览版与独立插件制品收口（2026-09-12）

验证完整tgz安装生命周期，而非仅开发态卸载。六工具注册的disposer已由Office ctx.effect托管。Host卸载工具及guide、移除服务再装保留内容/修订；实际CLI从隔离Profile移除制品后冷启无content工具/guide、接口404，再装tgz恢复菜单/六工具/已写入文本和修订。Client热卸载撤销类型与文档来源、预览和右栏注册，用户旧草稿标签保留且发送失败。12项内容/输入/导入/下载测试、Word12项、真实模型15项、制品重装6项通过；最终44px DOCX工具栏和宽度约束通过Word浏览器回归。DOCX编辑期间外部文件更新不替换缓冲。证据见[Word发布收口](evidence/office-word-release-u3.md)。

中英文README突出实时写作、人机接续、原生文件交付、插件按需组合；CHANGELOG和候选 `.artifacts/office-release/workdsh-plugin-office-0.1.0-alpha.1.tgz`、SHA256与manifest已准备，包内容检查通过。新版安装到preview并重启18989。仍仅Word文本副本预览，表格/图片/页眉页脚/完整分页和七类实时适配待开发；Word/WPS、OS IME、完整U3故障恢复及全仓check未执行。未提交、推送、打tag或发布；主线D04/D15不变。

## 本轮：Office 输入说明行错位修复（2026-09-12）

用户截图确认新增 input.dock 说明行与原生 composer 居中布局不一致且重复标签。已删除 OfficeInputGuide 组件及 dock 注册，不修改官方布局 CSS，直接保留输入框内原生类型/参考/修改标签。Office typecheck/build、2项输入语义测试和4项专项浏览器检查通过；标准宽度和900px窄窗口（右栏收起）截图复核，标签位于输入框内，说明行不存在。新版已安装并重启18989。真实模型和全仓回归未执行；八类后续范围不变，未提交、推送或发布。

## 本轮：Office 原生输入类型选择和文档引用（2026-09-12）

OFFICE-INPUT-01 已接入 `/office` 八类输出选择与可删除原生输入标签、新建无需 `@`；`@` Office 工作副本明确区分参考与修改对象。公开输入触发/codec/原生发送器复用，提交重新核验任务和文档访问。其余七类实时适配标明待接入，原生文件引用入口保留。Office typecheck/build、6项集成及4项专项浏览器检查通过，见[输入验收](evidence/office-input-u2.md)。新版已安装到 preview 并重启18989。真实模型、标签冷刷新和全仓回归未执行。后续按U2—U5完善编辑器和故障收口，主线不变；未提交、推送或发布。

## 本轮：保存 Office Word 发布截图（2026-09-12）

按用户要求将原始截图保存为 `docs/assets/screenshots/office-word-preview.png`，英文及中文 README 已引用，截图目录记录来源与能力边界，供后续发布复用。已验证原图与保存文件 SHA-256 一致，README 图片路径有效。仅文档及图片变更；构建、运行测试未执行；未提交、推送或发布。

## 本轮：后续 AI 写作自动展开右栏修复（2026-09-12）

已修复首次展示ACK后新AI提交不刷新展示请求，以及客户端先标seen导致打开失败不再重试。新的 agent commit 在同一原子记录更新presentation（当前Session、新requestId、当前revision、5分钟有效）；人工保存和幂等重放不制造新请求。Client成功调用官方openTabIn后才标记seen。无第二套布局/传输。

Office typecheck/build、7项集成测试、11项浏览器检查通过；新增ACK→AI提交→新pending、重放不重新揭示、人类保存不重新揭示，以及真实浏览器首次ACK→收起右栏→AI写入→自动展开回归。证据见[右栏修复](evidence/office-sidebar-reveal-u2.md)。新版已安装并重启18989。本轮真实模型、全仓回归未执行；用户截图对应历史Session日志未复现，不能断言此前每次失败均来自这两处。仅文件工具/officecli生成的独立文件不自动变为实时工作副本。主线D04、八类范围不变，未提交/推送/发布。

## 本轮：复用 Tiptap 官方紧凑工具栏（2026-09-12）

用户指出自绘多行工具栏体验差。核对官方 UI Components 与 Simple Editor MIT 文档，复用锁定提交的 Toolbar/ToolbarGroup、Button 无 tooltip 分支和官方 SVG，按现有 Office scoped 样式适配单行44px布局。字体/字号/颜色/列表/查找/缩放功能保留；窄栏横向滚动，键盘焦点自动揭示按钮。原生 select/input 保留键盘行为，Tab 离开工具栏，箭头跳过禁用按钮。没有替换现有 Editor、修订、租约或保存服务，也没有引入收费 DOCX 模板。

Office typecheck/build、7项集成测试和11项确定性浏览器检查通过；截图及官方来源见[复用记录](evidence/office-official-toolbar-u2.md)。新版已安装到 preview 并重启18989。本轮真实模型、Word/WPS和全仓回归未执行，旧原生交付卡链路未修改。后续仍是文档表格/U3故障收口与U4其余七类；未提交/推送/发布，D04不变。

## 本轮：接入 Harness 原生文件交付卡（2026-09-12）

已移除 Office 自绘卡片/Conversation 投影，注册第六个 content_export 工具：读取授权下已保存文档，复用浏览器 DOCX codec，经官方嵌套 bash 和 present 交付实际文件，由官方 ui-deliverables 原生卡显示。作用域工具查找传入实际 agent，继承 token/rootCallId/signal，不绕过沙箱/审批。文件名清理并编码，独占新建，不覆盖用户原件。实时右栏、跟随及最新人工修改下载保留；导出文件代表当时修订，后续编辑不静默改写它。

Office typecheck/build、7 项集成测试通过（含富格式文档 Host 冷启动），真实模型分批写入→官方 present 日志→原生卡→刷新恢复通过；卡片打开/右栏预览下载通过，真实模型模式共14项检查通过，详见[原生文件卡记录](evidence/office-native-delivery-u3.md)。旧文档工作副本数据保留，旧轮次不会自动补造文件交付，可请求 AI 导出已有文档。完整 U3 幂等导出/未知写入恢复、Word/WPS 保真和其余七类仍待开发；全仓回归未执行，新版已安装并重启18989，未提交/推送/发布，主线 D04 不变。

## 本轮：原生产物卡片复用纠正（2026-09-12）

用户指出 Office 自绘成果卡应复用官方文件交付卡，已确认当前确有重复 UI。锁定 rc.1 官方 ui-deliverables 的原生卡由真正文件路径和成功 present 声明驱动；当前实时工作副本只有浏览器 DOCX 下载，尚没有 Host 文件导出桥接。公开 ./client 仅导出 ProducedFiles 文件改动标签，不导出交付卡组件，不能私有导入或照抄外观。官方复用记录已补入 U1-IMPLEMENTATION；下一项是受控 DOCX 文件导出→官方 present→原生卡，并保留实时右栏和修订关联，再移除自绘卡。

本轮只核对公开发布包/镜像文档，未修改运行代码、重启、提交或发布。新原生交付链路测试未执行；不能声称已替换。主线 D04 和八类后续范围不变。

## 本轮：文档常用编辑工具栏（2026-09-12）

原生 Tiptap 文档补齐字体/字号、文字颜色/高亮、标题1—6、四种对齐、行距/缩进、原生项目符号/编号列表、撤销/重做、全选/清除格式、文字查找替换、缩放与字符数。工具栏分组换行，避免窄面板把按钮藏到水平滚动区域。复用 Tiptap 3.31.0 MIT 扩展；Office 独立插件及统一服务架构不变。

可选文字/段落样式和列表层级进入语义契约、Host 校验、AI 工具 schema 与 DOCX 下载；旧记录兼容。6 项集成测试通过，浏览器验证编辑/保存/重开/下载，真实模型继续分批展示并保留成果卡。详细范围及验收见[工具栏记录](evidence/office-document-toolbar-u2.md)。仍未实现文档表格、图片、页眉页脚、分页排版或完整 Word 保真；其余七类继续既有 U3—U5 计划，主线 D04 未改变。未提交/推送/发布。

## 本轮：Office 成果卡片、跟随阅读和下载（2026-09-12）

完成轮次保留原生文档成果卡，可打开、下载并在刷新后恢复；使用独立 Conversation Definition/Chat keyed Node，不替换官方文件卡片。右侧“下载 Word”与卡片下载共用活跃文档事务，先保存人工修改再导出当前修订；保存失败或组合输入未完成时拒绝导出旧内容。浏览器生成段落/标题/文字标记 DOCX，无本地 Office 或服务器转换。追加内容自动跟随到底部，上滚暂停、按钮恢复。

验证：Office typecheck/build、4 项集成用例通过；预构建独立 Profile + 真实模型探针 11 项通过，浏览器异常为空，覆盖最新修改下载、中文/emoji/标记、长内容跟随/暂停、完成卡片打开/下载/刷新恢复。新版已安装到项目 preview，并重启 18989；详见[U2 文档交付记录](evidence/office-document-delivery-u2.md)。未改用户原件，未提交/推送/发布。

下一步为文档表格与 U3 保真导入/导出、失败恢复；本轮浏览器下载不代表完整 Word 分页保真或八类已完成。全仓回归、Word/WPS 分页验收、专家/PTC 全矩阵未执行；主线 D04 不变。

## 本轮：Office 默认写作与真实模型验收（2026-09-12）

新增 lifecycle-managed `workdsh:office-authoring` 提示词工作流，使用 rc.1 systemPrompt.section/公开 TOOL_REPORT placement，通过 Office 工具子插件贡献，不覆盖专家 persona。不改用户 officecli 技能。普通写作先创建右栏，再写首段和小批次；默认样式由现有编辑器提供。明确表格/DOCX 未实现，避免用户误认为工作副本就是 Word 文件。

验证：Office typecheck/build 和 2 项集成测试通过，新增卸载时引导清理检查。隔离预构建 Profile 探针 7 项与真实模型场景通过；测试保留真实 officecli Skill，在合成空工作区发送普通中文报告请求，无工具名称。最新真实样本右侧空文档修订0约3.3秒、首批修订1约5.5秒、修订2约7.6秒、修订3约10.8秒；模型 idle 结束，调用 content_open 和 content_edit，无 Bash/文件工具/skill 绕行。按文档 ID 排除其他测试文档，防止旧工作副本造成误判。凭据仅从已配置 preview 用于临时隔离 Home，已清理，不进入模型输入/制品。

已通过官方CLI安装新版Host/Client到项目preview并重启18989，不改用户原件或其他Profile。证据见[U2真实模型记录](evidence/office-natural-writing-u2.md)。此为标准模式短报告样本，长文/专家/PTC/八类/表格和DOCX导出未验收，不能标 Word 完整交付。下一步补文档表格与 U3 DOCX冻结导出/重开、失败恢复；主线D04/D15未完成。全仓回归/发布未执行，未提交/推送。

## 本轮：Office 创建即展示修正（2026-09-12）

用户真实测试显示旧预览模型没有文档工具并退回 Markdown 文件交付，不能视为实时文档链路验收成功。已修正新建文档原子保存会话定向展示请求，重开现有文档也请求展示；无需额外 content_present。补齐根 Loader 的 tools/connection 载体依赖，工具描述引导分批写作并说明自动展示。

验证：Office typecheck/build、2 项服务集成测试通过；独立预构建包浏览器探针 7 项通过，新增真实 Session prompt assembly 工具可见性检查和首批写入前空文档自动打开；不调用 content_present，三批提交自动显示，人工编辑后 AI 工具读最新内容、重载恢复通过。修正已通过官方 CLI 安装到项目 preview Profile，并重启原 18989 预览服务。没有修改用户原件、其他 Profile，未提交/推送/发布。

实时当前为每个 content_edit 已提交批次自动同步，尚非工具参数逐 token 流式渲染。真实模型自然语言写作与连续生成体验仍需验收；普通文件 Markdown/Word/PPT 导入尚未迁移，八类全部实时链路未完成。下一步仍 U2 真实模型验收和生成节奏，不扩展后续选型。全仓回归/PTC/完整八类未执行。

## 本轮：Office U1 最小文档插件已接通（2026-09-12）

已实现独立 Office Host 内容服务、五个原生 content_* 工具、认证 Connection 与原生右侧 Tiptap 文档页。AI/用户写同一份有修订的内容，人工租约阻止相互覆盖；原子收据支持重复请求与重启恢复。公共 office 类型契约已导出。组件只使用 Client model 的状态/actions，未新增 Agent loop/MCP/插件框架。

验证：contracts build、Office typecheck/build 通过；内容服务 2 个集成用例及干净预构建包 6 项浏览器检查通过，覆盖三批工具写入→原生页面逐次显示→人工改段落/分段/加粗/emoji→工具读最新内容并续写→浏览器重载。中文 composition 保护以浏览器模拟事件通过，未替代系统 IME 测试；未调用真实模型。详见[验收证据](evidence/office-live-u1.md)及[U1 实施记录](design/office/U1-IMPLEMENTATION.md)。

附加检查：9份相关文档的链接/围栏与JSON通过，`node scripts/check-plan.mjs`通过（仅规划完整性），`git diff --check`通过，Host 构建中无 private contracts 运行时导入。

当前是新建原生 document 工作副本链路；旧 Office 文件导入未迁移，content_export 未注册。下一步 U2 真实模型与编辑恢复验收，再 U3 冻结导出/文件重开/在途卸载，之后 U4 其余七类。旧依赖的六项许可文本缺口列入制品报告，最终发布门槛未完成。八类、D04/D15 及总体版本均未标完成；不重复扩展选型。

未执行真实模型/PTC、全仓回归、完整八类/热卸载故障与发布；未修改用户 Profile/原件，未重启、提交、推送或发布。

## 本轮：Office插件架构复审与交付边界修订（2026-09-12）

复审组件方案、统一接口v0.3和U1—U5，静态核对Office manifest/patch/空Host/Client注册/构建脚本、tables/pages/library职责、ADR-0018/0019与官方公开文档/声明。发现[OP-R01—06](design/office/ARCHITECTURE-REVIEW.md)：插件组成未落定、卸载在途提交缺口、跨领域所有权不明、原生Client与制品兼容缺门槛、类型codec/schema生命周期不完整、顺序台账未同步当前专项。

已新增[插件架构与OP-T01—07](design/office/PLUGIN-ARCHITECTURE.md)，统一接口修订为v0.4：独立workdsh-plugin-office包、官方ctx.plugin组合Host服务/工具/Connection、官方Client图与renderer、公开契约、请求运行代/停稳恢复、独立内容多维表格与tables业务库边界、HTML与pages发布边界。同步组件方案、计划、ADR、模块README和公开架构说明。顺序台账使用已有activeSlice机制登记OFFICE-AI-01并保留完成的Skill切片，主线D04/D15未改为完成。

下一步U1以真实最小文档能力验证插件服务/工具/Client与干净预构建包，再U2验证AI写→人工改→AI续写。八类全部保留。此次为设计处置，不是代码修复；新增依赖安装、构建、业务/浏览器/真实模型、插件卸载及制品测试未执行；未改运行代码、用户数据、Profile，未重启、提交、推送或发布。

验证：15份本轮设计/规划/模块说明的相对链接、围栏、JSON与空白检查通过；顺序台账Office专项/旧Skill历史/主线D04保留检查通过；`node scripts/check-plan.mjs`通过（28模块/50文档，仅脚手架完整性），`git diff --check`通过。六项Review是设计已处置、运行门槛待验。

## 本轮：HTML与Markdown纳入八类正式编辑器（2026-09-12）

用户明确要求HTML、Markdown也要集成。已同步[组件方案](design/office/OPEN-SOURCE-STACK.md)、[统一接口v0.3](design/office/UNIFIED-API.md)、AI协作需求、Harness集成、ADR-0024修订3、PLAN及Office README：HTML用CodeMirror源码/隔离预览，Markdown用Tiptap正文/CodeMirror源码与Mermaid/KaTeX。八类共用六个content_*工具；新增严格源码模型、绑定修订的补丁、同文档视图切换、资源导出与独立预览回执。补充Markdown未知语法保留及HTML资源/脚本隔离验收，U4先接Markdown/HTML再推广其余类型。

下一项仍为U1/U2的Tiptap真实文档链路。本轮修改的是需求/设计/计划与模块说明；新增依赖安装、业务构建、浏览器/真实文件/真实模型验收未执行，未修改运行代码或重启、提交、发布。

文档验证：8份文档相对链接、代码围栏、JSON示例及空白检查通过；`node scripts/check-plan.mjs`通过（28模块/50文档，仅规划完整性），`git diff --check`通过。已复查当前设计中的类型计数；六个工具保持不变，编辑器范围为八类。检查不代表产品集成已完成。

## 本轮：采用 GenOffice 使用的上游开源组件（2026-09-12）

用户明确意图是采用同一批开源基础库。已将技术方向落实为[OPEN-SOURCE-STACK](design/office/OPEN-SOURCE-STACK.md)：Tiptap/ProseMirror文档、现有Univer开源表格、Konva演示/画布、PDF.js/pdf-lib/PDFium；Harness运行与统一API不变。多维表格复用网格基础并保持独立字段/记录/关系模型。旧候选探针留存，停止作为默认方向继续扩展。

静态核对GenOffice提交de139a061537bea40f0cc81ef8f09a95f77ac52a的包声明及有关Docs/PPT/PDF编辑源文件，确认Univer声明同为0.25.1族、Tiptap3.31.0、Konva9族等；明确声明范围不是已解析锁定版本。源文件只读快照位于.artifacts/genoffice-reference，不进入产品代码。核对Tiptap/Konva/Univer官方许可证，记录MPL字体部件与ee边界；并未安装或运行GenOffice。

同步统一API、Harness集成决策、ADR、旧选型说明和PLAN。下一项U1/U2使用已选Tiptap完成真实文档链路，不再扩大选型。新增库安装、构建、浏览器/文件往返/真实模型测试未执行；未修改运行代码/依赖、用户文件或应用配置，未重启、提交、推送、发布。

## 本轮：统一接口修订与 Harness 技术方向（2026-09-12）

按用户要求修订 [UNIFIED-API v0.2](design/office/UNIFIED-API.md)，补齐Review六项：富文本权威模型/UI事务映射、单记录原子提交与幂等、已有文件open/reuse/fork、修订恢复与可信会话展示、冻结修订导出、人工lease接手与撤销。新增 [HARNESS-INTEGRATION](design/office/HARNESS-INTEGRATION.md)，核对官方tools/code-runtime/subagent/web-client/storage/sidebar-right/API Gateway/Agent Teams相关说明、官网工具与subagent页面、锁定0.1.5-rc.1公开声明及既有Remote失败证据。结论是单原生Agent+统一工具+Client镜像；PTC复用工具，子智能体仅复杂分工可选。rc.1采用已验证官方Connection领域通道，不假设未验证的自有RemoteStream可用。

同步ADR-0024、AI-EDITING、Review处置与PLAN有限U1—U5。设计问题已答复，故障修复及运行签收仍待实现。下一项为U1/U2文档真实闭环：模型/原生编辑器→Host工具→持久修订→正确会话右侧显示→人工修改→AI续写；其余五类按同接口逐项接入。

本轮仅文档与静态公开面核对，运行代码/依赖未修改。构建、业务/浏览器/真实模型、崩溃恢复与导出测试未执行；未重跑历史Remote探针，未启动子Agent、重启、提交、推送或发布。

文档验证：5份设计/ADR的相对链接、代码围栏、JSON示例与空白检查通过；`node scripts/check-plan.mjs`通过（28模块/50文档，仅规划完整性），`git diff --check`通过。此结果不替代Harness集成或产品验收。

## 本轮：统一接口架构 Review（2026-09-12）

审查 design/office/UNIFIED-API.md 的157行版本，交叉核对AI-EDITING、实际Office空Host入口与Harness storageDomain/sidebar-right文档。记录 [Review](design/office/UNIFIED-API-REVIEW.md)：5项P1（权威模型与UI映射、原子幂等、已有文件入口、订阅/会话路由、修订导出），1项P2（人工输入与持续AI写入冲突）。结论为需修订后再作为实现契约；保留原文便于对照。本轮为静态架构审查，故障场景尚未通过运行复现，业务/浏览器/真实模型测试未执行，未修改运行代码、重启或发布。

## 本轮：统一 AI 内容接口架构（2026-09-12）

用户要求从架构统一六类编辑器。新增 design/office/UNIFIED-API.md：6个content_*工具、严格操作联合、能力查询、有界结构读取、稳定ID、Host统一提交、客户端显示回执与文件导出回执分离、原生适配边界和真实场景。核对现有 tools/storageDomain/Connection/documentPreviews 与 sidebarRight 官方文档及实际代码。用户架构反馈优先，先完成契约收敛，未增加空工具、另一套MCP或执行器。运行代码/依赖未改变；构建、UI、真实模型验收未执行。下一项为Word首条Host工具→持久化→右侧原生编辑器链路。未提交、重启或发布。

## 本轮：六类编辑器 AI 同文档协作设计（2026-09-12）

用户新增 AI API/内部MCP与实时写作可见要求。已核对现有 Office 为 client-only、无Host文档服务或工具，记录 ADR-0024 与 design/office/AI-EDITING.md：AI与UI同领域服务、修订冲突、幂等回执、重连、取消、部分提交、权限和六类操作边界。内部优先官方原生工具，MCP不另起一套状态。实施按 A—D 有限范围推进；首条链路为文档分段写作与人工修改交接。此次为需求/架构落地，工具、Remote、实时显示与六类集成代码尚未实现；构建/浏览器/真实模型测试未执行。未提交、重启、发布。

## 本轮：PPT 候选原生 UI 与 MPL 复核（2026-09-12）

MPL 官方 FAQ 与发布包许可证核对完成：允许商用和专有组合，分发需满足覆盖源码与声明条件。新增隔离 UI 探针；有来源页面加载10页，无来源容器因 localStorage 失败。5次远程字体请求全部拦截；文件首页/工具栏遮挡导致标题双击超时，直接编辑尚未通过，未用强制点击绕过。完整结果见宽松许可选型文档及 .artifacts/pptx-candidate/ui-result.json。下一项处理公开配置下的首页遮挡和字体来源，再验收编辑/撤销/导出。未接入、重启或发布；正式构建/业务测试未执行。

## 本轮：PPT 替代引擎真实浏览器读写（2026-09-12）

隔离安装 pptx-viewer-core@3.14.3；新增 probe-pptx-candidate.mjs。真实10页PPT在浏览器内导入、修改文字、导出副本、重开通过，6个图表对象数量保持；原件不变，外部网络请求/页面错误0。证据在 .artifacts/pptx-candidate/result.json，详细限制见宽松许可选型文档。尚未验收原生UI、视觉保真、撤销及应用集成；正式业务测试未执行，未重启或发布。依赖清单发现 mtx-decompressor 为 MPL-2.0，尚未通过完整许可准入；下一项先核对该依赖许可，再做编辑器UI逐页显示与直接操作验收。

## 本轮：宽松许可浏览器编辑器选型（2026-09-12）

用户确认覆盖六类编辑器并优先 MIT/Apache-2.0。新增[选型证据与有限验证计划](evidence/browser-editors-permissive-selection.md)。PPT 新增 Apache-2.0 的 pptx-viewer 候选；Grist static 官方明确修改不保存、导入导出缺失，不能作为完整多维表格交付。既有 Univer 全组件范围保留，商业 SDK 迁移暂不推进，先按新许可约束验证替代组件。候选实际安装、构建、浏览器与文件回归未执行；未重启、提交或发布。

## 本轮：Univer 完整组件范围与原生编辑兼容探针（2026-09-12）

用户追加截图全类别：Sheets、Modern/Traditional Docs、Slides、Boards、Bases、PDFs、Compose & Embed、Customization & Integration。已记录ADR-0023与PLAN覆盖，不遗漏组件。新族统一1.0.0-rc.0独立安装（30个SDK包），已有应用仍0.25.1；没有服务器转换、上传文件或修改用户Office原件。旧族Docs真实键盘和Slides原生Operation修改通过，开发探针依赖与运行依赖分开。

新版公开preset组合已补Pro公式技术依赖并正确排序license，独立来源测试页8类初始化/canvas/原生Facade修改通过，两类Docs真实键盘通过，外部请求/页面错误0；Embed只验证注册和宿主文字，不签收真实嵌入。授权未配置，官方水印保留。当前opaque srcdoc应用容器的IndexedDB与Bases history兼容失败，因此没有直接替换已运行应用。完整对象编辑、撤销重做、保存重开、所有可选元素、实际Office/PDF转换及官方Tab迁移尚未验收；视觉复核单独登记。[完整证据](evidence/univer-complete-components.md)。

Office类型检查与规划/差异检查通过；正式业务全量、真实模型、新族应用集成未执行。未重装/重启应用，未提交/推送/发布。本轮成果是可复现SDK装配与兼容探针，不能称全组件集成完成。下一步为安全来源资产交付和文件转换公开面，授权问题等待用户回复，凭据不通过聊天获取。

## 本轮：Univer原生编辑需求纠正（2026-09-12）

用户拒绝额外文字片段模块，要求页面直接编辑。官网Sheets/Docs/Slides安装和导入导出已核对；当前Word/PPT预览加表单不符合需求，未签收原生编辑。当前0.25.1与官网1.0.0-rc.0有差异；Docs同版预设存在，pro Slides同版404。官方三类Office转换均要求转换后端，用户无服务器约束保留。此次没有运行代码/依赖修改，详细证据见[evidence](evidence/univer-native-editing-review.md)。

## 本轮：Word/PPT预览布局与实际文件回归（2026-09-12）

默认收起文字片段编辑，明确编辑文字按钮展开，更新按钮仅编辑时显示；Word页面按容器缩放、灰色画布与纸张阴影；PPT列表预览移除单页高度的内部滚动容器，用预览区统一滚动并适配宽度。真实PPT缺少可选defaultTextStyle导致第三方解析Object.keys(undefined)，仅预览内存副本补空默认样式，导出原包不改。真实用户Word/PPT在700px宽度无横向溢出，Word3页/PPT10页DOM及可滚动高度、编辑展开收起、原件hash不变、页面错误/外部请求0通过；截图复核。常规三类编辑/导出回归与类型检查通过。复杂图表/字体/分页完整保真未验收，不能以页面DOM计数宣称内容完整。插件重装，现有应用重启；未提交发布。

## 本轮：WorkDSH 桌面未签名测试版构建与冒烟（2026-09-12）

按用户四项决策（暂缓 Apple 凭据先做未签名测试版、品牌 WorkDSH、预置全部 7 包、应用 ID com.workdsh.app），在锁定 dsh-v0.1.5-rc.1 隔离快照上完成 5 文件 WORKDSH TEST PATCH 并实现全链路贯通：7 包 tarball → 核心包集 248 → unsigned 种子（bundles=内置两层+7 层，integrity 270 文件）→ electron-builder --dir **exit=0**（Electron 44 改走 npmmirror 镜像完成下载）。产物 WorkDSH.app（1.0G，CFBundleIdentifier=com.workdsh.app，adhoc 签名无 quarantine）本机冒烟通过：首启离线安装 248 包至 ~/.dsh/profiles/desktop（7 个 workdsh 全部就位），staging healthCheck 与正式 Host 激活（[workdsh:probe] 生命周期），二次启动快路径，CDP 截图确认 WorkDSH 品牌、侧边导航（新会话/项目/专家·技能·连接器/定时任务/资料库）与真实 session 轨迹完整渲染。旧 desktop profile 残留已备份为重命名目录（保留数据）。Dock 图标已接线：品牌概念图转 10 档 iconset → workdsh-icon.icns，mac.icon 接入后重打包 exit=0，SHA-256 与源一致。窗口壳融合已实施（main.ts hiddenInset 主窗口 + preload-app.ts 注入适配样式）：侧边栏 logoRow 顶部留白 48px（品牌行 y=56，避开红绿灯）、logoRow 与内容 header 为 drag 区、交互控件 no-drag；运行时 CDP 核验 innerHeight=840=outerHeight（原生标题栏已移除）、shellMark=inset、header region=drag；重打包 exit=0（须带 --config electron-builder.config.mjs，首次遗漏误产物 dist/ 已清除）。红绿灯实际落位与窗口拖动、Dock 显示待用户肉眼确认（如 Dock 仍是旧图属缓存，移除重添或 killall Dock）。未执行：正式签名/公证、DMG/ZIP 分发制品、自动更新通道、长会话真实性验收、设置页/全屏视图红绿灯检查；产物仅本机自用不可分发。详见[evidence](evidence/desktop-pack-test.md)。

打包流程已按用户要求固化为可复用入口：新增 `scripts/desktop/pack-desktop.mjs` 一键脚本（Node 22 自举 → 补丁 SHA-256 校验 → build:desktop → electron-builder → 产物断言，支持 `--skip-build/--check-only/--sync-patches/--restart`）、补丁存档 `scripts/desktop/patches/upstream/`（9 文件防漂移比对）、打包指南 `docs/DESKTOP-PACKAGING.md`（用法/补丁表/快照重建/Windows 说明/常见问题，打包资料主体按用户要求集中于此）与技能触发入口 `.qoder/skills/workdsh-desktop-pack/SKILL.md`（指向指南；个人级副本已移除）。测试：`--check-only`（Node 21→22 自举、9 补丁一致）与完整打包均 exit=0，产物断言全过（1.0G）。macOS 不能产出 Windows 版：官方 `package-target.ts` 的 win-x64 硬门槛要求 Windows x64 主机、`prepare-seed` 需目标平台 Node 生成平台专用种子、Windows 强制 EV 签名且无未签名降级；如需 Windows 版须在 Windows x64 真机/虚拟机复刻并新增等价 unsigned 补丁。技能跨会话触发与快照重建未实测；未提交/推送/发布。

## 本轮：修复 Office 工具栏样式污染（2026-09-12）

自定义 header/button/main/label/textarea/h3 规则收敛到直属顶部区与文字编辑区，避免影响 Univer 内部元素。配置公开 ribbonType classic；实际宽度仍受 Univer 自适应布局控制，不保证参考截图的全部菜单。构建、类型检查、真实 XLSX 浏览器回归、截图复核通过；按钮恢复显示，图表限制不变。

## 本轮：Office 顶部空间压缩（2026-09-12）

说明与操作区收为40px单行，小屏不再换行；说明截断，信息按钮展开浮层查看全文，不挤压表格。Office构建/类型检查、真实图表文件浏览器回归与截图复核通过，插件已重新安装。

## 本轮：含原生图表 XLSX 打开错误修复（2026-09-12）

用户文件触发 ExcelJS drawing reconcile 的 undefined.anchors。适配器仅在内存解析副本移除未支持的图表/绘图关系，保留原始高级对象检测与禁止导出规则；源文件不写入。真实用户 XLSX 的 opaque 浏览器探针已通过：表格 canvas 显示、禁止有损导出、原件 SHA256 不变、页面错误和外部请求均为0。原生图表仍未显示，本次只修复表格打开，不签收图表保真。验证脚本 scripts/probe-office-chart-regression.mjs 接收外部 fixture 路径，用户文件不加入仓库。证据见 .artifacts/office-chart-regression/result.json。

## 本轮：Word/PPT/Excel 原生右侧集成（2026-09-12）

用户要求直接集成三类且停止额外公式计算。新增独立 workdsh-plugin-office@0.1.0-alpha.1，通过官方 documentPreviews/Slot 接入原生 Tab，不启动 Office 转换服务；Excel 用 Univer，Word/PPT 用浏览器预览与原包文字片段修改。构建/类型检查/打包、三类实际 fixture 预览/编辑/下载读回、官方七包 Profile＋仅测试诊断插件的原生 Files→右侧三类文件打开均通过，网络请求0，页面错误0，截图已复核。preview:install 已将 Office 加入项目预览 Profile；使用现有预览需重启加载新插件，本轮没有自动启动图形窗口。

[实施证据](evidence/office-integration.md)、[ADR-0022](adr/0022-browser-office-document-extension.md)、模块README明确：Word/PPT不是完整排版编辑器，Excel原生图表尚不显示且含已检测高级对象不能导出；Host覆盖保存与冲突检测、复杂保真、安全硬化未签收。Root Harness精确版本不变，新增依赖锁已更新，D04/D15状态不变。规划检查/2项规划测试通过；正式业务插件全量/真实模型验收未执行，未提交/推送/发布。

## 本轮：Office 纯浏览器编辑验证（2026-09-12）

用户明确禁止服务端转换并要求编辑，ADR-0021 服务端提案已标为 Rejected。新增隔离 examples/univer-browser-edit，不声明假 Harness 插件、不更改 Profile/根锁。Univer 与浏览器 ExcelJS 候选转换完成真实 XLSX 导入 → Facade/双击键盘编辑 → XLSX 导出，独立 XML 和读回确认单元格、两个工作表、原数字格式及公式表达式保留；构建、实际 Chromium 探针通过，无外部网络请求。图表对象反例禁止导出，尚不显示图表；浏览器公式实时重算未验收。视觉1440×1000已复核，小屏/深色/应用侧 Tab 未执行。详见[evidence](evidence/univer-browser-edit.md)。Word/PPT、复杂保真、Host 保存仍未实现，D04/D15 状态不变。探针登记modules并作为独立锁示例排除根workspace，规划检查/2项规划测试通过；正式插件全量集成未执行，未提交/发布。

## 本轮：Office 服务端预览接入调查（2026-09-12）

新增用户要求：客户端不依赖本机 Office/LibreOffice，调查 dsh-univer-office。隔离 npm 包完整性验证通过；严格 peer 安装失败，当前声明范围不覆盖 Harness 0.1.5-rc.1。发布包默认 Viewer URL 指向 Host loopback，远程 Web 尚不满足。已记录[证据与有限实施计划](evidence/univer-office-compatibility.md)及[Proposed ADR-0021](adr/0021-server-office-preview-bridge.md)。未改 Profile、运行代码或依赖锁；未完成运行、远程 Web 与 Office 保真验收，不宣布预览交付。企业后台与专家团阶段不因本次调查自动提前。

## 本轮：发布单个专家alpha.1（2026-09-12）

用户明确授权提交git并发布版本。本次准备experts-v0.1.0-alpha.1及匹配身份alpha.4/审计alpha.3/授权alpha.4/Skillalpha.25/展示alpha.40；模块各自版本，contracts开发契约alpha.6。中英文README新增专家能力、真实打包截图、安装与专业验收限制。源码包含必要治理与共享Skill配套；团队只保留设计文档，没有开放团队运行。发布验证记录见docs/evidence/experts-alpha1-release.md；D04仍in_progress，专业报告两处语义问题与E收尾保留，不以预发布替代验收完成。

## 本轮：专家团官方子系统补充复核（仅文档）

按用户指定subsystems目录补读subagent及相关workflow、agent-team、core、Session投影/引用、Conversation、Skills和approval契约，官网Subagent交叉核对。锁定SubagentRuntime声明已有continuable/消息/中断/子级发现，不能重做其inbox与激活管理。补充[团队方案第9节](design/experts/EXPERT-TEAMS.md)与ADR-0020：one-shot固定SOP、多轮continuable及实验性Agent Teams分别评估；成员provider不是先验必需。continuable准备钩子只贡献seed，精确专家组合须单独探针，冷恢复子Session不代表workflow脚本可续跑。TM-01范围细化，D04/D11状态与顺序未改变。本轮无运行代码、模型调用、依赖升级或提交发布。

## 本轮：专家团SOP架构修订（2026-09-12，仅方案）

根据用户“多专家＋SOP工作流”的反馈修订[专家团方案](design/experts/EXPERT-TEAMS.md)第2～4/8节及[ADR-0020提议](adr/0020-expert-team-sop-on-native-workflow.md)：首版即复用原生WorkflowEngine，后置通用设计器；区分原生运行事实与业务阶段验收，明确前置、并行、成果交接、评审和有界返工。核对锁定0.1.5-rc.1公开声明，发现原生spawn不直接选择专家preset、composeFrom继承父组合、phase仅显示，以及直接调用engine不保证自动持久化tool-workflow呈现事件。这些纳入TM-01公开适配探针，未宣称可运行。

本轮未编码、调用模型、升级依赖、修改用户任务或提交推送。D04仍in_progress，上一轮专业报告验收缺口保留；D11仍todo及既定前置D10，TM-01～04范围保留，企业后台继续后置。架构提议供审阅，不将其当作当前插件已实现能力。

## 本轮：D04 D 真实模型专业场景验收（2026-09-12）

用户在应用完成模型配置后明确授权继续真实模型验收。本轮在仓库外临时 Home/Profile 中安装六个独立 tgz，通过官方 Host Loader、完整发布专家 preset 和原生 Conversation 调用 deepseek-official/deepseek-flash（UI DeepSeek-V41-Flash，high）。使用虚构门店 CSV 和独立验收专家；没有编辑/发布用户现有「表格分析」，没有改现有用户任务。验收答案留在仓库侧，凭据只以0600临时凭据文件供原生提供方读取，退出移除；从未输出到聊天/日志/成果。

正常、信息不足、数据质量异常三条真实路径的持久 v3 日志均确认 turn/end=completed、skill 工具成功读取 retained-revisions 中发布时固定的技能、实际 read input.csv 与 Python 计算。正常收入55,000→46,000，-9,000/-16.3636%，A/B/C贡献-4,000/-5,000/0；缺字段时仅确认收入变化，门店明细为空、未知指标null并列必要追问；脏数据明确重复A/5月、B/6月缺客流及C/6月fen单位，未填补客流，归一化口径收入对账。三者原始输入hash不变，实际JSON/Markdown生成，独立只读日志/成果复核及冷启动任务绑定核对通过。第四条依赖不可用路径新增确定性Host/原生pre-step测试：停用配备Skill后禁止创建替代任务、既有任务拒绝下一步执行，没有远程模型调用。

专业复核未全部通过：初轮正常报告把结构性客单价上升当成可保护成果，脏数据报告误抄行公式并越过细粒度推断边界。补充方法技能后重新执行正常/脏数据完整真实任务：正常已按订单权重正确拆解整体客单价，明确非门店内改善；脏数据已使用正确50×30,000=1,500,000，并明确客单价持平不能证明单品价格或店内结构不变。原始报告保留，没有修改输出来隐藏失败。但最新脏数据报告仍错误以“乘法自洽性不符”排除数值本身为CNY的假设，以及用A+C转化率稳定暗示整体缺口只来自缺失值；B转化率未知时不能作此推断。这两处专业语义仍需关闭。D04保持in_progress/专家0.1，AT-27不整体签收；E稳定性收尾保留，不扩展0.2/专家团/企业后台。

新增显式probe:experts:professional（normal/incomplete/dirty）、独立数值核对和原生持久日志/冷启动复查脚本；普通测试不依赖API Key。初次浏览器可见性断言因完成后的Skill卡片自动折叠而失败，已改以持久tool/result、turn/end验证；旧任务经独立复核完成，不重复发送。严格方法复验的dirty主探针完整通过；normal任务与冷启动复查通过，但当轮核对器错误把合法字符串质量说明当伪造异常。已纠正未约定的格式限制：允许非空字符串或detail对象，数值仍严格独立核对，自然语言真假由专业复核承担；更新核对器经已有完成日志复查通过，没有为此再次调用模型。修正该格式限制后的normal主探针整条重跑未执行。

Experts构建/类型检查、52/52全量集成及规划检查/2项规划测试通过。最后对新增主脚本做语法/whitespace核对；预览18989仍运行，本轮未重装预览/提交/推送/发布。三份最新报告目录normal/incomplete/dirty的report.json保留professionalReview=required，具体人工审查见证据；D仍有已列明专业报告问题，不能从工具完成宣称整体可无监督使用。

证据：[D04修复与验收记录](evidence/d04-experts-review-fixes.md)；本地报告与截图在`.artifacts/experts-professional-normal/`、`experts-professional-incomplete/`、`experts-professional-dirty/`。专业复核说明与源文件保持分离。

## 本轮：D04 C 对话创建引导与完整使用预览（2026-09-12）

本轮交付C的候选代码：expert-manager 独立指南按目标/经验/方法/成果引导，信息够则先起草，仅追问影响判断的缺口，明确用户实际经验与通用建议的区别，不虚构履历，也不擅自添加用户未要求的连接器。制作专家仍只在原生任务框填草稿，不自动发送。新增只读 workdsh_expert_list_skills，通过同一Experts Host的目录和可编辑权限查询，返回稳定标识/简介/状态，不输出资源路径、不提供发布工具。

发布确认从同草稿修订的已保存Host定义生成纯TSX使用预览：完整简介、标签、示例、固定技能、扩展声明与完整专业设定，取消返回编辑；预览/打开链接不发布、不执行任务。确认请求的对象、草稿修订和两项摘要须与所见内容一致，变化要求重新预览，再由既有受信UI确认/Host发布路径处理。公共Modal、760px/820px上限、内部滚动和固定确认动作继续复用。

Experts构建（含contracts/UI）、类型检查与47/47全量集成通过；目录工具新增真实注册/执行及跨成员拒绝/资源路径不泄漏断言。独立六包probe通过长专业内容/六示例/取消不发布/摘要变化不交换证明、1440/1920/390px及两次冷重启；桌面和小屏截图、完整专业设定截图已人工复核。截图复核发现主题悬停色导致主要按钮对比不足，已增加限定于发布页的主按钮悬停样式并重跑探针。规划检查与2项规划测试通过。真实模型下的必要追问、完整专业交付、AT-27仍未执行，归下一阶段D实际场景验收；不从指南文本宣称模型行为已通过。

本地预览已完成六包内容寻址重装与入口摘要核对，重启18989。实际浏览器打开原「表格分析」已保存草稿的完整发布前预览，通过操作请求监测及前后draft/expert对比确认没有编辑、发布或创建任务；截图`.artifacts/preview-expert-use-review.png`。用户已打开页面需刷新加载当前Client。未提交/推送/发布，D04仍in_progress/专家0.1；剩余既定阶段为D真实专业任务验收、E稳定性收尾，不开展专家团/公共运营/企业后台。

## 本轮：专家草稿与已发布详情区分（2026-09-12）

用户新增 frontend-design 后编辑器与详情技能数量不同。详情仍正确使用已发布定义，但缺少草稿版本说明；本轮修正展示，不自动发布或迁移用户数据。可编辑用户在已保存草稿不同于已发布内容时看到尚未发布提示、两版技能数量及编辑入口；编辑器明确保存/发布/已有任务版本关系。扩展能力声明独立分区，不再混入真实配备技能，也不将未实现的接入校验写成实时“未满足”。

Experts 构建（含 contracts/UI）与类型检查通过；扩展真实独立六包探针通过草稿/已发布技能分离、编辑跳转、可选扩展能力分区、1440/1920/390px 无横向溢出及两次冷重启。首轮发现旧 info 样式隐藏标题，次轮发现编辑提示仅位于加载分支，均已修正并通过真实可见性断言。截图 `.artifacts/experts-package/expert-unpublished-*.png`；已复核390px文字/按钮布局。全量集成测试本轮未重跑（上轮47/47），真实模型执行、全量可访问性与最终头像素材仍未执行。预览六包重装/入口核对并重启18989，保留用户数据；未提交、推送、发布。D04仍为专家0.1；下一工作切片是既定C：原生对话创建引导与发布前使用预览。重点是自然语言经验信息、必要追问、可审阅草稿和示例，不增加第二个聊天框或扩大到专家团/企业后台。该切片本轮未执行。

## 本轮：D04 A+B 专业详情与真实技能选择（2026-09-12）

候选实现新增 ExpertSkillOption/listSkills 的公开契约和同一 Experts Host 的 Connection 操作；available须拥有目标专家编辑权限，equipped仅返回可读专家显式配置，不输出技能资源路径或凭据。消费公开 workdshSkills.list，当前本地稳定ID等于唯一技能名称，不把该接口宣传为企业授权目录。

编辑器不再要求手填依赖名称：真实技能可搜索、查看简介/状态、勾选、取消或确认；数量受限、重复添加不允许、失效项明确处理，旧名称引用确认选择后保存稳定skillId。移除仅解除引用；发布仍校验和冻结Skills修订。详情提供擅长领域、完整示例和配备技能真实简介/状态，并明确当前目录信息与发布固定内容的区别。

build、全量typecheck、47/47集成、规划检查/2项规划测试通过。真实独立六包安装探针新增搜索无结果/取消不改草稿/移除后仍能选择/保存稳定ID/重载，发布冻结与两次冷重启通过。初轮误写测试文件，已从本任务原读取及变更记录完整恢复原9项及后续4项并保留新增目录测试，总47项全部通过；重载后的官方配置提示遮挡测试已处理，未弱化操作断言。

本地预览已通过六包内容寻址重装与入口摘要核对，重启 18989 后实际浏览器验证「表格分析」草稿可以打开真实已安装目录并显示 officecli 选择项；未保存或修改用户草稿。截图 `.artifacts/preview-expert-skill-picker.png`，已打开页面需刷新。

D04保持in_progress/0.1；此轮只交付A+B的详情/选择器，专业内容质量仍需后续完整场景验收。C对话创建增强/使用预览、D整份Loader与远程模型交付、E既有恢复/卸载/交接等缺口继续保留，不宣称新增AT全部完成。未提交或发布。

## 本轮：专家与专家团需求及开发规划修订（2026-09-12）

本轮只改需求、UX、技术边界、验收和规划，不改运行代码或发布。PRD 1.1 将专家明确为真实能力加领域经验、专业判断与完整交付职责，团队为多专家加 SOP；保留用户三张补充图作为产品依据。新增 REQ-EXP-013～016、REQ-TEAM-004～006及追溯元数据，验收 AT-24～27、AT-T05～T07 均未执行。纠正原“专家管理占位”现状与旧弹框尺寸，区分使用详情和编辑，补真实技能选择、自然语言经验引导、可核验专业成果与团队阶段/交接/评审反馈。

D04 继续 in_progress / 0.1，D11仍todo且前置D10不变。开发计划 A～E 纳入既有 EP-05/EP-07 等包，不新建专家0.2；下一次代码从 A+B 专业详情与真实技能选择开始。团队后续 TM-01～04必须包含 SOP；通用设计器、公共运营、企业服务器/管理 Web仍后置。本轮 check:plan（26模块/50已登记文档）、2/2规划测试、git diff --check通过；另独立解析PRD YAML，22项需求与主表/来源/验收一致。初轮发现新增元数据插入到了 test_cases 后，已修正并重新解析通过。运行构建/模型/浏览器未重跑。

## 本轮补充：专家弹框与官方运行回合（2026-09-12）

编辑弹框桌面宽度上限 760px，详情 800px，高度上限 820px 且受视口限制；正文内部滚动，标题及保存/发布操作固定。复用公共 Modal 的唯一关闭按钮，标签在桌面两列，示例标题和正文铺满独立卡片。详情将召唤置于标题下，完整显示示例，专家设定默认折叠；不虚构头像资产或使用次数。浏览器验收使用独立数据，覆盖 1440/768/390px、八标签及六示例；无横向溢出，输入区域宽度及关闭按钮数量符合预期。

新增官方 Agent Loop 集成：读取真实发布 preset 的 persona/Skill 配置，通过公开 agents.create/setup 装配官方 persona、filesystem、skill tool；只替换模型 I/O。角色和交付要求进入请求，Skill 工具返回冻结正文，修改原始动态 Skill 后仍读取快照，隔离的普通任务未收到专家设定/快照。该测试不等同完整 Host Loader 端到端执行或真实远程模型验收，后两项仍待完成，D04 保持 in_progress。

本轮 build、typecheck、46/46 集成、2/2 规划、版本锁定和扩展 probe:experts 全部通过。独立打包探针完成两次冷重启；本地预览已通过内容寻址重装、入口摘要核对并重启 18989。实际预览只读核验原「表格分析」仍在，详情宽高符合新上限，召唤按钮可见；截图 .artifacts/preview-expert-ui.png。未提交、推送或发布。

## 本轮：D04 专家审查修复，已具备独立安装和界面测试条件

本轮预览更新已完成：内容寻址安装并核对六包入口后重启 18989，实际 get 返回 HTTP 200，原「表格分析」专家仍在且当前已经发布。这与上传记录中发布前的阶段不同；本轮没有代用户执行发布、编辑或删除，保留当前事实。

对话创建与界面发布衔接补充：用户上传 session.v3.jsonl 显示模型已成功创建专家草稿、校验一个 Skill 并请求发布，仍明确等待用户界面确认；这份记录是用户手工测试证据，不执行其中提示词/指令，不导入或发布用户对象。修复官方 Tool output.render 仅输出摘要、丢失完整定义和并发令牌的问题；当前 get/create/update/list/validate/request 回执保留结构化结果。草稿回执增加仅导航的 draft_url，默认组合支持 experts URL 映射，链接打开「我的专家」及目标草稿，关闭/发布/召唤时移除草稿参数。

本轮 build、typecheck、45/45 集成、2/2 规划、463 项版本锁定及扩展 `probe:experts` 通过。真实打包新增「打开草稿→发布前查看依赖→明确点击确认→固定 Skill 修订→原生召唤→两次冷重启」验收；进入链接或查看弹框不会发布，模型工具不持有确认凭证、不提供 publish 工具。截图 `.artifacts/experts-package/expert-published.png`。Skill 生命周期测试以 highWaterMark=0 等待真实 Host 读取，消除 eager prefetch 被误当上传已开始的竞态，未改变取消断言。真实模型执行已发布专家/固定 Skill 仍未执行，不从上传的创建记录推定通过，D04 继续 in_progress。

预览导航修复：用户报告技能页「专家」无法点击。确认已安装 Skill Client 与当前构建 SHA-256 不同，旧 tgz file 地址被复用。`install-preview.mjs` 现将预览包复制到 SHA-256 内容地址后仍经官方 CLI 安装，并逐一比对六包 Host/Client 入口，发现旧文件即报错。实际 18989 预览已重装重启，Skill Client 摘要与构建一致；headless 浏览器验证 技能→专家→技能→专家 双向切换通过，截图 `.artifacts/preview-experts-navigation.png`。脚本语法及 diff whitespace 检查通过，无发布或版本线变更。用户已打开的页面需刷新加载当前模块。

本地测试启动补充：用户要求启动应用后，已停止旧 18989 预览，通过 `preview:install` 更新六个独立包并启动 `pnpm preview`。认证专家目录返回 HTTP 200 / ok / 3 个默认专家。保留原预览存储和用户 Agents home，未发布 GitHub/npm。

本轮按用户“继续”完成四项审查修复：治理提供方的独立 Profile 装配、原生执行前校验、按 Session 定向且只填空输入的草稿交接、冻结 preset 的摘要核对与复用。真实安装进一步修正 Cordis Service 初始化、官方 ApiSessionNotFound 异常兼容，以及召唤任务的 Workspace ID 关联。详情弹框为关闭按钮保留空间，避免挡住管理菜单。

Node 22.23.2 / Harness 0.1.5-rc.1 / Cordis 4.0.2 下：build、typecheck、44/44 集成、2/2 规划、463 项依赖锁定通过。新增 `corepack pnpm probe:experts` 在仓库外隔离安装 identity/audit/access/skills/experts/bundle 六个独立包，验证真实 Host、默认专家目录、原生任务绑定、浏览器示例召唤和制作专家草稿、用户已有输入保护、不同 Session 隔离，以及两次 Host 冷重启。截图、运行报告位于 `.artifacts/experts-package/`。详细证据见 [审查修复验证](evidence/d04-experts-review-fixes.md)，装配决策见 [ADR-0019](adr/0019-installable-host-self-containment-and-governance-assembly.md)。

**D04 保持 in_progress，不声明专家 0.1 全部完成。** 本轮浏览器仅准备任务，未发送模型请求；执行 guard 的回归使用公开 agent/pre-step waterfall，不能代替真实 Agent loop 验收。仍需按既有 EP-07 核验真实模型 persona/固定 Skill 运行、跨插件停用与卸载后的运行安全、真实关联交接、导入导出反例及故障恢复。guard 当前随 Experts 插件注册，移除插件后的遗留 preset 防护尚未验收；preset 写入失败的原子恢复、模型选择失败后已创建 Session 的结果恢复仍需核验。安装态 Host 入口不依赖 private workspace 运行时包，但部分导出声明仍引用 private contracts，仓库外 TypeScript 消费验收未执行。

当前修复为未发布候选，不更新模块版本线，不自动推送或发布；按随后启动测试指令更新了本地预览 Profile。企业服务器、管理 Web、公共发布与专家团仍按既有后期计划，不增加当前验收范围。以下历史“专家规划中/未开始/真实安装阻塞”的陈述已由本节替代。

## 上轮：按模块发布 GitHub 制品

用户明确暂停旧桌面兼容性改造，转为推送现有代码、完善中英文 README 和上传模块对应安装包。本轮不修改 Skill 运行逻辑、不升级桌面应用、不更改用户 ssh Profile。

交付映射：`skills-v0.1.0-alpha.24` → 独立 Skill 包；`bundle-v0.1.0-alpha.39` → 可选展示组合包。各自附 tgz、SHA256SUMS、带源提交的 release-manifest.json。其他模块的源码/设计同步提交，但尚未独立交付的模块不伪造安装包；规则见 [模块发布说明](RELEASES.md)。

中英文 README 已按插件特色、真实截图、模块下载、安装步骤、路线图和开发入口重写。测试截图来自当前正式打包制品与隔离演示数据，替换旧原型截图。公开材料同步明确：Harness 0.1.5-rc.1 Web 已通过；DSH Desktop 2.0.5 内置 0.1.2-rc.1 安装后入口缺失仍未修复，不能以市场显示“启用中”推断 Client 激活。

本轮重跑 build、typecheck、33/33 集成、2/2 规划、463 项依赖锁定、probe:skills 和 probe:browser 均通过。真实模型、其他操作系统图形端、旧桌面兼容修复和完整 live CLI 热卸载未执行。GitHub 代码与两个模块 tag 已推送，制品源提交为 `c6e0fd5`；两个预发布及全部六个附件已发布，并通过无认证公开下载回读 SHA-256 校验。README 中英文正文与三张嵌入截图已从 GitHub 原始地址回读一致。运行功能版本保持不变。

## 上轮：Skill 独立插件改造完成

按用户授权落实 ADR-0018，完成 D04 前置交付修正：Skill `0.1.0-alpha.24` 有独立 Host/Client、官方配置层与浏览器制品；bundle `alpha.39` 不再隐藏初始化 Skill，默认预览通过官方 CLI 显式安装两层。Workbench `alpha.10` 改为正式子插件注册，独立分发仍待其后续交付，不声称全部模块均已改造。

`workdsh-contracts@0.1.0-alpha.5` 新增 `./skills` 本地管理服务 v1。真实 Cordis 测试验证两个消费者共享、提供方缺失/恢复和上传取消清理；独立 tarball 在仓库外安装后通过真实浏览器编辑、冲突、启停、卸载/恢复及移除重装。默认产品浏览器回归和冷重启均通过；证据与边界见[独立交付验收](evidence/skills-standalone-package.md)。

本轮无开发阻塞；npm 发布、真实模型和完整运行中 CLI 热卸载未执行。当前仍为 Skill 0.1，D04 专家业务未开始。下一项业务仍按既有专家交接包实施，不增加公共市场、企业后台或新的产品版本。新预览安装命令为 `corepack pnpm preview:install`，在预览停止时执行，再启动 `corepack pnpm preview`。

本地预览 Profile 已通过官方 CLI 更新至 Skill alpha.24 + bundle alpha.39，18989 已启动；认证目录请求返回 200，当前读取 16 项技能。使用原有用户 Agents home，未迁移或删除技能文件。默认组合额外验证了双向移除：移除 Skill 后工作台/新会话可用，移除展示包后 Skill 仍可用。

## 当前模块版本

版本规划已固定为“一个模块一条版本线”，详见 [模块版本规划](MODULE-VERSIONS.md)。技能管理模块 **0.1** 已完成当前默认/本地范围，制品为 `workdsh-plugin-skills@0.1.0-alpha.24`；治理契约、本地身份、资源授权和审计的本地 **0.1** 基线已经完成；工作台与共享 UI **0.1** 已完成，当前开发顺序进入专家模块 D04。`workdsh-bundle@0.1.0-alpha.39` 仍表示当前本地候选组合版本，不代替各模块版本。`modules.json` 与 `check:plan` 已加入版本线和 package major/minor 一致性检查。

Skill 0.1 提前切片现已正式结项：`development-order.activeSlice` 标为 completed，`packages/plugins/skills` 标为 implemented，P1-03 标为 completed。D01—D03 已按本地交付范围过序；这不表示业务不可变 SkillRevision 与所有管理入口的 ActorContext/access/audit 适配已经实现。D04 需要的技能依赖修订/治理适配见专家交接方案，不重复开发技能页面和本地管理闭环。

D01、D02 及提前完成的 D03 Skill 0.1 均已收口，当前步骤进入 D04 专家模块。`workdsh-contracts@0.1.0-alpha.5` 定义服务端解析的 ActorContext、IdentityProfile、Organization、Membership、ResourceOwner、AccessGrant、AuthorizationDecision、SessionOwnerBinding、RuntimeBinding、AuditEvent 及 identity/access/audit 提供方接口，并增加审计排空边界。该包无 Cordis、UI、数据库或传输依赖；架构依据见 ADR-0016。

P0-05 的本地基线交付为 `workdsh-provider-identity-local@0.1.0-alpha.3`。本地 provider 已注册为 Cordis Host Service，通过官方 `ctx.storageDomain` 原子保存主体、个人组织与 owner 成员关系；冷启动保持同一 revision，配置与持久身份冲突时拒绝启动。principal/organization 仍只来自 Host 配置，每次请求生成独立 requestId，输入夹带的伪造身份字段会被忽略。Harness 官方匿名安装 ID 明确只用于遥测关联，未被误用为用户身份。

`workdsh-plugin-audit@0.1.0-alpha.2` 和 `workdsh-plugin-access@0.1.0-alpha.3` 已建立真实 Cordis Host Service。两者使用官方 Storage Domain 分域持久化；Access 只经 IdentityService 查询成员关系，实行组织隔离、资源 owner、显式 grant/revoke、revision 冲突检测，并在返回授权结果前写入审计。独立 Session owner Domain 与官方工具流水线桥接已生效；新增 `workdshSessionAccess` Host 入口，在调用官方 Session Controller 创建前先保留不可替换的 owner，并在恢复 Agent 前按最新成员关系和 grant 重新授权。个人 Profile 可首次工具调用自动绑定；企业式组合应关闭该回退并只从受控入口创建/恢复。该入口当前是 Host Service；企业外部 Session Remote、文件与其他 Remote 的多人治理、成员撤权后的在途取消、服务器端认证和管理 Web 已集中记录到[企业版架构说明](ENTERPRISE-EDITION.md)，不再阻塞本地 D01。团队远程入口继续关闭。证据见 [Access 与 Audit 验证](evidence/d01-access-audit.md)。

当前根构建、类型检查、33/33 集成测试、2/2 规划测试、计划清单、版本锁定和补丁格式检查均通过。

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


## 2026-09-12：D02 工作台代码边界收口

workbench `0.1.0-alpha.9` / bundle `0.1.0-alpha.36` 将公开入口、Harness Slot 装配、TSX 页面结构和样式拆开。`packages/plugins/workbench/src/index.ts` 只导出装配函数，`src/harness/client.ts` 只负责官方 Slot 注册，`BusinessPanel.tsx` 和独立样式模块负责展示。没有创建第二个 React root，也没有改变 Harness 对 Sidebar、Workspace、Session 和 Conversation 的所有权。Node 22.23.2 下相关 build/typecheck、32/32 集成测试及完整打包浏览器探针通过。

bundle `0.1.0-alpha.37` 同样拆分默认 Client 入口、Harness 装配、品牌、URL 状态、诊断 TSX 与样式，并把 D01 接入验证限制为显式 `diagnostics=1`。普通产品路径不再注册诊断 panel 或导航，未知/诊断 view 均回到原生 Conversation。完整打包浏览器探针已覆盖显式诊断可用、普通路径诊断不可见、刷新归一化、重连、停服移除与重装。

## 2026-09-12：本地 D01 收口与企业版后置

D01 的完成范围现明确为本地单用户产品基线：锁定 Harness 官方扩展方式，完成干净安装、官方 Client/Host 组合、默认/本地 Skill 消费与恢复、可信 local identity、资源授权、审计、Session owner/runtime binding 和官方工具 guard。发布版 Typert 对外部 workspace 的生成兼容问题不影响当前采用官方 Connection exact Fetch 的本地功能。

企业 Session Remote、服务器认证、组织成员管理、文件与其他 Remote 的全路径多人授权、撤权后的在途取消、隔离 Worker、管理 Web 和组织能力分发均移入[企业版架构说明](ENTERPRISE-EDITION.md)与 [ToDo](TODO.md)。这些能力不会从计划中消失，也不再被写成当前本地版本的伪完成条件。P0-02—P0-05 和 P1-09 的 `completed` 只表示本地基线完成；企业版必须以 E01—E05 重新立项和验收。

结构化顺序台账已把 D01—D03 标为 completed，当前步骤为 D04 专家模块。企业服务端继续保持后置。

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
- 后续修订：P1-09 本地治理基线是本地业务模块前置；P1-10 已移入后期企业版，不再作为当前本地发布门槛。
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
| P0-02 | bundle/Host/Client 安装链探针 | P0 | completed |
| P0-03 | 专家预设、技能与恢复探针 | P0 | completed |
| P0-04 | 契约与兼容门槛 | P0 | completed |
| P0-05 | 团队身份与全路径隔离探针 | P0 | completed |
| P1-01 | 契约与工作台 | P1 | completed |
| P1-02 | 专家管理及 expert-manager | P1 | todo |
| P1-03 | 技能管理及 skill-creator | P1 | completed |
| P1-04 | 连接器管理 | P1 | todo |
| P1-05 | 行业应用与项目 | P1 | todo |
| P1-06 | 资料库与成果 | P1 | todo |
| P1-07 | 跨插件业务执行 | P1 | todo |
| P1-08 | P1 发布验收 | P1 | todo |
| P1-09 | 团队基础实现 | P1 | completed |
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

## 2026-09-12：D02 完成与跨平台品牌资产

共享 UI `0.1.0-alpha.4` 将公开入口收为纯导出文件，Icon、LogoMark、导航组件、Modal、设计令牌及样式分别维护；Skills 与 Workbench 继续通过相同公开 API 消费。默认组合包升级为 `0.1.0-alpha.38`，Harness Sidebar 品牌 Slot 使用共享 LogoMark，未创建额外 React root 或修改上游。

新增跨平台 WorkDSH 主标与应用图标：蓝色折叠 W 配青色智能火花，分别提供透明 SVG、通用圆角底座 SVG 与高分辨率 PNG 视觉稿。品牌不绑定单一桌面系统，也不复用 WorkBuddy、DeepSeek Harness 或其他产品的商标图形。

D02 的工作台行为、公共 UI 边界、失败恢复和打包浏览器条件已满足；D03 Skill 0.1 使用既有完整管理闭环证据正式过序。当前唯一下一阶段为 D04 专家模块 0.1；企业服务端和管理 Web 仍留在后期 ToDo。


## 2026-09-12 专家与专家团文档交接

按用户要求交付 [专家开发文档包](design/experts/README.md)：PRD、三图交互规范、Host/Client 技术架构、拟新增契约、专家团设计、官方依据和 7 个有限开发包。15 条需求映射到 23 条单专家验收和 4 条团队验收；新增 ADR-0017 为 Proposed，公开接口须在实施时验证。

当前源码审查确认专家仍为规划目录；现有 contracts 仅导出治理契约，Skill 摘要/digest 不等于不可变业务修订，受控 Session bridge 不自动覆盖所有原生入口，实验性 Agent Team 未在当前锁定依赖中。已在方案中明确这些缺口和验证条件，避免接手工具假设接口已存在。

本次没有修改业务运行源码、安装新依赖或递增包版本。currentStep 仍为 D04、状态 todo；D11 团队与企业后台继续后置。验证结果见 [文档核对记录](design/experts/REFERENCES.md)。


## 2026-09-12 插件交付边界复核

用户指出目录结构不能证明真实独立插件。核对官方入门、生命周期和打包教程后确认：workdsh-bundle 是官方机制组合包，但其中直接调用 Skill Host/Client 和 Workbench helper，尚未建立各功能完整的独立 Fiber/自动安装边界；experts 等仍为规划目录。服务类插件、共享库和可安装 bundle 必须分别描述。

已补 [复核说明](design/experts/PLUGIN-DELIVERY-REVIEW.md) 并纳入 D04 EP-01/G05、EP-07/AT-20。单功能独立安装/加载/移除的结论不能由整个 bundle 安装证据推导。本次仅修正文档约束，未重构业务代码；实际入口与制品修正由后续实施验证。


## 2026-09-12 Skill 独立制品原状实测

按用户要求对原有 skills alpha.23 执行真实 build、pack、隔离 Profile 的官方 plugin add 和 dump-config。构建/打包/普通依赖安装通过，但包缺少 dsh.bundle 与 dsh.client，CLI 明确告警未激活 Profile layer，配置中没有 Skill 插件。详见 [独立包验证](evidence/skills-standalone-package.md)。

此前 Skill 0.1 本地业务闭环完成的证据仍指随 workdsh-bundle 运行，不包含独立插件发行。独立打包发布安装目标尚未完成；本次没有发布 npm 或修改原包来改变验证结果。

## 2026-09-12 全平台插件组合与共享依赖说明

针对“独立打包是否影响全局、专家如何包含 Skill”，补充 [ADR-0018](adr/0018-composable-feature-plugins-and-shared-skills.md)。用户随后明确要求遵循 Harness 自身的插件组合精神，架构方向已 Accepted，实施仍未完成。官方底座和自有功能统一用官方插件机制装配，不建立业务大核心；专家保存共享技能引用，contracts/ui 保持库，npm 制品、Cordis 服务和业务修订分别管理。明确必需依赖消失会影响消费者，插件移除不等于删除用户数据，当前不能承诺完整热卸载或独立 Skill 发行已完成。约束已同步 AGENTS 和专家交付复核。

本次只补架构与交接文档、文档检查清单；不修改运行源码、依赖版本或 currentStep。公共市场和企业服务端继续后置；Skill 独立交付修正仍纳入既有 D04 前置与 EP-01/EP-07 验收，不增加新阶段。

验证：文档计划检查通过（26 模块、50 文档），本轮文档相对链接与代码围栏检查、git diff --check 通过。产品构建、运行测试、浏览器与模型调用未执行。

## 2026-09-12 Skill 独立插件改造进行中

用户已授权实施 ADR-0018。当前工作为 D04 的 Skill 0.1 交付前置修正：独立 Host/Client、显式 Profile 组合、公共技能服务契约及制品/生命周期验收。沿用既有业务功能和数据目录，不启动专家业务或公共/企业功能；验证结果写入 skills-standalone-package 证据。此处保留开始时的范围记录；后续完成结果见本文顶部及独立交付验收，不能以原 alpha.23 打包记录代替 alpha.24 运行证据。

安装回执：仅通过官方 dsh plugin --profile preview add 更新 Office 制品，已比对安装后的 Host/Client 与当前 dist 字节完全一致。18989 预览恢复运行，dsh-cost-meter 保留。实际文件资源 Tab 打开导出的 PPTX，修改图表 8→9，原文件字节不变，应用探针通过。未自动提交、推送或发布 npm。
