# 增值业务产品页 · 部署与运维

**站点入口**：https://dsh.10ge.cn/portal/products/2026Q3-zengzhi.html （多页站点，共 8 页）
**管理后台**：https://dsh.10ge.cn/portal/zengzhi/admin （需登录，复用门户账号，可编辑并一键发布全部 8 页）
**模块目录**：`/data/dsh/vas`

---

## 1. 站点结构（8 页）

多页站点，全部挂在门户免鉴权的 `/portal/products/` 前缀下：

| 文件 | 内容 |
|---|---|
| `2026Q3-zengzhi.html` | **产品总览**：一行一项产品的**产品矩阵**——左侧深色身份板（分类 / 产品名 / 金色大字月租 / 月租与一次性费用计数 / 企业价值标签 / 双按钮），右侧（产品特征、月租档位卡、一次性费用、适用场景、计费方式与受理类型）。上接首屏数据带与粘性「快速定位」条，下接「按场景选型」，以及可折叠的「受理登记表核对视图」（原 7 列业务表）+ FAQ |
| `2026Q3-zengzhi-ringback.html` | 商务音频/音视频彩铃（月租为原文填空项，如实标注） |
| `2026Q3-zengzhi-hangup-sms.html` | 挂机短信（38 元含 300 条 / 88 元含 800 条） |
| `2026Q3-zengzhi-caller-id.html` | 来电名片单产品（29/39/59 元，含 350/500/800 条闪信） |
| `2026Q3-zengzhi-caller-id-terminal.html` | 来电名片终端版（10/40/80 元，按终端覆盖范围分档） |
| `2026Q3-zengzhi-hangup-5g.html` | 挂机 5G 消息（39/69/100 元档 + 500 元/次制作服务） |
| `2026Q3-zengzhi-pricing.html` | **资费总表**：15 档平铺，含原文依据，适合打印当面核对 |
| `2026Q3-zengzhi-order.html` | **需求登记**：支持 `?p=<产品id>` 预选，可预览需求单后提交 |

8 页共用同一套内联样式与 8 项站内导航（总览 + 5 产品 + 资费总表 + 需求登记），已实测 130 个站内链接零断链。

---

## 2. 它是怎么跑起来的

```
浏览器
  │  https://dsh.10ge.cn/portal/products/2026Q3-zengzhi.html
  ▼
Cloudflare 隧道 → 容器内 Caddy :8443
  │  Caddy 规则 @portal_public（免鉴权白名单，路径前缀 /portal/*）
  ▼
门户服务 127.0.0.1:3083  →  serveProductPage() 读 site/products/<name>.html
                              ▼
                        /data/dsh/portal/site/products/2026Q3-zengzhi*.html（8 个文件）

管理后台（同一入口前缀，走门户转发）
  │  /portal/zengzhi/admin  +  /api/portal/zengzhi/*
  ▼
门户 3083  proxyVas()  →  增值业务后台 127.0.0.1:3085
                              ├─ 数据 /data/dsh/vas/data/products/*.json
                              ├─ 订单 /data/dsh/vas/data/orders/YYYY-MM.jsonl
                              └─ 发布 → 一次写出全部 8 个 HTML
```

**没有新增 Caddy 规则、没有改隧道配置**：`/portal/*` 与 `/api/portal/*` 本来就是免鉴权白名单中的路径前缀，站点与后台都挂在这两个前缀下，因此 Caddyfile（容器内只读挂载）无需改动。

### 为什么每页都是「单文件」

门户对产品页下发严格的 CSP：

```
default-src 'none'; img-src 'self' data:; style-src 'self' 'unsafe-inline';
script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self';
form-action 'self'; base-uri 'none'; frame-ancestors 'none'
```

`default-src 'none'` 意味着**任何外部 CSS / JS / 字体 / 图片都会被拦掉**，所以不能像常规网站那样外链样式表。做法是：每页样式与脚本全部内联、数据以 JS 字面量内联，**零外部请求**；多页之间只用相对链接跳转。已用真实浏览器实测每页脚本确实执行（不是"HTML 取到了但脚本被拦"）。

需求单通过**同源** `fetch('/api/portal/zengzhi/orders')` 提交，落在 `connect-src 'self'` 允许范围内。

### 总览页的样式为什么单独注入

`tools/render-product.mjs` 里有两套样式：

- `CSS`：8 页共用（导航、页头、表格、表单、页脚……），`page()` 每页都注入；
- `OVERVIEW_CSS`：只有产品总览页用到的（产品矩阵行 `.pc*`、粘性快定位 `.qnav*`、核对视图 `.audit*`、场景 `.scene*`、首屏数据带 `.kpibar`）。

