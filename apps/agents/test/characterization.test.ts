import assert from "node:assert/strict";
import { test } from "node:test";
import { AGENT_ID, AGENT_SCOPES } from "@nnact/shared";
import { createAgentToken, detectSafety, quotePrompt, rejectModelPrices, serviceAreaFromAddress } from "../src/lib/helpers.js";
import { legacyAgentId, resolveSelectedAgentIds } from "../src/lib/runtime.js";

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  assert.ok(payload);
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

test("detectSafety finds unique safety terms", () => {
  assert.deepEqual(detectSafety("There are sparks and a burning smell, plus sparks"), ["sparks", "burning smell"]);
});

test("rejectModelPrices rejects nested price fields", () => {
  assert.throws(
    () => rejectModelPrices({ lines: [{ unitPriceCents: 500 }] }),
    /forbidden price field output\.lines\[0\]\.unitPriceCents/,
  );
  assert.doesNotThrow(() => rejectModelPrices({ lines: [{ candidateId: "abc", quantity: 1, needsManualPrice: true }] }));
});

test("serviceAreaFromAddress keeps last two parts", () => {
  assert.equal(serviceAreaFromAddress("12 Road, Douala, Cameroon"), "Douala, Cameroon");
  assert.equal(serviceAreaFromAddress(null), null);
});

test("quotePrompt only sends candidate ids and server ranges", () => {
  const prompt = quotePrompt({
    job: { title: "Fridge repair", description: null, serviceArea: "Douala, Cameroon" },
    candidates: [
      {
        itemId: "item-1",
        rateId: null,
        kind: "labor",
        name: "Visit",
        aliases: [],
        unit: "visit",
        range: { lowCents: 1000, highCents: 2000 },
      },
    ],
  });
  const parsed = JSON.parse(prompt) as { instruction: string; candidates: Array<Record<string, unknown>> };
  assert.match(parsed.instruction, /Never write a price/);
  assert.equal(parsed.candidates[0].candidateId, "item-1");
});

test("agent token carries canonical id and narrow scopes", () => {
  const scopes = [AGENT_SCOPES.draftJobsCreate, AGENT_SCOPES.agentRunsWrite];
  const token = createAgentToken({
    orgId: "11111111-1111-4111-8111-111111111111",
    agentId: AGENT_ID.intake,
    legacyAgentId: "nnact-intake-agent",
    scopes,
    secret: "test",
    now: 1_700_000_000,
  });
  const claims = decodeJwt(token);
  assert.equal(claims.agent_id, AGENT_ID.intake);
  assert.equal(claims.agentId, "nnact-intake-agent");
  assert.deepEqual(claims.scopes, scopes);
  assert.equal(claims.scope, AGENT_SCOPES.draftJobsCreate);
});

test("agent selection supports default all and legacy names", () => {
  assert.deepEqual(resolveSelectedAgentIds({}), [
    AGENT_ID.intake,
    AGENT_ID.quoting,
    AGENT_ID.dispatch,
    AGENT_ID.pricebook,
    AGENT_ID.triage,
    AGENT_ID.sourcing,
    AGENT_ID.copilot,
    AGENT_ID.payments,
  ]);
  assert.deepEqual(resolveSelectedAgentIds({ AGENT_NAME: "quoting" }), [AGENT_ID.quoting]);
  assert.deepEqual(resolveSelectedAgentIds({ AGENT_NAME: "copilot" }), [AGENT_ID.copilot]);
  assert.deepEqual(resolveSelectedAgentIds({ AGENT_ID: "nnact-intake-agent" }), [AGENT_ID.intake]);
  assert.deepEqual(resolveSelectedAgentIds({ AGENT_ID: "nnact-quote-agent" }), [AGENT_ID.quoting]);
  assert.equal(legacyAgentId(AGENT_ID.quoting), "nnact-quoting-agent");
});
