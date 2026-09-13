import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql, eq, and, inArray } from "drizzle-orm";
import {
  db,
  expenses,
  expenseCategories,
  costCenters,
  jobs,
  users,
} from "@nnact/db";
import type { ExpenseDTO, ExpenseStatus, FinancePaymentMethod } from "@nnact/shared";
import { EXPENSE_STATUS, FINANCE_PAYMENT_METHODS } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { isOfficeRole, withFinanceNumber } from "../finance-utils.js";
import { safeEmitActivity } from "../activities.js";
import { safeNotifyUser } from "../notify-user.js";
import { notifyExpenseSubmittedToOffice } from "../notify-office.js";
import { validateOrgIds } from "../finance-validate.js";
import { saveFinanceReceipt, receiptPublicUrl } from "../finance-files.js";
import { budgetGuard } from "./finance-budgets.js";

const createBody = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  amountCents: z.number().int().positive().max(999_999_999),
  momoFeeCents: z.number().int().nonnegative().max(99_999_999).default(0),
  paymentMethod: z.enum(FINANCE_PAYMENT_METHODS).default("CASH"),
  categoryId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  equipmentId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional(),
  /** If true, create and immediately move to SUBMITTED (mobile flows). */
  submitImmediately: z.boolean().default(false),
});

const patchBody = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  amountCents: z.number().int().positive().max(999_999_999).optional(),
  momoFeeCents: z.number().int().nonnegative().max(99_999_999).optional(),
  paymentMethod: z.enum(FINANCE_PAYMENT_METHODS).optional(),
  categoryId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  equipmentId: z.string().uuid().optional().nullable(),
});

const transitionReason = z.object({
  reason: z.string().trim().min(1).max(2000),
});

type ExpenseRow = typeof expenses.$inferSelect;

export async function hydrate(
  orgId: string,
  rows: ExpenseRow[],
): Promise<ExpenseDTO[]> {
  if (!rows.length) return [];

  const employeeIds = new Set<string>();
  const categoryIds = new Set<string>();
  const centerIds = new Set<string>();
  const jobIds = new Set<string>();
  for (const r of rows) {
    if (r.employeeId) employeeIds.add(r.employeeId);
    if (r.categoryId) categoryIds.add(r.categoryId);
    if (r.costCenterId) centerIds.add(r.costCenterId);
    if (r.jobId) jobIds.add(r.jobId);
  }

  const [employeeRows, categoryRows, centerRows, jobRows] = await Promise.all([
    employeeIds.size
      ? db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...employeeIds]))
      : Promise.resolve([] as { id: string; name: string }[]),
    categoryIds.size
      ? db.select({ id: expenseCategories.id, name: expenseCategories.name }).from(expenseCategories).where(inArray(expenseCategories.id, [...categoryIds]))
      : Promise.resolve([] as { id: string; name: string }[]),
    centerIds.size
      ? db.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(inArray(costCenters.id, [...centerIds]))
      : Promise.resolve([] as { id: string; name: string }[]),
    jobIds.size
      ? db.select({ id: jobs.id, number: jobs.number }).from(jobs).where(and(eq(jobs.orgId, orgId), inArray(jobs.id, [...jobIds])))
      : Promise.resolve([] as { id: string; number: string | null }[]),
  ]);

  const employeeName = new Map(employeeRows.map((r) => [r.id, r.name]));
  const categoryName = new Map(categoryRows.map((r) => [r.id, r.name]));
  const centerName = new Map(centerRows.map((r) => [r.id, r.name]));
  const jobNumber = new Map(jobRows.map((r) => [r.id, r.number]));

  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    employeeId: r.employeeId,
    employeeName: employeeName.get(r.employeeId) ?? null,
    categoryId: r.categoryId,
    categoryName: r.categoryId ? categoryName.get(r.categoryId) ?? null : null,
    costCenterId: r.costCenterId,
    costCenterName: r.costCenterId ? centerName.get(r.costCenterId) ?? null : null,
    jobId: r.jobId,
    jobNumber: r.jobId ? jobNumber.get(r.jobId) ?? null : null,
    title: r.title,
    description: r.description,
    amountCents: r.amountCents,
    momoFeeCents: r.momoFeeCents,
    paymentMethod: r.paymentMethod as FinancePaymentMethod,
    receiptUrls: r.receiptUrls,
    status: r.status as ExpenseStatus,
    submittedAt: r.submittedAt?.toISOString() ?? null,
    approvedBy: r.approvedBy,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectionReason: r.rejectionReason,
    paidAt: r.paidAt?.toISOString() ?? null,
    voidedAt: r.voidedAt?.toISOString() ?? null,
    voidReason: r.voidReason,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function findExpense(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
    .limit(1);
  return row;
}

