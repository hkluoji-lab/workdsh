# Module releases / 模块发布与安装

2026-09-12。当前交付 Skill 0.1 的独立插件和可选 WorkDSH 展示组合包。每个模块保留自己的版本，GitHub Release 按模块建立，不再用一个仓库快照版本代替全部模块。

## 可下载模块 / Installable modules

| 模块 / Module | npm package | Version | Git tag / release |
| --- | --- | --- | --- |
| 技能管理 / Skills | `workdsh-plugin-skills` | `0.1.0-alpha.24` | [skills-v0.1.0-alpha.24](https://github.com/techflag/workdsh/releases/tag/skills-v0.1.0-alpha.24) |
| 展示组合 / Presentation | `workdsh-bundle` | `0.1.0-alpha.39` | [bundle-v0.1.0-alpha.39](https://github.com/techflag/workdsh/releases/tag/bundle-v0.1.0-alpha.39) |

每个发布页只附本模块的 `.tgz`、`SHA256SUMS` 与 `release-manifest.json`。Manifest 记录模块、版本、源代码提交、验证基线、文件大小与摘要。GitHub 的 Source code ZIP/TAR 是仓库源码，不是插件安装包。尚未发布 npm。

Each release carries its own prebuilt package, checksums, and a manifest tying it to the source commit and verified runtime. Use the named `.tgz` asset, not GitHub's automatically generated source archives. No npm publication has been performed.

## 开发模块对应表 / Development package map

| 模块 | 当前版本 | 本次交付方式 |
| --- | --- | --- |
| `workdsh-plugin-workbench` | `0.1.0-alpha.10` | 随展示 bundle 交付；没有独立安装层，不另发可安装插件包。 |
| `workdsh-ui` | `0.1.0-alpha.4` | 共享展示组件库；需要的代码编译进各 Client 制品。 |
| `workdsh-contracts` | `0.1.0-alpha.5` | 类型契约开发包；Skill 自包含所需声明。 |
| `workdsh-provider-identity-local` | `0.1.0-alpha.3` | 本地身份基础服务源码和测试，未作为独立用户安装包交付。 |
| `workdsh-plugin-access` | `0.1.0-alpha.3` | 本地授权基础服务源码和测试，未作为独立用户安装包交付。 |
| `workdsh-plugin-audit` | `0.1.0-alpha.2` | 本地审计基础服务源码和测试，未作为独立用户安装包交付。 |
| 专家、连接器、项目、资料库等 | 见 [modules.json](modules.json) | 设计/规划模块，不生成空插件发布包。 |

Workbench currently ships inside the presentation bundle. UI and contracts are shared development libraries. Local identity/access/audit are source-level foundations. None is advertised as an independently installable end-user plugin in this release. Planned modules receive their own releases only after actual package and lifecycle acceptance.

## 兼容矩阵 / Compatibility

| 环境 / Environment | 结论 / Result |
| --- | --- |
| Harness `0.1.5-rc.1` Web Profile + Cordis `4.0.2` | 已验证独立 Skill 安装、组合、浏览器管理、停止后移除、冷重启和重装。 / Verified. |
| 本次测试主机 / Test host | macOS，Node `22.23.2`，pnpm `10.34.5`，Playwright Chromium。 |
| Node 声明 / Declared Node range | `^22.19.0 || >=24.0.0`；本次发布回归使用 22.23.2。 |
| DSH Desktop `2.0.5`，内置 Harness `0.1.2-rc.1` | **已知不兼容表现：安装启用并重启后缺少入口；本次不修复。** / Known missing navigation, unresolved. |
| 其他桌面版本 / Other desktop versions | 未验收，不从“已安装”推断 Client 已激活。 / Not verified. |
| Windows / Linux | 本次未做各平台端到端验收。 / Platform-specific end-to-end checks not performed. |

旧桌面发布包的 Sidebar 文档与 Client 制品没有当前插件使用的 `sidebar.panellist`。这说明入口扩展面存在版本差异，但本次没有继续完成全部 Host/Client 兼容诊断。用户已明确停止兼容性改造；不将该问题写成已修复，不升级用户桌面应用，不改其 Profile。

The older desktop's shipped Sidebar does not expose the `sidebar.panellist` used by this plugin. This establishes an extension-point difference, not a complete diagnosis of all Host/Client compatibility. Compatibility work was stopped at the user's request; the release does not upgrade or modify that desktop installation.

## 安装 / Install

使用已匹配依赖的官方 `0.1.5-rc.1` CLI；`dsh` 不能指向旧桌面启动器。安装、升级和移除前停止目标 Profile。

```sh
# New Web Profile; use the official CLI, not handwritten profile files.
dsh --profile workdsh --from-default-profile web --dump-config

# Required for Skill management. Replace the absolute file path.
dsh plugin --profile workdsh add /absolute/path/workdsh-plugin-skills-0.1.0-alpha.24.tgz

# Optional WorkDSH brand/theme/workbench layer.
dsh plugin --profile workdsh add /absolute/path/workdsh-bundle-0.1.0-alpha.39.tgz

dsh --profile workdsh
```

启动后打开“专家 · 技能 · 连接器 → 技能”。Skill 独立安装不提供 WorkDSH URL 路由，直接使用侧栏入口。展示包提供 `workdsh-view` 深链接，但它不包含 Skill 功能实现。

Open **专家 · 技能 · 连接器 → 技能** after boot. Standalone Skill uses its sidebar entry; the optional presentation bundle owns WorkDSH deep links and does not contain the Skill implementation.

停止 Profile 后移除管理插件：

```sh
dsh plugin --profile workdsh remove workdsh-plugin-skills
```

原有技能文件与管理数据保留。也可独立移除 `workdsh-bundle`；已安装的 Skill 插件继续提供自己的入口。此处是停止后移除与重新启动流程，未宣称 CLI 运行中完整热卸载。

Removal preserves user skill files and management data. The presentation bundle can also be removed independently. Full live CLI hot-unload is not claimed.

## 校验 / Verify downloads

将某一模块的 `.tgz`、`SHA256SUMS` 和 `release-manifest.json` 放在同一目录。不同模块的附件同名，请各自保存到独立目录。

```sh
# macOS
shasum -a 256 -c SHA256SUMS
# Linux
sha256sum -c SHA256SUMS
```

Checksums detect download corruption; they are not a separate publisher signature. The manifest records the exact source commit. Source and release assets must correspond; published versioned tarballs are not overwritten with different bytes.

## 后续发布规则 / Release policy

1. 一模块一版本线；按 `<module>-v<package-version>` 建 tag，保持历史 `v0.1.0-alpha.1` 快照不变。
2. 只有具备有效 `dsh.bundle`、标准入口、预构建产物并通过独立安装验收的功能包，才列为“可安装插件”。共享库、提供方、规划目录分别标注，不能混列。
3. 先构建、类型检查和针对性测试，再打包；核对 manifest、exports、配置 patch、依赖和包内文件；不上传开发环境、凭据、用户内容或运行时数据。
4. 在隔离 Profile 中验证真实安装、Client 页面、Host 操作和生命周期。兼容结论必须带完整 Harness 版本与实际平台。
5. GitHub Release 附对应模块的安装包、校验与 manifest；README 中的版本、下载路径、范围和限制同步更新。
6. 默认交付 `.tgz`；GitHub 源码推送不等于 npm 发布。公共技能市场、企业后台与独立开发库发行仍按已批准范围推进。

Official basis: [Package and install a plugin](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish). Local verification: [Skill standalone evidence](evidence/skills-standalone-package.md).
