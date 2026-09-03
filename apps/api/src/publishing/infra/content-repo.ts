// Content repository — DB access + DTO mapping for Content Studio.
// All org-scoped. Mappers convert drizzle rows to the shared DTO shapes.
import { and, asc, count, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@nnact/db";
import {
  channelVariants,
  contentCategories,
  contentItemTags,
  contentItems,
  contentMedia,
  contentTags,
  contentVersions,
} from "@nnact/db";
import type { ContentItemDTO, ContentMediaDTO, ContentVersionDTO, ChannelVariantDTO, ContentCategoryDTO } from "@nnact/shared";

function iso(v: Date | null | undefined): string | undefined {
  return v ? v.toISOString() : undefined;
}

export function mapContentItem(row: typeof contentItems.$inferSelect, tagIds: string[]): ContentItemDTO {
  return {
    id: row.id,
    orgId: row.orgId,
    type: row.type,
    title: row.title,
    slug: row.slug,
    summary: row.summary,
    body: row.body,
    bodyDocument: (row.bodyDocument as ContentItemDTO["bodyDocument"]) ?? null,
    bodyHtml: row.bodyHtml,
    bodyMarkdown: row.bodyMarkdown,
    status: row.status,
    visibility: row.visibility,
    language: row.language,
    revision: row.revision,
    featuredMediaId: row.featuredMediaId,
    authorId: row.authorId,
    categoryId: row.categoryId,
    tagIds,
    seo: {
      seoTitle: row.seoTitle,
      seoDescription: row.seoDescription,
      canonicalUrl: row.canonicalUrl,
      openGraphTitle: row.openGraphTitle,
      openGraphDescription: row.openGraphDescription,
      openGraphMediaId: row.openGraphMediaId,
    },
    approvedBy: row.approvedBy,
    approvedAt: iso(row.approvedAt),
    publishedAt: iso(row.publishedAt),
    scheduledAt: iso(row.scheduledAt),
    sourceJobId: row.sourceJobId,
    createdAt: iso(row.createdAt) ?? "",
    updatedAt: iso(row.updatedAt) ?? "",
  };
}

export async function getTagIdsForContent(contentId: string): Promise<string[]> {
  const rows = await db.select({ tagId: contentItemTags.tagId }).from(contentItemTags).where(eq(contentItemTags.contentId, contentId));
  return rows.map((r) => r.tagId);
}

export interface ContentListParams {
  orgId: string;
  skip: number;
  take: number;
  status?: string;
  type?: string;
  search?: string;
}

export async function listContent(params: ContentListParams): Promise<{ items: ContentItemDTO[]; total: number }> {
  const conditions = [eq(contentItems.orgId, params.orgId)];
  if (params.status) conditions.push(eq(contentItems.status, params.status as never));
  if (params.type) conditions.push(eq(contentItems.type, params.type as never));
  if (params.search) {
    conditions.push(or(ilike(contentItems.title, `%${params.search}%`), ilike(contentItems.summary, `%${params.search}%`))!);
  }
  const where = and(...conditions);
  const rows = await db
    .select()
    .from(contentItems)
    .where(where)
    .orderBy(desc(contentItems.updatedAt))
    .limit(params.take)
    .offset(params.skip);
  const [{ value: total }] = await db.select({ value: count() }).from(contentItems).where(where);
  const items: ContentItemDTO[] = [];
  for (const row of rows) {
    items.push(mapContentItem(row, await getTagIdsForContent(row.id)));
  }
  return { items, total: Number(total) };
}

export async function getContentItem(orgId: string, id: string): Promise<ContentItemDTO | null> {
  const [row] = await db.select().from(contentItems).where(and(eq(contentItems.orgId, orgId), eq(contentItems.id, id))).limit(1);
  if (!row) return null;
  return mapContentItem(row, await getTagIdsForContent(row.id));
}

export async function getContentBySlug(orgId: string, slug: string): Promise<ContentItemDTO | null> {
  const [row] = await db.select().from(contentItems).where(and(eq(contentItems.orgId, orgId), eq(contentItems.slug, slug))).limit(1);
  if (!row) return null;
  return mapContentItem(row, await getTagIdsForContent(row.id));
}

export interface CreateContentInput {
  orgId: string;
  authorId: string;
  type: string;
  title: string;
  slug: string;
  summary?: string | null;
  body?: string | null;
  bodyDocument?: unknown | null;
  bodyHtml?: string | null;
  bodyMarkdown?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  featuredMediaId?: string | null;
  visibility?: string;
  language?: string;
}

export async function createContent(input: CreateContentInput) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(contentItems)
      .values({
        orgId: input.orgId,
        authorId: input.authorId,
        type: input.type as never,
        title: input.title,
        slug: input.slug,
        summary: input.summary,
        body: input.body ?? "",
        bodyDocument: (input.bodyDocument as never) ?? null,
        bodyHtml: input.bodyHtml ?? null,
        bodyMarkdown: input.bodyMarkdown ?? null,
        categoryId: input.categoryId,
        featuredMediaId: input.featuredMediaId,
        visibility: (input.visibility as never) ?? "PUBLIC",
        language: input.language ?? "en",
        status: "DRAFT",
        revision: 1,
      })
      .returning();
    if (input.tagIds?.length) {
      await tx.insert(contentItemTags).values(input.tagIds.map((tagId) => ({ orgId: input.orgId, contentId: row.id, tagId }))).onConflictDoNothing();
    }
    await tx.insert(contentVersions).values({
      orgId: input.orgId,
      contentId: row.id,
      version: 1,
      title: input.title,
      summary: input.summary ?? null,
      body: input.body ?? "",
      editorId: input.authorId,
    });
    return mapContentItem(row, input.tagIds ?? []);
  });
}

