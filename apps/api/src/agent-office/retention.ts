// Retention for Agent Office telemetry. Runs on a timer in the API; a Postgres
// advisory lock makes it safe on several replicas.
import { lt, sql } from "drizzle-orm";
import { agentHeartbeats, agentLogLines, agentOfficeEvents, agentRunSteps, db } from "@nnact/db";

const LOCK_KEY = 0x4e4e4f4646; // "NNOFF"

export interface RetentionPolicy {
  /** Run steps and log lines. */
  telemetryDays: number;
  /** The change feed only needs to cover a reconnect gap. */
  eventHours: number;
  /** Heartbeats of processes that went away. */
  heartbeatDays: number;
}

export function retentionPolicy(env: NodeJS.ProcessEnv = process.env): RetentionPolicy {
  const days = Number(env.AGENT_OFFICE_RETENTION_DAYS ?? 14);
  return {
    telemetryDays: Number.isFinite(days) && days >= 1 ? Math.floor(days) : 14,
    eventHours: 24,
    heartbeatDays: 7,
  };
}

export interface PurgeResult {
  steps: number;
  logs: number;
  events: number;
  heartbeats: number;
  skipped?: boolean;
}

export async function purgeAgentOffice(policy = retentionPolicy(), now = new Date()): Promise<PurgeResult> {
  return db.transaction(async (tx) => {
    const [lock] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(${LOCK_KEY}) as locked`);
    if (!lock?.locked) return { steps: 0, logs: 0, events: 0, heartbeats: 0, skipped: true };
    const before = (ms: number) => new Date(now.getTime() - ms);
    const day = 86_400_000;
    const steps = await tx.delete(agentRunSteps).where(lt(agentRunSteps.createdAt, before(policy.telemetryDays * day))).returning({ id: agentRunSteps.id });
    const logs = await tx.delete(agentLogLines).where(lt(agentLogLines.createdAt, before(policy.telemetryDays * day))).returning({ id: agentLogLines.id });
    const events = await tx
      .delete(agentOfficeEvents)
      .where(lt(agentOfficeEvents.createdAt, before(policy.eventHours * 3_600_000)))
      .returning({ id: agentOfficeEvents.id });
    const heartbeats = await tx
      .delete(agentHeartbeats)
      .where(lt(agentHeartbeats.lastSeenAt, before(policy.heartbeatDays * day)))
      .returning({ agentId: agentHeartbeats.agentId });
    return { steps: steps.length, logs: logs.length, events: events.length, heartbeats: heartbeats.length };
  });
}

/** Hourly purge; returns a stop function. */
export function startRetentionTimer(log: (message: string) => void, intervalMs = 3_600_000): () => void {
  const run = () =>
    purgeAgentOffice()
      .then((result) => {
        if (!result.skipped && result.steps + result.logs + result.events + result.heartbeats > 0) {
          log(`agent office purge: ${result.steps} steps, ${result.logs} logs, ${result.events} events, ${result.heartbeats} heartbeats`);
        }
      })
      .catch((error: unknown) => log(`agent office purge failed: ${(error as Error).message}`));
  const first = setTimeout(run, 60_000);
  const timer = setInterval(run, intervalMs);
  first.unref?.();
  timer.unref?.();
  return () => {
    clearTimeout(first);
    clearInterval(timer);
  };
}
