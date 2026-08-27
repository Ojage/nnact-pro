import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  activities,
  db,
  diagnosticMeasurements,
  diagnosticSessions,
  diagnosticSteps,
  diagnosticWorkflows,
  equipment,
  estimates,
  jobs,
} from "@nnact/db";
import { resolveOrgId } from "./org.js";

const completeSchema = z.object({
  disposition: z.string().min(1),
  summary: z.string().min(1),
  status: z.enum(["diagnosed", "inconclusive", "escalated", "completed"]).default("diagnosed"),
});

async function loadOutput(orgId: string, sessionId: string) {
  const [base] = await db
    .select({
      session: diagnosticSessions,
      job: jobs,
      equipment,
      workflow: diagnosticWorkflows,
    })
    .from(diagnosticSessions)
    .innerJoin(jobs, eq(diagnosticSessions.jobId, jobs.id))
    .innerJoin(equipment, eq(diagnosticSessions.equipmentId, equipment.id))
    .leftJoin(diagnosticWorkflows, eq(diagnosticSessions.workflowId, diagnosticWorkflows.id))
    .where(
      and(
        eq(diagnosticSessions.orgId, orgId),
        eq(diagnosticSessions.id, sessionId),
      ),
    );
  if (!base) return null;

  const readings = await db
    .select({
      measurement: diagnosticMeasurements,
      step: diagnosticSteps,
    })
    .from(diagnosticMeasurements)
    .innerJoin(diagnosticSteps, eq(diagnosticMeasurements.stepId, diagnosticSteps.id))
    .where(
      and(
        eq(diagnosticMeasurements.orgId, orgId),
        eq(diagnosticMeasurements.sessionId, sessionId),
      ),
    )
    .orderBy(asc(diagnosticMeasurements.recordedAt));

  const appliance =
    [base.equipment.make, base.equipment.model].filter(Boolean).join(" ") ||
    base.equipment.type;
  const disposition = base.session.disposition || "Diagnostic work remains in progress.";
  const summary = base.session.summary || "No final technician summary has been recorded.";

  return {
    sessionId: base.session.id,
    jobId: base.job.id,
    technician: {
      appliance,
      serialNumber: base.equipment.serialNumber,
      complaint: base.session.customerComplaint,
      observation: base.session.technicianObservation,
      errorCodes: base.session.errorCodes,
      workflow: base.workflow
        ? {
            name: base.workflow.name,
            version: base.session.workflowVersion ?? base.workflow.versionNumber,
            supportStatus: base.workflow.supportStatus,
            sourceRevision: base.workflow.sourceRevision,
          }
        : null,
      readings: readings.map(({ measurement, step }) => ({
        check: step.publicLabel,
        points: [step.point1Label, step.point2Label].filter(
          (value): value is string => Boolean(value),
        ),
        operatingCondition: step.operatingCondition,
        expected: step.expectedText,
        actual:
          [measurement.valueText, measurement.unit].filter(Boolean).join(" ") ||
          measurement.result.replaceAll("_", " "),
        result: measurement.result,
        note: measurement.note,
        recordedAt: measurement.recordedAt,
      })),
      disposition,
      summary,
      status: base.session.status,
    },
    customer: {
      appliance,
      concern: base.session.customerComplaint || base.job.title,
      finding: summary,
      recommendation: disposition,
      limitation:
        base.session.status === "inconclusive"
          ? "The reported condition could not be isolated consistently enough to recommend a component responsibly."
          : base.session.status === "escalated"
            ? "Additional technical review is required before a repair recommendation is made."
            : null,
    },
  };
}

export async function diagnosticOutputRoutes(app: FastifyInstance) {
  app.get("/sessions/:id/output", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const output = await loadOutput(orgId, id);
    if (!output) return reply.code(404).send({ error: "diagnostic session not found" });
    return output;
  });

  app.post("/sessions/:id/complete", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const [session] = await db
      .update(diagnosticSessions)
      .set({
        disposition: parsed.data.disposition,
        summary: parsed.data.summary,
        status: parsed.data.status,
        ...(parsed.data.status === "completed" ? { completedAt: new Date() } : {}),
        version: sql`${diagnosticSessions.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(diagnosticSessions.orgId, orgId),
          eq(diagnosticSessions.id, id),
        ),
      )
      .returning();
    if (!session) return reply.code(404).send({ error: "diagnostic session not found" });

    await db.insert(activities).values({
      orgId,
      jobId: session.jobId,
      kind: "diagnostic.completed",
      summary: `Diagnostic disposition recorded: ${parsed.data.disposition}`,
    });

    return loadOutput(orgId, id);
  });

  app.post("/sessions/:id/estimate-handoff", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [session] = await db
      .select()
      .from(diagnosticSessions)
      .where(
        and(
          eq(diagnosticSessions.orgId, orgId),
          eq(diagnosticSessions.id, id),
        ),
      );
    if (!session) return reply.code(404).send({ error: "diagnostic session not found" });
    if (!["diagnosed", "completed"].includes(session.status)) {
      return reply.code(409).send({
        error: "a supported diagnosis must be recorded before creating an estimate handoff",
      });
    }
    if (!session.summary || !session.disposition) {
      return reply.code(409).send({
        error: "technician summary and disposition are required before estimate handoff",
      });
    }

    const [existing] = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.orgId, orgId), eq(estimates.jobId, session.jobId)));
    if (existing) return { estimate: existing, created: false };

    const [estimate] = await db
      .insert(estimates)
      .values({ orgId, jobId: session.jobId, total: 0, accepted: false })
      .returning();

    await db.insert(activities).values({
      orgId,
      jobId: session.jobId,
      kind: "estimate.created_from_diagnostic",
      summary: `Estimate draft created from diagnostic disposition: ${session.disposition}`,
    });

    return reply.code(201).send({ estimate, created: true });
  });
}
