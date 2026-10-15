# dsh.10ge.cn 线上部署代码 ↔ 本地开发代码 一致性审计（2026-10-15）

本文件记录对 `https://dsh.10ge.cn` 的**线上部署代码**与本地仓库 `workdsh` 的**全面比对**，
以及按用户裁决执行的**线上独有代码回填**与提交推送。用户对两处口径的裁决如下：

- **回填范围**：只回填产品源码（portal 扩展、survey、vas、`data/dsh/tools` 下 `workdsh-*` 插件与工具、运维脚本）；排除密钥、账号表、运行数据与业务内容 JSON。
- **提交方式**：分域多个规范提交（portal / survey+vas / tools+运维脚本 / 差异报告）。

---

## 零、结论速览

| 维度 | 线上 | 本地仓库（回填前） | 判定 |
| --- | --- | --- | --- |
| 运行时基线 | CLI / standalone 树 = `0.2.1-alpha.2`（镜像 `1panel/deepseek-harness:0.2.0-rc.2` + 挂载树换版） | 根 `pnpm.overrides` 300 条、dsh 依赖全部 `0.2.1-alpha.2` | **一致** ✅ |
| 制品 / 插件代码 | profile 13 个 workdsh 依赖，版本与仓库吻合 | 同版本 | **一致**（`dist/` 逐字节相同）✅ |
| 门户 portal | 9 个 src 模块 + `admin/` + `handbook/` | 仅 3 个 src 模块，缺约 90% | **仓库严重落后** ❌ → 已回填 |
| 边缘服务 survey / vas | 各自运行中 | 仓库 0 命中 | **仓库缺失** ❌ → 已回填 |
| 部署配置 | `cordis.patch.yml` / profile `package.json` / `compatibility.json` | 无对应真源 | 线上独有（部署面，留服务器） |
| 主机侧部署资产 | `data/dsh/tools`、`/usr/local/bin` 19 脚本、`data/dsh/tmp` 派生器 | 仓库 0 命中 | **仓库缺失** ❌ → 已回填 |
| 仓库领先线上 | — | `modules.json` 中 12 个 planned 模块未部署 | 设计如此（未实现，不部署） |
| Git 远端 | — | `main` = `fork/main`（无未推送提交） | **一致** ✅ |

**核心结论**：仓库并不存在「已改未提交」的代码；「提交并同步最新完整代码」的实际内容 =
**把只存在于服务器上的代码回填入库**。回填后仓库新增 **168 个文件 / +42240 行**，
线上已运行的产品源码与仓库已对齐（除下节「未回填项」明列者）。

---

## 一、比对方法与口径

- **线上侧**：`luoji@192.168.11.205`，应用目录 `A=/opt/1panel/apps/deepseek-harness/deepseek-harness`。逐项只读采集：`docker compose` 配置、容器内 `node -v`/CLI 版本、profile `package.json` 与 `cordis.patch.yml`、`data/dsh/{portal,survey,vas,tools,tmp}` 文件树、`/usr/local/bin` 脚本、`data/workspace/wd-upload-*` 制品。
- **本地侧**：仓库工作区、`packages/*`、`docs/modules.json`、根 `package.json`/`pnpm-lock.yaml`、`.artifacts/` 制品。
- **制品比对**：把线上 `wd-upload-*` 内 `.tgz` 与本地构建产物解包后 `diff -r`（排除 `node_modules`/`src`/`tests`/`tsconfig`）。
- **可比性说明**：线上是「挂载树 + file: 依赖」的部署形态，与仓库源码并非同一层次；因此逐维度分开判定，不以文件树差异直接判为「代码不同步」。

---

## 二、逐维度比对结果

### 2.1 运行时基线与依赖版本 —— 一致

- 线上 CLI 与 standalone 树为 `0.2.1-alpha.2`；1Panel 渠道无 alpha 镜像 tag，沿用 `0.2.0-rc.2` 镜像 + 挂载树替换（与升级证据一致）。
- 根 `package.json` 的 `pnpm.overrides` **300 条**均为 `0.2.1-alpha.2`（`cordis` `4.0.5-alpha.1`、`schemastery` `3.18.5-alpha.1`）；各包残留 `0.2.0-rc.2` **0 处**。
- 例外（非 dsh）保留原样：`cordis-plugin-loader@1.0.5`、`cordis-plugin-timer@1.1.6`、`node-addon-system@0.1.2`；`cordis@4.0.4`（含 peer `^4.0.4`）与 `schemastery@3.18.4` 为受 peer 约束的既有值。

