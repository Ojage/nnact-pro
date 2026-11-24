import assert from "node:assert/strict";
import test from "node:test";
import {
  AGENT_AUTONOMY_TIERS,
  AGENT_ID,
  AGENT_IDS,
  AGENT_REGISTRY,
  AGENT_SCOPES,
  getAgentDefinition,
  isAgentId,
  resolveAgentId,
  scopeBelongsToAgent,
} from "../src/agent-registry.ts";
import { isAgentClaims, requireAgentScope } from "../src/auth.ts";

const orgId = "44444444-4444-4444-8444-444444444444";

const canonicalIds = [
  "intake-agent",
  "quoting-agent",
  "dispatch-agent",
  "pricebook-agent",
  "triage-agent",
  "sourcing-agent",
  "copilot-agent",
  "payments-agent",
];

const expectedTiers = {
  [AGENT_ID.intake]: AGENT_AUTONOMY_TIERS.T3,
  [AGENT_ID.quoting]: AGENT_AUTONOMY_TIERS.T1,
  [AGENT_ID.dispatch]: AGENT_AUTONOMY_TIERS.T1,
  [AGENT_ID.pricebook]: AGENT_AUTONOMY_TIERS.T1,
  [AGENT_ID.triage]: AGENT_AUTONOMY_TIERS.T1,
  [AGENT_ID.sourcing]: AGENT_AUTONOMY_TIERS.T3,
  [AGENT_ID.copilot]: AGENT_AUTONOMY_TIERS.T2,
  [AGENT_ID.payments]: AGENT_AUTONOMY_TIERS.T3,
};

test("registry exposes every canonical agent with its autonomy tier", () => {
  assert.deepEqual(AGENT_IDS, canonicalIds);
  assert.deepEqual(Object.keys(AGENT_REGISTRY), canonicalIds);
  for (const id of AGENT_IDS) {
    const definition = getAgentDefinition(id);
    assert.equal(definition?.id, id);
    assert.equal(definition?.tier, expectedTiers[id]);
    assert.equal(definition?.autonomyTier, expectedTiers[id]);
    assert.ok(definition?.displayName);
    assert.ok(definition?.taskLabels.length);
    assert.ok(definition?.costCapEnv);
    assert.ok(definition?.featureFlagKey);
    assert.ok(definition?.never.length);
  }
});

test("legacy nnact-prefixed ids resolve to canonical ids", () => {
  for (const id of AGENT_IDS) {
    assert.equal(resolveAgentId(id), id);
    assert.equal(resolveAgentId(`nnact-${id}`), id);
    assert.equal(isAgentId(id), true);
    assert.equal(isAgentId(`nnact-${id}`), false);
  }
  assert.equal(resolveAgentId("nnact-intake-agent"), AGENT_ID.intake);
  assert.equal(getAgentDefinition("nnact-quoting-agent")?.id, AGENT_ID.quoting);
  assert.equal(resolveAgentId("unknown-agent"), null);
  assert.equal(resolveAgentId(undefined), null);
  assert.equal(getAgentDefinition("unknown-agent"), null);
});

test("scopes belong only to the agents that need them", () => {
  assert.ok(scopeBelongsToAgent(AGENT_ID.intake, AGENT_SCOPES.draftJobsCreate));
  assert.ok(scopeBelongsToAgent(AGENT_SCOPES.draftJobsCreate, AGENT_ID.intake));
  assert.ok(scopeBelongsToAgent(AGENT_ID.quoting, AGENT_SCOPES.quoteProposalsCreate));
  assert.equal(scopeBelongsToAgent(AGENT_ID.quoting, AGENT_SCOPES.draftJobsCreate), false);
  assert.equal(scopeBelongsToAgent(AGENT_ID.dispatch, AGENT_SCOPES.quoteProposalsCreate), false);
  assert.equal(scopeBelongsToAgent("unknown-agent", AGENT_SCOPES.jobsRead), false);
  assert.equal(scopeBelongsToAgent(AGENT_ID.intake, "jobs:assign"), false);
});

