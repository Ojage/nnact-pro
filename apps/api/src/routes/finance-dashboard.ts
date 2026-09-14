import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql, eq, and, inArray, gte, lt } from "drizzle-orm";
import {
  db,
  orgs,
  expenses,
  supplierBills,
  billPayments,
  cashAdvances,
  reimbursements,
  pettyCashFunds,
  jobs,
  invoices,
  customers,
  jobLineItemsFinance,
  lineItems,
} from "@nnact/db";
import type { FinanceDashboardDTO, JobCostingDTO, ExpenseDTO, SupplierBillDTO } from "@nnact/shared";
import { mergeBusinessSettings } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { isOfficeRole, officeWriter } from "../finance-utils.js";
import { monthKey, periodRange, hydrateBudgets } from "./finance-budgets.js";
import { hydrate as hydrateExpenses } from "./finance-expenses.js";
import { hydrate as hydrateBills } from "./finance-bills.js";

export async function jobCosting(orgId: string, jobId?: string): Promise<JobCostingDTO[]> {
  const jobConds = [eq(jobs.orgId, orgId)];
  if (jobId) jobConds.push(eq(jobs.id, jobId));
  const jobRows = await db
    .select({ id: jobs.id, number: jobs.number, title: jobs.title, status: jobs.status, customerId: jobs.customerId, laborCostCents: jobs.laborCostCents })
    .from(jobs)
    .where(and(...jobConds))
    .orderBy(sql`${jobs.createdAt} desc`)
    .limit(500);
  if (!jobRows.length) return [];

  const jobIds = jobRows.map((r) => r.id);
  const customerIds = jobRows.filter((r) => r.customerId).map((r) => r.customerId as string);
  const [customerRows, invoiceRows, expenseRows, billRows, lineItemRows, costClassRows] = await Promise.all([
    db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, customerIds)),
    db
      .select({ jobId: invoices.jobId, total: invoices.total })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), inArray(invoices.jobId, jobIds), sql`${invoices.status} != 'void'`)),
    db
      .select({ jobId: expenses.jobId, amountCents: expenses.amountCents, momoFeeCents: expenses.momoFeeCents })
      .from(expenses)
      .where(and(eq(expenses.orgId, orgId), inArray(expenses.jobId, jobIds), sql`${expenses.status} in ('APPROVED', 'PAID')`)),
    db
      .select({ jobId: supplierBills.jobId, totalCents: supplierBills.totalCents })
      .from(supplierBills)
      .where(and(eq(supplierBills.orgId, orgId), inArray(supplierBills.jobId, jobIds), sql`${supplierBills.status} not in ('VOIDED', 'DRAFT')`)),
    db
      .select({ id: lineItems.id, jobId: lineItems.jobId, unitPriceCents: lineItems.unitPrice, quantity: lineItems.quantity })
      .from(lineItems)
      .where(and(eq(lineItems.orgId, orgId), inArray(lineItems.jobId, jobIds))),
    db
      .select({ lineItemId: jobLineItemsFinance.lineItemId, costClass: jobLineItemsFinance.costClass })
      .from(jobLineItemsFinance)
      .where(eq(jobLineItemsFinance.orgId, orgId)),
  ]);

  const customerName = new Map(customerRows.map((c) => [c.id, c.name]));
  const invoiceByJob = new Map<string, number>();
  for (const i of invoiceRows) invoiceByJob.set(i.jobId, (invoiceByJob.get(i.jobId) ?? 0) + i.total);
  const expenseByJob = new Map<string, number>();
  for (const e of expenseRows) {
    if (!e.jobId) continue;
    expenseByJob.set(e.jobId, (expenseByJob.get(e.jobId) ?? 0) + e.amountCents + e.momoFeeCents);
  }
  const billByJob = new Map<string, number>();
  for (const b of billRows) {
    if (!b.jobId) continue;
    billByJob.set(b.jobId, (billByJob.get(b.jobId) ?? 0) + b.totalCents);
  }
  const costClass = new Set(costClassRows.filter((c) => c.costClass === "cost").map((c) => c.lineItemId));
  const directLineByJob = new Map<string, number>();
  for (const l of lineItemRows) {
    if (!costClass.has(l.id)) continue;
    directLineByJob.set(l.jobId, (directLineByJob.get(l.jobId) ?? 0) + l.quantity * l.unitPriceCents);
  }

  return jobRows.map((job) => {
    const revenue = invoiceByJob.get(job.id) ?? 0;
    const directCost =
      (directLineByJob.get(job.id) ?? 0) + (job.laborCostCents ?? 0) + (expenseByJob.get(job.id) ?? 0) + (billByJob.get(job.id) ?? 0);
    const grossProfit = revenue - directCost;
    const grossMargin = revenue > 0 ? Math.round((grossProfit / revenue) * 1000) / 10 : 0;
    const dto: JobCostingDTO = {
      jobId: job.id,
      jobNumber: job.number,
      title: job.title,
      customerName: job.customerId ? customerName.get(job.customerId) ?? null : null,
      status: job.status,
      revenueCents: revenue,
      directCostCents: directCost,
      expenseCents: expenseByJob.get(job.id) ?? 0,
      billCents: billByJob.get(job.id) ?? 0,
      laborCostCents: job.laborCostCents ?? 0,
      grossProfitCents: grossProfit,
      grossMarginPercent: grossMargin,
    };
    return dto;
  });
}

