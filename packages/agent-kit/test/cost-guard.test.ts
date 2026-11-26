import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_ID, AGENT_REGISTRY } from "@nnact/shared";
import {
  agentCostCapEnv,
  createAgentCostGuard,
  createAgentLoop,
  createInMemoryAgentLeaseStore,
  createStructuredAgentLogger,
  parseCostCap,
  type AgentRunLogEvent,
} from "../src/index.ts";

const orgId = "org-1";
const leaseKey = "message-1";
const capEnv = agentCostCapEnv(AGENT_ID.intake);

test("cost cap is read from the registry env name and allows spend below it", async () => {
  assert.equal(capEnv, AGENT_REGISTRY[AGENT_ID.intake].costCapEnv);
  const guard = createAgentCostGuard({
    env: { [capEnv]: "200" },
    getSpendCents: async () => 199,
  });

  assert.deepEqual(await guard.check({ agentId: AGENT_ID.intake, orgId }), {
    allowed: true,
    spendCents: 199,
    capCents: 200,
    reason: null,
  });
});

test("missing or invalid caps fail closed", async () => {
  assert.equal(parseCostCap(undefined), null);
  assert.equal(parseCostCap(""), null);
  assert.equal(parseCostCap("abc"), null);
  assert.equal(parseCostCap("-5"), null);
  assert.equal(parseCostCap("1.5"), null);
  assert.equal(parseCostCap("50"), 50);
  assert.equal(parseCostCap(" 0 "), 0);

  for (const env of [{}, { [capEnv]: "not-a-number" }, { [capEnv]: "-1" }]) {
    const guard = createAgentCostGuard({ env, getSpendCents: async () => 0 });
    const decision = await guard.check({ agentId: AGENT_ID.intake, orgId });
    assert.equal(decision.allowed, false);
    assert.equal(decision.capCents, null);
    assert.equal(decision.reason, "invalid cost cap");
  }
});

test("cap threshold, invalid spend, and spend errors deny the run", async () => {
  const over = createAgentCostGuard({ env: { [capEnv]: "200" }, getSpendCents: async () => 200 });
  assert.deepEqual(await over.check({ agentId: AGENT_ID.intake, orgId }), {
    allowed: false,
    spendCents: 200,
    capCents: 200,
    reason: "cost cap exceeded",
  });

  const invalid = createAgentCostGuard({ env: { [capEnv]: "200" }, getSpendCents: async () => Number.NaN });
  assert.equal((await invalid.check({ agentId: AGENT_ID.intake, orgId })).allowed, false);

  const failing = createAgentCostGuard({
    env: { [capEnv]: "200" },
    getSpendCents: async () => { throw new Error("db down"); },
  });
  const denial = await failing.check({ agentId: AGENT_ID.intake, orgId });
  assert.equal(denial.allowed, false);
  assert.equal(denial.reason, "spend check failed: db down");
});

test("loop denies work when the cost cap is reached and logs the denial", async () => {
  const store = createInMemoryAgentLeaseStore();
  await store.enqueue({ agentId: AGENT_ID.intake, orgId, leaseKey, task: "agent.extract" });
  const events: AgentRunLogEvent[] = [];
  let calls = 0;
  const loop = createAgentLoop({
    agentId: AGENT_ID.intake,
    store,
    logger: createStructuredAgentLogger((event) => { events.push(event); }),
    costGuard: createAgentCostGuard({
      env: { [capEnv]: "200" },
      getSpendCents: async () => 250,
    }),
    work: async () => {
      calls += 1;
      return {};
    },
  });

  const summary = await loop.tick();
  assert.equal(summary.denied, 1);
  assert.equal(summary.acquired, 1);
  assert.equal(summary.completed, 0);
  assert.equal(calls, 0);
  assert.equal((await store.get(AGENT_ID.intake, leaseKey))?.state, "pending");
  assert.equal(events.length, 2);
  assert.equal(events[1].outcome, "cost_cap_denied");
  assert.equal(events[1].error, "cost cap exceeded");
});
