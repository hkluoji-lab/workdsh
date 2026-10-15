/**
 * workdsh-grant-admin —— 资源授权管理（Host 半边）。
 *
 * 补的是 A 方案的缺口 1：岗位策略只覆盖"站点公共资源"，但真实运营还需要**逐资源**的例外
 * （某个人要给某个专家 edit、某个外部同事只给某一个文档 read……）。本插件把这件事做成接口，
 * 面板据此提供「资源授权」页。
 *
 * 调用链：浏览器 → 门户 `/api/portal/grants*`（校验门户会话 + 管理员）
 *              → 本插件 `/workdsh-grant-admin/*`（带**已签名**的门户身份头）
 *              → `workdshAccess.putGrant/revokeGrant`（以**调用者**身份执行）
 *
 * 两道防线，缺一不可：
 *   1. 本插件必须验签（容器内 127.0.0.1:3080 可达，仅凭请求头不能当身份依据）；
 *   2. 授权动作以**调用者**身份提交，于是 DSH 访问层自己会判断"你到底能不能管这个资源"
 *      —— 插件不做权限判定，只做身份与岗位门槛，判定交给唯一的授权真源。
 *
 * 为什么不放在门户里做：grant 存在 DSH 的 storage domain 里，跨进程不可直接写；
 * 且授权判定必须在 DSH 内部发生，否则就出现了第二套权限口径。
 */
import { Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  GRANT_ADMIN_JOB_ROLES,
  identityFromHeaders,
  readSecret,
} from '../../workdsh-portal-auth/index.js'

const DEFAULTS = Object.freeze({
  organizationId: 'local-personal',
  siteOwnerPrincipalId: 'local-user',
  secretFile: '/data/dsh/portal/identity-bridge.key',
  storageRoot: '/data/dsh/storages',
  rosterFile: '/data/dsh/storages/workdsh_identity_portal/principals.json',
  userHeader: 'x-portal-user',
  roleHeader: 'x-portal-role',
  jobRoleHeader: 'x-portal-job-role',
  expiresHeader: 'x-portal-expires',
  signatureHeader: 'x-portal-sig',
  basePath: '/workdsh-grant-admin',
  /** 允许管理授权的岗位角色（与门户 roles.mjs 口径一致）。 */
  adminJobRoles: GRANT_ADMIN_JOB_ROLES.join(','),
  /** 允许授予的动作白名单。 */
  allowedActions: 'read,use,edit,manage',
})

const Config = Schema.object({
  organizationId: Schema.string().default(DEFAULTS.organizationId),
  siteOwnerPrincipalId: Schema.string().default(DEFAULTS.siteOwnerPrincipalId),
  secretFile: Schema.string().default(DEFAULTS.secretFile),
  storageRoot: Schema.string().default(DEFAULTS.storageRoot),
  rosterFile: Schema.string().default(DEFAULTS.rosterFile),
  userHeader: Schema.string().default(DEFAULTS.userHeader),
  roleHeader: Schema.string().default(DEFAULTS.roleHeader),
  jobRoleHeader: Schema.string().default(DEFAULTS.jobRoleHeader),
  expiresHeader: Schema.string().default(DEFAULTS.expiresHeader),
  signatureHeader: Schema.string().default(DEFAULTS.signatureHeader),
  basePath: Schema.string().default(DEFAULTS.basePath),
  adminJobRoles: Schema.string().default(DEFAULTS.adminJobRoles),
  allowedActions: Schema.string().default(DEFAULTS.allowedActions),
})

const pathSafe = (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, '-')
const describe = (error) => (error instanceof Error ? `${error.name}: ${error.message}` : String(error))

function readRecord(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return parsed?.record ?? parsed
  } catch {
    return null
  }
}

function listRecords(dir) {
  let names = []
  try { names = readdirSync(dir) } catch { return [] }
  return names.filter((n) => n.endsWith('.json'))
    .map((n) => readRecord(join(dir, n)))
    .filter(Boolean)
}

export default class GrantAdmin extends Service {
  static inject = ['workdshAccess', 'workdshIdentity', 'storageDomain', 'webServer']
  static Config = Config

