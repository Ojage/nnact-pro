// Send a staff reply to an inbound conversation.
//
// Why this is its own module rather than a flag on `runCampaignSend`: a reply
// is not a campaign step. It has no step to be due, no sequence to advance and
// no follow-up budget, and its thread may predate any campaign. What it must
// share with the campaign path is everything that makes a send safe and
// auditable, so this route deliberately reuses those pieces rather than
// re-implementing them:
//
//   • the suppression list, re-checked at send time
//   • the org-level Growth pause
//   • the transport policy, so a reply can only go out over an approved
//     transport and never onto the cold reputation
//   • the auditable outbound send log
//   • suppression-bypassing bounces
//
// The suppression re-check is the point of doing this through the log. An
// inbound message proves the address works, but a recipient can opt out between
// reading the thread and pressing send, and the inbox UI may be open for hours.
// Campaign sends re-check at send time for the same reason.

import { and, desc, eq } from "drizzle-orm";
import {
  db,
  growthCampaignRecipients,
  growthContactDetails,
  growthInboxMessages,
  growthInboxThreads,
  growthOutboundMessages,
  growthProspects,
  growthSenderIdentities,
  growthSuppressions,
} from "@nnact/db";
import { sendGrowthEmail } from "./delivery.js";
import { toSenderIdentity } from "./outbound.js";
import { isOrgGrowthSendingPaused } from "./pause.js";
import { normalizeEmail } from "./send-policy.js";
import { SendPolicyError } from "./send-policy.js";
import { assertTransportPermitsPurpose, type TransportId } from "./transport-policy.js";

export interface SendReplyInput {
  orgId: string;
  threadId: string;
  bodyText: string;
  subject?: string | null;
  sentByUserId: string;
  /** Overrides the thread subject; falls back to `Re: <original>`. */
  now?: Date;
}

export type SendReplyResult =
  | { status: "sent"; outboundMessageId: string }
  | { status: "duplicate"; outboundMessageId: string }
  | { status: "refused"; code: string; message: string };

const MAX_REPLY_LENGTH = 20_000;

/** Replies are idempotent per (thread, body) so a double-click cannot double-send. */
export function replyIdempotencyKey(threadId: string, bodyText: string): string {
  let hash = 0;
  const trimmed = bodyText.trim();
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0;
  }
  return `reply:${threadId}:${(hash >>> 0).toString(36)}:${trimmed.length}`;
}

