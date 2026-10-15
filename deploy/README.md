# deploy/ — dsh.10ge.cn 主机侧部署资产

本目录收纳**线上主机侧**的部署与运维资产：它们不是 Harness 功能插件，也不随
pnpm workspace 打包，而是直接在服务器上执行、或被容器挂载的脚本与制品的仓库副本。

| 路径 | 线上来源 | 内容 |
| --- | --- | --- |
| `tools/` | `.../data/dsh/tools/` | 站点自建的 `workdsh-*` Harness 插件（**仅交付编译产物 `dist/`**，无 TS 源码）、授权沙箱实验室（`workdsh-access-lab/`）、备份 / 兼容扫描 / 路由修复等脚本、第三方 web runtime 补丁（`workdsh-webruntime-patches/`） |
| `ops/bin/` | `/usr/local/bin/` | 主机级看护与告警脚本（`dsh-*`、`ss-tunnel-setup.sh`、`tunnel-watchdog.sh`）；告警出口读取 `/usr/local/etc/dsh-alerts.conf`（外部配置，不入库） |
| `ops/derived/` | `.../data/dsh/tmp/` | 幂等派生器：从官方镜像原文派生 Caddyfile / `docker-entrypoint.sh` 补丁（门户、增值后台、SSE keepalive、端口守卫、远端兜底、备份、看护等）。`survey` 的两个派生器归 `packages/survey/deploy/`，此处不重复 |

## 约定

- **只保留编译产物**：`tools/workdsh-*` 是线上就地构建并部署的插件，仓库只保留 `dist/` 与 `package.json`；`.gitignore` 已对 `deploy/tools/**/dist/` 显式豁免 `**/dist/`。它们不是 `packages/plugins/*` 的源码模块，也不进 `docs/modules.json`。
- **不含密钥与运行数据**：告警 webhook、隧道凭据、账号表、令牌、日志与运行报告一律不入库。
- **生效方式**：`ops/bin/` 脚本以 root 在宿主机执行；`ops/derived/` 改动的是容器内被只读挂载的派生副本，改后需 `docker compose up -d --force-recreate`（bind mount 换 inode 必须重建）。
- 完整比对结论与逐项差异见 [线上一致性审计报告](../docs/evidence/online-consistency-audit-2026-10-15.md)。
