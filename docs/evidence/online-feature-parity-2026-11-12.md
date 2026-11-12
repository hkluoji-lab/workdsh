# dsh.10ge.cn 官方功能对齐与缺口补齐（2026-11-12）

本文件记录对 `https://dsh.10ge.cn` 现有站点与 **官方发布线 `workdsh-release 3.0.0-alpha.1`** 的功能覆盖比对，
以及按用户裁决执行的缺失特性补齐。对齐目标为**官方发布线**（复用官方制品，不打包、不写新代码）。

- 官方来源：`https://techflag.github.io/workdsh/zh-CN.html`、`https://github.com/techflag/workdsh.git`、
  host 上就绪的 `workdsh-release/`（`release-manifest.json` + 14 个 tgz + `SHA256SUMS`）。
- 线上来源：`luoji@192.168.11.205`，容器 `dsh`（`1panel/deepseek-harness:0.2.2-rc.1`），profile `web`。

---

## 一、官方标准功能清单

### 1.1 官网声明的功能特性（六项）

| # | 特性 | 官方状态（官网原文） |
| --- | --- | --- |
| 01 | **Office** 文件制作、预览与编辑 | 已接入 |
| 02 | **Skills** 技能创建、导入与管理 | 已接入（ALPHA） |
| 03 | **Experts** 专业角色与工作方法 | 已接入（ALPHA） |
| 04 | **Activity** 运行动态与过程查看 | 已接入 |
| 05 | **Bundle** 工作空间与入口整合 | 已接入 |
| 06 | **Library** 本地资料、检索与对话引用 | 已接入（ALPHA 可用） |

官网对**建设中**模块的明确标注（本次不算缺口，官方尚未接入）：

- **助理（assistant）**：官网标「助理建设中」，"独立助理管理正在建设"。
- **项目（projects）**：官网标「项目建设中」，"项目业务模块尚未接入"。
- **定时任务（schedule/automations）**：官网标「定时任务建设中」，"当前已有侧栏入口，业务调度尚未接入"。

### 1.2 官方发布清单（release-manifest.json，版本真源）

`version: 3.0.0-alpha.1`，`harness: 0.2.2-rc.1`，`packageManager: pnpm@10.34.5`，`runtimeOverrides` 316 条。

**默认安装集（defaultInstallOrder，10 项）**：

```
workdsh-provider-identity-local   workdsh-provider-browser-session
workdsh-plugin-audit              workdsh-plugin-access
workdsh-plugin-skills             workdsh-plugin-experts
workdsh-plugin-connectors         workdsh-plugin-library
workdsh-plugin-workbenches        workdsh-bundle
```

**可选特性（`--with` 显式选择，4 项）**：

| 特性名 | 包 | 版本 | tgz 大小 |
| --- | --- | --- | --- |
| `office` | workdsh-plugin-office | 0.1.0-alpha.10 | 25712648 |
| `projects` | workdsh-plugin-projects | 0.1.0-alpha.4 | 97282 |
| `activity` | workdsh-plugin-activity | 0.1.0-alpha.6 | 16683 |
| `quality-analysis` | workdsh-plugin-quality-analysis | 3.0.0-alpha.57 | 323165 |

安装器约束：仅 `office / projects / activity / quality-analysis` 允许通过 `--with` 选择；
安装顺序 = `defaultInstallOrder.slice(0,-1)` + 所选特性 + `workdsh-bundle`；每包经 SHA-256 校验。

---

## 二、线上现状（补齐前）

| 项 | 值 |
| --- | --- |
| dsh 版本 | `0.2.2-rc.1`（== manifest.harness ✅） |
| 容器健康 | `Restarts=0` / `running` / `healthy` |
| 容器内 3080 | `200`（1Panel 鉴权补丁在位，patch=1） |
| profile 依赖 | 11 个 workdsh 包（bundle + access/audit/connectors/experts/library/skills/workbenches + prompt-optimize + provider-browser-session/identity-local） |
| **已装配默认集** | ✅ 与官方 defaultInstallOrder 一致 |
| **缺失可选特性** | ❌ `office`、`projects`、`activity`、`quality-analysis` 在 node_modules 中 **ABSENT** |

**结论**：线上 = 官方**默认安装集**。缺口即官方 4 个**可选特性**——属"启用官方现成制品"，非"从零建功能"。

