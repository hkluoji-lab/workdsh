/**
 * workdsh-grant-baseline —— 站点资源「成员基线授权」：一次性迁移 + 持续收敛（Host 半边）。
 *
 * 解决的问题：DSH 的访问层判定是
 *   「actor 是资源所有者 → 放行；否则需要匹配动作的显式 grant；否则拒绝」。
 * 而本站资源（专家、Office 文档）**全部属于 `local-user`**。
 * 一旦启用 P1 按账号主体，普通账号既非所有者又无 grant，专家使用与文档编辑会被全部拒绝。
 *
 * 本插件做两件事（缺口 2）：
 *   ① **一次性迁移**：以所有者身份为每个活跃账号签发基线 grant（默认 read + use）。
 *   ② **持续收敛**（ensure 循环）：站点资源是会长出来的——新账号注册、管理员新建专家——
 *      所以不能只跑一次。循环按固定间隔做一遍幂等 ensure，并在监听到 watched 域写入后
 *      去抖触发一次。收敛内容包括：
 *        · 花名册里**新出现的主体** → 补发既有资源的基线 grant；
 *        · 站点所有者**新建的资源** → 补发基线 grant（不需要冒充任何人：actor 就是 local-user）。
 *
 * 刻意**不**做的事：
 *   · 不冒充他人。`resolve({})` 在无请求身份时返回站点所有者，所以"站点所有者拥有的资源"
 *     可以安全地由本插件签发；**其他主体拥有的资源**默认不动（要共享请用面板显式授权，
 *     或显式打开 `autoShareMemberOwned` —— 那会以该资源所有者的身份签发，属更强的策略，默认关）。
 *   · 不 open 任何别人拥有的 storage domain（同名重复 open 会抛 already-open），只 `get()` 读。
 *
 * 路由：GET /workdsh-grant-baseline/run[?apply=1][&principals=a,b][&actions=read,use]
 *       GET /workdsh-grant-baseline/status
 */
import { Service } from '@deepseek-ai/cordis'
import Schema from '@deepseek-ai/schemastery'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DEFAULTS = Object.freeze({
  organizationId: 'local-personal',
  siteOwnerPrincipalId: 'local-user',
  storageRoot: '/data/dsh/storages',
  rosterFile: '/data/dsh/storages/workdsh_identity_portal/principals.json',
  baselineActions: 'read,use',
  routePath: '/workdsh-grant-baseline/run',
  statusPath: '/workdsh-grant-baseline/status',
  /** ensure 循环间隔（毫秒）；0 = 关闭循环，只保留手动调用。 */
  ensureIntervalMs: 30000,
  /** watched 域写入后的去抖延迟（毫秒）。 */
  changeDebounceMs: 3000,
  /** watched 域：只有这些域的记录会触发即时收敛。 */
  watchedDomains: 'workdsh_experts,workdsh_office',
  /** 是否也把「成员拥有的资源」自动共享给全体成员（会以该资源所有者的身份签发）。默认关。 */
  autoShareMemberOwned: false,
  /**
   * 站点资源交给哪些岗位角色**管理**（逗号分隔；空 = 不开启）。
   * 命中的主体对站点所有者拥有的资源拿到 read+use+edit+manage。
   * 这是"运营能发布专家、管理能改内容"的实现方式；`manage` 也是后续在面板里给他人授权的门票。
   */
  manageJobRoles: '',
  /** 管理岗位获得的动作集合。 */
  manageActions: 'read,use,edit,manage',
  /**
   * 是否回收**本工具签发过、但已不在计划内**的授权。默认开。
   * 必要性：岗位会变（管理 → 销售）。如果不回收，被降级的人会永远留着带 `manage` 的旧 grant，
   * 即"权限只增不减"。这是安全问题，不是整洁问题。
   */
  pruneStale: true,
  /** 花名册文件轮询间隔（毫秒）：新主体一出现就立刻收敛，而不是等下一个周期。0=关闭。 */
  rosterWatchMs: 2000,
  /**
   * 启动后是否立刻跑一次收敛（默认开，毫秒；0=关闭）。
   * 门户一重启就开始签发身份头，此后浏览器请求即带门户账号身份；
   * 若那时授权还没写进去，用户会短暂地"用不了任何专家/文档"。启动即收敛把窗口压到秒级。
   */
  ensureOnStartMs: 1500,
  /**
   * 授权就绪标记文件（空 = 不做门控）。一轮收敛**完全成功**后写出。
   *
   * 身份服务会读同一个文件：标记不存在时它不认门户身份（退回兜底主体）。
   * 这样"启用身份"与"授权就绪"是原子的——授权没写好，就绝不会出现
   * "用户有了独立主体、却对任何资源都没权限"的窗口（fail-closed）。
   */
  activationFile: '',
})

