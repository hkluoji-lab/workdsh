# 企业 Agent 工作台 · 需求调研问卷（自建在线表单）

把「腾讯问卷文本导入版」的 14 题问卷改成自建可填写网页，挂到 `https://survey.10ge.cn/`，
答卷直接落到公司自己的服务器上，不经过第三方问卷平台。

## 文件

| 文件 | 作用 |
|---|---|
| `index.html` | 问卷表单页（单文件，内联 CSS/JS，无外部依赖） |
| `admin.html` | 结果管理台（令牌访问，含自动统计与 CSV 导出） |
| `server.mjs` | 零依赖 Node 收集服务（静态页 + 提交/查询/导出 API） |
| `host-gateway/gateway.mjs` | 宿主机侧公网网关：只放行问卷路径，避免把工作台带出去 |
| `host-gateway/survey-gateway.service` | 上面的 systemd 单元 |
| `deploy/deploy.sh` | 容器侧部署脚本，`prepare` 只校验，`restart` 生效 |
| `deploy/add-survey-caddy.py` | 幂等派生 Caddyfile，插入 `/survey` 反代路由 |
| `deploy/add-survey-entrypoint.py` | 幂等派生 entrypoint，启动收集服务 |
| `deploy/enable-gateway.sh` | 安装并启动宿主机公网网关（幂等） |
| `deploy/publish-cf.py` | 幂等发布公网子域名：Cloudflare DNS + 隧道 ingress |

## 上线后的地址

- **填写（对外发这个）**: `https://survey.10ge.cn/` —— 自动跳到 `/survey/` 显示表单
- **管理台短链**: `https://survey.10ge.cn/admin?t=<令牌>`
- 备用入口（仍在）: `https://dsh.10ge.cn/survey/`
- 令牌文件: `/data/dsh/survey/data/admin-token.txt`（容器内）
- 答卷落盘: `/data/dsh/survey/data/submissions.ndjson`（容器内）

## 架构

```
survey.10ge.cn ──> Cloudflare 隧道 ──> 宿主 127.0.0.1:3092  gateway.mjs
                                     （只放行 /survey*，其余 404）
                                              │  Host: dsh.10ge.cn
                                              ▼
dsh.10ge.cn  ──> Cloudflare 隧道 ──> 宿主 3080 ──> dsh 容器 Caddy :8443
                                                       │
                                         route /survey ┤
                                                       ▼
                                         127.0.0.1:3082  server.mjs
                                         （静态页 + JSONL 落盘）
                                       其余路径 ──> 127.0.0.1:3080 dsh 本体
```

- **为什么要有宿主机网关**：容器内 Caddy 只认 `Host: dsh.10ge.cn`，且它的兜底路由会把整个
  AI 工作台代理出去。直接把新子域名指到容器 Caddy，等于把「无鉴权的工作台」复制到新域名上。
  网关只转发 `/survey*`，`/api/*`、`/plugins/events`、`/dsh-deployment.js` 一律 404。
- 路由插入在兜底 `route { … }` 之前，因此只劫持 `/survey` 与 `/survey/*`，不影响工作台。
- 收集服务由 entrypoint 拉起，并带容器内自动重启循环；它崩溃不会拖垮工作台，也不会让问卷静默失联。
- 网关只监听 `127.0.0.1:3092`，不对局域网暴露。

## 公网子域名是怎么接上去的

`10ge.cn` 在 Cloudflare 上，所有子域名都是同一种接法（**两步，缺一不可**）：

1. **DNS**：在该 zone 建一条 `CNAME <名字> -> de305491-d57d-40b0-93ca-bcf592d5a8d5.cfargotunnel.com`，并打开橙色云（proxied）。
2. **隧道 ingress**：在隧道配置里加一条 `{"hostname": "<名字>.10ge.cn", "service": "<源站>"}`，
   位置必须在最后那条兜底 `http_status:404` **之前**（按顺序匹配）。

本项目的 `deploy/publish-cf.py` 把这两步做成了幂等脚本（凭据取自 `/root/.cloudflared/cert.pem`
里 base64 的 `ARGO TUNNEL TOKEN`；每次改动前会把隧道配置备份到 `/opt/survey-gateway/backup/`）：

```bash
sudo python3 deploy/publish-cf.py --check   # 只读，看现状
sudo python3 deploy/publish-cf.py           # 建 DNS + 插 ingress
```

> ⚠️ `www.10ge.cn` 并不存在；`10ge.cn` 裸域指向的是**另一条**隧道（`03307b31-…`）。
> 要新开公网入口，用 `<名字>.10ge.cn` 这个格式，不要动裸域。
> 注意 `ssh.10ge.cn`、`1panel.10ge.cn` 等入口也在同一条隧道上，改 ingress 必须保留原有条目。

## 部署

```bash
cd /opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/home/dsh/survey/deploy
sudo bash deploy.sh prepare    # 拷贝 + 打补丁 + caddy adapt 语法校验 + 容器内试跑，不重启
sudo bash deploy.sh restart    # 重启容器生效，并自动跑端到端自检、写 deploy-report.txt
sudo bash enable-gateway.sh    # 安装/重启宿主机公网网关（不重启容器）
```

