# DSH 升级证据（0.1.7-rc.2 → 0.2.0-rc.2，仓库基线 + 制品 + 派生镜像 + 线上升级部署）

2026-09-29 至 2026-09-30 执行。本文件记录从 `0.1.7-rc.2` 到官方 `latest` `0.2.0-rc.2` 的适配，含四项交付：① 版本承载文件与 lock 随升；② 12 个 WorkDSH 制品重出与上传；③ 派生容器镜像自建（1Panel 渠道无 0.2.x，须自行构建）；④ **线上运行面升级部署**（`dsh.10ge.cn`）。

**批次性质**：本批**分两段**。第一段（2026-09-29）为仓库侧适配：版本随升 + 12 制品重出 + 派生镜像自建，线上容器**全程未动**。第二段（2026-09-30）为**线上升级部署**：经用户授权「执行线上升级部署」+「一并重传 12 个制品」后，将线上从 `0.1.5-rc.1` 镜像 + `0.1.7-rc.2` 挂载树升级至 `0.2.0-rc.2-localbuild-patched` 镜像 + `0.2.0-rc.2` 挂载树，并处理升级后暴露的业务面回归与 4 个第三方 bundle 门禁跳过（详见第十节）。**收官**：用户另授权「npm 发布、core 清理马上处理」⇒ core 清理已执行；npm 发布因本机无 registry 凭据未完成；`git config` 变更仍未授权（详见第十节第 8 小节）。

用户裁决（本批三项）：
1. `@deepseek-ai/dsh-typert-generator` 处置 = **保留 `0.2.0-rc.1` 单条例外**（override/devDeps 写 `0.2.0-rc.1`，门禁加显式豁免 + 理由注释）。
2. 派生镜像 base = **`1panel/deepseek-harness:0.1.7-rc.2`**。
3. 官方文档镜像 `docs/dsh-v0.2.0-rc.2/` = **本批先不落盘，只写证据文档**。

## 一、官方版本定位

命令：`curl -s https://registry.npmmirror.com/@deepseek-ai/dsh` → 解析 `dist-tags`。

```
dist-tags= {"alpha":"0.1.7-alpha.2","latest":"0.2.0-rc.2","next":"0.2.0-rc.2"}
modified= 2026-09-29T14:01:52.544Z
total_versions= 29
tail= 0.1.7-alpha.1, 0.1.7-alpha.2, 0.1.7-rc.1, 0.1.7-rc.2, 0.2.0-rc.1, 0.2.0-rc.2
```

- **官方 `latest` 与 `next` 已同步推进到 `0.2.0-rc.2`**（`0.1.7-rc.2` 批次时 `latest=0.1.7-rc.2 / next=0.2.0-rc.1`）。跨小版本通道已进入正式发布态。
- alpha 通道仍停在 `0.1.7-alpha.2`（无 0.2.0-alpha），即 0.2 线**只经 rc 通道发布**。
- `total_versions` 由 28（rc.2 批次）增至 **29**，新增位即 `0.2.0-rc.2`。

### 0.2.0-rc.2 依赖闭包（实测）

`curl -s .../dsh/0.2.0-rc.2 | 解析 dependencies`：

| 项 | 实测 |
| --- | --- |
| `dependencies` 总数 | **82** |
| `@deepseek-ai/dsh*` | **74**，版本值唯一集 = `["0.2.0-rc.2"]`（**全部精确**） |
| cordis 家族（非 dsh scope） | **5**：`@deepseek-ai/cordis ~4.0.4`、`@deepseek-ai/schemastery ~3.18.4`、`@deepseek-ai/cordis-plugin-timer ~1.1.6`、`@deepseek-ai/cordis-plugin-loader ~1.0.5`、`@deepseek-ai/cordis-plugin-include ~1.0.9` |
| 非 scope 三方 | **3**：`js-yaml ^4.2.0`、`commander ^15.0.0`、`node-addon-require-builtin ^0.1.6` |
| `peerDependencies` | `undefined` |
| `peerDependenciesMeta` | `undefined` |

即 **82 = 74 + 5 + 3**。`dsh` 本体不声明 peer，Cordis 通过 `~` 范围传入（`~4.0.4` 落在仓库锁定的 `4.0.4` 内）。

**伴生包 6 条（不随 dsh 升版）**：`@deepseek-ai/cordis 4.0.4` / `cordis-plugin-group 1.0.4` / `cordis-plugin-include 1.0.9` / `cordis-plugin-loader 1.0.5` / `cordis-plugin-timer 1.1.6` / `schemastery 3.18.4`。0.2.0-rc.2 与 0.1.7-rc.2 **逐字相同**（`dsh` 侧仅 `~` 范围，仓库用精确 override 收敛）。

### typert-generator 例外依据（实测查证）

```
dist-tags= {"alpha":"0.1.7-alpha.2","latest":"0.0.1-rc.1","next":"0.2.0-rc.1"}
versions 末位= 0.2.0-rc.1（无 0.2.0-rc.2）
0.2.0-rc.1 peerDependencies= {"@deepseek-ai/cordis":"~4.0.4"}
0.2.0-rc.1 dependencies= {"typescript":"^6.0.3","@jridgewell/gen-mapping":"^0.3.13"}
```

- 该包**不属 dsh 版本线**：不依赖任何其他 `@deepseek-ai/dsh*` 包，peer 只有 `cordis`。
- 版本线上**最新可用 = `0.2.0-rc.1`**（官方未发布 `0.2.0-rc.2`）；其 `latest` dist-tag 停留在陈旧的 `0.0.1-rc.1`。
- ⇒ 固定 `0.2.0-rc.1` 为该包在 dsh 版本线上可用的最新版本，**豁免成立**，且以显式白名单 + 注释登记在门禁脚本中（非静默放宽）。

## 二、仓库基线随升（版本承载面）

### 1. 变更清单

工作区实测：**17 个文件 M**（根 `package.json` + 14 个模块 `package.json` + `pnpm-lock.yaml` + `scripts/check-published-versions.mjs`），`git diff --stat` = **4518 insertions / 4339 deletions**，HEAD = `6b07f78b1fb04f09664213309c5a2658ea4f72d2`。

| 面 | 实测 |
| --- | --- |
| 根 `package.json` `pnpm.overrides` | **289 条** = `@deepseek-ai/dsh*` **281**（**280 条 `0.2.0-rc.2`** + **1 条例外** `dsh-typert-generator: 0.2.0-rc.1`）+ 非 dsh **8**（cordis 家族 5 + `schemastery 3.18.4` + `prosemirror-model 1.25.11` + `prosemirror-state 1.4.4`） |
| 根 `package.json` `devDependencies` | **32 条**，其中 dsh **23**（22 条 `0.2.0-rc.2` + 1 条例外 `dsh-typert-generator: 0.2.0-rc.1`） |
| 模块 `package.json` | 14 个（`bundle` + 12 个 `plugins/*` + `providers/identity-local`）dsh 依赖全量切 `0.2.0-rc.2`；各模块自身 `version` 不变（版本单位是模块，本批不因依赖升级而升模块版本） |
| `pnpm-lock.yaml` | 全量重解析：`0.2.0-rc.2` 命中 **3284 行**，`0.1.7-rc.2` 命中 **0 行** |
| 门禁脚本 | `scripts/check-published-versions.mjs` 期望值 `0.2.0-rc.2` + 显式 `exceptions` 白名单（含理由注释） |

### 2. 12 个 manifest 的 dsh peer 重指为 caret `^0.2.0-rc.2`

按 rc.2 批次既定口径（peer caret / devDeps 精确），本次制品面 12 个包（8 个已部署插件 + `access` / `audit` / `automations` / `identity-local`）dsh peer 全部重指：

