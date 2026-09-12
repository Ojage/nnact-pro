import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq, sql, count } from "drizzle-orm";
import {
  db,
  serviceVisits,
  serviceAgreements,
  customers,
  equipment,
  users,
} from "@nnact/db";
import {
  SERVICE_VISIT_STATUS,
  VISIT_TYPES,
  type ServiceVisitDTO,
  type ServiceVisitStatus,
} from "@nnact/shared";
import { resolveOrgId } from "./org.js";

const VISIT_PREFIX = "VISIT";

function padSeq(n: number): string {
  return String(n).padStart(6, "0");
}

async function nextVisitNumber(orgId: string): Promise<string> {
  const year = new Date().getUTCFullYear();
  const rows = await db
    .select({ c: count() })
    .from(serviceVisits)
    .where(
      and(
        eq(serviceVisits.orgId, orgId),
        sql`${serviceVisits.visitNumber} like ${`${VISIT_PREFIX}-${year}-%`}`,
      ),
    );
  return `${VISIT_PREFIX}-${year}-${padSeq((rows[0]?.c ?? 0) + 1)}`;
}

const createVisitBody = z.object({
  agreementId: z.string().uuid(),
  equipmentId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  visitType: z.enum(VISIT_TYPES).default("preventive"),
  scheduledAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  technicianId: z.string().uuid().nullable().optional(),
  activities: z.array(z.string()).default([]),
  notes: z.string().nullable().optional(),
});

const patchVisitBody = z.object({
  title: z.string().min(1).optional(),
  visitType: z.enum(VISIT_TYPES).optional(),
  status: z.enum(SERVICE_VISIT_STATUS).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  arrivedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  technicianId: z.string().uuid().nullable().optional(),
  equipmentId: z.string().uuid().nullable().optional(),
  activities: z.array(z.string()).optional(),
  problemsFound: z.array(z.string()).optional(),
  workPerformed: z.string().nullable().optional(),
  partsUsed: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        costCents: z.number().int().nonnegative(),
      }),
    )
    .optional(),
  recommendations: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const reportBody = z.object({
  problemsFound: z.array(z.string()).default([]),
  workPerformed: z.string().nullable().optional(),
  partsUsed: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().int().positive(),
        costCents: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  recommendations: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  complete: z.boolean().default(false),
});

function toDate(v?: string | null): Date | null | undefined {
  return v ? new Date(v) : v === null ? null : undefined;
}

function equipmentLabel(e: {
  type: string | null;
  make: string | null;
  model: string | null;
}): string {
  return [e.type, e.make, e.model].filter((v): v is string => Boolean(v)).join(" ");
}

export async function serviceVisitRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    const { agreementId, status } = req.query as { agreementId?: string; status?: string };
    const conds = [eq(serviceVisits.orgId, orgId)];
    if (agreementId) conds.push(eq(serviceVisits.agreementId, agreementId));
    if (status) conds.push(eq(serviceVisits.status, status as ServiceVisitStatus));

    const rows = await db
      .select({
        visit: serviceVisits,
        agreementNumber: serviceAgreements.agreementNumber,
        equipmentType: equipment.type,
        equipmentMake: equipment.make,
        equipmentModel: equipment.model,
        technicianName: users.name,
      })
      .from(serviceVisits)
      .innerJoin(serviceAgreements, eq(serviceAgreements.id, serviceVisits.agreementId))
      .leftJoin(equipment, eq(equipment.id, serviceVisits.equipmentId))
      .leftJoin(users, eq(users.id, serviceVisits.technicianId))
      .where(and(...conds))
      .orderBy(desc(serviceVisits.dueAt));

    return rows.map((r) => ({
      ...r.visit,
      agreementNumber: r.agreementNumber,
      equipmentName: equipmentLabel({
        type: r.equipmentType,
        make: r.equipmentMake,
        model: r.equipmentModel,
      }),
      technicianName: r.technicianName ?? null,
    })) as unknown as ServiceVisitDTO[];
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createVisitBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;

    const [agreement] = await db
      .select()
      .from(serviceAgreements)
      .where(and(eq(serviceAgreements.orgId, orgId), eq(serviceAgreements.id, data.agreementId)));
    if (!agreement) return reply.code(404).send({ error: "agreement not found" });

    const [row] = await db
      .insert(serviceVisits)
      .values({
        orgId,
        agreementId: data.agreementId,
        equipmentId: data.equipmentId,
        visitNumber: await nextVisitNumber(orgId),
        title: data.title,
        visitType: data.visitType,
        status: "scheduled",
        scheduledAt: toDate(data.scheduledAt) ?? undefined,
        dueAt: toDate(data.dueAt) ?? undefined,
        technicianId: data.technicianId,
        activities: data.activities,
        notes: data.notes,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(serviceVisits)
      .where(and(eq(serviceVisits.orgId, orgId), eq(serviceVisits.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchVisitBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;

    const [existing] = await db
      .select()
      .from(serviceVisits)
      .where(and(eq(serviceVisits.orgId, orgId), eq(serviceVisits.id, id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    const patch: Record<string, unknown> = {};
    for (const key of ["title", "visitType", "scheduledAt", "dueAt", "arrivedAt", "completedAt", "technicianId", "equipmentId", "activities", "problemsFound", "workPerformed", "partsUsed", "recommendations", "notes"] as const) {
      const val = data[key];
      if (val !== undefined) {
        patch[key] = (key === "scheduledAt" || key === "dueAt" || key === "arrivedAt" || key === "completedAt")
          ? toDate(val as string | null)
          : val;
      }
    }

    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "completed" && existing.status !== "completed") {
        patch.completedAt = existing.completedAt ?? new Date();
        const [agreement] = await db
          .select()
          .from(serviceAgreements)
          .where(eq(serviceAgreements.id, existing.agreementId));
        if (agreement) {
          await db
            .update(serviceAgreements)
            .set({ visitsCompleted: (agreement.visitsCompleted ?? 0) + 1 })
            .where(eq(serviceAgreements.id, agreement.id));
        }
      }
      if (data.status === "in_progress" && !existing.arrivedAt) {
        patch.arrivedAt = new Date();
      }
      if (data.status === "rescheduled" && data.dueAt === undefined) {
        // client is expected to send a new dueAt/scheduledAt when rescheduling
      }
    }

    const [row] = await db
      .update(serviceVisits)
      .set(patch)
      .where(and(eq(serviceVisits.orgId, orgId), eq(serviceVisits.id, id)))
      .returning();
    return row;
  });

  app.post("/:id/report", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = reportBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;

    const [existing] = await db
      .select()
      .from(serviceVisits)
      .where(and(eq(serviceVisits.orgId, orgId), eq(serviceVisits.id, id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    const patch: Record<string, unknown> = {
      problemsFound: data.problemsFound,
      workPerformed: data.workPerformed,
      partsUsed: data.partsUsed,
      recommendations: data.recommendations,
      notes: data.notes,
    };

    if (data.complete && existing.status !== "completed") {
      patch.status = "completed";
      patch.completedAt = existing.completedAt ?? new Date();
      const [agreement] = await db
        .select()
        .from(serviceAgreements)
        .where(eq(serviceAgreements.id, existing.agreementId));
      if (agreement) {
        await db
          .update(serviceAgreements)
          .set({ visitsCompleted: (agreement.visitsCompleted ?? 0) + 1 })
          .where(eq(serviceAgreements.id, agreement.id));
      }
    }

    const [row] = await db
      .update(serviceVisits)
      .set(patch)
      .where(and(eq(serviceVisits.orgId, orgId), eq(serviceVisits.id, id)))
      .returning();
    return row;
  });
}