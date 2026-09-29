# DSH 升级证据（0.1.7-rc.2 → 0.2.0-rc.2，仓库基线 + 制品 + 派生镜像）

2026-09-29 至 2026-09-30 执行。本文件记录**仓库侧**从 `0.1.7-rc.2` 到官方 `latest` `0.2.0-rc.2` 的适配，含三项交付：① 版本承载文件与 lock 随升；② 8 个 WorkDSH 插件制品重出；③ 派生容器镜像自建（1Panel 渠道无 0.2.x，须自行构建）。

**批次性质**：本批**不含线上运行面升级**。线上 `dsh.10ge.cn`（`luoji@192.168.11.205`，1Panel 应用 `deepseek-harness`）**全程保持 `0.1.5-rc.1` 镜像 + `0.1.7-rc.2` 挂载树未动**。用户明确授权范围 = 「重出插件制品 + 自建派生镜像（含本地构建）」，**线上升级部署、core 清理、npm 发布、自动提交推送均未授权**。

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

### 7. 生产容器全程未动

```
dsh | 1panel/deepseek-harness:0.1.5-rc.1 | Up 7 hours (healthy)
```

三次验证脚本（broken / patched / 汇总）末尾均复核该项，**未发生任何变更**。

## 六、边界归因

| 项 | 现象 | 归因 |
| --- | --- | --- |
| `docker pull` 失败 | `0.2.0-rc.2` 与对照 `0.1.7-rc.2` **均** TLS handshake timeout | **出口网络阻断**，非版本缺失。故不用 pull 作渠道证据 |
| `1Panel appstore 只有 0.1.5-rc.1` | 商店模板长期未更新 | **渠道事实**：1Panel 未适配 0.2.x（亦未适配 0.1.7），派生镜像须自建 |
| 派生镜像首版崩溃 | `inner3080=401 / Exit=1` | **补丁丢失**：`npm install -g` 覆盖 `node_modules`，1Panel auth-proxy 补丁被抹 |
| `apps.fit2cloud.com/...` 404 | 探测 URL 错 | 非 1Panel 真实索引路径；改用本地缓存磁盘文件取证 |
| 本地 tag 镜像 `digest=<none>` | 未推送 registry | 预期：仅本地构建，未授权推送 |
| 生产容器版本 `0.1.5-rc.1` | 镜像 tag 旧 | **预期**：该容器 dsh 本体由宿主 standalone 树 bind mount 提供（rc.2 批次已论证 tag 与实际版本解耦），且本批未授权线上升级 |

## 七、未覆盖项与边界

| 项 | 状态与说明 |
| --- | --- |
| **线上升级部署** | **未执行（用户未授权）**。`dsh.10ge.cn` 线上仍为 `0.1.5-rc.1` 镜像 + `0.1.7-rc.2` 挂载树。派生镜像**未部署到任何主机**（manifest `limitations` 已声明） |
| **npm 发布** | **未执行（用户既有裁决：保留制品形态）**。`npm whoami` = `ENEEDAUTH`；与 `docs/RELEASES.md` 既有形态一致 |
| **0.2.0-rc.2 官方文档镜像** | **本批不落盘**（用户裁决 3）。故仓库内 `docs/dsh-v0.1.7-rc.2/` 的路径引用**本批不改** —— 改则 404。引用重锚须等文档镜像落盘后单独执行 |
| 本机 buildx | **永久不可用**（arm64）。镜像一律在 `192.168.11.205`（x86_64）构建，属**本地构建**，非官方渠道分发 |
| `pnpm install` / `typecheck` / `build` | **本会话未复跑**（沿用本批早前记录 EXIT 0）。`check:versions`（559 条）/ `check:plan`（31 modules / 50 documents）/ 制品 `SHA256SUMS`（8/8 OK）**已复跑通过** |
| `test:integration` / `test:activity` / `test:planning` / `probe:*` | **未复跑** |
| 浏览器面 / 真实模型验收 | **未跑**（本批无对应面的新验证目标） |
| 派生镜像 arm64 变体 | **未构建**。仅构建 amd64；商店模板声明的 `architectures: [amd64, arm64]` 未覆盖 |
| 派生镜像的 1Panel 商店模板 | **未制作**。仅产出镜像本体，未写 `data.yml` / `docker-compose.yml` 供商店引用 |
| typert-generator 例外 | 该包在 0.2 线**最高仅 `0.2.0-rc.1`**（实测），豁免已登记在门禁脚本白名单 + 理由注释；**非静默放宽** |
| `docs/dsh-v0.1.7-rc.2/` 路径引用 | **本批不改**（见上「文档镜像未落盘」行），AGENTS.md line 41 等引用暂留旧路径，待文档镜像落盘后统一重锚 |

## 八、回退锚点

**仓库侧**：本批变更全部在工作区，**未提交**（HEAD 仍 `6b07f78b1fb04f09664213309c5a2658ea4f72d2`）。回退 = `git checkout -- <17 个文件>`，即回到 `0.1.7-rc.2` 基线。

**服务器侧**（`192.168.11.205`，均为就地保留、未清理）：

- `~/dsh-build-0.2.0-rc.2/Dockerfile`（2495B，pre-patch 初版）与 `~/dsh-build-0.2.0-rc.2-patched/Dockerfile`（4022B，修复版）—— 构建配方留存。
- 镜像 `1panel/deepseek-harness:0.2.0-rc.2-localbuild`（`d3638b69fdb5`）与 `…-patched`（`2840936a34b5`）—— 本地保留，可 `docker rmi` 清除。
- base 镜像 `1panel/deepseek-harness:0.1.7-rc.2`（`sha256:e3793ea5…`）与生产在用的 `0.1.5-rc.1`（`sha256:7ba97fef…`）—— **未动**。

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

---

日期：2026-09-30。结论：官方 `latest` = `next` = **`0.2.0-rc.2`**（29 个版本）。**仓库基线**已随升至 `0.2.0-rc.2`（override 289 条含 1 条例外 `dsh-typert-generator 0.2.0-rc.1`；devDeps 32 条含同例外；12 manifest dsh peer 96 条全 caret；lock 命中 3284 行、`0.1.7-rc.2` 残余 0；`check:versions` PASS 559 条；`check:plan` PASS 31/50）。**8 个插件制品**已重出至 `.artifacts/0.2.0-rc.2-release/`（8 tgz + SHA256SUMS + manifest，`shasum -c` 8/8 OK）。**1Panel 渠道确认未适配 0.2.x**（appstore 本地缓存仅 `0.1.5-rc.1`；`docker pull` 因出口 TLS 阻断不可作证据，对照镜像同样失败）。**派生镜像已自建并双向验证**：broken 版 `inner3080=401 / Exit=1`（根因 = 1Panel auth-proxy 补丁被 `npm install -g` 覆盖丢失），patched 版`healthy / 200 / Exit=0 / Restarts=0`（补丁文件 md5 与 base 逐字一致 `69f8b3ef85e03eed4f0e8ac4295c61c5`）。**生产容器 `1panel/deepseek-harness:0.1.5-rc.1 (healthy)` 全程未动**。线上升级部署、npm 发布、文档镜像落盘**均未执行**（未授权/已裁决不做），剩余边界以「未覆盖项与边界」表为准，表中未执行项不得计入已完成。
