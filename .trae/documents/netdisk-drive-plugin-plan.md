# 网盘插件（workdsh-plugin-drive）实施计划

## Context（背景与目标）

用户需求（2026-10-11 确认）：在 WorkDSH 左侧导航栏新增「网盘」入口，自动归档并浏览**所有对话产生的文档/图片**，类似豆包智能体的网盘。用户已拍板：

- **方案**：独立新插件 `workdsh-plugin-drive`，与既有 `workdsh-plugin-library`（资料库，语义为对话上下文引用的知识资料）职责分离。
- **归档来源（全部自动收集）**：AI 生成的文档/图片 + 用户上传的附件 + 工具输出的文件。
- **首期能力**：列表+预览+搜索；会话关联与筛选；文件操作（重命名/删除/移动/下载，含授权与归档约束）；手动上传。

本计划按 AGENTS.md / docs/PLUGIN-DELIVERY.md / docs/UI-DESIGN.md 约束制定；属于范围新增，实施前需先更新决策、计划与台账（development-order.json、modules.json、STATUS.md，必要时 ADR）。

## 已核实的代码事实（本批次实测）

- **侧栏注入模式**：`packages/plugins/library/src/client.tsx` L147-L165——`ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({name:'sidebar.panellist', id:'workdsh-library', label:'资料库', order:50}, NavIcon))` 注册导航行，同时 `ctx.slots.inject('main', ...)` 注册同 key 页面。注释强调：导航行与 main 页面**必须同插件自持注册**，否则 `layout.selectPanel` 抛未注册错误。
- **Domain/存储模式**：`packages/plugins/library/src/storage/domain.ts` L46-L54——`defineDomain({name:'workdsh_library', version:1, layout:'per-record', tables})` + zod schema；key = `${organizationId}_${principalId}`。
- **工具模式**：`packages/plugins/library/src/tools/library-tools.ts`——`defineTool` + `ctx.tools.register`。
- **官方包可用性（服务器线上闭包 0.2.1-alpha.2 实测）**：
  - `@deepseek-ai/dsh-tool-present@0.2.1-alpha.2`：声明 `session/event` 的 `deliverables/presented` 事件（`{turn,callId,files:PresentedFile[]}`）。
  - `@deepseek-ai/dsh-client-file-upload@0.2.1-alpha.2`：用户上传 → `user/message` 事件携带 FileBlock/ImageBlock。
  - `@deepseek-ai/dsh-fs-local@0.2.1-alpha.2`：宿主文件系统（`ctx.fs.resolve` / readBytes 读取呈现文件字节）。
  - `@deepseek-ai/dsh-session@0.2.1-alpha.2`：`'session/event'(session,event)` 事件流（agent-scoped）。
  - `@deepseek-ai/dsh-attachment-local@0.2.1-alpha.2`：附件 host 后端。
- **本地仓库缺包**：以上官方包本地 node_modules 未安装（开发态只装部分依赖），实施时须在插件 `package.json` 声明这些依赖并精确锁定 `0.2.1-alpha.2`，`pnpm install` 后验证。

## ⚠ 关键风险（实施第一步必须先做最小探针）

- **`@deepseek-ai/dsh-attachment` 主包不存在**（本地与线上均无，仅 `dsh-attachment-local`）。附件 API（`ctx.attachments.saveFile` / `AttachmentStore` / `FileAttachmentRef`）的**真实导出入口待实测确认**——可能由 `dsh` 本体 ctx 或 `dsh-storage` 暴露。
- **行动**：编码前在隔离探针环境（临时 Agents home + 最小 Host 组合）用最小探针确认：① 附件存储入口与返回结构（attachmentId/name/bytes）；② `session/event` 监听方式与 `deliverables/presented`、`user/message` 事件 payload 实测；③ `ctx.fs` 读取呈现文件字节的接口。探针证据回填 PLUGIN-DELIVERY.md「官方能力复用记录」。不猜接口、不静默改接口（AGENTS.md 硬约束）。

## 模块结构（仿 library）

```
packages/plugins/drive/
  package.json            # dsh.client.inject：仿 library + dsh-client-file-upload；服务端 inject：storageDomain/connection/tools/workdshIdentity/sessions/attachments/fs
  src/index.ts            # apply：open domain、注册 session/event 捕获、remote/tools/context-injection
  src/storage/domain.ts   # defineDomain('workdsh_drive') + zod schema
  src/services/drive-manager.ts  # 归档/查询/重命名/删除/移动/下载（服务端授权）
  src/services/capture.ts        # session/event → 附件/呈现文件 → 不可变归档（幂等：sha256+事件 seq）
  src/tools/drive-tools.ts       # drive_save/list/read/search/rename/move/delete
  src/remote/drive-api.ts        # Remote 契约
  src/runtime/context-injection.ts
  src/client.tsx         # sidebar.panellist + main + sidebarRight 注册（同插件自持配对）
  src/client/DrivePanel.tsx / DriveFileList.tsx / DrivePreview.tsx / DriveUploader.tsx
```

