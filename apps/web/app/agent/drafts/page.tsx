"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  useApproveDraftJobMutation,
  useDraftJobQuery,
  useDraftJobsQuery,
  usePatchJobMutation,
  useRejectDraftJobMutation,
  type DraftJobDTO,
} from "@/lib/redux/api";

interface DraftFields {
  [key: string]: string;
  title: string;
  description: string;
  serviceAddress: string;
  preferredTime: string;
}

function confidenceVariant(value?: number | null) {
  if (value == null) return "draft" as const;
  if (value < 0.6) return "canceled" as const;
  if (value < 0.85) return "lead" as const;
  return "completed" as const;
}

function fieldConfidence(draft: DraftJobDTO["draft"], field: string) {
  return draft?.confidence?.[field as keyof NonNullable<DraftJobDTO["draft"]>["confidence"]] ?? null;
}

function ConfidenceBadge({ draft, field }: { draft: DraftJobDTO["draft"]; field: string }) {
  const value = fieldConfidence(draft, field);
  return (
    <Badge variant={confidenceVariant(value)} title={value == null ? "No confidence score" : `${Math.round(value * 100)}% confidence`}>
      {value == null ? "—" : `${Math.round(value * 100)}%`}
    </Badge>
  );
}

function DraftRow({
  draft,
  active,
  onSelect,
}: {
  draft: DraftJobDTO;
  active: boolean;
  onSelect: () => void;
}) {
  const data = draft.draft;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded-lg border p-4 text-left transition-colors ${
        active ? "border-blue bg-blue/5" : "border-border bg-surface hover:bg-surface-300"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-fg">{draft.title}</span>
        <div className="flex items-center gap-2">
          {draft.draft?.safetyFlags?.length ? <Badge variant="canceled">safety word</Badge> : null}
          <Badge variant={draft.status === "draft" ? "draft" : "canceled"}>{draft.status.replaceAll("_", " ")}</Badge>
        </div>
      </div>
      <p className="mt-1 line-clamp-2 text-sm text-fg-muted">{data?.symptom || draft.description}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted">
        <span>{data?.customerName || "Unnamed customer"}</span>
        {data?.town ? <span>· {data.town}</span> : null}
        {data?.language ? <span>· {data.language.toUpperCase()}</span> : null}
        {draft.agentRejectedAt ? <span>· rejected</span> : null}
      </div>
    </button>
  );
}

