import { randomUUID } from 'node:crypto';
import {
  assertActorContext,
  type ActorContext,
  type IdentityProvider,
} from 'workdsh-contracts';

export interface LocalIdentityConfig {
  readonly principalId: string;
  readonly organizationId: string;
  readonly providerId?: string;
}

export interface LocalIdentityEvidence {
  /** Trusted Host correlation only; it never selects the principal or organization. */
  readonly sessionId?: string;
  /** Trusted Host correlation only; it never selects the principal or organization. */
  readonly runId?: string;
}

export class LocalIdentityProvider implements IdentityProvider<LocalIdentityEvidence | undefined> {
  readonly id: string;
  readonly #principalId: string;
  readonly #organizationId: string;

  constructor(config: LocalIdentityConfig) {
    this.id = config.providerId ?? 'workdsh-identity-local';
    this.#principalId = config.principalId;
    this.#organizationId = config.organizationId;
    assertActorContext({
      principalId: this.#principalId,
      organizationId: this.#organizationId,
      requestId: 'configuration-check',
      resolvedBy: this.id,
    });
  }

  async resolve(evidence?: LocalIdentityEvidence, signal?: AbortSignal): Promise<ActorContext> {
    signal?.throwIfAborted();
    const actor: ActorContext = {
      principalId: this.#principalId,
      organizationId: this.#organizationId,
      requestId: randomUUID(),
      resolvedBy: this.id,
      ...(evidence?.sessionId === undefined ? {} : { sessionId: evidence.sessionId }),
      ...(evidence?.runId === undefined ? {} : { runId: evidence.runId }),
    };
    assertActorContext(actor);
    signal?.throwIfAborted();
    return Object.freeze(actor);
  }
}
