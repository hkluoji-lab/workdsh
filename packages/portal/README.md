# packages/portal — 企业门户与登录门禁

模块版本线：`0.1`（`workdsh-portal@0.1.0-alpha.2`）。任务 ID：`P1-13`。决策依据：[ADR-0034](../../docs/adr/0034-enterprise-portal-and-edge-authentication.md)。

## 定位与所有权

这是**部署边缘面，不是 Harness 功能插件**。它必须在应用加载之前完成身份判断，因此不可能由 Loader/Profile 装配的插件承担。

- 拥有：门户静态页（企业介绍、登录页）、登录/退出接口、签名会话 Cookie、失败限流、面向 Caddy `forward_auth` 的会话校验端点。
- 不拥有：领域数据、账号体系、组织与角色、业务授权、审计记录、Agent 执行。登录事件只写本服务自己的结构化 stderr 日志（单行 JSON），**不写 audit 插件的数据表**，也不进入 Harness 会话日志。
- 不声明 `dsh.bundle`、`exports`、`main` 或 `bin`，不注册任何 Slot、Remote 或 Agent 工具，不发布 npm；随部署交付。

## 目录

| 路径 | 内容 |
| --- | --- |
| `src/config.mjs` | 只读环境变量的配置装载；默认引用仓库内 `website/assets` 的真实截图 |
| `src/session.mjs` | 口令校验、签名会话、回跳白名单、失败限流（纯函数） |
| `src/server.mjs` | HTTP 服务：路由、静态页、登录/退出、`/api/portal/auth` |
| `site/` | `index.html`（企业首页）、`login.html`（登录页）、`styles.css`、`portal.js` |
| `site/products/` | 公开产品资料页（单文件自包含 HTML），经 `/portal/products/<name>.html` 直出 |
| `tools/publish-products.sh` | 部署侧脚本：把一份产品页拷到线上并验证（不需要重启、不改代码） |
| `tests/session.test.mjs` | 会话与门禁契约测试，`node --test`，无外部依赖 |

## 路由契约

| 路径 | 行为 |
| --- | --- |
| `GET /portal`、`/portal/` | 门户首页；公开、不校验会话 |
| `GET /login` | 登录页；已登录时 303 到 `next`（默认 `/`） |
| `POST /api/portal/login` | 表单或 JSON 登录；成功 303 到 `next` 并下发 Cookie，失败 303 回登录页并带 `error` |
| `GET /logout`、`POST /api/portal/logout` | 清除会话，303 到 `/portal` |
| `GET /api/portal/auth` | 供 Caddy `forward_auth`：有效 204（附 `X-Portal-User`），无效 401，**不发跳转、不带 `WWW-Authenticate`**（避免浏览器原生凭据框） |
| `GET /portal/styles.css`、`/portal/portal.js` | 站点静态文件（白名单） |
| `GET /portal/assets/<name>` | 真实产品截图与品牌标识，来自 `PORTAL_ASSETS_DIR`；图片以 WebP 双尺寸交付（PNG 保留为回退） |
| `GET /portal/products/<name>.html` | 公开产品资料页，来自 `site/products/`。只放行 `.html` 且文件名受限字符集；这些页是单文件自包含站点，**仅此路径**把 CSP 放宽到允许内联样式/脚本 |
| `GET /` | 302 到 `/portal`；根路径的前门由 Caddy 判定会话后决定放行工作台或门户首页 |

Cookie：`dsh_portal_session`，`HttpOnly`、`SameSite=Lax`、生产 `Secure`，无状态 HMAC-SHA256 签名，载荷只含用户名与签发/过期时间。回跳地址只接受同源相对路径，且拒绝指向 `/login`、`/logout`、`/portal`、`/api/*`。

## 缓存策略与素材（α.2）

安全头（CSP / `nosniff` / `Referrer-Policy` / `X-Frame-Options`）对所有响应恒定；**缓存头按响应类型分档**，`SECURITY_HEADERS` 里的默认值 `no-store` 只兜底未被显式覆盖的响应（接口、跳转、404/405、错误页）。

