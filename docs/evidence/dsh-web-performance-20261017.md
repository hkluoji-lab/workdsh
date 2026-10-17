# dsh.10ge.cn 打开慢排查与修复（2026-10-17）

任务：用户报 `https://dsh.10ge.cn/?workdsh-view=conversation` 打开慢，要求排查并修复其他 bug。
范围：线上 `dsh` 容器（192.168.11.205）、门户静态资源、Cloudflare 边缘调度；不改基线版本、不改计划台账。

## 1. 结论

服务端无慢查询/无崩溃：3080、3083 在本机直连均为毫秒级。慢的主因在链路与首屏体积，共三处：

1. **Cloudflare 边缘落点**：本机与服务器同 NAT 出口（`16.5.50.12`），被调度到 **AMS（阿姆斯特丹）**；强制香港节点 `104.16.0.1` 后 HTML TTFB 从约 1.3–2.4s 降到 0.56–0.88s。
2. **首屏插件体积**：91 个 client 插件合计 **14.3MB**（未压缩），两个 `plugins/??…` 合并 bundle 压缩后仍为 4.22MB / 1.41MB。
3. **登录三跳往返**：原生表单 `POST → 303 → GET` 跨洋多一个往返；改为 fetch JSON 后直接 `location.assign`。

另发现并修复一个深链 bug：未登录访问 `/?workdsh-view=conversation` 时，门禁只带 `path` 回跳，查询串丢失，登录后回不到原视图。

## 2. 诊断证据（修复前）

- 容器内直连：`http://127.0.0.1:3080/` 1.5ms；`http://127.0.0.1:3083/portal` 0.5ms；`https://dsh.10ge.cn:8443/portal`（`--resolve` 绕过容器内 IPv6 解析）4–6ms。
- 容器健康：`healthy`、`RestartCount=0`、内存约 1.4GiB/8GiB、宿主 load ≈1.1；`did not activate` 0 条。
- Cloudflare 边缘：`dig dsh.10ge.cn` 得 `104.21.54.147` / `172.67.139.104`，`Cf-Ray` 后缀 `-AMS`；`--resolve 104.16.0.1` 后为 HKG。
- 客户端体积（容器内遍历 profile `node_modules` 的 `./client` 入口）：总计 14.3MB；Top：settings-account 3338KB、dsh-im 1117KB、api-remotes 1059KB、conversation 756KB、dshmarket 752KB、dsh-prompt 615KB、ui-chat 580KB、dream-skin 421KB、agent-teams 228KB。
- 隧道层：`--region us + http2 + edge-ipv4` 是唯一可用组合，QUIC/无 region/eu 均失败（详见本轮前序排查）。

## 3. 已执行修复

### 3.1 登录少一次往返（`packages/portal/site/portal.js`）

- 登录表单提交改为 `fetch(form.action, { method:'POST', Accept:'application/json', body: JSON })`，成功后读取服务端 `payload.redirect` 直接 `location.assign`，不再走 `POST → 303 → GET`。
- 失败路径新增客户端 `LOGIN_ERRORS` 映射，与服务端 `packages/portal/src/server.mjs` 的 `LOGIN_ERRORS` 同口径；保留 12s watchdog、按钮复位与 bfcache `pageshow` 复位。
- 服务端未改：`/api/portal/login` 早已支持 JSON 分支（`wantsJson`），`redirect` 由 `safeNext` 校验后给出。
- 无 JavaScript 时仍走 `login.html` 原生 form 提交，服务端照常渲染错误与回跳。
- 线上同步：`/data/dsh/portal/site/portal.js`（bind mount，属主 luoji），两端 md5 均为 `46eca901ac4cbf4c8bd15f467149ce5c`。

### 3.2 首屏体积：移除俄语语言包

- 用户确认只移除 `@goodandready/dsh-russian-lang@0.3.42`（中文站点无用；其 7 条 `already has locale "ru"` 重复注册告警同时消失）。
- 线上：`dsh plugin --profile web remove @goodandready/dsh-russian-lang --config.minimumReleaseAge=0`（首次未加参数被 pnpm 11 `minimumReleaseAge` 拒绝，无副作用）。`package.json` 的 dependency 与 `dsh.profile.bundles` 条目均自动移除；`node_modules/@goodandready` 与 `.pnpm` 中该包已不存在。
- 仓库真源：`deploy/profile/package.json` 删除依赖与 bundle 条目；`deploy/profile/pnpm-workspace.yaml` 删除其版本豁免行。
- 结果：client 总体积 14.3MB → **14.1MB**；服务端 HTML 不再引用该插件，重启后日志 `russian` 命中 0 条。

### 3.3 深链查询串保留（线上 Caddyfile）