`prepare` 全部通过后再执行 `restart`。重启会让工作台中断约 1 分钟，数据不丢。

> ⚠️ **上线后不要单独跑 `prepare`**：它的运行预检会停掉正在运行的收集服务。
> 线上已在回收答卷时，改完内容请直接执行 `restart`（重建容器会一并拉起服务）。

报告文件：`/opt/1panel/apps/deepseek-harness/deepseek-harness/data/dsh/survey/deploy-report.txt`
每次 `restart` 还会把完整验证结果写进 `data/dsh/survey/finish-report.txt`（含管理台令牌）。

### 回滚

```bash
A=/opt/1panel/apps/deepseek-harness/deepseek-harness
sudo cp -p $A/data/dsh/tmp/Caddyfile.bak.survey.<时间戳>              $A/data/dsh/tmp/Caddyfile
sudo cp -p $A/data/dsh/tmp/docker-entrypoint.sh.bak.survey.<时间戳>   $A/data/dsh/tmp/docker-entrypoint.sh
cd $A && sudo docker compose up -d --force-recreate
```

回滚后问卷地址失效，已回收的答卷仍保留在 `data/submissions.ndjson`。

## 日常运维

```bash
A=/opt/1panel/apps/deepseek-harness/deepseek-harness

# 采集服务是否活着
sudo docker exec dsh curl -fsS http://127.0.0.1:3082/survey/healthz

# 公网网关是否活着（survey.10ge.cn 靠它）
systemctl status survey-gateway --no-pager
curl -fsS http://127.0.0.1:3092/__gw/health
sudo journalctl -u survey-gateway -n 50 --no-pager

# 回收份数
sudo wc -l $A/data/dsh/survey/data/submissions.ndjson

# 采集服务日志（崩溃/提交记录都在容器 stdout）
sudo docker logs dsh --since 1h 2>&1 | grep -i survey

# 备份答卷
sudo cp $A/data/dsh/survey/data/submissions.ndjson ~/survey-backup-$(date +%F).ndjson
```

### 下掉公网子域名（问卷结束后）

```bash
# 1) 删 DNS 记录（用 API 或 Cloudflare 面板）
# 2) 从隧道 ingress 删掉 survey.10ge.cn 那一条
sudo python3 $A/data/dsh/home/dsh/survey/deploy/publish-cf.py --check   # 先看现状
#    需要回退时用备份：
#    /opt/survey-gateway/backup/tunnel-ingress-backup-*.json
# 3) 停网关
sudo systemctl disable --now survey-gateway
```

问卷本体仍可通过 `https://dsh.10ge.cn/survey/` 访问，不受影响。

## 改问卷内容

- **部门下拉选项**：`index.html` 里 `var SV_DEPTS = [...]`，改完重新执行 `deploy.sh prepare` + `restart`。
- **题目文案/选项**：直接改 `index.html`；若增删字段，`server.mjs` 的 `normalise()` 与 `buildCsv()` 需同步。
- **矩阵维度**：`index.html` 的 `MATRIX` 数组 + `server.mjs` 的 `MATRIX_KEYS`。

## 设计取舍

- **答题体验**：单页 6 个部分 + 顶部进度条；草稿存 localStorage，断点可续；移动端量表改纵向堆叠。
- **数据质量**：第 4 题拆成 6 个结构化字段（流程名/触发/环节/系统/角色/耗时），比一段自由文本更可分析。
- **防滥用**：同 IP 提交限 6 次/小时、请求限流、隐藏蜜罐字段；问卷「每人限填一次」靠 localStorage 与 IP 限流近似实现，
  无法做到企业微信级别的强身份绑定。
- **权限边界**：`/survey/admin` 无令牌直接 404；数据接口仅接受常量时间比较的令牌。
- **核心分析产物**：第 6 题的 5 维打分在管理台自动合成「Agent 化优先分」（频率+耗时+规则明确+数据集中，4—20 分），
  出错代价 ≥4 自动标「需人工确认」。

## 已知限制

- 收集服务是单文件 JSONL，没有数据库；并发写入靠 `appendFile` 的原子追加，千级答卷无压力，不适合万级。
- 管理台一次性拉取全部答卷在前端计算；答卷量很大时需改成分页。
- 无邮件/企业微信推送，新答卷需要主动打开管理台查看。
- 令牌只有一个，不能分部门授权；令牌重置 = 删除 `data/admin-token.txt` 后重启容器。
- 公网入口多了一个常驻服务：宿主 `survey-gateway`（systemd）。它挂了 `survey.10ge.cn` 会 502，
  但 `https://dsh.10ge.cn/survey/` 不受影响；`sudo systemctl restart survey-gateway` 即可恢复。
- 新域名是 Cloudflare 直连（不经 OpenResty），`tls internal` 自签只在隧道那一跳，访客看到的是 Cloudflare 证书。
