import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { sql, eq, and, inArray, desc, lt } from "drizzle-orm";
import {
  db,
  cashAdvances,
  advanceSettlements,
  reimbursements,
  expenses,
  jobs,
  users,
} from "@nnact/db";
import type {
  CashAdvanceDTO,
  AdvanceStatus,
  ReimbursementDTO,
  ReimbursementStatus,
  AdvanceSettlementDTO,
} from "@nnact/shared";
import { ADVANCE_STATUS, REIMBURSEMENT_STATUS } from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { isOfficeRole, withFinanceNumber } from "../finance-utils.js";
import { validateOrgIds } from "../finance-validate.js";
import { safeEmitActivity } from "../activities.js";
import { safeNotifyUser } from "../notify-user.js";
import {
  notifyAdvanceRequestedToOffice,
  notifyReimbursementSubmittedToOffice,
} from "../notify-office.js";
import { saveFinanceReceipt, receiptPublicUrl } from "../finance-files.js";

// ────────────────────────────────────────────────────────────────────────────
// Cash advances
// ────────────────────────────────────────────────────────────────────────────

const advanceCreate = z.object({
  amountCents: z.number().int().positive().max(999_999_999),
  reason: z.string().trim().min(1).max(2000),
  requiredForJobId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  settlementDueAt: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  employeeId: z.string().uuid().optional(),
});

