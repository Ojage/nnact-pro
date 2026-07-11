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
