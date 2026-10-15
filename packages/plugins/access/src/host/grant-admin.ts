/**
 * 资源授权管理（Host 半边）——面板「资源授权」的后端。
 *
 * 岗位策略只覆盖「站点公共资源」，真实运营还需要**逐资源**的例外（某个人给某个专家 `edit`、
 * 某个外部同事只给某一份文档 `read`）。本服务把这件事做成 HTTP 接口。
 *
 * 调用链：浏览器 → 门户 `/api/portal/grants*`（校验门户会话与管理员门槛）
 *              → 本服务 `/workdsh-grant-admin/*`（带**已签名**的门户身份头）
 *              → `workdshAccess.putGrant/revokeGrant`（以**调用者**身份执行）。
 *
 * 两道防线，缺一不可：
 *   1. 本服务必须验签。容器内 `127.0.0.1:3080` 可达，仅凭「客户端能发一个头」不足以作为身份依据；
 *   2. 授权动作以**调用者**身份提交，于是 DSH 访问层自己会判断「你到底能不能管这个资源」——
 *      本服务只做身份与岗位门槛，不做权限判定，判定交给唯一的授权真源。
 *
 * 为什么不放在门户里做：grant 存在 DSH 的 storage domain 里，跨进程不可直接写；
 * 且授权判定必须在 DSH 内部发生，否则就出现了第二套权限口径。
 * @module workdsh-plugin-access/grant-admin
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { Service, type Context } from '@deepseek-ai/cordis';
/** Type-only: activates the official `ctx.webServer` augmentation. */
import type {} from '@deepseek-ai/dsh-host-webserver';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import Schema from '@deepseek-ai/schemastery';
import type { AccessGrant, ResourceOwner } from 'workdsh-contracts';
import {
  GRANT_ADMIN_JOB_ROLES,
  PORTAL_IDENTITY_HEADERS,
  portalIdentityFromHeaders,
  readPortalSecret,
  type PortalIdentity,
} from './portal-signature.js';
import { describeError, listRecords, parseCsv, pathSafe, readJsonBody, requestUrl, sendJson } from './records.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshGrantAdmin: GrantAdminService;
  }
}

/** 面板后端配置；全部可由部署配置覆盖。 */
export interface GrantAdminConfig {
  /** 组织 id：本站以单一本地组织承载全部主体。 */
  organizationId: string;
  /** 站点所有者主体 id：站点公共资源的归属者。 */
  siteOwnerPrincipalId: string;
  /** 门户写入的共享密钥文件（0600）；不可用时一律 503，不做无身份放行。 */
  secretFile: string;
  /** 存储根目录：资源清单从这里只读枚举，不 open 任何 domain。 */
  storageRoot: string;
  /** 门户花名册：面板的候选主体来源。 */
  rosterFile: string;
  userHeader: string;
  roleHeader: string;
  jobRoleHeader: string;
  expiresHeader: string;
  signatureHeader: string;
  /** 本服务挂载的路径前缀。 */
  basePath: string;
  /** 允许管理资源授权的岗位角色（逗号分隔）。 */
  adminJobRoles: string;
  /** 允许授予的动作白名单（逗号分隔）。 */
  allowedActions: string;
}

const DEFAULTS: GrantAdminConfig = Object.freeze({
  organizationId: 'local-personal',
  siteOwnerPrincipalId: 'local-user',
  secretFile: '/data/dsh/portal/identity-bridge.key',
  storageRoot: '/data/dsh/storages',
  rosterFile: '/data/dsh/storages/workdsh_identity_portal/principals.json',
  userHeader: PORTAL_IDENTITY_HEADERS.user,
  roleHeader: PORTAL_IDENTITY_HEADERS.role,
  jobRoleHeader: PORTAL_IDENTITY_HEADERS.jobRole,
  expiresHeader: PORTAL_IDENTITY_HEADERS.expires,
  signatureHeader: PORTAL_IDENTITY_HEADERS.signature,
  basePath: '/workdsh-grant-admin',
  adminJobRoles: GRANT_ADMIN_JOB_ROLES.join(','),
  allowedActions: 'read,use,edit,manage',
});

export const Config = Schema.object({
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
});

/** 一条可被授权的站点资源。 */
interface AdminResource {
  readonly domain: string;
  readonly id: string;
  readonly revision: string;
  readonly label: string;
  readonly owner: ResourceOwner;
}

/** 一条面板候选主体。 */
interface AdminSubject {
  readonly principalId: string;
  readonly username: string | null;
  readonly jobRole: string | null;
  readonly role: string | null;
}

type GuardedHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  identity: PortalIdentity,
) => Promise<void>;

