import { and, asc, eq, inArray, lte, or, sql } from "drizzle-orm";
import { db, agentDeadLetters, agentLeases } from "@nnact/db";
import type { AgentId } from "@nnact/shared";
import type {
  AgentDeadLetter,
  AgentLease,
  AgentLeaseDeadLetterInput,
  AgentLeaseAcquireInput,
  AgentLeaseDueInput,
  AgentLeaseEnqueueInput,
  AgentLeaseReleaseInput,
  AgentLeaseRenewInput,
  AgentLeaseRetryInput,
  AgentLeaseStore,
} from "@nnact/agent-kit";

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function toLease(row: typeof agentLeases.$inferSelect): AgentLease {
  return {
    id: row.id,
    agentId: row.agentId as AgentId,
    orgId: row.orgId ?? null,
    leaseKey: row.leaseKey,
    task: row.task,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    state: (row.state as AgentLease["state"]) ?? "pending",
    attempts: row.attempts ?? 0,
    maxAttempts: row.maxAttempts ?? 3,
    claimedAt: toIso(row.claimedAt),
    expiresAt: toIso(row.expiresAt),
    nextAttemptAt: toIso(row.nextAttemptAt) ?? new Date(0).toISOString(),
    completedAt: toIso(row.completedAt),
    lastError: row.lastError ?? null,
  };
}

function toDeadLetter(row: typeof agentDeadLetters.$inferSelect): AgentDeadLetter {
  return {
    id: row.id,
    leaseId: row.runId ?? "",
    agentId: row.agentId as AgentId,
    orgId: row.orgId ?? null,
    leaseKey: row.leaseKey ?? "",
    task: row.task,
    attempts: 0,
    error: row.error,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    createdAt: toIso(row.createdAt) ?? new Date().toISOString(),
  };
}

function nowDate(input: Date | undefined): Date {
  return input ?? new Date();
}

export class DbAgentLeaseStore implements AgentLeaseStore {
  async enqueue(input: AgentLeaseEnqueueInput): Promise<AgentLease> {
    const nextAttemptAt = input.nextAttemptAt instanceof Date
      ? input.nextAttemptAt
      : input.nextAttemptAt
        ? new Date(input.nextAttemptAt)
        : new Date();
    const [row] = await db
      .insert(agentLeases)
      .values({
        agentId: input.agentId,
        orgId: input.orgId ?? null,
        leaseKey: input.leaseKey,
        state: "pending",
        attempts: 0,
        task: input.task,
        payload: input.payload ?? {},
        nextAttemptAt,
        maxAttempts: input.maxAttempts ?? 3,
        expiresAt: nextAttemptAt,
        lastError: null,
        completedAt: null,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [agentLeases.agentId, agentLeases.leaseKey],
        set: {
          task: sql`case when ${agentLeases.state} in ('completed', 'dead') then excluded.task else ${agentLeases.task} end`,
          payload: sql`case when ${agentLeases.state} in ('completed', 'dead') then excluded.payload else ${agentLeases.payload} end`,
          orgId: sql`coalesce(${agentLeases.orgId}, excluded.org_id)`,
          state: sql`case when ${agentLeases.state} in ('completed', 'dead') then 'pending' else ${agentLeases.state} end`,
          attempts: sql`case when ${agentLeases.state} in ('completed', 'dead') then 0 else ${agentLeases.attempts} end`,
          nextAttemptAt: sql`case when ${agentLeases.state} in ('completed', 'dead') then excluded.next_attempt_at else ${agentLeases.nextAttemptAt} end`,
          maxAttempts: sql`case when ${agentLeases.state} in ('completed', 'dead') then excluded.max_attempts else ${agentLeases.maxAttempts} end`,
          claimedAt: sql`case when ${agentLeases.state} in ('completed', 'dead') then null else ${agentLeases.claimedAt} end`,
          expiresAt: sql`case when ${agentLeases.state} in ('completed', 'dead') then excluded.expires_at else ${agentLeases.expiresAt} end`,
          completedAt: sql`case when ${agentLeases.state} in ('completed', 'dead') then null else ${agentLeases.completedAt} end`,
          lastError: sql`case when ${agentLeases.state} in ('completed', 'dead') then null else ${agentLeases.lastError} end`,
          updatedAt: sql`now()`,
        },
      })
      .returning();
    return toLease(row);
  }

  async due(input: AgentLeaseDueInput): Promise<AgentLease[]> {
    const now = nowDate(input.now);
    const limit = Math.max(0, input.limit ?? 10);
    const rows = await db
      .select()
      .from(agentLeases)
      .where(
        and(
          eq(agentLeases.agentId, input.agentId),
          or(
            and(eq(agentLeases.state, "pending"), lte(agentLeases.nextAttemptAt, now)),
            and(eq(agentLeases.state, "leased"), lte(agentLeases.expiresAt, now)),
          ),
        ),
      )
      .orderBy(asc(agentLeases.nextAttemptAt), asc(agentLeases.id))
      .limit(limit);
    return rows.map(toLease);
  }

