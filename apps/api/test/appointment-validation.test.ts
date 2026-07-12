import assert from "node:assert/strict";
import test from "node:test";
import {
  appointmentWindowsOverlap,
  resolveAppointmentWindow,
} from "../src/routes/appointment-validation.js";

const current = {
  startsAt: new Date("2026-07-11T14:00:00.000Z"),
  endsAt: new Date("2026-07-11T15:00:00.000Z"),
};

test("keeps the persisted end time when only start changes", () => {
  const result = resolveAppointmentWindow(current, {
    startsAt: "2026-07-11T14:30:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.startsAt.toISOString(), "2026-07-11T14:30:00.000Z");
  assert.equal(result.endsAt.toISOString(), "2026-07-11T15:00:00.000Z");
});

test("rejects a partial start update that crosses the persisted end time", () => {
  const result = resolveAppointmentWindow(current, {
    startsAt: "2026-07-11T15:30:00.000Z",
  });

  assert.deepEqual(result, { ok: false, error: "endsAt must be after startsAt" });
});

test("rejects a partial end update before the persisted start time", () => {
  const result = resolveAppointmentWindow(current, {
    endsAt: "2026-07-11T13:30:00.000Z",
  });

  assert.deepEqual(result, { ok: false, error: "endsAt must be after startsAt" });
});

test("accepts a complete reschedule with a valid final window", () => {
  const result = resolveAppointmentWindow(current, {
    startsAt: "2026-07-12T16:00:00.000Z",
    endsAt: "2026-07-12T17:45:00.000Z",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.startsAt.toISOString(), "2026-07-12T16:00:00.000Z");
  assert.equal(result.endsAt.toISOString(), "2026-07-12T17:45:00.000Z");
});

test("detects partial and contained overlaps", () => {
  assert.equal(
    appointmentWindowsOverlap(current, {
      startsAt: new Date("2026-07-11T14:30:00.000Z"),
      endsAt: new Date("2026-07-11T15:30:00.000Z"),
    }),
    true,
  );
  assert.equal(
    appointmentWindowsOverlap(current, {
      startsAt: new Date("2026-07-11T14:15:00.000Z"),
      endsAt: new Date("2026-07-11T14:45:00.000Z"),
    }),
    true,
  );
});

test("allows back-to-back appointment windows", () => {
  assert.equal(
    appointmentWindowsOverlap(current, {
      startsAt: new Date("2026-07-11T15:00:00.000Z"),
      endsAt: new Date("2026-07-11T16:00:00.000Z"),
    }),
    false,
  );
});
