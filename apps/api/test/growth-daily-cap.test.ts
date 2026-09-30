import test from "node:test";
import assert from "node:assert/strict";
import { sectorShareOfDailyCap } from "../src/growth/outbound.js";

test("a sector's share is its weight of the org cap", () => {
  assert.equal(sectorShareOfDailyCap(100, 50), 50);
  assert.equal(sectorShareOfDailyCap(100, 25), 25);
  assert.equal(sectorShareOfDailyCap(60, 50), 30);
});

test("shares floor rather than round, so sectors cannot collectively overshoot the cap", () => {
  // Rounding here is how a 50/day cap quietly becomes 57 sends. Three sectors
  // at 19% of 50 each floor to 9 (27 total) instead of rounding to 10 each
  // (30 total, which alone exceeds nothing but wastes cap alongside a 4th).
  const share = sectorShareOfDailyCap(50, 19);
  assert.equal(share, 9);
  assert.equal(sectorShareOfDailyCap(50, 19) * 3, 27);
  // 4 x 10 would be 40, still under 50, but the point is the floor is never
  // above the true proportional value.
  assert.ok(sectorShareOfDailyCap(50, 19) <= (50 * 19) / 100);
});

test("a zero or negative weight yields no share, so the caller refuses visibly", () => {
  // Returning 0 must not be mistaken for "no limit". The caller turns this into
  // a sector_share_exhausted refusal, which is what makes an allocation of 0
  // observable instead of a silent no-op.
  assert.equal(sectorShareOfDailyCap(50, 0), 0);
  assert.equal(sectorShareOfDailyCap(50, -10), 0);
});

test("a weight above 100 is clamped rather than granted extra capacity", () => {
  assert.equal(sectorShareOfDailyCap(50, 150), 50);
  assert.equal(sectorShareOfDailyCap(50, 1000), 50);
});

test("a zero org cap means nothing may send", () => {
  assert.equal(sectorShareOfDailyCap(0, 100), 0);
  assert.equal(sectorShareOfDailyCap(-5, 100), 0);
});

test("a small cap still supports a proportional split", () => {
  // 10/day at 30% and 70%: 3 and 7, summing to exactly the cap.
  const a = sectorShareOfDailyCap(10, 30);
  const b = sectorShareOfDailyCap(10, 70);
  assert.equal(a, 3);
  assert.equal(b, 7);
  assert.equal(a + b, 10);
});
