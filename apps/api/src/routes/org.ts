// Phase-1 tenancy shim: resolve the active org from the `x-org-id` header, or
// fall back to the first org in the DB (the seeded demo). Real auth/JWT lands
// in Phase 2 — ponytail: single-tenant-by-default keeps the slice runnable now;
// upgrade path is to read org_id from the verified JWT instead of a header.
import type { FastifyRequest } from "fastify";
import { db, orgs } from "@ofp/db";

export async function resolveOrgId(req: FastifyRequest): Promise<string> {
  const header = req.headers["x-org-id"];
  if (typeof header === "string" && header) return header;
  const [first] = await db.select({ id: orgs.id }).from(orgs).limit(1);
  if (!first) throw new Error("no org found — run `pnpm db:seed`");
  return first.id;
}
