# DSH 0.2.1-rc.2 → 0.2.1-rc.3 升级操作指南（Runbook）

配套分析：[dsh-0.2.1-rc.3-upgrade](dsh-0.2.1-rc.3-upgrade.md)
目标环境：`dsh.10ge.cn`（`luoji@192.168.11.205`，1Panel 容器 `dsh`）
状态：**未执行**。每一步执行后将实测结果回填本文与 `docs/STATUS.md`。

---

## 0. 前置条件

### 0.1 统一变量（每次会话开头先设置）

```bash
A=/opt/1panel/apps/deepseek-harness/deepseek-harness
D=$A/data
TS=$(date +%Y%m%d%H%M%S)
NEW=0.2.1-rc.3
OLD=0.2.1-rc.2
REG=https://registry.npmmirror.com
```

> `luoji` 对 `$D`（`data/dsh`、`data/workspace`）可写；对 `$A`（compose、`.env`）**不可写，需 `sudo`**。

### 0.2 必须先确认的三件事

| # | 确认项 | 命令 | 期望 |
| --- | --- | --- | --- |
| 1 | 用户已授权线上写入 | — | 明确授权语 |
| 2 | 1Panel 是否已发布 rc.3 镜像（若已发布，优先走镜像升级而非挂载树换版） | `curl -s -o /dev/null -w "%{http_code}\n" -H "Accept: application/vnd.oci.image.index.v1+json" https://docker.1panel.live/v2/1panel/deepseek-harness/manifests/$NEW` | 截至 2026-10-25 预期 **404** → 沿用挂载树换版 |
| 3 | 实例实际门户账号数（决定阶段 3b 灰度方式） | `sudo docker exec dsh ls /data/dsh/portal/data 2>/dev/null` | 记录 |

### 0.3 硬约束（违反即中止）

- **绝不以 root 跑 pnpm/npm**：所有安装命令必须 `-u 1000` 或 `--user 1000:1000`，`HOME=/data/dsh/home`。
- 容器内**只能访问 `registry.npmmirror.com`**，所有 npm/pnpm 命令显式带 `--registry=$REG`。
- `docker cp` 不可用（rootfs 只读）；要送脚本进容器只能写 `$D` 或 `-v` 挂载。
- 只用 `docker compose up -d --force-recreate` 重建；普通 `up -d` 输出 `Running` **不会**重建。
- 版本判定看 CLI + 挂载树 + profile 三处，**不看镜像 tag**（tag 是 `0.2.0-rc.2`）。

---

## 阶段 0｜预升级检查（只读）

### 0.1 版本三处复验

```bash
sshpass -p '******' ssh luoji@192.168.11.205

docker exec dsh dsh --version
docker exec dsh cat /usr/local/lib/node_modules/@deepseek-ai/dsh/package.json | node -p 'JSON.parse(require("fs").readFileSync(0,"utf8")).version'
docker exec dsh sh -c 'cd /data/dsh/profiles/web && node -p "require(\"./package.json\").dependencies"'
```
**期望**：三处均为 `0.2.1-rc.2`。不一致则先查清原因，不进入阶段 1。

### 0.2 健康与基线

```bash
docker ps --filter name=^dsh$ --format '{{.Status}}'
docker inspect -f '{{.RestartCount}} {{.State.StartedAt}}' dsh
df -h $D | tail -1
```

### 0.3 数据基线（**本次实测值即回滚判据**）

```bash
docker exec dsh sh -c 'find /data/dsh/sessions -type f 2>/dev/null | wc -l'   # → S0
docker exec dsh sh -c 'find /data/dsh/storages -type f 2>/dev/null | wc -l'   # → T0
```
记入下表，**不要用历史值 327 / 120317 代替**。

### 0.4 装配与补丁基线

```bash
docker logs dsh 2>&1 | grep -cE "did not activate|duplicate id|is incompatible with dsh|disabling profile plugin row"
find $D/global-dsh -maxdepth 1 -name 'standalone*' -exec du -sh {} \;
grep -c ONEPANEL_DSH_AUTH_PROXY $D/global-dsh/standalone/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js
grep -c ONEPANEL_DSH_AUTH_PROXY $D/profiles/web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js
```

### 0.5 兼容基线扫描

```bash
docker exec -u 1000 -e HOME=/data/dsh/home dsh node /workspace/deploy/tools/workdsh-compat-scan.mjs --profile /data/dsh/profiles/web
```
> 若 `deploy/tools` 未挂载进容器，改用宿主运行：`node deploy/tools/workdsh-compat-scan.mjs --profile $D/profiles/web`。
**期望**：exit 0；记录当前缺口数与明细，作为升级后对比基线。

### 0.6 阶段 0 记录表（执行时填写）

