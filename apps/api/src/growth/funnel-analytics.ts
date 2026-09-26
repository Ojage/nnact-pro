import { and, count, eq, gte, sql } from "drizzle-orm";
import {
  db,
  growthCampaignRecipients,
  growthMeetings,
  growthOpportunities,
  growthOutboundMessages,
  growthProspects,
} from "@nnact/db";

export interface FunnelStage {
  stage: string;
  count: number;
  /** ISO date of earliest record in stage (approximate). */
  since?: string | null;
}

export async function computeGrowthFunnel(orgId: string, periodDays = 30): Promise<FunnelStage[]> {
  const since = new Date(Date.now() - periodDays * 86_400_000);

  const [discovered] = await db
    .select({ n: count() })
    .from(growthProspects)
    .where(and(eq(growthProspects.orgId, orgId), gte(growthProspects.createdAt, since)));

  const [qualified] = await db
    .select({ n: count() })
    .from(growthProspects)
    .where(
      and(
        eq(growthProspects.orgId, orgId),
        sql`${growthProspects.fitScore} is not null and ${growthProspects.fitScore} >= 60`,
        sql`${growthProspects.rejectedAt} is null`,
      ),
    );

  const [sent] = await db
    .select({ n: count() })
    .from(growthOutboundMessages)
    .where(
      and(
        eq(growthOutboundMessages.orgId, orgId),
        eq(growthOutboundMessages.status, "SENT"),
        gte(growthOutboundMessages.sentAt, since),
      ),
    );

  const [replied] = await db
    .select({ n: count() })
    .from(growthCampaignRecipients)
    .where(
      and(
        eq(growthCampaignRecipients.orgId, orgId),
        sql`${growthCampaignRecipients.repliedAt} is not null`,
        gte(growthCampaignRecipients.repliedAt, since),
      ),
    );

  const [meetings] = await db
    .select({ n: count() })
    .from(growthMeetings)
    .where(and(eq(growthMeetings.orgId, orgId), gte(growthMeetings.scheduledAt, since)));

  const [assessments] = await db
    .select({ n: count() })
    .from(growthOpportunities)
    .where(
      and(
        eq(growthOpportunities.orgId, orgId),
        sql`${growthOpportunities.stage} in ('SITE_ASSESSMENT', 'ESTIMATE_SENT', 'NEGOTIATION', 'WON')`,
      ),
    );

  const [estimates] = await db
    .select({ n: count() })
    .from(growthOpportunities)
    .where(
      and(
        eq(growthOpportunities.orgId, orgId),
        sql`${growthOpportunities.linkedEstimateId} is not null`,
      ),
    );

  const [won] = await db
    .select({ n: count() })
    .from(growthOpportunities)
    .where(and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.stage, "WON")));

  return [
    { stage: "Discovered", count: Number(discovered?.n ?? 0) },
    { stage: "Qualified (fit ≥ 60)", count: Number(qualified?.n ?? 0) },
    { stage: "Sent", count: Number(sent?.n ?? 0) },
    { stage: "Replied", count: Number(replied?.n ?? 0) },
    { stage: "Meetings scheduled", count: Number(meetings?.n ?? 0) },
    { stage: "Assessments", count: Number(assessments?.n ?? 0) },
    { stage: "Estimates linked", count: Number(estimates?.n ?? 0) },
    { stage: "Won", count: Number(won?.n ?? 0) },
  ];
}
