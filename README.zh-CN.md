<p align="center"><img src="assets/brand/workdsh-logo.svg" width="104" alt="WorkDSH"></p>
<h1 align="center">WorkDSH</h1>
<p align="center"><strong>用插件，组合你的 AI 工作平台。</strong></p>
<p align="center">DeepSeek Harness · 原生任务体验 · 模块独立版本化</p>
<p align="center"><a href="README.md">English</a> · <strong>简体中文</strong></p>
<p align="center">
  <a href="https://github.com/techflag/workdsh/releases/tag/skills-v0.1.0-alpha.24">下载技能插件</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="docs/ROADMAP.md">开发路线图</a> ·
  <a href="docs/RELEASES.md">模块发布与安装</a>
</p>

WorkDSH 在 DeepSeek Harness 上提供可复用技能与面向工作的界面。你可以**单独安装技能管理插件**，也可以将它与可选的 **WorkDSH 展示组合包**一起使用，获得品牌化工作平台。

当前 **Skill 0.1 开发预览**支持本地技能发现、创建、导入、编辑、启停和恢复。专家、连接器、项目与企业管理仍在路线图中；设计文档和导航占位不代表功能已经完成。

> **兼容范围：**已验证官方 Harness **`0.1.5-rc.1` Web Profile**。使用 Harness **`0.1.2-rc.1`** 的 DSH Desktop 存在 Skill alpha.24 安装后无导航入口的问题，重启后也可能不显示。**本次发布未修复该问题。**详见[兼容说明](docs/RELEASES.md)。

![WorkDSH 技能库](docs/assets/screenshots/skill-management.png)

*正式打包应用的真实截图，使用隔离的演示技能；示例内容不代表随包提供公共技能目录。*

## 插件就是架构

WorkDSH 遵循 Harness 自身的扩展方式：官方 **Loader + Profile + Cordis**、标准 Host/Client 入口和公开 UI Slot。工程只使用已发布的 Harness 包，不需要检出上游源码。

| 特色 | 实际含义 |
| --- | --- |
| 按需安装能力 | Skill 自带配置层、Host 服务、Client 模块和预构建 `.tgz`，展示包可选。 |
| 通过公开契约互通 | 插件经服务注入协作。`workdsh-contracts/skills` 提供技能服务契约，后续专家可引用共享技能。 |
| 保留原生运行底座 | 会话、工作区、模型执行、技能发现与调用、插件加载由 Harness 拥有；WorkDSH 补充管理流程和界面。 |
| 每个模块独立版本 | Skill 使用自己的 `0.1` 版本线，展示包更新不强制技能模块同步升级。 |
| 保留用户内容 | 移除技能管理**插件**会保留技能文件和管理数据；卸载某一个**技能对象**则进入可恢复流程。 |

```mermaid
flowchart TB
  profile[官方 Harness Web Profile]
  profile --> native[原生运行时、工作区与会话]
  profile --> skills[独立安装的 Skill 插件]
  profile --> presentation[可选的 WorkDSH 展示组合包]
  skills --> service[公开 Skill 管理服务]
  service -. 后续接入 .-> experts[专家等其他功能插件]
```

**功能插件**是可安装的软件模块；**技能**是用户管理的 `SKILL.md` 及其资源。一个技能管理插件管理多个技能，制作技能不需要发布 npm 包。

## Skill 0.1 可以做什么

| 流程 | 已有能力 |
| --- | --- |
| 浏览 | 全局本地技能列表、搜索、完整 `SKILL.md`、资源文件，以及无效技能诊断。 |
| 创建与试用 | 将 `/skill-creator` 或 `/技能名` 交给原生任务框，保留附件、`/`、`@`、模型、权限和发送流程。 |
| 导入 | 选择 `.zip`、`.md` 或文件夹；预览文件、校验格式与路径、确认范围，再原子安装。导入不运行包内脚本。 |
| 编辑 | 编辑正文与文本资源、检测修订冲突、保存并重新发现；打开目录使用原生 Host 能力。 |
| 管理 | 启用/停用、检查已登记的依赖影响、批量操作、可恢复卸载和恢复。 |
| 恢复 | 已验证冷重启后保留编辑与管理状态，支持取消上传和失败后重试导入。 |

<details>
<summary><strong>查看技能详情和独立安装效果</strong></summary>

![完整技能详情与资源](docs/assets/screenshots/skill-detail.png)

![独立技能插件与官方 Harness 界面](docs/assets/screenshots/skill-standalone.png)

单独安装技能插件时保留 Harness 品牌和原生导航；可选展示组合包提供 WorkDSH 品牌及深色主题。

</details>

## 按模块下载

每个可安装模块对应独立的 **GitHub 预发布、带版本号的安装包、SHA-256 校验文件和发布清单**。这里分发预构建制品，尚未发布到 npm 注册表。

