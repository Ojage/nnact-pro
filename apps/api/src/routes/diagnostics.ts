import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import {
  correctionReports,
  db,
  diagnosticMeasurements,
  diagnosticSessions,
  diagnosticSteps,
  diagnosticWorkflows,
  equipment,
  jobEquipmentLinks,
  jobs,
  traceRoutes,
} from "@nnact/db";
import {
  deriveInitialDiagnosticStatus,
  deriveStatusAfterMeasurement,
  shouldSuspendWorkflow,
  validatePublishableStep,
  type DiagnosticSessionStatus,
} from "../diagnostics.js";
import { resolveOrgId } from "./org.js";
import {
  CUSTOM_VALUE,
  METER_MODES,
  OPERATING_CONDITIONS,
  POWER_STATES,
  PRODUCT_TYPES,
  ROUTE_KINDS,
  STEP_TEMPLATES,
  UNITS,
} from "../diagnostic-meta.js";

export const workflowProductTypes = PRODUCT_TYPES;
export const workflowRouteKinds = ROUTE_KINDS;

function resolveProductType(value: string | undefined, custom: string | undefined) {
  if (!value) return undefined;
  if (value === CUSTOM_VALUE) return custom?.trim() || undefined;
  return PRODUCT_TYPES.some((option) => option.value === value) ? value : undefined;
}

function resolveRouteKind(value: string | undefined, custom: string | undefined) {
  if (!value) return undefined;
  if (value === CUSTOM_VALUE) return custom?.trim() || undefined;
  return ROUTE_KINDS.some((option) => option.value === value) ? value : undefined;
}

const workflowCreateSchema = z.object({
  name: z.string().min(1),
  productType: z.string().min(1),
  productTypeLabel: z.string().optional(),
  make: z.string().optional(),
  modelFamily: z.string().optional(),
  sourceRevision: z.string().optional(),
  supportStatus: z.enum(["validated", "pilot", "experimental", "unsupported"]).optional(),
  lifecycleStatus: z
    .enum([
      "draft",
      "extracted",
      "needs_endpoint_review",
      "needs_route_review",
      "needs_electrical_review",
      "needs_field_review",
      "pilot",
      "validated",
      "published",
      "suspended",
      "retired",
    ])
    .optional(),
  applicability: z
    .object({
      models: z.array(z.string()).optional(),
      excludedModels: z.array(z.string()).optional(),
      notes: z.array(z.string()).optional(),
    })
    .optional(),
  limitations: z.array(z.string()).optional(),
});

const workflowPatchSchema = workflowCreateSchema.partial();

const stepCreateSchema = z.object({
  stepKey: z.string().min(1),
  publicLabel: z.string().min(1),
  sequence: z.number().int().nonnegative().optional(),
  mode: z.enum(["field", "guided", "both"]).optional(),
  stepType: z.enum(["check", "decision", "reference", "stop"]).optional(),
  purpose: z.string().optional(),
  safetyState: z.string().optional(),
  powerState: z.string().optional(),
  operatingCondition: z.string().optional(),
  meterMode: z.string().optional(),
  point1Label: z.string().optional(),
  point1Endpoint: z.string().optional(),
  point2Label: z.string().optional(),
  point2Endpoint: z.string().optional(),
  connector: z.string().optional(),
  pin: z.string().optional(),
  wireColor: z.string().optional(),
  expectedText: z.string().optional(),
  unit: z.string().optional(),
  passInterpretation: z.string().optional(),
  failInterpretation: z.string().optional(),
  branchRules: z.record(z.unknown()).optional(),
  sourceRefs: z.array(z.record(z.unknown())).optional(),
  accessibilityNote: z.string().optional(),
  validationStatus: z.enum(["unreviewed", "validated"]).optional(),
});

const stepPatchSchema = stepCreateSchema
  .omit({ stepKey: true })
  .partial()

