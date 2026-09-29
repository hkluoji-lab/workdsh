# DSH 升级证据（0.1.7-alpha.2 → 0.1.7-rc.2，线上 + 仓库基线）

2026-09-28 执行。本文件记录线上 `dsh.10ge.cn`（`luoji@192.168.11.205`，1Panel 应用 `deepseek-harness`）从 `0.1.7-alpha.2` 升级到官方 `latest` `0.1.7-rc.2` 的实际命令、结果、判定口径与未覆盖边界。

**批次性质**：本批分**两个阶段**，首日（2026-09-28）为**线上运行面单独升级**，与前三批「仓库依赖面 + 文档镜像 + 线上切换」的联合升级不同；用户随后补作三项裁决，**同日追加第二阶段**：仓库基线随升至 `0.1.7-rc.2`（根与 14 个模块的版本承载文件 + `pnpm-lock.yaml` + 门禁脚本常量）、rc.2 官方文档镜像落盘与引用重锚、8 插件 peer 由精确值重指为 caret。两阶段合并后仓库侧与线上**不再存在基线分叉**（均为 `0.1.7-rc.2`）。第二阶段执行与实测见本文「八、仓库基线随升（第二阶段）」。

用户三项裁决（2026-09-28，线上阶段）：
1. 升级目标版本 = **0.1.7-rc.2**（未选 `next` 通道的 `0.2.0-rc.1`，未选「暂不升级」）。
2. compose 镜像 tag **保持 `0.1.5-rc.1` 不动**（避免触发 1Panel 重写 compose）。
3. 8 个 WorkDSH 插件因 peer 精确锁被 skip 的修复路径 = **官方豁免 `allow-version`**（未选「重指仓库 peer 并重打包」，未选「回退到 alpha.2」）。

用户追加三项裁决（2026-09-28，仓库阶段）：
1. 「清理」= **清理服务器 47.6GB core dump**（已执行，见「八」）。
2. 「仓库基线随升」= 仓库版本承载文件由 `0.1.7-alpha.2` 全量切到 `0.1.7-rc.2`（已执行）。
3. 「8 插件 peer 重指」= 8 个已部署插件的 dsh peer 由**精确值**重指为 **caret `^0.1.7-rc.2`**（已执行；`devDependencies` 仍精确锁定），使后续 rc.3 等递进版本不再触发 skip。

## 一、官方版本定位

命令：`curl -s https://registry.npmmirror.com/@deepseek-ai/dsh` → 解析 `dist-tags`。

```
dist-tags= {"alpha":"0.1.7-alpha.2","latest":"0.1.7-rc.2","next":"0.2.0-rc.1"}
modified= 2026-09-28T12:34:10.612Z
total_versions= 28
tail= 0.1.6-alpha.1, 0.1.6-alpha.2, 0.1.5-rc.3, 0.1.7-alpha.1, 0.1.7-alpha.2, 0.1.7-rc.1, 0.1.7-rc.2, 0.2.0-rc.1
```

- **官方 `latest` = `0.1.7-rc.2`**，即用户所选目标；`next` 已是 `0.2.0-rc.1`，属跨小版本通道，本批不取。
- alpha 通道停在 `0.1.7-alpha.2`（与仓库基线一致），说明仓库当前锁定的正是 alpha 通道末端。

## 二、线上实际版本（升级前）

`docker exec dsh dsh --version` = `0.1.7-alpha.2`；镜像 `1panel/deepseek-harness:0.1.5-rc.1`。

**关键机制（本批的认知前提）**：compose 中
```
data/dsh/global-dsh/standalone:/usr/local/lib/node_modules/@deepseek-ai/dsh
```
为 **bind mount，覆盖镜像内 dsh**。因此「线上 dsh 版本」由**宿主 standalone 树**决定，**镜像 tag 与实际版本解耦**——改 tag 无效，改宿主树才生效。这正是用户裁决 2「镜像 tag 保持 0.1.5-rc.1」成立的技术依据：镜像仅提供 Node 运行时与 entrypoint，dsh 本体来自挂载树。

## 三、执行证据（三阶段）

盘点路径：`D=/opt/1panel/apps/deepseek-harness/deepseek-harness`、`G=$D/data/dsh/global-dsh`、`P=$D/data/dsh/profiles/web`。

