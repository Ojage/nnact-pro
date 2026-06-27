import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { db, customers } from "@ofp/db";
import { resolveOrgId } from "./org.js";

const createBody = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

export async function customerRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select()
      .from(customers)
      .where(eq(customers.orgId, orgId))
      .orderBy(desc(customers.createdAt));
  });

  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.orgId, orgId), eq(customers.id, id)));
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .insert(customers)
      .values({ orgId, ...parsed.data })
      .returning();
    return reply.code(201).send(row);
  });
}
