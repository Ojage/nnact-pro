export * from "./auth.js";
export * from "./team-credentials.js";
export * from "./portal.js";
export * from "./brand.js";
export * from "./sponsors.js";
export * from "./documents.js";
export * from "./business-settings.js";
export * from "./operations.js";
export * from "./message-templates.js";
export * from "./sms-templates.js";
export * from "./notifications.js";
export * from "./currency.js";
export * from "./repair-brain.js";
export * from "./mobile-search.js";
export * from "./walkthroughs.js";
export * from "./content.js";
export * from "./content-document.js";
export * from "./publishing.js";
export * from "./ai.js";
export * from "./phone.js";
export * from "./api-error.js";

// Shared domain enums + DTO types used by api, web, and mobile.

export const JOB_STATUS = [
  "lead",
  "scheduled",
  "in_progress",
  "completed",
  "canceled",
] as const;
export type JobStatus = (typeof JOB_STATUS)[number];

export const JOB_SOURCE = ["staff", "customer_request"] as const;
export type JobSource = (typeof JOB_SOURCE)[number];

export const INVOICE_STATUS = ["draft", "sent", "paid", "void"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[number];

// ──────────────────────────────────────────────────────────────────────────────
// Service Agreement & Preventive Maintenance domain (plans → agreements → visits)
// ──────────────────────────────────────────────────────────────────────────────

export const SERVICE_PLAN_STATUS = ["draft", "active", "inactive", "archived"] as const;
export type ServicePlanStatusType = (typeof SERVICE_PLAN_STATUS)[number];

export const PLAN_TYPES = ["standard", "custom"] as const;
export type PlanType = (typeof PLAN_TYPES)[number];

export const TARGET_CUSTOMER_TYPES = [
  "residential",
  "landlord",
  "small_business",
  "commercial",
  "industrial",
  "institutional",
] as const;
export type TargetCustomerType = (typeof TARGET_CUSTOMER_TYPES)[number];

export const PRICING_MODELS = ["fixed", "per_asset", "per_visit", "custom_quote", "negotiated"] as const;
export type PricingModel = (typeof PRICING_MODELS)[number];

export const BILLING_FREQUENCIES = ["one_time", "monthly", "quarterly", "semi_annual", "annual"] as const;
export type BillingFrequency = (typeof BILLING_FREQUENCIES)[number];

export const MAINTENANCE_FREQUENCIES = [
  "monthly",
  "bi_monthly",
  "quarterly",
  "every_4_months",
  "semi_annual",
  "annual",
  "custom",
] as const;
export type MaintenanceFrequency = (typeof MAINTENANCE_FREQUENCIES)[number];

export const RENEWAL_TYPES = ["manual", "automatic"] as const;
export type RenewalType = (typeof RENEWAL_TYPES)[number];

export const SCHEDULE_PRIORITIES = ["standard", "priority", "high_priority", "critical"] as const;
export type SchedulePriority = (typeof SCHEDULE_PRIORITIES)[number];

export const VISIT_TYPES = [
  "preventive",
  "inspection",
  "cleaning",
  "performance_testing",
  "safety_inspection",
  "full_service",
] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export const EQUIPMENT_STATUSES = [
  "operational",
  "requires_attention",
  "under_repair",
  "offline",
  "retired",
] as const;
export type EquipmentStatus = (typeof EQUIPMENT_STATUSES)[number];

export const AGREEMENT_STATUS = [
  "draft",
  "pending_approval",
  "active",
  "suspended",
  "expired",
  "canceled",
  "renewed",
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUS)[number];

export const AGREEMENT_PAYMENT_STATUS = ["unpaid", "partial", "paid"] as const;
export type AgreementPaymentStatus = (typeof AGREEMENT_PAYMENT_STATUS)[number];

export const SERVICE_VISIT_STATUS = [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "rescheduled",
  "canceled",
  "missed",
] as const;
export type ServiceVisitStatus = (typeof SERVICE_VISIT_STATUS)[number];

export const PARTS_POLICIES = [
  "not_included",
  "customer_pays",
  "labour_only",
  "discounted_parts",
  "parts_allowance",
  "custom",
] as const;
export type PartsPolicy = (typeof PARTS_POLICIES)[number];

export const CONSUMABLES_POLICIES = ["included", "not_included", "limited"] as const;
export type ConsumablesPolicy = (typeof CONSUMABLES_POLICIES)[number];

export const EMERGENCY_CALLOUT_COVERAGES = [
  "priority_diagnosis_only",
  "labour_included",
  "labour_discounted",
  "custom",
] as const;
export type EmergencyCalloutCoverage = (typeof EMERGENCY_CALLOUT_COVERAGES)[number];

export interface BenefitOption {
  key: string;
  label: string;
}

export interface BenefitConfigDTO {
  key: string;
  label: string;
  details?: string | null;
  custom?: boolean;
}

export interface CapacityLimitDTO {
  scope: string;
  label: string;
  max?: number | null;
  unit?: string | null;
}

export interface AgreementSnapshotDTO {
  planId: string | null;
  planName: string;
  priceCents: number;
  billingFrequency: BillingFrequency;
  setupFeeCents: number;
  termMonths: number;
  autoRenew: boolean;
  renewalType: RenewalType;
  renewalReminders: number[];
  maintenanceFrequency: MaintenanceFrequency;
  visitsPerTerm: number;
  primaryVisitType: VisitType;
  activities: string[];
  maxCoveredAssets: number | null;
  schedulingPriority: SchedulePriority;
  targetResponseHours: number | null;
  emergencyCalloutAllowance: number;
  emergencyCalloutCoverage: EmergencyCalloutCoverage;
  partsPolicy: PartsPolicy;
  partsDiscountPercent: number;
  partsAllowanceCents: number | null;
  consumablesPolicy: ConsumablesPolicy;
  transportIncluded: boolean;
  benefits: BenefitConfigDTO[];
}

export interface ServiceCategoryDTO {
  id: string;
  orgId: string;
  name: string;
  code?: string | null;
  description?: string | null;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

export interface ServiceChecklistDTO {
  id: string;
  orgId: string;
  name: string;
  categoryId?: string | null;
  items: { id: string; label: string; required?: boolean }[];
  active: boolean;
  createdAt: string;
}

export interface ServiceLocationDTO {
  id: string;
  orgId: string;
  customerId: string;
  name: string;
  address?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  notes?: string | null;
  active: boolean;
  createdAt: string;
}

export interface ServicePlanDTO {
  id: string;
  orgId: string;
  status: ServicePlanStatusType;
  planType: PlanType;
  name: string;
  code?: string | null;
  description?: string | null;
  internalNotes?: string | null;
  categoryId?: string | null;
  coverageCategories: string[];
  coverageEquipmentTypes: string[];
  targetCustomerType: TargetCustomerType;
  maxCoveredAssets: number | null;
  capacityLimits: CapacityLimitDTO[];
  pricingModel: PricingModel;
  priceCents: number;
  billingFrequency: BillingFrequency;
  setupFeeCents: number;
  termMonths: number;
  autoRenew: boolean;
  renewalType: RenewalType;
  renewalReminders: number[];
  maintenanceFrequency: MaintenanceFrequency;
  visitsPerTerm: number;
  primaryVisitType: VisitType;
  activities: string[];
  checklistId?: string | null;
  schedulingPriority: SchedulePriority;
  targetResponseHours: number | null;
  emergencyCalloutAllowance: number | null;
  emergencyCalloutCoverage: EmergencyCalloutCoverage;
  partsPolicy: PartsPolicy;
  partsDiscountPercent: number;
  partsAllowanceCents: number | null;
  consumablesPolicy: ConsumablesPolicy;
  transportIncluded: boolean;
  benefits: BenefitConfigDTO[];
  /** Count of agreements currently on a live status for this template. */
  activeAgreementCount?: number;
  createdAt: string;
}

export interface ServiceAgreementDTO {
  id: string;
  orgId: string;
  agreementNumber: string;
  customerId: string;
  customerName?: string;
  planId?: string | null;
  planName: string;
  planSnapshot: AgreementSnapshotDTO;
  status: AgreementStatus;
  paymentStatus: AgreementPaymentStatus;
  startsAt?: string | null;
  endsAt?: string | null;
  autoRenew: boolean;
  renewalType: RenewalType;
  renewalReminderAt?: string | null;
  visitsIncluded: number;
  visitsCompleted: number;
  priceCents: number;
  billingFrequency: BillingFrequency;
  serviceLocationId?: string | null;
  locationName?: string | null;
  notes?: string | null;
  createdAt: string;
  createdBy?: string | null;
}

export interface ServiceAgreementAssetDTO {
  id: string;
  agreementId: string;
  equipmentId: string;
  equipmentName: string;
  equipmentModel?: string | null;
  equipmentSerial?: string | null;
  status?: EquipmentStatus | null;
  notes?: string | null;
  createdAt: string;
}

export interface VisitPartUsedDTO {
  name: string;
  quantity: number;
  costCents: number;
}

export interface ServiceVisitDTO {
  id: string;
  orgId: string;
  visitNumber: string;
  agreementId: string;
  agreementNumber?: string;
  equipmentId?: string | null;
  equipmentName?: string | null;
  jobId?: string | null;
  title: string;
  visitType: VisitType;
  status: ServiceVisitStatus;
  scheduledAt?: string | null;
  dueAt?: string | null;
  arrivedAt?: string | null;
  completedAt?: string | null;
  technicianId?: string | null;
  technicianName?: string | null;
  activities: string[];
  problemsFound: string[];
  workPerformed?: string | null;
  partsUsed: VisitPartUsedDTO[];
  recommendations?: string | null;
  notes?: string | null;
  createdAt: string;
}

export const PORTAL_LINK_SCOPES = ["balance", "checkout", "receipts", "service_plans", "estimates", "service_history"] as const;
export type PortalLinkScope = (typeof PORTAL_LINK_SCOPES)[number];

export type Money = number; // cents, integer

export interface CustomerDTO {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  primaryAddress?: string | null;
  createdAt: string;
}

export interface JobDTO {
  id: string;
  /** Human-readable per-org work order number (e.g. "JOB-1001"). */
  number?: string | null;
  customerId: string;
  title: string;
  description?: string | null;
  status: JobStatus;
  source?: JobSource | null;
  serviceCategory?: string | null;
  serviceAddress?: string | null;
  preferredDate?: string | null;
  preferredTime?: string | null;
  scheduledAt?: string | null;
  assignedTo?: string | null;
  total: Money;
  /** Tech time cost for the whole job (margin input; never added to the bill). */
  laborCostCents?: number | null;
  createdAt: string;
}

export interface RecurringJobDTO {
  id: string;
  orgId: string;
  customerId: string;
  title: string;
  intervalDays: number;
  nextRunAt: string;
  active: boolean;
  rrule: string | null;
  scheduledTime: string | null;
  createdAt: string;
}

export interface UserDTO {
  id: string;
  orgId: string;
  email: string;
  name: string;
  phone: string | null;
  role: "owner" | "dispatcher" | "technician";
  active: boolean;
  createdAt: string;
}

export interface CreateTeamMemberResponseDTO {
  user: UserDTO;
  temporaryPassword: string;
}

/** One row of the unified org/customer/job activity timeline. */
export interface ActivityDTO {
  id: string;
  customerId?: string | null;
  jobId?: string | null;
  kind: string;
  summary: string;
  createdAt: string;
}

/** Owner dashboard rollup returned by GET /api/reports/summary. */
export interface ReportSummaryDTO {
  jobsByStatus: Partial<Record<JobStatus, number>>;
  revenueCollectedCents: Money;
  accountsReceivableCents: Money;
  rating: { average: number; count: number };
  /** Gross margin sum per status (cents; negative = loss). */
  marginByStatus: Partial<Record<JobStatus, Money>>;
  /** Margin on `completed` jobs only — the realized P&L. Sign-preserving. */
  realizedMarginCents: Money;
  /** Margin on every job except `canceled` — the in-flight opportunity. */
  pipelineMarginCents: Money;
}

/** One AR aging bucket label, ordered youngest to oldest. */
export type ArAgingBucketLabel = "current" | "1-30" | "31-60" | "61-90" | "90+";

export interface ArAgingBucket {
  label: ArAgingBucketLabel;
  count: number;
  totalCents: Money;
}

/** Outstanding invoice balances bucketed by days past due. */
export interface ArAgingReport {
  buckets: ArAgingBucket[];
  totalOutstandingCents: Money;
  invoiceCount: number;
}

/** Estimate funnel over a window: sent → approved/declined/expired. */
export interface EstimateConversionReport {
  sent: number;
  approved: number;
  declined: number;
  expired: number;
  /** approved / (sent + approved + declined + expired); 0 when nothing sent. */
  conversionRate: number;
  /** Mean days from sent to approval among approved estimates; null when none. */
  avgDaysToApprove: number | null;
  windowDays: number;
}

export interface RevenueTrendPoint {
  /** "YYYY-MM" label in the report timezone. */
  month: string;
  revenueCents: Money;
}

/** Monthly collected revenue, zero-filled for months without payments. */
export interface RevenueTrendReport {
  months: RevenueTrendPoint[];
  totalRevenueCents: Money;
  monthsCount: number;
}

export interface TechnicianScorecard {
  technicianId: string | null;
  technicianName: string;
  jobsCompleted: number;
  revenueCents: Money;
  /** Mean review rating over the technician's jobs; null when none. */
  avgRating: number | null;
  /** Fraction of scheduled jobs with an on-time appointment; null when none. */
  onTimeRate: number | null;
}

export interface TechnicianScorecardsReport {
  scorecards: TechnicianScorecard[];
  windowDays: number;
}

export type ReportKind = "ar-aging" | "estimate-conversion" | "revenue-trend" | "technician-scorecards";

// ──────────────────────────────────────────────────────────────────────────────
// Phase 5a — offline mobile sync. PR 1 wireformat shared by server + mobile.
// Ponytail: flat payload keeps DTO light; per-table validation happens in the
// executor (apps/api/src/sync/executor.ts) using Zod. Adding a new table = add
// a row to TABLES there. No TypeScript union gymnastics here.  Ceiling: if a
// table's row shape grows past ~30 fields, swap to typed DTOs per table.
// ──────────────────────────────────────────────────────────────────────────────

/** Tables that participate in offline sync. Source-of-truth = packages/db/src/schema.ts. */
export const SYNC_TABLES = [
  "jobs",
  "line_items",
  "invoices",
  "appointments",
  "customers",
  "estimates",
  "payments",
] as const;
export type SyncOpTable = (typeof SYNC_TABLES)[number];

export type SyncOpType = "create" | "update" | "delete";

/**
 * One mobile-originated mutation. The mobile client constructs these offline
 * from its local SQLite mirror and POSTs them to /api/sync in batches.
 */
export interface SyncOpDTO {
  /** Client-generated op id; echoed back verbatim so mobile can stitch acks. */
  opId: string;
  type: SyncOpType;
  table: SyncOpTable;
  /** Server-known entity id. For `create`, this is the client-supplied UUID
   *  (idClient on hot-path tables). For `update`/`delete`, the server fetches
   *  the row by this id. */
  entityId: string;
  /** Required for `update`/`delete`. Mobile keeps this echo from the last
   *  delta-pulse download. If the server's current version differs, the
   *  op returns `{ ok: false, conflict: { currentVersion } }`. */
  baseVersion?: number;
  /** Flat payload — keys match schema.ts column camelCase. Validated per
   *  table in the executor. */
  payload: Record<string, unknown>;
}

export interface SyncConflictDTO {
  /** Server's current version — mobile merges or shows a conflict banner. */
  currentVersion: number;
}

/**
 * Discriminated error so mobile (PR 2/3) can decide retry policy:
 *   - validation  → bad payload; mobile drops the op, surfaces a toast.
 *   - retryable   → transient DB error (deadlock, connection blip); mobile retries.
 *   - fatal       → connection lost mid-batch; mobile aborts and reconnects.
 *   - unknown     → unclassified; mobile logs and surfaces.
 */
export type SyncErrorKind = "validation" | "retryable" | "fatal" | "unknown";

export interface SyncErrorDTO {
  kind: SyncErrorKind;
  message: string;
}

export interface SyncResultDTO {
  opId: string;
  ok: boolean;
  conflict?: SyncConflictDTO;
  /** Structural error (validation / retryable / fatal / unknown). */
  error?: SyncErrorDTO;
}

export interface SyncRequestDTO {
  ops: SyncOpDTO[];
}

/** 200 OK with per-op results. Mobile iterates and acks each opId locally. */
export interface SyncResponseDTO {
  results: SyncResultDTO[];
}

export * from "./recurrence.js";