`page(data, { ..., extraCss })` 把第二套只注入总览页，其余 7 页不会背上约 9 KB 的无用样式（改版后其余 7 页反而各小了约 0.6 KB：原先共用的 `.pc` 卡片样式已移出共用 CSS）。

改总览页视觉时**只需要动 `OVERVIEW_CSS` 与 `renderOverview()`**，不会波及其余 7 页。产品行的色相由 `ROW_ACCENTS` 一处定义，同时生成 `.pc--cN` 的 CSS 变量与「快速定位」条上的圆点，避免两处漂移。

---

## 3. 日常操作

### 改内容（推荐：走后台）

1. 打开 https://dsh.10ge.cn/portal/zengzhi/admin ，用门户账号登录；
2. 在「内容编辑」里改产品、资费、场景、价值维度、FAQ、条款；
3. **校验** → 通过后点**保存并发布**。发布即写文件，**无需重启任何服务**，线上立即生效。

- 「仅保存（不发布）」只改 JSON，不动线上页，便于先备份数据。
- 每次保存都会在 `/data/dsh/vas/backups/` 留档（默认保留最近 30 份）。
- 「原始 JSON」区块可直接改整份数据，便于批量调整。

### 改内容（命令行）

```bash
cd /data/dsh/vas
# 1) 改数据
vi data/products/2026Q3-zengzhi.json
# 2) 校验 + 渲染全部 8 页（校验不过会直接退出，不会产出半成品）
node tools/render-product.mjs 2026Q3-zengzhi
# 3) 发布：8 个页面必须一起复制过去，文件名即 URL
cp -p site/2026Q3-zengzhi*.html /data/dsh/portal/site/products/
```

> 注意：`site/` 下共 8 个文件（总览 1 + 产品详情 5 + 资费总表 1 + 需求登记 1），漏拷任意一页都会导致站内导航出现 404。推荐直接用后台的「保存并发布」，它会一次性写完 8 页。

### 重新生成产品与资费清单文档

```bash
cd /data/dsh/vas
node tools/export-doc.mjs        # → docs/产品与资费清单.md
```

改完数据后请重新生成，不要手工编辑那份文档（会与线上页漂移）。

### 看需求单

后台「需求单」标签页可查看、按状态筛选并流转跟进状态（待跟进 / 已联系 / 已受理 / 已关闭）。
落盘位置：`/data/dsh/vas/data/orders/2026-09.jsonl`，每行一条 JSON。

---

## 4. 进程与自愈

| 服务 | 端口 | 启动方式 |
|---|---|---|
| 门户（含门禁） | 3083 | `/data/dsh/portal/src/server.mjs`，entrypoint 看护 |
| FTTR 管理后台 | 3084 | `/data/dsh/portal/admin/src/server.mjs`，entrypoint 看护 |
| **增值业务后台** | **3085** | `/data/dsh/vas/src/server.mjs`，entrypoint 看护（本次新增） |

增值业务后台的启动块由 `/data/dsh/tmp/add-vas-entrypoint.mjs` 幂等注入到
`/data/dsh/tmp/docker-entrypoint.sh`（该文件是容器内 `/usr/local/bin/docker-entrypoint.sh` 的只读挂载源）。
注入块自带 `while true` 自愈循环：**进程崩溃 3 秒后自动重启，容器重启后也随之拉起**。

```bash
# 重新应用注入（幂等，已存在则跳过）
node /data/dsh/tmp/add-vas-entrypoint.mjs \
  /data/dsh/tmp/docker-entrypoint.sh /tmp/entrypoint.new
bash -n /tmp/entrypoint.new && cat /tmp/entrypoint.new > /data/dsh/tmp/docker-entrypoint.sh

# 校验挂载源与容器内一致
md5sum /data/dsh/tmp/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
```

> 改这个文件前务必先 `bash -n` 自检。**语法错误会让容器直接崩溃循环**。

---

## 5. 回滚

各层都有独立回滚点，互不牵连：

| 回滚目标 | 操作 |
|---|---|
| **撤掉增值业务后台入口**（保留已发布页面） | 恢复门户：`cp -p /data/dsh/portal/src/server.mjs.bak.vasmodule.<时间戳> /data/dsh/portal/src/server.mjs`，然后重启门户进程（见下） |
| **撤掉容器自愈启动块** | `cp -p /data/dsh/tmp/docker-entrypoint.sh.bak.vas.<时间戳> /data/dsh/tmp/docker-entrypoint.sh`（容器重启后生效） |
| **撤掉首页入口** | 删掉 `site/index.html` 里的 `vas-products-entry` 两行 |
| **撤掉线上页面** | 删 `site/products/2026Q3-zengzhi*.html`（8 个文件一起删，只删一个会留下断链） |
| **回滚页面内容** | 从 `/data/dsh/vas/backups/` 取历史版本重新发布 |
| **回滚总览页改版**（2026-10-02 一行一产品） | 见下方说明。 |

