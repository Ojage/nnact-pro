// Branches: organization > branch. Foundation only: business tables do not
// carry a branch yet. Every organization has exactly one default branch,
// created by migration 0060 for existing organizations and by a database
// trigger for new ones.
import { boolean, index, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { orgs, users } from "./schema.js";

export const branches = pgTable(
  "branches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** Google-style project id for URLs and display, derived from the branch name. */
    publicId: text("public_id").default(sql`nnact_new_branch_public_id()`).notNull(),
    name: text("name").notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    publicId: uniqueIndex("branches_public_id_idx").on(t.publicId),
    orgName: uniqueIndex("branches_org_name_idx").on(t.orgId, t.name),
    orgDefault: uniqueIndex("branches_org_default_idx").on(t.orgId).where(sql`${t.isDefault}`),
  }),
);

/** Branches a user with branch_access 'specific' may use. */
export const branchMemberships = pgTable(
  "branch_memberships",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.userId, t.branchId] }),
    branch: index("branch_memberships_branch_idx").on(t.branchId),
  }),
);

export type Branch = typeof branches.$inferSelect;
export type BranchMembership = typeof branchMemberships.$inferSelect;
