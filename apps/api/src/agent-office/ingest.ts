// Writes from agent processes: heartbeats, run steps and log lines. Every
// text field is redacted here, before it is stored or streamed.
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { agentHeartbeats, agentLogLines, agentRunSteps, agentRuns, db } from "@nnact/db";
import { AGENT_HEARTBEAT_STATUSES, AGENT_LOG_LEVELS, AGENT_RUN_STATES, type AgentId } from "@nnact/shared";
import { appendEvent } from "./events.js";
import { redactLine, redactText } from "./redact.js";
import { logDTO, stepDTO } from "./service.js";

const label = z.string().trim().min(1).max(120);
const fields = z.record(z.string(), z.unknown()).optional();

export const heartbeatBody = z.object({
  instanceId: z.string().trim().min(1).max(120),
  status: z.enum(AGENT_HEARTBEAT_STATUSES),
  version: z.string().trim().max(60).optional(),
  promptVersion: z.string().trim().max(120).optional(),
  current: z
    .object({
      runId: z.string().uuid(),
      task: z.string().trim().min(1).max(120),
      label,
      stepName: z.string().trim().max(120).nullable().optional(),
      stepIndex: z.number().int().min(0).max(100).default(0),
      stepCount: z.number().int().min(0).max(100).default(0),
      startedAt: z.string().datetime().optional(),
    })
    .nullable()
    .optional(),
});

export const stepBody = z.object({
  name: z.string().trim().min(1).max(80),
  label,
  status: z.enum(AGENT_RUN_STATES),
  summary: z.string().max(2_000).nullable().optional(),
  fields,
  startedAt: z.string().datetime().optional(),
  finishedAt: z.string().datetime().nullable().optional(),
});

export const logsBody = z.object({
  lines: z
    .array(
      z.object({
        level: z.enum(AGENT_LOG_LEVELS),
        message: z.string().min(1).max(4_000),
        fields,
        runId: z.string().uuid().nullable().optional(),
        at: z.string().datetime().optional(),
      }),
    )
    .min(1)
    .max(100),
});

/** Upsert one process's heartbeat. Only status changes and run changes are streamed. */
export async function recordHeartbeat(agentId: AgentId, body: z.infer<typeof heartbeatBody>, now = new Date()): Promise<void> {
  const current = body.current ?? null;
  const [previous] = await db
    .select({ status: agentHeartbeats.status, runId: agentHeartbeats.currentRunId, stepIndex: agentHeartbeats.stepIndex })
    .from(agentHeartbeats)
    .where(and(eq(agentHeartbeats.agentId, agentId), eq(agentHeartbeats.instanceId, body.instanceId)))
    .limit(1);
  const values = {
    status: body.status,
    currentRunId: current?.runId ?? null,
    currentTask: current ? redactText(current.task) : null,
    currentLabel: current ? redactText(current.label) : null,
    stepName: current?.stepName ? redactText(current.stepName) : null,
    stepIndex: current?.stepIndex ?? 0,
    stepCount: current?.stepCount ?? 0,
    runStartedAt: current?.startedAt ? new Date(current.startedAt) : current ? now : null,
    version: body.version ?? null,
    promptVersion: body.promptVersion ?? null,
    lastSeenAt: now,
  };
  await db
    .insert(agentHeartbeats)
    .values({ agentId, instanceId: body.instanceId, ...values })
    .onConflictDoUpdate({ target: [agentHeartbeats.agentId, agentHeartbeats.instanceId], set: values });
  const changed =
    !previous || previous.status !== values.status || previous.runId !== values.currentRunId || previous.stepIndex !== values.stepIndex;
  if (changed) await appendEvent({ orgId: null, agentId, type: "agent" });
}

/** Upsert step `seq` of a run that belongs to this agent and org. */
export async function recordStep(
  agentId: AgentId,
  orgId: string,
  runId: string,
  seq: number,
  body: z.infer<typeof stepBody>,
): Promise<"ok" | "not-found"> {
  const [run] = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(and(eq(agentRuns.id, runId), eq(agentRuns.orgId, orgId), eq(agentRuns.agentId, agentId)))
    .limit(1);
  if (!run) return "not-found";
  const summary = body.summary || body.fields ? redactLine(body.summary ?? "", body.fields).trim() || null : null;
  const values = {
    name: redactText(body.name),
    label: redactText(body.label),
    status: body.status,
    summary,
    startedAt: body.startedAt ? new Date(body.startedAt) : body.status === "running" ? new Date() : undefined,
    finishedAt: body.finishedAt ? new Date(body.finishedAt) : ["completed", "failed", "skipped"].includes(body.status) ? new Date() : undefined,
    updatedAt: new Date(),
  };
  const [row] = await db
    .insert(agentRunSteps)
    .values({ orgId, agentId, runId, seq, ...values })
    .onConflictDoUpdate({
      target: [agentRunSteps.runId, agentRunSteps.seq],
      set: { ...values, startedAt: sql`coalesce(${agentRunSteps.startedAt}, excluded.started_at)` },
    })
    .returning();
  await appendEvent({ orgId, agentId, type: "step", payload: { step: stepDTO(row!) } });
  return "ok";
}

/**
 * Store log lines. Lines naming a run are checked against this agent and org
 * and stored under that org; others are process-level lines with no org.
 */
export async function recordLogs(agentId: AgentId, orgId: string, body: z.infer<typeof logsBody>): Promise<number> {
  const runIds = [...new Set(body.lines.map((line) => line.runId).filter((id): id is string => Boolean(id)))];
  const owned = new Set<string>();
  if (runIds.length) {
    const rows = await db
      .select({ id: agentRuns.id })
      .from(agentRuns)
      .where(and(eq(agentRuns.orgId, orgId), eq(agentRuns.agentId, agentId), sql`${agentRuns.id} in ${runIds}`));
    for (const row of rows) owned.add(row.id);
  }
  const values = body.lines.map((line) => {
    const runId = line.runId && owned.has(line.runId) ? line.runId : null;
    return {
      orgId: runId ? orgId : null,
      agentId,
      runId,
      level: line.level,
      message: redactLine(line.message, line.fields),
      createdAt: line.at ? new Date(line.at) : new Date(),
    };
  });
  const rows = await db.insert(agentLogLines).values(values).returning();
  for (const row of rows) await appendEvent({ orgId: row.orgId, agentId, type: "log", payload: { line: logDTO(row) } });
  if (rows.some((row) => row.level === "error")) await appendEvent({ orgId: null, agentId, type: "agent" });
  return rows.length;
}
