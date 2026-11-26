import type {
  AgentApprovalDeskDTO,
  AgentLogLineDTO,
  AgentOfficeEvent,
  AgentOfficeOverviewDTO,
  AgentRoomDTO,
  AgentRunDetailDTO,
  AgentRunStepDTO,
} from "@nnact/shared";

/** Upper bound on log lines kept in memory per view. */
export const MAX_LOG_LINES = 1_000;

export interface OverviewBatch {
  agents: AgentRoomDTO[];
  approvals: AgentApprovalDeskDTO | null;
}

/**
 * Collects streamed room updates between flushes. Several updates for the same
 * agent within one window collapse to the latest, so each flush touches every
 * changed room exactly once and leaves the others untouched.
 */
export function createOverviewBuffer() {
  const agents = new Map<string, AgentRoomDTO>();
  let approvals: AgentApprovalDeskDTO | null = null;
  return {
    push(event: AgentOfficeEvent): boolean {
      if (event.type === "agent") {
        agents.set(event.agent.id, event.agent);
        return true;
      }
      if (event.type === "approvals") {
        approvals = event.approvals;
        return true;
      }
      return false;
    },
    drain(): OverviewBatch | null {
      if (agents.size === 0 && approvals === null) return null;
      const batch = { agents: [...agents.values()], approvals };
      agents.clear();
      approvals = null;
      return batch;
    },
  };
}

/** Apply a batch to an Immer draft: replace only the rooms that changed. */
export function applyOverviewBatch(draft: AgentOfficeOverviewDTO, batch: OverviewBatch): void {
  for (const agent of batch.agents) {
    const index = draft.agents.findIndex((room) => room.id === agent.id);
    if (index >= 0) draft.agents[index] = agent;
    else draft.agents.push(agent);
  }
  if (batch.approvals) draft.approvals = batch.approvals;
  draft.costTodayCents = draft.agents.reduce((sum, room) => sum + room.costTodayCents, 0);
}

/** Collects log lines and run steps that belong to one agent or one run. */
export function createLineBuffer<T>() {
  let items: T[] = [];
  return {
    push(item: T) {
      items.push(item);
    },
    drain(): T[] {
      const drained = items;
      items = [];
      return drained;
    },
  };
}

/** Append to a list and drop the oldest entries past `max` (mutates; safe on drafts). */
export function appendCapped<T>(list: T[], items: readonly T[], max = MAX_LOG_LINES): void {
  if (items.length === 0) return;
  list.push(...items);
  if (list.length > max) list.splice(0, list.length - max);
}

/** Merge streamed steps and log lines into a run detail draft. */
export function applyRunUpdates(
  draft: AgentRunDetailDTO,
  steps: readonly AgentRunStepDTO[],
  logs: readonly AgentLogLineDTO[],
): void {
  for (const step of steps) {
    const index = draft.steps.findIndex((existing) => existing.id === step.id);
    if (index >= 0) draft.steps[index] = step;
    else draft.steps.push(step);
  }
  const seen = new Set(draft.logs.map((line) => line.id));
  appendCapped(
    draft.logs,
    logs.filter((line) => !seen.has(line.id)),
  );
}

/** Run `flush` at most once per `intervalMs`. Returns a stop function. */
export function startThrottledFlush(flush: () => void, intervalMs: number): () => void {
  const timer = setInterval(flush, intervalMs);
  return () => {
    clearInterval(timer);
    flush();
  };
}
