/**
 * 身份与组织（Host 半边）：让门户的每个登录账号成为 DSH 内部**各自独立的主体**，
 * 从而让岗位角色与权限在工作台里真正生效；而不是所有人在 DSH 里都等于同一个 owner。
 *
 * 归并来源：线上 `deploy/tools/workdsh-identity-portal`（P1-15 批 2）。TS 化时保留了它全部
 * 实测语义，并把它依赖的签名协议收敛到 `workdsh-contracts/portal-identity` 唯一真源。
 *
 * 为什么这样做（全部是实测过的接口事实，不是推测）：
 *   1. 门户 `/api/portal/auth` 已经返回 `X-Portal-User`，而 Caddy 的门禁用 `forward_auth`，
 *      会把认证端点的响应头复制进上游请求——**DSH 侧本来就能收到这个头**。
 *   2. `connection/request` 是覆盖每个已认证 API 请求的官方 waterfall
 *      （`@deepseek-ai/dsh-client-connection` 声明：`(request, response, next) => Promise<void>`），
 *      它给出原始请求（含 headers）与 `next`，正好可以在 `next()` 外面套一层异步上下文。
 *   3. 访问层取主体的方式固定是 `ctx.workdshIdentity.resolve({ sessionId })`：
 *      **按会话解析，不按请求**。所以单靠请求头不够，必须让身份服务自己
 *      既看得见「当前请求是谁」，又记得「这个会话归属于谁」。
 *
 * 解析顺序（保守优先，保证上线不打断既有会话）：
 *   ① 会话已有归属绑定（`workdsh_runtime_binding`）→ 以绑定为准。上线前创建的会话绑定的是
 *      兜底主账号，因此它们**继续以兜底身份工作**，不会因为引入按账号身份而整体失配。
 *   ② 请求作用域内有已验签的门户身份 → 用该账号（新会话在创建时就绑定到它）。
 *   ③ 都没有 → 兜底主账号，与启用本模块之前的行为完全一致。
 *
 * 信任锚：门户用共享密钥对身份做 HMAC 签名，本服务验签后才认。
 * 仅凭「客户端能发一个头」是不足以作为身份依据的——容器内 127.0.0.1:3080 是可达的。
 * 密钥文件缺失或验签失败时**不抛错、不阻断请求**，只是退回兜底主账号（失败关闭到既有行为）。
 *
 * ⚠️ **不要用 JS `#私有字段` 保存状态**：Cordis 会代理服务对象以做上下文隔离，
 * 代理后 `this` 不是声明类本身，私有字段会抛
 * "Cannot read private member #x from an object whose class did not declare it"。
 * 官方 `LocalIdentityService` 同样用普通字段。这个坑是线上沙箱探针在跨插件调用
 * `membership()` 时抓到的。
 *
 * 失败安全：本服务初始化绝不抛异常。宿主插件在加载期抛错会让整棵插件树失败、容器起不来，
 * 这个代价远高于「身份没打通」。
 * @module workdsh-plugin-identity
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname } from 'node:path';
import { Service, type Context } from '@deepseek-ai/cordis';
/** Type-only: activates the official `ctx.webServer` augmentation. */
import type {} from '@deepseek-ai/dsh-host-webserver';
/** Type-only: activates the official `connection/request` waterfall event. */
import type {} from '@deepseek-ai/dsh-client-connection';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import Schema from '@deepseek-ai/schemastery';
import type {
  ActorContext,
  IdentityProfile,
  IdentityResolutionContext,
  IdentityService,
  Membership,
  Organization,
} from 'workdsh-contracts';
import { PORTAL_IDENTITY_HEADERS, readPortalSecret, verifyPortalSignature } from './host/portal-signature.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshIdentity: IdentityService;
  }
}

/** ActorContext 各字段的硬约束（与访问层 governance 校验一致：≤256、无控制字符）。 */
const IDENTITY_RE = /^[A-Za-z0-9._:-]{1,256}$/;

/** 本模块的服务标识：写进 `ActorContext.resolvedBy` 与 `profile().resolvedBy`。 */
const SERVICE_ID = 'workdsh-identity';

