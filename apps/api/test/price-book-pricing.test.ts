import { test } from "node:test";
import assert from "node:assert/strict";
import { quoteProposalDraftSchema, type PricedCandidateDTO } from "@nnact/shared";
import {
  currentRange,
  matchItemByName,
  normalizeAlias,
  proposalTotals,
  validateSelections,
} from "../src/price-book/pricing.ts";

const candidate = (overrides: Partial<PricedCandidateDTO> = {}): PricedCandidateDTO => ({
  itemId: "11111111-1111-4111-8111-111111111111",
  rateId: null,
  kind: "part",
  name: "Start capacitor",
  unit: "piece",
  aliases: { en: ["capacitor"], fr: ["condensateur"] },
  observationIds: ["22222222-2222-4222-8222-222222222222"],
  range: {
    lowCents: 9000,
    highCents: 11000,
    weightedCents: 10000,
    confidence: 80,
    basis: "fresh",
    observationCount: 3,
  },
  ...overrides,
});

test("normalizeAlias and matchItemByName handle accents and both alias lists", () => {
  assert.equal(normalizeAlias("  Condensatèur  "), "condensateur");
  const items = [candidate()];
  assert.equal(matchItemByName(items, "CONDENSATEUR")?.itemId, candidate().itemId);
  assert.equal(matchItemByName(items, "compressor"), null);
});

test("currentRange returns no range when every observation is zero or pending", () => {
  const range = currentRange([
    { amountCents: 0, status: "confirmed", source: "manual", observedAt: new Date() },
    { amountCents: 5000, status: "pending", source: "receipt", observedAt: new Date() },
  ]);
  assert.equal(range.lowCents, null);
  assert.equal(range.highCents, null);
  assert.equal(range.basis, "none");
  assert.equal(range.confidence, 0);
});

test("historical-only prices are capped and never fresh, however old the source row is", () => {
  const old = new Date(Date.now() - 400 * 86_400_000);
  const range = currentRange([
    { amountCents: 10000, status: "confirmed", source: "historical", observedAt: old, confidence: 90 },
    { amountCents: 12000, status: "confirmed", source: "historical", observedAt: old, confidence: 90 },
  ]);
  assert.equal(range.basis, "stale");
  assert.ok(range.confidence <= 35);
  assert.ok(range.lowCents !== null && range.highCents !== null);
});

test("proposalTotals with any manual line has no customer-safe total", () => {
  const totals = proposalTotals([
    { lineLowCents: 9000, lineHighCents: 11000 },
    { lineLowCents: null, lineHighCents: null },
  ]);
  assert.equal(totals.lowCents, null);
  assert.equal(totals.highCents, null);
  assert.equal(totals.hasUnknown, true);
});

test("no-invented-price guard rejects ids absent from the offered snapshot", () => {
  const offered = [candidate()];
  const draft = quoteProposalDraftSchema.parse({
    lines: [{
      candidateId: "99999999-9999-4999-8999-999999999999",
      kind: "part",
      quantity: 1,
    }],
    confidence: 0.8,
  });
  const result = validateSelections(draft, offered);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /unknown candidate/);
});

test("no-invented-price guard rejects wrong kinds, duplicates and invalid quantities", () => {
  const offered = [candidate()];
  const result = validateSelections(
    {
      lines: [
        { candidateId: candidate().itemId!, kind: "labor", quantity: 1, reason: "", needsManualPrice: false },
        { candidateId: candidate().itemId!, kind: "part", quantity: 0, reason: "", needsManualPrice: false },
      ],
    },
    offered,
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /does not match candidate/);
  assert.match(result.errors.join(" "), /duplicate candidate/);
  assert.match(result.errors.join(" "), /invalid quantity/);
});

test("adversarial model output cannot inject a price field into the quote draft", () => {
  const parsed = quoteProposalDraftSchema.safeParse({
    lines: [{
      candidateId: candidate().itemId,
      kind: "part",
      quantity: 1,
      unitPriceCents: 1,
    }],
    confidence: 0.9,
    totalCents: 1,
  });
  assert.equal(parsed.success, true);
  assert.equal("unitPriceCents" in parsed.data.lines[0], false);
  assert.equal("totalCents" in parsed.data, false);
});
