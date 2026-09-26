// Growth analytics — funnel metrics with drill-down ids.

import { and, count, eq, gte, sql } from "drizzle-orm";
import {
  db,
  growthCampaignRecipients,
  growthMeetings,
  growthOpportunities,
  growthOutboundMessages,
} from "@nnact/db";

export interface GrowthAnalyticsOverview {
  periodDays: number;
  sent: number;
  replied: number;
  meetings: number;
  opportunitiesOpen: number;
  won: number;
  suppressed: number;
  blocked: number;
  /** Drill-down: recipient ids with positive downstream signals. */
  qualifiedRecipientIds: string[];
  coldTransportNote: string;
}

export async function computeGrowthAnalytics(orgId: string, periodDays = 30): Promise<GrowthAnalyticsOverview> {
  const since = new Date(Date.now() - periodDays * 86_400_000);

  const [sentRow] = await db
    .select({ n: count() })
    .from(growthOutboundMessages)
    .where(
      and(
        eq(growthOutboundMessages.orgId, orgId),
        eq(growthOutboundMessages.status, "SENT"),
        gte(growthOutboundMessages.sentAt, since),
      ),
    );

  const [repliedRow] = await db
    .select({ n: count() })
    .from(growthCampaignRecipients)
    .where(
      and(
        eq(growthCampaignRecipients.orgId, orgId),
        sql`${growthCampaignRecipients.repliedAt} is not null`,
        gte(growthCampaignRecipients.repliedAt, since),
      ),
    );

  const [meetingsRow] = await db
    .select({ n: count() })
    .from(growthMeetings)
    .where(and(eq(growthMeetings.orgId, orgId), gte(growthMeetings.scheduledAt, since)));

  const [openOpps] = await db
    .select({ n: count() })
    .from(growthOpportunities)
    .where(
      and(
        eq(growthOpportunities.orgId, orgId),
        sql`${growthOpportunities.stage} not in ('WON', 'LOST')`,
      ),
    );

  const [wonRow] = await db
    .select({ n: count() })
    .from(growthOpportunities)
    .where(and(eq(growthOpportunities.orgId, orgId), eq(growthOpportunities.stage, "WON")));

  const [suppressedRow] = await db
    .select({ n: count() })
    .from(growthOutboundMessages)
    .where(
      and(
        eq(growthOutboundMessages.orgId, orgId),
        eq(growthOutboundMessages.status, "SUPPRESSED"),
        gte(growthOutboundMessages.createdAt, since),
      ),
    );

  const [blockedRow] = await db
    .select({ n: count() })
    .from(growthOutboundMessages)
    .where(
      and(
        eq(growthOutboundMessages.orgId, orgId),
        eq(growthOutboundMessages.status, "BLOCKED"),
        gte(growthOutboundMessages.createdAt, since),
      ),
    );

  const qualified = await db
    .select({ id: growthCampaignRecipients.id })
    .from(growthCampaignRecipients)
    .where(
      and(
        eq(growthCampaignRecipients.orgId, orgId),
        sql`(${growthCampaignRecipients.meetingBookedAt} is not null or ${growthCampaignRecipients.status} = 'CONVERTED')`,
      ),
    )
    .limit(200);

  return {
    periodDays,
    sent: Number(sentRow?.n ?? 0),
    replied: Number(repliedRow?.n ?? 0),
    meetings: Number(meetingsRow?.n ?? 0),
    opportunitiesOpen: Number(openOpps?.n ?? 0),
    won: Number(wonRow?.n ?? 0),
    suppressed: Number(suppressedRow?.n ?? 0),
    blocked: Number(blockedRow?.n ?? 0),
    qualifiedRecipientIds: qualified.map((r) => r.id),
    coldTransportNote: "Cold sends require COLD_SMTP_*; Resend remains for permission/transactional mail.",
  };
}