export interface UpdateContentInput {
  orgId: string;
  contentId: string;
  editorId: string;
  body?: string;
  bodyDocument?: unknown | null;
  bodyHtml?: string | null;
  bodyMarkdown?: string | null;
  summary?: string | null;
  type?: string;
  visibility?: string;
  language?: string;
  featuredMediaId?: string | null;
  categoryId?: string | null;
  tagIds?: string[];
  seo?: {
    seoTitle?: string | null;
    seoDescription?: string | null;
    canonicalUrl?: string | null;
    openGraphTitle?: string | null;
    openGraphDescription?: string | null;
    openGraphMediaId?: string | null;
  };
}

export async function updateContent(input: UpdateContentInput): Promise<ContentItemDTO> {
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(contentItems).where(and(eq(contentItems.orgId, input.orgId), eq(contentItems.id, input.contentId))).limit(1);
    if (!current) throw Object.assign(new Error("content not found"), { statusCode: 404 });

    const nextRevision = current.revision + 1;
    const changes: Record<string, unknown> = { revision: nextRevision, updatedAt: new Date() };
    if (input.body !== undefined) changes.body = input.body;
    if (input.bodyDocument !== undefined) changes.bodyDocument = input.bodyDocument;
    if (input.bodyHtml !== undefined) changes.bodyHtml = input.bodyHtml;
    if (input.bodyMarkdown !== undefined) changes.bodyMarkdown = input.bodyMarkdown;
    if (input.summary !== undefined) changes.summary = input.summary;
    if (input.type !== undefined) changes.type = input.type;
    if (input.visibility !== undefined) changes.visibility = input.visibility;
    if (input.language !== undefined) changes.language = input.language;
    if (input.featuredMediaId !== undefined) changes.featuredMediaId = input.featuredMediaId;
    if (input.categoryId !== undefined) changes.categoryId = input.categoryId;
    if (input.seo) {
      if (input.seo.seoTitle !== undefined) changes.seoTitle = input.seo.seoTitle;
      if (input.seo.seoDescription !== undefined) changes.seoDescription = input.seo.seoDescription;
      if (input.seo.canonicalUrl !== undefined) changes.canonicalUrl = input.seo.canonicalUrl;
      if (input.seo.openGraphTitle !== undefined) changes.openGraphTitle = input.seo.openGraphTitle;
      if (input.seo.openGraphDescription !== undefined) changes.openGraphDescription = input.seo.openGraphDescription;
      if (input.seo.openGraphMediaId !== undefined) changes.openGraphMediaId = input.seo.openGraphMediaId;
    }

    // Snapshot the previous published (or current) state before the edit so a
    // published article's history is never silently lost.
    await tx
      .insert(contentVersions)
      .values({
        orgId: input.orgId,
        contentId: input.contentId,
        version: nextRevision,
        title: input.body !== undefined ? current.title : current.title,
        summary: input.summary !== undefined ? input.summary : current.summary,
        body: input.body !== undefined ? input.body : current.body,
        editorId: input.editorId,
      })
      .onConflictDoNothing({ target: [contentVersions.contentId, contentVersions.version] });

    const [next] = await tx
      .update(contentItems)
      .set(changes)
      .where(and(eq(contentItems.orgId, input.orgId), eq(contentItems.id, input.contentId)))
      .returning();
    if (!next) throw Object.assign(new Error("content not found"), { statusCode: 404 });

    if (input.tagIds) {
      await tx.delete(contentItemTags).where(eq(contentItemTags.contentId, input.contentId));
      if (input.tagIds.length) {
        await tx.insert(contentItemTags).values(input.tagIds.map((tagId) => ({ orgId: input.orgId, contentId: input.contentId, tagId }))).onConflictDoNothing();
      }
    }

    return mapContentItem(next, input.tagIds ?? await getTagIdsForContent(input.contentId));
  });
}

