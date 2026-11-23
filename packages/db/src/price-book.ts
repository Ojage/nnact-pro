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
import type { PriceAliases, QuoteLineSourceDTO } from "@nnact/shared";
import { agentRuns } from "./agent.js";
import { catalogItems, jobs, orgs, users } from "./schema.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const priceObservationSource = pgEnum("price_observation_source", ["receipt", "manual", "historical"]);
export const priceObservationStatus = pgEnum("price_observation_status", ["pending", "confirmed"]);
export const priceBookRateKind = pgEnum("price_book_rate_kind", ["labor", "transport", "diagnostic"]);
export const quoteProposalStatus = pgEnum("quote_proposal_status", ["draft", "approved", "rejected", "superseded"]);
export const quoteLineKind = pgEnum("quote_line_kind", ["part", "labor", "transport", "diagnostic"]);

/** Org-scoped category with its own price freshness window. */
export const priceBookCategories = pgTable(
  "price_book_categories",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    freshnessDays: integer("freshness_days").default(30).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgName: uniqueIndex("price_book_categories_org_name_idx").on(t.orgId, t.name),
    orgActive: index("price_book_categories_org_active_idx").on(t.orgId, t.active),
  }),
);

/** Canonical purchasable item with en/fr aliases used for receipt matching. */
export const priceBookItems = pgTable(
  "price_book_items",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => priceBookCategories.id, { onDelete: "cascade" }),
    canonicalName: text("canonical_name").notNull(),
    unit: text("unit").default("piece").notNull(),
    aliases: jsonb("aliases").$type<PriceAliases>().default(sql`'{"en":[],"fr":[]}'::jsonb`).notNull(),
    /** Optional link to the legacy flat catalog; never removes or rewrites it. */
    catalogItemId: uuid("catalog_item_id").references(() => catalogItems.id, { onDelete: "set null" }),
    /** True for an unmatched receipt name awaiting staff rename/merge. */
    suggested: boolean("suggested").default(false).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgName: uniqueIndex("price_book_items_org_name_idx").on(t.orgId, t.canonicalName),
    orgActive: index("price_book_items_org_active_idx").on(t.orgId, t.active),
    category: index("price_book_items_category_idx").on(t.categoryId),
    catalog: index("price_book_items_catalog_idx").on(t.catalogItemId),
  }),
);

/** Every observed price. Confirmation is a human act; history is capped low. */
export const priceObservations = pgTable(
  "price_observations",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    itemId: uuid("item_id").notNull().references(() => priceBookItems.id, { onDelete: "cascade" }),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").default("XAF").notNull(),
    shopName: text("shop_name"),
    area: text("area"),
    source: priceObservationSource("source").default("manual").notNull(),
    status: priceObservationStatus("status").default("confirmed").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).defaultNow().notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    recordedBy: uuid("recorded_by").references(() => users.id, { onDelete: "set null" }),
    confidence: integer("confidence").default(80).notNull(),
    /** finance-files receipt URL, private to the org. */
    receiptMediaRef: text("receipt_media_ref"),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgItemObserved: index("price_observations_org_item_observed_idx").on(t.orgId, t.itemId, t.observedAt),
    orgStatus: index("price_observations_org_status_idx").on(t.orgId, t.status),
    job: index("price_observations_job_idx").on(t.jobId),
  }),
);

/** Owner-set labor, zone transport and diagnostic-visit rates. */
export const priceBookRates = pgTable(
  "price_book_rates",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    kind: priceBookRateKind("kind").notNull(),
    /** Labor role, zone name, or "default" for a diagnostic visit. */
    key: text("key").notNull(),
    amountCents: integer("amount_cents").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgKindKey: uniqueIndex("price_book_rates_org_kind_key_idx").on(t.orgId, t.kind, t.key),
    orgActive: index("price_book_rates_org_active_idx").on(t.orgId, t.active),
  }),
);

/** One agent-generated proposal per job. Never customer-facing. */
export const quoteProposals = pgTable(
  "quote_proposals",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    status: quoteProposalStatus("status").default("draft").notNull(),
    agentRunId: uuid("agent_run_id").references(() => agentRuns.id, { onDelete: "set null" }),
    lowCents: integer("low_cents"),
    highCents: integer("high_cents"),
    confidence: integer("confidence").default(0).notNull(),
    assumptions: jsonb("assumptions").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    missingInformation: jsonb("missing_information").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    model: text("model"),
    reviewedBy: uuid("reviewed_by").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    job: uniqueIndex("quote_proposals_job_idx").on(t.jobId),
    orgStatus: index("quote_proposals_org_status_idx").on(t.orgId, t.status),
  }),
);

export const quoteProposalLines = pgTable(
  "quote_proposal_lines",
  {
    id: id(),
    orgId: uuid("org_id").notNull().references(() => orgs.id, { onDelete: "cascade" }),
    proposalId: uuid("proposal_id").notNull().references(() => quoteProposals.id, { onDelete: "cascade" }),
    kind: quoteLineKind("kind").notNull(),
    itemId: uuid("item_id").references(() => priceBookItems.id, { onDelete: "set null" }),
    rateId: uuid("rate_id").references(() => priceBookRates.id, { onDelete: "set null" }),
    description: text("description").notNull(),
    quantity: integer("quantity").default(1).notNull(),
    unit: text("unit").default("piece").notNull(),
    unitPriceLowCents: integer("unit_price_low_cents"),
    unitPriceHighCents: integer("unit_price_high_cents"),
    lineLowCents: integer("line_low_cents"),
    lineHighCents: integer("line_high_cents"),
    finalUnitPriceCents: integer("final_unit_price_cents"),
    confidence: integer("confidence").default(0).notNull(),
    source: jsonb("source").$type<QuoteLineSourceDTO>().notNull(),
    needsManualPrice: boolean("needs_manual_price").default(false).notNull(),
    stale: boolean("stale").default(false).notNull(),
    createdAt: ts(),
  },
  (t) => ({ proposal: index("quote_proposal_lines_proposal_idx").on(t.proposalId) }),
);

export type PriceBookCategory = typeof priceBookCategories.$inferSelect;
export type PriceBookItem = typeof priceBookItems.$inferSelect;
export type PriceObservation = typeof priceObservations.$inferSelect;
export type PriceBookRate = typeof priceBookRates.$inferSelect;
export type QuoteProposal = typeof quoteProposals.$inferSelect;
export type QuoteProposalLine = typeof quoteProposalLines.$inferSelect;