export async function financeExpenseRoutes(app: FastifyInstance) {
  const listSchema = z.object({
    status: z.enum(EXPENSE_STATUS).optional(),
    employeeId: z.string().uuid().optional(),
    jobId: z.string().uuid().optional(),
    limit: z.coerce.number().int().min(1).max(500).default(100),
  });

  app.get("/finance/expenses", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const conditions = [eq(expenses.orgId, orgId)];
    if (!isOfficeRole(claims.role)) conditions.push(eq(expenses.employeeId, claims.userId));
    if (parsed.data.status) conditions.push(eq(expenses.status, parsed.data.status));
    if (parsed.data.employeeId) {
      if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required to filter by employee" });
      conditions.push(eq(expenses.employeeId, parsed.data.employeeId));
    }
    if (parsed.data.jobId) conditions.push(eq(expenses.jobId, parsed.data.jobId));

    const rows = await db
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(sql`${expenses.createdAt} desc`)
      .limit(parsed.data.limit);
    return hydrate(orgId, rows);
  });

  app.get("/finance/expenses/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (!isOfficeRole(claims.role) && row.employeeId !== claims.userId) {
      return reply.code(403).send({ error: "not your expense" });
    }
    const [dto] = await hydrate(orgId, [row]);
    return dto;
  });

  app.post("/finance/expenses", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const employeeId = parsed.data.employeeId ?? claims.userId;
    if (parsed.data.employeeId && !isOfficeRole(claims.role)) {
      return reply.code(403).send({ error: "office role required to set employee" });
    }
    if (!isOfficeRole(claims.role) && employeeId !== claims.userId) {
      return reply.code(403).send({ error: "technicians may only file their own expenses" });
    }

    const validated = await validateOrgIds(orgId, {
      categoryId: parsed.data.categoryId,
      costCenterId: parsed.data.costCenterId,
      jobId: parsed.data.jobId,
      equipmentId: parsed.data.equipmentId,
      employeeId,
    });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const status = parsed.data.submitImmediately ? "SUBMITTED" : "DRAFT";
    const result = await withFinanceNumber(
      orgId,
      "expense",
      async (tx) => {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(expenses)
          .where(eq(expenses.orgId, orgId));
        return count;
      },
      (s) => ({ prefix: s.numbering.expensePrefix, nextNumber: s.numbering.expenseNextNumber }),
      async (tx, number) => {
        const [row] = await tx
          .insert(expenses)
          .values({
            orgId,
            number,
            employeeId,
            submittedById: claims.userId,
            categoryId: parsed.data.categoryId ?? null,
            costCenterId: parsed.data.costCenterId ?? null,
            jobId: parsed.data.jobId ?? null,
            equipmentId: parsed.data.equipmentId ?? null,
            title: parsed.data.title,
            description: parsed.data.description ?? null,
            amountCents: parsed.data.amountCents,
            momoFeeCents: parsed.data.momoFeeCents,
            paymentMethod: parsed.data.paymentMethod,
            status,
            submittedAt: status === "SUBMITTED" ? new Date() : null,
          })
          .returning();
        return row;
      },
    );

    safeEmitActivity(orgId, "expense.created", `Created expense ${result.number} (${result.title})`, { jobId: result.jobId ?? undefined });
    if (status === "SUBMITTED") {
      safeEmitActivity(orgId, "expense.submitted", `Submitted expense ${result.number} (${result.title})`, { jobId: result.jobId ?? undefined });
      notifyExpenseSubmittedToOffice(orgId, claims.userId, claims.name ?? "Staff member", result.number, result.title, result.amountCents);
    }
    const [dto] = await hydrate(orgId, [result]);
    if (result.status === "SUBMITTED" || result.status === "DRAFT" || result.status === "UNDER_REVIEW" || result.status === "APPROVED") {
      const guard = await budgetGuard(orgId, { categoryId: result.categoryId, costCenterId: result.costCenterId, amountCents: result.amountCents + result.momoFeeCents });
      if (guard.level !== "ok") {
        dto.budgetWarning = { level: guard.level, usedPercent: guard.usedPercent };
      }
    }
    return reply.code(201).send(dto);
  });

  app.patch("/finance/expenses/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const isOwner = row.employeeId === claims.userId;
    const office = isOfficeRole(claims.role);
    if (!office && !isOwner) return reply.code(403).send({ error: "not your expense" });
    if (row.status !== "DRAFT") return reply.code(409).send({ error: "only DRAFT expenses can be edited" });

    const validated = await validateOrgIds(orgId, {
      categoryId: parsed.data.categoryId,
      costCenterId: parsed.data.costCenterId,
      jobId: parsed.data.jobId,
      equipmentId: parsed.data.equipmentId,
    });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const [updated] = await db
      .update(expenses)
      .set({
        title: parsed.data.title,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        momoFeeCents: parsed.data.momoFeeCents,
        paymentMethod: parsed.data.paymentMethod,
        categoryId: parsed.data.categoryId,
        costCenterId: parsed.data.costCenterId,
        jobId: parsed.data.jobId,
        equipmentId: parsed.data.equipmentId,
      })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id), eq(expenses.version, row.version)))
      .returning();
    if (!updated) return reply.code(409).send({ error: "expense changed elsewhere; refresh and retry" });
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  // ── State machine ────────────────────────────────────────────────────
  const transitionable = (
    row: ExpenseRow,
    claimId: string,
    office: boolean,
  ): { ok: true; row: ExpenseRow } | { ok: false; code: number; error: string } => {
    if (!office && row.employeeId !== claimId) return { ok: false, code: 403, error: "not your expense" };
    return { ok: true, row };
  };

  app.post("/finance/expenses/:id/submit", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    const chk = transitionable(row, claims.userId, office);
    if (!chk.ok) return reply.code(chk.code).send({ error: chk.error });
    if (row.status !== "DRAFT") return reply.code(409).send({ error: `cannot submit a ${row.status} expense` });

    const [updated] = await db
      .update(expenses)
      .set({ status: "SUBMITTED", submittedAt: new Date() })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
      .returning();
    safeEmitActivity(orgId, "expense.submitted", `Submitted expense ${updated.number} (${updated.title})`, { jobId: updated.jobId ?? undefined });
    notifyExpenseSubmittedToOffice(orgId, claims.userId, claims.name ?? "Staff member", updated.number, updated.title, updated.amountCents);
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.post("/finance/expenses/:id/review", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "SUBMITTED" && row.status !== "UNDER_REVIEW") {
      return reply.code(409).send({ error: `cannot review a ${row.status} expense` });
    }
    const [updated] = await db
      .update(expenses)
      .set({ status: "UNDER_REVIEW" })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
      .returning();
    safeEmitActivity(orgId, "expense.reviewed", `Marked ${updated.number} under review`, { jobId: updated.jobId ?? undefined });
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.post("/finance/expenses/:id/approve", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "SUBMITTED" && row.status !== "UNDER_REVIEW") {
      return reply.code(409).send({ error: `cannot approve a ${row.status} expense` });
    }
    const [updated] = await db
      .update(expenses)
      .set({ status: "APPROVED", approvedBy: claims.userId, approvedAt: new Date(), rejectionReason: null })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
      .returning();
    safeEmitActivity(orgId, "expense.approved", `Approved expense ${updated.number} (${updated.title})`, { jobId: updated.jobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "bill_approval",
      title: "Expense approved",
      body: `${updated.title} (${updated.number}) was approved for ${(updated.amountCents / 100).toFixed(2)}.`,
      link: `/finance/expenses/${updated.id}`,
    });
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.post("/finance/expenses/:id/reject", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = transitionReason.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "SUBMITTED" && row.status !== "UNDER_REVIEW") {
      return reply.code(409).send({ error: `cannot reject a ${row.status} expense` });
    }
    const [updated] = await db
      .update(expenses)
      .set({ status: "REJECTED", approvedBy: null, approvedAt: null, rejectionReason: parsed.data.reason })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
      .returning();
    safeEmitActivity(orgId, "expense.rejected", `Rejected ${updated.number}: ${parsed.data.reason}`, { jobId: updated.jobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "document_updated",
      title: "Expense rejected",
      body: `${updated.title} (${updated.number}) was rejected. Reason: ${parsed.data.reason}`,
      link: `/finance/expenses/${updated.id}`,
    });
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.post("/finance/expenses/:id/pay", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "APPROVED") return reply.code(409).send({ error: `only APPROVED expenses can be paid (current: ${row.status})` });
    const [updated] = await db
      .update(expenses)
      .set({ status: "PAID", paidBy: claims.userId, paidAt: new Date() })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
      .returning();
    safeEmitActivity(orgId, "expense.paid", `Paid expense ${updated.number} (${updated.title})`, { jobId: updated.jobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "payment.received",
      title: "Expense paid",
      body: `${updated.title} (${updated.number}) was paid.`,
      link: `/finance/expenses/${updated.id}`,
    });
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.post("/finance/expenses/:id/void", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = transitionReason.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status === "VOIDED" || row.status === "PAID") {
      return reply.code(409).send({ error: `cannot void a ${row.status} expense` });
    }
    const [updated] = await db
      .update(expenses)
      .set({ status: "VOIDED", voidedAt: new Date(), voidReason: parsed.data.reason })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
      .returning();
    safeEmitActivity(orgId, "expense.voided", `Voided ${updated.number}: ${parsed.data.reason}`, { jobId: updated.jobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "document_updated",
      title: "Expense voided",
      body: `${updated.title} (${updated.number}) was voided.`,
      link: `/finance/expenses/${updated.id}`,
    });
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  // ── Hard delete is restricted to DRAFT ───────────────────────────────
  app.delete("/finance/expenses/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your expense" });
    if (row.status !== "DRAFT") {
      return reply.code(409).send({ error: "only DRAFT expenses can be deleted; use void for recorded expenses" });
    }
    await db.delete(expenses).where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)));
    return { ok: true };
  });

  // ── Receipt upload ────────────────────────────────────────────────────
  app.post("/finance/expenses/:id/receipt", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your expense" });
    if (row.status === "PAID" || row.status === "VOIDED") {
      return reply.code(409).send({ error: `expense is ${row.status}; receipts can no longer be attached` });
    }

    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "multipart file required" });
    const record = await saveFinanceReceipt(orgId, {
      stream: data.file,
      filenameHint: data.filename,
    });
    const url = receiptPublicUrl(orgId, record.fileId);
    const [updated] = await db
      .update(expenses)
      .set({ receiptUrls: [...row.receiptUrls, url] })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
      .returning();
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.delete("/finance/expenses/:id/receipts", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findExpense(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your expense" });
    const parsed = z.object({ url: z.string().min(1) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const [updated] = await db
      .update(expenses)
      .set({ receiptUrls: row.receiptUrls.filter((u) => u !== parsed.data.url) })
      .where(and(eq(expenses.orgId, orgId), eq(expenses.id, id)))
      .returning();
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });
}