// Agent Office: the owner's live view of every NNACT agent. These contracts are
// shared by the API (which builds them from heartbeats, runs and run events)
// and the web page (which validates everything that arrives over the wire).
import { z } from "zod";
import type { AgentAutonomyTier, AgentId, AgentStage } from "./agent-registry.js";

/** A heartbeat older than this means the agent process is offline. */
export const AGENT_HEARTBEAT_OFFLINE_MS = 90_000;
/** A run still in progress after this long is reported as stalled. */
export const AGENT_RUN_STALL_MS = 10 * 60_000;
/** Spend at or above this share of the daily cap raises a warning. */
export const AGENT_COST_WARN_RATIO = 0.8;
/** The page applies streamed updates at most this often. */
export const AGENT_OFFICE_UI_THROTTLE_MS = 1_000;

export const AGENT_OFFICE_STATUSES = ["working", "idle", "waiting", "paused", "error", "offline"] as const;
export type AgentOfficeStatus = (typeof AGENT_OFFICE_STATUSES)[number];

/** What the agent process itself reports; paused and offline are derived. */
export const AGENT_HEARTBEAT_STATUSES = ["working", "idle", "waiting", "error"] as const;
export type AgentHeartbeatStatus = (typeof AGENT_HEARTBEAT_STATUSES)[number];

const agentIdSchema = z.custom<AgentId>((value) => typeof value === "string" && value.length > 0);
const tierSchema = z.custom<AgentAutonomyTier>((value) => typeof value === "string");
const stageSchema = z.custom<AgentStage>((value) => value === "live" || value === "building" || value === "planned");
const isoSchema = z.string().min(1);

export const agentCurrentTaskSchema = z.object({
  runId: z.string(),
  task: z.string(),
  /** Plain-language label such as "Drafting job from WhatsApp". Never message content. */
  label: z.string(),
  stepName: z.string().nullable(),
  stepIndex: z.number().int().min(0),
  stepCount: z.number().int().min(0),
  startedAt: isoSchema,
});
export type AgentCurrentTask = z.infer<typeof agentCurrentTaskSchema>;

export const agentRoomSchema = z.object({
  id: agentIdSchema,
  displayName: z.string(),
  tier: tierSchema,
  stage: stageSchema,
  status: z.enum(AGENT_OFFICE_STATUSES),
  enabled: z.boolean(),
  current: agentCurrentTaskSchema.nullable(),
  queueDepth: z.number().int().min(0),
  costTodayCents: z.number().int().min(0),
  costCapCents: z.number().int().min(0).nullable(),
  /** Runs per hour for the last 24 hours, oldest first. */
  activity: z.array(z.number().int().min(0)).max(48),
  runsToday: z.number().int().min(0),
  errorsToday: z.number().int().min(0),
  lastSeenAt: isoSchema.nullable(),
  version: z.string().nullable(),
});
export type AgentRoomDTO = z.infer<typeof agentRoomSchema>;

export const agentApprovalDeskSchema = z.object({
  draftJobs: z.number().int().min(0),
  quoteProposals: z.number().int().min(0),
  dispatchSuggestions: z.number().int().min(0),
});
export type AgentApprovalDeskDTO = z.infer<typeof agentApprovalDeskSchema>;

export const AGENT_OFFICE_ALERT_KINDS = ["stalled", "error", "cap", "offline"] as const;
export type AgentOfficeAlertKind = (typeof AGENT_OFFICE_ALERT_KINDS)[number];

export const agentOfficeAlertSchema = z.object({
  id: z.string(),
  agentId: agentIdSchema,
  kind: z.enum(AGENT_OFFICE_ALERT_KINDS),
  severity: z.enum(["warning", "critical"]),
  message: z.string(),
});
export type AgentOfficeAlert = z.infer<typeof agentOfficeAlertSchema>;

export const agentOfficeOverviewSchema = z.object({
  generatedAt: isoSchema,
  agents: z.array(agentRoomSchema),
  approvals: agentApprovalDeskSchema,
  costTodayCents: z.number().int().min(0),
});
export type AgentOfficeOverviewDTO = z.infer<typeof agentOfficeOverviewSchema>;

export const AGENT_RUN_STATES = ["pending", "running", "completed", "failed", "skipped"] as const;
export type AgentRunState = (typeof AGENT_RUN_STATES)[number];

