# workdsh-grant-admin — 资源授权管理（Host 半边）

A 方案**缺口 1** 的后端：让「用户与权限 → 资源授权」页能逐资源授予/撤销
`read` / `use` / `edit` / `manage`。

## 调用链

```
浏览器 → 门户 /api/portal/grants*（会话 + 管理员门槛）
       → 本插件 /workdsh-grant-admin/{summary,apply,revoke}（带**已签名**的门户身份头）
       → workdshAccess.putGrant / revokeGrant（以**调用者**身份执行）
```

两道防线，缺一不可：

1. **必须验签**：容器内 `127.0.0.1:3080` 可达，仅凭请求头不能作为身份依据。
   载荷与算法来自 `../workdsh-portal-auth/index.js`（与身份桥共用同一份实现）。
2. **以调用者身份提交**：授权能不能做，由 DSH 访问层判定（`actor 是所有者` 或 `持有该资源的 manage`）。
   本插件不做第二套权限判断——否则就会出现两个权限真源。

## 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/workdsh-grant-admin/summary` | 调用者身份、资源清单、主体清单、现有 grant、动作白名单 |
| POST | `/workdsh-grant-admin/apply` | `{subjectPrincipalId, domain, id, actions[]}`，以调用者身份 putGrant |
| POST | `/workdsh-grant-admin/revoke` | `{grantId}`，以调用者身份 revokeGrant |

状态码：密钥不可用 `503`；未验签 `401`；岗位不具备管理资格 `403`；访问层拒绝 `403 denied`。

## 实测（沙箱，2026-09-27）

`portal/tests/grants.test.mjs` **16 passed**：门户门槛（无会话/普通用户 403）、
转发后 DSH 认得调用者、摘要可用、授予 edit 后探针放行（`access/explicit-grant`）、
撤销后重新被拒、直连 DSH 伪造签名 `401`。

> ⚠️ 调用者必须是 DSH 已知的主体（在花名册里）。生产环境由 Caddy `forward_auth`
> 在每个请求上带签名身份，首次访问即入册；**测试里必须显式模拟这一步**，
> 否则访问层会以 `access/inactive-membership` 拒绝一个"从没见过的"主体。

> ⚠️ 新出现的主体（例如刚登录的管理员）要在收敛循环里拿到 `manage`。
> 花名册 mtime 轮询（默认 2s）会让这发生在数百毫秒内，而不是等一个完整周期——
> 否则表现为"刚登录却改不了权限"。