/** 本服务配置；全部可由部署配置覆盖。 */
export interface PortalIdentityConfig {
  /** 组织 id：本站以单一本地组织承载全部主体。 */
  organizationId: string;
  organizationName: string;
  /** 兜底主体：请求里没有可信门户身份时用它，保持与启用本模块之前完全一致的行为。 */
  fallbackPrincipalId: string;
  /** 门户写入的共享密钥文件（0600）。不存在则只启用兜底路径。 */
  secretFile: string;
  /** 已见主体的花名册：重启后仍能承认既有会话的所有者。 */
  rosterFile: string;
  userHeader: string;
  roleHeader: string;
  jobRoleHeader: string;
  expiresHeader: string;
  signatureHeader: string;
  /** 是否强制验签。默认 true；置 false 只用于沙箱排查，生产不要关。 */
  requireSignature: boolean;
  /** 诊断端点：回显调用者被解析成谁。只暴露调用者自身信息，不含任何密钥。 */
  whoamiPath: string;
  /** 诊断采样：无绑定会话的探针 id（空 = 不采样）。 */
  newSessionProbeId: string;
  /** 诊断采样：已有绑定会话的探针 id（空 = 不采样）。 */
  legacySessionProbeId: string;
  /**
   * 授权就绪标记文件（空 = 不做门控）。
   *
   * 非空时：文件不存在 → **不认任何门户身份**，一律退回兜底主体。
   * 这是启用期的 fail-closed 闸门：由收敛工具（access 模块的基线授权迁移工具）在
   * 「一轮授权完全成功」后写出，因此绝不会出现「用户获得了独立主体、却对任何资源都没权限」
   * 的锁定窗口。
   */
  activationFile: string;
}

/** 代码侧默认值：loader 会按 static Config 先补一遍，这里再兜一次，避免少传就崩。 */
const DEFAULTS: PortalIdentityConfig = Object.freeze({
  organizationId: 'local-personal',
  organizationName: '本地个人空间',
  fallbackPrincipalId: 'local-user',
  secretFile: '/data/dsh/portal/identity-bridge.key',
  rosterFile: '/data/dsh/storages/workdsh_identity_portal/principals.json',
  userHeader: PORTAL_IDENTITY_HEADERS.user,
  roleHeader: PORTAL_IDENTITY_HEADERS.role,
  jobRoleHeader: PORTAL_IDENTITY_HEADERS.jobRole,
  expiresHeader: PORTAL_IDENTITY_HEADERS.expires,
  signatureHeader: PORTAL_IDENTITY_HEADERS.signature,
  requireSignature: true,
  whoamiPath: '/workdsh-identity/whoami',
  newSessionProbeId: '',
  legacySessionProbeId: '',
  activationFile: '',
});

export const Config = Schema.object({
  organizationId: Schema.string().default(DEFAULTS.organizationId),
  organizationName: Schema.string().default(DEFAULTS.organizationName),
  fallbackPrincipalId: Schema.string().default(DEFAULTS.fallbackPrincipalId),
  secretFile: Schema.string().default(DEFAULTS.secretFile),
  rosterFile: Schema.string().default(DEFAULTS.rosterFile),
  userHeader: Schema.string().default(DEFAULTS.userHeader),
  roleHeader: Schema.string().default(DEFAULTS.roleHeader),
  jobRoleHeader: Schema.string().default(DEFAULTS.jobRoleHeader),
  expiresHeader: Schema.string().default(DEFAULTS.expiresHeader),
  signatureHeader: Schema.string().default(DEFAULTS.signatureHeader),
  requireSignature: Schema.boolean().default(DEFAULTS.requireSignature),
  whoamiPath: Schema.string().default(DEFAULTS.whoamiPath),
  newSessionProbeId: Schema.string().default(DEFAULTS.newSessionProbeId),
  legacySessionProbeId: Schema.string().default(DEFAULTS.legacySessionProbeId),
  activationFile: Schema.string().default(DEFAULTS.activationFile),
});

/** 请求作用域内被验签认可的门户身份。 */
interface ScopedIdentity {
  readonly username: string;
  readonly role: string;
  readonly jobRole: string;
  readonly principalId: string;
  readonly organizationId: string;
}

/** 花名册条目：重启后仍承认既有会话的所有者。 */
interface RosterEntry {
  readonly principalId: string;
  readonly username: string;
  readonly role: string;
  readonly jobRole: string;
  readonly state: 'active';
  readonly revision: string;
  readonly firstSeenAt: string;
  lastSeenAt: string;
}

/** 会话归属绑定（只读取 access 模块拥有的 domain，不抢所有权）。 */
interface SessionBindingRecord {
  readonly sessionId?: string;
  readonly organizationId?: string;
  readonly ownerPrincipalId?: string;
}

export class PortalIdentityService extends Service implements IdentityService {
  static inject = ['storageDomain', 'webServer'];
  static Config = Config;