const Config = Schema.object({
  organizationId: Schema.string().default(DEFAULTS.organizationId),
  siteOwnerPrincipalId: Schema.string().default(DEFAULTS.siteOwnerPrincipalId),
  storageRoot: Schema.string().default(DEFAULTS.storageRoot),
  // 2026-09-28（C4 步骤 1）新增：技能与连接器的枚举来源
  skillsRoot: Schema.string().default("/data/dsh/home/.agents/skills"),
  connectorFile: Schema.string().default("/data/dsh/storages/mcp_connector.json"),
  rosterFile: Schema.string().default(DEFAULTS.rosterFile),
  baselineActions: Schema.string().default(DEFAULTS.baselineActions),
  routePath: Schema.string().default(DEFAULTS.routePath),
  statusPath: Schema.string().default(DEFAULTS.statusPath),
  ensureIntervalMs: Schema.number().default(DEFAULTS.ensureIntervalMs),
  changeDebounceMs: Schema.number().default(DEFAULTS.changeDebounceMs),
  watchedDomains: Schema.string().default(DEFAULTS.watchedDomains),
  autoShareMemberOwned: Schema.boolean().default(DEFAULTS.autoShareMemberOwned),
  manageJobRoles: Schema.string().default(DEFAULTS.manageJobRoles),
  manageActions: Schema.string().default(DEFAULTS.manageActions),
  pruneStale: Schema.boolean().default(DEFAULTS.pruneStale),
  rosterWatchMs: Schema.number().default(DEFAULTS.rosterWatchMs),
  ensureOnStartMs: Schema.number().default(DEFAULTS.ensureOnStartMs),
  activationFile: Schema.string().default(DEFAULTS.activationFile),
})

/** 存储后端接受的 key：/^[a-zA-Z0-9_-]+$/ */
function pathSafe(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-')
}

function stableRevision(actions) {
  return `baseline-${createHash('sha256').update([...actions].sort().join(',')).digest('hex').slice(0, 32)}`
}

function readJson(file) {
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
  const out = []
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    const record = readJson(join(dir, name))
    if (record) out.push({ file: name, record })
  }
  return out
}

export default class GrantBaseline extends Service {
  static inject = ['workdshAccess', 'workdshIdentity', 'storageDomain', 'webServer']
  static Config = Config

  constructor(ctx, config) {
    super(ctx, 'workdshGrantBaseline')
    this.config = Object.freeze({ ...DEFAULTS, ...(config ?? {}) })
    this._state = {
      runs: 0,
      lastRunAt: null,
      lastResult: null,
      lastTrigger: null,
      lastError: null,
      changeEvents: 0,
      timerActive: false,
    }
    this._timer = null
    this._debounce = null
    this._rosterTimer = null
    this._running = false
  }

  async [Service.init]() {
    this._registerRoutes()
    this._registerChangeListener()
    this._startLoop()
    this._startRosterWatch()
    this._startOnStartEnsure()
  }

  // ------------------------------------------------------------------ 对外接口

  _registerRoutes() {
    try {
      this.ctx.webServer.register({
        kind: 'exact',
        path: this.config.routePath,
        handler: (request, response) => this._handleRun(request, response),
      })
      this.ctx.webServer.register({
        kind: 'exact',
        path: this.config.statusPath,
        handler: (_request, response) => {
          this._json(response, {
            ok: true,
            config: {
              organizationId: this.config.organizationId,
              siteOwnerPrincipalId: this.config.siteOwnerPrincipalId,
              storageRoot: this.config.storageRoot,
              baselineActions: this.config.baselineActions,
              ensureIntervalMs: this.config.ensureIntervalMs,
              watchedDomains: this.config.watchedDomains,
              autoShareMemberOwned: this.config.autoShareMemberOwned,
            },
            state: this._state,
          })
        },
      })
    } catch (error) {
      this.ctx.logger?.warn?.('[workdsh-grant-baseline] 路由注册失败：' + describe(error))
    }
  }

