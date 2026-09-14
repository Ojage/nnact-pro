// NNACT Pro — Comeback / "Retour" quality management module.
// Multi-tenant (org_id everywhere). Model split:
//   • comeback_cases        — the complaint + investigation record
//   • comeback corrective   — corrective actions, costs, evidence,
//     communications       — follow-ups, and status timeline
//   • comeback jobs         — reuse the existing `jobs` table
//     (job_type = 'comeback', original_job_id, comeback_case_id)
//
// Taxonomy enums mirror the shared domain in @nnact/shared/src/comeback.ts.

import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { orgs, users, jobs, customers, properties, equipment } from "./schema.js";
import { knowledgeProposals } from "./repair-brain.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const version = () => integer("version").default(1).notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();
const createdBy = () => uuid("created_by").references(() => users.id, { onDelete: "set null" });

// ────────────────────────────────────────────────────────────────────────────
// Enums
// ────────────────────────────────────────────────────────────────────────────

export const comebackStatus = pgEnum("comeback_status", [
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
]);

export const comebackSeverity = pgEnum("comeback_severity", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "CRITICAL",
]);

export const comebackFaultRelationship = pgEnum("comeback_fault_relationship", [
  "SAME_FAULT",
  "RELATED_FAULT",
  "NEW_UNRELATED_FAULT",
  "UNKNOWN",
]);

export const comebackIntakeReason = pgEnum("comeback_intake_reason", [
  "CUSTOMER_CALLED",
  "CUSTOMER_VISIT",
  "STAFF_NOTICED",
  "MAINTENANCE_REPORT",
  "ONLINE_REVIEW",
  "FOLLOW_UP_CALL",
  "OTHER",
]);

export const comebackRootCause = pgEnum("comeback_root_cause", [
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
]);

export const comebackResponsibility = pgEnum("comeback_responsibility", [
  "NNACT_RESPONSIBLE",
  "PARTIAL_NNACT_RESPONSIBLE",
  "PART_OR_SUPPLIER_FAILURE",
  "MANUFACTURER_ISSUE",
  "CUSTOMER_CAUSED",
  "EXTERNAL_CONDITION",
  "NEW_UNRELATED_FAULT",
  "UNDETERMINED",
]);

export const comebackPreventability = pgEnum("comeback_preventability", [
  "PREVENTABLE",
  "POSSIBLY_PREVENTABLE",
  "NOT_PREVENTABLE",
  "UNKNOWN",
]);

export const comebackBillingDecision = pgEnum("comeback_billing_decision", [
  "NO_CHARGE",
  "PARTIAL_CHARGE",
  "FULL_CHARGE",
  "PENDING_REVIEW",
]);

export const comebackWarrantyStatus = pgEnum("comeback_warranty_status", [
  "FULL",
  "WORKMANSHIP",
  "PARTS",
  "OUT_OF_WARRANTY",
  "UNCLEAR",
]);

export const comebackActionStatus = pgEnum("comeback_action_status", [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "CANCELLED",
]);

export const comebackCorrectiveActionKind = pgEnum("comeback_corrective_action_kind", [
  "UPDATE_DIAGNOSTIC_PROCEDURE",
  "UPDATE_REPAIR_PROCEDURE",
  "TECHNICIAN_TRAINING",
  "SUPPLIER_CHANGE",
  "ADD_FINAL_CHECK",
  "CUSTOMER_GUIDANCE",
  "KNOWLEDGE_ARTICLE",
  "PROCESS_CHANGE",
  "OTHER",
]);

export const comebackCostKind = pgEnum("comeback_cost_kind", [
  "PARTS",
  "LABOUR",
  "TRANSPORT",
  "FUEL",
  "MISCELLANEOUS",
]);

export const comebackCostClass = pgEnum("comeback_cost_class", [
  "WARRANTY_COST",
  "QUALITY_COST",
  "BILLABLE_COMEBACK",
  "SUPPLIER_RECOVERABLE",
]);

