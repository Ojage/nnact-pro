import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
} from "@ofp/db";
import { deriveStatusAfterMeasurement, shouldSuspendWorkflow, type DiagnosticSessionStatus } from "../diagnostics.js";
import { resolveOrgId } from "./org.js";

const measurementOp = z.object({
  opId: z.string().min(1).max(100),
  kind: z.literal("measurement.create"),
  payload: z.object({
    id: z.string().uuid(),
    sessionId: z.string().uuid(),
    stepId: z.string().uuid(),
    valueText: z.string().optional(),
    unit: z.string().optional(),
    result: z.enum(["pass", "fail", "within_range", "out_of_range", "unable", "not_reproduced"]),
    note: z.string().optional(),
    unableReason: z.string().optional(),
    recordedAt: z.string().datetime().optional(),
  }),
});

const sessionPatchOp = z.object({
  opId: z.string().min(1).max(100),
  kind: z.literal("session.patch"),
  payload: z.object({
    sessionId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
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
  }),
});

const correctionOp = z.object({
  opId: z.string().min(1).max(100),
  kind: z.literal("correction.create"),
  payload: z.object({
    id: z.string().uuid(),
    workflowId: z.string().uuid(),
    workflowVersion: z.number().int().positive(),
    sessionId: z.string().uuid().optional(),
    stepId: z.string().uuid().optional(),
    category: z.string().min(1),
    severity: z.enum(["low", "medium", "high", "safety_critical"]).default("medium"),
    description: z.string().min(1),
  }),
});

const batchSchema = z.object({
  ops: z.array(z.discriminatedUnion("kind", [measurementOp, sessionPatchOp, correctionOp])).min(1).max(200),
});

type OfflineOp = z.infer<typeof batchSchema>["ops"][number];

type OfflineResult = {
  opId: string;
  ok: boolean;
  conflict?: { currentVersion: number };
  error?: string;
};

async function loadPackage(orgId: string, jobId: string) {
  const [job] = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, jobId)));
  if (!job) return null;

  const [link] = await db
    .select({ link: jobEquipmentLinks, equipment })
    .from(jobEquipmentLinks)
    .innerJoin(equipment, eq(jobEquipmentLinks.equipmentId, equipment.id))
    .where(and(eq(jobEquipmentLinks.orgId, orgId), eq(jobEquipmentLinks.jobId, jobId)));

  if (!link) {
    return {
      packageVersion: 1,
      generatedAt: new Date().toISOString(),
      job,
      equipment: null,
      session: null,
      workflow: null,
      steps: [],
      measurements: [],
      supportState: "identification_required" as const,
      downloadReady: false,
    };
  }

  const [session] = await db
    .select()
    .from(diagnosticSessions)
    .where(and(eq(diagnosticSessions.orgId, orgId), eq(diagnosticSessions.jobId, jobId)))
    .orderBy(desc(diagnosticSessions.updatedAt))
    .limit(1);

  if (!session) {
    return {
      packageVersion: 1,
      generatedAt: new Date().toISOString(),
      job,
      equipment: link.equipment,
      session: null,
      workflow: null,
      steps: [],
      measurements: [],
      supportState: "workflow_selection_required" as const,
      downloadReady: false,
    };
  }

  const [workflow, measurements] = await Promise.all([
    session.workflowId
      ? db
          .select()
          .from(diagnosticWorkflows)
          .where(
            and(
              eq(diagnosticWorkflows.orgId, orgId),
              eq(diagnosticWorkflows.id, session.workflowId),
            ),
          )
          .then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    db
      .select()
      .from(diagnosticMeasurements)
      .where(
        and(
          eq(diagnosticMeasurements.orgId, orgId),
          eq(diagnosticMeasurements.sessionId, session.id),
        ),
      )
      .orderBy(asc(diagnosticMeasurements.recordedAt)),
  ]);

  if (!workflow) {
    return {
      packageVersion: 1,
      generatedAt: new Date().toISOString(),
      job,
      equipment: link.equipment,
      session,
      workflow: null,
      steps: [],
      measurements,
      supportState: "unsupported" as const,
      downloadReady: false,
    };
  }

  const steps = await db
    .select()
    .from(diagnosticSteps)
    .where(
      and(
        eq(diagnosticSteps.orgId, orgId),
        eq(diagnosticSteps.workflowId, workflow.id),
      ),
    )
    .orderBy(asc(diagnosticSteps.sequence));

  const routes = steps.length
    ? await db
        .select()
        .from(traceRoutes)
        .where(
          and(
            eq(traceRoutes.orgId, orgId),
            inArray(
              traceRoutes.stepId,
              steps.map((step) => step.id),
            ),
          ),
        )
    : [];

  const supportState =
    workflow.lifecycleStatus === "suspended"
      ? "suspended"
      : workflow.lifecycleStatus === "published"
        ? workflow.supportStatus
        : workflow.lifecycleStatus === "pilot"
          ? "pilot"
          : "experimental";

  return {
    packageVersion: 1,
    generatedAt: new Date().toISOString(),
    job,
    equipment: link.equipment,
    session,
    workflow,
    steps: steps.map((step) => ({
      ...step,
      routes: routes.filter((route) => route.stepId === step.id),
    })),
    measurements,
    supportState,
    downloadReady:
      workflow.lifecycleStatus !== "suspended" &&
      ["published", "pilot"].includes(workflow.lifecycleStatus),
  };
}

