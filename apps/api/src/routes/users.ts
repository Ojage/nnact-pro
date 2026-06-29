import type { FastifyInstance } from "fastify";
import { eq, and } from "drizzle-orm";
import { db, users } from "@ofp/db";
import { resolveOrgId } from "./org.js";

export async function userRoutes(app: FastifyInstance) {
  app.get("/", async (req) => {
    const orgId = await resolveOrgId(req);
    return db
      .select({
        id: users.id,
        orgId: users.orgId,
        email: users.email,
        name: users.name,
        role: users.role,
        active: users.active,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.active, true)));
  });
}
