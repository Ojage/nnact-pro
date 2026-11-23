import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_ID } from "@nnact/shared";
import { createAgentLoop, createInMemoryAgentLeaseStore, createAgentKillSwitches } from "../src/index.ts";

const orgId = "org-1";
const leaseKey = "message-1";

function setup(overrides: { maxAttempts?: number } = {}) {
  let clock = 1_000_000;
  const store = createInMemoryAgentLeaseStore();
  return {
    store,
    now: () => new Date(clock),
    advance(ms: number) {
      clock += ms;
    },
    async enqueue(maxAttempts = 3) {
      await store.enqueue({
        agentId: AGENT_ID.intake,
        orgId,
        leaseKey,
        task: "agent.extract",
        maxAttempts: overrides.maxAttempts ?? maxAttempts,
        nextAttemptAt: new Date(0),
      });
    },
  };
}

test("failed work retries with exponential backoff then completes", async () => {
  const fixture = setup();
  await fixture.enqueue();
  const delays: number[] = [];
  const retry = fixture.store.retry.bind(fixture.store);
  fixture.store.retry = async (input) => {
    delays.push(input.delayMs);
    return retry(input);
  };

  let calls = 0;
  const loop = createAgentLoop({
    agentId: AGENT_ID.intake,
    store: fixture.store,
    now: fixture.now,
    maxAttempts: 3,
    baseDelayMs: 100,
    maxDelayMs: 1_000,
    work: async () => {
      calls += 1;
      if (calls < 3) throw new Error("transient");
      return { model: "gpt-4o", costCents: 2 };
    },
  });

  const first = await loop.tick();
  assert.equal(first.retried, 1);
  assert.equal(calls, 1);
  assert.deepEqual(delays, [100]);

  fixture.advance(100);
  const second = await loop.tick();
  assert.equal(second.retried, 1);
  assert.deepEqual(delays, [100, 200]);

  fixture.advance(200);
  const third = await loop.tick();
  assert.equal(third.completed, 1);
  assert.equal(calls, 3);
  assert.equal((await fixture.store.get(AGENT_ID.intake, leaseKey))?.state, "completed");
});

test("work dead-letters after max attempts", async () => {
  const fixture = setup();
  await fixture.enqueue(2);
  let calls = 0;
  const loop = createAgentLoop({
    agentId: AGENT_ID.intake,
    store: fixture.store,
    now: fixture.now,
    maxAttempts: 2,
    baseDelayMs: 50,
    work: async () => {
      calls += 1;
      throw new Error("permanent");
    },
  });

  const first = await loop.tick();
  assert.equal(first.retried, 1);
  fixture.advance(50);
  const second = await loop.tick();

  assert.equal(calls, 2);
  assert.equal(second.deadLettered, 1);
  assert.equal((await fixture.store.get(AGENT_ID.intake, leaseKey))?.state, "dead");
  const letters = await fixture.store.listDeadLetters();
  assert.equal(letters.length, 1);
  assert.equal(letters[0].attempts, 2);
  assert.equal(letters[0].error, "permanent");
  assert.equal((await loop.tick()).acquired, 0);
});

test("no overlapping work for the same lease across concurrent ticks and loops", async () => {
  const fixture = setup();
  await fixture.enqueue();
  let releaseWork!: () => void;
  let workStarted!: () => void;
  const gate = new Promise<void>((resolve) => { releaseWork = resolve; });
  const started = new Promise<void>((resolve) => { workStarted = resolve; });
  let calls = 0;

  const loop = createAgentLoop({
    agentId: AGENT_ID.intake,
    store: fixture.store,
    now: fixture.now,
    work: async () => {
      calls += 1;
      workStarted();
      await gate;
      return {};
    },
  });
  const other = createAgentLoop({
    agentId: AGENT_ID.intake,
    store: fixture.store,
    now: fixture.now,
    work: async () => {
      calls += 1;
      return {};
    },
  });

  const first = loop.tick();
  await started;
  const sameLoop = await loop.tick();
  const otherLoop = await other.tick();
  assert.equal(calls, 1);
  assert.equal(sameLoop.acquired, 0);
  assert.equal(otherLoop.acquired, 0);

  releaseWork();
  const summary = await first;
  assert.equal(summary.completed, 1);
  assert.equal(calls, 1);
});

test("kill switch skips all work while the agent is disabled", async () => {
  const fixture = setup();
  await fixture.enqueue();
  let calls = 0;
  const killSwitch = createAgentKillSwitches({ env: { AGENTS_INTAKE_ENABLED: "false" } });
  const loop = createAgentLoop({
    agentId: AGENT_ID.intake,
    store: fixture.store,
    now: fixture.now,
    killSwitch,
    work: async () => {
      calls += 1;
      return {};
    },
  });

  const summary = await loop.tick();
  assert.equal(summary.due, 0);
  assert.equal(summary.acquired, 0);
  assert.equal(calls, 0);
  assert.equal((await fixture.store.get(AGENT_ID.intake, leaseKey))?.state, "pending");
});

test("start and stop control the poll loop", async () => {
  const fixture = setup();
  await fixture.enqueue();
  let calls = 0;
  const loop = createAgentLoop({
    agentId: AGENT_ID.intake,
    store: fixture.store,
    now: fixture.now,
    pollIntervalMs: 10,
    work: async () => {
      calls += 1;
      return {};
    },
  });

  assert.equal(loop.running, false);
  loop.start();
  assert.equal(loop.running, true);
  const deadline = Date.now() + 1_000;
  while (calls === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(calls > 0);

  loop.stop();
  assert.equal(loop.running, false);
  const atStop = calls;
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(calls, atStop);
});
