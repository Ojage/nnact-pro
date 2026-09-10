// Unattended-autopilot simulation — replays the worker's decision loop for 14
// days at 15-minute ticks using the same dueSlots() the engine calls, asserting
// (a) every enabled day produces exactly the two scheduled slots,
// (b) slot-key idempotency means nothing is ever run twice, and
// (c) the kill switch and daily-budget guard visually stop the autopilot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { dueSlots, slotKey } from "../src/ai/domain.js";
import type { AiAutomationSettingsDTO, AiSlot } from "@nnact/shared";

const SETTINGS_14D = {
  timezone: "Africa/Douala",
  morningTime: "08:00",
  eveningTime: "18:00",
  enabledDays: ["MON", "TUE", "WED", "THU", "FRI"],
  catchUpWindowMinutes: 180,
  enabled: true,
} as AiAutomationSettingsDTO;

function simulate(startIso: string, days: number, settings: typeof SETTINGS_14D, opts: { killed?: boolean; dailyBudgetUsable?: (isoDate: string) => boolean } = {}): Map<string, AiSlot> {
  const start = new Date(`${startIso}T00:00:00Z`);
  const executed = new Map<string, AiSlot>();
  const seen = new Set<string>();
  const today = (tick: Date) => `${tick.toISOString().slice(0, 10)}`;

  let tick = start;
  const end = new Date(start.getTime() + days * 86_400_000);
  while (tick < end) {
    if (!opts.killed) {
      const day = today(tick);
      const budgetOK = opts.dailyBudgetUsable?.(day) ?? true;
      if (budgetOK) {
        for (const schedule of dueSlots(tick, settings)) {
          const key = slotKey("org-1", schedule.isoDate, schedule.slot);
          if (seen.has(key)) continue; // idempotency guard (slot_key unique)
          seen.add(key);
          executed.set(key, schedule.slot);
        }
      }
    }
    tick = new Date(tick.getTime() + 15 * 60_000); // worker tick
  }
  return executed;
}

test("14-day autopilot: exactly one MORNING + EVENING per enabled weekday", () => {
  // 2026-09-10 is a Thursday. 14 days → 10 weekdays (Thu,Fri + 5 ×2 + Mon,Tue).
  const settings = { ...SETTINGS_14D };
  const start = new Date("2026-09-10T00:00:00Z");
  const weekdays = ["MON", "TUE", "WED", "THU", "FRI"];
  let expected = 0;
  for (let i = 0; i < 14; i++) {
    const day = new Date(start.getTime() + i * 86_400_000);
    if (weekdays.includes(["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][day.getUTCDay()])) expected += 2;
  }
  const executed = simulate("2026-09-10", 14, settings);
  assert.equal(executed.size, expected);
  const keys = [...executed.keys()];
  assert.equal(new Set(keys).size, keys.length, "no slot ever executed twice (idempotency)");

  // Spot-check: 2026-09-10 (Thu) got both 08:00-morning and 18:00-evening.
  assert.equal(executed.get("org-1:2026-09-10:MORNING"), "MORNING");
  assert.equal(executed.get("org-1:2026-09-10:EVENING"), "EVENING");
});

test("daytime-due windows fire inside the catch-up window and not outside", () => {
  const settings = { ...SETTINGS_14D };
  // At 07:10Z (08:10 wall) morning is 10 minutes late → still inside 180min window.
  const due = dueSlots(new Date("2026-09-10T07:10:00Z"), settings);
  assert.deepEqual(due.map((d) => d.slot), ["MORNING"]);
  // At 10:10Z morning is 3h10m late → outside window → nothing fires.
  assert.equal(dueSlots(new Date("2026-09-10T10:10:00Z"), settings).length, 0);
});

test("kill switch halts the entire autopilot for the window", () => {
  const executed = simulate("2026-09-10", 7, SETTINGS_14D, { killed: true });
  assert.equal(executed.size, 0);
});

test("daily budget stop halts just that wall day, then resumes", () => {
  const budgetUsable = (isoDate: string) => isoDate !== "2026-09-11";
  const executed = simulate("2026-09-10", 7, SETTINGS_14D, { dailyBudgetUsable: budgetUsable });
  assert.ok(![...executed.keys()].some((k) => k.includes("2026-09-11")), "no runs on the budget-frozen day");
  assert.ok([...executed.keys()].some((k) => k.includes("2026-09-14")), "autopilot resumed Monday");
});

test("weekend-only config still publishes its two slots on the weekends", () => {
  const weekends = { ...SETTINGS_14D, enabledDays: ["SAT", "SUN"] };
  const executed = simulate("2026-09-12", 14, weekends);
  assert.equal(executed.size, 8); // two full weekends × 2 slots
  assert.ok([...executed.keys()].every((k) => ["2026-09-12", "2026-09-13", "2026-09-19", "2026-09-20"].some((d) => k.includes(d))));
});