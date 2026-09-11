# WorkDSH

[English](README.md) | **简体中文**

基于 DeepSeek Harness 的插件化 Web 工作平台。专家、技能、连接器、行业应用等是可独立分发的功能插件，每个插件管理多个对应对象，并能在同一任务中协作。

**当前版本：`v0.1.0-alpha.1`，首个开发预览。** 默认/本地 Skill 管理闭环已经可用；专家、连接器、项目、资料库以及企业服务端和管理 Web 仍在规划或后期 ToDo 中。

当前预览包含：

- 通过 DeepSeek Harness 官方 Sidebar Slot 增量提供 WorkDSH 导航，保留原生 Workspace、Session、设置和 Conversation。
- 全局技能列表、搜索、完整 `SKILL.md` 与资源详情。
- 技能正文和资源编辑、revision 冲突检测、重新发现及打开技能目录。
- 技能启停、依赖影响确认、批量管理、可恢复卸载。
- `.zip`、`.md` 和文件夹安全导入，包含预检、显式确认、原子安装和失败恢复。
- 通过原生 Conversation、`/skill-creator` 和 Harness 官方 Tool 完成技能创建；继续支持原生 `/`、`@`、附件、权限、模型和发送流程。

## 产品截图

### 技能管理

![WorkDSH 技能管理](docs/assets/screenshots/skill-management.png)

### 原生工作台集成

![WorkDSH 原生工作台集成](docs/assets/screenshots/workbench.png)

当前不提供公共 Skill 市场、SkillHub 或套件。企业版规划采用独立服务端、管理 Web 和 Harness 执行节点，详见 [ADR 0015](docs/adr/0015-skill-control-plane-and-runtime-projection.md) 与 [后期 ToDo](docs/TODO.md)。

## 开发入口

- [公开开发路线图（中英文）](docs/ROADMAP.md)
- [开发规则](AGENTS.md)
- [详细开发计划](docs/PLAN.md)
- [当前状态与任务台账](docs/STATUS.md)
- [架构与目录](docs/ARCHITECTURE.md)
- [公开契约草案](docs/CONTRACTS.md)
- [首期团队版设计](docs/TEAM-DESIGN.md)
- [企业管理后台设计](docs/ADMIN-DESIGN.md)
- [验收矩阵](docs/ACCEPTANCE.md)
- [开发与环境说明](docs/DEVELOPMENT.md)
- [官方依据及兼容验证](docs/COMPATIBILITY.md)

使用 Node.js 22.19+ 和 pnpm 10.34.5：

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test:integration
corepack pnpm preview
```

运行 `corepack pnpm check:plan` 检查规划模块完整性。完整验收还包括版本锁定、集成测试和打包浏览器探针。

仓库不包含 DeepSeek Harness 源码。Harness 依赖精确锁定在 `0.1.5-rc.1`，Cordis 锁定在 `4.0.2`；开发和运行只使用官方文档与已发布 npm 包。

- [项目详细设计](docs/PROJECT-DESIGN.md)
- [WorkBuddy 核心领域依据](docs/research/workbuddy-core-domains.md)

- [逐插件开发顺序与版本交付](docs/PLUGIN-DELIVERY.md)

## 包目录

功能插件统一位于 `packages/plugins/`：`skills/`、`experts/`、`connectors/`、`projects/` 等。该父目录仅分类，子插件独立开发和版本化。`providers/` 同样按提供方分类，各子目录独立版本化；`bundle/`、`contracts/`、`ui/` 位于 packages 下。详见 [插件目录](packages/plugins/README.md)。

UI 设计审阅：[交互原型](docs/ui/index.html) · [视觉与页面规范](docs/UI-DESIGN.md)。这是界面提案，不代表业务功能已实现。

## 发布范围

首个预览版本精确包含以下模块版本：

- `workdsh-plugin-skills@0.1.0-alpha.23`
- `workdsh-plugin-workbench@0.1.0-alpha.8`
- `workdsh-ui@0.1.0-alpha.3`
- `workdsh-bundle@0.1.0-alpha.35`

能力、限制与验证证据详见 [v0.1.0-alpha.1 发布说明](docs/releases/v0.1.0-alpha.1.md)。