### P0 基线（`/home/luoji/dsh-backup-rc2-20260928224220/baseline.txt`）

```
ts=20260928224220
image=1panel/deepseek-harness:0.1.5-rc.1
image_id=sha256:a2ee56aa955cd03db21fcefbf1992313dbce270f839b60578d73817675c99b6d
cli_version=0.1.7-alpha.2
standalone_pkg_version=0.1.7-alpha.2
container_status=running / healthy
restarts=0
caddyfile_md5=53bad44d355cdf5924703a949835586c
entrypoint_md5=fa304713e29b2d4b23851369935501eb
sessions_dirs=56 / v3=18 / v4=39 / locks=56
storages_top=cost-meter,mcp_connector_grants_v1,...,workdsh_identity_portal,workdsh_library,workdsh_office,workdsh_projects,workdsh_runtime_binding,workspace.json,
profile_official_deps=6
```

备份内容：`profile-config-full.tgz`(289MB) / `sessions.tgz`(43MB) / `storages.tgz`(6.6MB) / `SHA256SUMS.txt` + 5 份配置文件。

### Phase 1 — profile 依赖重装到 rc.2（`/home/luoji/dsh-backup-rc2-switch-20260928230332/`）

- `version-distribution.txt`：`dsh versions: {"0.1.7-rc.2": 224}` + `VERSION_DISTRIBUTION_OK`
- `profile-deps-after.txt`：`OFFICIAL dsh-base/schedule/time-context/web-app = 0.1.7-rc.2`；`FILE_DEPS=12`（12 个 workdsh tgz `file:` 路径）→ `RETARGET_OK`
- `pre-peer-resolution.txt`（pre 状态）：`cordis 4.0.4 / group 1.0.4 / include 1.0.9 / loader 1.0.5 / dsh-home-paths 0.1.7-alpha.2`
- 旧 profile 树移开为 `$P/node_modules.pre-rc2.20260928230332`

### Phase 2 — 换 standalone 树 + auth 双补丁 + force-recreate（`/home/luoji/dsh-backup-rc2-swap-20260928230721/`）

- `gate-a-resolution.txt`：`resolved 82 packages (73 @deepseek-ai/dsh)` + `dsh versions: ["0.1.7-rc.2"]` → `RESOLUTION_ALL_OK`
- `gate-b-version.txt`：`0.1.7-rc.2`
- `version-distribution.txt`：`{"0.1.7-rc.2": 272, 非dsh: cordis@4.0.4 / group@1.0.4 / include@1.0.9 / loader@1.0.5 / timer@1.1.6 / cosmokit@1.8.5 / schemastery@3.18.4 / libreoffice-kit@0.1.2, ...}` → `TREE_VERSION_OK`
- `compose-up.txt`：`Container dsh Recreate / Recreated / Starting / Started`（注：服务名是 `deepseek-harness`，`dsh` 只是 `container_name`；必须 `docker compose up -d --force-recreate`，不能带服务名）
- `restarts-after.txt`：`restarts=0`；`health-inner.txt`=200 / `health-host3080.txt`=200 / `health-domain.txt`=302
- `patch-standalone.txt`=`ALREADY_PATCHED` / `patch-profile.txt`=`PATCHED`（auth-bypass 双份补丁 marker 均在位）
- 旧树保留为 `$G/standalone.rc2.old.20260928230721`（alpha.2）

### 豁免步骤 — 8 插件 peer 门禁（`/home/luoji/dsh-backup-rc2-exempt-20260928231621/`）

**回归根因**：8 个 WorkDSH 插件的 `peerDependencies` 对 dsh 使用**精确值** `"0.1.7-alpha.2"`。精确值不匹配时官方报 `Plugin X is incompatible with dsh 0.1.7-rc.2` 并 **skip 该 bundle**（caret `^0.1.7-alpha.2` 则因 `rc.2 > alpha.2` 满足范围而正常加载）。

**处置**（用户裁决 3）：`dsh plugin --profile web allow-version <pkg@ver> --dsh-version 0.1.7-rc.2 --accept-risk`，落 8 条。

落盘文件 `$P/compatibility.json`（**独立文件，profile `package.json` 的 sha256 未变**，见该目录 `package.json.before.sha256`）：

