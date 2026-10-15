/**
 * 站点资源「成员基线授权」迁移工具：一次性迁移 + 持续收敛（Host 半边）。
 *
 * 解决的问题：DSH 访问层的判定是
 *   「actor 是资源所有者 → 放行；否则需要匹配动作的显式 grant；否则拒绝」。
 * 而本站资源（专家、Office 文档、技能、连接器）**全部属于站点所有者**。
 * 一旦启用按账号主体，普通账号既非所有者又无 grant，专家使用与文档编辑会被全部拒绝。
 *
 * 本服务做两件事：
 *   ① **一次性迁移**：以所有者身份为每个活跃账号签发基线 grant（默认 `read` + `use`）。
 *   ② **持续收敛**（ensure 循环）：站点资源是会长出来的（新账号注册、管理员新建专家），
 *      所以不能只跑一次。循环按固定间隔做一遍幂等 ensure，并在监听到 watched 域写入后
 *      去抖触发一次。收敛内容包括「花名册里新出现的主体」与「站点所有者新建的资源」。
 *
 * 刻意**不**做的事：
 *   · 不冒充他人。`resolve({})` 在无请求身份时返回站点所有者，所以「站点所有者拥有的资源」
 *     可以安全地由本服务签发；**其他主体拥有的资源**默认不动（要共享请用面板显式授权，
 *     或显式打开 `autoShareMemberOwned`，那会以该资源所有者的身份签发，属更强的策略，默认关）。
 *   · 不 open 任何别人拥有的 storage domain（同名重复 open 会抛 already-open），只 `get()` 读。
 *
 * 路由：`GET /workdsh-grant-baseline/run[?apply=1][&principals=a,b][&actions=read,use]`
 *       `GET /workdsh-grant-baseline/status`
 *
 * 默认是 **dry-run**：不带 `apply=1` 只统计不写盘。定时循环与事件触发则始终显式 `apply: true`。
 * @module workdsh-plugin-access/grant-baseline
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { Service, type Context } from '@deepseek-ai/cordis';
/** Type-only: activates the official `ctx.webServer` augmentation. */
import type {} from '@deepseek-ai/dsh-host-webserver';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import Schema from '@deepseek-ai/schemastery';
import type { AccessGrant, ResourceOwner } from 'workdsh-contracts';
import { describeError, listRecords, parseCsv, pathSafe, readRecordFile, requestUrl, sendJson } from './records.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshGrantBaseline: GrantBaselineService;
  }
}

/** 迁移工具配置；全部可由部署配置覆盖。 */
export interface GrantBaselineConfig {
  organizationId: string;
  siteOwnerPrincipalId: string;
  storageRoot: string;
  /** 技能枚举来源目录。 */
  skillsRoot: string;
  /** MCP 连接清单文件。 */
  connectorFile: string;
  rosterFile: string;
  baselineActions: string;
  routePath: string;
  statusPath: string;
  /** ensure 循环间隔（毫秒）；0 = 关闭循环，只保留手动调用。 */
  ensureIntervalMs: number;
  /** watched 域写入后的去抖延迟（毫秒）。 */
  changeDebounceMs: number;
  /** watched 域：只有这些域的记录会触发即时收敛。 */
  watchedDomains: string;
  /** 是否也把「成员拥有的资源」自动共享给全体成员（会以该资源所有者的身份签发）。默认关。 */
  autoShareMemberOwned: boolean;
  /** 站点资源交给哪些岗位角色**管理**（逗号分隔；空 = 不开启）。 */
  manageJobRoles: string;
  /** 管理岗位获得的动作集合。 */
  manageActions: string;
  /** 是否回收本工具签发过、但已不在计划内的授权。默认开。 */
  pruneStale: boolean;
  /** 花名册文件轮询间隔（毫秒）；0 = 关闭。 */
  rosterWatchMs: number;
  /** 启动后是否立刻跑一次真写收敛（毫秒）；0 = 关闭。 */
  ensureOnStartMs: number;
  /** 授权就绪标记文件（空 = 不做门控）。 */
  activationFile: string;
}