- 文件：`/data/dsh/tmp/Caddyfile`（容器内 `/etc/caddy/Caddyfile`，只读挂载；服务器上属主 root）。
- `(portal_gate)`：`redir * /login?next={http.request.uri.path}` → `redir * /login?next={http.request.uri}`，保留查询串。
- `(portal_gate_root)`：新增 `@deep_link expression {http.request.uri.query} != ""`；带查询串时回 `/login?next={http.request.uri}`，无查询串仍回 `/portal`，不改变原有产品行为。
- 校验：容器内 `caddy validate` = `Valid configuration`；重启后实测
  - `/` → `302 /portal`（不变）
  - `/?workdsh-view=conversation` → `302 /login?next=/?workdsh-view=conversation`
  - 登录页隐藏域 `next` = `/?workdsh-view=conversation`
- 已知限制：Caddy 无法对占位符做 URL 编码，原查询串含 `&` 时第二个参数会截断（如 `?a=1&b=2` 只保留 `a=1`）。单参数深链（本次场景）不受影响。

## 4. 验证

- 容器重启后：`Up (healthy)`、`RestartCount=0`、启动日志 `error` / `did not activate` 均为 0。
- 登录接口：`POST /api/portal/login`（JSON）`200`，`{"ok":true,"redirect":"/?workdsh-view=conversation"}`，`Set-Cookie` 正常；带 Cookie 请求深链返回 `200`、`<title>DeepSeek Harness</title>`。
- 浏览器实测（真实账号）：退出 → 访问深链 → 落到 `/login?next=/?workdsh-view=conversation` → 点击登录后按钮变「登录中…」并在无 303 的情况下跳转 → 最终 URL 保留 `?workdsh-view=conversation`，工作台正常渲染；`POST /api/portal/login` = `200 application/json`；控制台 `error` 0 条。
- 链路耗时（本机 curl，含波动）：

| 场景 | 修复前 | 修复后 |
| --- | --- | --- |
| HTML（默认 AMS 边缘） | TTFB 2.41s | 1.28–1.47s |
| HTML（强制 HKG `104.16.0.1`） | 1.11s | 0.56–0.88s |
| 合并 bundle 1（4.22MB 压缩后） | total 5.2s（AMS） | total 0.57s（HKG，可能命中边缘缓存） |
| 合并 bundle 2（1.41MB 压缩后） | total 3.1–4.1s（AMS） | total 2.17s（HKG） |

> 默认边缘耗时波动较大（同日下午曾测到 2.4s，晚间 1.3–1.5s），但 HKG 始终更快。

## 5. 回退锚点

- Caddyfile：`/data/dsh/tmp/Caddyfile.bak-20261017`（原文件，root:root）。回退后需重启容器生效。
- 插件：`dsh plugin --profile web add @goodandready/dsh-russian-lang@0.3.42`，并恢复仓库两条配置。
- 门户脚本：`git checkout -- packages/portal/site/portal.js` 后重新 scp 到 `/data/dsh/portal/site/portal.js`。
- 容器：`docker restart dsh`（约 25s 恢复 healthy）。

## 6. 本机 hosts 切换香港节点（已执行）

2026-10-17 经 macOS 管理员授权写入本机 `/etc/hosts`（IPv4 + IPv6 双栈，避免浏览器 Happy Eyeballs 仍走旧 AAAA）：

```
104.16.0.1 dsh.10ge.cn
2606:4700::6810:1 dsh.10ge.cn
```

- 选择依据：`104.16.0.1` 与 `2606:4700::6810:1` 实测 TTFB 0.77–1.10s；DNS 原 AAAA（`2606:4700:3030::6815:3693`）为 1.66–2.35s。
- 撤销：

```bash
sudo sed -i '' '/dsh\.10ge\.cn/d' /etc/hosts
```

- 验证：`dscacheutil -q host -a name dsh.10ge.cn` 仅返回上述两个地址；`curl -4` / `curl -6` 均为 `302` 且 TTFB 稳定在 1s 左右。

## 7. 未执行 / 边界

- 未移除官方包：`@deepseek-ai/dsh-client-ui-settings-account`（3338KB）与 `dsh-api-remotes`（1059KB）属官方必需面，不能删。
- 未处理已有真源漂移：线上 `dsh-mcp-connector` 为 `0.2.73`，`deploy/profile/package.json` 仍为 `0.2.72`（本次之前即存在，未擅自升级）。
- 容器内 curl 不带 `--resolve` 时 DNS/IPv6 回退会引入 1–2s（Node `dns.lookup` 仅 5ms），不影响隧道与 Caddy（上游均走 `127.0.0.1`）。