  readonly id = SERVICE_ID;
  private readonly config: PortalIdentityConfig;
  private readonly scoped = new AsyncLocalStorage<ScopedIdentity>();
  private readonly roster = new Map<string, RosterEntry>();
  private readonly warned = new Set<string>();
  private organization: Organization;
  private secret: string | null = null;
  private secretAttemptedAt = 0;
  private rosterDirty = false;
  private bridgeHits = 0;
  private bridgeAccepted = 0;
  private bridgeRejected = 0;
  private activationCache: boolean | undefined;
  private activationCheckedAt = 0;
  private lastApiIdentity: Readonly<Record<string, unknown>> | null = null;

  constructor(ctx: Context, config: Partial<PortalIdentityConfig> = {}) {
    super(ctx, 'workdshIdentity');
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.organization = Object.freeze({
      id: this.config.organizationId,
      kind: 'personal',
      name: this.config.organizationName,
      revision: 'workdsh-identity-v1',
    });
  }

  async [Service.init](): Promise<void> {
    // 每一步各自失败安全：任何一项注册失败都不能让整棵插件树加载失败。
    this.loadSecret();
    this.loadRoster();
    this.registerRequestBridge();
    this.registerWhoami();
  }

  // ---------------------------------------------------------------- 门户身份接入

  /**
   * 覆盖每个已认证 API 请求：验签通过就把身份放进异步上下文，
   * 之后同一条请求链上的 `resolve()` 都能看到它。
   */
  private registerRequestBridge(): void {
    try {
      this.ctx.on('connection/request', (request: IncomingMessage, _response: ServerResponse, next: () => Promise<void>) => {
        this.bridgeHits += 1;
        let identity: ScopedIdentity | null = null;
        try {
          identity = this.identify(request);
        } catch (error) {
          this.warnOnce('identify-failed', '[workdsh-identity] 解析请求身份失败，按兜底主体处理：' + describeError(error));
        }
        if (!identity) {
          // 头存在但没验过签，是排障时最需要看见的信号，单独计数。
          if (String(request?.headers?.[this.config.userHeader] ?? '') !== '') this.bridgeRejected += 1;
          return next();
        }
        this.bridgeAccepted += 1;
        const current = identity;
        return this.scoped.run(current, () => {
          this.observeInRequest(current, request);
          return next();
        });
      });
    } catch (error) {
      this.warnOnce('bridge-register-failed', '[workdsh-identity] 无法注册 connection/request 监听：' + describeError(error));
    }
  }

  /**
   * 在**真实 API 请求的异步上下文里**记录一次解析快照。
   *
   * 这是唯一有说服力的验证方式：诊断端点自己不走 /api 通道，看不到请求作用域，
   * 所以必须在这里（`scoped.run` 之内）调用访问层真正会调用的那几个方法，
   * 把它们当时的返回值留下来。否则「身份打通了」只是推测。
   */
  private observeInRequest(identity: ScopedIdentity, request: IncomingMessage): void {
    try {
      this.lastApiIdentity = Object.freeze({
        at: new Date().toISOString(),
        url: String(request?.url ?? ''),
        username: identity.username,
        // 访问层真实的入口：不带 sessionId 与带 sessionId 各取一次。
        resolvedActor: this.actorFor({}),
        // 无绑定的新会话 → 应为当前门户账号；未配置探针 id 时留 null，避免把兜底误读成结论。
        newSessionActor: this.config.newSessionProbeId === ''
          ? null
          : this.actorFor({ sessionId: this.config.newSessionProbeId }),
        // 已有归属绑定的老会话 → 必须仍归绑定的所有者（上线不打断历史）
        legacySessionActor: this.config.legacySessionProbeId === ''
          ? null
          : this.actorFor({ sessionId: this.config.legacySessionProbeId }),
        profilePrincipalId: this.profile().principalId,
        membershipState: this.membership(this.config.organizationId, identity.principalId)?.state ?? null,
      });
    } catch (error) {
      this.warnOnce('observe-failed', '[workdsh-identity] 请求内解析快照失败：' + describeError(error));
    }
  }

  /** 授权就绪标记：不存在则本服务不认门户身份（退回兜底主体）。结果缓存 2 秒，避免每请求 stat。 */
  private activationReady(): boolean {
    const file = this.config.activationFile;
    if (!file) return true;
    const now = Date.now();
    if (this.activationCache !== undefined && now - this.activationCheckedAt < 2000) {
      return this.activationCache;
    }
    this.activationCheckedAt = now;
    try {
      this.activationCache = statSync(file).isFile();
    } catch {
      this.activationCache = false;
    }
    return this.activationCache;
  }

