import { randomUUID } from 'node:crypto';
import { Context, Service } from '@deepseek-ai/cordis';
import type { KvTable } from '@deepseek-ai/dsh-storage-domain';
import type { ActorContext, ExpertSummary } from 'workdsh-contracts';
import type { ManagedSkillSummary } from 'workdsh-contracts/skills';
import type {
  Assistant,
  AssistantCatalogEntry,
  AssistantConnectorCatalog,
  AssistantDetail,
  AssistantReference,
  AssistantReferenceResolution,
  AssistantRevision,
  AssistantRevisionInput,
  AssistantService,
  AssistantStatus,
  AssistantSummary,
} from '../shared.js';
import { ASSISTANT_LIMITS, AssistantError, assertActorContext, normalizeInput } from '../domain/values.js';
import { assistantDomainSpec, assistantStateKey, type AssistantState } from '../storage/domain.js';

const timestamp = (): string => new Date().toISOString();

type Stored = AssistantState & { assistants: Record<string, Assistant>; revisions: Record<string, AssistantRevision> };

/** Resolution outcome of one reference. `unknown` means the owning plugin is not loaded. */
type Resolution = { readonly outcome: 'available' } | { readonly outcome: 'unresolved'; readonly reason: string } | { readonly outcome: 'unknown'; readonly owner: string };

/**
 * Sibling-plugin view read through the public service store. The assistant never imports
 * another feature plugin's modules and never reads its tables: each index is loaded from
 * the owning service, and an absent owner degrades to an explicit "unknown" instead of a
 * fabricated success.
 */
interface ReferenceIndex {
  readonly skills?: { readonly service: { detail(name: string, signal?: AbortSignal): Promise<{ readonly revision?: string } | undefined> }; readonly rows: readonly ManagedSkillSummary[] };
  readonly experts?: readonly ExpertSummary[];
  readonly connectors?: readonly { readonly id: string; readonly enabled: boolean; readonly state: string }[];
}

const LABELS: Readonly<Record<AssistantReference['kind'], string>> = { skill: '技能', expert: '专家', connector: '连接器' };

/**
 * The single Host domain service for assistants (D16 / P1-12, assistant module 0.1).
 *
 * The page and the Agent tools call exactly this surface. The transport resolves the
 * actor first, so no method accepts an owner, organization or confirmation flag from the
 * client or the model. Every write is serialized on one mutation tail and guarded by
 * optimistic concurrency (`expectedRevisionId`); revisions are append-only and deletion
 * is archival, so references other parts of the product already resolved never change
 * meaning.
 *
 * It owns no execution and no Session: creating an assistant never starts a task.
 */
export class AssistantManager extends Service implements AssistantService {
  static inject = ['storageDomain'];
  private table?: KvTable<string, AssistantState>;
  private serial: Promise<unknown> = Promise.resolve();

  constructor(ctx: Context) {
    super(ctx, 'workdshAssistant');
  }

  async [Service.init](): Promise<void> {
    const domain = await this.ctx.storageDomain.open(assistantDomainSpec);
    this.table = domain.table('states');
    this.ctx.effect(() => () => domain.close(), 'workdshAssistant.domainClose');
  }

  list(actor: ActorContext, query = ''): Promise<readonly AssistantSummary[]> {
    return this.listForStatus(actor, query, 'active');
  }

  listArchived(actor: ActorContext, query = ''): Promise<readonly AssistantSummary[]> {
    return this.listForStatus(actor, query, 'archived');
  }

  get(actor: ActorContext, assistantId: string): Promise<AssistantDetail> {
    return this.enqueue(async () => {
      const state = await this.state(actor);
      return this.detail(state, this.requireAssistant(state, assistantId));
    });
  }

  create(actor: ActorContext, input: AssistantRevisionInput): Promise<AssistantDetail> {
    return this.enqueue(async () => {
      const clean = normalizeInput(input);
      const state = await this.state(actor);
      await this.assertReferences(actor, clean.references);
      const now = timestamp();
      const assistantId = randomUUID();
      const revision: AssistantRevision = { ...clean, id: randomUUID(), assistantId, number: 1, createdBy: actor.principalId, createdAt: now };
      const assistant: Assistant = {
        id: assistantId, organizationId: actor.organizationId, ownerPrincipalId: actor.principalId,
        name: revision.name, description: revision.description, status: 'active',
        currentRevisionId: revision.id, createdAt: now, updatedAt: now,
      };
      const next: Stored = {
        ...state,
        assistants: { ...state.assistants, [assistant.id]: assistant },
        revisions: { ...state.revisions, [revision.id]: revision },
      };
      await this.put(actor, next);
      return this.detail(next, assistant);
    });
  }

