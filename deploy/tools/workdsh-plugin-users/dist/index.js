/**
 * workdsh-plugin-users —— 宿主半边。
 *
 * 这个插件**没有宿主逻辑**：用户管理的数据与授权都在门户（portal）那一侧，
 * 浏览器用同源请求直接访问 /api/portal/users*，门户自己校验管理员会话。
 *
 * 宿主半边保持空实现是有意的：宿主插件在加载期抛错会让**整棵插件树**失败、
 * 容器直接起不来。这里不放任何可能失败的东西。
 *
 * 顺带一句边界：本插件只呈现门户已有的账号信息，不新建身份体系、不写领域数据。
 */
export const name = 'workdsh-plugin-users'

export function apply() {
  // 有意为空：客户端半边见 package.json 的 dsh.client 与 dist/client.browser.js。
}
