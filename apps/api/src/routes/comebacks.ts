// NNACT Pro — Comeback / "Retour" quality management routes.
//
// Case-centric API surface: intake, triage, scheduling, investigation,
// classification, resolution, monitoring, close/reopen, disputes, cost
// capture, corrective actions, evidence, customer communications, Repair
// Brain knowledge proposals, analytics, and technician metrics.
//
// Role notes: owners + dispatchers manage every case; technicians may report a
// comeback from a job they are assigned to, and may read/act on cases they are
// assigned. Numbering is org-scoped and advisory-lock guarded.

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, desc, asc, or, inArray, sql } from "drizzle-orm";
import {
  db,
  jobs,
  customers,
  equipment,
  users,
  knowledgeProposals,
  comebackCases,
  comebackStatusHistory,
  comebackCorrectiveActions,
  comebackCosts,
  comebackEvidence,
  comebackCommunications,
  comebackFollowUps,
} from "@nnact/db";
import {
  COMEBACK_STATUS,
  COMEBACK_SEVERITY,
  COMEBACK_FAULT_RELATIONSHIP,
  COMEBACK_INTAKE_REASON,
  COMEBACK_ROOT_CAUSE,
  COMEBACK_RESPONSIBILITY,
  COMEBACK_PREVENTABILITY,
  COMEBACK_BILLING_DECISION,
  COMEBACK_ACTION_STATUS,
  COMEBACK_CORRECTIVE_ACTION_KIND,
  COMEBACK_COST_KIND,
  COMEBACK_COST_CLASS,
  COMEBACK_EVIDENCE_KIND,
  COMEBACK_COMMUNICATION_KIND,
  COMEBACK_MONITORING_OUTCOME,
  canTransitionComeback,
  isOpenComeback,
  findComebackDuplicate,
  evalComebackWarranty,
  DEFAULT_COMEBACK_SETTINGS,
  COMEBACK_MONITORING_OUTCOME_LABEL,
  COMEBACK_COMMUNICATION_KIND_LABEL,
  computeComebackRate,
  type ComebackStatus,
  type ComebackSeverity,
  type ComebackFaultRelationship,
  type ComebackResponsibility,
  type ComebackRootCause,
  type ComebackPreventability,
  type ComebackBillingDecision,
  type ComebackWarrantyStatus,
  type ComebackCaseListItemDTO,
  type ComebackCaseDetailDTO,
  type ComebackAnalyticsDTO,
  type ComebackTechnicianMetricDTO,
} from "@nnact/shared";
import { resolveOrgId } from "./org.js";
import { verifiedClaims } from "../operational-authorization.js";
import { safeEmitActivity } from "../activities.js";
import { safeEmitEvent } from "../plugins/bus.js";
import { safeNotifyUser } from "../notify-user.js";
import { notifyComebackReportedToOffice, notifyComebackEscalatedToOwner } from "../notify-office.js";
import {
  isOfficeRole,
  orgSettings,
  orgComebackSettings,
  withComebackNumber,
  allocateComebackJobNumberTx,
  type CbTx,
} from "../comeback-utils.js";

type Claims = NonNullable<Awaited<ReturnType<typeof verifiedClaims>>>;
type CaseRow = typeof comebackCases.$inferSelect;

// ────────────────────────────────────────────────────────────────────────────
// Zod bodies
// ────────────────────────────────────────────────────────────────────────────

const listQuery = z.object({
  status: z.enum(COMEBACK_STATUS).optional(),
  severity: z.enum(COMEBACK_SEVERITY).optional(),
  originalJobId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  equipmentId: z.string().uuid().optional(),
  assignedTechnicianId: z.string().uuid().optional(),
  isRepeat: z.string().optional(),
  q: z.string().max(120).optional(),
  days: z.string().optional(),
  skip: z.string().optional(),
  take: z.string().optional(),
});

const createCaseBody = z.object({
  originalJobId: z.string().uuid(),
  complaintSummary: z.string().trim().min(1).max(500).optional(),
  complaintDetails: z.string().trim().max(5000).optional(),
  intakeReason: z.enum(COMEBACK_INTAKE_REASON).optional(),
  severity: z.enum(COMEBACK_SEVERITY).optional(),
  equipmentId: z.string().uuid().nullable().optional(),
  reportedAt: z.string().datetime().optional(),
});

const createFromJobBody = createCaseBody.omit({ originalJobId: true });

const patchBody = z.object({
  severity: z.enum(COMEBACK_SEVERITY).optional(),
  complaintSummary: z.string().trim().min(1).max(500).optional(),
  complaintDetails: z.string().trim().max(5000).nullable().optional(),
  assignedReviewerId: z.string().uuid().nullable().optional(),
  assignedTechnicianId: z.string().uuid().nullable().optional(),
  considerationNotes: z.string().max(2000).nullable().optional(),
  denyReason: z.string().max(2000).nullable().optional(),
});

const triageBody = z.object({
  assignedReviewerId: z.string().uuid().nullable().optional(),
  assignedTechnicianId: z.string().uuid().nullable().optional(),
  note: z.string().max(500).optional(),
});

const createJobBody = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  scheduledAt: z.string().datetime().nullable().optional(),
  technicianId: z.string().uuid().nullable().optional(),
});

const classifyBody = z.object({
  faultRelationship: z.enum(COMEBACK_FAULT_RELATIONSHIP),
  rootCause: z.enum(COMEBACK_ROOT_CAUSE).nullable().optional(),
  rootCauseNotes: z.string().max(2000).nullable().optional(),
  responsibility: z.enum(COMEBACK_RESPONSIBILITY).nullable().optional(),
  preventability: z.enum(COMEBACK_PREVENTABILITY).nullable().optional(),
  preventabilityNote: z.string().max(2000).nullable().optional(),
});

const resolveBody = z.object({
  resolutionSummary: z.string().trim().min(1).max(4000),
  billingDecision: z.enum(COMEBACK_BILLING_DECISION).optional(),
  chargeAmountCents: z.number().int().nonnegative().optional(),
  customerConfirmation: z.enum(["CONFIRMED_RESOLVED", "CONTACTED_PENDING", "DISPUTED_RESOLUTION"]).optional(),
  verificationNote: z.string().max(2000).nullable().optional(),
});

const monitorBody = z.object({ monitoringDays: z.number().int().min(1).max(90).optional() });

const followUpBody = z.object({
  outcome: z.enum(COMEBACK_MONITORING_OUTCOME),
  note: z.string().max(1000).nullable().optional(),
});

const closeBody = z.object({ reason: z.string().trim().max(500).nullable().optional() });
const notAComebackBody = z.object({
  reason: z.string().trim().min(1).max(500),
  considerationNotes: z.string().max(2000).nullable().optional(),
});
const disputeBody = z.object({ reason: z.string().trim().min(1).max(500) });
const reopenBody = z.object({ reason: z.string().trim().min(1).max(500) });

const costBody = z.object({
  kind: z.enum(COMEBACK_COST_KIND),
  costClass: z.enum(COMEBACK_COST_CLASS),
  description: z.string().trim().min(1).max(500),
  amountCents: z.number().int().nonnegative(),
  supplierName: z.string().max(200).nullable().optional(),
  modelPartId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
});

const evidenceBody = z.object({
  kind: z.enum(COMEBACK_EVIDENCE_KIND),
  photoId: z.string().uuid().nullable().optional(),
  jobId: z.string().uuid().nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
});

const correctiveBody = z.object({
  kind: z.enum(COMEBACK_CORRECTIVE_ACTION_KIND),
  description: z.string().trim().min(1).max(1000),
  ownerId: z.string().uuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional(),
  affectsProcedure: z.boolean().optional(),
});

const actionPatchBody = z.object({ status: z.enum(COMEBACK_ACTION_STATUS) });

const commBody = z.object({
  kind: z.enum(COMEBACK_COMMUNICATION_KIND),
  summary: z.string().trim().min(1).max(1000),
  happenedAt: z.string().datetime().nullable().optional(),
});

const knowledgeBody = z.object({ rationale: z.string().max(2000).nullable().optional() });

// ────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ────────────────────────────────────────────────────────────────────────────

async function loadCaseScoped(
  orgId: string,
  id: string,
  claims: Claims,
): Promise<{ row: CaseRow; write: boolean } | null> {
  const isOffice = isOfficeRole(claims.role);
  const where = isOffice
    ? and(eq(comebackCases.orgId, orgId), eq(comebackCases.id, id))
    : and(
        eq(comebackCases.orgId, orgId),
        eq(comebackCases.id, id),
        or(eq(comebackCases.assignedTechnicianId, claims.userId), eq(comebackCases.reportedBy, claims.userId)),
      );
  const [row] = await db.select().from(comebackCases).where(where).limit(1);
  if (!row) return null;
  return { row, write: isOffice || row.assignedTechnicianId === claims.userId };
}

