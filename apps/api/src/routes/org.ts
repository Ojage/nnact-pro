// Tenancy resolver. Phase 2: prefer the org_id from a verified JWT. Falls back
// to the `x-org-id` header and then the first org (dev convenience) so the
// existing customer/job routes keep working without a login during local dev.
// ponytail: header/first-org fallback is dev-only. Ceiling: do NOT ship with the
// fallback enabled in prod — gate it behind NODE_ENV !== "production".
import type { FastifyRequest } from "fastify";
import { db, orgs } from "@nnact/db";
import type { JwtClaims, StaffJwtClaims } from "../auth.js";
import { isStaffClaims } from "../auth.js";

export async function resolveOrgId(req: FastifyRequest): Promise<string> {
  try {
    await req.jwtVerify();
    if (!isStaffClaims(req.user)) {
      throw Object.assign(new Error("staff session required"), { statusCode: 401 });
    }
    const claims = req.user as StaffJwtClaims;
    if (claims.orgId) return claims.orgId;
  } catch {
    /* no/invalid token — fall through to dev fallbacks */
  }

  if (process.env.NODE_ENV === "production") {
    throw Object.assign(new Error("unauthorized"), { statusCode: 401 });
  }

  // 2. Dev fallbacks.
  const header = req.headers["x-org-id"];
  if (typeof header === "string" && header) return header;
  const [first] = await db.select({ id: orgs.id }).from(orgs).limit(1);
  if (!first) throw new Error("no org found — run `pnpm db:seed`");
  return first.id;
}