  async acquire(input: AgentLeaseAcquireInput): Promise<AgentLease | null> {
    const now = nowDate(input.now);
    const expiresAt = new Date(now.getTime() + Math.max(0, input.ttlMs));
    const [row] = await db
      .update(agentLeases)
      .set({
        state: "leased",
        attempts: sql`${agentLeases.attempts} + 1`,
        claimedAt: now,
        expiresAt,
        updatedAt: now,
        completedAt: null,
      })
      .where(
        and(
          eq(agentLeases.agentId, input.agentId),
          eq(agentLeases.leaseKey, input.leaseKey),
          or(
            and(eq(agentLeases.state, "pending"), lte(agentLeases.nextAttemptAt, now)),
            and(eq(agentLeases.state, "leased"), lte(agentLeases.expiresAt, now)),
          ),
        ),
      )
      .returning();
    return row ? toLease(row) : null;
  }

  async renew(input: AgentLeaseRenewInput): Promise<AgentLease | null> {
    const now = nowDate(input.now);
    const expiresAt = new Date(now.getTime() + Math.max(0, input.ttlMs));
    const [row] = await db
      .update(agentLeases)
      .set({ expiresAt, updatedAt: now })
      .where(
        and(
          eq(agentLeases.id, input.lease.id),
          eq(agentLeases.agentId, input.lease.agentId),
          eq(agentLeases.state, "leased"),
          sql`${agentLeases.expiresAt} > ${now}`,
        ),
      )
      .returning();
    return row ? toLease(row) : null;
  }

  async release(input: AgentLeaseReleaseInput): Promise<AgentLease> {
    const now = nowDate(input.now);
    const [row] = await db
      .update(agentLeases)
      .set({
        state: "completed",
        completedAt: now,
        expiresAt: now,
        lastError: null,
        updatedAt: now,
      })
      .where(and(eq(agentLeases.id, input.lease.id), eq(agentLeases.agentId, input.lease.agentId)))
      .returning();
    return row ? toLease(row) : input.lease;
  }

  async retry(input: AgentLeaseRetryInput): Promise<AgentLease> {
    const now = nowDate(input.now);
    const nextAttemptAt = new Date(now.getTime() + Math.max(0, input.delayMs));
    const [row] = await db
      .update(agentLeases)
      .set({
        state: "pending",
        nextAttemptAt,
        expiresAt: nextAttemptAt,
        claimedAt: null,
        lastError: input.error,
        updatedAt: now,
      })
      .where(and(eq(agentLeases.id, input.lease.id), eq(agentLeases.agentId, input.lease.agentId)))
      .returning();
    return row ? toLease(row) : input.lease;
  }

  async deadLetter(input: AgentLeaseDeadLetterInput): Promise<AgentDeadLetter> {
    const now = nowDate(input.now);
    const [leaseRow] = await db
      .update(agentLeases)
      .set({
        state: "dead",
        completedAt: now,
        expiresAt: now,
        lastError: input.error,
        updatedAt: now,
      })
      .where(and(eq(agentLeases.id, input.lease.id), eq(agentLeases.agentId, input.lease.agentId)))
      .returning();
    const lease = leaseRow ? toLease(leaseRow) : input.lease;
    const [letter] = await db
      .insert(agentDeadLetters)
      .values({
        agentId: lease.agentId,
        orgId: lease.orgId,
        leaseKey: lease.leaseKey,
        runId: null,
        task: lease.task,
        error: input.error,
        payload: lease.payload ?? {},
        createdAt: now,
      })
      .returning();
    const mapped = toDeadLetter(letter);
    return { ...mapped, leaseId: lease.id, attempts: lease.attempts };
  }
}

export async function acquireAgentLeasesByKeys(store: AgentLeaseStore, input: { agentId: AgentId; keys: string[]; ttlMs: number; now?: Date }): Promise<AgentLease[]> {
  const unique = [...new Set(input.keys)];
  const leases: AgentLease[] = [];
  for (const leaseKey of unique) {
    const acquired = await store.acquire({ agentId: input.agentId, leaseKey, ttlMs: input.ttlMs, now: input.now });
    if (acquired) leases.push(acquired);
  }
  return leases;
}

export async function listActiveLeaseKeys(agentId: AgentId, leaseKeys: string[]): Promise<Set<string>> {
  if (leaseKeys.length === 0) return new Set();
  const rows = await db
    .select({ leaseKey: agentLeases.leaseKey })
    .from(agentLeases)
    .where(and(eq(agentLeases.agentId, agentId), inArray(agentLeases.leaseKey, leaseKeys), inArray(agentLeases.state, ["pending", "leased", "dead"])));
  return new Set(rows.map((row) => row.leaseKey));
}
