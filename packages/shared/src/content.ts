// Content Studio domain types — shared across api, web, and marketing site.

import type { BodyDocument } from "./content-document.js";

export const CONTENT_TYPES = [
  "ARTICLE",
  "MAINTENANCE_TIP",
  "FIELD_STORY",
  "PROJECT_SHOWCASE",
  "ANNOUNCEMENT",
  "CAMPAIGN",
  "VIDEO",
  "SOCIAL_POST",
] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "ARCHIVED",
  "REJECTED",
] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const CONTENT_VISIBILITY = ["PUBLIC", "UNLISTED", "PRIVATE"] as const;
export type ContentVisibility = (typeof CONTENT_VISIBILITY)[number];

export const PUBLISHING_CHANNELS = [
  "WEBSITE",
  "LINKEDIN",
  "FACEBOOK",
  "INSTAGRAM",
] as const;
export type PublishingChannel = (typeof PUBLISHING_CHANNELS)[number];

export const CHANNEL_PUBLICATION_STATUSES = [
  "DRAFT",
  "READY",
  "SCHEDULED",
  "QUEUED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
] as const;
export type ChannelPublicationStatus = (typeof CHANNEL_PUBLICATION_STATUSES)[number];

export const CONNECTION_STATUSES = [
  "CONNECTED",
  "DISCONNECTED",
  "EXPIRED",
  "ERROR",
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const PUBLISHING_ERROR_CODES = [
  "AUTH_EXPIRED",
  "PERMISSION_DENIED",
  "RATE_LIMITED",
  "INVALID_CONTENT",
  "INVALID_MEDIA",
  "PROVIDER_UNAVAILABLE",
  "NETWORK_ERROR",
  "UNSUPPORTED_OPERATION",
  "UNKNOWN_PROVIDER_ERROR",
] as const;
export type PublishingErrorCode = (typeof PUBLISHING_ERROR_CODES)[number];

/** RBAC helpers — owner/dispatcher act as marketing roles until granular permissions exist. */
export const CONTENT_CREATE_ROLES = ["owner", "dispatcher"] as const;
export const CONTENT_REVIEW_ROLES = ["owner", "dispatcher"] as const;
export const CONTENT_APPROVE_ROLES = ["owner"] as const;
export const CONTENT_PUBLISH_ROLES = ["owner", "dispatcher"] as const;
export const CONTENT_INTEGRATION_ROLES = ["owner"] as const;

export interface ContentSeoMetadata {
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  openGraphTitle?: string | null;
  openGraphDescription?: string | null;
  openGraphMediaId?: string | null;
}

/**
 * A resolved public media asset referenced by a structured body document.
 * Only media approved for marketing is ever surfaced here; operational photos
 * never leak into public responses.
 */
export interface ResolvedMedia {
  url: string;
  alt?: string | null;
  caption?: string | null;
  contentType: string;
}

/** mediaId -> resolved asset map, covering every media reference in `bodyDocument`. */
export type BodyDocumentMediaMap = Record<string, ResolvedMedia>;

export interface ContentItemDTO {
  id: string;
  orgId: string;
  type: ContentType;
  title: string;
  slug: string;
  summary?: string | null;
  /** Plain-text body. Canonical authored content lives in `bodyDocument`. */
  body: string;
  /** Canonical structured body (BlockNote serialized document), when present. */
  bodyDocument?: BodyDocument | null;
  /** Server-generated sanitized HTML derived from `bodyDocument` at save time. */
  bodyHtml?: string | null;
  /** Server-generated Markdown derived from `bodyDocument` at save time. */
  bodyMarkdown?: string | null;
  /** Resolved media referenced by `bodyDocument` (approved only). */
  bodyMedia?: BodyDocumentMediaMap;
  status: ContentStatus;
  visibility: ContentVisibility;
  language: string;
  revision: number;
  featuredMediaId?: string | null;
  authorId?: string | null;
  categoryId?: string | null;
  tagIds: string[];
  seo: ContentSeoMetadata;
  approvedBy?: string | null;
  approvedAt?: string | null;
  publishedAt?: string | null;
  scheduledAt?: string | null;
  sourceJobId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentVersionDTO {
  id: string;
  contentId: string;
  version: number;
  title: string;
  summary?: string | null;
  body: string;
  editorId?: string | null;
  createdAt: string;
}

export interface ChannelVariantDTO {
  id: string;
  contentId: string;
  channel: PublishingChannel;
  enabled: boolean;
  titleOverride?: string | null;
  bodyOverride?: string | null;
  caption?: string | null;
  mediaOverrideId?: string | null;
  linkBehavior?: string | null;
  hashtags: string[];
  status: ChannelPublicationStatus;
  lastGeneratedAt?: string | null;
}

export interface ChannelPublicationDTO {
  id: string;
  contentId: string;
  channel: PublishingChannel;
  status: ChannelPublicationStatus;
  providerPublicationId?: string | null;
  externalUrl?: string | null;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  lastErrorCode?: PublishingErrorCode | null;
  lastErrorMessage?: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicationAttemptDTO {
  id: string;
  publicationId: string;
  attemptNumber: number;
  startedAt: string;
  completedAt?: string | null;
  providerStatus?: string | null;
  errorCode?: PublishingErrorCode | null;
  errorMessage?: string | null;
  retryable: boolean;
  providerRequestId?: string | null;
}

export interface PublishingConnectionDTO {
  id: string;
  orgId: string;
  channel: PublishingChannel;
  status: ConnectionStatus;
  accountName?: string | null;
  accountId?: string | null;
  lastValidatedAt?: string | null;
  lastError?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ContentCategoryDTO {
  id: string;
  orgId: string;
  name: string;
  slug: string;
  description?: string | null;
}

export interface ContentMediaDTO {
  id: string;
  orgId: string;
  storageKey: string;
  contentType: string;
  fileName?: string | null;
  altText?: string | null;
  caption?: string | null;
  approvedForMarketing: boolean;
  source?: string | null;
  photoId?: string | null;
  uploadedBy?: string | null;
  createdAt: string;
}

export interface PublicContentItemDTO {
  id: string;
  type: ContentType;
  title: string;
  slug: string;
  summary?: string | null;
  body: string;
  bodyDocument?: BodyDocument | null;
  bodyHtml?: string | null;
  bodyMarkdown?: string | null;
  /** Resolved media referenced by `bodyDocument` (approved only). */
  bodyMedia?: BodyDocumentMediaMap;
  publishedAt: string;
  updatedAt: string;
  category?: { id: string; name: string; slug: string } | null;
  tags: { id: string; name: string; slug: string }[];
  author?: { id: string; name: string } | null;
  featuredImage?: { url: string; alt?: string | null } | null;
  seo: ContentSeoMetadata;
}

export interface ProviderCapabilities {
  channel: PublishingChannel;
  supportsText: boolean;
  supportsLink: boolean;
  supportsImages: boolean;
  supportsVideo: boolean;
  supportsScheduling: boolean;
  supportsUpdate: boolean;
  supportsDelete: boolean;
  supportsCarousel: boolean;
  maxTextLength: number;
  maxImages: number;
}

export const PROVIDER_CAPABILITIES: Record<PublishingChannel, ProviderCapabilities> = {
  WEBSITE: {
    channel: "WEBSITE",
    supportsText: true,
    supportsLink: true,
    supportsImages: true,
    supportsVideo: true,
    supportsScheduling: true,
    supportsUpdate: true,
    supportsDelete: true,
    supportsCarousel: false,
    maxTextLength: 100_000,
    maxImages: 50,
  },
  LINKEDIN: {
    channel: "LINKEDIN",
    supportsText: true,
    supportsLink: true,
    supportsImages: true,
    supportsVideo: false,
    supportsScheduling: false,
    supportsUpdate: false,
    supportsDelete: true,
    supportsCarousel: false,
    maxTextLength: 3_000,
    maxImages: 9,
  },
  FACEBOOK: {
    channel: "FACEBOOK",
    supportsText: true,
    supportsLink: true,
    supportsImages: true,
    supportsVideo: true,
    supportsScheduling: false,
    supportsUpdate: true,
    supportsDelete: true,
    supportsCarousel: true,
    maxTextLength: 63_206,
    maxImages: 10,
  },
  INSTAGRAM: {
    channel: "INSTAGRAM",
    supportsText: true,
    supportsLink: false,
    supportsImages: true,
    supportsVideo: true,
    supportsScheduling: false,
    supportsUpdate: false,
    supportsDelete: true,
    supportsCarousel: true,
    maxTextLength: 2_200,
    maxImages: 10,
  },
};