| 项 | 值 |
| --- | --- |
| CLI / 挂载树 / profile 版本 | / / |
| 容器状态 / RestartCount | / |
| `$D` 可用空间 | |
| sessions S0 / storages T0 | / |
| 装配异常行数 | |
| auth-proxy marker（双份） | / |
| compat-scan exit / 缺口数 | / |

**出口条件**：全部记录完成；`$D` 剩余空间 ≥ 3 GB（两个整树 + profile 副本）；容器 `healthy`、`RestartCount=0`。

---

## 阶段 1｜仓库基线同步（6 处真源）

> 全部在**本地仓库**执行，不碰线上。

### 1.1 根 `package.json`

- 25 条官方 devDep：`0.2.1-rc.2` → `0.2.1-rc.3`
- `pnpm.overrides` 300 条 `@deepseek-ai/dsh*`：`0.2.1-rc.2` → `0.2.1-rc.3`
- **新增 1 条 override**（当前 0 命中，缺失会导致 `check:versions` 失败）：

```json
"@deepseek-ai/dsh-client-ui-entry-customization": "0.2.1-rc.3"
```

> Cordis 族（`cordis 4.0.5` / `group 1.0.5` / `include 1.0.10` / `loader 1.0.6` / `timer 1.1.7` / `schemastery 3.18.5`）**不变**。

### 1.2 `packages/**/package.json`（16 个文件）

- peer：`^0.2.1-rc.2` → `^0.2.1-rc.3`
- devDependency：精确 `0.2.1-rc.3`

```bash
grep -rl "0\.2\.1-rc\.2" packages --include=package.json
```

### 1.3 `scripts/check-published-versions.mjs`

同步 `expected` 与 companions 常量到 `0.2.1-rc.3`。

### 1.4 `deploy/profile/package.json`

4 条官方依赖 → `0.2.1-rc.3`：
`@deepseek-ai/dsh-base`、`dsh-schedule`、`dsh-time-context`、`dsh-web-app`。
第三方 13 个与 workdsh 14 个 tgz **不动**。

### 1.5 `deploy/profile/pnpm-workspace.yaml`

- 288 条 `0.2.1-rc.2` → `0.2.1-rc.3`
- **新增 override**：`@deepseek-ai/dsh-client-ui-entry-customization: 0.2.1-rc.3`
- `minimumReleaseAgeExclude`：本轮**不逐条补 288 条**，安装时用 `--config.minimumReleaseAge=0` 一次性绕过
- 顺带清理建议（可延后）：227 条 `@deepseek-ai/*@0.2.0-rc.2` 已全部失效，属历史遗留

### 1.6 `deploy/profile/compatibility.json`

**不手改**。等阶段 4 用 `allow-version` 写入 `0.2.1-rc.3`（保留 `0.2.1-rc.2` 以便回滚）。

### 1.7 阶段 1 校验

```bash
corepack pnpm check:versions
corepack pnpm check:plan
```

**出口条件**：两命令 PASS；`grep -c "0.2.1-rc.2" package.json deploy/profile/pnpm-workspace.yaml` 结果为 0。

---

## 阶段 2｜测试环境验证（本地隔离）

```bash
corepack pnpm install --no-frozen-lockfile
corepack pnpm typecheck
corepack pnpm build
corepack pnpm check:acceptance
corepack pnpm check:env
corepack pnpm test:integration      # 覆盖 AgentPresetSeatController 相关断言
corepack pnpm test:activity
corepack pnpm test:access
corepack pnpm test:identity
corepack pnpm test:projects
corepack pnpm test:assistant
corepack pnpm test:planning
corepack pnpm preview:install
corepack pnpm probe:install
corepack pnpm probe:presets
```

`preview:install` 后确认：

```bash
node -p "require('./.preview/profile/package.json').dependencies" 2>/dev/null || \
  grep -rn "0.2.1-rc.3" --include=package.json .preview 2>/dev/null | head
```

**出口条件**：
- 全部命令退出码 0，测试 0 fail
- 预览 Profile 官方依赖 = `0.2.1-rc.3`
- **未使用空的 Agents home 启动人工预览**（人工预览必须读 `~/.agents`；自动化探针才用临时 home）

---

## 阶段 3｜灰度发布（影子实例）

### 3.1 构建 rc.3 新树

```bash
# 3.1.1 在临时前缀安装（uid 1000）
docker exec -u 1000 -e HOME=/data/dsh/home dsh sh -c \
  "npm install -g --prefix /data/dsh/global-dsh/_rc3-prefix --registry=$REG @deepseek-ai/dsh@$NEW"

# 3.1.2 组装 hoisted 树（沿用 rc.2 口径：把扁平安装结果复制为独立整树）
docker exec -u 1000 -e HOME=/data/dsh/home dsh sh -c '
  set -e
  S=/data/dsh/global-dsh/_rc3-standalone
  rm -rf "$S" && mkdir -p "$S"
  cp -a /data/dsh/global-dsh/_rc3-prefix/lib/node_modules/. "$S"/
'

# 3.1.3 属主归一（必须 0）
find $D/global-dsh/_rc3-standalone ! -user 1000 | wc -l
```