  /** 从请求头提取并**验签**门户身份；任何一步不成立都返回 null（退回兜底主体）。 */
  private identify(request: IncomingMessage): ScopedIdentity | null {
    // fail-closed 闸门：授权还没就绪时，即使门户已经签好身份也不认。
    // 宁可整体继续以兜底主体工作，也不要出现「人人都是独立主体、却谁都没有权限」。
    if (!this.activationReady()) return null;
    const headers = request?.headers ?? {};
    const username = String(headers[this.config.userHeader] ?? '').trim();
    if (username === '') return null;
    if (!/^[A-Za-z0-9._-]{3,64}$/.test(username)) return null;

    const role = String(headers[this.config.roleHeader] ?? '').trim();
    const jobRole = String(headers[this.config.jobRoleHeader] ?? '').trim();
    const expires = String(headers[this.config.expiresHeader] ?? '').trim();

    if (this.config.requireSignature) {
      // 密钥可能比本服务晚出现（门户先起、密钥后写；或运维轮换）。
      // 缺失时限频重试，而不是在启动时定死——否则一次启动顺序就会让身份桥永久失效。
      if (this.secret === null && Date.now() - this.secretAttemptedAt > 5000) this.loadSecret();
      if (this.secret === null) return null;
      const supplied = String(headers[this.config.signatureHeader] ?? '').trim();
      if (!verifyPortalSignature(this.secret, { username, role, jobRole, expires }, supplied)) return null;
    }

    const identity: ScopedIdentity = Object.freeze({
      username,
      role,
      jobRole,
      principalId: `portal:${username}`,
      organizationId: this.config.organizationId,
    });
    this.remember(identity);
    return identity;
  }

  // ---------------------------------------------------------------- workdshIdentity

  /** 当前主体档案。请求作用域内返回该账号，否则返回兜底主账号。 */
  profile(): IdentityProfile {
    const current = this.scoped.getStore();
    const principalId = current ? current.principalId : this.config.fallbackPrincipalId;
    const membership = this.membership(this.config.organizationId, principalId);
    return Object.freeze({
      principalId,
      principalKind: 'human',
      organization: this.organization,
      membership: membership ?? this.membershipRecord(
        principalId,
        principalId === this.config.fallbackPrincipalId ? 'owner' : 'member',
      ),
      resolvedBy: this.id,
    });
  }

  /**
   * 成员判定。访问层用它把请求主体落到组织成员上；判不出来就拒绝（fail closed）。
   * 三种来源：兜底主账号、已见花名册、以及「该主体确实拥有会话绑定」（重启后自愈）。
   */
  membership(organizationId: string, principalId: string): Membership | undefined {
    if (organizationId !== this.config.organizationId) return undefined;
    if (typeof principalId !== 'string' || principalId === '') return undefined;
    if (principalId === this.config.fallbackPrincipalId) return this.membershipRecord(principalId, 'owner');
    const known = this.roster.get(principalId);
    if (known) return this.membershipRecord(principalId, 'member', known.revision);
    const current = this.scoped.getStore();
    if (current && current.principalId === principalId) return this.membershipRecord(principalId, 'member');
    if (this.ownsAnySession(principalId)) return this.membershipRecord(principalId, 'member');
    return undefined;
  }

  /**
   * 解析会话主体。顺序：会话归属绑定 → 请求作用域门户身份 → 兜底主账号。
   * 绑定优先是关键：上线前创建的会话绑定在兜底主体上，继续以它工作，不打断历史。
   */
  resolve(evidence?: IdentityResolutionContext, signal?: AbortSignal): Promise<ActorContext> {
    signal?.throwIfAborted();
    const actor = this.actorFor(evidence);
    signal?.throwIfAborted();
    return Promise.resolve(actor);
  }

  /** `resolve` 的同步形态：诊断端点与请求内快照要在同一个调用栈里取值。 */
  private actorFor(evidence?: IdentityResolutionContext): ActorContext {
    const sessionId = evidence?.sessionId === undefined ? undefined : String(evidence.sessionId);
    const runId = evidence?.runId === undefined ? undefined : String(evidence.runId);
    const binding = sessionId === undefined ? undefined : this.bindingOf(sessionId);
    if (binding) return this.actor(binding.organizationId, binding.ownerPrincipalId, sessionId, runId);
    const current = this.scoped.getStore();
    if (current) return this.actor(current.organizationId, current.principalId, sessionId, runId);
    return this.actor(this.config.organizationId, this.config.fallbackPrincipalId, sessionId, runId);
  }

