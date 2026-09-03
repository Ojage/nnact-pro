// Hexagonal publishing port contracts — channel-neutral types only.

import type {
  PublishingChannel,
  PublishingErrorCode,
  ProviderCapabilities,
} from "./content.js";

export interface PublishMediaItem {
  id: string;
  url: string;
  contentType: string;
  altText?: string | null;
  caption?: string | null;
}

export interface PublishRequest {
  publicationId: string;
  organizationId: string;
  contentId: string;
  channel: PublishingChannel;
  title: string;
  body: string;
  excerpt?: string | null;
  caption?: string | null;
  canonicalUrl?: string | null;
  hashtags?: string[];
  media: PublishMediaItem[];
  scheduledAt?: Date | null;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface PublishResult {
  providerPublicationId: string;
  externalUrl?: string | null;
  publishedAt: Date;
  providerStatus: string;
  rawMetadata?: Record<string, unknown>;
}

export interface ConnectionValidationResult {
  valid: boolean;
  accountName?: string | null;
  accountId?: string | null;
  errorCode?: PublishingErrorCode;
  errorMessage?: string | null;
}

export interface ContentValidationIssue {
  field: string;
  message: string;
  code: PublishingErrorCode;
}

export interface NormalizedProviderError {
  code: PublishingErrorCode;
  message: string;
  retryable: boolean;
  providerRequestId?: string | null;
}

/** Core publishing port — each adapter implements this contract. */
export interface PublishingProviderPort {
  readonly channel: PublishingChannel;
  readonly capabilities: ProviderCapabilities;

  validateConnection(orgId: string): Promise<ConnectionValidationResult>;
  validateContent(request: PublishRequest): ContentValidationIssue[];
  publish(request: PublishRequest): Promise<PublishResult>;
  update?(request: PublishRequest & { providerPublicationId: string }): Promise<PublishResult>;
  deleteOrUnpublish?(orgId: string, providerPublicationId: string): Promise<void>;
  getPublicationStatus?(
    orgId: string,
    providerPublicationId: string,
  ): Promise<{ status: string; externalUrl?: string | null }>;
}

export interface PublicationStatusSnapshot {
  publicationId: string;
  contentId: string;
  channel: PublishingChannel;
  status: string;
  externalUrl?: string | null;
  lastError?: NormalizedProviderError | null;
}
