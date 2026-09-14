import assert from "node:assert/strict";
import test from "node:test";
import { jobPatchBody } from "../src/routes/jobs.js";

test("status-only job patches do not synthesize a zero labor cost", () => {
  const parsed = jobPatchBody.parse({ status: "in_progress" });
  assert.deepEqual(parsed, { status: "in_progress" });
  assert.equal("laborCostCents" in parsed, false);
});

test("explicit labor cost changes remain supported", () => {
  const parsed = jobPatchBody.parse({ status: "completed", laborCostCents: 12_500 });
  assert.deepEqual(parsed, { status: "completed", laborCostCents: 12_500 });
});

test("negative labor costs remain invalid", () => {
  assert.equal(jobPatchBody.safeParse({ laborCostCents: -1 }).success, false);
});

test("negative quick-money figures remain invalid", () => {
  assert.equal(jobPatchBody.safeParse({ advanceReceivedCents: -1 }).success, false);
  assert.equal(jobPatchBody.safeParse({ customerBalanceCents: -1 }).success, false);
  assert.equal(jobPatchBody.safeParse({ expenseAllowanceCents: -1 }).success, false);
});

test("quick-money figures may be zero", () => {
  const parsed = jobPatchBody.parse({ advanceReceivedCents: 0, customerBalanceCents: 0, expenseAllowanceCents: 0 });
  assert.deepEqual(parsed, { advanceReceivedCents: 0, customerBalanceCents: 0, expenseAllowanceCents: 0 });
});

test("quick-money figures are accepted without status", () => {
  const parsed = jobPatchBody.parse({ advanceReceivedCents: 25_000, customerBalanceCents: 15_000, expenseAllowanceCents: 20_000 });
  assert.equal("status" in parsed, false);
  assert.equal(parsed.advanceReceivedCents, 25_000);
  assert.equal(parsed.customerBalanceCents, 15_000);
  assert.equal(parsed.expenseAllowanceCents, 20_000);
});