```json
{
  "workdsh-plugin-activity@0.1.0-alpha.5": ["0.1.7-rc.2"],
  "workdsh-plugin-assistant@0.1.0-alpha.1": ["0.1.7-rc.2"],
  "workdsh-plugin-connectors@0.1.0-alpha.3": ["0.1.7-rc.2"],
  "workdsh-plugin-experts@0.1.0-alpha.9": ["0.1.7-rc.2"],
  "workdsh-plugin-library@0.1.0-alpha.3": ["0.1.7-rc.2"],
  "workdsh-plugin-office@0.1.0-alpha.8": ["0.1.7-rc.2"],
  "workdsh-plugin-projects@0.1.0-alpha.4": ["0.1.7-rc.2"],
  "workdsh-plugin-skills@0.1.0-alpha.32": ["0.1.7-rc.2"]
}
```

证据：`exempt-apply.log` / `exempt-count.txt`=8 / `compatibility.json.before`(70B) → `.after`(537B) / `skip-before.txt` / `skip-after.txt` / `recreate.log` / `recreate2.log` / `ps-after.txt` / `readonly-api.txt`。

### Phase 3 — 全量只读复验（`/home/luoji/dsh-verify-rc2-20260928233021/phase3.log`）

结论串 `PHASE3_RC2_OK`，9 段：

```
--- 1. 运行面 --- OK cli_version: 0.1.7-rc.2 / path_dsh_version: 0.1.7-rc.2 / running / healthy; info restarts=0
--- 2. 监听面 --- info inner_3080=200 / host_3080=400 / OK domain_root: 302
--- 3. 属主门禁 --- OK state_non1000: 0
--- 4. Session/Storage --- info sessions_files=114 / storages_files=53074
     info projects_state_sha256=452ece3e0314f0a3e9d53f5550f177fe87c8e5208fde3e32eccf0b0ab437b613
     info baseline 无 projects_state_sha256（跳过比对）
--- 5. 启动错误模式 --- OK 全 0（skipping profile bundle / incompatible with dsh / Cannot find module / ERR_MODULE / SyntaxError / TypeError）
--- 6. cordis 家族 --- info cordis-plugin-loader=1.0.5 / timer=1.1.6 / schemastery=3.18.4（cordis/group/include 空）
--- 7. 12 个 workdsh 包 --- bundle α.54 / access α.5 / activity α.5 / assistant α.1 / audit α.4 / connectors α.3
     / experts α.9 / library α.3 / office α.8 / projects α.4 / skills α.32 / identity-local α.6
--- 8. 豁免落盘 --- compatibility.json（8 条）; exemptions_count=8
--- 9. skip 计数 --- OK skip_count: 0
==== PHASE3_RC2_OK R=/home/luoji/dsh-verify-rc2-20260928233021
```

### 终态复核（本文件写作时实测）

```
docker exec dsh dsh --version      → 0.1.7-rc.2
docker ps                          → 1panel/deepseek-harness:0.1.5-rc.1 | Up 18 minutes (healthy)
docker inspect dsh                 → Restarts=0 ExitCode=0 OOM=false StartedAt=2026-09-28T23:17:13Z Health=healthy
docker logs dsh | grep -c "Segmentation fault" → 0
$G/standalone/package.json         → "version": "0.1.7-rc.2"
$P/compatibility.json 条数          → 8
https://dsh.10ge.cn/               → 302
```

**结论**：线上 `dsh.10ge.cn` 现役 = **`0.1.7-rc.2`**（官方 `latest`，Cordis `4.0.4`），`skip_count=0`，启动错误模式 6 项全 0，属主门禁 0，域名 302，容器 healthy / restarts=0。

## 四、边界归因

| 项 | 现象 | 归因 |
| --- | --- | --- |
| `host_3080=400` | 明文直连宿主 3080 返回 400 | **预期行为**。`8443/tcp -> 0.0.0.0:3080`（docker-proxy），宿主 3080 → 容器 8443 Caddy TLS；明文 HTTP 打到 TLS 端口必返 400。域名面 302 正常 |
| `skills/list=46` | 与历史基线不同 | **口径正确**：37 个文件系统技能 + 9 个插件技能。非丢失 |
| `library/list=0` | 门户身份下为空 | **正确隔离**：`local-user` space 有 nodes=12 / assets=8（数据在），`portal:18938845688` space 为空。身份隔离为设计行为 |
| `sessions_files=114` | 与基线 56 不同 | **统计口径差**：基线 56 为 sessions **目录**数（含 locks 56），114 为文件数。`locks=56` 与基线一致 ⇒ 会话未增删 |
| `experts/list=0`（早期） | 探针报 0 | **探针假阳性**：未带 `X-Portal-*` 头回落兜底身份。用真实门户 HMAC 头重测 = `17 total=17`（`.artifacts/rc2-identity-probe.mjs`「无头=0 / 带头=17」；`bridge.accepted=154`）。**已闭环，非回归** |

