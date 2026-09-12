<p align="center"><img src="assets/brand/workdsh-logo.svg" width="104" alt="WorkDSH"></p>
<h1 align="center">WorkDSH</h1>
<p align="center"><a href="https://techflag.github.io/workdsh/">Product website ↗</a></p>
<p align="center"><strong>An AI workspace, composed from plugins.</strong></p>
<p align="center">DeepSeek Harness · Native conversations · Independently versioned modules</p>
<p align="center"><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
<p align="center">
  <a href="https://github.com/techflag/workdsh/releases/tag/skills-v0.1.0-alpha.24">Download Skill plugin</a> ·
  <a href="#quick-start">Quick start</a> ·
  <a href="docs/ROADMAP.md">Roadmap</a> ·
  <a href="docs/RELEASES.md">Module releases</a>
</p>

WorkDSH brings reusable skills and a work-oriented interface to DeepSeek Harness. Install the **Skill management plugin on its own**, or compose it with the optional **WorkDSH presentation bundle** for the branded workspace.

The current **Skill 0.1 development preview** supports local skill discovery, creation, import, editing, enablement, and recovery. Individual Experts are available as an alpha; expert teams, connectors, projects, and enterprise administration are on the roadmap; their design documents and navigation placeholders do not represent completed features.

## What makes WorkDSH useful

**Watch the result take shape in your workspace.** Ask for a document and it opens on the right. AI writes in committed batches as you read. Take over, make changes, then let AI read the latest revision and continue. Download the result as Word when ready.

| Feature | What it means in practice |
| --- | --- |
| Visible writing progress | Each committed batch appears in the right-hand document; no need to wait for a finished file. |
| Human and AI take turns | Edit the same saved working copy. Human editing pauses AI writes to prevent overwrites. |
| Drafts become deliverables | Autosave, reopen, download DOCX, and use native Harness file cards after AI export. |
| Explicit output intent | `/office` picks an output type; `@` distinguishes reference material from a document to modify. New documents need no reference. |
| Independently installed capabilities | Office is a Host/Client plugin. Its menus, tools and editor registrations follow plugin installation; saved documents survive removal. |
| Native Harness workflow | Keep conversations, attachments, models, permissions and queues with the official runtime and composer. |

