"use client";

import { useMemo } from "react";
import {
  BookCheck,
  Building2,
  Inbox,
  LineChart,
  Mail,
  Megaphone,
  Radar,
  Rocket,
  Search,
  ShieldBan,
  Swords,
  Target,
  TrendingUp,
} from "lucide-react";
import { GROWTH_PROSPECT_LIFECYCLE } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { Skeleton } from "@/components/ui/skeleton";
import { useGrowthCampaignsQuery, useGrowthIntelligenceOverviewQuery, useGrowthProspectsQuery } from "@/lib/redux/api";
import { StatusText, humanize } from "@/components/console/status-chip";
import { requestLearn } from "@/lib/walkthroughs/events";
import {
  Banner,
  ColumnChart,
  ConsolePage,
  MeterList,
  Panel,
  ProductTiles,
  ResourceList,
  ServiceOverviewHero,
  SummaryCards,
  illustrationSrc,
  monthlySeries,
} from "@/components/console";

const viewAll = "text-sm font-medium text-[var(--shell-accent-text)] hover:underline";

/** Growth service overview (the "Overview" tab of Growth): pipeline, approvals and outreach safety. */
export default function GrowthIntelligenceOverviewPage() {
  const { data, isLoading } = useGrowthIntelligenceOverviewQuery();
  const prospectsQuery = useGrowthProspectsQuery({});
  const campaignsQuery = useGrowthCampaignsQuery();
  const prospects = useMemo(() => prospectsQuery.data ?? [], [prospectsQuery.data]);
  const campaigns = campaignsQuery.data ?? [];

  const byLifecycle = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const prospect of prospects) counts[prospect.lifecycle] = (counts[prospect.lifecycle] ?? 0) + 1;
    return counts;
  }, [prospects]);
  const perMonth = useMemo(() => monthlySeries(prospects, (p) => p.createdAt, () => 1, 6), [prospects]);
  const won = byLifecycle.WON ?? 0;
  const open = prospects.filter((p) => !["WON", "LOST", "DO_NOT_CONTACT"].includes(p.lifecycle)).length;

  if (isLoading) {
    return (
      <div className="grid gap-6" aria-busy="true" aria-label="Loading growth overview">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-44 rounded-[8px]" />
          <Skeleton className="h-44 rounded-[8px]" />
        </div>
        <Skeleton className="h-24 rounded-[8px]" />
      </div>
    );
  }

  return (
    <ConsolePage className="gap-6">
      <ServiceOverviewHero
        title="Growth Intelligence"
        icon={TrendingUp}
        description="What the agent learned, what needs approval, and what outreach is allowed to send. Find business customers, research them, and reach out only with verified facts."
        quickActions={[
          { label: "Find prospects", href: "/growth/prospects/search", icon: Search },
          { label: "Add a prospect", href: "/growth/new", icon: Building2 },
          { label: "Review knowledge facts", href: "/growth/knowledge", icon: BookCheck },
          { label: "Plan a campaign", href: "/growth/campaigns", icon: Megaphone },
          { label: "Answer the inbox", href: "/growth/inbox", icon: Inbox },
        ]}
        illustration={{
          image: illustrationSrc("growth"),
          icon: Radar,
          title: "Grow with facts, not guesses.",
          copy: "Outreach may only quote approved Project Knowledge facts with verified sources.",
          links: [
            { label: "Start a walkthrough", onClick: () => requestLearn() },
            { label: "Growth questions in the FAQ", href: "/help/faq" },
          ],
        }}
      />

      {data && !data.coldTransportReady ? (
        <Banner tone="warning" title="Cold campaign sends are blocked." action={<Link href="/growth/senders" className={viewAll}>Sender registry</Link>}>
          Cold transport is not configured, so cold campaigns cannot send until a sender is set up.
        </Banner>
      ) : null}
      {data?.autopilotPaused ? (
        <Banner tone="info" title="Autopilot is paused. Nothing is sent automatically." action={<Link href="/growth/autopilot" className={viewAll}>Autopilot</Link>} />
      ) : null}

      {data ? (
        <SummaryCards
          label="Growth at a glance"
          items={[
            { label: "Needs a human reply", icon: Inbox, value: data.threadsNeedingHuman, note: data.threadsNeedingHuman ? "Conversations waiting in the inbox" : "Inbox is clear", attention: data.threadsNeedingHuman > 0, href: "/growth/inbox" },
            { label: "Facts awaiting review", icon: BookCheck, value: data.pendingKnowledgeFacts, note: data.contradictions ? `${data.contradictions} contradictions to resolve` : "No contradictions", attention: data.contradictions > 0, href: "/growth/knowledge" },
            { label: "Open prospects", icon: Target, value: open, note: `${won} won so far`, href: "/growth" },
            { label: "Autopilot mode", icon: Rocket, value: humanize(String(data.autopilotMode).toLowerCase()), note: data.autopilotPaused ? "Paused — no sends" : "Active policy", href: "/growth/autopilot" },
          ]}
        />
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="New prospects per month" description="Companies added in the last six months" actions={<Link href="/growth/analytics" className={viewAll}>Analytics</Link>}>
          <ColumnChart data={perMonth} format={(v) => `${v} prospect${v === 1 ? "" : "s"}`} formatTick={(v) => String(Math.round(v))} integer empty="No prospects were added in the last six months." label="New prospects per month for the last six months" />
        </Panel>
        <Panel title="Prospects by stage" actions={<Link href="/growth/pipeline" className={viewAll}>Pipeline</Link>}>
          <MeterList
            empty="No prospects yet."
            rows={
              prospects.length
                ? GROWTH_PROSPECT_LIFECYCLE.filter((stage) => byLifecycle[stage]).map((stage) => ({
                    id: stage,
                    label: humanize(stage.toLowerCase()),
                    value: byLifecycle[stage] ?? 0,
                    of: prospects.length,
                    valueText: String(byLifecycle[stage] ?? 0),
                  }))
                : []
            }
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Recently updated prospects" flush actions={<Link href="/growth" className={viewAll}>View all</Link>}>
          <ResourceList
            empty="No prospects yet. Search for companies to get started."
            rows={[...prospects]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 6)
              .map((prospect) => ({
                id: prospect.id,
                href: `/growth/${prospect.id}`,
                primary: prospect.companyName,
                secondary: [prospect.industry, prospect.city].filter(Boolean).join(" · ") || "No details yet",
                status: <StatusText status={prospect.lifecycle} />,
              }))}
          />
        </Panel>
        <Panel title="Campaigns" flush actions={<Link href="/growth/campaigns" className={viewAll}>Campaign studio</Link>}>
          <ResourceList
            empty="No campaigns yet."
            rows={campaigns.slice(0, 6).map((campaign) => ({
              id: campaign.id,
              href: `/growth/campaigns/${campaign.id}`,
              primary: campaign.name,
              secondary: `${humanize(String(campaign.purpose).toLowerCase())} · up to ${campaign.dailyLimit} a day`,
              status: <StatusText status={String(campaign.status)} />,
            }))}
          />
        </Panel>
      </div>

      <ProductTiles
        title="Growth products"
        tiles={[
          { href: "/growth", icon: Building2, name: "Prospects", description: "Companies you could serve, with contacts.", meta: `${prospects.length} prospects` },
          { href: "/growth/prospects/search", icon: Search, name: "Prospect Search", description: "Find businesses by sector and area." },
          { href: "/growth/knowledge", icon: BookCheck, name: "Project Knowledge", description: "Verified facts outreach is allowed to quote.", meta: data ? `${data.pendingKnowledgeFacts} to review` : undefined },
          { href: "/growth/competitors", icon: Swords, name: "Competitors", description: "Who else serves your market.", meta: data?.suggestedCompetitors ? `${data.suggestedCompetitors} suggested` : undefined },
          { href: "/growth/sectors", icon: Radar, name: "Sector Opportunities", description: "Industries worth targeting.", meta: data ? `${data.sectorsActive} active` : undefined },
          { href: "/growth/campaigns", icon: Megaphone, name: "Campaigns", description: "Plan, approve and schedule outreach." },
          { href: "/growth/autopilot", icon: Rocket, name: "Autopilot", description: "What the agent may do on its own." },
          { href: "/growth/inbox", icon: Inbox, name: "Unified Inbox", description: "Replies from every channel in one place." },
          { href: "/growth/pipeline", icon: Target, name: "Pipeline", description: "Prospects by stage, from new to won." },
          { href: "/growth/analytics", icon: LineChart, name: "Growth Analytics", description: "Sends, replies and conversion." },
          { href: "/growth/senders", icon: Mail, name: "Sender Registry", description: "Sending identities and their health." },
          { href: "/growth/suppressions", icon: ShieldBan, name: "Suppression List", description: "Addresses that must never be contacted." },
        ]}
      />
    </ConsolePage>
  );
}
