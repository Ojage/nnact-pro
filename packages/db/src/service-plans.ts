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
  unique,
} from "drizzle-orm/pg-core";
import { orgs, customers, jobs, users, equipment } from "./schema.js";

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

/** Template lifecycle. Draft → Active → Inactive/Archived. */
export const servicePlanStatus = pgEnum("plan_status", [
  "draft",
  "active",
  "inactive",
  "archived",
]);

export const agreementStatus = pgEnum("agreement_status", [
  "draft",
  "pending_approval",
  "active",
  "suspended",
  "expired",
  "canceled",
  "renewed",
]);

export const agreementPaymentStatus = pgEnum("agreement_payment_status", [
  "unpaid",
  "partial",
  "paid",
]);

/** Only these are "live" — they produce scheduled maintenance. */
export const liveAgreementStatuses = ["active", "pending_approval"] as const;

export const serviceVisitStatus = pgEnum("visit_status", [
  "scheduled",
  "confirmed",
  "in_progress",
  "completed",
  "rescheduled",
  "canceled",
  "missed",
]);

export const targetCustomerType = pgEnum("target_customer_type", [
  "residential",
  "landlord",
  "small_business",
  "commercial",
  "industrial",
  "institutional",
]);

export const planType = pgEnum("plan_type", ["standard", "custom"]);

export const pricingModel = pgEnum("pricing_model", [
  "fixed",
  "per_asset",
  "per_visit",
  "custom_quote",
  "negotiated",
]);

export const billingFrequency = pgEnum("billing_frequency", [
  "one_time",
  "monthly",
  "quarterly",
  "semi_annual",
  "annual",
]);

export const maintenanceFrequency = pgEnum("maintenance_frequency", [
  "monthly",
  "bi_monthly",
  "quarterly",
  "every_4_months",
  "semi_annual",
  "annual",
  "custom",
]);

export const renewalType = pgEnum("renewal_type", ["manual", "automatic"]);

export const schedulePriority = pgEnum("schedule_priority", [
  "standard",
  "priority",
  "high_priority",
  "critical",
]);

export const serviceVisitType = pgEnum("visit_type", [
  "preventive",
  "inspection",
  "cleaning",
  "performance_testing",
  "safety_inspection",
  "full_service",
]);

// ────────────────────────────────────────────────────────────────────────────
// Service categories (HVAC, Refrigeration, Home Appliances, Generators, …)
// ────────────────────────────────────────────────────────────────────────────

export const serviceCategories = pgTable(
  "service_categories",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    org: index("service_categories_org_idx").on(t.orgId, t.sortOrder),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Reusable service checklists (e.g. "HVAC Preventive", "Generator PM")
// ────────────────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: string;
  label: string;
  required?: boolean;
}