export async function financeDashboardRoutes(app: FastifyInstance) {
  app.get("/finance/dashboard", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeWriter(claims.role)) return reply.code(403).send({ error: "office role required" });

    const [org] = await db.select({ businessSettings: orgs.businessSettings }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
    const settings = mergeBusinessSettings(org?.businessSettings);
    const key = monthKey(new Date());
    const range = periodRange(key)!;

    const monthExpense = await db
      .select({ amount: sql<number>`coalesce(sum(${expenses.amountCents} + ${expenses.momoFeeCents}), 0)::int` })
      .from(expenses)
      .where(and(eq(expenses.orgId, orgId), eq(expenses.status, "PAID"), gte(expenses.paidAt, range.start), lt(expenses.paidAt, range.end)))
      .then((r) => r[0]?.amount ?? 0);

    const monthBillPaid = await db
      .select({ amount: sql<number>`coalesce(sum(${billPayments.amountCents}), 0)::int` })
      .from(billPayments)
      .where(and(eq(billPayments.orgId, orgId), gte(billPayments.paidAt, range.start), lt(billPayments.paidAt, range.end)))
      .then((r) => r[0]?.amount ?? 0);

    const [payables, overdue, advances, reimbursementsOut, petty] = await Promise.all([
      db
        .select({ amount: sql<number>`coalesce(sum(${supplierBills.totalCents} - ${supplierBills.paidCents}), 0)::int` })
        .from(supplierBills)
        .where(
          and(
            eq(supplierBills.orgId, orgId),
            sql`${supplierBills.status} not in ('PAID', 'VOIDED', 'DRAFT')`,
          ),
        )
        .then((r) => r[0]?.amount ?? 0),
      db
        .select({ amount: sql<number>`coalesce(sum(${supplierBills.totalCents} - ${supplierBills.paidCents}), 0)::int` })
        .from(supplierBills)
        .where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.status, "OVERDUE")))
        .then((r) => r[0]?.amount ?? 0),
      db
        .select({ amount: sql<number>`coalesce(sum(${cashAdvances.amountCents} - ${cashAdvances.settledCents}), 0)::int` })
        .from(cashAdvances)
        .where(and(eq(cashAdvances.orgId, orgId), sql`${cashAdvances.status} in ('DISBURSED', 'PARTIALLY_SETTLED', 'OVERDUE')`))
        .then((r) => r[0]?.amount ?? 0),
      db
        .select({ amount: sql<number>`coalesce(sum(${reimbursements.amountCents}), 0)::int` })
        .from(reimbursements)
        .where(and(eq(reimbursements.orgId, orgId), eq(reimbursements.status, "APPROVED")))
        .then((r) => r[0]?.amount ?? 0),
      db
        .select({ amount: sql<number>`coalesce(sum(${pettyCashFunds.currentBalanceCents}), 0)::int` })
        .from(pettyCashFunds)
        .where(and(eq(pettyCashFunds.orgId, orgId), eq(pettyCashFunds.status, "active")))
        .then((r) => r[0]?.amount ?? 0),
    ]);

    const [recentExpenseRows, recentBillRows] = await Promise.all([
      db
        .select()
        .from(expenses)
        .where(eq(expenses.orgId, orgId))
        .orderBy(sql`${expenses.createdAt} desc`)
        .limit(5),
      db.select().from(supplierBills).where(eq(supplierBills.orgId, orgId)).orderBy(sql`${supplierBills.createdAt} desc`).limit(5),
    ]);
    const recentExpenses = await hydrateExpenses(orgId, recentExpenseRows);
    const recentBills = await hydrateBills(orgId, recentBillRows);

    const budgets = await hydrateBudgets(orgId, key);
    const budgetTotals = budgets.reduce(
      (acc, b) => ({ planned: acc.planned + b.totalPlannedCents, actual: acc.actual + b.totalActualCents }),
      { planned: 0, actual: 0 },
    );
    const budgetUsedPercent = budgetTotals.planned > 0 ? Math.round((budgetTotals.actual / budgetTotals.planned) * 1000) / 10 : 0;
    const budgetLinesFlat = budgets.flatMap((b) => b.lines);

    const dto: FinanceDashboardDTO = {
      currency: settings.currency,
      period: key,
      monthExpenseCents: monthExpense,
      monthBillPaidCents: monthBillPaid,
      monthTotalOutCents: monthExpense + monthBillPaid,
      billsPayableCents: payables,
      billsOverdueCents: overdue,
      outstandingAdvanceCents: advances,
      unsettledReimbursementCents: reimbursementsOut,
      pettyCashBalanceCents: petty,
      budgetPlannedCents: budgetTotals.planned,
      budgetActualCents: budgetTotals.actual,
      budgetUsedPercent: budgetUsedPercent,
      recentExpenses: recentExpenses as ExpenseDTO[],
      recentBills: recentBills as SupplierBillDTO[],
      budgetLines: budgetLinesFlat,
    };
    return dto;
  });

  // ── Job costing / profitability ───────────────────────────────────────
  app.get("/finance/job-costing", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeWriter(claims.role)) return reply.code(403).send({ error: "office role required" });
    const q = z.object({ jobId: z.string().uuid().optional() }).safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });
    return jobCosting(orgId, q.data.jobId);
  });
}