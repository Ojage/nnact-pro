import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_HEARTBEAT_OFFLINE_MS,
  approvalRate,
  costRatio,
  deriveAgentAlerts,
  deriveAgentStatus,
  describeCurrentTask,
  parseAgentOfficeEvent,
} from "../src/agent-office.ts";

const now = Date.parse("2026-11-23T12:00:00Z");
const secondsAgo = (s) => new Date(now - s * 1000).toISOString();

function room(overrides = {}) {
  return {
    id: "intake-agent",
    displayName: "Intake agent",
    tier: "T3",
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
    lastSeenAt: secondsAgo(5),
    version: "1.0.0",
    ...overrides,
  };
}

test("paused wins over any heartbeat", () => {
  assert.equal(deriveAgentStatus({ enabled: false, heartbeat: { status: "working", lastSeenAt: secondsAgo(1) }, now }), "paused");
  assert.equal(deriveAgentStatus({ enabled: false, heartbeat: null, now }), "paused");
});

test("no heartbeat or a stale one is offline", () => {
  assert.equal(deriveAgentStatus({ enabled: true, heartbeat: null, now }), "offline");
  const stale = secondsAgo(AGENT_HEARTBEAT_OFFLINE_MS / 1000 + 1);
  assert.equal(deriveAgentStatus({ enabled: true, heartbeat: { status: "working", lastSeenAt: stale }, now }), "offline");
  assert.equal(deriveAgentStatus({ enabled: true, heartbeat: { status: "idle", lastSeenAt: "not a date" }, now }), "offline");
});

test("a fresh heartbeat is trusted as reported", () => {
  for (const status of ["working", "idle", "waiting", "error"]) {
    assert.equal(deriveAgentStatus({ enabled: true, heartbeat: { status, lastSeenAt: secondsAgo(10) }, now }), status);
  }
});

test("current task reads as a plain sentence with its step", () => {
  const task = { runId: "r1", task: "agent.extract", label: "Drafting job from WhatsApp", stepName: "extract", stepIndex: 2, stepCount: 4, startedAt: secondsAgo(3) };
  assert.equal(describeCurrentTask(task), "Drafting job from WhatsApp, step 2 of 4");
  assert.equal(describeCurrentTask({ ...task, stepIndex: 0, stepCount: 0 }), "Drafting job from WhatsApp");
  assert.equal(describeCurrentTask(null), null);
});

test("cost ratio and approval rate handle empty inputs", () => {
  assert.equal(costRatio(50, 200), 0.25);
  assert.equal(costRatio(50, null), null);
  assert.equal(costRatio(1, 0), 1);
  assert.equal(approvalRate({ accepted: 0, edited: 0, rejected: 0 }), null);
  assert.equal(approvalRate({ accepted: 2, edited: 1, rejected: 1 }), 0.75);
});

test("alerts cover errors, offline, stalls and caps, critical first", () => {
  const alerts = deriveAgentAlerts(
    [
      room({ id: "intake-agent", status: "offline" }),
      room({ id: "quoting-agent", displayName: "Quoting agent", status: "error", costTodayCents: 170 }),
      room({
        id: "dispatch-agent",
        status: "working",
        current: { runId: "r9", task: "agent.dispatch", label: "Ranking", stepName: null, stepIndex: 1, stepCount: 3, startedAt: secondsAgo(3600) },
        costTodayCents: 250,
      }),
    ],
    now,
  );
  assert.deepEqual(
    alerts.map((alert) => `${alert.severity}:${alert.kind}:${alert.agentId}`),
    [
      "critical:error:quoting-agent",
      "critical:cap:dispatch-agent",
      "warning:offline:intake-agent",
      "warning:cap:quoting-agent",
      "warning:stalled:dispatch-agent",
    ],
  );
});

test("planned and paused offices raise no offline alert", () => {
  assert.deepEqual(deriveAgentAlerts([room({ stage: "planned", status: "offline" })], now), []);
  assert.deepEqual(deriveAgentAlerts([room({ status: "paused", enabled: false })], now), []);
});

test("stream events are validated and malformed ones dropped", () => {
  const event = parseAgentOfficeEvent(JSON.stringify({ type: "agent", agent: room() }));
  assert.equal(event?.type, "agent");
  assert.equal(parseAgentOfficeEvent("{not json"), null);
  assert.equal(parseAgentOfficeEvent(JSON.stringify({ type: "agent", agent: { id: "x" } })), null);
  assert.equal(parseAgentOfficeEvent(JSON.stringify({ type: "unknown" })), null);
  const log = parseAgentOfficeEvent(
    JSON.stringify({ type: "log", line: { id: "1", agentId: "intake-agent", runId: null, at: secondsAgo(1), level: "warn", message: "slow provider" } }),
  );
  assert.equal(log?.type === "log" && log.line.level, "warn");
});
