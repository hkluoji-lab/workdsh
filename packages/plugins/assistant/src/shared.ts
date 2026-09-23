import type { Context } from '@deepseek-ai/cordis';
import type { ActorContext, ExpertsService, IdentityService } from 'workdsh-contracts';
import type { SkillManagementService } from 'workdsh-contracts/skills';

/**
 * Public contract of the assistant module (D16 / P1-12, module 0.1).
 *
 * An assistant is a *named work entry*: authored duty description, references to
 * existing Skill and Expert revisions plus connector instances, and recorded
 * trigger preferences. It owns no execution, Session, credential or permission
 * — see docs/adr/0027-assistant-entry-pack-boundary.md.
 */

export type AssistantStatus = 'active' | 'archived';

/** The only three reference kinds an assistant may hold. */
export type AssistantReferenceKind = 'skill' | 'expert' | 'connector';

/** A frozen pointer to another plugin's object. Credentials and paths: never stored here. */
export interface AssistantReference {
  readonly kind: AssistantReferenceKind;
  readonly id: string;
  /** Skill / Expert revision id. Connector instances have no revision and omit this. */
  readonly revision?: string;
  readonly label: string;
}

/** Duty description: what this entry is for, how it should speak, and what it must not do. */
export interface AssistantBrief {
  readonly goal: string;
  readonly style: string;
  readonly boundary: string;
}

/**
 * Recorded trigger preferences. First slice stores intent only: it never
 * registers a scheduler and never opens an inbound endpoint.
 */
export interface AssistantTriggers {
  readonly manual: boolean;
  readonly schedule?: string;
  readonly inbound?: string;
}

export interface AssistantRevisionInput {
  readonly name: string;
  readonly description: string;
  readonly brief: AssistantBrief;
  readonly references: readonly AssistantReference[];
  /** Native workspace directory the entry is meant to work in; recorded, never opened here. */
  readonly workspacePath?: string;
  readonly triggers: AssistantTriggers;
}

export interface Assistant {
  readonly id: string;
  readonly organizationId: string;
  readonly ownerPrincipalId: string;
  readonly name: string;
  readonly description: string;
  readonly status: AssistantStatus;
  readonly currentRevisionId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface AssistantRevision extends AssistantRevisionInput {
  readonly id: string;
  readonly assistantId: string;
  readonly number: number;
  readonly createdBy: string;
  readonly createdAt: string;
}

/** Host-side resolution of one reference; the client only renders this result. */
export interface AssistantReferenceResolution {
  readonly reference: AssistantReference;
  readonly available: boolean;
  /** Reason the reference is not usable right now; absent when available. */
  readonly reason?: string;
}

export interface AssistantDetail {
  readonly assistant: Assistant;
  readonly revision: AssistantRevision;
  readonly resolutions: readonly AssistantReferenceResolution[];
}

export interface AssistantSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: AssistantStatus;
  readonly revisionNumber: number;
  readonly updatedAt: string;
  readonly referenceCount: number;
  readonly unavailableCount: number;
}

/** One selectable target shown in the reference picker, resolved from the owning plugin. */
export interface AssistantCatalogEntry {
  readonly kind: AssistantReferenceKind;
  readonly id: string;
  readonly revision?: string;
  readonly label: string;
  readonly detail: string;
}

export interface AssistantService {
  list(actor: ActorContext, query?: string): Promise<readonly AssistantSummary[]>;
  listArchived(actor: ActorContext, query?: string): Promise<readonly AssistantSummary[]>;
  get(actor: ActorContext, assistantId: string): Promise<AssistantDetail>;
  create(actor: ActorContext, input: AssistantRevisionInput): Promise<AssistantDetail>;
  /** Appends a new revision. `expectedRevisionId` guards against overwriting a concurrent edit. */
  update(actor: ActorContext, assistantId: string, input: AssistantRevisionInput, expectedRevisionId: string): Promise<AssistantDetail>;
  archive(actor: ActorContext, assistantId: string): Promise<Assistant>;
  restore(actor: ActorContext, assistantId: string): Promise<Assistant>;
  catalog(actor: ActorContext, signal?: AbortSignal): Promise<readonly AssistantCatalogEntry[]>;
}

/**
 * Minimal read-only surface of the connector plugin, mirrored structurally so the
 * assistant never imports another feature plugin's modules.
 */
export interface AssistantConnectorCatalog {
  list(signal?: AbortSignal): Promise<readonly {
    readonly id: string;
    readonly title: string;
    readonly description: string;
    readonly enabled: boolean;
    readonly state: string;
  }[]>;
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    workdshAssistant: AssistantService;
    workdshIdentity: IdentityService;
    workdshSkills: SkillManagementService;
    workdshExperts: ExpertsService;
    workdshConnectors: AssistantConnectorCatalog;
  }
}

export type AssistantContext = Context;
