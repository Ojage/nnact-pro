// Content Studio admin API — CRUD, lifecycle (review/approve/publish/schedule/
// retry/unpublish), channel variants, categories, tags, and media. Auth + org via
// resolveOrgId; role gates for approval and publishing enforced with verifiedClaims.
import type { FastifyInstance, FastifyRequest } from "fastify";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db, channelPublications, contentItems } from "@nnact/db";
import { CONTENT_TYPES, CONTENT_VISIBILITY } from "@nnact/shared";
import type { JwtClaims, StaffJwtClaims } from "../auth.js";
import { isStaffClaims } from "../auth.js";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import {
  listContent,
  getContentItem,
  createContent,
  updateContent,
  getContentVersions,
  listCategories,
  upsertCategory,
  ensureTags,
  listTags,
  listMedia,
  createMediaRecord,
  patchMediaMeta,
  getVariants,
  upsertVariant,
  slugify,
} from "../publishing/infra/content-repo.js";
import { listPublications, getPublication, listAttempts } from "../publishing/infra/publication-repo.js";
import { PublishContentUseCase } from "../publishing/application/publish.js";
import { RetryPublicationUseCase } from "../publishing/application/retry.js";
import { UnpublishContentUseCase } from "../publishing/application/unpublish.js";
import { ContentTransformService } from "../publishing/application/content-transform.js";
import { defaultRegistry } from "../publishing/registry.js";
import { DbMediaProvider } from "../publishing/infra/media.js";
import { assertContentTransition } from "../publishing/application/content-status.js";
import { contentAudit } from "../publishing/infra/audit.js";
import { saveContentMedia } from "../content-media.js";

function publicApiBase() {
  return process.env.PUBLIC_API_URL ?? process.env.PUBLIC_WEB_URL ?? "http://localhost:3003";
}

/** Return the authenticated staff user id, or null (dev/compat). */
async function staffUser(req: FastifyRequest): Promise<string | null> {
  try {
    await req.jwtVerify();
    if (isStaffClaims(req.user)) return (req.user as StaffJwtClaims).userId;
  } catch {
    /* not authenticated */
  }
  return null;
}

const listQuery = z.object({
  skip: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 0)),
  take: z.string().optional().transform((v) => (v ? Math.min(parseInt(v, 10), 200) : 50)),
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHING", "PUBLISHED", "ARCHIVED", "REJECTED"]).optional(),
  type: z.enum(CONTENT_TYPES).optional(),
  search: z.string().optional(),
});

const createSchema = z.object({
  type: z.enum(CONTENT_TYPES),
  title: z.string().min(1).max(255),
  summary: z.string().max(1000).optional().nullable(),
  body: z.string().optional(),
  bodyDocument: z.array(z.any()).optional().nullable(),
  categoryId: z.string().optional().nullable(),
  tagNames: z.array(z.string()).optional(),
  visibility: z.enum(CONTENT_VISIBILITY).optional(),
  language: z.string().max(10).optional(),
  featuredMediaId: z.string().optional().nullable(),
});

const variantSchema = z.object({
  enabled: z.boolean().optional(),
  titleOverride: z.string().max(200).optional().nullable(),
  bodyOverride: z.string().optional().nullable(),
  caption: z.string().max(3000).optional().nullable(),
  mediaOverrideId: z.string().optional().nullable(),
  linkBehavior: z.string().optional().nullable(),
  hashtags: z.array(z.string()).optional(),
});

