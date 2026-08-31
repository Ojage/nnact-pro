/**
 * NNACT Institutional Repair Brain — relational schema.
 *
 * Extends the field-service domain with reusable equipment-model knowledge,
 * fault intelligence, repair procedures, structured measurements, and a
 * knowledge promotion workflow. Equipment instances remain in `equipment`;
 * diagnostic execution remains in the diagnostics subsystem.
 */
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
import type { SafetyWarning } from "@nnact/shared";
import { catalogItems, equipment, jobs, orgs, photos, users } from "./schema.js";
import { diagnosticSessions, diagnosticWorkflows } from "./diagnostics.js";

export const knowledgeConfidence = pgEnum("knowledge_confidence", [
  "unverified",
  "field_observation",
  "repeated_success",
  "technician_verified",
  "senior_verified",
  "manufacturer_confirmed",
]);

export const knowledgeVerificationStatus = pgEnum("knowledge_verification_status", [
  "field_note",
  "proposed",
  "reviewed",
  "verified",
  "rejected",
  "archived",
]);

export const knowledgeSourceType = pgEnum("knowledge_source_type", [
  "field_job",
  "manufacturer",
  "supplier",
  "internal_research",
  "field_observation",
  "verified_internal",
]);

export const repairOutcomeStatus = pgEnum("repair_outcome_status", [
  "successful",
  "partial",
  "failed",
  "temporary_fix",
  "waiting_for_part",
  "customer_declined",
  "replacement_recommended",
  "unrepairable",
]);

export const technicalDocumentType = pgEnum("technical_document_type", [
  "service_manual",
  "user_manual",
  "wiring_diagram",
  "schematic",
  "datasheet",
  "board_image",
  "exploded_view",
  "internal_report",
  "field_note",
  "video",
  "audio",
  "supplier_document",
]);

export const measurementResult = pgEnum("measurement_result", [
  "pass",
  "fail",
  "unknown",
  "within_range",
  "out_of_range",
]);

export const knowledgeProposalType = pgEnum("knowledge_proposal_type", [
  "fault",
  "symptom",
  "diagnostic_procedure",
  "repair_procedure",
  "part",
  "measurement",
  "test_point",
  "document",
]);

export const knowledgeProposalStatus = pgEnum("knowledge_proposal_status", [
  "field_note",
  "proposed",
  "reviewed",
  "verified",
  "rejected",
]);

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

/** Reusable product identity and accumulated model-level technical knowledge. */
export const equipmentModels = pgTable(
  "equipment_models",
  {
    id: id(),
    orgId: orgId(),
    manufacturer: text("manufacturer").notNull(),
    brand: text("brand"),
    modelNumber: text("model_number").notNull(),
    modelName: text("model_name"),
    variant: text("variant"),
    category: text("category").notNull(),
    subcategory: text("subcategory"),
    productFamily: text("product_family"),
    manufactureYears: jsonb("manufacture_years").$type<{ from?: number; to?: number } | null>(),
    specifications: jsonb("specifications")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    aliases: jsonb("aliases").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    normalizedIdentifier: text("normalized_identifier").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    orgNormalized: uniqueIndex("equipment_models_org_normalized_idx").on(t.orgId, t.normalizedIdentifier),
    orgCategory: index("equipment_models_org_category_idx").on(t.orgId, t.category),
    search: index("equipment_models_search_idx").on(t.orgId, t.manufacturer, t.modelNumber),
  }),
);

