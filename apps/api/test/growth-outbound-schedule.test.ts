import assert from "node:assert/strict";
import { test } from "node:test";
import { isStepDue, isWithinQuietHours } from "../src/growth/outbound.js";

const HOUR_MS = 3_600_000;

/** Builds a Date for a given local hour in a fixed-offset zone (UTC). */
function at(hour: number, minute = 0): Date {
  return new Date(Date.UTC(2026, 4, 12, hour, minute, 0));
}

const campaignWindow = { quietHoursStart: 20, quietHoursEnd: 8, timezone: "UTC" };

test("a window that wraps midnight covers the late hours and the early hours", () => {
  // 20:00 → 08:00 local.
  assert.equal(isWithinQuietHours(campaignWindow, at(20)), true);
  assert.equal(isWithinQuietHours(campaignWindow, at(23, 30)), true);
  assert.equal(isWithinQuietHours(campaignWindow, at(0)), true);
  assert.equal(isWithinQuietHours(campaignWindow, at(7, 59)), true);
});

test("the end of the window is exclusive and the start is inclusive", () => {
  assert.equal(isWithinQuietHours(campaignWindow, at(8)), false);
  assert.equal(isWithinQuietHours(campaignWindow, at(19, 59)), false);
});

test("the middle of the day is outside quiet hours", () => {
  assert.equal(isWithinQuietHours(campaignWindow, at(9)), false);
  assert.equal(isWithinQuietHours(campaignWindow, at(12)), false);
  assert.equal(isWithinQuietHours(campaignWindow, at(19)), false);
});

test("a same-day window such as 09:00 to 17:00 is treated as inside during it", () => {
  const daytime = { quietHoursStart: 9, quietHoursEnd: 17, timezone: "UTC" };
  assert.equal(isWithinQuietHours(daytime, at(9)), true);
  assert.equal(isWithinQuietHours(daytime, at(13)), true);
  assert.equal(isWithinQuietHours(daytime, at(17)), false);
  assert.equal(isWithinQuietHours(daytime, at(8)), false);
  assert.equal(isWithinQuietHours(daytime, at(20)), false);
});

test("quiet hours are evaluated in the campaign timezone, not UTC", () => {
  // 20:00–08:00 in UTC+2 is 18:00–06:00 UTC. 19:00 UTC is 21:00 local: inside.
  const joburg = { quietHoursStart: 20, quietHoursEnd: 8, timezone: "Africa/Johannesburg" };
  assert.equal(isWithinQuietHours(joburg, at(19)), true);
  // 08:00 UTC is 10:00 local: outside.
  assert.equal(isWithinQuietHours(joburg, at(8)), false);
  // 17:00 UTC is 19:00 local: outside.
  assert.equal(isWithinQuietHours(joburg, at(17)), false);
});

test("an unset or empty window means no quiet hours at all", () => {
  assert.equal(isWithinQuietHours({ quietHoursStart: null, quietHoursEnd: null, timezone: "UTC" }, at(3)), false);
  assert.equal(isWithinQuietHours({ quietHoursStart: 8, quietHoursEnd: 8, timezone: "UTC" }, at(8)), false);
});

test("the first step of a sequence is always due", () => {
  assert.equal(isStepDue(0, null, at(12)), true);
  assert.equal(isStepDue(7, null, at(12)), true);
});

test("a follow-up waits for its delay to elapse", () => {
  const lastSent = at(12);
  const after = (hours: number) => new Date(lastSent.getTime() + hours * HOUR_MS);
  // A three-day delay is not satisfied by the same day, or by two days.
  assert.equal(isStepDue(3, lastSent, at(12)), false);
  assert.equal(isStepDue(3, lastSent, at(23, 59)), false);
  assert.equal(isStepDue(3, lastSent, after(24)), false);
  assert.equal(isStepDue(3, lastSent, after(72 - 1)), false);
  // Exactly 72 hours later it is due.
  assert.equal(isStepDue(3, lastSent, after(72)), true);
  assert.equal(isStepDue(3, lastSent, after(96)), true);
});

test("a zero-day follow-up is due immediately", () => {
  assert.equal(isStepDue(0, at(12), at(12)), true);
});

test("a delay is counted in full days from the previous send", () => {
  const lastSent = at(12);
  // 24h later exactly is due for a one-day delay.
  assert.equal(isStepDue(1, lastSent, new Date(lastSent.getTime() + 24 * HOUR_MS)), true);
  assert.equal(isStepDue(2, lastSent, new Date(lastSent.getTime() + 24 * HOUR_MS)), false);
});