| 响应 | `Cache-Control` | 校验器 | 理由 |
| --- | --- | --- | --- |
| 门户首页、登录页 | `no-cache` | ETag | 可复用但每次必须回源校验：命中即 304 零正文，**不会陈旧** |
| `styles.css`、`portal.js` | `public, max-age=3600` | ETag | 文件名无内容指纹，用 1 小时窗口换取「不会长期留旧样式」 |
| `/portal/assets/*`（图片、`mark.svg`） | `public, max-age=604800` | ETag | 文件名固定、内容极少变动 |
| `/portal/products/*.html` | `no-cache` | ETag | 与门户首页同档：产品页含套餐与价格，改版后必须立即生效 |
| `/api/portal/*`、`/logout`、`/`、404/405 | `no-store` | 无 | 会话判定信号与跳转不得被任何中间层缓存 |

- ETag 取响应正文的 SHA-1：静态文件与登录页（正文含注入的错误提示与回跳地址）共用同一判据，不额外维护版本号；`If-None-Match` 按 GET 弱比较，客户端回写 `W/"…"` 同样命中。
- 素材交付：`website/assets/` 下 5 张界面截图各有 `-<width>.webp` 双尺寸变体，页面用 `<picture><source type="image/webp" srcset sizes>` 声明，原 3006px PNG 保留为不支持 WebP 时的回退。生成命令（`cwebp`）：

  ```sh
  cd website/assets
  for spec in "dashboard 1120" "dashboard 2400" "skills 680" "skills 1360" \
              "ppt 360" "ppt 720" "library 360" "library 720" "team 360" "team 720"; do
    set -- $spec
    cwebp -q 84 -m 6 -sharp_yuv -quiet -resize "$2" 0 "$1.png" -o "$1-$2.webp"
  done
  ```

  `srcset` 的宽度档对应实际版式槽位：首屏图槽位 `min(1120px, 100vw-40px)`；主证据图 3 列跨列时约占 663px；其余三张在 3 列网格中各约 360px。窄屏落到单列时统一按 `100vw-40px`。改版式后需同步复核 `sizes`。

- **经 Cloudflare 的实测差异（2026-09-24 线上复验）**：图片素材的 ETag 原样透传，客户端回写后拿到 304；站内 CSS/JS 由 CF 压缩，ETag 被改写为 `"<原值>-gzip"`，客户端回写这个改写值仍能命中 304（正文未变）；门户 HTML 由 CF 用 brotli 压缩后**ETag 被整条移除**，因此 HTML 拿不到 304、每次导航都是 200 全量（当前 br 后仅 7.8KB，量级可接受）。若日后要求 HTML 也走 304，需改用 CF 不剥离的校验器（如 `Last-Modified`）或调整压缩策略，属部署侧决策。

## 配置

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `DSH_AUTH_USERNAME` / `DSH_AUTH_PASSWORD` | 无 | **复用官方同一组口令**，不新增凭据真源；未配置时登录失败关闭 |
| `PORTAL_BIND` / `PORTAL_PORT` | `127.0.0.1` / `3083` | 只绑定环回，仅同容器 Caddy 可达 |
| `PORTAL_SESSION_TTL_HOURS` | `12` | 会话有效期；签名密钥由口令派生，改口令即全量失效 |
| `PORTAL_COOKIE_SECURE` | 开启 | 本机 http 预览时设为 `0` |
| `PORTAL_ASSETS_DIR` | 仓库 `website/assets` | 部署时指向实际素材目录 |

```sh
# 本机预览（需要 DSH_AUTH_USERNAME / DSH_AUTH_PASSWORD）
PORTAL_COOKIE_SECURE=0 DSH_AUTH_USERNAME=admin DSH_AUTH_PASSWORD=local-only \
  node packages/portal/src/server.mjs
# 打开 http://127.0.0.1:3083/portal 与 http://127.0.0.1:3083/login
```

## 官方能力复用记录