const DEFAULTS: GrantBaselineConfig = Object.freeze({
  organizationId: 'local-personal',
  siteOwnerPrincipalId: 'local-user',
  storageRoot: '/data/dsh/storages',
  skillsRoot: '/data/dsh/home/.agents/skills',
  connectorFile: '/data/dsh/storages/mcp_connector.json',
  rosterFile: '/data/dsh/storages/workdsh_identity_portal/principals.json',
  baselineActions: 'read,use',
  routePath: '/workdsh-grant-baseline/run',
  statusPath: '/workdsh-grant-baseline/status',
  ensureIntervalMs: 30_000,
  changeDebounceMs: 3_000,
  watchedDomains: 'workdsh_experts,workdsh_office',
  autoShareMemberOwned: false,
  manageJobRoles: '',
  manageActions: 'read,use,edit,manage',
  pruneStale: true,
  rosterWatchMs: 2_000,
  ensureOnStartMs: 1_500,
  activationFile: '',
});

export const Config = Schema.object({
  organizationId: Schema.string().default(DEFAULTS.organizationId),
  siteOwnerPrincipalId: Schema.string().default(DEFAULTS.siteOwnerPrincipalId),
  storageRoot: Schema.string().default(DEFAULTS.storageRoot),
  skillsRoot: Schema.string().default(DEFAULTS.skillsRoot),
  connectorFile: Schema.string().default(DEFAULTS.connectorFile),
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
});

/** 一条站点资源（含所有者，用于确定由谁签发）。 */
interface BaselineResource {
  readonly domain: string;
  readonly id: string;
  readonly revision: string;
  readonly owner: ResourceOwner;
  readonly label: string;
}

/** 花名册条目：管理岗位的判定需要 `jobRole`。 */
interface RosterEntry {
  readonly principalId: string;
  readonly username: string | null;
  readonly role: string | null;
  readonly jobRole: string;
}

interface EnsureCounts {
  resources: number;
  ownedBySite: number;
  ownedByMembers: number;
  skippedForeign: number;
  planned: number;
  pending: number;
  created: number;
  updated: number;
  unchanged: number;
  pruned: number;
  failed: number;
}

/** 一轮收敛的汇总；任何单个 grant 失败只记数，不中断整轮。 */
export interface EnsureResult {
  mode: 'apply' | 'dry-run';
  trigger: string;
  organizationId: string;
  siteOwnerPrincipalId: string;
  actions: readonly string[];
  principals: readonly string[];
  counts: EnsureCounts;
  errors: { id: string; error: string }[];
  sample: { id: string; resource: string; subject: string; actions: readonly string[]; as: string }[];
  ok?: boolean;
  error?: string;
  elapsedMs?: number;
  skipped?: string;
}

/** 收敛轮次之间的可观测状态。 */
interface BaselineState {
  runs: number;
  lastRunAt: string | null;
  lastResult: { trigger: string; elapsedMs?: number; counts: EnsureCounts; ok?: boolean } | null;
  lastTrigger: string | null;
  lastError: string | null;
  changeEvents: number;
  timerActive: boolean;
}

/** 稳定的 grant 修订号：只由动作集合决定，因此同一动作集合重跑不会改写已签发的授权。 */
function stableRevision(actions: readonly string[]): string {
  return `baseline-${createHash('sha256').update([...actions].sort().join(',')).digest('hex').slice(0, 32)}`;
}

export class GrantBaselineService extends Service {
  static inject = ['workdshAccess', 'workdshIdentity', 'storageDomain', 'webServer'];
  static Config = Config;

