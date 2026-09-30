import test from "node:test";
import assert from "node:assert/strict";
import { costCentsForImage, costCentsForTextResult, costCentsForVision } from "../src/ai/usage.js";

test("cost is never zero, so budget guardrails cannot read a call as free", () => {
  // Every provider call used to record costCents: 0 outside the article write,
  // which made the daily/monthly budget caps and the usage analytics page
  // report a fraction of real spend. Even a trivially small call must cost > 0.
  assert.ok(costCentsForTextResult("gpt-4o", 10, 5) > 0);
  assert.ok(costCentsForImage(1) > 0);
  assert.ok(costCentsForVision("gpt-4o", 1_200, 180) > 0);
});

test("a known model is priced from its own rate, not the fallback", () => {
  // gpt-4o ($2.50/M in) vs gpt-4o-mini ($0.15/M in) differ by ~16x. If both
  // fell back to the same default the guardrails could not tell them apart.
  const big = costCentsForTextResult("gpt-4o", 1_000_000, 0);
  const small = costCentsForTextResult("gpt-4o-mini", 1_000_000, 0);
  assert.ok(big > small * 10, `expected gpt-4o (${big}c) to cost far more than gpt-4o-mini (${small}c)`);
});

test("an unlisted model is still costed instead of falling back to free", () => {
  assert.ok(costCentsForTextResult("some-future-model", 1_000_000, 1_000_000) > 0);
});

test("output is priced above input, as the providers charge", () => {
  const inputOnly = costCentsForTextResult("gpt-4o", 1_000_000, 0);
  const outputOnly = costCentsForTextResult("gpt-4o", 0, 1_000_000);
  assert.ok(outputOnly > inputOnly, `expected output (${outputOnly}c) to exceed input (${inputOnly}c)`);
});

test("image cost scales with the number of images generated", () => {
  assert.equal(costCentsForImage(2), costCentsForImage(1) * 2);
  assert.ok(costCentsForImage(1) > 0);
});

test("cost grows with token volume", () => {
  const small = costCentsForTextResult("gpt-4o", 1_000, 500);
  const large = costCentsForTextResult("gpt-4o", 1_000_000, 500_000);
  assert.ok(large > small);
});
