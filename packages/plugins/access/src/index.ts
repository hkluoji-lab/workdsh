import { createHash, randomUUID } from 'node:crypto';
import { Context, Service } from '@deepseek-ai/cordis';
import { defineDomain, domainTable, type KvTable } from '@deepseek-ai/dsh-storage-domain';
import { z } from 'zod';
import {
  assertActorContext,
  assertResourceOwner,
  GovernanceContractError,
  type AccessAction,
  type AccessGrant,
  type AccessService,
  type ActorContext,
  type AuditEvent,
  type AuditService,
  type AuthorizationDecision,
  type AuthorizationRequest,
  type IdentityService,
  type ResourceOwner,
  type ResourceRef,
} from 'workdsh-contracts';

const bounded = z.string().min(1).max(256).refine((value) => !/[\u0000-\u001f]/.test(value));
const resourceRefSchema: z.ZodType<ResourceRef> = z.object({ domain: bounded, id: bounded, revision: bounded.optional() });
const accessGrantSchema: z.ZodType<AccessGrant> = z.object({
  id: bounded,
  organizationId: bounded,
  subjectPrincipalId: bounded,
  resource: resourceRefSchema,
  actions: z.array(z.enum(['read', 'use', 'edit', 'manage'])).min(1),
  revision: bounded,
});

export const accessDomainSpec = defineDomain({
  name: 'workdsh_access',
  version: 1,
  layout: 'per-record',
  tables: { grants: domainTable<string, AccessGrant>(accessGrantSchema) },
});

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshIdentity: IdentityService;
    workdshAudit: AuditService;
    workdshAccess: AccessManager;
  }
}

function sameResource(left: ResourceRef, right: ResourceRef): boolean {
  return left.domain === right.domain && left.id === right.id;
}

function validateResource(resource: ResourceRef): void {
  if (!resourceRefSchema.safeParse(resource).success) {
    throw new GovernanceContractError('access/invalid-resource', 'Resource reference is invalid.');
  }
}

function validateGrant(grant: AccessGrant): void {
  if (!accessGrantSchema.safeParse(grant).success || new Set(grant.actions).size !== grant.actions.length) {
    throw new GovernanceContractError('access/invalid-grant', 'Access grant is invalid.');
  }
}

function authorizationRevision(membershipRevision: string | undefined, grants: readonly AccessGrant[]): string {
  const hash = createHash('sha256');
  hash.update(membershipRevision ?? 'no-membership');
  for (const grant of [...grants].sort((left, right) => left.id.localeCompare(right.id))) {
    hash.update('\0');
    hash.update(grant.id);
    hash.update('\0');
    hash.update(grant.revision);
  }
  return hash.digest('hex');
}

export class AccessManager extends Service implements AccessService {
  static inject = ['storageDomain', 'workdshIdentity', 'workdshAudit'];
  private grants?: KvTable<string, AccessGrant>;
  private mutationTail: Promise<void> = Promise.resolve();

  constructor(ctx: Context) {
    super(ctx, 'workdshAccess');
  }

