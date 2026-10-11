# 网盘插件增量 alpha.2：全文内容搜索 + 回收站/恢复 + 配额展示

## 版本与范围

- 基线：`workdsh-plugin-drive@0.1.0-alpha.1`（首期，见 drive-plugin-alpha1.md）→ 本次增量为 alpha.2 候选（版本号随发布包决定）。
- 需求来源（2026-10-11 用户确认）：继续开发网盘功能，四项方向全部纳入，本次实现其中三项编码项 + 一项验证项：
  1. **全文内容搜索**：文本类文件建内容索引，搜索同时按文件名与正文匹配，返回内容片段。
  2. **回收站与恢复**：删除文件进入回收站（listArchived），可恢复（restore），可彻底删除（purge）。
  3. **配额展示**：space 返回真实 usedBytes/totalBytes（revisions 字节合计，来自实际服务，非示例数据）。
  4. **真实模型链路端到端验证**：已在线上执行（见文末「真实模型链路验证（已执行）」）。

## 官方能力复用记录

| 项目 | 内容 |
| --- | --- |
| 任务 ID | D18（P1-14）增量 |
| 官方文档路径 | docs/dsh-v0.2.0-rc.2/（待落盘）与已锁定发布包实测 |
| 锁定发布包/公开入口 | 无新增官方依赖；沿用 `@deepseek-ai/dsh-attachment-local` 的 `ctx.attachments.readFileStream`（saveReference 读附件字节建索引）、`@deepseek-ai/dsh-storage-domain` 的 `defineDomain` |
| 已有探针 | tests/probe-interfaces.mjs、drive.test.mjs |
| WorkDSH 需补的业务差异 | 文本降采样索引（TEXT_MEDIA + ≤256KB）、幂等 receipts、归档/恢复/彻底删除对象生命周期、配额来自服务端 |
| 验收与缺口 | 官方无网盘领域能力，全部为自有业务逻辑；缺口无 |

## 实现摘要

- `packages/contracts/src/drive.ts`：`DriveSpace` 增加 `usedBytes/totalBytes`；`DriveService` 增加 `listArchived/restore/purge`。
- `packages/plugins/drive/src/storage/domain.ts`：`driveStateSchema` 增加 `textIndex`（revisionId → 降采样 UTF-8 文本，`.default({})` 兼容旧记录，schemaVersion 保持 1）。
- `packages/plugins/drive/src/services/drive-manager.ts`：
  - `save()`（AI 生成/工具输出）与 `saveReference()`（用户上传文本附件读附件字节）在建修订时提取 `indexText`（仅 TEXT_MEDIA 且 ≤256KB，utf-8 严格解码，降采样 128K 字符）。
  - **类型推断修复**：捕获路径（`deliverables/presented` 未传 mediaType、`user/message` 文件附件因官方 `FileAttachmentRef` 无 mediaType 字段而只能是通用二进制）此前一律落为 `application/octet-stream`，导致全文索引对真实文件从不生效。新增 `textMediaTypes`（文本扩展名 → mediaType）与 `mediaTypeOf(name, provided)`，在 `save()`/`saveReference()` 中于类型缺失或为通用二进制时按扩展名推断，使 `.md/.txt/.json/...` 等真实产物建立内容索引。
  - `search()`：名字命中评分（全等4/前缀3/包含2）之外，正文命中给 2 分；excerpt 在正文命中时返回上下文片段（±40/80 字符），否则回退来源行。
  - `space()`：usedBytes = 全部 revision 字节合计，totalBytes = 配额上限。
  - `listArchived()`：已归档文件按归档时间倒序；`restore()`：节点子树归档文件置回 active；`purge()`：删除节点子树（nodes/files/revisions/textIndex）并清理引用其的 receipts（幂等凭证随之失效，同 operationId 可重新保存；附件字节由附件后端保留，不物理删除）。
- `packages/plugins/drive/src/remote/drive-api.ts`：端点 `list-archived` / `restore` / `purge`。
- `packages/plugins/drive/src/client/`：
  - `management.ts`：新增 `listArchived/restore/purge`。
  - `DrivePanel.tsx`：侧栏新增「回收站」入口与视图（工具栏隐藏上传/新建文件夹，菜单为恢复/彻底删除）；删除弹窗文案改为「移入回收站」；侧栏 footer 展示真实配额 `已用 X / 总量 Y`。
  - `DrivePreview.tsx`：**修复「预览无返回入口」缺陷**——预览会替换列表且当时整体隐藏工具栏，用户打开文件后无法回到列表。新增 `onClose` 可选属性，在预览头渲染「← 返回列表」并复用在样式中已预留但组件未使用的 `.spacer`（右侧仍保留「下载」）。
  - `styles.ts`：仅新增 `.wd-drive-crumb-current` 一个类，全部沿用 `--dsw-*` token，无新色板（UI-DESIGN.md §8 检查项）。
