# AgentTeams `0.1.22 → 0.1.23` 升级证据（2026-10-17）

## 一、结论与范围

仅升级第三方 bundle `@nanmicoder/dsh-agent-teams`，不触碰 DSH 基线（保持 `0.2.1-rc.2`）。目标版本取 npm `latest` = **`0.1.23`**；`next` 通道的 `0.1.24-rc.1` 属预发布，本次不选。

- 仓库侧：`deploy/profile` 真源已改为 `0.1.23`，豁免表随版本更新。
- 线上侧（`dsh.10ge.cn`）：**已执行**（2026-10-17 13:28，用户提供 SSH 凭据），容器 `healthy`、`RestartCount=0`、实装 `0.1.23`，详见第六节。

## 二、版本定位（npm registry 实测）

| 通道 | 版本 | 发布时间（UTC） |
| --- | --- | --- |
| `latest` | **0.1.23** | 2026-10-11 02:32 |
| `next` | 0.1.24-rc.1 | 2026-10-17 08:03 |
| `alpha` | 0.1.15-alpha.1 | 更旧，不采用 |

当前安装版本 `0.1.22`（2026-09-29）。`0.1.23` 为稳定通道最新版。

## 三、兼容性核对

- `0.1.23` 的 `peerDependencies` 与 `0.1.22` 完全一致，宿主矩阵上限仍是 **`0.2.0-rc.2`**（包内 `compatibility.json` 的 `recommendedHost` 亦为 `0.2.0-rc.2`，共 8 个 supportedHosts）。
- 因此 `0.2.1-rc.2` 仍不在其声明范围内，**必须保留版本豁免**。仓库 `deploy/profile/compatibility.json` 由 `@0.1.22 → ["0.2.1-alpha.2","0.2.1-rc.2"]` 改为 `@0.1.23 → ["0.2.1-rc.2"]`。
- `0.1.24-rc.1` 的 peer 新增 `0.2.1-rc.1`，但仍未声明 `0.2.1-rc.2`，豁免同样需要；本次不采用预发布版本。
- 制品校验：`npm pack @nanmicoder/dsh-agent-teams@0.1.23` → `nanmicoder-dsh-agent-teams-0.1.23.tgz`，sha256 `53d40ce9d0db307496b751d506c27799ade52c315b9a0313707849a896bb66e9`；`dsh.bundle.patch = ./cordis.patch.yml`，client inject 8 项与 0.1.22 相同。

## 四、0.1.23 变更摘要（官方 release notes）

- 修复 Unicode 团队卡片与历史事件折叠的身份不一致（#203）。
- 拒绝非法 finding 行号并规整历史可恢复值（#188）。
- 成员模型与配置的 provider 一并解析，保留显式 provider 选择（#189）。
- 任务结算后到达的成员 turn 失败写入 durable captain notes（#205）。
- 评审/验证结论绑定实际产物字节与修复谱系，产物变更未覆盖即阻断交付（#161）。
- 保留修复契约、暴露 stale source 警告，失败验证生成修复/复验后续任务且不死锁（#174、#175）。
- 超出允许修复范围的 finding 升级上报而非创建不可执行任务（#183）。
- 跨 warm/cold fork 保留 captain 身份与多跳谱系（#176）。
- 会话 source 元数据写入当前格式，附非破坏性历史恢复工具（#160）。
- 新增 owner 配置的成员工具策略（非 OS 沙箱）（#59）。

## 五、仓库改动

| 文件 | 改动 |
| --- | --- |
| `deploy/profile/package.json` | `@nanmicoder/dsh-agent-teams` `0.1.22 → 0.1.23` |
| `deploy/profile/compatibility.json` | 豁免条目改为 `@0.1.23`，仅接受 `0.2.1-rc.2` |
| `deploy/profile/README.md` | 豁免表说明同步 |

`deploy/profile/pnpm-workspace.yaml` 的 `overrides` 未涉及该包，无需同改；`minimumReleaseAgeExclude` 中的 `@0.1.18 || 0.1.22` 未扩展——`0.1.23` 发布于 6 天前，不受 24h 策略拦截。

## 六、验证记录