const publishSchema = z.object({
  channels: z.array(z.enum(["WEBSITE", "LINKEDIN", "FACEBOOK", "INSTAGRAM"])).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export async function contentRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    limits: { files: 1, fileSize: 60 * 1024 * 1024, fields: 0 },
  });

  const registry = defaultRegistry();
  const media = new DbMediaProvider({ publicApiBaseUrl: publicApiBase() });
  const transform = new ContentTransformService(publicApiBase());
  const publishUseCase = new PublishContentUseCase({ registry, media });
  const retryUseCase = new RetryPublicationUseCase();
  const unpublishUseCase = new UnpublishContentUseCase(registry);

  // ── Content items ──
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { skip, take, status, type, search } = listQuery.parse(req.query);
    return listContent({ orgId, skip, take, status, type, search });
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const actorId = await staffUser(req);
    const body = createSchema.parse(req.body);
    const derived = body.bodyDocument !== undefined ? await transform.derive(body.bodyDocument) : null;
    const baseSlug = slugify(body.title) || `content-${Date.now()}`;
    let tagIds: string[] = [];
    if (body.tagNames?.length) tagIds = await ensureTags(orgId, body.tagNames);
    const item = await createContent({
      orgId,
      authorId: actorId ?? "system",
      type: body.type,
      title: body.title,
      slug: baseSlug,
      summary: body.summary ?? null,
      body: derived ? derived.body : (body.body ?? ""),
      bodyDocument: derived ? derived.bodyDocument : undefined,
      bodyHtml: derived ? derived.bodyHtml : undefined,
      bodyMarkdown: derived ? derived.bodyMarkdown : undefined,
      categoryId: body.categoryId ?? null,
      tagIds,
      featuredMediaId: body.featuredMediaId ?? null,
      visibility: body.visibility ?? "PUBLIC",
      language: body.language ?? "en",
    });
    await contentAudit(orgId, { contentId: item.id, actorId, action: "content.created", details: { type: body.type } });
    return reply.code(201).send(item);
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const item = await getContentItem(orgId, req.params.id);
    if (!item) return reply.code(404).send({ error: "content not found" });
    const [variants, versions, publications] = await Promise.all([
      getVariants(orgId, req.params.id),
      getContentVersions(orgId, req.params.id),
      listPublications(orgId, { limit: 50, offset: 0 }),
    ]);
    return { ...item, variants, versions, publications: publications.items.filter((p) => p.contentId === item.id) };
  });

  app.patch<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const actorId = await staffUser(req);
    const current = await getContentItem(orgId, req.params.id);
    if (!current) return reply.code(404).send({ error: "content not found" });
    const body = createSchema.partial().parse(req.body);
    const derived = body.bodyDocument !== undefined ? await transform.derive(body.bodyDocument) : null;
    let tagIds = body.tagNames ? await ensureTags(orgId, body.tagNames) : undefined;
    const updated = await updateContent({
      orgId,
      contentId: req.params.id,
      editorId: actorId ?? "system",
      body: derived ? derived.body : body.body,
      bodyDocument: derived ? derived.bodyDocument : body.bodyDocument,
      bodyHtml: derived ? derived.bodyHtml : undefined,
      bodyMarkdown: derived ? derived.bodyMarkdown : undefined,
      summary: body.summary,
      type: body.type,
      visibility: body.visibility,
      language: body.language,
      featuredMediaId: body.featuredMediaId,
      categoryId: body.categoryId,
      tagIds,
    });
    await contentAudit(orgId, { contentId: updated.id, actorId, action: "content.updated" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const actorId = await staffUser(req);
    const current = await getContentItem(orgId, req.params.id);
    if (!current) return reply.code(404).send({ error: "content not found" });
    if (current.status !== "DRAFT") return reply.code(400).send({ error: "only DRAFT content can be deleted" });
    await db.delete(contentItems).where(and(eq(contentItems.orgId, orgId), eq(contentItems.id, req.params.id)));
    await contentAudit(orgId, { contentId: req.params.id, actorId, action: "content.deleted" });
    return reply.code(204).send();
  });

  // ── Lifecycle ──
  app.post<{ Params: { id: string } }>("/:id/submit-review", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const actorId = await staffUser(req);
    const item = await requireContent(orgId, req.params.id, reply);
    if (!item) return;
    assertContentTransition(item.status, "IN_REVIEW");
    await setContentStatus(orgId, req.params.id, "IN_REVIEW");
    await contentAudit(orgId, { contentId: req.params.id, actorId, action: "content.submitted_review" });
    return { status: "IN_REVIEW" };
  });

  app.post<{ Params: { id: string } }>("/:id/approve", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "only owners can approve content" });
    const item = await requireContent(orgId, req.params.id, reply);
    if (!item) return;
    assertContentTransition(item.status, "APPROVED");
    await db.update(contentItems).set({ status: "APPROVED", approvedBy: claims.userId, approvedAt: new Date(), updatedAt: new Date() }).where(eq(contentItems.id, req.params.id));
    await contentAudit(orgId, { contentId: req.params.id, actorId: claims.userId, action: "content.approved" });
    return { status: "APPROVED" };
  });

  app.post<{ Params: { id: string } }>("/:id/reject", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "only owners can reject content" });
    const item = await requireContent(orgId, req.params.id, reply);
    if (!item) return;
    assertContentTransition(item.status, "REJECTED");
    await setContentStatus(orgId, req.params.id, "REJECTED");
    await contentAudit(orgId, { contentId: req.params.id, actorId: claims.userId, action: "content.rejected" });
    return { status: "REJECTED" };
  });

  app.post<{ Params: { id: string } }>("/:id/publish", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "only owners can publish content" });
    const body = publishSchema.parse(req.body ?? {});
    const outcome = await publishUseCase.publish({
      orgId,
      contentId: req.params.id,
      actorId: claims.userId,
      channels: body.channels ?? registry.channels(),
      scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
    });
    return outcome;
  });

  app.post<{ Params: { id: string } }>("/:id/schedule", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner" && claims.role !== "dispatcher") return reply.code(403).send({ error: "insufficient role" });
    const body = publishSchema.parse(req.body);
    if (!body.scheduledAt) return reply.code(400).send({ error: "scheduledAt is required" });
    const outcome = await publishUseCase.schedule({
      orgId,
      contentId: req.params.id,
      actorId: claims.userId,
      channels: body.channels ?? registry.channels(),
      scheduledAt: new Date(body.scheduledAt),
    });
    return outcome;
  });

  app.post<{ Params: { id: string } }>("/:id/unpublish", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (claims.role !== "owner") return reply.code(403).send({ error: "only owners can unpublish content" });
    const result = await unpublishUseCase.unpublish(orgId, req.params.id, claims.userId, { deleteExternal: true });
    return result;
  });

  // ── Publications ──
  app.get("/publications", async (req) => {
    const orgId = await resolveOrgId(req);
    const { skip, take, status } = listQuery.parse(req.query);
    return listPublications(orgId, { status: status as string | undefined, limit: take, offset: skip });
  });

  app.post<{ Params: { id: string } }>("/publications/:id/retry", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const actorId = await staffUser(req);
    const pub = await getPublication(orgId, req.params.id);
    if (!pub) return reply.code(404).send({ error: "publication not found" });
    const updated = await retryUseCase.retry(orgId, req.params.id, actorId ?? "system");
    return updated;
  });

  app.get<{ Params: { id: string } }>("/publications/:id/attempts", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const pub = await getPublication(orgId, req.params.id);
    if (!pub) return reply.code(404).send({ error: "publication not found" });
    return listAttempts(orgId, req.params.id);
  });

  // ── Channel variants ──
  app.get<{ Params: { id: string } }>("/:id/variants", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const item = await requireContent(orgId, req.params.id, reply);
    if (!item) return;
    return getVariants(orgId, req.params.id);
  });

  app.put<{ Params: { id: string; channel: string } }>("/:id/variants/:channel", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const item = await requireContent(orgId, req.params.id, reply);
    if (!item) return;
    const body = variantSchema.parse(req.body ?? {});
    const variant = await upsertVariant(orgId, {
      contentId: req.params.id,
      channel: req.params.channel,
      enabled: body.enabled,
      titleOverride: body.titleOverride,
      bodyOverride: body.bodyOverride,
      caption: body.caption,
      mediaOverrideId: body.mediaOverrideId,
      linkBehavior: body.linkBehavior,
      hashtags: body.hashtags,
    });
    await contentAudit(orgId, { contentId: req.params.id, action: "content.variant_updated", details: { channel: req.params.channel } });
    return variant;
  });

  // ── Categories & tags ──
  app.get("/categories", async (req) => {
    const orgId = await resolveOrgId(req);
    return listCategories(orgId);
  });

  app.post("/categories", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const body = z.object({ name: z.string().min(1).max(100), description: z.string().max(500).optional().nullable() }).parse(req.body);
    const cat = await upsertCategory(orgId, body.name, slugify(body.name) || `cat-${Date.now()}`, body.description ?? null);
    await contentAudit(orgId, { action: "content.category_created", details: { name: body.name } });
    return reply.code(201).send(cat);
  });

  app.get("/tags", async (req) => {
    const orgId = await resolveOrgId(req);
    return listTags(orgId);
  });

  // ── Media ──
  app.post("/media", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const actorId = await staffUser(req);
    try {
      const file = await req.file();
      if (!file) return reply.code(400).send({ error: "no file uploaded" });
      const record = await saveContentMedia({
        orgId,
        stream: file.file,
        filenameHint: file.filename ?? null,
        source: "manual",
        approvedForMarketing: true,
        uploadedBy: actorId,
      });
      return reply.code(201).send(record);
    } catch (err) {
      const error = err as { statusCode?: number; message?: string };
      return reply.code(error?.statusCode ?? 500).send({ error: error?.message ?? "internal error" });
    }
  });

  app.get("/media", async (req) => {
    const orgId = await resolveOrgId(req);
    return listMedia(orgId);
  });

  app.patch<{ Params: { id: string } }>("/media/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const body = z.object({ altText: z.string().max(500).optional().nullable(), caption: z.string().max(1000).optional().nullable(), approvedForMarketing: z.boolean().optional() }).parse(req.body);
    const updated = await patchMediaMeta(orgId, req.params.id, {
      altText: body.altText,
      caption: body.caption,
      approvedForMarketing: body.approvedForMarketing,
    });
    if (!updated) return reply.code(404).send({ error: "media not found" });
    return updated;
  });
}

async function requireContent(orgId: string, id: string, reply: { code: (n: number) => { send: (b: unknown) => void } }) {
  const item = await getContentItem(orgId, id);
  if (!item) {
    reply.code(404).send({ error: "content not found" });
    return null;
  }
  return item;
}

async function setContentStatus(orgId: string, id: string, status: string) {
  await db.update(contentItems).set({ status: status as never, updatedAt: new Date() }).where(and(eq(contentItems.orgId, orgId), eq(contentItems.id, id)));
}
