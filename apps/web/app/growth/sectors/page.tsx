"use client";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useGrowthSectorsQuery } from "@/lib/redux/api";

export default function SectorOpportunitiesPage() {
  const { data: sectors = [] } = useGrowthSectorsQuery();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sector Opportunities"
        description="Configurable industries with hypotheses labelled until backed by evidence from outreach outcomes."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {sectors.map((s) => (
          <Card key={s.id}>
            <CardContent className="space-y-2 pt-4 text-sm">
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-fg-muted">Allocation weight: {s.allocationWeight}</p>
              {s.services.length ? <p>Services: {s.services.join(", ")}</p> : null}
              {s.hypotheses?.length ? (
                <ul className="list-disc pl-4 text-fg-muted">
                  {s.hypotheses.map((h, i) => (
                    <li key={i}>
                      {h.text} {h.supported ? "(evidence-backed)" : "(hypothesis)"}
                    </li>
                  ))}
                </ul>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