  private readonly config: GrantBaselineConfig;
  private readonly state: BaselineState = {
    runs: 0,
    lastRunAt: null,
    lastResult: null,
    lastTrigger: null,
    lastError: null,
    changeEvents: 0,
    timerActive: false,
  };
  private timer: NodeJS.Timeout | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private rosterTimer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(ctx: Context, config: Partial<GrantBaselineConfig> = {}) {
    super(ctx, 'workdshGrantBaseline');
    this.config = Object.freeze({ ...DEFAULTS, ...config });
  }

  async [Service.init](): Promise<void> {
    this.registerRoutes();
    this.registerChangeListener();
    this.startLoop();
    this.startRosterWatch();
    this.startOnStartEnsure();
  }

  // ------------------------------------------------------------------ 对外接口

  private registerRoutes(): void {
    try {
      this.ctx.effect(
        () => this.ctx.webServer.register({
          kind: 'exact',
          path: this.config.routePath,
          handler: (request, response) => this.handleRun(request, response),
        }),
        'workdshGrantBaseline.routeRun',
      );
      this.ctx.effect(
        () => this.ctx.webServer.register({
          kind: 'exact',
          path: this.config.statusPath,
          handler: (_request, response) => {
            sendJson(response, 200, {
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
              state: this.state,
            });
          },
        }),
        'workdshGrantBaseline.routeStatus',
      );
    } catch (error) {
      this.ctx.logger?.warn?.('[workdsh-grant-baseline] 路由注册失败：' + describeError(error));
    }
  }

  /** watched 域有写入就去抖触发一次收敛：新资源不必等下一个周期。 */
  private registerChangeListener(): void {
    const watched = new Set(parseCsv(this.config.watchedDomains));
    try {
      this.ctx.on('domain/changed', (change) => {
        if (!change || change.operation !== 'put') return;
        if (!watched.has(change.domain)) return;
        this.state.changeEvents += 1;
        this.scheduleEnsure('domain-change');
      });
    } catch (error) {
      this.ctx.logger?.warn?.('[workdsh-grant-baseline] domain/changed 监听注册失败：' + describeError(error));
    }
  }

  private startLoop(): void {
    const interval = Number(this.config.ensureIntervalMs);
    if (!Number.isFinite(interval) || interval <= 0) return;
    this.state.timerActive = true;
    this.timer = setInterval(() => this.scheduleEnsure('interval'), interval);
    // 定时器属于插件作用域：插件卸载时必须清掉，否则会留下野定时器持续写授权。
    this.ctx.effect(() => () => {
      if (this.timer) clearInterval(this.timer);
      if (this.debounce) clearTimeout(this.debounce);
      this.state.timerActive = false;
    }, 'workdshGrantBaseline.timer');
  }

  /**
   * 轮询花名册文件的 mtime：新主体（例如刚登录的管理员）一出现就触发一次收敛。
   * 没有它，新管理员要等一个 ensure 周期才拿到 manage 授权——表现为「刚登录却改不了权限」。
   */
  private startRosterWatch(): void {
    const interval = Number(this.config.rosterWatchMs);
    if (!Number.isFinite(interval) || interval <= 0) return;
    let last = this.rosterMtime();
    this.rosterTimer = setInterval(() => {
      // 定时器里的同步异常会变成 uncaught exception 并**杀死整个 DSH 进程**，
      // 所以定时器回调必须自己兜住所有异常，绝不能让它冒出去。
      try {
        const now = this.rosterMtime();
        if (now !== last) {
          last = now;
          this.scheduleEnsure('roster-change');
        }
      } catch (error) {
        this.state.lastError = describeError(error);
      }
    }, interval);
    this.ctx.effect(() => () => {
      if (this.rosterTimer) clearInterval(this.rosterTimer);
    }, 'workdshGrantBaseline.rosterWatch');
  }

