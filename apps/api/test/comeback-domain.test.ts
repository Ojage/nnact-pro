import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionComeback,
  computeComebackRate,
  DEFAULT_COMEBACK_SETTINGS,
  evalComebackWarranty,
  findComebackDuplicate,
  isOpenComeback,
  nextComebackRepeatNumber,
  normalizeComebackSettings,
  sumComebackCosts,
  COMEBACK_STATUS_LABEL,
} from "@nnact/shared";
import { comebackSeqNumber } from "../src/comeback-utils.js";

const DAY = 86_400_000;

test("comebackSeqNumber formats prefix, year and zero-padded sequence", () => {
  assert.equal(comebackSeqNumber("NNACT/RET", 2026, 0, 1000), "NNACT/RET/2026/001000");
  assert.equal(comebackSeqNumber("NNACT/RET", 2026, 1, 1000), "NNACT/RET/2026/001001");
  assert.equal(comebackSeqNumber("NNACT/RET", 2026, 26, 1000), "NNACT/RET/2026/001026");
});

test("evalComebackWarranty is UNCLEAR without a documented completion date", () => {
  const result = evalComebackWarranty({ workmanshipWarrantyDays: 90, partsWarrantyDays: 90, completedAt: null });
  assert.equal(result.status, "UNCLEAR");
  assert.equal(result.workmanshipEndsAt, null);
  assert.equal(result.partsEndsAt, null);
});

test("evalComebackWarranty is FULL right after completion within both windows", () => {
  const completedAt = new Date(Date.now() - 5 * DAY);
  const now = completedAt.getTime() + 5 * DAY;
  const result = evalComebackWarranty({ workmanshipWarrantyDays: 90, partsWarrantyDays: 90, completedAt, now: new Date(now) });
  assert.equal(result.status, "FULL");
  assert.equal(result.workmanshipEndsAt.getTime(), completedAt.getTime() + 90 * DAY);
  assert.equal(result.partsEndsAt.getTime(), completedAt.getTime() + 90 * DAY);
});

test("evalComebackWarranty reports PARTS-only when parts warranty outlives workmanship", () => {
  const completedAt = new Date(Date.now() - 120 * DAY);
  const partsExpiry = new Date(Date.now() + 10 * DAY);
  const now = Date.now();
  const result = evalComebackWarranty({
    workmanshipWarrantyDays: 90,
    partsWarrantyDays: 90,
    completedAt,
    equipmentWarrantyExpiry: partsExpiry,
    now: new Date(now),
  });
  assert.equal(result.status, "PARTS");
  assert.equal(result.partsEndsAt.getTime(), partsExpiry.getTime());
});

test("evalComebackWarranty reports OUT_OF_WARRANTY after both windows lapse", () => {
  const completedAt = new Date(Date.now() - 200 * DAY);
  const result = evalComebackWarranty({ workmanshipWarrantyDays: 90, partsWarrantyDays: 90, completedAt, now: new Date() });
  assert.equal(result.status, "OUT_OF_WARRANTY");
});

test("canTransitionComeback follows the lifecycle matrix", () => {
  assert.equal(canTransitionComeback("REPORTED", "TRIAGED"), true);
  assert.equal(canTransitionComeback("UNDER_INVESTIGATION", "RESOLVED"), true);
  assert.equal(canTransitionComeback("RESOLVED", "MONITORING"), true);
  assert.equal(canTransitionComeback("MONITORING", "CLOSED"), true);
  assert.equal(canTransitionComeback("CLOSED", "REPORTED"), true, "reopen");
  assert.equal(canTransitionComeback("DISPUTED", "RESOLVED"), true);
  assert.equal(canTransitionComeback("REPORTED", "RESOLVED"), false, "skip straight to resolved");
  assert.equal(canTransitionComeback("REPORTED", "CLOSED"), true, "direct close allowed");
  assert.equal(canTransitionComeback("CLOSED", "MONITORING"), false);
});

