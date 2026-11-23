import assert from "node:assert/strict";
import test from "node:test";
import { AGENT_RUN_TASKS } from "../src/agent.ts";
import { AGENT_SCOPES, hasAgentScope, isAgentClaims } from "../src/auth.ts";
import { dispatchSuggestionWriteSchema } from "../src/dispatch.ts";

const jobId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";
const technicianId = "33333333-3333-4333-8333-333333333333";

test("dispatch agent uses narrow scopes and a dedicated run task", () => {
  assert.equal(AGENT_SCOPES.jobsRead, "jobs:read");
  assert.equal(AGENT_SCOPES.techniciansRead, "technicians:read");
  assert.equal(AGENT_SCOPES.dispatchSuggestionsCreate, "dispatch-suggestions:create");
  assert.ok(AGENT_RUN_TASKS.includes("agent.dispatch"));

  const claims = {
    aud: "agent",
    agentId: "dispatch-agent",
    orgId: "44444444-4444-4444-8444-444444444444",
    scope: AGENT_SCOPES.jobsRead,
    scopes: [AGENT_SCOPES.jobsRead, AGENT_SCOPES.techniciansRead, AGENT_SCOPES.dispatchSuggestionsCreate],
  };
  assert.ok(isAgentClaims(claims));
  assert.ok(hasAgentScope(claims, AGENT_SCOPES.dispatchSuggestionsCreate));
});

test("dispatch suggestion write rejects unranked candidates", () => {
  const base = { jobId, runId, fingerprint: "abc12345", causes: [], confidence: 0.8 };
  assert.equal(
    dispatchSuggestionWriteSchema.safeParse({
      ...base,
      candidates: [{ technicianId, name: "A", rank: 2, score: 10, confidence: 0.8, factors: [], reasons: [], reasonSource: "fallback" }],
    }).success,
    false,
  );
});