### 3.2 硬门禁 A｜解析完整性

```bash
docker exec dsh sh -c 'for f in $(find /data/dsh/global-dsh/_rc3-standalone -maxdepth 4 -path "*@deepseek-ai/dsh*/package.json"); do node -p "require(\"$f\").name+\" \"+require(\"$f\").version"; done | sort -u' > /tmp/rc3-tree.txt
wc -l /tmp/rc3-tree.txt
grep -c " $NEW" /tmp/rc3-tree.txt
grep -v " $NEW" /tmp/rc3-tree.txt | head
```

**通过标准**：`@deepseek-ai/dsh*` 条目数 79（rc.2 为 78，+1 为新包 `dsh-client-ui-entry-customization`）；全部版本为 `0.2.1-rc.3`；排除行仅允许非 dsh 的 cordis 族 / schemastery 等，且版本为 `4.0.5 / 1.0.5 / 1.0.10 / 1.0.6 / 1.1.7 / 3.18.5`。

### 3.3 硬门禁 B｜新树 CLI

```bash
docker run --rm --entrypoint /usr/local/bin/dsh \
  -v "$D/global-dsh/_rc3-standalone:/usr/local/lib/node_modules/@deepseek-ai/dsh" \
  1panel/deepseek-harness:0.2.0-rc.2 --version
```
**通过标准**：输出 `0.2.1-rc.3`。不通过则中止，不进入 3.4。

### 3.4 影子容器（技术灰度）

```bash
# 复制 profile（避免污染生产）
cp -a $D/profiles/web $D/profiles/web-canary

docker run -d --name dsh-rc3-canary \
  --network 1panel-network \
  -e DSH_HOME=/data/dsh -e HOME=/data/dsh/home \
  -p 3090:3080 \
  -v $D:/data/dsh \
  -v $D/workspace:/workspace \
  -v $D/global-dsh/_rc3-standalone:/usr/local/lib/node_modules/@deepseek-ai/dsh \
  --entrypoint /usr/local/bin/dsh \
  1panel/deepseek-harness:0.2.0-rc.2 \
  web --profile web --port 3080
```

> 影子实例读的是复制后的 `web-canary` profile 副本；若 CLI 参数与 entrypoint 行为不一致，改用与生产相同的 entrypoint 但覆盖 `DSH_PROFILE`。**首次执行需按实际调整并在本文回填实际命令。**

### 3.5 影子实例验收

```bash
docker logs dsh-rc3-canary 2>&1 | grep -cE "did not activate|duplicate id|is incompatible with dsh|disabling profile plugin row"
docker exec dsh-rc3-canary wget -qO- http://127.0.0.1:3080/ -S 2>&1 | head -3
```

人工截图三处（**R1 唯一可判定方式**）：

| 区域 | 检查 |
| --- | --- |
| 左导航面板 | 「更多」按钮是否出现；是否挤压 6 个自有入口（projects / assistant / library / drive / workbench / probe） |
| 会话头部 | 新增「更多」是否与 projects 的 header actions 冲突 |
| 右栏起始页（guide） | 新增 actions 是否遮挡 library / drive / office 页签 |

**决策点**：若不接受官方入口出现，在 profile 补丁层对 `entry-customization` 置 `disabled: true`，重跑 3.5。

### 3.6 清理影子实例

```bash
docker rm -f dsh-rc3-canary
rm -rf $D/profiles/web-canary
```

**出口条件**：门禁 A/B 通过；影子实例 `healthy`；日志异常行 0；三处截图已归档且结论明确。

---

## 阶段 4｜正式上线

### 4.1 备份（**先备份再动手**）

```bash
mkdir -p /home/luoji/dsh-backup-rc3-$TS
docker exec dsh sh -c "cd /data/dsh && tar czf /data/dsh/tmp/rc3-backup-$TS.tgz \
  profiles/web/package.json profiles/web/pnpm-workspace.yaml \
  profiles/web/compatibility.json profiles/web/cordis.patch.yml profiles/web/pnpm-lock.yaml"
cp $D/profiles/web/pnpm-lock.yaml /home/luoji/dsh-backup-rc3-$TS/
cp $D/tmp/rc3-backup-$TS.tgz /home/luoji/dsh-backup-rc3-$TS/

# profile 配置三件套带时间戳副本（留在原地，便于快速回滚）
cd $D/profiles/web
for f in package.json pnpm-workspace.yaml compatibility.json; do cp -p $f $f.bak.rc3.$TS; done
# 旧依赖目录副本（硬链接多，cp -a 很快）
cp -a node_modules node_modules.pre-rc3.$TS
```

### 4.2 profile 升位与重装