async function appendStatusHistory(
  tx: CbTx,
  orgId: string,
  caseId: string,
  fromStatus: ComebackStatus | null,
  toStatus: ComebackStatus,
  changedBy: string,
  reason?: string | null,
): Promise<void> {
  await tx.insert(comebackStatusHistory).values({
    orgId,
    caseId,
    fromStatus,
    toStatus,
    changedBy,
    reason: reason ?? null,
  });
}

class CbTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transition ${from} → ${to} is not allowed for this case status`);
  }
}

/** Set a case status with an immutable history row, inside one transaction. */
async function transitionCase(
  orgId: string,
  caseId: string,
  toStatus: ComebackStatus,
  changedBy: string,
  reason?: string | null,
  fields: Partial<typeof comebackCases.$inferInsert> = {},
): Promise<{ fromStatus: ComebackStatus; toStatus: ComebackStatus }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({ id: comebackCases.id, status: comebackCases.status })
      .from(comebackCases)
      .where(and(eq(comebackCases.orgId, orgId), eq(comebackCases.id, caseId)))
      .limit(1);
    if (!current) throw new Error("case not found");
    const fromStatus = current.status as ComebackStatus;
    if (!canTransitionComeback(fromStatus, toStatus)) {
      throw new CbTransitionError(fromStatus, toStatus);
    }
    await tx
      .update(comebackCases)
      .set({ ...fields, status: toStatus, updatedAt: new Date() })
      .where(eq(comebackCases.id, caseId));
    await appendStatusHistory(tx, orgId, caseId, fromStatus, toStatus, changedBy, reason);
    return { fromStatus, toStatus };
  });
}

async function loadNames(orgId: string, userIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean) as string[])];
  if (!ids.length) return new Map();
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.orgId, orgId), inArray(users.id, ids)));
  return new Map(rows.map((r) => [r.id, r.name]));
}

/** Sum cost lines per case into money buckets (all cases in `ids`). */
async function costBuckets(
  orgId: string,
  ids: string[],
): Promise<Map<string, { internal: number; billable: number; supplier: number }>> {
  if (!ids.length) return new Map();
  const rows = await db
    .select({ caseId: comebackCosts.caseId, costClass: comebackCosts.costClass, amountCents: comebackCosts.amountCents })
    .from(comebackCosts)
    .where(and(eq(comebackCosts.orgId, orgId), inArray(comebackCosts.caseId, ids)));
  const map = new Map<string, { internal: number; billable: number; supplier: number }>();
  for (const c of rows) {
    const entry = map.get(c.caseId) ?? { internal: 0, billable: 0, supplier: 0 };
    if (c.costClass === "BILLABLE_COMEBACK") entry.billable += c.amountCents;
    else if (c.costClass === "SUPPLIER_RECOVERABLE") entry.supplier += c.amountCents;
    else entry.internal += c.amountCents;
    map.set(c.caseId, entry);
  }
  return map;
}

/** Roll up RESOLVED / CLOSED timestamps from the status history. */
async function resolveCloseTimestamps(
  orgId: string,
  ids: string[],
): Promise<Map<string, { resolvedAt: Date | null; closedAt: Date | null }>> {
  const map = new Map<string, { resolvedAt: Date | null; closedAt: Date | null }>();
  if (!ids.length) return map;
  const rows = await db
    .select({ caseId: comebackStatusHistory.caseId, toStatus: comebackStatusHistory.toStatus, createdAt: comebackStatusHistory.createdAt })
    .from(comebackStatusHistory)
    .where(and(eq(comebackStatusHistory.orgId, orgId), inArray(comebackStatusHistory.caseId, ids)));
  for (const r of rows) {
    const entry = map.get(r.caseId) ?? { resolvedAt: null, closedAt: null };
    if (r.toStatus === "RESOLVED" && !entry.resolvedAt) entry.resolvedAt = r.createdAt;
    if (r.toStatus === "CLOSED" && !entry.closedAt) entry.closedAt = r.createdAt;
    map.set(r.caseId, entry);
  }
  return map;
}

type ListItem = ComebackCaseListItemDTO;
type Detail = ComebackCaseDetailDTO;

async function assembleList(orgId: string, rows: CaseRow[]): Promise<ListItem[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const [jobRows, customerRows, equipmentRows, buckets, stamps, names] = await Promise.all([
    rows.some((r) => r.originalJobId)
      ? db.select({ id: jobs.id, number: jobs.number }).from(jobs).where(inArray(jobs.id, rows.map((r) => r.originalJobId).filter(Boolean) as string[]))
      : Promise.resolve([] as { id: string; number: string | null }[]),
    rows.some((r) => r.customerId)
      ? db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, rows.map((r) => r.customerId).filter(Boolean) as string[]))
      : Promise.resolve([] as { id: string; name: string | null }[]),
    rows.some((r) => r.equipmentId)
      ? db.select({ id: equipment.id, type: equipment.type, make: equipment.make, model: equipment.model }).from(equipment).where(inArray(equipment.id, rows.map((r) => r.equipmentId).filter(Boolean) as string[]))
      : Promise.resolve([] as { id: string; type: string; make: string | null; model: string | null }[]),
    costBuckets(orgId, ids),
    resolveCloseTimestamps(orgId, ids),
    loadNames(orgId, rows.map((r) => r.reportedBy)),
  ]);
  const jobMap = new Map(jobRows.map((r) => [r.id, r.number]));
  const customerMap = new Map(customerRows.map((r) => [r.id, r.name]));
  const equipmentMap = new Map(equipmentRows.map((r) => [r.id, `${r.make ?? ""} ${r.model ?? ""} ${r.type}`.trim().replace(/\s+/g, " ")]));
  return rows.map((r) => {
    const sums = buckets.get(r.id) ?? { internal: 0, billable: 0, supplier: 0 };
    const stampsRow = stamps.get(r.id);
    return {
      id: r.id,
      orgId: r.orgId,
      caseNumber: r.caseNumber,
      originalJobId: r.originalJobId,
      originalJobNumber: r.originalJobId ? jobMap.get(r.originalJobId) ?? null : null,
      customerId: r.customerId,
      customerName: r.customerId ? customerMap.get(r.customerId) ?? null : null,
      equipmentId: r.equipmentId,
      equipmentLabel: r.equipmentId ? equipmentMap.get(r.equipmentId) ?? null : null,
      complaintSummary: r.complaintSummary,
      status: r.status as ComebackStatus,
      severity: r.severity as ComebackSeverity,
      faultRelationship: r.faultRelationship as ComebackFaultRelationship,
      responsibility: r.responsibility as ComebackResponsibility | null,
      billingDecision: r.billingDecision as ComebackBillingDecision,
      warrantyStatus: r.warrantyStatus as ComebackWarrantyStatus,
      repeatNumber: r.repeatNumber,
      escalationLevel: r.escalationLevel,
      reportedAt: r.reportedAt,
      resolvedAt: stampsRow?.resolvedAt ?? null,
      closedAt: stampsRow?.closedAt ?? null,
      internalCostCents: sums.internal,
      assignedTechnicianId: r.assignedTechnicianId,
    };
  });
}

async function assembleDetail(orgId: string, row: CaseRow): Promise<Detail> {
  const ids = [row.id];
  const [originalJob, customerRow, equipmentRow, buckets, stamps, costs, actions, evidence, comms, followUps, history] =
    await Promise.all([
      row.originalJobId
        ? db
            .select({ id: jobs.id, number: jobs.number, title: jobs.title, status: jobs.status, description: jobs.description, updatedAt: jobs.updatedAt })
            .from(jobs)
            .where(eq(jobs.id, row.originalJobId))
            .limit(1)
            .then((r) => r[0] ?? null)
        : Promise.resolve(null),
      row.customerId
        ? db.select({ id: customers.id, name: customers.name, phone: customers.phone, email: customers.email }).from(customers).where(eq(customers.id, row.customerId)).limit(1).then((r) => r[0] ?? null)
        : Promise.resolve(null),
      row.equipmentId
        ? db
            .select({ id: equipment.id, type: equipment.type, make: equipment.make, model: equipment.model, serialNumber: equipment.serialNumber, equipmentModelId: equipment.equipmentModelId, warrantyExpiry: equipment.warrantyExpiry })
            .from(equipment)
            .where(eq(equipment.id, row.equipmentId))
            .limit(1)
            .then((r) => r[0] ?? null)
        : Promise.resolve(null),
      costBuckets(orgId, ids),
      resolveCloseTimestamps(orgId, ids),
      db.select().from(comebackCosts).where(and(eq(comebackCosts.orgId, orgId), eq(comebackCosts.caseId, row.id))).orderBy(desc(comebackCosts.createdAt)),
      db.select().from(comebackCorrectiveActions).where(and(eq(comebackCorrectiveActions.orgId, orgId), eq(comebackCorrectiveActions.caseId, row.id))).orderBy(desc(comebackCorrectiveActions.createdAt)),
      db.select().from(comebackEvidence).where(and(eq(comebackEvidence.orgId, orgId), eq(comebackEvidence.caseId, row.id))).orderBy(desc(comebackEvidence.createdAt)),
      db.select().from(comebackCommunications).where(and(eq(comebackCommunications.orgId, orgId), eq(comebackCommunications.caseId, row.id))).orderBy(desc(comebackCommunications.happenedAt)),
      db.select().from(comebackFollowUps).where(and(eq(comebackFollowUps.orgId, orgId), eq(comebackFollowUps.caseId, row.id))).orderBy(asc(comebackFollowUps.scheduledAt)),
      db.select().from(comebackStatusHistory).where(and(eq(comebackStatusHistory.orgId, orgId), eq(comebackStatusHistory.caseId, row.id))).orderBy(asc(comebackStatusHistory.createdAt)),
    ]);
  const names = await loadNames(orgId, [
    row.reportedBy,
    row.assignedReviewerId,
    row.assignedTechnicianId,
    ...costs.map((c) => c.recordedBy),
    ...actions.map((a) => a.createdBy),
    ...evidence.map((e) => e.createdBy),
    ...comms.map((c) => c.createdBy),
    ...followUps.map((f) => f.checkedBy),
    ...history.map((h) => h.changedBy),
  ]);

  const sums = buckets.get(row.id) ?? { internal: 0, billable: 0, supplier: 0 };
  const stampsRow = stamps.get(row.id);

  const warranty = {
    status: (row.warrantyStatus ?? "UNCLEAR") as ComebackWarrantyStatus,
    workmanshipEndsAt: row.workmanshipWarrantyEndsAt ? row.workmanshipWarrantyEndsAt.toISOString() : null,
    partsEndsAt: row.partsWarrantyEndsAt ? row.partsWarrantyEndsAt.toISOString() : null,
  };

  return {
    id: row.id,
    orgId: row.orgId,
    caseNumber: row.caseNumber,
    originalJobId: row.originalJobId,
    originalJobNumber: originalJob?.number ?? null,
    customerId: row.customerId,
    customerName: customerRow?.name ?? null,
    equipmentId: row.equipmentId,
    equipmentLabel: equipmentRow ? `${equipmentRow.make ?? ""} ${equipmentRow.model ?? ""} ${equipmentRow.type}`.trim().replace(/\s+/g, " ") : null,
    complaintSummary: row.complaintSummary,
    status: row.status as ComebackStatus,
    severity: row.severity as ComebackSeverity,
    faultRelationship: row.faultRelationship as ComebackFaultRelationship,
    responsibility: row.responsibility as ComebackResponsibility | null,
    billingDecision: row.billingDecision as ComebackBillingDecision,
    warrantyStatus: warranty.status,
    repeatNumber: row.repeatNumber,
    escalationLevel: row.escalationLevel,
    reportedAt: row.reportedAt,
    resolvedAt: stampsRow?.resolvedAt ?? null,
    closedAt: stampsRow?.closedAt ?? null,
    internalCostCents: sums.internal,
    assignedTechnicianId: row.assignedTechnicianId,
    intakeReason: row.intakeReason as never,
    complaintDetails: row.complaintDetails,
    originalComplaint: row.originalComplaint,
    originalDiagnosis: row.originalDiagnosis,
    originalRepairSummary: row.originalRepairSummary,
    originalJobCompletedAt: originalJob?.status === "completed" ? originalJob.updatedAt.toISOString() : null,
    rootCause: row.rootCause as ComebackRootCause | null,
    rootCauseNotes: row.rootCauseNotes,
    preventability: row.preventability as ComebackPreventability | null,
    preventabilityNote: row.preventabilityNote,
    customerConfirmation: row.customerConfirmation as never,
    monitoringOutcome: row.monitoringOutcome as never,
    assignedReviewerId: row.assignedReviewerId,
    warranty: {
      status: warranty.status,
      workmanshipEndsAt: warranty.workmanshipEndsAt,
      partsEndsAt: warranty.partsEndsAt,
    },
    resolutionSummary: row.resolutionSummary,
    chargeAmountCents: row.chargeAmountCents,
    costs: costs.map((c) => ({
      id: c.id,
      kind: c.kind,
      costClass: c.costClass,
      description: c.description,
      amountCents: c.amountCents,
      supplierName: c.supplierName,
      recordedBy: names.get(c.recordedBy ?? "") ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    correctiveActions: actions.map((a) => ({
      id: a.id,
      kind: a.kind,
      description: a.description,
      ownerId: a.ownerId,
      status: a.status,
      dueAt: a.dueAt ? a.dueAt.toISOString() : null,
      completedAt: a.completedAt ? a.completedAt.toISOString() : null,
      createdAt: a.createdAt.toISOString(),
    })),
    evidence: evidence.map((e) => ({
      id: e.id,
      kind: e.kind,
      photoId: e.photoId,
      note: e.note,
      createdBy: names.get(e.createdBy ?? "") ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    communications: comms.map((c) => ({
      id: c.id,
      kind: c.kind,
      summary: c.summary,
      happenedAt: c.happenedAt.toISOString(),
      createdBy: names.get(c.createdBy ?? "") ?? null,
      createdAt: c.createdAt.toISOString(),
    })),
    followUps: followUps.map((f) => ({
      id: f.id,
      scheduledAt: f.scheduledAt.toISOString(),
      outcome: f.outcome,
      note: f.note,
      checkedBy: names.get(f.checkedBy ?? "") ?? null,
      checkedAt: f.checkedAt ? f.checkedAt.toISOString() : null,
      createdAt: f.createdAt.toISOString(),
    })),
    statusHistory: history.map((h) => ({
      fromStatus: h.fromStatus as ComebackStatus | null,
      toStatus: h.toStatus as ComebackStatus,
      reason: h.reason,
      changedBy: names.get(h.changedBy ?? "") ?? null,
      createdAt: h.createdAt.toISOString(),
    })),
    considerationNotes: row.considerationNotes,
    denyReason: row.denyReason,
  };
}

/** Evaluate + persist the stored warranty snapshot for a fresh case. */
async function snapshotWarrantyForOriginalJob(
  orgId: string,
  originalJobId: string | null,
  equipmentId: string | null,
): Promise<{ warrantyStatus: ComebackWarrantyStatus; workmanshipWarrantyEndsAt: Date | null; partsWarrantyEndsAt: Date | null }> {
  const settings = await orgComebackSettings(orgId);
  let completedAt: Date | null = null;
  let equipmentExpiry: Date | null = null;
  if (originalJobId) {
    const [jobRow] = await db
      .select({ status: jobs.status, updatedAt: jobs.updatedAt })
      .from(jobs)
      .where(eq(jobs.id, originalJobId))
      .limit(1);
    if (jobRow?.status === "completed") completedAt = jobRow.updatedAt;
  }
  if (equipmentId) {
    const [eqRow] = await db.select({ warrantyExpiry: equipment.warrantyExpiry }).from(equipment).where(eq(equipment.id, equipmentId)).limit(1);
    equipmentExpiry = eqRow?.warrantyExpiry ?? null;
  }
  const w = evalComebackWarranty({
    workmanshipWarrantyDays: settings.workmanshipWarrantyDays,
    partsWarrantyDays: settings.partsWarrantyDays,
    completedAt,
    equipmentWarrantyExpiry: equipmentExpiry,
  });
  return {
    warrantyStatus: w.status,
    workmanshipWarrantyEndsAt: w.workmanshipEndsAt,
    partsWarrantyEndsAt: w.partsEndsAt,
  };
}

/** Create a comeback case (shared by POST / and POST /jobs/:jobId/comeback). */
async function createCase(
  req: FastifyRequest,
  reply: Reply,
  orgId: string,
  claims: Claims,
  body: z.infer<typeof createCaseBody>,
  lockedOriginalJobId: string,
): Promise<ReturnType<typeof reply.send>> {
  const settings = await orgSettings(orgId);
  const comebackSettings = settings.comeback ?? DEFAULT_COMEBACK_SETTINGS;
  if (!comebackSettings.enabled) {
    return reply.code(403).send({ error: "comeback intake is disabled for this organization" });
  }

  const [originalJob] = await db
    .select({
      id: jobs.id,
      number: jobs.number,
      title: jobs.title,
      description: jobs.description,
      customerId: jobs.customerId,
      propertyId: jobs.propertyId,
      status: jobs.status,
      assignedTo: jobs.assignedTo,
      serviceCategory: jobs.serviceCategory,
      serviceAddress: jobs.serviceAddress,
      source: jobs.source,
    })
    .from(jobs)
    .where(and(eq(jobs.orgId, orgId), eq(jobs.id, lockedOriginalJobId)))
    .limit(1);
  if (!originalJob) {
    return reply.code(404).send({ error: "original job not found in this organization" });
  }
  if (!isOfficeRole(claims.role)) {
    const allowed = comebackSettings.allowTechnicianSelfReport && originalJob.assignedTo === claims.userId;
    if (!allowed) {
      return reply.code(403).send({ error: "technicians may only report comebacks from jobs assigned to them" });
    }
  }

  // Duplicate guard: warn (never block) on an open, recent case for the same job.
  const openRecentCases = await db
    .select({ id: comebackCases.id, caseNumber: comebackCases.caseNumber, originalJobId: comebackCases.originalJobId, complaintSummary: comebackCases.complaintSummary, createdAt: comebackCases.createdAt })
    .from(comebackCases)
    .where(
      and(
        eq(comebackCases.orgId, orgId),
        eq(comebackCases.originalJobId, originalJob.id),
        inArray(comebackCases.status, COMEBACK_STATUS.filter((s) => isOpenComeback(s))),
      ),
    );
  const duplicate = findComebackDuplicate(openRecentCases as never, originalJob.id, body.complaintSummary ?? originalJob.title, {
    duplicateWindowDays: comebackSettings.duplicateWindowDays,
  });
  const duplicates = duplicate ? [duplicate.caseNumber] : [];

  const priorCount = await db
    .select({ id: comebackCases.id })
    .from(comebackCases)
    .where(and(eq(comebackCases.orgId, orgId), eq(comebackCases.originalJobId, originalJob.id)))
    .then((rows) => rows.length);
  const repeatNumber = priorCount + 1;

  const equipmentId = body.equipmentId ?? null;
  const warranty = await snapshotWarrantyForOriginalJob(orgId, originalJob.id, equipmentId);

  const result = await withComebackNumber(orgId, originalJob.id, async (tx) => {
    const count = await tx
      .select({ id: comebackCases.id })
      .from(comebackCases)
      .where(and(eq(comebackCases.orgId, orgId)))
      .then((rows) => rows.length);
    return count;
  }, settings, async (tx, caseNumber) => {
    const [created] = await tx
      .insert(comebackCases)
      .values({
        orgId,
        caseNumber,
        originalJobId: originalJob.id,
        customerId: originalJob.customerId,
        propertyId: originalJob.propertyId,
        equipmentId,
        reportedBy: claims.userId,
        reportedAt: body.reportedAt ? new Date(body.reportedAt) : new Date(),
        intakeReason: body.intakeReason ?? "CUSTOMER_CALLED",
        complaintSummary: body.complaintSummary ?? originalJob.title,
        complaintDetails: body.complaintDetails ?? null,
        originalComplaint: originalJob.title,
        originalDiagnosis: originalJob.description ?? null,
        originalRepairSummary: `${originalJob.number ?? ""} — ${originalJob.title}`.trim(),
        severity: body.severity ?? "MEDIUM",
        status: "REPORTED",
        warrantyStatus: warranty.warrantyStatus,
        workmanshipWarrantyEndsAt: warranty.workmanshipWarrantyEndsAt,
        partsWarrantyEndsAt: warranty.partsWarrantyEndsAt,
        repeatNumber,
        escalationLevel: 0,
        escalated: false,
        customerConfirmation: "NOT_CONTACTED",
        monitoringOutcome: "PENDING",
        billingDecision: "PENDING_REVIEW",
        chargeAmountCents: 0,
        version: 1,
      })
      .returning();
    await tx.insert(comebackStatusHistory).values({
      orgId,
      caseId: created.id,
      fromStatus: null,
      toStatus: "REPORTED",
      changedBy: claims.userId,
      reason: "comeback reported",
    });
    await tx.insert(comebackCommunications).values({
      orgId,
      caseId: created.id,
      kind: "COMPLAINT_RECEIVED",
      summary: `Comeback ${caseNumber} reported against job ${originalJob.number ?? ""}: "${created.complaintSummary}"`,
      happenedAt: created.reportedAt,
      createdBy: claims.userId,
    });
    return created;
  });

  safeEmitActivity(orgId, "comeback.reported", `Comeback ${result.caseNumber} reported against ${originalJob.number ?? "job"}`, {
    customerId: result.customerId,
    jobId: result.originalJobId ?? undefined,
  });
  void safeEmitEvent(orgId, "comeback.reported", { id: result.id, caseNumber: result.caseNumber, originalJobId: result.originalJobId });
  void notifyComebackReportedToOffice(orgId, claims.userId, claims.userId, result.caseNumber, result.complaintSummary);

  const detail = await assembleDetail(orgId, result);
  return reply.code(201).send({ case: detail, duplicateWarning: duplicates });
}

/** Create a comeback work-order (visit) under the case. */
async function createComebackJob(
  orgId: string,
  claims: Claims,
  row: CaseRow,
  body: z.infer<typeof createJobBody>,
): Promise<typeof jobs.$inferSelect> {
  const [originalJob] = row.originalJobId
    ? await db
        .select({ customerId: jobs.customerId, propertyId: jobs.propertyId, serviceCategory: jobs.serviceCategory, serviceAddress: jobs.serviceAddress, number: jobs.number })
        .from(jobs)
        .where(eq(jobs.id, row.originalJobId))
        .limit(1)
    : [];
  const customerId = (row.customerId ?? originalJob?.customerId) ?? null;
  if (!customerId) throw new Error("case has no customer");

  const created = await db.transaction(async (tx) => {
    const number = await allocateComebackJobNumberTx(tx, orgId);
    const [jobRow] = await tx
      .insert(jobs)
      .values({
        orgId,
        customerId,
        propertyId: row.propertyId ?? originalJob?.propertyId ?? null,
        assignedTo: body.technicianId ?? row.assignedTechnicianId ?? null,
        number,
        title: body.title ?? `Comeback visit — ${row.caseNumber}`,
        description: body.description ?? `Operational visit for comeback case ${row.caseNumber}. Original job ${originalJob?.number ?? ""}.`,
        status: "scheduled",
        source: "staff",
        jobType: "comeback",
        comebackCaseId: row.id,
        originalJobId: row.originalJobId,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : undefined,
        serviceCategory: originalJob?.serviceCategory ?? null,
        serviceAddress: originalJob?.serviceAddress ?? null,
        total: 0,
        laborCostCents: 0,
      })
      .returning();
    await tx.insert(comebackStatusHistory).values({
      orgId,
      caseId: row.id,
      fromStatus: row.status,
      toStatus: "SCHEDULED",
      changedBy: claims.userId,
      reason: "comeback visit scheduled",
    });
    await tx
      .update(comebackCases)
      .set({ status: "SCHEDULED", updatedAt: new Date() })
      .where(eq(comebackCases.id, row.id));
    return jobRow;
  });

  safeEmitActivity(orgId, "job.created", `Created ${created.number ?? ""}: ${created.title}`, {
    customerId,
    jobId: created.id,
  });
  safeEmitActivity(orgId, "comeback.scheduled", `Comeback visit scheduled for ${row.caseNumber}`, {
    customerId,
    jobId: created.id,
  });
  void safeEmitEvent(orgId, "job.created", { id: created.id, title: created.title, number: created.number, customerId, status: created.status });
  if (created.assignedTo) {
    void safeNotifyUser(orgId, created.assignedTo, {
      type: "comeback.visit",
      title: `Comeback visit · ${row.caseNumber}`,
      body: `You have a comeback visit: ${created.title}`,
      link: `/jobs/${created.id}`,
      jobId: created.id,
    });
  }
  return created;
}

// ────────────────────────────────────────────────────────────────────────────
// Route registration
// ────────────────────────────────────────────────────────────────────────────

export async function comebackRoutes(app: FastifyInstance) {
  const requireOffice = async (req: FastifyRequest, reply: Reply, claims: Claims | null): Promise<boolean> => {
    if (!claims || reply.sent) return false;
    if (!isOfficeRole(claims.role)) {
      await reply.code(403).send({ error: "only owners and dispatchers may manage comebacks" });
      return false;
    }
    return true;
  };

  // GET / — case list with filters
  app.get("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;

    const q = listQuery.safeParse(req.query);
    if (!q.success) return reply.code(400).send({ error: q.error.flatten() });
    const f = q.data;
    const skip = f.skip ? parseInt(f.skip, 10) : 0;
    const take = Math.min(parseInt(f.take ?? "50", 10) || 50, 200);

    const conditions = [eq(comebackCases.orgId, orgId)];
    if (f.status) conditions.push(eq(comebackCases.status, f.status as never));
    if (f.severity) conditions.push(eq(comebackCases.severity, f.severity as never));
    if (f.originalJobId) conditions.push(eq(comebackCases.originalJobId, f.originalJobId));
    if (f.customerId) conditions.push(eq(comebackCases.customerId, f.customerId));
    if (f.equipmentId) conditions.push(eq(comebackCases.equipmentId, f.equipmentId));
    if (f.assignedTechnicianId) conditions.push(eq(comebackCases.assignedTechnicianId, f.assignedTechnicianId));
    if (f.isRepeat === "true") conditions.push(sql`${comebackCases.repeatNumber} > 1`);
    if (f.q) {
      const qq = `%${f.q.trim()}%`;
      conditions.push(sql`(${comebackCases.caseNumber} ilike ${qq} or ${comebackCases.complaintSummary} ilike ${qq})`);
    }
    if (claims.role === "technician") {
      const techScoped = or(eq(comebackCases.assignedTechnicianId, claims.userId), eq(comebackCases.reportedBy, claims.userId));
      if (techScoped) conditions.push(techScoped);
    }

    const rows = await db
      .select()
      .from(comebackCases)
      .where(and(...conditions))
      .orderBy(desc(comebackCases.reportedAt))
      .limit(take)
      .offset(skip);
    return assembleList(orgId, rows);
  });

  // POST / — new case intake
  app.post("/", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const parsed = createCaseBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return createCase(req, reply, orgId, claims, parsed.data, parsed.data.originalJobId);
  });

  // POST /jobs/:jobId/comeback — fast intake straight from a job
  app.post("/jobs/:jobId/comeback", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { jobId } = req.params as { jobId: string };
    const parsed = createFromJobBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    return createCase(req, reply, orgId, claims, { ...parsed.data, originalJobId: jobId }, jobId);
  });

  // GET /jobs/:jobId/comebacks — all cases on one original job (job page panel)
  app.get("/jobs/:jobId/comebacks", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { jobId } = req.params as { jobId: string };
    const rows = await db
      .select()
      .from(comebackCases)
      .where(and(eq(comebackCases.orgId, orgId), eq(comebackCases.originalJobId, jobId)))
      .orderBy(desc(comebackCases.reportedAt))
      .limit(50);
    return assembleList(orgId, rows);
  });

  // GET /:id — full detail
  app.get("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    return assembleDetail(orgId, found.row);
  });

  // PATCH /:id — edit base fields (no status changes here)
  app.patch("/:id", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const { id } = req.params as { id: string };
    const parsed = patchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    await db.update(comebackCases).set({ ...parsed.data, updatedAt: new Date() }).where(eq(comebackCases.id, id));
    const [updated] = await db.select().from(comebackCases).where(and(eq(comebackCases.orgId, orgId), eq(comebackCases.id, id))).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/triage
  app.post("/:id/triage", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = triageBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    if (!isOfficeRole(claims.role)) return reply.code(403).send({ error: "triage requires an owner or dispatcher" });
    try {
      await transitionCase(orgId, id, "TRIAGED", claims.userId, parsed.data.note ?? "Triaged", {
        assignedReviewerId: parsed.data.assignedReviewerId ?? found.row.assignedReviewerId,
        assignedTechnicianId: parsed.data.assignedTechnicianId ?? found.row.assignedTechnicianId,
      });
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
    safeEmitActivity(orgId, "comeback.triaged", `Comeback ${found.row.caseNumber} triaged`, { customerId: found.row.customerId, jobId: found.row.originalJobId ?? undefined });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/jobs — schedule a comeback work-order (visit)
  app.post("/:id/jobs", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const { id } = req.params as { id: string };
    const parsed = createJobBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    if (["CLOSED", "NOT_A_COMEBACK"].includes(found.row.status)) {
      return reply.code(409).send({ error: "cannot schedule a visit on a closed case" });
    }
    const job = await createComebackJob(orgId, claims, found.row, parsed.data);
    return reply.code(201).send({ job });
  });

  // POST /:id/investigating
  app.post("/:id/investigating", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    try {
      const { toStatus } = await transitionCase(orgId, id, "UNDER_INVESTIGATION", claims.userId, "investigation started");
      void toStatus;
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
    safeEmitActivity(orgId, "comeback.investigating", `Comeback ${found.row.caseNumber} under investigation`, { customerId: found.row.customerId, jobId: found.row.originalJobId ?? undefined });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/waiting-for-part
  app.post("/:id/waiting-part", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    try {
      await transitionCase(orgId, id, "WAITING_FOR_PART", claims.userId, "waiting for replacement part");
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
    await db.insert(comebackCommunications).values({
      orgId,
      caseId: id,
      kind: "PART_AWAITED",
      summary: `Comeback ${found.row.caseNumber} is waiting for a replacement part.`,
      createdBy: claims.userId,
    });
    safeEmitActivity(orgId, "comeback.waiting-part", `Comeback ${found.row.caseNumber} waiting for a part`, { customerId: found.row.customerId });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/classify — post-investigation taxonomy
  app.post("/:id/classify", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = classifyBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });

    // Coherence: "new unrelated fault" must not be blamed on the original repair.
    if (parsed.data.faultRelationship === "NEW_UNRELATED_FAULT" && parsed.data.responsibility && parsed.data.responsibility !== "NEW_UNRELATED_FAULT") {
      return reply.code(400).send({ error: "A new unrelated fault should be classified with NEW_UNRELATED_FAULT responsibility (no blame on the original repair)." });
    }
    if (parsed.data.faultRelationship !== "NEW_UNRELATED_FAULT" && parsed.data.responsibility === "NEW_UNRELATED_FAULT") {
      return reply.code(400).send({ error: "NEW_UNRELATED_FAULT responsibility requires the fault relationship to be NEW_UNRELATED_FAULT." });
    }

    await db
      .update(comebackCases)
      .set({
        faultRelationship: parsed.data.faultRelationship,
        rootCause: parsed.data.rootCause ?? found.row.rootCause,
        rootCauseNotes: parsed.data.rootCauseNotes ?? found.row.rootCauseNotes,
        responsibility: parsed.data.responsibility ?? found.row.responsibility,
        preventability: parsed.data.preventability ?? found.row.preventability,
        preventabilityNote: parsed.data.preventabilityNote ?? found.row.preventabilityNote,
        updatedAt: new Date(),
      })
      .where(eq(comebackCases.id, id));
    safeEmitActivity(orgId, "comeback.classified", `Comeback ${found.row.caseNumber} classified (${parsed.data.faultRelationship})`, { customerId: found.row.customerId, jobId: found.row.originalJobId ?? undefined });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/resolve
  app.post("/:id/resolve", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = resolveBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });

    if (found.row.faultRelationship === "UNKNOWN") {
      return reply.code(400).send({ error: "Classify the case (same/related/new fault) before resolving — looked at the original repair?" });
    }

    let billingDecision = parsed.data.billingDecision ?? found.row.billingDecision;
    // No-charge default for faults NNACT is responsible for.
    if (billingDecision === "PENDING_REVIEW" && ["NNACT_RESPONSIBLE", "PARTIAL_NNACT_RESPONSIBLE"].includes(found.row.responsibility ?? "")) {
      billingDecision = "NO_CHARGE";
    }

    const confirmation = parsed.data.customerConfirmation ?? found.row.customerConfirmation;
    const requireConfirm = (await orgComebackSettings(orgId)).requireFinalVerification;
    const target: ComebackStatus = requireConfirm && confirmation !== "CONFIRMED_RESOLVED" ? "AWAITING_VERIFICATION" : "RESOLVED";

    try {
      await transitionCase(orgId, id, target, claims.userId, target === "AWAITING_VERIFICATION" ? "resolved pending customer verification" : "resolved", {
        resolutionSummary: parsed.data.resolutionSummary,
        billingDecision,
        chargeAmountCents: parsed.data.chargeAmountCents ?? found.row.chargeAmountCents,
        customerConfirmation: confirmation,
      });
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }

    await db.insert(comebackCommunications).values({
      orgId,
      caseId: id,
      kind: confirmation === "CONFIRMED_RESOLVED" ? "CUSTOMER_CONFIRMATION" : "RESOLVED_ANNOUNCED",
      summary: `${found.row.caseNumber} resolved. ${confirmation === "CONFIRMED_RESOLVED" ? "Customer confirmed the fix." : "Awaiting final customer confirmation."} ${parsed.data.verificationNote ?? ""}`,
      createdBy: claims.userId,
    });

    safeEmitActivity(orgId, "comeback.resolved", `Comeback ${found.row.caseNumber} resolved`, { customerId: found.row.customerId, jobId: found.row.originalJobId ?? undefined });
    void safeEmitEvent(orgId, "comeback.resolved", { id, caseNumber: found.row.caseNumber });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/monitor
  app.post("/:id/monitor", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = monitorBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    const settings = await orgComebackSettings(orgId);
    const days = parsed.data.monitoringDays ?? settings.monitoringDays;
    try {
      await transitionCase(orgId, id, "MONITORING", claims.userId, `post-resolution monitoring for ${days} days`);
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
    const now = Date.now();
    const dayMs = 86_400_000;
    const finalCheck = new Date(now + days * dayMs);
    const midpoint = new Date(now + Math.max(1, Math.floor(days / 2)) * dayMs);
    for (const at of [midpoint, finalCheck]) {
      await db.insert(comebackFollowUps).values({ orgId, caseId: id, scheduledAt: at, outcome: "PENDING" });
    }
    safeEmitActivity(orgId, "comeback.monitoring", `Comeback ${found.row.caseNumber} in monitoring (${days} days)`, { customerId: found.row.customerId });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/follow-up
  app.post("/:id/follow-up", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = followUpBody.safeParse(req.body);
    if (!parsed.success || parsed.data.outcome === "PENDING") {
      return reply.code(400).send({ error: "outcome must be NO_RELAPSE, RELAPSE or ESCALATED" });
    }
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });

    const outcome = parsed.data.outcome;
    if (outcome === "RELAPSE" || outcome === "ESCALATED") {
      const escalateLevel = found.row.escalationLevel + 1;
      const threshold = (await orgComebackSettings(orgId)).escalationAfterCount;
      const escalated = escalateLevel >= threshold;
      await db.transaction(async (tx) => {
        await tx
          .update(comebackCases)
          .set({ status: "REPORTED", escalationLevel: escalateLevel, escalated, monitoringOutcome: outcome, updatedAt: new Date() })
          .where(eq(comebackCases.id, id));
        await appendStatusHistory(tx, orgId, id, found.row.status, "REPORTED", claims.userId, `relapse / escalation (level ${escalateLevel})`);
      });
      safeEmitActivity(orgId, "comeback.relapse", `Comeback ${found.row.caseNumber} relapsed — escalated to level ${escalateLevel}`, { customerId: found.row.customerId, jobId: found.row.originalJobId ?? undefined });
      if (escalated) void notifyComebackEscalatedToOwner(orgId, found.row.caseNumber);
      const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
      return assembleDetail(orgId, updated);
    }

    // NO_RELAPSE — mark the PENDING follow-ups checked, then close if eligible.
    const settings = await orgComebackSettings(orgId);
    const [pending] = await db
      .select()
      .from(comebackFollowUps)
      .where(and(eq(comebackFollowUps.orgId, orgId), eq(comebackFollowUps.caseId, id), eq(comebackFollowUps.outcome, "PENDING")))
      .orderBy(asc(comebackFollowUps.scheduledAt))
      .limit(1);
    if (pending) {
      await db
        .update(comebackFollowUps)
        .set({ outcome: "NO_RELAPSE", checkedBy: claims.userId, checkedAt: new Date(), note: parsed.data.note ?? null })
        .where(eq(comebackFollowUps.id, pending.id));
    }
    if (settings.requireFinalVerification && found.row.customerConfirmation !== "CONFIRMED_RESOLVED") {
      await transitionCase(orgId, id, "AWAITING_VERIFICATION", claims.userId, "monitoring passed; final customer verification required").catch((e) => {
        if (e instanceof CbTransitionError) return;
        throw e;
      });
      return assembleDetail(orgId, (await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1))[0]);
    }
    await transitionCase(orgId, id, "CLOSED", claims.userId, "monitoring passed (no relapse)");
    safeEmitActivity(orgId, "comeback.closed", `Comeback ${found.row.caseNumber} closed after no-relapse monitoring`, { customerId: found.row.customerId });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/close
  app.post("/:id/close", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const { id } = req.params as { id: string };
    const parsed = closeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    try {
      await transitionCase(orgId, id, "CLOSED", claims.userId, parsed.data.reason ?? "closed");
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
    safeEmitActivity(orgId, "comeback.closed", `Comeback ${found.row.caseNumber} closed`, { customerId: found.row.customerId });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/not-a-comeback
  app.post("/:id/not-a-comeback", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const { id } = req.params as { id: string };
    const parsed = notAComebackBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    try {
      await transitionCase(orgId, id, "NOT_A_COMEBACK", claims.userId, parsed.data.reason, {
        denyReason: parsed.data.reason,
        considerationNotes: parsed.data.considerationNotes ?? null,
      });
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
    safeEmitActivity(orgId, "comeback.not-comeback", `Comeback ${found.row.caseNumber} determined not a comeback: ${parsed.data.reason}`, { customerId: found.row.customerId });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/dispute
  app.post("/:id/dispute", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const { id } = req.params as { id: string };
    const parsed = disputeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    try {
      await transitionCase(orgId, id, "DISPUTED", claims.userId, parsed.data.reason, {
        considerationNotes: parsed.data.reason,
        customerConfirmation: "DISPUTED_RESOLUTION",
      });
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
    safeEmitActivity(orgId, "comeback.disputed", `Comeback ${found.row.caseNumber} disputed: ${parsed.data.reason}`, { customerId: found.row.customerId });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/reopen
  app.post("/:id/reopen", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const { id } = req.params as { id: string };
    const parsed = reopenBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    try {
      await transitionCase(orgId, id, "REPORTED", claims.userId, `reopened: ${parsed.data.reason}`, {
        escalationLevel: found.row.escalationLevel + 1,
        considerationNotes: parsed.data.reason,
      });
    } catch (err) {
      if (err instanceof CbTransitionError) return reply.code(409).send({ error: err.message });
      throw err;
    }
    safeEmitActivity(orgId, "comeback.reopened", `Comeback ${found.row.caseNumber} reopened: ${parsed.data.reason}`, { customerId: found.row.customerId });
    const [updated] = await db.select().from(comebackCases).where(eq(comebackCases.id, id)).limit(1);
    return assembleDetail(orgId, updated);
  });

  // POST /:id/costs
  app.post("/:id/costs", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = costBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    const [cost] = await db
      .insert(comebackCosts)
      .values({
        orgId,
        caseId: id,
        jobId: parsed.data.jobId ?? null,
        kind: parsed.data.kind,
        costClass: parsed.data.costClass,
        description: parsed.data.description,
        amountCents: parsed.data.amountCents,
        supplierName: parsed.data.supplierName ?? null,
        modelPartId: parsed.data.modelPartId ?? null,
        recordedBy: claims.userId,
      })
      .returning();
    safeEmitActivity(orgId, "comeback.cost", `${parsed.data.description} (${parsed.data.costClass}) recorded on ${found.row.caseNumber}`, { customerId: found.row.customerId });
    return reply.code(201).send({ cost });
  });

  // POST /:id/evidence
  app.post("/:id/evidence", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = evidenceBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    const [evidence] = await db
      .insert(comebackEvidence)
      .values({
        orgId,
        caseId: id,
        jobId: parsed.data.jobId ?? null,
        kind: parsed.data.kind,
        photoId: parsed.data.photoId ?? null,
        note: parsed.data.note ?? null,
        createdBy: claims.userId,
      })
      .returning();
    return reply.code(201).send({ evidence });
  });

  // DELETE /:id/evidence/:evidenceId
  app.delete("/:id/evidence/:evidenceId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const { id, evidenceId } = req.params as { id: string; evidenceId: string };
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });
    const [deleted] = await db
      .delete(comebackEvidence)
      .where(and(eq(comebackEvidence.orgId, orgId), eq(comebackEvidence.caseId, id), eq(comebackEvidence.id, evidenceId)))
      .returning({ id: comebackEvidence.id });
    if (!deleted) return reply.code(404).send({ error: "evidence not found" });
    return { deleted: true };
  });

  // POST /:id/corrective-actions
  app.post("/:id/corrective-actions", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = correctiveBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    const [action] = await db
      .insert(comebackCorrectiveActions)
      .values({
        orgId,
        caseId: id,
        kind: parsed.data.kind,
        description: parsed.data.description,
        ownerId: parsed.data.ownerId ?? null,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null,
        affectsProcedure: parsed.data.affectsProcedure ?? true,
        createdBy: claims.userId,
        status: "OPEN",
      })
      .returning();
    safeEmitActivity(orgId, "comeback.corrective-action", `Corrective action planned on ${found.row.caseNumber}: ${parsed.data.description}`, { customerId: found.row.customerId });
    return reply.code(201).send({ correctiveAction: action });
  });

  // PATCH /:id/corrective-actions/:actionId
  app.patch("/:id/corrective-actions/:actionId", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id, actionId } = req.params as { id: string; actionId: string };
    const parsed = actionPatchBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    const [updated] = await db
      .update(comebackCorrectiveActions)
      .set({
        status: parsed.data.status,
        completedAt: parsed.data.status === "DONE" ? new Date() : null,
      })
      .where(and(eq(comebackCorrectiveActions.orgId, orgId), eq(comebackCorrectiveActions.caseId, id), eq(comebackCorrectiveActions.id, actionId)))
      .returning();
    if (!updated) return reply.code(404).send({ error: "corrective action not found" });
    return { correctiveAction: updated };
  });

  // POST /:id/communications
  app.post("/:id/communications", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = commBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    const [communication] = await db
      .insert(comebackCommunications)
      .values({
        orgId,
        caseId: id,
        kind: parsed.data.kind,
        summary: parsed.data.summary,
        happenedAt: parsed.data.happenedAt ? new Date(parsed.data.happenedAt) : new Date(),
        createdBy: claims.userId,
      })
      .returning();
    return reply.code(201).send({ communication });
  });

  // POST /:id/knowledge-proposal — propose (never publish) from the case
  app.post("/:id/knowledge-proposal", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const parsed = knowledgeBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found || !found.write) return reply.code(404).send({ error: "comeback case not found" });
    if (found.row.knowledgeProposalId) return reply.code(409).send({ error: "a knowledge proposal already exists for this case" });

    const [equipmentRow] = found.row.equipmentId
      ? await db.select({ id: equipment.id, equipmentModelId: equipment.equipmentModelId }).from(equipment).where(eq(equipment.id, found.row.equipmentId)).limit(1)
      : [];

    const mapProposalType = (rootCause: string): "fault" | "diagnostic_procedure" | "repair_procedure" | "part" => {
      if (rootCause === "INCOMPLETE_DIAGNOSIS" || rootCause === "MISDIAGNOSIS") return "diagnostic_procedure";
      if (rootCause === "PART_FAILED_EARLY" || rootCause === "WRONG_PART_FITTED") return "part";
      if (rootCause === "WORKMANSHIP" || rootCause === "REASSEMBLY_ERROR" || rootCause === "INSTALLATION_ERROR") return "repair_procedure";
      return "fault";
    };

    const [proposal] = await db
      .insert(knowledgeProposals)
      .values({
        orgId,
        sourceJobId: found.row.originalJobId,
        sourceEquipmentId: found.row.equipmentId,
        equipmentModelId: equipmentRow?.equipmentModelId ?? null,
        proposalType: mapProposalType(found.row.rootCause ?? "OTHER"),
        title: found.row.complaintSummary,
        payload: {
          comebackCaseId: found.row.id,
          caseNumber: found.row.caseNumber,
          rootCause: found.row.rootCause,
          responsibility: found.row.responsibility,
          preventability: found.row.preventability,
          rationale: parsed.data.rationale ?? null,
          correctiveActions: [],
        },
        status: "proposed",
        proposedBy: claims.userId,
      })
      .returning();
    await db.update(comebackCases).set({ knowledgeProposalId: proposal.id, updatedAt: new Date() }).where(eq(comebackCases.id, id));
    safeEmitActivity(orgId, "comeback.knowledge-proposal", `Knowledge proposal from ${found.row.caseNumber}: "${found.row.complaintSummary}"`, { customerId: found.row.customerId, jobId: found.row.originalJobId ?? undefined });
    return reply.code(201).send({ proposal: { id: proposal.id, title: proposal.title, status: proposal.status } });
  });

  // GET /:id/timeline — merged case timeline
  app.get("/:id/timeline", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    const { id } = req.params as { id: string };
    const found = await loadCaseScoped(orgId, id, claims);
    if (!found) return reply.code(404).send({ error: "comeback case not found" });

    const [history, comms, followUps] = await Promise.all([
      db.select().from(comebackStatusHistory).where(and(eq(comebackStatusHistory.orgId, orgId), eq(comebackStatusHistory.caseId, id))).orderBy(asc(comebackStatusHistory.createdAt)),
      db.select().from(comebackCommunications).where(and(eq(comebackCommunications.orgId, orgId), eq(comebackCommunications.caseId, id))).orderBy(asc(comebackCommunications.happenedAt)),
      db.select().from(comebackFollowUps).where(and(eq(comebackFollowUps.orgId, orgId), eq(comebackFollowUps.caseId, id))).orderBy(asc(comebackFollowUps.scheduledAt)),
    ]);
    const names = await loadNames(orgId, [...history.map((h) => h.changedBy), ...comms.map((c) => c.createdBy), ...followUps.map((f) => f.checkedBy)]);

    const entries: Array<Record<string, unknown>> = [];
    for (const h of history) {
      entries.push({
        at: h.createdAt,
        kind: "case-status",
        label: h.fromStatus ? `${h.fromStatus} → ${h.toStatus}` : h.toStatus,
        detail: h.reason ?? null,
        actor: names.get(h.changedBy ?? "") ?? null,
      });
    }
    for (const c of comms) {
      entries.push({
        at: c.happenedAt,
        kind: "communication",
        label: COMEBACK_COMMUNICATION_KIND_LABEL[c.kind] ?? c.kind,
        detail: c.summary,
        actor: names.get(c.createdBy ?? "") ?? null,
      });
    }
    for (const f of followUps) {
      entries.push({
        at: f.scheduledAt,
        kind: "follow-up",
        label: `Monitoring · ${COMEBACK_MONITORING_OUTCOME_LABEL[f.outcome]}`,
        detail: f.note ?? null,
        actor: names.get(f.checkedBy ?? "") ?? null,
      });
    }
    entries.sort((a, b) => ((a.at as Date).getTime() - (b.at as Date).getTime()));
    return entries;
  });

  // GET /analytics — quality dashboard aggregate
  app.get("/analytics", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const q = listQuery.safeParse(req.query);
    const days = Math.min(q.success ? parseInt(q.data!.days ?? "30", 10) : 30, 365);
    const since = new Date(Date.now() - days * 86_400_000);

    const [cases, historyRows, costRows, completedJobs] = await Promise.all([
      db.select().from(comebackCases).where(eq(comebackCases.orgId, orgId)),
      db
        .select({ caseId: comebackStatusHistory.caseId, toStatus: comebackStatusHistory.toStatus, createdAt: comebackStatusHistory.createdAt })
        .from(comebackStatusHistory)
        .where(and(eq(comebackStatusHistory.orgId, orgId), gteLike(comebackStatusHistory.createdAt, since))),
      db.select().from(comebackCosts).where(and(eq(comebackCosts.orgId, orgId), gteLike(comebackCosts.createdAt, since))),
      db
        .select({ id: jobs.id })
        .from(jobs)
        .where(and(eq(jobs.orgId, orgId), eq(jobs.status, "completed"), gteLike(jobs.updatedAt, since))),
    ]);
    const allHistory = historyRows;
    const completedById = new Map(completedJobs.map((j) => [j.id, j.id]));

    const created = cases.filter((c) => c.reportedAt >= since);
    const totalOpen = cases.filter((c) => isOpenComeback(c.status as ComebackStatus)).length;
    const totalClosed = cases.filter((c) => c.status === "CLOSED").length;
    const totalNotComeback = cases.filter((c) => c.status === "NOT_A_COMEBACK").length;
    const repeatedCount = cases.filter((c) => c.repeatNumber > 1).length;
    const escalatedCount = cases.filter((c) => c.escalated).length;

    const comebackDone = created.filter((c) => c.originalJobId && completedById.has(c.originalJobId));
    const rate = computeComebackRate(completedById.size ? [...completedById.values()] : [], comebackDone.map((c) => c.originalJobId as string));

    // avg resolution hours (created → RESOLVED)
    let totalResMs = 0;
    let nRes = 0;
    for (const h of allHistory) {
      if (h.toStatus === "RESOLVED") {
        const [createdRow] = created.filter((c) => c.id === h.caseId);
        if (createdRow) {
          totalResMs += h.createdAt.getTime() - createdRow.reportedAt.getTime();
          nRes += 1;
        }
      }
    }

    const buckets = await costBuckets(orgId, created.map((c) => c.id));
    let totalInternal = 0;
    let totalBillable = 0;
    let totalSupplier = 0;
    for (const b of buckets.values()) {
      totalInternal += b.internal;
      totalBillable += b.billable;
      totalSupplier += b.supplier;
    }

    const byStatus: Record<string, number> = {};
    const bySeverity: Record<ComebackSeverity, number> = {} as Record<ComebackSeverity, number>;
    const byFault: Record<string, number> = {};
    const byResponsibility: Record<string, number> = {};
    const byRootCause: Record<string, number> = {};
    for (const c of created) {
      byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
      bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;
      byFault[c.faultRelationship] = (byFault[c.faultRelationship] ?? 0) + 1;
      if (c.responsibility) byResponsibility[c.responsibility] = (byResponsibility[c.responsibility] ?? 0) + 1;
      if (c.rootCause) byRootCause[c.rootCause] = (byRootCause[c.rootCause] ?? 0) + 1;
    }

    // Equipment model reliability (cases per model within window)
    const equipmentRows = created.some((c) => c.equipmentId)
      ? await db.select({ id: equipment.id, equipmentModelId: equipment.equipmentModelId, type: equipment.type, make: equipment.make, model: equipment.model }).from(equipment).where(inArray(equipment.id, created.map((c) => c.equipmentId).filter(Boolean) as string[]))
      : [];
    const equipmentById = new Map(equipmentRows.map((r) => [r.id, r]));
    const modelStats = new Map<string, { cases: number; repeats: number; label: string }>();
    for (const c of created) {
      const eqRow = c.equipmentId ? equipmentById.get(c.equipmentId) : null;
      const modelId = eqRow?.equipmentModelId ?? "unknown";
      const label = eqRow ? `${eqRow.make ?? ""} ${eqRow.model ?? ""} ${eqRow.type}`.trim().replace(/\s+/g, " ") : "Not tracked";
      const stat = modelStats.get(modelId ?? "unknown") ?? { cases: 0, repeats: 0, label };
      stat.cases += 1;
      if (c.repeatNumber > 1) stat.repeats += 1;
      modelStats.set(modelId ?? "unknown", stat);
    }
    const topModels = [...modelStats.entries()]
      .sort((a, b) => b[1].cases - a[1].cases)
      .slice(0, 5)
      .map(([equipmentModelId, s]) => ({ equipmentModelId, label: s.label, cases: s.cases, repeatRatePct: s.cases > 0 ? (s.repeats / s.cases) * 100 : 0 }));

    // weekly trend
    const trendMap = new Map<string, { created: number; resolved: number }>();
    for (const c of created) {
      const key = weekKey(c.reportedAt);
      const entry = trendMap.get(key) ?? { created: 0, resolved: 0 };
      entry.created += 1;
      trendMap.set(key, entry);
    }
    for (const h of allHistory) {
      if (h.toStatus === "RESOLVED") {
        const key = weekKey(h.createdAt);
        const entry = trendMap.get(key) ?? { created: 0, resolved: 0 };
        entry.resolved += 1;
        trendMap.set(key, entry);
      }
    }
    const trend = [...trendMap.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([week, v]) => ({ week, ...v }));

    const analytics: ComebackAnalyticsDTO = {
      periodDays: days,
      totalOpen,
      totalClosed,
      totalNotComeback,
      repeatedCount,
      escalatedCount,
      rate,
      avgResolutionHours: nRes > 0 ? totalResMs / nRes / 3_600_000 : null,
      totalInternalCostCents: totalInternal,
      totalBillableCents: totalBillable,
      totalSupplierRecoverableCents: totalSupplier,
      byStatus,
      bySeverity: bySeverity as never,
      byFaultRelationship: byFault,
      byResponsibility,
      byRootCause,
      topModels,
      trend,
    };
    return analytics;
  });

  // GET /technician-metrics — contextual, non-toxic tech metrics
  app.get("/technician-metrics", async (req, reply) => {
    const orgId = await resolveOrgId(req);
    const claims = await verifiedClaims(req, reply);
    if (!claims || reply.sent) return;
    if (!(await requireOffice(req, reply, claims))) return;
    const q = listQuery.safeParse(req.query);
    const days = Math.min(q.success ? parseInt(q.data!.days ?? "30", 10) : 30, 365);
    const since = new Date(Date.now() - days * 86_400_000);

    const [cases, history, costs] = await Promise.all([
      db
        .select()
        .from(comebackCases)
        .where(and(eq(comebackCases.orgId, orgId), sql`${comebackCases.reportedAt} >= ${since}`)),
      db
        .select({ caseId: comebackStatusHistory.caseId, toStatus: comebackStatusHistory.toStatus, fromStatus: comebackStatusHistory.fromStatus, changedBy: comebackStatusHistory.changedBy, createdAt: comebackStatusHistory.createdAt })
        .from(comebackStatusHistory)
        .where(and(eq(comebackStatusHistory.orgId, orgId), sql`${comebackStatusHistory.createdAt} >= ${since}`)),
      db
        .select()
        .from(comebackCosts)
        .where(and(eq(comebackCosts.orgId, orgId), sql`${comebackCosts.createdAt} >= ${since}`)),
    ]);

    const techIds = [...new Set([...cases.map((c) => c.assignedTechnicianId).filter(Boolean), ...history.map((h) => h.changedBy).filter(Boolean)])] as string[];
    const names = await loadNames(orgId, techIds);
    const techNames = await loadNames(orgId, cases.map((c) => c.assignedTechnicianId));

    const stats = new Map<string, { assigned: number; resolved: number; reopened: number; resMs: number; nRes: number; internal: number; billable: number }>();
    const caseMap = new Map(cases.map((c) => [c.id, c]));
    for (const c of cases) {
      const t = c.assignedTechnicianId;
      if (!t) continue;
      const s = stats.get(t) ?? { assigned: 0, resolved: 0, reopened: 0, resMs: 0, nRes: 0, internal: 0, billable: 0 };
      s.assigned += 1;
      stats.set(t, s);
    }
    for (const h of history) {
      const row = caseMap.get(h.caseId);
      if (!row) continue;
      const t = row.assignedTechnicianId;
      if (!t) continue;
      const s = stats.get(t) ?? { assigned: 0, resolved: 0, reopened: 0, resMs: 0, nRes: 0, internal: 0, billable: 0 };
      if (h.toStatus === "RESOLVED") {
        s.resolved += 1;
        s.resMs += h.createdAt.getTime() - row.reportedAt.getTime();
        s.nRes += 1;
      }
      if (h.toStatus === "REPORTED" && h.fromStatus === "CLOSED") s.reopened += 1;
      stats.set(t, s);
    }
    for (const c0 of costs) {
      const row = caseMap.get(c0.caseId);
      const t = row?.assignedTechnicianId;
      if (!t) continue;
      const s = stats.get(t) ?? { assigned: 0, resolved: 0, reopened: 0, resMs: 0, nRes: 0, internal: 0, billable: 0 };
      if (c0.costClass === "BILLABLE_COMEBACK") s.billable += c0.amountCents;
      else s.internal += c0.amountCents;
      stats.set(t, s);
    }

    const metrics: ComebackTechnicianMetricDTO[] = [...stats.entries()].map(([userId, s]) => ({
      userId,
      name: techNames.get(userId) ?? names.get(userId) ?? "Unknown",
      casesAssignedCount: s.assigned,
      casesResolvedOwnCount: s.resolved,
      reopenedInPeriodCount: s.reopened,
      avgResolutionHours: s.nRes > 0 ? s.resMs / s.nRes / 3_600_000 : null,
      totalInternalCostCents: s.internal,
      totalBillableCents: s.billable,
    }));
    metrics.sort((a, b) => a.name.localeCompare(b.name));
    return metrics;
  });
}

// small helpers referenced above
function gteLike(col: unknown, since: Date) {
  return sql`${col} >= ${since}`;
}

function weekKey(d: Date): string {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = date.getUTCDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), diff));
  return monday.toISOString().slice(0, 10);
}

type Reply = import("fastify").FastifyReply;
type FastifyRequest = import("fastify").FastifyRequest;