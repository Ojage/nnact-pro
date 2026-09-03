// Public content API — read-only endpoints for the marketing site (NNACT
// Webapp). No auth: serves only content that is PUBLISHED + PUBLIC visibility.
// Also serves the /public/media/:id file endpoint for approved marketing assets.
import type { FastifyInstance } from "fastify";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, contentItems, contentTags, contentCategories, contentItemTags, contentMedia, users } from "@nnact/db";
import type { BodyDocument, BodyDocumentMediaMap, ContentItemDTO, PublicContentItemDTO } from "@nnact/shared";
import { getPublicMediaFile } from "../content-media.js";
import { mediaIdsFromDocument } from "../publishing/application/content-transform.js";

function publicApiBase() {
  return (process.env.PUBLIC_API_URL ?? process.env.PUBLIC_WEB_URL ?? "http://localhost:3003").replace(/\/$/, "");
}

function mediaUrl(id: string | null | undefined): string | null {
  return id ? `${publicApiBase()}/api/v1/public/media/${id}` : null;
}

function pickAuthor(row: typeof contentItems.$inferSelect, byId: Map<string, typeof users.$inferSelect>): { id: string; name: string } | null {
  if (!row.authorId) return null;
  const author = byId.get(row.authorId);
  return author ? { id: author.id, name: author.name } : null;
}

/** Only media approved for marketing is exposed in the body media map. */
function bodyMediaMap(document: BodyDocument | null, mediaById: Map<string, typeof contentMedia.$inferSelect>): BodyDocumentMediaMap {
  if (!document || document.length === 0) return {};
  const map: BodyDocumentMediaMap = {};
  for (const id of mediaIdsFromDocument(document)) {
    const media = mediaById.get(id);
    if (!media || !media.approvedForMarketing) continue;
    map[id] = {
      url: `${publicApiBase()}/api/v1/public/media/${id}`,
      alt: media.altText ?? null,
      caption: media.caption ?? null,
      contentType: media.contentType,
    };
  }
  return map;
}

async function toPublic(item: ContentItemDTO, mediaById: Map<string, typeof contentMedia.$inferSelect>): Promise<PublicContentItemDTO> {
  // Gather tags, category, author, and media in a single pass.
  const itemIdsByTag = await db.select().from(contentItemTags).where(eq(contentItemTags.contentId, item.id));
  const tagRows = await db.select().from(contentTags).where(inArray(contentTags.id, itemIdsByTag.map((t) => t.tagId)));
  const category = item.categoryId
    ? ((await db.select().from(contentCategories).where(eq(contentCategories.id, item.categoryId)).limit(1))[0] ?? null)
    : null;
  const author = item.authorId
    ? ((await db.select().from(users).where(eq(users.id, item.authorId)).limit(1))[0] ?? null)
    : null;
  const featured = item.featuredMediaId ? mediaById.get(item.featuredMediaId) ?? null : null;

  return {
    id: item.id,
    type: item.type,
    title: item.title,
    slug: item.slug,
    summary: item.summary,
    body: item.body,
    bodyDocument: item.bodyDocument ?? null,
    bodyHtml: item.bodyHtml ?? null,
    bodyMarkdown: item.bodyMarkdown ?? null,
    bodyMedia: bodyMediaMap(item.bodyDocument ?? null, mediaById),
    publishedAt: item.publishedAt ?? item.updatedAt,
    updatedAt: item.updatedAt,
    category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
    tags: tagRows.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
    author: author ? { id: author.id, name: author.name } : null,
    featuredImage: featured ? { url: `${publicApiBase()}/api/v1/public/media/${featured.id}`, alt: featured.altText ?? null } : null,
    seo: item.seo,
  };
}

