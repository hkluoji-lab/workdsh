/**
 * workdsh-identity-portal —— P1 身份打通（Host 半边）。
 *
 * 目标：让门户的每个登录账号成为 DSH 内部**各自独立的主体**，从而让岗位角色与权限
 * 在工作台里真正生效；而不是所有人在 DSH 里都等于同一个 owner。
 *
 * 为什么这样做（全部是实测过的接口事实，不是推测）：
 *   1. 门户 `/api/portal/auth` 已经返回 `X-Portal-User`，而 Caddy 的门禁用 `forward_auth`，
 *      会把认证端点的响应头复制进上游请求——**DSH 侧本来就能收到这个头**，此前没有任何消费者。
 *   2. `connection/request` 是覆盖每个已认证 API 请求的 waterfall，签名是
 *      `(request: IncomingMessage, response: ServerResponse, next) => Promise<void>`。
 *      它给出原始请求（含 headers）与 `next`，正好可以在 `next()` 外面套一层异步上下文。
 *   3. 访问层取主体的方式固定是 `ctx.workdshIdentity.resolve({ sessionId })`：
 *      **按会话解析，不按请求**。所以单靠请求头不够，必须让 identity 服务自己
 *      既看得见"当前请求是谁"，又记得"这个会话归属于谁"。
 *
 * 解析顺序（保守优先，保证上线不打断既有会话）：
 *   ① 会话已有归属绑定（workdsh_runtime_binding）→ 以绑定为准。
 *      上线前创建的会话绑定的是 `local-user`，因此它们**继续以 local-user 身份工作**，
 *      不会因为引入按账号身份而整体失配。
 *   ② 请求作用域内有已验签的门户身份 → 用该账号（新会话在创建时就绑定到它）。
 *   ③ 都没有 → 兜底主账号 `local-user`，与今天的行为完全一致。
 *
 * 信任锚：门户用共享密钥对身份做 HMAC 签名，本插件验签后才认。
 * 仅凭"客户端能发一个头"是不足以作为身份依据的——容器内 127.0.0.1:3080 是可达的。
 * 密钥文件缺失或验签失败时**不抛错、不阻断请求**，只是退回兜底主账号（失败关闭到既有行为）。
 *
 * ⚠️ **不要用 JS `#私有字段` 保存状态**：Cordis 会代理服务对象以做上下文隔离，
 * 代理后 `this` 不是声明类本身，私有字段会抛
 * "Cannot read private member #x from an object whose class did not declare it"。
 * 官方 `LocalIdentityService` 同样用普通字段（currentProfile/configured/provider）而不用 #。
 * 这个坑是沙箱探针在跨插件调用 `membership()` 时抓到的。
 *
 * 失败安全：本插件初始化绝不抛异常。宿主插件在加载期抛错会让整棵插件树失败、容器起不来，
 * 这个代价远高于"身份没打通"。
 */
import { Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** ActorContext 各字段的硬约束（与访问层 governance 校验一致：≤256、无控制字符）。 */
const IDENTITY_RE = /^[A-Za-z0-9._:-]{1,256}$/

/** 代码侧默认值：loader 会按 static Config 先补一遍，这里再兜一次，避免少传就崩。 */
const DEFAULTS = Object.freeze({
  organizationId: 'local-personal',
  organizationName: '本地个人空间',
  fallbackPrincipalId: 'local-user',
  secretFile: '/data/dsh/portal/identity-bridge.key',
  rosterFile: '/data/dsh/storages/workdsh_identity_portal/principals.json',
  userHeader: 'x-portal-user',
  roleHeader: 'x-portal-role',
  jobRoleHeader: 'x-portal-job-role',
  expiresHeader: 'x-portal-expires',
  signatureHeader: 'x-portal-sig',
  requireSignature: true,
  whoamiPath: '/workdsh-identity/whoami',
  /**
   * 授权就绪标记文件（空 = 不做门控）。
   *
   * 非空时：文件不存在 → **不认任何门户身份**，一律退回兜底主体。
   * 这是启用期的 fail-closed 闸门：由收敛工具在"一轮授权完全成功"后写出，
   * 因此绝不会出现"用户获得了独立主体、却对任何资源都没权限"的锁定窗口。
   */
  activationFile: '',
})

const Config = Schema.object({
  organizationId: Schema.string().default(DEFAULTS.organizationId),
  organizationName: Schema.string().default(DEFAULTS.organizationName),
  /** 兜底主体：请求里没有可信门户身份时用它，保持与启用本插件之前完全一致的行为。 */
  fallbackPrincipalId: Schema.string().default(DEFAULTS.fallbackPrincipalId),
  /** 门户写入的共享密钥文件（0600）。不存在则只启用兜底路径。 */
  secretFile: Schema.string().default(DEFAULTS.secretFile),
  /** 已见主体的花名册：重启后仍能承认既有会话的所有者。 */
  rosterFile: Schema.string().default(DEFAULTS.rosterFile),
  userHeader: Schema.string().default(DEFAULTS.userHeader),
  roleHeader: Schema.string().default(DEFAULTS.roleHeader),
  jobRoleHeader: Schema.string().default(DEFAULTS.jobRoleHeader),
  expiresHeader: Schema.string().default(DEFAULTS.expiresHeader),
  signatureHeader: Schema.string().default(DEFAULTS.signatureHeader),
  /** 是否强制验签。默认 true；置 false 只用于沙箱排查，生产不要关。 */
  requireSignature: Schema.boolean().default(DEFAULTS.requireSignature),
  /** 诊断端点：回显调用者被解析成谁。只暴露调用者自身信息，不含任何密钥。 */
  whoamiPath: Schema.string().default(DEFAULTS.whoamiPath),
  /** 诊断用：无绑定会话的探针 id 与已有绑定会话的探针 id。 */
  newSessionProbeId: Schema.string().default(DEFAULTS.newSessionProbeId),
  legacySessionProbeId: Schema.string().default(DEFAULTS.legacySessionProbeId),
  activationFile: Schema.string().default(DEFAULTS.activationFile),
})

export default class PortalIdentityService extends Service {
  static inject = ['storageDomain', 'webServer']
  static Config = Config

  constructor(ctx, config) {
    super(ctx, 'workdshIdentity')
    this.id = 'workdsh-identity-portal'
    this.config = Object.freeze({ ...DEFAULTS, ...(config ?? {}) })
    this.organizationId = this.config.organizationId
    this._storage = new AsyncLocalStorage()
    // 会话 → 主体：仅在缺少正式归属绑定时作为进程内缓存使用（见 _bindingOf）。
    this._warned = new Set()
  }

  _storage
  _secret = null
  _secretAttemptedAt = 0
  _roster = new Map()
  _rosterDirty = false
  _domain = undefined
  _warned
  _bridgeHits = 0
  _bridgeAccepted = 0
  _bridgeRejected = 0
  // 授权就绪标记的读取缓存（见 _activationReady）
  _activationCache = undefined
  _activationCheckedAt = 0
  _lastApiIdentity = null

  async [Service.init]() {
    this._org = Object.freeze({
      id: this.config.organizationId,
      kind: 'personal',
      name: this.config.organizationName,
      revision: 'workdsh-identity-portal-v1',
    })
    this._loadSecret()
    this._loadRoster()
    this._registerRequestBridge()
    this._registerWhoami()
  }

  // ---------------------------------------------------------------- 门户身份接入

  /**
   * 覆盖每个已认证 API 请求：验签通过就把身份放进异步上下文，
   * 之后同一条请求链上的 `resolve()` 都能看到它。
   */
  _registerRequestBridge() {
    try {
      this.ctx.on('connection/request', (request, _response, next) => {
        this._bridgeHits += 1
        let identity = null
        try {
          identity = this._identify(request)
        } catch (error) {
          this._warnOnce('identify-failed', '[workdsh-identity-portal] 解析请求身份失败，按兜底主体处理：' + describe(error))
        }
        if (!identity) {
          // 头存在但没验过签，是排障时最需要看见的信号，单独计数。
          if (String(request?.headers?.[this.config.userHeader] ?? '') !== '') this._bridgeRejected += 1
          return next()
        }
        this._bridgeAccepted += 1
        return this._storage.run(identity, () => {
          this._observeInRequest(identity, request)
          return next()
        })
      })
    } catch (error) {
      this._warnOnce('bridge-register-failed', '[workdsh-identity-portal] 无法注册 connection/request 监听：' + describe(error))
    }
  }

  /**
   * 在**真实 API 请求的异步上下文里**记录一次解析快照。
   *
   * 这是 P1 唯一有说服力的验证方式：诊断端点自己不走 /api 通道，看不到请求作用域，
   * 所以必须在这里（`_storage.run` 之内）调用访问层真正会调用的那几个方法，
   * 把它们当时的返回值留下来。否则"身份打通了"只是推测。
   */
  _observeInRequest(identity, request) {
    try {
      this._lastApiIdentity = Object.freeze({
        at: new Date().toISOString(),
        url: String(request?.url ?? ''),
        username: identity.username,
        // 访问层真实的入口：不带 sessionId 与带 sessionId 各取一次。
        resolvedActor: this.resolve({}),
        // 无绑定的新会话 → 应为当前门户账号
        newSessionActor: this.resolve({ sessionId: this.config.newSessionProbeId }),
        // 已有归属绑定的老会话 → 必须仍归绑定的所有者（上线不打断历史）
        legacySessionActor: this.resolve({ sessionId: this.config.legacySessionProbeId }),
        profilePrincipalId: this.profile().principalId,
        membershipState: this.membership(this.organizationId, identity.principalId)?.state ?? null,
      })
    } catch (error) {
      this._warnOnce('observe-failed', '[workdsh-identity-portal] 请求内解析快照失败：' + describe(error))
    }
  }

  /** 授权就绪标记：不存在则本插件不认门户身份（退回兜底主体）。结果缓存 2 秒，避免每请求 stat。 */
  _activationReady() {
    const file = this.config.activationFile
    if (!file) return true
    const now = Date.now()
    if (this._activationCache !== undefined && now - this._activationCheckedAt < 2000) {
      return this._activationCache
    }
    this._activationCheckedAt = now
    try {
      this._activationCache = statSync(file).isFile()
    } catch {
      this._activationCache = false
    }
    return this._activationCache
  }

  /** 从请求头提取并**验签**门户身份；任何一步不成立都返回 null（退回兜底主体）。 */
  _identify(request) {
    // fail-closed 闸门：授权还没就绪时，即使门户已经签好身份也不认。
    // 宁可整体继续以兜底主体工作，也不要出现"人人都是独立主体、却谁都没有权限"。
    if (!this._activationReady()) return null
    const headers = request?.headers ?? {}
    const username = String(headers[this.config.userHeader] ?? '').trim()
    if (username === '') return null
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) return null

    const role = String(headers[this.config.roleHeader] ?? '').trim()
    const jobRole = String(headers[this.config.jobRoleHeader] ?? '').trim()
    const expires = String(headers[this.config.expiresHeader] ?? '').trim()

    if (this.config.requireSignature) {
      // 密钥可能比本插件晚出现（门户先起、密钥后写；或运维轮换）。
      // 缺失时限频重试，而不是在启动时定死——否则一次启动顺序就会让身份桥永久失效。
      if (this._secret === null && Date.now() - this._secretAttemptedAt > 5000) this._loadSecret()
      if (this._secret === null) return null
      const supplied = String(headers[this.config.signatureHeader] ?? '').trim()
      if (!verifySignature(this._secret, { username, role, jobRole, expires }, supplied)) return null
    }

    const identity = Object.freeze({
      username,
      role,
      jobRole,
      principalId: `portal:${username}`,
      organizationId: this.organizationId,
    })
    this._remember(identity)
    return identity
  }

  // ---------------------------------------------------------------- workdshIdentity

  /** 当前主体档案。请求作用域内返回该账号，否则返回兜底主账号。 */
  profile() {
    const scoped = this._storage.getStore()
    const principalId = scoped ? scoped.principalId : this.config.fallbackPrincipalId
    const membership = this.membership(this.organizationId, principalId)
    return Object.freeze({
      principalId,
      principalKind: 'human',
      organization: this._org,
      membership: membership ?? this._membership(principalId, principalId === this.config.fallbackPrincipalId ? 'owner' : 'member'),
      resolvedBy: this.id,
    })
  }

  /**
   * 成员判定。访问层用它把请求主体落到组织成员上；判不出来就拒绝（fail closed）。
   * 三种来源：兜底主账号、已见花名册、以及"该主体确实拥有会话绑定"（重启后自愈）。
   */
  membership(organizationId, principalId) {
    if (organizationId !== this.organizationId) return undefined
    if (typeof principalId !== 'string' || principalId === '') return undefined
    if (principalId === this.config.fallbackPrincipalId) return this._membership(principalId, 'owner')
    const known = this._roster.get(principalId)
    if (known) return this._membership(principalId, 'member', known.revision)
    const scoped = this._storage.getStore()
    if (scoped && scoped.principalId === principalId) return this._membership(principalId, 'member')
    if (this._ownsAnySession(principalId)) return this._membership(principalId, 'member')
    return undefined
  }

  /**
   * 解析会话主体。顺序：会话归属绑定 → 请求作用域门户身份 → 兜底主账号。
   * 绑定优先是关键：上线前创建的会话绑定在 local-user 上，继续以它工作，不打断历史。
   */
  resolve(evidence, signal) {
    signal?.throwIfAborted?.()
    const sessionId = evidence?.sessionId === undefined ? undefined : String(evidence.sessionId)
    const binding = sessionId === undefined ? undefined : this._bindingOf(sessionId)
    if (binding) return this._actor(binding.organizationId, binding.ownerPrincipalId, sessionId, evidence?.runId)
    const scoped = this._storage.getStore()
    if (scoped) return this._actor(scoped.organizationId, scoped.principalId, sessionId, evidence?.runId)
    return this._actor(this.organizationId, this.config.fallbackPrincipalId, sessionId, evidence?.runId)
  }

  _actor(organizationId, principalId, sessionId, runId) {
    return Object.freeze({
      principalId,
      organizationId,
      requestId: randomUUID(),
      resolvedBy: this.id,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(runId === undefined ? {} : { runId: String(runId) }),
    })
  }

  _membership(principalId, role, revision) {
    return Object.freeze({
      organizationId: this.organizationId,
      principalId,
      principalKind: 'human',
      role,
      state: 'active',
      revision: revision ?? `workdsh-identity-portal-${principalId}`,
    })
  }

  /**
   * 读会话归属绑定。
   * 刻意**自己不开这个 domain**：`storageDomain.open` 对同名域会抛 already-open，
   * 而该域的所有者是 workdsh-plugin-access。这里只做 `get()`（懒取值 + 缓存），
   * 拿不到就表示"没有绑定"，退回请求作用域/兜底路径，绝不与别人抢所有权。
   */
  _bindingOf(sessionId) {
    try {
      if (this._domain === undefined) {
        const domain = this.ctx.storageDomain?.get?.('workdsh_runtime_binding')
        if (!domain) return undefined
        this._domain = domain
      }
      const record = this._domain.table('sessions').get(sessionId)
      if (!record) return undefined
      if (!IDENTITY_RE.test(String(record.ownerPrincipalId ?? ''))) return undefined
      return record
    } catch (error) {
      this._domain = undefined
      this._warnOnce('binding-read-failed', '[workdsh-identity-portal] 读取会话归属绑定失败，按无绑定处理：' + describe(error))
      return undefined
    }
  }

  /** 绑定存储可用性诊断：用来区分"没有绑定"与"根本读不到绑定存储"。 */
  _bindingStoreDiagnostics() {
    const out = { facilityGet: typeof this.ctx.storageDomain?.get === "function", domainResolved: false, tableOk: false, probeRecord: null, error: null };
    try {
      const domain = this.ctx.storageDomain?.get?.("workdsh_runtime_binding");
      out.domainResolved = Boolean(domain);
      if (domain) {
        const table = domain.table("sessions");
        out.tableOk = Boolean(table);
        out.probeRecord = table.get(this.config.legacySessionProbeId) ?? null;
      }
    } catch (error) { out.error = describe(error); }
    return out;
  }

  /** 兜底成员判定：花名册没记录时，看该主体是否确实拥有会话绑定（重启后的自愈路径）。 */
  _ownsAnySession(principalId) {
    try {
      if (this._domain === undefined) {
        const domain = this.ctx.storageDomain?.get?.('workdsh_runtime_binding')
        if (!domain) return false
        this._domain = domain
      }
      for (const [, record] of this._domain.table('sessions').entries()) {
        if (record?.ownerPrincipalId === principalId) return true
      }
    } catch {
      return false
    }
    return false
  }

  // ---------------------------------------------------------------- 花名册与密钥

  _remember(identity) {
    const previous = this._roster.get(identity.principalId)
    const now = new Date().toISOString()
    // 只在"首次见到"或"角色确有变化"时写盘：这是每个请求都会走到的路径，
    // 无条件标脏会让每个请求都落一次盘。
    const changed = !previous
      || previous.role !== identity.role
      || previous.jobRole !== identity.jobRole
      || previous.username !== identity.username
    const next = {
      principalId: identity.principalId,
      username: identity.username,
      role: identity.role,
      jobRole: identity.jobRole,
      state: 'active',
      revision: previous?.revision ?? `portal-${identity.username}-${randomUUID()}`,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
    }
    this._roster.set(identity.principalId, next)
    // 已知且角色未变：只更新内存里的活跃时间，不落盘（避免每个请求写一次磁盘）。
    if (!changed) return
    this._rosterDirty = true
    this._saveRoster()
  }

  _loadSecret() {
    this._secretAttemptedAt = Date.now()
    try {
      const raw = readFileSync(this.config.secretFile, 'utf8').trim()
      if (raw === '') throw new Error('empty secret file')
      this._secret = raw
    } catch {
      this._secret = null
      this._warnOnce('secret-missing', '[workdsh-identity-portal] 共享密钥不可用（' + this.config.secretFile
        + '），仅启用兜底主账号身份。门户写入密钥后会自动重试，无需重启。')
    }
  }

  /** 需要时重新读密钥：门户/运维轮换密钥后不必重启容器。 */
  reloadSecret() {
    this._secret = null
    this._loadSecret()
    return this._secret !== null
  }

  _loadRoster() {
    try {
      const parsed = JSON.parse(readFileSync(this.config.rosterFile, 'utf8'))
      for (const entry of Array.isArray(parsed?.principals) ? parsed.principals : []) {
        if (typeof entry?.principalId === 'string' && IDENTITY_RE.test(entry.principalId)) {
          this._roster.set(entry.principalId, entry)
        }
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        this._warnOnce('roster-load-failed', '[workdsh-identity-portal] 花名册读取失败，按空名册启动：' + describe(error))
      }
    }
  }

  _saveRoster() {
    if (!this._rosterDirty) return
    try {
      const file = this.config.rosterFile
      mkdirSync(dirname(file), { recursive: true })
      const payload = { version: 1, updatedAt: new Date().toISOString(), principals: [...this._roster.values()] }
      const tmp = `${file}.tmp.${process.pid}`
      writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 })
      renameSync(tmp, file)
      this._rosterDirty = false
    } catch (error) {
      this._warnOnce('roster-save-failed', '[workdsh-identity-portal] 花名册落盘失败（不影响本次请求）：' + describe(error))
    }
  }

  // ---------------------------------------------------------------- 诊断端点

  /**
   * `GET /workdsh-identity/whoami?sessionId=…`
   * 只回显**调用者自己**被解析成谁，用于验证与排障；不含密钥、不含他人信息。
   */
  _registerWhoami() {
    try {
      this.ctx.webServer.register({
        kind: 'exact',
        path: this.config.whoamiPath,
        handler: (request, response) => {
          const scoped = this._storage.getStore() ?? null
          let sessionId
          try {
            sessionId = new URL(request.url ?? '/', 'http://identity.local').searchParams.get('sessionId') ?? undefined
          } catch { sessionId = undefined }
          const actor = this.resolve(sessionId === undefined ? {} : { sessionId })
          const body = {
            ok: true,
            signed: scoped !== null,
            scopedIdentity: scoped === null ? null : {
              username: scoped.username, role: scoped.role, jobRole: scoped.jobRole, principalId: scoped.principalId,
            },
            resolvedActor: actor,
            sessionBinding: sessionId === undefined ? null : (this._bindingOf(sessionId) ?? null),
            organization: this._org,
            fallbackPrincipalId: this.config.fallbackPrincipalId,
            secretLoaded: this._secret !== null,
            requireSignature: this.config.requireSignature,
            activation: { file: this.config.activationFile || null, ready: this._activationReady() },
            rosterSize: this._roster.size,
            bridge: { hits: this._bridgeHits, accepted: this._bridgeAccepted, rejected: this._bridgeRejected },
            lastApiIdentity: this._lastApiIdentity,
            bindingStore: this._bindingStoreDiagnostics(),
          }
          response.statusCode = 200
          response.setHeader('content-type', 'application/json; charset=utf-8')
          response.setHeader('cache-control', 'no-store')
          response.end(JSON.stringify(body))
        },
      })
    } catch (error) {
      this._warnOnce('whoami-register-failed', '[workdsh-identity-portal] 诊断路由注册失败：' + describe(error))
    }
  }

  _warnOnce(key, message) {
    if (this._warned.has(key)) return
    this._warned.add(key)
    try {
      this.ctx.logger?.warn?.(message)
    } catch { /* 日志不是关键路径 */ }
  }

  /** 属性初始化顺序要求：字段在构造函数里被引用前先声明。 */
  _org = Object.freeze({ id: 'local-personal', kind: 'personal', name: '本地个人空间', revision: 'unset' })
}

/**
 * 与门户 `identity-bridge.mjs` 共用的签名载荷：`[账号, 平台角色, 岗位角色, 会话过期时间]` 的 JSON。
 * 必须与门户逐字节一致；用 JSON 而不是换行拼接，避免字段边界歧义（详见门户侧注释）。
 */
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

function verifySignature(secret, fields, supplied) {
  const expected = computeSignature(secret, fields)
  const left = Buffer.from(expected, 'utf8')
  const right = Buffer.from(String(supplied).replace(/^v1=/, ''), 'utf8')
  if (left.length !== right.length) return false
  try {
    return timingSafeEqual(left, right)
  } catch {
    return false
  }
}

function describe(error) {
  return error instanceof Error ? error.message : String(error)
}
