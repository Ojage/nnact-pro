"use client";

import { useRouter } from "next/navigation";
import type { PortalEstimateDTO } from "@nnact/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EstimateActions } from "./estimate-actions";

export function PortalEstimateSection({
  token,
  estimates,
  customerName,
}: {
  token: string;
  estimates: PortalEstimateDTO[];
  customerName: string;
}) {
  const router = useRouter();

  return (
    <Card id="estimates">
      <CardHeader><CardTitle>Estimates awaiting approval</CardTitle></CardHeader>
      <CardContent>
        {estimates.length === 0 ? (
          <p className="py-6 text-center text-sm text-fg-muted">No estimates waiting for your approval.</p>
        ) : (
          <div className="grid gap-4">
            {estimates.map((estimate) => (
              <div key={estimate.id} className="rounded-lg bg-surface-200 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">Estimate {estimate.number}</p>
                  {estimate.expiresAt ? (
                    <p className="text-xs text-fg-dim">Expires {new Date(estimate.expiresAt).toLocaleDateString()}</p>
                  ) : null}
                </div>
                <EstimateActions
                  token={token}
                  estimate={estimate}
                  customerName={customerName}
                  onUpdated={() => router.refresh()}
                />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
