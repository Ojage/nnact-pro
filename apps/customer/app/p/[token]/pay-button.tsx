"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { formatMoney } from "@nnact/shared";
import { Button } from "@/components/ui/button";

export function PayButton({ token, invoiceId, number, remaining }: { token: string; invoiceId: string; number: string; remaining: number }) {
  const [state, setState] = useState<"idle" | "working" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setState("working");
    setError(null);
    try {
      const { url } = await api.portalCheckout(token, invoiceId);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^\d+:\s*/, "") : "Checkout could not be started.");
      setState("error");
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={() => void startCheckout()} disabled={state === "working"}>
        {state === "working" ? "Starting checkout…" : `Pay ${formatMoney(remaining)}`}
      </Button>
      {state === "error" && error ? <p role="alert" className="max-w-xs text-right text-xs text-red">{error}</p> : null}
      <p className="text-xs text-fg-dim">Invoice {number}</p>
    </div>
  );
}