身份注入链路佐证：Cloudflare → Caddy `forward_auth 127.0.0.1:3083` → 回写 `X-Portal-User/Role/Job-Role/Expires/Sig` → 反代 `127.0.0.1:3080`；签名 = HMAC-SHA256(secret, `JSON.stringify([username, role, jobRole, expires])`)，密钥 `/data/dsh/portal/identity-bridge.key`(0600)。诊断端点 `GET /workdsh-identity/whoami?sessionId=…`。

### core dump 边界（判定：非 rc.2 回归）

- 现象：`$D/data/dsh/tmp/cores/` 两个 core（owner `root:root`）：
  - `dsh-segv-20260928-230001.core` 28,337,836,368 B（28.3GB），mtime Sep 28 23:07
  - `dsh-segv-20260928-230801.core` 19,259,984,128 B（19.3GB），mtime Sep 28 23:17
- 排查：① `docker logs dsh | grep -c "Segmentation fault"` = **0**（当前容器无 segv）；② `Restarts=0 / ExitCode=0 / OOM=false`；③ 宿主 `core_pattern` = `core`（默认名）⇒ `dsh-segv-*.core` 命名来自容器内既有采集设施，非本次引入；④ crontab 无 segv watcher；⑤ dmesg 只有 `chrome-headless-shell` 的 `trap int3`（Sep 28 16:25），无 dsh segv。
- 比对：alpha.2 批次 `dsh-backup-a2-swap-20260925010221/logs-with-segv.txt` 命中 **1** 次同型 `docker-entrypoint.sh: line 173 … Segmentation fault`，`RestartCount=1` 后自愈。
- 时间对齐：两 core 时间（23:07 / 23:17）分别落在 Phase2 `--force-recreate`（23:07:21）与豁免步骤 recreate（23:17）窗口内 ⇒ 属**容器更替/关闭期的同型 SIGSEGV**。
- 判定：与既有立档 [V8 GC SIGSEGV 复现](v8-gc-sigsegv-repro.md) 同源（Linux x86_64 + Node v24.21.0 / V8 13.6.233.17-node.53，较大存活堆 + 反复老生代 Mark-Compact 可稳定触发，崩溃率约 35%，无旗标组合可归零）。**当前运行容器零 segv、restarts=0 ⇒ 非 rc.2 回归**，口径与 `docs/STATUS.md`「续十八」一致。
- 处置（第二阶段已执行）：用户 2026-09-28 裁决「清理」后，两个 core 已被移除，见「八」第 3 项。

## 五、未覆盖项与边界

