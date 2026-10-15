/**
 * workdsh-access-probe —— 授权决策探针（**仅沙箱**）。
 *
 * 它存在的唯一理由：P1「按账号主体」的阻塞不是"身份能不能解析"，而是
 * **切换之后既有资源还能不能被授权**。读代码能推断，但推断不是证据。
 * 这个探针用**真实资源、真实所有者**调用同一个 `workdshAccess.authorize` 入口，
 * 把判定结果与理由码直接打出来，并可在同一次请求里签发/撤销 grant 再判定一次。
 *
 * 路由：GET /workdsh-access-probe/run
 *   action=read|use|edit|manage   要判定的动作（默认 read）
 *   subject=<principalId>         被测主体（默认配置值）
 *   resourceId/revision/domain    覆盖被测资源（Gap2 要能对"新资源"提问）
 *   grant=1                       以所有者身份签发 read+use，然后再判定
 *   revoke=1                      撤销该主体在此资源上的全部 grant，并给出撤销后的判定
 *
 * 安全：本插件**不要**出现在生产 profile 补丁层。即使被加载，它也只签发
 * 「请求指定的那一个主体 × 那一个资源」的只读 grant，且需要显式 `?grant=1`。
 */
import { Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { randomUUID } from 'node:crypto'

const DEFAULTS = Object.freeze({
  organizationId: 'local-personal',
  fallbackPrincipalId: 'local-user',
  resourceDomain: 'workdsh-experts',
  resourceId: 'probe-resource',
  resourceRevision: 'probe-revision',
  ownerPrincipalId: 'local-user',
  subjectPrincipalId: 'portal:alice',
  probePath: '/workdsh-access-probe/run',
})

const Config = Schema.object({
  organizationId: Schema.string().default(DEFAULTS.organizationId),
  fallbackPrincipalId: Schema.string().default(DEFAULTS.fallbackPrincipalId),
  resourceDomain: Schema.string().default(DEFAULTS.resourceDomain),
  resourceId: Schema.string().default(DEFAULTS.resourceId),
  resourceRevision: Schema.string().default(DEFAULTS.resourceRevision),
  ownerPrincipalId: Schema.string().default(DEFAULTS.ownerPrincipalId),
  subjectPrincipalId: Schema.string().default(DEFAULTS.subjectPrincipalId),
  probePath: Schema.string().default(DEFAULTS.probePath),
})

/** 存储后端接受的 key：/^[a-zA-Z0-9_-]+$/ */
function pathSafe(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-')
}

function describe(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}

export default class AccessProbe extends Service {
  static inject = ['workdshAccess', 'workdshIdentity', 'storageDomain', 'webServer']
  static Config = Config

  constructor(ctx, config) {
    super(ctx, 'workdshAccessProbe')
    this.config = Object.freeze({ ...DEFAULTS, ...(config ?? {}) })
  }

  async [Service.init]() {
    try {
      this.ctx.webServer.register({
        kind: 'exact',
        path: this.config.probePath,
        handler: (request, response) => this._handle(request, response),
      })
    } catch (error) {
      this.ctx.logger?.warn?.('[workdsh-access-probe] 路由注册失败：' + describe(error))
    }
  }

  _owner() {
    return {
      organizationId: this.config.organizationId,
      ownerPrincipalId: this.config.ownerPrincipalId,
      scope: 'personal',
    }
  }

  /** 资源可被按请求覆盖——Gap2 要能对"刚创建的新资源"提问。 */
  _resource(url) {
    return {
      domain: url.searchParams.get('domain') ?? this.config.resourceDomain,
      id: url.searchParams.get('resourceId') ?? this.config.resourceId,
      revision: url.searchParams.get('revision') ?? this.config.resourceRevision,
    }
  }

  _actor(principalId) {
    return {
      principalId,
      organizationId: this.config.organizationId,
      requestId: randomUUID(),
      resolvedBy: 'workdsh-access-probe',
    }
  }

  async _decide(actor, action, resource) {
    const decision = await this.ctx.workdshAccess.authorize({
      actor,
      action,
      resource,
      owner: this._owner(),
    })
    return { effect: decision.effect, code: decision.code, revision: decision.authorizationRevision }
  }

  _grantsTable() {
    return this.ctx.storageDomain.get('workdsh_access').table('grants')
  }

  async _handle(request, response) {
    const url = new URL(request.url ?? '/', 'http://probe.local')
    const action = url.searchParams.get('action') ?? 'read'
    const subject = url.searchParams.get('subject') ?? this.config.subjectPrincipalId
    const resource = this._resource(url)
    const wantGrant = url.searchParams.get('grant') === '1'
    const wantRevoke = url.searchParams.get('revoke') === '1'

    const out = {
      fixture: { resource, owner: this._owner(), subject, organizationId: this.config.organizationId },
    }
    try {
      const subjectActor = this._actor(subject)
      out.subjectMembership = this.ctx.workdshIdentity.membership(this.config.organizationId, subject)?.state ?? null
      out.asSubject = await this._decide(subjectActor, action, resource)

      // 所有者在切换后仍是 local-user（回退路径），用来签发/撤销
      const ownerActor = await this.ctx.workdshIdentity.resolve({})
      out.ownerActor = ownerActor.principalId
      out.asOwner = await this._decide(ownerActor, action, resource)

      if (wantRevoke) {
        const revoked = []
        const revokeErrors = []
        try {
          for (const [id, grant] of this._grantsTable().entries()) {
            if (grant.subjectPrincipalId !== subject) continue
            if (grant.resource?.domain !== resource.domain || grant.resource?.id !== resource.id) continue
            try {
              await this.ctx.workdshAccess.revokeGrant(ownerActor, this._owner(), id, grant.revision)
              revoked.push(id)
            } catch (error) {
              revokeErrors.push({ id, error: describe(error) })
            }
          }
        } catch (error) {
          revokeErrors.push({ id: '*', error: describe(error) })
        }
        out.revoked = revoked
        if (revokeErrors.length) out.revokeErrors = revokeErrors
        // 撤销之后的判定：这才是"未授权初态"的证据
        out.afterRevoke_asSubject = await this._decide(subjectActor, action, resource)
      }

      if (wantGrant) {
        const grant = {
          // 主体 id 里的 ':' 会让 key 非法，必须净化
          id: pathSafe(`probe-grant-${subject}-${resource.id}`),
          organizationId: this.config.organizationId,
          subjectPrincipalId: subject,
          resource,
          actions: ['read', 'use'],
          revision: `probe-${randomUUID()}`,
        }
        try {
          await this.ctx.workdshAccess.putGrant(ownerActor, this._owner(), grant)
          out.grant = { issued: true, id: grant.id }
        } catch (error) {
          out.grant = { issued: false, error: describe(error), code: error?.code ?? null }
        }
        out.afterGrant_asSubject = await this._decide(subjectActor, action, resource)
      }
    } catch (error) {
      out.error = describe(error)
      out.errorCode = error?.code ?? null
    }
    out.ok = out.error === undefined
    response.statusCode = 200
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(JSON.stringify(out, null, 2))
  }
}