```bash
# 4.2.1 落盘（把阶段 1 的 deploy/profile 内容同步到线上）
#   方式：把改好的 package.json / pnpm-workspace.yaml 传入 $D/profiles/web/
#   注意 docker cp 不可用，走宿主目录写入（$D 可写，属主 1000）

# 4.2.2 重装依赖（uid 1000，npmmirror，绕过 minimumReleaseAge）
docker exec -u 1000 -e HOME=/data/dsh/home dsh sh -c \
  "cd /data/dsh/profiles/web && npx --yes --registry=$REG pnpm@11.7.0 install \
   --registry=$REG --config.minimumReleaseAge=0 --ignore-scripts"

# 4.2.3 校验
docker exec dsh sh -c 'cd /data/dsh/profiles/web && node -p "require(\"./package.json\").dependencies"'
docker exec dsh sh -c 'ls /data/dsh/profiles/web/node_modules/@deepseek-ai/ | wc -l'
```

**通过标准**：顶层 `@deepseek-ai/dsh*` 全部 `0.2.1-rc.3`；13 个第三方插件与 14 个 workdsh 包仍在位且版本与声明一致；`node_modules` 内非 1000 属主条目为 0。

### 4.3 原子换树

```bash
cd $D/global-dsh
mv standalone standalone.rc3old.$TS
mv _rc3-standalone standalone
sudo -S docker compose -f $A/docker-compose.yml up -d --force-recreate deepseek-harness <<< '******'
```

> 换树后宿主的 bind mount 按路径重新解析；`--force-recreate` 必需。

### 4.4 派生补丁重放（**顺序不可颠倒**）

```bash
# ① 1Panel auth-proxy（双目标：standalone 树 + profile）
node deploy/ops/derived/ensure-rc2-auth-proxy.mjs --root $D/global-dsh/standalone
node deploy/ops/derived/ensure-rc2-auth-proxy.mjs --root $D/profiles/web
grep -c ONEPANEL_DSH_AUTH_PROXY $D/global-dsh/standalone/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js   # 期望 1
grep -c ONEPANEL_DSH_AUTH_PROXY $D/profiles/web/node_modules/@deepseek-ai/dsh-client-connection/lib/index.js             # 期望 1

# ② profile 热重载补丁
bash deploy/tools/workdsh-fix-profile-reload.sh

# ③ webRuntime 路由补丁
bash deploy/tools/workdsh-fix-webruntime-routes.sh
tail -20 /data/dsh/tmp/webruntime-fix.log

# ④ 兼容扫描
node deploy/tools/workdsh-compat-scan.mjs --profile $D/profiles/web
```

> 若 ① 报「锚点匹配 0 或 >1 次」，脚本会 exit 1 且**不改文件**——说明 rc.3 改了 `isAuthenticated` 签名，此时**立即回滚**，不要手动硬改。当前证据显示 `dsh-client-connection` 在 rc.3 零改动，预期锚点仍唯一。

### 4.5 第三方兼容豁免

```bash
# 先看闸门日志确认哪些被跳过
docker logs dsh 2>&1 | grep -E "skipping profile bundle|is incompatible with dsh" | head -20

# 逐个豁免（示例）
docker exec -u 1000 -e HOME=/data/dsh/home dsh \
  dsh plugin --profile web allow-version @nanmicoder/dsh-agent-teams@0.1.23 \
  --dsh-version $NEW --accept-risk
```

**通过标准**：`compatibility.json` 中该条为 `["0.2.1-rc.2","0.2.1-rc.3"]`（保留旧值以便回滚）；启动日志上述两类行数为 0。

---

## 阶段 5｜上线后验证（Gate A–H）

| Gate | 命令 | 通过标准 |
| --- | --- | --- |
| **A** 解析 | `grep -c " $NEW" /tmp/rc3-tree.txt` 重跑于生产树 | 79 条 dsh 包全部 `0.2.1-rc.3`；cordis 族不变 |
| **B** CLI | `docker exec dsh dsh --version` | `0.2.1-rc.3` |
| **C** 三处一致 | CLI + 挂载树 `package.json` + profile `dsh-base` | 全部 `0.2.1-rc.3` |
| **D** 装配 | `docker logs dsh 2>&1 \| grep -cE "duplicate id\|is incompatible with dsh\|disabling profile plugin row\|did not activate"` | `0`；27 个 bundle 全在位 |
| **E** 补丁 | 双份 `marker=1`；`workdsh-fix-profile-reload.sh` 输出已补丁；`workdsh-compat-scan --profile` exit 0 | 全通过 |
| **F** 数据 | sessions / storages 文件数 | 与阶段 0 的 S0 / T0 **完全相等**��另抽 3 个会话可打开 |
| **G** 功能 | 见下 | 全通过 |
| **H** 性能 | `docker ps` / `docker inspect -f '{{.RestartCount}}'` | `healthy`、`RestartCount=0`、首屏耗时 ≤ 基线 ×1.1 |

