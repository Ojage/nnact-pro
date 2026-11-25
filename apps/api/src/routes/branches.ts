// Branches (organization > branch). Foundation only: lists the branches the
// signed-in user may work in. The organization comes from the verified
// session, never from the request; branch ids are readable project ids.
import type { FastifyInstance } from "fastify";
import { and, asc, eq } from "drizzle-orm";
import { branchMemberships, branches, db, orgs, users } from "@nnact/db";
import type { StaffJwtClaims } from "../auth.js";
import { verifiedClaims } from "../operational-authorization.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface BranchDTO {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface MyBranchesDTO {
  org: { id: string; name: string; shortName: string; publicId: string };
  branches: BranchDTO[];
  requestedBranchId: string | null;
  /** The branch this session works in. With one branch, it is that branch. */
  activeBranchId: string | null;
  /** Adding branches arrives with branch-scoped data; until then it is off. */
  canAddBranch: false;
}

/** Branches a user may use: all of the org's for owners and 'all' users, else their memberships. */
export async function branchesForUser(orgId: string, userId: string, role: string): Promise<BranchDTO[]> {
  const [user] = await db
    .select({ branchAccess: users.branchAccess })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
    .limit(1);
  const everything = role === "owner" || !user || user.branchAccess !== "specific";
  const rows = everything
    ? await db
        .select({ id: branches.publicId, name: branches.name, isDefault: branches.isDefault })
        .from(branches)
        .where(eq(branches.orgId, orgId))
        .orderBy(asc(branches.name))
    : await db
        .select({ id: branches.publicId, name: branches.name, isDefault: branches.isDefault })
        .from(branches)
        .innerJoin(branchMemberships, eq(branchMemberships.branchId, branches.id))
        .where(and(eq(branches.orgId, orgId), eq(branchMemberships.userId, userId)))
        .orderBy(asc(branches.name));
  // The default branch first, then by name.
  return rows.sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
}

export async function branchRoutes(app: FastifyInstance) {
  app.get("/branches/me", async (req, reply) => {
    const claims = (await verifiedClaims(req, reply)) as StaffJwtClaims | null;
    if (!claims || reply.sent) return;
    if (!UUID.test(claims.orgId)) return reply.code(401).send({ error: "sign in to see your branches" });
    const [org] = await db
      .select({ id: orgs.id, name: orgs.name, shortName: orgs.shortName, publicId: orgs.publicId })
      .from(orgs)
      .where(eq(orgs.id, claims.orgId))
      .limit(1);
    if (!org) return reply.code(404).send({ error: "organization not found" });
    const list = await branchesForUser(claims.orgId, claims.userId, claims.role);
    const query = req.query as { branch?: unknown };
    const requestedBranchId = typeof query.branch === "string" && query.branch.trim() ? query.branch.trim() : null;
    const activeBranchId =
      (requestedBranchId && list.some((branch) => branch.id === requestedBranchId) ? requestedBranchId : null) ??
      list.find((branch) => branch.isDefault)?.id ??
      list[0]?.id ??
      null;
    const body: MyBranchesDTO = {
      org: { ...org, shortName: org.shortName?.trim() || org.name },
      branches: list,
      requestedBranchId,
      activeBranchId,
      canAddBranch: false,
    };
    reply.header("cache-control", "no-store");
    return body;
  });
}