**Released Word alpha.1 scope:** headings, paragraphs, text formatting, lists, find/replace, zoom, reading follow, and DOCX text-copy import/download. Tables, images, headers/footers and full pagination are outside the unified editing model; imports disclose these limits and retain the original file. All eight output choices are present, while the other seven live adapters remain planned. Word alpha.1 is available as an independent [prerelease package](https://github.com/techflag/workdsh/releases/tag/office-v0.1.0-alpha.1).

**Word alpha.2:** Word tables and embedded images reuse native MIT Tiptap extensions. The toolbar offers row/column editing, merge/split, width dragging, image upload/resize/alignment; saved working copies and supported DOCX round trips retain structure and text styles. [Scope and limits](packages/plugins/office/README.md). [Download the alpha.2 preview](https://github.com/techflag/workdsh/releases/tag/office-v0.1.0-alpha.2).

> **Compatibility:** verified with the official Harness **`0.1.5-rc.1` Web Profile**. Skill alpha.24 has a known missing-navigation issue in DSH Desktop using Harness **`0.1.2-rc.1`**, including after restart. This release **does not fix that issue**. See the [compatibility notes](docs/RELEASES.md).

![WorkDSH Skill library](docs/assets/screenshots/skill-management.png)

*Actual packaged application with isolated demonstration skills. Example content is not a bundled public catalog.*


## 单个专家 alpha / Individual Experts alpha

[下载 Experts 0.1.0-alpha.1 / Download](https://github.com/techflag/workdsh/releases/tag/experts-v0.1.0-alpha.1) · [安装说明 / Installation](packages/plugins/experts/README.md)

专家现已作为独立 Harness Host/Client 插件交付：一个插件管理多个专家，专家组合领域经验、专业方法与共享技能。支持对话引导制作、草稿编辑、预览确认发布、固定专家/技能修订，以及原生任务召唤。专家团的多专家＋SOP仍是规划内容。

Experts now ship as an independent Harness Host/Client plugin. One plugin manages multiple experts combining domain experience, methods and shared skills. It supports conversational authoring, drafts, reviewed publication, frozen expert/Skill revisions and native task handoff. Expert teams with SOP remain planned.

**Alpha 边界 / Limits:** 实际模型调用与成果链路已验证，专业报告质量尚未全部验收；请核验业务结论。Requires Harness0.1.5-rc.1 Web and matching companion packages; professional report acceptance is incomplete.

![Expert detail / 专家详情](docs/assets/screenshots/expert-detail-alpha1.png)


## Office development preview

![WorkDSH Word preview / Word 文档预览](docs/assets/screenshots/office-word-preview.png)

*User-provided application screenshot showing a Word document preview and the native file deliverable card. This screenshot does not demonstrate full Word layout editing or completion of all Office editors.*

![Office output selector / Office 输出类型选择](docs/assets/screenshots/office-output-selector.png)

*Select an output type with `/office` in the native task input. Word supports live writing; the other live editor adapters are still pending.*

**Office alpha.1 release scope:** the downloadable package contains Word text editing and DOCX original-layout preview only. Experimental Excel/PPT file adapters are excluded from this package. Build the release candidate with `corepack pnpm release:office:pack`; packaging checks bundled license texts and excludes legacy dependencies.

### Install or remove the Office candidate

These commands target this checkout's configured `preview` Profile and require the development setup and local candidate `.tgz` to exist. This is a [development prerelease](https://github.com/techflag/workdsh/releases/tag/office-v0.1.0-alpha.1); download the `.tgz` from its assets or build it locally. Use Node.js 22.23.2. Stop the running preview with `Ctrl+C` in its terminal before installing and starting:

```bash
cd /Users/techflag/project/workdsh

# 安装本地候选包 / Install the local candidate
DSH_HOME="$PWD/.test-runtime/preview" \
  corepack pnpm exec dsh plugin --profile preview add \
  "$PWD/.artifacts/office-release/workdsh-plugin-office-0.1.0-alpha.2.tgz"

# 启动 / Start
corepack pnpm preview
```
To remove Office, stop the preview first, run this command, then run `corepack pnpm preview` and refresh the page:

```bash
DSH_HOME="$PWD/.test-runtime/preview" \
  corepack pnpm exec dsh plugin --profile preview remove workdsh-plugin-office
```
Use the same `DSH_HOME` and Profile for installation, removal and startup. Removal withdraws Office entries and tools while retaining saved documents and original files; reinstallation restores the entries. To create a new Word document, select `/office` → Word in a task; no `@` reference is required.

## Plugins are the architecture

WorkDSH follows Harness's own extension model: official **Loader + Profile + Cordis**, standard Host/Client entry points, and documented UI Slots. It uses published Harness packages and requires no upstream source checkout.

| Principle | What it means |
| --- | --- |
| Install capabilities independently | Skill ships its own configuration layer, Host service, Client module, and prebuilt `.tgz`. The presentation package is optional. |
| Compose through public contracts | Plugins collaborate through injected services. `workdsh-contracts/skills` exposes the Skill service contract for future consumers such as experts. |
| Keep the native runtime | Harness owns conversations, workspaces, model execution, skill discovery and invocation, and plugin loading. WorkDSH contributes management workflows and UI. |
| Version each module separately | Skill stays on its own `0.1` line. A presentation update does not force a Skill version change. |
| Preserve user content | Removing the Skill **plugin** preserves skill files and management data. Uninstalling an individual **skill** uses the recoverable management workflow. |

```mermaid
flowchart TB
  profile[Official Harness Web Profile]
  profile --> native[Native runtime, workspaces and conversations]
  profile --> skills[Independent Skill plugin]
  profile --> presentation[Optional WorkDSH presentation bundle]
  skills --> service[Public Skill management service]
  service --> experts[Independent Experts plugin]
```

A **feature plugin** is an installable software module. A **skill** is a user-managed `SKILL.md` with optional resources. One Skill plugin manages many skills; creating a skill does not require publishing an npm package.

## What Skill 0.1 can do

| Workflow | Available behavior |
| --- | --- |
| Browse | Global local-skill list, search, full `SKILL.md`, resource files, and invalid-skill diagnostics. |
| Create and try | Prepare a native task with `/skill-creator` or `/skill-name`; keep attachments, `/`, `@`, model selection, permissions, and sending. |
| Import | `.zip`, `.md`, or folders; inspect files, validate format and paths, confirm scope, then install atomically. Import does not execute included scripts. |
| Edit | Edit documents and text resources, detect revision conflicts, save, and rediscover. Directory reveal uses the native Host capability. |
| Manage | Enable/disable, check registered dependency impact, batch operations, recoverable uninstall, and restore. |
| Recover | Preserve edits and management state across tested cold restarts; cancel uploads and retry failed imports. |

<details>
<summary><strong>Skill details and standalone installation</strong></summary>

![Full Skill detail and resources](docs/assets/screenshots/skill-detail.png)

![Standalone Skill plugin in the official Harness interface](docs/assets/screenshots/skill-standalone.png)

Standalone installation retains Harness branding and native navigation. The optional presentation bundle adds WorkDSH branding and its dark theme.

</details>

## Download by module

Each installable module has a matching **GitHub prerelease, versioned package, SHA-256 checksums, and release manifest**. These are prebuilt artifacts; npm registry publication has not been performed.

| Module | Package version | Download | Scope |
| --- | --- | --- | --- |
| Skill management | `workdsh-plugin-skills@0.1.0-alpha.24` | [Skill `.tgz`](https://github.com/techflag/workdsh/releases/download/skills-v0.1.0-alpha.24/workdsh-plugin-skills-0.1.0-alpha.24.tgz) · [Release](https://github.com/techflag/workdsh/releases/tag/skills-v0.1.0-alpha.24) | Independently installable feature plugin. |
| WorkDSH presentation | `workdsh-bundle@0.1.0-alpha.39` | [Presentation `.tgz`](https://github.com/techflag/workdsh/releases/download/bundle-v0.1.0-alpha.39/workdsh-bundle-0.1.0-alpha.39.tgz) · [Release](https://github.com/techflag/workdsh/releases/tag/bundle-v0.1.0-alpha.39) | Optional brand, theme, and workbench composition. Install Skill separately. |

Workbench `alpha.10` is currently delivered within the presentation bundle. Shared UI `alpha.4`, contracts `alpha.5`, and the local identity/access/audit foundation are development packages, **not standalone end-user plugin downloads in this release**. Other modules remain planned. See the [complete module map](docs/RELEASES.md).

## Quick start

### Install a prebuilt plugin

Use **Node.js 22.19+ on the 22 LTS line, or Node 24+**, **pnpm 10.34.5**, and the official **Harness CLI `0.1.5-rc.1`**. These commands assume `dsh` resolves to that CLI, rather than an older desktop launcher.

Download the Skill `.tgz` above. Create a dedicated Web Profile and replace the example path with your downloaded file's absolute path:

```sh
dsh --profile workdsh --from-default-profile web --dump-config
dsh plugin --profile workdsh add /absolute/path/workdsh-plugin-skills-0.1.0-alpha.24.tgz
dsh --profile workdsh
```

Open **专家 · 技能 · 连接器 → 技能** in the sidebar. Use **添加技能** to import or create a skill, or open a skill and choose **去试试** to prepare a native conversation. Model-backed execution requires your own Harness model configuration.

To add the WorkDSH appearance, stop that Profile, install the optional bundle, then restart:

```sh
dsh plugin --profile workdsh add /absolute/path/workdsh-bundle-0.1.0-alpha.39.tgz
dsh --profile workdsh
```

Follow the official [`dsh plugin … add` flow](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish). GitHub's **Source code** archives are source snapshots; install the named `.tgz` assets. Installation and removal are verified with the Host stopped and restarted, not as complete live CLI hot-unload operations.

### Run from the repository

```sh
git clone https://github.com/techflag/workdsh.git
cd workdsh
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm preview:install
corepack pnpm preview
```

The preview runs at `http://127.0.0.1:18989`; use the authenticated URL printed at startup. It has its own Profile and reads your normal `~/.agents` skills by default. Automated tests use isolated homes. See [development setup](docs/DEVELOPMENT.md).

## Roadmap

| Stage | Scope | Status |
| --- | --- | --- |
| Skill 0.1 | Local skill management and independent package delivery | Available on the verified Web baseline. |
| Experts 0.1 | Definitions, drafts, revisions, shared skill references, and task handoff | Alpha available; professional quality and final stability acceptance incomplete. |
| Following modules | Connectors → library → projects → industry applications → integration | Planned, delivered one module at a time. |
| Enterprise | Server + administration Web + Harness execution nodes; organization skills, categories, versions, access, and rollout | Deferred. No public Skill marketplace, SkillHub, or skill suites in this release. |

See the [roadmap](docs/ROADMAP.md), [expert handoff](docs/design/experts/README.md), and [enterprise ToDo](docs/TODO.md). This preview targets a trusted local user; it is not an internet-facing multi-tenant server.

## Development and documentation

```sh
corepack pnpm typecheck
corepack pnpm test:integration
corepack pnpm test:planning
corepack pnpm check:plan
corepack pnpm check:versions
corepack pnpm probe:skills
corepack pnpm probe:browser
```

Packaged probes exercise actual installation, browser interactions, edits, recovery, removal, and reinstallation. They do not prove real-model quality, enterprise isolation, or compatibility with untested desktop versions.

| Documentation | Purpose |
| --- | --- |
| [Architecture](docs/ARCHITECTURE.md) · [Plugin composition ADR](docs/adr/0018-composable-feature-plugins-and-shared-skills.md) | Ownership, composition, and public plugin boundaries. |
| [Official development rules](docs/HARNESS-OFFICIAL-DEVELOPMENT.md) · [Repository rules](AGENTS.md) | Official contracts first; no parallel runtime or upstream modifications. |
| [Module releases](docs/RELEASES.md) · [Skill package guide](packages/plugins/skills/README.md) | Artifacts, version mapping, installation, and limitations. |
| [Verification evidence](docs/evidence/skills-standalone-package.md) · [Status](docs/STATUS.md) | Actual results and remaining work. |
| [UI specification](docs/UI-DESIGN.md) · [Brand assets](docs/BRAND.md) | Shared components and visual direction. |

Feature modules live in `packages/plugins/<domain>`, providers in `packages/providers/<name>`, and shared packages in `packages/{contracts,ui,bundle}`. Scaffolds do not imply installable plugins. See the [package guide](packages/plugins/README.md).

Built on [DeepSeek Harness](https://deepseek-harness.github.io/deepseek-harness/); interaction references include [WorkBuddy](https://www.workbuddy.cn/). WorkDSH is an independent project, not an official product of either team.

下一阶段开发计划：[PPT 实时制作 → 其他六类（Word 后续暂停）](docs/design/office/NEXT-STAGE.md)。各阶段以真实文件、实时编辑和独立插件生命周期验收，规划不代表能力已完成。

## Current development preview

![WorkDSH Skill market development preview](docs/assets/screenshots/workdsh-skill-market-preview.png)

User-provided screenshot of the current application, showing categories, search, installed-skill management and installation from a local catalog. Third-party skill names and icons belong to their respective providers; they do not demonstrate completed connector integrations. Task names and spending figures are local user state, not bundled defaults.

The current Office development candidate keeps `pptx-react-viewer` as its sole PPT editor, integrated with the native results panel and shared Office content service. It supports incremental slide writing, human editing, native chart data, saved working copies and PPTX download. Chinese UI and design guidance are still being improved; real-model visual quality acceptance is incomplete. This local candidate differs from the published Word-only packages above. See [PPT integration evidence](docs/evidence/office-pptx-integration.md).

### Native PPT editing preview

[Office alpha.3 source prerelease](https://github.com/techflag/workdsh/releases/tag/office-v0.1.0-alpha.3) · No new installable archive is attached.

![WorkDSH 原生 PPT 编辑](docs/assets/screenshots/workdsh-ppt-live-preview.png)

User-provided application screenshot showing incremental AI slide editing in the native results panel. This existing conversation still contains earlier export guidance; the new PPTX content_export implementation is described in the source and has not yet passed a real-session file-card acceptance test.

## Open-source components and acknowledgements

Thank you to these projects and their maintainers. This list covers major direct dependencies; package manifests, the lockfile and generated license inventories describe the full dependency set.

| Project | Use in WorkDSH | License |
| --- | --- | --- |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) / Cordis | Native tasks, model execution, skills, Loader, Profile, services and UI extension APIs | MIT |
| [React](https://github.com/facebook/react) | Feature pages and editor UI | MIT |
| [Tiptap](https://github.com/ueberdosis/tiptap) / [ProseMirror](https://github.com/ProseMirror) | Word working-copy editing, tables and images; adapted open-source Tiptap UI components | MIT |
| [pptx-viewer](https://github.com/ChristopherVR/pptx-viewer) | `pptx-react-viewer` 3.16.5 and `pptx-viewer-core` 3.14.3: the sole current PPT editing, parsing and export implementation | Apache-2.0 |
| [docx](https://github.com/dolanmiu/docx) | DOCX generation within the supported scope | MIT |
| [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) | Original-layout DOCX preview | Apache-2.0 |
| [Univer OSS](https://github.com/dream-num/univer) / [ExcelJS](https://github.com/exceljs/exceljs) | Existing experimental spreadsheet adapters in development builds; full online spreadsheets remain planned | Apache-2.0 / MIT |
| [i18next](https://github.com/i18next/i18next) / [react-i18next](https://github.com/i18next/react-i18next) | Chinese localization for the PPT editor | MIT |
| [Lucide](https://github.com/lucide-icons/lucide) | PPT toolbar icons | ISC |
| [dsh-cost-meter](https://github.com/Han-1413141/dsh-cost-meter) | Separately installed spending plugin in the local preview Profile; not bundled in WorkDSH releases | See the independent project's license |

Special thanks to **WorkBuddy / CodeBuddy** for product experience and skill-design references. Their experiences informed the Skill market layout, grouped toolbars and PPT design guidance. Locally available `tencent-pptx` and `ppt-implement` skills helped us study narrative, palette and layout methods. This acknowledgement does not classify WorkBuddy, its brand assets or skill resources as open source, indicate a Tencent PPT engine integration, or imply an official partnership or endorsement. DeepSeek Harness remains the execution foundation.

Third-party skills and materials retain their providers' terms. Generated archives retain copyright and license texts for dependencies actually bundled; see [Office third-party notices](packages/plugins/office/THIRD-PARTY-NOTICES.md).
