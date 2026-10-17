# deploy/profile/ — dsh.10ge.cn Web Profile 部署态配置真源

本目录是线上 `dsh.10ge.cn` 的 **DSH Web Profile 配置真源**（对应容器内
`data/dsh/profiles/web/`）。它决定线上实际装配哪些 bundle、补丁层如何改写插件树、
依赖如何解析——**这些行为无法从 `packages/` 源码推断**，故于 2026-10-15 从线上回填入库。

采集位置：`luoji@192.168.11.205` 的
`/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/profiles/web/`。

| 文件 | 作用 |
| --- | --- |
| `package.json` | profile 依赖 + `dsh.profile.bundles`（28 项 bundle 装配顺序）与 `patchReload: live` |
| `cordis.patch.yml` | 补丁层：`disabled` 开关（computer-use 系列、`ui-plugin-manager`）、`insert` 条目（`time-context`、`workdsh-remote-shell`）、`llm-pi-ai` 的 `jhpt` provider 与模型 ID、身份桥 `secretFile` 引用等 |
| `cordis.yml` | profile 根条目列表（空 `[]`，树完全由 bundles + patch 组合） |
| `compatibility.json` | 版本兼容豁免表（当前 1 条：`@nanmicoder/dsh-agent-teams@0.1.22` 接受 `0.2.1-alpha.2` 与 `0.2.1-rc.2`） |
| `pnpm-workspace.yaml` | profile workspace 配置：`overrides`（决定实际解析版本，**压过 package.json**）、`allowBuilds`、`minimumReleaseAgeExclude`、`nodeLinker: hoisted`、`storeDir` |

## 不含密钥

- 凭据以**环境变量名**引用（`apiKeyEnv: JHPT_API_KEY`），值在服务器 `.env`，未入库。
- 身份桥密钥以**文件路径**引用（`secretFile: /data/dsh/portal/identity-bridge.key`），密钥文件本身未入库。
- 回填前已对全部文件做高信号模式扫描：无明文口令 / token / 私钥。

## 应用方式（重建或迁移时）

1. 把本目录 5 个文件拷到目标 profile 目录（容器内 `data/dsh/profiles/web/`）。
2. `package.json` 的 workdsh 依赖是 `file:/workspace/wd-upload-019/…tgz`——**容器内路径**，须先把对应制品放到挂载的 `/workspace/wd-upload-*` 下，或改写为实际路径。
3. `pnpm install` 后 `docker compose up -d --force-recreate`（bind mount 换 inode 必须重建）。
4. 关键教训：`pnpm-workspace.yaml` 自带 `overrides` 会**压过** `package.json`，两处必须同改，否则实际版本不变。

## 边界

- 本目录是**配置快照**，不是可运行代码；不声明 npm 包、不进 `docs/modules.json`、不参与 pnpm workspace（仓库根 workspace 仅含 `packages/*`、`packages/plugins/*`、`packages/providers/*`、`examples/*`）。
- `storeDir: /data/dsh/.pnpm-store/v11` 与 `file:` 上传路径均为**线上形态**，保留原样以便逐字对照。
- `node_modules/`、`pnpm-lock.yaml`（744K，可由上述配置重建）、`*.bak.*` 备份、`.plugin-manager/` 运行日志**均不入库**。