export async function getContentVersions(orgId: string, contentId: string): Promise<ContentVersionDTO[]> {
  const rows = await db
    .select()
    .from(contentVersions)
    .where(and(eq(contentVersions.orgId, orgId), eq(contentVersions.contentId, contentId)))
    .orderBy(desc(contentVersions.version));
  return rows.map((r) => ({
    id: r.id,
    contentId: r.contentId,
    version: r.version,
    title: r.title,
    summary: r.summary,
    body: r.body,
    editorId: r.editorId,
    createdAt: iso(r.createdAt) ?? "",
  }));
}

// ── Categories ──
export async function listCategories(orgId: string): Promise<ContentCategoryDTO[]> {
  const rows = await db.select().from(contentCategories).where(eq(contentCategories.orgId, orgId)).orderBy(asc(contentCategories.name));
  return rows.map((r) => ({ id: r.id, orgId: r.orgId, name: r.name, slug: r.slug, description: r.description }));
}

export async function upsertCategory(orgId: string, name: string, slug: string, description?: string | null) {
  const [row] = await db
    .insert(contentCategories)
    .values({ orgId, name, slug, description })
    .onConflictDoUpdate({ target: [contentCategories.orgId, contentCategories.slug], set: { name, description: description ?? null, updatedAt: new Date() } })
    .returning();
  return { id: row.id, orgId, name, slug, description: row.description };
}

// ── Tags ──
export async function ensureTags(orgId: string, names: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const name of names) {
    const slug = slugify(name);
    const [row] = await db
      .insert(contentTags)
      .values({ orgId, name, slug })
      .onConflictDoUpdate({ target: [contentTags.orgId, contentTags.slug], set: {} })
      .returning({ id: contentTags.id });
    out.push(row.id);
  }
  return out;
}

export async function listTags(orgId: string): Promise<{ id: string; orgId: string; name: string; slug: string }[]> {
  const rows = await db.select().from(contentTags).where(eq(contentTags.orgId, orgId)).orderBy(asc(contentTags.name));
  return rows.map((r) => ({ id: r.id, orgId: r.orgId, name: r.name, slug: r.slug }));
}

// ── Media ──
export async function listMedia(orgId: string): Promise<ContentMediaDTO[]> {
  const rows = await db.select().from(contentMedia).where(eq(contentMedia.orgId, orgId)).orderBy(desc(contentMedia.createdAt));
  return rows.map((r) => ({
    id: r.id,
    orgId: r.orgId,
    storageKey: r.storageKey,
    contentType: r.contentType,
    fileName: r.fileName,
    altText: r.altText,
    caption: r.caption,
    approvedForMarketing: r.approvedForMarketing,
    source: r.source,
    photoId: r.photoId,
    uploadedBy: r.uploadedBy,
    createdAt: iso(r.createdAt) ?? "",
  }));
}

export async function createMediaRecord(input: {
  orgId: string;
  storageKey: string;
  contentType: string;
  fileName?: string | null;
  uploadedBy?: string | null;
  source?: string | null;
  approvedForMarketing?: boolean;
  photoId?: string | null;
}): Promise<ContentMediaDTO> {
  const [row] = await db
    .insert(contentMedia)
    .values({
      orgId: input.orgId,
      storageKey: input.storageKey,
      contentType: input.contentType,
      fileName: input.fileName ?? null,
      uploadedBy: input.uploadedBy ?? null,
      source: input.source ?? null,
      approvedForMarketing: input.approvedForMarketing ?? false,
      photoId: input.photoId ?? null,
    })
    .returning();
  return {
    id: row.id,
    orgId: row.orgId,
    storageKey: row.storageKey,
    contentType: row.contentType,
    fileName: row.fileName,
    altText: row.altText,
    caption: row.caption,
    approvedForMarketing: row.approvedForMarketing,
    source: row.source,
    photoId: row.photoId,
    uploadedBy: row.uploadedBy,
    createdAt: iso(row.createdAt) ?? "",
  };
}