| 项 | 内容 |
| --- | --- |
| 任务 ID | `P1-13`（D17） |
| 官方文档路径 | [HARNESS-OFFICIAL-DEVELOPMENT](../../docs/HARNESS-OFFICIAL-DEVELOPMENT.md)；`docs/dsh-v0.1.6-alpha.2/architecture.md`、`capability-seams.md` |
| 锁定发布包 / 公开入口 | 基线 `@deepseek-ai/dsh@0.1.6-alpha.2`。官方 Web 侧公开扩展面为 Slots / Client model / Remote / 会话投影，**均要求在应用与 Loader 启动之后生效** |
| 已有探针 | 官方未提供"应用加载前"的鉴权扩展点。部署侧实测：线上容器 Caddy **v2.11.4**，`forward_auth` 为 2.7+ 标准指令（已核对官方文档「Expanded form」：默认以 **GET** 访问 `uri`），`http.handlers.reverse_proxy` 已加载；容器内 **3083 空闲**；宿主 `…/data/dsh` 已整体 rw 挂载为容器 `/data/dsh`，门户**无需新增挂载** |
| 直接复用 | 无需改造即可复用的部分：官方口令以环境变量形式提供，门户只读同一组值，不引入第二套账号；`forward_auth` 由既有容器内 Caddy 承担，不新增反向代理实现 |
| WorkDSH 需补的业务差异 | 官方只提供宿主层基础认证能力，不提供服务端渲染的登录页、登录页宣传、会话 Cookie、退出登录、失败限流与登录后回跳。这些必须由门户实现 |
| 缺口与选择顺序 | 顺序为「直接复用官方能力 → 公开 service/provider/tool/Remote/Slot 扩展 → 仅实现官方不拥有的领域」。前两级在时序上不可用（插件晚于应用加载），因此按第三级实现，并把落点放在部署层而非插件层 |
| 未复用而被否决的替代 | 恢复 Caddy `basic_auth`、把登录做成功能插件、独立子域门户、门户自带反向代理，理由见 ADR-0034 |
| 待补缺口 | 企业 SSO 与多账号属于 `identity-oidc`（B5）。届时门户只保留退出与跳转，不复制其职责 |

## 验收条件

1. `node --test packages/portal/tests/session.test.mjs` 通过：口令校验、签名 Cookie 防篡改、回跳白名单、失败限流。
2. 本机 `PORTAL_COOKIE_SECURE=0` 下实测（**已执行 20 项**）：门户首页与登录页 200；`/` 302 到 `/portal`；静态资源白名单命中、目录穿越与非白名单扩展名 404；错误口令 303 `error=credentials`、空口令 `error=missing`；正确口令下发 Cookie 并 303 到 `next`；`/logout` 清 Cookie；`/api/portal/auth` 无 Cookie 401、篡改 Cookie 401、有效 Cookie 204；恶意 `next`（绝对 URL、协议相对）落回 `/`；连续失败达阈值转 `error=throttled`，`Accept: application/json` 时 429；未配置口令的实例失败关闭（`error=unconfigured`）；非 GET/HEAD/POST 405、未知路径 404。
3. 1440、1000 与 390 视口无意外横向溢出；首页与登录页目检通过（**已执行**：五组视口 `scrollWidth == innerWidth`，console/页面错误与 4xx/5xx 均为 0，滚动高亮 6/6 命中，`prefers-reduced-motion` 分支只保留颜色反馈）。
4. 线上切换后：匿名访问 `dsh.10ge.cn` 不得直达工作台；匿名访问 `/` 得到门户首页；深链匿名访问应 302 到 `/login?next=`，登录后回原页；`/survey/` 仍可匿名填写；`app` 内视觉零回归。**（已执行 2026-09-22，逐项实测见下）**

   | 探针（对公网域名） | 实测 | 判定 |
   | --- | --- | --- |
   | 匿名 `GET /` | `302 → /portal` | 未登录不直达工作台 ✓ |
   | 匿名 `GET /portal`、`/login` | `200` / `200` | 门户公开面可达 ✓ |
   | 匿名 `GET /session/abc123` | `302 → /login?next=/session/abc123` | 深链带回跳 ✓ |
   | 匿名 `GET /survey/` | `200` | 问卷仍可匿名填写 ✓ |
   | 匿名 `GET /plugins/events` | `302 → /login?next=/plugins/events` | 受保护路径过门禁 ✓ |
   | 匿名 `GET /api/portal/auth` | `401` | 校验端点不误放行 ✓ |
   | `POST` 错误口令 | `303 → /login?error=credentials&next=%2F` | 失败回登录页 ✓ |
   | `POST` 正确口令 | `303 → /`，下发 `HttpOnly; SameSite=Lax; Max-Age=43200; Secure` | 登录成功 ✓ |
   | 带会话 `GET /` | `200` | 放行工作台 ✓ |
   | 带会话经 `/login?next=/session/does-not-exist` 登录 | 落到 `/session/does-not-exist` | 浏览器实测回跳正确 ✓ |
   | `next` 为绝对 URL（`https://evil.example.com/x`） | `303 → /` | 拒绝开放重定向 ✓ |
   | 带会话 `GET /logout` | `303 → /portal` | 退出 ✓ |
   | 门户静态资源 8 项（css/js/6 图） | 全部 `200`，字节数与仓库一致 | 素材落位正确 ✓ |
   | Cloudflare 对 302 的处理 | `cf-cache-status: DYNAMIC` + `cache-control: no-store` | **302 未被边缘缓存**（原「未验证」项已关闭）✓ |
   | 浏览器实测工作台（真实登录后） | 标题 `DeepSeek Harness`，侧栏与任务列表正常，`bootFailure=0` | app 内视觉零回归 ✓ |

