# workdsh-access-probe — 授权决策探针（**仅沙箱**）

用**真实资源、真实所有者**调用同一个 `workdshAccess.authorize` 入口，把判定结果与理由码
直接打出来，用来回答一个读代码回答不了的问题：

> 启用 P1「按账号主体」之后，既有资源还能不能被授权？

路由：`GET /workdsh-access-probe/run`

| 参数 | 作用 |
| --- | --- |
| `action=read\|use\|edit\|manage` | 要判定的动作（默认 `read`） |
| `?grant=1` | 以所有者身份给被测主体签发 `read`+`use` grant，然后再判定一次 |
| `?revoke=1` | 撤销被测主体在该资源上的全部 grant，并给出**撤销后**的判定 |

返回：`beforeSwitch_asSubject`（门户账号视角）、`beforeSwitch_asOwner`（所有者视角，对照）、
`afterGrant_asSubject` / `afterRevoke_asSubject`、以及 grant 的签发/撤销结果。

## 沙箱实测结论（2026-09-27）

| 场景 | 判定 | 理由码 |
| --- | --- | --- |
| `portal:alice` 对 `local-user` 拥有的专家，无 grant | **deny** | `access/not-granted` |
| 同上，`local-user` 自己 | allow | `access/resource-owner` |
| 签发 `read`/`use` grant 之后 | **allow** | `access/explicit-grant` |
| 同上但动作为 `manage` | deny | `access/not-granted`（最小权限未被放宽） |

## 注意

- **不要**把它加进生产 profile 补丁层。它只用于沙箱验证与排障。
- 即使被加载，它也只会签发「配置里写死的那一个主体 × 那一个资源」的只读 grant，
  且需要显式 `?grant=1`。
