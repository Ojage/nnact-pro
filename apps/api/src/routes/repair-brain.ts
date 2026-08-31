import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import {
  db,
  equipmentModels,
  knownFaults,
  symptoms,
  faultSymptoms,
  repairProcedures,
  testPoints,
  fieldMeasurements,
  modelParts,
  partProcurementRecords,
  technicalDocuments,
  repairOutcomes,
  knowledgeProposals,
  knowledgeRevisions,
  explodedViews,
  explodedViewComponents,
  diagnosticWorkflowExtensions,
  diagnosticWorkflows,
  diagnosticSessions,
  equipment,
} from "@nnact/db";
import {
  KNOWLEDGE_CONFIDENCE,
  KNOWLEDGE_VERIFICATION_STATUS,
  REPAIR_OUTCOME,
  KNOWLEDGE_PROPOSAL_TYPE,
  KNOWLEDGE_PROPOSAL_STATUS,
  MEASUREMENT_RESULT,
  TECHNICAL_DOCUMENT_TYPE,
} from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import type { JwtClaims } from "../auth.js";
import {
  upsertEquipmentModel,
  findSimilarFaults,
  upsertSymptom,
  recordKnowledgeRevision,
  advanceProposalStatus,
  materializeProposal,
  getModelRepairStats,
  searchRepairBrain,
  linkWorkflowToModel,
  normalizeFaultCode,
  countSuccessfulRepairsForFault,
  autoPromoteConfidenceAfterSuccess,
  getJobRepairBrainContext,
  suggestFaultsFromSymptoms,
  getWorkflowsForFault,
  buildProposalDraft,
  linkEquipmentToModel,
  computeModelInsights,
  computeOrgRepairBrainHealth,
} from "../repair-brain.js";

import {
  cacheGetJSON,
  cacheSetJSON,
  invalidateByPrefix,
  counterIncr,
  counterTop,
  suggestAdd,
  suggestLookup,
} from "../repair-brain-cache.js";
import { semanticSearch, warmSemanticIndex } from "../repair-brain-semantic.js";

const modelCreateSchema = z.object({
  manufacturer: z.string().min(1),
  brand: z.string().optional(),
  modelNumber: z.string().min(1),
  modelName: z.string().optional(),
  variant: z.string().optional(),
  category: z.string().min(1),
  subcategory: z.string().optional(),
  productFamily: z.string().optional(),
  manufactureYears: z.object({ from: z.number().optional(), to: z.number().optional() }).optional(),
  specifications: z.record(z.unknown()).optional(),
  aliases: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const faultCreateSchema = z.object({
  equipmentModelId: z.string().uuid(),
  faultCode: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  severity: z.string().optional(),
  frequency: z.string().optional(),
  safetyWarnings: z.array(z.string()).optional(),
  probableCauses: z.array(z.string()).optional(),
  symptomLabels: z.array(z.string()).optional(),
  sourceJobId: z.string().uuid().optional(),
  sourceEquipmentId: z.string().uuid().optional(),
});

const measurementSchema = z.object({
  sessionId: z.string().uuid().optional(),
  repairOutcomeId: z.string().uuid().optional(),
  equipmentModelId: z.string().uuid().optional(),
  testPointId: z.string().uuid().optional(),
  parameter: z.string().min(1),
  unit: z.string().optional(),
  expectedMin: z.string().optional(),
  expectedMax: z.string().optional(),
  expectedExact: z.string().optional(),
  observedValue: z.string().optional(),
  result: z.enum(MEASUREMENT_RESULT).optional(),
  testLocation: z.string().optional(),
  instrumentUsed: z.string().optional(),
  notes: z.string().optional(),
});

const repairOutcomeSchema = z.object({
  jobId: z.string().uuid(),
  equipmentId: z.string().uuid(),
  equipmentModelId: z.string().uuid().optional(),
  diagnosticSessionId: z.string().uuid().optional(),
  knownFaultId: z.string().uuid().optional(),
  repairProcedureId: z.string().uuid().optional(),
  outcome: z.enum(REPAIR_OUTCOME),
  whatWasDone: z.string().optional(),
  partsUsed: z
    .array(z.object({ partName: z.string(), oemPartNumber: z.string().optional(), quantity: z.number().optional() }))
    .optional(),
  laborMinutes: z.number().int().optional(),
  machineStatus: z.string().optional(),
  technicianConfidence: z.number().int().min(1).max(5).optional(),
  customerOutcome: z.string().optional(),
  followUpNeeded: z.boolean().optional(),
  isFailedAttempt: z.boolean().optional(),
  conclusion: z.string().optional(),
  notes: z.string().optional(),
});

const proposalSchema = z.object({
  sourceJobId: z.string().uuid().optional(),
  sourceEquipmentId: z.string().uuid().optional(),
  sourceSessionId: z.string().uuid().optional(),
  sourceRepairOutcomeId: z.string().uuid().optional(),
  equipmentModelId: z.string().uuid().optional(),
  proposalType: z.enum(KNOWLEDGE_PROPOSAL_TYPE),
  title: z.string().min(1),
  payload: z.record(z.unknown()).optional(),
});

async function resolveUserId(req: Parameters<typeof resolveOrgId>[0]): Promise<string | undefined> {
  try {
    await req.jwtVerify();
    const claims = req.user as JwtClaims;
    return claims?.userId;
  } catch {
    return undefined;
  }
}

type RepairBrainSearchResult = Awaited<ReturnType<typeof searchRepairBrain>>;

async function seedSuggestions(
  orgId: string,
  query: string,
  result: RepairBrainSearchResult,
): Promise<void> {
  const tokens = query.trim().split(/\s+/).filter(Boolean);
  for (const t of tokens.slice(0, 3)) {
    if (t.length < 2) continue;
    await suggestAdd(orgId, "query", t);
  }
  for (const m of result.models.slice(0, 5)) {
    await suggestAdd(orgId, "model", `${m.manufacturer ?? ""} ${m.modelNumber ?? ""}`.trim());
  }
  for (const f of result.faults.slice(0, 5)) {
    if (f.faultCode) await suggestAdd(orgId, "faultCode", f.faultCode);
  }
  for (const p of result.parts.slice(0, 5)) {
    await suggestAdd(orgId, "part", p.partName);
  }
}

interface ModelProfileResult {
  model: typeof equipmentModels.$inferSelect;
  faults: Array<typeof knownFaults.$inferSelect>;
  repairProcedures: Array<typeof repairProcedures.$inferSelect>;
  parts: Array<typeof modelParts.$inferSelect>;
  testPoints: Array<typeof testPoints.$inferSelect>;
  documents: Array<typeof technicalDocuments.$inferSelect>;
  explodedViews: Array<typeof explodedViews.$inferSelect>;
  diagnosticWorkflows: Array<typeof diagnosticWorkflows.$inferSelect>;
  repairStats: Awaited<ReturnType<typeof getModelRepairStats>>;
  instanceCount: number;
}

async function buildModelProfile(orgId: string, id: string): Promise<ModelProfileResult> {
  const [model] = await db
    .select()
    .from(equipmentModels)
    .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.id, id)));

  const [faults, procedures, parts, points, docs, views, stats, instances] = await Promise.all([
    db.select().from(knownFaults).where(eq(knownFaults.equipmentModelId, id)),
    db.select().from(repairProcedures).where(eq(repairProcedures.equipmentModelId, id)),
    db.select().from(modelParts).where(eq(modelParts.equipmentModelId, id)),
    db.select().from(testPoints).where(eq(testPoints.equipmentModelId, id)),
    db.select().from(technicalDocuments).where(eq(technicalDocuments.equipmentModelId, id)),
    db.select().from(explodedViews).where(eq(explodedViews.equipmentModelId, id)),
    getModelRepairStats(orgId, id),
    db
      .select({ id: equipment.id, serialNumber: equipment.serialNumber, customerId: equipment.customerId })
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.equipmentModelId, id)))
      .limit(50),
  ]);

  const workflowLinks = await db
    .select({ ext: diagnosticWorkflowExtensions, workflow: diagnosticWorkflows })
    .from(diagnosticWorkflowExtensions)
    .innerJoin(diagnosticWorkflows, eq(diagnosticWorkflowExtensions.workflowId, diagnosticWorkflows.id))
    .where(eq(diagnosticWorkflowExtensions.equipmentModelId, id));

  return {
    model: model!,
    faults,
    repairProcedures: procedures,
    parts,
    testPoints: points,
    documents: docs,
    explodedViews: views,
    diagnosticWorkflows: workflowLinks.map((w) => w.workflow),
    repairStats: stats,
    instanceCount: instances.length,
  };
}

