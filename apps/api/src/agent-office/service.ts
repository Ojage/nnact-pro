// Agent Office read model: builds the shared DTOs from heartbeats, runs,
// leases, controls and the approval tables. Everything run-related is scoped
// to the viewer's organization; heartbeats and controls are per agent process.
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import {
  agentAuditLog,
  agentControls,
  agentDeadLetters,
  agentHeartbeats,
  agentLeases,
  agentLogLines,
  agentRunSteps,
  agentRuns,
  copilotSuggestions,
  db,
  dispatchSuggestions,
  jobs,
  quoteProposals,
} from "@nnact/db";
import {
  AGENT_IDS,
  AGENT_REGISTRY,
  deriveAgentStatus,
  isAgentId,
  type AgentApprovalCounts,
  type AgentApprovalDeskDTO,
  type AgentConfigDTO,
  type AgentControlEventDTO,
  type AgentCurrentTask,
  type AgentDetailDTO,
  type AgentHeartbeatStatus,
  type AgentId,
  type AgentLogLineDTO,
  type AgentLogLevel,
  type AgentMetricsDTO,
  type AgentOfficeOverviewDTO,
  type AgentRoomDTO,
  type AgentRunDetailDTO,
  type AgentRunState,
  type AgentRunStepDTO,
  type AgentRunSummaryDTO,
  type AgentRunsPageDTO,
} from "@nnact/shared";

const HOURS = 24;
const HOUR_MS = 3_600_000;

/**
 * Tasks whose re-run cannot duplicate a side effect: they only write drafts,
 * proposals or suggestions that replace the previous one. Anything that sends
 * a message to a customer or supplier is never retried from the office.
 */
export const RETRYABLE_TASKS: ReadonlySet<string> = new Set([
  "agent.extract",
  "agent.stt",
  "agent.quote",
  "agent.receipt_vision",
  "agent.dispatch",
  "agent.price_observation",
  "agent.triage",
  "agent.sourcing",
]);

const HEARTBEAT_STATUSES: readonly AgentHeartbeatStatus[] = ["working", "idle", "waiting", "error"];

export function defaultCostCap(agentId: AgentId): number {
  const configured = Number(process.env[AGENT_REGISTRY[agentId].costCapEnv] ?? 200);
  return Number.isSafeInteger(configured) && configured >= 0 ? configured : 200;
}

/** The registry's feature flag as an env var: agents.intake.enabled -> AGENTS_INTAKE_ENABLED. */
export function flagEnvKey(agentId: AgentId): string {
  return AGENT_REGISTRY[agentId].featureFlagKey.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
}

export function flagEnabled(agentId: AgentId, env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = env[flagEnvKey(agentId)]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return AGENT_REGISTRY[agentId].stage === "live";
  return ["true", "1", "on", "yes", "enabled"].includes(raw);
}

function startOfDay(now = new Date()): Date {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day;
}

const iso = (value: Date | null | undefined): string | null => (value ? value.toISOString() : null);

function toRunState(value: string): AgentRunState {
  return (["pending", "running", "completed", "failed", "skipped"] as const).includes(value as AgentRunState)
    ? (value as AgentRunState)
    : "pending";
}

function toLevel(value: string): AgentLogLevel {
  return (["debug", "info", "warn", "error"] as const).includes(value as AgentLogLevel) ? (value as AgentLogLevel) : "info";
}

interface HeartbeatRow {
  agentId: string;
  status: string;
  currentRunId: string | null;
  currentTask: string | null;
  currentLabel: string | null;
  stepName: string | null;
  stepIndex: number;
  stepCount: number;
  runStartedAt: Date | null;
  version: string | null;
  promptVersion: string | null;
  lastSeenAt: Date;
}

/** Freshest heartbeat per agent; a working instance outranks an idle one seen at the same time. */
async function latestHeartbeats(agentIds: readonly AgentId[]): Promise<Map<string, HeartbeatRow>> {
  const rows = await db
    .select()
    .from(agentHeartbeats)
    .where(inArray(agentHeartbeats.agentId, [...agentIds]))
    .orderBy(desc(agentHeartbeats.lastSeenAt));
  const byAgent = new Map<string, HeartbeatRow>();
  for (const row of rows) {
    const existing = byAgent.get(row.agentId);
    if (!existing || (existing.status !== "working" && row.status === "working" && row.lastSeenAt.getTime() >= existing.lastSeenAt.getTime() - 30_000)) {
      byAgent.set(row.agentId, row);
    }
  }
  return byAgent;
}

