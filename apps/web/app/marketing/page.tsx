"use client";

import { useMemo } from "react";
import { BarChart3, Bot, Images, Megaphone, PenSquare, Plug, Send, Sparkles, TriangleAlert, Wand2 } from "lucide-react";
import { formatMoney } from "@nnact/shared";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { useAiUsageQuery, useContentItemsQuery, useContentPublicationsQuery, usePublishingConnectionsQuery } from "@/lib/redux/api";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/console";

const viewAll = "text-sm font-medium text-[var(--shell-accent-text)] hover:underline";

/** Marketing service overview: content pipeline, channel health and AI spend. */
export default function MarketingOverviewPage() {
  const content = useContentItemsQuery({ take: 50 });
  const publications = useContentPublicationsQuery({ take: 50 });
  const connections = usePublishingConnectionsQuery();
  const usage = useAiUsageQuery();

  const items = useMemo(() => content.data?.items ?? [], [content.data]);
  const pubs = useMemo(() => publications.data?.items ?? [], [publications.data]);
  const links = connections.data?.connections ?? [];
  const channels = connections.data?.channels ?? [];

  const byStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of items) counts[item.status] = (counts[item.status] ?? 0) + 1;
    return counts;
  }, [items]);
  const failed = pubs.filter((p) => p.status === "FAILED");
  const scheduled = pubs.filter((p) => p.status === "SCHEDULED" || p.status === "QUEUED");
  const connected = links.filter((c) => c.status === "CONNECTED");
  const broken = links.filter((c) => c.status === "EXPIRED" || c.status === "ERROR");
  const titleById = useMemo(() => new Map(items.map((item) => [item.id, item.title])), [items]);

  const spend = useMemo(
    () =>
      (usage.data?.analytics.daily ?? []).slice(-14).map((day) => ({
        label: new Date(day.date).toLocaleDateString(undefined, { day: "numeric", month: "short" }),
        value: day.costCents,
        detail: `${day.calls} calls · ${day.images} images`,
      })),
    [usage.data],
  );

  if (content.isLoading && connections.isLoading) {
    return (
      <div className="grid gap-6" aria-busy="true" aria-label="Loading marketing overview">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <Skeleton className="h-44 rounded-[8px]" />
          <Skeleton className="h-44 rounded-[8px]" />
        </div>
        <Skeleton className="h-24 rounded-[8px]" />
        <Skeleton className="h-64 rounded-[8px]" />
      </div>
    );
  }

  const monthBudget = usage.data?.monthlyBudgetCents ?? 0;

  return (
    <ConsolePage className="gap-6">
      <ServiceOverviewHero
        title="Marketing"
        icon={Megaphone}
        description="Write once, publish everywhere. Draft posts and articles in the Content Studio, let AI help with copy and images, and send them to your website and social channels."
        quickActions={[
          { label: "Write new content", href: "/content/new", icon: PenSquare },
          { label: "Browse the image gallery", href: "/content/gallery", icon: Images },
          { label: "Check publications", href: "/publications", icon: Send },
          { label: "Connect a channel", href: "/connections", icon: Plug },
          { label: "AI automation", href: "/ai", icon: Wand2 },
        ]}
        illustration={{
          image: illustrationSrc("marketing"),
          icon: Megaphone,
          title: "Show the work your team already does.",
          copy: "Turn finished jobs and know-how into posts customers actually read.",
          links: [
            { label: "Start a walkthrough", onClick: () => requestLearn() },
            { label: "Marketing questions in the FAQ", href: "/help/faq" },
          ],
        }}
      />

      {broken.length ? (
        <Banner
          tone="warning"
          title={`${broken.length} channel connection${broken.length === 1 ? " needs" : "s need"} attention.`}
          action={<Link href="/connections" className={viewAll}>Reconnect</Link>}
        >
          Posts to {broken.map((c) => humanize(c.channel.toLowerCase())).join(", ")} will fail until the account is reconnected.
        </Banner>
      ) : null}

      <SummaryCards
        label="Marketing at a glance"
        items={[
          { label: "Content items", icon: PenSquare, value: content.data?.total ?? items.length, note: `${byStatus.DRAFT ?? 0} drafts · ${byStatus.IN_REVIEW ?? 0} in review`, href: "/content" },
          { label: "Published", icon: Send, value: byStatus.PUBLISHED ?? 0, note: scheduled.length ? `${scheduled.length} scheduled to go out` : "Nothing scheduled", href: "/publications" },
          { label: "Channels connected", icon: Plug, value: `${connected.length} / ${channels.length || links.length}`, note: broken.length ? `${broken.length} need reconnecting` : "All connections healthy", attention: broken.length > 0, href: "/connections" },
          {
            label: "AI spend this month",
            icon: Bot,
            value: formatMoney(usage.data?.monthSpend ?? 0),
            meter: monthBudget ? (usage.data?.monthSpend ?? 0) / monthBudget : undefined,
            note: monthBudget ? `of ${formatMoney(monthBudget)} monthly budget` : "No monthly budget set",
            href: "/ai/usage",
          },
        ]}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Panel title="AI spend per day" description="Last 14 days, writing and image generation" actions={<Link href="/ai/usage" className={viewAll}>Usage analytics</Link>}>
          {spend.length ? (
            <ColumnChart data={spend} format={(v) => formatMoney(v)} formatTick={(v) => formatMoney(v)} empty="No AI spend in the last 14 days." label="AI spend per day for the last 14 days" />
          ) : (
            <p className="py-6 text-center text-sm text-fg-muted">No AI usage recorded yet.</p>
          )}
        </Panel>
        <Panel title="Content by stage" description="Latest 50 items" actions={<Link href="/content" className={viewAll}>Content Studio</Link>}>
          <MeterList
            empty="No content yet. Write your first post."
            rows={["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED"].map((status) => ({
              id: status,
              label: humanize(status.toLowerCase()),
              value: byStatus[status] ?? 0,
              valueText: String(byStatus[status] ?? 0),
            })).filter((row) => items.length > 0 && row.value >= 0)}
          />
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Panel title="Recently edited" flush actions={<Link href="/content" className={viewAll}>View all</Link>}>
          <ResourceList
            empty="No content yet."
            rows={[...items]
              .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
              .slice(0, 6)
              .map((item) => ({
                id: item.id,
                href: `/content/${item.id}`,
                primary: item.title,
                secondary: `${humanize(item.type.toLowerCase())} · ${new Date(item.updatedAt).toLocaleDateString()}`,
                status: <StatusText status={item.status} />,
              }))}
          />
        </Panel>
        <Panel title="Failed publications" flush actions={<Link href="/publications" className={viewAll}>Publications</Link>}>
          <ResourceList
            empty="No failed publications."
            rows={failed.slice(0, 6).map((pub) => ({
              id: pub.id,
              href: `/content/${pub.contentId}`,
              primary: titleById.get(pub.contentId) ?? "Content item",
              secondary: `${humanize(pub.channel.toLowerCase())} · ${pub.lastErrorMessage ?? "Publishing failed"}`,
              status: (
                <span className="inline-flex items-center gap-1 text-sm text-fg">
                  <TriangleAlert className="size-4 text-[var(--console-danger-fg)]" aria-hidden="true" />
                  Failed
                </span>
              ),
            }))}
          />
        </Panel>
        <Panel title="Channels" flush actions={<Link href="/connections" className={viewAll}>Manage</Link>} className="lg:col-span-2 xl:col-span-1">
          <ResourceList
            empty="No channels connected yet."
            rows={links.map((link) => ({
              id: link.id ?? link.channel,
              href: "/connections",
              primary: humanize(link.channel.toLowerCase()),
              secondary: link.accountName ?? link.lastError ?? undefined,
              status: <StatusText status={link.status} />,
            }))}
          />
        </Panel>
      </div>

      <ProductTiles
        title="Marketing products"
        tiles={[
          { href: "/content", icon: PenSquare, name: "Content Studio", description: "Write and review posts, articles and pages.", meta: `${content.data?.total ?? items.length} items` },
          { href: "/content/gallery", icon: Images, name: "Image Gallery", description: "Approved photos and generated images." },
          { href: "/publications", icon: Send, name: "Publications", description: "Where each item was posted and how it went.", meta: failed.length ? `${failed.length} failed` : undefined },
          { href: "/connections", icon: Plug, name: "Channels", description: "Website, LinkedIn, Facebook and Instagram accounts." },
          { href: "/ai", icon: Sparkles, name: "AI Content Automation", description: "Providers, prompts and automatic drafting." },
          { href: "/ai/usage", icon: BarChart3, name: "AI Usage Analytics", description: "Calls, tokens, images and spend by task." },
        ]}
      />
    </ConsolePage>
  );
}
