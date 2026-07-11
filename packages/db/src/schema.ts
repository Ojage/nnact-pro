// OpenFieldPro relational schema — the field-service domain.
// Multi-tenant (org_id everywhere). Money stored as integer cents.
//
// Phase-1 modules covered: orgs, users/technicians, customers, properties,
// jobs (work orders), line items, estimates, invoices, payments, appointments.
// Each table maps to a practical field-service workflow so the remaining UI is mechanical.
//
// Phase-5a PR 1: added `version` + `updated_at` to hot-path tables for LWW sync
// conflict detection. Mobile can supply UUIDs so writes can be queued offline
// without a server round-trip.

import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const jobStatus = pgEnum("job_status", [
  "lead",
  "scheduled",
  "in_progress",
  "completed",
  "canceled",
]);
export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
  "void",
]);
export const userRole = pgEnum("user_role", ["owner", "dispatcher", "technician"]);

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const version = () => integer("version").default(1).notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const orgs = pgTable("orgs", {
  id: id(),
  name: text("name").notNull(),
  timezone: text("timezone").default("America/New_York").notNull(),
  logoUrl: text("logo_url"),
  brandColor: text("brand_color").default("#22C55E").notNull(),
  documentFooter: text("document_footer"),
  publicEmail: text("public_email"),
  publicPhone: text("public_phone"),
  publicAddress: text("public_address"),
  removeOpenFieldProAttribution: boolean("remove_openfieldpro_attribution").default(false).notNull(),
  updatedAt: updatedAt(),
  createdAt: ts(),
});

export const users = pgTable(
  "users",
  {
    id: id(),
    orgId: orgId(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: userRole("role").default("technician").notNull(),
    passwordHash: text("password_hash"),
    active: boolean("active").default(true).notNull(),
    createdAt: ts(),
  },
  (t) => ({ orgEmail: index("users_org_email_idx").on(t.orgId, t.email) }),
);

export const customers = pgTable(
  "customers",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({ orgIdx: index("customers_org_idx").on(t.orgId) }),
);

export const properties = pgTable("properties", {
  id: id(),
  orgId: orgId(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  lat: text("lat"),
  lng: text("lng"),
  createdAt: ts(),
});

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    propertyId: uuid("property_id").references(() => properties.id, {
      onDelete: "set null",
    }),
    assignedTo: uuid("assigned_to").references(() => users.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    description: text("description"),
    status: jobStatus("status").default("lead").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    total: integer("total").default(0).notNull(),
    laborCostCents: integer("labor_cost_cents").default(0).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStatus: index("jobs_org_status_idx").on(t.orgId, t.status),
    sched: index("jobs_scheduled_idx").on(t.scheduledAt),
  }),
);

