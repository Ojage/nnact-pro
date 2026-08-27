// NNACT Institutional Repair Brain — shared types and enums.

export const KNOWLEDGE_CONFIDENCE = [
  "unverified",
  "field_observation",
  "repeated_success",
  "technician_verified",
  "senior_verified",
  "manufacturer_confirmed",
] as const;
export type KnowledgeConfidence = (typeof KNOWLEDGE_CONFIDENCE)[number];

export const KNOWLEDGE_VERIFICATION_STATUS = [
  "field_note",
  "proposed",
  "reviewed",
  "verified",
  "rejected",
  "archived",
] as const;
export type KnowledgeVerificationStatus = (typeof KNOWLEDGE_VERIFICATION_STATUS)[number];

export const KNOWLEDGE_SOURCE_TYPE = [
  "field_job",
  "manufacturer",
  "supplier",
  "internal_research",
  "field_observation",
  "verified_internal",
] as const;
export type KnowledgeSourceType = (typeof KNOWLEDGE_SOURCE_TYPE)[number];

export const REPAIR_OUTCOME = [
  "successful",
  "partial",
  "failed",
  "temporary_fix",
  "waiting_for_part",
  "customer_declined",
  "replacement_recommended",
  "unrepairable",
] as const;
export type RepairOutcomeStatus = (typeof REPAIR_OUTCOME)[number];

export const SAFETY_WARNING = [
  "electrical_hazard",
  "high_voltage",
  "pressurized_refrigerant",
  "rotating_component",
  "hot_surface",
  "battery_hazard",
] as const;
export type SafetyWarning = (typeof SAFETY_WARNING)[number];

export const TECHNICAL_DOCUMENT_TYPE = [
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
] as const;
export type TechnicalDocumentType = (typeof TECHNICAL_DOCUMENT_TYPE)[number];

export const PHOTO_CATEGORY = [
  "nameplate",
  "before_repair",
  "after_repair",
  "component",
  "board",
  "wiring",
  "damage",
  "measurement",
  "part",
  "other",
] as const;
export type PhotoCategory = (typeof PHOTO_CATEGORY)[number];

export const MEASUREMENT_RESULT = [
  "pass",
  "fail",
  "unknown",
  "within_range",
  "out_of_range",
] as const;
export type MeasurementResult = (typeof MEASUREMENT_RESULT)[number];

export const KNOWLEDGE_PROPOSAL_TYPE = [
  "fault",
  "symptom",
  "diagnostic_procedure",
  "repair_procedure",
  "part",
  "measurement",
  "test_point",
  "document",
] as const;
export type KnowledgeProposalType = (typeof KNOWLEDGE_PROPOSAL_TYPE)[number];

export const KNOWLEDGE_PROPOSAL_STATUS = [
  "field_note",
  "proposed",
  "reviewed",
  "verified",
  "rejected",
] as const;
export type KnowledgeProposalStatus = (typeof KNOWLEDGE_PROPOSAL_STATUS)[number];

