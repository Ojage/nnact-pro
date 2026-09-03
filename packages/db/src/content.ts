// Content Studio schema — org-scoped CMS and multi-channel publishing.

import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { orgs, users, jobs } from "./schema.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const version = () => integer("version").default(1).notNull();

export const contentType = pgEnum("content_type", [
  "ARTICLE",
  "MAINTENANCE_TIP",
  "FIELD_STORY",
  "PROJECT_SHOWCASE",
  "ANNOUNCEMENT",
  "CAMPAIGN",
  "VIDEO",
  "SOCIAL_POST",
]);

export const contentStatus = pgEnum("content_status", [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHING",
  "PUBLISHED",
  "ARCHIVED",
  "REJECTED",
]);

export const contentVisibility = pgEnum("content_visibility", ["PUBLIC", "UNLISTED", "PRIVATE"]);

export const publishingChannel = pgEnum("publishing_channel", [
  "WEBSITE",
  "LINKEDIN",
  "FACEBOOK",
  "INSTAGRAM",
]);

export const channelPublicationStatus = pgEnum("channel_publication_status", [
  "DRAFT",
  "READY",
  "SCHEDULED",
  "QUEUED",
  "PUBLISHING",
  "PUBLISHED",
  "FAILED",
  "CANCELLED",
]);

export const connectionStatus = pgEnum("connection_status", [
  "CONNECTED",
  "DISCONNECTED",
  "EXPIRED",
  "ERROR",
]);

export const contentCategories = pgTable(
  "content_categories",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgSlug: uniqueIndex("content_categories_org_slug_idx").on(t.orgId, t.slug),
  }),
);

export const contentTags = pgTable(
  "content_tags",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    orgSlug: uniqueIndex("content_tags_org_slug_idx").on(t.orgId, t.slug),
  }),
);

export const contentMedia = pgTable(
  "content_media",
  {
    id: id(),
    orgId: orgId(),
    storageKey: text("storage_key").notNull(),
    contentType: text("content_type").notNull(),
    fileName: text("file_name"),
    altText: text("alt_text"),
    caption: text("caption"),
    approvedForMarketing: boolean("approved_for_marketing").default(false).notNull(),
    source: text("source"),
    photoId: uuid("photo_id"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgIdx: index("content_media_org_idx").on(t.orgId),
  }),
);

export const contentItems = pgTable(
  "content_items",
  {
    id: id(),
    orgId: orgId(),
    type: contentType("type").notNull(),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    summary: text("summary"),
    // Legacy markdown/plain-text body. Retained for backward compatibility with
    // existing articles and as the plain-text publication fallback.
    body: text("body").default("").notNull(),
    // Canonical structured body (BlockNote serialized document: {type,props,
    // content,children}[]). The single source of truth for authored content.
    bodyDocument: jsonb("body_document"),
    // Generated representation caches derived from body_document at save time.
    bodyHtml: text("body_html"),
    bodyMarkdown: text("body_markdown"),
    status: contentStatus("status").default("DRAFT").notNull(),
    visibility: contentVisibility("visibility").default("PUBLIC").notNull(),
    language: text("language").default("en").notNull(),
    revision: integer("revision").default(1).notNull(),
    featuredMediaId: uuid("featured_media_id").references(() => contentMedia.id, {
      onDelete: "set null",
    }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => contentCategories.id, {
      onDelete: "set null",
    }),
    seoTitle: text("seo_title"),
    seoDescription: text("seo_description"),
    canonicalUrl: text("canonical_url"),
    openGraphTitle: text("open_graph_title"),
    openGraphDescription: text("open_graph_description"),
    openGraphMediaId: uuid("open_graph_media_id").references(() => contentMedia.id, {
      onDelete: "set null",
    }),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    sourceJobId: uuid("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgSlug: uniqueIndex("content_items_org_slug_idx").on(t.orgId, t.slug),
    orgStatus: index("content_items_org_status_idx").on(t.orgId, t.status),
    orgPublished: index("content_items_org_published_idx").on(t.orgId, t.publishedAt),
  }),
);

export const contentItemTags = pgTable(
  "content_item_tags",
  {
    id: id(),
    orgId: orgId(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => contentTags.id, { onDelete: "cascade" }),
    createdAt: ts(),
  },
  (t) => ({
    pair: uniqueIndex("content_item_tags_pair_idx").on(t.contentId, t.tagId),
  }),
);