5. 部署前必须替换 `site/index.html` 中标记 `TODO(部署前必须替换)` 的占位：页脚联系方式与备案信息，以及企业介绍 `#about` 基本信息里的运营主体、成立时间与团队规模、服务区域与响应方式；替换为真实信息后才可对外发布。**（未执行：用户 2026-09-23 裁决「先按现状部署」，线上仍有 7 处「待配置」占位，拿到真实信息后需再替换并重新落位一次）**

## 部署（需用户单独授权后执行）

沿用既有的「派生副本 + 只读挂载」做法（`/survey` 为先例）：门户目录与派生 `Caddyfile`、派生 `docker-entrypoint.sh` 都是宿主机文件，**不改镜像、不改官方 entrypoint 本体**。宿主 `…/data/dsh` 已整体 rw 挂载为容器 `/data/dsh`，门户文件放进去即生效，**无需新增挂载**。

入口形态（用户 2026-09-23 裁决）：**未登录时 `/` 给门户首页**，门户自有路径直连，其余路径先过门禁。

### 1. 文件落位

| 宿主路径 | 内容 |
| --- | --- |
| `…/data/dsh/portal/{package.json,src,site}` | 从仓库 `packages/portal/` 原样拷贝（`site/` 含 `site/products/`） |
| `…/data/dsh/portal/tools/` | 从仓库 `packages/portal/tools/` 拷贝，供部署侧发布产品页 |
| `…/data/dsh/portal/assets/` | 从仓库 `website/assets/` 拷贝 `mark.svg`、`dashboard.png`、`skills.png`、`ppt.png`、`library.png`、`team.png`，以及 α.2 起的 10 个 `-<width>.webp` |

α.2 起仓库已包含线上全部门户代码（不再存在只在线上存在的路由），因此可直接覆盖 `src/server.mjs`。

### 2. 派生 Caddyfile 增量

在顶层 `{ … }` 全局块之后新增两个 snippet：

```
# 登录门禁（ADR-0034）：未登录时按调用点决定去向。
# 工作区与 API 回登录页并带回跳；根路径先给门户首页。
(portal_gate) {
	forward_auth 127.0.0.1:3083 {
		uri /api/portal/auth
		@unauth status 401
		handle_response @unauth {
			redir * /login?next={http.request.uri.path} 302
		}
	}
}

(portal_gate_root) {
	forward_auth 127.0.0.1:3083 {
		uri /api/portal/auth
		@unauth status 401
		handle_response @unauth {
			redir * /portal 302
		}
	}
}
```

在站点块内、`route @settings_api` 之前插入两条 route：

```
	# 门户公开面：静态页与登录/退出/会话校验 API，由门户服务处理，不经过门禁。
	@portal_public path /portal /portal/* /login /logout /api/portal/*
	route @portal_public {
		reverse_proxy 127.0.0.1:3083 {
			header_up -Authorization
		}
	}

	# 根路径：已登录放行工作台；未登录交给门户首页（门户自身 302 → /portal）。
	@portal_root path / /index.html
	route @portal_root {
		import portal_gate_root
		reverse_proxy 127.0.0.1:3080 {
			header_up -Authorization
		}
	}

```

