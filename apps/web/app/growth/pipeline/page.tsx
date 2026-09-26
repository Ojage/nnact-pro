"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useGrowthMeetingsQuery, useGrowthOpportunitiesQuery } from "@/lib/redux/api";

export default function GrowthPipelinePage() {
  const { data: opportunities = [] } = useGrowthOpportunitiesQuery();
  const { data: meetings = [] } = useGrowthMeetingsQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pipeline"
        description="Opportunities, meetings, and links to customers, jobs, estimates, and maintenance plans."
      />
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Opportunities</h2>
        {opportunities.map((o) => (
          <Card key={o.id}>
            <CardContent className="flex flex-wrap items-center gap-3 pt-4 text-sm">
              <span className="font-medium">{o.companyName ?? o.title}</span>
              <span className="rounded bg-muted px-2 py-0.5 text-xs">{o.stage}</span>
              {o.linkedCustomerId ? <span className="text-xs text-fg-muted">Customer linked</span> : null}
              {o.linkedJobId ? <span className="text-xs text-fg-muted">Job linked</span> : null}
              {o.linkedEstimateId ? <span className="text-xs text-fg-muted">Estimate linked</span> : null}
              {o.linkedServiceAgreementId ? (
                <span className="text-xs text-emerald-600">Maintenance plan linked</span>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {opportunities.length === 0 ? (
          <p className="text-sm text-fg-muted">Create opportunities from engaged prospects or inbox threads.</p>
        ) : null}
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Meetings</h2>
        {meetings.map((m) => (
          <Card key={m.id}>
            <CardContent className="pt-4 text-sm">
              <p>{new Date(m.scheduledAt).toLocaleString()}</p>
              <p className="text-fg-muted">{m.status}</p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}
