import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { orgs } from "./schema.js";
import { customers } from "./schema.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/** Global customer identity — separate from org-scoped CRM `customers` rows. */
export const customerAccounts = pgTable(
  "customer_accounts",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    active: boolean("active").default(true).notNull(),
    createdAt: ts(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    emailUnique: uniqueIndex("customer_accounts_email_idx").on(sql`lower(${t.email})`),
  }),
);

/** Links a customer account to one org's CRM customer record. */
export const customerAccountLinks = pgTable(
  "customer_account_links",
  {
    id: id(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    accountId: uuid("account_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    linkedVia: text("linked_via").default("signup").notNull(),
    linkedAt: timestamp("linked_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    orgCustomer: uniqueIndex("customer_account_links_org_customer_idx").on(t.orgId, t.customerId),
    orgAccount: uniqueIndex("customer_account_links_org_account_idx").on(t.orgId, t.accountId),
  }),
);

export const authRefreshTokens = pgTable(
  "auth_refresh_tokens",
  {
    id: id(),
    subjectType: text("subject_type").notNull(),
    subjectId: uuid("subject_id").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    replacedById: uuid("replaced_by_id"),
    userAgent: text("user_agent"),
    ipAddress: text("ip_address"),
    createdAt: ts(),
  },
  (t) => ({
    tokenHashUnique: uniqueIndex("auth_refresh_tokens_hash_idx").on(t.tokenHash),
    subject: index("auth_refresh_tokens_subject_idx").on(t.subjectType, t.subjectId),
  }),
);

export type CustomerAccount = typeof customerAccounts.$inferSelect;
export type CustomerAccountLink = typeof customerAccountLinks.$inferSelect;
