"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useCopilotSuggestionsQuery,
  useDecideCopilotSuggestionMutation,
  useRejectCopilotSuggestionMutation,
} from "@/lib/redux/api";

function confidenceLabel(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export default function AgentCopilotPage() {
  const { data, isLoading } = useCopilotSuggestionsQuery();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [decide, { isLoading: deciding }] = useDecideCopilotSuggestionMutation();
  const [reject, { isLoading: rejecting }] = useRejectCopilotSuggestionMutation();
  const suggestions = data?.suggestions ?? [];
  const selected = suggestions.find((item) => item.id === activeId) ?? suggestions[0] ?? null;

  useEffect(() => {
    setReason("");
    setError(null);
  }, [selected?.id]);

  async function record(state: "accepted" | "changed" | "ignored") {
    if (!selected) return;
    setError(null);
    try {
      await decide({ id: selected.id, state, reason: reason.trim() || undefined }).unwrap();
      toast.success("Copilot feedback saved");
      setReason("");
    } catch {
      setError("Could not save that feedback");
    }
  }

  async function rejectSuggestion() {
    if (!selected) return;
    if (reason.trim().length < 5) {
      setError("Give a reason of at least 5 characters before rejecting.");
      return;
    }
    setError(null);
    try {
      await reject({ id: selected.id, reason: reason.trim() }).unwrap();
      toast.success("Suggestion rejected");
      setReason("");
    } catch {
      setError("Could not reject that suggestion");
    }
  }

  return (
    <div>
      <PageHeader
        title="Copilot suggestions"
        description="Job and conversation guidance for staff review. Copilot never sends messages, assigns work, confirms prices or changes records."
      />

      {error ? <p className="mb-4 text-sm text-red" role="alert">{error}</p> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Suggestions</CardTitle>
            <CardDescription>Newest first</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? <Skeleton className="h-20 rounded-lg" /> : null}
            {!isLoading && suggestions.length === 0 ? (
              <EmptyState
                title="No suggestions yet"
                description="Copilot will add guidance here as open jobs and recent customer threads need review."
              />
            ) : null}
            {suggestions.map((suggestion) => (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => setActiveId(suggestion.id)}
                className={`w-full rounded-lg border p-3 text-left text-sm ${
                  selected?.id === suggestion.id ? "border-accent bg-accent/5" : "border-border"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium text-fg">Job {suggestion.jobId.slice(0, 8)}</span>
                  <Badge variant={suggestion.state === "shown" ? "default" : "secondary"}>{suggestion.state}</Badge>
                </span>
                <span className="mt-1 line-clamp-2 block text-xs text-fg-muted">{suggestion.summary}</span>
                <span className="mt-1 block text-xs text-fg-muted">{confidenceLabel(suggestion.confidence)} confidence</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{selected ? `Job ${selected.jobId.slice(0, 8)}` : "Review"}</CardTitle>
            <CardDescription>Read-only guidance; nothing here is sent automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selected ? (
              <p className="text-sm text-fg-muted">Select a suggestion to review its guidance and record feedback.</p>
            ) : (
              <>
                <section aria-labelledby="copilot-summary">
                  <h3 id="copilot-summary" className="mb-1 text-sm font-medium text-fg">Summary</h3>
                  <p className="whitespace-pre-wrap text-sm text-fg">{selected.summary}</p>
                </section>

                <section aria-labelledby="copilot-actions">
                  <h3 id="copilot-actions" className="mb-1 text-sm font-medium text-fg">Recommended actions</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-fg" role="list">
                    {selected.recommendedActions.map((action, index) => <li key={`${index}-${action}`}>{action}</li>)}
                  </ul>
                </section>

                {selected.draftReply ? (
                  <section aria-labelledby="copilot-reply" className="rounded-lg border border-yellow/30 bg-yellow/10 p-3">
                    <h3 id="copilot-reply" className="mb-1 text-sm font-medium text-fg">Draft reply — not sent</h3>
                    <p className="whitespace-pre-wrap text-sm text-fg">{selected.draftReply}</p>
                  </section>
                ) : null}

                {selected.risks.length ? (
                  <section aria-labelledby="copilot-risks">
                    <h3 id="copilot-risks" className="mb-1 text-sm font-medium text-fg">Risks</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-fg" role="list">
                      {selected.risks.map((risk, index) => <li key={`${index}-${risk}`}>{risk}</li>)}
                    </ul>
                  </section>
                ) : null}

                {selected.missingInformation.length ? (
                  <section aria-labelledby="copilot-missing">
                    <h3 id="copilot-missing" className="mb-1 text-sm font-medium text-fg">Still missing</h3>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-fg" role="list">
                      {selected.missingInformation.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
                    </ul>
                  </section>
                ) : null}

                <div>
                  <label htmlFor="copilot-reason" className="mb-1 block text-sm font-medium text-fg">
                    Feedback reason (optional, required to reject)
                  </label>
                  <Textarea
                    id="copilot-reason"
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    disabled={selected.state !== "shown"}
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={selected.state !== "shown" || deciding || rejecting} onClick={() => void record("accepted")}>
                    Mark useful
                  </Button>
                  <Button size="sm" variant="secondary" disabled={selected.state !== "shown" || deciding || rejecting} onClick={() => void record("ignored")}>
                    Ignore
                  </Button>
                  <Button size="sm" variant="destructive" disabled={selected.state !== "shown" || deciding || rejecting} onClick={() => void rejectSuggestion()}>
                    Reject
                  </Button>
                  {selected.state !== "shown" ? (
                    <span className="self-center text-xs text-fg-muted">Feedback recorded: {selected.state}</span>
                  ) : null}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