  update(actor: ActorContext, assistantId: string, input: AssistantRevisionInput, expectedRevisionId: string): Promise<AssistantDetail> {
    return this.enqueue(async () => {
      const clean = normalizeInput(input);
      const state = await this.state(actor);
      const current = this.requireAssistant(state, assistantId);
      if (current.currentRevisionId !== expectedRevisionId) throw new AssistantError('assistant/revision-conflict', '助理已被更新，请刷新后重试。');
      const previous = state.revisions[current.currentRevisionId];
      if (!previous) throw new AssistantError('assistant/not-found', '助理不存在或无权访问。');
      await this.assertReferences(actor, clean.references);
      const now = timestamp();
      const revision: AssistantRevision = { ...clean, id: randomUUID(), assistantId, number: previous.number + 1, createdBy: actor.principalId, createdAt: now };
      const assistant: Assistant = { ...current, name: revision.name, description: revision.description, currentRevisionId: revision.id, updatedAt: now };
      const next: Stored = {
        ...state,
        assistants: { ...state.assistants, [assistant.id]: assistant },
        revisions: { ...state.revisions, [revision.id]: revision },
      };
      await this.put(actor, next);
      return this.detail(next, assistant);
    });
  }

  archive(actor: ActorContext, assistantId: string): Promise<Assistant> {
    return this.setStatus(actor, assistantId, 'archived');
  }

  restore(actor: ActorContext, assistantId: string): Promise<Assistant> {
    return this.setStatus(actor, assistantId, 'active');
  }

  /**
   * Selectable targets for the reference picker. Each row is read from the owning plugin
   * at call time; a plugin that is not loaded contributes nothing rather than a fake row.
   */
  catalog(actor: ActorContext, signal?: AbortSignal): Promise<readonly AssistantCatalogEntry[]> {
    return this.enqueue(async () => {
      assertActorContext(actor);
      const index = await this.index(actor, signal);
      const rows: AssistantCatalogEntry[] = [];
      for (const skill of index.skills?.rows ?? []) {
        // The summary carries no revision, so the picker pins one through the owner's detail read.
        const owner = index.skills;
        const pinned = owner ? await owner.service.detail(skill.name, signal).catch(() => undefined) : undefined;
        rows.push({
          kind: 'skill', id: skill.name, label: skill.title ?? skill.name,
          ...(pinned?.revision ? { revision: pinned.revision } : {}),
          detail: skill.state === 'enabled' ? '技能' : `技能 · ${skill.state}`,
        });
      }
      for (const expert of index.experts ?? []) {
        rows.push({
          kind: 'expert', id: expert.id, label: expert.name,
          ...(expert.publishedRevisionRef ? { revision: expert.publishedRevisionRef.revisionId } : {}),
          detail: expert.canUse ? '专家 · 可用' : `专家 · ${expert.readiness}`,
        });
      }
      for (const connector of index.connectors ?? []) {
        rows.push({ kind: 'connector', id: connector.id, label: connector.id, detail: `连接器 · ${connector.state}` });
      }
      return rows;
    });
  }

  private setStatus(actor: ActorContext, assistantId: string, status: AssistantStatus): Promise<Assistant> {
    return this.enqueue(async () => {
      const state = await this.state(actor);
      const current = this.requireAssistant(state, assistantId);
      if (current.status === status) return current;
      const assistant: Assistant = { ...current, status, updatedAt: timestamp() };
      await this.put(actor, { ...state, assistants: { ...state.assistants, [assistant.id]: assistant } });
      return assistant;
    });
  }