const advancePatch = z.object({
  amountCents: z.number().int().positive().max(999_999_999).optional(),
  reason: z.string().trim().min(1).max(2000).optional(),
  requiredForJobId: z.string().uuid().optional().nullable(),
  categoryId: z.string().uuid().optional().nullable(),
  costCenterId: z.string().uuid().optional().nullable(),
  settlementDueAt: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const reasonBody = z.object({ reason: z.string().trim().min(1).max(2000) });

const settleBody = z.object({
  settledCents: z.number().int().positive().max(999_999_999),
  description: z.string().trim().max(2000).optional().nullable(),
  expenseIds: z.array(z.string().uuid()).default([]),
});

type AdvanceRow = typeof cashAdvances.$inferSelect;

/** Lazily flip disbursed-but-unsettled advances past due into OVERDUE. */
async function refreshOverdueAdvances(orgId: string, now = new Date()) {
  await db
    .update(cashAdvances)
    .set({ status: "OVERDUE" })
    .where(
      and(
        eq(cashAdvances.orgId, orgId),
        lt(cashAdvances.settlementDueAt, now),
        sql`${cashAdvances.settledCents} < ${cashAdvances.amountCents}`,
        sql`${cashAdvances.status} in ('DISBURSED', 'PARTIALLY_SETTLED')`,
      ),
    );
}

async function hydrateAdvances(orgId: string, rows: AdvanceRow[]): Promise<CashAdvanceDTO[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const employeeIds = new Set(rows.map((r) => r.employeeId));
  const jobIds = new Set(rows.map((r) => r.requiredForJobId).filter(Boolean) as string[]);

  const [settlementRows, employeeRows, jobRows] = await Promise.all([
    db
      .select()
      .from(advanceSettlements)
      .where(and(eq(advanceSettlements.orgId, orgId), inArray(advanceSettlements.advanceId, ids)))
      .orderBy(desc(advanceSettlements.settledAt)),
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...employeeIds])),
    jobIds.size
      ? db.select({ id: jobs.id, number: jobs.number }).from(jobs).where(and(eq(jobs.orgId, orgId), inArray(jobs.id, [...jobIds])))
      : Promise.resolve([] as { id: string; number: string | null }[]),
  ]);

  const employeeName = new Map(employeeRows.map((r) => [r.id, r.name]));
  const jobNumber = new Map(jobRows.map((r) => [r.id, r.number]));
  const settlementsByAdvance = new Map<string, typeof settlementRows>();
  for (const s of settlementRows) {
    const arr = settlementsByAdvance.get(s.advanceId) ?? [];
    arr.push(s);
    settlementsByAdvance.set(s.advanceId, arr);
  }

  return rows.map((r) => {
    const settlements = settlementsByAdvance.get(r.id) ?? [];
    return {
      id: r.id,
      number: r.number,
      employeeId: r.employeeId,
      employeeName: employeeName.get(r.employeeId) ?? null,
      amountCents: r.amountCents,
      reason: r.reason,
      requiredForJobId: r.requiredForJobId,
      jobNumber: r.requiredForJobId ? jobNumber.get(r.requiredForJobId) ?? null : null,
      categoryId: r.categoryId,
      costCenterId: r.costCenterId,
      status: r.status as AdvanceStatus,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      disbursedAt: r.disbursedAt?.toISOString() ?? null,
      settlementDueAt: r.settlementDueAt?.toISOString() ?? null,
      settledCents: r.settledCents,
      outstandingCents: Math.max(0, r.amountCents - r.settledCents),
      notes: r.notes,
      cancelReason: r.cancelReason,
      settlements: settlements.map(
        (s) =>
          ({
            id: s.id,
            advanceId: s.advanceId,
            settledCents: s.settledCents,
            description: s.description,
            expenseIds: s.expenseIds,
            settledByName: s.settledBy ? null : null,
            settledAt: s.settledAt.toISOString(),
          }) satisfies AdvanceSettlementDTO,
      ),
      version: r.version,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

async function findAdvance(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(cashAdvances)
    .where(and(eq(cashAdvances.orgId, orgId), eq(cashAdvances.id, id)))
    .limit(1);
  return row;
}

export async function financeAdvanceRoutes(app: FastifyInstance) {
  app.get("/finance/advances", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const q = z
      .object({ status: z.enum(ADVANCE_STATUS).optional(), employeeId: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(500).default(200) })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });
    await refreshOverdueAdvances(orgId);

    const conds = [eq(cashAdvances.orgId, orgId)];
    const office = isOfficeRole(claims.role);
    if (!office) conds.push(eq(cashAdvances.employeeId, claims.userId));
    if (q.data.status) conds.push(eq(cashAdvances.status, q.data.status));
    if (q.data.employeeId) {
      if (!office) return reply.code(403).send({ error: "office role required to filter by employee" });
      conds.push(eq(cashAdvances.employeeId, q.data.employeeId));
    }
    const rows = await db
      .select()
      .from(cashAdvances)
      .where(and(...conds))
      .orderBy(desc(cashAdvances.createdAt))
      .limit(q.data.limit);
    return hydrateAdvances(orgId, rows);
  });

  app.get("/finance/advances/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    await refreshOverdueAdvances(orgId);
    const { id } = req.params as { id: string };
    const row = await findAdvance(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (!isOfficeRole(claims.role) && row.employeeId !== claims.userId) {
      return reply.code(403).send({ error: "not your advance" });
    }
    const [dto] = await hydrateAdvances(orgId, [row]);
    return dto;
  });

  app.post("/finance/advances", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = advanceCreate.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const office = isOfficeRole(claims.role);
    const employeeId = parsed.data.employeeId ?? claims.userId;
    if (parsed.data.employeeId && !office) return reply.code(403).send({ error: "office role required to set employee" });
    if (!office && employeeId !== claims.userId) return reply.code(403).send({ error: "technicians may only request their own advances" });

    const validated = await validateOrgIds(orgId, {
      categoryId: parsed.data.categoryId,
      costCenterId: parsed.data.costCenterId,
      jobId: parsed.data.requiredForJobId,
      employeeId,
    });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });
    if (parsed.data.settlementDueAt && Number.isNaN(new Date(parsed.data.settlementDueAt).getTime())) {
      return reply.code(400).send({ error: "invalid settlementDueAt" });
    }

    const result = await withFinanceNumber(
      orgId,
      "advance",
      async (tx) => {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(cashAdvances)
          .where(eq(cashAdvances.orgId, orgId));
        return count;
      },
      (s) => ({ prefix: s.numbering.advancePrefix, nextNumber: s.numbering.advanceNextNumber }),
      async (tx, number) => {
        const [row] = await tx
          .insert(cashAdvances)
          .values({
            orgId,
            number,
            employeeId,
            amountCents: parsed.data.amountCents,
            reason: parsed.data.reason,
            requiredForJobId: parsed.data.requiredForJobId ?? null,
            categoryId: parsed.data.categoryId ?? null,
            costCenterId: parsed.data.costCenterId ?? null,
            settlementDueAt: parsed.data.settlementDueAt ? new Date(parsed.data.settlementDueAt) : null,
            notes: parsed.data.notes ?? null,
          })
          .returning();
        return row;
      },
    );

    safeEmitActivity(orgId, "advance.requested", `Advance requested ${result.number} for ${result.amountCents}`, { jobId: result.requiredForJobId ?? undefined });
    notifyAdvanceRequestedToOffice(orgId, claims.userId, claims.name ?? "Staff", result.number, result.amountCents);
    const [dto] = await hydrateAdvances(orgId, [result]);
    return reply.code(201).send(dto);
  });

  app.patch("/finance/advances/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = advancePatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await findAdvance(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your advance" });
    if (row.status !== "REQUESTED") return reply.code(409).send({ error: `only REQUESTED advances can be edited (current: ${row.status})` });
    const validated = await validateOrgIds(orgId, {
      categoryId: parsed.data.categoryId,
      costCenterId: parsed.data.costCenterId,
      jobId: parsed.data.requiredForJobId,
    });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const [updated] = await db
      .update(cashAdvances)
      .set({
        amountCents: parsed.data.amountCents,
        reason: parsed.data.reason,
        requiredForJobId: parsed.data.requiredForJobId,
        categoryId: parsed.data.categoryId,
        costCenterId: parsed.data.costCenterId,
        settlementDueAt: parsed.data.settlementDueAt ? new Date(parsed.data.settlementDueAt) : row.settlementDueAt,
        notes: parsed.data.notes,
        version: row.version + 1,
      })
      .where(and(eq(cashAdvances.orgId, orgId), eq(cashAdvances.id, id), eq(cashAdvances.version, row.version)))
      .returning();
    if (!updated) return reply.code(409).send({ error: "advance changed elsewhere; refresh and retry" });
    const [dto] = await hydrateAdvances(orgId, [updated]);
    return dto;
  });

  app.post("/finance/advances/:id/approve", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findAdvance(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "REQUESTED") return reply.code(409).send({ error: `cannot approve a ${row.status} advance` });
    const [updated] = await db
      .update(cashAdvances)
      .set({ status: "APPROVED", approveBy: claims.userId, approvedAt: new Date() })
      .where(and(eq(cashAdvances.orgId, orgId), eq(cashAdvances.id, id)))
      .returning();
    safeEmitActivity(orgId, "advance.approved", `Approved advance ${updated.number}`, { jobId: updated.requiredForJobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "advance.approved",
      title: "Advance approved",
      body: `Your advance ${updated.number} of ${(updated.amountCents / 100).toFixed(2)} was approved.`,
      link: `/finance/advances`,
    });
    const [dto] = await hydrateAdvances(orgId, [updated]);
    return dto;
  });

  app.post("/finance/advances/:id/disburse", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findAdvance(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "APPROVED") return reply.code(409).send({ error: `cannot disburse a ${row.status} advance` });
    const [updated] = await db
      .update(cashAdvances)
      .set({ status: "DISBURSED", disbursedBy: claims.userId, disbursedAt: new Date() })
      .where(and(eq(cashAdvances.orgId, orgId), eq(cashAdvances.id, id)))
      .returning();
    safeEmitActivity(orgId, "advance.disbursed", `Disbursed advance ${updated.number} to ${updated.employeeId}`, { jobId: updated.requiredForJobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "payment.received",
      title: "Advance disbursed",
      body: `Your advance ${updated.number} of ${(updated.amountCents / 100).toFixed(2)} has been disbursed.`,
      link: `/finance/advances`,
    });
    const [dto] = await hydrateAdvances(orgId, [updated]);
    return dto;
  });

  app.post("/finance/advances/:id/cancel", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = reasonBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const row = await findAdvance(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your advance" });
    if (row.status !== "REQUESTED" && row.status !== "APPROVED") {
      return reply.code(409).send({ error: `cannot cancel a ${row.status} advance` });
    }
    const [updated] = await db
      .update(cashAdvances)
      .set({ status: "CANCELLED", cancelReason: parsed.data.reason })
      .where(and(eq(cashAdvances.orgId, orgId), eq(cashAdvances.id, id)))
      .returning();
    safeEmitActivity(orgId, "advance.cancelled", `Cancelled advance ${updated.number}: ${parsed.data.reason}`, { jobId: updated.requiredForJobId ?? undefined });
    const [dto] = await hydrateAdvances(orgId, [updated]);
    return dto;
  });

  app.post("/finance/advances/:id/settle", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const parsed = settleBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const { id } = req.params as { id: string };
    const row = await findAdvance(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "DISBURSED" && row.status !== "PARTIALLY_SETTLED" && row.status !== "OVERDUE") {
      return reply.code(409).send({ error: `cannot settle a ${row.status} advance` });
    }
    const outstanding = row.amountCents - row.settledCents;
    if (parsed.data.settledCents > outstanding) {
      return reply.code(422).send({ error: `settlement of ${parsed.data.settledCents} exceeds outstanding ${outstanding}`, code: "oversettlement" });
    }

    if (parsed.data.expenseIds.length) {
      const expenseRows = await db
        .select({ id: expenses.id, employeeId: expenses.employeeId })
        .from(expenses)
        .where(and(eq(expenses.orgId, orgId), inArray(expenses.id, parsed.data.expenseIds)));
      if (expenseRows.length !== parsed.data.expenseIds.length) {
        return reply.code(400).send({ error: "one or more expenseIds do not exist in this org" });
      }
      if (expenseRows.some((e) => e.employeeId !== row.employeeId)) {
        return reply.code(400).send({ error: "linked expenses must belong to the advance employee" });
      }
    }

    const result = await db.transaction(async (tx) => {
      const [fresh] = await tx
        .select()
        .from(cashAdvances)
        .where(and(eq(cashAdvances.orgId, orgId), eq(cashAdvances.id, id)))
        .for("update");
      if (!fresh) return { kind: "not-found" as const };
      const remaining = fresh.amountCents - fresh.settledCents;
      if (parsed.data.settledCents > remaining) {
        return { kind: "over" as const };
      }
      const newSettled = fresh.settledCents + parsed.data.settledCents;
      const status: AdvanceStatus = newSettled >= fresh.amountCents ? "SETTLED" : "PARTIALLY_SETTLED";
      const [settlement] = await tx
        .insert(advanceSettlements)
        .values({
          orgId,
          advanceId: id,
          settledCents: parsed.data.settledCents,
          description: parsed.data.description ?? null,
          expenseIds: parsed.data.expenseIds,
          settledBy: claims.userId,
        })
        .returning();
      const [updated] = await tx
        .update(cashAdvances)
        .set({ settledCents: newSettled, status, version: fresh.version + 1 })
        .where(eq(cashAdvances.id, id))
        .returning();
      return { kind: "settled" as const, advance: updated, settlement };
    });

    if (result.kind === "not-found") return reply.code(404).send({ error: "advance not found" });
    if (result.kind === "over") return reply.code(422).send({ error: "settlement exceeds outstanding balance", code: "oversettlement" });
    safeEmitActivity(orgId, "advance.settled", `Settled ${result.settlement.settledCents} on advance ${result.advance.number}`, { jobId: result.advance.requiredForJobId ?? undefined });
    void safeNotifyUser(orgId, result.advance.employeeId, {
      type: "advance.settled",
      title: "Advance settlement",
      body: `${result.settlement.settledCents / 100} was settled against your advance ${result.advance.number}.`,
      link: `/finance/advances`,
    });
    const [dto] = await hydrateAdvances(orgId, [result.advance]);
    return dto;
  });

  app.delete("/finance/advances/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findAdvance(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your advance" });
    if (row.status !== "REQUESTED") {
      return reply.code(409).send({ error: `only REQUESTED advances can be deleted (current: ${row.status})` });
    }
    await db.delete(cashAdvances).where(and(eq(cashAdvances.orgId, orgId), eq(cashAdvances.id, id)));
    return { ok: true };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Reimbursements (employee already paid out of pocket)