  /** watched 域有写入就去抖触发一次收敛：新资源不必等下一个周期。 */
  _registerChangeListener() {
    const watched = new Set(this.config.watchedDomains.split(',').map((v) => v.trim()).filter(Boolean))
    try {
      this.ctx.on('domain/changed', (change) => {
        if (!change || change.operation !== 'put') return
        if (!watched.has(change.domain)) return
        this._state.changeEvents += 1
        this._scheduleEnsure('domain-change')
      })
    } catch (error) {
      this.ctx.logger?.warn?.('[workdsh-grant-baseline] domain/changed 监听注册失败：' + describe(error))
    }
  }

  _startLoop() {
    const interval = Number(this.config.ensureIntervalMs)
    if (!Number.isFinite(interval) || interval <= 0) return
    this._state.timerActive = true
    this._timer = setInterval(() => this._scheduleEnsure('interval'), interval)
    // 定时器属于插件作用域：插件卸载时必须清掉，否则会留下野定时器持续写授权。
    this.ctx.effect(() => () => {
      if (this._timer) clearInterval(this._timer)
      if (this._debounce) clearTimeout(this._debounce)
      this._state.timerActive = false
    }, 'workdshGrantBaseline.timer')
  }

  /**
   * 轮询花名册文件的 mtime：新主体（例如刚登录的管理员）一出现就触发一次收敛。
   * 没有它，新管理员要等一个 ensure 周期才拿到 manage 授权——表现为"刚登录却改不了权限"。
   */
  _startRosterWatch() {
    const interval = Number(this.config.rosterWatchMs)
    if (!Number.isFinite(interval) || interval <= 0) return
    let last = this._rosterMtime()
    this._rosterTimer = setInterval(() => {
      // 定时器里的同步异常会变成 uncaught exception 并**杀死整个 DSH 进程**，
      // 所以定时器回调必须自己兜住所有异常，绝不能让它冒出去。
      try {
        const now = this._rosterMtime()
        if (now !== last) {
          last = now
          this._scheduleEnsure('roster-change')
        }
      } catch (error) {
        this._state.lastError = describe(error)
      }
    }, interval)
    this.ctx.effect(() => () => { if (this._rosterTimer) clearInterval(this._rosterTimer) }, 'workdshGrantBaseline.rosterWatch')
  }

  /** 启动后先跑一轮**真写**的收敛：把"门户已开始签发身份、授权却还没写"的窗口压到最小。 */
  _startOnStartEnsure() {
    const delay = Number(this.config.ensureOnStartMs)
    if (!Number.isFinite(delay) || delay <= 0) return
    const timer = setTimeout(() => {
      // 同上：这里同步抛错会直接终止进程。宁可收敛失败，也不能让站点挂掉。
      try {
        this.ensure({ trigger: 'startup', apply: true }).catch((error) => {
          this._state.lastError = describe(error)
        })
      } catch (error) {
        this._state.lastError = describe(error)
      }
    }, delay)
    this.ctx.effect(() => () => clearTimeout(timer), 'workdshGrantBaseline.startupEnsure')
  }

  _rosterMtime() {
    try { return statSync(this.config.rosterFile).mtimeMs } catch { return 0 }
  }

  _scheduleEnsure(trigger) {
    // 单一兜底点：定时器与事件监听都从这里进来，任何同步异常都不能冒到进程级。
    try {
      if (this._debounce) clearTimeout(this._debounce)
      this._debounce = setTimeout(() => {
        this._debounce = null
        // 必须显式 apply：ensure() 的默认是 dry-run（安全默认），
        // 漏传会让循环"看起来在跑、实际一条都没写"——这个 bug 被沙箱测试抓到过。
        try {
          this.ensure({ trigger, apply: true }).catch((error) => {
            this._state.lastError = describe(error)
          })
        } catch (error) {
          this._state.lastError = describe(error)
        }
      }, Math.max(0, Number(this.config.changeDebounceMs) || 0))
    } catch (error) {
      this._state.lastError = describe(error)
    }
  }

  // ------------------------------------------------------------------ 核心：幂等收敛