### 2.2 制品与插件代码 —— 逐字节一致

- 线上 profile 登记 **28 个 bundle**（含 `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app`、`workdsh-bundle` 与 12 个 `workdsh-plugin-*`/`workdsh-provider-*`、以及 `dshmarket`/`dsh-mcp-connector`/`@nanmicoder/dsh-agent-teams`/`dsh-dream-skin` 等第三方）。
- workdsh 依赖共 **13 条**，版本与仓库 `packages/plugins/*`、`packages/providers/identity-local` 全部吻合。例：`workdsh-plugin-drive → wd-upload-022/…-alpha.2.tgz`（sha256 `a4355493…d2765`，与本地一致）。
- 把线上 `.tgz` 解包与本地构建产物比对：`drive`/`experts`/`skills`/`library`/`bundle` 的 **`dist/` 全部逐字节相同**；`package.json` 唯一差异是 **pnpm pack 归一化**（`workspace:*` → 版本号、字段顺序、`scripts` 外移、补 `LICENSE`），**无功能差异**。

### 2.3 门户 portal —— 仓库严重落后（本次最大差异）

线上 `data/dsh/portal` 与仓库 `packages/portal` 相比：

| 项 | 线上 | 仓库（回填前） |
| --- | --- | --- |
| `src/` 模块 | 9 个（+`handbook`/`users`/`roles`/`identity-bridge`/`login-info`/`session-key`） | 3 个 |
| `src/server.mjs` | 43937B | 差 **727 行** |
| `src/config.mjs` | 9004B | 差 **228 行** |
| `src/session.mjs` | 6198B | 差 4 行（多 `/portal/admin` 回跳白名单） |
| `admin/` | 产品页管理服务（后端 + 静态后台 + 渲染工具） | 无 |
| `handbook/` | 手册阅读器/管理端静态站 + 数据 | 无 |
| `site/` | 含 `register.html` 与 13 个产品页 | 缺 |
| `tests/` | `grants` / `integration` / `roles` | 2 个已过时用例 |

全盘检索 `handbook.mjs`/`roles.mjs`/`identity-bridge.mjs`/`reader-boot.js`/`run-admin.sh` 在仓库 **0 命中** ⇒ 这些代码只存在于服务器。另注：线上 `README.md`（28912B）**比**仓库 `README.md`（37674B）**更旧**（缺 2026-09-25 失败自愈、§2.1 边缘协议升级、基线仍写 `0.1.6-alpha.2`），故 **保留仓库 README**，仅更新其「目录」表。

### 2.4 边缘服务 survey / vas —— 仓库缺失

- **survey**（问卷，`127.0.0.1:3082`，容器内 Caddy `route /survey` 反代）：源码树在 `data/dsh/home/dsh/survey`（含 `deploy/`、`host-gateway/`），运行副本在 `data/dsh/survey`（含 `finish.sh`）。仓库 0 命中。
- **vas**（增值业务产品页后台，`127.0.0.1:3085`，复用门户会话）：`data/dsh/vas`，仓库 0 命中。
- 二者**均不在** Harness bundle 列表中 ⇒ 是**部署边缘面**，不是功能插件（与 portal 同类）。

### 2.5 部署配置 —— 线上独有（属部署面）

- profile `cordis.patch.yml`（19118B）：`computer-use`/`computer-use-cua-driver-native` `disabled: true`（镜像缺 `libX11.so.6`）、`ui-plugin-manager` `disabled: true`、`insert: time-context` 与 `workdsh-remote-shell`、`ui-settings-general` 的 `welcomeNoticeVersion`、`llm-pi-ai` 的 `jhpt` provider 与大量模型 ID。
- profile `package.json` 的 `dsh.profile.bundles`（28 项）与 13 条 workdsh `file:` 依赖、`compatibility.json`（1 条豁免）、`cordis.yml`。
- 结论：这些是**线上部署态配置**，仓库无对应真源；本次**不**将其作为「产品源码」入库（属另一类问题，见第六节）。

