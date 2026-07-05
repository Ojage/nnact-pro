import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, orgs } from "@ofp/db";
import { resolveOrgId } from "./org.js";

const patchBody = z.object({
  name: z.string().min(1).optional(),
  timezone: z.string().min(1).optional(),
  logoUrl: z.string().url().nullable().optional(),
  brandColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  documentFooter: z.string().nullable().optional(),
  publicEmail: z.string().email().nullable().optional(),
  publicPhone: z.string().nullable().optional(),
  publicAddress: z.string().nullable().optional(),
  removeOpenFieldProAttribution: z.boolean().optional(),
});

export async function orgSettingsRoutes(app: FastifyInstance) {
  app.get("/me", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const [row] = await db.select().from(orgs).where(eq(orgs.id, orgId));
    if (!row) return reply.code(404).send({ error: "organization not found" });
    return row;
  });

  app.patch("/me", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [row] = await db
      .update(orgs)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(orgs.id, orgId))
      .returning();
    if (!row) return reply.code(404).send({ error: "organization not found" });
    return row;
  });
}