**总览页改版是怎么回滚的**

改版只发生在 `tools/render-product.mjs` 的两处：`OVERVIEW_CSS`（新增的整段总览页专属样式）与 `renderOverview()`（总览页的标记与脚本）。其余 7 页的标记未动，共用 `CSS` 里只是把原本只被总览页使用的 `.cards/.pc` 卡片样式搬进了 `OVERVIEW_CSS`。

- 只回滚**线上页面**：`cp -p /data/dsh/vas/backups/pre-redesign-<时间戳>/2026Q3-zengzhi*.html /data/dsh/portal/site/products/`（8 页一起还原）。但这只是文件级还原，下次在后台点「保存并发布」会用当前渲染器重新生成新版。
- 连**渲染器**一起回滚：需要把 `OVERVIEW_CSS` 与 `renderOverview()` 恢复成改版前的写法。改版前渲染器的完整副本**没有留档**，但改版前的产出（含原共用 CSS 与总览页原标记）完整保存在 `backups/pre-redesign-<时间戳>/`，可据此还原。

> 教训：改动 `tools/render-product.mjs` 前应先 `cp -p tools/render-product.mjs backups/render-product.mjs.<时间戳>`。本轮已补上一份改版后的副本。

**重启门户进程**（不重建容器，工作台不中断；entrypoint 的看护循环 3 秒内拉起新代码）：

```bash
# 找到并结束门户进程；看护循环会自动重启它
for d in /proc/[0-9]*; do
  first=$(tr '\0' '\n' < "$d/cmdline" 2>/dev/null | head -1)
  second=$(tr '\0' '\n' < "$d/cmdline" 2>/dev/null | sed -n 2p)
  [ "$first" = "node" ] && [ "$second" = "/data/dsh/portal/src/server.mjs" ] && kill "$(basename $d)"
done
sleep 4
curl -s -o /dev/null -w "portal: %{http_code}\n" http://127.0.0.1:3083/portal/
```

> 注意：门户是 `forward_auth` 提供者，**它不可用会导致整站不可达**。改 `server.mjs` 前先在备用端口预演（见 §7），确认无误再切换。

> 增值业务后台（3085）不提供 `forward_auth`，它崩溃**不会**影响门户与工作台；其入口会返回 503（`proxyVas` 的优雅降级），看护循环 3 秒内自动重拉。

---

## 6. 鉴权模型

- 后台**不新建账号体系**：登录复用门户会话 Cookie（`dsh_portal_session`）。
- 密钥派生口径必须与门户一致 —— 由**归一化后的账号表**派生，而不是原始口令：

  ```js
  deriveKey([...accounts].map(([u, s]) => `${u}\u0000${s}`).join('\u0001') || 'unconfigured')
  ```

  （这点踩过坑：用原始口令派生会导致门户签发的 Cookie 在本服务验不过。）
- 写操作额外要求**同源**（`Origin.host === Host`）+ **CSRF 令牌**（`X-CSRF-Token`，由页面 `<meta name="csrf">` 注入）。
- 公开的订单提交端点仅开放 `POST /api/portal/zengzhi/orders`，带同源校验、字段白名单、按 IP 限流（默认 30 次/小时）与指纹去重。

---

## 7. 验收

```bash
cd /data/dsh/vas
node tools/browser-check.mjs http://127.0.0.1:3083          # 多页站点 59 项
VAS_TEST_USER=<账号> VAS_TEST_PASSWORD=<口令> \
  node tools/admin-browser-check.mjs http://127.0.0.1:3083  # 后台 23 项
```

实测结果（2026-09-27，经生产门户 3083）：

> 两个套件请**按顺序执行**：公开站套件会提交一条真实需求单，后台套件要读取它来验证「需求单列表」与「状态流转」。若先跑后台再跑公开站，后台会读到 0 条而误判失败。

| 套件 | 结果 | 覆盖要点 |
|---|---|---|
| `tools/browser-check.mjs` | **59 / 59** | 8 页逐页渲染、业务表月租/套餐内容核对、5 个产品详情页资费与原文依据、资费总表 15 行、详情页→登记页 ?p= 预选、站内导航 8 链接全通、真实提交需求单、390px 无溢出、无 CSP 违规 |
| `tools/admin-browser-check.mjs` | **23 / 23** | 真实登录表单登录、SSO、编辑与校验、仅保存不改线上页、发布 8 页并回写、非法数据被 422 拒绝、需求单列表与状态流转、后台 390px |

