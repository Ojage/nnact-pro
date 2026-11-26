import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { customers, invoices, jobs, messageLogs } from "./schema.js";
import { agentRuns } from "./agent.js";
import { priceBookItems } from "./price-book.js";

type SuggestionState = "shadow" | "shown" | "accepted" | "changed" | "ignored" | "rejected";
type TriagePriority = "low" | "normal" | "high" | "urgent";
type LikelyFault = { name: string; likelihood: number };
type SourcingLine = {
  id: string;
  itemId: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceLowCents: number | null;
  unitPriceHighCents: number | null;
  lineLowCents: number | null;
  lineHighCents: number | null;
  supplierContactId: string | null;
  source: string;
  confidence: number;
  needsManualPrice: boolean;
  stale: boolean;
};

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () => uuid("org_id").notNull();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const triageSuggestions = pgTable(
  "triage_suggestions",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    state: text("state").$type<SuggestionState>().default("shadow").notNull(),
    current: integer("current").default(1).notNull(),
    shadow: integer("shadow").default(1).notNull(),
    fingerprint: text("fingerprint").notNull(),
    symptoms: jsonb("symptoms").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    likelyFaults: jsonb("likely_faults").$type<LikelyFault[]>().default(sql`'[]'::jsonb`).notNull(),
    priority: text("priority").$type<TriagePriority>().default("normal").notNull(),
    rationale: text("rationale").notNull(),
    missingInformation: jsonb("missing_information").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    confidence: doublePrecision("confidence").default(0).notNull(),
    outcomeReason: text("outcome_reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    currentByJob: uniqueIndex("triage_suggestions_current_job_idx").on(t.orgId, t.jobId).where(sql`${t.current} = 1`),
    job: index("triage_suggestions_job_created_idx").on(t.jobId, t.createdAt),
    orgState: index("triage_suggestions_org_state_idx").on(t.orgId, t.state),
    run: index("triage_suggestions_run_idx").on(t.runId),
  }),
);

export const copilotSuggestions = pgTable(
  "copilot_suggestions",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    state: text("state").$type<SuggestionState>().default("shadow").notNull(),
    current: integer("current").default(1).notNull(),
    shadow: integer("shadow").default(1).notNull(),
    fingerprint: text("fingerprint").notNull(),
    summary: text("summary").notNull(),
    recommendedActions: jsonb("recommended_actions").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    draftReply: text("draft_reply"),
    risks: jsonb("risks").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    missingInformation: jsonb("missing_information").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    confidence: doublePrecision("confidence").default(0).notNull(),
    outcomeReason: text("outcome_reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    currentByJob: uniqueIndex("copilot_suggestions_current_job_idx").on(t.orgId, t.jobId).where(sql`${t.current} = 1`),
    job: index("copilot_suggestions_job_created_idx").on(t.jobId, t.createdAt),
    orgState: index("copilot_suggestions_org_state_idx").on(t.orgId, t.state),
    run: index("copilot_suggestions_run_idx").on(t.runId),
  }),
);

export const supplierContacts = pgTable(
  "supplier_contacts",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    phoneE164: text("phone_e164"),
    email: text("email"),
    area: text("area"),
    active: boolean("active").default(true).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgName: uniqueIndex("supplier_contacts_org_name_idx").on(t.orgId, t.name),
    orgArea: index("supplier_contacts_org_area_idx").on(t.orgId, t.area),
  }),
);

export const sourcingSuggestions = pgTable(
  "sourcing_suggestions",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    state: text("state").$type<SuggestionState>().default("shadow").notNull(),
    current: integer("current").default(1).notNull(),
    shadow: integer("shadow").default(1).notNull(),
    fingerprint: text("fingerprint").notNull(),
    lowCents: integer("low_cents"),
    highCents: integer("high_cents"),
    lines: jsonb("lines").$type<SourcingLine[]>().default(sql`'[]'::jsonb`).notNull(),
    confidence: doublePrecision("confidence").default(0).notNull(),
    rationale: text("rationale").notNull(),
    assumptions: jsonb("assumptions").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    missingInformation: jsonb("missing_information").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    outcomeReason: text("outcome_reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    currentByJob: uniqueIndex("sourcing_suggestions_current_job_idx").on(t.orgId, t.jobId).where(sql`${t.current} = 1`),
    job: index("sourcing_suggestions_job_created_idx").on(t.jobId, t.createdAt),
    orgState: index("sourcing_suggestions_org_state_idx").on(t.orgId, t.state),
    run: index("sourcing_suggestions_run_idx").on(t.runId),
  }),
);

export const supplierMessages = pgTable(
  "supplier_messages",
  {
    id: id(),
    orgId: orgId(),
    suggestionId: uuid("suggestion_id")
      .notNull()
      .references(() => sourcingSuggestions.id, { onDelete: "cascade" }),
    supplierContactId: uuid("supplier_contact_id")
      .notNull()
      .references(() => supplierContacts.id, { onDelete: "cascade" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    lineIds: jsonb("line_ids").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    templateSlug: text("template_slug").notNull(),
    toPhone: text("to_phone").notNull(),
    body: text("body").notNull(),
    status: text("status").default("pending").notNull(),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    idempotent: uniqueIndex("supplier_messages_idempotent_idx").on(
      t.orgId,
      t.suggestionId,
      t.supplierContactId,
      t.templateSlug,
    ),
    suggestion: index("supplier_messages_suggestion_idx").on(t.suggestionId),
  }),
);

export const paymentReminders = pgTable(
  "payment_reminders",
  {
    id: id(),
    orgId: orgId(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    runId: uuid("run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    toPhone: text("to_phone"),
    templateSlug: text("template_slug").notNull(),
    balanceCents: integer("balance_cents").notNull(),
    daysOverdue: integer("days_overdue").notNull(),
    portalLink: text("portal_link"),
    body: text("body"),
    status: text("status").default("suggested").notNull(),
    messageLogId: uuid("message_log_id").references(() => messageLogs.id, { onDelete: "set null" }),
    providerMessageId: text("provider_message_id"),
    error: text("error"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    idempotent: uniqueIndex("payment_reminders_invoice_day_idx").on(
      t.orgId,
      t.invoiceId,
      sql`(date_trunc('day', ${t.createdAt} at time zone 'UTC'))`,
    ),
    invoice: index("payment_reminders_invoice_idx").on(t.invoiceId),
    orgStatus: index("payment_reminders_org_status_idx").on(t.orgId, t.status),
  }),
);

export type TriageSuggestion = typeof triageSuggestions.$inferSelect;
export type CopilotSuggestion = typeof copilotSuggestions.$inferSelect;
export type SourcingSuggestion = typeof sourcingSuggestions.$inferSelect;
export type SupplierContact = typeof supplierContacts.$inferSelect;
export type SupplierMessage = typeof supplierMessages.$inferSelect;
export type PaymentReminder = typeof paymentReminders.$inferSelect;