// ────────────────────────────────────────────────────────────────────────────

const reimbursementCreate = z.object({
  amountCents: z.number().int().positive().max(999_999_999),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional(),
});

const reimbursementPatch = z.object({
  amountCents: z.number().int().positive().max(999_999_999).optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  jobId: z.string().uuid().optional().nullable(),
});

type ReimbursementRow = typeof reimbursements.$inferSelect;

async function hydrateReimbursements(orgId: string, rows: ReimbursementRow[]): Promise<ReimbursementDTO[]> {
  if (!rows.length) return [];
  const employeeIds = new Set(rows.map((r) => r.employeeId));
  const jobIds = new Set(rows.map((r) => r.jobId).filter(Boolean) as string[]);
  const [employeeRows, jobRows] = await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...employeeIds])),
    jobIds.size
      ? db.select({ id: jobs.id, number: jobs.number }).from(jobs).where(and(eq(jobs.orgId, orgId), inArray(jobs.id, [...jobIds])))
      : Promise.resolve([] as { id: string; number: string | null }[]),
  ]);
  const employeeName = new Map(employeeRows.map((r) => [r.id, r.name]));
  const jobNumber = new Map(jobRows.map((r) => [r.id, r.number]));
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    employeeId: r.employeeId,
    employeeName: employeeName.get(r.employeeId) ?? null,
    amountCents: r.amountCents,
    title: r.title,
    description: r.description,
    jobId: r.jobId,
    jobNumber: r.jobId ? jobNumber.get(r.jobId) ?? null : null,
    receiptUrls: r.receiptUrls,
    status: r.status as ReimbursementStatus,
    approvedAt: r.approvedAt?.toISOString() ?? null,
    rejectionReason: r.rejectionReason,
    paidAt: r.paidAt?.toISOString() ?? null,
    version: r.version,
    createdAt: r.createdAt.toISOString(),
  }));
}