export const contentVersions = pgTable(
  "content_versions",
  {
    id: id(),
    orgId: orgId(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    summary: text("summary"),
    body: text("body").notNull(),
    editorId: uuid("editor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts(),
  },
  (t) => ({
    contentVersion: uniqueIndex("content_versions_content_version_idx").on(
      t.contentId,
      t.version,
    ),
  }),
);

export const channelVariants = pgTable(
  "channel_variants",
  {
    id: id(),
    orgId: orgId(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    channel: publishingChannel("channel").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    titleOverride: text("title_override"),
    bodyOverride: text("body_override"),
    caption: text("caption"),
    mediaOverrideId: uuid("media_override_id").references(() => contentMedia.id, {
      onDelete: "set null",
    }),
    linkBehavior: text("link_behavior"),
    hashtags: jsonb("hashtags").default([]).notNull(),
    status: channelPublicationStatus("status").default("DRAFT").notNull(),
    lastGeneratedAt: timestamp("last_generated_at", { withTimezone: true }),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    contentChannel: uniqueIndex("channel_variants_content_channel_idx").on(
      t.contentId,
      t.channel,
    ),
  }),
);

export const publishingConnections = pgTable(
  "publishing_connections",
  {
    id: id(),
    orgId: orgId(),
    channel: publishingChannel("channel").notNull(),
    status: connectionStatus("status").default("DISCONNECTED").notNull(),
    accountName: text("account_name"),
    accountId: text("account_id"),
    // AES-256-GCM encrypted credentials blob (access/refresh tokens, page ids).
    credentialsCipher: text("credentials_cipher"),
    tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").default({}).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgChannel: uniqueIndex("publishing_connections_org_channel_idx").on(t.orgId, t.channel),
  }),
);

export const channelPublications = pgTable(
  "channel_publications",
  {
    id: id(),
    orgId: orgId(),
    contentId: uuid("content_id")
      .notNull()
      .references(() => contentItems.id, { onDelete: "cascade" }),
    channel: publishingChannel("channel").notNull(),
    status: channelPublicationStatus("status").default("DRAFT").notNull(),
    providerPublicationId: text("provider_publication_id"),
    externalUrl: text("external_url"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastErrorCode: text("last_error_code"),
    lastErrorMessage: text("last_error_message"),
    attemptCount: integer("attempt_count").default(0).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    contentChannel: uniqueIndex("channel_publications_content_channel_idx").on(
      t.contentId,
      t.channel,
    ),
    orgStatus: index("channel_publications_org_status_idx").on(t.orgId, t.status),
    scheduled: index("channel_publications_scheduled_idx").on(t.status, t.scheduledAt),
    idempotency: uniqueIndex("channel_publications_idempotency_idx").on(t.idempotencyKey),
  }),
);

export const publicationAttempts = pgTable(
  "publication_attempts",
  {
    id: id(),
    orgId: orgId(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => channelPublications.id, { onDelete: "cascade" }),
    attemptNumber: integer("attempt_number").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    providerStatus: text("provider_status"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    retryable: boolean("retryable").default(false).notNull(),
    providerRequestId: text("provider_request_id"),
    createdAt: ts(),
  },
  (t) => ({
    publication: index("publication_attempts_publication_idx").on(t.publicationId),
  }),
);

export const publicationOutbox = pgTable(
  "publication_outbox",
  {
    id: id(),
    orgId: orgId(),
    publicationId: uuid("publication_id")
      .notNull()
      .references(() => channelPublications.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").default({}).notNull(),
    status: text("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    error: text("error"),
    createdAt: ts(),
  },
  (t) => ({
    retry: index("publication_outbox_retry_idx").on(t.status, t.nextAttemptAt),
  }),
);

export const contentAuditLog = pgTable(
  "content_audit_log",
  {
    id: id(),
    orgId: orgId(),
    contentId: uuid("content_id").references(() => contentItems.id, { onDelete: "set null" }),
    publicationId: uuid("publication_id").references(() => channelPublications.id, {
      onDelete: "set null",
    }),
    actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    details: jsonb("details").default({}).notNull(),
    createdAt: ts(),
  },
  (t) => ({
    content: index("content_audit_log_content_idx").on(t.orgId, t.contentId),
  }),
);