| 包 | 版本 | dsh peer 条数 | 非 caret |
| --- | --- | --- | --- |
| `workdsh-plugin-access` | 0.1.0-alpha.5 | 4 | 0 |
| `workdsh-plugin-activity` | 0.1.0-alpha.5 | 6 | 0 |
| `workdsh-plugin-assistant` | 0.1.0-alpha.1 | 7 | 0 |
| `workdsh-plugin-audit` | 0.1.0-alpha.4 | 1 | 0 |
| `workdsh-plugin-automations` | 0.1.0-alpha.1 | 15 | 0 |
| `workdsh-plugin-connectors` | 0.1.0-alpha.3 | 11 | 0 |
| `workdsh-plugin-experts` | 0.1.0-alpha.9 | 10 | 0 |
| `workdsh-plugin-library` | 0.1.0-alpha.3 | 16 | 0 |
| `workdsh-plugin-office` | 0.1.0-alpha.8 | 7 | 0 |
| `workdsh-plugin-projects` | 0.1.0-alpha.4 | 15 | 0 |
| `workdsh-plugin-skills` | 0.1.0-alpha.32 | 3 | 0 |
| `workdsh-provider-identity-local` | 0.1.0-alpha.6 | 1 | 0 |
| **合计** | — | **96** | **0** |

`bundle` 与 `workbench` 无 dsh peer，不在本表。

### 3. 门禁复跑（仓库侧）

| 检查 | 结果 |
| --- | --- |
| `node scripts/check-published-versions.mjs` | **PASS：559 条 DSH 锁定 `0.2.0-rc.2`；Cordis 4.0.4 only** |
| `node scripts/check-plan.mjs`（`pnpm check:plan`） | PASS（31 modules; 50 documents） |
| `shasum -a 256 -c SHA256SUMS`（制品目录） | **8/8 OK** |

**未在本会话复跑**：`pnpm install --no-frozen-lockfile` / `typecheck` / `build`（沿用本批早前记录 EXIT 0；见「未覆盖项」表）。

## 三、插件制品重出（8 个 tgz）

输出 `.artifacts/0.2.0-rc.2-release/`（`release-manifest.json` 3395B + `SHA256SUMS` 862B + 8 个 `.tgz`）。

| 包 | 版本 | bytes | sha256（前 12 位） | dshPeers |
| --- | --- | --- | --- | --- |
| `workdsh-plugin-activity` | 0.1.0-alpha.5 | 28206 | `6e6c9f2f1830` | 6 |
| `workdsh-plugin-assistant` | 0.1.0-alpha.1 | 37898 | `30b6866eb94e` | 7 |
| `workdsh-plugin-connectors` | 0.1.0-alpha.3 | 35062 | `79956ab29749` | 11 |
| `workdsh-plugin-experts` | 0.1.0-alpha.9 | 183377 | `78b5d0ba4dad` | 10 |
| `workdsh-plugin-library` | 0.1.0-alpha.3 | 60807 | `9a52f3757fd8` | 16 |
| `workdsh-plugin-office` | 0.1.0-alpha.8 | 21813855 | `04cd14a46620` | 7 |
| `workdsh-plugin-projects` | 0.1.0-alpha.4 | 63645 | `9482edf9222f` | 15 |
| `workdsh-plugin-skills` | 0.1.0-alpha.32 | 146242 | `48b4dfc36488` | 3 |

`release-manifest.json` 关键字段：`scope="plugin-refresh-0.2.0-rc.2"`、`channel="local-artifact"`、`sourceCommit="6b07f78b1fb04f09664213309c5a2658ea4f72d2"`、`worktreeDirty=true`、`harness="0.2.0-rc.2"`、`node="v24.15.0"`、`packageManager="pnpm@10.34.5"`。

`verified` 四条：① 8 个 tgz 的 dsh peer 已重指为 caret `^0.2.0-rc.2`；② 打包后的 manifest 中**无任何精确 dsh peer 残留**；③ 仓库 lock 锁 `0.2.0-rc.2` 559 条（`check:versions` PASS）；④ 13 个 workspace 包在 `0.2.0-rc.2` 上 `typecheck` / `build` 通过。

`limitations` 四条：① alpha 预览态，包 API 与存储数据可能变化；② **未发布到任何 npm registry**（本机无凭据，`npm whoami` = `ENEEDAUTH`）；③ 交互式/依赖真实模型的探针本批未复跑；④ **派生容器镜像基于 `1panel/deepseek-harness:0.1.7-rc.2`，未部署到任何主机**。

## 四、1Panel 渠道缺失证据（自建派生镜像的直接依据）

本批前置判断：「三渠道版本门禁（npm `dist-tags` + 1Panel 应用商店模板 + Docker 镜像 tags）是否齐备到 `0.2.0-rc.2`」。实测两条路径：

### 1. `docker pull` 不可用作证据（Docker Hub 出口 TLS 全阻断）

| 检查 | 结果 |
| --- | --- |
| `docker pull 1panel/deepseek-harness:0.2.0-rc.2` | `Error response from daemon: Get "https://registry-1.docker.io/v2/": net/http: TLS handshake timeout` |
| `docker pull 1panel/deepseek-harness:0.1.7-rc.2`（对照） | **同样 TLS handshake timeout**；本地因镜像已存在显示 `Status: Image is up to date` |
| `docker manifest inspect` | 不可达（同上） |
| `/etc/docker/daemon.json` | 配 3 个 registry-mirrors（`docker.1panel.live` / `docker.m.daocloud.io` / `docker.1ms.run`），仍不可达 |
| Docker Hub tags API / `registry-1` v2 直连 | `curl: (35) error:0A000126:SSL routines::unexpected eof while reading` |
| `apps.fit2cloud.com/1panel/index.json`、`apps.json` | 均 **404**（探测路径错，非 1Panel appstore 真实索引路径） |

**判定**：对照镜像（已知存在且被官方渠道支持的 `0.1.7-rc.2`）同样失败 ⇒ 失败原因在**出口网络**而非版本是否存在。**`docker pull` 结果不能作为「1Panel 未适配 0.2.x」的证据**，避免误判。

### 2. 1Panel 应用商店本地缓存（权威证据）

改读 1Panel appstore 本地缓存 `/opt/1panel/resource/apps/`：

```
grep -rl "deepseek-harness" /opt/1panel/resource/apps
→ remote/deepseek-harness/data.yml
→ remote/deepseek-harness/0.1.5-rc.1/data.yml
→ remote/deepseek-harness/0.1.5-rc.1/docker-compose.yml
```

**★ 结论：1Panel 应用商店模板中 `deepseek-harness` 仅有 `0.1.5-rc.1` 单一版本目录，无 `0.1.7-rc.2`、无 `0.2.0-rc.2`。**

- 根 `data.yml` 含 `crossVersionUpdate: true`、`architectures: [amd64, arm64]`。
- `0.1.5-rc.1/docker-compose.yml`：`image: 1panel/deepseek-harness:0.1.5-rc.1`、`read_only: true`、healthcheck `curl -fsS --max-time 5 http://127.0.0.1:3080/`（interval 30s）。
- 即 1Panel 渠道的模板与镜像 tag **长期停留在 `0.1.5-rc.1`**，0.1.7 与 0.2.x 均未进入商店模板 ⇒ **派生镜像必须自建**，不能依赖商店升级路径。

（本地缓存目录权限 `drwxr-xr-x root root`，普通用户可读；`sudo` 因需 tty 不可用，但无需 sudo 即读到内容。）

## 五、派生镜像自建与 401 根因定界

### 1. 构建承载

- 构建一律在 **`192.168.11.205`（x86_64）** 执行；**本机 arm64 的 buildx 永久不可用**，不在本机构建。
- 服务器留存两份 Dockerfile：`~/dsh-build-0.2.0-rc.2/Dockerfile`（2495B，初版 pre-patch）与 `~/dsh-build-0.2.0-rc.2-patched/Dockerfile`（4022B，修复版）。

### 2. 首次构建（pre-patch）：真实入口下崩溃

产物 `1panel/deepseek-harness:0.2.0-rc.2-localbuild`（image id `d3638b69fdb5`，1.3GB）。以**真实 1Panel 默认 entrypoint + 必需 env** 启动实测：

```
t=6s..60s state=running exit=0
t=66s state=exited exit=1
inspect: Running=false Exit=1 Restarts=0
logs: This image is maintained by 1Panel. ... dsh web: http://127.0.0.1:3080/?token=...
      DeepSeek Harness did not become ready within 60 seconds.
inner3080=401
```

