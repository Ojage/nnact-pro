// Unified conversations — mirror outbound sends into inbox threads.

import { and, eq } from "drizzle-orm";
import {
  db,
  growthCampaignRecipients,
  growthContactDetails,
  growthInboxMessages,
  growthInboxThreads,
  growthOutboundMessages,
  growthProspects,
  growthSenderIdentities,
} from "@nnact/db";

export interface MirrorOutboundInput {
  orgId: string;
  outboundMessageId: string;
  campaignId: string;
  recipientId: string;
  prospectId: string;
  senderIdentityId: string;
  toEmail: string;
  subject: string;
  bodyText: string;
  providerMessageId?: string | null;
}

export async function mirrorOutboundToConversation(input: MirrorOutboundInput): Promise<string | null> {
  const [sender] = await db
    .select()
    .from(growthSenderIdentities)
    .where(and(eq(growthSenderIdentities.orgId, input.orgId), eq(growthSenderIdentities.id, input.senderIdentityId)))
    .limit(1);
  if (!sender) return null;

  const [recipient] = await db
    .select({ contactDetailId: growthCampaignRecipients.contactDetailId })
    .from(growthCampaignRecipients)
    .where(and(eq(growthCampaignRecipients.orgId, input.orgId), eq(growthCampaignRecipients.id, input.recipientId)))
    .limit(1);

  let threadId: string | null = null;
  const [existingThread] = await db
    .select({ id: growthInboxThreads.id })
    .from(growthInboxThreads)
    .where(
      and(
        eq(growthInboxThreads.orgId, input.orgId),
        eq(growthInboxThreads.prospectId, input.prospectId),
        eq(growthInboxThreads.campaignId, input.campaignId),
      ),
    )
    .limit(1);

  if (existingThread) {
    threadId = existingThread.id;
  } else {
    const [created] = await db
      .insert(growthInboxThreads)
      .values({
        orgId: input.orgId,
        prospectId: input.prospectId,
        contactDetailId: recipient?.contactDetailId,
        campaignId: input.campaignId,
        senderIdentityId: input.senderIdentityId,
        subject: input.subject,
      })
      .returning({ id: growthInboxThreads.id });
    threadId = created?.id ?? null;
  }
  if (!threadId) return null;

  await db.insert(growthInboxMessages).values({
    orgId: input.orgId,
    threadId,
    direction: "OUTBOUND",
    fromEmail: sender.email,
    toEmail: input.toEmail,
    subject: input.subject,
    bodyText: input.bodyText,
    providerMessageId: input.providerMessageId,
    outboundMessageId: input.outboundMessageId,
  });

  await db
    .update(growthOutboundMessages)
    .set({ inboxThreadId: threadId })
    .where(and(eq(growthOutboundMessages.orgId, input.orgId), eq(growthOutboundMessages.id, input.outboundMessageId)));

  await db
    .update(growthInboxThreads)
    .set({ lastMessageAt: new Date() })
    .where(eq(growthInboxThreads.id, threadId));

  return threadId;
}

/** Resolve org + prospect from inbound addresses. */
export async function resolveInboundContext(orgId: string, fromEmail: string, toEmail: string) {
  const normalizedFrom = fromEmail.trim().toLowerCase();
  const normalizedTo = toEmail.trim().toLowerCase();

  const [sender] = await db
    .select()
    .from(growthSenderIdentities)
    .where(and(eq(growthSenderIdentities.orgId, orgId), eq(growthSenderIdentities.email, normalizedTo)))
    .limit(1);

  const contacts = await db
    .select({
      contact: growthContactDetails,
      prospect: growthProspects,
    })
    .from(growthContactDetails)
    .innerJoin(growthProspects, eq(growthContactDetails.prospectId, growthProspects.id))
    .where(
      and(eq(growthContactDetails.orgId, orgId), eq(growthContactDetails.normalizedValue, normalizedFrom)),
    )
    .limit(1);

  return {
    sender,
    contact: contacts[0]?.contact ?? null,
    prospect: contacts[0]?.prospect ?? null,
  };
}