const routeCreateSchema = z.object({
  label: z.string().min(1),
  routeKind: z.string().min(1),
  routeKindLabel: z.string().optional(),
  endpoint1: z.string().optional(),
  endpoint2: z.string().optional(),
  segmentIds: z.array(z.string()).optional(),
  continuityValid: z.boolean().optional(),
  disconnectedIslands: z.number().int().nonnegative().optional(),
  unintendedBranches: z.number().int().nonnegative().optional(),
  visualAuditStatus: z.enum(["pending", "passed", "failed"]).optional(),
  validationNotes: z.string().optional(),
});

const routePatchSchema = routeCreateSchema.partial();

const linkSchema = z.object({
  jobId: z.string().uuid(),
  equipmentId: z.string().uuid(),
});

const sessionCreateSchema = z.object({
  jobId: z.string().uuid(),
  equipmentId: z.string().uuid(),
  workflowId: z.string().uuid().optional(),
  knownFaultId: z.string().uuid().optional(),
  equipmentModelId: z.string().uuid().optional(),
  customerComplaint: z.string().optional(),
  technicianObservation: z.string().optional(),
  errorCodes: z.array(z.string()).optional(),
  serviceTests: z
    .array(z.object({ name: z.string(), result: z.string().optional(), note: z.string().optional() }))
    .optional(),
});

const sessionPatchSchema = z.object({
  status: z
    .enum([
      "not_started",
      "identification_required",
      "workflow_ready",
      "testing",
      "blocked",
      "inconclusive",
      "diagnosed",
      "escalated",
      "under_review",
      "completed",
    ])
    .optional(),
  customerComplaint: z.string().nullable().optional(),
  technicianObservation: z.string().nullable().optional(),
  errorCodes: z.array(z.string()).optional(),
  serviceTests: z
    .array(z.object({ name: z.string(), result: z.string().optional(), note: z.string().optional() }))
    .optional(),
  disposition: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  knownFaultId: z.string().uuid().nullable().optional(),
  equipmentModelId: z.string().uuid().nullable().optional(),
  workflowId: z.string().uuid().nullable().optional(),
});

const measurementCreateSchema = z.object({
  stepId: z.string().uuid(),
  valueText: z.string().optional(),
  unit: z.string().optional(),
  result: z.enum(["pass", "fail", "within_range", "out_of_range", "unable", "not_reproduced"]),
  note: z.string().optional(),
  photoId: z.string().uuid().optional(),
  unableReason: z.string().optional(),
});

const correctionCreateSchema = z.object({
  workflowId: z.string().uuid(),
  workflowVersion: z.number().int().positive(),
  sessionId: z.string().uuid().optional(),
  stepId: z.string().uuid().optional(),
  category: z.string().min(1),
  severity: z.enum(["low", "medium", "high", "safety_critical"]).optional(),
  description: z.string().min(1),
});

const correctionPatchSchema = z.object({
  status: z.enum(["open", "triaged", "in_review", "fixed", "rejected"]).optional(),
  rootCause: z.string().nullable().optional(),
  resolution: z.string().nullable().optional(),
});

async function getWorkflowBundle(orgId: string, workflowId: string) {
  const [workflow] = await db
    .select()
    .from(diagnosticWorkflows)
    .where(and(eq(diagnosticWorkflows.orgId, orgId), eq(diagnosticWorkflows.id, workflowId)));
  if (!workflow) return null;

  const steps = await db
    .select()
    .from(diagnosticSteps)
    .where(and(eq(diagnosticSteps.orgId, orgId), eq(diagnosticSteps.workflowId, workflowId)))
    .orderBy(asc(diagnosticSteps.sequence));

  const routes = steps.length
    ? await db
        .select()
        .from(traceRoutes)
        .where(and(eq(traceRoutes.orgId, orgId), inArray(traceRoutes.stepId, steps.map((step) => step.id))))
    : [];

  return {
    workflow,
    steps: steps.map((step) => ({
      ...step,
      routes: routes.filter((route) => route.stepId === step.id),
    })),
  };
}

