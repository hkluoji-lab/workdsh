# ADR-0029：插件随包技能的注册表级停用

状态：Accepted（用户指令「让它们真正可管理（可开关/停用）」）。日期：2026-09-20。

## 背景

技能页此前把两类来源混在一起呈现：文件落在 `~/.agents/skills`、`$DSH_HOME/skills` 的**目录受管技能**可以由 WorkDSH 启停；而由插件随包提供、注册在 `ctx.skills` 名称空间里的技能（`workdsh-*-design`、`workdsh-skill-creator`、`workdsh-expert-manager`、`dsh-univer-office` 的 8 个 Univer 技能、`@anionex/dsh-vision-toolkit` 的 `vision-skills`）文件不在受管根内，面板只能把它们渲染成禁用开关或「插件提供」标签——用户报告「开关无效、不能用」。

官方 Skills 子系统没有按名称排除/屏蔽某一个技能的能力：只有 frontmatter 调用策略（`disable-model-invocation`、`user-invocable`）、根目录级启停和整插件启停。要停用一个由别的 provider 贡献的技能，只有公开注册表内的一条路：在同一 layer 内以**更小 rank + 拒绝两个调用面**的同名条目赢得重名合并。

## 决策

1. skills 插件注册一个注册表级 suppressor provider（`workdsh-skill-suppression`，rank 240）。它对被停用名称返回一条候选：
   - `invocation: { modelInvocable: false, userInvocable: false }`（官方语义：只保留给受信的 `ctx.skills.get()` 调用方）；
   - `resourceBase`、`path` 指向原技能目录，`get()` 直接读该目录的 `SKILL.md`，因此详情仍可读、正文仍可加载；
   - `source` 记录原来源，便于诊断。
2. rank 240 低于 runtime 条目（250）与 bundled 根（600），所以能赢得这两类重名；**高于**项目根（100/200），因此项目层技能一律不受影响，保持只读。
3. 停用状态是 WorkDSH 自有数据：`<agentsHome>/.workdsh-state/skills/suppressed.json`（记录 name/description/directory/source/suppressedAt）。不移动、不修改、不删除任何插件文件；插件升级或卸载后由插件自己决定名称是否存在，suppressor 读不到 `SKILL.md` 时该条目不进入目录。
4. 契约上以 `ManagedSkillSummary.origin` 区分：`directory`（WorkDSH 受管的本地目录，原有语义不变）与 `plugin`（插件/外部来源，可启停但不可编辑、不可打开文件夹、不可卸载）。`update`/`writeResource`/`uninstall` 在 Host 侧拒绝 `origin: 'plugin'`，不能通过 API 改包内文件。
5. 停用/启用走既有 `set-enabled` 端点与 `ctx.workdshSkills.setEnabled(name, enabled)`；suppressor 变更后调用注册表 `invalidate()`，官方目录（模型可见目录与 `/` 用户命令目录）随之刷新。

## 权衡与失败边界

- suppressor 只遮蔽它自己记录过的名称，不做通配或前缀匹配；用户显式安装同名受管技能时，受管副本（rank 500）会被 rank 240 的 suppressor 遮蔽——按第 3 条，此时面板显示的是「已停用」，重新启用即可让受管副本回到首位。
- 它是**投影层停用**，不是卸载：插件仍在运行、其工具仍然注册、技能文件仍在磁盘。停用只改变技能解析与两个调用面的可见性。
- 若上游改变重名合并规则或调用策略语义，本机制失效；届时以官方目录实测为准并更新本 ADR。
- `origin: 'plugin'` 的技能不进入批量管理（批量卸载对它们无意义）。

## 范围

只覆盖技能解析与面板呈现。不改官方 dsh、不动上游包、不新增网络入口、不改变权限与审批（停用不是访问控制，公开注入与工具可见性仍不是隔离）。