function currentTask(heartbeat: HeartbeatRow | undefined): AgentCurrentTask | null {
  if (!heartbeat?.currentRunId || !heartbeat.currentTask) return null;
  return {
    runId: heartbeat.currentRunId,
    task: heartbeat.currentTask,
    label: heartbeat.currentLabel ?? heartbeat.currentTask,
    stepName: heartbeat.stepName,
    stepIndex: heartbeat.stepIndex,
    stepCount: heartbeat.stepCount,
    startedAt: (heartbeat.runStartedAt ?? heartbeat.lastSeenAt).toISOString(),
  };
}

/** Build the office room for each requested agent, for one organization. */
export async function buildRooms(orgId: string, agentIds: readonly AgentId[] = AGENT_IDS, now = new Date()): Promise<AgentRoomDTO[]> {
  if (agentIds.length === 0) return [];
  const ids = [...agentIds];
  const since = new Date(now.getTime() - HOURS * HOUR_MS);
  const today = startOfDay(now);
  const [controls, heartbeats, hourly, todayStats, queues] = await Promise.all([
    db.select().from(agentControls).where(inArray(agentControls.agentId, ids)),
    latestHeartbeats(agentIds),
    db
      .select({
        agentId: agentRuns.agentId,
        bucket: sql<number>`floor(extract(epoch from (${now.toISOString()}::timestamptz - ${agentRuns.createdAt})) / 3600)::int`,
        runs: sql<number>`count(*)::int`,
      })
      .from(agentRuns)
      .where(and(eq(agentRuns.orgId, orgId), inArray(agentRuns.agentId, ids), gte(agentRuns.createdAt, since)))
      .groupBy(sql`1`, sql`2`),
    db
      .select({
        agentId: agentRuns.agentId,
        runs: sql<number>`count(*)::int`,
        errors: sql<number>`count(*) filter (where ${agentRuns.state} = 'failed')::int`,
        cost: sql<number>`coalesce(sum(${agentRuns.costCents}), 0)::int`,
      })
      .from(agentRuns)
      .where(and(eq(agentRuns.orgId, orgId), inArray(agentRuns.agentId, ids), gte(agentRuns.createdAt, today)))
      .groupBy(agentRuns.agentId),
    db
      .select({ agentId: agentLeases.agentId, depth: sql<number>`count(*)::int` })
      .from(agentLeases)
      .where(
        and(
          inArray(agentLeases.agentId, ids),
          inArray(agentLeases.state, ["pending", "leased"]),
          or(isNull(agentLeases.orgId), eq(agentLeases.orgId, orgId)),
        ),
      )
      .groupBy(agentLeases.agentId),
  ]);

  const controlMap = new Map(controls.map((row) => [row.agentId, row]));
  const todayMap = new Map(todayStats.map((row) => [row.agentId, row]));
  const queueMap = new Map(queues.map((row) => [row.agentId, row.depth]));
  const activity = new Map<string, number[]>();
  for (const row of hourly) {
    if (!row.agentId) continue;
    const series = activity.get(row.agentId) ?? Array.from({ length: HOURS }, () => 0);
    const index = HOURS - 1 - Math.min(HOURS - 1, Math.max(0, row.bucket));
    series[index] += row.runs;
    activity.set(row.agentId, series);
  }

  return agentIds.map((agentId): AgentRoomDTO => {
    const definition = AGENT_REGISTRY[agentId];
    const control = controlMap.get(agentId);
    const heartbeat = heartbeats.get(agentId);
    const enabled = control?.enabled ?? true;
    const reported = heartbeat && HEARTBEAT_STATUSES.includes(heartbeat.status as AgentHeartbeatStatus) ? (heartbeat.status as AgentHeartbeatStatus) : "idle";
    const status =
      definition.stage === "live" || heartbeat
        ? deriveAgentStatus({ enabled, heartbeat: heartbeat ? { status: reported, lastSeenAt: heartbeat.lastSeenAt } : null, now })
        : "offline";
    const stats = todayMap.get(agentId);
    return {
      id: agentId,
      displayName: definition.displayName,
      tier: definition.autonomyTier,
      stage: definition.stage,
      status,
      enabled,
      current: status === "working" || status === "waiting" ? currentTask(heartbeat) : null,
      queueDepth: queueMap.get(agentId) ?? 0,
      costTodayCents: stats?.cost ?? 0,
      costCapCents: control?.costCapCents ?? defaultCostCap(agentId),
      activity: activity.get(agentId) ?? Array.from({ length: HOURS }, () => 0),
      runsToday: stats?.runs ?? 0,
      errorsToday: stats?.errors ?? 0,
      lastSeenAt: iso(heartbeat?.lastSeenAt),
      version: heartbeat?.version ?? null,
    };
  });
}

