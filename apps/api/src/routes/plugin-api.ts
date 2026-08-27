// Public plugin API surface (INBOUND). Authenticated by a per-install scoped
// token (Authorization: Bearer NNP…), NOT the owner JWT. This is the half of
// the foundation a real plugin calls to read OFP data. v1 ships the identity
// echo plus one scoped read so the auth + scope path is exercised end-to-end;
// resource coverage grows as plugins need it.
import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db, customers } from "@nnact/db";
import { requireToken } from "../plugins/auth.js";

export async function pluginApiRoutes(app: FastifyInstance) {
  // Identity echo — any valid token. Lets a plugin confirm its install context
  // and discover which scopes it was granted.
  app.get("/v1/me", { preHandler: requireToken() }, async (req) => {
    const auth = req.pluginAuth!;
    return { orgId: auth.orgId, installId: auth.installId, scopes: auth.scopes };
  });

  // Scoped read — requires customers:read. Proves scope enforcement against a
  // real, org-scoped resource.
  app.get("/v1/customers", { preHandler: requireToken(["customers:read"]) }, async (req) => {
    const auth = req.pluginAuth!;
    return db
      .select({ id: customers.id, name: customers.name, email: customers.email, phone: customers.phone })
      .from(customers)
      .where(eq(customers.orgId, auth.orgId))
      .limit(100);
  });
}
