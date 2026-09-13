// Finance domain referential-integrity checks. Every user-supplied FK is
// validated against the org before insert/update so finance records can never
// reference rows from another tenant (IDOR/tenant-isolation guard).

import { eq, and, inArray } from "drizzle-orm";
import { db, expenseCategories, costCenters, jobs, equipment, users } from "@nnact/db";

interface RefIds {
  categoryId?: string | null;
  costCenterId?: string | null;
  jobId?: string | null;
  equipmentId?: string | null;
  employeeId?: string | null;
}

interface ValidationOk {
  ok: true;
}

interface ValidationErr {
  ok: false;
  error: string;
}

export async function validateOrgIds(orgId: string, refs: RefIds): Promise<ValidationOk | ValidationErr> {
  if (refs.categoryId) {
    const [cat] = await db
      .select({ id: expenseCategories.id })
      .from(expenseCategories)
      .where(and(eq(expenseCategories.orgId, orgId), eq(expenseCategories.id, refs.categoryId)));
    if (!cat) return { ok: false, error: "categoryId does not exist in this org" };
  }
  if (refs.costCenterId) {
    const [cc] = await db
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(and(eq(costCenters.orgId, orgId), eq(costCenters.id, refs.costCenterId)));
    if (!cc) return { ok: false, error: "costCenterId does not exist in this org" };
  }
  if (refs.jobId) {
    const [job] = await db
      .select({ id: jobs.id })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.id, refs.jobId)));
    if (!job) return { ok: false, error: "jobId does not exist in this org" };
  }
  if (refs.equipmentId) {
    const [eqRow] = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(and(eq(equipment.orgId, orgId), eq(equipment.id, refs.equipmentId)));
    if (!eqRow) return { ok: false, error: "equipmentId does not exist in this org" };
  }
  if (refs.employeeId) {
    const [emp] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.id, refs.employeeId)));
    if (!emp) return { ok: false, error: "employeeId does not exist in this org" };
  }
  return { ok: true };
}