export const comebackEvidenceKind = pgEnum("comeback_evidence_kind", [
  "COMPLAINT",
  "ORIGINAL_REPAIR",
  "COMEBACK_INSPECTION",
  "FAILED_PART",
  "CORRECTIVE_ACTION",
  "FINAL_TEST",
  "AFTER_REPAIR",
  "OTHER",
]);

export const comebackCommunicationKind = pgEnum("comeback_communication_kind", [
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
]);

export const comebackMonitoringOutcome = pgEnum("comeback_monitoring_outcome", [
  "PENDING",
  "NO_RELAPSE",
  "RELAPSE",
  "ESCALATED",
]);

export const comebackCustomerConfirmation = pgEnum("comeback_customer_confirmation", [
  "NOT_CONTACTED",
  "CONTACTED_PENDING",
  "CONFIRMED_RESOLVED",
  "DISPUTED_RESOLUTION",
]);

// ────────────────────────────────────────────────────────────────────────────
// comeback_cases
// ────────────────────────────────────────────────────────────────────────────

export const comebackCases = pgTable(
  "comeback_cases",
  {
    id: id(),
    orgId: orgId(),
    /** Human-readable per-org quality number, e.g. NNACT/RET/2026/000123. */
    caseNumber: text("case_number").notNull(),
    /** The original (first) repair this case is a complaint about. */
    originalJobId: uuid("original_job_id").references(() => jobs.id, { onDelete: "set null" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    propertyId: uuid("property_id").references(() => properties.id, { onDelete: "set null" }),
    equipmentId: uuid("equipment_id").references(() => equipment.id, { onDelete: "set null" }),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    reportedAt: timestamp("reported_at", { withTimezone: true }).defaultNow().notNull(),
    intakeReason: comebackIntakeReason("intake_reason").default("CUSTOMER_CALLED").notNull(),
    complaintSummary: text("complaint_summary").notNull(),
    complaintDetails: text("complaint_details"),
    /** Snapshots taken from the original job at intake time. */
    originalComplaint: text("original_complaint"),
    originalDiagnosis: text("original_diagnosis"),
    originalRepairSummary: text("original_repair_summary"),
    originalJobCompletedAt: timestamp("original_job_completed_at", { withTimezone: true }),
    severity: comebackSeverity("severity").default("MEDIUM").notNull(),
    status: comebackStatus("status").default("REPORTED").notNull(),
    faultRelationship: comebackFaultRelationship("fault_relationship").default("UNKNOWN").notNull(),
    rootCause: comebackRootCause("root_cause"),
    rootCauseNotes: text("root_cause_notes"),
    responsibility: comebackResponsibility("responsibility"),
    preventability: comebackPreventability("preventability"),
    preventabilityNote: text("preventability_note"),
    warrantyStatus: comebackWarrantyStatus("warranty_status").default("UNCLEAR").notNull(),
    workmanshipWarrantyEndsAt: timestamp("workmanship_warranty_ends_at", { withTimezone: true }),
    partsWarrantyEndsAt: timestamp("parts_warranty_ends_at", { withTimezone: true }),
    billingDecision: comebackBillingDecision("billing_decision").default("PENDING_REVIEW").notNull(),
    chargeAmountCents: integer("charge_amount_cents").default(0).notNull(),
    customerConfirmation: comebackCustomerConfirmation("customer_confirmation")
      .default("NOT_CONTACTED")
      .notNull(),
    monitoringOutcome: comebackMonitoringOutcome("monitoring_outcome").default("PENDING").notNull(),
    assignedReviewerId: uuid("assigned_reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    assignedTechnicianId: uuid("assigned_technician_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** nth memory of dissatisfaction against the SAME original job. */
    repeatNumber: integer("repeat_number").default(1).notNull(),
    escalationLevel: integer("escalation_level").default(0).notNull(),
    escalated: boolean("escalated").default(false).notNull(),
    resolutionSummary: text("resolution_summary"),
    considerationNotes: text("consideration_notes"),
    denyReason: text("deny_reason"),
    knowledgeProposalId: uuid("knowledge_proposal_id").references(() => knowledgeProposals.id, {
      onDelete: "set null",
    }),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgNumber: uniqueIndex("comeback_cases_org_number_idx").on(t.orgId, t.caseNumber),
    orgStatus: index("comeback_cases_org_status_idx").on(t.orgId, t.status),
    orgOriginalJob: index("comeback_cases_org_original_job_idx").on(t.orgId, t.originalJobId),
    orgCustomer: index("comeback_cases_org_customer_idx").on(t.orgId, t.customerId),
    orgSeverity: index("comeback_cases_org_severity_idx").on(t.orgId, t.severity),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// comeback_status_history
// ────────────────────────────────────────────────────────────────────────────

export const comebackStatusHistory = pgTable(
  "comeback_status_history",
  {
    id: id(),
    orgId: orgId(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => comebackCases.id, { onDelete: "cascade" }),
    fromStatus: comebackStatus("from_status"),
    toStatus: comebackStatus("to_status").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason"),
    createdAt: ts(),
  },
  (t) => ({
    caseTimeline: index("comeback_status_history_case_idx").on(t.orgId, t.caseId, t.createdAt),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// comeback_corrective_actions
// ────────────────────────────────────────────────────────────────────────────

export const comebackCorrectiveActions = pgTable(
  "comeback_corrective_actions",
  {
    id: id(),
    orgId: orgId(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => comebackCases.id, { onDelete: "cascade" }),
    kind: comebackCorrectiveActionKind("kind").notNull(),
    description: text("description").notNull(),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    status: comebackActionStatus("status").default("OPEN").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    affectsProcedure: boolean("affects_procedure").default(true).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts(),
  },
  (t) => ({
    caseActions: index("comeback_corrective_actions_case_idx").on(t.orgId, t.caseId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// comeback_costs
// ────────────────────────────────────────────────────────────────────────────

export const comebackCosts = pgTable(
  "comeback_costs",
  {
    id: id(),
    orgId: orgId(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => comebackCases.id, { onDelete: "cascade" }),
    /** The comeback visit (job) that incurred the cost, when known. */
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    kind: comebackCostKind("kind").notNull(),
    costClass: comebackCostClass("cost_class").notNull(),
    description: text("description").notNull(),
    amountCents: integer("amount_cents").notNull().default(0),
    supplierName: text("supplier_name"),
    modelPartId: uuid("model_part_id"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts(),
  },
  (t) => ({
    caseCosts: index("comeback_costs_case_idx").on(t.orgId, t.caseId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// comeback_evidence — photos live in `photos`; this joins them to a case.
// ────────────────────────────────────────────────────────────────────────────

export const comebackEvidence = pgTable(
  "comeback_evidence",
  {
    id: id(),
    orgId: orgId(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => comebackCases.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    kind: comebackEvidenceKind("kind").notNull(),
    photoId: uuid("photo_id"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts(),
  },
  (t) => ({
    caseEvidence: index("comeback_evidence_case_idx").on(t.orgId, t.caseId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// comeback_communications — structured log of customer / office comms.
// ────────────────────────────────────────────────────────────────────────────

export const comebackCommunications = pgTable(
  "comeback_communications",
  {
    id: id(),
    orgId: orgId(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => comebackCases.id, { onDelete: "cascade" }),
    kind: comebackCommunicationKind("kind").notNull(),
    summary: text("summary").notNull(),
    happenedAt: timestamp("happened_at", { withTimezone: true }).defaultNow().notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts(),
  },
  (t) => ({
    caseComms: index("comeback_communications_case_idx").on(t.orgId, t.caseId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// comeback_follow_ups — monitoring checkpoints after RESOLVED.
// ────────────────────────────────────────────────────────────────────────────

export const comebackFollowUps = pgTable(
  "comeback_follow_ups",
  {
    id: id(),
    orgId: orgId(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => comebackCases.id, { onDelete: "cascade" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    outcome: comebackMonitoringOutcome("outcome").default("PENDING").notNull(),
    note: text("note"),
    checkedBy: uuid("checked_by").references(() => users.id, { onDelete: "set null" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    caseFollowUps: index("comeback_follow_ups_case_idx").on(t.orgId, t.caseId),
  }),
);