**关键教训**：此前一轮以 `docker run --entrypoint sh` + `dsh --version` 判定「可用」，**该方式绕过真实 entrypoint**，结论无效。改用真实默认 entrypoint 后暴露崩溃。

### 3. 401 根因（100% 锁定并双向复现）

1Panel 在 base `0.1.7-rc.2` 镜像内**自行打了 auth-proxy 补丁**，位于 `dsh-client-connection/lib/index.js` 的 `isAuthenticated()` 首行（第 434 行）：

```js
if (process.env.ONEPANEL_DSH_AUTH_PROXY === "1") return true;
```

- base `0.1.7-rc.2` 证据：该文件 md5 = `69f8b3ef85e03eed4f0e8ac4295c61c5`，`ONEPANEL_DSH_AUTH_PROXY` 出现次数 = **1**（第 434 行），锚点上下文为 `433: isAuthenticated(request) {` / `435: const authority = requestAuthority(request.headers);` / `589: return this.browserAuth.isAuthenticated(request) ? void 0 : 401;`。
- 崩溃镜像证据：同文件 `ONEPANEL_DSH_AUTH_PROXY` 出现次数 = **0**（补丁丢失），`"version": "0.2.0-rc.2"`。

**链路**：`npm install -g @deepseek-ai/dsh@0.2.0-rc.2` **整棵 `node_modules` 被替换** ⇒ 1Panel 补丁丢失 ⇒ 容器内 `127.0.0.1:3080` 恒返回 **401** ⇒ entrypoint 就绪探针 60 次失败 ⇒ `exit 1`。entrypoint 第 68 行仍设 `ONEPANEL_DSH_AUTH_PROXY=1`，但 `0.2.0-rc.2` 不认识该变量（未打补丁）。

entrypoint 关键行（`/usr/local/bin/docker-entrypoint.sh`）：

```
68: ONEPANEL_DSH_AUTH_PROXY=1
70: web --host 127.0.0.1 --port 3080
71: --trusted-host 127.0.0.1:3080
77: if curl -fsS --max-time 2 http://127.0.0.1:3080/ >/dev/null 2>&1; then
89: printf 'DeepSeek Harness did not become ready within 60 seconds.\n' >&2
```

### 4. 修复构建（patched）：等价重放补丁并二次验证通过

`~/dsh-build-0.2.0-rc.2-patched/Dockerfile`（4022B）在 base `1panel/deepseek-harness:0.1.7-rc.2` 上三步：

1. **升 dsh**：`cp -p /usr/local/bin/dsh /tmp/dsh-wrapper.orig` → 设 `registry.npmmirror.com` → `npm install -g @deepseek-ai/dsh@0.2.0-rc.2 --no-audit --no-fund` → `npm cache clean --force`。
2. **修 npm 两处副作用**：a) npm 把 `/usr/local/bin/dsh` 从 1Panel 的 gosu 包装脚本换成裸软链 ⇒ **必须先 `rm -f` 删软链再 `cp`**（否则 `cp` 跟随软链会把包装脚本写进 `bin.js` 本体）；b) npm 11 不跑依赖安装脚本 ⇒ 手动补跑 `ensure-spawn-helper.mjs`。自检含：版本 = `0.2.0-rc.2`、`bin.js` 存在且未被包装脚本污染、`/usr/local/bin/dsh` 已是普通文件（非软链）、可执行、内容含 `gosu node env`。
3. **等价重放 auth-proxy 补丁**（幂等）：定位 `dsh-client-connection/lib/index.js`，校验锚点 `isAuthenticated(request) {` 出现次数 = **1**（唯一性校验），若未打补丁则插入 `if (process.env.ONEPANEL_DSH_AUTH_PROXY === "1") return true;`，再校验补丁出现次数 = 1。

产物 `1panel/deepseek-harness:0.2.0-rc.2-localbuild-patched`（image id `2840936a34b5`，sha256 `2840936a34b59404fa9697ec524269b93b3f597fab7fb127860cab50868c4655`，1.3GB）。

**补丁一致性**：patched 镜像内该文件 md5 = `69f8b3ef85e03eed4f0e8ac4295c61c5`，与 base **逐字一致**；出现次数 = 1（第 434 行）；`"version": "0.2.0-rc.2"`。

### 5. 前后对照（同一真实入口，两次独立复现）

| 项 | broken `localbuild` | patched `localbuild-patched` |
| --- | --- | --- |
| image id | `d3638b69fdb5` | `2840936a34b5` |
| 补丁出现次数 | 0 | 1（第 434 行，md5 与 base 一致） |
| `inner3080` | **401** | **200** |
| 容器状态 | `t=66s exited` | `healthy`（t=6s..60s 十次采样全绿） |
| `ExitCode` | **1** | **0** |
| `Restarts` | 0 | 0 |
| 日志 | `DeepSeek Harness did not become ready within 60 seconds.` | `dsh web: http://127.0.0.1:3080/?token=…` / `DeepSeek Harness is available at https://dsh.example.com:8443 inside the container.` / `certificate obtained successfully identifier=dsh.example.com issuer=local`（caddy 正常起 + 获 local 证书） |

**结论**：0.2.0-rc.2 在 1Panel 容器形态下**可正常运行**，前提是重放 1Panel 在 base 中已有的 auth-proxy 补丁。

### 6. 镜像清单（构建后实测）

```
0.2.0-rc.2-localbuild-patched | digest=<none> | id=2840936a34b5 | 2026-09-29 22:25:45 UTC | 1.3GB
0.2.0-rc.2-localbuild         | digest=<none> | id=d3638b69fdb5 | 2026-09-29 22:15:23 UTC | 1.3GB
0.1.7-rc.2 | digest=sha256:e3793ea5ed784091f8aa11b2353c7910f67c736d6ad6a352e8f01859cd1c4e2b | id=e4b2d97516f2 | 855MB
0.1.5-rc.1 | digest=sha256:7ba97fefc42f142f7eef172cdb48a1eb783a80fd6a51aed9557ae8ec82017520 | id=a2ee56aa955c | 632MB
```

（本地 tag 镜像 `digest=<none>`，未推送仓库。）

### 7. 生产容器（第一段期间未动）

```
dsh | 1panel/deepseek-harness:0.1.5-rc.1 | Up 7 hours (healthy)
```

三次验证脚本（broken / patched / 汇总）末尾均复核该项，**第一段期间未发生任何变更**。（第二段的线上换树见第十节。）

## 六、边界归因

| 项 | 现象 | 归因 |
| --- | --- | --- |
| `docker pull` 失败 | `0.2.0-rc.2` 与对照 `0.1.7-rc.2` **均** TLS handshake timeout | **出口网络阻断**，非版本缺失。故不用 pull 作渠道证据 |
| `1Panel appstore 只有 0.1.5-rc.1` | 商店模板长期未更新 | **渠道事实**：1Panel 未适配 0.2.x（亦未适配 0.1.7），派生镜像须自建 |
| 派生镜像首版崩溃 | `inner3080=401 / Exit=1` | **补丁丢失**：`npm install -g` 覆盖 `node_modules`，1Panel auth-proxy 补丁被抹 |
| `apps.fit2cloud.com/...` 404 | 探测 URL 错 | 非 1Panel 真实索引路径；改用本地缓存磁盘文件取证 |
| 本地 tag 镜像 `digest=<none>` | 未推送 registry | 预期：仅本地构建，未授权推送 |
| 生产容器版本 `0.1.5-rc.1`（第一段） | 镜像 tag 旧 | **预期**：该容器 dsh 本体由宿主 standalone 树 bind mount 提供（rc.2 批次已论证 tag 与实际版本解耦），且第一段未授权线上升级。**第二段已换树并升级镜像 tag（见第十节）** |

## 七、未覆盖项与边界

