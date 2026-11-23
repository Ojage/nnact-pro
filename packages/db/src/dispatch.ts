import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  doublePrecision,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { DispatchCandidate, DispatchRankedCandidate, DispatchScoreFactor } from "@nnact/shared";
import { jobs, users } from "./schema.js";

const id = () => uuid("id").primaryKey().defaultRandom();
const orgId = () => uuid("org_id").notNull();
const ts = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).defaultNow().notNull();

export const dispatchSuggestionState = pgEnum("dispatch_suggestion_state", [
  "shadow",
  "shown",
  "accepted",
  "changed",
  "ignored",
  "rejected",
]);

export type DispatchTechnicianSkillKind = "skill" | "certification" | "specialty";

export const technicianProfiles = pgTable(
  "technician_profiles",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    homeArea: text("home_area"),
    maxDailyVisits: integer("max_daily_visits").default(4),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    orgUser: uniqueIndex("technician_profiles_org_user_idx").on(t.orgId, t.userId),
    orgArea: index("technician_profiles_org_area_idx").on(t.orgId, t.homeArea),
  }),
);

export const technicianSkills = pgTable(
  "technician_skills",
  {
    id: id(),
    orgId: orgId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<DispatchTechnicianSkillKind>().notNull(),
    name: text("name").notNull(),
    level: text("level"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: ts(),
  },
  (t) => ({
    orgUser: index("technician_skills_org_user_idx").on(t.orgId, t.userId),
    orgName: index("technician_skills_org_name_idx").on(t.orgId, t.name),
    uniqueSkill: uniqueIndex("technician_skills_org_user_kind_name_idx").on(t.orgId, t.userId, t.kind, t.name),
  }),
);

export const dispatchSuggestions = pgTable(
  "dispatch_suggestions",
  {
    id: id(),
    orgId: orgId(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    runId: uuid("run_id"),
    state: dispatchSuggestionState("state").default("shadow").notNull(),
    current: integer("current").default(1).notNull(),
    shadow: integer("shadow").default(1).notNull(),
    fingerprint: text("fingerprint").notNull(),
    candidates: jsonb("candidates").$type<DispatchRankedCandidate[]>().default(sql`'[]'::jsonb`).notNull(),
    causes: jsonb("causes").$type<string[]>().default(sql`'[]'::jsonb`).notNull(),
    confidence: doublePrecision("confidence").default(0).notNull(),
    actualTechnicianId: uuid("actual_technician_id").references(() => users.id, { onDelete: "set null" }),
    outcomeReason: text("outcome_reason"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: ts(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    currentByJob: uniqueIndex("dispatch_suggestions_current_job_idx")
      .on(t.orgId, t.jobId)
      .where(sql`${t.current} = 1`),
    job: index("dispatch_suggestions_job_created_idx").on(t.jobId, t.createdAt),
    orgState: index("dispatch_suggestions_org_state_idx").on(t.orgId, t.state),
    run: index("dispatch_suggestions_run_idx").on(t.runId),
  }),
);

export type TechnicianProfile = typeof technicianProfiles.$inferSelect;
export type TechnicianSkill = typeof technicianSkills.$inferSelect;
export type DispatchSuggestion = typeof dispatchSuggestions.$inferSelect;
