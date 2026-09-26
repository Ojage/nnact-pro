// Process verified inbound webhook events into threads, suppressions, and recipient signals.

import { and, eq } from "drizzle-orm";
import {
  db,
  growthCampaignRecipients,
  growthInboundWebhookEvents,
  growthInboxMessages,
  growthInboxThreads,
  growthSuppressions,
} from "@nnact/db";
import { classifyInboundReply } from "./reply-assist.js";
import { normalizeEmail } from "./send-policy.js";
import { resolveInboundContext } from "./conversations.js";
import type { NormalizedInboundEmail } from "./inbound-webhook.js";
import { sha256Hex } from "./inbound-webhook.js";

export type InboundProcessResult =
  | { status: "duplicate" }
  | { status: "processed"; threadId: string; messageId: string }
  | { status: "ignored"; reason: string };

export async function processInboundEmail(
  orgId: string,
  email: NormalizedInboundEmail,
  payloadRaw: string,
): Promise<InboundProcessResult> {
  const payloadSha256 = sha256Hex(payloadRaw);

  try {
    await db.insert(growthInboundWebhookEvents).values({
      orgId,
      provider: email.provider,
      externalId: email.externalId,
      payloadSha256,
      status: "PROCESSED",
    });
  } catch {
    return { status: "duplicate" };
  }

  const ctx = await resolveInboundContext(orgId, email.fromEmail, email.toEmail);
  if (!ctx.prospect) {
    await db
      .update(growthInboundWebhookEvents)
      .set({ status: "IGNORED", error: "unknown_prospect" })
      .where(
        and(
          eq(growthInboundWebhookEvents.orgId, orgId),
          eq(growthInboundWebhookEvents.provider, email.provider),
          eq(growthInboundWebhookEvents.externalId, email.externalId),
        ),
      );
    return { status: "ignored", reason: "unknown_prospect" };
  }

  const classification = classifyInboundReply(email.bodyText);

  let [thread] = await db
    .select()
    .from(growthInboxThreads)
    .where(and(eq(growthInboxThreads.orgId, orgId), eq(growthInboxThreads.prospectId, ctx.prospect.id)))
    .limit(1);

  if (!thread) {
    const [created] = await db
      .insert(growthInboxThreads)
      .values({
        orgId,
        prospectId: ctx.prospect.id,
        contactDetailId: ctx.contact?.id,
        senderIdentityId: ctx.sender?.id,
        subject: email.subject,
      })
      .returning();
    thread = created!;
  }

  const dedupeKey = `${email.provider}:${email.externalId}`;
  let messageId: string;
  try {
    const [msg] = await db
      .insert(growthInboxMessages)
      .values({
        orgId,
        threadId: thread.id,
        direction: "INBOUND",
        fromEmail: email.fromEmail,
        toEmail: email.toEmail,
        subject: email.subject,
        bodyText: email.bodyText,
        intent: classification.intent,
        classifiedAt: new Date(),
        providerMessageId: email.providerMessageId,
        inboundDedupeKey: dedupeKey,
      })
      .returning({ id: growthInboxMessages.id });
    messageId = msg!.id;
  } catch {
    return { status: "duplicate" };
  }

  await db
    .update(growthInboxThreads)
    .set({
      lastMessageAt: new Date(),
      needsHumanReply: classification.requiresHuman,
      verificationRequestedAt: classification.verificationRequested ? new Date() : thread.verificationRequestedAt,
      subject: email.subject ?? thread.subject,
    })
    .where(eq(growthInboxThreads.id, thread.id));

  if (thread.campaignId) {
    await db
      .update(growthCampaignRecipients)
      .set({
        status: classification.intent === "UNSUBSCRIBE" ? "OPTED_OUT" : "REPLIED",
        repliedAt: new Date(),
        optedOutAt: classification.intent === "UNSUBSCRIBE" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(growthCampaignRecipients.orgId, orgId),
          eq(growthCampaignRecipients.campaignId, thread.campaignId),
          eq(growthCampaignRecipients.prospectId, ctx.prospect.id),
        ),
      );
  }

  if (classification.intent === "UNSUBSCRIBE") {
    const normalized = normalizeEmail(email.fromEmail);
    if (normalized) {
      await db
        .insert(growthSuppressions)
        .values({
          orgId,
          scope: "EMAIL",
          value: email.fromEmail,
          normalizedValue: normalized,
          reason: "OPT_OUT",
          note: "Recorded from inbound webhook",
        })
        .onConflictDoNothing({
          target: [growthSuppressions.orgId, growthSuppressions.scope, growthSuppressions.normalizedValue],
        });
    }
  }

  return { status: "processed", threadId: thread.id, messageId };
}