  /** 启动后先跑一轮**真写**的收敛：把「门户已开始签发身份、授权却还没写」的窗口压到最小。 */
  private startOnStartEnsure(): void {
    const delay = Number(this.config.ensureOnStartMs);
    if (!Number.isFinite(delay) || delay <= 0) return;
    const timer = setTimeout(() => {
      // 同上：这里同步抛错会直接终止进程。宁可收敛失败，也不能让站点挂掉。
      try {
        this.ensure({ trigger: 'startup', apply: true }).catch((error) => {
          this.state.lastError = describeError(error);
        });
      } catch (error) {
        this.state.lastError = describeError(error);
      }
    }, delay);
    this.ctx.effect(() => () => clearTimeout(timer), 'workdshGrantBaseline.startupEnsure');
  }

  private rosterMtime(): number {
    try {
      return statSync(this.config.rosterFile).mtimeMs;
    } catch {
      return 0;
    }
  }

  private scheduleEnsure(trigger: string): void {
    // 单一兜底点：定时器与事件监听都从这里进来，任何同步异常都不能冒到进程级。
    try {
      if (this.debounce) clearTimeout(this.debounce);
      this.debounce = setTimeout(() => {
        this.debounce = null;
        // 必须显式 apply：ensure() 的默认是 dry-run（安全默认），
        // 漏传会让循环「看起来在跑、实际一条都没写」——这个 bug 被沙箱测试抓到过。
        try {
          this.ensure({ trigger, apply: true }).catch((error) => {
            this.state.lastError = describeError(error);
          });
        } catch (error) {
          this.state.lastError = describeError(error);
        }
      }, Math.max(0, Number(this.config.changeDebounceMs) || 0));
    } catch (error) {
      this.state.lastError = describeError(error);
    }
  }

  // ------------------------------------------------------------------ 核心：幂等收敛

