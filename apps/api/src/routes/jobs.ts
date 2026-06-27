import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, jobs } from "@ofp/db";
import { JOB_STATUS } from "@ofp/shared";
import { resolveOrgId } from "./org.js";

const createBody = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  status: z.enum(JOB_STATUS).optional(),
  scheduledAt: z.string().datetime().optional(),
  total: z.number().int().nonnegative().optional(),
  laborCostCents: z.number().int().nonnegative().optional().default(0),
});

const patchBody = z.object({
  status: z.enum(JOB_STATUS).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  assignedTo: z.string().uuid().nullable().optional(),
  total: z.number().int().nonnegative().optional(),
  laborCostCents: z.number().int().nonnegative().optional().default(0),
});

export async function jobRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select()
      .from(jobs)
      .where(eq(jobs.orgId, orgId))
      .orderBy(desc(jobs.createdAt));
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { scheduledAt, ...rest } = parsed.data;
    const [row] = await db
      .insert(jobs)
      .values({
        orgId,
        ...rest,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      })
      .returning();
    return reply.code(201).send(row);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { scheduledAt, ...rest } = parsed.data;
    const [row] = await db
      .update(jobs)
      .set({
        ...rest,
        ...(scheduledAt !== undefined
          ? { scheduledAt: scheduledAt ? new Date(scheduledAt) : null }
          : {}),
      })
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });
}
