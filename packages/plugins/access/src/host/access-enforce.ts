/**
 * 技能与连接器的授权判定点（C4 / P2）。
 *
 * 为什么需要它：全 profile 里调用 `workdshAccess` 的只有 access 自身、experts、office。
 * 技能与 MCP 连接**没有任何授权判定点**——任一登录者都能删站点资产。
 *
 * 为什么不改官方包：沙箱与生产**共用同一份 `node_modules`**（沙箱是符号链接），
 * 改一处等于同时改生产。所以这里用「外挂插件包装管理器服务」的方式补判定。
 *
 * 判定链：
 *   请求作用域内的真实调用者 ← `ctx.workdshIdentity.profile()`
 *     （身份服务把已验签的门户身份放进异步上下文包住 `next()`）
 *   → `ctx.workdshAccess.authorize({ actor, action: 'manage', resource, owner })`
 *   → 拒绝则抛 `skill/access-not-granted` / `connector/access-not-granted`；dry-run 时只记录不拦。
 *
 * 失败语义（刻意选择，需与负例测试一起看）：
 *   `authorize` 本身抛错时——dry-run 阶段放行；enforce 阶段也**放行**并高声记录。
 *   理由：本部署的既有约定是「失败回落到既有行为」（见身份服务的兜底设计），
 *   判定器异常不等于「无权限」；若在此 fail-closed，一个资源 id 笔误就会让管理面瘫痪。
 *   真正的拒绝路径必须由**正常返回的 deny 决定**，不能依赖异常——负例测试覆盖这一点。
 * @module workdsh-plugin-access/access-enforce
 */
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { Service, type Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import type { SkillManagementService } from 'workdsh-contracts/skills';
import { describeError } from './records.js';

/** 本模块只包装破坏性方法，不导入连接器插件的实现；这是所需的最小结构面。 */
interface EnforceableConnectorService {
  [method: string]: unknown;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshAccessEnforce: AccessEnforceService;
    workdshSkills: SkillManagementService;
    workdshConnectors: EnforceableConnectorService;
  }
}

/** 包装幂等标记：`Symbol.for` 让同一进程内的重复包装可被识别（多实例/热重载）。 */
const WRAPPED = Symbol.for('workdsh.access.enforce.wrapped');

/** 判定点配置。 */
export interface AccessEnforceConfig {
  organizationId: string;
  siteOwnerPrincipalId: string;
  /** false = 只审计不拦截（先看真实流量，再打开）。 */
  enforce: boolean;
  /** 自检与判定记录落盘位置，供外部巡检发现「以为管住了、其实没管」。 */
  statusFile: string;
  /** 技能管理器上需要判定的破坏性方法（逗号分隔）。 */
  skillMethods: string;
  /** 连接器管理器上需要判定的破坏性方法（逗号分隔）。 */
  connectorMethods: string;
}

const DEFAULTS: AccessEnforceConfig = Object.freeze({
  organizationId: 'local-personal',
  siteOwnerPrincipalId: 'local-user',
  enforce: false,
  statusFile: '/data/dsh/tmp/access-enforce-status.json',
  skillMethods:
    'update,saveDraft,publishDraft,installImport,setEnabled,uninstall,batch,restore,installFromCatalog,writeResource',
  connectorMethods: 'create,update,remove,setEnabled',
});

export const Config = Schema.object({
  organizationId: Schema.string().default(DEFAULTS.organizationId),
  siteOwnerPrincipalId: Schema.string().default(DEFAULTS.siteOwnerPrincipalId),
  enforce: Schema.boolean().default(DEFAULTS.enforce),
  statusFile: Schema.string().default(DEFAULTS.statusFile),
  skillMethods: Schema.string().default(DEFAULTS.skillMethods),
  connectorMethods: Schema.string().default(DEFAULTS.connectorMethods),
});

interface EnforceState {
  startedAt: string;
  enforce: boolean;
  wrapped: string[];
  already: string[];
  missing: string[];
  failed: string[];
  decisions: Record<string, unknown>[];
}

export class AccessEnforceService extends Service {
  static inject = ['workdshSkills', 'workdshConnectors', 'workdshAccess', 'workdshIdentity'];
  static Config = Config;

  private readonly config: AccessEnforceConfig;
  private readonly state: EnforceState;