---

## 三、缺失项清单与优先级

| 优先级 | 特性 | 官方包 | 判定依据 |
| --- | --- | --- | --- |
| **P0** | office | workdsh-plugin-office 0.1.0-alpha.10 | 官网 01 位特性；文件制作/预览/编辑，核心交付能力 |
| **P0** | projects | workdsh-plugin-projects 0.1.0-alpha.4 | 官网导航一级入口；项目化工作组织 |
| **P1** | activity | workdsh-plugin-activity 0.1.0-alpha.6 | 官网 04 位特性；运行动态与过程查看 |
| **P2** | quality-analysis | workdsh-plugin-quality-analysis 3.0.0-alpha.57 | 质量分析增强，非核心链路 |

用户已裁决范围：**四项全选**（office、projects、activity、quality-analysis）。
不含官网标注"建设中"的 assistant / schedule（官方尚未接入，无对应发布制品）。

---

## 四、执行方式

统一使用官方 `install-workdsh.mjs`（`--with` 显式选择可选特性），**复用官方制品**：

```bash
node /data/dsh/workdsh-release/install-workdsh.mjs \
  --profile web --with office,projects,activity,quality-analysis
```

**已知风险与护栏（见 `dsh-10ge-502-复发与自愈护栏.md`）**：安装器第 178 行 `dsh plugin add`
属 profile 级 pnpm 写入，会把 178 个 `@deepseek-ai/*` 软链还原成实体目录 → 遮蔽 1Panel 鉴权补丁
`ONEPANEL_DSH_AUTH_PROXY` → 3080 匿名 401 → entrypoint 就绪探针失败 → 崩溃循环 → 公网 502。

**每轮安装后必须立即**：① 跑 `dsh-module-guard.sh` 重统一软链（guard 仅在容器内路径生效，须 base64 喂入容器执行）；
② `docker compose restart`；③ 核验 `Restarts=0 / healthy / 3080=200 / shadow=0 / patch=1`。

---

## 五、执行记录（2026-11-12 完成）

四项可选特性由官方安装器**一次原子安装**（`--with office,projects,activity,quality-analysis`），
故 g3–g6 合并为「一次安装 + 逐项核验」。实测结果：

| 项 | 结果 |
| --- | --- |
| profile bundles | **31**（原 27 + 4 新特性） |
| 特性包落盘 | `workdsh-plugin-office 0.1.0-alpha.10`、`projects 0.1.0-alpha.4`、`activity 0.1.0-alpha.6`、`quality-analysis 3.0.0-alpha.57` 全部 PRESENT |
| 客户端 bundle | 首页 client manifest 含 `workdsh-plugin-office/client.js`、`projects/client.js`、`quality-analysis/client.js`（activity 当时为官方 `cordis.patch.yml` 出厂 `disabled: true`，**已于 2026-11-13 启用，见下节**） |
| 模块图 | `links=330 realdirs=6`（已重统一；profile-only 包保持实体目录） |
| 守卫探针 | `shadow=0 patch=1 http=200` |
| 容器 | `Restarts=0` / `healthy` / 3080=`200` / 公网=`302→/portal→200` |
| runtimeOverrides | `cordis 4.1.0`、`schemastery 3.19.0`、`cordis-plugin-group/loader 1.1.0`、`cordis-plugin-timer 1.2.0`、`cordis-plugin-include 1.1.0`、`libreoffice-kit 0.1.5` 全部按钉扎解析 ✅ |
| watchdog | `/etc/cron.d/dsh-module-guard-watch` 已恢复（`*/5 * * * *`） |

### 关键处置与坑位

1. **pnpm store 所有权**：store `/data/dsh/.pnpm-store` 为 root-owned，而 `dsh plugin` 内部 pnpm 以 uid 1000 运行 → `EACCES`。
   修复：`chown -R 1000:1000`。
2. **nodeLinker: hoisted × 只读镜像**：guard 软链指向只读镜像，hoisted 链接需往包内嵌套写 `node_modules` →
   `EROFS Read-only file system`。修复：先把软链**反统一**为实体可写副本（`symlinks_left=0, realdirs=337`）再安装。