export interface EquipmentModelDTO {
  id: string;
  orgId: string;
  manufacturer: string;
  brand?: string | null;
  modelNumber: string;
  modelName?: string | null;
  variant?: string | null;
  category: string;
  subcategory?: string | null;
  productFamily?: string | null;
  manufactureYears?: { from?: number; to?: number } | null;
  specifications: Record<string, unknown>;
  aliases: string[];
  normalizedIdentifier: string;
  notes?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SymptomDTO {
  id: string;
  orgId: string;
  label: string;
  normalizedLabel: string;
  description?: string | null;
  category?: string | null;
  createdBy?: string | null;
  createdAt: string;
}

export interface KnownFaultDTO {
  id: string;
  orgId: string;
  equipmentModelId: string;
  faultCode?: string | null;
  normalizedFaultCode?: string | null;
  title: string;
  description?: string | null;
  severity?: string | null;
  frequency?: string | null;
  safetyWarnings: SafetyWarning[];
  probableCauses: string[];
  confidenceStatus: KnowledgeConfidence;
  verificationStatus: KnowledgeVerificationStatus;
  sourceType?: KnowledgeSourceType | null;
  sourceJobId?: string | null;
  sourceEquipmentId?: string | null;
  createdBy?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  revision: number;
  createdAt: string;
  updatedAt: string;
  symptoms?: SymptomDTO[];
}

export interface RepairProcedureDTO {
  id: string;
  orgId: string;
  equipmentModelId: string;
  knownFaultId?: string | null;
  title: string;
  description?: string | null;
  prerequisites: string[];
  safetyWarnings: SafetyWarning[];
  requiredTools: string[];
  requiredParts: Array<{ partName: string; oemPartNumber?: string }>;
  steps: Array<{
    sequence: number;
    instruction: string;
    warning?: string;
    tool?: string;
    verification?: string;
  }>;
  expectedDurationMinutes?: number | null;
  skillLevel?: string | null;
  verificationSteps: string[];
  confidenceStatus: KnowledgeConfidence;
  verificationStatus: KnowledgeVerificationStatus;
  createdBy?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FieldMeasurementDTO {
  id: string;
  orgId: string;
  sessionId?: string | null;
  repairOutcomeId?: string | null;
  equipmentModelId?: string | null;
  testPointId?: string | null;
  parameter: string;
  unit?: string | null;
  expectedMin?: string | null;
  expectedMax?: string | null;
  expectedExact?: string | null;
  observedValue?: string | null;
  result: MeasurementResult;
  testLocation?: string | null;
  instrumentUsed?: string | null;
  notes?: string | null;
  recordedBy?: string | null;
  recordedAt: string;
}

export interface ModelPartDTO {
  id: string;
  orgId: string;
  equipmentModelId: string;
  catalogItemId?: string | null;
  partName: string;
  oemPartNumber?: string | null;
  manufacturer?: string | null;
  alternativePartNumber?: string | null;
  specifications: Record<string, unknown>;
  reliabilityNotes?: string | null;
  lastKnownPriceCents?: number | null;
  confidenceStatus: KnowledgeConfidence;
  verificationStatus: KnowledgeVerificationStatus;
  compatibleModelIds: string[];
  createdBy?: string | null;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepairOutcomeDTO {
  id: string;
  orgId: string;
  jobId: string;
  equipmentId: string;
  equipmentModelId?: string | null;
  diagnosticSessionId?: string | null;
  knownFaultId?: string | null;
  repairProcedureId?: string | null;
  outcome: RepairOutcomeStatus;
  whatWasDone?: string | null;
  partsUsed: Array<{ partName: string; oemPartNumber?: string; quantity?: number }>;
  laborMinutes?: number | null;
  technicianId?: string | null;
  machineStatus?: string | null;
  technicianConfidence?: number | null;
  customerOutcome?: string | null;
  followUpNeeded: boolean;
  isFailedAttempt: boolean;
  conclusion?: string | null;
  notes?: string | null;
  createdAt: string;
}

export interface KnowledgeProposalDTO {
  id: string;
  orgId: string;
  sourceJobId?: string | null;
  sourceEquipmentId?: string | null;
  sourceSessionId?: string | null;
  sourceRepairOutcomeId?: string | null;
  equipmentModelId?: string | null;
  proposalType: KnowledgeProposalType;
  title: string;
  payload: Record<string, unknown>;
  status: KnowledgeProposalStatus;
  proposedBy?: string | null;
  reviewedBy?: string | null;
  verifiedBy?: string | null;
  targetEntityType?: string | null;
  targetEntityId?: string | null;
  reviewNotes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RepairBrainSearchResults {
  models: Array<{ id: string; manufacturer: string; modelNumber: string; modelName?: string | null; category: string }>;
  faults: Array<{ id: string; equipmentModelId: string; title: string; faultCode?: string | null }>;
  parts: Array<{ id: string; equipmentModelId: string; partName: string; oemPartNumber?: string | null }>;
  procedures: Array<{ id: string; equipmentModelId: string; title: string; type: "repair" | "diagnostic" }>;
  documents: Array<{ id: string; title: string; documentType: string; equipmentModelId?: string | null }>;
  repairHistory: Array<{ id: string; equipmentModelId?: string | null; outcome: string; conclusion?: string | null }>;
}

/** Normalize model identifier for deduplication and search. */
export function normalizeModelIdentifier(manufacturer: string, modelNumber: string): string {
  return `${manufacturer}${modelNumber}`.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalize fault code for deduplication. */
export function normalizeFaultCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Normalize symptom label for deduplication. */
export function normalizeSymptomLabel(label: string): string {
  return label.toLowerCase().trim().replace(/\s+/g, " ");
}
