import { db, growthCampaignAuditLog } from "@nnact/db";

export async function logCampaignTransition(input: {
  orgId: string;
  campaignId: string;
  action: string;
  previousStatus?: string | null;
  newStatus?: string | null;
  note?: string | null;
  changedBy?: string | null;
}) {
  await db.insert(growthCampaignAuditLog).values({
    orgId: input.orgId,
    campaignId: input.campaignId,
    action: input.action,
    previousStatus: input.previousStatus,
    newStatus: input.newStatus,
    note: input.note,
    changedBy: input.changedBy,
  });
}