export class GrantAdminService extends Service {
  static inject = ['workdshAccess', 'workdshIdentity', 'storageDomain', 'webServer'];
  static Config = Config;

  private readonly config: GrantAdminConfig;
  private secret: string | null = null;
  private secretReadAt = 0;

  constructor(ctx: Context, config: Partial<GrantAdminConfig> = {}) {
    super(ctx, 'workdshGrantAdmin');
    this.config = Object.freeze({ ...DEFAULTS, ...config });
  }

  async [Service.init](): Promise<void> {
    // 与身份桥同样的失败安全：密钥不可用 → 一律 503，绝不「没有身份也放行」。
    this.secret = readPortalSecret(this.config.secretFile);
    const routes: readonly (readonly [string, GuardedHandler])[] = [
      ['/summary', async (_request, response, url, identity) => this.summary(response, url, identity)],
      ['/apply', async (request, response, _url, identity) => this.mutate(request, response, 'apply', identity)],
      ['/revoke', async (request, response, _url, identity) => this.mutate(request, response, 'revoke', identity)],
    ];
    for (const [suffix, handler] of routes) {
      try {
        // 路由由插件作用域持有：模块卸载时必须撤销，否则会留下指向已销毁服务的处理器。
        this.ctx.effect(
          () => this.ctx.webServer.register({
            kind: 'exact',
            path: `${this.config.basePath}${suffix}`,
            handler: (request, response) => this.guard(request, response, handler),
          }),
          `workdshGrantAdmin.route${suffix}`,
        );
      } catch (error) {
        this.ctx.logger?.warn?.(`[workdsh-grant-admin] 路由 ${suffix} 注册失败：` + describeError(error));
      }
    }
  }

  /** 密钥可能比本服务晚出现（门户先起、密钥后写；或运维轮换），故限频重试而不是启动时定死。 */
  private secretNow(): string | null {
    if (this.secret !== null) return this.secret;
    if (Date.now() - this.secretReadAt < 5000) return null;
    this.secretReadAt = Date.now();
    this.secret = readPortalSecret(this.config.secretFile);
    return this.secret;
  }

  /** 统一入口：验签 → 岗位门槛 → 交给具体 handler。 */
  private async guard(request: IncomingMessage, response: ServerResponse, handler: GuardedHandler): Promise<void> {
    const secret = this.secretNow();
    if (secret === null) return sendJson(response, 503, { ok: false, error: 'bridge-unavailable' });
    const identity = portalIdentityFromHeaders(request.headers, secret, {
      user: this.config.userHeader,
      role: this.config.roleHeader,
      jobRole: this.config.jobRoleHeader,
      expires: this.config.expiresHeader,
      signature: this.config.signatureHeader,
    });
    if (identity === null) return sendJson(response, 401, { ok: false, error: 'unauthenticated' });
    const admins = parseCsv(this.config.adminJobRoles);
    // 平台管理员（门户 role=admin）与授权管理岗位都可进入；否则 403。
    if (identity.role !== 'admin' && !admins.includes(identity.jobRole)) {
      return sendJson(response, 403, { ok: false, error: 'forbidden', jobRole: identity.jobRole });
    }
    try {
      await handler(request, response, requestUrl(request, 'http://grant.local'), identity);
    } catch (error) {
      sendJson(response, 500, { ok: false, error: 'internal', message: describeError(error) });
    }
  }

  private actor(identity: PortalIdentity) {
    return {
      principalId: identity.principalId,
      organizationId: this.config.organizationId,
      requestId: randomUUID(),
      resolvedBy: 'workdsh-grant-admin',
    };
  }

  /** 站点资源清单：只认当前调用 `authorize` 的两个域（专家、Office）。只读文件，不 open domain。 */
  private resources(): AdminResource[] {
    const out: AdminResource[] = [];
    for (const { record } of listRecords(join(this.config.storageRoot, 'workdsh_experts', 'experts'))) {
      if (!record.id || !record.owner) continue;
      out.push({
        domain: 'workdsh-experts',
        id: String(record.id),
        revision: String(record.revision ?? ''),
        label: record.name ?? String(record.id),
        owner: record.owner as ResourceOwner,
      });
    }
    for (const { record } of listRecords(join(this.config.storageRoot, 'workdsh_office', 'documents'))) {
      if (!record.documentId || !record.owner) continue;
      out.push({
        domain: 'office',
        id: String(record.documentId),
        revision: String(record.revision ?? ''),
        label: record.title ?? String(record.documentId).slice(0, 12),
        owner: record.owner as ResourceOwner,
      });
    }
    return out;
  }

  /** 只 get，不 open：`workdsh_access` 归本模块的 AccessManager 所有。 */
  private grantsTable(): KvTable<string, AccessGrant> | undefined {
    try {
      return this.ctx.storageDomain.get('workdsh_access')?.table('grants') as KvTable<string, AccessGrant> | undefined;
    } catch {
      return undefined;
    }
  }