  private actor(organizationId: string, principalId: string, sessionId?: string, runId?: string): ActorContext {
    return Object.freeze({
      principalId,
      organizationId,
      requestId: randomUUID(),
      resolvedBy: this.id,
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(runId === undefined ? {} : { runId }),
    });
  }

  private membershipRecord(principalId: string, role: 'owner' | 'member', revision?: string): Membership {
    return Object.freeze({
      organizationId: this.config.organizationId,
      principalId,
      principalKind: 'human',
      role,
      state: 'active',
      revision: revision ?? `workdsh-identity-${principalId}`,
    });
  }

  /**
   * 读会话归属绑定。
   * 刻意**自己不开这个 domain**：`storageDomain.open` 对同名域会抛 already-open，
   * 而该域的所有者是 `workdsh-plugin-access`。这里只做 `get()`，
   * 拿不到就表示「没有绑定」，退回请求作用域/兜底路径，绝不与别人抢所有权。
   */
  private bindingOf(sessionId: string): { organizationId: string; ownerPrincipalId: string } | undefined {
    try {
      const record = this.bindingTable()?.get(sessionId) as SessionBindingRecord | undefined;
      if (!record) return undefined;
      if (!IDENTITY_RE.test(String(record.ownerPrincipalId ?? ''))) return undefined;
      if (!IDENTITY_RE.test(String(record.organizationId ?? ''))) return undefined;
      return { organizationId: String(record.organizationId), ownerPrincipalId: String(record.ownerPrincipalId) };
    } catch (error) {
      this.warnOnce('binding-read-failed', '[workdsh-identity] 读取会话归属绑定失败，按无绑定处理：' + describeError(error));
      return undefined;
    }
  }

  /** 惰性取「会话归属绑定」表；域不存在时返回 undefined，绝不 open。 */
  private bindingTable(): KvTable<string, unknown> | undefined {
    try {
      return this.ctx.storageDomain?.get?.('workdsh_runtime_binding')?.table('sessions') as
        | KvTable<string, unknown>
        | undefined;
    } catch {
      return undefined;
    }
  }

  /** 绑定存储可用性诊断：用来区分「没有绑定」与「根本读不到绑定存储」。 */
  private bindingStoreDiagnostics(): Record<string, unknown> {
    const out: Record<string, unknown> = {
      facilityGet: typeof this.ctx.storageDomain?.get === 'function',
      domainResolved: false,
      tableOk: false,
      probeRecord: null,
      error: null,
    };
    try {
      const domain = this.ctx.storageDomain?.get?.('workdsh_runtime_binding');
      out.domainResolved = Boolean(domain);
      if (domain) {
        const table = domain.table('sessions');
        out.tableOk = Boolean(table);
        out.probeRecord = this.config.legacySessionProbeId === ''
          ? null
          : (table.get(this.config.legacySessionProbeId) ?? null);
      }
    } catch (error) {
      out.error = describeError(error);
    }
    return out;
  }

