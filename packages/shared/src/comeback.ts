// NNACT Pro — Comeback / "Retour" quality management domain.
//
// A comeback is a follow-up quality event on a previously completed job. The
// system treats the COMEBACK CASE (the quality record + investigation) as
// separate from the COMEBACK JOB (the operational field work, which lives in
// the regular `jobs` table with `job_type = 'comeback'`).
//
// Money is integer cents everywhere. Statuses and taxonomies mirror the
// comeback spec (see route/UI for the full lifecycle description) and are the
// single source of truth shared by the API, web, and mobile app.

import type { BusinessSettings } from "./business-settings.js";

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

export const COMEBACK_STATUS = [
  "REPORTED",
  "TRIAGED",
  "SCHEDULED",
  "UNDER_INVESTIGATION",
  "WAITING_FOR_PART",
  "AWAITING_VERIFICATION",
  "RESOLVED",
  "MONITORING",
  "CLOSED",
  "DISPUTED",
  "NOT_A_COMEBACK",
] as const;
export type ComebackStatus = (typeof COMEBACK_STATUS)[number];

export const COMEBACK_OPEN_STATUSES: readonly ComebackStatus[] = [
  "REPORTED",
  "TRIAGED",
  "SCHEDULED",
  "UNDER_INVESTIGATION",
  "WAITING_FOR_PART",
  "AWAITING_VERIFICATION",
  "MONITORING",
  "DISPUTED",
];

export const COMEBACK_SEVERITY = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type ComebackSeverity = (typeof COMEBACK_SEVERITY)[number];

export const COMEBACK_FAULT_RELATIONSHIP = [
  "SAME_FAULT",
  "RELATED_FAULT",
  "NEW_UNRELATED_FAULT",
  "UNKNOWN",
] as const;
export type ComebackFaultRelationship = (typeof COMEBACK_FAULT_RELATIONSHIP)[number];

/** How the customer/office reported the comeback to NNACT. */
export const COMEBACK_INTAKE_REASON = [
  "CUSTOMER_CALLED",
  "CUSTOMER_VISIT",
  "STAFF_NOTICED",
  "MAINTENANCE_REPORT",
  "ONLINE_REVIEW",
  "FOLLOW_UP_CALL",
  "OTHER",
] as const;
export type ComebackIntakeReason = (typeof COMEBACK_INTAKE_REASON)[number];

export const COMEBACK_ROOT_CAUSE = [
  "INCOMPLETE_DIAGNOSIS",
  "MISDIAGNOSIS",
  "WORKMANSHIP",
  "REASSEMBLY_ERROR",
  "PART_FAILED_EARLY",
  "WRONG_PART_FITTED",
  "SECONDARY_FAULT_MISSED",
  "INSTALLATION_ERROR",
  "POWER_OR_INSTALLATION_ISSUE",
  "ENVIRONMENTAL_CONDITION",
  "CUSTOMER_MISUSE",
  "CUSTOMER_EXPECTATION",
  "MANUFACTURER_DEFECT",
  "NORMAL_WEAR",
  "NO_FAULT_FOUND",
  "OTHER",
  "NOT_DETERMINED_YET",
] as const;
export type ComebackRootCause = (typeof COMEBACK_ROOT_CAUSE)[number];

export const COMEBACK_RESPONSIBILITY = [
  "NNACT_RESPONSIBLE",
  "PARTIAL_NNACT_RESPONSIBLE",
  "PART_OR_SUPPLIER_FAILURE",
  "MANUFACTURER_ISSUE",
  "CUSTOMER_CAUSED",
  "EXTERNAL_CONDITION",
  "NEW_UNRELATED_FAULT",
  "UNDETERMINED",
] as const;
export type ComebackResponsibility = (typeof COMEBACK_RESPONSIBILITY)[number];

export const COMEBACK_PREVENTABILITY = [
  "PREVENTABLE",
  "POSSIBLY_PREVENTABLE",
  "NOT_PREVENTABLE",
  "UNKNOWN",
] as const;
export type ComebackPreventability = (typeof COMEBACK_PREVENTABILITY)[number];

export const COMEBACK_BILLING_DECISION = [
  "NO_CHARGE",
  "PARTIAL_CHARGE",
  "FULL_CHARGE",
  "PENDING_REVIEW",
] as const;
export type ComebackBillingDecision = (typeof COMEBACK_BILLING_DECISION)[number];