`package.json` 版本号按模块版本线 `0.1`（docs/modules.json 登记）；dsh 依赖全部精确 `0.2.1-alpha.2`。

## 数据模型与存储/授权

- **字节**：存入附件后端（入口待探针确认），存不可变副本；`revisions` 记录 `attachmentId/sha256`。内容变更 = 新 revision，**不可原地改写**；删除 = `status:'archived'`（归档保留引用）。
- **元数据**（domain 表 `workdsh_drive`，per-record）：`files{id,name,mediaType,byteLength,owner,source:'ai-generated'|'user-upload'|'tool-output',sessionId,attachmentId,currentRevisionId,status,createdAt,updatedAt}` + `revisions` + `nodes`（文件夹，支持移动）。
- **授权**：`ctx.workdshIdentity.resolve` 取 actor，key = `${organizationId}_${principalId}`（仿 library domain.ts L53）；服务端校验所有权，跨组织引用默认拒绝。
- **捕获**：`ctx.on('session/event')` 两路——`user/message` → 附件引用 → 归档（source=user-upload）；`deliverables/presented` → 每个 path 用 fs 读字节 → 附件保存 → 登记（source=tool-output/ai-generated，按呈现来源判定）。Harness 日志拥执行事实，drive 只拥对象关系（AGENTS.md）。

## 侧栏 + 页面 + 组件

- `sidebar.panellist` id=`workdsh-drive`，label「网盘」，order=55（紧邻资料库 50），图标按 UI-DESIGN.md；与 `main` key=`workdsh-drive` 同插件配对。
- main 页面三栏布局（遵循 UI-DESIGN.md 第 5 节）：全局导航 / 类型·会话筛选 / 文件列表（支持预览、上传、操作菜单）。
- 会话内预览：`sidebarRightTabs.register('workdsh-drive-preview')` + `sidebar.right.pane.tab`；原文件预览复用 `documentPreviews.register` 与 library 预览注册表，不重复实现渲染器。
- `sidebar-right` 仅承载当前会话文件/成果上下文（AGENTS.md 约束），**网盘全局入口只走 sidebar.panellist**。

## Agent 工具

仿 `library-tools.ts` 模式：`drive_save`（bytes+name+source → 附件+登记）、`drive_list`（type/session 筛选）、`drive_read`、`drive_search`、`drive_rename`/`drive_move`/`drive_delete`（服务端授权 + 归档约束）。工具说明限定「网盘归档文件管理」场景，不越界读写其他插件数据表。

## 文档登记（范围新增必做）

1. `docs/modules.json`：新增 `packages/plugins/drive` 模块（moduleVersion 0.1、directories、阶段 P1、任务号）。
2. `docs/development-order.json`：新增网盘步骤（dependsOn 已完成步骤，不动 currentStep 现有推进规则）。
3. `docs/PLAN.md` / `docs/ARCHITECTURE.md`（如涉及所有权/新基础抽象）与 `docs/CONTRACTS.md`（`contracts/src/drive.ts` 契约 + 对外导出）。
4. `docs/PLUGIN-DELIVERY.md`：填「官方能力复用记录」——任务 ID、官方文档路径、锁定发布包/公开入口、已有探针、业务差异、验收与缺口。
5. `docs/STATUS.md`：登记实施进度与证据。
6. 如与 library/projects 存在职责边界，补 ADR 说明「网盘 = 产物归档」vs「资料库 = 上下文知识」。

## 验证方案

1. **探针（隔离测试 home/Profile，不用真实用户 Profile）**：
   - `attachments.saveFile`（入口确认后）模拟保存 → 断言 `user/message` 附件归档。
   - 触发 `deliverables/presented`（真实 present 工具）→ 断言 path 字节归档且幂等（重复事件不重复登记）。
   - `drive_list/search/rename/archive` 的**两主体两组织授权矩阵**（P0/P1 必须验证：两个主体、两个组织、撤权、跨账号拒绝）。
2. **工程**：`pnpm typecheck` / `build`（13+ workspace 包）通过；`node scripts/check-plan.mjs` PASS。
3. **浏览器实测**（dsh.10ge.cn 左侧导航）：登录墙处理——先经 /portal 登录（用户协助一次或复用现有会话），确认：侧栏「网盘」入口存在、点击进入 main 页面、筛选/预览/上传/下载可用；同步顺带确认升级风险点「自动化任务」导航（上一轮被中断的验证，同为侧栏 UI 实测）。
4. 未覆盖项如实登记（真实模型链路、多端并发等按实际执行情况标注）。

## 实施顺序

1. 更新决策/计划/台账（development-order.json、modules.json、STATUS.md、CONTRACTS、PLUGIN-DELIVERY 复用记录占位）。
2. 最小探针确认附件/事件/fs 接口（隔离环境）→ 回填证据。
3. 建插件骨架 + domain + capture 服务 + manager + 工具 + remote。
4. client：sidebar.panellist + main 页面 + 预览 + 上传。
5. bundle 装配 + workspace 依赖精确锁定 + pnpm install + typecheck/build。
6. 探针验证 + 浏览器实测（登录墙处理）+ 文档证据回填。
