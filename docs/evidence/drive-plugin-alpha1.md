# 网盘插件（workdsh-plugin-drive）实现与验证证据

任务：P1-14（development-order D18）。用户需求（2026-10-11）：左侧导航新增「网盘」，自动归档并浏览所有对话产生的文档/图片（AI 生成 + 用户上传附件 + 工具输出文件），类似豆包智能体网盘。实施计划：[netdisk-drive-plugin-plan](../../.trae/documents/netdisk-drive-plugin-plan.md)（已批准）。官方能力复用记录见 [PLUGIN-DELIVERY.md](../PLUGIN-DELIVERY.md)「当前专项：网盘插件 D18 / P1-14」。

## 一、实现范围（t1—t8 全部完成）

- 独立插件 `packages/plugins/drive`（v0.1.0-alpha.1），与资料库（上下文知识）职责分离；`modules.json` 已登记（moduleVersion 0.1，P1-14）。
- 数据模型（`src/storage/domain.ts`）：`defineDomain({name:'workdsh_drive', version:1, layout:'per-record'})`，表 `nodes`（目录树，支持移动）/ `files`（kind/mediaType/byteLength/owner/source/sessionId/currentRevisionId/status）/ `revisions`（attachmentId/sha256，不可变）/ `receipts`（幂等）；key = `${organizationId}_${principalId}`。
- 服务（`src/services/drive-manager.ts`）：save（字节→附件后端→登记）/ saveReference（Host 附件引用只登记）/ readBytes / list / search（文件名+类型/来源/会话筛选）/ listSessions（会话维度聚合）/ rename / move（环检测+重名校验）/ archive（递归归档子树，列表与搜索排除，历史引用可读）/ 幂等（inputSha256 + operationId）/ quota / uniqueName 同名后缀 `方案 (2).md`。
- 捕获（`src/services/capture.ts`）：`session/event` 两路——`user/message` 图片/文件块→saveReference（source=user-upload，operationId=`user-${sessionId}-${attachmentId}`）；`deliverables/presented` 每个 path 经 `ctx.fs.resolve/readBytes` 读字节→save（source=tool-output，operationId=`present-${sessionId}-${turn}-${callId}-${index}`）。失败只记录不阻塞事件流，receipts 幂等防重放。
- 工具（`src/tools/drive-tools.ts`）：drive_save/list/read/search/rename/move/delete（服务端授权 + 归档约束）。
- Remote（`src/remote/drive-api.ts`）：/api/workdsh-drive POST `{endpoint,payload}`，source 白名单回退 user-upload、sessions 端点。
- Client（`src/client.tsx` + client/*）：`sidebar.panellist`（id=workdsh-drive，label「网盘」，order=55，图标 `drive`）+ 配对 `main` key=workdsh-drive 页面；`DrivePanel`（三栏：类型/来源/会话筛选 + 面包屑 + 搜索 + 上传/新建文件夹 + 预览 + 操作菜单 + 移动对话框）；`DrivePreview`（image/document/video/audio/其他 + meta + 下载）；`DriveUploader`；侧栏会话预览 tab `sidebar.right.pane.tab`（workdsh-drive-preview）；`bundle` productViews 登记 `drive: 'workdsh-drive'`。

## 二、探针与自动化测试（全绿）

1. 接口探针 `tests/probe-interfaces.mjs`（t4，隔离临时 Agents home + 最小 Context）：`ctx.attachments.saveFile` 返回内容寻址 `sha256:<hex>` 引用、`readFileStream` 逐字回读、`fileHostPath` 落盘校验；`session/event` 监听可达；`ctx.fs.resolve+readBytes` 读呈现文件字节。→ 回填 PLUGIN-DELIVERY 复用记录。
2. 自动化测试 `tests/drive.test.mjs`（t8，`corepack pnpm --filter workdsh-plugin-drive test`）：**4/4 通过**。
   - 生命周期：save/repeated 幂等（同 operationId+同内容→同节点）、异内容→`drive/operation-conflict`、同名后缀 `方案 (2).md`、saveReference（user-upload/kind image）、move+rename、search（文件名/类型/来源/会话筛选）、listSessions 聚合、readBytes 一致、archive 后列表与搜索排除（含会话维度 count 减少）、历史引用仍可读、重启持久化。
   - 授权边界：name-conflict/cycle/quota（maxTotalBytes）/invalid-attachment/`drive/invalid-actor`（requestId 空=撤权）/同组织另一主体独立空间不可读/另一组织同样隔离/byteLength 0 拒。
   - 捕获幂等：mock `workdshIdentity.resolve`，emit `user/message`（image 块）→ user-upload 归档、重复 emit 不重复；写交付.md + emit `deliverables/presented` → tool-output 归档、readBytes 一致、重复不重复。
   - Remote：source 白名单回退 user-upload、sessionId 透传、sessions 端点、`drive/not-found`→400。

## 三、工程验证

- `pnpm typecheck`（bundle + contracts + ui + drive）通过；drive `tsc -p tsconfig.json` 与 `build-drive.mjs`（含 client.browser.js esbuild bundle）通过。
- `node scripts/check-plan.mjs` PASS（32 modules / 50 documents）。
- 依赖：drive peerDeps/devDeps 精确锁定 `0.2.1-alpha.2`；contracts `exports` 登记 `./drive` 子路径。

## 四、实现教训（后续维护注意）

- 契约字段：`DriveNode.id` 是节点 ID，`DriveFile.nodeId` 是文件所属节点——测试误用 `nodeId` 传 move/archive 导致 `drive/not-found`，已修正测试。
- 搜索范围 = 文件名（首期收敛，未做全文/派生文本索引，区别于 library 的 conversion 全文索引）；排序 `score desc → updatedAt desc`，同名不同父/同名后缀按最新在前。
- `ctx.slots` 类型声明来自 `@deepseek-ai/dsh-client-ui-renderer/client`；`deliverables/presented` 类型增强来自 `@deepseek-ai/dsh-tool-present/types`。

## 五、未覆盖项（如实登记）

- 未做：全文内容搜索、多端并发、真实模型链路端到端归档（捕获事件由真实 Agent 触发的线上验证）、浏览器实测（dsh.10ge.cn 侧栏登录墙处理）。
- 线上部署与浏览器实测待用户授权后执行；未声明 dsh.bundle / 可加载 exports。