test("canTransitionComeback allows same-status no-op transitions", () => {
  for (const status of ["REPORTED", "TRIAGED", "SCHEDULED", "UNDER_INVESTIGATION", "WAITING_FOR_PART", "AWAITING_VERIFICATION", "RESOLVED", "MONITORING", "CLOSED", "DISPUTED", "NOT_A_COMEBACK"] as const) {
    assert.equal(canTransitionComeback(status, status), true, status);
  }
});

test("isOpenComeback marks workable states open and terminal states closed", () => {
  assert.equal(isOpenComeback("REPORTED"), true);
  assert.equal(isOpenComeback("MONITORING"), true);
  assert.equal(isOpenComeback("CLOSED"), false);
  assert.equal(isOpenComeback("NOT_A_COMEBACK"), false);
});

test("findComebackDuplicate warns on a recent open case for the same job", () => {
  const now = new Date();
  const candidates = [
    { id: "c1", caseNumber: "NNACT/RET/2026/001001", originalJobId: "job-1", complaintSummary: "No cooling again", createdAt: new Date(now.getTime() - 3 * DAY) },
    { id: "c2", caseNumber: "NNACT/RET/2026/001002", originalJobId: "job-2", complaintSummary: "Leak", createdAt: new Date(now.getTime() - 3 * DAY) },
  ];
  const match = findComebackDuplicate(candidates, "job-1", "No cooling", { duplicateWindowDays: 30, now });
  assert.ok(match);
  assert.equal(match?.caseNumber, "NNACT/RET/2026/001001");
});

test("findComebackDuplicate ignores other jobs and stale cases", () => {
  const now = new Date();
  assert.equal(findComebackDuplicate([], "job-1", "No cooling again", { now }), null);
  assert.equal(
    findComebackDuplicate([{ id: "c1", caseNumber: "x", originalJobId: "job-other", complaintSummary: "No cooling again", createdAt: new Date(now.getTime() - 3 * DAY) }], "job-1", "No cooling again", { now }),
    null,
  );
});

test("nextComebackRepeatNumber counts prior cases plus one", () => {
  assert.equal(nextComebackRepeatNumber(0), 1);
  assert.equal(nextComebackRepeatNumber(4), 5);
});

test("sumComebackCosts buckets cost classes", () => {
  const totals = sumComebackCosts([
    { costClass: "QUALITY_COST", amountCents: 2500 },
    { costClass: "BILLABLE_COMEBACK", amountCents: 18000 },
    { costClass: "SUPPLIER_RECOVERABLE", amountCents: 40000 },
  ]);
  assert.deepEqual(totals, { internalCostCents: 2500, billableCents: 18000, supplierRecoverableCents: 40000 });
});

test("computeComebackRate guards against zero completed jobs", () => {
  assert.deepEqual(computeComebackRate([], []), { completedJobs: 0, comebackCases: 0, ratePct: 0 });
});

test("computeComebackRate counts unique original jobs per completed set", () => {
  const rate = computeComebackRate(["j1", "j2", "j3"], ["j1", "j1", "j4"]);
  assert.equal(rate.completedJobs, 3);
  assert.equal(rate.comebackCases, 1);
  assert.equal(rate.ratePct, (1 / 3) * 100);
});

test("normalizeComebackSettings fills all policy defaults", () => {
  const merged = normalizeComebackSettings(null);
  assert.deepEqual(merged, DEFAULT_COMEBACK_SETTINGS);
  const partial = normalizeComebackSettings({ escalationAfterCount: 5 });
  assert.equal(partial.escalationAfterCount, 5);
  assert.equal(partial.monitoringDays, DEFAULT_COMEBACK_SETTINGS.monitoringDays);
  assert.deepEqual(partial.slaAttendanceHours, DEFAULT_COMEBACK_SETTINGS.slaAttendanceHours);
});

test("comeback status label map renders display text", () => {
  assert.equal(COMEBACK_STATUS_LABEL.CLOSED, "Closed");
  assert.equal(COMEBACK_STATUS_LABEL.NOT_A_COMEBACK, "Not a comeback");
});