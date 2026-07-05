import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  servicePlans,
  customerServicePlans,
  servicePlanVisits,
} from "@ofp/db";
import { resolveOrgId } from "./org.js";

const createPlanBody = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  includedVisitsPerTerm: z.number().int().min(0).default(2),
  termMonths: z.number().int().min(1).default(12),
  priceCents: z.number().int().min(0).default(0),
  priorityScheduling: z.boolean().default(false),
  benefits: z.array(z.string().min(1)).default([]),
  active: z.boolean().default(true),
});

const patchPlanBody = createPlanBody.partial();

const enrollBody = z.object({
  customerId: z.string().uuid(),
  servicePlanId: z.string().uuid(),
  startsAt: z.string().datetime(),
  renewsAt: z.string().datetime().optional(),
  renewalReminderAt: z.string().datetime().optional(),
  visitsIncluded: z.number().int().min(0).default(2),
  notes: z.string().optional(),
});

const patchEnrollmentBody = z.object({
  status: z.enum(["active", "paused", "canceled", "expired"]).optional(),
  renewsAt: z.string().datetime().nullable().optional(),
  renewalReminderAt: z.string().datetime().nullable().optional(),
  visitsIncluded: z.number().int().min(0).optional(),
  visitsCompleted: z.number().int().min(0).optional(),
  notes: z.string().nullable().optional(),
});

const createVisitBody = z.object({
  customerServicePlanId: z.string().uuid(),
  jobId: z.string().uuid().optional(),
  title: z.string().min(1),
  dueAt: z.string().datetime().optional(),
  notes: z.string().optional(),
});

const patchVisitBody = z.object({
  jobId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).optional(),
  status: z.enum(["planned", "scheduled", "completed", "skipped"]).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  notes: z.string().nullable().optional(),
});

function toDate(value?: string | null) {
  return value ? new Date(value) : value;
}

export async function servicePlanRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select()
      .from(servicePlans)
      .where(eq(servicePlans.orgId, orgId))
      .orderBy(desc(servicePlans.createdAt));
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createPlanBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db.insert(servicePlans).values({ orgId, ...parsed.data }).returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchPlanBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(servicePlans)
      .set(parsed.data)
      .where(and(eq(servicePlans.orgId, orgId), eq(servicePlans.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.get("/enrollments", async (req) => {
    const orgId = await resolveOrgId(req);
    const { customerId } = req.query as { customerId?: string };
    const where = customerId
      ? and(eq(customerServicePlans.orgId, orgId), eq(customerServicePlans.customerId, customerId))
      : eq(customerServicePlans.orgId, orgId);
    return db
      .select()
      .from(customerServicePlans)
      .where(where)
      .orderBy(desc(customerServicePlans.createdAt));
  });

  app.post("/enrollments", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = enrollBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;
    const [row] = await db
      .insert(customerServicePlans)
      .values({
        orgId,
        customerId: data.customerId,
        servicePlanId: data.servicePlanId,
        startsAt: new Date(data.startsAt),
        renewsAt: toDate(data.renewsAt) as Date | undefined,
        renewalReminderAt: toDate(data.renewalReminderAt) as Date | undefined,
        visitsIncluded: data.visitsIncluded,
        notes: data.notes,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/enrollments/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchEnrollmentBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;
    const [row] = await db
      .update(customerServicePlans)
      .set({
        ...data,
        renewsAt: toDate(data.renewsAt) as Date | null | undefined,
        renewalReminderAt: toDate(data.renewalReminderAt) as Date | null | undefined,
      })
      .where(and(eq(customerServicePlans.orgId, orgId), eq(customerServicePlans.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.get("/visits", async (req) => {
    const orgId = await resolveOrgId(req);
    const { customerServicePlanId } = req.query as { customerServicePlanId?: string };
    const where = customerServicePlanId
      ? and(eq(servicePlanVisits.orgId, orgId), eq(servicePlanVisits.customerServicePlanId, customerServicePlanId))
      : eq(servicePlanVisits.orgId, orgId);
    return db
      .select()
      .from(servicePlanVisits)
      .where(where)
      .orderBy(desc(servicePlanVisits.createdAt));
  });

  app.post("/visits", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createVisitBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;
    const [row] = await db
      .insert(servicePlanVisits)
      .values({
        orgId,
        customerServicePlanId: data.customerServicePlanId,
        jobId: data.jobId,
        title: data.title,
        dueAt: toDate(data.dueAt) as Date | undefined,
        notes: data.notes,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/visits/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchVisitBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const data = parsed.data;
    const [row] = await db
      .update(servicePlanVisits)
      .set({
        ...data,
        dueAt: toDate(data.dueAt) as Date | null | undefined,
        completedAt: toDate(data.completedAt) as Date | null | undefined,
      })
      .where(and(eq(servicePlanVisits.orgId, orgId), eq(servicePlanVisits.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