interface WorkflowIssue {
  step: string;
  message: string;
}

function collectWorkflowIssues(bundle: NonNullable<Awaited<ReturnType<typeof getWorkflowBundle>>>): WorkflowIssue[] {
  const errors: WorkflowIssue[] = [];
  for (const step of bundle.steps) {
    for (const error of validatePublishableStep({
      publicLabel: step.publicLabel,
      stepType: step.stepType,
      meterMode: step.meterMode,
      point1Label: step.point1Label,
      point2Label: step.point2Label,
      operatingCondition: step.operatingCondition,
      expectedText: step.expectedText,
      validationStatus: step.validationStatus,
    })) {
      errors.push({ step: step.publicLabel, message: error });
    }

    if (step.stepType === "check") {
      if (step.routes.length === 0) errors.push({ step: step.publicLabel, message: "validated trace route is required" });
      for (const route of step.routes) {
        if (!route.continuityValid) errors.push({ step: step.publicLabel, message: "route continuity failed" });
        if (route.disconnectedIslands > 0) errors.push({ step: step.publicLabel, message: "disconnected islands detected" });
        if (route.unintendedBranches > 0) errors.push({ step: step.publicLabel, message: "unintended branches detected" });
        if (route.visualAuditStatus !== "passed") {
          errors.push({ step: step.publicLabel, message: "visual trace audit has not passed" });
        }
      }
    }
  }
  return errors;
}

