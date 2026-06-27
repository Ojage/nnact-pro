// node --experimental-strip-types --test test/recurrence.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence, isDue, catchUp } from "../src/recurrence.ts";

const day = 86_400_000;

test("nextOccurrence advances by intervalDays", () => {
  const start = new Date("2026-01-01T00:00:00Z");
  assert.equal(nextOccurrence(start, 7).toISOString(), "2026-01-08T00:00:00.000Z");
});

test("isDue is true at/after the run time", () => {
  const t = new Date("2026-01-10T00:00:00Z");
  assert.equal(isDue(t, new Date("2026-01-10T00:00:00Z")), true);
  assert.equal(isDue(t, new Date("2026-01-09T23:59:00Z")), false);
});

test("catchUp materializes each missed occurrence and advances next", () => {
  const next = new Date("2026-01-01T00:00:00Z");
  const now = new Date(next.getTime() + 30 * day); // ~30 days later, weekly cadence
  const r = catchUp(next, 7, now);
  assert.equal(r.due, 5); // 5 weekly runs fit in 30 days
  assert.ok(r.next.getTime() > now.getTime());
});

test("catchUp respects the cap so a dormant template can't flood", () => {
  const next = new Date("2026-01-01T00:00:00Z");
  const now = new Date(next.getTime() + 365 * day);
  assert.equal(catchUp(next, 1, now, 12).due, 12);
});

test("zero/negative interval is rejected", () => {
  assert.throws(() => nextOccurrence(new Date(), 0));
});
