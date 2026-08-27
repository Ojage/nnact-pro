import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
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
} from "../repair-brain.js";

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

export async function repairBrainRoutes(app: FastifyInstance) {
  // ── Search ──────────────────────────────────────────────────────────
  app.get("/search", async (req) => {
    const orgId = await resolveOrgId(req);
    const { q } = req.query as { q?: string };
    if (!q || q.trim().length < 2) {
      return { models: [], faults: [], parts: [], procedures: [], documents: [], repairHistory: [] };
    }
    return searchRepairBrain(orgId, q);
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
      model,
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
  });

  app.post("/models", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = modelCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const userId = await resolveUserId(req);
    const result = await upsertEquipmentModel(orgId, parsed.data, userId);
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
    return updated;
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

    return reply.code(201).send({ fault, similarExisting: similar });
  });

  app.get("/faults/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
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
    return fault;
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
        createdBy: userId,
      })
      .returning();
    return reply.code(201).send(procedure);
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
    return reply.code(201).send(point);
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
    return reply.code(201).send(part);
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
