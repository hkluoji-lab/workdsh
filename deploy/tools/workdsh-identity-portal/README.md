# workdsh-identity-portal — P1 身份打通（Host 半边）

把门户登录身份变成 DSH 内**每个账号各自的主体**，让岗位角色与权限在工作台里真正生效。

## 当前状态（2026-09-27）

| 项 | 状态 |
| --- | --- |
| 实现 | ✅ 完成（Host 插件 + 门户签发 + 跨端签名测试 + 沙箱端到端验证） |
| 沙箱验证 | ✅ **17/17 通过**（独立 DSH 实例，端口 3099，独立 `DSH_HOME`） |
| 生产启用 | ⛔ **未启用**——存在一个会打断现有功能的硬阻塞，见下 |

插件**没有**被写进生产 profile 补丁层（`/data/dsh/profiles/web/cordis.patch.yml`）；
沙箱 profile 是 `/data/dsh/profiles/p1sandbox`（独立目录，与生产隔离）。

## 设计

```
浏览器 ──► Caddy ──forward_auth──► 门户 /api/portal/auth
                     │                └─ 返回 X-Portal-User / Role / Job-Role / Sig
                     │                   （forward_auth 会把认证响应头复制进上游请求）
                     ▼
                 DSH 3080
                     ├─ connection/request（waterfall）：验签 → AsyncLocalStorage 写入身份
                     └─ workdshIdentity.resolve({ sessionId })
                          ① 会话已有归属绑定 → 以绑定为准（老会话不被打断）
                          ② 请求作用域有已验签身份 → 该账号
                          ③ 都没有 → 兜底主账号 local-user（与启用前完全一致）
```

三个关键接口事实（都是实测得到的，不是推测）：

1. 门户 `/api/portal/auth` **早已**返回 `X-Portal-User`，而 Caddy 门禁用 `forward_auth`
   （会把认证端点响应头复制进上游）。此前全站**没有任何消费者**，这条通道是空的。
2. `connection/request` 是覆盖已认证 API 请求的 waterfall：
   `(request, response, next) => Promise<void>`，能拿到原始 `IncomingMessage`。
3. 访问层取主体固定走 `workdshIdentity.resolve({ sessionId })`——**按会话**，不按请求。
   所以必须让身份服务既看得见"当前请求是谁"，又记得"这个会话归谁"。

## 安全

- **签名是信任锚**：容器内 `127.0.0.1:3080` 可达，仅凭一个请求头不能作为身份依据。
  门户用共享密钥（`portal/identity-bridge.key`，0600）对
  `[账号, 平台角色, 岗位角色, 过期时间]` 的 **JSON 载荷**做 HMAC-SHA256；插件验签后才认。
- **载荷用 JSON 而不是换行拼接**：换行拼接在字段本身含分隔符时会产生歧义
  （`{user:'a\nb'}` 与 `{user:'a',role:'b'}` 会拼成同一串），可被搬移字段伪造。
  这一条是被 `tests/signature.test.mjs` 抓出来的真实缺陷。
- **失败关闭到既有行为**：密钥缺失/验签失败/请求头不合法 → 一律退回 `local-user`，
  既不提权也不阻断请求。密钥缺失时限频重试，不做成"一次启动顺序就永久失效"。
- 插件初始化**不抛异常**（各项注册各自 try/catch）：宿主插件加载期抛错会让整棵插件树失败、
  容器起不来，代价远高于"身份没打通"。

## 验证（沙箱实测 17/17）

```bash
# 1) 跨端签名一致性（最容易静默失效的地方）
node tests/signature.test.mjs          # 14 passed

# 2) 起沙箱实例（独立 DSH_HOME；注意必须绕过 dsh 包装脚本，见下）
DATA=/data/dsh
ln -sfn $DATA/profiles $DATA/tmp/p1sandbox-home/profiles
DSH_HOME=$DATA/tmp/p1sandbox-home HOME=$DATA/home \
  node --expose-globals /usr/local/lib/node_modules/@deepseek-ai/dsh/lib/bin.js \
  --profile p1sandbox --port 3099 --no-open

# 3) 端到端
BASE=http://127.0.0.1:3099 KEY_FILE=$DATA/tmp/p1sandbox-home/identity-bridge.key \
  node tests/sandbox-verify.mjs        # 17 passed
```

