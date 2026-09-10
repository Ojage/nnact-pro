// Pure domain + pure helper tests for the AI automation context.
// These files never touch the database, HTTP, or provider SDKs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSlot, dueSlots, slotKey, parseSlotKey, zoneOffsetMinutes, toUtc, hashValue, estimateCostCents } from "../src/ai/domain.js";
import { findNearDuplicate } from "../src/ai/duplicate.js";
import { blocksToBodyDocument } from "../src/ai/blocknote.js";
import { pickTopicSeed, categoryFor } from "../src/ai/planner.js";

const baseSettings = {
  timezone: "Africa/Douala", // UTC+1
  morningTime: "08:00",
  eveningTime: "18:00",
  enabledDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"],
  catchUpWindowMinutes: 180,
};

test("zoneOffsetMinutes table and Africa fallback", () => {
  assert.equal(zoneOffsetMinutes("Africa/Douala"), 60);
  assert.equal(zoneOffsetMinutes("Africa/Lagos"), 60);
  assert.equal(zoneOffsetMinutes("Africa/Casablanca"), 0);
  assert.equal(zoneOffsetMinutes("UTC"), 0);
  assert.equal(zoneOffsetMinutes("Africa/Kinshasa"), 60);
  assert.equal(zoneOffsetMinutes("Europe/Paris"), 0); // unknown → UTC + warn
});

test("nextSlot picks the next wall-clock slot strictly after now", () => {
  // 07:30Z = 08:30 wall — morning already passed, evening (18:00 wall = 17:00Z) next.
  const morningAt730 = nextSlot(new Date("2026-09-10T07:30:00Z"), baseSettings);
  assert.equal(morningAt730?.slot, "EVENING");
  assert.equal(morningAt730?.isoDate, "2026-09-10");
  assert.equal(morningAt730?.dueAt.toISOString(), "2026-09-10T17:00:00.000Z");

  // 06:59Z = 07:59 wall — morning at 07:00Z is still in the future? No — 07:00Z > 06:59Z, so morning next.
  const at0659 = nextSlot(new Date("2026-09-10T06:59:00Z"), baseSettings);
  assert.equal(at0659?.slot, "MORNING");
  assert.equal(at0659?.dueAt.toISOString(), "2026-09-10T07:00:00.000Z");
});

test("nextSlot respects disabled days", () => {
  const weekendOff = { ...baseSettings, enabledDays: ["MON", "TUE", "WED", "THU", "FRI"] };
  // Sat 2026-09-12 10:00Z (11:00 wall) — next allowed slot is Mon 2026-09-14 07:00Z.
  const next = nextSlot(new Date("2026-09-12T10:00:00Z"), weekendOff);
  assert.equal(next?.slot, "MORNING");
  assert.equal(next?.isoDate, "2026-09-14");
});

test("dueSlots returns only due slots within the catch-up window", () => {
  // Morning scheduled 07:00Z; now 08:00Z (within 180min) → due.
  const due = dueSlots(new Date("2026-09-10T08:00:00Z"), baseSettings);
  assert.deepEqual(due.map((d) => d.slot), ["MORNING"]);
  // More than 180 minutes later → not due (both skipped).
  const late = dueSlots(new Date("2026-09-10T10:10:00Z"), baseSettings);
  assert.equal(late.length, 0);
});

test("slotKey round-trips", () => {
  const key = slotKey("org-1", "2026-09-10", "EVENING");
  assert.deepEqual(parseSlotKey(key), { orgId: "org-1", isoDate: "2026-09-10", slot: "EVENING" });
});

test("toUtc converts wall time minus offset", () => {
  assert.equal(toUtc({ year: 2026, month: 9, day: 10 }, 8, 0, 60).toISOString(), "2026-09-10T07:00:00.000Z");
});

test("hashValue is deterministic and differs by input", () => {
  assert.equal(hashValue("x"), 4_245_442_695);
  assert.notEqual(hashValue("x"), hashValue("y"));
});

test("estimateCostCents floors at 1 and scales with tokens", () => {
  assert.ok(estimateCostCents("gpt-4o", 0, 0) >= 1);
  assert.ok(estimateCostCents("gpt-4o", 1_000_000, 0) > estimateCostCents("gpt-4o-mini", 1_000_000, 0));
});

test("duplicate detector catches near-identical titles, accepts distinct ones", () => {
  const recent = ["Generator Set Weekly Inspection Checklist: A Practical Guide"];
  assert.ok(findNearDuplicate("Generator set weekly inspection checklist", recent) !== null);
  assert.equal(findNearDuplicate("Why vibration analysis predicts bearing failure", recent), null);
});

test("blocksToBodyDocument maps custom blocks and prepends featured media", () => {
  const doc = blocksToBodyDocument(
    [
      { type: "heading", text: "H1" },
      { type: "paragraph", text: "Body" },
      { type: "maintenanceTip", text: "Grease bearings weekly." },
      { type: "safetyNotice", text: "Lock out power first." },
      { type: "serviceCta", text: "Book an assessment." },
    ],
    "media-uuid",
  );
  assert.equal(doc[0]?.type, "nnactUploadedImage");
  assert.deepEqual(doc[0]?.props, { url: "media-uuid", altText: null, caption: null });
  assert.equal(doc[1]?.type, "heading");
  assert.equal(doc[3]?.type, "nnactMaintenanceTip");
  assert.equal(doc[4]?.type, "nnactSafetyNotice");
  assert.equal(doc[5]?.type, "nnactServiceCta");
});

test("planning seeds are deterministic per org+date+slot and categorized", () => {
  const ctx = { companyName: "NNACT", fieldStorySummaries: [] };
  const a = pickTopicSeed(ctx, "MORNING", "2026-09-10");
  const b = pickTopicSeed(ctx, "MORNING", "2026-09-10");
  const c = pickTopicSeed(ctx, "EVENING", "2026-09-10");
  assert.deepEqual(a, b);
  assert.ok(c.topic !== a.topic || c.angle !== a.angle);
  assert.equal(categoryFor("MAINTENANCE_TIP"), "Maintenance Tips");
  assert.equal(categoryFor("FIELD_STORY"), "Field Stories");
  assert.equal(categoryFor("ARTICLE"), "Reliability Insights");
});