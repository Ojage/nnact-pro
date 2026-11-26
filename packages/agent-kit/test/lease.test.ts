import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_ID } from "@nnact/shared";
import { createInMemoryAgentLeaseStore } from "../src/index.ts";

const orgId = "org-1";
const leaseKey = "message-1";

test("lease acquisition is exclusive per agent and lease key", async () => {
  const store = createInMemoryAgentLeaseStore();
  await store.enqueue({ agentId: AGENT_ID.intake, orgId, leaseKey, task: "agent.extract" });

  const [first, second] = await Promise.all([
    store.acquire({ agentId: AGENT_ID.intake, leaseKey, ttlMs: 5_000 }),
    store.acquire({ agentId: AGENT_ID.intake, leaseKey, ttlMs: 5_000 }),
  ]);

  assert.ok(first);
  assert.equal(first.attempts, 1);
  assert.equal(first.state, "leased");
  assert.equal(second, null);
  assert.equal((await store.get(AGENT_ID.intake, leaseKey))?.state, "leased");

  const otherAgent = await store.acquire({ agentId: AGENT_ID.quoting, leaseKey, ttlMs: 5_000 });
  assert.equal(otherAgent, null);

  await store.enqueue({ agentId: AGENT_ID.quoting, orgId, leaseKey, task: "agent.quote" });
  const granted = await store.acquire({ agentId: AGENT_ID.quoting, leaseKey, ttlMs: 5_000 });
  assert.ok(granted);
});

test("lease renew extends expiry and release prevents reacquisition", async () => {
  const store = createInMemoryAgentLeaseStore();
  await store.enqueue({ agentId: AGENT_ID.intake, orgId, leaseKey, task: "agent.extract", nextAttemptAt: new Date(0) });
  const lease = await store.acquire({ agentId: AGENT_ID.intake, leaseKey, ttlMs: 2_000, now: new Date(10_000) });
  assert.ok(lease);

  const renewed = await store.renew({ lease, ttlMs: 4_000, now: new Date(11_000) });
  assert.ok(renewed);
  assert.equal(Date.parse(renewed.expiresAt ?? ""), 15_000);
  assert.equal(await store.acquire({ agentId: AGENT_ID.intake, leaseKey, ttlMs: 1_000, now: new Date(12_000) }), null);

  const released = await store.release({ lease, now: new Date(13_000) });
  assert.equal(released.state, "completed");
  assert.equal(released.completedAt, new Date(13_000).toISOString());
  assert.equal(await store.acquire({ agentId: AGENT_ID.intake, leaseKey, ttlMs: 1_000, now: new Date(14_000) }), null);
});

test("retry defers a leased item and dead letter records terminal failure", async () => {
  const store = createInMemoryAgentLeaseStore();
  await store.enqueue({
    agentId: AGENT_ID.intake,
    orgId,
    leaseKey,
    task: "agent.extract",
    payload: { n: 1 },
    nextAttemptAt: new Date(0),
  });
  const lease = await store.acquire({ agentId: AGENT_ID.intake, leaseKey, ttlMs: 1_000, now: new Date(20_000) });
  assert.ok(lease);

  const retried = await store.retry({ lease, error: "transient", delayMs: 250, now: new Date(20_000) });
  assert.equal(retried.state, "pending");
  assert.equal(Date.parse(retried.nextAttemptAt), 20_250);
  assert.equal(await store.acquire({ agentId: AGENT_ID.intake, leaseKey, ttlMs: 1_000, now: new Date(20_100) }), null);

  const reacquired = await store.acquire({ agentId: AGENT_ID.intake, leaseKey, ttlMs: 1_000, now: new Date(20_250) });
  assert.ok(reacquired);
  assert.equal(reacquired.attempts, 2);

  const letter = await store.deadLetter({ lease: reacquired, error: "permanent", now: new Date(21_000) });
  assert.equal(letter.attempts, 2);
  assert.equal(letter.error, "permanent");
  assert.deepEqual(letter.payload, { n: 1 });
  assert.equal((await store.get(AGENT_ID.intake, leaseKey))?.state, "dead");
  assert.deepEqual((await store.listDeadLetters()).map((item) => item.leaseId), [reacquired.id]);
});