export async function diagnosticRoutes(app: FastifyInstance) {
  app.get("/meta", async () => ({
    productTypes: PRODUCT_TYPES,
    routeKinds: ROUTE_KINDS,
    meterModes: METER_MODES,
    powerStates: POWER_STATES,
    operatingConditions: OPERATING_CONDITIONS,
    units: UNITS,
    stepTemplates: STEP_TEMPLATES,
  }));

  app.get("/workflows/:id/readiness", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const bundle = await getWorkflowBundle(orgId, id);
    if (!bundle) return reply.code(404).send({ error: "workflow not found" });
    const issues = collectWorkflowIssues(bundle);
    return { publishable: issues.length === 0, issues };
  });
  app.get("/overview", async (req) => {
    const orgId = await resolveOrgId(req);
    const [sessions, workflows, corrections] = await Promise.all([
      db.select().from(diagnosticSessions).where(eq(diagnosticSessions.orgId, orgId)),
      db.select().from(diagnosticWorkflows).where(eq(diagnosticWorkflows.orgId, orgId)),
      db.select().from(correctionReports).where(eq(correctionReports.orgId, orgId)),
    ]);

    const activeStatuses = new Set(["workflow_ready", "testing", "blocked", "escalated"]);
    return {
      activeSessions: sessions.filter((session) => activeStatuses.has(session.status)).length,
      blockedSessions: sessions.filter((session) => session.status === "blocked").length,
      unsupportedOrUnresolved: sessions.filter(
        (session) => session.status === "identification_required" || !session.workflowId,
      ).length,
      publishedWorkflows: workflows.filter((workflow) => workflow.lifecycleStatus === "published").length,
      pilotWorkflows: workflows.filter((workflow) => workflow.supportStatus === "pilot").length,
      openCorrections: corrections.filter((correction) =>
        ["open", "triaged", "in_review"].includes(correction.status),
      ).length,
      safetyCriticalCorrections: corrections.filter(
        (correction) =>
          correction.severity === "safety_critical" &&
          ["open", "triaged", "in_review"].includes(correction.status),
      ).length,
    };
  });

  app.get("/coverage", async (req) => {
    const orgId = await resolveOrgId(req);
    const [workflows, sessions] = await Promise.all([
      db
        .select()
        .from(diagnosticWorkflows)
        .where(eq(diagnosticWorkflows.orgId, orgId))
        .orderBy(desc(diagnosticWorkflows.updatedAt)),
      db
        .select()
        .from(diagnosticSessions)
        .where(eq(diagnosticSessions.orgId, orgId))
        .orderBy(desc(diagnosticSessions.createdAt)),
    ]);

    return {
      workflows,
      demand: {
        totalSessions: sessions.length,
        unsupportedOrUnresolved: sessions.filter(
          (session) => session.status === "identification_required" || !session.workflowId,
        ).length,
        blocked: sessions.filter((session) => session.status === "blocked").length,
        escalated: sessions.filter((session) => session.status === "escalated").length,
      },
    };
  });

  app.get("/workflows", async (req) => {
    const orgId = await resolveOrgId(req);
    const query = req.query as { lifecycleStatus?: string; supportStatus?: string };
    const conditions = [eq(diagnosticWorkflows.orgId, orgId)];
    if (query.lifecycleStatus) {
      conditions.push(eq(diagnosticWorkflows.lifecycleStatus, query.lifecycleStatus as never));
    }
    if (query.supportStatus) {
      conditions.push(eq(diagnosticWorkflows.supportStatus, query.supportStatus as never));
    }
    return db
      .select()
      .from(diagnosticWorkflows)
      .where(and(...conditions))
      .orderBy(desc(diagnosticWorkflows.updatedAt));
  });

  app.post("/workflows", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = workflowCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const productType = resolveProductType(parsed.data.productType, parsed.data.productTypeLabel);
    if (!productType) return reply.code(400).send({ error: "known product type or a custom productTypeLabel is required" });

    const { productTypeLabel: _label, ...rest } = parsed.data;
    const [row] = await db
      .insert(diagnosticWorkflows)
      .values({ orgId, ...rest, productType })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/workflows/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = workflowPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const exists = await db
      .select({ id: diagnosticWorkflows.id })
      .from(diagnosticWorkflows)
      .where(and(eq(diagnosticWorkflows.orgId, orgId), eq(diagnosticWorkflows.id, id)));
    if (exists.length === 0) return reply.code(404).send({ error: "workflow not found" });

    const { productType, productTypeLabel } = parsed.data;
    let resolvedProductType: string | undefined;
    if (productType !== undefined) {
      resolvedProductType = resolveProductType(productType, productTypeLabel);
      if (!resolvedProductType) {
        return reply.code(400).send({ error: "known product type or a custom productTypeLabel is required" });
      }
    }
    const { productTypeLabel: _label, ...rest } = parsed.data;

    const [row] = await db
      .update(diagnosticWorkflows)
      .set({ ...rest, ...(resolvedProductType ? { productType: resolvedProductType } : {}), updatedAt: new Date() })
      .where(and(eq(diagnosticWorkflows.orgId, orgId), eq(diagnosticWorkflows.id, id)))
      .returning();
    return row;
  });

  app.get("/workflows/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const bundle = await getWorkflowBundle(orgId, id);
    if (!bundle) return reply.code(404).send({ error: "workflow not found" });
    return bundle;
  });

  app.post("/workflows/:id/steps", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id: workflowId } = req.params as { id: string };
    const parsed = stepCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    if (parsed.data.stepKey) {
      const [existing] = await db
        .select({ id: diagnosticSteps.id })
        .from(diagnosticSteps)
        .where(and(eq(diagnosticSteps.orgId, orgId), eq(diagnosticSteps.workflowId, workflowId), eq(diagnosticSteps.stepKey, parsed.data.stepKey)));
      if (existing) return reply.code(409).send({ error: `step key "${parsed.data.stepKey}" already exists in this workflow` });
    }

    const [workflow] = await db
      .select({ id: diagnosticWorkflows.id })
      .from(diagnosticWorkflows)
      .where(and(eq(diagnosticWorkflows.orgId, orgId), eq(diagnosticWorkflows.id, workflowId)));
    if (!workflow) return reply.code(404).send({ error: "workflow not found" });

    const [row] = await db
      .insert(diagnosticSteps)
      .values({ orgId, workflowId, ...parsed.data })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/steps/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = stepPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [existing] = await db
      .select({ id: diagnosticSteps.id })
      .from(diagnosticSteps)
      .where(and(eq(diagnosticSteps.orgId, orgId), eq(diagnosticSteps.id, id)));
    if (!existing) return reply.code(404).send({ error: "step not found" });

    const [row] = await db
      .update(diagnosticSteps)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(diagnosticSteps.orgId, orgId), eq(diagnosticSteps.id, id)))
      .returning();
    return row;
  });

  app.delete("/steps/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const deleted = await db
      .delete(diagnosticSteps)
      .where(and(eq(diagnosticSteps.orgId, orgId), eq(diagnosticSteps.id, id)))
      .returning({ id: diagnosticSteps.id });
    if (deleted.length === 0) return reply.code(404).send({ error: "step not found" });
    return reply.code(204).send();
  });

  app.post("/steps/:stepId/routes", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { stepId } = req.params as { stepId: string };
    const parsed = routeCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const routeKind = resolveRouteKind(parsed.data.routeKind, parsed.data.routeKindLabel);
    if (!routeKind) return reply.code(400).send({ error: "known route kind or a custom routeKindLabel is required" });

    const [step] = await db
      .select({ id: diagnosticSteps.id })
      .from(diagnosticSteps)
      .where(and(eq(diagnosticSteps.orgId, orgId), eq(diagnosticSteps.id, stepId)));
    if (!step) return reply.code(404).send({ error: "step not found" });

    const { routeKindLabel: _label, ...rest } = parsed.data;
    const [row] = await db
      .insert(traceRoutes)
      .values({ orgId, stepId, ...rest, routeKind })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/steps/:stepId/routes/:routeId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { stepId, routeId } = req.params as { stepId: string; routeId: string };
    const parsed = routePatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [existing] = await db
      .select({ id: traceRoutes.id })
      .from(traceRoutes)
      .where(and(eq(traceRoutes.orgId, orgId), eq(traceRoutes.stepId, stepId), eq(traceRoutes.id, routeId)));
    if (!existing) return reply.code(404).send({ error: "route not found" });

    const { routeKind, routeKindLabel } = parsed.data;
    let resolvedRouteKind: string | undefined;
    if (routeKind !== undefined) {
      resolvedRouteKind = resolveRouteKind(routeKind, routeKindLabel);
      if (!resolvedRouteKind) {
        return reply.code(400).send({ error: "known route kind or a custom routeKindLabel is required" });
      }
    }
    const { routeKindLabel: _label, ...rest } = parsed.data;

    const [row] = await db
      .update(traceRoutes)
      .set({ ...rest, ...(resolvedRouteKind ? { routeKind: resolvedRouteKind } : {}) })
      .where(and(eq(traceRoutes.orgId, orgId), eq(traceRoutes.stepId, stepId), eq(traceRoutes.id, routeId)))
      .returning();
    return row;
  });

  app.delete("/steps/:stepId/routes/:routeId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { stepId, routeId } = req.params as { stepId: string; routeId: string };
    const deleted = await db
      .delete(traceRoutes)
      .where(and(eq(traceRoutes.orgId, orgId), eq(traceRoutes.stepId, stepId), eq(traceRoutes.id, routeId)))
      .returning({ id: traceRoutes.id });
    if (deleted.length === 0) return reply.code(404).send({ error: "route not found" });
    return reply.code(204).send();
  });

  app.post("/workflows/:id/publish", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const bundle = await getWorkflowBundle(orgId, id);
    if (!bundle) return reply.code(404).send({ error: "workflow not found" });

    const errors = collectWorkflowIssues(bundle);
    if (errors.length) return reply.code(409).send({ error: "workflow is not publishable", details: errors });

    const [row] = await db
      .update(diagnosticWorkflows)
      .set({
        lifecycleStatus: "published",
        supportStatus: "validated",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(diagnosticWorkflows.orgId, orgId), eq(diagnosticWorkflows.id, id)))
      .returning();
    return row;
  });

  app.post("/job-equipment", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = linkSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
    const [appliance] = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, parsed.data.equipmentId)));
    if (!job || !appliance) return reply.code(404).send({ error: "job or equipment not found" });

    const [row] = await db
      .insert(jobEquipmentLinks)
      .values({ orgId, ...parsed.data })
      .onConflictDoUpdate({
        target: jobEquipmentLinks.jobId,
        set: { equipmentId: parsed.data.equipmentId },
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.get("/job-equipment/:jobId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { jobId } = req.params as { jobId: string };
    const [row] = await db
      .select({ link: jobEquipmentLinks, equipment })
      .from(jobEquipmentLinks)
      .innerJoin(equipment, eq(jobEquipmentLinks.equipmentId, equipment.id))
      .where(and(eq(jobEquipmentLinks.orgId, orgId), eq(jobEquipmentLinks.jobId, jobId)));
    if (!row) return reply.code(404).send({ error: "job has no linked appliance" });
    return row;
  });

  app.get("/sessions", async (req) => {
    const orgId = await resolveOrgId(req);
    const query = req.query as { jobId?: string; equipmentId?: string; status?: string };
    const conditions = [eq(diagnosticSessions.orgId, orgId)];
    if (query.jobId) conditions.push(eq(diagnosticSessions.jobId, query.jobId));
    if (query.equipmentId) conditions.push(eq(diagnosticSessions.equipmentId, query.equipmentId));
    if (query.status) conditions.push(eq(diagnosticSessions.status, query.status as never));

    return db
      .select({
        session: diagnosticSessions,
        equipment,
        workflow: diagnosticWorkflows,
      })
      .from(diagnosticSessions)
      .innerJoin(equipment, eq(diagnosticSessions.equipmentId, equipment.id))
      .leftJoin(diagnosticWorkflows, eq(diagnosticSessions.workflowId, diagnosticWorkflows.id))
      .where(and(...conditions))
      .orderBy(desc(diagnosticSessions.updatedAt));
  });

  app.post("/sessions", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = sessionCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, parsed.data.jobId)));
    const [appliance] = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, parsed.data.equipmentId)));
    if (!job || !appliance) return reply.code(404).send({ error: "job or equipment not found" });

    let workflowVersion: number | undefined;
    if (parsed.data.workflowId) {
      const [workflow] = await db
        .select({ id: diagnosticWorkflows.id, versionNumber: diagnosticWorkflows.versionNumber })
        .from(diagnosticWorkflows)
        .where(
          and(
            eq(diagnosticWorkflows.orgId, orgId),
            eq(diagnosticWorkflows.id, parsed.data.workflowId),
          ),
        );
      if (!workflow) return reply.code(404).send({ error: "workflow not found" });
      workflowVersion = workflow.versionNumber;
    }

    await db
      .insert(jobEquipmentLinks)
      .values({ orgId, jobId: parsed.data.jobId, equipmentId: parsed.data.equipmentId })
      .onConflictDoUpdate({
        target: jobEquipmentLinks.jobId,
        set: { equipmentId: parsed.data.equipmentId },
      });

    const status = deriveInitialDiagnosticStatus({
      equipmentResolved: true,
      workflowId: parsed.data.workflowId,
    });

    const [row] = await db
      .insert(diagnosticSessions)
      .values({ orgId, ...parsed.data, workflowVersion, status })
      .returning();
    return reply.code(201).send(row);
  });

  app.get("/sessions/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [base] = await db
      .select({ session: diagnosticSessions, equipment, workflow: diagnosticWorkflows, job: jobs })
      .from(diagnosticSessions)
      .innerJoin(equipment, eq(diagnosticSessions.equipmentId, equipment.id))
      .innerJoin(jobs, eq(diagnosticSessions.jobId, jobs.id))
      .leftJoin(diagnosticWorkflows, eq(diagnosticSessions.workflowId, diagnosticWorkflows.id))
      .where(and(eq(diagnosticSessions.orgId, orgId), eq(diagnosticSessions.id, id)));
    if (!base) return reply.code(404).send({ error: "session not found" });

    const [measurements, bundle] = await Promise.all([
      db
        .select()
        .from(diagnosticMeasurements)
        .where(and(eq(diagnosticMeasurements.orgId, orgId), eq(diagnosticMeasurements.sessionId, id)))
        .orderBy(asc(diagnosticMeasurements.recordedAt)),
      base.workflow ? getWorkflowBundle(orgId, base.workflow.id) : Promise.resolve(null),
    ]);

    return { ...base, measurements, steps: bundle?.steps ?? [] };
  });

  app.patch("/sessions/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = sessionPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [row] = await db
      .update(diagnosticSessions)
      .set({
        ...parsed.data,
        ...(parsed.data.status === "completed" ? { completedAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(diagnosticSessions.orgId, orgId), eq(diagnosticSessions.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "session not found" });
    return row;
  });

  app.post("/sessions/:id/measurements", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id: sessionId } = req.params as { id: string };
    const parsed = measurementCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [session] = await db
      .select()
      .from(diagnosticSessions)
      .where(and(eq(diagnosticSessions.orgId, orgId), eq(diagnosticSessions.id, sessionId)));
    if (!session) return reply.code(404).send({ error: "session not found" });

    const [step] = await db
      .select({ id: diagnosticSteps.id, workflowId: diagnosticSteps.workflowId })
      .from(diagnosticSteps)
      .where(and(eq(diagnosticSteps.orgId, orgId), eq(diagnosticSteps.id, parsed.data.stepId)));
    if (!step || step.workflowId !== session.workflowId) {
      return reply.code(409).send({ error: "step does not belong to the session workflow" });
    }

    const [measurement] = await db
      .insert(diagnosticMeasurements)
      .values({ orgId, sessionId, ...parsed.data })
      .returning();

    const nextStatus = deriveStatusAfterMeasurement({
      currentStatus: session.status as DiagnosticSessionStatus,
      result: parsed.data.result,
    });
    await db
      .update(diagnosticSessions)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(eq(diagnosticSessions.id, sessionId));

    return reply.code(201).send({ measurement, sessionStatus: nextStatus });
  });

  app.get("/corrections", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select({ correction: correctionReports, workflow: diagnosticWorkflows })
      .from(correctionReports)
      .innerJoin(diagnosticWorkflows, eq(correctionReports.workflowId, diagnosticWorkflows.id))
      .where(eq(correctionReports.orgId, orgId))
      .orderBy(desc(correctionReports.createdAt));
  });

  app.post("/corrections", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = correctionCreateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [workflow] = await db
      .select({ id: diagnosticWorkflows.id })
      .from(diagnosticWorkflows)
      .where(
        and(
          eq(diagnosticWorkflows.orgId, orgId),
          eq(diagnosticWorkflows.id, parsed.data.workflowId),
        ),
      );
    if (!workflow) return reply.code(404).send({ error: "workflow not found" });

    const [row] = await db
      .insert(correctionReports)
      .values({ orgId, severity: "medium", ...parsed.data })
      .returning();

    if (shouldSuspendWorkflow(row.severity)) {
      await db
        .update(diagnosticWorkflows)
        .set({ lifecycleStatus: "suspended", updatedAt: new Date() })
        .where(eq(diagnosticWorkflows.id, row.workflowId));
    }

    return reply.code(201).send(row);
  });

  app.patch("/corrections/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = correctionPatchSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [row] = await db
      .update(correctionReports)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(correctionReports.orgId, orgId), eq(correctionReports.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "correction not found" });
    return row;
  });
}
