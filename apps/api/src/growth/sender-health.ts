import { and, count, eq, gte } from "drizzle-orm";
import { db, growthOutboundMessages, growthSenderIdentities } from "@nnact/db";

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

    rows.push({
      senderId: sender.id,
      displayName: sender.displayName,
      email: sender.email,
      verificationState: sender.verificationState,
      coldApproved: sender.coldApproved,
      sent30d: sentN,
      failed30d: failedN,
      blocked30d: Number(blocked?.n ?? 0),
      bounceSignals: 0,
      alerts,
    });
  }
  return rows;
}
