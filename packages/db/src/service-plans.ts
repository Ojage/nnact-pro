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
} from "drizzle-orm/pg-core";
import { orgs, customers, jobs } from "./schema.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const version = () => integer("version").default(1).notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const servicePlanStatus = pgEnum("service_plan_status", ["active", "paused", "canceled", "expired"]);
export const serviceVisitStatus = pgEnum("service_visit_status", ["planned", "scheduled", "completed", "skipped"]);

export const servicePlans = pgTable(
  "service_plans",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    description: text("description"),
    includedVisitsPerTerm: integer("included_visits_per_term").default(2).notNull(),
    termMonths: integer("term_months").default(12).notNull(),
    priceCents: integer("price_cents").default(0).notNull(),
    priorityScheduling: boolean("priority_scheduling").default(false).notNull(),
    benefits: jsonb("benefits").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    active: boolean("active").default(true).notNull(),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({ org: index("service_plans_org_idx").on(t.orgId, t.active) }),
);

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
    status: servicePlanStatus("status").default("active").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    renewsAt: timestamp("renews_at", { withTimezone: true }),
    renewalReminderAt: timestamp("renewal_reminder_at", { withTimezone: true }),
    visitsIncluded: integer("visits_included").default(2).notNull(),
    visitsCompleted: integer("visits_completed").default(0).notNull(),
    notes: text("notes"),
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    customer: index("customer_service_plans_customer_idx").on(t.orgId, t.customerId, t.status),
    plan: index("customer_service_plans_plan_idx").on(t.orgId, t.servicePlanId),
  }),
);

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
    version: version(),
    updatedAt: updatedAt(),
    createdAt: ts(),
  },
  (t) => ({
    plan: index("service_plan_visits_plan_idx").on(t.orgId, t.customerServicePlanId, t.status),
    due: index("service_plan_visits_due_idx").on(t.orgId, t.dueAt),
  }),
);