export const agentRunStepSchema = z.object({
  id: z.string(),
  runId: z.string(),
  name: z.string(),
  label: z.string(),
  status: z.enum(AGENT_RUN_STATES),
  startedAt: isoSchema.nullable(),
  finishedAt: isoSchema.nullable(),
  /** Redacted by the API: no phone numbers, names or message bodies. */
  summary: z.string().nullable(),
});
export type AgentRunStepDTO = z.infer<typeof agentRunStepSchema>;

export const AGENT_LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type AgentLogLevel = (typeof AGENT_LOG_LEVELS)[number];

export const agentLogLineSchema = z.object({
  id: z.string(),
  agentId: agentIdSchema,
  runId: z.string().nullable(),
  at: isoSchema,
  level: z.enum(AGENT_LOG_LEVELS),
  message: z.string(),
});
export type AgentLogLineDTO = z.infer<typeof agentLogLineSchema>;

export const agentLogsResponseSchema = z.object({ lines: z.array(agentLogLineSchema) });

export const agentRunSummarySchema = z.object({
  id: z.string(),
  agentId: agentIdSchema,
  task: z.string(),
  state: z.enum(AGENT_RUN_STATES),
  outcome: z.string().nullable(),
  startedAt: isoSchema,
  finishedAt: isoSchema.nullable(),
  latencyMs: z.number().int().min(0).nullable(),
  costCents: z.number().int().min(0).nullable(),
  inputTokens: z.number().int().min(0).nullable(),
  outputTokens: z.number().int().min(0).nullable(),
  error: z.string().nullable(),
  /** True only when re-running the operation cannot duplicate side effects. */
  retryable: z.boolean(),
});
export type AgentRunSummaryDTO = z.infer<typeof agentRunSummarySchema>;

export const agentRunsPageSchema = z.object({
  runs: z.array(agentRunSummarySchema),
  nextCursor: z.string().nullable(),
});
export type AgentRunsPageDTO = z.infer<typeof agentRunsPageSchema>;

export const agentRunDetailSchema = agentRunSummarySchema.extend({
  steps: z.array(agentRunStepSchema),
  logs: z.array(agentLogLineSchema),
});
export type AgentRunDetailDTO = z.infer<typeof agentRunDetailSchema>;

export const agentApprovalCountsSchema = z.object({
  accepted: z.number().int().min(0),
  edited: z.number().int().min(0),
  rejected: z.number().int().min(0),
});
export type AgentApprovalCounts = z.infer<typeof agentApprovalCountsSchema>;

export const agentMetricsSchema = z.object({
  runsPerHour: z.array(z.number().int().min(0)).max(48),
  successRate: z.number().min(0).max(1).nullable(),
  latencyP50Ms: z.number().int().min(0).nullable(),
  latencyP95Ms: z.number().int().min(0).nullable(),
  costTodayCents: z.number().int().min(0),
  costCapCents: z.number().int().min(0).nullable(),
  inputTokensToday: z.number().int().min(0),
  outputTokensToday: z.number().int().min(0),
  errorsByType: z.array(z.object({ type: z.string(), count: z.number().int().min(0) })),
  deadLetters: z.number().int().min(0),
  queueDepth: z.number().int().min(0),
  approvals: agentApprovalCountsSchema,
});
export type AgentMetricsDTO = z.infer<typeof agentMetricsSchema>;

export const agentConfigSchema = z.object({
  scopes: z.array(z.string()),
  never: z.array(z.string()),
  tasks: z.array(z.string()),
  featureFlagKey: z.string(),
  flagEnabled: z.boolean(),
  costCapEnv: z.string(),
  maxAttempts: z.number().int().min(1),
  promptVersion: z.string().nullable(),
  version: z.string().nullable(),
});
export type AgentConfigDTO = z.infer<typeof agentConfigSchema>;

export const agentControlEventSchema = z.object({
  id: z.string(),
  action: z.enum(["pause", "resume"]),
  reason: z.string(),
  actorName: z.string().nullable(),
  at: isoSchema,
});
export type AgentControlEventDTO = z.infer<typeof agentControlEventSchema>;

export const agentDetailSchema = z.object({
  agent: agentRoomSchema,
  metrics: agentMetricsSchema,
  config: agentConfigSchema,
  controlHistory: z.array(agentControlEventSchema),
});
export type AgentDetailDTO = z.infer<typeof agentDetailSchema>;

/** Body for pause and resume. A reason is mandatory and lands in the audit trail. */
export const agentControlActionSchema = z.object({
  reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(500),
});
export type AgentControlActionInput = z.infer<typeof agentControlActionSchema>;

