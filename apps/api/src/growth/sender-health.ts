import { and, count, countDistinct, eq, gte, isNotNull, or } from "drizzle-orm";
import { db, growthCampaignRecipients, growthOutboundMessages, growthSenderIdentities } from "@nnact/db";

export interface SenderHealthRow {
  senderId: string;
  displayName: string;
  email: string;
  verificationState: string;
  coldApproved: boolean;
  sent30d: number;
  failed30d: number;
  blocked30d: number;
  bounceSignals: number;
  alerts: string[];
}

export async function computeSenderHealth(orgId: string): Promise<SenderHealthRow[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const senders = await db
    .select()
    .from(growthSenderIdentities)
    .where(eq(growthSenderIdentities.orgId, orgId));

  const rows: SenderHealthRow[] = [];
  for (const sender of senders) {
    const [sent] = await db
      .select({ n: count() })
      .from(growthOutboundMessages)
      .where(
        and(
          eq(growthOutboundMessages.orgId, orgId),
          eq(growthOutboundMessages.senderIdentityId, sender.id),
          eq(growthOutboundMessages.status, "SENT"),
          gte(growthOutboundMessages.sentAt, since),
        ),
      );
    const [failed] = await db
      .select({ n: count() })
      .from(growthOutboundMessages)
      .where(
        and(
          eq(growthOutboundMessages.orgId, orgId),
          eq(growthOutboundMessages.senderIdentityId, sender.id),
          eq(growthOutboundMessages.status, "FAILED"),
          gte(growthOutboundMessages.createdAt, since),
        ),
      );
    const [blocked] = await db
      .select({ n: count() })
      .from(growthOutboundMessages)
      .where(
        and(
          eq(growthOutboundMessages.orgId, orgId),
          eq(growthOutboundMessages.senderIdentityId, sender.id),
          eq(growthOutboundMessages.status, "BLOCKED"),
          gte(growthOutboundMessages.createdAt, since),
        ),
      );

    const alerts: string[] = [];
    if (sender.verificationState !== "VERIFIED") {
      alerts.push("Sender inbox is not verified — campaigns cannot use this identity.");
    }
    if (!sender.coldApproved && sender.verificationState === "VERIFIED") {
      alerts.push("Cold outreach not owner-approved for this identity.");
    }
    const failedN = Number(failed?.n ?? 0);
    const sentN = Number(sent?.n ?? 0);
    if (sentN > 10 && failedN / sentN > 0.15) {
      alerts.push("Elevated send failures in the last 30 days — check provider configuration.");
    }

    // Real bounce and complaint signals attributed to this identity's own sends.
    // This was hardcoded to 0, so sender health could never surface a degrading
    // domain — the exact condition an owner needs to catch before the provider
    // throttles or blocklists the identity.
    const [bounceRow] = await db
      .select({ n: countDistinct(growthCampaignRecipients.id) })
      .from(growthOutboundMessages)
      .innerJoin(growthCampaignRecipients, eq(growthOutboundMessages.recipientId, growthCampaignRecipients.id))
      .where(
        and(
          eq(growthOutboundMessages.orgId, sender.orgId),
          eq(growthOutboundMessages.senderIdentityId, sender.id),
          gte(growthOutboundMessages.createdAt, since),
          or(
            isNotNull(growthCampaignRecipients.bouncedAt),
            isNotNull(growthCampaignRecipients.complainedAt),
          ),
        ),
      );
    const bounceSignals = Number(bounceRow?.n ?? 0);
    if (sentN > 10 && bounceSignals / sentN > 0.05) {
      alerts.push(
        `${bounceSignals} hard bounce or complaint signal(s) in the last 30 days — pause and review this sender before it is throttled.`,
      );
    }

    rows.push({
      senderId: sender.id,
      displayName: sender.displayName,
      email: sender.email,
      verificationState: sender.verificationState,
      coldApproved: sender.coldApproved,
      sent30d: sentN,
      failed30d: failedN,
      blocked30d: Number(blocked?.n ?? 0),
      bounceSignals,
      alerts,
    });
  }
  return rows;
}