  private roster(): AdminSubject[] {
    try {
      const parsed = JSON.parse(readFileSync(this.config.rosterFile, 'utf8'));
      return (parsed?.principals ?? []).map((entry: Record<string, any>) => ({
        principalId: entry.principalId,
        username: entry.username ?? null,
        jobRole: entry.jobRole ?? null,
        role: entry.role ?? null,
      }));
    } catch {
      return [];
    }
  }

  private async summary(response: ServerResponse, _url: URL, identity: PortalIdentity): Promise<void> {
    const table = this.grantsTable();
    const grants = table ? [...table.entries()].map(([id, grant]) => ({
      id,
      subjectPrincipalId: grant.subjectPrincipalId,
      actions: grant.actions,
      resource: grant.resource,
      revision: grant.revision,
    })) : [];
    sendJson(response, 200, {
      ok: true,
      caller: { principalId: identity.principalId, jobRole: identity.jobRole, role: identity.role },
      resources: this.resources().map(({ owner, ...rest }) => ({
        ...rest,
        ownerPrincipalId: owner?.ownerPrincipalId ?? null,
      })),
      subjects: this.roster(),
      grants,
      allowedActions: parseCsv(this.config.allowedActions),
      adminJobRoles: parseCsv(this.config.adminJobRoles),
    });
  }

  private async mutate(
    request: IncomingMessage,
    response: ServerResponse,
    mode: 'apply' | 'revoke',
    identity: PortalIdentity,
  ): Promise<void> {
    const body = await readJsonBody(request);
    if (body === null) return sendJson(response, 400, { ok: false, error: 'malformed' });
    const actor = this.actor(identity);
    const table = this.grantsTable();

    if (mode === 'revoke') {
      const grantId = String(body.grantId ?? '');
      const current = table?.get(grantId);
      if (!current) return sendJson(response, 404, { ok: false, error: 'not-found' });
      const resource = this.resources().find(
        (entry) => entry.domain === current.resource?.domain && entry.id === current.resource?.id,
      );
      const owner: ResourceOwner = {
        organizationId: current.organizationId,
        ownerPrincipalId: resource?.owner?.ownerPrincipalId ?? this.config.siteOwnerPrincipalId,
        scope: resource?.owner?.scope ?? 'personal',
      };
      try {
        await this.ctx.workdshAccess.revokeGrant(actor, owner, grantId, current.revision);
        sendJson(response, 200, { ok: true, revoked: grantId });
      } catch (error) {
        sendJson(response, 403, { ok: false, error: 'denied', message: describeError(error) });
      }
      return;
    }

    const allowed = new Set(parseCsv(this.config.allowedActions));
    const actions = (Array.isArray(body.actions) ? body.actions : [])
      .map((value: unknown) => String(value))
      .filter((value: string) => allowed.has(value));
    if (actions.length === 0) return sendJson(response, 400, { ok: false, error: 'no-valid-actions' });
    const subject = String(body.subjectPrincipalId ?? '');
    if (!subject) return sendJson(response, 400, { ok: false, error: 'missing-subject' });
    const resource = this.resources().find((entry) => entry.domain === body.domain && entry.id === body.id);
    if (!resource) return sendJson(response, 404, { ok: false, error: 'resource-not-found' });

    const id = pathSafe(body.grantId ?? `grant-${resource.domain}-${resource.id}-${subject}`);
    const current = table?.get(id);
    try {
      await this.ctx.workdshAccess.putGrant(
        actor,
        {
          organizationId: this.config.organizationId,
          ownerPrincipalId: resource.owner?.ownerPrincipalId ?? this.config.siteOwnerPrincipalId,
          scope: resource.owner?.scope ?? 'personal',
        },
        {
          id,
          organizationId: this.config.organizationId,
          subjectPrincipalId: subject,
          resource: { domain: resource.domain, id: resource.id, revision: resource.revision },
          // 面板只授予白名单动作；`manage` 也在白名单内，因此「拿到面板授权的人可以再授权」是可配的。
          actions: actions as AccessGrant['actions'],
          revision: `grant-${randomUUID()}`,
        },
        current ? current.revision : undefined,
      );
      sendJson(response, 200, {
        ok: true,
        id,
        actions,
        subject,
        resource: `${resource.domain}/${resource.id}`,
      });
    } catch (error) {
      // 访问层拒绝（调用者不是所有者、也没有 manage）会走到这里——这正是我们要的判定。
      sendJson(response, 403, { ok: false, error: 'denied', message: describeError(error) });
    }
  }
}

export default GrantAdminService;
