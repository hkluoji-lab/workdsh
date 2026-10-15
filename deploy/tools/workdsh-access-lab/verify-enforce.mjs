// C4 沙箱验证 —— 技能/连接器的授权判定点是否真的生效（含技能侧、幂等、并发）。
//
// 前置：沙箱实例已在 BASE 跑起来（profile=p1sandbox）；enforce 由补丁层控制，两轮共用本脚本。
// 运行：node verify-enforce.mjs
//
// 关于测试目标的选择（踩过坑，别再改回去）：
//   本项目是**逐资源** grant 模型：管理岗位的 manage 也是按资源逐条签发的。
//   所以不能用「不存在的 id」去测管理岗位放行——那个 id 不在枚举里，谁都没有 grant，
//   管理岗位一样被拒（那不是缺陷，是模型本身）。
//   连接器侧用真实存在但无关紧要的 id；技能侧用「对已启用技能再 enable」这种无副作用操作。
import { readFileSync } from 'node:fs'
import { computeSignature } from '/data/dsh/tools/workdsh-identity-portal/dist/index.js'

const BASE = process.env.BASE ?? 'http://127.0.0.1:3099'
const KEY_FILE = process.env.KEY_FILE ?? '/data/dsh/tmp/p1sandbox-home/identity-bridge.key'
const STATUS_FILE = process.env.STATUS_FILE ?? '/data/dsh/tmp/p1sandbox-home/access-enforce-status.json'
const TARGET = process.env.TARGET ?? 'mastergo-mastergo'
const EXPIRES = Date.now() + 3600_000
const secret = readFileSync(KEY_FILE, 'utf8').trim()

const headersFor = (username, role, jobRole) => {
  const fields = { username, role, jobRole, expires: String(EXPIRES) }
  return {
    'X-Portal-User': username, 'X-Portal-Role': role, 'X-Portal-Job-Role': jobRole,
    'X-Portal-Expires': String(EXPIRES), 'X-Portal-Sig': `v1=${computeSignature(secret, fields)}`,
    'Content-Type': 'application/json',
  }
}
const postTo = async (path, headers, body) => {
  const r = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'manual' })
  return { status: r.status, body: (await r.text()).slice(0, 240) }
}
const post = (h, b) => postTo('/api/workdsh-connectors', h, b)
const postSkills = (h, b) => postTo('/api/workdsh-skills', h, b)
const setEnabled = (h, id, enabled) => post(h, { endpoint: 'set-enabled', payload: { id, enabled } })

