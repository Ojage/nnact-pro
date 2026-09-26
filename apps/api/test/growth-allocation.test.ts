import assert from "node:assert/strict";
import { test } from "node:test";
import { computeSectorAllocations } from "../src/growth/allocation.js";

const base = (overrides: Partial<Parameters<typeof computeSectorAllocations>[0][0]> = {}) => ({
  sectorId: "hotels",
  name: "Hotels",
  pinned: false,
  excluded: false,
  paused: false,
  manualOverride: null,
  contacts: 40,
  minSampleSize: 30,
  observationDays: 14,
  daysObserved: 20,
  qualifiedMeetings: 4,
  assessments: 3,
  acceptedEstimates: 1,
  wonRevenueCents: 0,
  positiveReplies: 10,
  objections: 0,
  unsubscribes: 0,
  bounces: 0,
  complaints: 0,
  currentWeight: 20,
  ...overrides,
});

test("hotels beat banks when banks have replies but no meetings", () => {
  const hotels = base({ sectorId: "h1", name: "Hotels", qualifiedMeetings: 4, assessments: 3, positiveReplies: 8 });
  const banks = base({
    sectorId: "b1",
    name: "Banks",
    qualifiedMeetings: 0,
    assessments: 0,
    positiveReplies: 12,
  });
  const results = computeSectorAllocations([hotels, banks], { dailyCapacity: 50, explorationPercent: 20 });
  const hotelAlloc = results.find((r) => r.sectorId === "h1")!.newAllocation;
  const bankAlloc = results.find((r) => r.sectorId === "b1")!.newAllocation;
  assert.ok(hotelAlloc > bankAlloc, `hotels ${hotelAlloc} should exceed banks ${bankAlloc}`);
  assert.match(results.find((r) => r.sectorId === "b1")!.reasoning, /no qualified meetings|reply volume alone/i);
});

test("immature sectors receive exploration allowance, not hot scaling", () => {
  const sector = base({
    sectorId: "new",
    name: "Restaurants",
    contacts: 5,
    minSampleSize: 30,
    daysObserved: 3,
    qualifiedMeetings: 1,
    positiveReplies: 1,
  });
  const [result] = computeSectorAllocations([sector], { dailyCapacity: 50, explorationPercent: 20 });
  assert.ok(result.newAllocation <= 15);
  assert.match(result.reasoning, /minimum sample|exploration/i);
});
