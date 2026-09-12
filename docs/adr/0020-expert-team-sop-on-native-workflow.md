# ADR-0020：专家团SOP复用原生Workflow，领域负责成员与验收

## 状态

Proposed，2026-09-12。依据用户本轮对专家团需求的反馈提出，供审阅；不是实现完成或D11启动记录。保留ADR-0017/0018的专家修订与功能插件交付原则。

## 背景

专家团是多个真实专家与SOP：执行先后、并行、输入输出交接、评审、返工和完整交付。旧方案虽列出SOP字段，却主要强调主持人调用subagent，容易将执行约束退化为提示词约定，并把原生workflow误归入后续通用配置。

当前锁定Harness0.1.5-rc.1。安装的workflow与subagent能力不是现成专家团产品。phase只做呈现，原生spawn请求没有专家preset字段；composeFrom继承父组合。直接调用WorkflowEngine也不保证得到原生tool-workflow的持久呈现事件，不能用网页最新接口假定已支持。

## 决策提议

采用“固定TeamRevision与SOP → Host校验/受信编译 → 官方WorkflowEngine → 公开provider成员绑定 → 原生子Agent → 成果验收/评审 → 有界返工与汇总”。首版就复用原生workflow，通用流程设计器、任意JS导入和实验性Agent Team后置。

WorkDSH拥有专家/团队修订、业务授权、阶段契约和验收证据。原生底座拥有真实Agent执行、模型/工具调用、workflow运行与子Agent生命周期。业务阶段是否验收通过需要持久化；它不是第二套Agent运行状态，也不能由原生completed自动得出。

主持人负责问题澄清、专业评审和交付，在声明范围内选择分支；不能跳必需阶段或自行扩大权限。每个成员绑定真实ExpertRevision及其固定技能，子任务使用最小必要输入。评审失败产生有限新attempt；输入变更后重新验收受影响下游，不覆盖历史失败。

首版实现路径由TM-01验证：公开Agent创建setup与agentPresets.mount能否挂精确成员组合并持久绑定；原生loop/句柄是否可完整复用；受信阶段调用授权与输出核验如何接入；Session持久事件及Conversation公开呈现如何复用。共享driver公开函数不提供preset/setup覆盖，不复制其内部逻辑。失败记录具体缺口，不能以父预设加persona冒充成员。未经验证的跨重启自动续跑不开放。

功能归属继续在专家插件团队功能内；一个TeamRevision或虚拟成员是业务对象，不各发一个代码插件。公共Skill仍由共享Skill服务管理。企业服务器/Web后台不为本地首版加入。

## 备选方案

| 方案 | 优点 | 不选择的原因 |
|---|---|---|
| 主持人prompt描述团队，直接自由委派 | 接入少、动态灵活 | 不强制依赖、真实成员身份、验收及返工，难保证完整交付 |
| WorkDSH自建通用调度器与Agent循环 | 全面自控 | 复制Harness底座，生命周期与取消/恢复成本大，违反项目原则 |
| 原生workflow加业务SOP适配（选择） | 执行复用、业务约束清楚，可有限验收 | 需要编译/成员绑定与业务证据适配，先证明公开接口可行 |
| 实验性持续Agent Team作为首版 | 更自然的常驻协作 | 当前lock未包含，且邮箱/共享任务不能代替SOP质量门槛 |

## 后果与非功能约束

- 正面：顺序与评审可验证，真实专家组合不被角色名替代，不再维护第二套执行底座。
- 代价：SOP契约、受信编译、绑定和验收要维护兼容性；固定流程灵活性有限，需要明确受控变更。
- 有限资源：成员建议2～8、并发3、深度1；返工/总调用上限配置并验证。均为产品建议，不冒充官方默认值。
- 数据与安全：权限按发起主体最新状态检查，凭据不在成员间复制；共享写串行或经过真实隔离验收。可信本地插件与worker不是企业安全沙箱。
- 可观察与恢复：nativeChildRef与Session事实关联，不造假执行进度。取消持有真实run并dispose；外部写入状态未知不自动重试，重启先诊断。
- 范围：D04继续既定专业验收；D11仍todo/前置D10。团队仅TM-01～04四包，验收要求见方案第8.6节，不借架构修订启动新的产品版本。

## 依据

- [专家团技术方案第8节](../design/experts/EXPERT-TEAMS.md)：产品流程、能力复用核对与验收。
- [有限开发计划](../design/experts/DEVELOPMENT-PLAN.md)：既有TM-01～04范围。
- [官方Workflow](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/workflow)、[官方Subagent](https://deepseek-harness.github.io/deepseek-harness/reference/subsystems/subagent)。
- 锁定发布包公开声明：dsh-workflow的WorkflowEngine/WorkflowStartRequest；dsh-subagent的SubagentStartRequest；dsh-agent-presets的mount/composeFrom；dsh-subagent-in-process-driver的startInProcessRun。声明检查不是运行验收。


## 官方子系统复核后的限定

详见[专家团方案第9节](../design/experts/EXPERT-TEAMS.md)：固定SOP使用one-shot属于首版范围选择；多轮专家须评估原生continuable及冷恢复，不能自建Activation或inbox。实验性Agent Teams已有peer mailbox与任务blockers，不将它们视为框架缺失，但当前lock未包含，先核对兼容与装配。候选成员provider只有确认现有公开组合不能满足业务差异后才实施；continuable的prepareContinuable仅提供seed，不能沿用one-shot自定义创建假设。TM-01先输出三条路线能力矩阵和证据，再收敛最小适配。