const IDENT = {
  alice: headersFor('alice', 'user', 'sales'),
  bob: headersFor('bob', 'user', 'management'),
  carol: headersFor('carol', 'user', 'service'),
}

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  PASS ${name}`) } else { fail += 1; console.log(`  FAIL ${name}  ${extra}`) }
}
// 被拦的判别依据（有证据）：连接器插件的 catch 只认 4 个已知码，未知异常一律
// connector/internal +「请重试」；技能插件则是「message 以 skill/ 开头就原样当错误码」。
const blocked = (res) => /connector\/(internal|access-not-granted)/.test(res.body)
const passedGuard = (res) => !blocked(res)

let enforce = false
try { enforce = JSON.parse(readFileSync(STATUS_FILE, 'utf8')).enforce === true } catch {}
console.log(`[环境] BASE=${BASE} enforce=${enforce}（${enforce ? '拦截轮' : 'dry-run 轮'}） 连接器目标=${TARGET}\n`)

console.log('[1] 只读功能不受影响')
const list = await post(IDENT.alice, { endpoint: 'list', payload: {} })
ok('alice 读连接器列表不被拦', passedGuard(list), `${list.status} ${list.body}`)

console.log('\n[2] 连接器 · 普通成员 alice（sales，只有 read/use）')
const a = await setEnabled(IDENT.alice, TARGET, false)
console.log(`  alice → ${a.status} ${a.body}`)
if (enforce) ok('alice 被拦（异常在调用原方法之前抛出）', blocked(a), a.body)
else ok('dry-run 只记录不拦（正常落到原方法）', passedGuard(a), a.body)

console.log('\n[3] 连接器 · 服务岗位 carol（同样只有 read/use）')
const c = await setEnabled(IDENT.carol, TARGET, false)
console.log(`  carol → ${c.status} ${c.body}`)
if (enforce) ok('carol 被拦', blocked(c), c.body)
else ok('dry-run 只记录不拦', passedGuard(c), c.body)

console.log('\n[4] 连接器 · 管理岗位 bob（基线 + manage）')
const b = await setEnabled(IDENT.bob, TARGET, false)
console.log(`  bob   → ${b.status} ${b.body}`)
ok('bob 通过授权判定（未被拦，落到原方法）', passedGuard(b), b.body)

console.log('\n[5] 还原状态')
const restore = await setEnabled(IDENT.bob, TARGET, true)
console.log(`  bob 还原 → ${restore.status} ${restore.body}`)

console.log('\n[6] 状态文件自检')
try {
  const status = JSON.parse(readFileSync(STATUS_FILE, 'utf8'))
  ok('10 个技能方法已包装', status.wrapped.filter((k) => k.startsWith('skills.')).length === 10)
  ok('4 个连接器方法已包装', status.wrapped.filter((k) => k.startsWith('connectors.')).length === 4)
  ok('无未包装项', status.missing.length === 0 && status.failed.length === 0, JSON.stringify({ missing: status.missing, failed: status.failed }))
  const den = status.decisions.filter((d) => d.effect === 'deny')
  const alw = status.decisions.filter((d) => d.effect === 'allow')
  console.log(`  最近判定：allow=${alw.length} deny=${den.length}`)
  ok('普通成员/服务岗位出现 deny', den.some((d) => ['portal:alice', 'portal:carol'].includes(d.principalId)))
  ok('管理岗位出现 allow', alw.some((d) => d.principalId === 'portal:bob'))
} catch (error) { fail += 1; console.log(`  FAIL 状态文件不可读：${error.message}`) }

// ── 技能侧 ────────────────────────────────────────────────────────────────
// 请求形状（实测 workdsh-plugin-skills/dist/services/connection-api.js）：
//   { endpoint: "batch" | "detail" | …, payload: { names: [...] } | { name } }
// 安全性：用「对已启用技能执行 enable」——即使被放行执行，也只是无副作用的操作。
console.log('\n[7] 技能侧（域级 * 资源；用「已启用技能再 enable」保证无副作用）')
const skillRead = await postSkills(IDENT.alice, { endpoint: 'detail', payload: { name: 'cs-lead-sop' } })
ok('alice 读技能详情不被拦', !/access-not-granted/.test(skillRead.body), `${skillRead.status} ${skillRead.body}`)
const skA = await postSkills(IDENT.alice, { endpoint: 'batch', payload: { names: ['cs-lead-sop'], action: 'enable' } })
console.log(`  alice batch(enable) → ${skA.status} ${skA.body}`)
if (enforce) ok('alice 域级技能操作被拦且透出真实错误码', /skill\/access-not-granted/.test(skA.body), skA.body)
else ok('dry-run 不拦（落到原方法）', !/access-not-granted/.test(skA.body), skA.body)
const skB = await postSkills(IDENT.bob, { endpoint: 'batch', payload: { names: ['cs-lead-sop'], action: 'enable' } })
console.log(`  bob   batch(enable) → ${skB.status} ${skB.body}`)
ok('bob 域级技能操作通过判定', !/access-not-granted/.test(skB.body), skB.body)

// ── 幂等与并发 ─────────────────────────────────────────────────────────────
console.log('\n[8] 幂等、并发与状态不变性')
const snap = async () => (await post(IDENT.bob, { endpoint: 'list', payload: {} })).body
const stateBefore = await snap()
const repeats = []
for (let i = 0; i < 3; i += 1) repeats.push(await setEnabled(IDENT.alice, TARGET, false))
ok(`alice 串行重复 3 次结果一致（${enforce ? '都被拦' : '都落到原方法'}）`,
  repeats.every((r) => (enforce ? blocked(r) : passedGuard(r))), JSON.stringify(repeats.map((r) => r.body.slice(0, 50))))
const parallel = await Promise.all(Array.from({ length: 8 }, () => setEnabled(IDENT.alice, TARGET, false)))
ok('alice 并发 8 次结果一致（无竞态放行）',
  parallel.every((r) => (enforce ? blocked(r) : passedGuard(r))), JSON.stringify(parallel.map((r) => r.body.slice(0, 40))))
ok('被拒/重复调用未改变连接器状态（前后逐字节一致）', stateBefore === (await snap()), '状态发生变化')
const bobTwice = [await setEnabled(IDENT.bob, TARGET, false), await setEnabled(IDENT.bob, TARGET, false)]
ok('bob 重复调用都通过判定（无双重包装副作用）', bobTwice.every(passedGuard), JSON.stringify(bobTwice.map((r) => r.body.slice(0, 50))))
await setEnabled(IDENT.bob, TARGET, true)
try {
  const st = JSON.parse(readFileSync(STATUS_FILE, 'utf8'))
  ok('包装未重复施加（wrapped=14、already=0）', st.wrapped.length === 14 && st.already.length === 0,
    JSON.stringify({ wrapped: st.wrapped.length, already: st.already.length }))
  const denies = st.decisions.filter((d) => d.effect === 'deny').length
  ok('并发拒绝都被记录（无静默放行）', denies >= 8, `deny=${denies}`)
} catch (error) { fail += 1; console.log(`  FAIL 状态文件不可读：${error.message}`) }

console.log(`\n结果：PASS=${pass} FAIL=${fail}`)
process.exit(fail === 0 ? 0 : 1)
