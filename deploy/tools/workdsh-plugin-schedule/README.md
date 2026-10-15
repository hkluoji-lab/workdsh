# workdsh-plugin-schedule

左侧导航「定时任务」入口：会话本地的提醒读 / 增 / 删，加跨会话总览。
复用官方 `@deepseek-ai/dsh-schedule` 的持久化与交付语义，不自造第二套。

## 2026-10-04 修复（三处真实缺陷）

### 1. 读路径全废 → 改用官方 Remote `schedule`

原实现走「会话 schedule 投影」（宿主半侧 `sessionProjections` / `sessionQuery`），
但官方 `@deepseek-ai/dsh-schedule` **并不注册任何会话投影**。实测表现：

- 「当前会话的提醒」永远报 `无法读取该会话的定时任务（投影服务不可用）`
- 「跨会话总览」`scanned: 106, unreadable: 106`（每个会话都读不出来）

改为先读官方 `ctx.remote.schedule`（`list` / `catalog` / `delete`），它才是官方
「自动化任务」页用的权威共享读面；宿主路由与浏览器侧投影缓存降级为回退路径。

> ⚠️ **坑 1**：`remote` 下的子服务必须按点分路径声明注入，否则抛
> `cannot get property "remote.schedule" without inject`：
>
> ```js
> module.exports.inject = ['slots', 'layout', 'sessions', 'uiWorkspace', 'remote', 'remote.schedule']
> ```
>
> **坑 2**：官方 Remote 按方法元数据校验实参个数，`catalog` 是零参数。
> 显式传 `undefined` 会被判成 1 个实参并报
> `client api: schedule/catalog expected 0 argument(s), got 1`。
> 无请求体时必须写成 `face[method]()`。

### 2. 「自动化任务」页刷新掉回对话框

workdsh-bundle 的 `NavigationLocation` 只认自己的视图表
（experts / skills / assistant / projects / library / automation / more），
遇到官方面板 id `schedules` 直接 `return` —— 既不写 URL 也不拦。于是地址栏一直停在
`?workdsh-view=conversation`，在官方「自动化任务」页按 F5 就掉回对话。

补丁：客户端注册一条 `shell.overlay`（id `workdsh-schedule-location`），
只补 `schedules` 这一格——`schedules` 不在 workdsh 的表里，两边不会互相改写。
深链必须在**任何 effect 改写 URL 之前**采样（在 `apply()` 里读），
并在官方 boot 恢复清空主面板后重放，稳定几拍即停手，不长期抢视图。

### 3. 页面内「创建提醒」100% 失败

官方 `schedule_create` 把 `title` 定为**必填**（缺失 / 空白 / 超 120 字符一律
`invalid_prompt`），且**绝不从指令派生标题**。宿主半侧 `buildCreateArgs` 只传
`prompt`，于是每次创建都失败并只回报笼统的 `tool-failed`。

补丁：宿主 `buildCreateArgs` 校验并透传 `title`（新增 `invalid_title` 文案），
客户端表单加必填「任务名称」输入。

> ⚠️ 这一条改的是**宿主半侧**（`dist/index.js`），需要重启 dsh 容器才生效；
> 前两条在客户端，改完刷新页面即生效。

## 验证

```bash
# 语法
node --check dist/index.js && node --check dist/client.browser.js

# 读路径（容器内直连）
curl -s -X POST http://127.0.0.1:3080/api/workdsh-schedule \
  -H 'content-type: application/json' \
  -d '{"endpoint":"overview","payload":{}}'
```

浏览器侧：打开 `?workdsh-view=schedules`（官方页）与 `?workdsh-view=automation`
（本插件页），在会话中创建一条提醒，两页都应列出它；在官方页按 F5 不应回到对话。

## 回滚

```bash
cp -a /data/dsh/tools/backups/workdsh-plugin-schedule.dist.bak.20261004063002/. \
      /data/dsh/tools/workdsh-plugin-schedule/dist/
# 客户端改动刷新即回滚；宿主改动需重启容器
```
