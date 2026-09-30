// Campaign-level sending policy for the Growth & Outreach module.
//
// A campaign may only send when every condition below holds. The checks are
// pure and ordered from "is this configuration legal at all" to "is this
// particular send allowed right now", so a refusal names the actual problem
// rather than a downstream symptom.
//
// The conditions, in order:
//   1. An owner has approved the campaign. Drafts never send.
//   2. The campaign's purpose is permitted on the transport it would use. Cold
//      outreach cannot be carried by the Resend connection (provider AUP).
//   3. Cold outreach additionally requires a configured cold transport, which
//      is off until an operator provides one.
//   4. The sender identity is verified, active and — for cold — owner approved.
//   5. The recipient is not suppressed and no stop signal is set.

import type { MessagePurpose } from "./transport-policy.js";
import {
  TransportPolicyError,
  assertTransportPermitsPurpose,
  isColdSendingEnabled,
  transportForPurpose,
} from "./transport-policy.js";
import {
  SendPolicyError,
  assertSenderIdentityUsable,
  findSuppressionMatch,
  followUpStopReason,
  followUpStopPhrase,
  type FollowUpState,
  type SenderIdentity,
  type SuppressionEntry,
  type SuppressionTarget,
} from "./send-policy.js";

/**
 * Includes REPLY for a staff reply to an inbound conversation. A reply is not a
 * campaign step, so it never reaches `assertCampaignSendable`; the value exists
 * on the outbound send log so a reply is never mistaken for a campaign send.
 */
export type CampaignPurpose = "COLD_OUTREACH" | "PERMISSION_MARKETING" | "EXISTING_CUSTOMER" | "REPLY";
export type CampaignStatus =
  | "DRAFT"
  | "RESEARCHING"
  | "READY_FOR_REVIEW"
  | "IN_REVIEW"
  | "APPROVED"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

/** Campaign purposes that may be delivered over the shared (Resend) transport. */
const PURPOSE_ALLOWED_TRANSPORTS: Record<CampaignPurpose, readonly MessagePurpose[]> = {
  // Resend's AUP prohibits unsolicited mail.
  COLD_OUTREACH: ["cold_outreach"],
  PERMISSION_MARKETING: ["permission_marketing", "transactional"],
  EXISTING_CUSTOMER: ["permission_marketing", "transactional"],
  // A reply goes out because the recipient wrote first, so it rides the shared
  // transport like opted-in mail. Listed here for completeness: a REPLY purpose
  // is only ever written by the reply path, which sets the transport directly.
  REPLY: ["permission_marketing", "reply"],
};

/** Statuses in which the scheduler may pick a campaign up and send. */
export const SENDBLE_STATUSES: readonly CampaignStatus[] = ["SCHEDULED", "RUNNING"];

export function isSendableStatus(status: CampaignStatus): boolean {
  return SENDBLE_STATUSES.includes(status);
}

export function isTerminalStatus(status: CampaignStatus): boolean {
  return status === "COMPLETED" || status === "CANCELLED";
}

/** The message purpose a campaign purpose maps to on the wire. */
export function purposeToMessagePurpose(purpose: CampaignPurpose): MessagePurpose {
  switch (purpose) {
    case "COLD_OUTREACH":
      return "cold_outreach";
    case "PERMISSION_MARKETING":
      return "permission_marketing";
    case "EXISTING_CUSTOMER":
      // Existing customers are a relationship, so their mail is transactional.
      return "transactional";
    case "REPLY":
      // A response to inbound mail, not an unsolicited send.
      return "reply";
    default: {
      const exhaustive: never = purpose;
      throw new TransportPolicyError("unknown_campaign_purpose", `unknown purpose: ${String(exhaustive)}`);
    }
  }
}

export interface CampaignLike {
  id: string;
  purpose: CampaignPurpose;
  status: CampaignStatus;
  approvedAt?: Date | string | null;
  approvedBy?: string | null;
}

/**
 * Throws unless the campaign is approved and its purpose may legally use the
 * transport it resolves to. Called before a campaign is scheduled and again
 * before each send, so revoking approval stops an in-flight campaign.
 */
