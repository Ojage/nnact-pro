"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@nnact/shared";
import type { PortalEstimateDTO } from "@nnact/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EstimateActions({
  token,
  estimate,
  customerName,
  onUpdated,
}: {
  token: string;
  estimate: PortalEstimateDTO;
  customerName: string;
  onUpdated: () => void;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState(estimate.options[0]?.id ?? "");
  const [signatureName, setSignatureName] = useState(customerName);
  const [working, setWorking] = useState<"approve" | "decline" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function approve() {
    setWorking("approve");
    setError(null);
    try {
      await api.portalApproveEstimate(token, estimate.id, { optionId: selectedOptionId, signatureName });
      setDone("approved");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Unable to approve estimate.");
    } finally {
      setWorking(null);
    }
  }

  async function decline() {
    setWorking("decline");
    setError(null);
    try {
      await api.portalDeclineEstimate(token, estimate.id);
      setDone("declined");
      onUpdated();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Unable to decline estimate.");
    } finally {
      setWorking(null);
    }
  }

  if (done === "approved") {
    return <p className="text-sm font-semibold text-green">Estimate {estimate.number} approved. Thank you.</p>;
  }
  if (done === "declined") {
    return <p className="text-sm font-semibold text-fg-muted">Estimate {estimate.number} declined.</p>;
  }

  return (
    <div className="grid gap-3">
      {estimate.options.length > 1 ? (
        <fieldset className="grid gap-2">
          <legend className="text-xs font-semibold uppercase tracking-wide text-fg-dim">Choose an option</legend>
          {estimate.options.map((option) => (
            <label key={option.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-100 px-3 py-2 text-sm">
              <span className="flex items-center gap-2">
                <input type="radio" name={`estimate-${estimate.id}`} checked={selectedOptionId === option.id} onChange={() => setSelectedOptionId(option.id)} />
                {option.label}
              </span>
              <span className="font-black">{formatMoney(option.total)}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <p className="text-sm text-fg-muted">
          Total: <span className="font-black text-fg">{formatMoney(estimate.options[0]?.total ?? estimate.total)}</span>
        </p>
      )}

      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold text-fg-muted">Name for approval</span>
        <Input value={signatureName} onChange={(e) => setSignatureName(e.target.value)} />
      </label>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void approve()} disabled={!selectedOptionId || working !== null}>
          {working === "approve" ? "Approving…" : "Approve estimate"}
        </Button>
        <Button variant="secondary" onClick={() => void decline()} disabled={working !== null}>
          {working === "decline" ? "Declining…" : "Decline"}
        </Button>
      </div>

      {error ? <p role="alert" className="text-xs text-red">{error}</p> : null}
    </div>
  );
}
