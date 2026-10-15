# workdsh-grant-baseline — 站点资源成员基线授权迁移

把「站点资源对所有活跃账号可用」这件事用**显式 grant** 表达出来，使 P1 按账号主体启用后
既有资源不会因为"换了主体、不再是所有者"而被整体拒绝。

## 为什么需要它

`workdsh-plugin-access` 的判定是：

```
actor 是资源所有者            → allow (access/resource-owner)
否则有匹配 action 的显式 grant → allow (access/explicit-grant)
否则                          → deny  (access/not-granted)
```

本站资源（专家、Office 文档）**全部**属于 `local-user`。启用按账号主体后，
`portal:alice` 既不是所有者、又没有 grant → **专家使用与文档编辑会被全部拒绝**。
这不是推测：`tests/baseline-verify.mjs` 在沙箱里把这条链完整跑过（撤销 → deny → 迁移 → allow）。

## 怎么用

**默认 dry-run，不写盘。** 只有显式 `?apply=1` 才签发。

```bash
# 1) 先看要做什么（不改任何东西）
curl -s http://127.0.0.1:3080/workdsh-grant-baseline/run | jq .
#    → counts.planned / sample[]，确认资源与主体都对

# 2) 执行
curl -s 'http://127.0.0.1:3080/workdsh-grant-baseline/run?apply=1' | jq .counts
#    → created / updated / unchanged / failed

# 3) 再跑一次应当全部 unchanged（幂等）
```

参数：`?principals=a,b`（默认取花名册里的活跃主体）、`?actions=read,use`（默认 `read,use`）。

## 设计约束（都是实测踩出来的）

| 约束 | 原因 |
| --- | --- |
| grant id 必须匹配 `/^[a-zA-Z0-9_-]+$/` | 它会被当作 per-record 存储 key；主体 id 里的 `:` 必须净化，否则落盘直接失败 |
| revision 取「动作集合的确定性哈希」 | 幂等：重跑同一套动作是 no-op，不会反复改写授权记录 |
| **只读**枚举资源文件 | 不去 `open` 别人拥有的 storage domain——同名 domain 重复 open 会抛 `already-open` |
| 默认 dry-run | 授权是安全边界，手工误触发不该有副作用 |
| 只给 `read`/`use` | 最小权限：`manage` 仍然被拒，验证里有断言 |

## 它**没有**解决什么（重要）

基线授权只做到"人人可用"，**没有**解决"按岗位角色管理内容"：

- `edit` / `manage`（编辑草稿、发布专家、配置连接器）仍只属于**资源所有者**。
  运营岗位要能发布专家，要么给该资源单独签发 `manage`（矩阵变大），
  要么走「组织所有 + authorize 放行组织成员」的上游改法。
- **新资源会重新产生同样的问题**：启用后由 `portal:alice` 创建的专家归她所有，
  其他人无 grant → 需要重跑本工具。

所以：本工具是**启用 P1 的必要前置**（保证切换不打断现有功能），
不是多角色权限的终局；终局见 `ACCOUNTS.md` 里 P1 的路径 B。

## 回滚

撤销走 `workdshAccess.revokeGrant`（沙箱探针已实测可用）。按主体/资源逐个撤销即可；
本工具签发的 grant id 形如 `baseline-<domain>-<id>-<principal>`，便于枚举定位。

## 测试

```bash
# 需要沙箱实例已在 3099（见 workdsh-identity-portal/README.md 的起法）
BASE=http://127.0.0.1:3099 node tests/baseline-verify.mjs    # 17 passed
```

覆盖：撤销→拒绝（复现阻塞）、dry-run 无副作用、apply 幂等、迁移后放行、
`manage` 仍被拒（最小权限未被放宽）。