3. **corepack HOME**：`docker exec` 默认 `HOME=/root`（只读根）→ `ENOENT mkdir '/root/.cache/node/corepack/v1'`。
   修复：`docker exec -e HOME=/data/dsh/home`。
4. **git 依赖阻塞**：`dsh-prompt-market => github:yi-yezhiqiu/...#ae2428f0a9...` 需 `git fetch`，
   容器无 github host key → `Host key verification failed`。安装器尾部步骤未能完成。
5. **补跑缺失的尾部步骤**：安装器最后一行 `retainWorkbenchArchives()` 因上述失败未执行，导致
   `workdsh-plugin-quality-analysis`（唯一声明 `workbenchId: workdsh.quality-analysis` 的包）启动报
   `workbench/installation-archive-unavailable`。修复：在容器内单独调用官方
   `retain-workbench-archives.mjs`，生成 `profiles/web/workdsh-bootstrap-archives/index.json` + 归档 tgz，
   重启后该错误消失。

### 浏览器真机验收（独立 browser-agent）

访问 `https://dsh.10ge.cn/` → `302 /portal` → 应用外壳完整渲染：
标题 `DeepSeek Harness`，欢迎语「探索未至之境」，工作区 `szluoji`，输入区含 `/` 指令、`@` 文件、
「召唤专家」「连接器」「资料库」「提示词导入」「优化输入」「选择模型 deepseek-v4.1-flash」「语音输入」等；
左侧主导航含 插件 / 自动化任务 / **项目** / 专家·技能·连接器 / **工作台** / 资料库 / 更多。
控制台 **无 error/warning**；71 条网络请求均成功（仅 `/@vite/client` 为生产构建下预期 404，良性）。
**PASS**：无 502、无白屏、无崩溃。

### 未执行 / 边界

- 未登录进业务面板逐特性点测（无凭据）。四特性「已注册 + 客户端 bundle 已下发 + 无启动错误」已证实；
  登录后的逐页功能点测**未执行**。
- `activity` 出厂为官方 `disabled: true`（上游注释「Native Conversation owns work-process presentation in
  DSH 0.1.7」），本轮**已于 2026-11-13 通过 profile 补丁层反向覆盖启用**，见下节。
- git 依赖 `dsh-prompt-market` 仍未拉取（不影响现有已装版本运行，该包此前已存在于 node_modules）。

---

## 六、activity 模块启用（2026-11-13）

用户指令「先帮我解决 activity 模块的启用问题」。承接上节遗留项。

**停用根因**：官方制品 `workdsh-plugin-activity@0.1.0-alpha.6` 的 bundle 层 `cordis.patch.yml` 出厂即：

```yaml
# Native Conversation owns work-process presentation in DSH 0.1.7.
- insert:
    - id: workdsh-activity
      name: workdsh-plugin-activity
      disabled: true
```

`CHANGELOG` alpha.5 记录：「默认停用重复工作过程界面，交由原生 Conversation/Team 展示；保留轻量身份兼容服务」。
即**停用是官方设计取舍，非安装故障**。

**启用方式**：在 live `profiles/web/cordis.patch.yml` 末尾追加（profile 补丁层在所有 bundle 层之后应用，
对同一 id 可反向覆盖；同类先例为本文件既有的 `- id: workdsh-browser-session / disabled: false`）：

```yaml
- id: workdsh-activity
  disabled: false
```

编辑前备份 `cordis.patch.yml.bak.activity.<ts>`。仓库快照 `deploy/profile/cordis.patch.yml` 已同步追加同一条。

**核验结果**：

| 项 | 结果 |
| --- | --- |
| YAML 解析 | 容器内 `yaml.parse` → `parse OK`；`activity entries=[{id:"workdsh-activity",disabled:false}]` |
| 容器 | `Restarts=0` / `running` / `healthy` / 3080=`200` / 公网=`302` |
| client manifest | workdsh 条目 8 → **9**，新增 `workdsh-plugin-activity/client.js` |
| bundle 下发 | `GET /plugins/…workdsh-plugin-activity/client.js` → `200`，2806 B，`window.__ModuleLoader__.load({id:"workdsh-plugin-activity"…})` |
| 启动日志 | 2 条 `did not activate` 仍为既有无关项（缺 libX11 / 缺 Electron）；**activity 不在其中** |
| 真机浏览器 | `https://dsh.10ge.cn/` 进入应用外壳，无 502/白屏 |

