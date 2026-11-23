"use client";

import { useEffect, useState } from "react";
import { DEFAULT_CURRENCY, formatMoney } from "@nnact/shared";
import {
  useApproveQuoteProposalMutation,
  useQuoteProposalQuery,
  useQuoteProposalsQuery,
  useRejectQuoteProposalMutation,
} from "@/lib/redux/api";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

export default function AgentQuotesPage() {
  const { data: proposals, isLoading } = useQuoteProposalsQuery();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: detail } = useQuoteProposalQuery(selectedId ?? "", { skip: !selectedId });
  const [approve, { isLoading: approving }] = useApproveQuoteProposalMutation();
  const [reject, { isLoading: rejecting }] = useRejectQuoteProposalMutation();
  const [prices, setPrices] = useState<Record<string, { quantity: number; unitPriceCents: number }>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!detail) return;
    setPrices(
      Object.fromEntries(
        detail.lines.map((line) => [
          line.id,
          {
            quantity: line.quantity,
            unitPriceCents: line.finalUnitPriceCents ?? line.unitPriceLowCents ?? 0,
          },
        ]),
      ),
    );
  }, [detail]);

  const act = async (kind: "approve" | "reject") => {
    if (!detail) return;
    setError(null);
    setMessage(null);
    try {
      if (kind === "reject") {
        await reject(detail.id).unwrap();
        setMessage("Proposal rejected. The agent will not regenerate it automatically.");
      } else {
        const lines = detail.lines.map((line) => ({
          lineId: line.id,
          quantity: prices[line.id]?.quantity ?? line.quantity,
          unitPriceCents: prices[line.id]?.unitPriceCents ?? 0,
        }));
        if (lines.some((line) => line.unitPriceCents <= 0)) {
          setError("Set a final unit price above zero for every line before approval.");
          return;
        }
        const result = await approve({ id: detail.id, lines }).unwrap();
        setMessage(`Estimate ${(result.estimate as { number?: string } | null)?.number ?? "created"} sent to the job.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Could not ${kind} the proposal`);
    }
  };

  return (
    <div>
      <PageHeader
        title="Quote proposals"
        description="Internal price-based drafts. Ranges and sources stay here; customers only receive approved point prices."
      />

      {error && <p className="mb-4 text-sm text-red">{error}</p>}
      {message && <p className="mb-4 text-sm text-chart-2">{message}</p>}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Proposals</CardTitle>
            <CardDescription>Newest first</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              <Skeleton className="h-20 rounded-lg" />
            ) : proposals?.length ? (
              proposals.map((proposal) => (
                <button
                  key={proposal.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(proposal.id);
                    setMessage(null);
                    setError(null);
                  }}
                  className={`w-full rounded-lg border p-3 text-left text-sm ${selectedId === proposal.id ? "border-accent bg-accent/5" : "border-border"}`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-fg">{proposal.jobId.slice(0, 8)}</span>
                    <Badge variant={proposal.status === "draft" ? "secondary" : proposal.status === "approved" ? "default" : "outline"}>
                      {proposal.status}
                    </Badge>
                  </span>
                  <span className="mt-1 block text-xs text-fg-muted">
                    {proposal.lowCents === null || proposal.highCents === null
                      ? "Needs manual price"
                      : `${formatMoney(proposal.lowCents, DEFAULT_CURRENCY)} – ${formatMoney(proposal.highCents, DEFAULT_CURRENCY)}`}
                  </span>
                </button>
              ))
            ) : (
              <EmptyState title="No proposals yet" description="The quoting agent will add drafts here as eligible jobs appear." />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Review</CardTitle>
            <CardDescription>Choose one final point price per line, then approve or reject.</CardDescription>
          </CardHeader>
          <CardContent>
            {!detail ? (
              <p className="text-sm text-fg-muted">Select a proposal to review its lines.</p>
            ) : (
              <div className="space-y-4">
                <div className="rounded-lg border border-border p-3 text-xs text-fg-muted">
                  <p>Confidence: {detail.confidence}%</p>
                  {detail.assumptions.length > 0 && <p className="mt-1">Assumptions: {detail.assumptions.join(" ")}</p>}
                  {detail.missingInformation.length > 0 && <p className="mt-1">Missing: {detail.missingInformation.join(" ")}</p>}
                </div>

                <div className="space-y-2">
                  {detail.lines.map((line) => (
                    <div key={line.id} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_80px_140px]">
                      <div>
                        <p className="text-sm font-medium text-fg">{line.description}</p>
                        <p className="text-xs text-fg-muted">
                          {line.unitPriceLowCents === null || line.unitPriceHighCents === null
                            ? "No trusted price — manual entry required"
                            : `Range ${formatMoney(line.unitPriceLowCents, DEFAULT_CURRENCY)} – ${formatMoney(line.unitPriceHighCents, DEFAULT_CURRENCY)} · ${line.confidence}%`}
                        </p>
                        {line.needsManualPrice && <Badge variant="draft">Needs manual price</Badge>}
                      </div>
                      <Input
                        type="number"
                        min={1}
                        value={prices[line.id]?.quantity ?? line.quantity}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [line.id]: { ...(prev[line.id] ?? { unitPriceCents: 0 }), quantity: Number(e.target.value) } }))}
                        aria-label={`${line.description} quantity`}
                      />
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={(prices[line.id]?.unitPriceCents ?? 0) / 100}
                        onChange={(e) => setPrices((prev) => ({ ...prev, [line.id]: { ...(prev[line.id] ?? { quantity: 1 }), unitPriceCents: Math.round(Number(e.target.value) * 100) } }))}
                        aria-label={`${line.description} final unit price`}
                      />
                    </div>
                  ))}
                </div>

                {detail.status === "draft" && (
                  <div className="flex gap-2">
                    <Button onClick={() => void act("approve")} loading={approving}>
                      Approve and create estimate
                    </Button>
                    <Button variant="secondary" onClick={() => void act("reject")} loading={rejecting}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