function Thread({ messages }: { messages: Record<string, unknown>[] }) {
  if (!messages.length) return <p className="text-sm text-fg-muted">No WhatsApp thread is linked to this draft.</p>;
  return (
    <div className="space-y-3">
      {messages.map((message) => {
        const direction = String(message.direction ?? "inbound");
        const raw = message.raw as { text?: { body?: string } } | undefined;
        const text = String(message.transcript ?? message.body ?? raw?.text?.body ?? "");
        return (
          <div
            key={String(message.id)}
            className={`rounded-lg border p-3 ${direction === "outbound" ? "border-blue/30 bg-blue/5" : "border-border bg-surface-300"}`}
          >
            <div className="mb-1 text-xs uppercase tracking-wide text-fg-muted">
              {direction} · {String(message.createdAt ?? "")}
            </div>
            <p className="whitespace-pre-wrap text-sm text-fg">{text || "(media)"}</p>
            {message.safetyFlags && Array.isArray(message.safetyFlags) && message.safetyFlags.length ? (
              <p className="mt-1 text-xs text-red">Safety words: {(message.safetyFlags as string[]).join(", ")}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function AgentDraftsPage() {
  const { data: drafts, isLoading } = useDraftJobsQuery();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [fields, setFields] = useState<DraftFields>({ title: "", description: "", serviceAddress: "", preferredTime: "" });
  const { data: detail, isFetching } = useDraftJobQuery(activeId ?? "", { skip: !activeId });
  const [patchJob, { isLoading: saving }] = usePatchJobMutation();
  const [approve, { isLoading: approving }] = useApproveDraftJobMutation();
  const [reject, { isLoading: rejecting }] = useRejectDraftJobMutation();

  useEffect(() => {
    if (!detail) return;
    setFields({
      title: detail.title,
      description: detail.description ?? "",
      serviceAddress: detail.serviceAddress ?? "",
      preferredTime: detail.preferredTime ?? "",
    });
  }, [detail?.id, detail?.title, detail?.description, detail?.serviceAddress, detail?.preferredTime]);

  const selected = detail ?? drafts?.find((item) => item.id === activeId) ?? null;

  async function save() {
    if (!selected) return;
    try {
      await patchJob({ id: selected.id, data: fields }).unwrap();
      toast.success("Draft saved");
    } catch {
      toast.error("Could not save the draft");
    }
  }

  async function approveDraft(status: "lead" | "scheduled") {
    if (!selected) return;
    try {
      await approve({ id: selected.id, data: { ...fields, status } }).unwrap();
      toast.success(status === "lead" ? "Approved as lead" : "Approved and scheduled");
      setActiveId(null);
    } catch {
      toast.error("Could not approve the draft");
    }
  }

  async function rejectDraft() {
    if (!selected) return;
    const reason = window.prompt("Why should this draft be rejected?")?.trim();
    if (!reason) return;
    try {
      await reject({ id: selected.id, reason }).unwrap();
      toast.success("Draft rejected");
      setActiveId(null);
    } catch {
      toast.error("Could not reject the draft");
    }
  }

  return (
    <div>
      <PageHeader
        title="Draft jobs"
        description="WhatsApp intake drafts wait here for owner or dispatcher review. They are hidden from the jobs list until approved."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card className="p-4">
          {isLoading ? <Skeleton className="h-40 w-full" /> : null}
          {!isLoading && !drafts?.length ? (
            <p className="text-sm text-fg-muted">No intake drafts waiting for review.</p>
          ) : null}
          <div className="space-y-2">
            {drafts?.map((draft) => (
              <DraftRow
                key={draft.id}
                draft={draft}
                active={draft.id === activeId}
                onSelect={() => setActiveId(draft.id)}
              />
            ))}
          </div>
        </Card>

        <Card className="p-5">
          {!selected ? (
            <p className="text-sm text-fg-muted">Select a draft to review its extracted details and WhatsApp thread.</p>
          ) : null}
          {isFetching ? <Skeleton className="mb-4 h-64 w-full" /> : null}
          {selected && !isFetching ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-fg">{selected.title}</h2>
                  <p className="text-xs text-fg-muted">
                    Created {new Date(selected.createdAt).toLocaleString()} · source {selected.source}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={saving} onClick={save}>
                    Save
                  </Button>
                  <Button size="sm" disabled={approving} onClick={() => approveDraft("lead")}>
                    Approve
                  </Button>
                  <Button size="sm" variant="secondary" disabled={approving} onClick={() => approveDraft("scheduled")}>
                    Schedule
                  </Button>
                  <Button size="sm" variant="destructive" disabled={rejecting} onClick={rejectDraft}>
                    Reject
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="draft-title">Title</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input id="draft-title" value={fields.title} onChange={(event) => setFields({ ...fields, title: event.target.value })} />
                    <ConfidenceBadge draft={selected.draft} field="applianceType" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="draft-address">Service address</Label>
                  <div className="mt-1 flex items-center gap-2">
                    <Input
                      id="draft-address"
                      value={fields.serviceAddress}
                      onChange={(event) => setFields({ ...fields, serviceAddress: event.target.value })}
                    />
                    <ConfidenceBadge draft={selected.draft} field="town" />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="draft-description">Description</Label>
                  <div className="mt-1 flex items-start gap-2">
                    <Textarea
                      id="draft-description"
                      rows={6}
                      value={fields.description}
                      onChange={(event) => setFields({ ...fields, description: event.target.value })}
                    />
                    <ConfidenceBadge draft={selected.draft} field="symptom" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="draft-time">Preferred time</Label>
                  <Input
                    id="draft-time"
                    value={fields.preferredTime}
                    onChange={(event) => setFields({ ...fields, preferredTime: event.target.value })}
                  />
                </div>
              </div>

              {selected.draft?.missingFields?.length ? (
                <div className="rounded-lg border border-yellow/30 bg-yellow/10 p-3 text-sm text-fg">
                  <span className="font-medium">Still missing:</span> {selected.draft.missingFields.join(", ")}
                </div>
              ) : null}
              {selected.draft?.safetyFlags?.length ? (
                <div className="rounded-lg border border-red/30 bg-red/10 p-3 text-sm text-fg">
                  <span className="font-medium">Safety words detected:</span> {selected.draft.safetyFlags.join(", ")}
                </div>
              ) : null}

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-medium text-fg">WhatsApp thread</h3>
                  {selected.agentConversationId ? (
                    <Link href={`/api/agent/draft-jobs/${selected.id}`} className="text-xs text-blue underline">
                      Source data
                    </Link>
                  ) : null}
                </div>
                <Thread messages={(detail?.messages ?? []) as Record<string, unknown>[]} />
              </div>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
