import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { eq, and, sql, gte, lt } from "drizzle-orm";
import { db, expenses, supplierBills, expenseCategories, costCenters } from "@nnact/db";
import type { ExpenseReportRowDTO, BudgetAnalysisRowDTO, JobCostingDTO } from "@nnact/shared";
import { toCsv } from "../reports.js";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { isOfficeRole, officeWriter, userNameMap } from "../finance-utils.js";
import { hydrateBudgets, periodRange } from "./finance-budgets.js";
import { jobCosting } from "./finance-dashboard.js";

function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

function csvResponse(reply: FastifyReply, csv: string, filename: string) {
  return reply
    .header("content-type", "text/csv; charset=utf-8")
    .header("content-disposition", `attachment; filename="${filename}"`)
    .send(csv);
}

const reportKindParam = z.enum(["expenses", "payables-aging", "budget-analysis", "job-costing"]);

export async function financeReportRoutes(app: FastifyInstance) {
  const guard = async (req: Parameters<typeof resolveOrgId>[0], reply: FastifyReply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return null;
    if (!officeWriter(claims.role)) {
      reply.code(403).send({ error: "office role required" });
      return null;
    }
    return orgId;
  };

  const expenseReportRows = async (orgId: string, period?: string) => {
    const conds = [eq(expenses.orgId, orgId)];
    if (period) {
      const range = periodRange(period);
      if (range) {
        conds.push(gte(expenses.paidAt, range.start));
        conds.push(lt(expenses.paidAt, range.end));
      }
    }
    const rows = await db.select().from(expenses).where(and(...conds)).orderBy(sql`${expenses.createdAt} desc`);
    const names = await userNameMap(
      orgId,
      rows.map((r) => r.employeeId),
    );
    const cats = await db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(eq(expenseCategories.orgId, orgId));
    const centers = await db.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(eq(costCenters.orgId, orgId));
    const catName = new Map(cats.map((c) => [c.id, c.name]));
    const centerName = new Map(centers.map((c) => [c.id, c.name]));
    const dtos: ExpenseReportRowDTO[] = rows.map((r) => ({
      number: r.number,
      title: r.title,
      employeeName: r.employeeId ? names.get(r.employeeId) ?? "Unknown" : "Unknown",
      categoryName: (r.categoryId ? catName.get(r.categoryId) : null) ?? "",
      costCenterName: (r.costCenterId ? centerName.get(r.costCenterId) : null) ?? "",
      status: r.status,
      amountCents: r.amountCents,
      momoFeeCents: r.momoFeeCents ?? 0,
      paymentMethod: r.paymentMethod,
      submittedAt: r.submittedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
    }));
    return dtos;
  };

  const payablesAgingRows = async (orgId: string) => {
    const rows = await db.select().from(supplierBills).where(eq(supplierBills.orgId, orgId)).orderBy(sql`${supplierBills.dueDate} asc`);
    const now = Date.now();
    const day = 86_400_000;
    return rows
      .filter((b) => b.status !== "VOIDED" && b.status !== "DRAFT" && b.totalCents > b.paidCents)
      .map((b) => {
        const due = b.dueDate ? new Date(b.dueDate).getTime() : null;
        const overdueDays = due ? Math.max(0, Math.floor((now - due) / day)) : 0;
        return {
          number: b.number,
          supplierName: b.supplierName,
          reference: b.supplierReference ?? "",
          status: b.status,
          totalCents: b.totalCents,
          paidCents: b.paidCents,
          balanceCents: b.totalCents - b.paidCents,
          dueDate: b.dueDate?.toISOString().slice(0, 10) ?? null,
          overdueDays,
        };
      });
  };

  const budgetAnalysisRows = async (orgId: string): Promise<BudgetAnalysisRowDTO[]> => {
    const budgets = await hydrateBudgets(orgId);
    return budgets.flatMap((b) =>
      b.lines.map((l) => ({
        period: b.period,
        costCenterName: b.costCenterName ?? null,
        categoryName: l.categoryName ?? null,
        plannedCents: l.plannedCents,
        actualCents: l.actualCents,
        remainingCents: l.remainingCents,
        usedPercent: l.usedPercent,
      })),
    );
  };

  app.get("/finance/reports/:file", async (req, reply) => {
    const orgId = await guard(req, reply);
    if (!orgId) return;
    const file = (req.params as { file: string }).file;
    const isCsv = file.endsWith(".csv");
    const kindRaw = isCsv ? file.slice(0, -4) : file;
    const p = reportKindParam.safeParse(kindRaw);
    if (!p.success) return reply.code(400).send({ error: "unknown report kind" });
    const q = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/).optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });

    if (!isCsv) {
      switch (p.data) {
        case "expenses":
          return expenseReportRows(orgId, q.data.period);
        case "payables-aging":
          return payablesAgingRows(orgId);
        case "budget-analysis":
          return budgetAnalysisRows(orgId);
        case "job-costing":
          return jobCosting(orgId);
      }
    }

    switch (p.data) {
      case "expenses": {
        const rows = await expenseReportRows(orgId, q.data.period);
        const csv = toCsv(rows.map((r) => ({
          number: r.number,
          title: r.title,
          employee: r.employeeName,
          category: r.categoryName ?? "",
          cost_center: r.costCenterName ?? "",
          status: r.status,
          amount: money(r.amountCents),
          momo_fee: money(r.momoFeeCents),
          total: money(r.amountCents + r.momoFeeCents),
          payment_method: r.paymentMethod,
          submitted_at: r.submittedAt ? new Date(r.submittedAt).toISOString().slice(0, 10) : "",
          paid_at: r.paidAt ? new Date(r.paidAt).toISOString().slice(0, 10) : "",
        })));
        return csvResponse(reply, csv, "finance-expenses.csv");
      }
      case "payables-aging": {
        const rows = await payablesAgingRows(orgId);
        const csv = toCsv(rows.map((r) => ({
          number: r.number,
          supplier: r.supplierName,
          reference: r.reference,
          status: r.status,
          total: money(r.totalCents),
          paid: money(r.paidCents),
          balance: money(r.balanceCents),
          due_date: r.dueDate ?? "",
          overdue_days: r.overdueDays,
        })));
        return csvResponse(reply, csv, "payables-aging.csv");
      }
      case "budget-analysis": {
        const rows = await budgetAnalysisRows(orgId);
        const csv = toCsv(rows.map((r) => ({
          period: r.period,
          cost_center: r.costCenterName ?? "",
          category: r.categoryName ?? "",
          planned: money(r.plannedCents),
          actual: money(r.actualCents),
          remaining: money(r.remainingCents),
          used_percent: r.usedPercent,
        })));
        return csvResponse(reply, csv, "budget-analysis.csv");
      }
      case "job-costing": {
        const rows = await jobCosting(orgId);
        const csv = toCsv(rows.map((r) => ({
          job: r.jobNumber ?? r.title,
          title: r.title,
          customer: r.customerName ?? "",
          status: r.status,
          revenue: money(r.revenueCents),
          direct_costs: money(r.directCostCents),
          expenses: money(r.expenseCents),
          bills: money(r.billCents),
          labor: money(r.laborCostCents),
          gross_profit: money(r.grossProfitCents),
          margin_percent: r.grossMarginPercent,
        })));
        return csvResponse(reply, csv, "job-costing.csv");
      }
    }
  });
}