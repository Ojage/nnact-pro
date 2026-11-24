// Where each agent's work comes from. Every source selects in SQL only items
// that never had a lease for that agent, newest window first, so handled
// items can never crowd out new ones, and a first start does not replay
// months of history. Re-running an item is the owner's retry in the office.
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { agentLeases, db, dispatchSuggestions, jobs, messages } from "@nnact/db";
import { AGENT_ID, type AgentId } from "@nnact/shared";
import type { AgentLeaseStore } from "@nnact/agent-kit";

export interface WorkSourceOptions {
  store: AgentLeaseStore;
  limit?: number;
  maxAttempts?: number;
  now?: Date;
}

export interface WorkItem {
  orgId: string;
  leaseKey: string;
  task: string;
  payload: Record<string, unknown>;
}

const DAY_MS = 86_400_000;

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

function backfillDays(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** `NOT EXISTS` a lease for this agent and key, in any state. */
function noLease(agentId: AgentId, key: ReturnType<typeof sql>) {
  return sql`not exists (select 1 from ${agentLeases} where ${agentLeases.agentId} = ${agentId} and ${agentLeases.leaseKey} = ${key}::text)`;
}

export async function intakeWork(limit: number, now: Date): Promise<WorkItem[]> {
  const rows = await db
    .select({ id: messages.id, orgId: messages.orgId })
    .from(messages)
    .where(
      and(
        eq(messages.direction, "inbound"),
        gte(messages.createdAt, daysAgo(now, backfillDays("INTAKE_BACKFILL_DAYS", 2))),
        noLease(AGENT_ID.intake, sql`${messages.id}`),
        // Messages the original worker already handled before leases existed.
        sql`not exists (select 1 from agent_runs r where r.message_id = ${messages.id} and r.task = 'agent.extract' and r.state in ('completed', 'skipped'))`,
      ),
    )
    .orderBy(asc(messages.createdAt))
    .limit(limit);
  return rows.map((row) => ({ orgId: row.orgId, leaseKey: row.id, task: "agent.extract", payload: { messageId: row.id } }));
}

export async function quotingWork(limit: number, now: Date): Promise<WorkItem[]> {
  const rows = await db
    .select({ id: jobs.id, orgId: jobs.orgId })
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["lead", "scheduled", "in_progress"]),
        eq(jobs.agentDraft, false),
        gte(jobs.createdAt, daysAgo(now, backfillDays("QUOTING_BACKFILL_DAYS", 14))),
        noLease(AGENT_ID.quoting, sql`${jobs.id}`),
        sql`not exists (select 1 from quote_proposals p where p.job_id = ${jobs.id})`,
      ),
    )
    .orderBy(desc(jobs.createdAt))
    .limit(limit);
  return rows.map((row) => ({ orgId: row.orgId, leaseKey: row.id, task: "agent.quote", payload: { jobId: row.id } }));
}

/** Open, unassigned jobs with no current suggestion. Reranked when a job's details change. */
export async function dispatchWork(limit: number, now: Date): Promise<WorkItem[]> {
  const rows = await db
    .select({ id: jobs.id, orgId: jobs.orgId, updatedAt: jobs.updatedAt })
    .from(jobs)
    .where(
      and(
        inArray(jobs.status, ["lead", "scheduled"]),
        isNull(jobs.assignedTo),
        eq(jobs.agentDraft, false),
        gte(jobs.createdAt, daysAgo(now, backfillDays("DISPATCH_BACKFILL_DAYS", 7))),
        sql`not exists (select 1 from ${dispatchSuggestions} s where s.job_id = ${jobs.id} and s.current = 1)`,
      ),
    )
    .orderBy(asc(jobs.scheduledAt), asc(jobs.createdAt))
    .limit(limit);
  // One lease per job version, so an edited job is ranked again.
  const items = rows.map((row) => ({
    orgId: row.orgId,
    leaseKey: `${row.id}:${row.updatedAt.getTime()}`,
    task: "agent.dispatch",
    payload: { jobId: row.id },
  }));
  if (!items.length) return items;
  const existing = await db
    .select({ key: agentLeases.leaseKey })
    .from(agentLeases)
    .where(and(eq(agentLeases.agentId, AGENT_ID.dispatch), inArray(agentLeases.leaseKey, items.map((item) => item.leaseKey))));
  const seen = new Set(existing.map((row) => row.key));
  return items.filter((item) => !seen.has(item.leaseKey));
}

export type WorkSource = (limit: number, now: Date) => Promise<WorkItem[]>;

const SOURCES: Partial<Record<AgentId, WorkSource>> = {
  [AGENT_ID.intake]: intakeWork,
  [AGENT_ID.quoting]: quotingWork,
  [AGENT_ID.dispatch]: dispatchWork,
};

export function registerWorkSource(agentId: AgentId, source: WorkSource): void {
  SOURCES[agentId] = source;
}

export async function enqueueWorkForAgent(agentId: AgentId, options: WorkSourceOptions): Promise<number> {
  const source = SOURCES[agentId];
  if (!source) return 0;
  const items = await source(options.limit ?? 50, options.now ?? new Date());
  for (const item of items) {
    await options.store.enqueue({
      agentId,
      orgId: item.orgId,
      leaseKey: item.leaseKey,
      task: item.task,
      payload: item.payload,
      maxAttempts: options.maxAttempts ?? 3,
    });
  }
  return items.length;
}

