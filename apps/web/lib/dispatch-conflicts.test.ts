import assert from "node:assert/strict";
import test from "node:test";
import type { DispatchAppointment } from "@/lib/dispatch-api";
import {
  appointmentsOverlap,
  buildConflictMap,
  conflictsForAppointment,
  countConflictPairs,
} from "@/lib/dispatch-conflicts";

function appointment(
  id: string,
  technicianId: string | null,
  startsAt: string,
  endsAt: string,
): DispatchAppointment {
  return { id, jobId: `job-${id}`, technicianId, startsAt, endsAt };
}

test("back-to-back appointments are not conflicts", () => {
  const first = appointment("a", "tech-1", "2026-07-11T09:00:00.000Z", "2026-07-11T10:00:00.000Z");
  const second = appointment("b", "tech-1", "2026-07-11T10:00:00.000Z", "2026-07-11T11:00:00.000Z");

  assert.equal(appointmentsOverlap(first, second), false);
});

test("partial and contained overlaps are detected", () => {
  const base = appointment("a", "tech-1", "2026-07-11T09:00:00.000Z", "2026-07-11T11:00:00.000Z");
  const partial = appointment("b", "tech-1", "2026-07-11T10:30:00.000Z", "2026-07-11T12:00:00.000Z");
  const contained = appointment("c", "tech-1", "2026-07-11T09:30:00.000Z", "2026-07-11T10:00:00.000Z");

  assert.equal(appointmentsOverlap(base, partial), true);
  assert.equal(appointmentsOverlap(base, contained), true);
});

test("assignment conflict checks ignore other technicians and the appointment itself", () => {
  const moving = appointment("a", null, "2026-07-11T09:30:00.000Z", "2026-07-11T10:30:00.000Z");
  const sameTech = appointment("b", "tech-1", "2026-07-11T09:00:00.000Z", "2026-07-11T10:00:00.000Z");
  const otherTech = appointment("c", "tech-2", "2026-07-11T09:00:00.000Z", "2026-07-11T10:00:00.000Z");

  assert.deepEqual(conflictsForAppointment(moving, "tech-1", [moving, sameTech, otherTech]).map((item) => item.id), ["b"]);
  assert.deepEqual(conflictsForAppointment(moving, null, [moving, sameTech]), []);
});

test("conflict map reports both appointments but counts one unique pair", () => {
  const first = appointment("a", "tech-1", "2026-07-11T09:00:00.000Z", "2026-07-11T10:30:00.000Z");
  const second = appointment("b", "tech-1", "2026-07-11T10:00:00.000Z", "2026-07-11T11:00:00.000Z");
  const third = appointment("c", "tech-2", "2026-07-11T10:00:00.000Z", "2026-07-11T11:00:00.000Z");

  const map = buildConflictMap([first, second, third]);

  assert.deepEqual([...map.get("a") ?? []], ["b"]);
  assert.deepEqual([...map.get("b") ?? []], ["a"]);
  assert.equal(map.has("c"), false);
  assert.equal(countConflictPairs(map), 1);
});