| 项 | 状态与说明 |
| --- | --- |
| 仓库基线未随升 | **已执行（第二阶段）**。仓库版本承载文件（根 `package.json`、`pnpm.overrides` 与 14 个模块 `package.json`、`pnpm-lock.yaml`、`scripts/check-published-versions.mjs` 期望值、基线文档）已全量切到 `0.1.7-rc.2`；`check:versions` PASS（550 条 DSH 锁定 rc.2）。实测见「八」 |
| 8 插件 peer 重指 | **已执行（第二阶段）**。8 个已部署插件的 dsh peer 由精确值重指为 caret `^0.1.7-rc.2`（共 75 条），`devDependencies` 与 cordis peer（`4.0.4`）不动；线上 rc.2 的 `compatibility.json` 8 条豁免保留不撤。重打包制品已产出（`.artifacts/rc2-release/`），见「八」第 3 项 |
| 47.6GB core dump | **已清理（第二阶段）**。两个 core（28.3GB + 19.3GB）已按用户裁决删除，见「八」第 3 项 |
| 未与 0.2.0-rc 通道交叉验证 | 本批只到 `0.1.7-rc.2`；`next = 0.2.0-rc.1` 的差异面未评估 |
| 仓库侧探针与单测 | **部分执行（第二阶段）**：已跑 `pnpm install` / `check:versions` / `check:plan` / `typecheck`（13 包）/ `build`（13 包）全部通过；`test:integration`、`test:activity`、`probe:*` 本批**未复跑** |
| 浏览器面复验 | 本批未跑 Playwright 探针（alpha.2 批次曾跑 `P8_6_BROWSER_CLEAN_OK`）；仅完成 HTTP 面（inner 200 / host 400 预期 / domain 302）与只读 API |
| 真实模型验收 | 未跑（本批无模型相关代码或契约改动） |
| npm 发布面 | **裁决不发布 npm，保留制品形态**。8 插件重打包落在 `.artifacts/rc2-release/`；注册表发布实测三重受阻（`npm whoami` = `ENEEDAUTH`、目标包 `E404` 从未发布、预发布需 `--tag alpha`），用户 2026-09-29 裁决**暂不发布、保留制品形态**，与 `docs/RELEASES.md` 既有发布形态（GitHub alpha 附件 + tgz，从未发布 npm）一致。仓库面与制品面**已执行**，注册表发布**不做**，见「八」第 3 项 |
| `projects_state_sha256` 基线比对 | Phase3 记录的 `452ece3e…` **无对应基线值可比**（P0 基线未采录该字段），故「跳过比对」，不等于已证明未变 |

## 六、回退锚点

全部在 `192.168.11.205`，均为就地保留、未清理：

- `$G/standalone.rc2.old.20260928230721` —— 换树前的 **alpha.2 standalone 树**。回退：`mv standalone standalone.rc2.bad.<TS> && mv standalone.rc2.old.20260928230721 standalone`，然后 `cd $D && docker compose up -d --force-recreate`（bind mount 在创建时解析路径，`restart` 不重新解析，**必须 recreate**）。
- `$P/node_modules.pre-rc2.20260928230332` —— Phase 1 前的 profile 树。
- `/home/luoji/dsh-backup-rc2-20260928224220/` —— P0 全量备份：`profile-config-full.tgz`(289MB) / `sessions.tgz`(43MB) / `storages.tgz`(6.6MB) / `SHA256SUMS.txt` + 5 份配置文件。
- `/home/luoji/dsh-backup-rc2-switch-20260928230332/` —— Phase 1 快照（版本分布 / profile 依赖前后 / pre-peer-resolution / pre-cli-version）。
- `/home/luoji/dsh-backup-rc2-swap-20260928230721/` —— Phase 2 快照（gate A/B / TREE_VERSION_OK / compose-up / health / patch marker）。
- `/home/luoji/dsh-backup-rc2-exempt-20260928231621/` —— 豁免步骤快照（`compatibility.json.before/after`、`skip-before/after`、profile `package.json` sha256）。
- `$G/` 其它历史树：`standalone.a2.old.20260925010221`、`standalone.017.old.20260924231611`（更早批次，保留）。

回退后须复核：CLI = `0.1.7-alpha.2`、cordis 家族回 `4.0.4 / 1.0.4 / 1.0.9 / 1.0.5 / 1.1.6`、auth-bypass 双份补丁 marker=1、属主门禁 0、`dsh.10ge.cn/` = 302 → `/portal`、`compatibility.json` 8 条是否保留（rc.2 专用豁免，回退 alpha.2 后应视为冗余但无害）。

## 七、服务器脚本与本机同源件

服务器 `/home/luoji/` 阶段脚本（本机同源件在 `.artifacts/`）：`stage-rc2-4-verify.sh`（Phase3 全量复验，本机 `.artifacts/stage-rc2-4-verify.sh`）。
本机辅助脚本：`.artifacts/rc2-identity-probe.mjs`（门户 HMAC 签名头对照，无头=0 / 带头=17）、`.artifacts/rc2-identity-full.mjs`（带门户身份完整只读 API 复验）。

## 八、仓库基线随升（第二阶段）

用户 2026-09-28 追加三项裁决后执行，把仓库侧由「基线 alpha.2 / 线上 rc.2」的分叉收敛为两侧同版本。

### 1. 版本承载文件全量切换 alpha.2 → rc.2