在既有三处受保护 route 的首行插入 `import portal_gate`：

```
	route @settings_api {
		import portal_gate          # ← 新增
		respond @unexpected_origin "Forbidden" 403
		…原有内容不变
	}

	route /plugins/events {
		import portal_gate          # ← 新增
		…原有内容不变
	}

	route {
		import portal_gate          # ← 新增
		…原有内容不变
	}
```

`route @survey` **刻意不加门禁**：`/survey/` 是文档标注「可公开」的问卷填写入口，纳入门禁会使其失效。若后续要保护问卷，单独裁决。

### 3. 派生 docker-entrypoint.sh 增量

在 `unset HTTPS_ACCESS_HOST DSH_AUTH_USERNAME DSH_AUTH_PASSWORD auth_password` 之前插入一行保留口令（门户需要它派生签名密钥）：

```
portal_password="$auth_password"
```

在 `gosu caddy env \` 之前插入门户启动块（与 `/survey` 同构，带容器内自愈循环）：

```
# 企业门户与登录门禁：/portal、/login、/logout、/api/portal/* 由 Caddy 反代到它；
# 其余路径先经它校验会话。失败时容器内自动重启，避免门禁单点崩溃拖垮整站。
(
  while true; do
    gosu node env HOME=/data/dsh/home \
      DSH_AUTH_USERNAME="$auth_username" \
      DSH_AUTH_PASSWORD="$portal_password" \
      PORTAL_BIND=127.0.0.1 \
      PORTAL_PORT=3083 \
      PORTAL_ASSETS_DIR=/data/dsh/portal/assets \
      node /data/dsh/portal/src/server.mjs
    printf 'portal service exited (%s); restarting in 3s.\n' "$(date -Is)" >&2
    sleep 3
  done
) &
portal_pid=$!
pids+=("$portal_pid")

```

并把末尾 `wait -n` 的目标列表加上 `"$portal_pid"`。

`PORTAL_COOKIE_SECURE` 保持默认开启（线上经 Cloudflare 为 HTTPS），**不要**设成 `0`。

### 4. 执行顺序（2026-09-23 已按此在线上执行一次，2026-09-24 按 α.2 再执行一次，下含实测坑）

**α.2 增量（缓存分档 + WebP 落位）**：`site/index.html`、`site/styles.css` 落位即生效，无需重启；`assets/` 只需新增 10 个 `-<width>.webp`，原 PNG 保留；**`src/server.mjs` 改动必须重启门户进程**才生效。重启方式为 `kill` 门户 `node` 进程，由 entrypoint 看护 `while true` 循环在 3 秒内拉起新代码——看护是子 shell，其 PID 不退，因此 `wait -n` 不触发整容器重启（实测 `RestartCount` 不变）。落位前先在容器内**备用端口**（如 3098）用同一份 `server.mjs` 预演一遍公开面，确认后再切换生产。静态页与素材可在切换前后任意时刻落位。

宿主机 `…/data/dsh/tmp/` 下已有两个带断言的派生脚本，可直接复跑（幂等）：

| 脚本 | 作用 | 实测 |
| --- | --- | --- |
| `add-portal-caddy.py <in> <out>` | 加 2 个 snippet + 2 条 route + 3 处 `import portal_gate` | 1479 → 2554 bytes |
| `add-portal-entrypoint.py <in> <out>` | 加口令保留行 + 门户启动块 + `wait -n` 追加 `portal_pid` | 4828 → 5521 bytes |

1. 备份 `Caddyfile`、`docker-entrypoint.sh` 与 `.env`（带时间戳后缀；`.env` 属 root，需 `sudo`）；
2. 拷门户文件与素材，落地后 `md5sum` 与仓库逐个比对；
3. 改 `.env` 凭据后**先本地预校验**再落盘：用户名须匹配 `^[A-Za-z0-9._-]+$`，口令长度须 `>= 12`（违反任一条容器会崩溃循环）；
4. 依次跑两个派生脚本改 `docker-entrypoint.sh` 与 `Caddyfile`，再 `bash -n` 校验脚本；
5. 语法校验（**两个前置环境变量缺一即失败**）：

   ```sh
   docker exec -e CADDY_ACCESS_HOST=dsh.10ge.cn \
     -e XDG_DATA_HOME=/data/caddy -e XDG_CONFIG_HOME=/data/caddy/config \
     dsh caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

   - 缺 `CADDY_ACCESS_HOST` → `default_sni: wrong argument count`（`{$CADDY_ACCESS_HOST}` 未定义）；
   - 缺 `XDG_*` → `mkdir /root/.local: read-only file system`（容器 rootfs 只读，pki 需写 `/data/caddy`）。