### 2.6 主机侧部署资产 —— 仓库缺失

- `data/dsh/tools/`（166M）：7 个站点自建 `workdsh-*` Harness 插件（**仅 `dist/`，无 TS 源码**）、`workdsh-access-lab` 授权沙箱、备份/兼容扫描/路由修复脚本、第三方 web runtime 补丁。
  - 其中 `workdsh-plugin-schedule`（左侧「定时任务」入口）与仓库 `packages/plugins/automations`（`workdsh-plugin-automations`，`modules.json` 标 `in_progress`）**不是同一制品**：仓库的 automations **尚未部署**，线上用的是本地构建的 `workdsh-plugin-schedule`。
- `/usr/local/bin/`：19 个 dsh 相关主机脚本（看护、崩溃、告警、SSE、隧道等）。
- `data/dsh/tmp/`：18 个**幂等派生器**（从官方镜像原文派生 Caddyfile / `docker-entrypoint.sh` 补丁：门户、问卷、增值后台、SSE keepalive、端口守卫、远端兜底等）。

### 2.7 仓库领先线上的部分（设计如此）

`docs/modules.json` 中 **12 个 `planned` 模块未部署**：`plugins/{applications,identity,model-policy,usage,admin,tables,pages}`、`providers/{identity-oidc,library-team,runtime-isolated}`、`examples/{provider-education,mcp-business-service}`。规划中即创建目录、保留 README 与验收条件，**不算差异**。

### 2.8 Git 远端状态 —— 一致

- `main` = `fork/main` = `f9fa84f5bf`，ahead/behind **0/0**；`git push --tags --dry-run fork` = `Everything up-to-date`。
- ⇒ 仓库**不存在未推送提交**；本次推送的只是回填产生的 3 个新提交。

---

## 三、回填执行（本次做了什么）

按用户裁决「业务进 packages/、部署资产进 deploy/」+「产品页全部入库」，分 3 个提交回填：

### 3.1 `235fb6747c feat(portal)` —— 门户扩展

回填到 `packages/portal/`（13 → **53** 文件）：

- `src/`：新增 `handbook`/`users`/`roles`/`identity-bridge`/`login-info`/`session-key`，更新 `config`/`server`/`session`。
- `admin/`、`handbook/site/`、`site/`（含 `register.html` 与 13 个产品页）、`tools/`（+3）。
- `tests/`：新增 `grants`/`roles`/`integration`；**移除** `accounts.test.mjs`（已被 `users.json` 取代、对回填后的 `src` 断言失败）；`grants.test.mjs` 补**沙箱前置**（无 `127.0.0.1:3099` 沙箱时 `SKIP` 并以 0 退出，不再误报为回归）。
- `README.md`：目录表更新为线上实际结构。

### 3.2 `20d6597aba feat(edge)` —— survey + vas

- 新增 `packages/survey/`（13 文件）：`server.mjs`/`index.html`/`admin.html`、`deploy/`（5 个派生器与一键部署）、`host-gateway/`（网关 + systemd 单元）、`finish.sh`、`package.json`。
- 新增 `packages/vas/`（12 文件）：`src/server.mjs`、`public/`、`tools/`（产品页渲染器/浏览器检查/截图/文档导出）、`run-vas.sh`、`README.md`、`package.json`。
- 两者在 `docs/modules.json` 登记为模块（`moduleVersion: 0.1`，`status: in_progress`），并同步 `pnpm-lock.yaml`（各 +1 importer，共 4 行）。

### 3.3 `2764008427 feat(deploy)` —— 主机侧部署资产

回填到顶层 `deploy/`（**89** 文件）：

- `deploy/tools/`：7 个 `workdsh-*` 插件（含 `dist/`）、`access-lab`、脚本、web runtime 补丁。
- `deploy/ops/bin/`：19 个主机脚本。
- `deploy/ops/derived/`：16 个派生器（`survey` 的 2 个已归 `packages/survey/deploy/`，此处不重复）。
- `.gitignore`：豁免 `deploy/tools/**/dist/`（这些插件只交付编译产物；否则回填后仓库只剩 `package.json` 与 `README`）。
- `deploy/README.md`：目录索引与约定。