| 面 | 内容 |
| --- | --- |
| 根 `package.json` | `devDependencies` 23 条 dsh + `pnpm.overrides`（原 271 条）全量切 `0.1.7-rc.2`；**补入 rc.2 新增 5 个官方包**的精确 override —— `@deepseek-ai/dsh-client-shortcuts`、`@deepseek-ai/dsh-client-ui-shortcuts`、`@deepseek-ai/dsh-llm-deepseek-account`、`@deepseek-ai/dsh-llm-deepseek-api-key`、`@deepseek-ai/dsh-util-code-language`（alpha.2 无此 5 包，缺条会被 `check:versions` 断言拦截） |
| 模块 `package.json` | 根 + `bundle` + 11 个 `plugins/*` + `providers/identity-local` 共 15 个文件；其中 8 个已部署插件的 dsh `devDependencies` 保持精确 `0.1.7-rc.2` |
| `pnpm-lock.yaml` | 全量重解析到 rc.2（alpha.2 残余 0），新包 lock 条目落盘 |
| 门禁与脚本常量 | `scripts/check-published-versions.mjs` 期望值 = `0.1.7-rc.2`（第 5 行）+ 第 16-19 行注释；`scripts/install-preview.mjs` 等 8 个脚本与 1 个集成测试的硬编码版本同步 |
| 基线文档 | `AGENTS.md` 第 2/37/41 行（基线版本、Agent Teams 版本、镜像路径）；证据链修正为**三段完整链**（`alpha.1` / `alpha.2` / `rc.2`），未丢失 alpha.2 证据链接 |
| 伴生包 | `cordis 4.0.4` / `group 1.0.4` / `include 1.0.9` / `loader 1.0.5` / `timer 1.1.6` / `schemastery 3.18.4`（scope `@deepseek-ai/schemastery`）**rc.2 与 alpha.2 逐字相同，未动** |

### 2. rc.2 官方文档镜像落盘与引用重锚

- 从 GitHub tag `dsh-v0.1.7-rc.2` 下载 `docs/` 子树为 `docs/dsh-v0.1.7-rc.2/`：**569 文件 / 24MB / 8 子目录**（`cookbook`、`cordis-api`、`cordis-tutorial`、`i18n`、`persistence-changes`、`postmortem`、`subsystems`、`user`；**无 `native/`**）。与 alpha.2 镜像 delta = **+7 新增 / 0 删除 / 61 内容变化**。旧镜像 `docs/dsh-v0.1.7-alpha.1/`、`docs/dsh-v0.1.7-alpha.2/`、`docs/dsh-v0.1.6-alpha.2/` 保留。
- 引用重锚 `dsh-v0.1.7-alpha.2` → `dsh-v0.1.7-rc.2`：**24 个文件 71 处**（`docs/design/**` 20、`docs/adr/**` 4，另含 `docs/HARNESS-OFFICIAL-DEVELOPMENT.md` 7 处与 `docs/research/deepseek-harness-review.json` 的 `corpusRoot`）。校验：**73 个唯一引用（35 markdown 链接 + 38 纯文本路径）全部命中 rc.2 镜像，0 miss**。
- **历史记录不改**：`docs/evidence/dsh-0.1.7-alpha.2-upgrade.md`（9 处）、`docs/STATUS.md` 历史节（2 处）保持 alpha.2 原样，符合「已发布对象修订不可原地改写」与历史证据留存口径。

### 3. 8 插件 peer 重指 + 重打包 + core 清理 + 门禁复跑

- **peer 重指（裁决 3）**：8 个已部署插件的 `peerDependencies` 中 dsh 族由精确 `0.1.7-rc.2` 改为 **caret `^0.1.7-rc.2`**，计 **75 条**（activity 6 / assistant 7 / connectors 11 / experts 10 / library 16 / office 7 / projects 15 / skills 3）。四重校验：peer key 集合不变、非 dsh peer 值不变（`cordis 4.0.4`、`react 19.2.4`）、`devDependencies` 逐字不变、JSON 合法。**技术依据**：精确 peer 在 rc.3 等递进版本仍会 `incompatible` 并 skip bundle；caret 范围可覆盖后续 `0.1.7-rc.*`。`automations`（未部署，15 条精确）、`workdsh`/`bundle`（无 dsh peer）不在裁决 3 范围，未改。
- **core dump 清理（裁决 1）**：`$D/data/dsh/tmp/cores/` 下 `dsh-segv-20260928-230001.core`（28.3GB）与 `dsh-segv-20260928-230801.core`（19.3GB），共 47.6GB，已删除。
- **门禁复跑（仓库侧，全部通过）**：