| 模块 | 包版本 | 下载 | 安装范围 |
| --- | --- | --- | --- |
| 技能管理 | `workdsh-plugin-skills@0.1.0-alpha.24` | [技能 `.tgz`](https://github.com/techflag/workdsh/releases/download/skills-v0.1.0-alpha.24/workdsh-plugin-skills-0.1.0-alpha.24.tgz) · [发布页](https://github.com/techflag/workdsh/releases/tag/skills-v0.1.0-alpha.24) | 可独立安装的 Harness 功能插件。 |
| WorkDSH 展示组合 | `workdsh-bundle@0.1.0-alpha.39` | [展示 `.tgz`](https://github.com/techflag/workdsh/releases/download/bundle-v0.1.0-alpha.39/workdsh-bundle-0.1.0-alpha.39.tgz) · [发布页](https://github.com/techflag/workdsh/releases/tag/bundle-v0.1.0-alpha.39) | 可选品牌、主题与工作台组合；Skill 需单独安装。 |

Workbench `alpha.10` 目前随展示包交付。共享 UI `alpha.4`、contracts `alpha.5` 和本地身份/授权/审计基础属于开发包，**本次不作为面向用户的独立插件下载**。其他模块仍在规划中，见[完整模块对应表](docs/RELEASES.md)。

## 快速开始

### 安装预构建插件

使用 **Node.js 22 LTS 的 22.19+ 或 Node 24+**、**pnpm 10.34.5**，以及官方 **Harness CLI `0.1.5-rc.1`**。以下命令要求 `dsh` 指向该版本 CLI，而不是旧桌面应用的启动器。

下载上方技能 `.tgz`，使用独立 Web Profile，将示例路径替换为已下载文件的绝对路径：

```sh
dsh --profile workdsh --from-default-profile web --dump-config
dsh plugin --profile workdsh add /absolute/path/workdsh-plugin-skills-0.1.0-alpha.24.tgz
dsh --profile workdsh
```

在侧栏打开 **专家 · 技能 · 连接器 → 技能**。通过**添加技能**导入或创建，或在技能详情中选择**去试试**，准备原生会话。需要模型执行时，使用你自己的 Harness 模型配置。

需要 WorkDSH 外观时，先停止该 Profile，再安装可选展示包并重启：

```sh
dsh plugin --profile workdsh add /absolute/path/workdsh-bundle-0.1.0-alpha.39.tgz
dsh --profile workdsh
```

安装遵循官方 [`dsh plugin … add` 流程](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)。GitHub 的 **Source code** 是源码快照，安装插件请下载对应的 `.tgz`。当前安装与移除验收采用“停止 Host → 修改组合 → 重启”，不声称完成运行中 CLI 热卸载验收。

### 从仓库启动

```sh
git clone https://github.com/techflag/workdsh.git
cd workdsh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm preview:install
corepack pnpm preview
```

预览地址为 `http://127.0.0.1:18989`，请使用启动时输出的认证链接。预览采用独立 Profile，默认读取你的 `~/.agents` 技能；自动化测试使用隔离目录。配置方法见[开发环境说明](docs/DEVELOPMENT.md)。

## 开发路线

| 阶段 | 范围 | 状态 |
| --- | --- | --- |
| Skill 0.1 | 本地技能管理与独立安装交付 | 已在指定 Web 基线上验证。 |
| 专家 0.1 | 专家定义、草稿、修订、共享技能引用和任务交接 | 设计与开发交接已准备，业务实现待开发。 |
| 后续模块 | 连接器 → 资料库 → 项目 → 行业应用 → 集成 | 按模块逐一交付。 |
| 企业版 | 服务端 + 管理 Web + Harness 执行节点；组织技能、分类、版本、授权和下发 | 后置。本次没有公共技能市场、SkillHub 或技能套件。 |

[路线图](docs/ROADMAP.md)、[专家交接方案](docs/design/experts/README.md)和[企业版 ToDo](docs/TODO.md)保留范围与验收条件。当前预览面向可信本机用户，不是可直接暴露到公网的多租户服务。

## 开发与文档

```sh
corepack pnpm typecheck
corepack pnpm test:integration
corepack pnpm test:planning
corepack pnpm check:plan
corepack pnpm check:versions
corepack pnpm probe:skills
corepack pnpm probe:browser
```

打包探针实际运行安装、浏览器交互、编辑、恢复、插件移除和重装；不代替真实模型效果、企业隔离或其他桌面版本兼容性验收。

| 文档入口 | 内容 |
| --- | --- |
| [架构](docs/ARCHITECTURE.md) · [插件组合 ADR](docs/adr/0018-composable-feature-plugins-and-shared-skills.md) | 所有权、组合方式和公开插件边界。 |
| [官方开发规范](docs/HARNESS-OFFICIAL-DEVELOPMENT.md) · [仓库规则](AGENTS.md) | 官方契约优先，不另造运行底座、不修改上游。 |
| [模块发布](docs/RELEASES.md) · [Skill 包说明](packages/plugins/skills/README.md) | 制品、版本对应、安装和限制。 |
| [验收证据](docs/evidence/skills-standalone-package.md) · [状态台账](docs/STATUS.md) | 实际通过的检查和未完成事项。 |
| [UI 规范](docs/UI-DESIGN.md) · [品牌资产](docs/BRAND.md) | 共享组件与视觉方向。 |

功能模块位于 `packages/plugins/<domain>`，提供方位于 `packages/providers/<name>`，共享包位于 `packages/{contracts,ui,bundle}`。目录脚手架不等于可安装插件，详见[插件目录说明](packages/plugins/README.md)。

底座采用 [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/)，交互参考包括 [WorkBuddy](https://www.workbuddy.cn/)。WorkDSH 是独立项目，并非上述团队的官方产品。