6. **重启前先在容器内 3083 预演门户**（避免门禁单点让整站不可达）：直接拉起 `node /data/dsh/portal/src/server.mjs` 走一遍公开面与登录往返，确认 200 / 401 / 303 与 Cookie 属性正常；
7. 重启容器一次让 entrypoint 生效（工作台中断约 1 分钟）：

   ```sh
   docker compose up -d --force-recreate
   ```

   **`--force-recreate` 不能省**：compose **不检测 `.env` 内容变化**，实测第一次 `up -d` 只输出 `Container dsh Running` 而未重建，容器内仍是旧凭据。`docker inspect` 比对容器内 `DSH_AUTH_USERNAME` 长度可判定是否真的重建了。
8. 按「验收条件」第 4 条实测（含 Cloudflare 302 缓存与浏览器级工作台回归）。

### 5. 回滚

```sh
A=/opt/1panel/apps/deepseek-harness/deepseek-harness
cp -p $A/data/dsh/tmp/Caddyfile.bak.portal.<时间戳>            $A/data/dsh/tmp/Caddyfile
cp -p $A/data/dsh/tmp/docker-entrypoint.sh.bak.portal.<时间戳> $A/data/dsh/tmp/docker-entrypoint.sh
printf '88888888\n' | sudo -S cp -p $A/.env.bak.portal.<时间戳> $A/.env   # .env 属 root
docker compose up -d --force-recreate
```

回滚后网站恢复为「匿名直达工作台」，`/portal`、`/login` 因门户进程不再被拉起而不可达。DSH 后端、Cloudflare 隧道与容器镜像始终不受影响。

最近一次已执行的备份时间戳：**`20260922232318`**（`.env`、`Caddyfile`、`docker-entrypoint.sh` 各一份）。

### 已知限制

- `forward_auth` 的失败跳转只带**路径**（`{http.request.uri.path}`），不带查询串：匿名访问 `/session/x?y=1` 登录后回到 `/session/x`。
- 未登录访问 `/` 会经一次 302 落到 `/portal`（门户首页），与 ADR-0034「`/` 未登录时给门户首页」一致。
- 门户服务不可用会让 `forward_auth` 失败、整站不可达（见 ADR-0034 失败边界），因此启动块带自愈循环，且必须先验证 `caddy validate`。
- 多副本部署下限流计数不共享；当前为单实例。
- 产品页路由已在 α.2 回填仓库（此前线上先于仓库存在，属未登记漂移）。回填时**未收录**当时线上 `tools/patch-products-route.sh`：它是一次性插入补丁，锚点已被 α.2 的函数签名改动取代，路由本身也已进 `src/server.mjs`，保留只会误导；产品页的日常更新走 `tools/publish-products.sh`（纯拷文件，不需要重启）。

## 未验证范围

- **已执行 2026-09-23**：线上路由切换与 `forward_auth` 的实际行为已实测（15 项探针 + 浏览器级回归），见「验收条件」第 4 条。凭据同步改为 `18938845688` / `Aa@88822166!`（原始口令 11 位，经用户裁决补一位以满足官方 `>= 12` 硬约束）。
- **已验证**：Cloudflare 对 302 不缓存（`cf-cache-status: DYNAMIC` + `cache-control: no-store`）。
- 未验证：Safari/Firefox、多副本部署下的限流一致性、长时会话过期后的前端表现。
- 门户是本机单实例假设（进程内限流）；多副本时限流计数不共享，签名校验仍然正确。
- 线上仍有 7 处「待配置」占位（用户裁决「先按现状部署」）；替换后需重新落位 `site/index.html`，静态文件无需重启。