| 项 | 状态与说明 |
| --- | --- |
| **线上升级部署** | **已执行**（2026-09-30，用户授权「执行线上升级部署」）。`dsh.10ge.cn` 线上已由 `0.1.5-rc.1` 镜像 + `0.1.7-rc.2` 挂载树升级为 `0.2.0-rc.2-localbuild-patched` 镜像 + `0.2.0-rc.2` 挂载树，容器 `healthy`。全过程与回归处置见第十节。**后续 04:12 发生一次 V8/GC SIGSEGV 自动重启 ⇒ 当前 `Restarts=1`**（既有 V8 问题，非本次升级回归，见第十节第 8 小节） |
| **npm 发布** | **已获授权（2026-09-30「npm 发布、core 清理授权马上处理」），因本机无 registry 凭据未完成**。`npm whoami` = `ENEEDAUTH`；`~/.npmrc`/仓库 `.npmrc`/环境变量/`.netrc`/`gh auth` 均无 token，CI 无发布 workflow。7 个 `private:false` 制品在 `registry.npmjs.org` 均 `HTTP 404`（名称可用）、`--dry-run --tag alpha` 打包校验通过，**仅差登录凭据**；另 5 个 `private:true` 制品不可发布。与 `docs/RELEASES.md` 既有形态一致 |
| **0.2.0-rc.2 官方文档镜像** | **本批不落盘**（用户裁决 3）。故仓库内 `docs/dsh-v0.1.7-rc.2/` 的路径引用**本批不改** —— 改则 404。引用重锚须等文档镜像落盘后单独执行 |
| 本机 buildx | **永久不可用**（arm64）。镜像一律在 `192.168.11.205`（x86_64）构建，属**本地构建**，非官方渠道分发 |
| `pnpm install` / `typecheck` / `build` | **本会话未复跑**（沿用本批早前记录 EXIT 0）。`check:versions`（559 条）/ `check:plan`（31 modules / 50 documents）/ 制品 `SHA256SUMS`（8/8 OK）**已复跑通过** |
| `test:integration` / `test:activity` / `test:planning` / `probe:*` | **未复跑** |
| 浏览器面 / 真实模型验收 | **未跑**（本批无对应面的新验证目标） |
| 派生镜像 arm64 变体 | **未构建**。仅构建 amd64；商店模板声明的 `architectures: [amd64, arm64]` 未覆盖 |
| 派生镜像的 1Panel 商店模板 | **未制作**。仅产出镜像本体，未写 `data.yml` / `docker-compose.yml` 供商店引用 |
| typert-generator 例外 | 该包在 0.2 线**最高仅 `0.2.0-rc.1`**（实测），豁免已登记在门禁脚本白名单 + 理由注释；**非静默放宽** |
| `docs/dsh-v0.1.7-rc.2/` 路径引用 | **本批不改**（见上「文档镜像未落盘」行），AGENTS.md line 41 等引用暂留旧路径，待文档镜像落盘后统一重锚 |
| 线上 `linshu-bridge` python3 缺失 | **既存问题，本批未处置**。容器内无 `python3`/`python`，来自第三方 `@furongjun1999/dsh-memory`（本批未升级）；升级窗口前后计数均为既有值，非本次引入。超出本次授权范围 |
| **升级后两项回归修复** | **已执行并验证**（2026-09-30，见第十节第 10 小节）：① 公告 ACK 无法保存 → profile 副本 `dsh-app-boot` 根 include 兜底；②「自动化任务」导航消失 → `ui-schedule` 由悬空行改为正式 insert。均以 HTTP RPC / 首页 HTML / 文件 sha 证据闭环 |
| **全局侧三包补丁未统一** | `dsh-config-editor` / `dsh-plugin-manager` / `dsh-hmr` 仍解析到**未打补丁**的全局 `dsh-app-boot` 副本；本次仅修 profile 副本，**未处置** |
| **`workdsh-fix-profile-reload.sh` 未纳入仓库** | 服务器本地脚本（非制品），交付面未登记；**未处置**，镜像重建/树替换会丢失 |
| **浏览器真人复测** | **未执行**。未打开 `https://dsh.10ge.cn/` 截图确认真人视角下弹窗消失与「自动化任务」出现 |

## 八、回退锚点

**仓库侧**：第一段的 17 个文件变更已提交为 `08765bf2f4`（`chore: 仓库基线随升 0.2.0-rc.2…`）并推送 `fork/main`。第二段的文档收口（本文件第十节与 `docs/STATUS.md` 续三十一节）已提交为 `1e368c2faf` 并推送 `fork/main`。**升级后回归修复**的文档回填（本文件第十节第 10 小节 + `docs/STATUS.md` 续三十三节）已提交为 `a293cdb64b`（父 `1e368c2faf`，2 文件 +215/-9）：`git push fork main`（GitHub hkluoji-lab）**失败**（`Could not resolve host: github.com`；同批 `curl https://github.com/` = `(28) Resolving timed out`、`curl https://gitee.com/` = `200 t=1.49s`，属当前出口对 github.com 的 DNS/TLS 阻断，非仓库配置），改推可达远程 `mygitee main`（Gitee szluoji）**成功** `e0a9ee95bd..a293cdb64b`（推送前核对 `mygitee/main` 为本地 `main` 祖先，0 ahead / 13 behind，纯快进）。回退 = `git revert a293cdb64b`；整体退基线 = `git revert 08765bf2f4`。

**服务器侧**（`192.168.11.205`，均为就地保留、未清理）：

- **线上换树前快照**（第二段，逐项实测）：
  - `/home/luoji/dsh-backup-020-anchor-20260929231554/` —— 迁移前锚点：`pre-adsh-count.txt`（`232`，存量 adsh 会话数）、`pre-sessions.txt`、`pre-storages.txt`（4834660B）、`projects-state-sha256.txt`、`standalone-version.txt`、`compose/`、`images/`、`host-tmp/`、`profile-config/`。
  - `/home/luoji/dsh-backup-020-p1-20260929231823/` —— Phase1 profile 重装锚点：`pnpm-install.log`（12707B）、`installed-versions.txt`（12 制品 `INSTALLED_VERSIONS_OK`）、`upload-sha256.txt`（12 tgz 全 `OK`）、`profile-deps-after.txt`（`RETARGET_OK`）、`profile-config/`。
  - `/home/luoji/dsh-backup-020-swap-20260929232445/` —— Phase2 换树锚点：`cli-before.txt`（`0.1.7-rc.2`）/ `cli-after.txt` / `cli-path-after.txt`（均 `0.2.0-rc.2`）、`compose-image-before.txt`（`1panel/deepseek-harness:0.1.5-rc.1`）/ `compose-image-after.txt`（`…:0.2.0-rc.2-localbuild-patched`）、`compose-md5-before.txt`（`c97ce5892408f2952ba16df83ad2002a`）/ `compose-md5-after.txt`（`6cf0b443b5554e7a5a4fc472fea59224`）、`compose-up.txt`（Recreate→Started）、`container-before.txt`（`Up 8 hours (healthy)`）/ `container-after.txt`（`Up 10 seconds (healthy)`）、`old-tree-version.txt`（`0.1.7-rc.2`）/ `new-tree-version.txt`（`0.2.0-rc.2`）、`patch-profile.txt` / `patch-standalone.txt`（均 `PATCHED`）、`gate-a-resolution.txt`（`RESOLUTION_ALL_OK`）/ `gate-b-version.txt`（`0.2.0-rc.2`）、`version-distribution.txt`（`TREE_VERSION_OK`）、`peer-after.txt`、`restarts-after.txt`（`restarts=0`）、`health-inner.txt`（`200`）/ `health-host3080.txt`（`200`）/ `health-domain.txt`（`302`）、`pre-sessions.txt` 与 `post-sessions.txt`（124 行，仅 1 行 `session.lock` mtime 变化）。
  - `/home/luoji/dsh-backup-rc202-3rd-20260930/` —— u6-fix 前锚点（4 文件）：`compatibility.json.bak.20260930033906`（537B）、`cordis.patch.yml.bak.20260930033906`（15878B）、`package.json.bak.20260930033906`（2806B）、`pnpm-lock.yaml.bak.20260930033906`（728572B）。
  - `/home/luoji/dsh-backup-rc202-4th-20260930/` —— u6-fix2 前锚点（4 文件）：`compatibility.json.bak.20260930`（537B）、`package.json.bak.20260930`（2806B）、`pnpm-lock.yaml.bak.20260930`（728572B）、`pnpm-workspace.yaml.bak.20260930`（27702B）。
  - `/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/tools/workdsh-identity-portal/package.json.bak.rc202fix.20260930033616`（815B，u6-fix 前的 peer `^0.1.7-alpha.2`）。