async function findReimbursement(orgId: string, id: string) {
  const [row] = await db
    .select()
    .from(reimbursements)
    .where(and(eq(reimbursements.orgId, orgId), eq(reimbursements.id, id)))
    .limit(1);
  return row;
}

export async function financeReimbursementRoutes(app: FastifyInstance) {
  app.get("/finance/reimbursements", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const q = z
      .object({ status: z.enum(REIMBURSEMENT_STATUS).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) })
      .safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });
    const conds = [eq(reimbursements.orgId, orgId)];
    const office = isOfficeRole(claims.role);
    if (!office) conds.push(eq(reimbursements.employeeId, claims.userId));
    if (q.data.status) conds.push(eq(reimbursements.status, q.data.status));
    const rows = await db
      .select()
      .from(reimbursements)
      .where(and(...conds))
      .orderBy(desc(reimbursements.createdAt))
      .limit(q.data.limit);
    return hydrateReimbursements(orgId, rows);
  });

  app.get("/finance/reimbursements/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findReimbursement(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (!isOfficeRole(claims.role) && row.employeeId !== claims.userId) {
      return reply.code(403).send({ error: "not your reimbursement" });
    }
    const [dto] = await hydrateReimbursements(orgId, [row]);
    return dto;
  });

  app.post("/finance/reimbursements", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = reimbursementCreate.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const office = isOfficeRole(claims.role);
    const employeeId = parsed.data.employeeId ?? claims.userId;
    if (parsed.data.employeeId && !office) return reply.code(403).send({ error: "office role required to set employee" });
    if (!office && employeeId !== claims.userId) return reply.code(403).send({ error: "technicians may only claim their own reimbursements" });

    const validated = await validateOrgIds(orgId, { jobId: parsed.data.jobId, employeeId });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });

    const result = await withFinanceNumber(
      orgId,
      "reimbursement",
      async (tx) => {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(reimbursements)
          .where(eq(reimbursements.orgId, orgId));
        return count;
      },
      (s) => ({ prefix: s.numbering.reimbursementPrefix, nextNumber: s.numbering.reimbursementNextNumber }),
      async (tx, number) => {
        const [row] = await tx
          .insert(reimbursements)
          .values({
            orgId,
            number,
            employeeId,
            amountCents: parsed.data.amountCents,
            title: parsed.data.title,
            description: parsed.data.description ?? null,
            jobId: parsed.data.jobId ?? null,
          })
          .returning();
        return row;
      },
    );

    safeEmitActivity(orgId, "reimbursement.submitted", `Submitted reimbursement ${result.number} (${result.title})`, { jobId: result.jobId ?? undefined });
    notifyReimbursementSubmittedToOffice(orgId, claims.userId, claims.name ?? "Staff", result.number, result.amountCents);
    const [dto] = await hydrateReimbursements(orgId, [result]);
    return reply.code(201).send(dto);
  });

  app.patch("/finance/reimbursements/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = reimbursementPatch.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await findReimbursement(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your reimbursement" });
    if (row.status !== "SUBMITTED") return reply.code(409).send({ error: `only SUBMITTED reimbursements can be edited (current: ${row.status})` });
    const validated = await validateOrgIds(orgId, { jobId: parsed.data.jobId });
    if (!validated.ok) return reply.code(400).send({ error: validated.error });
    const [updated] = await db
      .update(reimbursements)
      .set({
        amountCents: parsed.data.amountCents,
        title: parsed.data.title,
        description: parsed.data.description,
        jobId: parsed.data.jobId,
        version: row.version + 1,
      })
      .where(and(eq(reimbursements.orgId, orgId), eq(reimbursements.id, id), eq(reimbursements.version, row.version)))
      .returning();
    if (!updated) return reply.code(409).send({ error: "reimbursement changed elsewhere; refresh and retry" });
    const [dto] = await hydrateReimbursements(orgId, [updated]);
    return dto;
  });

  app.post("/finance/reimbursements/:id/approve", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findReimbursement(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "SUBMITTED") return reply.code(409).send({ error: `cannot approve a ${row.status} reimbursement` });
    const [updated] = await db
      .update(reimbursements)
      .set({ status: "APPROVED", approvedBy: claims.userId, approvedAt: new Date(), rejectionReason: null })
      .where(and(eq(reimbursements.orgId, orgId), eq(reimbursements.id, id)))
      .returning();
    safeEmitActivity(orgId, "reimbursement.approved", `Approved reimbursement ${updated.number}`, { jobId: updated.jobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "bill_approval",
      title: "Reimbursement approved",
      body: `${updated.title} (${updated.number}) approved for ${(updated.amountCents / 100).toFixed(2)}.`,
      link: `/finance/reimbursements`,
    });
    const [dto] = await hydrateReimbursements(orgId, [updated]);
    return dto;
  });

  app.post("/finance/reimbursements/:id/pay", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const row = await findReimbursement(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "APPROVED") return reply.code(409).send({ error: `only APPROVED reimbursements can be paid (current: ${row.status})` });
    const [updated] = await db
      .update(reimbursements)
      .set({ status: "PAID", paidBy: claims.userId, paidAt: new Date() })
      .where(and(eq(reimbursements.orgId, orgId), eq(reimbursements.id, id)))
      .returning();
    safeEmitActivity(orgId, "reimbursement.paid", `Paid reimbursement ${updated.number}`, { jobId: updated.jobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "payment.received",
      title: "Reimbursement paid",
      body: `${updated.title} (${updated.number}) was paid.`,
      link: `/finance/reimbursements`,
    });
    const [dto] = await hydrateReimbursements(orgId, [updated]);
    return dto;
  });

  app.post("/finance/reimbursements/:id/reject", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "office role required" });
    const { id } = req.params as { id: string };
    const parsed = reasonBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const row = await findReimbursement(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    if (row.status !== "SUBMITTED") return reply.code(409).send({ error: `cannot reject a ${row.status} reimbursement` });
    const [updated] = await db
      .update(reimbursements)
      .set({ status: "REJECTED", approvedBy: null, approvedAt: null, rejectionReason: parsed.data.reason })
      .where(and(eq(reimbursements.orgId, orgId), eq(reimbursements.id, id)))
      .returning();
    safeEmitActivity(orgId, "reimbursement.rejected", `Rejected ${updated.number}: ${parsed.data.reason}`, { jobId: updated.jobId ?? undefined });
    void safeNotifyUser(orgId, updated.employeeId, {
      type: "document_updated",
      title: "Reimbursement rejected",
      body: `${updated.title} (${updated.number}) was rejected. Reason: ${parsed.data.reason}`,
      link: `/finance/reimbursements`,
    });
    const [dto] = await hydrateReimbursements(orgId, [updated]);
    return dto;
  });

  app.post("/finance/reimbursements/:id/receipt", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findReimbursement(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your reimbursement" });
    if (row.status === "PAID" || row.status === "REJECTED") {
      return reply.code(409).send({ error: `reimbursement is ${row.status}; receipts can no longer be attached` });
    }
    const data = await req.file();
    if (!data) return reply.code(400).send({ error: "multipart file required" });
    const record = await saveFinanceReceipt(orgId, { stream: data.file, filenameHint: data.filename });
    const url = receiptPublicUrl(orgId, record.fileId);
    const [updated] = await db
      .update(reimbursements)
      .set({ receiptUrls: [...row.receiptUrls, url] })
      .where(and(eq(reimbursements.orgId, orgId), eq(reimbursements.id, id)))
      .returning();
    const [dto] = await hydrateReimbursements(orgId, [updated]);
    return dto;
  });

  app.delete("/finance/reimbursements/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const row = await findReimbursement(orgId, id);
    if (!row) return reply.code(404).send({ error: "not found" });
    const office = isOfficeRole(claims.role);
    if (!office && row.employeeId !== claims.userId) return reply.code(403).send({ error: "not your reimbursement" });
    if (row.status !== "SUBMITTED") {
      return reply.code(409).send({ error: `only SUBMITTED reimbursements can be deleted (current: ${row.status})` });
    }
    await db.delete(reimbursements).where(and(eq(reimbursements.orgId, orgId), eq(reimbursements.id, id)));
    return { ok: true };
  });
}
