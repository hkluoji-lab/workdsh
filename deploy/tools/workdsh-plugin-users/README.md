# workdsh-plugin-users — 「用户与权限」设置面板

在 DSH **设置 → 用户与权限** 提供账号与权限管理（自助视图 + 管理视图）。

## 当前形态（2026-09-27 起）

| 项 | 值 |
| --- | --- |
| 位置 | `settings.section` 列表槽，`id: users`，`order: 16`（紧随官方「插件」之后） |
| 标签 | 用户与权限 |
| 不做 | **不注册左侧导航行，不占页脚**——这两种形态 2026-09-27 都试过，均被用户否掉 |
| 数据源 | 门户同源接口 `/api/portal/*`（Cookie 会话 + 服务端角色校验） |
| 加载行 | profile 补丁层 `id: workdsh-users` → `file:///data/dsh/tools/workdsh-plugin-users/dist/index.js` |

### 两种视图

- **自助视图**（任何已登录账号）：我的账号、平台角色、岗位角色、我的能力清单（含生效状态）。
  这是用户明确要求的："注册用户都能看到自己的账号，岗位角色及权限"。
- **管理视图**（平台角色 `admin`）：账号管理（新建/改平台角色/指派岗位/停用/重置口令/删除）、
  角色与权限矩阵、注册与策略。

前端隐藏只是体验；**所有管理端点由门户 `requireAdmin` 兜底**，前端不是安全边界。

### 布局纪律（踩过的坑）

旧实现注册在 `sidebar.footer.action`，并注入
`div:has(> [data-slot='sidebar.footer.action']){flex-wrap:wrap}` 去改写**宿主**容器，
再用 `flex:0 0 100%` 独占一行。结果是位置与外观都不对，用户两次要求改掉、最后要求删除。

现在的纪律（`tests/client.test.mjs` 有回归断言）：

1. **不注册任何 `sidebar.*` 槽**；
2. **每一条 CSS 规则都必须以 `.wd-usr` 开头**，全量作用域在自有类名内；
3. 不出现 `[data-slot=` 或 `div:has(` 这类宿主选择器。

## 角色与权限模型

真源是门户侧的 `/data/dsh/portal/src/roles.mjs`（8 个部门岗位 + 24 项能力 + `enforced` 标记），
本插件只做**呈现**，不自己定义一套。详见 `/data/dsh/portal/ACCOUNTS.md`。

要点：平台角色（`admin`/`user`）与岗位角色（`jobRole`）是正交两层；新账号默认
`unassigned`（零岗位能力，绝不静默提权）。能力项带 `enforced`，界面必须如实区分
「门户侧已强制」与「声明式、DSH 侧尚未强制」。

## 测试

```bash
node tests/client.test.mjs        # 22 项：bundle 注册形状、槽位、作用域纪律、首屏渲染
```

离线跑真实 bundle（假的 `__ModuleLoader__` + React），不启动浏览器、不启动 DSH。
门户侧另有 `portal/tests/roles.test.mjs`（29 项，真起门户进程走 HTTP）。

## 部署与回滚

- **生效**：补丁层是 live 的。新增/恢复 `file:` 行后运行中的实例自行重组，**无需重启容器**
  （2026-09-27 两次实测：摘除后清单引用归零、bundle 404；恢复后清单出现、bundle 200）。
  浏览器硬刷新即可看到设置里的新一节。
- **回滚**：注释掉 profile 补丁层 `/data/dsh/profiles/web/cordis.patch.yml` 里的
  `- insert: [workdsh-users]` 块。移除前的完整备份：
  `cordis.patch.yml.bak.nousers.20260927215407`。
- 门户侧接口与数据不受本插件开关影响：`/api/portal/*`、`/portal/admin` 独立可用。

## 与 P1 的关系

本面板解决的是「看与管」；「岗位角色在 DSH 工作台里真正生效」需要 P1 身份打通
（每个账号独立 DSH 主体）+ P2 各域 `authorize` 覆盖。当前 24 项能力里只有 6 项
（`users.read` `users.manage` `security.manage` `audit.read` `portal.admin` `vas.admin`）
是门户侧真正强制的，其余如实标注为声明式。P1 进展见 `portal/ACCOUNTS.md` 的「未完成项」。
