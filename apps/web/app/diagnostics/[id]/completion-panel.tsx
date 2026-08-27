"use client";

import { useState } from "react";
import Link from "next/link";
import { diagnosticsApi, type DiagnosticOutput } from "@/lib/diagnostics-api";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/form-select";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { emitWalkthroughDone } from "@/lib/walkthroughs/events";
import { ADVANCE_TAG } from "@nnact/shared";

export function CompletionPanel({
  sessionId,
  initialStatus,
  initialDisposition,
  initialSummary,
}: {
  sessionId: string;
  initialStatus: string;
  initialDisposition?: string | null;
  initialSummary?: string | null;
}) {
  const [status, setStatus] = useState<"diagnosed" | "inconclusive" | "escalated" | "completed">(
    ["diagnosed", "inconclusive", "escalated", "completed"].includes(initialStatus)
      ? (initialStatus as "diagnosed" | "inconclusive" | "escalated" | "completed")
      : "diagnosed",
  );
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [disposition, setDisposition] = useState(initialDisposition ?? "");
  const [output, setOutput] = useState<DiagnosticOutput | null>(null);
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function complete(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const generated = await diagnosticsApi.completeSession(sessionId, {
        status,
        summary,
        disposition,
      });
      setOutput(generated);
      setMessage("Diagnostic disposition saved and the technician/customer handoff was generated.");
      emitWalkthroughDone(ADVANCE_TAG.diagnosisRecorded);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  async function createEstimate() {
    setSaving(true);
    setMessage(null);
    try {
      const result = await diagnosticsApi.estimateHandoff(sessionId);
      setEstimateId(result.estimate.id);
      setMessage(result.created ? "Estimate draft created from this diagnosis." : "An estimate already exists for this job.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-6 border-accent/25" data-tour="diag-outcome">
      <CardHeader>
        <CardTitle>Complete the diagnostic handoff</CardTitle>
        <p className="mt-1 text-sm text-fg-muted">
          Store the defensible conclusion once, then use it for the technician record, customer explanation, estimate, and equipment history.
        </p>
      </CardHeader>
      <CardContent>
        <form onSubmit={complete} className="grid gap-5 xl:grid-cols-[.75fr_1.25fr]">
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Disposition state</Label>
              <FormSelect
                value={status}
                onChange={(value) => setStatus(value as typeof status)}
                options={[
                  { value: "diagnosed", label: "Diagnosed" },
                  { value: "inconclusive", label: "Inconclusive" },
                  { value: "escalated", label: "Escalated" },
                  { value: "completed", label: "Completed" },
                ]}
              />
            </div>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Repair or escalation recommendation</span>
              <textarea
                value={disposition}
                onChange={(event) => setDisposition(event.target.value)}
                rows={5}
                required
                placeholder="State what the recorded evidence supports and what must happen next."
                className="w-full rounded-lg border border-border bg-surface-200 px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim"
              />
            </label>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-fg-muted">Technician findings summary</span>
              <textarea
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                rows={9}
                required
                placeholder="Summarize the confirmed complaint, material readings, isolated circuit or condition, limitations, and recommendation."
                className="w-full rounded-lg border border-border bg-surface-200 px-3 py-2.5 text-sm text-fg placeholder:text-fg-dim"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving || !summary.trim() || !disposition.trim()}>
                {saving ? "Saving…" : "Save and generate handoff"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={createEstimate}
                disabled={saving || !["diagnosed", "completed"].includes(status)}
              >
                Create estimate draft
              </Button>
              {estimateId && (
                <Link href={`/estimates/${estimateId}`}>
                  <Button type="button" variant="secondary">Open estimate</Button>
                </Link>
              )}
            </div>
          </div>
        </form>

        {message && (
          <p className="mt-4 rounded-lg border border-border bg-surface-200 p-3 text-sm text-fg-muted">{message}</p>
        )}

        {output && (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-border bg-surface-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-accent">Technician record</p>
              <p className="mt-3 text-sm text-fg">{output.technician.summary}</p>
              <p className="mt-3 text-xs text-fg-muted">{output.technician.readings.length} recorded reading(s) · {output.technician.disposition}</p>
            </div>
            <div className="rounded-xl border border-border bg-surface-200 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue">Customer-safe explanation</p>
              <p className="mt-3 text-sm text-fg">{output.customer.finding}</p>
              <p className="mt-3 text-xs text-fg-muted">Recommendation: {output.customer.recommendation}</p>
              {output.customer.limitation && <p className="mt-2 text-xs text-yellow">{output.customer.limitation}</p>}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