export function assertCampaignSendable(
  campaign: CampaignLike,
  env: NodeJS.ProcessEnv = process.env,
): { transport: ReturnType<typeof transportForPurpose>; requireColdApproval: boolean } {
  if (!isSendableStatus(campaign.status)) {
    throw new SendPolicyError(
      "campaign_not_sendable",
      `campaign is ${campaign.status.toLowerCase().replace(/_/g, " ")}; it must be approved and scheduled before it sends`,
      409,
    );
  }
  if (!campaign.approvedAt || !campaign.approvedBy) {
    throw new SendPolicyError(
      "campaign_not_approved",
      "campaign has not been approved by an owner",
      409,
    );
  }

  const messagePurpose = purposeToMessagePurpose(campaign.purpose);
  const transport = transportForPurpose(messagePurpose);
  assertTransportPermitsPurpose(transport, messagePurpose);

  // Confirms the purpose is not merely transport-compatible but intended for it.
  const allowed = PURPOSE_ALLOWED_TRANSPORTS[campaign.purpose];
  if (!allowed.includes(messagePurpose)) {
    throw new TransportPolicyError(
      "purpose_not_permitted",
      `campaign purpose "${campaign.purpose}" may not be sent as "${messagePurpose}"`,
    );
  }

  if (campaign.purpose === "COLD_OUTREACH" && !isColdSendingEnabled(env)) {
    throw new TransportPolicyError(
      "cold_transport_not_configured",
      "cold outreach is disabled: no approved cold-outreach transport is configured",
      503,
    );
  }

  return { transport, requireColdApproval: campaign.purpose === "COLD_OUTREACH" };
}

/** Builds the idempotency key for one recipient+step delivery. */
export function outboundIdempotencyKey(
  campaignId: string,
  recipientId: string,
  stepNumber: number,
): string {
  return `${campaignId}:${recipientId}:${stepNumber}`;
}

export interface RecipientState {
  id: string;
  followUpsSent: number;
  repliedAt?: Date | string | null;
  optedOutAt?: Date | string | null;
  bouncedAt?: Date | string | null;
  meetingBookedAt?: Date | string | null;
  manuallyStoppedAt?: Date | string | null;
  convertedAt?: Date | string | null;
}

export function recipientFollowUpState(
  recipient: RecipientState,
  maxFollowUps: number,
): FollowUpState {
  return {
    hasReplied: Boolean(recipient.repliedAt),
    hasOptedOut: Boolean(recipient.optedOutAt),
    hasHardBounced: Boolean(recipient.bouncedAt),
    meetingBooked: Boolean(recipient.meetingBookedAt),
    manuallyStopped: Boolean(recipient.manuallyStoppedAt),
    converted: Boolean(recipient.convertedAt),
    maxFollowUps,
    followUpsSent: recipient.followUpsSent,
  };
}

/**
 * The per-send gate. Returns a refusal reason instead of sending, and never
 * throws for a recipient-level problem so the caller can log the event and
 * continue with the rest of the campaign.
 */
export function checkRecipientSendEligibility(input: {
  identity: SenderIdentity | null | undefined;
  requireColdApproval: boolean;
  recipient: RecipientState;
  maxFollowUps: number;
  suppressions: readonly SuppressionEntry[];
  target: SuppressionTarget;
}): { ok: true } | { ok: false; code: string; reason: string; status: "SUPPRESSED" | "BLOCKED" | "SKIPPED" } {
  try {
    assertSenderIdentityUsable(input.identity, {
      requireColdApproval: input.requireColdApproval,
    });
  } catch (error) {
    if (error instanceof SendPolicyError) {
      return { ok: false, code: error.code, reason: error.message, status: "BLOCKED" };
    }
    throw error;
  }

  const suppression = findSuppressionMatch(input.suppressions, input.target);
  if (suppression) {
    return {
      ok: false,
      code: "suppressed",
      reason: `suppressed (${suppression.scope}: ${suppression.reason})`,
      status: "SUPPRESSED",
    };
  }

  const stop = followUpStopReason(recipientFollowUpState(input.recipient, input.maxFollowUps));
  if (stop) {
    return {
      ok: false,
      code: "follow_up_not_eligible",
      reason: followUpStopPhrase(stop),
      status: "SKIPPED",
    };
  }

  return { ok: true };
}