**边界（关键）**：alpha.6 的客户端半侧按官方设计为 **registry 桩**——`dist/client.browser.js` 仅 2726 B，
唯一副作用是 `ctx.provide('activityPresentation', createPresentationRegistry())`；`slots.inject` /
`createElement` / `useEffect` 在文件内命中数均为 **0**，即**不含任何活动/过程 UI**。
用官方 tarball 交叉验证：`workdsh-plugin-activity-0.1.0-alpha.6.tgz` 内同文件 sha256 = 安装件 sha256
= `a4ab8ef9e3aec25e961868e39581a6d158d99486c7911bf5412dc30e49dd74e1`，**桩即官方制品本身**。
其服务消费方：`workdsh-plugin-experts`（`registerIdentity`）、`workdsh-plugin-skills`（`registerSkillLabels`）。
仓库源码 `packages/plugins/activity`（α.5）的 dist 才含完整 UI（`client.browser.js` 21370 B、`wd-activity` 38 处），
但该版本**未发布为线上制品**。

**若要可见的活动/团队过程界面**：需以仓库源码重新构建并产出 ≥ α.6 的新制品（涉版本推进与打包，属需授权动作）。
仅翻转 `disabled: false` 的作用是**使 `activityPresentation` 服务可被消费**（experts / skills 的注入由惰性转为生效），
**不产生新的可见面板**。

---

## 七、activity 完整 UI 制品重建（0.1.0-alpha.7，2026-11-13）

用户裁决：选「第二条路线」——**用仓库源码重新构建并产出含完整 UI 的新制品，替换官方桩**。
本轮只动 activity 一个模块，其余三特性（office / projects / quality-analysis）保持第六节状态不变。

### 7.1 版本重定

- 仓库源码 `packages/plugins/activity` 原为 `0.1.0-alpha.5`；官方发行桩占用 `0.1.0-alpha.6`。
- 按本项目「**撞号必须重新定版**」规则，本批递增为 **`0.1.0-alpha.7`**（跳过官方占用的 α.6），不覆盖官方制品号。
- 制品形态对齐官方：`exports` 增补 `./package.json` 与 `./locale/*.json`；`files` 增补 `locale/*.json`；
  新增 `locale/zh.json`、`locale/en.json`（`meta.description`）；`description` 对齐官方
  「Shows session activity and agent collaboration status.」。

### 7.2 兼容性与构建证据

| 项 | 结果 |
| --- | --- |
| 基线 | `@deepseek-ai/dsh@0.2.2-rc.1`（== `release-manifest.json` harness） |
| `typecheck` | `corepack pnpm --filter workdsh-plugin-activity typecheck` **通过**（`tsconfig` 未改） |
| 运行时依赖面 | 客户端 bundle 内 `require` 面**仅 `react`**；`dsh-client-ui-slots` / `dsh-client-store` / `dsh-client-ui-conversation` 等 peer 均为 `import type`，构建后消失 |
| 槽位 key | `conversation.session.header.utilities` 在官方 `@deepseek-ai/dsh-client-ui-conversation@0.2.2-rc.1` 实测命中 4 处 |
| `build` | `tsc -p tsconfig.json && node scripts/build-activity.mjs` **通过** |
| `tests` | **14/14 通过** |
| 产物 | `dist/client.browser.js` = **21,370 B**，含 `wd-activity` ×38 |

### 7.3 内容寻址投递（外科式替换，规避 502 根因）

**未执行 profile 级 `pnpm install`**（`dsh plugin add` 第 178 行会把 178 个 `@deepseek-ai/*` 软链还原为实体目录
→ 遮蔽 1Panel 鉴权补丁 → 3080 匿名 401 → 崩溃循环 → 公网 502），因此本轮**不触发**该根因，
也不触发已知的 `dsh-prompt-market => github:…#ae2428f0a9…` git-fetch 失败（容器无 github host key）。

执行序列：