- `~/dsh-build-0.2.0-rc.2/Dockerfile`（2495B，md5 `dcb09efb850fd08bd6637187c21f6034`，pre-patch 初版）与 `~/dsh-build-0.2.0-rc.2-patched/Dockerfile`（4022B，md5 `76363b2f55b0b2330ff6a8a259c4f55c`，修复版）—— 构建配方留存。
- 镜像 `1panel/deepseek-harness:0.2.0-rc.2-localbuild`（`d3638b69fdb5`）与 `…-patched`（`2840936a34b5`）—— 本地保留，可 `docker rmi` 清除。
- base 镜像 `1panel/deepseek-harness:0.1.7-rc.2`（`e4b2d97516f2`，`sha256:e3793ea5…`）与升级前的 `0.1.5-rc.1`（`a2ee56aa955c`，`sha256:7ba97fef…`）—— 均**保留未删**，可用于回退。

**登录方式**：`sshpass -p '88888888' ssh -o StrictHostKeyChecking=no luoji@192.168.11.205`；含嵌套引号一律「本地写脚本 → scp → 远端 `bash /tmp/xxx.sh`」。

## 九、服务器脚本与本机同源件

服务器 `/tmp/` 探针脚本（本批执行，含渠道取证与镜像前后对照）：

| 脚本 | 用途 |
| --- | --- |
| `/tmp/rc2-channel.sh` | `docker pull` 0.2.0-rc.2 / 0.1.7-rc.2 对照 |
| `/tmp/rc2-channel2.sh` | 重试 + `docker manifest inspect` + 读 `/etc/docker/daemon.json` |
| `/tmp/rc2-channel3.sh` | Docker Hub tags API / registry-1 v2 / appstore 路径探测 |
| `/tmp/rc2-appstore.sh` | 定位 1Panel appstore 本地缓存（命中 `remote/deepseek-harness/`） |
| `/tmp/rc2-appstore-read.sh` | 读取商店模板全文 |
| `/tmp/rc2-final-evidence.sh` | 7 段汇总（Dockerfile 全文 / 镜像清单 / base 补丁 / patched 补丁 / broken 补丁 / entrypoint 行 / 生产容器） |
| `/tmp/rc2-verify.sh` | patched 镜像真实入口启动验证（healthy / 200 / Exit=0） |
| `/tmp/rc2-verify-broken.sh` | broken 镜像真实入口启动验证（401 / Exit=1，前侧对照） |

仓库侧脚本：`scripts/check-published-versions.mjs`（门禁，含 typert-generator 例外白名单）。

## 十、线上升级部署（2026-09-30）

用户授权「执行线上升级部署」+「一并重传 12 个制品」后执行。目标：把 `dsh.10ge.cn`（`192.168.11.205`，1Panel 应用 `deepseek-harness`，容器 `dsh`）由 `0.1.5-rc.1` 镜像 + `0.1.7-rc.2` 挂载树升级到 `0.2.0-rc.2`。

**部署根**：`/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh`（容器内 `/data/dsh`）。

**容器挂载（实测 7 项）**：

```
data/caddy                              → /data/caddy                                      (rw)
data/dsh/tmp/Caddyfile                  → /etc/caddy/Caddyfile                             (ro)
data/dsh/global-dsh/standalone          → /usr/local/lib/node_modules/@deepseek-ai/dsh     (rw)
data/dsh/tmp/docker-entrypoint.sh       → /usr/local/bin/docker-entrypoint.sh              (ro)
data/dsh                                → /data/dsh                                        (rw)
data/workspace                          → /workspace                                       (rw)
/etc/localtime                          → /etc/localtime                                   (ro)
```

### 1. Phase1：profile 重装 12 制品（未碰容器）

在容器内把 12 个 WorkDSH 制品（bundle + 10 插件 + identity-local provider）从 `file:/workspace/wd-upload-019/*.tgz` 重装到 `profiles/web/`：

| 项 | 实测 |
| --- | --- |
| 上传制品 | 12 个 tgz，`upload-sha256.txt` **全部 `OK`** |
| 安装结果 | `installed-versions.txt`：12 条 `OK`（含 `dist=true`）→ `INSTALLED_VERSIONS_OK` |
| profile 依赖 | `profile-deps-after.txt`：4 条 official = `0.2.0-rc.2`；`FILE_DEPS=12` 全部指向 `file:/workspace/wd-upload-019/*.tgz` → `RETARGET_OK` |
| `pnpm install` | `pnpm-install.log`（12707B）；容器内 pnpm `11.7.0` / node `v24.21.0` |
| 制品版本 | `workdsh-bundle 0.1.0-alpha.54`、experts `alpha.9`、skills `alpha.32`、office `alpha.8`、projects `alpha.4`、activity `alpha.5`、access `alpha.5`、audit `alpha.4`、library `alpha.3`、connectors `alpha.3`、assistant `alpha.1`、identity-local `alpha.6` |

### 2. Phase2：切镜像 tag + 双份 auth 补丁 + 原子换树 + `--force-recreate`

| 序 | 动作 | 前 | 后 |
| --- | --- | --- | --- |
| 1 | 门禁 A：解析新树依赖 | — | `resolved 83 packages (74 @deepseek-ai/dsh)`；`dsh versions: ["0.2.0-rc.2"]` → `RESOLUTION_ALL_OK` |
| 2 | 门禁 B：新树版本 | — | `0.2.0-rc.2` |
| 3 | 换 standalone 挂载树 | live tree `0.1.7-rc.2` | new tree `0.2.0-rc.2`（`standalone` → 新树，旧树保留） |
| 4 | 双份 auth-proxy 补丁重放 | — | `patch-standalone.txt` = `PATCHED`、`patch-profile.txt` = `PATCHED` |
| 5 | 树版本分布 | — | `version-distribution.txt`：`0.2.0-rc.2` **277** 条 + 11 条非 dsh（cordis 家族 5 / schemastery / cosmokit / libreoffice-kit 2 / node-addon-system 2）→ `TREE_VERSION_OK` |
| 6 | compose 改镜像 tag | `image: 1panel/deepseek-harness:0.1.5-rc.1` | `image: 1panel/deepseek-harness:0.2.0-rc.2-localbuild-patched`；md5 `c97ce5892408f2952ba16df83ad2002a` → `6cf0b443b5554e7a5a4fc472fea59224` |
| 7 | `docker compose up -d --force-recreate` | `Up 8 hours (healthy)` | `Container dsh Recreate / Recreated / Starting / Started` → `Up 10 seconds (healthy)` |

换树后 `cli-before.txt` = `0.1.7-rc.2` → `cli-after.txt` = `cli-path-after.txt` = `0.2.0-rc.2`；`peer-after.txt` 显示 cordis 家族 5 条与 `dsh-home-paths` / `dsh-app-boot` / `dsh-base` / `dsh-session-format-v3-to-v4` / `dsh-client-connection` 均为 `0.2.0-rc.2`。

### 3. 升级后验证

| 检查 | 实测 |
| --- | --- |
| 容器 | `Up … (healthy)`；`restarts-after.txt` = `restarts=0`；镜像 `1panel/deepseek-harness:0.2.0-rc.2-localbuild-patched`（`sha256:2840936a34b59…`） |
| 三层健康 | `health-inner.txt` = `200`（容器内 3080）/ `health-host3080.txt` = `200`（宿主 3080）/ `health-domain.txt` = `302`（`https://dsh.10ge.cn/` 重定向登录） |
| standalone 挂载树 | `version: 0.2.0-rc.2` |
| **存量数据未改写** | `pre-sessions.txt` 与 `post-sessions.txt` 均 124 行；`diff` 仅 1 行差异 —— `session-bb2d4935-…/session.lock` 的 mtime 由 `1790694977.634…` 变 `1790724307.279…`（会话锁文件被运行时刷新，非数据改写）。`pre-adsh-count.txt` = `232`（迁移前存量 adsh 会话数） |
| 后续复验（u6-fix2 后） | 容器 `Up … (healthy)` / `restarts=0` / `started=2026-09-30T03:53:54.946383189Z`；CLI `0.2.0-rc.2` |

