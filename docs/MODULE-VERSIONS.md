# WorkDSH 模块版本规划

状态：强制执行。版本单位是模块，不是页面、开发任务或临时切片。

## 版本模型

- 每个可独立交付的功能模块维护自己的 SemVer 版本线。当前技能模块版本线为 **0.1**，对应包 `workdsh-plugin-skills` 的开发制品 `0.1.0-alpha.N`。
- `主版本.次版本` 表示模块能力基线；补丁位表示同一基线内兼容修复，`alpha.N`、`beta.N`、`rc.N` 表示该模块的预发布迭代。
- 同一模块内的 Host、Client、Remote、资源、内置管理 Skill 和迁移文件属于一个模块版本，不能分别宣称互不相干的产品版本。
- 不同模块独立推进，不要求技能、专家、连接器、工作台和资料库锁步升级。只有实际发生变化的模块增加版本。
- 默认组合包维护自己的集成版本，并记录所组合模块的精确制品版本。组合包版本不能替代功能模块版本，也不能把未变化模块一起算作升级。
- 用户创建的 Skill、Expert、Project 等业务对象使用各自的 revision/schemaVersion；它们不跟随 npm 模块版本增长，模块升级也不能覆盖用户对象。

## 版本递增规则

| 变化 | 0.x 阶段规则 | 示例 |
| --- | --- | --- |
| 首个可评审模块切片 | 建立 `0.1` 版本线，开发包使用 `0.1.0-alpha.1` 起步 | 技能模块 `0.1` |
| 同一能力基线内的兼容修复或补全 | 增加 patch 或预发布序号 | `0.1.0-alpha.8` → `0.1.0-alpha.9` |
| 新增一组对外能力或公开契约发生不兼容变化 | 增加 minor，并给出迁移与消费者验证 | `0.1` → `0.2` |
| 稳定公开契约后的不兼容变化 | 增加 major | `1.x` → `2.0` |

开始模块开发时，必须在 `docs/modules.json` 写入 `moduleVersion`；模块 README、package.json、CHANGELOG、证据和 STATUS 使用同一版本线。`check:plan` 会验证模块版本格式、当前活动切片的版本声明，以及 package.json 的 major/minor 是否匹配。

## 当前版本线

| 模块 | 模块版本线 | 当前开发制品 | 说明 |
| --- | --- | --- | --- |
| 领域公开契约 | **0.1** | `workdsh-contracts@0.1.0-alpha.2` | P0-04 实施中；已包含 Host identity profile/service 契约，access/audit 实现随后接入 |
| 本地身份提供方 | **0.1** | `workdsh-provider-identity-local@0.1.0-alpha.2` | P0-05 实施中；官方 Storage Domain 持久化可信单用户 Profile，不用于远程认证 |
| 技能管理 | **0.1** | `workdsh-plugin-skills@0.1.0-alpha.23` | 默认/本地管理闭环完成；公共市场不在当前范围，企业服务端与管理 Web 列入后期 ToDo |
| 工作台 | 0.1 | `workdsh-plugin-workbench@0.1.0-alpha.8` | 官方 Sidebar/Conversation 组合切片 |
| 共享 UI | 0.1 | `workdsh-ui@0.1.0-alpha.3` | 公共展示基础与可访问弹框 |
| 默认组合包 | 0.1 | `workdsh-bundle@0.1.0-alpha.35` | 集成版本，记录前三项的具体制品 |

专家、连接器、资料库等 planned 模块在开始实际开发时再建立各自版本线，不为占位目录虚构版本。