async function applyOfflineOp(orgId: string, op: OfflineOp): Promise<OfflineResult> {
  if (op.kind === "measurement.create") {
    const [session] = await db
      .select()
      .from(diagnosticSessions)
      .where(
        and(
          eq(diagnosticSessions.orgId, orgId),
          eq(diagnosticSessions.id, op.payload.sessionId),
        ),
      );
    if (!session) return { opId: op.opId, ok: false, error: "session not found" };

    const [step] = await db
      .select({ id: diagnosticSteps.id, workflowId: diagnosticSteps.workflowId })
      .from(diagnosticSteps)
      .where(
        and(
          eq(diagnosticSteps.orgId, orgId),
          eq(diagnosticSteps.id, op.payload.stepId),
        ),
      );
    if (!step || step.workflowId !== session.workflowId) {
      return { opId: op.opId, ok: false, error: "step does not belong to session workflow" };
    }

    await db
      .insert(diagnosticMeasurements)
      .values({
        ...op.payload,
        orgId,
        recordedAt: op.payload.recordedAt ? new Date(op.payload.recordedAt) : new Date(),
      })
      .onConflictDoNothing({ target: diagnosticMeasurements.id });

    const nextStatus = deriveStatusAfterMeasurement({
      currentStatus: session.status as DiagnosticSessionStatus,
      result: op.payload.result,
    });
    await db
      .update(diagnosticSessions)
      .set({
        status: nextStatus,
        version: sql`${diagnosticSessions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(diagnosticSessions.id, session.id));

    return { opId: op.opId, ok: true };
  }

  if (op.kind === "session.patch") {
    const { sessionId, baseVersion, ...patch } = op.payload;
    const updated = await db
      .update(diagnosticSessions)
      .set({
        ...patch,
        ...(patch.status === "completed" ? { completedAt: new Date() } : {}),
        version: sql`${diagnosticSessions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diagnosticSessions.orgId, orgId),
          eq(diagnosticSessions.id, sessionId),
          eq(diagnosticSessions.version, baseVersion),
        ),
      )
      .returning({ version: diagnosticSessions.version });

    if (updated.length === 0) {
      const [current] = await db
        .select({ version: diagnosticSessions.version })
        .from(diagnosticSessions)
        .where(
          and(eq(diagnosticSessions.orgId, orgId), eq(diagnosticSessions.id, sessionId)),
        );
      if (!current) return { opId: op.opId, ok: false, error: "session not found" };
      return { opId: op.opId, ok: false, conflict: { currentVersion: current.version } };
    }

    return { opId: op.opId, ok: true };
  }

  const [workflow] = await db
    .select({ id: diagnosticWorkflows.id })
    .from(diagnosticWorkflows)
    .where(
      and(
        eq(diagnosticWorkflows.orgId, orgId),
        eq(diagnosticWorkflows.id, op.payload.workflowId),
      ),
    );
  if (!workflow) return { opId: op.opId, ok: false, error: "workflow not found" };

  await db
    .insert(correctionReports)
    .values({ ...op.payload, orgId })
    .onConflictDoNothing({ target: correctionReports.id });

  if (shouldSuspendWorkflow(op.payload.severity)) {
    await db
      .update(diagnosticWorkflows)
      .set({ lifecycleStatus: "suspended", updatedAt: new Date() })
      .where(eq(diagnosticWorkflows.id, workflow.id));
  }

  return { opId: op.opId, ok: true };
}

export async function diagnosticOfflineRoutes(app: FastifyInstance) {
  app.get("/field-package/:jobId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { jobId } = req.params as { jobId: string };
    const payload = await loadPackage(orgId, jobId);
    if (!payload) return reply.code(404).send({ error: "job not found" });
    return payload;
  });

  app.post("/offline-batch", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = batchSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid offline batch", issues: parsed.error.issues });
    }

    const results: OfflineResult[] = [];
    for (const op of parsed.data.ops) {
      try {
        results.push(await applyOfflineOp(orgId, op));
      } catch (error) {
        req.log.error({ err: error, opId: op.opId }, "offline diagnostic operation failed");
        results.push({
          opId: op.opId,
          ok: false,
          error: error instanceof Error ? error.message : "unknown error",
        });
      }
    }
    return { results };
  });
}