### 4. 业务面回归（u6-fix）：根因 → 修复 → 复验

**现象**：换树重启后，WorkDSH 业务面插件（experts / skills / projects / library / connectors / assistant / access / audit / activity / identity）**未激活**，页面与 API 无业务数据。

**取证**：

```
$ docker logs dsh | grep -iE "incompatible|skipping|disabling"
… is incompatible with dsh 0.2.0-rc.2 … grant the exact-version exemption …
… dsh plugin allow-version … Exact-version exemption: not active.
```

门禁对每个 bundle 的 `peerDependencies` 做严格校验：**bundle 级失败 → `skipping profile bundle`（整包不加载）**；cordis 行级 → `disabling profile plugin row`。文案提示可用 `dsh plugin allow-version <pkg@ver> --dsh-version <exact> --accept-risk` 写 `profiles/web/compatibility.json` 获得豁免。

**根因**：`/data/dsh/tools/workdsh-identity-portal/package.json`（门户身份 Host 半边）的 peer 值失实——写的是旧版 `"@deepseek-ai/dsh-storage-domain": "^0.1.7-alpha.2"`，而 0.2 线只发布 `0.2.0-rc.2`，`^0.1.7-alpha.2` 不满足 ⇒ identity-portal 作为 bundle 被整包跳过 ⇒ 依赖其主体解析的业务面连锁未激活。

**修复**：把该 peer 修正为真实版本 `"@deepseek-ai/dsh-storage-domain": "^0.2.0-rc.2"`（备份 `package.json.bak.rc202fix.20260930033616`，815B，保留原值 `^0.1.7-alpha.2`），重启容器。

**复验（全绿）**：10 条目业务面恢复激活；带门户身份的只读探针（`rc2-identity-full.mjs`，HMAC 门户头）实测：

```
experts/list: 17        (total=17)
projects/list: 0        projects/templates: 15
library/space: 1        library/list: 0
skills/list: 46         (来源 plugin 9 + unknown 37)   skills/catalog: 1
connectors/list: 3      assistant/list: 0
错误对象: {}            （expert/skills/library 均无 error）
```

> **口径澄清**：`skills/list = 46` 中 `unknown` 37 条为**用户 `~/.agents` 官方技能目录**中的本机技能（非 WorkDSH 插件技能），`plugin` 9 条为 WorkDSH 插件提供；`projects/list = 0` / `library/list = 0` / `assistant/list = 0` 表示**该账号名下当前无对应对象**，非接口故障（`projects/templates = 15` 证明接口正常）。

### 5. 第三方 bundle 门禁跳过处置（u6-fix2）

u6-fix 后仍有 **4 个第三方 bundle** 因 peer 不满足被跳过（`RestartCount=0` / `healthy`，StartedAt 03:36:39）：

| 包 | 原版本 | 报缺 peer（节选） |
| --- | --- | --- |
| `dshmarket` | 1.66.3 | `dsh-settings: ^0.1.0-rc.7 \|\| ^0.1.1-rc.2 \|\| ^0.1.2-alpha.2` |
| `@nanmicoder/dsh-agent-teams` | 0.1.21 | 22 项，均止于 `0.1.7-rc.2` 族 |
| `dsh-mcp-connector` | 0.2.59 | `dsh-mcp-client: ^0.1.1-rc.2` |
| `dsh-builtin-browser` | 0.1.22 | `dsh-llm` / `dsh-tools` / `dsh-system-prompt: ^0.1.1-rc.2` |

**处置**（改 `profiles/web/package.json`，node 脚本保证 JSON 合法）：

- `dshmarket` `1.66.3` → **`1.66.6`**，`@nanmicoder/dsh-agent-teams` `0.1.21` → **`0.1.22`**，`dsh-mcp-connector` `0.2.59` → **`0.2.62`**（三个新版 peer 实测含 `0.2.0-rc.2`）。
- `dsh-builtin-browser` **从 `dependencies` 删除**，并**从 `dsh.profile.bundles` 移除**（bundles **24 → 23**）。

**移除 `dsh-builtin-browser` 的依据**（等价性论证）：

1. 该包上游 `dsh.compatibility.dsh: ">=0.1.1-rc.1 <0.2.0"` **显式排除 0.2.x**，无 0.2 兼容版本可选。
2. 其 `node_modules/electron` 的 `dist/` 在**全部历史快照中即为空**（`allowBuilds` 未放行 electron），即浏览器能力**从未可用**。
3. 容器 `DISPLAY=` 为空、无 Xvfb ⇒ 即便安装也无图形环境。
4. sessions / global-dsh 全量 grep **无任何 `browser_*` 使用痕迹**。
5. WorkDSH 仓库 grep `builtin-browser|browser_|dsh-builtin` **无匹配**。
6. ⇒ 移除与当前「跳过 = 不加载」状态**等价**，风险最小。

`pnpm install` 结果：`Packages: +13 -107`（移除 `dsh-builtin-browser` 连带 107 个包，含 electron 树）；`pnpm-workspace.yaml` 新增 3 条 `minimumReleaseAgeExclude`（`@nanmicoder/dsh-agent-teams@0.1.22` / `dsh-mcp-connector@0.2.62` / `dshmarket@1.66.6`，pnpm 11 自动追加）。

**复验（升级窗口切分核验，全绿）** —— 以本次 `StartedAt 2026-09-30T03:53:54` 为界统计：

| 指标 | 实测 |
| --- | --- |
| `skipping profile bundle` | **0** |
| `is incompatible with dsh` | **0** |
| `disabling profile plugin row` | **0** |
| 窗口内新增 error/warn | 仅 caddy `admin endpoint disabled`（warn，正常）+ pki trust store 提示（info） |
| 容器 | `running` / `healthy` / `restarts=0` / `started=2026-09-30T03:53:54.946383189Z` |
| 镜像 | `1panel/deepseek-harness:0.2.0-rc.2-localbuild-patched`（`sha256:2840936a34b59…`） |
| 树版本 | standalone 挂载树 `version: 0.2.0-rc.2`；CLI `0.2.0-rc.2` |
| 三层健康 | inner 3080 = `200`；`https://dsh.10ge.cn/` = `302` |
| 探针 | experts 17 / templates 15 / library space 1 / skills 46 / connectors 3 / 错误 `{}` ⇒ 无新增回归 |
| 残留引用 | `dsh-builtin-browser` 在 profile 目录（excl `node_modules`）与 profile `cordis.patch.yml`、其他 bundle patch 文件中**均无引用** |
| bundles 计数 | **23**；`dependencies` 中 `dsh-builtin-browser` = `false`；`dshmarket=1.66.6` / `@nanmicoder/dsh-agent-teams=0.1.22` / `dsh-mcp-connector=0.2.62` |

### 6. u3 判定：派生脚本链无需复跑 + 宿主增强 entrypoint 兼容

- **派生脚本链**：三个基座镜像（`0.1.5-rc.1` / `0.1.7-rc.2` / 本地 `…-patched`）的五项基座 md5 与第一段构建时**未变**，且 patched 镜像 `2840936a34b5` 即第一段产物（未被重建/覆盖）⇒ **派生脚本链无需复跑**；本次部署直接复用第一段镜像。
- **宿主增强 entrypoint 兼容**：宿主 `/opt/…/data/dsh/tmp/docker-entrypoint.sh`（9251B，md5 `fa304713e29b2d4b23851369935501eb`）+ `Caddyfile`（md5 `53bad44d355cdf5924703a949835586c`）以 ro 挂载进容器，与 0.2.0-rc.2 兼容 —— 实证为换树重启后容器 `healthy`、三层健康全过、门禁跳过归零。宿主脚本**未被本次修改**。

### 7. 遗留：`linshu-bridge` python3 缺失（既存，非本次引入）

换树后日志出现 `[lingshu-bridge] python3 ENOENT` 反复重试。窗口切分核验：该告警在 **u6-fix2 之前**的窗口（03:37–03:53）已有 **17 次** ⇒ **既存问题**，来自第三方 `@furongjun1999/dsh-memory`（**本批未升级**），根因是容器内**无 `python3`/`python`**（`which` 双 NO）。**非本次升级引入**，且超出本次授权范围，**未处置**，登记于此待后续单独决策。

