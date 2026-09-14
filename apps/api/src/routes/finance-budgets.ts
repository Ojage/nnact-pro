import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql, eq, and, inArray, gte, lt, isNull } from "drizzle-orm";
import {
  db,
  budgets,
  budgetLines,
  expenseCategories,
  costCenters,
  expenses,
  supplierBills,
  billPayments,
  pettyCashTransactions,
} from "@nnact/db";
import type { BudgetDTO } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { isOfficeRole, officeWriter } from "../finance-utils.js";
import { safeEmitActivity } from "../activities.js";

const lineSchema = z.object({
  categoryId: z.string().uuid().optional().nullable(),
  plannedCents: z.number().int().min(0).max(999_999_999),
});

const upsertBody = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM"),
  label: z.string().trim().max(120).optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Range query bounds for a YYYY-MM period. */
export function periodRange(period: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

interface LineActual {
  categoryId: string | null;
  actualCents: number;
}

/** PAID expenses + bill payments + petty-cash expenses attributed in a period. */
async function actualForPeriod(
  orgId: string,
  period: string,
  costCenterId: string | null,
): Promise<Map<string | null, number>> {
  const range = periodRange(period);
  if (!range) return new Map();
  const map = new Map<string | null, number>();
  const add = (key: string | null, cents: number) => {
    if (cents <= 0) return;
    map.set(key, (map.get(key) ?? 0) + cents);
  };

  const expConds = [
    eq(expenses.orgId, orgId),
    eq(expenses.status, "PAID"),
    gte(expenses.paidAt, range.start),
    lt(expenses.paidAt, range.end),
  ];
  if (costCenterId) expConds.push(eq(expenses.costCenterId, costCenterId));
  for (const row of await db
    .select({ categoryId: expenses.categoryId, costCenterId: expenses.costCenterId, amountCents: expenses.amountCents, momoFeeCents: expenses.momoFeeCents })
    .from(expenses)
    .where(and(...expConds))) {
    add(row.categoryId, row.amountCents + row.momoFeeCents);
  }
  void costCenterId;

  // Bill payments attributed by the bill's category.
  const billPayRows = await db
    .select({
      categoryId: supplierBills.categoryId,
      amountCents: billPayments.amountCents,
      paidAt: billPayments.paidAt,
    })
    .from(billPayments)
    .innerJoin(supplierBills, eq(supplierBills.id, billPayments.billId))
    .where(
      and(
        eq(billPayments.orgId, orgId),
        eq(supplierBills.orgId, orgId),
        gte(billPayments.paidAt, range.start),
        lt(billPayments.paidAt, range.end),
      ),
    );
  for (const row of billPayRows) add(row.categoryId, row.amountCents);

  // Petty cash expenses attributed by category + optional cost center.
  const conds = [
    eq(pettyCashTransactions.orgId, orgId),
    eq(pettyCashTransactions.kind, "EXPENSE"),
    gte(pettyCashTransactions.happenedAt, range.start),
    lt(pettyCashTransactions.happenedAt, range.end),
  ];
  for (const row of await db
    .select({ categoryId: pettyCashTransactions.categoryId, amountCents: pettyCashTransactions.amountCents })
    .from(pettyCashTransactions)
    .where(and(...conds))) {
    add(row.categoryId, row.amountCents);
  }

  return map;
}

export async function hydrateBudgets(orgId: string, period?: string): Promise<BudgetDTO[]> {
  const conds = [eq(budgets.orgId, orgId)];
  if (period) conds.push(eq(budgets.period, period));
  const rows = await db.select().from(budgets).where(and(...conds)).orderBy(sql`${budgets.period} desc`);
  if (!rows.length) return [];

  const centerIds = new Set(rows.map((r) => r.costCenterId).filter(Boolean) as string[]);
  const centers = centerIds.size
    ? await db.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(inArray(costCenters.id, [...centerIds]))
    : [];
  const centerName = new Map(centers.map((c) => [c.id, c.name]));
  const categoryRows = await db
    .select({ id: expenseCategories.id, name: expenseCategories.name })
    .from(expenseCategories)
    .where(eq(expenseCategories.orgId, orgId));
  const categoryName = new Map(categoryRows.map((c) => [c.id, c.name]));

  const out: BudgetDTO[] = [];
  for (const row of rows) {
    const [lines] = await Promise.all([
      db.select().from(budgetLines).where(eq(budgetLines.budgetId, row.id)),
    ]);
    const actualMap = await actualForPeriod(orgId, row.period, row.costCenterId);
    let totalPlanned = 0;
    let totalActual = 0;
    const lineDTOs = lines.map((l) => {
      const actual = actualMap.get(l.categoryId) ?? 0;
      totalPlanned += l.plannedCents;
      totalActual += actual;
      const usedPercent = l.plannedCents > 0 ? Math.round((actual / l.plannedCents) * 1000) / 10 : actual > 0 ? 100 : 0;
      const level: "ok" | "warning" | "critical" =
        l.plannedCents > 0 && actual >= l.plannedCents ? "critical" : usedPercent >= 80 ? "warning" : "ok";
      return {
        id: l.id,
        categoryId: l.categoryId,
        categoryName: l.categoryId ? categoryName.get(l.categoryId) ?? null : null,
        plannedCents: l.plannedCents,
        actualCents: actual,
        remainingCents: Math.max(0, l.plannedCents - actual),
        usedPercent,
        level,
      };
    });
    const totalUsed = totalPlanned > 0 ? Math.round((totalActual / totalPlanned) * 1000) / 10 : 0;
    out.push({
      id: row.id,
      period: row.period,
      label: row.label,
      costCenterId: row.costCenterId,
      costCenterName: row.costCenterId ? centerName.get(row.costCenterId) ?? null : null,
      totalPlannedCents: totalPlanned,
      totalActualCents: totalActual,
      totalUsedPercent: totalUsed,
      lines: lineDTOs,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return out;
}

/**
 * Advisory budget guard evaluated when a spend is created. Non-blocking:
 * surfaces "warning" (>80%) / "critical" (≥100%) so the UI can warn without
 * the over-engineered refusal path the spec allows to be configurable.
 */
export async function budgetGuard(
  orgId: string,
  input: { categoryId?: string | null; costCenterId?: string | null; amountCents?: number },
): Promise<{ level: "ok" | "warning" | "critical"; budgetId?: string; usedPercent?: number }> {
  const key = monthKey(new Date());
  const [budget] = await db
    .select()
    .from(budgets)
    .where(
      and(
        eq(budgets.orgId, orgId),
        eq(budgets.period, key),
        input.costCenterId ? eq(budgets.costCenterId, input.costCenterId) : undefined,
      ),
    )
    .limit(1);
  if (!budget) return { level: "ok" };

  const lines = input.categoryId
    ? await db.select().from(budgetLines).where(and(eq(budgetLines.budgetId, budget.id), eq(budgetLines.categoryId, input.categoryId)))
    : await db.select().from(budgetLines).where(eq(budgetLines.budgetId, budget.id));
  if (!lines.length) return { level: "ok" };

  const actualMap = await actualForPeriod(orgId, key, input.costCenterId ?? null);
  const plannedTotal = lines.reduce((a, l) => a + l.plannedCents, 0);
  const actualTotal = lines.reduce((a, l) => a + (actualMap.get(l.categoryId) ?? 0), 0);
  const projected = actualTotal + (input.amountCents ?? 0);
  const usedPercent = plannedTotal > 0 ? Math.round((projected / plannedTotal) * 1000) / 10 : projected > 0 ? 100 : 0;
  const level: "ok" | "warning" | "critical" = projected >= plannedTotal ? "critical" : usedPercent >= 80 ? "warning" : "ok";
  return { level, budgetId: budget.id, usedPercent };
}

export async function financeBudgetRoutes(app: FastifyInstance) {
  app.get("/finance/budgets", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const q = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });
    if (!officeWriter(claims.role)) return reply.code(403).send({ error: "office role required" });
    return hydrateBudgets(orgId, q.data.period);
  });

  app.get("/finance/budgets/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeWriter(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const all = await hydrateBudgets(orgId);
    const found = all.find((b) => b.id === id);
    if (!found) return reply.code(404).send({ error: "not found" });
    return found;
  });

  app.post("/finance/budgets", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const parsed = upsertBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!periodRange(parsed.data.period)) return reply.code(400).send({ error: "invalid period" });

    const existing = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.orgId, orgId),
          eq(budgets.period, parsed.data.period),
          parsed.data.costCenterId ? eq(budgets.costCenterId, parsed.data.costCenterId) : isNull(budgets.costCenterId),
        ),
      )
      .limit(1);
    if (existing) return reply.code(409).send({ error: "a budget for this period/cost-center already exists" });

    const [budget] = await db
      .insert(budgets)
      .values({
        orgId,
        period: parsed.data.period,
        label: parsed.data.label ?? null,
        costCenterId: parsed.data.costCenterId ?? null,
        createdBy: claims.userId,
      })
      .returning();
    await db.insert(budgetLines).values(
      parsed.data.lines.map((l) => ({
        orgId,
        budgetId: budget.id,
        categoryId: l.categoryId ?? null,
        plannedCents: l.plannedCents,
      })),
    );
    safeEmitActivity(orgId, "budget.created", `Created budget for ${parsed.data.period}`, {});
    const all = await hydrateBudgets(orgId);
    return reply.code(201).send(all.find((b) => b.id === budget.id));
  });

  app.patch("/finance/budgets/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = upsertBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (!periodRange(parsed.data.period)) return reply.code(400).send({ error: "invalid period" });

    const [existing] = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(and(eq(budgets.orgId, orgId), eq(budgets.id, id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    const duplicate = await db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        and(
          eq(budgets.orgId, orgId),
          eq(budgets.period, parsed.data.period),
          parsed.data.costCenterId ? eq(budgets.costCenterId, parsed.data.costCenterId) : isNull(budgets.costCenterId),
          sql`${budgets.id} != ${id}`,
        ),
      )
      .limit(1);
    if (duplicate) return reply.code(409).send({ error: "a budget for this period/cost-center already exists" });

    await db.update(budgets).set({ period: parsed.data.period, label: parsed.data.label ?? null, costCenterId: parsed.data.costCenterId ?? null }).where(eq(budgets.id, id));
    await db.delete(budgetLines).where(eq(budgetLines.budgetId, id));
    await db.insert(budgetLines).values(
      parsed.data.lines.map((l) => ({
        orgId,
        budgetId: id,
        categoryId: l.categoryId ?? null,
        plannedCents: l.plannedCents,
      })),
    );
    safeEmitActivity(orgId, "budget.updated", `Updated budget for ${parsed.data.period}`, {});
    const all = await hydrateBudgets(orgId);
    return all.find((b) => b.id === id);
  });

  app.delete("/finance/budgets/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(budgets)
      .where(and(eq(budgets.orgId, orgId), eq(budgets.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });
}