1. `pnpm pack` 产出 `workdsh-plugin-activity-0.1.0-alpha.7.tgz`（**28,800 B**）
   - `sha256 = 78eb22a6d49f0409cb32873f4108b256333763b948f74b9a0784659920b72a13`
   - `integrity = sha512-r/qYqrFcnw5mbDgY8mCX/KNRDTzp41tUQSBVKwOsrUnXOabljr1nM91s7UMpMkFPzEzS3X7TtAz+rCc0BJ8vvw==`
   - tgz 内含 `dist/` + `locale/` + `LICENSE` + `README.md` / `CHANGELOG.md` / `DESIGN.md` / `cordis.patch.yml`
2. 复制到 `profiles/web/workdsh-package-assets/<sha256>.tgz`（owner `1000:1000`）
3. 备份并替换 `profiles/web/node_modules/workdsh-plugin-activity/`（α.6 桩 → α.7 完整 UI；旧存 `.bak-activity-alpha6`）
4. 文本更新 profile 声明使其与实际一致（**未跑 pnpm**）：
   - `package.json`：`workdsh-plugin-activity` 的 `file:` 指针 → 新 sha256（1 处）
   - `pnpm-lock.yaml`：旧 sha → 新 sha（5 处）、`integrity`（1 处）、块内 `version: alpha.6 → alpha.7`（1 处）
   - 备份：`package.json.bak.act-a7.20261112-231011`、`pnpm-lock.yaml.bak.act-a7.20261112-231011`
5. `docker compose restart deepseek-harness`

**未跑 guard**（软链未受影响，`symlinks` 保持 330 未变）。

### 7.4 核验（PASS）

| 项 | 结果 |
| --- | --- |
| 容器 | `Restarts=0` / `running` / `healthy` |
| 容器内 3080 | `200`；公网 `https://dsh.10ge.cn/` = `302` |
| 模块图 | `symlinks=330 realdirs=7`（无软链被还原） |
| 安装件 | `node_modules/workdsh-plugin-activity/dist/client.browser.js` = **21,370 B**，`wd-activity` ×38 |
| 声明一致 | `package.json` 指针 = `78eb22a6…a13`；`pnpm-lock.yaml` 块键同为 `…78eb22a6…a13.tgz` |
| client manifest | activity `rev` 由桩版变为 **`5771af5da1bb`** |
| 下发 bundle | `GET /plugins/??workdsh-plugin-activity/client.js&rev=5771af5da1bb` → `200`，**21,450 B**，`wd-activity` ×38，含 `conversation.session.header.utilities` |
| 启动日志 | 2 条 `did not activate` 仍为既有无关项（`computer-use-cua-driver-native` 缺 libX11、`workdsh-browser-session` 缺 Electron），**activity 不在其中** |
| 真机浏览器 | 独立 browser-agent 验收 **PASS**：`section.wd-activity` 存在，DOM 内 10 个 `wd-activity` 元素可见，`<span class="wd-activity-title">工作动态</span>` 可见（`data-phase="waiting"`、文案「需要你确认」）；无 activity 相关控制台错误（仅 1 条无关 `ERR_ABORTED /api/workdsh-browser-session`） |

### 7.5 未执行 / 边界

- **npm 发布未执行**（项目政策：制品为代码托管资产，不发布到 npm registry；本机亦无 `npmjs.org` token、默认 registry 为只读镜像 `npmmirror.com`）。
- **git 已提交并推送**：commit `987f68f59a`（8 文件，+376/−5）→ push `mygitee/main`（`f7abf774e6..987f68f59a`）；
  github `fork` 远程当时不可达（`HTTP2 framing layer`），未推。
- `workdsh-plugin-activity@0.1.0-alpha.7` 目前**只在 dsh.10ge.cn 这一台 profile 生效**；
  官方发布线 `workdsh-release` 的 activity 仍为 α.6 桩，二者已分叉——后续若跑官方安装器覆盖
  `--with activity`，会退回 α.6 桩，需重新按 7.3 投递。
- 登录后逐页业务点测（无凭据）仍未执行；本轮仅覆盖「未登录可见外壳 + 已登录前单态」范围。
- 线上备份 `.bak-activity-alpha6`、`package.json.bak.act-a7.*`、`pnpm-lock.yaml.bak.act-a7.*` 暂留，未清理。

### 7.6 仓库侧改动

`packages/plugins/activity/`：`package.json`（α.7、`exports`/`files`/`description` 对齐官方）、
`CHANGELOG.md`（α.7 条目）、新增 `locale/zh.json` 与 `locale/en.json`。未提交。