export const COMEBACK_WARRANTY_STATUS = [
  "FULL",
  "WORKMANSHIP",
  "PARTS",
  "OUT_OF_WARRANTY",
  "UNCLEAR",
] as const;
export type ComebackWarrantyStatus = (typeof COMEBACK_WARRANTY_STATUS)[number];

export const COMEBACK_ACTION_STATUS = ["OPEN", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
export type ComebackActionStatus = (typeof COMEBACK_ACTION_STATUS)[number];

export const COMEBACK_CORRECTIVE_ACTION_KIND = [
  "UPDATE_DIAGNOSTIC_PROCEDURE",
  "UPDATE_REPAIR_PROCEDURE",
  "TECHNICIAN_TRAINING",
  "SUPPLIER_CHANGE",
  "ADD_FINAL_CHECK",
  "CUSTOMER_GUIDANCE",
  "KNOWLEDGE_ARTICLE",
  "PROCESS_CHANGE",
  "OTHER",
] as const;
export type ComebackCorrectiveActionKind = (typeof COMEBACK_CORRECTIVE_ACTION_KIND)[number];

export const COMEBACK_COST_KIND = [
  "PARTS",
  "LABOUR",
  "TRANSPORT",
  "FUEL",
  "MISCELLANEOUS",
] as const;
export type ComebackCostKind = (typeof COMEBACK_COST_KIND)[number];

export const COMEBACK_COST_CLASS = [
  "WARRANTY_COST",
  "QUALITY_COST",
  "BILLABLE_COMEBACK",
  "SUPPLIER_RECOVERABLE",
] as const;
export type ComebackCostClass = (typeof COMEBACK_COST_CLASS)[number];

export const COMEBACK_EVIDENCE_KIND = [
  "COMPLAINT",
  "ORIGINAL_REPAIR",
  "COMEBACK_INSPECTION",
  "FAILED_PART",
  "CORRECTIVE_ACTION",
  "FINAL_TEST",
  "AFTER_REPAIR",
  "OTHER",
] as const;
export type ComebackEvidenceKind = (typeof COMEBACK_EVIDENCE_KIND)[number];

export const COMEBACK_COMMUNICATION_KIND = [
  "COMPLAINT_RECEIVED",
  "VISIT_SCHEDULED",
  "TECH_DISPATCHED",
  "PART_AWAITED",
  "RESOLVED_ANNOUNCED",
  "CUSTOMER_FOLLOW_UP",
  "RECOVERY_OFFER",
  "SERVICE_CREDIT",
  "INVOICE_ISSUED",
  "CUSTOMER_CONFIRMATION",
  "ESCALATION_NOTICE",
  "OTHER",
] as const;
export type ComebackCommunicationKind = (typeof COMEBACK_COMMUNICATION_KIND)[number];

export const COMEBACK_MONITORING_OUTCOME = ["PENDING", "NO_RELAPSE", "RELAPSE", "ESCALATED"] as const;
export type ComebackMonitoringOutcome = (typeof COMEBACK_MONITORING_OUTCOME)[number];

export const COMEBACK_CUSTOMER_CONFIRMATION = [
  "NOT_CONTACTED",
  "CONTACTED_PENDING",
  "CONFIRMED_RESOLVED",
  "DISPUTED_RESOLUTION",
] as const;
export type ComebackCustomerConfirmation = (typeof COMEBACK_CUSTOMER_CONFIRMATION)[number];

// ────────────────────────────────────────────────────────────────────────────
// Policy settings (per-org, JSONB in `orgs.business_settings`).
// ────────────────────────────────────────────────────────────────────────────

export interface ComebackSettings {
  /** Master switch; office can disable comeback intake globally. */
  enabled: boolean;
  /** Allow a technician to self-report a comeback from an assigned job. */
  allowTechnicianSelfReport: boolean;
  /** Workmanship warranty window counted from the original job completion. */
  workmanshipWarrantyDays: number;
  /** Parts warranty window counted from completion (or equipment expiry). */
  partsWarrantyDays: number;
  /** Window after completion in which a return is treated as a comeback. */
  comebackWindowDays: number;
  /** Window for duplicate detection (same original job + complaint). */
  duplicateWindowDays: number;
  /** Repeat count at which a case auto-escalates to the owner. Default 2. */
  escalationAfterCount: number;
  /** Monitoring window after RESOLVED before a valid no-relapse closes. */
  monitoringDays: number;
  /** Require evidence of customer confirmation before auto-closing. */
  requireFinalVerification: boolean;
  /** Target first-attendance hours per severity (SLA, reporting only). */
  slaAttendanceHours: Record<ComebackSeverity, number>;
}

export const DEFAULT_COMEBACK_SETTINGS: ComebackSettings = {
  enabled: true,
  allowTechnicianSelfReport: true,
  workmanshipWarrantyDays: 90,
  partsWarrantyDays: 90,
  comebackWindowDays: 30,
  duplicateWindowDays: 30,
  escalationAfterCount: 2,
  monitoringDays: 7,
  requireFinalVerification: true,
  slaAttendanceHours: { LOW: 120, MEDIUM: 72, HIGH: 24, CRITICAL: 8 },
};

/** Deep-merge / normalize a partial comeback policy blob. */
export function normalizeComebackSettings(value: unknown): ComebackSettings {
  const v = (isRecord(value) ? value : {}) as Partial<ComebackSettings>;
  const sla = isRecord(v.slaAttendanceHours)
    ? {
        LOW: numOrDefault(v.slaAttendanceHours?.LOW, DEFAULT_COMEBACK_SETTINGS.slaAttendanceHours.LOW),
        MEDIUM: numOrDefault(v.slaAttendanceHours?.MEDIUM, DEFAULT_COMEBACK_SETTINGS.slaAttendanceHours.MEDIUM),
        HIGH: numOrDefault(v.slaAttendanceHours?.HIGH, DEFAULT_COMEBACK_SETTINGS.slaAttendanceHours.HIGH),
        CRITICAL: numOrDefault(v.slaAttendanceHours?.CRITICAL, DEFAULT_COMEBACK_SETTINGS.slaAttendanceHours.CRITICAL),
      }
    : DEFAULT_COMEBACK_SETTINGS.slaAttendanceHours;
  return {
    enabled: typeof v.enabled === "boolean" ? v.enabled : DEFAULT_COMEBACK_SETTINGS.enabled,
    allowTechnicianSelfReport:
      typeof v.allowTechnicianSelfReport === "boolean"
        ? v.allowTechnicianSelfReport
        : DEFAULT_COMEBACK_SETTINGS.allowTechnicianSelfReport,
    workmanshipWarrantyDays: numOrDefault(v.workmanshipWarrantyDays, DEFAULT_COMEBACK_SETTINGS.workmanshipWarrantyDays),
    partsWarrantyDays: numOrDefault(v.partsWarrantyDays, DEFAULT_COMEBACK_SETTINGS.partsWarrantyDays),
    comebackWindowDays: numOrDefault(v.comebackWindowDays, DEFAULT_COMEBACK_SETTINGS.comebackWindowDays),
    duplicateWindowDays: numOrDefault(v.duplicateWindowDays, DEFAULT_COMEBACK_SETTINGS.duplicateWindowDays),
    escalationAfterCount: numOrDefault(v.escalationAfterCount, DEFAULT_COMEBACK_SETTINGS.escalationAfterCount),
    monitoringDays: numOrDefault(v.monitoringDays, DEFAULT_COMEBACK_SETTINGS.monitoringDays),
    requireFinalVerification:
      typeof v.requireFinalVerification === "boolean"
        ? v.requireFinalVerification
        : DEFAULT_COMEBACK_SETTINGS.requireFinalVerification,
    slaAttendanceHours: sla,
  };
}

export function defaultComebackSettings(): ComebackSettings {
  return normalizeComebackSettings(null);
}

// ────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ────────────────────────────────────────────────────────────────────────────

export const COMEBACK_TRANSITIONS: Record<ComebackStatus, readonly ComebackStatus[]> = {
  REPORTED: ["TRIAGED", "SCHEDULED", "UNDER_INVESTIGATION", "DISPUTED", "NOT_A_COMEBACK", "CLOSED"],
  TRIAGED: ["SCHEDULED", "UNDER_INVESTIGATION", "WAITING_FOR_PART", "DISPUTED", "NOT_A_COMEBACK", "CLOSED", "REPORTED"],
  SCHEDULED: ["UNDER_INVESTIGATION", "WAITING_FOR_PART", "DISPUTED", "NOT_A_COMEBACK", "CLOSED", "REPORTED"],
  UNDER_INVESTIGATION: [
    "WAITING_FOR_PART",
    "AWAITING_VERIFICATION",
    "RESOLVED",
    "DISPUTED",
    "NOT_A_COMEBACK",
    "CLOSED",
    "REPORTED",
  ],
  WAITING_FOR_PART: [
    "UNDER_INVESTIGATION",
    "AWAITING_VERIFICATION",
    "RESOLVED",
    "DISPUTED",
    "NOT_A_COMEBACK",
    "CLOSED",
    "REPORTED",
  ],
  AWAITING_VERIFICATION: ["RESOLVED", "DISPUTED", "NOT_A_COMEBACK", "CLOSED", "REPORTED"],
  RESOLVED: ["MONITORING", "DISPUTED", "CLOSED", "REPORTED"],
  MONITORING: ["CLOSED", "REPORTED", "DISPUTED"],
  CLOSED: ["REPORTED", "DISPUTED"],
  DISPUTED: ["UNDER_INVESTIGATION", "RESOLVED", "NOT_A_COMEBACK", "CLOSED"],
  NOT_A_COMEBACK: ["CLOSED", "REPORTED", "DISPUTED"],
};

export function canTransitionComeback(from: ComebackStatus, to: ComebackStatus): boolean {
  if (from === to) return true;
  return COMEBACK_TRANSITIONS[from].includes(to);
}

export function isOpenComeback(status: ComebackStatus): boolean {
  return (COMEBACK_OPEN_STATUSES as readonly string[]).includes(status);
}

// ────────────────────────────────────────────────────────────────────────────
// Warranty evaluation (pure)
// ────────────────────────────────────────────────────────────────────────────

export interface ComebackWarrantyEvaluation {
  status: ComebackWarrantyStatus;
  workmanshipEndsAt: Date | null;
  partsEndsAt: Date | null;
}

/**
 * A return is within warranty when the original job completion (workmanship)
 * or the fitted part / equipment warranty (parts) has not lapsed. Returns
 * "FULL" when both windows are alive, otherwise the surviving component, or
 * "OUT_OF_WARRANTY" / "UNCLEAR".
 */
export function evalComebackWarranty(opts: {
  workmanshipWarrantyDays: number;
  partsWarrantyDays: number;
  completedAt?: Date | string | number | null;
  equipmentWarrantyExpiry?: Date | string | number | null;
  now?: Date;
}): ComebackWarrantyEvaluation {
  const now = opts.now ?? new Date();
  const completed = opts.completedAt ? new Date(opts.completedAt) : null;
  if (!completed || Number.isNaN(completed.getTime())) {
    return { status: "UNCLEAR", workmanshipEndsAt: null, partsEndsAt: null };
  }
  const addDays = (base: Date, days: number) => new Date(base.getTime() + days * 86_400_000);
  const workmanshipEndsAt = addDays(completed, opts.workmanshipWarrantyDays);
  const equipmentExpiry = opts.equipmentWarrantyExpiry ? new Date(opts.equipmentWarrantyExpiry) : null;
  const partsEndsAt =
    equipmentExpiry && !Number.isNaN(equipmentExpiry.getTime())
      ? equipmentExpiry
      : addDays(completed, opts.partsWarrantyDays);
  const workmanshipAlive = now.getTime() <= workmanshipEndsAt.getTime();
  const partsAlive = now.getTime() <= partsEndsAt.getTime();
  if (workmanshipAlive && partsAlive) return { status: "FULL", workmanshipEndsAt, partsEndsAt };
  if (workmanshipAlive) return { status: "WORKMANSHIP", workmanshipEndsAt, partsEndsAt };
  if (partsAlive) return { status: "PARTS", workmanshipEndsAt, partsEndsAt };
  return { status: "OUT_OF_WARRANTY", workmanshipEndsAt, partsEndsAt };
}

// ────────────────────────────────────────────────────────────────────────────
// Duplicate detection + repeat counting (case-level pure logic)
// ────────────────────────────────────────────────────────────────────────────

export interface ComebackCandidate {
  id: string;
  caseNumber: string;
  originalJobId: string | null;
  complaintSummary: string;
  createdAt: Date | string;
}

/**
 * A duplicate is an existing case on the SAME original job that is still open
 * and was reported within the duplicate window. Complaints are matched loose
 * (normalized headline) so we warn rather than silently block.
 */
export function findComebackDuplicate(
  existing: ComebackCandidate[],
  originalJobId: string,
  complaintSummary: string,
  opts: { duplicateWindowDays?: number; now?: Date } = {},
): ComebackCandidate | null {
  const now = opts.now ?? new Date();
  const windowMs = (opts.duplicateWindowDays ?? 30) * 86_400_000;
  const needle = normalizeHeadline(complaintSummary);
  return (
    existing.find((row) => {
      if (row.originalJobId !== originalJobId || !isOpenComeback(row.createdAt ? inferStatus(row) : "REPORTED")) {
        return false;
      }
      const createdAt = new Date(row.createdAt);
      const withinWindow = now.getTime() - createdAt.getTime() <= windowMs;
      if (!withinWindow) return false;
      if (needle && normalizeHeadline(row.complaintSummary).includes(needle)) return true;
      return true; // same job + open + within window is already suspicious
    }) ?? null
  );
}

function inferStatus(_row: ComebackCandidate): ComebackStatus {
  return "REPORTED"; // candidates carry their own status in practice; see API
}

function normalizeHeadline(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Repeat number: the nth memory of the same original job's dissatisfaction. */
export function nextComebackRepeatNumber(priorCasesOnJob: number): number {
  return Math.max(priorCasesOnJob, 0) + 1;
}

// ────────────────────────────────────────────────────────────────────────────
// Cost mathematics (pure)
// ────────────────────────────────────────────────────────────────────────────

export interface ComebackCostLine {
  costClass: ComebackCostClass;
  amountCents: number;
}

export interface ComebackCostTotals {
  internalCostCents: number;
  billableCents: number;
  supplierRecoverableCents: number;
}

/** Sums a comeback case's cost lines into its quality-cost buckets. */
export function sumComebackCosts(costs: ComebackCostLine[]): ComebackCostTotals {
  let internalCostCents = 0;
  let billableCents = 0;
  let supplierRecoverableCents = 0;
  for (const line of costs) {
    const amount = Number.isFinite(line.amountCents) ? Math.max(line.amountCents, 0) : 0;
    if (line.costClass === "BILLABLE_COMEBACK") billableCents += amount;
    else if (line.costClass === "SUPPLIER_RECOVERABLE") supplierRecoverableCents += amount;
    else internalCostCents += amount;
  }
  return { internalCostCents, billableCents, supplierRecoverableCents };
}

// ────────────────────────────────────────────────────────────────────────────
// Metrics (pure) — comeback rate definition
// ────────────────────────────────────────────────────────────────────────────

export interface ComebackRateResult {
  completedJobs: number;
  comebackCases: number;
  ratePct: number; // percentage, 0 when no completed jobs
}

/**
 * Comeback rate (spec): (unique original jobs that produced a comeback while
 * ~still under the comeback window) / jobs completed in the period × 100%.
 * Zero completed jobs → 0% (guarded, never NaN).
 */
export function computeComebackRate(
  completedJobIds: string[],
  comebackOriginalJobIds: string[],
): ComebackRateResult {
  const completed = new Set(completedJobIds);
  const uniqueFrom = new Set(comebackOriginalJobIds.filter((id) => completed.has(id)));
  const completedJobs = completed.size;
  const comebackCases = uniqueFrom.size;
  return {
    completedJobs,
    comebackCases,
    ratePct: completedJobs > 0 ? (comebackCases / completedJobs) * 100 : 0,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Labels
// ────────────────────────────────────────────────────────────────────────────

export const COMEBACK_STATUS_LABEL: Record<ComebackStatus, string> = {
  REPORTED: "Reported",
  TRIAGED: "Triaged",
  SCHEDULED: "Visit scheduled",
  UNDER_INVESTIGATION: "Under investigation",
  WAITING_FOR_PART: "Waiting for part",
  AWAITING_VERIFICATION: "Awaiting verification",
  RESOLVED: "Resolved",
  MONITORING: "Monitoring",
  CLOSED: "Closed",
  DISPUTED: "Disputed",
  NOT_A_COMEBACK: "Not a comeback",
};

export const COMEBACK_SEVERITY_LABEL: Record<ComebackSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const COMEBACK_FAULT_RELATIONSHIP_LABEL: Record<ComebackFaultRelationship, string> = {
  SAME_FAULT: "Same fault",
  RELATED_FAULT: "Related fault",
  NEW_UNRELATED_FAULT: "New unrelated fault",
  UNKNOWN: "Unknown",
};

export const COMEBACK_INTAKE_REASON_LABEL: Record<ComebackIntakeReason, string> = {
  CUSTOMER_CALLED: "Customer called",
  CUSTOMER_VISIT: "Customer visit",
  STAFF_NOTICED: "Staff noticed",
  MAINTENANCE_REPORT: "Maintenance report",
  ONLINE_REVIEW: "Online review",
  FOLLOW_UP_CALL: "Follow-up call",
  OTHER: "Other",
};

export const COMEBACK_ROOT_CAUSE_LABEL: Record<ComebackRootCause, string> = {
  INCOMPLETE_DIAGNOSIS: "Incomplete diagnosis",
  MISDIAGNOSIS: "Misdiagnosis",
  WORKMANSHIP: "Workmanship",
  REASSEMBLY_ERROR: "Reassembly error",
  PART_FAILED_EARLY: "Part failed early",
  WRONG_PART_FITTED: "Wrong part fitted",
  SECONDARY_FAULT_MISSED: "Secondary fault missed",
  INSTALLATION_ERROR: "Installation error",
  POWER_OR_INSTALLATION_ISSUE: "Power / installation issue",
  ENVIRONMENTAL_CONDITION: "Environmental condition",
  CUSTOMER_MISUSE: "Customer misuse",
  CUSTOMER_EXPECTATION: "Customer expectation",
  MANUFACTURER_DEFECT: "Manufacturer defect",
  NORMAL_WEAR: "Normal wear",
  NO_FAULT_FOUND: "No fault found",
  OTHER: "Other",
  NOT_DETERMINED_YET: "Not determined yet",
};

export const COMEBACK_RESPONSIBILITY_LABEL: Record<ComebackResponsibility, string> = {
  NNACT_RESPONSIBLE: "NNACT responsible",
  PARTIAL_NNACT_RESPONSIBLE: "Partially NNACT responsible",
  PART_OR_SUPPLIER_FAILURE: "Part / supplier failure",
  MANUFACTURER_ISSUE: "Manufacturer issue",
  CUSTOMER_CAUSED: "Customer caused",
  EXTERNAL_CONDITION: "External condition",
  NEW_UNRELATED_FAULT: "New unrelated fault",
  UNDETERMINED: "Undetermined",
};

export const COMEBACK_PREVENTABILITY_LABEL: Record<ComebackPreventability, string> = {
  PREVENTABLE: "Preventable",
  POSSIBLY_PREVENTABLE: "Possibly preventable",
  NOT_PREVENTABLE: "Not preventable",
  UNKNOWN: "Unknown",
};

export const COMEBACK_BILLING_DECISION_LABEL: Record<ComebackBillingDecision, string> = {
  NO_CHARGE: "No charge",
  PARTIAL_CHARGE: "Partial charge",
  FULL_CHARGE: "Full charge",
  PENDING_REVIEW: "Pending review",
};

export const COMEBACK_WARRANTY_STATUS_LABEL: Record<ComebackWarrantyStatus, string> = {
  FULL: "Full warranty",
  WORKMANSHIP: "Workmanship warranty",
  PARTS: "Parts warranty",
  OUT_OF_WARRANTY: "Out of warranty",
  UNCLEAR: "Warranty unclear",
};

export const COMEBACK_ACTION_STATUS_LABEL: Record<ComebackActionStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export const COMEBACK_CORRECTIVE_ACTION_KIND_LABEL: Record<ComebackCorrectiveActionKind, string> = {
  UPDATE_DIAGNOSTIC_PROCEDURE: "Update diagnostic procedure",
  UPDATE_REPAIR_PROCEDURE: "Update repair procedure",
  TECHNICIAN_TRAINING: "Technician training",
  SUPPLIER_CHANGE: "Change part supplier",
  ADD_FINAL_CHECK: "Add final check",
  CUSTOMER_GUIDANCE: "Customer guidance",
  KNOWLEDGE_ARTICLE: "Knowledge article",
  PROCESS_CHANGE: "Process change",
  OTHER: "Other",
};

export const COMEBACK_COST_KIND_LABEL: Record<ComebackCostKind, string> = {
  PARTS: "Parts",
  LABOUR: "Labour",
  TRANSPORT: "Transport",
  FUEL: "Fuel",
  MISCELLANEOUS: "Miscellaneous",
};

export const COMEBACK_COST_CLASS_LABEL: Record<ComebackCostClass, string> = {
  WARRANTY_COST: "Warranty cost",
  QUALITY_COST: "Quality cost",
  BILLABLE_COMEBACK: "Billable comeback",
  SUPPLIER_RECOVERABLE: "Supplier recoverable",
};

export const COMEBACK_EVIDENCE_KIND_LABEL: Record<ComebackEvidenceKind, string> = {
  COMPLAINT: "Complaint report",
  ORIGINAL_REPAIR: "Original repair",
  COMEBACK_INSPECTION: "Comeback inspection",
  FAILED_PART: "Failed part",
  CORRECTIVE_ACTION: "Corrective action",
  FINAL_TEST: "Final test",
  AFTER_REPAIR: "After repair",
  OTHER: "Other",
};

export const COMEBACK_COMMUNICATION_KIND_LABEL: Record<ComebackCommunicationKind, string> = {
  COMPLAINT_RECEIVED: "Complaint received",
  VISIT_SCHEDULED: "Visit scheduled",
  TECH_DISPATCHED: "Technician dispatched",
  PART_AWAITED: "Part awaited",
  RESOLVED_ANNOUNCED: "Resolution announced",
  CUSTOMER_FOLLOW_UP: "Customer follow-up",
  RECOVERY_OFFER: "Recovery offer",
  SERVICE_CREDIT: "Service credit",
  INVOICE_ISSUED: "Invoice issued",
  CUSTOMER_CONFIRMATION: "Customer confirmation",
  ESCALATION_NOTICE: "Escalation notice",
  OTHER: "Other",
};

export const COMEBACK_MONITORING_OUTCOME_LABEL: Record<ComebackMonitoringOutcome, string> = {
  PENDING: "Pending",
  NO_RELAPSE: "No relapse",
  RELAPSE: "Relapse",
  ESCALATED: "Escalated",
};

export const COMEBACK_CUSTOMER_CONFIRMATION_LABEL: Record<ComebackCustomerConfirmation, string> = {
  NOT_CONTACTED: "Not contacted",
  CONTACTED_PENDING: "Contacted, pending",
  CONFIRMED_RESOLVED: "Confirmed resolved",
  DISPUTED_RESOLUTION: "Disputed resolution",
};

// Badge-friendly tone maps (web + mobile, no Tailwind classes here).
export const COMEBACK_STATUS_TONE: Record<ComebackStatus, string> = {
  REPORTED: "amber",
  TRIAGED: "amber",
  SCHEDULED: "blue",
  UNDER_INVESTIGATION: "blue",
  WAITING_FOR_PART: "purple",
  AWAITING_VERIFICATION: "purple",
  RESOLVED: "green",
  MONITORING: "teal",
  CLOSED: "muted",
  DISPUTED: "orange",
  NOT_A_COMEBACK: "muted",
};

export const COMEBACK_SEVERITY_TONE: Record<ComebackSeverity, string> = {
  LOW: "muted",
  MEDIUM: "amber",
  HIGH: "orange",
  CRITICAL: "red",
};

// ────────────────────────────────────────────────────────────────────────────
// DTOs
// ────────────────────────────────────────────────────────────────────────────

export interface ComebackCaseListItemDTO {
  id: string;
  orgId: string;
  caseNumber: string;
  originalJobId: string | null;
  originalJobNumber: string | null;
  customerId: string | null;
  customerName: string | null;
  equipmentId: string | null;
  equipmentLabel: string | null;
  complaintSummary: string;
  status: ComebackStatus;
  severity: ComebackSeverity;
  faultRelationship: ComebackFaultRelationship;
  responsibility: ComebackResponsibility | null;
  billingDecision: ComebackBillingDecision;
  warrantyStatus: ComebackWarrantyStatus;
  repeatNumber: number;
  escalationLevel: number;
  reportedAt: Date;
  resolvedAt: Date | null;
  closedAt: Date | null;
  internalCostCents: number;
  assignedTechnicianId: string | null;
}

export interface ComebackWarrantyDTO {
  status: ComebackWarrantyStatus;
  workmanshipEndsAt: string | null;
  partsEndsAt: string | null;
}

export interface ComebackCaseDetailDTO extends ComebackCaseListItemDTO {
  intakeReason: ComebackIntakeReason;
  complaintDetails: string | null;
  originalComplaint: string | null;
  originalDiagnosis: string | null;
  originalRepairSummary: string | null;
  originalJobCompletedAt: string | null;
  rootCause: ComebackRootCause | null;
  rootCauseNotes: string | null;
  preventability: ComebackPreventability | null;
  preventabilityNote: string | null;
  customerConfirmation: ComebackCustomerConfirmation;
  monitoringOutcome: ComebackMonitoringOutcome;
  assignedReviewerId: string | null;
  warranty: ComebackWarrantyDTO;
  resolutionSummary: string | null;
  chargeAmountCents: number;
  costs: Array<{
    id: string;
    kind: ComebackCostKind;
    costClass: ComebackCostClass;
    description: string;
    amountCents: number;
    supplierName: string | null;
    recordedBy: string | null;
    createdAt: string;
  }>;
  correctiveActions: Array<{
    id: string;
    kind: ComebackCorrectiveActionKind;
    description: string;
    ownerId: string | null;
    status: ComebackActionStatus;
    dueAt: string | null;
    completedAt: string | null;
    createdAt: string;
  }>;
  evidence: Array<{
    id: string;
    kind: ComebackEvidenceKind;
    photoId: string | null;
    note: string | null;
    createdBy: string | null;
    createdAt: string;
  }>;
  communications: Array<{
    id: string;
    kind: ComebackCommunicationKind;
    summary: string;
    happenedAt: string;
    createdBy: string | null;
    createdAt: string;
  }>;
  followUps: Array<{
    id: string;
    scheduledAt: string;
    outcome: ComebackMonitoringOutcome;
    note: string | null;
    checkedBy: string | null;
    checkedAt: string | null;
    createdAt: string;
  }>;
  statusHistory: Array<{
    fromStatus: ComebackStatus | null;
    toStatus: ComebackStatus;
    reason: string | null;
    changedBy: string | null;
    createdAt: string;
  }>;
  considerationNotes: string | null;
  denyReason: string | null;
}

export interface ComebackAnalyticsDTO {
  periodDays: number;
  totalOpen: number;
  totalClosed: number;
  totalNotComeback: number;
  repeatedCount: number;
  escalatedCount: number;
  rate: ComebackRateResult;
  avgResolutionHours: number | null;
  totalInternalCostCents: number;
  totalBillableCents: number;
  totalSupplierRecoverableCents: number;
  byStatus: Record<string, number>;
  bySeverity: Record<ComebackSeverity, number>;
  byFaultRelationship: Record<string, number>;
  byResponsibility: Record<string, number>;
  byRootCause: Record<string, number>;
  topModels: Array<{ equipmentModelId: string | null; label: string; cases: number; repeatRatePct: number }>;
  trend: Array<{ week: string; created: number; resolved: number }>;
}

export interface ComebackTechnicianMetricDTO {
  userId: string;
  name: string;
  casesAssignedCount: number;
  casesResolvedOwnCount: number;
  reopenedInPeriodCount: number;
  avgResolutionHours: number | null;
  totalInternalCostCents: number;
  totalBillableCents: number;
}

/** Convenience accessor used by web/mobile for policy defaults. */
export function comebackPolicy(settings: BusinessSettings): ComebackSettings {
  return settings.comeback ?? DEFAULT_COMEBACK_SETTINGS;
}

// ────────────────────────────────────────────────────────────────────────────
// Internals
// ────────────────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numOrDefault(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}