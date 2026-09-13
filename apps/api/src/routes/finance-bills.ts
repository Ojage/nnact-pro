import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql, eq, and, lt, asc, desc, inArray } from "drizzle-orm";
import {
  db,
  supplierBills,
  supplierBillLines,
  billPayments,
  recurringBills,
  expenseCategories,
  costCenters,
  jobs,
  users,
} from "@nnact/db";
import type { SupplierBillDTO, BillStatus, BillFrequency, SupplierBillLineDTO, BillPaymentDTO, RecurringBillDTO, FinancePaymentMethod } from "@nnact/shared";
import { BILL_STATUS, BILL_FREQUENCY, FINANCE_PAYMENT_METHODS } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { isOfficeRole, withFinanceNumber } from "../finance-utils.js";
import { validateOrgIds } from "../finance-validate.js";
import { safeEmitActivity } from "../activities.js";
import { safeNotifyUser } from "../notify-user.js";

const lineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().int().positive().default(1),
  unitPriceCents: z.number().int().nonnegative().max(999_999_999),
});

const createBody = z.object({
  supplierName: z.string().trim().min(1).max(200),
  supplierReference: z.string().trim().max(120).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  issueDate: z.string().min(1),
  dueDate: z.string().optional().nullable(),
  taxCents: z.number().int().nonnegative().max(999_999_999).default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(["DRAFT", "RECEIVED"]).default("DRAFT"),
  lines: z.array(lineSchema).min(1),
});

const patchBody = z.object({
  supplierName: z.string().trim().min(1).max(200).optional(),
  supplierReference: z.string().trim().max(120).optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  issueDate: z.string().min(1).optional(),
  dueDate: z.string().optional().nullable(),
  taxCents: z.number().int().nonnegative().max(999_999_999).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(lineSchema).min(1).optional(),
});

const payBody = z.object({
  amountCents: z.number().int().positive().max(999_999_999),
  method: z.enum(FINANCE_PAYMENT_METHODS).default("BANK_TRANSFER"),
  reference: z.string().trim().max(120).optional().nullable(),
  paidAt: z.string().optional(),
});

const reasonBody = z.object({ reason: z.string().trim().min(1).max(2000) });

type BillRow = typeof supplierBills.$inferSelect;
export type { BillRow };

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function sumLines(lines: { quantity: number; unitPriceCents: number }[]): number {
  return lines.reduce((acc, l) => acc + l.quantity * l.unitPriceCents, 0);
}

/** Lazily flip any opened-but-overdue bill to OVERDUE (derived state). */
async function refreshOverdue(orgId: string, now = new Date()) {
  await db
    .update(supplierBills)
    .set({ status: "OVERDUE" })
    .where(
      and(
        eq(supplierBills.orgId, orgId),
        lt(supplierBills.dueDate, now),
        sql`${supplierBills.paidCents} < ${supplierBills.totalCents}`,
        sql`${supplierBills.status} in ('RECEIVED', 'APPROVED', 'PARTIALLY_PAID')`,
      ),
    );
}

