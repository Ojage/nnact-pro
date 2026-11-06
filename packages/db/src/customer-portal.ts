import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { orgs, customers, jobs, appointments } from "./schema.js";
import { customerAccounts } from "./auth-accounts.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () =>
  uuid("org_id")
    .notNull()
    .references(() => orgs.id, { onDelete: "cascade" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const customerPortalPreferences = pgTable(
  "customer_portal_preferences",
  {
    id: id(),
    orgId: orgId(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    emailUpdates: boolean("email_updates").default(true).notNull(),
    smsUpdates: boolean("sms_updates").default(true).notNull(),
    marketingOptIn: boolean("marketing_opt_in").default(false).notNull(),
    language: text("language").default("en").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgAccount: uniqueIndex("customer_portal_preferences_org_account_idx").on(t.orgId, t.accountId),
    customer: index("customer_portal_preferences_customer_idx").on(t.orgId, t.customerId),
  }),
);

export const customerAppointmentRequests = pgTable(
  "customer_appointment_requests",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    appointmentId: uuid("appointment_id")
      .notNull()
      .references(() => appointments.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    status: text("status").default("pending").notNull(),
    requestedStartsAt: timestamp("requested_starts_at", { withTimezone: true }),
    reason: text("reason"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    appointment: index("customer_appointment_requests_appointment_idx").on(t.orgId, t.appointmentId),
    customer: index("customer_appointment_requests_customer_idx").on(t.orgId, t.customerId, t.createdAt),
  }),
);

export const customerSupportRequests = pgTable(
  "customer_support_requests",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    kind: text("kind").default("general").notNull(),
    subject: text("subject").notNull(),
    message: text("message").notNull(),
    status: text("status").default("open").notNull(),
    response: text("response"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    customer: index("customer_support_requests_customer_idx").on(t.orgId, t.customerId, t.createdAt),
    status: index("customer_support_requests_status_idx").on(t.orgId, t.status, t.createdAt),
  }),
);

export const customerNotificationReads = pgTable(
  "customer_notification_reads",
  {
    id: id(),
    orgId: orgId(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    notificationKey: text("notification_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    accountKey: uniqueIndex("customer_notification_reads_account_key_idx").on(t.accountId, t.notificationKey),
    customer: index("customer_notification_reads_customer_idx").on(t.orgId, t.customerId),
  }),
);

export type CustomerPortalPreference = typeof customerPortalPreferences.$inferSelect;
export type CustomerAppointmentRequest = typeof customerAppointmentRequests.$inferSelect;
export type CustomerSupportRequest = typeof customerSupportRequests.$inferSelect;
export type CustomerNotificationRead = typeof customerNotificationReads.$inferSelect;

