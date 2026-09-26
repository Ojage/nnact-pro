import assert from "node:assert/strict";
import { test } from "node:test";
import { SendPolicyError } from "../src/growth/send-policy.js";
import { TransportPolicyError } from "../src/growth/transport-policy.js";
import {
  assertCampaignSendable,
  checkRecipientSendEligibility,
  isSendableStatus,
  isTerminalStatus,
  outboundIdempotencyKey,
  purposeToMessagePurpose,
  recipientFollowUpState,
  type CampaignLike,
  type RecipientState,
} from "../src/growth/campaign-policy.js";
import type { SenderIdentity, SuppressionEntry } from "../src/growth/send-policy.js";

const COLD_ENV = {
  COLD_SMTP_HOST: "smtp.cold.example",
  COLD_SMTP_USER: "outreach",
  COLD_SMTP_PASS: "secret",
} as NodeJS.ProcessEnv;

const RESEND_ENV = {
  SMTP_HOST: "smtp.resend.com",
  SMTP_USER: "resend",
  SMTP_PASS: "secret",
} as NodeJS.ProcessEnv;

const identity: SenderIdentity = {
  id: "11111111-1111-1111-1111-111111111111",
  displayName: "Dana Reeves",
  email: "dana@nnact.com",
  role: "Owner",
  verificationState: "VERIFIED",
  isActive: true,
  coldApproved: true,
  approvedBy: "22222222-2222-2222-2222-222222222222",
  approvedAt: "2026-01-05T00:00:00.000Z",
};

const approvedBy: CampaignLike["approvedBy"] = "22222222-2222-2222-2222-222222222222";

function campaign(overrides: Partial<CampaignLike> = {}): CampaignLike {
  return {
    id: "33333333-3333-3333-3333-333333333333",
    purpose: "PERMISSION_MARKETING",
    status: "SCHEDULED",
    approvedAt: "2026-01-06T00:00:00.000Z",
    approvedBy,
    ...overrides,
  };
}

function recipient(overrides: Partial<RecipientState> = {}): RecipientState {
  return { id: "44444444-4444-4444-4444-444444444444", followUpsSent: 0, ...overrides };
}

test("an unapproved or unscheduled campaign cannot send", () => {
  for (const status of ["DRAFT", "IN_REVIEW", "APPROVED", "PAUSED", "COMPLETED", "CANCELLED"] as const) {
    assert.equal(isSendableStatus(status), false);
    assert.throws(
      () => assertCampaignSendable(campaign({ status }), RESEND_ENV),
      (error: unknown) => error instanceof SendPolicyError && error.code === "campaign_not_sendable",
    );
  }
  assert.equal(isSendableStatus("SCHEDULED"), true);
  assert.equal(isSendableStatus("RUNNING"), true);
});

test("a scheduled campaign without a recorded approval cannot send", () => {
  assert.throws(
    () => assertCampaignSendable(campaign({ approvedAt: null }), RESEND_ENV),
    (error: unknown) => error instanceof SendPolicyError && error.code === "campaign_not_approved",
  );
  assert.throws(
    () => assertCampaignSendable(campaign({ approvedBy: null }), RESEND_ENV),
    (error: unknown) => error instanceof SendPolicyError && error.code === "campaign_not_approved",
  );
});

test("permission marketing may use the shared Resend transport", () => {
  const result = assertCampaignSendable(campaign(), RESEND_ENV);
  assert.equal(result.transport, "resend");
  assert.equal(result.requireColdApproval, false);
});

test("cold outreach never resolves to Resend", () => {
  // Even with a working Resend connection, a cold campaign must be refused.
  assert.throws(
    () => assertCampaignSendable(campaign({ purpose: "COLD_OUTREACH" }), RESEND_ENV),
    (error: unknown) =>
      error instanceof TransportPolicyError && error.code === "cold_transport_not_configured",
  );
});

test("cold outreach is allowed only once a cold transport is configured", () => {
  const result = assertCampaignSendable(campaign({ purpose: "COLD_OUTREACH" }), COLD_ENV);
  assert.equal(result.transport, "cold_transport");
  assert.equal(result.requireColdApproval, true);
});

test("existing-customer campaigns are treated as transactional", () => {
  assert.equal(purposeToMessagePurpose("EXISTING_CUSTOMER"), "transactional");
  const result = assertCampaignSendable(campaign({ purpose: "EXISTING_CUSTOMER" }), RESEND_ENV);
  assert.equal(result.transport, "resend");
});