  async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(accessDomainSpec);
    this.ctx.effect(() => () => domain.close(), 'workdshAccess.domainClose');
    this.grants = domain.table('grants');
  }

  async authorize(request: AuthorizationRequest, signal?: AbortSignal): Promise<AuthorizationDecision> {
    signal?.throwIfAborted();
    assertActorContext(request.actor);
    assertResourceOwner(request.owner);
    validateResource(request.resource);
    const grants = [...this.requireGrants().entries()]
      .map(([, grant]) => grant)
      .filter((grant) => grant.organizationId === request.owner.organizationId
        && grant.subjectPrincipalId === request.actor.principalId
        && sameResource(grant.resource, request.resource));
    const membership = this.ctx.workdshIdentity.membership(request.actor.organizationId, request.actor.principalId);
    let decision: AuthorizationDecision;
    if (request.actor.organizationId !== request.owner.organizationId) {
      decision = this.deny('access/cross-organization', membership?.revision, grants);
    } else if (!membership || membership.state !== 'active') {
      decision = this.deny('access/inactive-membership', membership?.revision, grants);
    } else if (request.actor.principalId === request.owner.ownerPrincipalId) {
      decision = this.allow('access/resource-owner', membership.revision, []);
    } else {
      const matching = grants.filter((grant) => grant.actions.includes(request.action));
      decision = matching.length
        ? this.allow('access/explicit-grant', membership.revision, matching)
        : this.deny('access/not-granted', membership.revision, grants);
    }
    await this.audit(request.actor, 'access.authorize', request.resource,
      decision.effect === 'allow' ? 'succeeded' : 'denied', decision.code,
      { requestedAction: request.action, authorizationRevision: decision.authorizationRevision });
    return decision;
  }

  putGrant(
    actor: ActorContext,
    owner: ResourceOwner,
    grant: AccessGrant,
    expectedRevision?: string,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.enqueueMutation(async () => {
      signal?.throwIfAborted();
      validateGrant(grant);
      const management = await this.authorize({ actor, action: 'manage', resource: grant.resource, owner }, signal);
      if (management.effect !== 'allow') throw new GovernanceContractError('access/denied', management.code);
      if (grant.organizationId !== owner.organizationId) {
        throw new GovernanceContractError('access/cross-organization', 'Grant and resource owner must share an organization.');
      }
      const subject = this.ctx.workdshIdentity.membership(grant.organizationId, grant.subjectPrincipalId);
      if (!subject || subject.state !== 'active') {
        throw new GovernanceContractError('access/inactive-subject', 'Grant subject is not an active member.');
      }
      const grants = this.requireGrants();
      const current = grants.get(grant.id);
      if ((current && expectedRevision !== current.revision) || (!current && expectedRevision !== undefined)) {
        throw new GovernanceContractError('access/revision-conflict', 'Grant revision does not match the current record.');
      }
      const operationId = randomUUID();
      await this.audit(actor, 'access.grant', grant.resource, 'unknown', 'access/grant-started', { operationId, grantId: grant.id });
      await grants.put(grant.id, Object.freeze({ ...grant, actions: Object.freeze([...grant.actions]) }));
      await this.audit(actor, 'access.grant', grant.resource, 'succeeded', 'access/grant-succeeded', { operationId, grantId: grant.id });
    });
  }

  revokeGrant(
    actor: ActorContext,
    owner: ResourceOwner,
    grantId: string,
    expectedRevision: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    return this.enqueueMutation(async () => {
      signal?.throwIfAborted();
      const grants = this.requireGrants();
      const current = grants.get(grantId);
      if (!current) return false;
      const management = await this.authorize({ actor, action: 'manage', resource: current.resource, owner }, signal);
      if (management.effect !== 'allow') throw new GovernanceContractError('access/denied', management.code);
      if (current.organizationId !== owner.organizationId) {
        throw new GovernanceContractError('access/resource-mismatch', 'Grant does not belong to this resource owner.');
      }
      if (current.revision !== expectedRevision) {
        throw new GovernanceContractError('access/revision-conflict', 'Grant revision does not match the current record.');
      }
      const operationId = randomUUID();
      await this.audit(actor, 'access.revoke', current.resource, 'unknown', 'access/revoke-started', { operationId, grantId });
      const deleted = await grants.delete(grantId);
      await this.audit(actor, 'access.revoke', current.resource, 'succeeded', 'access/revoke-succeeded', { operationId, grantId });
      return deleted;
    });
  }

  private allow(code: string, membershipRevision: string, grants: readonly AccessGrant[]): AuthorizationDecision {
    return Object.freeze({
      effect: 'allow', code,
      authorizationRevision: authorizationRevision(membershipRevision, grants),
      grantIds: Object.freeze(grants.map((grant) => grant.id).sort()),
    });
  }

  private deny(code: string, membershipRevision: string | undefined, grants: readonly AccessGrant[]): AuthorizationDecision {
    return Object.freeze({ effect: 'deny', code, authorizationRevision: authorizationRevision(membershipRevision, grants), grantIds: Object.freeze([]) });
  }

  private async audit(
    actor: ActorContext,
    action: string,
    target: ResourceRef,
    outcome: AuditEvent['outcome'],
    code: string,
    references: Readonly<Record<string, string>>,
  ): Promise<void> {
    await this.ctx.workdshAudit.append({
      id: randomUUID(),
      occurredAt: new Date().toISOString(),
      requestId: actor.requestId,
      principalId: actor.principalId,
      organizationId: actor.organizationId,
      action,
      target,
      outcome,
      code,
      ...(actor.sessionId ? { sessionId: actor.sessionId } : {}),
      ...(actor.runId ? { runId: actor.runId } : {}),
      references,
    });
  }

  private requireGrants(): KvTable<string, AccessGrant> {
    if (!this.grants) throw new GovernanceContractError('access/not-ready', 'Access manager is not ready.');
    return this.grants;
  }

  private enqueueMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationTail.then(operation);
    this.mutationTail = result.then(() => undefined, () => undefined);
    return result;
  }
}

export default AccessManager;
