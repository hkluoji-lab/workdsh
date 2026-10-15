/**
 * workdsh-portal-auth —— 门户身份签名的共享实现（Host 侧）。
 *
 * 为什么单独一个模块：现在有两个插件要验同一份签名——身份桥（workdsh-identity-portal）
 * 与授权管理（workdsh-grant-admin）。签名载荷只要有一处写法不同，验签就会**静默恒失败**，
 * 表现为"权限好像没生效"，极难定位（`tests/signature.test.mjs` 就是为了拦这个）。
 * 所以载荷与算法只允许有一份实现。
 *
 * 载荷是字段数组的 JSON，而不是换行拼接：换行拼接在字段本身含分隔符时会产生歧义
 * （`{user:'a\nb'}` 与 `{user:'a',role:'b'}` 会拼成同一串），可被搬移字段伪造。
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'

export function signaturePayload({ username, role, jobRole, expires }) {
  return JSON.stringify([
    String(username ?? ''),
    String(role ?? ''),
    String(jobRole ?? ''),
    String(expires ?? ''),
  ])
}

export function computeSignature(secret, fields) {
  return createHmac('sha256', secret).update(signaturePayload(fields)).digest('hex')
}

/** 常量时间比对；长度不同直接判否（timingSafeEqual 对长度不等会抛）。 */
export function verifySignature(secret, fields, supplied) {
  if (typeof secret !== 'string' || secret === '') return false
  const expected = Buffer.from(computeSignature(secret, fields), 'utf8')
  const actual = Buffer.from(String(supplied ?? '').replace(/^v1=/, ''), 'utf8')
  if (expected.length !== actual.length) return false
  try {
    return timingSafeEqual(expected, actual)
  } catch {
    return false
  }
}

export function readSecret(file) {
  try {
    const raw = readFileSync(file, 'utf8').trim()
    return raw === '' ? null : raw
  } catch {
    return null
  }
}

/**
 * 从请求头还原一个**已验签**的门户身份。
 * 任何一步不成立都返回 null —— 调用方必须把它当作"没有身份"，而不是"身份不明但放行"。
 */
export function identityFromHeaders(headers, secret, names) {
  const source = headers ?? {}
  const username = String(source[names.user] ?? '').trim()
  if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) return null
  const role = String(source[names.role] ?? '').trim()
  const jobRole = String(source[names.jobRole] ?? '').trim()
  const expires = String(source[names.expires] ?? '').trim()
  if (!verifySignature(secret, { username, role, jobRole, expires }, source[names.signature])) return null
  return Object.freeze({ username, role, jobRole, expires, principalId: `portal:${username}` })
}

/** 站点管理岗位：能管理授权的主体集（与门户侧 roles.mjs 的口径保持一致）。 */
export const GRANT_ADMIN_JOB_ROLES = Object.freeze(['management', 'operations'])
