"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGrowthCompetitorsQuery, useReviewGrowthCompetitorMutation } from "@/lib/redux/api";

export default function CompetitorsPage() {
  const { data: competitors = [] } = useGrowthCompetitorsQuery();
  const [review] = useReviewGrowthCompetitorMutation();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Competitors"
        description="Suggested competitors require review. Foreign reference sites are not treated as local competitors."
      />
      <div className="space-y-3">
        {competitors.map((c) => (
          <Card key={c.id}>
            <CardContent className="space-y-2 pt-4 text-sm">
              <div className="flex flex-wrap gap-2">
                <span className="font-medium">{c.name}</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.classification}</span>
                <span className="rounded bg-muted px-2 py-0.5 text-xs">{c.reviewStatus}</span>
              </div>
              {c.evidenceSummary ? <p className="text-fg-muted">{c.evidenceSummary}</p> : null}
              {c.reviewStatus === "SUGGESTED" ? (
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => review({ id: c.id, reviewStatus: "APPROVED" })}>
                    Approve
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => review({ id: c.id, reviewStatus: "REJECTED" })}>
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => review({ id: c.id, classification: "UNRELATED", reviewStatus: "EXCLUDED" })}
                  >
                    Mark unrelated
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
        {competitors.length === 0 ? (
          <p className="text-sm text-fg-muted">Run website ingestion from Project Knowledge to surface suggested competitors.</p>
        ) : null}
      </div>
    </div>
  );
}