改动总览页视觉后（2026-10-02）`tools/browser-check.mjs` 复测仍为 **59 / 59**，并在真实浏览器（经 https://dsh.10ge.cn ）复核了套件未覆盖的新交互：粘性「快速定位」条随滚动高亮当前产品、点「核对总表」自动展开核对视图、展开后表格在 `.tw` 内横向滚动而页面不溢出、无控制台报错与 CSP 违规。

### 看设计稿（截图）

```bash
cd /data/dsh/vas
# 整页长图
node tools/shot.mjs http://127.0.0.1:3083/portal/products/2026Q3-zengzhi.html /tmp/overview.png 1440 950 --full
# 只取某个区块（滚动到该元素再截视口，粘性元素不会错位）
node tools/shot.mjs http://127.0.0.1:3083/portal/products/2026Q3-zengzhi.html /tmp/row1.png 1440 900 "--sel=#row-vas-ringback"
# 移动端
node tools/shot.mjs http://127.0.0.1:3083/portal/products/2026Q3-zengzhi.html /tmp/m.png 390 844 --scroll=0
```

`tools/shot.mjs` 与验收套件共用同一个 headless Chromium 与字体环境，中文渲染口径一致。

**改动前预演**（生产零影响）：先在备用端口拉起改动后的服务再切换：

```bash
# 门户预演
setsid env HOME=/data/dsh/home DSH_AUTH_USERNAME=<账号> DSH_AUTH_PASSWORD=<口令> \
  PORTAL_BIND=127.0.0.1 PORTAL_PORT=3098 PORTAL_VAS_PORT=3091 \
  PORTAL_COOKIE_SECURE=0 node /data/dsh/portal/src/server.mjs &
```

---

## 8. 数据口径（重要）

- 全部产品、资费、产品特征与场景**来自《信息服务业务受理登记表（挂机、来电、商彩、5G消息业务本地整理版）》**。
- 原文未给出的量化信息一律保留为「受理时填写 / 待补充」，**不做任何推算**。典型例子：商务彩铃的主号、子号月租在原文中就是填空项（`主号＿＿元/线/月`），页面上如实显示为"受理时填写"。
- 每档资费都带**受理登记表原文依据**（`quote` 字段），「资费总表」页有独立一列可逐条核对。
- 后台编辑时请勿填入原文未给出的金额。

---

## 9. 已知边界

1. **未做整机重启验证**：自愈启动块已持久化到挂载源，但本轮未重启容器实测（重启会中断进行中的会话）。首次容器重启后请确认 `3085` 端口在听。
2. **单实例**：后台为单进程 + JSON 文件存储，适合低并发；多实例需换数据库与共享存储。
3. **无消息通知**：需求单提交后不自动发短信/邮件，需人工在后台查看。
4. **订单与 FTTR 分开**：本站需求单落在 `/data/dsh/vas/data/orders/`，**不会**出现在 FTTR 后台（`/portal/admin`）的订单列表里——这是刻意的隔离设计（两个后台的订单校验口径不同），但意味着两个后台各看各的订单。
5. **未接入备案/运营主体信息**：页脚沿用门户的「运营主体与备案信息待配置」口径。
6. **月租为填空项的产品**：商务音频/音视频彩铃的月租在受理登记表原文中即为填空项，页面不会显示金额，也不会用制作费代替月租——这是数据事实，不是页面缺陷。
7. **两个验收套件有执行顺序要求**：见 §7 的提示，顺序颠倒会误判失败。
8. **总览页在 ≤860px 改为上下堆叠**：产品行从「左身份板 + 右内容」变为「身份板在上、内容在下」，粘性「快速定位」条同时改为静态（窄屏下它换行会占掉过多可视高度）。这是刻意的响应式取舍。
9. **总览页刻意没做「滚动渐入」**：曾用 IntersectionObserver 给产品行加淡入上移动画，但整页截图 / 打印取景时未进入视口的行会停在 `opacity:0`，验收长图里后 4 行直接是空白——与其让内容在某种取景下不可见，不如不做。产品行的「体验感」改由别的方式承担：每行独立色相的深色身份板、金色大字月租、悬浮抬升、粘性快速定位条与锚点高亮。
10. **总览页的核对视图默认折叠**：原 7 列业务表移入 `<details>`，点「核对总表」或打印前自动展开；表格本身仍在 DOM 中（验收套件的数据核对项因此不受影响）。