export async function publicContentRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const limit = 20;
    const rows = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.status, "PUBLISHED"), eq(contentItems.visibility, "PUBLIC")))
      .orderBy(desc(contentItems.publishedAt))
      .limit(limit);

    const mediaIds = collectAllMediaIds(rows.map(toPseudo));
    const media = mediaIds.length
      ? await db.select().from(contentMedia).where(inArray(contentMedia.id, mediaIds))
      : [];
    const mediaById = new Map(media.map((m) => [m.id, m]));

    const items: ContentItemDTO[] = rows.map(toPseudo);

    const result: PublicContentItemDTO[] = [];
    for (const item of items) result.push(await toPublic(item, mediaById));
    return { items: result };
  });

  app.get("/featured", async (req) => {
    const rows = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.status, "PUBLISHED"), eq(contentItems.visibility, "PUBLIC")))
      .orderBy(desc(contentItems.publishedAt))
      .limit(6);
    const mediaIds = collectAllMediaIds(rows.map(toPseudo));
    const media = mediaIds.length ? await db.select().from(contentMedia).where(inArray(contentMedia.id, mediaIds)) : [];
    const mediaById = new Map(media.map((m) => [m.id, m]));
    const items: ContentItemDTO[] = rows.map(toPseudo);
    const result: PublicContentItemDTO[] = [];
    for (const item of items) result.push(await toPublic(item, mediaById));
    return { items: result };
  });

  // Categories (register before the slug param route).
  app.get("/categories", async (req) => {
    const cats = await db.select().from(contentCategories);
    return { categories: cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug })) };
  });

  app.get<{ Params: { slug: string } }>("/:slug", async (req, reply) => {
    const rows = await db
      .select()
      .from(contentItems)
      .where(and(eq(contentItems.slug, req.params.slug), eq(contentItems.status, "PUBLISHED"), eq(contentItems.visibility, "PUBLIC")))
      .limit(1);
    const row = rows[0];
    if (!row) return reply.code(404).send({ error: "not found" });
    const mediaIds = collectAllMediaIds([toPseudo(row)]);
    const media = mediaIds.length ? await db.select().from(contentMedia).where(inArray(contentMedia.id, mediaIds)) : [];
    const mediaById = new Map(media.map((m) => [m.id, m]));
    return toPublic(toPseudo(row), mediaById);
  });
}

/** Union of every media id referenced by a set of items (featured, OG, and body document). */
function collectAllMediaIds(items: ContentItemDTO[]): string[] {
  const ids = new Set<string>();
  for (const item of items) {
    if (item.featuredMediaId) ids.add(item.featuredMediaId);
    if (item.seo?.openGraphMediaId) ids.add(item.seo.openGraphMediaId);
    if (item.bodyDocument) {
      for (const id of mediaIdsFromDocument(item.bodyDocument)) ids.add(id);
    }
  }
  return [...ids];
}

function toPseudo(r: typeof contentItems.$inferSelect): ContentItemDTO {
  return {
    id: r.id, orgId: r.orgId, type: r.type, title: r.title, slug: r.slug,
    summary: r.summary, body: r.body, bodyDocument: r.bodyDocument as BodyDocument | null, status: r.status, visibility: r.visibility,
    language: r.language, revision: r.revision, featuredMediaId: r.featuredMediaId,
    authorId: r.authorId, categoryId: r.categoryId, tagIds: [],
    seo: { seoTitle: r.seoTitle, seoDescription: r.seoDescription, canonicalUrl: r.canonicalUrl, openGraphTitle: r.openGraphTitle, openGraphDescription: r.openGraphDescription, openGraphMediaId: r.openGraphMediaId },
    approvedBy: r.approvedBy, approvedAt: r.approvedAt ? r.approvedAt.toISOString() : undefined,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : undefined,
    scheduledAt: r.scheduledAt ? r.scheduledAt.toISOString() : undefined,
    sourceJobId: r.sourceJobId, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export async function publicMediaRoute(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const result = await getPublicMediaFile(req.params.id);
    if (!result) return reply.code(404).send({ error: "not found" });
    reply.header("Cache-Control", "public, max-age=86400");
    reply.header("Cross-Origin-Resource-Policy", "cross-origin");
    return reply.type(result.record.contentType).send(result.buffer);
  });
}