  constructor(ctx, config) {
    super(ctx, 'workdshGrantAdmin')
    this.config = Object.freeze({ ...DEFAULTS, ...(config ?? {}) })
    this._secret = null
    this._secretReadAt = 0
  }

  async [Service.init]() {
    // 与身份桥同样的失败安全：密钥不可用 → 一律 401，绝不"没有身份也放行"。
    this._secret = readSecret(this.config.secretFile)
    for (const [suffix, handler] of [
      ['/summary', (req, res, url, identity) => this._summary(res, url, identity)],
      ['/apply', (req, res, url, identity) => this._mutate(req, res, 'apply', identity)],
      ['/revoke', (req, res, url, identity) => this._mutate(req, res, 'revoke', identity)],
    ]) {
      try {
        this.ctx.webServer.register({
          kind: 'exact',
          path: `${this.config.basePath}${suffix}`,
          handler: (request, response) => this._guard(request, response, handler),
        })
      } catch (error) {
        this.ctx.logger?.warn?.(`[workdsh-grant-admin] 路由 ${suffix} 注册失败：` + describe(error))
      }
    }
  }

  _secretNow() {
    if (this._secret !== null) return this._secret
    if (Date.now() - this._secretReadAt < 5000) return null
    this._secretReadAt = Date.now()
    this._secret = readSecret(this.config.secretFile)
    return this._secret
  }

  /** 统一入口：验签 → 岗位门槛 → 交给具体 handler。 */
  async _guard(request, response, handler) {
    const secret = this._secretNow()
    if (secret === null) return this._json(response, 503, { ok: false, error: 'bridge-unavailable' })
    const identity = identityFromHeaders(request.headers, secret, {
      user: this.config.userHeader,
      role: this.config.roleHeader,
      jobRole: this.config.jobRoleHeader,
      expires: this.config.expiresHeader,
      signature: this.config.signatureHeader,
    })
    if (identity === null) return this._json(response, 401, { ok: false, error: 'unauthenticated' })
    const admins = this.config.adminJobRoles.split(',').map((v) => v.trim()).filter(Boolean)
    // 平台管理员（门户 role=admin）与授权管理岗位都可进入；否则 403。
    if (identity.role !== 'admin' && !admins.includes(identity.jobRole)) {
      return this._json(response, 403, { ok: false, error: 'forbidden', jobRole: identity.jobRole })
    }
    try {
      await handler(request, response, new URL(request.url ?? '/', 'http://grant.local'), identity)
    } catch (error) {
      this._json(response, 500, { ok: false, error: 'internal', message: describe(error) })
    }
  }

  _actor(identity) {
    return {
      principalId: identity.principalId,
      organizationId: this.config.organizationId,
      requestId: randomUUID(),
      resolvedBy: 'workdsh-grant-admin',
    }
  }

  _resources() {
    const out = []
    for (const record of listRecords(join(this.config.storageRoot, 'workdsh_experts', 'experts'))) {
      if (!record.id || !record.owner) continue
      out.push({
        domain: 'workdsh-experts', id: String(record.id), revision: String(record.revision ?? ''),
        label: record.name ?? String(record.id), owner: record.owner,
      })
    }
    for (const record of listRecords(join(this.config.storageRoot, 'workdsh_office', 'documents'))) {
      if (!record.documentId || !record.owner) continue
      out.push({
        domain: 'office', id: String(record.documentId), revision: String(record.revision ?? ''),
        label: record.title ?? String(record.documentId).slice(0, 12), owner: record.owner,
      })
    }
    return out
  }

  _grantsTable() {
    try { return this.ctx.storageDomain.get('workdsh_access').table('grants') } catch { return null }
  }

  _roster() {
    try {
      const parsed = JSON.parse(readFileSync(this.config.rosterFile, 'utf8'))
      return (parsed?.principals ?? []).map((entry) => ({
        principalId: entry.principalId, username: entry.username ?? null,
        jobRole: entry.jobRole ?? null, role: entry.role ?? null,
      }))
    } catch {
      return []
    }
  }