- `packages/plugins/drive/src/tools/drive-tools.ts`：`drive_search` 描述更新为「按文件名或文档正文关键词搜索…返回内容片段」。

## 验证

- `corepack pnpm --filter workdsh-plugin-drive test`：**4/4 通过**（lifecycle / boundary / capture / remote）：
  - 全文内容搜索：正文独特词命中且 excerpt 含片段；用户上传文本附件经 saveReference 读附件字节同样可内容搜索；无命中返回空。
  - 捕获路径类型推断：`deliverables/presented` 归档的 `.md` 文件 mediaType 推断为 `text/markdown`，其正文可被内容搜索命中（覆盖此前「真实文件无索引」的缺陷）。
  - 回收站：archive → listArchived 可见；restore → 回列表并可搜索；purge → 不可恢复、readBytes 抛 not-found、usedBytes 下降。
  - 幂等：purge 清除 receipts 后同 operationId 重放创建新节点（`recreated.id !== saved.id`）。
  - 配额：初始 usedBytes=0/totalBytes=5GB；remote 端点 list-archived/restore/purge 全链路。
- `node scripts/check-plan.mjs`：PASS（32 modules; 50 documents）。

## 线上部署（dsh.10ge.cn）

- 制品 `workdsh-plugin-drive-0.1.0-alpha.2.tgz`（sha256 `a4355493…d2765`，42969 B）上传宿主 `…/data/workspace/wd-upload-022/`（本地/服务器 sha256 一致）；profile `package.json` 依赖指针 `wd-upload-021 → wd-upload-022`（备份 `package.json.bak.drivea2fix*.` / `pnpm-lock.yaml.bak.drivea2fix*.`）；容器内 `pnpm install`（最终 `Done in 11.3s`）；`docker compose up -d --force-recreate` 重启。
- 复验：容器 `Up … (healthy)`、CLI `0.2.1-alpha.2`、`https://127.0.0.1:3080/` HTTP 200、13 个 workdsh 包齐全；安装包内 `grep -c mediaTypeOf dist/services/drive-manager.js`=3、`grep -c onClose dist/client.browser.js`=2（新代码已落位）。
- 观察项（非本次缺陷）：首次 `pnpm install` 在 `Verifying lockfile against supply-chain policies` 段出现两次 `Segmentation fault` 崩溃，改用 `--reporter=append-only` 后正常完成（`+1 -94`，均属 store 内去重/剪枝，13 个 workdsh 包与容器健康不受影响）；`docker logs` 中 `Cannot find module './core'` 来自独立的 `home/dsh/tools/cloud189-mcp`（既有问题，与本插件无关）。

## 未覆盖项（如实登记）

- 分享（外部只读链接）：涉及跨主体授权模型扩展，后置二期，本文档不宣称完成。
- 多端并发一致性、索引重建（存量文件无 textIndex 的补充回填）：后置。**线上现状**：α.1 时期归档的 `周报_2026-W41.md` 仍为 `application/octet-stream` 且无 textIndex，其正文暂不可内容搜索（仅 α.2 起新建/新归档的文本文件建立索引）。
- 响应式窄视口（≤760px）三栏仅呈现列表/预览单列：属既有 UI-DESIGN 断点行为，非本增量范围。

## 真实模型链路验证（已执行）

在线上 `dsh.10ge.cn` 用真实模型完成端到端验证（浏览器实测，非模拟）：

1. **真实模型生成 + 呈现 → 自动归档**：新建会话（模型 DeepSeek-V4.1-Flash）发送指令，模型真实调用「写入文件」工具创建 `diskverify-2026.md`（内容含标记词 `ZQNETDISKCHECK2026`），并调用交付/`present` 工具将其作为 deliverable 呈现（状态「已完成，用时 15 秒」，非模拟）。随后进入「网盘」，列表自动出现该文件（来源「工具输出」，65 B）。
2. **全文内容搜索命中**：在网盘搜索框输入 `ZQNETDISKCHECK2026` 回车，结果收敛为单条 `diskverify-2026.md`，说明文字含正文片段 excerpt：`我的网盘 · 工具输出 · …# 网盘验收 网盘内容索引标记词：ZQNETDISKCHECK2026 …`，证明为内容级匹配而非文件名匹配。
3. **服务端落库证据**：宿主 `…/storages/workdsh_drive/states/local-personal_portal-18938845688.json` 中该文件 mediaType = `text/markdown`，`textIndex` 收录其正文 `# 网盘验收\n\n网盘内容索引标记词：ZQNETDISKCHECK2026\n`（files=2 / revisions=2 / textIndex=1）。印证类型推断修复对真实捕获链路生效。
4. **回收站与配额 UI**：网盘侧栏存在「回收站」入口，进入显示空态（`这里还没有文件`）；侧栏 footer 显示真实配额 `已用 5.0 KB / 5.00 GB · 对话产物自动归档 · 仅当前账号`。
5. **预览返回修复**：打开文件后预览头出现「← 返回列表」，点击可回到列表（修复前无任何返回入口）。