覆盖：插件进树、身份服务就位、兜底路径不变、签名身份成为独立主体、
`profile()`/`membership()` 就位、**已绑定老会话仍归原所有者**、篡改签名被拒且不升级、
多账号互不串味、花名册跨重启保留。

> ⚠️ **踩坑：`/usr/local/bin/dsh` 包装脚本把 `DSH_HOME` 硬编码成 `/data/dsh`。**
> 用 `DSH_HOME=… dsh …` 起沙箱**无效**，第二个实例会直接共用生产 `storages/`。
> 必须直调 `bin.js`。另外 `DSH_HOME` 同时是 profile 根，所以要把 `profiles` 软链进沙箱 home。

## ⛔ 生产启用的硬阻塞（未解决，别绕过）

`workdsh-plugin-access` 的 `authorize()` 判定是：

```
actor 是资源所有者            → allow（access/resource-owner）
否则有匹配 action 的显式 grant → allow（access/explicit-grant）
否则                          → deny（access/not-granted）
```

而生产数据里**所有资源都属于 `local-user`**：

| 域 | 归属 |
| --- | --- |
| `workdsh_experts`（13 条） | `ownerPrincipalId: local-user` |
| `workdsh_office`（11 条） | `ownerPrincipalId: local-user` |
| `workdsh_library` | `ownerPrincipalId: local-user` |

专家插件把资源所有者原样传入：`owner: expert.owner`
（`workdsh-plugin-experts/dist/services/experts-manager.js:214`）。

**结论：一旦切换成按账号主体，`portal:alice` 既不是这些资源的所有者、也没有 grant，
专家使用与在线文档编辑会立刻被全部拒绝。** 沙箱只验证了"身份能被正确解析"，
没有覆盖"既有资源在新主体下还能不能被授权"——这一步必须在启用前补上。

两条可行路径（都需要先决策）：

- **路径 A（授权迁移，改动最小）**：保留 `local-user` 作为资源所有者，
  给各账号签发显式 grant（`workdshAccess.putGrant`，动作 `read`/`use`/`edit`/`manage`）。
  代价：grant 是"主体 × 资源"级别的，账号或资源一多就是矩阵；
  并且要给「用户与权限」面板补上 grant 管理界面。
- **路径 B（所有权模型，改动在上游）**：让资源归**组织**所有，并让 `authorize()`
  对 `scope: 'organization'` 的资源放行组织内活跃成员。
  现状是 `authorize()` 只比较 `ownerPrincipalId`，不区分 scope，
  所以"组织所有"目前是**声明了但没实现**。这要改 `workdsh-plugin-access`（与专家/Office 插件）。

在两者之一落地之前，**不要**把本插件加进生产补丁层。

## 启用前置：成员基线授权（已就绪）

启用本插件前必须先跑 `/data/dsh/tools/workdsh-grant-baseline`（默认 dry-run），
否则普通账号会因为"既非所有者又无 grant"而用不了任何专家与文档。
该工具已在沙箱验证：撤销 → deny（`access/not-granted`）→ 迁移 → allow（`access/explicit-grant`），
且 `manage` 仍被拒（最小权限未被放宽）。

启用顺序（**每一步都要先验证再下一步**）：

1. 备份：profile 补丁层、package.json、Caddyfile。
2. 跑基线授权迁移（dry-run 确认 → apply → 再跑一次确认全 unchanged）。
3. 加补丁行：`- id: workdsh-identity-local` + `disabled: true`，以及
   `insert: workdsh-identity-portal`（生产 config：secretFile 指向
   `/data/dsh/portal/identity-bridge.key`，rosterFile 指向
   `/data/dsh/storages/workdsh_identity_portal/principals.json`）。
4. 重启门户进程（签发身份头）——**不必重启容器**。
5. Caddy 去掉客户端伪造的 `X-Portal-*` 头（防御纵深；签名已是信任锚，
   但这一步需要重启容器才生效，可另择时间窗）。
6. 验证：`/workdsh-identity/whoami` 可达、老会话仍可对话、专家可正常使用。

> ⚠️ 第 5 步与容器重启都会**重启本会话所在的 DSH 进程**，必须由容器外执行。

## 回滚

生产未启用，无需回滚。若将来启用后要回滚：注释掉生产补丁层里的
`- id: workdsh-identity-local`（`disabled: true`）与 `- insert: [workdsh-identity-portal]` 两块即可；
老会话的归属绑定与花名册都不受影响（`resolve()` 的兜底路径会继续返回 `local-user`）。