**合计：168 文件 / +42240 / -443。**

---

## 四、未回填项与理由

按用户口径「排除密钥、账号表、运行数据与业务内容」，以下**有意不入库**：

| 项 | 线上位置 | 理由 |
| --- | --- | --- |
| 凭据与密钥 | `portal/{accounts.json, session.key, identity-bridge.key, portal.env, users.json, login-info.json, ACCOUNTS.md}` | 密钥/凭据，绝不入库 |
| 受访数据与令牌 | `survey/data/{submissions.ndjson, admin-token.txt}`、`restart.log`、`deploy-report.txt`、`finish-report.txt` | 运行数据与报告 |
| 手册运行数据 | `portal/handbook/{draft,published,books,editors}.json`、`history/`、`media/` | 业务内容与媒体 |
| 后台数据/备份/日志 | `portal/admin/{data,backups,orders}`、`*.log*` | 运行数据 |
| 增值业务业务文档 | `vas/docs/`（产品与资费清单、资料库更新稿） | 业务内容 |
| 重复制品 | `vas/site/*.html` | 与 `packages/portal/site/products/` **逐字节相同**，避免双份所有权 |
| 截图与备份 | `vas/shots/`、各处 `*.bak*` | 非源码 |
| 部署态配置 | profile `cordis.patch.yml`、`package.json`、`compatibility.json` | 属部署配置，见第六节 |

脱敏扫描结论：对全部回填内容做高信号模式扫描（私钥、`sk-`/`AKIA`/`ghp_`、JWT、企微/飞书/Slack webhook、`password|token|secret=值`），**未发现真实凭据泄漏**；命中项全部为**测试夹具口令**（`roles`/`integration`/`grants` 用例）、**shell 变量引用**、**README 示例**，以及产品页内的 Demo 口令（`App.DEFAULT_PASSWORD = '1234'`，演示值，随源码保留）。告警 webhook 实测读取外部 `/usr/local/etc/dsh-alerts.conf`（未入库）。

---

## 五、验证

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| JSON 合法性 | `node -e "JSON.parse(...modules.json)"` | OK，34 模块 |
| 计划/脚手架完整性 | `node scripts/check-plan.mjs` | **PASS**（34 模块；50 文档） |
| 门户测试 | `node --test 'tests/*.test.mjs'`（`packages/portal`） | **10 passed / 0 failed**（`grants` 沙箱用例自动 SKIP） |
| 新增模块语法 | `node --check`（survey/vas/tools/host-gateway 全部 `.mjs`） | 全部通过 |
| 入库可见性 | `git check-ignore -v deploy/tools/**/dist/**` | deploy 下 **88 文件全部可入库**、含 10 个 `dist` 文件；`packages/` 下 `**/dist/` 仍忽略 |
| 工作区 | `git status --short` | 干净 |

---

## 六、遗留项与后续建议

1. **部署态配置无仓库真源**（profile `cordis.patch.yml`、28 bundles、`compatibility.json`、`compose` 派生挂载）。这些决定线上实际行为，却只存在于服务器；建议后续单独立项（如在 `deploy/` 下设 `profile/` 真源 + 同步脚本），本次未纳入以免与「产品源码」口径混淆。
2. **`dist/`-only 插件的源码缺口**：`deploy/tools/workdsh-*` 只有编译产物，无法在仓库内重新构建或评审。若这些能力要长期维护，应迁入 `packages/plugins/<domain>` 并补 TS 源码（属新开发，不在本次回填范围）。
3. **`automations` 与 `workdsh-plugin-schedule` 的关系未收敛**：仓库 `packages/plugins/automations`（未部署）与线上 `workdsh-plugin-schedule`（已部署）是两套实现，建议后续二选一。
4. **未验证范围（明确未执行）**：未从仓库重新部署到线上；未在本地启动 `survey`/`vas` 服务；未执行 `grants.test.mjs` 的沙箱链路；7 个 `dist`-only 插件未在本地加载运行。以上均**未执行**，不得据本文件推断其通过。
