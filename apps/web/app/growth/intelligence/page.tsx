"use client";

import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useGrowthIntelligenceOverviewQuery } from "@/lib/redux/api";

function Metric({
  label,
  value,
  href,
  hint,
}: {
  label: string;
  value: number | string;
  href: string;
  hint?: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="transition hover:border-primary/40">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-fg-muted">{label}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          {hint ? <p className="mt-1 text-xs text-fg-muted">{hint}</p> : null}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function GrowthIntelligenceOverviewPage() {
  const { data, isLoading } = useGrowthIntelligenceOverviewQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Growth Intelligence"
        description="What the agent learned, what needs approval, and what outreach is allowed to send."
      />
      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : data ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Metric label="Facts awaiting review" value={data.pendingKnowledgeFacts} href="/growth/knowledge" />
            <Metric label="Contradictions" value={data.contradictions} href="/growth/knowledge" />
            <Metric label="Suggested competitors" value={data.suggestedCompetitors} href="/growth/competitors" />
            <Metric
              label="Autopilot mode"
              value={data.autopilotMode}
              href="/growth/autopilot"
              hint={data.autopilotPaused ? "Paused — no sends" : "Active policy"}
            />
            <Metric label="Active sectors" value={data.sectorsActive} href="/growth/sectors" />
            <Metric label="Needs human reply" value={data.threadsNeedingHuman} href="/growth/inbox" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transport & claims</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-fg-muted">
              <p>
                Cold campaign sends:{" "}
                <span className={data.coldTransportReady ? "text-emerald-600" : "text-amber-600"}>
                  {data.coldTransportReady ? "Cold transport configured" : "Blocked — cold transport not configured"}
                </span>
              </p>
              <p>Campaign copy may use only approved Project Knowledge facts with verified sources.</p>
              <p>AI hypotheses and pending facts are visible for review but are not quotable in outreach.</p>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
