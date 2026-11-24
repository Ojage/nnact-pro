// Owner actions: pause and resume (the kill switch), retry of an idempotent
// failed run, and the audit-logged reveal of a run's raw content.
import { and, eq } from "drizzle-orm";
import { agentAuditLog, agentControls, agentDeadLetters, agentLeases, agentRuns, db } from "@nnact/db";
import type { AgentId } from "@nnact/shared";
import { appendEvent } from "./events.js";
import { RETRYABLE_TASKS, getRun } from "./service.js";

export interface Actor {
  orgId: string;
  userId: string;
  name: string | null;
}

/** Flip the kill switch and record who did it and why, in one transaction. */
export async function setAgentEnabled(agentId: AgentId, enabled: boolean, reason: string, actor: Actor): Promise<{ changed: boolean }> {
  const changed = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(agentControls).where(eq(agentControls.agentId, agentId)).limit(1);
    if ((current?.enabled ?? true) === enabled) return false;
    await tx
      .insert(agentControls)
      .values({ agentId, enabled, updatedAt: new Date() })
      .onConflictDoUpdate({ target: agentControls.agentId, set: { enabled, updatedAt: new Date() } });
    await tx.insert(agentAuditLog).values({
      orgId: actor.orgId,
      agentId,
      action: enabled ? "resume" : "pause",
      reason,
      actorUserId: actor.userId,
      actorName: actor.name,
    });
    return true;
  });
  if (changed) await appendEvent({ orgId: null, agentId, type: "agent" });
  return { changed };
}

export type RetryResult = { ok: true; runId: string } | { ok: false; status: 404 | 409; error: string };

/**
 * Re-queue the lease behind a failed run. Only tasks in RETRYABLE_TASKS can be
 * retried, and only when the run came from a lease (so the agent's own loop,
 * with its own idempotency, does the work again).
 */
export async function retryRun(runId: string, actor: Actor): Promise<RetryResult> {
  const run = await getRun(actor.orgId, runId);
  if (!run || !run.agentId) return { ok: false, status: 404, error: "run not found" };
  if (run.state !== "failed") return { ok: false, status: 409, error: "only failed runs can be retried" };
  if (!RETRYABLE_TASKS.has(run.task)) return { ok: false, status: 409, error: "this task is not safe to retry" };
  if (!run.leaseId) return { ok: false, status: 409, error: "this run has no queued work to retry" };
  const agentId = run.agentId;
  const leaseId = run.leaseId;

  const requeued = await db.transaction(async (tx) => {
    const [lease] = await tx
      .update(agentLeases)
      .set({ state: "pending", attempts: 0, nextAttemptAt: new Date(), lastError: null, completedAt: null, updatedAt: new Date() })
      .where(and(eq(agentLeases.id, leaseId), eq(agentLeases.agentId, agentId)))
      .returning({ id: agentLeases.id, leaseKey: agentLeases.leaseKey });
    if (!lease) return false;
    await tx.delete(agentDeadLetters).where(and(eq(agentDeadLetters.agentId, agentId), eq(agentDeadLetters.leaseKey, lease.leaseKey)));
    await tx.update(agentRuns).set({ outcome: "retried" }).where(eq(agentRuns.id, runId));
    await tx.insert(agentAuditLog).values({ orgId: actor.orgId, agentId, runId, action: "retry", actorUserId: actor.userId, actorName: actor.name });
    return true;
  });
  if (!requeued) return { ok: false, status: 409, error: "the queued work for this run no longer exists" };
  await appendEvent({ orgId: null, agentId, type: "agent" });
  return { ok: true, runId };
}

/** Raw input and output of a run. Every call is written to the audit log first. */
export async function revealRun(runId: string, actor: Actor): Promise<{ input: unknown; output: unknown; revealedAt: string } | null> {
  const run = await getRun(actor.orgId, runId);
  if (!run) return null;
  await db.insert(agentAuditLog).values({
    orgId: actor.orgId,
    agentId: run.agentId ?? "unknown",
    runId,
    action: "reveal",
    actorUserId: actor.userId,
    actorName: actor.name,
  });
  return { input: run.input, output: run.output, revealedAt: new Date().toISOString() };
}
