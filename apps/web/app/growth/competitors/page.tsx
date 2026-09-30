"use client";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useGrowthCompetitorsQuery, useReviewGrowthCompetitorMutation } from "@/lib/redux/api";
import { useSessionUser } from "@/lib/use-session-user";

export default function CompetitorsPage() {
  const { data: competitors = [] } = useGrowthCompetitorsQuery();
  const [review] = useReviewGrowthCompetitorMutation();
  // The review endpoint is owner-only (requireGrowthOwner). Rendering the
  // buttons to a dispatcher or secretary produced a 403 on click with no
  // explanation; the read list below is open to every Growth role.
  const { user } = useSessionUser();
  const isOwner = user?.role === "owner";

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
              {c.reviewStatus === "SUGGESTED" && isOwner ? (
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
              {c.reviewStatus === "SUGGESTED" && !isOwner ? (
                <p className="text-xs text-fg-muted">Awaiting owner review.</p>
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