  async _summary(response, _url, identity) {
    const table = this._grantsTable()
    const grants = table ? [...table.entries()].map(([id, grant]) => ({
      id, subjectPrincipalId: grant.subjectPrincipalId, actions: grant.actions,
      resource: grant.resource, revision: grant.revision,
    })) : []
    return this._json(response, 200, {
      ok: true,
      caller: { principalId: identity.principalId, jobRole: identity.jobRole, role: identity.role },
      resources: this._resources().map(({ owner, ...rest }) => ({ ...rest, ownerPrincipalId: owner?.ownerPrincipalId ?? null })),
      subjects: this._roster(),
      grants,
      allowedActions: this.config.allowedActions.split(',').map((v) => v.trim()).filter(Boolean),
      adminJobRoles: this.config.adminJobRoles.split(',').map((v) => v.trim()).filter(Boolean),
    })
  }

  async _mutate(request, response, mode, identity) {
    const body = await readJsonBody(request)
    if (body === null) return this._json(response, 400, { ok: false, error: 'malformed' })
    const actor = this._actor(identity)
    const table = this._grantsTable()

    if (mode === 'revoke') {
      const grantId = String(body.grantId ?? '')
      const current = table?.get(grantId)
      if (!current) return this._json(response, 404, { ok: false, error: 'not-found' })
      const resource = this._resources().find((entry) => entry.domain === current.resource?.domain && entry.id === current.resource?.id)
      const owner = {
        organizationId: current.organizationId,
        ownerPrincipalId: resource?.owner?.ownerPrincipalId ?? this.config.siteOwnerPrincipalId,
        scope: resource?.owner?.scope ?? 'personal',
      }
      try {
        await this.ctx.workdshAccess.revokeGrant(actor, owner, grantId, current.revision)
        return this._json(response, 200, { ok: true, revoked: grantId })
      } catch (error) {
        return this._json(response, 403, { ok: false, error: 'denied', message: describe(error) })
      }
    }

    // apply
    const allowed = new Set(this.config.allowedActions.split(',').map((v) => v.trim()).filter(Boolean))
    const actions = (Array.isArray(body.actions) ? body.actions : [])
      .map((v) => String(v)).filter((v) => allowed.has(v))
    if (actions.length === 0) return this._json(response, 400, { ok: false, error: 'no-valid-actions' })
    const subject = String(body.subjectPrincipalId ?? '')
    if (!subject) return this._json(response, 400, { ok: false, error: 'missing-subject' })
    const resource = this._resources().find((entry) => entry.domain === body.domain && entry.id === body.id)
    if (!resource) return this._json(response, 404, { ok: false, error: 'resource-not-found' })

    const id = pathSafe(body.grantId ?? `grant-${resource.domain}-${resource.id}-${subject}`)
    const current = table?.get(id)
    try {
      await this.ctx.workdshAccess.putGrant(actor, {
        organizationId: this.config.organizationId,
        ownerPrincipalId: resource.owner?.ownerPrincipalId,
        scope: resource.owner?.scope ?? 'personal',
      }, {
        id,
        organizationId: this.config.organizationId,
        subjectPrincipalId: subject,
        resource: { domain: resource.domain, id: resource.id, revision: resource.revision },
        actions,
        revision: `grant-${randomUUID()}`,
      }, current ? current.revision : undefined)
      return this._json(response, 200, { ok: true, id, actions, subject, resource: `${resource.domain}/${resource.id}` })
    } catch (error) {
      // 访问层拒绝（调用者不是所有者、也没有 manage）会走到这里——这正是我们要的判定。
      return this._json(response, 403, { ok: false, error: 'denied', message: describe(error) })
    }
  }

  _json(response, status, payload) {
    response.statusCode = status
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(JSON.stringify(payload))
  }
}

function readJsonBody(request) {
  return new Promise((resolve) => {
    let raw = ''
    let tooLarge = false
    request.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 64 * 1024) { tooLarge = true; request.destroy() }
    })
    request.on('end', () => {
      if (tooLarge) return resolve(null)
      try { resolve(raw === '' ? {} : JSON.parse(raw)) } catch { resolve(null) }
    })
    request.on('error', () => resolve(null))
  })
}
