// Runnable check (no DB needed):  node --import tsx --test test/totals.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lineTotal,
  sumLines,
  sumCosts,
  jobCost,
  jobMargin,
  formatMoney,
} from "../src/totals.ts";

test("lineTotal multiplies qty * unit price", () => {
  assert.equal(lineTotal({ quantity: 3, unitPrice: 1500 }), 4500);
});

test("sumLines adds every line", () => {
  assert.equal(
    sumLines([
      { quantity: 1, unitPrice: 18900 },
      { quantity: 2, unitPrice: 500 },
    ]),
    19900,
  );
});

test("formatMoney renders cents as dollars", () => {
  assert.equal(formatMoney(18900), "$189.00");
  assert.equal(formatMoney(0), "$0.00");
});

test("sumCosts computes per-line costs and tolerates missing unitCost", () => {
  assert.equal(sumCosts([]), 0);
  assert.equal(sumCosts([{ quantity: 2, unitPrice: 500 }]), 0); // unitCost absent -> 0
  assert.equal(sumCosts([{ quantity: 2, unitPrice: 500, unitCost: 100 }]), 200);
  assert.equal(
    sumCosts([
      { quantity: 1, unitPrice: 1000, unitCost: 50 },
      { quantity: 3, unitPrice: 500, unitCost: 10 },
    ]),
    80,
  );
});

test("jobCost adds sumCosts to the job-level labor cost", () => {
  assert.equal(jobCost([], 0), 0);
  assert.equal(jobCost([{ quantity: 2, unitPrice: 0, unitCost: 100 }], 500), 700);
  assert.equal(
    jobCost(
      [
        { quantity: 1, unitPrice: 1000, unitCost: 50 },
        { quantity: 3, unitPrice: 500, unitCost: 10 },
      ],
      250,
    ),
    330,
  );
});

test("jobMargin preserves sign: positive, zero, and negative (loss)", () => {
  assert.equal(jobMargin(1000, 400), 600); // profit
  assert.equal(jobMargin(500, 500), 0); // break-even
  assert.equal(jobMargin(1000, 1200), -200); // loss — must NOT clamp to 0
});