export async function sendThreadReply(input: SendReplyInput): Promise<SendReplyResult> {
  const now = input.now ?? new Date();
  const bodyText = input.bodyText.trim();

  if (!bodyText) {
    return { status: "refused", code: "empty_reply", message: "reply body is required" };
  }
  if (bodyText.length > MAX_REPLY_LENGTH) {
    return {
      status: "refused",
      code: "reply_too_long",
      message: `reply exceeds ${MAX_REPLY_LENGTH} characters`,
    };
  }

  if (await isOrgGrowthSendingPaused(input.orgId)) {
    return {
      status: "refused",
      code: "growth_paused",
      message: "Growth is paused; replies are blocked until it is resumed.",
    };
  }

  const [thread] = await db
    .select()
    .from(growthInboxThreads)
    .where(and(eq(growthInboxThreads.id, input.threadId), eq(growthInboxThreads.orgId, input.orgId)))
    .limit(1);
  if (!thread) {
    return { status: "refused", code: "not_found", message: "thread not found" };
  }

  // A reply is a response to inbound mail, so it carries the permission-marketing
  // transport with its own purpose label.
  const transport: TransportId = "resend";
  try {
    assertTransportPermitsPurpose(transport, "reply");
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      return {
        status: "refused",
        code: String((error as { code: string }).code),
        message: error.message,
      };
    }
    throw error;
  }

  // The latest inbound message tells us which address to reply to.
  const [lastInbound] = await db
    .select()
    .from(growthInboxMessages)
    .where(
      and(
        eq(growthInboxMessages.orgId, input.orgId),
        eq(growthInboxMessages.threadId, input.threadId),
        eq(growthInboxMessages.direction, "INBOUND"),
      ),
    )
    .orderBy(desc(growthInboxMessages.createdAt))
    .limit(1);
  if (!lastInbound) {
    return {
      status: "refused",
      code: "no_inbound_message",
      message: "thread has no inbound message to reply to",
    };
  }
  const toEmail = lastInbound.fromEmail;

  // Re-check suppression at send time, not at read time.
  const normalizedTo = normalizeEmail(toEmail);
  if (!normalizedTo) {
    return { status: "refused", code: "unaddressable", message: "thread address is not a valid email" };
  }
  const [suppression] = await db
    .select({ reason: growthSuppressions.reason })
    .from(growthSuppressions)
    .where(
      and(
        eq(growthSuppressions.orgId, input.orgId),
        eq(growthSuppressions.scope, "EMAIL"),
        eq(growthSuppressions.normalizedValue, normalizedTo),
      ),
    )
    .limit(1);
  if (suppression) {
    return {
      status: "refused",
      code: "suppressed",
      message: `address is suppressed (${String(suppression.reason)}); replying would breach the suppression`,
    };
  }

  const [sender] = await db
    .select()
    .from(growthSenderIdentities)
    .where(
      and(
        eq(growthSenderIdentities.orgId, input.orgId),
        thread.senderIdentityId
          ? eq(growthSenderIdentities.id, thread.senderIdentityId)
          : eq(growthSenderIdentities.id, "-"),
      ),
    )
    .limit(1);
  if (!sender) {
    return {
      status: "refused",
      code: "no_sender",
      message: "thread has no sender identity; cannot determine who to reply as",
    };
  }

  const [recipient] = thread.campaignId
    ? await db
        .select()
        .from(growthCampaignRecipients)
        .where(
          and(
            eq(growthCampaignRecipients.orgId, input.orgId),
            eq(growthCampaignRecipients.campaignId, thread.campaignId),
            eq(growthCampaignRecipients.prospectId, thread.prospectId),
          ),
        )
        .limit(1)
    : [undefined];

  const subject = input.subject?.trim() || (thread.subject ? `Re: ${thread.subject}` : "Re: your enquiry");

  const idempotencyKey = replyIdempotencyKey(input.threadId, bodyText);
  const [existing] = await db
    .select({ id: growthOutboundMessages.id })
    .from(growthOutboundMessages)
    .where(and(eq(growthOutboundMessages.orgId, input.orgId), eq(growthOutboundMessages.idempotencyKey, idempotencyKey)))
    .limit(1);
  if (existing) {
    return { status: "duplicate", outboundMessageId: existing.id };
  }

  // Record the attempt before sending, exactly as the campaign path does.
  const [queued] = await db
    .insert(growthOutboundMessages)
    .values({
      orgId: input.orgId,
      campaignId: thread.campaignId,
      stepId: null,
      inboxThreadId: input.threadId,
      sentByUserId: input.sentByUserId,
      recipientId: recipient?.id ?? null,
      prospectId: thread.prospectId,
      idempotencyKey,
      purpose: "REPLY",
      transportId: transport,
      senderIdentityId: sender.id,
      toEmail,
      subject,
      subjectSnapshot: subject,
      bodyTextSnapshot: bodyText,
      fromEmail: sender.email,
      fromDisplayName: sender.displayName,
      status: "QUEUED",
    })
    .returning({ id: growthOutboundMessages.id });
  const outboundMessageId = queued!.id;

  const result = await sendGrowthEmail({
    orgId: input.orgId,
    toEmail,
    subject,
    bodyText,
    transport,
    senderIdentity: toSenderIdentity(sender),
    replyTo: sender.replyToEmail ?? undefined,
  });

  if (!result.ok) {
    await db
      .update(growthOutboundMessages)
      .set({ status: "FAILED", error: result.error ?? "send failed" })
      .where(eq(growthOutboundMessages.id, outboundMessageId));
    return { status: "refused", code: "send_failed", message: result.error ?? "send failed" };
  }

  await db
    .update(growthOutboundMessages)
    .set({ status: "SENT", providerMessageId: result.providerMessageId, sentAt: now })
    .where(eq(growthOutboundMessages.id, outboundMessageId));

  // Put the sent reply back on the thread so the conversation reads in order.
  await db.insert(growthInboxMessages).values({
    orgId: input.orgId,
    threadId: input.threadId,
    direction: "OUTBOUND",
    fromEmail: sender.email,
    toEmail,
    subject,
    bodyText,
    outboundMessageId,
  });
  await db
    .update(growthInboxThreads)
    .set({ needsHumanReply: false, lastMessageAt: now })
    .where(eq(growthInboxThreads.id, input.threadId));

  return { status: "sent", outboundMessageId };
}
