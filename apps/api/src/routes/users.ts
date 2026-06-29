import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db, users } from "@ofp/db";
import { resolveOrgId } from "./org.js";

const patchUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["owner", "dispatcher", "technician"]).optional(),
  active: z.boolean().optional(),
});

export async function userRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.active, true)))
      .orderBy(users.name);
  });

  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(users)
      .set(parsed.data)
      .where(and(eq(users.orgId, orgId), eq(users.id, id)))
      .returning({ id: users.id, email: users.email, name: users.name, role: users.role, active: users.active });
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  app.delete("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const { id } = req.params as { id: string };
    const [row] = await db
      .update(users)
      .set({ active: false })
      .where(and(eq(users.orgId, orgId), eq(users.id, id)))
      .returning({ id: users.id });
    if (!row) return reply.code(404).send({ error: "not found" });
    return reply.code(204).send();
  });
}