export const agentOfficeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("agent"), agent: agentRoomSchema }),
  z.object({ type: z.literal("approvals"), approvals: agentApprovalDeskSchema }),
  z.object({ type: z.literal("step"), agentId: agentIdSchema, step: agentRunStepSchema }),
  z.object({ type: z.literal("log"), line: agentLogLineSchema }),
]);
export type AgentOfficeEvent = z.infer<typeof agentOfficeEventSchema>;

/** Parse one SSE `data:` payload. Anything malformed is dropped, never trusted. */
export function parseAgentOfficeEvent(data: string): AgentOfficeEvent | null {
  try {
    const parsed = agentOfficeEventSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface AgentStatusInput {
  enabled: boolean;
  heartbeat: { status: AgentHeartbeatStatus; lastSeenAt: string | Date } | null;
  now: number | Date;
  offlineAfterMs?: number;
}

/**
 * Paused wins over everything (the owner turned it off). Otherwise a missing
 * or stale heartbeat means offline, and a fresh one is trusted as reported.
 */
export function deriveAgentStatus({
  enabled,
  heartbeat,
  now,
  offlineAfterMs = AGENT_HEARTBEAT_OFFLINE_MS,
}: AgentStatusInput): AgentOfficeStatus {
  if (!enabled) return "paused";
  if (!heartbeat) return "offline";
  const seen = new Date(heartbeat.lastSeenAt).getTime();
  const at = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(seen) || at - seen > offlineAfterMs) return "offline";
  return heartbeat.status;
}

/** "Drafting job from WhatsApp, step 2 of 4". */
export function describeCurrentTask(task: AgentCurrentTask | null): string | null {
  if (!task) return null;
  if (task.stepCount > 0 && task.stepIndex > 0) {
    return `${task.label}, step ${Math.min(task.stepIndex, task.stepCount)} of ${task.stepCount}`;
  }
  return task.label;
}

/** Spend as a share of the cap, or null when the agent has no cap. */
export function costRatio(spentCents: number, capCents: number | null): number | null {
  if (capCents == null) return null;
  if (capCents <= 0) return spentCents > 0 ? 1 : 0;
  return spentCents / capCents;
}

/** Accepted and edited both count as approved; null until anything is decided. */
export function approvalRate({ accepted, edited, rejected }: AgentApprovalCounts): number | null {
  const total = accepted + edited + rejected;
  return total === 0 ? null : (accepted + edited) / total;
}

/** Alerts for the top bar, most severe first. Planned offices never alert. */
export function deriveAgentAlerts(
  agents: readonly AgentRoomDTO[],
  now: number | Date = Date.now(),
  stallAfterMs = AGENT_RUN_STALL_MS,
): AgentOfficeAlert[] {
  const at = typeof now === "number" ? now : now.getTime();
  const alerts: AgentOfficeAlert[] = [];
  for (const agent of agents) {
    if (agent.stage !== "live") continue;
    if (agent.status === "error") {
      alerts.push({
        id: `${agent.id}:error`,
        agentId: agent.id,
        kind: "error",
        severity: "critical",
        message: `${agent.displayName} reported an error`,
      });
    }
    if (agent.status === "offline" && agent.enabled) {
      alerts.push({
        id: `${agent.id}:offline`,
        agentId: agent.id,
        kind: "offline",
        severity: "warning",
        message: `${agent.displayName} is offline`,
      });
    }
    if (agent.current && at - new Date(agent.current.startedAt).getTime() > stallAfterMs) {
      alerts.push({
        id: `${agent.id}:stalled:${agent.current.runId}`,
        agentId: agent.id,
        kind: "stalled",
        severity: "warning",
        message: `${agent.displayName} has been on one run for over ${Math.round(stallAfterMs / 60_000)} minutes`,
      });
    }
    const ratio = costRatio(agent.costTodayCents, agent.costCapCents);
    if (ratio != null && ratio >= AGENT_COST_WARN_RATIO) {
      alerts.push({
        id: `${agent.id}:cap`,
        agentId: agent.id,
        kind: "cap",
        severity: ratio >= 1 ? "critical" : "warning",
        message:
          ratio >= 1
            ? `${agent.displayName} reached its daily cost cap`
            : `${agent.displayName} has used ${Math.round(ratio * 100)}% of its daily cost cap`,
      });
    }
  }
  return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
}
