/**
 * workdsh-remote-shell —— 让「经反向代理访问的 Web 页面」被客户端认作宿主页面。
 *
 * 背景（2026-09-25 定位）：
 *   DSH 0.1.7-alpha.2 的 @deepseek-ai/dsh-client-ui-settings 用
 *   `ctx.remote.$host.isLoopback ? "host" : "memory"` 决定设置表单能否工作；
 *   而 dsh-client-connection 的 isLoopback 只认三种情况：
 *     transport.ownsHost === true || pageLocation === undefined ||
 *     isLoopbackHostname(pageLocation.hostname)
 *   经 https://dsh.10ge.cn 打开时三者皆假 → 设置镜像以 unavailable 起步、
 *   请求根本不发，设置→模型 固定报
 *   “加载提供商目录失败: settings are unavailable in this browser”。
 *   官方文档同口径：dsh-client-ui-settings/README.zh.md「非 loopback 页面没有
 *   持久化设置」。
 *
 * 做法：官方扩展点 webserver/index-inject（dsh-host-webserver 的
 *   collectIndexInjections 会 ctx.emit 一张注入表），在 index.html 的 <head>
 *   里注入一行 global，使页面拿到宿主语义。与官方
 *   dsh-client-connection 注入 __DSH_CONNECTION_RECOVERY__ 的写法完全一致。
 *
 * 影响面（全仓仅两处读 isLoopback）：设置表单可用；设置文档入口（“打开设置
 *   文档”）可用。写入仍走 /api/settings/*、/api/credentials/*，由 Caddy 的
 *   可信 Host 栅栏把关。
 *
 * 回滚：删掉 profile cordis.patch.yml 里对应 insert 行即可（补丁层热生效）。
 */
export const name = 'workdsh-remote-shell'

export function apply(ctx) {
  ctx.inject(['webServer'], (webCtx) => {
    webCtx.on('webserver/index-inject', (table) => {
      // 已有宿主壳（桌面端）注入时不要覆盖。
      if (table.some((row) => row?.kind === 'global' && row.name === '__DSH_TRANSPORT__')) return
      table.push({
        kind: 'global',
        name: '__DSH_TRANSPORT__',
        value: { ownsHost: true },
      })
    })
  })
}