test("old agentId and canonical agent_id claims both validate", () => {
  const base = { aud: "agent", orgId, scope: AGENT_SCOPES.draftJobsCreate };
  const legacy = { ...base, agentId: "nnact-intake-agent" };
  const canonical = { ...base, agent_id: AGENT_ID.intake };
  assert.ok(isAgentClaims(legacy));
  assert.ok(isAgentClaims(canonical));
  assert.ok(requireAgentScope(legacy, AGENT_ID.intake, AGENT_SCOPES.draftJobsCreate));
  assert.ok(requireAgentScope(canonical, AGENT_ID.intake, AGENT_SCOPES.draftJobsCreate));
  assert.equal(isAgentClaims({ ...canonical, aud: "staff" }), false);
  assert.equal(isAgentClaims({ ...canonical, agentId: "unknown-agent" }), false);
  assert.equal(isAgentClaims({ ...canonical, scope: "jobs:assign" }), false);
});

test("cross-agent claims and scopes are rejected", () => {
  const quoteClaim = {
    aud: "agent",
    agentId: AGENT_ID.quoting,
    orgId,
    scope: AGENT_SCOPES.jobsRead,
    scopes: [AGENT_SCOPES.jobsRead, AGENT_SCOPES.priceBookRead, AGENT_SCOPES.quoteProposalsCreate],
  };
  assert.ok(isAgentClaims(quoteClaim));
  assert.ok(requireAgentScope(quoteClaim, AGENT_ID.quoting, AGENT_SCOPES.quoteProposalsCreate));
  assert.equal(requireAgentScope(quoteClaim, AGENT_ID.intake, AGENT_SCOPES.jobsRead), false);
  assert.equal(requireAgentScope(quoteClaim, AGENT_ID.quoting, AGENT_SCOPES.draftJobsCreate), false);
  assert.equal(
    isAgentClaims({
      aud: "agent",
      agent_id: AGENT_ID.quoting,
      orgId,
      scope: AGENT_SCOPES.jobsRead,
      scopes: [AGENT_SCOPES.jobsRead, AGENT_SCOPES.draftJobsCreate],
    }),
    false,
  );
  assert.equal(
    isAgentClaims({ aud: "agent", agentId: AGENT_ID.intake, orgId, scope: AGENT_SCOPES.quoteProposalsCreate }),
    false,
  );
});

test("registry scopes are valid and never grant forbidden actions", () => {
  const scopeValues = Object.values(AGENT_SCOPES);
  for (const scope of [
    "messages:read",
    "messages:write",
    "conversations:read",
    "conversations:write",
    "whatsapp:templated-send",
    "price-observations:create",
    "sourcing-suggestions:create",
    "supplier-messages:templated-send",
    "invoices:read",
    "payment-reminders:send",
    "agent-runs:write",
  ]) {
    assert.ok(scopeValues.includes(scope), scope);
  }
  for (const definition of Object.values(AGENT_REGISTRY)) {
    for (const scope of definition.scopes) assert.ok(scopeValues.includes(scope), scope);
  }
  const forbidden = ["assign", "confirm-price", "pay", "refund", "send-estimate"];
  for (const scope of scopeValues) {
    assert.ok(!forbidden.includes(scope.split(":")[1] ?? ""), scope);
  }
});

test("every registry agent, triage included, can hold a token for its own scopes", () => {
  for (const id of AGENT_IDS) {
    for (const scope of AGENT_REGISTRY[id].scopes) {
      const claims = { aud: "agent", agent_id: id, orgId: "org-1", scope, scopes: [scope] };
      assert.equal(isAgentClaims(claims), true, `${id} ${scope}`);
      assert.equal(requireAgentScope(claims, id, scope), true, `${id} ${scope}`);
    }
  }
  const borrowed = { aud: "agent", agent_id: "triage-agent", orgId: "org-1", scope: AGENT_SCOPES.draftJobsCreate };
  assert.equal(isAgentClaims(borrowed), false);
});