  /** 兜底成员判定：花名册没记录时，看该主体是否确实拥有会话绑定（重启后的自愈路径）。 */
  private ownsAnySession(principalId: string): boolean {
    try {
      const table = this.bindingTable();
      if (!table) return false;
      for (const [, record] of table.entries()) {
        if ((record as SessionBindingRecord | undefined)?.ownerPrincipalId === principalId) return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  // ---------------------------------------------------------------- 花名册与密钥

  private remember(identity: ScopedIdentity): void {
    const previous = this.roster.get(identity.principalId);
    const now = new Date().toISOString();
    // 只在「首次见到」或「角色确有变化」时写盘：这是每个请求都会走到的路径，
    // 无条件标脏会让每个请求都落一次盘。
    const changed = !previous
      || previous.role !== identity.role
      || previous.jobRole !== identity.jobRole
      || previous.username !== identity.username;
    const next: RosterEntry = {
      principalId: identity.principalId,
      username: identity.username,
      role: identity.role,
      jobRole: identity.jobRole,
      state: 'active',
      revision: previous?.revision ?? `portal-${identity.username}-${randomUUID()}`,
      firstSeenAt: previous?.firstSeenAt ?? now,
      lastSeenAt: now,
    };
    this.roster.set(identity.principalId, next);
    // 已知且角色未变：只更新内存里的活跃时间，不落盘（避免每个请求写一次磁盘）。
    if (!changed) return;
    this.rosterDirty = true;
    this.saveRoster();
  }

  private loadSecret(): void {
    this.secretAttemptedAt = Date.now();
    const secret = readPortalSecret(this.config.secretFile);
    this.secret = secret;
    if (secret === null) {
      this.warnOnce('secret-missing', '[workdsh-identity] 共享密钥不可用（' + this.config.secretFile
        + '），仅启用兜底主账号身份。门户写入密钥后会自动重试，无需重启。');
    }
  }

  /** 需要时重新读密钥：门户/运维轮换密钥后不必重启容器。 */
  reloadSecret(): boolean {
    this.secret = null;
    this.warned.delete('secret-missing');
    this.loadSecret();
    return this.secret !== null;
  }

  private loadRoster(): void {
    try {
      const parsed = JSON.parse(readFileSync(this.config.rosterFile, 'utf8')) as { principals?: unknown };
      const entries = Array.isArray(parsed?.principals) ? parsed.principals : [];
      for (const entry of entries as RosterEntry[]) {
        if (typeof entry?.principalId === 'string' && IDENTITY_RE.test(entry.principalId)) {
          this.roster.set(entry.principalId, entry);
        }
      }
    } catch (error) {
      if ((error as { code?: string })?.code !== 'ENOENT') {
        this.warnOnce('roster-load-failed', '[workdsh-identity] 花名册读取失败，按空名册启动：' + describeError(error));
      }
    }
  }

  private saveRoster(): void {
    if (!this.rosterDirty) return;
    try {
      const file = this.config.rosterFile;
      mkdirSync(dirname(file), { recursive: true });
      const payload = { version: 1, updatedAt: new Date().toISOString(), principals: [...this.roster.values()] };
      const tmp = `${file}.tmp.${process.pid}`;
      writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
      renameSync(tmp, file);
      this.rosterDirty = false;
    } catch (error) {
      this.warnOnce('roster-save-failed', '[workdsh-identity] 花名册落盘失败（不影响本次请求）：' + describeError(error));
    }
  }

  // ---------------------------------------------------------------- 诊断端点

  /**
   * `GET /workdsh-identity/whoami?sessionId=…`
   * 只回显**调用者自己**被解析成谁，用于验证与排障；不含密钥、不含他人信息。
   */
  private registerWhoami(): void {
    try {
      // 路由由插件作用域持有：模块卸载时必须撤销，否则会留下指向已销毁服务的处理器。
      this.ctx.effect(
        () => this.ctx.webServer.register({
          kind: 'exact',
          path: this.config.whoamiPath,
          handler: (request: IncomingMessage, response: ServerResponse) => this.whoami(request, response),
        }),
        'workdshIdentity.whoamiRoute',
      );
    } catch (error) {
      this.warnOnce('whoami-register-failed', '[workdsh-identity] 诊断路由注册失败：' + describeError(error));
    }
  }

  private whoami(request: IncomingMessage, response: ServerResponse): void {
    const current = this.scoped.getStore() ?? null;
    let sessionId: string | undefined;
    try {
      sessionId = new URL(request.url ?? '/', 'http://identity.local').searchParams.get('sessionId') ?? undefined;
    } catch {
      sessionId = undefined;
    }
    const body = {
      ok: true,
      signed: current !== null,
      scopedIdentity: current === null
        ? null
        : { username: current.username, role: current.role, jobRole: current.jobRole, principalId: current.principalId },
      resolvedActor: this.actorFor(sessionId === undefined ? {} : { sessionId }),
      sessionBinding: sessionId === undefined ? null : (this.bindingOf(sessionId) ?? null),
      organization: this.organization,
      fallbackPrincipalId: this.config.fallbackPrincipalId,
      secretLoaded: this.secret !== null,
      requireSignature: this.config.requireSignature,
      activation: { file: this.config.activationFile || null, ready: this.activationReady() },
      rosterSize: this.roster.size,
      bridge: { hits: this.bridgeHits, accepted: this.bridgeAccepted, rejected: this.bridgeRejected },
      lastApiIdentity: this.lastApiIdentity,
      bindingStore: this.bindingStoreDiagnostics(),
    };
    response.statusCode = 200;
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.setHeader('cache-control', 'no-store');
    response.end(JSON.stringify(body));
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    try {
      this.ctx.logger?.warn?.(message);
    } catch { /* 日志不是关键路径 */ }
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default PortalIdentityService;