  /**
   * 做一遍幂等 ensure。返回汇总；任何单个 grant 失败只记数，不中断整轮。
   * @param options.dryRun - 为 true 时只统计不写盘（路由默认 dry-run；循环始终真写）。
   * @param options.apply - 是否真的写盘。
   * @param options.principals - 覆盖主体列表（默认取花名册）。
   * @param options.actions - 覆盖基线动作集合。
   * @param options.trigger - 触发来源，写入状态供运营判断「是谁触发的这一轮」。
   * @returns 本轮汇总。
   */
  async ensure(options: {
    dryRun?: boolean;
    apply?: boolean;
    principals?: readonly string[];
    actions?: readonly string[];
    trigger?: string;
  } = {}): Promise<EnsureResult> {
    const { apply = false, dryRun = !apply, principals, actions, trigger = 'manual' } = options;
    if (this.running) {
      return {
        ok: true,
        skipped: 'already-running',
        mode: apply ? 'apply' : (dryRun ? 'dry-run' : 'apply'),
        trigger,
        organizationId: this.config.organizationId,
        siteOwnerPrincipalId: this.config.siteOwnerPrincipalId,
        actions: [],
        principals: [],
        counts: emptyCounts(),
        errors: [],
        sample: [],
      };
    }
    this.running = true;
    const startedAt = Date.now();
    const wantedActions = actions ?? parseCsv(this.config.baselineActions);
    const manageActions = parseCsv(this.config.manageActions);
    const manageJobRoles = new Set(parseCsv(this.config.manageJobRoles));
    const rosterEntries = this.readRosterEntries();
    const roster = principals ?? rosterEntries.map((entry) => entry.principalId);
    // 每个主体只发**一份**授权：管理岗位发超集（含 manage），其余发基线集合。
    // 这样同一主体在同一资源上不会出现两条重复 grant。
    const plan = roster.map((principalId) => {
      const entry = rosterEntries.find((row) => row.principalId === principalId);
      const isManager = entry !== undefined && manageJobRoles.has(entry.jobRole);
      return {
        principalId,
        actions: isManager ? manageActions : wantedActions,
        tag: isManager ? 'mgr' : 'base',
      };
    });
    const out: EnsureResult = {
      mode: apply ? 'apply' : (dryRun ? 'dry-run' : 'apply'),
      trigger,
      organizationId: this.config.organizationId,
      siteOwnerPrincipalId: this.config.siteOwnerPrincipalId,
      actions: wantedActions,
      principals: roster,
      counts: emptyCounts(),
      errors: [],
      sample: [],
    };
    try {
      const all = this.enumerateResources();
      out.counts.resources = all.length;
      const existing = this.existingGrants();

      const desiredIds = new Set<string>();
      for (const resource of all) {
        const ownerPrincipalId = String(resource.owner?.ownerPrincipalId ?? '');
        const isSiteOwned = ownerPrincipalId === this.config.siteOwnerPrincipalId;
        const isMemberOwned = !isSiteOwned && roster.includes(ownerPrincipalId);
        if (isSiteOwned) out.counts.ownedBySite += 1;
        else if (isMemberOwned) out.counts.ownedByMembers += 1;
        else out.counts.skippedForeign += 1;

        // 站点所有者拥有的资源：由本服务（actor = 站点所有者）签发，不需要冒充。
        // 成员拥有的资源：默认不动；只有显式打开 autoShareMemberOwned 才以该所有者身份签发。
        let issuerPrincipalId: string | null = null;
        if (isSiteOwned) issuerPrincipalId = this.config.siteOwnerPrincipalId;
        else if (isMemberOwned && this.config.autoShareMemberOwned) issuerPrincipalId = ownerPrincipalId;
        if (issuerPrincipalId === null) continue;

        const owner: ResourceOwner = {
          organizationId: resource.owner.organizationId ?? this.config.organizationId,
          ownerPrincipalId,
          scope: resource.owner.scope ?? 'personal',
        };
        for (const item of plan) {
          // 管理岗位用 -mgr 后缀，避免与同一主体同资源的基线 grant 相互覆盖。
          const suffix = item.tag === 'mgr' ? '-mgr' : '';
          const id = pathSafe(`baseline-${resource.domain}-${resource.id}-${item.principalId}${suffix}`);
          const revision = stableRevision(item.actions);
          desiredIds.add(id);
          out.counts.planned += 1;
          const current = existing.get(id);
          if (current && current.revision === revision) {
            out.counts.unchanged += 1;
            continue;
          }
          // pending = 本轮真正需要写的条数（planned 含已一致的），
          // 运维看这个数就知道「有没有活要干」，不必自己相减。
          out.counts.pending += 1;
          if (out.sample.length < 3) {
            out.sample.push({
              id,
              resource: `${resource.domain}/${resource.label}`,
              subject: item.principalId,
              actions: item.actions,
              as: issuerPrincipalId,
            });
          }
          if (!apply) continue;
          try {
            const issuerActor = {
              principalId: issuerPrincipalId,
              organizationId: this.config.organizationId,
              requestId: `baseline-${Date.now().toString(36)}-${out.counts.created + out.counts.updated}`,
              resolvedBy: 'workdsh-grant-baseline',
            };
            await this.ctx.workdshAccess.putGrant(issuerActor, owner, {
              id,
              organizationId: this.config.organizationId,
              subjectPrincipalId: item.principalId,
              resource: { domain: resource.domain, id: resource.id, revision: resource.revision },
              actions: item.actions as AccessGrant['actions'],
              revision,
            }, current ? current.revision : undefined);
            if (current) out.counts.updated += 1;
            else out.counts.created += 1;
          } catch (error) {
            out.counts.failed += 1;
            if (out.errors.length < 10) out.errors.push({ id, error: describeError(error) });
          }
        }
      }
      // 回收：本工具签发过、但已不在计划内的授权（岗位变动后必须真的失去权限）。
      if (apply && this.config.pruneStale) {
        const siteOwned = new Map(
          all
            .filter((entry) => String(entry.owner?.ownerPrincipalId ?? '') === this.config.siteOwnerPrincipalId)
            .map((entry) => [`${entry.domain}::${entry.id}`, entry] as const),
        );
        for (const [id, grant] of existing.entries()) {
          if (!id.startsWith('baseline-')) continue; // 只回收本工具签发的，不碰别人给的授权
          if (desiredIds.has(id)) continue;
          const resource = siteOwned.get(`${grant.resource?.domain}::${grant.resource?.id}`);
          if (!resource) continue;
          try {
            const ownerActor = {
              principalId: this.config.siteOwnerPrincipalId,
              organizationId: this.config.organizationId,
              requestId: `prune-${Date.now().toString(36)}`,
              resolvedBy: 'workdsh-grant-baseline',
            };
            await this.ctx.workdshAccess.revokeGrant(ownerActor, {
              organizationId: resource.owner.organizationId ?? this.config.organizationId,
              ownerPrincipalId: this.config.siteOwnerPrincipalId,
              scope: resource.owner.scope ?? 'personal',
            }, id, grant.revision);
            out.counts.pruned += 1;
          } catch (error) {
            out.counts.failed += 1;
            if (out.errors.length < 10) out.errors.push({ id, error: describeError(error) });
          }
        }
      }

      out.ok = out.counts.failed === 0;
      this.state.lastError = out.ok ? null : `${out.counts.failed} 个 grant 失败`;
      // 只有「这一轮完全成功」才认为授权就绪：写标记文件，身份服务据此决定是否开始认门户身份。
      if (out.ok && apply) this.markActivated(out.counts);
    } catch (error) {
      out.ok = false;
      out.error = describeError(error);
      this.state.lastError = out.error;
    } finally {
      this.running = false;
      this.state.runs += 1;
      this.state.lastRunAt = new Date().toISOString();
      this.state.lastTrigger = trigger;
      out.elapsedMs = Date.now() - startedAt;
      this.state.lastResult = { trigger, elapsedMs: out.elapsedMs, counts: out.counts, ok: out.ok };
    }
    return out;
  }

