import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { equipment, jobs, orgs, photos, users } from "./schema.js";

export const workflowLifecycleStatus = pgEnum("workflow_lifecycle_status", [
  "draft",
  "extracted",
  "needs_endpoint_review",
  "needs_route_review",
  "needs_electrical_review",
  "needs_field_review",
  "pilot",
  "validated",
  "published",
  "suspended",
  "retired",
]);

export const workflowSupportStatus = pgEnum("workflow_support_status", [
  "validated",
  "pilot",
  "experimental",
  "unsupported",
]);

export const diagnosticSessionStatus = pgEnum("diagnostic_session_status", [
  "not_started",
  "identification_required",
  "workflow_ready",
  "testing",
  "blocked",
  "inconclusive",
  "diagnosed",
  "escalated",
  "under_review",
  "completed",
]);

export const diagnosticStepType = pgEnum("diagnostic_step_type", [
  "check",
  "decision",
  "reference",
  "stop",
]);

export const diagnosticMode = pgEnum("diagnostic_mode", ["field", "guided", "both"]);

export const correctionSeverity = pgEnum("correction_severity", [
  "low",
  "medium",
  "high",
  "safety_critical",
]);

export const correctionStatus = pgEnum("correction_status", [
  "open",
  "triaged",
  "in_review",
  "fixed",
  "rejected",
]);

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

/**
 * One primary appliance per service job for diagnostic execution. The generic
 * work-order model remains intact while this link makes the appliance the
 * center of the technical workflow.
 */
export const jobEquipmentLinks = pgTable(
  "job_equipment_links",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    linkedBy: uuid("linked_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({
    oneEquipmentPerJob: uniqueIndex("job_equipment_links_job_idx").on(t.jobId),
    equipmentHistory: index("job_equipment_links_equipment_idx").on(t.orgId, t.equipmentId),
  }),
);

export const diagnosticWorkflows = pgTable(
  "diagnostic_workflows",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    productType: text("product_type").notNull(),
    make: text("make"),
    modelFamily: text("model_family"),
    versionNumber: integer("version_number").default(1).notNull(),
    supportStatus: workflowSupportStatus("support_status").default("experimental").notNull(),
    lifecycleStatus: workflowLifecycleStatus("lifecycle_status").default("draft").notNull(),
    sourceRevision: text("source_revision"),
    applicability: jsonb("applicability")
      .$type<{ models?: string[]; excludedModels?: string[]; notes?: string[] }>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    limitations: jsonb("limitations").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    orgStatus: index("diagnostic_workflows_org_status_idx").on(
      t.orgId,
      t.lifecycleStatus,
      t.supportStatus,
    ),
    modelLookup: index("diagnostic_workflows_model_idx").on(t.orgId, t.make, t.modelFamily),
  }),
);

export const diagnosticSteps = pgTable(
  "diagnostic_steps",
  {
    id: id(),
    orgId: orgId(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => diagnosticWorkflows.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull(),
    publicLabel: text("public_label").notNull(),
    sequence: integer("sequence").default(0).notNull(),
    mode: diagnosticMode("mode").default("both").notNull(),
    stepType: diagnosticStepType("step_type").default("check").notNull(),
    purpose: text("purpose"),
    safetyState: text("safety_state"),
    powerState: text("power_state"),
    operatingCondition: text("operating_condition"),
    meterMode: text("meter_mode"),
    point1Label: text("point_1_label"),
    point1Endpoint: text("point_1_endpoint"),
    point2Label: text("point_2_label"),
    point2Endpoint: text("point_2_endpoint"),
    connector: text("connector"),
    pin: text("pin"),
    wireColor: text("wire_color"),
    expectedText: text("expected_text"),
    unit: text("unit"),
    passInterpretation: text("pass_interpretation"),
    failInterpretation: text("fail_interpretation"),
    branchRules: jsonb("branch_rules")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    sourceRefs: jsonb("source_refs")
      .$type<Array<Record<string, unknown>>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    accessibilityNote: text("accessibility_note"),
    validationStatus: text("validation_status").default("unreviewed").notNull(),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    workflowSequence: uniqueIndex("diagnostic_steps_workflow_key_idx").on(t.workflowId, t.stepKey),
    sequence: index("diagnostic_steps_sequence_idx").on(t.workflowId, t.sequence),
  }),
);