  /**
   * 做一遍幂等 ensure。返回汇总；任何单个 grant 失败只记数，不中断整轮。
   * `dryRun` 为 true 时只统计不写盘（路由默认 dry-run；循环始终真写）。
   */
  async ensure({ dryRun = false, apply = false, principals, actions, trigger = 'manual' } = {}) {
    if (this._running) return { ok: true, skipped: 'already-running', state: this._state }
    this._running = true
    const startedAt = Date.now()
    const wantedActions = actions ?? this.config.baselineActions.split(',').map((v) => v.trim()).filter(Boolean)
    const manageActions = this.config.manageActions.split(',').map((v) => v.trim()).filter(Boolean)
    const manageJobRoles = new Set(this.config.manageJobRoles.split(',').map((v) => v.trim()).filter(Boolean))
    const rosterEntries = this._readRosterEntries()
    const roster = principals ?? rosterEntries.map((entry) => entry.principalId)
    // 每个主体只发**一份**授权：管理岗位发超集（含 manage），其余发基线集合。
    // 这样同一主体在同一资源上不会出现两条重复 grant。
    const plan = roster.map((principalId) => {
      const entry = rosterEntries.find((row) => row.principalId === principalId)
      const isManager = entry !== undefined && manageJobRoles.has(entry.jobRole)
      return {
        principalId,
        actions: isManager ? manageActions : wantedActions,
        tag: isManager ? 'mgr' : 'base',
      }
    })
    const out = {
      mode: apply ? 'apply' : (dryRun ? 'dry-run' : 'apply'),
      trigger,
      organizationId: this.config.organizationId,
      siteOwnerPrincipalId: this.config.siteOwnerPrincipalId,
      actions: wantedActions,
      principals: roster,
      counts: {
        resources: 0, ownedBySite: 0, ownedByMembers: 0, skippedForeign: 0,
        planned: 0, pending: 0, created: 0, updated: 0, unchanged: 0, pruned: 0, failed: 0,
      },
      errors: [],
      sample: [],
    }
    try {
      const all = this._enumerateResources()
      out.counts.resources = all.length
      const existing = this._existingGrants()

      const desiredIds = new Set()
      for (const resource of all) {
        const ownerPrincipalId = String(resource.owner?.ownerPrincipalId ?? '')
        const isSiteOwned = ownerPrincipalId === this.config.siteOwnerPrincipalId
        const isMemberOwned = !isSiteOwned && roster.includes(ownerPrincipalId)
        if (isSiteOwned) out.counts.ownedBySite += 1
        else if (isMemberOwned) out.counts.ownedByMembers += 1
        else out.counts.skippedForeign += 1

        // 站点所有者拥有的资源：由本插件（actor = 站点所有者）签发，不需要冒充。
        // 成员拥有的资源：默认不动；只有显式打开 autoShareMemberOwned 才以该所有者身份签发。
        let issuerPrincipalId = null
        if (isSiteOwned) issuerPrincipalId = this.config.siteOwnerPrincipalId
        else if (isMemberOwned && this.config.autoShareMemberOwned) issuerPrincipalId = ownerPrincipalId
        if (issuerPrincipalId === null) continue

        const owner = {
          organizationId: resource.owner.organizationId ?? this.config.organizationId,
          ownerPrincipalId,
          scope: resource.owner.scope ?? 'personal',
        }
        for (const item of plan) {
          // 管理岗位用 -mgr 后缀，避免与同一主体同资源的基线 grant 相互覆盖。
          const suffix = item.tag === 'mgr' ? '-mgr' : ''
          const id = pathSafe(`baseline-${resource.domain}-${resource.id}-${item.principalId}${suffix}`)
          const revision = stableRevision(item.actions)
          desiredIds.add(id)
          out.counts.planned += 1
          const current = existing.get(id)
          if (current && current.revision === revision) { out.counts.unchanged += 1; continue }
          // pending = 本轮真正需要写的条数（planned 含已一致的），
          // 运维看这个数就知道"有没有活要干"，不必自己相减。
          out.counts.pending += 1
          if (out.sample.length < 3) {
            out.sample.push({
              id, resource: `${resource.domain}/${resource.label}`,
              subject: item.principalId, actions: item.actions, as: issuerPrincipalId,
            })
          }
          if (!apply) continue
          try {
            const issuerActor = {
              principalId: issuerPrincipalId,
              organizationId: this.config.organizationId,
              requestId: `baseline-${Date.now().toString(36)}-${out.counts.created + out.counts.updated}`,
              resolvedBy: 'workdsh-grant-baseline',
            }
            await this.ctx.workdshAccess.putGrant(issuerActor, owner, {
              id,
              organizationId: this.config.organizationId,
              subjectPrincipalId: item.principalId,
              resource: { domain: resource.domain, id: resource.id, revision: resource.revision },
              actions: item.actions,
              revision,
            }, current ? current.revision : undefined)
            if (current) out.counts.updated += 1
            else out.counts.created += 1
          } catch (error) {
            out.counts.failed += 1
            if (out.errors.length < 10) out.errors.push({ id, error: describe(error) })
          }
        }
      }
      // 回收：本工具签发过、但已不在计划内的授权（岗位变动后必须真的失去权限）。
      if (apply && this.config.pruneStale) {
        const siteOwned = new Map(
          all
            .filter((entry) => String(entry.owner?.ownerPrincipalId ?? '') === this.config.siteOwnerPrincipalId)
            .map((entry) => [`${entry.domain}::${entry.id}`, entry]),
        )
        for (const [id, grant] of existing.entries()) {
          if (!id.startsWith('baseline-')) continue // 只回收本工具签发的，不碰别人给的授权
          if (desiredIds.has(id)) continue
          const resource = siteOwned.get(`${grant.resource?.domain}::${grant.resource?.id}`)
          if (!resource) continue
          try {
            const ownerActor = {
              principalId: this.config.siteOwnerPrincipalId,
              organizationId: this.config.organizationId,
              requestId: `prune-${Date.now().toString(36)}`,
              resolvedBy: 'workdsh-grant-baseline',
            }
            await this.ctx.workdshAccess.revokeGrant(ownerActor, {
              organizationId: resource.owner.organizationId ?? this.config.organizationId,
              ownerPrincipalId: this.config.siteOwnerPrincipalId,
              scope: resource.owner.scope ?? 'personal',
            }, id, grant.revision)
            out.counts.pruned += 1
          } catch (error) {
            out.counts.failed += 1
            if (out.errors.length < 10) out.errors.push({ id, error: describe(error) })
          }
        }
      }

      out.ok = out.counts.failed === 0
      this._state.lastError = out.ok ? null : `${out.counts.failed} 个 grant 失败`
      // 只有"这一轮完全成功"才认为授权就绪：写标记文件，身份服务据此决定是否开始认门户身份。
      if (out.ok && apply) this._markActivated(out.counts)
    } catch (error) {
      out.ok = false
      out.error = describe(error)
      this._state.lastError = out.error
    } finally {
      this._running = false
      this._state.runs += 1
      this._state.lastRunAt = new Date().toISOString()
      this._state.lastTrigger = trigger
      out.elapsedMs = Date.now() - startedAt
      this._state.lastResult = {
        trigger, elapsedMs: out.elapsedMs, counts: out.counts, ok: out.ok,
      }
    }
    return out
  }