export async function approvalDesk(orgId: string): Promise<AgentApprovalDeskDTO> {
  const [drafts, proposals, suggestions] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), eq(jobs.agentDraft, true), isNull(jobs.agentRejectedAt))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(quoteProposals)
      .where(and(eq(quoteProposals.orgId, orgId), eq(quoteProposals.status, "draft"))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(dispatchSuggestions)
      .where(and(eq(dispatchSuggestions.orgId, orgId), eq(dispatchSuggestions.state, "shown"))),
  ]);
  return {
    draftJobs: drafts[0]?.count ?? 0,
    quoteProposals: proposals[0]?.count ?? 0,
    dispatchSuggestions: suggestions[0]?.count ?? 0,
  };
}

export async function buildOverview(orgId: string, now = new Date()): Promise<AgentOfficeOverviewDTO> {
  const [agents, approvals] = await Promise.all([buildRooms(orgId, AGENT_IDS, now), approvalDesk(orgId)]);
  return {
    generatedAt: now.toISOString(),
    agents,
    approvals,
    costTodayCents: agents.reduce((sum, room) => sum + room.costTodayCents, 0),
  };
}

/** Human decisions on what each agent proposed, over the last 30 days. */
export async function approvalCounts(orgId: string, agentId: AgentId, now = new Date()): Promise<AgentApprovalCounts> {
  const since = new Date(now.getTime() - 30 * 24 * HOUR_MS);
  if (agentId === "intake-agent") {
    const [row] = await db
      .select({
        accepted: sql<number>`count(*) filter (where ${jobs.agentDraft} = false and ${jobs.agentRejectedAt} is null and coalesce(${jobs.agentDraftEdited}, false) = false)::int`,
        edited: sql<number>`count(*) filter (where ${jobs.agentDraft} = false and ${jobs.agentRejectedAt} is null and ${jobs.agentDraftEdited} = true)::int`,
        rejected: sql<number>`count(*) filter (where ${jobs.agentRejectedAt} is not null)::int`,
      })
      .from(jobs)
      .where(and(eq(jobs.orgId, orgId), isNotNull(jobs.agentConversationId), gte(jobs.createdAt, since)));
    return { accepted: row?.accepted ?? 0, edited: row?.edited ?? 0, rejected: row?.rejected ?? 0 };
  }
  if (agentId === "quoting-agent") {
    const [row] = await db
      .select({
        accepted: sql<number>`count(*) filter (where ${quoteProposals.status} = 'approved')::int`,
        rejected: sql<number>`count(*) filter (where ${quoteProposals.status} = 'rejected')::int`,
      })
      .from(quoteProposals)
      .where(and(eq(quoteProposals.orgId, orgId), gte(quoteProposals.createdAt, since)));
    return { accepted: row?.accepted ?? 0, edited: 0, rejected: row?.rejected ?? 0 };
  }
  if (agentId === "dispatch-agent") {
    const [row] = await db
      .select({
        accepted: sql<number>`count(*) filter (where ${dispatchSuggestions.state} = 'accepted')::int`,
        edited: sql<number>`count(*) filter (where ${dispatchSuggestions.state} = 'changed')::int`,
        rejected: sql<number>`count(*) filter (where ${dispatchSuggestions.state} in ('rejected', 'ignored'))::int`,
      })
      .from(dispatchSuggestions)
      .where(and(eq(dispatchSuggestions.orgId, orgId), gte(dispatchSuggestions.createdAt, since)));
    return { accepted: row?.accepted ?? 0, edited: row?.edited ?? 0, rejected: row?.rejected ?? 0 };
  }
  if (agentId === "copilot-agent") {
    const [row] = await db
      .select({
        accepted: sql<number>`count(*) filter (where ${copilotSuggestions.state} = 'accepted')::int`,
        edited: sql<number>`count(*) filter (where ${copilotSuggestions.state} = 'changed')::int`,
        rejected: sql<number>`count(*) filter (where ${copilotSuggestions.state} in ('rejected', 'ignored'))::int`,
      })
      .from(copilotSuggestions)
      .where(and(eq(copilotSuggestions.orgId, orgId), gte(copilotSuggestions.createdAt, since)));
    return { accepted: row?.accepted ?? 0, edited: row?.edited ?? 0, rejected: row?.rejected ?? 0 };
  }
  return { accepted: 0, edited: 0, rejected: 0 };
}