export const serviceChecklists = pgTable(
  "service_checklists",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
    items: jsonb("items").$type<ChecklistItem[]>().default(sql`'[]'::jsonb`).notNull(),
    active: boolean("active").default(true).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    org: index("service_checklists_org_idx").on(t.orgId, t.active),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Service plan templates. A plan is configuration, not a contract.
// ────────────────────────────────────────────────────────────────────────────

export interface BenefitConfig {
  key: string;
  label: string;
  details?: string;
  custom?: boolean;
}

export interface CapacityLimit {
  scope: "ac_capacity" | "generator_capacity" | "cold_room_size" | "refrigeration_capacity" | "other";
  label: string;
  max: number;
  unit: string;
}

export const servicePlans = pgTable(
  "service_plans",
  {
    id: id(),
    orgId: orgId(),
    status: servicePlanStatus("status").default("draft").notNull(),
    planType: planType("plan_type").default("standard").notNull(),
    name: text("name").notNull(),
    code: text("code"),
    description: text("description"),
    internalNotes: text("internal_notes"),
    categoryId: uuid("category_id").references(() => serviceCategories.id, { onDelete: "set null" }),
    /** Secondary categories attached to the plan. */
    coverageCategories: jsonb("coverage_categories")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    /** Covered equipment types, e.g. ["Split AC", "Cassette AC", "Generator"]. */
    coverageEquipmentTypes: jsonb("coverage_equipment_types")
      .$type<string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    targetCustomerType: targetCustomerType("target_customer_type").default("residential").notNull(),
    /** Max assets under one agreement; null = unlimited. */
    maxCoveredAssets: integer("max_covered_assets"),
    capacityLimits: jsonb("capacity_limits")
      .$type<CapacityLimit[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    pricingModel: pricingModel("pricing_model").default("fixed").notNull(),
    priceCents: integer("price_cents").default(0).notNull(),
    billingFrequency: billingFrequency("billing_frequency").default("annual").notNull(),
    setupFeeCents: integer("setup_fee_cents").default(0).notNull(),
    termMonths: integer("term_months").default(12).notNull(),
    autoRenew: boolean("auto_renew").default(false).notNull(),
    renewalType: renewalType("renewal_type").default("manual").notNull(),
    /** Days before end of term to remind. */
    renewalReminders: jsonb("renewal_reminders")
      .$type<number[]>()
      .default(sql`'[30]'::jsonb`)
      .notNull(),
    maintenanceFrequency: maintenanceFrequency("maintenance_frequency").default("quarterly").notNull(),
    visitsPerTerm: integer("visits_per_term").default(4).notNull(),
    primaryVisitType: serviceVisitType("primary_visit_type").default("preventive").notNull(),
    /** Included service activities, e.g. ["Filter cleaning", "Condenser cleaning"]. */
    activities: jsonb("activities").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    checklistId: uuid("checklist_id").references(() => serviceChecklists.id, { onDelete: "set null" }),
    schedulingPriority: schedulePriority("scheduling_priority").default("standard").notNull(),
    /** e.g. 72 hours; null = "as soon as operationally possible". */
    targetResponseHours: integer("target_response_hours"),
    /** 0 = none, -1 = unlimited. */
    emergencyCalloutAllowance: integer("emergency_callout_allowance").default(0).notNull(),
    emergencyCalloutCoverage: text("emergency_callout_coverage")
      .default("priority_diagnosis_only")
      .notNull(),
    partsPolicy: text("parts_policy").default("not_included").notNull(),
    partsDiscountPercent: integer("parts_discount_percent").default(0).notNull(),
    partsAllowanceCents: integer("parts_allowance_cents").default(0).notNull(),
    consumablesPolicy: text("consumables_policy").default("not_included").notNull(),
    transportIncluded: boolean("transport_included").default(false).notNull(),
    benefits: jsonb("benefits").$type<BenefitConfig[]>().default(sql`'[]'::jsonb`).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    org: index("service_plans_org_idx").on(t.orgId, t.status),
    category: index("service_plans_category_idx").on(t.orgId, t.categoryId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Service locations (a customer may maintain several sites).
// ────────────────────────────────────────────────────────────────────────────

export const serviceLocations = pgTable(
  "service_locations",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    notes: text("notes"),
    active: boolean("active").default(true).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    customer: index("service_locations_customer_idx").on(t.orgId, t.customerId, t.active),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Customer service agreements — instances of a plan, with a frozen snapshot.
// A custom agreement can exist without a template (planId null).
// ────────────────────────────────────────────────────────────────────────────

/** Configuration frozen at subscription time — see Business Rule #4. */
export interface AgreementSnapshot {
  planId: string | null;
  planName: string;
  priceCents: number;
  billingFrequency: string;
  setupFeeCents: number;
  termMonths: number;
  autoRenew: boolean;
  renewalType: string;
  renewalReminders: number[];
  maintenanceFrequency: string;
  visitsPerTerm: number;
  primaryVisitType: string;
  activities: string[];
  maxCoveredAssets: number | null;
  schedulingPriority: string;
  targetResponseHours: number | null;
  emergencyCalloutAllowance: number;
  emergencyCalloutCoverage: string;
  partsPolicy: string;
  partsDiscountPercent: number;
  partsAllowanceCents: number;
  consumablesPolicy: string;
  transportIncluded: boolean;
  benefits: BenefitConfig[];
}

export const serviceAgreements = pgTable(
  "service_agreements",
  {
    id: id(),
    orgId: orgId(),
    agreementNumber: text("agreement_number").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => servicePlans.id, { onDelete: "set null" }),
    planName: text("plan_name").notNull(),
    planSnapshot: jsonb("plan_snapshot").$type<AgreementSnapshot>().notNull(),
    status: agreementStatus("status").default("draft").notNull(),
    paymentStatus: agreementPaymentStatus("payment_status").default("unpaid").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    autoRenew: boolean("auto_renew").default(false).notNull(),
    renewalType: renewalType("renewal_type").default("manual").notNull(),
    renewalReminderAt: timestamp("renewal_reminder_at", { withTimezone: true }),
    visitsIncluded: integer("visits_included").default(0).notNull(),
    visitsCompleted: integer("visits_completed").default(0).notNull(),
    priceCents: integer("price_cents").default(0).notNull(),
    billingFrequency: billingFrequency("billing_frequency").default("annual").notNull(),
    serviceLocationId: uuid("service_location_id").references(() => serviceLocations.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
    createdBy: createdBy(),
  },
  (t) => ({
    orgStatus: index("service_agreements_org_status_idx").on(t.orgId, t.status),
    customer: index("service_agreements_customer_idx").on(t.orgId, t.customerId, t.status),
    plan: index("service_agreements_plan_idx").on(t.orgId, t.planId),
    number: unique("service_agreements_number_uniq").on(t.orgId, t.agreementNumber),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Covered assets on an agreement (links to the org's equipment catalogue).
// ────────────────────────────────────────────────────────────────────────────

export const serviceAgreementAssets = pgTable(
  "service_agreement_assets",
  {
    id: id(),
    orgId: orgId(),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => serviceAgreements.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id, { onDelete: "cascade" }),
    notes: text("notes"),
    createdAt: ts(),
  },
  (t) => ({
    agreement: index("service_agreement_assets_agreement_idx").on(t.orgId, t.agreementId),
    equipment: index("service_agreement_assets_equipment_idx").on(t.orgId, t.equipmentId),
  }),
);

// ────────────────────────────────────────────────────────────────────────────
// Service visits — the scheduled preventive maintenance & service record.
// ────────────────────────────────────────────────────────────────────────────

export interface VisitPart {
  name: string;
  quantity: number;
  costCents: number;
}

export const serviceVisits = pgTable(
  "service_visits",
  {
    id: id(),
    orgId: orgId(),
    visitNumber: text("visit_number").notNull(),
    agreementId: uuid("agreement_id")
      .notNull()
      .references(() => serviceAgreements.id, { onDelete: "cascade" }),
    equipmentId: uuid("equipment_id").references(() => equipment.id, { onDelete: "set null" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    visitType: serviceVisitType("visit_type").default("preventive").notNull(),
    status: serviceVisitStatus("status").default("scheduled").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    arrivedAt: timestamp("arrived_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    technicianId: uuid("technician_id").references(() => users.id, { onDelete: "set null" }),
    activities: jsonb("activities").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    problemsFound: jsonb("problems_found").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    workPerformed: text("work_performed"),
    partsUsed: jsonb("parts_used").$type<VisitPart[]>().default(sql`'[]'::jsonb`).notNull(),
    recommendations: text("recommendations"),
    photos: jsonb("photos").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    notes: text("notes"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
    createdBy: createdBy(),
  },
  (t) => ({
    agreement: index("service_visits_agreement_idx").on(t.orgId, t.agreementId, t.status),
    status: index("service_visits_status_idx").on(t.orgId, t.status),
    due: index("service_visits_due_idx").on(t.orgId, t.dueAt),
    technician: index("service_visits_technician_idx").on(t.orgId, t.technicianId),
    number: unique("service_visits_number_uniq").on(t.orgId, t.visitNumber),
  }),
);