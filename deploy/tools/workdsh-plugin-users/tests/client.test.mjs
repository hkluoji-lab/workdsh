// 客户端 bundle 的离线验证：不启动 DSH、不开浏览器，直接把真实 bundle 跑一遍。
//
// 验证什么：
//   1. bundle 语法可解析、能通过 __ModuleLoader__ 注册；
//   2. factory 只向 require() 要 react 这一个 peer；
//   3. apply(ctx) 只在 settings.section 上注册一节「用户与权限」；
//   4. 注册项形状符合官方槽位契约（name/id/label/order）；
//   5. 首屏（未拿到账号数据时）只渲染自身样式与标题，不发起请求、不碰宿主 DOM。
//
// 位置口径（用户 2026-09-27 决定）：设置内一节，**不做左侧导航行、不占页脚**。
// 因此这里断言的是 settings.section，而不是曾经的 sidebar.footer.action。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import vm from 'node:vm'

const BUNDLE = resolve('/data/dsh/tools/workdsh-plugin-users/dist/client.browser.js')

let pass = 0
let fail = 0
const ok = (name, condition, extra = '') => {
  if (condition) { pass += 1; console.log(`  PASS ${name}`) }
  else { fail += 1; console.log(`  FAIL ${name}  ${extra}`) }
}

const source = readFileSync(BUNDLE, 'utf8')

// --- 捕获 __ModuleLoader__.load ---
let captured = null
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(entry) { captured = entry },
    },
  },
  fetch: () => Promise.reject(new Error('不应在注册阶段发起请求')),
  console,
}
sandbox.window.window = sandbox.window
sandbox.globalThis = sandbox

vm.createContext(sandbox)
vm.runInContext(source, sandbox, { filename: 'client.browser.js' })

console.log('[1] bundle 注册')
ok('通过 __ModuleLoader__ 注册了条目', captured !== null)
ok('注册 id 为 workdsh-plugin-users', captured?.id === 'workdsh-plugin-users', String(captured?.id))
ok('factory 是函数', typeof captured?.factory === 'function')

console.log('\n[2] peer 依赖')
const requested = []
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [initial, () => {}],
  useEffect: () => {},
  useCallback: (fn) => fn,
  Fragment: Symbol('Fragment'),
}
const module = captured.factory((name) => {
  requested.push(name)
  if (name === 'react') return reactStub
  throw new Error(`未声明的 peer 依赖: ${name}`)
})
ok('只依赖 react', requested.length === 1 && requested[0] === 'react', JSON.stringify(requested))
ok('导出 name', module.name === 'workdsh-users-client', String(module.name))
ok('导出 inject 含 slots', Array.isArray(module.inject) && module.inject.includes('slots'), JSON.stringify(module.inject))
ok('导出 apply 函数', typeof module.apply === 'function')

console.log('\n[3] 槽位注册（设置内一节，不占导航/页脚）')
const registrations = []
const ctx = {
  slots: {
    inject(slotName, factory) {
      registrations.push({ slotName, factory })
    },
    register(options, component) {
      return { options, component }
    },
  },
}
module.apply(ctx)
ok('恰好注册一个槽位', registrations.length === 1, JSON.stringify(registrations.map((r) => r.slotName)))
ok('注册到 settings.section', registrations[0]?.slotName === 'settings.section', String(registrations[0]?.slotName))

const registered = registrations[0].factory()
ok('注册项 name 与槽位一致', registered.options.name === 'settings.section', JSON.stringify(registered.options))
ok('节 id 为 users', registered.options.id === 'users', String(registered.options.id))
ok('节标签为「用户与权限」', registered.options.label === '用户与权限', String(registered.options.label))
ok('节 order 为 16（紧随「插件」之后）', registered.options.order === 16, String(registered.options.order))
ok('组件是函数组件', typeof registered.component === 'function')
ok('未再注册 sidebar 导航/页脚槽', !registrations.some((r) => r.slotName.startsWith('sidebar.')), JSON.stringify(registrations.map((r) => r.slotName)))

console.log('\n[4] 不触碰宿主能力')
ok('inject 未请求 layout/sessions 等宿主服务', !module.inject.includes('layout') && !module.inject.includes('sessions'), JSON.stringify(module.inject))

console.log('\n[5] 首屏渲染形状')
const first = registered.component()
const children = (first && first.children) || []
const styleNode = children.find((child) => child && child.type === 'style')
ok('首屏渲染了 style 节点', Boolean(styleNode), JSON.stringify(children.map((c) => c && String(c.type))))
// USERS_STYLE 是以数组形式作为单个 child 传入的，这里必须摊平后再拼接，
// 否则 Array#toString 会在规则之间插入逗号，作用域检查会误报。
const cssText = styleNode ? [].concat(styleNode.children).flat(Infinity).join('') : ''
ok('样式使用自有类名与技术栈无关', cssText.includes('.wd-usr{') && cssText.includes('.wd-usr-tabs'))

// 回归防线（比字符串匹配更严格）：**每一条 CSS 规则都必须以 .wd-usr 开头**。
// 旧实现靠改写宿主容器的全局规则（div:has(> [data-slot='sidebar.footer.action']){flex-wrap:wrap}）
// 来抢占页脚位置，正是被用户否掉的做法；作用域不越界就不会再影响宿主外观。
const selectors = cssText.split('}').map((part) => part.split('{')[0].trim()).filter((part) => part !== '')
const unscoped = selectors.filter((selector) => !selector.startsWith('.wd-usr'))
ok('所有 CSS 规则都作用域在 .wd-usr 之内', unscoped.length === 0, JSON.stringify(unscoped.slice(0, 3)))
ok('不含任何 data-slot / :has() 宿主选择器', !cssText.includes('[data-slot=') && !cssText.includes('div:has('))

/** 递归收集渲染树里的文本，用来判断标题是否真的落在树里。 */
const collectText = (node) => {
  if (node === null || node === undefined) return []
  if (typeof node === 'string' || typeof node === 'number') return [String(node)]
  if (Array.isArray(node)) return node.flatMap(collectText)
  return collectText(node.children)
}
const texts = collectText(children)
ok('首屏渲染了标题「用户与权限」', texts.includes('用户与权限'), JSON.stringify(texts.slice(0, 6)))
ok('未拿到账号数据时不渲染表格', !children.some((child) => child && child.type === 'table'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
