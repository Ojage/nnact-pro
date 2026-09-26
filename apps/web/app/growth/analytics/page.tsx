"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useGrowthAnalyticsFunnelQuery, useGrowthAnalyticsOverviewQuery } from "@/lib/redux/api";

export default function GrowthAnalyticsPage() {
  const { data } = useGrowthAnalyticsOverviewQuery({ days: 30 });
  const { data: funnel } = useGrowthAnalyticsFunnelQuery({ days: 30 });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Growth Analytics"
        description="Funnel metrics drill down to recipients, messages, and opportunities — not raw reply counts alone."
      />
      {data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Sent", data.sent, "/growth/campaigns"],
              ["Replied", data.replied, "/growth/inbox"],
              ["Meetings", data.meetings, "/growth/pipeline"],
              ["Open opportunities", data.opportunitiesOpen, "/growth/pipeline"],
              ["Won", data.won, "/growth/pipeline"],
              ["Suppressed", data.suppressed, "/growth/suppressions"],
              ["Blocked", data.blocked, "/growth/campaigns"],
            ].map(([label, value, href]) => (
              <Link key={label as string} href={href as string}>
                <Card className="hover:border-primary/40">
                  <CardContent className="pt-4">
                    <p className="text-sm text-fg-muted">{label as string}</p>
                    <p className="text-2xl font-semibold tabular-nums">{value as number}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
          {funnel?.stages?.length ? (
            <Card>
              <CardContent className="pt-4">
                <h2 className="mb-3 text-sm font-semibold">Operating funnel ({funnel.periodDays} days)</h2>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {funnel.stages.map((s) => (
                    <div key={s.stage} className="rounded-md border border-border px-3 py-2">
                      <p className="text-xs text-fg-muted">{s.stage}</p>
                      <p className="text-lg font-semibold tabular-nums">{s.count}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : null}
          <Card>
            <CardContent className="space-y-2 pt-4 text-sm text-fg-muted">
              <p>{data.coldTransportNote}</p>
              <p>
                Cold transport:{" "}
                <span className={data.coldTransportReady ? "text-emerald-600" : "text-amber-600"}>
                  {data.coldTransportReady ? "configured" : "not configured"}
                </span>
              </p>
              {data.qualifiedRecipientIds.length ? (
                <p>Qualified recipient ids (sample): {data.qualifiedRecipientIds.slice(0, 5).join(", ")}</p>
              ) : null}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
