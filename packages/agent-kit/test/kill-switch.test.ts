import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_ID, AGENT_REGISTRY } from "@nnact/shared";
import {
  agentFlagEnvKey,
  createAgentEnabledCheck,
  createAgentKillSwitches,
  createAgentLoop,
  createInMemoryAgentLeaseStore,
  parseAgentFlag,
} from "../src/index.ts";

test("flag env keys come from registry featureFlagKey names", () => {
  assert.equal(agentFlagEnvKey(AGENT_ID.intake), "AGENTS_INTAKE_ENABLED");
  assert.equal(agentFlagEnvKey(AGENT_ID.quoting), "AGENTS_QUOTING_ENABLED");
  assert.equal(agentFlagEnvKey(AGENT_ID.dispatch), "AGENTS_DISPATCH_ENABLED");
  for (const id of Object.keys(AGENT_REGISTRY) as (keyof typeof AGENT_REGISTRY)[]) {
    assert.match(agentFlagEnvKey(AGENT_REGISTRY[id].id), /^AGENTS_[A-Z]+_ENABLED$/);
  }
});

test("agents default to enabled and env can disable one agent", async () => {
  const killSwitch = createAgentKillSwitches({ env: { AGENTS_INTAKE_ENABLED: "false" } });
  assert.equal(await killSwitch(AGENT_ID.intake), true);
  assert.equal(await killSwitch(AGENT_ID.quoting), false);

  const enabled = createAgentEnabledCheck({ env: { AGENTS_QUOTING_ENABLED: "0" } });
  assert.equal(await enabled(AGENT_ID.quoting), false);
  assert.equal(await enabled(AGENT_ID.intake), true);

  const scoped = createAgentKillSwitches({
    env: {},
    enabledByDefault: [AGENT_ID.intake],
  });
  assert.equal(await scoped(AGENT_ID.intake), false);
  assert.equal(await scoped(AGENT_ID.quoting), true);
});

test("flag parsing only treats explicit false values as disabled", () => {
  assert.equal(parseAgentFlag(undefined, true), true);
  assert.equal(parseAgentFlag("false", true), false);
  assert.equal(parseAgentFlag("OFF", true), false);
  assert.equal(parseAgentFlag("0", true), false);
  assert.equal(parseAgentFlag("true", false), true);
  assert.equal(parseAgentFlag("1", false), true);
  assert.equal(parseAgentFlag("unexpected", true), true);
});

test("loop runs for an enabled agent but not for a disabled one", async () => {
  const store = createInMemoryAgentLeaseStore();
  await store.enqueue({ agentId: AGENT_ID.intake, orgId: "org-1", leaseKey: "a", task: "agent.extract" });
  await store.enqueue({ agentId: AGENT_ID.quoting, orgId: "org-1", leaseKey: "b", task: "agent.quote" });
  const killSwitch = createAgentKillSwitches({ env: { AGENTS_QUOTING_ENABLED: "false" } });
  const calls: string[] = [];
  const work = async (context: { agentId: string }) => {
    calls.push(context.agentId);
    return {};
  };

  const intake = createAgentLoop({
    agentId: AGENT_ID.intake,
    store,
    killSwitch,
    work: async () => work({ agentId: AGENT_ID.intake }),
  });
  const quoting = createAgentLoop({
    agentId: AGENT_ID.quoting,
    store,
    killSwitch,
    work: async () => work({ agentId: AGENT_ID.quoting }),
  });

  assert.equal((await intake.tick()).completed, 1);
  assert.equal((await quoting.tick()).acquired, 0);
  assert.deepEqual(calls, [AGENT_ID.intake]);
  assert.equal((await store.get(AGENT_ID.intake, "a"))?.state, "completed");
  assert.equal((await store.get(AGENT_ID.quoting, "b"))?.state, "pending");
});
