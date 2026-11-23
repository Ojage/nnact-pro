import multipart from "@fastify/multipart";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@nnact/db";
import {
  agentRuns,
  priceBookCategories,
  priceBookItems,
  priceBookRates,
  priceObservations,
  quoteProposals,
} from "@nnact/db";
import { receiptExtractionSchema, type PriceObservationStatus } from "@nnact/shared";
import { verifiedClaims } from "../operational-authorization.js";
import { resolveOrgId } from "./org.js";
import { getFinanceReceipt, receiptPublicUrl, saveFinanceReceipt } from "../finance-files.js";
import { DbAutomationSettingsStore, DbProviderConfigStore } from "../ai/infra.js";
import { AiProviderRegistry } from "../ai/registry.js";
import { importHistoricalPrices } from "../price-book/historical.js";
import {
  categoryDTO,
  itemDTO,
  observationDTO,
  pricedCandidates,
  proposalDTO,
  rateDTO,
} from "../price-book/service.js";
import { matchItemByName } from "../price-book/pricing.js";

const uuid = z.string().uuid();
const categoryBody = z.object({
  name: z.string().trim().min(1).max(120),
  freshnessDays: z.number().int().min(1).max(3650).default(30),
  active: z.boolean().default(true),
});
const itemBody = z.object({
  categoryId: uuid,
  canonicalName: z.string().trim().min(1).max(200),
  unit: z.string().trim().min(1).max(40).default("piece"),
  aliases: z.object({
    en: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
    fr: z.array(z.string().trim().min(1).max(200)).max(30).default([]),
  }).default({ en: [], fr: [] }),
  catalogItemId: uuid.nullable().optional(),
  suggested: z.boolean().default(false),
  active: z.boolean().default(true),
});
const observationBody = z.object({
  itemId: uuid,
  amountCents: z.number().int().positive(),
  shopName: z.string().trim().max(160).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  observedAt: z.string().datetime().optional(),
  jobId: uuid.nullable().optional(),
  status: z.enum(["pending", "confirmed"]).default("confirmed"),
  confidence: z.number().int().min(0).max(100).default(80),
});
const rateBody = z.object({
  kind: z.enum(["labor", "transport", "diagnostic"]),
  key: z.string().trim().min(1).max(120),
  amountCents: z.number().int().positive(),
  active: z.boolean().default(true),
});
const manualPurchaseLine = z.object({
  name: z.string().trim().min(1).max(200),
  quantity: z.number().int().positive().max(1000).default(1),
  amountCents: z.number().int().positive(),
  unit: z.string().trim().max(40).default("piece"),
});
const purchaseBody = z.object({
  shopName: z.string().trim().max(160).nullable().optional(),
  area: z.string().trim().max(160).nullable().optional(),
  observedAt: z.string().datetime().optional(),
  lines: z.array(manualPurchaseLine).max(40).default([]),
});

const configStore = new DbProviderConfigStore();
const settingsStore = new DbAutomationSettingsStore();
const registry = new AiProviderRegistry({ configStore });

const RECEIPT_SYSTEM = [
  "You transcribe a repair-part receipt into JSON.",
  "Copy only prices printed on the receipt, in XAF cents as integers.",
  "Never infer, multiply or guess a price. Use null when a price is unreadable.",
  "Return keys: shopName, area, lines[{name,quantity,unitPriceCents,unit}], notes.",
].join(" ");

async function requireRole(req: FastifyRequest, reply: FastifyReply, roles: string[]) {
  const claims = await verifiedClaims(req, reply);
  if (!claims || reply.sent) return null;
  if (!roles.includes(claims.role)) {
    await reply.code(403).send({ error: "your role cannot perform this price book action" });
    return null;
  }
  return claims;
}