/** Reusable searchable symptom records. */
export const symptoms = pgTable(
  "symptoms",
  {
    id: id(),
    orgId: orgId(),
    label: text("label").notNull(),
    normalizedLabel: text("normalized_label").notNull(),
    description: text("description"),
    category: text("category"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({
    orgNormalized: uniqueIndex("symptoms_org_normalized_idx").on(t.orgId, t.normalizedLabel),
  }),
);

/** Model-level fault knowledge with provenance and verification. */
export const knownFaults = pgTable(
  "known_faults",
  {
    id: id(),
    orgId: orgId(),
    equipmentModelId: uuid("equipment_model_id")
      .notNull()
      .references(() => equipmentModels.id, { onDelete: "cascade" }),
    faultCode: text("fault_code"),
    normalizedFaultCode: text("normalized_fault_code"),
    title: text("title").notNull(),
    description: text("description"),
    severity: text("severity"),
    frequency: text("frequency"),
    safetyWarnings: jsonb("safety_warnings")
      .$type<SafetyWarning[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    probableCauses: jsonb("probable_causes").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    usefulCount: integer("useful_count").default(0).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    confidenceStatus: knowledgeConfidence("confidence_status").default("unverified").notNull(),
    verificationStatus: knowledgeVerificationStatus("verification_status").default("field_note").notNull(),
    sourceType: knowledgeSourceType("source_type"),
    sourceJobId: uuid("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    sourceEquipmentId: uuid("source_equipment_id").references(() => equipment.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    revision: integer("revision").default(1).notNull(),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    modelIdx: index("known_faults_model_idx").on(t.orgId, t.equipmentModelId),
    faultCodeIdx: index("known_faults_code_idx").on(t.orgId, t.normalizedFaultCode),
  }),
);

export const faultSymptoms = pgTable(
  "fault_symptoms",
  {
    id: id(),
    orgId: orgId(),
    faultId: uuid("fault_id")
      .notNull()
      .references(() => knownFaults.id, { onDelete: "cascade" }),
    symptomId: uuid("symptom_id")
      .notNull()
      .references(() => symptoms.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniquePair: uniqueIndex("fault_symptoms_pair_idx").on(t.faultId, t.symptomId),
  }),
);

/** Reusable repair procedure knowledge at model (+ optional fault) level. */
export const repairProcedures = pgTable(
  "repair_procedures",
  {
    id: id(),
    orgId: orgId(),
    equipmentModelId: uuid("equipment_model_id")
      .notNull()
      .references(() => equipmentModels.id, { onDelete: "cascade" }),
    knownFaultId: uuid("known_fault_id").references(() => knownFaults.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    prerequisites: jsonb("prerequisites").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    safetyWarnings: jsonb("safety_warnings")
      .$type<SafetyWarning[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    requiredTools: jsonb("required_tools").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    requiredParts: jsonb("required_parts")
      .$type<Array<{ partName: string; oemPartNumber?: string }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    steps: jsonb("steps")
      .$type<
        Array<{
          sequence: number;
          instruction: string;
          warning?: string;
          tool?: string;
          verification?: string;
        }>
      >()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    expectedDurationMinutes: integer("expected_duration_minutes"),
    skillLevel: text("skill_level"),
    verificationSteps: jsonb("verification_steps").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    usefulCount: integer("useful_count").default(0).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    confidenceStatus: knowledgeConfidence("confidence_status").default("unverified").notNull(),
    verificationStatus: knowledgeVerificationStatus("verification_status").default("field_note").notNull(),
    sourceType: knowledgeSourceType("source_type"),
    sourceJobId: uuid("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    modelIdx: index("repair_procedures_model_idx").on(t.orgId, t.equipmentModelId),
    faultIdx: index("repair_procedures_fault_idx").on(t.knownFaultId),
  }),
);

/** Model-level test points for structured diagnostics. */
export const testPoints = pgTable(
  "test_points",
  {
    id: id(),
    orgId: orgId(),
    equipmentModelId: uuid("equipment_model_id")
      .notNull()
      .references(() => equipmentModels.id, { onDelete: "cascade" }),
    component: text("component"),
    board: text("board"),
    connector: text("connector"),
    pin: text("pin"),
    description: text("description"),
    expectedMin: text("expected_min"),
    expectedMax: text("expected_max"),
    expectedExact: text("expected_exact"),
    unit: text("unit"),
    warning: text("warning"),
    photoId: uuid("photo_id").references(() => photos.id, { onDelete: "set null" }),
    confidenceStatus: knowledgeConfidence("confidence_status").default("unverified").notNull(),
    verificationStatus: knowledgeVerificationStatus("verification_status").default("field_note").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({ modelIdx: index("test_points_model_idx").on(t.orgId, t.equipmentModelId) }),
);

/** Structured field measurements — session or repair outcome context. */
export const fieldMeasurements = pgTable(
  "field_measurements",
  {
    id: id(),
    orgId: orgId(),
    sessionId: uuid("session_id").references(() => diagnosticSessions.id, { onDelete: "cascade" }),
    repairOutcomeId: uuid("repair_outcome_id"),
    equipmentModelId: uuid("equipment_model_id").references(() => equipmentModels.id, {
      onDelete: "set null",
    }),
    testPointId: uuid("test_point_id").references(() => testPoints.id, { onDelete: "set null" }),
    parameter: text("parameter").notNull(),
    unit: text("unit"),
    expectedMin: text("expected_min"),
    expectedMax: text("expected_max"),
    expectedExact: text("expected_exact"),
    observedValue: text("observed_value"),
    result: measurementResult("result").default("unknown").notNull(),
    testLocation: text("test_location"),
    instrumentUsed: text("instrument_used"),
    notes: text("notes"),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionIdx: index("field_measurements_session_idx").on(t.sessionId),
    modelIdx: index("field_measurements_model_idx").on(t.equipmentModelId),
  }),
);

/** Compatible parts intelligence — links to price-book catalog when available. */
export const modelParts = pgTable(
  "model_parts",
  {
    id: id(),
    orgId: orgId(),
    equipmentModelId: uuid("equipment_model_id")
      .notNull()
      .references(() => equipmentModels.id, { onDelete: "cascade" }),
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, { onDelete: "set null" }),
    partName: text("part_name").notNull(),
    oemPartNumber: text("oem_part_number"),
    manufacturer: text("manufacturer"),
    alternativePartNumber: text("alternative_part_number"),
    specifications: jsonb("specifications")
      .$type<Record<string, unknown>>()
      .default(sql`'{}'::jsonb`)
      .notNull(),
    reliabilityNotes: text("reliability_notes"),
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    usefulCount: integer("useful_count").default(0).notNull(),
    lastKnownPriceCents: integer("last_known_price_cents"),
    compatibleModelIds: jsonb("compatible_model_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    confidenceStatus: knowledgeConfidence("confidence_status").default("unverified").notNull(),
    verificationStatus: knowledgeVerificationStatus("verification_status").default("field_note").notNull(),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    modelIdx: index("model_parts_model_idx").on(t.orgId, t.equipmentModelId),
    oemIdx: index("model_parts_oem_idx").on(t.orgId, t.oemPartNumber),
  }),
);

/** Supplier/procurement history for parts intelligence. */
export const partProcurementRecords = pgTable(
  "part_procurement_records",
  {
    id: id(),
    orgId: orgId(),
    modelPartId: uuid("model_part_id")
      .notNull()
      .references(() => modelParts.id, { onDelete: "cascade" }),
    supplierName: text("supplier_name").notNull(),
    costCents: integer("cost_cents").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).defaultNow().notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    requestedBy: uuid("requested_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({ partIdx: index("part_procurement_part_idx").on(t.modelPartId, t.purchasedAt) }),
);

/** Technical documents, schematics, and exploded views. */
export const technicalDocuments = pgTable(
  "technical_documents",
  {
    id: id(),
    orgId: orgId(),
    title: text("title").notNull(),
    documentType: technicalDocumentType("document_type").notNull(),
    sourceType: knowledgeSourceType("source_type").default("internal_research").notNull(),
    equipmentModelId: uuid("equipment_model_id").references(() => equipmentModels.id, {
      onDelete: "set null",
    }),
    knownFaultId: uuid("known_fault_id").references(() => knownFaults.id, { onDelete: "set null" }),
    repairProcedureId: uuid("repair_procedure_id").references(() => repairProcedures.id, {
      onDelete: "set null",
    }),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    version: text("version"),
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    notes: text("notes"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, { onDelete: "set null" }),
    verificationStatus: knowledgeVerificationStatus("verification_status").default("field_note").notNull(),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    modelIdx: index("technical_documents_model_idx").on(t.orgId, t.equipmentModelId),
    typeIdx: index("technical_documents_type_idx").on(t.orgId, t.documentType),
  }),
);

/** Actual repair outcomes — successful and failed attempts are both knowledge. */
export const repairOutcomes = pgTable(
  "repair_outcomes",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "restrict" }),
    equipmentModelId: uuid("equipment_model_id").references(() => equipmentModels.id, {
      onDelete: "set null",
    }),
    diagnosticSessionId: uuid("diagnostic_session_id").references(() => diagnosticSessions.id, {
      onDelete: "set null",
    }),
    knownFaultId: uuid("known_fault_id").references(() => knownFaults.id, { onDelete: "set null" }),
    repairProcedureId: uuid("repair_procedure_id").references(() => repairProcedures.id, {
      onDelete: "set null",
    }),
    outcome: repairOutcomeStatus("outcome").notNull(),
    whatWasDone: text("what_was_done"),
    partsUsed: jsonb("parts_used")
      .$type<Array<{ partName: string; oemPartNumber?: string; quantity?: number }>>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    laborMinutes: integer("labor_minutes"),
    technicianId: uuid("technician_id").references(() => users.id, { onDelete: "set null" }),
    machineStatus: text("machine_status"),
    technicianConfidence: integer("technician_confidence"),
    customerOutcome: text("customer_outcome"),
    followUpNeeded: boolean("follow_up_needed").default(false).notNull(),
    isFailedAttempt: boolean("is_failed_attempt").default(false).notNull(),
    conclusion: text("conclusion"),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => ({
    jobIdx: index("repair_outcomes_job_idx").on(t.jobId),
    equipmentIdx: index("repair_outcomes_equipment_idx").on(t.equipmentId, t.createdAt),
    modelIdx: index("repair_outcomes_model_idx").on(t.orgId, t.equipmentModelId, t.outcome),
  }),
);

/** Knowledge promotion workflow — field findings → reviewed model knowledge. */
export const knowledgeProposals = pgTable(
  "knowledge_proposals",
  {
    id: id(),
    orgId: orgId(),
    sourceJobId: uuid("source_job_id").references(() => jobs.id, { onDelete: "set null" }),
    sourceEquipmentId: uuid("source_equipment_id").references(() => equipment.id, {
      onDelete: "set null",
    }),
    sourceSessionId: uuid("source_session_id").references(() => diagnosticSessions.id, {
      onDelete: "set null",
    }),
    sourceRepairOutcomeId: uuid("source_repair_outcome_id").references(() => repairOutcomes.id, {
      onDelete: "set null",
    }),
    equipmentModelId: uuid("equipment_model_id").references(() => equipmentModels.id, {
      onDelete: "set null",
    }),
    proposalType: knowledgeProposalType("proposal_type").notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default(sql`'{}'::jsonb`).notNull(),
    status: knowledgeProposalStatus("status").default("field_note").notNull(),
    proposedBy: uuid("proposed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    verifiedBy: uuid("verified_by").references(() => users.id, { onDelete: "set null" }),
    targetEntityType: text("target_entity_type"),
    targetEntityId: uuid("target_entity_id"),
    reviewNotes: text("review_notes"),
    updatedAt: updatedAt(),
    createdAt: createdAt(),
  },
  (t) => ({
    statusIdx: index("knowledge_proposals_status_idx").on(t.orgId, t.status),
    modelIdx: index("knowledge_proposals_model_idx").on(t.equipmentModelId),
  }),
);

/** Lightweight audit trail for knowledge mutations. */
export const knowledgeRevisions = pgTable(
  "knowledge_revisions",
  {
    id: id(),
    orgId: orgId(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    changedBy: uuid("changed_by").references(() => users.id, { onDelete: "set null" }),
    changeReason: text("change_reason"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    entityIdx: index("knowledge_revisions_entity_idx").on(t.orgId, t.entityType, t.entityId),
  }),
);

/** Exploded view diagrams with component mapping. */
export const explodedViews = pgTable(
  "exploded_views",
  {
    id: id(),
    orgId: orgId(),
    equipmentModelId: uuid("equipment_model_id")
      .notNull()
      .references(() => equipmentModels.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sourceType: knowledgeSourceType("source_type").default("internal_research").notNull(),
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    notes: text("notes"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({ modelIdx: index("exploded_views_model_idx").on(t.orgId, t.equipmentModelId) }),
);

export const explodedViewComponents = pgTable(
  "exploded_view_components",
  {
    id: id(),
    orgId: orgId(),
    explodedViewId: uuid("exploded_view_id")
      .notNull()
      .references(() => explodedViews.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    partNumber: text("part_number"),
    modelPartId: uuid("model_part_id").references(() => modelParts.id, { onDelete: "set null" }),
    positionNotes: text("position_notes"),
    createdAt: createdAt(),
  },
  (t) => ({ viewIdx: index("exploded_view_components_view_idx").on(t.explodedViewId) }),
);

/** Link diagnostic workflows to equipment models and known faults. */
export const diagnosticWorkflowExtensions = pgTable(
  "diagnostic_workflow_extensions",
  {
    id: id(),
    orgId: orgId(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => diagnosticWorkflows.id, { onDelete: "cascade" }),
    equipmentModelId: uuid("equipment_model_id").references(() => equipmentModels.id, {
      onDelete: "set null",
    }),
    knownFaultId: uuid("known_fault_id").references(() => knownFaults.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => ({
    workflowUnique: uniqueIndex("diagnostic_workflow_extensions_workflow_idx").on(t.workflowId),
  }),
);