  constructor(ctx: Context, config: Partial<AccessEnforceConfig> = {}) {
    super(ctx, 'workdshAccessEnforce');
    this.config = Object.freeze({ ...DEFAULTS, ...config });
    this.state = {
      startedAt: new Date().toISOString(),
      enforce: this.config.enforce,
      wrapped: [],
      already: [],
      missing: [],
      failed: [],
      decisions: [],
    };

    this.install('skills', ctx.workdshSkills, 'workdsh-skills', this.config.skillMethods);
    this.install('connectors', ctx.workdshConnectors, 'workdsh-connectors', this.config.connectorMethods);
    this.writeStatus();

    // 自检结果必须能被外部看到：插件加载期抛错会拖垮整棵插件树，
    // 所以这里只高声记录 + 落状态文件，由外部巡检发现「以为管住了、其实没管」。
    if (this.state.missing.length || this.state.failed.length) {
      this.ctx.logger?.error?.(
        '[workdsh-access-enforce] 自检未通过：missing=%s failed=%s（这些方法未被包装，等于没有判定点）',
        JSON.stringify(this.state.missing),
        JSON.stringify(this.state.failed),
      );
    } else {
      this.ctx.logger?.info?.(
        '[workdsh-access-enforce] 已包装 %d 个破坏性方法；enforce=%s',
        this.state.wrapped.length,
        this.config.enforce,
      );
    }
  }

  private install(label: string, service: object, domain: string, methodsCsv: string): void {
    for (const method of methodsCsv.split(',').map((value) => value.trim()).filter(Boolean)) {
      this.wrapOne(label, service, domain, method);
    }
  }

  private wrapOne(label: string, service: object, domain: string, method: string): void {
    const key = `${label}.${method}`;
    const target = service as Record<string, unknown>;
    const original = target[method];
    if (typeof original !== 'function') {
      this.state.missing.push(key);
      return;
    }
    if ((original as unknown as Record<symbol, unknown>)[WRAPPED] === true) {
      this.state.already.push(key);
      return;
    }
    const self = this;
    const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      // 与连接器/技能管理器的既有约定一致：第一个参数是资源 id；
      // 无 id 的入口（如 create / installFromCatalog）按**域级** `'*'` 判定。
      const id = typeof args[0] === 'string' && args[0] !== '' ? args[0] : '*';
      const allowed = await self.authorizeCall(domain, id, key);
      if (!allowed && self.config.enforce) {
        // 抛**精确的错误码**，不带后缀。原因（实测两个插件的判定条件不同）：
        //   · 连接器：`known.has(cause.message)`——整条 message 必须**等于**已知码，
        //     所以带后缀会被判为未知 → 退化成 connector/internal（界面显示「请重试」）。
        //   · 技能：`error.message.startsWith('skill/')`——整条 message 即错误码。
        // 真正的上下文（哪个方法、哪个资源、哪个主体）在状态文件与访问审计里，不塞进 message。
        const code = domain === 'workdsh-skills' ? 'skill/access-not-granted' : 'connector/access-not-granted';
        const error = new Error(code) as Error & { code: string };
        error.code = code;
        throw error;
      }
      return await (original as (...callArgs: unknown[]) => unknown).apply(this, args);
    };
    Object.defineProperty(wrapped, WRAPPED, { value: true });
    try {
      target[method] = wrapped;
      this.state.wrapped.push(key);
    } catch (error) {
      this.state.failed.push(`${key}:${describeError(error)}`);
    }
  }

  private async authorizeCall(domain: string, id: string, key: string): Promise<boolean> {
    const profile = this.profile();
    const actor = {
      principalId: profile.principalId,
      organizationId: this.config.organizationId,
      requestId: randomUUID(),
      resolvedBy: 'workdsh-access-enforce',
    };
    const owner = {
      organizationId: this.config.organizationId,
      ownerPrincipalId: this.config.siteOwnerPrincipalId,
      scope: 'organization' as const,
    };
    const resource = { domain, id: String(id), revision: 'v1' };
    try {
      const decision = await this.ctx.workdshAccess.authorize({ actor, action: 'manage', resource, owner });
      const allowed = decision?.effect === 'allow';
      this.note({
        key, domain, id, principalId: actor.principalId,
        effect: decision?.effect, code: decision?.code, enforced: this.config.enforce,
      });
      return allowed;
    } catch (error) {
      // 见头部「失败语义」：判定异常不当作无权限，放行并高声记录。
      this.note({ key, domain, id, principalId: actor.principalId, error: describeError(error), enforced: this.config.enforce });
      this.ctx.logger?.error?.(
        '[workdsh-access-enforce] 判定异常（已放行，请检查 resource id 与授权基线）：%s %s/%s → %s',
        key, domain, id, describeError(error),
      );
      return true;
    }
  }

  private profile(): { principalId: string } {
    try {
      const profile = this.ctx.workdshIdentity.profile();
      if (profile?.principalId) return { principalId: profile.principalId };
    } catch {
      /* 回落到站点所有者，与身份服务的兜底一致 */
    }
    return { principalId: this.config.siteOwnerPrincipalId };
  }

  private note(entry: Record<string, unknown>): void {
    this.state.decisions.push(entry);
    if (this.state.decisions.length > 50) this.state.decisions.shift();
    this.writeStatus();
  }

  private writeStatus(): void {
    try {
      writeFileSync(this.config.statusFile, JSON.stringify(this.state, null, 2));
    } catch {
      /* 状态文件写不了不影响判定 */
    }
  }
}

export default AccessEnforceService;