export const lineItems = pgTable("line_items", {
  id: id(),
  orgId: orgId(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  unitPrice: integer("unit_price").default(0).notNull(),
  unitCost: integer("unit_cost").default(0).notNull(),
  version: version(),
  updatedAt: updatedAt(),
  createdAt: ts(),
});

export const estimates = pgTable("estimates", {
  id: id(),
  orgId: orgId(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  total: integer("total").default(0).notNull(),
  accepted: boolean("accepted").default(false).notNull(),
  version: version(),
  updatedAt: updatedAt(),
  createdAt: ts(),
});

export const invoices = pgTable(
  "invoices",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    number: text("number").notNull(),
    status: invoiceStatus("status").default("draft").notNull(),
    total: integer("total").default(0).notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({ orgStatus: index("invoices_org_status_idx").on(t.orgId, t.status) }),
);

export const payments = pgTable("payments", {
  id: id(),
  orgId: orgId(),
  invoiceId: uuid("invoice_id")
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  method: text("method").default("manual").notNull(),
  reference: text("reference"),
  paidAt: timestamp("paid_at", { withTimezone: true }).defaultNow().notNull(),
  version: version(),
  updatedAt: updatedAt(),
});

export const appointments = pgTable(
  "appointments",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    technicianId: uuid("technician_id").references(() => users.id, { onDelete: "set null" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    orgStart: index("appointments_org_starts_idx").on(t.orgId, t.startsAt),
    orgTechnicianWindow: index("appointments_org_technician_window_idx").on(
      t.orgId,
      t.technicianId,
      t.startsAt,
      t.endsAt,
    ),
    job: index("appointments_job_idx").on(t.jobId),
  }),
);

export const recurringJobs = pgTable("recurring_jobs", {
  id: id(),
  orgId: orgId(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  intervalDays: integer("interval_days").notNull(),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
  active: boolean("active").default(true).notNull(),
  rrule: text("rrule"),
  scheduledTime: text("scheduled_time"),
  createdAt: ts(),
});

export const reviews = pgTable("reviews", {
  id: id(),
  orgId: orgId(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  comment: text("comment"),
  reply: text("reply"),
  createdAt: ts(),
});

export const activities = pgTable(
  "activities",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    summary: text("summary").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    cust: index("activities_customer_idx").on(t.orgId, t.customerId, t.createdAt),
    job: index("activities_job_idx").on(t.jobId),
  }),
);

export const servicePlans = pgTable("service_plans", {
  id: id(),
  orgId: orgId(),
  name: text("name").notNull(),
  description: text("description"),
  includedVisitsPerTerm: integer("included_visits_per_term").default(1).notNull(),
  termMonths: integer("term_months").default(12).notNull(),
  priceCents: integer("price_cents").default(0).notNull(),
  priorityScheduling: boolean("priority_scheduling").default(false).notNull(),
  benefits: jsonb("benefits").$type<string[]>().default([]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: ts(),
});

export const customerServicePlanStatus = pgEnum("customer_service_plan_status", [
  "active",
  "paused",
  "canceled",
  "expired",
]);

export const customerServicePlans = pgTable(
  "customer_service_plans",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    servicePlanId: uuid("service_plan_id")
      .notNull()
      .references(() => servicePlans.id, { onDelete: "restrict" }),
    status: customerServicePlanStatus("status").default("active").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow().notNull(),
    renewsAt: timestamp("renews_at", { withTimezone: true }),
    renewalReminderAt: timestamp("renewal_reminder_at", { withTimezone: true }),
    visitsIncluded: integer("visits_included").default(0).notNull(),
    visitsCompleted: integer("visits_completed").default(0).notNull(),
    notes: text("notes"),
    createdAt: ts(),
  },
  (t) => ({
    customer: index("customer_service_plans_customer_idx").on(t.orgId, t.customerId),
    renewal: index("customer_service_plans_renewal_idx").on(t.orgId, t.status, t.renewsAt),
  }),
);

export const serviceVisitStatus = pgEnum("service_visit_status", [
  "planned",
  "scheduled",
  "completed",
  "skipped",
]);

export const servicePlanVisits = pgTable(
  "service_plan_visits",
  {
    id: id(),
    orgId: orgId(),
    customerServicePlanId: uuid("customer_service_plan_id")
      .notNull()
      .references(() => customerServicePlans.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    status: serviceVisitStatus("status").default("planned").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: ts(),
  },
  (t) => ({
    enrollment: index("service_plan_visits_enrollment_idx").on(t.customerServicePlanId, t.status),
    due: index("service_plan_visits_due_idx").on(t.orgId, t.status, t.dueAt),
  }),
);

export const sponsorConfig = pgTable(
  "sponsor_config",
  {
    id: id(),
    orgId: orgId(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true).defaultNow().notNull(),
  },
  (t) => ({ orgKey: uniqueIndex("sponsor_config_org_key_uidx").on(t.orgId, t.key) }),
);

export const pluginInstallStatus = pgEnum("plugin_install_status", ["enabled", "disabled", "error"]);

export const pluginInstalls = pgTable(
  "plugin_installs",
  {
    id: id(),
    orgId: orgId(),
    pluginId: text("plugin_id").notNull(),
    displayName: text("display_name").notNull(),
    version: text("version").notNull(),
    status: pluginInstallStatus("status").default("enabled").notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}).notNull(),
    lastError: text("last_error"),
    installedAt: timestamp("installed_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({ orgPlugin: uniqueIndex("plugin_installs_org_plugin_uidx").on(t.orgId, t.pluginId) }),
);

export const pluginTokens = pgTable(
  "plugin_tokens",
  {
    id: id(),
    orgId: orgId(),
    pluginInstallId: uuid("plugin_install_id")
      .notNull()
      .references(() => pluginInstalls.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    scopes: jsonb("scopes").$type<string[]>().default([]).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({ tokenHash: uniqueIndex("plugin_tokens_hash_uidx").on(t.tokenHash) }),
);

export const outboundEvents = pgTable(
  "outbound_events",
  {
    id: id(),
    orgId: orgId(),
    eventType: text("event_type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
    status: text("status").default("pending").notNull(),
    attemptCount: integer("attempt_count").default(0).notNull(),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: ts(),
  },
  (t) => ({
    pending: index("outbound_events_pending_idx").on(t.orgId, t.status, t.nextAttemptAt),
    entity: index("outbound_events_entity_idx").on(t.orgId, t.entityType, t.entityId),
  }),
);

export const uploadPurpose = pgEnum("upload_purpose", ["job_photo", "customer_document", "org_logo"]);

export const uploads = pgTable(
  "uploads",
  {
    id: id(),
    orgId: orgId(),
    purpose: uploadPurpose("purpose").notNull(),
    objectKey: text("object_key").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: ts(),
  },
  (t) => ({
    orgPurpose: index("uploads_org_purpose_idx").on(t.orgId, t.purpose, t.createdAt),
    objectKey: uniqueIndex("uploads_object_key_uidx").on(t.objectKey),
  }),
);