| 项 | 结果 |
| --- | --- |
| JSON 合法性 | `package.json` / `compatibility.json` 解析通过 |
| 计划完整性 | `node scripts/check-plan.mjs` PASS（34 modules；50 documents） |
| 制品可获取与内容 | `npm pack` 成功，sha256 与包内 `dsh.bundle` / peer 矩阵已核对 |
| 线上安装 | `dsh plugin --profile web add` 首次被兼容闸门拒绝（预期），`allow-version 0.1.23 --dsh-version 0.2.1-rc.2 --accept-risk` 后重试成功，`Done in 10.4s using pnpm v11.7.0` |
| 线上实装版本 | `dsh plugin --profile web list` = `@nanmicoder/dsh-agent-teams@0.1.23`；`node_modules` 内 `version` = `0.1.23` |
| 容器状态 | `--force-recreate` 后 `Started=2026-10-17T13:28:48Z`，`healthy`，`RestartCount=0` |
| 健康检查 | 容器内 `127.0.0.1:3080` = `200`；`https://dsh.10ge.cn/` = `302 → /portal` |
| 启动日志 | `did not activate` / `incompatible` / bundle skip 均 0 条；agent-teams 无报错 |
| 补丁层 | `rc2-auth-proxy: ok (already patched)` 双份（standalone 树 + profile） |
| 团队面板 UI（浏览器实测） | 门户密码登录成功，工作台正常渲染；会话头「智能体团队」弹窗可打开，显示成员 `lead`（未运行，模型 `deepseek-flash`）与「暂无共享任务」；插件 `client.js` 已加载，`GET /plugins/dsh-agent-teams/state` 与 `?archived=1` 正常；控制台无 `error`、无 agent-teams 报错、无 5xx |
| 控制台其余噪声 | 7 条 `warn` 均为 `dsh-russian-lang` 重复注册语言包；`GET /@vite/client` 被 `ERR_ABORTED`（开发探针请求，不影响页面） |
| 真实团队任务 | 未执行（验证过程未新建会话、未发送消息） |

备份：`/home/luoji/agent-teams-0123-backup-20261017132821/`（`package.json`、`compatibility.json`、`pnpm-lock.yaml`）。安装后已删除线上 `compatibility.json` 中过期的 `0.1.22` 条目，与仓库真源保持一致。

## 七、线上执行步骤（2026-10-17 已执行）

实际顺序与下方脚本一致，差异只有一处：`add` 会先被兼容闸门拒绝，因此 `allow-version` 在首次 `add` 之后、重试 `add` 之前执行。

```sh
# 1) 备份
ssh luoji@192.168.11.205 'cp -a /opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/profiles/web/package.json /home/luoji/agent-teams-0123-backup-package.json'

# 2) 安装（容器内，保持 --profile web）
docker exec -u 1000:1000 -e HOME=/data/dsh/home dsh \
  dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.23

# 3) 版本豁免（如插件安装时未自动写入）
docker exec -u 1000:1000 -e HOME=/data/dsh/home dsh \
  dsh plugin --profile web allow-version @nanmicoder/dsh-agent-teams@0.1.23 \
  --dsh-version 0.2.1-rc.2 --accept-risk

# 4) 重装依赖（如需要）
docker exec -u 1000:1000 -e HOME=/data/dsh/home -w /data/dsh/profiles/web dsh \
  pnpm install --reporter=append-only

# 5) 重建容器
docker compose -f /opt/1panel/apps/deepseek-harness/deepseek-harness/docker-compose.yml up -d --force-recreate
```

复验口径（与续五十二一致）：容器 `healthy`、`RestartCount=0`、CLI `0.2.1-rc.2`、3080 `200`、`https://dsh.10ge.cn/` `302 → /portal`、启动日志 `did not activate` / `incompatible` 均为 0、实装版本 `0.1.23`、`compatibility.json` 含 `0.1.23@0.2.1-rc.2`、团队面板可打开。

## 八、回退锚点

- 仓库：`git revert` 本节改动即可。
- 线上：`dsh plugin --profile web add --save-exact @nanmicoder/dsh-agent-teams@0.1.22`，恢复 `compatibility.json` 的 `@0.1.22` 条目（含 `0.2.1-alpha.2` / `0.2.1-rc.2`），再 `pnpm install` + `--force-recreate`。

## 九、边界

- 0.1.23 声明的宿主上限仍是 `0.2.0-rc.2`，在 `0.2.1-rc.2` 上运行属**豁免接受**，不等于上游验收。
- 团队面板已做浏览器实测（登录、弹窗、插件接口），但未创建多成员团队、未执行真实团队任务，也未覆盖冷启动恢复。
- 线上已升级到 `0.1.23`；回滚需重新安装 `0.1.22` 并补回其豁免条目。