async function findOrCreateCategory(orgId: string, name: string): Promise<string> {
  const [existing] = await db
    .select({ id: priceBookCategories.id })
    .from(priceBookCategories)
    .where(and(eq(priceBookCategories.orgId, orgId), eq(priceBookCategories.name, name)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(priceBookCategories)
    .values({ orgId, name, freshnessDays: 30 })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;
  const [fallback] = await db
    .select({ id: priceBookCategories.id })
    .from(priceBookCategories)
    .where(eq(priceBookCategories.orgId, orgId))
    .limit(1);
  return fallback.id;
}

async function findOrCreateItem(orgId: string, rawName: string): Promise<{ id: string; suggested: boolean }> {
  const items = await db.select().from(priceBookItems).where(eq(priceBookItems.orgId, orgId));
  const match = matchItemByName(items, rawName);
  if (match) return { id: match.id, suggested: match.suggested };
  const name = rawName.trim().slice(0, 200);
  const [created] = await db
    .insert(priceBookItems)
    .values({
      orgId,
      categoryId: await findOrCreateCategory(orgId, "Receipt imports"),
      canonicalName: name,
      unit: "piece",
      aliases: { en: [name], fr: [] },
      suggested: true,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return { id: created.id, suggested: true };
  const [fallback] = await db
    .select({ id: priceBookItems.id, suggested: priceBookItems.suggested })
    .from(priceBookItems)
    .where(and(eq(priceBookItems.orgId, orgId), eq(priceBookItems.canonicalName, name)))
    .limit(1);
  return { id: fallback.id, suggested: fallback.suggested };
}

async function extractReceipt(orgId: string, fileId: string, runId: string) {
  const file = await getFinanceReceipt(orgId, fileId);
  if (!file || !file.contentType.startsWith("image/")) return null;
  const settings = await settingsStore.get(orgId);
  const order = settings.textProviderOrder.length ? settings.textProviderOrder : (["OPENAI"] as const);
  const generated = await registry.generateTextWithFallback(
    orgId,
    {
      system: RECEIPT_SYSTEM,
      prompt: "Transcribe this receipt now. Return only the JSON object.",
      images: [{ mediaType: file.contentType, dataBase64: file.buffer.toString("base64") }],
      structured: true,
      temperature: 0,
      maxTokens: 1200,
      task: "agent.receipt_vision",
      runId,
    },
    [...order],
  );
  const parsed = receiptExtractionSchema.safeParse(generated.result.structuredData);
  if (!parsed.success) throw new Error(`invalid receipt extraction: ${parsed.error.message.slice(0, 300)}`);
  return { data: parsed.data, model: generated.result.model };
}

export async function priceBookRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { files: 1, fileSize: 25 * 1024 * 1024, fields: 30 } });

  app.get("/categories", async (req) => {
    const orgId = await resolveOrgId(req);
    return db.select().from(priceBookCategories).where(eq(priceBookCategories.orgId, orgId)).orderBy(priceBookCategories.name).then((rows) => rows.map(categoryDTO));
  });

  app.post("/categories", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher"]);
    if (!claims) return;
    const parsed = categoryBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(priceBookCategories)
      .values({ orgId: claims.orgId, ...parsed.data })
      .returning();
    return reply.code(201).send(categoryDTO(row));
  });

  app.patch("/categories/:id", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher"]);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const parsed = categoryBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(priceBookCategories)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(priceBookCategories.orgId, claims.orgId), eq(priceBookCategories.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return categoryDTO(row);
  });

  app.get("/items", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db.select().from(priceBookItems).where(eq(priceBookItems.orgId, orgId)).orderBy(desc(priceBookItems.createdAt));
    const candidates = await pricedCandidates(orgId);
    const ranges = new Map(candidates.map((candidate) => [candidate.itemId, candidate.range]));
    return rows.map((row) => ({ ...itemDTO(row), range: ranges.get(row.id) ?? null }));
  });

  app.post("/items", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher"]);
    if (!claims) return;
    const parsed = itemBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db.insert(priceBookItems).values({ orgId: claims.orgId, ...parsed.data }).returning();
    return reply.code(201).send(itemDTO(row));
  });

  app.patch("/items/:id", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher"]);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const parsed = itemBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(priceBookItems)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(priceBookItems.orgId, claims.orgId), eq(priceBookItems.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return itemDTO(row);
  });

  app.get("/observations", async (req) => {
    const orgId = await resolveOrgId(req);
    const query = req.query as { itemId?: string; status?: PriceObservationStatus };
    const conditions = [eq(priceObservations.orgId, orgId)];
    if (query.itemId) conditions.push(eq(priceObservations.itemId, query.itemId));
    if (query.status === "pending" || query.status === "confirmed") conditions.push(eq(priceObservations.status, query.status));
    const rows = await db
      .select()
      .from(priceObservations)
      .where(and(...conditions))
      .orderBy(desc(priceObservations.observedAt))
      .limit(300);
    return rows.map(observationDTO);
  });

  app.post("/observations", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher", "secretary", "technician"]);
    if (!claims) return;
    const parsed = observationBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(priceObservations)
      .values({
        orgId: claims.orgId,
        ...parsed.data,
        observedAt: parsed.data.observedAt ? new Date(parsed.data.observedAt) : new Date(),
        source: "manual",
        status: parsed.data.status,
        recordedBy: claims.userId,
      })
      .returning();
    return reply.code(201).send(observationDTO(row));
  });

  app.post("/observations/:id/confirm", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher"]);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(priceObservations)
      .set({ status: "confirmed", confidence: 90, updatedAt: new Date() })
      .where(and(eq(priceObservations.orgId, claims.orgId), eq(priceObservations.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return observationDTO(row);
  });

  app.get("/rates", async (req) => {
    const orgId = await resolveOrgId(req);
    const rows = await db.select().from(priceBookRates).where(eq(priceBookRates.orgId, orgId)).orderBy(priceBookRates.kind, priceBookRates.key);
    return rows.map(rateDTO);
  });

  app.post("/rates", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner"]);
    if (!claims) return;
    const parsed = rateBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db.insert(priceBookRates).values({ orgId: claims.orgId, ...parsed.data }).returning();
    return reply.code(201).send(rateDTO(row));
  });

  app.patch("/rates/:id", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner"]);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const parsed = rateBody.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(priceBookRates)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(priceBookRates.orgId, claims.orgId), eq(priceBookRates.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return rateDTO(row);
  });

  // Job purchase log: manual lines plus an optional receipt photo. Staff-only.
  app.post("/jobs/:jobId/purchases", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher", "secretary", "technician"]);
    if (!claims) return;
    const { jobId } = req.params as { jobId: string };
    let fields: Record<string, string> = {};
    let fileId: string | null = null;
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === "file") {
          if (fileId) continue;
          const record = await saveFinanceReceipt(claims.orgId, { stream: part.file, filenameHint: part.filename });
          fileId = record.fileId;
        } else {
          fields[part.fieldname] = String(part.value);
        }
      }
    } else {
      fields = (req.body ?? {}) as Record<string, string>;
    }
    let parsedLines: unknown = fields.lines;
    if (typeof parsedLines === "string") {
      try {
        parsedLines = JSON.parse(parsedLines);
      } catch {
        return reply.code(400).send({ error: "lines must be valid JSON" });
      }
    }
    const parsed = purchaseBody.safeParse({
      shopName: fields.shopName || null,
      area: fields.area || null,
      observedAt: fields.observedAt || undefined,
      lines: parsedLines ?? [],
    });
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const observedAt = parsed.data.observedAt ? new Date(parsed.data.observedAt) : new Date();
    const receiptRef = fileId ? receiptPublicUrl(claims.orgId, fileId) : null;
    const inserted: string[] = [];
    for (const line of parsed.data.lines) {
      const item = await findOrCreateItem(claims.orgId, line.name);
      const [row] = await db
        .insert(priceObservations)
        .values({
          orgId: claims.orgId,
          itemId: item.id,
          amountCents: line.amountCents,
          shopName: parsed.data.shopName ?? null,
          area: parsed.data.area ?? null,
          source: "manual",
          status: "confirmed",
          observedAt,
          jobId,
          recordedBy: claims.userId,
          confidence: 80,
          receiptMediaRef: receiptRef,
        })
        .returning();
      inserted.push(row.id);
    }

    let extracted: { lines: number; suggestions: string[] } | null = null;
    if (fileId) {
      const [run] = await db
        .insert(agentRuns)
        .values({
          orgId: claims.orgId,
          jobId,
          state: "running",
          task: "agent.receipt_vision",
          input: { receiptMediaRef: receiptRef, jobId },
          attempts: 1,
        })
        .returning();
      try {
        const result = await extractReceipt(claims.orgId, fileId, run.id);
        let count = 0;
        const suggestions: string[] = [];
        if (result) {
          for (const line of result.data.lines) {
            if (line.unitPriceCents === null || line.unitPriceCents === 0) continue;
            const item = await findOrCreateItem(claims.orgId, line.name);
            if (item.suggested) suggestions.push(line.name);
            const [row] = await db
              .insert(priceObservations)
              .values({
                orgId: claims.orgId,
                itemId: item.id,
                amountCents: line.unitPriceCents,
                shopName: result.data.shopName ?? parsed.data.shopName ?? null,
                area: result.data.area ?? parsed.data.area ?? null,
                source: "receipt",
                status: "pending",
                observedAt,
                jobId,
                recordedBy: claims.userId,
                confidence: 55,
                receiptMediaRef: receiptRef,
              })
              .returning();
            inserted.push(row.id);
            count += 1;
          }
          await db.update(agentRuns).set({ state: "completed", output: { extracted: result.data, observationIds: inserted }, model: result.model, completedAt: new Date() }).where(eq(agentRuns.id, run.id));
        } else {
          await db.update(agentRuns).set({ state: "skipped", error: "receipt is not an image", completedAt: new Date() }).where(eq(agentRuns.id, run.id));
        }
        extracted = { lines: count, suggestions };
      } catch (error) {
        await db.update(agentRuns).set({ state: "failed", error: (error as Error).message.slice(0, 1000), completedAt: new Date() }).where(eq(agentRuns.id, run.id));
        return reply.code(502).send({ error: "receipt extraction failed", observationIds: inserted });
      }
    }
    return reply.code(201).send({ observationIds: inserted, extracted });
  });

  app.post("/historical/import", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner"]);
    if (!claims) return;
    const parsed = z.object({ dryRun: z.boolean().default(true) }).safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return importHistoricalPrices(claims.orgId, parsed.data.dryRun);
  });
}

/** Staff quote review. Owners/dispatchers only; never available to customers. */
export async function quoteReviewRoutes(app: FastifyInstance) {
  app.get("/quotes/proposals", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher"]);
    if (!claims) return;
    const rows = await db.select().from(quoteProposals).where(eq(quoteProposals.orgId, claims.orgId)).orderBy(desc(quoteProposals.createdAt));
    const details = await Promise.all(rows.map((row) => proposalDTO(claims.orgId, row.id)));
    return details.filter(Boolean);
  });

  app.get("/quotes/proposals/:id", async (req, reply) => {
    const claims = await requireRole(req, reply, ["owner", "dispatcher"]);
    if (!claims) return;
    const { id } = req.params as { id: string };
    const detail = await proposalDTO(claims.orgId, id);
    if (!detail) return reply.code(404).send({ error: "not found" });
    return detail;
  });
}