**Gate G 功能清单**

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" https://dsh.10ge.cn/
docker exec dsh curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3080/
```
- 门户登录成功（浏览器实测）
- 左导航 6 个自有入口（projects / assistant / library / drive / workbench / probe）可见可点
- 新建会话 → 发送一条消息 → 收到回复
- 切换专家（预设）→ 结果提示语义正确（对应 B1 三态）
- 专家 / 项目 / 技能 / 连接器 / 资料库 / 自动化页面无 error 对象
- 右栏页签（library / drive / office）正常

**观察节奏**：立即（A–H）→ 15 分钟（健康、日志 error 增量）→ 2 小时（真实业务路径）→ 24 小时（决策保留或回滚）。

---

## 执行记录｜2026-10-25

> 线上 `0.2.1-rc.2 → 0.2.1-rc.3` 实际执行后的回填。未实测项一律标「未执行 / 未复跑」，不以页面可用推定通过。

### 一、Gate 结果

| Gate | 结果 | 证据 / 说明 |
| --- | --- | --- |
| **A** 解析 | **通过**（2026-10-25 08:2x CST 复跑） | profile `@deepseek-ai` 下 245 个含 `package.json` 的目录中 **237 个为 `0.2.1-rc.3`**；8 个非 rc.3 全部为第三方依赖（`cordis-plugin-loader@1.0.6`、`cordis-plugin-timer@1.1.7`、`cosmokit@1.8.6`、`libreoffice-kit@0.1.5`、`libreoffice-kit-wasm@0.1.5`、`node-addon-system@0.1.2`、`node-addon-system-linux-x64@0.1.2`、`schemastery@3.18.5`），无版本错配 |
| **B** CLI | **通过** | `docker exec dsh dsh --version` → `0.2.1-rc.3` |
| **C** 三处一致 | **通过** | profile `package.json` 中 `@deepseek-ai/dsh-base` / `dsh-schedule` / `dsh-time-context` / `dsh-web-app` 均为 `0.2.1-rc.3`；`dsh.profile.bundles` 27 项在册；与 CLI（B）及挂载树（A）三处一致 |
| **D** 装配 | **通过（修复后）** | 首次启动报 `HARNESS Failed to load plugins web boot: 1 entry did not activate`，明细为 `@deepseek-ai/dsh-client-ui-entry-customization: pending (waiting for service: pluginNavigation)`；按第二节偏离处置后启动无 boot error，应用可渲染、会话可收发 |
| **E** 补丁 | **通过**（2026-10-25 复跑） | 三条派生链路逐一核实：① `ONEPANEL_DSH_AUTH_PROXY` marker 两份副本各 1 处；② `workdshRootIncludeEntry` 兜底在两份 `@deepseek-ai/dsh-app-boot/lib/*.js` 各 2 处；③ `workdsh-fix-webruntime-routes.sh --check` → `OK dsh-dream-skin: 已是补丁状态`（`dsh-mcp-connector` 补丁已随上游 0.2.73 自修退役，无 `.orig`，与仓库脚本一致）；entrypoint 内 `reapply_profile_reload_fix` 出现 3 次（定义 + 两处调用），启动与运行期重启均会重打。功能性证据：`https://dsh.10ge.cn/` → `302 /portal`（0.66s），登录后页面与会话正常 |
| **F** 数据 | **部分通过** | 浏览器抽 3 个历史会话均可打开且无加载错误（云管端方案报价生成 4667 字 / 4 轮 64 步；网盘在线编辑与缺失功能 2034 字 / 14 轮 253 步；通信业务受理材料文档网站设计 5252 字 / 5 轮 283 步）。补测：`/data/dsh/sessions` 目录条目 = 1、`/data/dsh/storages` 条目 = 19；阶段 0 的 S0 / T0 **未留存**（2026-10-17 的 327 / 120317 不适用），**差值未判定** |
| **G** 功能 | **通过（1 项不符合预期）** | 逐项见下 |
| **H** 性能 | **部分通过** | 服务端：`Health=healthy`、`RestartCount=0`、`StartedAt=2026-10-24T23:28:53Z`、内部 `https://127.0.0.1:3080/` = 200（ttfb 0.0036s）、唯一实例（3080）；公网 `https://dsh.10ge.cn/` = 302（ttfb 1.494s，门户门禁既定行为）。首屏 ttfb 335ms / DCL 381ms / load 708ms / FCP 400ms，但阶段 0 基线未采集，`≤ 基线 × 1.1` **未判定** |

### 二、Gate G 逐项

| 检查项 | 结果 | 证据 |
| --- | --- | --- |
| 门户 200 / 302 | 通过 | 本地 `curl` → `302 https://dsh.10ge.cn/portal`，`time=0.663894s`（与门户门禁既定行为一致） |
| 门户登录（浏览器实测） | 通过 | 已登录态，应用 shell 正常渲染 |
| 左导航自有入口 | 通过 | 9 个入口可见可点（projects / assistant / library / drive / automation / skills / workbench / probe 等） |
| 新建会话 → 发送 → 回复 | 通过 | 注入「只回复两个字：收到」→ 助手回复「收到」，已完成用时 4 秒、1 轮 1 步、62K tok、¥0.064787 |
| 切换专家（预设）→ 语义正确 | 通过 | 「查看专家 高级全栈交付工程师」详情显示「我的专家 · 专家 · 已启用」+ 就绪度「可用」+「配备技能与能力 · 3」；点「召唤专家」进入新会话，会话头为专家名且输入框为空（不自动发送）→ 语义正确；发送「只回复四个字：专家已就绪」→ 回复「专家已就绪」（5 秒 / 64.5K tok / ¥0.0696276），预设实际生效 |
| 专家 / 项目 / 技能 / 连接器 / 资料库 / 自动化页面无 error 对象 | 通过 | 逐视图抓 `innerText` 并正则 `/加载失败\|出错了\|无法加载\|请求失败\|未找到\|Error\|错误/`，全部无命中；技能页「共 54 个已安装技能」，专家页 22 个我的 / 18 个目录且均为「可用」 |
| 右栏页签 | **部分通过（不符合预期）** | conversation 视图：对话 / 轨迹 / 开始 三个页签均正常（轨迹渲染轮次、系统提示词、上下文、available_skills；新会话出现「开始」= 工作区文件 / 新建终端 / 文档）。**library / drive 视图点「打开侧边栏」只切换左侧会话栏，右栏无 tab** —— 与本项预期不一致；本次 5 个变化包均无右栏 tab 装配改动，用户裁决记为**既有实现差异，暂不动** |

**控制台**：无 `did not activate` / `Failed to load plugins` / `pending (waiting`。残留两类噪声均已定位为非回归：① `[connection] connection lost, retry #6/#7`；② 快速切换视图时的 `net::ERR_ABORTED`（含 `/api/workdsh-skills`、`/api/workdsh-office`）。对 ② 做对照实验：记录累积 48 条 → 重载技能页 10s → 49 条，新增项仅 `ERR_ABORTED ?workdsh-view=skills`，未新增 `Failed to fetch`，技能页仍正常渲染。

**首屏性能采样**（浏览器 `performance`）：ttfb 335ms / DOMContentLoaded 381ms / load 708ms / first-paint 400ms / FCP 400ms / 51 resources。

### 三、线上 profile 偏离（本次新增，必须随升级保留）

`entry-customization` 与既有 `ui-plugin-manager` 一样，用 profile 补丁禁用而非改官方包：

```yaml
# /opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/profiles/web/cordis.patch.yml
- id: entry-customization
  disabled: true
```

- 根因：rc.3 新增的 `dsh-client-ui-entry-customization` 把 `pluginNavigation` 的唯一 provide 点放在 `ctx.slots.inject("main", …)` 内，`main` 槽 owner 未激活时 boot 阶段永久 pending → 整站白屏。
- 备份：`cordis.patch.yml.bak.rc3entry.20261024232846`（同目录）。
- 约束：该禁用块与 `- id: ui-plugin-manager / disabled: true`（2026-09-22 探针）**必须成对存在**；只还原其一仍会白屏。
- 影响：官方「更多 / 创建插件」入口不出现，即本次升级未采用该新能力（对应分析报告 R1 的处置选择）。

### 四、补测过程（2026-10-25 08:2x CST，LAN 恢复后）

首次回填时本机 en0 = `192.168.1.38`（离开 `192.168.11.0/24`），SSH `Operation timed out`、`PING 100% packet loss`，Gate A/B/C/E/F 计数项、Gate H 与观察窗口因此未执行。

```text
（首次回填记录，已失效）
ssh: connect to host 192.168.11.205 port 22: Operation timed out
PING 192.168.11.205 → 100.0% packet loss
本机 en0 = 192.168.1.38，默认网关 192.168.1.1
```

本机回到 `192.168.11.0/24`（en0 = `192.168.11.243`）后复测：`ping 192.168.11.205` 2/2 包 0% 丢包，SSH 可用。据此一次性补齐 A / B / C / E / H 与 F 计数，结果见第一节表格。**仍未执行**：阶段 0 的 S0 / T0 基线（当时未留存，无法回溯采集，故 F、H 的比值项不判定）。

### 五、白屏报错复发核查（2026-10-25）

用户在升级后再次贴出与首启相同的报错：

```text
Failed to load plugins
web boot: 1 entry did not activate
@deepseek-ai/dsh-client-ui-entry-customization: pending (waiting for service: pluginNavigation)
```

三处独立核查均显示**当前启动无此错误**，判定为修复前启动或未刷新标签页的陈旧客户端：

| 核查点 | 结果 |
| --- | --- |
| 浏览器冷加载（新标签、`?__fresh=20261025a` / `b` 两次） | 页面正常渲染（body 文本 5112 字，含历史会话「通信业务受理材料文档网站设计」），`hasFail=false` |
| 浏览器控制台 | `did not activate` / `Failed to load plugins` / `entry-customization` / `pluginNavigation` 命中 **0** |
| `docker logs dsh` | 同四词 grep **0 命中**；`grep -c "did not activate"` = 0 |
| 容器状态 | `RestartCount=0`、`StartedAt=2026-10-24T23:28:53Z`（修复后未再重启）、`healthy` |
| profile 补丁 | `- id: entry-customization / disabled: true` 与 `- id: ui-plugin-manager / disabled: true` 成对完好，备份 `cordis.patch.yml.bak.rc3entry.20261024232846` 在册 |
| 实例唯一性 | 仅 1 个 dsh 实例（3080），本机无 3031 预览进程（`lsof` = NONE），排除「另一实例在报错」 |

处置：无需改动，用户侧硬刷新（Cmd+Shift+R）即可。若后续再现，按第二节偏离处置复核补丁是否被 profile 重放覆盖。

### 六、观察窗口

计时起点 T0 = `2026-10-24T23:28:53Z`（修复后容器 `StartedAt`，CST 10-25 07:28）。

| 节点 | 状态 |
| --- | --- |
| 立即（A–H） | A/B/C/E 通过；D、G 已判定；F、H 为部分通过（基线缺失项不判定） |
| 15 分钟（健康 + error 增量） | **已归档（单点采样）**：T+62min（2026-10-25T00:30Z）→ `healthy`、`RestartCount=0`、日志共 200 行；`ERROR/Error:/error:` **0** 命中、`did not activate|Failed to load plugins` **0**、`Unhandled|FATAL|panic` **0**；`docker stats` CPU 8.87%、内存 1.746GiB/8GiB（21.83%）。因窗口期内未做连续采样，只能证明该时点无异常，不等同于全程连续观测 |
| 2 小时（真实业务路径） | **未到点**（采样时 uptime 62min）。到期需再采一次健康 + 一次真实会话发送（如「只回复两个字：收到」） |
| 24 小时（保留或回滚决策） | **已提前裁决：保留 rc.3**（见第七节；预计到点 `2026-10-25T23:28Z` = CST 10-26 07:28，若届时无异常则维持该决定） |

### 七、保留决策（2026-10-25，用户裁决）

**决策：保留 `0.2.1-rc.3`，不回滚 `0.2.1-rc.2`。**

- 依据：Gate A / B / C / D / E 通过；G 通过（仅 1 项既有实现差异：library / drive 右栏无 tab，判定与本次变化包无关）；F / H 部分通过（阶段 0 基线缺失，差值项不判定，且无任何回归证据）；T0+62min 采样 0 错误、0 重启、内存 21.83%。
- 观察窗口：24 小时节点由用户在到点前裁决为「保留」；2 小时节点的真实会话发送复验未执行（用户未要求），如后续出现会话异常再补。
- **回滚锚点（2026-10-25 经用户「请清理保留的锚点」授权后已删除）**：

| 锚点 | 路径 | 大小 | 处置 |
| --- | --- | --- | --- |
| 旧运行树 | `data/dsh/global-dsh/standalone.rc3old.20261024175710` | 873M | 已删除 |
| 旧 profile 依赖 | `data/dsh/profiles/web/node_modules.pre-rc3.20261025015343` | 1.3G | 已删除 |
| 旧 profile 配置 | `package.json` / `pnpm-workspace.yaml` / `compatibility.json` 的 `.bak.rc3.20261025015343` | 52K | 已删除 |
| profile 补丁（白屏修复前） | `profiles/web/cordis.patch.yml.bak.rc3entry.20261024232846` | 20K | 已删除 |

- **删除前安全核对**：容器挂载仅指向当前 `standalone`（`-> /usr/local/lib/node_modules/@deepseek-ai/dsh`），无一处引用 `standalone.rc3old.*` / `node_modules.pre-rc3.*`；`dsh --version` = `0.2.1-rc.3`、`healthy`、`RestartCount=0`。
- **删除后校验**：6 个目标残留计数 0；当前 `standalone` 与 `profiles/web/node_modules` 仍在；`dsh --version` = `0.2.1-rc.3`、`healthy`、`RestartCount=0`、`StartedAt` 未变（未触发重启）；日志 `ERROR|did not activate|Failed to load plugins|FATAL|panic` **0** 命中；内部 `https://127.0.0.1:3080/` = **200**（ttfb 5.9ms）；磁盘 176G → **174G**（释放约 2.2G）。
- 影响：本地不再持有 rc.2 制品与旧 profile 依赖；**如需回滚，须按 runbook 回滚预案从 npm 重新安装 `0.2.1-rc.2`**（该版本已发布，制品可取），本机不再有一键 `mv` 回退路径。
- 保留未动：`profiles/web` 下更早升级遗留的其它 `cordis.patch.yml.bak.*`（非本次锚点，体积极小）。

---

## 回滚预案

### 触发条件（任一命中即回滚）

- Gate B / C 版本不一致且 10 分钟内无法定位
- Gate D 出现 `did not activate` 且涉及自有插件
- Gate E 任一补丁锚点不匹配
- Gate F 数据计数变化
- Gate G 登录失败 / 主页 5xx / 会话无法发送
- 容器进入 restart 循环或超 `start_period` 仍 `starting`

### 回滚命令（约 3 分钟）

> **前提变更（2026-10-25）**：本地回滚锚点已按用户要求清理（见第七节），下述 `mv …rc3old…` / `node_modules.pre-rc3…` 路径**已不存在**。现在回滚只能从 npm 重新安装 `0.2.1-rc.2`：先按阶段 4 的 profile 升位流程把 `package.json` / `pnpm-workspace.yaml` / `compatibility.json` 改回 rc.2 并重装依赖，再把 `global-dsh/standalone` 换成 rc.2 制品树，最后重建容器。以下为原始（锚点尚在时）命令，仅作流程参照：

```bash
cd $D/global-dsh
mv standalone standalone.rc3failed.$TS
mv standalone.rc3old.$TS standalone

cd $D/profiles/web
rm -rf node_modules
mv node_modules.pre-rc3.$TS node_modules
for f in package.json pnpm-workspace.yaml compatibility.json; do mv $f.bak.rc3.$TS $f; done

sudo -S docker compose -f $A/docker-compose.yml up -d --force-recreate deepseek-harness <<< '******'
```

### 回滚后验证

- `docker exec dsh dsh --version` = `0.2.1-rc.2`
- 三处版本一致；`healthy`；`RestartCount=0`
- sessions / storages 计数与回滚前一致
- 双份 auth-proxy `marker=1`
- 登录与主页面正常

> **本版本无数据格式变更**，回滚不需要恢复数据。若今后版本引入迁移，回滚方案必须先加「数据快照」前置步骤。

---

## 附录 A｜常见失败与处置

| 症状 | 原因 | 处置 |
| --- | --- | --- |
| `ERR_PNPM_EACCES` / `rename … _tmp_` | 曾以 root 跑过 pnpm，属主被污染 | `find $D ! -user 1000 -exec chown -h 1000:1000 {} +`（`data/caddy` 除外，属 1001） |
| `Command was killed with SIGSEGV` | 上游 V8 GC 缺陷（约 35% 概率） | 直接重试，与权限无关 |
| 安装完但进程不退出 | pnpm 卡 `ep_poll` | 重跑带 `--reporter=append-only`，返回 `Already up to date` 即已装完 |
| `minimumReleaseAge` 拒绝 | pnpm 11 新包 24h 窗口 | 命令加 `--config.minimumReleaseAge=0` |
| 容器 `Running` 但仍是旧版 | 普通 `up -d` 不重建 | 必须 `--force-recreate` |
| `did not activate` | 插件域 schema / 服务缺口 | 先查 `docker logs` 明细，再用 `workdsh-compat-scan` 定位缺失 inject 服务 |
| 门户 401 / 302 循环 | auth-proxy 补丁未生效 | 检查双份 `marker=1`；缺一份都会表现为登录后回跳门户 |

## 附录 B｜未实测项声明

以下步骤**沿用 rc.2 的历史口径推导，本次未实跑**，首次执行时必须按实际环境调整并回填：

1. 阶段 3.1.2 hoisted 树组装的确切命令
2. 阶段 3.4 影子容器的启动参数（`--entrypoint` 与 profile 选择）
3. 阶段 4.2.1 「把改好的 deploy/profile 内容写入线上」的具体传输方式
4. 阶段 4.5 `allow-version` 对 13 个第三方插件的逐项结果
5. Gate H 的首屏耗时基线（需阶段 0 补测）

## 附录 C｜采纳建议

| 情形 | 建议 |
| --- | --- |
| 无明确功能诉求，仅「跟随最新」 | **建议暂缓**。线上已等于 `latest`；rc.3 仍在 `next`，且新增官方 UI 入口会改变现有信息架构 |
| 需要「更多菜单 / 创建插件草稿」能力 | 执行本方案，保留回滚锚点，观察 24 小时 |
| 等待稳定版 | 等 rc.3 转 `latest` 或 `0.2.2` 正式版后再一次性升级，可省一轮验证成本 |

---

日期：2026-10-25。本文与 [dsh-0.2.1-rc.3-upgrade](dsh-0.2.1-rc.3-upgrade.md) 配套使用；执行结果须回填本文各阶段记录表与 `docs/STATUS.md`。