export async function hydrate(orgId: string, rows: BillRow[]): Promise<SupplierBillDTO[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);

  const [lines, payments, categories, centers, jobsMap, suppliers] = await Promise.all([
    db
      .select()
      .from(supplierBillLines)
      .where(and(eq(supplierBillLines.orgId, orgId), inArray(supplierBillLines.billId, ids)))
      .orderBy(asc(supplierBillLines.updatedAt)),
    db
      .select()
      .from(billPayments)
      .where(and(eq(billPayments.orgId, orgId), inArray(billPayments.billId, ids)))
      .orderBy(desc(billPayments.paidAt)),
    db
      .select()
      .from(expenseCategories)
      .where(eq(expenseCategories.orgId, orgId)),
    db
      .select()
      .from(costCenters)
      .where(eq(costCenters.orgId, orgId)),
    db
      .select({ id: jobs.id, number: jobs.number })
      .from(jobs)
      .where(eq(jobs.orgId, orgId)),
    db
      .select({ id: supplierBills.id, supplierName: supplierBills.supplierName, supplierReference: supplierBills.supplierReference })
      .from(supplierBills)
      .where(eq(supplierBills.orgId, orgId)),
  ]);

  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const centerName = new Map(centers.map((c) => [c.id, c.name]));
  const jobNumber = new Map(jobsMap.map((j) => [j.id, j.number]));
  const linesByBill = new Map<string, typeof lines>();
  for (const l of lines) {
    const arr = linesByBill.get(l.billId) ?? [];
    arr.push(l);
    linesByBill.set(l.billId, arr);
  }
  const paymentsByBill = new Map<string, typeof payments>();
  for (const p of payments) {
    const arr = paymentsByBill.get(p.billId) ?? [];
    arr.push(p);
    paymentsByBill.set(p.billId, arr);
  }

  return rows.map((r) => {
    const billLines = linesByBill.get(r.id) ?? [];
    const billPayments = paymentsByBill.get(r.id) ?? [];
    const allSameSupplier = suppliers.filter((s) => s.supplierName === r.supplierName && s.id !== r.id);
    return {
      id: r.id,
      number: r.number,
      supplierName: r.supplierName,
      supplierReference: r.supplierReference,
      categoryId: r.categoryId,
      costCenterId: r.costCenterId,
      jobId: r.jobId,
      issueDate: r.issueDate.toISOString(),
      dueDate: r.dueDate?.toISOString() ?? null,
      status: r.status as BillStatus,
      subTotalCents: r.subTotalCents,
      taxCents: r.taxCents,
      totalCents: r.totalCents,
      paidCents: r.paidCents,
      balanceCents: Math.max(0, r.totalCents - r.paidCents),
      notes: r.notes,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      voidedAt: r.voidedAt?.toISOString() ?? null,
      voidReason: r.voidReason,
      duplicate:
        r.supplierReference != null &&
        allSameSupplier.some((s) => s.supplierReference === r.supplierReference),
      lines: billLines.map((l) => ({
        id: l.id,
        description: l.description,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
        amountCents: l.amountCents,
      })) satisfies SupplierBillLineDTO[],
      payments: billPayments.map((p) => ({
        id: p.id,
        billId: p.billId,
        amountCents: p.amountCents,
        method: p.method as FinancePaymentMethod,
        reference: p.reference,
        paidAt: p.paidAt.toISOString(),
      })) satisfies BillPaymentDTO[],
      version: r.version,
      createdAt: r.createdAt.toISOString(),
      categoryName: r.categoryId ? categoryName.get(r.categoryId) ?? null : null,
      costCenterName: r.costCenterId ? centerName.get(r.costCenterId) ?? null : null,
      jobNumber: r.jobId ? jobNumber.get(r.jobId) ?? null : null,
    };
  });
}

async function findBill(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(supplierBills)
    .where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.id, id)))
    .limit(1);
  return row;
}

function officeOnly(claims: { role: string }): boolean {
  return isOfficeRole(claims.role);
}

