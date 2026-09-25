## 0.1.0-alpha.9 — Unreleased（2026-09-25）

- 过期编译器修订改为**自动迁移，不再要求用户重新发布**：`experts-manager.ts` 的 `ensureCurrentExecutionRevision` 由「仅团队修订」泛化为任意 `compilerVersion` 过期的已发布修订，并新增 `ensureCompilerCurrent()` 在 `[Service.init]` 启动时与 `list()`／`get()` 读取前扫描并重编译。旧修订行按 [ADR-0010](../../../docs/adr/0010-immutable-preset-revisions.md) 保持只读不改写，结果写成派生修订并前移 `publishedRevisionRef`，审计码 `experts/compiler-migration-succeeded`（失败记 `experts/compiler-migration-failed`）。
- 逐专家 best-effort：单个修订迁移失败只审计并跳过，不阻断启动与列表，下次读取或召唤执行会重试；不可重建的修订（例如技能快照已消失）仍以显式诊断呈现，不回退成默认组合。
- 覆盖内置默认专家：默认专家的 `publish()` 被 `default-immutable` 拒绝，此前无法靠重新发布恢复；现在与个人专家走同一自愈路径。
- `readExpertPreset` 仍是**永不重编译、永不改写声明**的读取器；仍收到 `experts/preset-broken` 即表示该修订迁移未成功，错误文案已同步说明「历史任务不会自动换用新组合」。
- 退出证据：`expert-manager` 20/20（新增 `published revisions of an older compiler self-heal at boot and on catalog reads`，覆盖单专家、默认专家冷启动与不可重建修订的最尽力语义）、`expert-native-presets` + `expert-results` + `expert-package-authoring` + `expert-authoring-skill` 14/14；`typecheck`、`build`、`check:plan`、`check:versions` 通过。

## 0.1.0-alpha.8 — Unreleased（2026-09-24）

- 适配 DeepSeek Harness `0.1.7-alpha.1`（2026-09-25，并入本未发布增量，不单独 bump）：专家预设注册表换主——`preset-compiler.ts` 改经官方 `AgentPresetRegistry.register` 注册并由 `ctx.effect` 释放，基线预设从 Loader 条目 + 官方 `@deepseek-ai/dsh-agent-preset` 解析；`experts-manager.ts` 的 `resolve('standard')` / `list()` 改读官方注册表；`index.ts` 把 `agentPresets` 纳入必需注入；`@deepseek-ai/dsh-agent-presets` 按官方改名移除。
- 0.1.6 时代发布的专家修订其 `presetRevisionRef` 仍指向旧 `wd-exp-*`，0.1.7 新路径下无对应 `preset.json`，本版对其显式抛 `experts/preset-broken`、UI 显示「专家 preset 异常」，旧数据保留只读（线上 `dsh.10ge.cn` 实测 12 个专家中 4 个 broken，revision 与旧预设目录原样保留、数据无损）。**该口径已被 α.9 取代**：过期修订现在由专家服务在启动与读取时自动重编译，不再要求用户重新发布，也不再对内置默认专家给出无法完成的动作要求。
- 客户端样式改用 0.1.7 语义 token 词表：清除 `var(--dsw-*)` 硬编码 fallback，词表外旧名字替换为官方 `--dsw-alias-*`。
- 退出证据：`expert-manager` + `expert-native-presets` + `expert-results` 25/25 pass；`probe:experts` 13/13、`probe:experts:official`、`probe:experts:professional`、`probe:presets` 6 PASS + 1 OBSERVED、`probe:theme` 全 PASS。
- 作者信息改由 Host 投影：client 不再 `import { parseDocument } from 'yaml'`，专家列表、详情与制作流程统一读取 `ExpertDetail.draftDisplay` / `revisionDisplay`（契约见 `workdsh-contracts@0.1.0-alpha.10`）。front matter 只在 Host 侧解析一次，投影为派生只读值，不回写授权文件。
- 效果：专家 client 包不再携带 YAML 解析器，`dist/client.browser.js` 为 raw 115,250 B ／ gzip 30,155 B（P1-2 首包体积）。
- 未改变专家授权文件的格式与语义，也未改变已有公开方法签名。

## 0.1.0-alpha.7 — Unreleased（2026-09-20）

- 按用户决定删除能力中心「行业应用」标签入口（行业应用暂时用不到，暂无领域实现）；能力页工具栏保留专家/技能/连接器三个标签。

