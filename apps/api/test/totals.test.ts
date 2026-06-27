// Runnable check (no DB needed):  node --import tsx --test test/totals.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { lineTotal, sumLines, formatMoney } from "../src/totals.ts";

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