async function invalidateOrgCache(orgId: string): Promise<void> {
  await invalidateByPrefix(`rb:org:${orgId}:`);
}

async function invalidateModelCache(orgId: string, modelId: string): Promise<void> {
  await invalidateByPrefix(`rb:org:${orgId}:model:${modelId}:`);
  await invalidateByPrefix(`rb:org:${orgId}:search:`);
  await invalidateByPrefix(`rb:org:${orgId}:overview`);
}

export async function repairBrainRoutes(app: FastifyInstance) {
  // ── Search ──────────────────────────────────────────────────────────
  app.get("/search", async (req) => {
    const orgId = await resolveOrgId(req);
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return { models: [], faults: [], parts: [], procedures: [], documents: [], repairHistory: [] };
    }
    const cacheKey = `rb:org:${orgId}:search:${q.trim().toLowerCase()}`;
    const cached = await cacheGetJSON<
      RepairBrainSearchResult[]
    >(cacheKey);
    if (cached) {
      return cached;
    }
    const result = await searchRepairBrain(orgId, q);
    await cacheSetJSON(cacheKey, result, 120);
    await seedSuggestions(orgId, q, result);
    await counterIncr(`rb:org:${orgId}:trending:queries`, q.trim().toLowerCase());
    void warmSemanticIndex(orgId);
    return result;
  });

  // ── Equipment Models ────────────────────────────────────────────────
  app.get("/models", async (req) => {
    const orgId = await resolveOrgId(req);
    const { category, q } = req.query as { category?: string; q?: string };
    const conditions = [eq(equipmentModels.orgId, orgId)];
    return db
      .select()
      .from(equipmentModels)
      .where(and(...conditions))
      .orderBy(desc(equipmentModels.updatedAt))
      .limit(100);
  });

  app.get("/models/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [model] = await db
      .select()
      .from(equipmentModels)
      .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.id, id)));
    if (!model) return reply.code(404).send({ error: "model not found" });
    return model;
  });

  app.get("/models/:id/profile", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [model] = await db
      .select()
      .from(equipmentModels)
      .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.id, id)));
    if (!model) return reply.code(404).send({ error: "model not found" });

    const cacheKey = `rb:org:${orgId}:model:${id}:profile`;
    const cached = await cacheGetJSON<ModelProfileResult>(cacheKey);
    if (cached) return cached;
    const result = await buildModelProfile(orgId, id);
    await cacheSetJSON(cacheKey, result, 300);
    return result;
  });

  app.post("/models", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = modelCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const result = await upsertEquipmentModel(orgId, parsed.data, userId);
    await invalidateOrgCache(orgId);
    return reply.code(result.created ? 201 : 200).send(result);
  });

  app.patch("/models/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = modelCreateSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [existing] = await db
      .select()
      .from(equipmentModels)
      .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.id, id)));
    if (!existing) return reply.code(404).send({ error: "model not found" });

    const userId = await resolveUserId(req);
    await recordKnowledgeRevision(orgId, "equipment_model", id, existing as never, userId, "update");

    const [updated] = await db
      .update(equipmentModels)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.id, id)))
      .returning();
    await invalidateModelCache(orgId, id);
    return updated;
  });

  // ── Intelligence ────────────────────────────────────────────────────
  app.get("/models/:id/insights", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [model] = await db
      .select()
      .from(equipmentModels)
      .where(and(eq(equipmentModels.orgId, orgId), eq(equipmentModels.id, id)));
    if (!model) return reply.code(404).send({ error: "model not found" });
    const cacheKey = `rb:org:${orgId}:model:${id}:insights`;
    const cached = await cacheGetJSON<Record<string, unknown>>(cacheKey);
    if (cached) return cached;
    const insights = await computeModelInsights(orgId, id);
    await cacheSetJSON(cacheKey, insights, 180);
    return insights;
  });

  app.get("/insights/overview", async (req) => {
    const orgId = await resolveOrgId(req);
    const cacheKey = `rb:org:${orgId}:overview`;
    const cached = await cacheGetJSON<Record<string, unknown>>(cacheKey);
    if (cached) return cached;
    const overview = await computeOrgRepairBrainHealth(orgId);
    await cacheSetJSON(cacheKey, overview, 180);
    return overview;
  });

  // ── Typeahead autocomplete ──────────────────────────────────────────
  app.get("/autocomplete", async (req) => {
    const orgId = await resolveOrgId(req);
    const { q, kind } = req.query as { q?: string; kind?: string };
    if (!q || q.trim().length < 2) return [];
    const candidates = await suggestLookup(orgId, kind && kind !== "all" ? kind : "query", q.trim());
    if (candidates.length > 0) return candidates;
    // Seed from a lightweight DB scan on a cold cache so the first request still returns.
    return db
      .select({ label: sql<string>`${equipmentModels.manufacturer} || ' ' || ${equipmentModels.modelNumber}` })
      .from(equipmentModels)
      .where(and(eq(equipmentModels.orgId, orgId), sql`(${equipmentModels.manufacturer} || ' ' || ${equipmentModels.modelNumber}) ILIKE ${`%${q.trim()}%`}`))
      .limit(8)
      .then((rows) => rows.map((r) => r.label));
  });

  // ── Semantic (vector) search ────────────────────────────────────────
  app.get("/semantic-search", async (req) => {
    const orgId = await resolveOrgId(req);
    const { q, limit } = req.query as { q?: string; limit?: string };
    if (!q || q.trim().length < 2) return { available: true, hits: [] };
    const n = Math.min(20, Math.max(1, Number(limit) || 8));
    const cacheKey = `rb:org:${orgId}:semantic:${q.trim().toLowerCase()}:${n}`;
    const cached = await cacheGetJSON<Record<string, unknown>>(cacheKey);
    if (cached) return cached;
    const result = await semanticSearch(orgId, q, n);
    await cacheSetJSON(cacheKey, result, 600);
    return result;
  });

  // ── Trending / hot knowledge ────────────────────────────────────────
  app.get("/trending", async (req) => {
    const orgId = await resolveOrgId(req);
    const cacheKey = `rb:org:${orgId}:trending`;
    const cached = await cacheGetJSON<Record<string, unknown>>(cacheKey);
    if (cached) return cached;

    const [queries, helpfulFaults, helpfulProcedures, helpfulParts] = await Promise.all([
      counterTop(`rb:org:${orgId}:trending:queries`, 10),
      counterTop(`rb:org:${orgId}:trending:helpful:fault`, 10),
      counterTop(`rb:org:${orgId}:trending:helpful:procedure`, 10),
      counterTop(`rb:org:${orgId}:trending:helpful:part`, 10),
    ]);

    const resolveFaults = async (ids: Array<{ id: string; score: number }>) => {
      if (ids.length === 0) return [];
      const rows = await db
        .select({ id: knownFaults.id, title: knownFaults.title, equipmentModelId: knownFaults.equipmentModelId })
        .from(knownFaults)
        .where(and(eq(knownFaults.orgId, orgId), sql`${knownFaults.id} = ANY(${ids.map((x) => x.id)}::uuid[])`));
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.flatMap((x) => {
        const row = byId.get(x.id);
        return row ? [{ id: x.id, score: x.score, title: row.title, equipmentModelId: row.equipmentModelId }] : [];
      });
    };

    const resolveProcedures = async (ids: Array<{ id: string; score: number }>) => {
      if (ids.length === 0) return [];
      const rows = await db
        .select({ id: repairProcedures.id, title: repairProcedures.title, equipmentModelId: repairProcedures.equipmentModelId })
        .from(repairProcedures)
        .where(and(eq(repairProcedures.orgId, orgId), sql`${repairProcedures.id} = ANY(${ids.map((x) => x.id)}::uuid[])`));
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.flatMap((x) => {
        const row = byId.get(x.id);
        return row ? [{ id: x.id, score: x.score, title: row.title, equipmentModelId: row.equipmentModelId }] : [];
      });
    };

    const resolveParts = async (ids: Array<{ id: string; score: number }>) => {
      if (ids.length === 0) return [];
      const rows = await db
        .select({ id: modelParts.id, title: modelParts.partName, equipmentModelId: modelParts.equipmentModelId })
        .from(modelParts)
        .where(and(eq(modelParts.orgId, orgId), sql`${modelParts.id} = ANY(${ids.map((x) => x.id)}::uuid[])`));
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids.flatMap((x) => {
        const row = byId.get(x.id);
        return row ? [{ id: x.id, score: x.score, title: row.title, equipmentModelId: row.equipmentModelId }] : [];
      });
    };

    const result = {
      hotQueries: queries.map((x) => ({ query: x.id, count: x.score })),
      helpfulFaults: await resolveFaults(helpfulFaults),
      helpfulProcedures: await resolveProcedures(helpfulProcedures),
      helpfulParts: await resolveParts(helpfulParts),
    };
    await cacheSetJSON(cacheKey, result, 120);
    return result;
  });

  app.post("/import", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    await invalidateOrgCache(orgId);
    const body = req.body as {
      models?: Array<Record<string, unknown>>;
      faults?: Array<Record<string, unknown>>;
      parts?: Array<Record<string, unknown>>;
    };
    const userId = await resolveUserId(req);
    const counts = { models: 0, faults: 0, parts: 0 };

    for (const raw of body.models ?? []) {
      const manufacturer = String(raw.manufacturer ?? "").trim();
      const modelNumber = String(raw.modelNumber ?? "").trim();
      if (!manufacturer || !modelNumber) continue;
      const { created } = await upsertEquipmentModel(
        orgId,
        {
          manufacturer,
          brand: raw.brand ? String(raw.brand) : undefined,
          modelNumber,
          modelName: raw.modelName ? String(raw.modelName) : undefined,
          category: String(raw.category ?? "other"),
          subcategory: raw.subcategory ? String(raw.subcategory) : undefined,
          specifications: raw.specifications ? (raw.specifications as Record<string, unknown>) : undefined,
          notes: raw.notes ? String(raw.notes) : undefined,
        },
        userId,
      );
      if (created) counts.models++;
    }

    for (const raw of body.faults ?? []) {
      const equipmentModelId = String(raw.equipmentModelId ?? "");
      const title = String(raw.title ?? "").trim();
      if (!equipmentModelId || !title) continue;
      await db
        .insert(knownFaults)
        .values({
          orgId,
          equipmentModelId,
          faultCode: raw.faultCode ? String(raw.faultCode) : undefined,
          normalizedFaultCode: raw.faultCode ? normalizeFaultCode(String(raw.faultCode)) : undefined,
          title,
          description: raw.description ? String(raw.description) : undefined,
          probableCauses: Array.isArray(raw.probableCauses) ? (raw.probableCauses as string[]) : [],
          tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
          confidenceStatus: "field_observation",
          verificationStatus: "proposed",
          createdBy: userId,
        })
        .onConflictDoNothing()
        .returning();
      counts.faults++;
    }

    for (const raw of body.parts ?? []) {
      const equipmentModelId = String(raw.equipmentModelId ?? "");
      const partName = String(raw.partName ?? "").trim();
      if (!equipmentModelId || !partName) continue;
      await db
        .insert(modelParts)
        .values({
          orgId,
          equipmentModelId,
          partName,
          oemPartNumber: raw.oemPartNumber ? String(raw.oemPartNumber) : undefined,
          reliabilityNotes: raw.reliabilityNotes ? String(raw.reliabilityNotes) : undefined,
          tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
          confidenceStatus: "field_observation",
          verificationStatus: "proposed",
          createdBy: userId,
        })
        .onConflictDoNothing()
        .returning();
      counts.parts++;
    }

    return reply.code(201).send({ counts });
  });

  // ── Known Faults ────────────────────────────────────────────────────
  app.get("/faults", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId } = req.query as { equipmentModelId?: string };
    const conditions = [eq(knownFaults.orgId, orgId)];
    if (equipmentModelId) conditions.push(eq(knownFaults.equipmentModelId, equipmentModelId));
    return db.select().from(knownFaults).where(and(...conditions)).orderBy(desc(knownFaults.updatedAt));
  });

  app.post("/faults", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = faultCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const similar = await findSimilarFaults(
      orgId,
      parsed.data.equipmentModelId,
      parsed.data.title,
      parsed.data.faultCode,
    );

    const userId = await resolveUserId(req);
    const [fault] = await db
      .insert(knownFaults)
      .values({
        orgId,
        equipmentModelId: parsed.data.equipmentModelId,
        faultCode: parsed.data.faultCode,
        normalizedFaultCode: parsed.data.faultCode
          ? normalizeFaultCode(parsed.data.faultCode)
          : undefined,
        title: parsed.data.title,
        description: parsed.data.description,
        severity: parsed.data.severity,
        frequency: parsed.data.frequency,
        safetyWarnings: (parsed.data.safetyWarnings ?? []) as never[],
        probableCauses: parsed.data.probableCauses ?? [],
        sourceJobId: parsed.data.sourceJobId,
        sourceEquipmentId: parsed.data.sourceEquipmentId,
        sourceType: parsed.data.sourceJobId ? "field_job" : undefined,
        createdBy: userId,
      })
      .returning();

    for (const label of parsed.data.symptomLabels ?? []) {
      const symptom = await upsertSymptom(orgId, label, userId);
      await db.insert(faultSymptoms).values({ orgId, faultId: fault.id, symptomId: symptom.id }).onConflictDoNothing();
    }

    await invalidateModelCache(orgId, fault.equipmentModelId);
    return reply.code(201).send({ fault, similarExisting: similar });
  });

  app.get("/faults/:id", async (req, reply) => {    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [fault] = await db
      .select()
      .from(knownFaults)
      .where(and(eq(knownFaults.orgId, orgId), eq(knownFaults.id, id)));
    if (!fault) return reply.code(404).send({ error: "fault not found" });

    const linkedSymptoms = await db
      .select({ symptom: symptoms })
      .from(faultSymptoms)
      .innerJoin(symptoms, eq(faultSymptoms.symptomId, symptoms.id))
      .where(eq(faultSymptoms.faultId, id));

    return { ...fault, symptoms: linkedSymptoms.map((s) => s.symptom) };
  });

  app.post("/faults/:id/verify", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const userId = await resolveUserId(req);
    const body = req.body as { confidenceStatus?: string };
    const [fault] = await db
      .update(knownFaults)
      .set({
        verificationStatus: "verified",
        confidenceStatus: (body.confidenceStatus as never) ?? "senior_verified",
        verifiedBy: userId,
        verifiedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(knownFaults.orgId, orgId), eq(knownFaults.id, id)))
      .returning();
    if (!fault) return reply.code(404).send({ error: "fault not found" });
    await invalidateModelCache(orgId, fault.equipmentModelId);
    return fault;
  });

  app.patch("/faults/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = faultCreateSchema.partial().safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [existing] = await db
      .select()
      .from(knownFaults)
      .where(and(eq(knownFaults.orgId, orgId), eq(knownFaults.id, id)));
    if (!existing) return reply.code(404).send({ error: "fault not found" });

    const userId = await resolveUserId(req);
    await recordKnowledgeRevision(orgId, "known_fault", id, existing as never, userId, "update");

    const [updated] = await db
      .update(knownFaults)
      .set({
        faultCode: parsed.data.faultCode,
        normalizedFaultCode: parsed.data.faultCode
          ? normalizeFaultCode(parsed.data.faultCode)
          : existing.normalizedFaultCode,
        title: parsed.data.title ?? undefined,
        description: parsed.data.description,
        severity: parsed.data.severity,
        frequency: parsed.data.frequency,
        safetyWarnings: parsed.data.safetyWarnings ? (parsed.data.safetyWarnings as never[]) : undefined,
        probableCauses: parsed.data.probableCauses ?? undefined,
        sourceJobId: parsed.data.sourceJobId,
        sourceEquipmentId: parsed.data.sourceEquipmentId,
        updatedAt: new Date(),
      })
      .where(and(eq(knownFaults.orgId, orgId), eq(knownFaults.id, id)))
      .returning();
    await invalidateModelCache(orgId, updated.equipmentModelId);
    return updated;
  });

  app.post("/faults/:id/rate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [updated] = await db
      .update(knownFaults)
      .set({ usefulCount: sql`${knownFaults.usefulCount} + 1`, updatedAt: new Date() })
      .where(and(eq(knownFaults.orgId, orgId), eq(knownFaults.id, id)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "fault not found" });
    await counterIncr(`rb:org:${orgId}:trending:helpful:fault`, id);
    await invalidateModelCache(orgId, updated.equipmentModelId);
    return updated;
  });

  // ── Symptoms ────────────────────────────────────────────────────────
  app.get("/symptoms", async (req) => {
    const orgId = await resolveOrgId(req);
    return db.select().from(symptoms).where(eq(symptoms.orgId, orgId)).orderBy(symptoms.label);
  });

  app.post("/symptoms", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { label } = req.body as { label?: string };
    if (!label?.trim()) return reply.code(400).send({ error: "label required" });
    const userId = await resolveUserId(req);
    const symptom = await upsertSymptom(orgId, label, userId);
    return reply.code(201).send(symptom);
  });

  // ── Repair Procedures ───────────────────────────────────────────────
  app.get("/procedures", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId } = req.query as { equipmentModelId?: string };
    const conditions = [eq(repairProcedures.orgId, orgId)];
    if (equipmentModelId) conditions.push(eq(repairProcedures.equipmentModelId, equipmentModelId));
    return db.select().from(repairProcedures).where(and(...conditions));
  });

  app.post("/procedures", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const body = req.body as Record<string, unknown>;
    const userId = await resolveUserId(req);
    const [procedure] = await db
      .insert(repairProcedures)
      .values({
        orgId,
        equipmentModelId: body.equipmentModelId as string,
        knownFaultId: body.knownFaultId as string | undefined,
        title: body.title as string,
        description: body.description as string | undefined,
        steps: (body.steps as never[]) ?? [],
        requiredTools: (body.requiredTools as string[]) ?? [],
        requiredParts: (body.requiredParts as never[]) ?? [],
        safetyWarnings: (body.safetyWarnings as never[]) ?? [],
        prerequisites: (body.prerequisites as string[]) ?? [],
        verificationSteps: (body.verificationSteps as string[]) ?? [],
        expectedDurationMinutes: body.expectedDurationMinutes as number | undefined,
        skillLevel: body.skillLevel as string | undefined,
        tags: (body.tags as string[]) ?? [],
        createdBy: userId,
      })
      .returning();
    await invalidateModelCache(orgId, procedure.equipmentModelId);
    return reply.code(201).send(procedure);
  });

  app.patch("/procedures/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const [existing] = await db
      .select()
      .from(repairProcedures)
      .where(and(eq(repairProcedures.orgId, orgId), eq(repairProcedures.id, id)));
    if (!existing) return reply.code(404).send({ error: "procedure not found" });

    const userId = await resolveUserId(req);
    await recordKnowledgeRevision(orgId, "repair_procedure", id, existing as never, userId, "update");

    const [updated] = await db
      .update(repairProcedures)
      .set({
        title: (body.title as string) ?? undefined,
        description: (body.description as string | undefined) ?? undefined,
        steps: (body.steps as never[] | undefined) ?? undefined,
        requiredTools: (body.requiredTools as string[] | undefined) ?? undefined,
        requiredParts: (body.requiredParts as never[] | undefined) ?? undefined,
        safetyWarnings: (body.safetyWarnings as never[] | undefined) ?? undefined,
        prerequisites: (body.prerequisites as string[] | undefined) ?? undefined,
        verificationSteps: (body.verificationSteps as string[] | undefined) ?? undefined,
        expectedDurationMinutes: (body.expectedDurationMinutes as number | undefined) ?? undefined,
        skillLevel: (body.skillLevel as string | undefined) ?? undefined,
        tags: (body.tags as string[] | undefined) ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(repairProcedures.orgId, orgId), eq(repairProcedures.id, id)))
      .returning();
    await invalidateModelCache(orgId, updated.equipmentModelId);
    return updated;
  });

  app.post("/procedures/:id/rate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [updated] = await db
      .update(repairProcedures)
      .set({ usefulCount: sql`${repairProcedures.usefulCount} + 1`, updatedAt: new Date() })
      .where(and(eq(repairProcedures.orgId, orgId), eq(repairProcedures.id, id)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "procedure not found" });
    await counterIncr(`rb:org:${orgId}:trending:helpful:procedure`, id);
    await invalidateModelCache(orgId, updated.equipmentModelId);
    return updated;
  });

  // ── Measurements ────────────────────────────────────────────────────
  app.get("/measurements", async (req) => {
    const orgId = await resolveOrgId(req);
    const { sessionId, equipmentModelId } = req.query as { sessionId?: string; equipmentModelId?: string };
    const conditions = [eq(fieldMeasurements.orgId, orgId)];
    if (sessionId) conditions.push(eq(fieldMeasurements.sessionId, sessionId));
    if (equipmentModelId) conditions.push(eq(fieldMeasurements.equipmentModelId, equipmentModelId));
    return db.select().from(fieldMeasurements).where(and(...conditions)).orderBy(desc(fieldMeasurements.recordedAt));
  });

  app.post("/measurements", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = measurementSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const [measurement] = await db
      .insert(fieldMeasurements)
      .values({ orgId, ...parsed.data, recordedBy: userId })
      .returning();
    return reply.code(201).send(measurement);
  });

  // ── Test Points ─────────────────────────────────────────────────────
  app.get("/test-points", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId } = req.query as { equipmentModelId?: string };
    const conditions = [eq(testPoints.orgId, orgId)];
    if (equipmentModelId) conditions.push(eq(testPoints.equipmentModelId, equipmentModelId));
    return db.select().from(testPoints).where(and(...conditions));
  });

  app.post("/test-points", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const body = req.body as Record<string, unknown>;
    const userId = await resolveUserId(req);
    const [point] = await db
      .insert(testPoints)
      .values({
        orgId,
        equipmentModelId: body.equipmentModelId as string,
        component: body.component as string | undefined,
        board: body.board as string | undefined,
        connector: body.connector as string | undefined,
        pin: body.pin as string | undefined,
        description: body.description as string | undefined,
        expectedMin: body.expectedMin as string | undefined,
        expectedMax: body.expectedMax as string | undefined,
        expectedExact: body.expectedExact as string | undefined,
        unit: body.unit as string | undefined,
        warning: body.warning as string | undefined,
        createdBy: userId,
      })
      .returning();
    await invalidateModelCache(orgId, point.equipmentModelId);
    return reply.code(201).send(point);
  });

  app.patch("/test-points/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const [existing] = await db
      .select()
      .from(testPoints)
      .where(and(eq(testPoints.orgId, orgId), eq(testPoints.id, id)));
    if (!existing) return reply.code(404).send({ error: "test point not found" });

    const userId = await resolveUserId(req);
    await recordKnowledgeRevision(orgId, "test_point", id, existing as never, userId, "update");

    const [updated] = await db
      .update(testPoints)
      .set({
        component: (body.component as string | undefined) ?? undefined,
        board: (body.board as string | undefined) ?? undefined,
        connector: (body.connector as string | undefined) ?? undefined,
        pin: (body.pin as string | undefined) ?? undefined,
        description: (body.description as string | undefined) ?? undefined,
        expectedMin: (body.expectedMin as string | undefined) ?? undefined,
        expectedMax: (body.expectedMax as string | undefined) ?? undefined,
        expectedExact: (body.expectedExact as string | undefined) ?? undefined,
        unit: (body.unit as string | undefined) ?? undefined,
        warning: (body.warning as string | undefined) ?? undefined,
      })
      .where(and(eq(testPoints.orgId, orgId), eq(testPoints.id, id)))
      .returning();
    await invalidateModelCache(orgId, updated.equipmentModelId);
    return updated;
  });

  // ── Model Parts ─────────────────────────────────────────────────────
  app.get("/parts", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId } = req.query as { equipmentModelId?: string };
    const conditions = [eq(modelParts.orgId, orgId)];
    if (equipmentModelId) conditions.push(eq(modelParts.equipmentModelId, equipmentModelId));
    return db.select().from(modelParts).where(and(...conditions));
  });

  app.post("/parts", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const body = req.body as Record<string, unknown>;
    const userId = await resolveUserId(req);
    const [part] = await db
      .insert(modelParts)
      .values({
        orgId,
        equipmentModelId: body.equipmentModelId as string,
        catalogItemId: body.catalogItemId as string | undefined,
        partName: body.partName as string,
        oemPartNumber: body.oemPartNumber as string | undefined,
        manufacturer: body.manufacturer as string | undefined,
        alternativePartNumber: body.alternativePartNumber as string | undefined,
        specifications: (body.specifications as Record<string, unknown>) ?? {},
        reliabilityNotes: body.reliabilityNotes as string | undefined,
        lastKnownPriceCents: body.lastKnownPriceCents as number | undefined,
        compatibleModelIds: (body.compatibleModelIds as string[]) ?? [],
        createdBy: userId,
      })
      .returning();
    await invalidateModelCache(orgId, part.equipmentModelId);
    return reply.code(201).send(part);
  });

  app.patch("/parts/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const [existing] = await db
      .select()
      .from(modelParts)
      .where(and(eq(modelParts.orgId, orgId), eq(modelParts.id, id)));
    if (!existing) return reply.code(404).send({ error: "part not found" });

    const userId = await resolveUserId(req);
    await recordKnowledgeRevision(orgId, "model_part", id, existing as never, userId, "update");

    const [updated] = await db
      .update(modelParts)
      .set({
        partName: (body.partName as string | undefined) ?? undefined,
        oemPartNumber: (body.oemPartNumber as string | undefined) ?? undefined,
        manufacturer: (body.manufacturer as string | undefined) ?? undefined,
        alternativePartNumber: (body.alternativePartNumber as string | undefined) ?? undefined,
        specifications: (body.specifications as Record<string, unknown> | undefined) ?? undefined,
        reliabilityNotes: (body.reliabilityNotes as string | undefined) ?? undefined,
        lastKnownPriceCents: (body.lastKnownPriceCents as number | undefined) ?? undefined,
        compatibleModelIds: (body.compatibleModelIds as string[] | undefined) ?? undefined,
        tags: (body.tags as string[] | undefined) ?? undefined,
        updatedAt: new Date(),
      })
      .where(and(eq(modelParts.orgId, orgId), eq(modelParts.id, id)))
      .returning();
    await invalidateModelCache(orgId, updated.equipmentModelId);
    return updated;
  });

  app.post("/parts/:id/rate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [updated] = await db
      .update(modelParts)
      .set({ usefulCount: sql`${modelParts.usefulCount} + 1`, updatedAt: new Date() })
      .where(and(eq(modelParts.orgId, orgId), eq(modelParts.id, id)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "part not found" });
    await counterIncr(`rb:org:${orgId}:trending:helpful:part`, id);
    await invalidateModelCache(orgId, updated.equipmentModelId);
    return updated;
  });

  app.get("/parts/:id/procurement", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    return db
      .select()
      .from(partProcurementRecords)
      .where(and(eq(partProcurementRecords.orgId, orgId), eq(partProcurementRecords.modelPartId, id)))
      .orderBy(desc(partProcurementRecords.purchasedAt));
  });

  app.post("/parts/:id/procurement", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const body = req.body as { supplierName: string; costCents: number; quantity?: number; jobId?: string };
    const userId = await resolveUserId(req);
    const [record] = await db
      .insert(partProcurementRecords)
      .values({
        orgId,
        modelPartId: id,
        supplierName: body.supplierName,
        costCents: body.costCents,
        quantity: body.quantity ?? 1,
        jobId: body.jobId,
        requestedBy: userId,
      })
      .returning();
    return reply.code(201).send(record);
  });

  // ── Repair Outcomes ─────────────────────────────────────────────────
  app.get("/outcomes", async (req) => {
    const orgId = await resolveOrgId(req);
    const { jobId, equipmentId, equipmentModelId } = req.query as {
      jobId?: string;
      equipmentId?: string;
      equipmentModelId?: string;
    };
    const conditions = [eq(repairOutcomes.orgId, orgId)];
    if (jobId) conditions.push(eq(repairOutcomes.jobId, jobId));
    if (equipmentId) conditions.push(eq(repairOutcomes.equipmentId, equipmentId));
    if (equipmentModelId) conditions.push(eq(repairOutcomes.equipmentModelId, equipmentModelId));
    return db.select().from(repairOutcomes).where(and(...conditions)).orderBy(desc(repairOutcomes.createdAt));
  });

  app.post("/outcomes", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = repairOutcomeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);

    const [outcome] = await db
      .insert(repairOutcomes)
      .values({
        orgId,
        ...parsed.data,
        partsUsed: parsed.data.partsUsed ?? [],
        followUpNeeded: parsed.data.followUpNeeded ?? false,
        isFailedAttempt: parsed.data.isFailedAttempt ?? false,
        technicianId: userId,
      })
      .returning();

    if (parsed.data.knownFaultId && parsed.data.outcome === "successful" && !parsed.data.isFailedAttempt) {
      const successCount = await countSuccessfulRepairsForFault(orgId, parsed.data.knownFaultId);
      if (successCount >= 3) {
        const [fault] = await db
          .select()
          .from(knownFaults)
          .where(eq(knownFaults.id, parsed.data.knownFaultId));
        if (fault) {
          const promoted = autoPromoteConfidenceAfterSuccess(fault.confidenceStatus as never);
          await db
            .update(knownFaults)
            .set({
              confidenceStatus: promoted,
              updatedAt: new Date(),
            })
            .where(eq(knownFaults.id, parsed.data.knownFaultId));
        }
      }
    }

    return reply.code(201).send(outcome);
  });

  // ── Knowledge Proposals ─────────────────────────────────────────────
  app.get("/proposals", async (req) => {
    const orgId = await resolveOrgId(req);
    const { status } = req.query as { status?: string };
    const conditions = [eq(knowledgeProposals.orgId, orgId)];
    if (status) conditions.push(eq(knowledgeProposals.status, status as never));
    return db
      .select()
      .from(knowledgeProposals)
      .where(and(...conditions))
      .orderBy(desc(knowledgeProposals.createdAt));
  });

  app.post("/proposals", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = proposalSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const [proposal] = await db
      .insert(knowledgeProposals)
      .values({
        orgId,
        ...parsed.data,
        payload: parsed.data.payload ?? {},
        status: "proposed",
        proposedBy: userId,
      })
      .returning();
    return reply.code(201).send(proposal);
  });

  app.post("/proposals/:id/review", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const userId = await resolveUserId(req);
    const { notes } = req.body as { notes?: string };
    const proposal = await advanceProposalStatus(orgId, id, "reviewed", userId!, notes);
    if (!proposal) return reply.code(404).send({ error: "proposal not found" });
    return proposal;
  });

  app.post("/proposals/:id/verify", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const userId = await resolveUserId(req);
    const result = await materializeProposal(orgId, id, userId!);
    if (!result) return reply.code(404).send({ error: "proposal not found" });
    return result;
  });

  // ── Job-integrated workflow ─────────────────────────────────────────
  app.get("/jobs/:jobId/context", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { jobId } = req.params as { jobId: string };
    const context = await getJobRepairBrainContext(orgId, jobId);
    if (!context) return reply.code(404).send({ error: "job not found" });
    return context;
  });

  app.get("/faults/suggest", async (req) => {
    const orgId = await resolveOrgId(req);
    const { equipmentModelId, symptoms: symptomsParam } = req.query as {
      equipmentModelId?: string;
      symptoms?: string;
    };
    if (!equipmentModelId || !symptomsParam) return [];
    const labels = symptomsParam.split("|").map((s) => s.trim()).filter(Boolean);
    return suggestFaultsFromSymptoms(orgId, equipmentModelId, labels);
  });

  app.get("/faults/:id/workflows", async (req) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const rows = await getWorkflowsForFault(orgId, id);
    return rows.map((r) => r.workflow);
  });

  app.get("/jobs/:jobId/proposal-draft", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { jobId } = req.params as { jobId: string };
    const context = await getJobRepairBrainContext(orgId, jobId);
    if (!context) return reply.code(404).send({ error: "job not found" });

    const session = context.diagnosticSessions[0] ?? null;
    const knownFault = session?.knownFaultId
      ? context.knownFaults.find((f) => f.id === session.knownFaultId)
      : null;

    const draft = buildProposalDraft({
      jobId,
      equipmentId: context.equipment?.id,
      equipmentModelId: context.equipmentModel?.id,
      session: session
        ? {
            id: session.id,
            customerComplaint: session.customerComplaint,
            summary: session.summary,
            errorCodes: session.errorCodes as string[],
            knownFaultId: session.knownFaultId,
          }
        : null,
      outcomes: context.repairOutcomes.map((o) => ({
        outcome: o.outcome,
        whatWasDone: o.whatWasDone,
        partsUsed: o.partsUsed as never[],
        conclusion: o.conclusion,
        isFailedAttempt: o.isFailedAttempt,
      })),
      measurements: context.fieldMeasurements.map((m) => ({
        parameter: m.parameter,
        observedValue: m.observedValue,
        unit: m.unit,
        result: m.result,
        expectedMin: m.expectedMin,
        expectedMax: m.expectedMax,
      })),
      knownFault: knownFault ? { id: knownFault.id, title: knownFault.title, faultCode: knownFault.faultCode } : null,
    });

    if (context.repairOutcomes[0]) {
      draft.sourceRepairOutcomeId = context.repairOutcomes[0].id;
    }

    return draft;
  });

  app.post("/equipment/:equipmentId/link-model", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { equipmentId } = req.params as { equipmentId: string };
    const userId = await resolveUserId(req);
    const result = await linkEquipmentToModel(orgId, equipmentId, userId);
    if (!result) return reply.code(404).send({ error: "equipment not found" });
    if ("error" in result && result.error) return reply.code(400).send({ error: result.error });
    return reply.code(result.created ? 201 : 200).send(result);
  });

  // ── Equipment Instance Timeline ─────────────────────────────────────
  app.get("/instances/:equipmentId/timeline", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { equipmentId } = req.params as { equipmentId: string };
    const [instance] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, equipmentId)));
    if (!instance) return reply.code(404).send({ error: "equipment not found" });

    const [sessions, outcomes, measurements] = await Promise.all([
      db
        .select()
        .from(diagnosticSessions)
        .where(eq(diagnosticSessions.equipmentId, equipmentId))
        .orderBy(desc(diagnosticSessions.createdAt)),
      db
        .select()
        .from(repairOutcomes)
        .where(eq(repairOutcomes.equipmentId, equipmentId))
        .orderBy(desc(repairOutcomes.createdAt)),
      db
        .select()
        .from(fieldMeasurements)
        .where(eq(fieldMeasurements.orgId, orgId))
        .orderBy(desc(fieldMeasurements.recordedAt))
        .limit(50),
    ]);

    let model = null;
    if (instance.equipmentModelId) {
      const [m] = await db
        .select()
        .from(equipmentModels)
        .where(eq(equipmentModels.id, instance.equipmentModelId));
      model = m ?? null;
    }

    return { instance, model, diagnosticSessions: sessions, repairOutcomes: outcomes, recentMeasurements: measurements };
  });

  // ── Workflow linking ────────────────────────────────────────────────
  app.post("/workflows/:workflowId/link-model", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { workflowId } = req.params as { workflowId: string };
    const { equipmentModelId, knownFaultId } = req.body as {
      equipmentModelId: string;
      knownFaultId?: string;
    };
    const ext = await linkWorkflowToModel(orgId, workflowId, equipmentModelId, knownFaultId);
    return reply.code(201).send(ext);
  });

  // ── Revisions (audit) ───────────────────────────────────────────────
  app.get("/revisions/:entityType/:entityId", async (req) => {
    const orgId = await resolveOrgId(req);
    const { entityType, entityId } = req.params as { entityType: string; entityId: string };
    return db
      .select()
      .from(knowledgeRevisions)
      .where(
        and(
          eq(knowledgeRevisions.orgId, orgId),
          eq(knowledgeRevisions.entityType, entityType),
          eq(knowledgeRevisions.entityId, entityId),
        ),
      )
      .orderBy(desc(knowledgeRevisions.createdAt));
  });
}
