// Content repository — DB access + DTO mapping for Content Studio.
// All org-scoped. Mappers convert drizzle rows to the shared DTO shapes.
import type { SQL } from "drizzle-orm";
import { and, arrayContains, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
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
import type {
  ContentItemDTO,
  ContentMediaDTO,
  ContentMediaFacetsDTO,
  ContentMediaQuery,
  ContentVersionDTO,
  ChannelVariantDTO,
  ContentCategoryDTO,
} from "@nnact/shared";

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
  seo?: {
    seoTitle?: string | null;
    seoDescription?: string | null;
    canonicalUrl?: string | null;
    openGraphTitle?: string | null;
    openGraphDescription?: string | null;
    openGraphMediaId?: string | null;
  };
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
        seoTitle: input.seo?.seoTitle,
        seoDescription: input.seo?.seoDescription,
        canonicalUrl: input.seo?.canonicalUrl,
        openGraphTitle: input.seo?.openGraphTitle,
        openGraphDescription: input.seo?.openGraphDescription,
        openGraphMediaId: input.seo?.openGraphMediaId,
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
      .onConflictDoUpdate({ target: [contentTags.orgId, contentTags.slug], set: { name } })
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
/**
 * Public, unauthenticated URL for an asset. The gallery renders this directly
 * and it is the same URL handed to social providers at publish time.
 */
export function mediaUrl(publicApiBaseUrl: string, mediaId: string): string {
  return `${publicApiBaseUrl.replace(/\/$/, "")}/api/v1/public/media/${mediaId}`;
}

type MediaRow = typeof contentMedia.$inferSelect;

/**
 * The gallery needs an absolute URL, which the row does not carry, so the base
 * has to be threaded in. Every media read goes through here rather than
 * re-spelling the shape — the DTO previously had three copies of this mapper
 * and they had already drifted.
 */
export function toMediaDTO(row: MediaRow, publicApiBaseUrl: string): ContentMediaDTO {
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
    url: mediaUrl(publicApiBaseUrl, row.id),
    useFor: (row.useFor as ContentMediaDTO["useFor"]) ?? null,
    tags: row.tags ?? [],
    archived: row.archived,
    aiPrompt: row.aiPrompt,
    aiUsageCount: row.aiUsageCount ?? 0,
    aiLastUsedAt: iso(row.aiLastUsedAt) ?? null,
  };
}

const MEDIA_PAGE_MAX = 200;

/**
 * Build the WHERE clause for the gallery. Kept separate from the query so
 * `mediaFacets` can count against the same org/scope without duplicating rules.
 */
function mediaFilters(orgId: string, query: ContentMediaQuery): SQL[] {
  const clauses: SQL[] = [eq(contentMedia.orgId, orgId)];
  if (query.archived !== undefined) clauses.push(eq(contentMedia.archived, query.archived));
  else clauses.push(eq(contentMedia.archived, false)); // the gallery hides archived by default
  if (query.source) clauses.push(eq(contentMedia.source, query.source));
  if (query.useFor === "ANY") {
    // "Any" is the unlabelled-but-general bucket, which is exactly a NULL label.
    clauses.push(isNull(contentMedia.useFor));
  } else if (query.useFor) {
    clauses.push(eq(contentMedia.useFor, query.useFor));
  }
  if (query.tags?.length) {
    // AND across the requested tags: an operator filtering on ["ac", "hvac"]
    // wants assets carrying both subjects.
    for (const tag of query.tags) clauses.push(arrayContains(contentMedia.tags, [tag]));
  }
  const search = query.search?.trim();
  if (search) {
    const needle = `%${search.toLowerCase()}%`;
    const searchable = sql`lower(coalesce(${contentMedia.fileName}, '') || ' ' || coalesce(${contentMedia.altText}, '') || ' ' || coalesce(${contentMedia.caption}, '') || ' ' || coalesce(${contentMedia.aiPrompt}, ''))`;
    clauses.push(sql`${searchable} like ${needle}`);
  }
  return clauses;
}

export async function listMedia(orgId: string, publicApiBaseUrl: string, query: ContentMediaQuery = {}): Promise<ContentMediaDTO[]> {
  const limit = Math.min(Math.max(query.limit ?? 60, 1), MEDIA_PAGE_MAX);
  const offset = Math.max(query.offset ?? 0, 0);
  const rows = await db
    .select()
    .from(contentMedia)
    .where(and(...mediaFilters(orgId, query)))
    .orderBy(desc(contentMedia.createdAt))
    .limit(limit)
    .offset(offset);
  return rows.map((r) => toMediaDTO(r, publicApiBaseUrl));
}

