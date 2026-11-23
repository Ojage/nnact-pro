import assert from "node:assert/strict";
import test from "node:test";
import type { AgentOfficeOverviewDTO, AgentRoomDTO, AgentRunDetailDTO } from "@nnact/shared";
import { appendCapped, applyOverviewBatch, applyRunUpdates, createOverviewBuffer } from "./buffer";

function room(id: string, overrides: Partial<AgentRoomDTO> = {}): AgentRoomDTO {
  return {
    id: id as AgentRoomDTO["id"],
    displayName: id,
    tier: "T1",
    stage: "live",
    status: "idle",
    enabled: true,
    current: null,
    queueDepth: 0,
    costTodayCents: 0,
    costCapCents: 200,
    activity: [],
    runsToday: 0,
    errorsToday: 0,
    lastSeenAt: null,
    version: null,
    ...overrides,
  };
}

test("several updates for one agent collapse to the latest", () => {
  const buffer = createOverviewBuffer();
  buffer.push({ type: "agent", agent: room("intake-agent", { queueDepth: 1 }) });
  buffer.push({ type: "agent", agent: room("intake-agent", { queueDepth: 4 }) });
  buffer.push({ type: "log", line: { id: "1", agentId: "intake-agent", runId: null, at: "2026-11-23T00:00:00Z", level: "info", message: "x" } });
  const batch = buffer.drain();
  assert.equal(batch?.agents.length, 1);
  assert.equal(batch?.agents[0].queueDepth, 4);
  assert.equal(buffer.drain(), null);
});

test("a batch replaces only the changed room and recomputes total cost", () => {
  const untouched = room("quoting-agent", { costTodayCents: 30 });
  const overview: AgentOfficeOverviewDTO = {
    generatedAt: "2026-11-23T00:00:00Z",
    agents: [room("intake-agent", { costTodayCents: 10 }), untouched],
    approvals: { draftJobs: 0, quoteProposals: 0, dispatchSuggestions: 0 },
    costTodayCents: 40,
  };
  applyOverviewBatch(overview, {
    agents: [room("intake-agent", { costTodayCents: 25, status: "working" })],
    approvals: { draftJobs: 2, quoteProposals: 1, dispatchSuggestions: 0 },
  });
  assert.equal(overview.agents[0].status, "working");
  assert.equal(overview.agents[1], untouched);
  assert.equal(overview.costTodayCents, 55);
  assert.equal(overview.approvals.draftJobs, 2);
});

test("log lists keep only the newest entries", () => {
  const list = [1, 2, 3];
  appendCapped(list, [4, 5], 4);
  assert.deepEqual(list, [2, 3, 4, 5]);
});

test("run updates upsert steps and skip duplicate log lines", () => {
  const run: AgentRunDetailDTO = {
    id: "run-1",
    agentId: "intake-agent",
    task: "agent.extract",
    state: "running",
    outcome: null,
    startedAt: "2026-11-23T00:00:00Z",
    finishedAt: null,
    latencyMs: null,
    costCents: null,
    inputTokens: null,
    outputTokens: null,
    error: null,
    retryable: false,
    steps: [{ id: "s1", runId: "run-1", name: "extract", label: "Extract", status: "running", startedAt: null, finishedAt: null, summary: null }],
    logs: [{ id: "l1", agentId: "intake-agent", runId: "run-1", at: "2026-11-23T00:00:00Z", level: "info", message: "start" }],
  };
  applyRunUpdates(
    run,
    [
      { ...run.steps[0], status: "completed" },
      { id: "s2", runId: "run-1", name: "save", label: "Save draft", status: "running", startedAt: null, finishedAt: null, summary: null },
    ],
    [run.logs[0], { ...run.logs[0], id: "l2", message: "saved" }],
  );
  assert.deepEqual(run.steps.map((step) => `${step.id}:${step.status}`), ["s1:completed", "s2:running"]);
  assert.deepEqual(run.logs.map((line) => line.id), ["l1", "l2"]);
});
