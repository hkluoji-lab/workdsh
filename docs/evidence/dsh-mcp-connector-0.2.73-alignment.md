# dsh-mcp-connector 真源对齐：0.2.72 → 0.2.73（2026-10-17）

任务：消除 `deploy/profile` 真源与线上 `dsh.10ge.cn` 的版本漂移。**本次不改线上**，线上早已是 `0.2.73`；只把仓库指针与版本豁免调到与线上一致。

## 1. 版本定位

| 项 | 值 |
| --- | --- |
| 线上已安装 | `dsh-mcp-connector@0.2.73`（`data/dsh/profiles/web/package.json` 与 `pnpm-lock.yaml` 均为 0.2.73） |
| 仓库真源（改前） | `deploy/profile/package.json` = `0.2.72` |
| 本次目标 | `0.2.73`（对齐线上，不追新） |
| npm 最新 | `0.2.75`（未采用；不在本次范围） |
| 基线宿主 | DSH `0.2.1-rc.2` |

`0.2.73` 发布于 2026-10-17T04:43Z，仍在 pnpm `minimumReleaseAge` 窗口内，故 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 必须同时包含 `0.2.73`（线上已有该行）。

## 2. 依赖与体积对比

- `package.json` 仅 `version` 字段不同；`dependencies` 仍为 `cross-spawn ^7.0.6`、`undici ^6.29.0`，`peerDependencies` 未变（`@deepseek-ai/dsh-mcp-client` 范围 `^0.1.1-rc.2 || >=0.2.0-rc.1 <0.3.0-0`，`0.2.1-rc.2` 在范围内，无需兼容豁免）。
- 发布包：`0.2.72` unpacked 1,951,148B；`0.2.73` unpacked 1,952,642B（+1,494B），88 个文件。
- 文件差异（解包对比）：`lib/client.js`、`lib/index.js`、`lib/web.js`、`package.json`、三份 README/CHANGELOG。

## 3. 上游变更（0.2.73 CHANGELOG）

- 兼容 DSH `0.2.1-alpha.1` 起的 `webStartup` 服务，同时保留旧宿主 `webRuntime` 支持，修复面板正文与 API 路由未挂载导致的空白（上游 #151）；两种服务并存时优先使用 `webStartup` 的可信主机配置，卸载时清理路由。
- 将插件 API 请求失败与 npm 版本查询失败区分提示，不再把路由不可用统一报成 npm 网络错误。

结论：该版本正是为 `0.2.1-*` 宿主做的兼容修复，与当前线上基线方向一致；线上已运行该版本，无异常。

## 4. 仓库变更

- `deploy/profile/package.json`：`dsh-mcp-connector` 依赖 `0.2.72 → 0.2.73`；`dsh.profile.bundles` 条目名不变。
- `deploy/profile/pnpm-workspace.yaml`：`minimumReleaseAgeExclude` 保留 `dsh-mcp-connector@0.2.72`，新增 `dsh-mcp-connector@0.2.73`（与线上文件一致）。

## 5. 线上现状核验（未做变更）

- `node_modules/dsh-mcp-connector/package.json` = `0.2.73`，依赖与 peer 同上。
- profile `package.json` 第 18 行 `0.2.73`，`bundles` 第 57 行仍装配该插件；`pnpm-lock.yaml` 三处均为 `0.2.73`。
- 重启后近 3 小时容器日志无 `mcp-connector` 相关 error；容器 `healthy`、`RestartCount=0`。

## 6. 风险与回退

- 风险：仅改仓库指针，无线上动作；按本目录重建 profile 时会解析到 `0.2.73`，与线上一致，风险低于继续停留在 `0.2.72`（旧版在 `0.2.1-*` 宿主上存在面板空白缺陷）。
- 回退：把两处指针改回 `0.2.72` 并移除 `0.2.73` 豁免行；线上不受影响。

## 7. 未执行

- 未升级到 npm 最新 `0.2.75`（需另立升级评估与证据）。
- 未改动线上 profile、未重启容器、未执行 `pnpm install`。
- 仓库仍不含 `pnpm-lock.yaml`（按 `deploy/profile/README.md` 约定由配置重建）。
