// Publishing ports — abstractions the application layer depends on.
// Concrete implementations live in adapters/ and infra. The application only
// sees these interfaces; swapping a provider or store is a composition concern.
import type {
  NormalizedProviderError,
  PublishMediaItem,
  PublishRequest,
  PublishingErrorCode,
} from "@nnact/shared";

/** Resolve content-media ids into publishable media items (URLs, mime, alt). */
export interface MediaProviderPort {
  resolveForPublication(orgId: string, mediaIds: string[]): Promise<PublishMediaItem[]>;
  resolveFeatured(orgId: string, contentId: string): Promise<PublishMediaItem[]>;
}

/** Access to stored OAuth/provider credentials for a connection (encrypted at rest). */
export interface CredentialStorePort {
  get(orgId: string, channel: string): Promise<{ accessToken: string; accountId?: string | null; meta?: Record<string, unknown> } | null>;
  setLastError(orgId: string, channel: string, error: string | null): Promise<void>;
  markExpired(orgId: string, channel: string): Promise<void>;
  markValidated(orgId: string, channel: string, accountName: string | null, accountId: string | null): Promise<void>;
}

/** Success/failure into durable repositories (publications, attempts). */
export interface PublicationRepositoryPort {
  recordAttempt(input: {
    orgId: string;
    publicationId: string;
    attemptNumber: number;
    startedAt: Date;
    completedAt?: Date | null;
    providerStatus?: string | null;
    errorCode?: PublishingErrorCode | null;
    errorMessage?: string | null;
    retryable: boolean;
    providerRequestId?: string | null;
  }): Promise<void>;
  markSucceeded(input: {
    orgId: string;
    publicationId: string;
    providerPublicationId: string;
    externalUrl?: string | null;
    publishedAt: Date;
    providerStatus: string;
  }): Promise<void>;
  markFailed(input: {
    orgId: string;
    publicationId: string;
    error: NormalizedProviderError;
    attemptNumber: number;
  }): Promise<void>;
  incrementAttemptCount(orgId: string, publicationId: string): Promise<number>;
}

/** Transactional outbox for publishing jobs (created + journaled atomically). */
export interface PublicationOutboxPort {
  enqueue(input: {
    orgId: string;
    publicationId: string;
    eventType: "publish" | "update" | "delete";
    payload: Record<string, unknown>;
  }): Promise<void>;
}

/** Queue abstraction for scheduling/retrying publication jobs. */
export interface JobQueuePort {
  enqueuePublish(orgId: string, publicationId: string, scheduledAt?: Date | null): Promise<void>;
}