### 8. core 清理与 npm 发布处置（2026-09-30，用户授权「npm 发布、core 清理授权马上处理」）

**core 清理 —— 已执行**：

| 项 | 前 | 后 |
| --- | --- | --- |
| `tmp/cores/` | 3 个 core（`033601` 18.08G / `035301` 18.09G / `041001` 18.10G） | 空目录 |
| 目录占用 | `55G` | `4.0K` |
| `/` 磁盘 | `234G / 54%` | `180G / 42%`（可用 254G） |

命令 `rm -f $D/data/dsh/tmp/cores/dsh-segv-*.core`；删除后 `ls` / `du` / `df` 三项复核一致。清理前实测目录只剩 3 个 core —— 先前记录的 `dsh-segv-20260930-002901.core`（18.05G，本次升级前遗留）核查时已不在（目录 mtime `04:13:01`）。**04:12 崩溃归因**：`docker logs` 显式 `docker-entrypoint.sh: line 265: 29 Segmentation fault gosu node env … node …/dsh/lib/bin.js web --host 127.0.0.1 --port 3080`（pid 29 = 主 dsh node 进程），随后 `SIGTERM` 优雅关闭 `exit_code:0`，由 `unless-stopped` 策略拉起 ⇒ 新 core `041001`。与 [v8-gc-sigsegv-repro](v8-gc-sigsegv-repro.md) 同源（V8 并发标记 GC SIGSEGV，Linux x86_64 + Node v24.21 约 35% 崩溃率），**属既有 V8/GC 问题，非本次升级回归**；清理后容器 `Up 9 minutes (healthy)`、`Restarts=1`、`ExitCode=0`、`OOMKilled=false`、`inner3080=200`。

**npm 发布 —— 已授权，因本机无凭据未完成**：

| 检查 | 实测 |
| --- | --- |
| `npm whoami` | `ENEEDAUTH`（未登录） |
| `npm config get registry` | `https://registry.npmmirror.com/`（镜像源，非发布源） |
| `~/.npmrc` | 78B，仅 `fetch-timeout` / `fetch-retries` / `registry`，**无 `_authToken`** |
| 仓库 `.npmrc` / `.netrc` / shell profile / keychain | 均无 token |
| 环境变量 | 仅 `NPM_CONFIG_YES=true`，**无 `NPM_TOKEN`** |
| CI | `.github/workflows/` 仅 `pages.yml`，**无发布 workflow** |
| `gh auth status` | 未登录任何 host |
| 制品可发面 | 12 tgz 全为 `0.1.0-alpha.N` 预发布 ⇒ 必须 `--tag alpha`；5 个 `private:true`（bundle/access/audit/office/identity-local）不可发，7 个 `private:false` 理论可发 |
| 名称可用性 | 7 个可发名 + `workdsh-bundle` 在 `registry.npmjs.org` 均 `HTTP 404` |
| `--dry-run --tag alpha` | 通过：21 files / `0.1.0-alpha.5`，仅提示 `requires you to be logged in` |

结论：制品与打包链路就绪，**唯一缺口为本机无任何 registry 凭据**。待提供登录方式（`npm login` 交互、`NPM_TOKEN` 或 CI 秘钥）后，即可对 7 个 `private:false` 制品按 `--tag alpha` 发布。**未伪造成功、未反复重试、未变更任何发布面配置**。

### 9. 本次未执行项

- **`git config` 变更** —— 未授权，未执行（committer 身份仍为自动推断）。
- `test:integration` / `test:activity` / `test:planning` / `probe:*` —— 未复跑。
- 浏览器面（`dsh-builtin-browser` 已移除，无对应面）/ 真实模型验收 —— 未跑。
- 派生镜像 arm64 变体、1Panel 商店模板 —— 未制作。
- **npm 发布** —— 已授权但未推进到实际上传（无凭据，见第 8 小节）。

### 10. 升级后回归修复：公告确认无法保存 +「自动化任务」导航消失（2026-09-30）

线上升级到 `0.2.0-rc.2` 后用户报告两个症状；本小节记录根因、修复与验证闭环。**全部验证为容器内 HTTP RPC / 首页 HTML / 文件 sha 证据，浏览器真人复测未执行**（见 10.4）。

#### 10.1 问题 1：0.2 预览公告弹窗「暂时无法保存确认状态，请重试」

**症状**：登录首页反复弹出 0.2 预览公告，点击确认后全文末尾出现红字「暂时无法保存确认状态，请重试。」，下次刷新继续弹。

**链路定位**（客户端常量与判定逻辑实测）：

| 项 | 实测值 | 位置 |
| --- | --- | --- |
| 期望版本常量 `WELCOME_NOTICE_VERSION` | `2026-09-28.1` | `dsh-client-ui-settings-models/lib/client.js:2650` |
| ACK 字段 `WELCOME_NOTICE_ACK_FIELD` | `welcomeNoticeVersion` | 同文件 `:2655` |
| 命名空间 `WELCOME_NOTICE_SETTINGS_NAMESPACE` | `ui-settings-general` | 同文件 `:2656` |
| 写入口 | `await this.scope.set(WELCOME_NOTICE_ACK_FIELD, WELCOME_NOTICE_VERSION)` | 同文件 `:2711` |
| 判定（**精确相等**） | `scope.value?.[ACK] === WELCOME_NOTICE_VERSION` | 同文件 `:2754` |
| 失败态 | `state.error = "the acknowledgement did not persist"` → UI `t("welcomeError")` 红字 | 同上 |

**根因**：写入路径为 `settings/mutate` → `dsh-settings.write` → `dsh-config-editor.edit()`；`edit()` 先 `readProfilePatches` 再 `reconcileProfilePatches()`，后者因**根 include 条目缺失**抛 `dsh: profile reload requires the root Include entry`，抛错点在 `writeFileAtomic` **之前** ⇒ 无任何落盘、返回 `settings/rejected` ⇒ 客户端 `acknowledged === false` ⇒ 红字。更深层原因是 **`@deepseek-ai/dsh-app-boot` 在 profile 树与全局树存在物理双副本**：profile 侧 `dsh-config-editor` 解析到 profile 副本，而 `bootstrapIncludes` 是模块级 `WeakMap`，**不跨副本共享**，运行进程读到的 include 登记不完整。

**修复**：服务器本地脚本 `/data/dsh/tools/workdsh-fix-profile-reload.sh`（4279B，向 profile 副本 `node_modules/@deepseek-ai/dsh-app-boot/lib/index.js` 注入 `workdshRootIncludeEntry(ctx)` 兜底，谓词 `options.id === "include" && options.name === "cordis:include"`，锚点 `const bootstrapIncludes = /* @__PURE__ */ new WeakMap();`；支持 `--revert`）。本会话复核注入标记存在：`grep -c workdsh-root-include-fallback` = **1**。

**验证闭环**（可复算）：

| 步骤 | 实测 |
| --- | --- |
| 重启加载补丁 | `docker restart dsh` → `Up (healthy)`，`StartedAt=2026-09-30T17:09:00.315294879Z`（容器 CST 01:09），`RestartCount=0` |
| 写入探针 | `POST /api/settings/mutate`，`args = {ns:"ui-settings-general", ops:[{op:"set",path:["welcomeNoticeVersion"],value:"2026-09-28.1"}]}` |
| **文件层复算**（决定性） | 本地 `sed 's/welcomeNoticeVersion: 2026-08-13.1/welcomeNoticeVersion: 2026-09-28.1/'` 后 `shasum -a 256` = `de129c00e85dddca895ffec4feb002432efed4bace972f25582a68d800d3310e`，与线上 `cordis.patch.yml` **逐字节一致**（17045B / 368 行）⇒ 证明只改了该一行，且 **reconcile 未再抛错**（否则会回写 `before`） |
| 读回复核 | `POST /api/settings/describe` → `ui-settings-general`：`value.user.welcomeNoticeVersion = "2026-09-28.1"`、`base = {}`、`revision = 1` ⇒ 与客户端常量**精确相等**，`acknowledged` 判定成立 |

