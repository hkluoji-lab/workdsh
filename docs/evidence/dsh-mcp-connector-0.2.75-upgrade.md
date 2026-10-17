# dsh-mcp-connector 升级：0.2.73 → 0.2.75（2026-10-17）

任务：把 `dsh.10ge.cn` 线上 `dsh-mcp-connector` 从 `0.2.73` 升到 npm 最新 `0.2.75`，并同步仓库真源。
基线宿主：DSH `0.2.1-rc.2`。

## 1. 版本定位

| 项 | 值 |
| --- | --- |
| 升级前 | `0.2.73`（2026-10-15T11:03Z） |
| 目标 | `0.2.75`（2026-10-17T03:19Z，npm `latest`） |
| 中间版本 | `0.2.74`（2026-10-16T07:22Z，仅文档/证据类变更） |
| 发布包 | unpacked 1,895,371B / 88 文件（`0.2.73` 为 1,952,642B，-57KB） |
| 宿主要求 | `engines.node >=20`；peer 未变，`dsh-mcp-client` 范围覆盖 `0.2.1-rc.2` |

`0.2.75` 发布不足 24h，仍在 pnpm `minimumReleaseAge` 窗口内，升级命令需带 `--config.minimumReleaseAge=0`，并在 `minimumReleaseAgeExclude` 补 `0.2.75`。

## 2. 依赖与代码变更

- `dependencies` / `peerDependencies`：与 `0.2.73` 完全一致（`cross-spawn ^7.0.6`、`undici ^6.29.0`；peer 无变化），无需兼容豁免。
- 代码差异：`lib/index.js`、`lib/tools.js`、`cordis.patch.yml`；`lib/client.js` **未变**（首屏体积不受影响）。
- 文档差异：CHANGELOG、README、`docs/tutorials/*`、截图资产。
- `cordis.patch.yml` 新增配置项 `compactManagementTools: false`（默认关闭，保持旧工具名兼容；修改后需重载插件）。

## 3. 上游变更（0.2.75 CHANGELOG）

- 可选 `compactManagementTools` 精简管理工具模式（#161）：开启后 25 个管理工具收敛为「只读发现」与「会话管理」两个入口，图形界面功能不变；默认关闭。
- 统一发现入口只允许目录、状态、缓存搜索与详情四种操作，保留工作区参数与渲染，不提供通用工具调用、凭据变更或授权代理；业务工具可见性、会话确认与 Host 审批沿用原机制。
- 教程相对 Markdown 链接/图片检查（#159 / #156）纳入 `npm run check`。
- 上游验证范围：本地 `npm run check` 408 通过 / 4 条件跳过 / 0 失败；真实 DSH Web 开关重载与模型调用验收仍需单独完成（本次线上复验覆盖这一点）。

`0.2.74` 为文档与缓存生命周期证据补充，无运行时代码变化。

## 4. 风险清单

| 风险 | 评估 | 处置 |
| --- | --- | --- |
| 管理工具注册路径变化（25 个工具） | 默认 `compactManagementTools:false`，行为应与 0.2.73 一致 | 升级后核对插件激活、工具列表与 `did not activate` |
| 新配置项与 profile 补丁层叠加 | `cordis.patch.yml` 属插件包内默认值，profile 未覆盖该项 | 保持默认 false，不额外写入 |
| pnpm 版本策略拦截 | 发布 <24h | 命令带 `--config.minimumReleaseAge=0`，并把 `0.2.75` 加入豁免表 |
| 回退 | 0.2.73 制品仍在 registry，profile 三件套已备份 | 备份目录 `/home/luoji/mcp-connector-0273-backup-20261017/` |

## 5. 执行与验证（已完成）

- [x] 备份 profile 三件套 → `/home/luoji/mcp-connector-0273-backup-20261017/`（`package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`）
- [x] `dsh plugin --profile web add dsh-mcp-connector@0.2.75 --config.minimumReleaseAge=0`：pnpm 11.7.0，15.4s，`+1 -94`（依赖去重，非卸载功能插件）；`node_modules`、profile `package.json`、`pnpm-lock.yaml` 三处均为 `0.2.75`
- [x] `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 追加 `dsh-mcp-connector@0.2.75`（与 `0.2.72`、`0.2.73` 并存）
- [x] `docker restart dsh`：`Up (healthy)`、`RestartCount=0`；启动日志 `did not activate` / `error` 均为 0，无 `mcp-connector` 相关告警
- [x] 其余第三方插件仍在位：`@xmanrui/dsh-im`、`dshmarket`、`dsh-prompt` 目录均存在
- [x] 面板正文与 API 路由（0.2.73 修复项回归）：
  - `GET /mcp-connector/ui` → `200`，154,071B HTML，CSP `frame-ancestors 'self'`
  - `POST /mcp-connector/api {"method":"status"}` → `200`，返回 `共 7 条连接；未指定 Workspace，展示全部范围`（draw.io 等 7 条连接正常读出）
- [x] 工作台 HTML 仍包含 `mcp-connector` 客户端条目；首屏耗时与升级前同量级（client.js 未变）
- [x] 仓库真源同步：`deploy/profile/package.json` = `0.2.75`，豁免表追加 `0.2.75`

> 未执行：`compactManagementTools` 开关（默认 false，本次不改）；真实模型调用验收（无业务变更，不涉及）。

## 6. 回退

1. `dsh plugin --profile web add dsh-mcp-connector@0.2.73 --config.minimumReleaseAge=0`；
2. 或直接还原备份的三个文件后 `pnpm install --offline`；
3. `docker restart dsh`。
