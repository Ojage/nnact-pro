// The Agent Office change feed.
//
// Agents run in a separate process, so the API cannot use an in-memory bus.
// Every write appends a row to agent_office_events; one poller per API process
// reads new rows by id once a second and fans them out to connected SSE
// clients. Cursor-polling (rather than LISTEN/NOTIFY) was chosen because:
//  - the row id doubles as the SSE event id, so a client that reconnects with
//    Last-Event-ID resumes exactly where it stopped, with no missed events;
//  - it needs no dedicated long-lived connection outside the pool, survives
//    poolers such as PgBouncer in transaction mode, and loses nothing while
//    the API restarts;
//  - one indexed range scan per second per API process is negligible next to
//    the 1 s refresh the page already throttles to.
import { and, asc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { agentOfficeEvents, db } from "@nnact/db";
import { isAgentId, type AgentId, type AgentOfficeEvent } from "@nnact/shared";
import { approvalDesk, buildRooms } from "./service.js";

export type OfficeEventType = "agent" | "approvals" | "step" | "log";

export interface StoredEvent {
  id: number;
  orgId: string | null;
  agentId: string;
  type: OfficeEventType;
  payload: Record<string, unknown>;
}

/** Append to the feed. `agent` events carry no payload: rooms are rebuilt per viewer org. */
export async function appendEvent(event: {
  orgId: string | null;
  agentId: string;
  type: OfficeEventType;
  payload?: Record<string, unknown>;
}): Promise<void> {
  await db.insert(agentOfficeEvents).values({
    orgId: event.orgId,
    agentId: event.agentId,
    type: event.type,
    payload: event.payload ?? {},
  });
}

export async function latestEventId(): Promise<number> {
  const [row] = await db.select({ id: sql<number>`coalesce(max(${agentOfficeEvents.id}), 0)::bigint` }).from(agentOfficeEvents);
  return Number(row?.id ?? 0);
}

async function eventsAfter(cursor: number, orgId: string | null, limit = 500): Promise<StoredEvent[]> {
  const rows = await db
    .select()
    .from(agentOfficeEvents)
    .where(
      and(
        gt(agentOfficeEvents.id, cursor),
        orgId === null ? undefined : or(isNull(agentOfficeEvents.orgId), eq(agentOfficeEvents.orgId, orgId)),
      ),
    )
    .orderBy(asc(agentOfficeEvents.id))
    .limit(limit);
  return rows.map((row) => ({
    id: Number(row.id),
    orgId: row.orgId,
    agentId: row.agentId,
    type: row.type as OfficeEventType,
    payload: row.payload,
  }));
}

/**
 * Turn stored rows into wire events for one org. Room and approval changes are
 * coalesced per batch: the client only ever needs the latest state.
 */
export async function materialize(orgId: string, rows: readonly StoredEvent[]): Promise<Array<{ id: number; event: AgentOfficeEvent }>> {
  const out: Array<{ id: number; event: AgentOfficeEvent }> = [];
  const changedAgents = new Map<AgentId, number>();
  let approvalsId = 0;
  for (const row of rows) {
    if (row.orgId !== null && row.orgId !== orgId) continue;
    if (row.type === "agent" && isAgentId(row.agentId)) changedAgents.set(row.agentId, row.id);
    else if (row.type === "approvals") approvalsId = row.id;
    else if (row.type === "step" && row.payload.step) out.push({ id: row.id, event: { type: "step", agentId: row.agentId as AgentId, step: row.payload.step as never } });
    else if (row.type === "log" && row.payload.line) out.push({ id: row.id, event: { type: "log", line: row.payload.line as never } });
  }
  if (changedAgents.size > 0) {
    const rooms = await buildRooms(orgId, [...changedAgents.keys()]);
    for (const room of rooms) out.push({ id: changedAgents.get(room.id)!, event: { type: "agent", agent: room } });
  }
  if (approvalsId) out.push({ id: approvalsId, event: { type: "approvals", approvals: await approvalDesk(orgId) } });
  return out.sort((a, b) => a.id - b.id);
}

export interface Subscriber {
  orgId: string;
  userId: string;
  /** Last event id this subscriber has seen. */
  cursor: number;
  send: (id: number, event: AgentOfficeEvent) => void;
}

export const MAX_STREAMS_PER_USER = 3;
export const MAX_STREAMS_TOTAL = 200;

/**
 * One poller per process. A subscriber that joins with an old cursor is
 * caught up on its own first, then follows the shared cursor.
 */
export class OfficeBroadcaster {
  private readonly subscribers = new Set<Subscriber>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private cursor = 0;
  private polling = false;
  private readonly intervalMs: number;

  constructor(intervalMs = 1_000) {
    this.intervalMs = intervalMs;
  }

  count(userId?: string): number {
    if (!userId) return this.subscribers.size;
    let n = 0;
    for (const subscriber of this.subscribers) if (subscriber.userId === userId) n += 1;
    return n;
  }

  async add(subscriber: Subscriber): Promise<void> {
    if (this.subscribers.size === 0) {
      this.cursor = await latestEventId();
      this.timer = setInterval(() => void this.poll(), this.intervalMs);
      this.timer.unref?.();
    }
    // Catch a reconnecting client up to the shared cursor before it joins.
    if (subscriber.cursor < this.cursor) {
      const backlog = await eventsAfter(subscriber.cursor, subscriber.orgId, 1_000);
      const caughtUp = backlog.filter((row) => row.id <= this.cursor);
      for (const { id, event } of await materialize(subscriber.orgId, caughtUp)) subscriber.send(id, event);
    }
    subscriber.cursor = Math.max(subscriber.cursor, this.cursor);
    this.subscribers.add(subscriber);
  }

  remove(subscriber: Subscriber): void {
    this.subscribers.delete(subscriber);
    if (this.subscribers.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  stop(): void {
    this.subscribers.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One read for everyone, then one materialization per org. */
  async poll(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const rows = await eventsAfter(this.cursor, null);
      if (rows.length === 0) return;
      this.cursor = rows.at(-1)!.id;
      const orgs = new Set([...this.subscribers].map((subscriber) => subscriber.orgId));
      for (const orgId of orgs) {
        const events = await materialize(orgId, rows);
        for (const subscriber of this.subscribers) {
          if (subscriber.orgId !== orgId) continue;
          for (const { id, event } of events) if (id > subscriber.cursor) subscriber.send(id, event);
          subscriber.cursor = this.cursor;
        }
      }
    } catch {
      // A failed poll is retried on the next tick; clients keep their cursor.
    } finally {
      this.polling = false;
    }
  }
}

export const officeBroadcaster = new OfficeBroadcaster();