> **注意**：探针 curl 报 `(28) Operation timed out ... 0 bytes received`，**不得据此判定失败** —— 实际是写入成功后 profile reload 切断长连接。判定须以补丁文件 sha 与 `settings/describe` 为准。

#### 10.2 问题 2：左侧「自动化任务」导航升级后消失

**两个同名概念互不遮蔽**（实测）：

| 入口 | 提供方 | 面板 id | label | order |
| --- | --- | --- | --- | --- |
| 官方「自动化任务」 | `@deepseek-ai/dsh-client-ui-schedule` | `schedules`（`PANEL_ID`） | 自动化任务 | 10 |
| WorkDSH「定时任务」 | `workdsh-plugin-schedule` | `workdsh-automation` | 定时任务 | 40 |

**根因**：线上 profile `dsh.profile.bundles`（23 项）**不含** `dsh-experimental-schedule-bundle`；该官方 bundle 的 `cordis.patch.yml` 内容为三行 `insert`（`time-context` / `schedule` / `ui-schedule`）。而线上 `profiles/web/cordis.patch.yml` 当时只 insert 前两行，客户端半侧写成**悬空行**：

```yaml
- id: ui-schedule
  disabled: false
```

该目标 id **不在组合树中**（无任何 bundle 提供），loader 仅 warn 不报错 ⇒ 无官方 `sidebar.panellist` 贡献者 ⇒ 左侧「自动化任务」消失；「定时任务」插件仍在，故用户看到的是「少了一项」而非「全空」。

**修复**（已落地 `profiles/web/cordis.patch.yml`）：把 `ui-schedule` 改为正式并入 `insert` 并声明官方包，删除悬空行，更正块注释：

```yaml
- insert:
    - id: time-context
      name: '@deepseek-ai/dsh-time-context'
    - id: schedule
      name: '@deepseek-ai/dsh-schedule'
    - id: ui-schedule
      name: '@deepseek-ai/dsh-client-ui-schedule'
```

**验证闭环**：

| 步骤 | 实测 |
| --- | --- |
| 首页预载清单 | `/tmp/index.html` 43249B，含 **55 个** `dsh-client-*` 预载；`@deepseek-ai/dsh-client-ui-schedule/client.js` **在位**（`grep -o dsh-client-ui-schedule` = 5 处） |
| 客户端模块可取 | `GET /plugins/??@deepseek-ai/dsh-client-ui-schedule/client.js`（需 `--path-as-is`）→ `200 / 305008B` |
| 模块内含贡献点 | `PANEL_ID = "schedules"`、`sidebar.panellist` **2 处**、中文字符串「自动化任务」 |

#### 10.3 本次改动与备份

| 对象 | 说明 |
| --- | --- |
| `profiles/web/cordis.patch.yml` | 修复后 17045B / 368 行，sha `de129c00e85dddca895ffec4feb002432efed4bace972f25582a68d800d3310e`，`node:node 600` |
| 备份 | 宿主 `/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/profiles/web/cordis.patch.yml.bak.schedulenav.20260930`（sha `52a3b0d8587f7615cfec3a823e2fe5cafd384355736a09a4d1ec4da0a1b03876`，15878B，与改动前原文件一致已校验）；容器内另有 `cordis.patch.yml.bak.schedule-welcome.20260930`（15878B） |

#### 10.4 剩余边界（本次未处置）

- **全局侧三包未打补丁**：`dsh-config-editor` / `dsh-plugin-manager` / `dsh-hmr` 仍解析到**未打补丁**的全局 `dsh-app-boot` 副本；本次仅修 profile 副本，症状已闭环，但同源风险未根除。
- **`workdshRootIncludeEntry` 来源登记**：`/data/dsh/tools/workdsh-fix-profile-reload.sh` 属**服务器本地改动**（非仓库制品），未纳入仓库版本管理；`docs/PLUGIN-DELIVERY.md` 等交付面**未登记**，后续镜像重建/树替换会丢失，须单独决策是否纳入正式交付。
- **浏览器真人复测未执行**：未打开 `https://dsh.10ge.cn/` 截图确认弹窗消失与导航出现，仅以 HTTP RPC + 首页 HTML + 模块字节证据闭环。

---

日期：2026-09-30。结论：官方 `latest` = `next` = **`0.2.0-rc.2`**（29 个版本）。**仓库基线**已随升至 `0.2.0-rc.2`（override 289 条含 1 条例外 `dsh-typert-generator 0.2.0-rc.1`；devDeps 32 条含同例外；12 manifest dsh peer 96 条全 caret；lock 命中 3284 行、`0.1.7-rc.2` 残余 0；`check:versions` PASS 559 条；`check:plan` PASS 31/50）。**12 个制品**已重出并上传（`upload-sha256.txt` 12/12 OK；`installed-versions.txt` 12 条 OK）。**1Panel 渠道确认未适配 0.2.x**（appstore 本地缓存仅 `0.1.5-rc.1`；`docker pull` 因出口 TLS 阻断不可作证据，对照镜像同样失败）。**派生镜像已自建并双向验证**：broken 版 `inner3080=401 / Exit=1`（根因 = 1Panel auth-proxy 补丁被 `npm install -g` 覆盖丢失），patched 版 `healthy / 200 / Exit=0 / Restarts=0`（补丁文件 md5 与 base 逐字一致 `69f8b3ef85e03eed4f0e8ac4295c61c5`）。

**★ 线上已升级**（第二段）：`dsh.10ge.cn` 由 `0.1.5-rc.1` 镜像 + `0.1.7-rc.2` 挂载树升级为 `0.2.0-rc.2-localbuild-patched` 镜像 + `0.2.0-rc.2` 挂载树；容器 `healthy`；三层健康 `inner=200 / host=200 / domain=302`；存量 232 会话与 124 条 session 数据未改写。升级中暴露并修复两处：① **业务面回归**（identity-portal 失实 peer `^0.1.7-alpha.2` → `^0.2.0-rc.2`，修复后 10 条目激活、探针 experts 17 / skills 46 / connectors 3）；② **4 个第三方 bundle 门禁跳过**（`dshmarket→1.66.6` / `agent-teams→0.1.22` / `mcp-connector→0.2.62` 升级 + `builtin-browser` 移除，复验跳过归零）。

**★ 收官处置**（2026-09-30「npm 发布、core 清理授权马上处理」）：**core 清理已执行**（`tmp/cores/` 3 个 core / 55G → 空，磁盘 `234G/54%` → `180G/42%`）；清理中一并定界 **04:12 一次 V8/GC SIGSEGV 自动重启**（entrypoint 第 265 行主 dsh 进程，既有问题非升级回归，故当前 `Restarts=1`）。**npm 发布已授权但未完成** —— 制品与 `--dry-run --tag alpha` 链路就绪、7 个 `private:false` 名称在 npmjs 可用，唯一缺口是本机无任何 registry 凭据（`ENEEDAUTH`），待提供登录方式后即可发布。**文档镜像落盘未执行**（已裁决不做）。剩余边界（含 `linshu-bridge` python3 既存缺失）以「未覆盖项与边界」表为准，表中未执行项不得计入已完成。

**★ 升级后回归修复**（2026-09-30 续，用户报告「公告确认红字」「自动化任务导航消失」）：两症状均已定位根因并修复落地——① 公告 ACK 写入被 `dsh-config-editor.edit()` 的 `reconcileProfilePatches()` 抛 `profile reload requires the root Include entry` 阻断（根源 = `dsh-app-boot` 物理双副本 + `bootstrapIncludes` WeakMap 不跨副本），经 profile 副本兜底脚本修好，实测 `settings/mutate` 落盘 `welcomeNoticeVersion = 2026-09-28.1`（补丁 sha `de129c00…` 与本地 sed 复算**逐字节一致**）、`settings/describe` `revision=1`；②「自动化任务」为官方 `dsh-client-ui-schedule`（`PANEL_ID=schedules`），原补丁只有一条指向不存在 id 的悬空行，改为正式 `insert` 后首页预载清单恢复含该模块（55 个 `dsh-client-*`，模块 `200 / 305008B`，含 `sidebar.panellist` 与「自动化任务」）。**浏览器真人复测未执行**；全局侧三包未打补丁、兜底脚本未纳入仓库两项边界见 10.4。
