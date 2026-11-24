// Agent Office: live telemetry from the agent processes (heartbeats, run steps,
// log lines), the change feed the API streams to the owner's page, and the
// audit trail for owner actions. Step summaries and log messages are redacted
// by the API before they are stored; raw run content stays in agent_runs.
import { bigserial, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { agentRunState, agentRuns } from "./agent.js";

const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

/** One row per agent process; status older than the offline threshold is ignored. */
export const agentHeartbeats = pgTable(
  "agent_heartbeats",
  {
    agentId: text("agent_id").notNull(),
    instanceId: text("instance_id").notNull(),
    status: text("status").notNull(),
    currentRunId: uuid("current_run_id"),
    currentTask: text("current_task"),
    currentLabel: text("current_label"),
    stepName: text("step_name"),
    stepIndex: integer("step_index").default(0).notNull(),
    stepCount: integer("step_count").default(0).notNull(),
    runStartedAt: timestamp("run_started_at", { withTimezone: true }),
    version: text("version"),
    promptVersion: text("prompt_version"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.instanceId] }),
    seen: index("agent_heartbeats_last_seen_idx").on(t.lastSeenAt),
  }),
);

export const agentRunSteps = pgTable(
  "agent_run_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    agentId: text("agent_id").notNull(),
    runId: uuid("run_id")
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    label: text("label").notNull(),
    status: agentRunState("status").default("running").notNull(),
    summary: text("summary"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    runSeq: uniqueIndex("agent_run_steps_run_seq_idx").on(t.runId, t.seq),
    created: index("agent_run_steps_created_idx").on(t.createdAt),
  }),
);

export const agentLogLines = pgTable(
  "agent_log_lines",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: uuid("org_id"),
    agentId: text("agent_id").notNull(),
    runId: uuid("run_id"),
    level: text("level").notNull(),
    message: text("message").notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    agent: index("agent_log_lines_agent_id_idx").on(t.agentId, t.id),
    run: index("agent_log_lines_run_id_idx").on(t.runId, t.id),
    created: index("agent_log_lines_created_idx").on(t.createdAt),
  }),
);

/**
 * The change feed. Every write the page should see appends a row; the API
 * polls it by id and streams it over SSE, and the id is the SSE event id
 * (Last-Event-ID). Rows with a null org are visible to every organization.
 */
export const agentOfficeEvents = pgTable(
  "agent_office_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    orgId: uuid("org_id"),
    agentId: text("agent_id").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    created: index("agent_office_events_created_idx").on(t.createdAt),
  }),
);

/** Owner actions on agents: pause, resume, reveal of raw run content, retry. */
export const agentAuditLog = pgTable(
  "agent_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").notNull(),
    agentId: text("agent_id").notNull(),
    runId: uuid("run_id"),
    action: text("action").notNull(),
    reason: text("reason"),
    actorUserId: text("actor_user_id"),
    actorName: text("actor_name"),
    createdAt: createdAt(),
  },
  (t) => ({
    agentCreated: index("agent_audit_log_agent_created_idx").on(t.agentId, t.createdAt),
  }),
);

export type AgentHeartbeat = typeof agentHeartbeats.$inferSelect;
export type AgentRunStep = typeof agentRunSteps.$inferSelect;
export type AgentLogLine = typeof agentLogLines.$inferSelect;
export type AgentOfficeEventRow = typeof agentOfficeEvents.$inferSelect;
export type AgentAuditEntry = typeof agentAuditLog.$inferSelect;