export const traceRoutes = pgTable(
  "trace_routes",
  {
    id: id(),
    orgId: orgId(),
    stepId: uuid("step_id")
      .notNull()
      .references(() => diagnosticSteps.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    routeKind: text("route_kind").notNull(),
    endpoint1: text("endpoint_1"),
    endpoint2: text("endpoint_2"),
    segmentIds: jsonb("segment_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    continuityValid: boolean("continuity_valid").default(false).notNull(),
    disconnectedIslands: integer("disconnected_islands").default(0).notNull(),
    unintendedBranches: integer("unintended_branches").default(0).notNull(),
    visualAuditStatus: text("visual_audit_status").default("pending").notNull(),
    validationNotes: text("validation_notes"),
    createdAt: createdAt(),
  },
  (t) => ({ step: index("trace_routes_step_idx").on(t.stepId) }),
);

export const diagnosticSessions = pgTable(
  "diagnostic_sessions",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "restrict" }),
    workflowId: uuid("workflow_id").references(() => diagnosticWorkflows.id, {
      onDelete: "set null",
    }),
    workflowVersion: integer("workflow_version"),
    knownFaultId: uuid("known_fault_id"),
    equipmentModelId: uuid("equipment_model_id"),
    status: diagnosticSessionStatus("status").default("not_started").notNull(),
    customerComplaint: text("customer_complaint"),
    technicianObservation: text("technician_observation"),
    errorCodes: jsonb("error_codes").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    serviceTests: jsonb("service_tests")
      .$type<Array<{ name: string; result?: string; note?: string }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    disposition: text("disposition"),
    summary: text("summary"),
    startedBy: uuid("started_by").references(() => users.id, { onDelete: "set null" }),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    version: integer("version").default(1).notNull(),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    orgStatus: index("diagnostic_sessions_org_status_idx").on(t.orgId, t.status),
    job: index("diagnostic_sessions_job_idx").on(t.jobId, t.createdAt),
    equipmentHistory: index("diagnostic_sessions_equipment_idx").on(t.equipmentId, t.createdAt),
  }),
);

export const diagnosticMeasurements = pgTable(
  "diagnostic_measurements",
  {
    id: id(),
    orgId: orgId(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    stepId: uuid("step_id")
      .notNull()
      .references(() => diagnosticSteps.id, { onDelete: "restrict" }),
    enteredBy: uuid("entered_by").references(() => users.id, { onDelete: "set null" }),
    valueText: text("value_text"),
    unit: text("unit"),
    result: text("result").notNull(),
    note: text("note"),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    unableReason: text("unable_reason"),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    session: index("diagnostic_measurements_session_idx").on(t.sessionId, t.recordedAt),
    step: index("diagnostic_measurements_step_idx").on(t.stepId),
  }),
);

export const correctionReports = pgTable(
  "diagnostic_correction_reports",
  {
    id: id(),
    orgId: orgId(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => diagnosticWorkflows.id, { onDelete: "cascade" }),
    workflowVersion: integer("workflow_version").notNull(),
    sessionId: uuid("session_id").references(() => diagnosticSessions.id, {
      onDelete: "set null",
    }),
    stepId: uuid("step_id").references(() => diagnosticSteps.id, { onDelete: "set null" }),
    reportedBy: uuid("reported_by").references(() => users.id, { onDelete: "set null" }),
    category: text("category").notNull(),
    severity: correctionSeverity("severity").default("medium").notNull(),
    description: text("description").notNull(),
    status: correctionStatus("status").default("open").notNull(),
    rootCause: text("root_cause"),
    resolution: text("resolution"),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    openByWorkflow: index("diagnostic_corrections_workflow_idx").on(
      t.workflowId,
      t.status,
      t.severity,
    ),
  }),
);
