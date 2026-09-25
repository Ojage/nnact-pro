import assert from "node:assert/strict";
import { test } from "node:test";
import {
  SendPolicyError,
  assertFollowUpEligible,
  assertNotSuppressed,
  assertSendAllowed,
  assertSenderIdentityUsable,
  domainFromEmail,
  findSuppressionMatch,
  followUpStopReason,
  normalizeCompany,
  normalizeEmail,
  normalizePhone,
  type FollowUpState,
  type SenderIdentity,
  type SuppressionEntry,
} from "../src/growth/send-policy.js";

const verifiedIdentity: SenderIdentity = {
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

function suppression(partial: Partial<SuppressionEntry> & { scope: SuppressionEntry["scope"]; value: string }) {
  return {
    reason: "OPT_OUT" as const,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

test("an unverified sender identity cannot send", () => {
  const invented: SenderIdentity = {
    ...verifiedIdentity,
    displayName: "Made Up Person",
    email: "sales@nnact.com",
    verificationState: "PENDING",
    coldApproved: false,
    approvedBy: null,
    approvedAt: null,
  };
  assert.throws(
    () => assertSenderIdentityUsable(invented, { requireColdApproval: true }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "sender_identity_unverified",
  );
});

test("a verified identity still needs owner approval for cold mail", () => {
  const notApproved: SenderIdentity = { ...verifiedIdentity, coldApproved: false, approvedBy: null, approvedAt: null };
  assert.throws(
    () => assertSenderIdentityUsable(notApproved, { requireColdApproval: true }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "sender_identity_not_cold_approved",
  );
  // The same identity is fine for permission-based and transactional mail.
  assert.doesNotThrow(() => assertSenderIdentityUsable(notApproved, { requireColdApproval: false }));
});

test("approval must record who approved it and when", () => {
  const missingApprover: SenderIdentity = { ...verifiedIdentity, approvedBy: null };
  const missingTime: SenderIdentity = { ...verifiedIdentity, approvedAt: null };
  for (const identity of [missingApprover, missingTime]) {
    assert.throws(
      () => assertSenderIdentityUsable(identity, { requireColdApproval: true }),
      (error: unknown) => error instanceof SendPolicyError && error.code === "sender_identity_not_cold_approved",
    );
  }
});

test("a revoked or inactive identity cannot send", () => {
  assert.throws(
    () => assertSenderIdentityUsable({ ...verifiedIdentity, verificationState: "REVOKED" }, { requireColdApproval: false }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "sender_identity_unverified",
  );
  assert.throws(
    () => assertSenderIdentityUsable({ ...verifiedIdentity, isActive: false }, { requireColdApproval: false }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "sender_identity_inactive",
  );
});

test("email suppression matches case-insensitively", () => {
  const entries = [suppression({ scope: "EMAIL", value: "Blocked@Example.com" })];
  assert.throws(
    () => assertNotSuppressed(entries, { email: "blocked@example.COM" }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "suppressed" && error.scope === "EMAIL",
  );
  assert.doesNotThrow(() => assertNotSuppressed(entries, { email: "allowed@example.com" }));
});

test("domain suppression covers the domain and its subdomains only", () => {
  const entries = [suppression({ scope: "DOMAIN", value: "example.com", reason: "MANUAL_BLOCK" })];
  assert.ok(findSuppressionMatch(entries, { email: "a@example.com" }));
  assert.ok(findSuppressionMatch(entries, { email: "a@mail.example.com" }));
  assert.equal(findSuppressionMatch(entries, { email: "a@notexample.com" }), null);
  assert.equal(findSuppressionMatch(entries, { email: "a@example.com.evil.net" }), null);
});

test("a domain entry written as a full email still blocks that domain", () => {
  const entries = [suppression({ scope: "DOMAIN", value: "https://Mail.Example.com/contact" })];
  assert.ok(findSuppressionMatch(entries, { email: "anyone@mail.example.com" }));
});

test("phone and company suppression normalize before matching", () => {
  const entries = [
    suppression({ scope: "PHONE", value: "+27 11 555 0100" }),
    suppression({ scope: "COMPANY", value: "Acme Holdings Ltd." }),
  ];
  assert.ok(findSuppressionMatch(entries, { phone: "+27 11 555 0100" }));
  assert.ok(findSuppressionMatch(entries, { phone: "0027 11 555 0100" }));
  // National form resolves only when the country code is known.
  assert.ok(findSuppressionMatch(entries, { phone: "011 555 0100", countryCallingCode: "27" }));
  assert.equal(findSuppressionMatch(entries, { phone: "011 555 0100" }), null);
  assert.ok(findSuppressionMatch(entries, { company: "Acme Holdings" }));
  assert.equal(findSuppressionMatch(entries, { company: "Acme Holdings Two" }), null);
});

test("hard bounces and complaints suppress as well as opt-outs", () => {
  for (const reason of ["OPT_OUT", "HARD_BOUNCE", "COMPLAINT", "LEGAL_REQUEST"] as const) {
    const entries = [suppression({ scope: "EMAIL", value: "stop@example.com", reason })];
    assert.throws(
      () => assertNotSuppressed(entries, { email: "stop@example.com" }),
      (error: unknown) => error instanceof SendPolicyError && error.code === "suppressed",
    );
  }
});

test("normalizers handle messy real-world input", () => {
  assert.equal(normalizeEmail("  Person@Example.com "), "person@example.com");
  assert.equal(normalizeEmail(null), null);
  assert.equal(normalizePhone("+1 (555) 010-1234"), "15550101234");
  assert.equal(normalizePhone("011 555 0100"), "0115550100");
  assert.equal(normalizePhone("011 555 0100", { countryCallingCode: "27" }), "27115550100");
  assert.equal(normalizePhone("0044 20 7123 4567"), "442071234567");
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone("abc"), null);
  assert.equal(normalizeCompany("Acme, Inc."), "acme");
  assert.equal(domainFromEmail("person@mail.example.co.za"), "mail.example.co.za");
  assert.equal(domainFromEmail("not-an-email"), null);
});

test("follow-ups stop after a reply, meeting, opt-out, bounce or manual stop", () => {
  const base: FollowUpState = {
    hasReplied: false,
    hasOptedOut: false,
    hasHardBounced: false,
    meetingBooked: false,
    manuallyStopped: false,
    converted: false,
    maxFollowUps: 3,
    followUpsSent: 0,
  };
  assert.equal(followUpStopReason(base), null);
  assert.equal(followUpStopReason({ ...base, hasReplied: true }), "REPLIED");
  assert.equal(followUpStopReason({ ...base, meetingBooked: true }), "MEETING_BOOKED");
  assert.equal(followUpStopReason({ ...base, hasOptedOut: true }), "OPTED_OUT");
  assert.equal(followUpStopReason({ ...base, hasHardBounced: true }), "HARD_BOUNCED");
  assert.equal(followUpStopReason({ ...base, manuallyStopped: true }), "MANUALLY_STOPPED");
  assert.equal(followUpStopReason({ ...base, converted: true }), "CONVERTED");
  assert.equal(followUpStopReason({ ...base, followUpsSent: 3 }), "CONVERTED");
  assert.throws(
    () => assertFollowUpEligible({ ...base, hasReplied: true }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "follow_up_not_eligible",
  );
});

test("a booked meeting outranks an earlier reply flag", () => {
  const stop = followUpStopReason({
    hasReplied: true,
    hasOptedOut: false,
    hasHardBounced: false,
    meetingBooked: true,
    manuallyStopped: false,
    converted: false,
    maxFollowUps: 3,
    followUpsSent: 0,
  });
  assert.equal(stop, "MEETING_BOOKED");
});

test("assertSendAllowed blocks an invented sender before it can contact anyone", () => {
  const invented: SenderIdentity = {
    ...verifiedIdentity,
    displayName: "Ghost Persona",
    verificationState: "PENDING",
    coldApproved: false,
    approvedBy: null,
    approvedAt: null,
  };
  assert.throws(
    () =>
      assertSendAllowed({
        identity: invented,
        requireColdApproval: true,
        suppressions: [],
        target: { email: "lead@example.com" },
      }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "sender_identity_unverified",
  );
});

test("assertSendAllowed reports configuration errors before recipient problems", () => {
  const suppressions = [suppression({ scope: "EMAIL", value: "lead@example.com" })];
  // Invalid identity wins even when the recipient is also suppressed.
  assert.throws(
    () =>
      assertSendAllowed({
        identity: { ...verifiedIdentity, isActive: false },
        requireColdApproval: true,
        suppressions,
        target: { email: "lead@example.com" },
      }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "sender_identity_inactive",
  );
  // A valid identity still yields the suppression refusal.
  assert.throws(
    () =>
      assertSendAllowed({
        identity: verifiedIdentity,
        requireColdApproval: true,
        suppressions,
        target: { email: "lead@example.com" },
      }),
    (error: unknown) => error instanceof SendPolicyError && error.code === "suppressed" && error.scope === "EMAIL",
  );
});
