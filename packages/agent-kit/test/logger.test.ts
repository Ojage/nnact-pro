import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_ID } from "@nnact/shared";
import {
  createAgentLoop,
  createInMemoryAgentLeaseStore,
  createStructuredAgentLogger,
  type AgentRunLogEvent,
} from "../src/index.ts";

const orgId = "org-1";
const leaseKey = "message-1";

test("structured logger records all run fields on start and finish", async () => {
  const events: AgentRunLogEvent[] = [];
  const logger = createStructuredAgentLogger(
    (event) => { events.push(event); },
    () => new Date("2026-01-01T00:00:00.000Z"),
  );

  await logger.start({ agentId: AGENT_ID.intake, orgId, task: "agent.extract", leaseId: "lease-1", attempt: 1 });
  await logger.finish({
    agentId: AGENT_ID.intake,
    orgId,
    task: "agent.extract",
    promptVersion: "v3",
    model: "gpt-4o",
    inputTokens: 120,
    outputTokens: 34,
    costCents: 7,
    outcome: "success",
    error: null,
    latencyMs: 456,
    leaseId: "lease-1",
    attempt: 1,
  });

  assert.equal(events.length, 2);
  assert.equal(events[0].event, "agent.run.start");
  assert.equal(events[1].event, "agent.run.finish");
  assert.equal(events[0].timestamp, "2026-01-01T00:00:00.000Z");

  const finish = events[1];
  assert.equal(finish.agentId, AGENT_ID.intake);
  assert.equal(finish.orgId, orgId);
  assert.equal(finish.task, "agent.extract");
  assert.equal(finish.promptVersion, "v3");
  assert.equal(finish.model, "gpt-4o");
  assert.equal(finish.inputTokens, 120);
  assert.equal(finish.outputTokens, 34);
  assert.equal(finish.costCents, 7);
  assert.equal(finish.outcome, "success");
  assert.equal(finish.error, null);
  assert.equal(finish.latencyMs, 456);
  assert.equal(finish.leaseId, "lease-1");
  assert.equal(finish.attempt, 1);

  for (const key of Object.keys(finish)) assert.ok(finish[key as keyof AgentRunLogEvent] !== undefined);
});

test("loop emits start and finish events with work metadata", async () => {
  const events: AgentRunLogEvent[] = [];
  const store = createInMemoryAgentLeaseStore();
  await store.enqueue({ agentId: AGENT_ID.quoting, orgId, leaseKey, task: "agent.quote", nextAttemptAt: new Date(0) });
  const clock = () => new Date("2026-02-01T00:00:00.000Z");
  const logger = createStructuredAgentLogger((event) => { events.push(event); }, clock);
  const loop = createAgentLoop({
    agentId: AGENT_ID.quoting,
    store,
    now: clock,
    logger,
    work: async () => ({
      model: "claude-3",
      promptVersion: "quote-v2",
      inputTokens: 42,
      outputTokens: 11,
      costCents: 5,
    }),
  });

  const summary = await loop.tick();
  assert.equal(summary.completed, 1);
  assert.equal(events.length, 2);
  assert.equal(events[0].event, "agent.run.start");
  assert.equal(events[0].agentId, AGENT_ID.quoting);
  assert.equal(events[0].orgId, orgId);
  assert.equal(events[0].task, "agent.quote");
  assert.equal(events[0].latencyMs, null);

  const finish = events[1];
  assert.equal(finish.event, "agent.run.finish");
  assert.equal(finish.outcome, "success");
  assert.equal(finish.model, "claude-3");
  assert.equal(finish.promptVersion, "quote-v2");
  assert.equal(finish.inputTokens, 42);
  assert.equal(finish.outputTokens, 11);
  assert.equal(finish.costCents, 5);
  assert.equal(finish.latencyMs, 0);
  assert.ok(finish.leaseId);
});