export async function patchMediaMeta(orgId: string, id: string, input: { altText?: string | null; caption?: string | null; approvedForMarketing?: boolean }): Promise<ContentMediaDTO | null> {
  const [row] = await db
    .update(contentMedia)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(contentMedia.orgId, orgId), eq(contentMedia.id, id)))
    .returning();
  if (!row) return null;
  return {
    id: row.id,
    orgId: row.orgId,
    storageKey: row.storageKey,
    contentType: row.contentType,
    fileName: row.fileName,
    altText: row.altText,
    caption: row.caption,
    approvedForMarketing: row.approvedForMarketing,
    source: row.source,
    photoId: row.photoId,
    uploadedBy: row.uploadedBy,
    createdAt: iso(row.createdAt) ?? "",
  };
}

// ── Channel variants ──
export async function getVariants(orgId: string, contentId: string): Promise<ChannelVariantDTO[]> {
  const rows = await db.select().from(channelVariants).where(and(eq(channelVariants.orgId, orgId), eq(channelVariants.contentId, contentId))).orderBy(asc(channelVariants.channel));
  return rows.map((r) => ({
    id: r.id,
    contentId: r.contentId,
    channel: r.channel,
    enabled: r.enabled,
    titleOverride: r.titleOverride,
    bodyOverride: r.bodyOverride,
    caption: r.caption,
    mediaOverrideId: r.mediaOverrideId,
    linkBehavior: r.linkBehavior,
    hashtags: (r.hashtags as string[]) ?? [],
    status: r.status,
    lastGeneratedAt: iso(r.lastGeneratedAt),
  }));
}

export async function upsertVariant(orgId: string, input: {
  contentId: string;
  channel: string;
  enabled?: boolean;
  titleOverride?: string | null;
  bodyOverride?: string | null;
  caption?: string | null;
  mediaOverrideId?: string | null;
  linkBehavior?: string | null;
  hashtags?: string[];
}): Promise<ChannelVariantDTO> {
  const [row] = await db
    .insert(channelVariants)
    .values({
      orgId,
      contentId: input.contentId,
      channel: input.channel as never,
      enabled: input.enabled ?? true,
      titleOverride: input.titleOverride ?? null,
      bodyOverride: input.bodyOverride ?? null,
      caption: input.caption ?? null,
      mediaOverrideId: input.mediaOverrideId ?? null,
      linkBehavior: input.linkBehavior ?? null,
      hashtags: input.hashtags ?? [],
    })
    .onConflictDoUpdate({
      target: [channelVariants.contentId, channelVariants.channel],
      set: {
        enabled: input.enabled ?? channelVariants.enabled,
        titleOverride: input.titleOverride !== undefined ? input.titleOverride : channelVariants.titleOverride,
        bodyOverride: input.bodyOverride !== undefined ? input.bodyOverride : channelVariants.bodyOverride,
        caption: input.caption !== undefined ? input.caption : channelVariants.caption,
        mediaOverrideId: input.mediaOverrideId !== undefined ? input.mediaOverrideId : channelVariants.mediaOverrideId,
        linkBehavior: input.linkBehavior !== undefined ? input.linkBehavior : channelVariants.linkBehavior,
        hashtags: input.hashtags ?? channelVariants.hashtags,
        updatedAt: new Date(),
      },
    })
    .returning();
  return {
    id: row.id,
    contentId: row.contentId,
    channel: row.channel,
    enabled: row.enabled,
    titleOverride: row.titleOverride,
    bodyOverride: row.bodyOverride,
    caption: row.caption,
    mediaOverrideId: row.mediaOverrideId,
    linkBehavior: row.linkBehavior,
    hashtags: (row.hashtags as string[]) ?? [],
    status: row.status,
    lastGeneratedAt: iso(row.lastGeneratedAt),
  };
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
}
