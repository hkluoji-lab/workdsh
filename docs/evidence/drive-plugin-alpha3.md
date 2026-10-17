# 网盘插件 alpha.3：全文索引 schema 上限修复（含线上存量记录处置）

2026-10-17 执行。承接 [dsh-0.2.1-rc.2 升级](dsh-0.2.1-rc.2-upgrade.md) 12.5 登记的遗留缺陷：线上 `workdsh_drive` 未激活（`1 entry did not activate`）。

## 一、缺陷与根因

- **症状**：`dsh.10ge.cn` 启动日志出现 `DomainError: domain 'workdsh_drive': stored record 'local-personal_portal-18938845688' in table 'states' does not match its schema`，网盘域整条记录拒绝加载，插件不激活。
- **根因**：`packages/plugins/drive/src/storage/domain.ts` 复用标识符 schema `id = z.string().min(1).max(256)` 作为 `textIndex` 的**值**约束（`z.record(id, id)`）；写入侧 `drive-manager.ts` 的降采样上限是 `MAX_INDEX_CHARS = 128 * 1024`。正文超过 256 字符的索引一旦落库，重载即校验失败。
- **与版本升级无关**：旧树与 rc.2 的 `dsh-storage-domain` 逐行一致，记录 mtime `2026-10-11 12:09` 早于本次升级。

## 二、代码修复（`0.1.0-alpha.2 → 0.1.0-alpha.3`）

- `storage/domain.ts`：抽出并导出 `MAX_INDEX_CHARS = 128 * 1024`，新增 `indexText = z.string().max(MAX_INDEX_CHARS)`，`textIndex: z.record(id, indexText)`。键仍限 256，值与写入侧同一真源。`schemaVersion` 保持 1，**无迁移**。
- `services/drive-manager.ts`：删除本地 `MAX_INDEX_CHARS`，改为从 `storage/domain.ts` 导入，消除两处上限漂移。
- `tests/drive.test.mjs`：新增用例「长正文（>256 字符）索引记录经重启后仍可加载，并可被正文搜索命中」。
- 版本承载同步：`package.json` `0.1.0-alpha.3`、`CHANGELOG.md`（补 α.2 与 α.3）、`docs/MODULE-VERSIONS.md`（补网盘行）、`deploy/profile/package.json` 指针。

## 三、门禁实测（仓库）

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm --filter workdsh-plugin-drive test` | build 通过；**5/5 pass，0 fail**（原 4 + 新增 1） |
| 制品自检 | `workdsh-plugin-drive-0.1.0-alpha.3.tgz`（43779 B，sha256 `b3b4e944…f7ea`）；包内 `dist/storage/domain.js` 含 `MAX_INDEX_CHARS` 与独立 `indexText`，`node --check` 通过 |

## 四、存量记录处置（线上）

- 备份：`/home/luoji/drive-a3-backup-20261017130020/drive-state.json`（原文件 sha256 `b5df8ae7…4a7c`）。
- 预检：`files 3 / revisions 3 / textIndex 2`（长度 37 与 2870），`too_long = []`、`orphan = []` ⇒ **无需截断、无需清洗**，记录本身是写入侧合法产物，原样保留。
- 说明：仅当值超过 128K 字符才截断；本次未触发。

## 五、线上部署（`dsh.10ge.cn`）

1. 制品上传 `…/data/workspace/wd-upload-022/`（容器内 root 写入，宿主/容器 sha256 一致）。
2. profile `package.json` 指针 `alpha.2 → alpha.3`；容器内 `pnpm install`（`Done in 2s`，lockfile 中 drive 解析为 `0.1.0-alpha.3`）。
   - **观察项**：首次 install 被 pnpm 11 的 `minimumReleaseAge` 策略拒绝（rc.2 官方包发布于 24h 内，lockfile 复检不通过），改用一次性 `--config.minimumReleaseAge=0` 完成；未修改 profile 持久配置。
3. `docker compose up -d --force-recreate`，约 10s `healthy`，`RestartCount=0`。
4. 复验：
   - CLI `0.2.1-rc.2`；容器内 3080 `200`；`https://dsh.10ge.cn/` `302 → /portal`。
   - 启动日志：`did not activate` **0 条**，无 `workdsh_drive` / `does not match its schema`。
   - entrypoint 补丁重放：`rc2-auth-proxy: ok (already patched)` 双份。
   - 已装版本 `0.1.0-alpha.3`，`dist/storage/domain.js` 含 `MAX_INDEX_CHARS`。
   - 只读 API（带 HMAC 门户头）：`space` 200（usedBytes 9682 / totalBytes 5 GiB）、`list` 200（1）、`list-archived` 200（2）、`errors=NONE`。
   - **存量长索引命中**：`search("根因")` 与 `search("插件市场")` 均命中 `rootowned-swap-README.md`，excerpt 来自那条 2870 字符索引，证明原失败记录已正常加载并参与内容搜索。

## 六、回退锚点

- 代码：`packages/plugins/drive` 版本回 `0.1.0-alpha.2`（旧制品仍在 `wd-upload-022/workdsh-plugin-drive-0.1.0-alpha.2.tgz`）。
- 线上配置：`/home/luoji/drive-a3-backup-20261017130020/{package.json,pnpm-lock.yaml,compatibility.json}`；回退 = 指针复原 + `pnpm install` + `force-recreate`。
- 记录：`drive-a3-backup-20261017130020/drive-state.json`（本次未改动）。

## 七、边界

- 未提交、未推送。
- 浏览器端逐页人工交互未执行；网盘 UI 的列表/回收站/搜索界面仍以 API 与既有 alpha.2 验证为据。
- 未做存量文件索引回填（alpha.1 期归档的文本文件仍无 `textIndex`），属既有范围。