  // ------------------------------------------------------------------ 数据来源

  /** 授权就绪标记：身份服务读同一个文件来决定"是否开始认门户身份"。写失败只记状态。 */
  _markActivated(counts) {
    const file = this.config.activationFile
    if (!file) return
    try {
      mkdirSync(dirname(file), { recursive: true })
      const payload = { activatedAt: new Date().toISOString(), counts }
      const tmp = `${file}.tmp.${process.pid}`
      writeFileSync(tmp, `${JSON.stringify(payload)}\n`, { mode: 0o600 })
      renameSync(tmp, file)
    } catch (error) {
      this._state.lastError = 'activation-write-failed: ' + describe(error)
    }
  }

  /** 站点资源清单：只认当前调用 authorize 的两个域（专家、Office）。只读文件，不 open domain。 */
  _enumerateResources() {
    const resources = []
    for (const { record } of listRecords(join(this.config.storageRoot, 'workdsh_experts', 'experts'))) {
      if (!record.id || !record.owner) continue
      resources.push({
        domain: 'workdsh-experts', id: String(record.id),
        revision: String(record.revision ?? ''), owner: record.owner,
        label: record.name ?? record.id,
      })
    }
    for (const { record } of listRecords(join(this.config.storageRoot, 'workdsh_office', 'documents'))) {
      if (!record.documentId || !record.owner) continue
      resources.push({
        domain: 'office', id: String(record.documentId),
        revision: String(record.revision ?? ''), owner: record.owner,
        label: record.title ?? String(record.documentId).slice(0, 12),
      })
    }
    // ── 2026-09-28（C4 步骤 1）：技能与连接器 ────────────────────────────
    // 这两个域此前既没有授权判定点、也不在基线枚举里。若只加拦截不补这里，
    // 管理岗位会因为拿不到 manage 而被一起拒掉（管理面瘫痪）。
    // 站点资产统一按「站点所有者拥有」处理，于是：
    //   · 所有活跃成员拿到 baselineActions（read,use）
    //   · manageJobRoles 命中的岗位额外拿到 manage
    const siteOwner = {
      organizationId: this.config.organizationId,
      ownerPrincipalId: this.config.siteOwnerPrincipalId,
      scope: "organization",
    }
    const RESOURCE_ID_RE = /^[A-Za-z0-9._:-]{1,256}$/
    try {
      for (const name of readdirSync(this.config.skillsRoot)) {
        if (!name || name.startsWith(".") || !RESOURCE_ID_RE.test(name)) continue
        resources.push({
          domain: "workdsh-skills", id: name, revision: "v1",
          owner: siteOwner, label: name,
        })
      }
    } catch { /* 目录缺失不视为错误 */ }
    try {
      const manifest = JSON.parse(readFileSync(this.config.connectorFile, "utf8"))
      const connections = manifest?.tables?.connections ?? {}
      for (const key of Object.keys(connections)) {
        if (!RESOURCE_ID_RE.test(key)) continue
        resources.push({
          domain: "workdsh-connectors", id: key, revision: "v1",
          owner: siteOwner, label: connections[key]?.name ?? key,
        })
      }
    } catch { /* 清单缺失不视为错误 */ }
    // 域级入口：create / installFromCatalog 这类调用没有具体资源 id，
    // 判定用 id="*"。若不给它发 grant，连管理岗位都创建不了连接器/技能。
    resources.push({ domain: "workdsh-skills", id: "*", revision: "v1", owner: siteOwner, label: "技能·域级操作" })
    resources.push({ domain: "workdsh-connectors", id: "*", revision: "v1", owner: siteOwner, label: "连接器·域级操作" })
    return resources
  }