| 检查 | 结果 |
| --- | --- |
| `corepack pnpm install --no-frozen-lockfile` | EXIT 0（`Already up to date`，2.1s） |
| `corepack pnpm check:versions` | **PASS：550 条 DSH 锁定 `0.1.7-rc.2`；Cordis 4.0.4 only** |
| `node scripts/check-plan.mjs` | PASS（31 modules; 50 documents） |
| `corepack pnpm typecheck` | 退出码 0（13 个 filter） |
| `corepack pnpm build` | 退出码 0（13 个包） |

- **8 插件重打包（裁决 3 制品面，已执行）**：按 `scripts/pack-office-release.mjs` 范式对 8 个已部署插件逐个 `pnpm pack`，输出 `.artifacts/rc2-release/`（8 个 `.tgz` + `SHA256SUMS` + `release-manifest.json`；manifest 含 `harness: "0.1.7-rc.2"`、`sourceCommit`、`worktreeDirty`、逐包 `sha256`/`bytes`/`dshPeers`）。解包逐包核对：**8 个包的 dsh peer 全部为 caret、非 caret 计数 0**；`devDependencies` 与 `scripts` 保留（未走 office 的裁剪分支），`workdshRelease` 标记未加（不属 library/project 发行范围）。制品（版本 / dsh peer 条数）：activity α.5 / 6、assistant α.1 / 7、connectors α.3 / 11、experts α.9 / 10、library α.3 / 16、office α.8 / 7（`private: true`）、projects α.4 / 15、skills α.32 / 3。**未在本批隔离 Profile 上做安装冷启动复验**（该面沿用各模块既有安装证据）。
- **npm 发布面（裁决：不发布，保留制品形态）**：发布探测三重受阻 —— `npm whoami` = `ENEEDAUTH`（本机未登录），`registry = https://registry.npmmirror.com/`，仓库无 `.npmrc`；`workdsh-plugin-activity` / `workdsh-plugin-experts` / `workdsh-bundle` 在 registry 上均 `E404`（从未发布，`npm view` 落 `registry.npmjs.org` 亦 404）；`npm publish --dry-run` 预检提示 `You must specify a tag using --tag when publishing a prerelease version.`（`0.1.0-alpha.N` 属预发布，正式发布须带 `--tag alpha`）。用户 2026-09-29 裁决**暂不发布 npm、保留制品形态**（与 `docs/RELEASES.md` 既有发布形态一致：GitHub alpha 附件 + tgz，从未发布 npm）。按 AGENTS.md 硬约束不自动发布 npm，本批不执行注册表发布。
- **未执行**：`test:integration` / `test:activity` / `test:planning` / `probe:*` 本批未复跑。

---

日期：2026-09-28。结论：官方 `latest` = `0.1.7-rc.2`，线上 `dsh.10ge.cn` 已由 `0.1.7-alpha.2` 升级到 `0.1.7-rc.2`（Phase1/2/3 门禁全绿、`skip_count=0`、启动错误模式全 0、healthy/restarts=0）。8 插件 peer 门禁首日以官方 `allow-version` 豁免处置（8 条，落盘独立 `compatibility.json`，未改 profile `package.json`）。core dump 已归因为容器更替期同型 SIGSEGV、非 rc.2 回归。第二阶段（用户追加三项裁决）已把**仓库基线随升**到 `0.1.7-rc.2`（`check:versions` PASS 550 条、`check:plan` / `typecheck` / `build` 全绿）、落盘 rc.2 文档镜像并重锚 71 处引用、**8 插件 peer 重指为 caret**（75 条）、**清理 47.6GB core**；两侧不再有版本分叉。8 插件重打包制品已产出（`.artifacts/rc2-release/`，8 个 `.tgz` + `SHA256SUMS` + `release-manifest.json`，逐包解包核对 dsh peer 全为 caret）。**npm 注册表发布经用户 2026-09-29 裁决不做**（实测三重受阻：`ENEEDAUTH`；目标包 `E404`；预发布需 `--tag alpha`），保留制品形态，与 `docs/RELEASES.md` 既有发布形态一致。剩余边界以「未覆盖项与边界」表为准，表中未执行项不得计入已完成。