export async function financeBillRoutes(app: FastifyInstance) {
  // ── Bills ─────────────────────────────────────────────────────────────
  app.get("/finance/bills", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    await refreshOverdue(orgId);

    const q = z
      .object({ status: z.enum(BILL_STATUS).optional(), supplier: z.string().trim().max(120).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });

    const conds = [eq(supplierBills.orgId, orgId)];
    if (q.data.status) conds.push(eq(supplierBills.status, q.data.status));
    if (q.data.supplier) conds.push(sql`lower(${supplierBills.supplierName}) like ${`%${q.data.supplier.toLowerCase()}%`}`);
    const rows = await db
      .select()
      .from(supplierBills)
      .where(and(...conds))
      .orderBy(desc(supplierBills.issueDate), desc(supplierBills.createdAt))
      .limit(q.data.limit);
    return hydrate(orgId, rows);
  });

  app.get("/finance/bills/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    await refreshOverdue(orgId);
    const { id } = req.params as { id: string };
    const row = await findBill(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const [dto] = await hydrate(orgId, [row]);
    return dto;
  });

  app.post("/finance/bills", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const parsed = createBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const validated = await validateOrgIds(orgId, {
      categoryId: parsed.data.categoryId,
      costCenterId: parsed.data.costCenterId,
      jobId: parsed.data.jobId,
    });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const subTotal = sumLines(parsed.data.lines);
    const total = subTotal + parsed.data.taxCents;
    const issueDate = new Date(parsed.data.issueDate);
    if (Number.isNaN(issueDate.getTime())) return reply.code(400).send({ error: "invalid issueDate" });
    if (parsed.data.dueDate) {
      const due = new Date(parsed.data.dueDate);
      if (Number.isNaN(due.getTime())) return reply.code(400).send({ error: "invalid dueDate" });
    }

    const result = await withFinanceNumber(
      orgId,
      "bill",
      async (tx) => {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(supplierBills)
          .where(eq(supplierBills.orgId, orgId));
        return count;
      },
      (s) => ({ prefix: s.numbering.billPrefix, nextNumber: s.numbering.billNextNumber }),
      async (tx, number) => {
        const [row] = await tx
          .insert(supplierBills)
          .values({
            orgId,
            number,
            supplierName: parsed.data.supplierName,
            supplierReference: parsed.data.supplierReference ?? null,
            categoryId: parsed.data.categoryId ?? null,
            costCenterId: parsed.data.costCenterId ?? null,
            jobId: parsed.data.jobId ?? null,
            issueDate,
            dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
            status: parsed.data.status,
            subTotalCents: subTotal,
            taxCents: parsed.data.taxCents,
            totalCents: total,
            notes: parsed.data.notes ?? null,
          })
          .returning();
        await tx.insert(supplierBillLines).values(
          parsed.data.lines.map((l) => ({
            orgId,
            billId: row.id,
            description: l.description,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            amountCents: l.quantity * l.unitPriceCents,
          })),
        );
        return row;
      },
    );

    safeEmitActivity(orgId, "bill.created", `Created supplier bill ${result.number} from ${result.supplierName}`, {});
    const [dto] = await hydrate(orgId, [result]);
    return reply.code(201).send(dto);
  });

  app.patch("/finance/bills/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await findBill(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "DRAFT" && row.status !== "RECEIVED") {
      return reply.code(409).send({ error: `only DRAFT/RECEIVED bills can be edited (current: ${row.status})` });
    }
    if (row.paidCents > 0) return reply.code(409).send({ error: "cannot edit a bill with recorded payments" });

    const validated = await validateOrgIds(orgId, {
      categoryId: parsed.data.categoryId,
      costCenterId: parsed.data.costCenterId,
      jobId: parsed.data.jobId,
    });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    if (parsed.data.issueDate && Number.isNaN(new Date(parsed.data.issueDate).getTime())) {
      return reply.code(400).send({ error: "invalid issueDate" });
    }
    if (parsed.data.dueDate && Number.isNaN(new Date(parsed.data.dueDate).getTime())) {
      return reply.code(400).send({ error: "invalid dueDate" });
    }

    const lines = parsed.data.lines;
    const subTotal = lines ? sumLines(lines) : row.subTotalCents;
    const tax = parsed.data.taxCents ?? row.taxCents;
    const total = subTotal + tax;

    const [updated] = await db
      .update(supplierBills)
      .set({
        supplierName: parsed.data.supplierName,
        supplierReference: parsed.data.supplierReference,
        categoryId: parsed.data.categoryId,
        costCenterId: parsed.data.costCenterId,
        jobId: parsed.data.jobId,
        issueDate: parsed.data.issueDate ? new Date(parsed.data.issueDate) : row.issueDate,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : row.dueDate,
        taxCents: tax,
        subTotalCents: subTotal,
        totalCents: total,
        notes: parsed.data.notes,
        version: row.version + 1,
      })
      .where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.id, id), eq(supplierBills.version, row.version)))
      .returning();
    if (!updated) return reply.code(409).send({ error: "bill changed elsewhere; refresh and retry" });

    if (lines) {
      await db.delete(supplierBillLines).where(and(eq(supplierBillLines.orgId, orgId), eq(supplierBillLines.billId, id)));
      await db.insert(supplierBillLines).values(
        lines.map((l) => ({
          orgId,
          billId: id,
          description: l.description,
          quantity: l.quantity,
          unitPriceCents: l.unitPriceCents,
          amountCents: l.quantity * l.unitPriceCents,
        })),
      );
    }

    safeEmitActivity(orgId, "bill.updated", `Updated supplier bill ${updated.number}`, {});
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  // ── State machine ─────────────────────────────────────────────────────

  app.post("/finance/bills/:id/approve", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findBill(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "RECEIVED") return reply.code(409).send({ error: `only RECEIVED bills can be approved (current: ${row.status})` });
    const [updated] = await db
      .update(supplierBills)
      .set({ status: "APPROVED", approvedBy: claims.userId, approvedAt: new Date() })
      .where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.id, id)))
      .returning();
    safeEmitActivity(orgId, "bill.approved", `Approved supplier bill ${updated.number}`, {});
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.post("/finance/bills/:id/dispute", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findBill(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status === "PAID" || row.status === "VOIDED" || row.status === "DISPUTED") {
      return reply.code(409).send({ error: `cannot dispute a ${row.status} bill` });
    }
    const [updated] = await db
      .update(supplierBills)
      .set({ status: "DISPUTED" })
      .where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.id, id)))
      .returning();
    safeEmitActivity(orgId, "bill.disputed", `Marked supplier bill ${updated.number} disputed`, {});
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.post("/finance/bills/:id/void", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = reasonBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await findBill(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status === "VOIDED") return reply.code(409).send({ error: "bill already voided" });
    if (row.status === "PAID") return reply.code(409).send({ error: "cannot void a PAID bill" });
    const [updated] = await db
      .update(supplierBills)
      .set({ status: "VOIDED", voidedAt: new Date(), voidReason: parsed.data.reason })
      .where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.id, id)))
      .returning();
    safeEmitActivity(orgId, "bill.voided", `Voided supplier bill ${updated.number}: ${parsed.data.reason}`, {});
    const [dto] = await hydrate(orgId, [updated]);
    return dto;
  });

  app.delete("/finance/bills/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findBill(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "DRAFT" || row.paidCents > 0) {
      return reply.code(409).send({ error: "only draft bills without payments can be deleted" });
    }
    await db.delete(supplierBills).where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.id, id)));
    return { ok: true };
  });

  // ── Payments (overpayment prevented) ──────────────────────────────────

  app.post("/finance/bills/:id/payments", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = payBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(supplierBills)
        .where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.id, id)))
        .for("update");
      if (!row) return { kind: "not-found" as const };
      if (row.status === "VOIDED" || row.status === "DRAFT" || row.status === "DISPUTED") {
        return { kind: "invalid" as const, error: `cannot pay a ${row.status} bill` };
      }
      const balance = row.totalCents - row.paidCents;
      if (parsed.data.amountCents > balance) {
        return { kind: "overpay" as const, error: `payment of ${parsed.data.amountCents} exceeds balance of ${balance}` };
      }
      const newPaid = row.paidCents + parsed.data.amountCents;
      const status: BillStatus =
        newPaid >= row.totalCents ? "PAID" : row.status === "APPROVED" ? "PARTIALLY_PAID" : row.status;
      const [updated] = await tx
        .update(supplierBills)
        .set({ paidCents: newPaid, status, version: row.version + 1 })
        .where(eq(supplierBills.id, id))
        .returning();
      const [payment] = await tx
        .insert(billPayments)
        .values({
          orgId,
          billId: id,
          amountCents: parsed.data.amountCents,
          method: parsed.data.method,
          reference: parsed.data.reference ?? null,
          paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date(),
          paidBy: claims.userId,
        })
        .returning();
      return { kind: "paid" as const, bill: updated, payment };
    });

    if (result.kind === "not-found") return reply.code(404).send({ error: "bill not found" });
    if (result.kind === "invalid") return reply.code(409).send({ error: result.error });
    if (result.kind === "overpay") return reply.code(422).send({ error: result.error, code: "overpayment" });
    safeEmitActivity(orgId, "bill.payment.recorded", `Recorded ${result.payment.amountCents} payment on bill ${result.bill.number}`, {});
    const [dto] = await hydrate(orgId, [result.bill]);
    return dto;
  });

  app.delete("/finance/bills/:id/payments/:paymentId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id, paymentId } = req.params as { id: string; paymentId: string };
    const result = await db.transaction(async (tx) => {
      const [payment] = await tx
        .select()
        .from(billPayments)
        .where(and(eq(billPayments.orgId, orgId), eq(billPayments.billId, id), eq(billPayments.id, paymentId)))
        .for("update");
      if (!payment) return { kind: "not-found" as const };
      await tx.delete(billPayments).where(eq(billPayments.id, paymentId));
      const [row] = await tx
        .select()
        .from(supplierBills)
        .where(and(eq(supplierBills.orgId, orgId), eq(supplierBills.id, id)))
        .for("update");
      if (!row) return { kind: "not-found" as const };
      const newPaid = Math.max(0, row.paidCents - payment.amountCents);
      const status: BillStatus = newPaid <= 0 ? "APPROVED" : newPaid < row.totalCents ? "PARTIALLY_PAID" : "PAID";
      const [updated] = await tx
        .update(supplierBills)
        .set({ paidCents: newPaid, status, version: row.version + 1 })
        .where(eq(supplierBills.id, id))
        .returning();
      return { kind: "removed" as const, bill: updated };
    });
    if (result.kind === "not-found") return reply.code(404).send({ error: "payment not found" });
    safeEmitActivity(orgId, "bill.payment.removed", `Removed a payment from bill ${result.bill.number}`, {});
    const [dto] = await hydrate(orgId, [result.bill]);
    return dto;
  });

  // ── Recurring bills ───────────────────────────────────────────────────

  const recurringBody = z.object({
    supplierName: z.string().trim().min(1).max(200),
    supplierReference: z.string().trim().max(120).optional().nullable(),
    categoryId: z.string().uuid().optional().nullable(),
    costCenterId: z.string().uuid().optional().nullable(),
    jobId: z.string().uuid().optional().nullable(),
    frequency: z.enum(BILL_FREQUENCY).default("MONTHLY"),
    dayOfMonth: z.number().int().min(1).max(31).default(1),
    nextDueOn: z.string().min(1),
    subTotalCents: z.number().int().nonnegative().max(999_999_999),
    taxCents: z.number().int().nonnegative().max(999_999_999).default(0),
    notes: z.string().trim().max(2000).optional().nullable(),
    active: z.boolean().default(true),
  });

  app.get("/finance/recurring-bills", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const rows = await db
      .select()
      .from(recurringBills)
      .where(eq(recurringBills.orgId, orgId))
      .orderBy(desc(recurringBills.nextDueOn));
    const dto: RecurringBillDTO[] = rows.map((r) => ({
      id: r.id,
      supplierName: r.supplierName,
      supplierReference: r.supplierReference,
      categoryId: r.categoryId,
      costCenterId: r.costCenterId,
      jobId: r.jobId,
      frequency: r.frequency as BillFrequency,
      dayOfMonth: r.dayOfMonth,
      nextDueOn: r.nextDueOn.toISOString(),
      subTotalCents: r.subTotalCents,
      taxCents: r.taxCents,
      totalCents: r.totalCents,
      active: r.active,
      lastGeneratedAt: r.lastGeneratedAt?.toISOString() ?? null,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
    }));
    return dto;
  });

  app.post("/finance/recurring-bills", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const parsed = recurringBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const nextDueOn = new Date(parsed.data.nextDueOn);
    if (Number.isNaN(nextDueOn.getTime())) return reply.code(400).send({ error: "invalid nextDueOn" });
    const validated = await validateOrgIds(orgId, {
      categoryId: parsed.data.categoryId,
      costCenterId: parsed.data.costCenterId,
      jobId: parsed.data.jobId,
    });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const [row] = await db
      .insert(recurringBills)
      .values({
        orgId,
        supplierName: parsed.data.supplierName,
        supplierReference: parsed.data.supplierReference ?? null,
        categoryId: parsed.data.categoryId ?? null,
        costCenterId: parsed.data.costCenterId ?? null,
        jobId: parsed.data.jobId ?? null,
        frequency: parsed.data.frequency,
        dayOfMonth: parsed.data.dayOfMonth,
        nextDueOn,
        subTotalCents: parsed.data.subTotalCents,
        taxCents: parsed.data.taxCents,
        totalCents: parsed.data.subTotalCents + parsed.data.taxCents,
        active: parsed.data.active,
        notes: parsed.data.notes ?? null,
        createdBy: claims.userId,
      })
      .returning();
    return reply.code(201).send({ id: row.id });
  });

  app.patch("/finance/recurring-bills/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = recurringBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const nextDueOn = new Date(parsed.data.nextDueOn);
    if (Number.isNaN(nextDueOn.getTime())) return reply.code(400).send({ error: "invalid nextDueOn" });
    const validated = await validateOrgIds(orgId, {
      categoryId: parsed.data.categoryId,
      costCenterId: parsed.data.costCenterId,
      jobId: parsed.data.jobId,
    });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const [row] = await db
      .update(recurringBills)
      .set({
        supplierName: parsed.data.supplierName,
        supplierReference: parsed.data.supplierReference ?? null,
        categoryId: parsed.data.categoryId ?? null,
        costCenterId: parsed.data.costCenterId ?? null,
        jobId: parsed.data.jobId ?? null,
        frequency: parsed.data.frequency,
        dayOfMonth: parsed.data.dayOfMonth,
        nextDueOn,
        subTotalCents: parsed.data.subTotalCents,
        taxCents: parsed.data.taxCents,
        totalCents: parsed.data.subTotalCents + parsed.data.taxCents,
        active: parsed.data.active,
        notes: parsed.data.notes ?? null,
      })
      .where(and(eq(recurringBills.orgId, orgId), eq(recurringBills.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });

  app.delete("/finance/recurring-bills/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const [row] = await db
      .delete(recurringBills)
      .where(and(eq(recurringBills.orgId, orgId), eq(recurringBills.id, id)))
      .returning();
    if (!row) return reply.code(404).send({ error: "not found" });
    return { ok: true };
  });

  /** Generate the next supplier bill from a recurring template (manual). */
  app.post("/finance/recurring-bills/:id/generate", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!officeOnly(claims)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const template = await db
      .select()
      .from(recurringBills)
      .where(and(eq(recurringBills.orgId, orgId), eq(recurringBills.id, id)))
      .limit(1)
      .then((r) => r[0] as typeof recurringBills.$inferSelect | undefined);
    if (!template) return reply.code(404).send({ error: "not found" });
    if (!template.active) return reply.code(409).send({ error: "recurring bill is inactive" });

    const result = await withFinanceNumber(
      orgId,
      "bill",
      async (tx) => {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(supplierBills)
          .where(eq(supplierBills.orgId, orgId));
        return count;
      },
      (s) => ({ prefix: s.numbering.billPrefix, nextNumber: s.numbering.billNextNumber }),
      async (tx, number) => {
        const [row] = await tx
          .insert(supplierBills)
          .values({
            orgId,
            number,
            supplierName: template.supplierName,
            supplierReference: template.supplierReference,
            categoryId: template.categoryId,
            costCenterId: template.costCenterId,
            jobId: template.jobId,
            issueDate: new Date(),
            dueDate: template.frequency === "WEEKLY" ? addDays(new Date(), 0) : null,
            status: "RECEIVED",
            subTotalCents: template.subTotalCents,
            taxCents: template.taxCents,
            totalCents: template.totalCents,
            notes: template.notes,
          })
          .returning();
        await tx.insert(supplierBillLines).values({
          orgId,
          billId: row.id,
          description: `${template.frequency} subscription — ${template.supplierName}`,
          quantity: 1,
          unitPriceCents: template.subTotalCents,
          amountCents: template.subTotalCents,
        });
        return row;
      },
    );

    const next = advanceRecurringDate(template.frequency, template.dayOfMonth, template.nextDueOn);
    await db
      .update(recurringBills)
      .set({ lastGeneratedAt: new Date(), nextDueOn: next })
      .where(eq(recurringBills.id, id));

    safeEmitActivity(orgId, "bill.created", `Generated recurring bill ${result.number} from template ${template.supplierName}`, {});
    const [dto] = await hydrate(orgId, [result]);
    return dto;
  });
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function advanceRecurringDate(
  frequency: BillFrequency,
  dayOfMonth: number,
  from: Date,
): Date {
  const next = new Date(from);
  if (frequency === "WEEKLY") {
    next.setDate(next.getDate() + 7);
  } else {
    const add = frequency === "MONTHLY" ? 1 : frequency === "QUARTERLY" ? 3 : 12;
    next.setDate(1);
    next.setMonth(next.getMonth() + add);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(dayOfMonth, lastDay));
  }
  return next;
}