test("terminal statuses are recognised", () => {
  assert.equal(isTerminalStatus("COMPLETED"), true);
  assert.equal(isTerminalStatus("CANCELLED"), true);
  assert.equal(isTerminalStatus("PAUSED"), false);
});

test("the idempotency key is stable per recipient and step", () => {
  const key = outboundIdempotencyKey("campaign-1", "recipient-1", 2);
  assert.equal(key, "campaign-1:recipient-1:2");
  assert.equal(outboundIdempotencyKey("campaign-1", "recipient-1", 2), key);
  assert.notEqual(outboundIdempotencyKey("campaign-1", "recipient-1", 3), key);
});

test("an eligible recipient is cleared to send", () => {
  const result = checkRecipientSendEligibility({
    identity,
    requireColdApproval: false,
    recipient: recipient(),
    maxFollowUps: 2,
    suppressions: [],
    target: { email: "lead@example.com" },
  });
  assert.deepEqual(result, { ok: true });
});

test("a suppressed recipient is marked suppressed, not failed", () => {
  const suppressions: SuppressionEntry[] = [
    { scope: "EMAIL", value: "lead@example.com", reason: "OPT_OUT", createdAt: "2026-01-01" },
  ];
  const result = checkRecipientSendEligibility({
    identity,
    requireColdApproval: false,
    recipient: recipient(),
    maxFollowUps: 2,
    suppressions,
    target: { email: "lead@example.com" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "suppressed");
    assert.equal(result.status, "SUPPRESSED");
  }
});

test("a replied thread skips the follow-up", () => {
  const result = checkRecipientSendEligibility({
    identity,
    requireColdApproval: false,
    recipient: recipient({ repliedAt: "2026-02-01" }),
    maxFollowUps: 3,
    suppressions: [],
    target: { email: "lead@example.com" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "SKIPPED");
    assert.match(result.reason, /replied/);
  }
});

test("a booked meeting stops the sequence even after a reply", () => {
  const result = checkRecipientSendEligibility({
    identity,
    requireColdApproval: false,
    recipient: recipient({ repliedAt: "2026-02-01", meetingBookedAt: "2026-02-02" }),
    maxFollowUps: 3,
    suppressions: [],
    target: { email: "lead@example.com" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.reason, /meeting booked/);
});

test("exhausted follow-ups are skipped", () => {
  const result = checkRecipientSendEligibility({
    identity,
    requireColdApproval: false,
    recipient: recipient({ followUpsSent: 2 }),
    maxFollowUps: 2,
    suppressions: [],
    target: { email: "lead@example.com" },
  });
  assert.equal(result.ok, false);
});

test("an unverified sender blocks the whole campaign, reported as BLOCKED", () => {
  const result = checkRecipientSendEligibility({
    identity: { ...identity, verificationState: "PENDING", coldApproved: false, approvedBy: null, approvedAt: null },
    requireColdApproval: true,
    recipient: recipient(),
    maxFollowUps: 2,
    suppressions: [],
    target: { email: "lead@example.com" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "BLOCKED");
    assert.equal(result.code, "sender_identity_unverified");
  }
});

test("a cold send requires cold approval even with a verified identity", () => {
  const result = checkRecipientSendEligibility({
    identity: { ...identity, coldApproved: false, approvedBy: null, approvedAt: null },
    requireColdApproval: true,
    recipient: recipient(),
    maxFollowUps: 2,
    suppressions: [],
    target: { email: "lead@example.com" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.code, "sender_identity_not_cold_approved");
});

test("a sender problem is reported before a recipient problem", () => {
  const suppressions: SuppressionEntry[] = [
    { scope: "EMAIL", value: "lead@example.com", reason: "OPT_OUT", createdAt: "2026-01-01" },
  ];
  const result = checkRecipientSendEligibility({
    identity: { ...identity, isActive: false },
    requireColdApproval: false,
    recipient: recipient(),
    maxFollowUps: 2,
    suppressions,
    target: { email: "lead@example.com" },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.status, "BLOCKED");
});

test("recipient state maps every stop signal", () => {
  const base = { hasReplied: false, hasOptedOut: false, hasHardBounced: false, meetingBooked: false, manuallyStopped: false, converted: false, maxFollowUps: 2, followUpsSent: 0 };
  assert.deepEqual(recipientFollowUpState(recipient(), 2), base);
  const state = recipientFollowUpState(recipient({ bouncedAt: "2026-01-01" }), 2);
  assert.equal(state.hasHardBounced, true);
});