  // ------------------------------------------------------------------ 数据来源

  /** 授权就绪标记：身份服务读同一个文件来决定「是否开始认门户身份」。写失败只记状态。 */
  private markActivated(counts: EnsureCounts): void {
    const file = this.config.activationFile;
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true });
      const payload = { activatedAt: new Date().toISOString(), counts };
      const tmp = `${file}.tmp.${process.pid}`;
      writeFileSync(tmp, `${JSON.stringify(payload)}\n`, { mode: 0o600 });
      renameSync(tmp, file);
    } catch (error) {
      this.state.lastError = 'activation-write-failed: ' + describeError(error);
    }
  }

  /**
   * 站点资源清单。只读文件，绝不 open 别人的 domain：
   * 专家与 Office 文档来自 per-record 目录；技能与连接器来自站点资产目录/清单。
   */
  private enumerateResources(): BaselineResource[] {
    const resources: BaselineResource[] = [];
    for (const { record } of listRecords(join(this.config.storageRoot, 'workdsh_experts', 'experts'))) {
      if (!record.id || !record.owner) continue;
      resources.push({
        domain: 'workdsh-experts',
        id: String(record.id),
        revision: String(record.revision ?? ''),
        owner: record.owner as ResourceOwner,
        label: record.name ?? String(record.id),
      });
    }
    for (const { record } of listRecords(join(this.config.storageRoot, 'workdsh_office', 'documents'))) {
      if (!record.documentId || !record.owner) continue;
      resources.push({
        domain: 'office',
        id: String(record.documentId),
        revision: String(record.revision ?? ''),
        owner: record.owner as ResourceOwner,
        label: record.title ?? String(record.documentId).slice(0, 12),
      });
    }
    // 技能与连接器此前既没有授权判定点、也不在基线枚举里。若只加拦截不补这里，
    // 管理岗位会因为拿不到 manage 而被一起拒掉（管理面瘫痪）。
    // 站点资产统一按「站点所有者拥有」处理，于是：
    //   · 所有活跃成员拿到 baselineActions（read,use）
    //   · manageJobRoles 命中的岗位额外拿到 manage
    const siteOwner: ResourceOwner = {
      organizationId: this.config.organizationId,
      ownerPrincipalId: this.config.siteOwnerPrincipalId,
      scope: 'organization',
    };
    const resourceId = /^[A-Za-z0-9._:-]{1,256}$/;
    try {
      for (const name of readdirSync(this.config.skillsRoot)) {
        if (!name || name.startsWith('.') || !resourceId.test(name)) continue;
        resources.push({
          domain: 'workdsh-skills', id: name, revision: 'v1', owner: siteOwner, label: name,
        });
      }
    } catch {
      /* 目录缺失不视为错误 */
    }
    try {
      const manifest = JSON.parse(readFileSync(this.config.connectorFile, 'utf8'));
      const connections = manifest?.tables?.connections ?? {};
      for (const key of Object.keys(connections)) {
        if (!resourceId.test(key)) continue;
        resources.push({
          domain: 'workdsh-connectors',
          id: key,
          revision: 'v1',
          owner: siteOwner,
          label: connections[key]?.name ?? key,
        });
      }
    } catch {
      /* 清单缺失不视为错误 */
    }
    // 域级入口：create / installFromCatalog 这类调用没有具体资源 id，判定用 id="*"。
    // 若不给它发 grant，连管理岗位都创建不了连接器/技能。
    resources.push({ domain: 'workdsh-skills', id: '*', revision: 'v1', owner: siteOwner, label: '技能·域级操作' });
    resources.push({ domain: 'workdsh-connectors', id: '*', revision: 'v1', owner: siteOwner, label: '连接器·域级操作' });
    return resources;
  }

  /** 花名册原始条目（含岗位角色）：管理岗位的判定需要 `jobRole`。 */
  private readRosterEntries(): RosterEntry[] {
    try {
      const parsed = JSON.parse(readFileSync(this.config.rosterFile, 'utf8'));
      return (Array.isArray(parsed?.principals) ? parsed.principals : [])
        .filter((entry: Record<string, any>) => entry?.state === 'active' && typeof entry.principalId === 'string')
        .map((entry: Record<string, any>) => ({
          principalId: entry.principalId,
          username: entry.username ?? null,
          role: entry.role ?? null,
          jobRole: entry.jobRole ?? '',
        }));
    } catch {
      return [];
    }
  }

  /** 只 get，不 open：`workdsh_access` 归本模块的 AccessManager 所有。 */
  private existingGrants(): Map<string, AccessGrant> {
    try {
      const table = this.ctx.storageDomain?.get?.('workdsh_access')?.table('grants') as
        | KvTable<string, AccessGrant>
        | undefined;
      if (!table) return new Map();
      return new Map(table.entries());
    } catch {
      return new Map();
    }
  }

  // ------------------------------------------------------------------ HTTP

  private async handleRun(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = requestUrl(request, 'http://baseline.local');
    const apply = url.searchParams.get('apply') === '1';
    const principals = url.searchParams.get('principals')?.split(',').map((v) => v.trim()).filter(Boolean);
    const actions = url.searchParams.get('actions')?.split(',').map((v) => v.trim()).filter(Boolean);
    const result = await this.ensure({ apply, dryRun: !apply, principals, actions, trigger: 'http' });
    sendJson(response, 200, result);
  }
}

function emptyCounts(): EnsureCounts {
  return {
    resources: 0, ownedBySite: 0, ownedByMembers: 0, skippedForeign: 0,
    planned: 0, pending: 0, created: 0, updated: 0, unchanged: 0, pruned: 0, failed: 0,
  };
}

export default GrantBaselineService;