## 0.1.0-alpha.6 — Unreleased（2026-09-20）

- 修复设置面板出现两个「Agent 预设」页：`settings.section` 是增量 list 槽（每次注册各自成页，无替换语义），PresetMenu 对它的包装注册只会在官方页旁再生成一个同名页。现移除该包装注册，仅保留 `conversation.hero.agentPreset` 单座槽的接管（专家预设过滤与设为默认/复制守卫继续生效）；设置页列表回到官方 Host 行为。
- 测试同步：`expert-native-presets` 断言单一注册并新增防回归检查（注册项不得包含 `settings.section`）。

## 0.1.0-alpha.5 — 2026-09-18

- 适配 DeepSeek Harness 0.1.6-alpha.2：成员与子代理根会话改用官方 `sessions.subagentAddress` 解析；打开专家会话改用官方 `uiWorkspace.openSession` 导航。

## 0.1.0-alpha.4 — 2026-09-16

- 增加专家团长任务、浏览器重连、人工停止后原成员继续、任务与消息交接、失败及 Host 冷恢复验收。
- 增加显式真实模型验收，真实 lead、analyst 与 reviewer 完成两阶段官方 Team 任务交接。
- 验收凭据只进入一次性 DSH Home，退出时清理并对日志脱敏。

## 0.1.0-alpha.3 — 2026-09-15

## Unreleased — DSH 0.1.6 official Team migration

- Replace the custom team executor, SOP runtime, delegation tools and provider with official Agent Teams, its nine tools and its Web panel.
- Compose published member personas and pinned skills through official Agent-scoped plugins; preserve asset authorization, old revisions and history.
- Remove the duplicate team activity bar and clean obsolete runtime output before packing.
- Add real Loader/AgentLoop cold-resume probes and independent Web Profile verification. Paid-model professional acceptance remains separate.


- 专家管理内置技能迁入统一 `resources/skills/workdsh-expert-manager` 目录。
- 调整创建菜单、草稿审阅和详情折叠区，并更新隔离安装与冷启动探针。
- 统一专家弹框外观；TM-01 真实模型整体验收仍未完成。

## 当前 preview 候选（未发布）

- 专家管理内置技能迁入 resources/skills/workdsh-expert-manager，正文及运行资源保留，统一工程目录。

# Changelog

## 0.1.0-alpha.1 — Unreleased candidate

- Strengthen reusable public expert creation: derive methods and actual capabilities from needs, preserve source metadata and distinguish supported facts from future promises.
- Document bounded real-model trials, actual outputs and open findings; model self-review does not guarantee professional correctness. No automatic publication or case-specific financial Skill is added.

- Select real installed Skills with search, availability, cancellation and stable references; removing an expert reference never uninstalls the shared Skill.
- Present expertise, task examples and real equipped Skill descriptions separately from the editor.
- Authorize catalog selection per expert and omit filesystem paths from catalog responses.

- Compact expert dialogs, remove duplicate close controls, and fix example fields and responsive tag layout.
- Verify published persona and frozen Skill consumption in the official Agent Loop using deterministic model I/O; keep full Loader and remote-provider acceptance pending.

- Preserve full model-facing authoring results and CAS tokens; link directly to a draft without granting publish authority.
- Verify explicit browser publish confirmation, frozen Skill revision summon, and cold restart persistence.
- Add local expert management, immutable revisions, native task binding, and shared Host management tools.
- Assemble independent governance Profile layers and initialize services through Cordis plugin lifecycle.
- Validate bound presets and Skill dependencies at the public agent pre-step hook.
- Address native draft handoff to one Session, preserving existing input and clearing consumed handoff.
- Reuse verified frozen preset artifacts and reject unexpected composition changes.
- Verify packaged Web UI and two cold restarts; real model and complete failure/uninstall acceptance remain pending.

- C候选：专业经验及必要追问创建指南，真实Host目录管理工具，完整已保存草稿使用预览与摘要变化阻断；原生任务/受信UI明确发布继续保留。

- D candidate: require healthy official standard mode rather than silently falling back; reject tasks after equipped Skill disablement.
- Add explicit synthetic real-model acceptance, independent numeric/artifact checks, documented v3 tool receipts and completed-turn checks. Three completed scenario logs and cold-restart bindings verified; professional report review still has open findings.
