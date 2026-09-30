import { eq, sql } from "drizzle-orm";
import { db, growthCampaignRecipients, growthCampaigns, growthProspects } from "@nnact/db";

/** Shared sector metrics loader for live Autopilot and simulation. */
export async function loadSectorMetricsFromDb(orgId: string, sectorId: string) {
  const rows = await db.execute<{
    contacts: number;
    meetings: number;
    assessments: number;
    estimates: number;
    positive_replies: number;
    unsubscribes: number;
    bounces: number;
    days_observed: number;
  }>(sql`
    select
      count(distinct r.id)::int as contacts,
      count(distinct r.id) filter (where r.meeting_booked_at is not null)::int as meetings,
      count(distinct r.id) filter (where r.status = 'CONVERTED')::int as assessments,
      count(distinct r.id) filter (where p.lifecycle = 'QUOTED')::int as estimates,
      count(distinct r.id) filter (where r.replied_at is not null)::int as positive_replies,
      -- Complaints are counted apart from unsubscribes: allocation scores a
      -- complaint at 25 and an unsubscribe at 10, so folding them together
      -- under-reported complaint pressure (it was hardcoded 0 before).
      count(distinct r.id) filter (where r.opted_out_at is not null and r.complained_at is null)::int as unsubscribes,
      count(distinct r.id) filter (where r.bounced_at is not null)::int as bounces,
      count(distinct r.id) filter (where r.complained_at is not null)::int as complaints,
      greatest(1, extract(day from now() - min(c.created_at)))::int as days_observed
    from growth_campaigns c
    left join growth_campaign_recipients r on r.campaign_id = c.id
    left join growth_prospects p on p.id = r.prospect_id
    where c.org_id = ${orgId} and c.sector_id = ${sectorId}
  `);
  const m = (rows as unknown as Record<string, number>[])[0] ?? {};
  return {
    contacts: Number(m.contacts ?? 0),
    meetings: Number(m.meetings ?? 0),
    assessments: Number(m.assessments ?? 0),
    estimates: Number(m.estimates ?? 0),
    wonRevenueCents: 0,
    positiveReplies: Number(m.positive_replies ?? 0),
    objections: 0,
    unsubscribes: Number(m.unsubscribes ?? 0),
    bounces: Number(m.bounces ?? 0),
    complaints: Number(m.complaints ?? 0),
    daysObserved: Number(m.days_observed ?? 1),
  };
}