export async function buildMetrics(orgId: string, agentId: AgentId, room: AgentRoomDTO, now = new Date()): Promise<AgentMetricsDTO> {
  const since = new Date(now.getTime() - HOURS * HOUR_MS);
  const today = startOfDay(now);
  const scope = and(eq(agentRuns.orgId, orgId), eq(agentRuns.agentId, agentId));
  const [summary, tokens, errors, deadLetters, approvals] = await Promise.all([
    db
      .select({
        completed: sql<number>`count(*) filter (where ${agentRuns.state} = 'completed')::int`,
        failed: sql<number>`count(*) filter (where ${agentRuns.state} = 'failed')::int`,
        p50: sql<number | null>`percentile_cont(0.5) within group (order by ${agentRuns.latencyMs})`,
        p95: sql<number | null>`percentile_cont(0.95) within group (order by ${agentRuns.latencyMs})`,
      })
      .from(agentRuns)
      .where(and(scope, gte(agentRuns.createdAt, since))),
    db
      .select({
        input: sql<number>`coalesce(sum(${agentRuns.inputTokens}), 0)::int`,
        output: sql<number>`coalesce(sum(${agentRuns.outputTokens}), 0)::int`,
      })
      .from(agentRuns)
      .where(and(scope, gte(agentRuns.createdAt, today))),
    db
      .select({
        type: sql<string>`coalesce(nullif(${agentRuns.outcome}, ''), split_part(coalesce(${agentRuns.error}, 'unknown'), ':', 1))`,
        count: sql<number>`count(*)::int`,
      })
      .from(agentRuns)
      .where(and(scope, eq(agentRuns.state, "failed"), gte(agentRuns.createdAt, today)))
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`)
      .limit(10),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentDeadLetters)
      .where(and(eq(agentDeadLetters.agentId, agentId), or(isNull(agentDeadLetters.orgId), eq(agentDeadLetters.orgId, orgId)))),
    approvalCounts(orgId, agentId, now),
  ]);
  const totals = summary[0];
  const decided = (totals?.completed ?? 0) + (totals?.failed ?? 0);
  const round = (value: number | null | undefined) => (value == null ? null : Math.round(Number(value)));
  return {
    runsPerHour: room.activity,
    successRate: decided === 0 ? null : (totals?.completed ?? 0) / decided,
    latencyP50Ms: round(totals?.p50),
    latencyP95Ms: round(totals?.p95),
    costTodayCents: room.costTodayCents,
    costCapCents: room.costCapCents,
    inputTokensToday: tokens[0]?.input ?? 0,
    outputTokensToday: tokens[0]?.output ?? 0,
    errorsByType: errors.map((row) => ({ type: redactErrorType(row.type), count: row.count })),
    deadLetters: deadLetters[0]?.count ?? 0,
    queueDepth: room.queueDepth,
    approvals,
  };
}

function redactErrorType(value: string): string {
  return value.replace(/[^\w .-]/g, "").slice(0, 60) || "unknown";
}

export async function buildDetail(orgId: string, agentId: AgentId, now = new Date()): Promise<AgentDetailDTO> {
  const [room] = await buildRooms(orgId, [agentId], now);
  const definition = AGENT_REGISTRY[agentId];
  const [metrics, control, heartbeats, history] = await Promise.all([
    buildMetrics(orgId, agentId, room!, now),
    db.select().from(agentControls).where(eq(agentControls.agentId, agentId)).limit(1),
    latestHeartbeats([agentId]),
    db
      .select()
      .from(agentAuditLog)
      .where(and(eq(agentAuditLog.agentId, agentId), eq(agentAuditLog.orgId, orgId), inArray(agentAuditLog.action, ["pause", "resume"])))
      .orderBy(desc(agentAuditLog.createdAt))
      .limit(20),
  ]);
  const heartbeat = heartbeats.get(agentId);
  const config: AgentConfigDTO = {
    scopes: [...definition.scopes],
    never: [...definition.neverList],
    tasks: [...definition.tasks],
    featureFlagKey: definition.featureFlagKey,
    flagEnabled: flagEnabled(agentId),
    costCapEnv: definition.costCapEnv,
    maxAttempts: control[0]?.maxAttempts ?? 3,
    promptVersion: heartbeat?.promptVersion ?? null,
    version: heartbeat?.version ?? null,
  };
  const controlHistory: AgentControlEventDTO[] = history.map((entry) => ({
    id: entry.id,
    action: entry.action === "pause" ? "pause" : "resume",
    reason: entry.reason ?? "",
    actorName: entry.actorName,
    at: entry.createdAt.toISOString(),
  }));
  return { agent: room!, metrics, config, controlHistory };
}

type RunRow = typeof agentRuns.$inferSelect;

function runSummary(run: RunRow): AgentRunSummaryDTO {
  const state = toRunState(run.state);
  return {
    id: run.id,
    agentId: (isAgentId(run.agentId) ? run.agentId : "intake-agent") as AgentId,
    task: run.task,
    state,
    outcome: run.outcome,
    startedAt: run.createdAt.toISOString(),
    finishedAt: iso(run.completedAt),
    latencyMs: run.latencyMs,
    costCents: run.costCents,
    inputTokens: run.inputTokens,
    outputTokens: run.outputTokens,
    error: run.error ? run.error.split("\n")[0]!.slice(0, 300) : null,
    retryable: state === "failed" && RETRYABLE_TASKS.has(run.task) && run.leaseId !== null,
  };
}

/** Cursor = "<createdAt ISO>|<id>", newest first. */
export async function listRuns(orgId: string, agentId: AgentId, cursor: string | null, limit = 25): Promise<AgentRunsPageDTO> {
  let before: { at: Date; id: string } | null = null;
  if (cursor) {
    const [at, id] = cursor.split("|");
    const date = new Date(at ?? "");
    if (!Number.isNaN(date.getTime()) && id && /^[0-9a-f-]{36}$/i.test(id)) before = { at: date, id };
  }
  const rows = await db
    .select()
    .from(agentRuns)
    .where(
      and(
        eq(agentRuns.orgId, orgId),
        eq(agentRuns.agentId, agentId),
        before
          ? or(lt(agentRuns.createdAt, before.at), and(eq(agentRuns.createdAt, before.at), lt(agentRuns.id, before.id)))
          : undefined,
      ),
    )
    .orderBy(desc(agentRuns.createdAt), desc(agentRuns.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    runs: page.map(runSummary),
    nextCursor: rows.length > limit && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}

export function stepDTO(row: typeof agentRunSteps.$inferSelect): AgentRunStepDTO {
  return {
    id: row.id,
    runId: row.runId,
    name: row.name,
    label: row.label,
    status: toRunState(row.status),
    startedAt: iso(row.startedAt),
    finishedAt: iso(row.finishedAt),
    summary: row.summary,
  };
}

export function logDTO(row: typeof agentLogLines.$inferSelect): AgentLogLineDTO {
  return {
    id: String(row.id),
    agentId: (isAgentId(row.agentId) ? row.agentId : "intake-agent") as AgentId,
    runId: row.runId,
    at: row.createdAt.toISOString(),
    level: toLevel(row.level),
    message: row.message,
  };
}

export async function getRun(orgId: string, runId: string): Promise<RunRow | null> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.orgId, orgId)))
    .limit(1);
  return run ?? null;
}

export async function getRunDetail(orgId: string, runId: string): Promise<AgentRunDetailDTO | null> {
  const run = await getRun(orgId, runId);
  if (!run) return null;
  const [steps, logs] = await Promise.all([
    db.select().from(agentRunSteps).where(eq(agentRunSteps.runId, runId)).orderBy(agentRunSteps.seq),
    db.select().from(agentLogLines).where(eq(agentLogLines.runId, runId)).orderBy(agentLogLines.id).limit(500),
  ]);
  return { ...runSummary(run), steps: steps.map(stepDTO), logs: logs.map(logDTO) };
}

/** Most recent log lines for an agent: this org's run logs plus process-level lines. */
export async function recentLogs(orgId: string, agentId: AgentId, limit = 500): Promise<AgentLogLineDTO[]> {
  const rows = await db
    .select()
    .from(agentLogLines)
    .where(and(eq(agentLogLines.agentId, agentId), or(isNull(agentLogLines.orgId), eq(agentLogLines.orgId, orgId))))
    .orderBy(desc(agentLogLines.id))
    .limit(Math.min(Math.max(limit, 1), 1_000));
  return rows.reverse().map(logDTO);
}