export async function countMedia(orgId: string, query: ContentMediaQuery = {}): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(contentMedia)
    .where(and(...mediaFilters(orgId, query)));
  return row?.n ?? 0;
}

/**
 * Counts for the gallery filter bar. Computed over the whole non-archived org
 * set so the counts stay stable while the operator narrows down, which is how
 * Google Photos behaves — the chips do not renumber themselves mid-filter.
 */
export async function mediaFacets(orgId: string): Promise<ContentMediaFacetsDTO> {
  const rows = await db
    .select({
      useFor: contentMedia.useFor,
      source: contentMedia.source,
      tags: contentMedia.tags,
    })
    .from(contentMedia)
    .where(and(eq(contentMedia.orgId, orgId), eq(contentMedia.archived, false)));
  const byUseFor: Record<string, number> = {};
  const bySource: Record<string, number> = {};
  const byTag = new Map<string, number>();
  let unlabelled = 0;
  for (const row of rows) {
    const label = row.useFor ?? "ANY";
    byUseFor[label] = (byUseFor[label] ?? 0) + 1;
    if (!row.useFor) unlabelled += 1;
    if (row.source) bySource[row.source] = (bySource[row.source] ?? 0) + 1;
    for (const tag of row.tags ?? []) byTag.set(tag, (byTag.get(tag) ?? 0) + 1);
  }
  return {
    total: rows.length,
    byUseFor,
    bySource,
    byTag: [...byTag.entries()].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag)),
    unlabelled,
  };
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
  useFor?: string | null;
  tags?: string[];
  aiPrompt?: string | null;
}, publicApiBaseUrl: string): Promise<ContentMediaDTO> {
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
      // "ANY" is a UI-facing spelling of "no specific label"; store NULL so the
      // two stay distinguishable and the migration default needs no backfill.
      useFor: input.useFor && input.useFor !== "ANY" ? input.useFor : null,
      tags: input.tags ?? [],
      aiPrompt: input.aiPrompt ?? null,
    })
    .returning();
  return toMediaDTO(row, publicApiBaseUrl);
}

export async function patchMediaMeta(
  orgId: string,
  id: string,
  input: {
    altText?: string | null;
    caption?: string | null;
    approvedForMarketing?: boolean;
    useFor?: string | null;
    tags?: string[];
    archived?: boolean;
  },
  publicApiBaseUrl: string,
): Promise<ContentMediaDTO | null> {
  const set: Partial<MediaRow> = { updatedAt: new Date() };
  if (input.altText !== undefined) set.altText = input.altText;
  if (input.caption !== undefined) set.caption = input.caption;
  if (input.approvedForMarketing !== undefined) set.approvedForMarketing = input.approvedForMarketing;
  if (input.useFor !== undefined) set.useFor = input.useFor && input.useFor !== "ANY" ? input.useFor : null;
  if (input.tags !== undefined) set.tags = input.tags;
  if (input.archived !== undefined) set.archived = input.archived;
  const [row] = await db
    .update(contentMedia)
    .set(set)
    .where(and(eq(contentMedia.orgId, orgId), eq(contentMedia.id, id)))
    .returning();
  return row ? toMediaDTO(row, publicApiBaseUrl) : null;
}

/**
 * Apply one labelling change to many assets at once, for the gallery's
 * multi-select. Labels only, deliberately: bulk-editing bytes or alt text is
 * what makes an "apply to 40 items" action dangerous.
 */
export async function bulkLabelMedia(
  orgId: string,
  ids: string[],
  input: { useFor?: string | null; tags?: string[]; archived?: boolean },
  publicApiBaseUrl: string,
): Promise<ContentMediaDTO[]> {
  if (ids.length === 0) return [];
  const set: Partial<MediaRow> = { updatedAt: new Date() };
  if (input.useFor !== undefined) set.useFor = input.useFor && input.useFor !== "ANY" ? input.useFor : null;
  if (input.tags !== undefined) set.tags = input.tags;
  if (input.archived !== undefined) set.archived = input.archived;
  const rows = await db
    .update(contentMedia)
    .set(set)
    .where(and(eq(contentMedia.orgId, orgId), inArray(contentMedia.id, ids)))
    .returning();
  return rows.map((r) => toMediaDTO(r, publicApiBaseUrl));
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
