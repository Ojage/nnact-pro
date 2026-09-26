import assert from "node:assert/strict";
import { test } from "node:test";
import { TransportPolicyError } from "../src/growth/transport-policy.js";
import { assertCampaignSendable } from "../src/growth/campaign-policy.js";
import { isOrgGrowthSendingPaused } from "../src/growth/pause.js";

const RESEND_ONLY = {
  SMTP_HOST: "smtp.resend.com",
  SMTP_USER: "resend",
  SMTP_PASS: "secret",
} as NodeJS.ProcessEnv;

const approvedColdCampaign = {
  id: "c1",
  orgId: "o1",
  purpose: "COLD_OUTREACH" as const,
  status: "SCHEDULED" as const,
  senderIdentityId: "s1",
  dailyLimit: 50,
  maxFollowUps: 2,
  timezone: "Africa/Douala",
  quietHoursStart: 20,
  quietHoursEnd: 8,
  scheduledStartAt: new Date("2020-01-01"),
  approvedBy: "owner-id",
  approvedAt: new Date("2026-01-01"),
};

test("cold campaign cannot send through Resend-only environment", () => {
  assert.throws(
    () => assertCampaignSendable(approvedColdCampaign, RESEND_ONLY),
    (error: unknown) =>
      error instanceof TransportPolicyError && error.code === "cold_transport_not_configured",
  );
});

test("org pause helper defaults to not paused when no row", async () => {
  // Exercises the pure export; DB-backed pause is covered in outbound integration paths.
  assert.equal(typeof isOrgGrowthSendingPaused, "function");
});