  private listForStatus(actor: ActorContext, query: string, status: AssistantStatus): Promise<readonly AssistantSummary[]> {
    return this.enqueue(async () => {
      const state = await this.state(actor);
      const needle = query.trim().toLocaleLowerCase().slice(0, ASSISTANT_LIMITS.searchMaxChars);
      const rows = Object.values(state.assistants).filter(row => row.status === status
        && (!needle || `${row.name} ${row.description}`.toLocaleLowerCase().includes(needle)));
      const summaries: AssistantSummary[] = [];
      for (const row of rows.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))) summaries.push(await this.summary(state, row));
      return summaries;
    });
  }

  private async detail(state: Stored, assistant: Assistant): Promise<AssistantDetail> {
    const revision = state.revisions[assistant.currentRevisionId];
    if (!revision) throw new AssistantError('assistant/not-found', '助理不存在或无权访问。');
    return { assistant, revision, resolutions: await this.resolutions(assistant, revision.references) };
  }

  private async summary(state: Stored, assistant: Assistant): Promise<AssistantSummary> {
    const revision = state.revisions[assistant.currentRevisionId];
    const references = revision?.references ?? [];
    let unavailable = 0;
    for (const entry of await this.resolutions(assistant, references)) if (!entry.available) unavailable += 1;
    return {
      id: assistant.id, name: assistant.name, description: assistant.description, status: assistant.status,
      revisionNumber: revision?.number ?? 0, updatedAt: assistant.updatedAt,
      referenceCount: references.length, unavailableCount: unavailable,
    };
  }

  private async resolutions(assistant: Assistant, references: readonly AssistantReference[]): Promise<readonly AssistantReferenceResolution[]> {
    if (!references.length) return [];
    const actor: ActorContext = { principalId: assistant.ownerPrincipalId, organizationId: assistant.organizationId, requestId: `assistant-resolve-${randomUUID()}`, resolvedBy: 'assistant' };
    return this.resolve(actor, references);
  }

  private async resolve(actor: ActorContext, references: readonly AssistantReference[]): Promise<readonly AssistantReferenceResolution[]> {
    if (!references.length) return [];
    const index = await this.index(actor);
    const rows: AssistantReferenceResolution[] = [];
    for (const reference of references) {
      const resolution = await this.inspect(reference, index);
      rows.push(resolution.outcome === 'available'
        ? { reference, available: true }
        : { reference, available: false, reason: resolution.outcome === 'unresolved' ? resolution.reason : `${resolution.owner}服务当前不可用。` });
    }
    return rows;
  }

  /** A write rejects a reference only when its owner is loaded and the target is definitively wrong. */
  private async assertReferences(actor: ActorContext, references: readonly AssistantReference[]): Promise<void> {
    if (!references.length) return;
    const index = await this.index(actor);
    for (const reference of references) {
      const resolution = await this.inspect(reference, index);
      if (resolution.outcome === 'unresolved') throw new AssistantError('assistant/reference-stale', resolution.reason);
    }
  }

  private async inspect(reference: AssistantReference, index: ReferenceIndex): Promise<Resolution> {
    if (reference.kind === 'skill') {
      if (!index.skills) return { outcome: 'unknown', owner: '技能' };
      const row = index.skills.rows.find(item => item.name === reference.id);
      if (!row) return { outcome: 'unresolved', reason: '引用的技能不存在或当前不可见。' };
      if (row.state !== 'enabled') return { outcome: 'unresolved', reason: '引用的技能已停用。' };
      if (reference.revision) {
        const detail = await index.skills.service.detail(reference.id).catch(() => undefined);
        if (!detail) return { outcome: 'unresolved', reason: '引用的技能不存在或当前不可见。' };
        if (detail.revision && detail.revision !== reference.revision) return { outcome: 'unresolved', reason: '引用的技能修订已变化，请重新选择。' };
      }
      return { outcome: 'available' };
    }
    if (reference.kind === 'expert') {
      if (!index.experts) return { outcome: 'unknown', owner: '专家' };
      const row = index.experts.find(item => item.id === reference.id);
      if (!row) return { outcome: 'unresolved', reason: '引用的专家不存在或当前不可见。' };
      if (reference.revision && row.publishedRevisionRef?.revisionId !== reference.revision) return { outcome: 'unresolved', reason: '引用的专家修订已变化，请重新选择。' };
      if (!row.canUse) return { outcome: 'unresolved', reason: '引用的专家当前未就绪。' };
      return { outcome: 'available' };
    }
    if (!index.connectors) return { outcome: 'unknown', owner: '连接器' };
    const row = index.connectors.find(item => item.id === reference.id);
    if (!row) return { outcome: 'unresolved', reason: '引用的连接器实例不存在。' };
    if (!row.enabled) return { outcome: 'unresolved', reason: '引用的连接器已停用。' };
    if (row.state !== 'ready') return { outcome: 'unresolved', reason: `引用的连接器当前不可用（${row.state}）。` };
    return { outcome: 'available' };
  }

  private async index(actor: ActorContext, signal?: AbortSignal): Promise<ReferenceIndex> {
    const skills = this.ctx.get('workdshSkills', true);
    const experts = this.ctx.get('workdshExperts', true);
    const connectors = this.ctx.get('workdshConnectors', true) as AssistantConnectorCatalog | undefined;
    const skillRows = skills ? await skills.list(signal).catch(() => undefined) : undefined;
    const expertRows = experts ? (await experts.list(actor, {}, signal).catch(() => undefined))?.items : undefined;
    const connectorRows = connectors ? await connectors.list(signal).catch(() => undefined) : undefined;
    return {
      ...(skills && skillRows ? { skills: { service: skills, rows: skillRows } } : {}),
      ...(expertRows ? { experts: expertRows } : {}),
      ...(connectorRows ? { connectors: connectorRows.map(row => ({ id: row.id, enabled: row.enabled, state: row.state })) } : {}),
    };
  }

  private requireAssistant(state: Stored, assistantId: string): Assistant {
    const row = state.assistants[assistantId];
    if (!row) throw new AssistantError('assistant/not-found', '助理不存在或无权访问。');
    return row;
  }

  private async state(actor: ActorContext): Promise<Stored> {
    assertActorContext(actor);
    const key = assistantStateKey(actor.organizationId, actor.principalId);
    const found = await this.states().get(key);
    if (found) return found as Stored;
    const state: Stored = { schemaVersion: 1, assistants: {}, revisions: {} };
    await this.states().put(key, state);
    return state;
  }

  private put(actor: ActorContext, state: Stored): Promise<void> {
    return this.states().put(assistantStateKey(actor.organizationId, actor.principalId), state);
  }

  private states(): KvTable<string, AssistantState> {
    if (!this.table) throw new AssistantError('assistant/not-ready', '助理服务尚未就绪。');
    return this.table;
  }

  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.serial.then(work, work);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }
}

export { LABELS as assistantReferenceLabels };
