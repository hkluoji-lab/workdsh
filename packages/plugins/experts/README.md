# WorkDSH 专家插件 / Experts plugin

专家模块版本线：**0.1**。当前候选包：`workdsh-plugin-experts@0.1.0-alpha.1`，alpha 测试版。支持独立安装及实际原生模型执行，专业报告质量和最终稳定性验收仍在进行。

An independently installable DeepSeek Harness plugin managing multiple local experts. This alpha supports expert management and native model execution. Professional report quality and final stability acceptance remain incomplete.

## 能力与边界

- 默认专家与我的专家目录、搜索、详情、收藏、复制、草稿编辑、校验与受信界面确认发布。
- 发布冻结专家定义、Skill 修订与原生 Agent preset；已有构件摘要漂移时拒绝静默覆盖。
- 召唤和示例创建关联原生任务，示例仅填空输入，不自动发送；制作专家进入原生任务并加载 `expert-manager` 指引。
- Connection 页面操作和 Agent 管理工具调用同一个 `workdshExperts` Host 服务。
- 本模块管理多个专家对象；一个专家不是一个 npm 包。专家团、公共市场与企业管理 Web 不在当前交付范围。

## 官方装配与依赖

基线为 Harness `0.1.5-rc.1` / Cordis `4.0.2`。包通过 `dsh.bundle.patch` 贡献 Host 配置层，Client 使用官方模块注册与公开 Conversation 扩展面。治理、技能和专家是独立提供方，bundle 只负责展示组合。

本地组合需显式安装 `workdsh-provider-identity-local`、`workdsh-plugin-audit`、`workdsh-plugin-access`（含 Session/Tool 桥）、`workdsh-plugin-skills`、本包；可选安装 `workdsh-bundle` 提供工作台导航。Host 必需依赖按 `src/index.ts` 的 inject 声明解析，不通过导入其他插件内部源码装配。跨插件使用公开 contracts 和注入服务。

在仓库根目录使用 Node 22 与固定 pnpm：

```sh
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test:integration
corepack pnpm probe:experts
```

`probe:experts` 将六个包打成 tgz，经官方 CLI 在仓库外临时 Profile 中安装，执行 headless 浏览器与冷重启验证。制品、截图和报告保存在 `.artifacts/experts-package/`，不会安装到用户现有预览。

对话工具回执保留完整定义与并发令牌，并返回 draft_url 打开目标草稿。链接仅用于同源导航，不含发布授权；用户仍需在界面查看内容与依赖后明确确认发布。

## 当前证据与限制

真实打包验证覆盖：默认目录、原生任务绑定、示例草稿、制作专家草稿、不覆盖已有输入、不同 Session 隔离、无浏览器错误及两次冷重启。52/52 集成测试通过；测试中的身份、Session/preset 替身与真实打包测试必须分开解读。

UI：详情与编辑器均复用公共弹框，桌面分别限制为 800px/760px，正文内部滚动。示例正文完整显示，编辑输入框铺满卡片，标签两列；三尺寸浏览器验收覆盖八标签、六示例。

运行集成：真实发布 persona 和冻结 Skill 配置已通过官方 Agent Loop 回合验证；修改动态源仍读取冻结内容，普通任务未收到专家设定。模型 I/O 使用固定适配器，受测配置通过公开 Agent setup 接口装配；不能替代完整 Host Loader 与真实远程模型验收。

尚未验收：真实模型专业报告全部签收、移除插件后遗留 preset 的防护、完整关联交接、导入导出反例与故障恢复。公开 pre-step guard 随 Experts 插件注册，不能据此声明移除后的安全已经验证。部分公开声明仍引用 private contracts，仓库外 TypeScript 消费尚未验收。

模块保持 D04 `in_progress`。详见 [状态](../../../docs/STATUS.md)、[开发交接包](../../../docs/design/experts/README.md) 和 [审查修复证据](../../../docs/evidence/d04-experts-review-fixes.md)。

本轮 A+B 候选：编辑器支持真实已安装技能搜索、状态、勾选/取消、移除和稳定 skillId 保存；详情展示擅长领域、任务示例及真实配备技能简介/状态。目录通过公开 Skills 服务查询，不含资源路径；当前本地名称即稳定ID，不等同企业级授权目录。独立打包验证选择/保存重载、发布冻结和冷重启通过，完整专业场景交付仍待验收。

C候选：对话创建指南纳入专业经验、必要追问、成果标准与真实目录工具 `workdsh_expert_list_skills`；该工具与UI调用同一Host，不输出资源路径、不提供发布权限。发布确认页提供完整使用预览，读取同一草稿修订的已保存定义，取消不发布，确认摘要变化则要求重新预览。真实模型运行证据与专业签收现已分开记录，见下文。


D验收：显式 `corepack pnpm probe:experts:professional [incomplete|dirty]` 使用临时Profile、合成CSV与预览已配置DeepSeek引用；需要系统zstd核对官方持久v3日志，普通测试不需要模型。三个真实场景的完整安装态preset、固定技能回执、实际计算、completed及冷启动绑定已通过独立复查。报告确实生成，收入与门店贡献对账；信息不足时未知指标保持null并追问。补充方法后正常/脏数据均已真实复验，订单结构、行公式及细粒度边界得到改善；最新脏数据报告的反向单位假设与缺失数据解释仍有专业语义缺口，不能写专家整体完成。dirty主探针完整通过，normal在纠正质量说明格式限制后由只读复查/冷启动验证，修正格式后的整条重跑未执行。现有用户专家与任务未改变，模块继续0.1。


## 下载与安装 / Download and install

从[Experts alpha.1 GitHub Release](https://github.com/techflag/workdsh/releases/tag/experts-v0.1.0-alpha.1)下载配套tgz。使用匹配的Harness0.1.5-rc.1官方CLI，停止目标Profile后安装。/ Download the matching archives and stop the target Profile before installation.

```sh
dsh --profile workdsh --from-default-profile web --dump-config
dsh plugin --profile workdsh add /absolute/path/workdsh-provider-identity-local-0.1.0-alpha.4.tgz
dsh plugin --profile workdsh add /absolute/path/workdsh-plugin-audit-0.1.0-alpha.3.tgz
dsh plugin --profile workdsh add /absolute/path/workdsh-plugin-access-0.1.0-alpha.4.tgz
dsh plugin --profile workdsh add /absolute/path/workdsh-plugin-skills-0.1.0-alpha.25.tgz
dsh plugin --profile workdsh add /absolute/path/workdsh-plugin-experts-0.1.0-alpha.1.tgz
# Optional presentation / 可选展示层
dsh plugin --profile workdsh add /absolute/path/workdsh-bundle-0.1.0-alpha.40.tgz
dsh --profile workdsh
```

打开专家入口，复制默认专家或通过“制作专家”准备原生创建对话。保存草稿→校验→预览并确认发布→召唤→在原生输入框明确发送。模型在Harness设置中配置，插件不附带API Key。/ Open Experts, copy a default expert or prepare a creation conversation. Save, validate, review and publish, then summon and explicitly send the native task. Configure your own model in Harness.

已验证虚构CSV场景中的真实Skill读取、文件读取、Python计算、成果生成和冷重启绑定；不代表任意专业结论可靠。脏数据报告仍有单位假设排除及局部转化率向整体推断两项语义缺口。跨平台、旧Desktop、完整热卸载和团队SOP未验收或未实现。/ Synthetic CSV probes verified actual Skill/file reads, Python execution, artifacts and cold-restart bindings. Two dirty-data interpretation findings remain open; this is not a guarantee of professional conclusions. Teams and enterprise administration are excluded.