  /** 花名册原始条目（含岗位角色）：管理岗位的判定需要 jobRole。 */
  _readRosterEntries() {
    try {
      const parsed = JSON.parse(readFileSync(this.config.rosterFile, 'utf8'))
      return (Array.isArray(parsed?.principals) ? parsed.principals : [])
        .filter((entry) => entry?.state === 'active' && typeof entry.principalId === 'string')
        .map((entry) => ({
          principalId: entry.principalId,
          username: entry.username ?? null,
          role: entry.role ?? null,
          jobRole: entry.jobRole ?? '',
        }))
    } catch {
      return []
    }
  }

  _readRoster() {
    return this._readRosterEntries().map((entry) => entry.principalId)
  }

  /** 只 get，不 open：workdsh_access 归 workdsh-plugin-access 所有。 */
  _existingGrants() {
    try {
      const domain = this.ctx.storageDomain?.get?.('workdsh_access')
      if (!domain) return new Map()
      return new Map(domain.table('grants').entries())
    } catch {
      return new Map()
    }
  }

  // ------------------------------------------------------------------ HTTP

  async _handleRun(request, response) {
    const url = new URL(request.url ?? '/', 'http://baseline.local')
    const apply = url.searchParams.get('apply') === '1'
    const principals = url.searchParams.get('principals')?.split(',').map((v) => v.trim()).filter(Boolean)
    const actions = url.searchParams.get('actions')?.split(',').map((v) => v.trim()).filter(Boolean)
    const result = await this.ensure({
      apply, dryRun: !apply, principals, actions, trigger: 'http',
    })
    this._json(response, result)
  }

  _json(response, payload) {
    response.statusCode = 200
    response.setHeader('content-type', 'application/json; charset=utf-8')
    response.setHeader('cache-control', 'no-store')
    response.end(JSON.stringify(payload, null, 2))
  }
}

function describe(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error)
}
