// Idempotent seeding of the NNACT recommended finance taxonomy into a single
// org. Never deletes or renames user-created records. Matches existing rows by
// exact name (the schema unique index is (org_id, name)); only missing names
// are inserted. Used by the production `seed-finance-setup` compose job.
import { eq, inArray, and } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { EXPENSE_DEFAULT_CATEGORIES, DEFAULT_COST_CENTERS } from "@nnact/shared";
import { expenseCategories, costCenters } from "../index.js";
import { NNACT_ORG_ID } from "./ids.js";

export type FinanceSetupSeedResult = {
  orgId: string;
  createdCategories: number;
  skippedCategories: number;
  createdCostCenters: number;
  skippedCostCenters: number;
};

export async function seedNnactFinanceSetup(
  db: PostgresJsDatabase,
): Promise<FinanceSetupSeedResult> {
  const orgId = NNACT_ORG_ID;

  // ── Expansion categories ──────────────────────────────────────────
  const existingCatRows = await db
    .select({ name: expenseCategories.name })
    .from(expenseCategories)
    .where(
      and(
        eq(expenseCategories.orgId, orgId),
        inArray(expenseCategories.name, [...EXPENSE_DEFAULT_CATEGORIES]),
      ),
    );
  const existingCatNames = new Set(existingCatRows.map((r) => r.name));

  const newCategories = [...EXPENSE_DEFAULT_CATEGORIES].filter(
    (name) => !existingCatNames.has(name),
  );

  if (newCategories.length > 0) {
    await db.insert(expenseCategories).values(
      newCategories.map((name) => ({
        orgId,
        name,
        createdBy: null,
      })),
    );
  }

  // ── Cost centers ──────────────────────────────────────────────────
  const centerNames = DEFAULT_COST_CENTERS.map((c) => c.name);
  const existingCenterRows = await db
    .select({ name: costCenters.name })
    .from(costCenters)
    .where(
      and(
        eq(costCenters.orgId, orgId),
        inArray(costCenters.name, centerNames),
      ),
    );
  const existingCenterNames = new Set(existingCenterRows.map((r) => r.name));

  const newCenters = DEFAULT_COST_CENTERS.filter(
    (c) => !existingCenterNames.has(c.name),
  );

  if (newCenters.length > 0) {
    await db.insert(costCenters).values(
      newCenters.map((c) => ({
        orgId,
        name: c.name,
        code: c.code,
        description: c.description ?? null,
        createdBy: null,
      })),
    );
  }

  return {
    orgId,
    createdCategories: newCategories.length,
    skippedCategories: existingCatNames.size,
    createdCostCenters: newCenters.length,
    skippedCostCenters: existingCenterNames.size,
  };
}