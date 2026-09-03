"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  useContentItemQuery,
  usePatchContentItemMutation,
  useSubmitContentReviewMutation,
  useApproveContentMutation,
  useRejectContentMutation,
  usePublishContentMutation,
  useScheduleContentMutation,
  useUnpublishContentMutation,
  useUpsertContentVariantMutation,
  useContentMediaQuery,
} from "@/lib/redux/api";
import type { PublishingChannel, BodyDocument } from "@nnact/shared";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { BlockNoteEditorComponent } from "@/components/content-editor/block-note-editor";

const CHANNELS: PublishingChannel[] = ["WEBSITE", "LINKEDIN", "FACEBOOK", "INSTAGRAM"];
const CHANNEL_LABELS: Record<string, string> = {
  WEBSITE: "Website",
  LINKEDIN: "LinkedIn",
  FACEBOOK: "Facebook",
  INSTAGRAM: "Instagram",
};

type SaveState = "idle" | "saving" | "saved" | "error";

export default function ContentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const { data: item, isLoading, isError } = useContentItemQuery(id, { skip: !id });
  const { data: media } = useContentMediaQuery();

  const [patchContent, { isLoading: saving }] = usePatchContentItemMutation();
  const [submitReview] = useSubmitContentReviewMutation();
  const [approve] = useApproveContentMutation();
  const [reject] = useRejectContentMutation();
  const [publish, { isLoading: publishing }] = usePublishContentMutation();
  const [schedule, { isLoading: scheduling }] = useScheduleContentMutation();
  const [unpublish, { isLoading: unpublishing }] = useUnpublishContentMutation();
  const [upsertVariant] = useUpsertContentVariantMutation();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [document, setDocument] = useState<BodyDocument | null>(null);
  const [visibility, setVisibility] = useState("PUBLIC");
  const [sources, setSources] = useState<PublishingChannel[]>(["WEBSITE"]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate editor state once the item loads.
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setSummary(item.summary ?? "");
      setDocument(item.bodyDocument ?? null);
      setVisibility(item.visibility);
      setHydrated(true);
    }
  }, [item]);

  const save = useCallback(
    async (data: Record<string, unknown>) => {
      try {
        await patchContent({ id, data }).unwrap();
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    },
    [id, patchContent],
  );

  // Debounced autosave of the text fields.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated) return;
    setSaveState("saving");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      save({ title, summary: summary || null, visibility });
    }, 900);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [title, summary, visibility, save, hydrated]);

  // Debounced autosave of the body document (derived fields recomputed server-side).
  const docTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hydrated || document == null) return;
    setSaveState("saving");
    if (docTimerRef.current) clearTimeout(docTimerRef.current);
    docTimerRef.current = setTimeout(() => {
      save({ bodyDocument: document });
    }, 900);
    return () => {
      if (docTimerRef.current) clearTimeout(docTimerRef.current);
    };
  }, [document, save, hydrated]);

  if (isLoading) {
    return <div className="space-y-4"><PageHeader title="Content" description="Loading..." /><Skeleton className="h-40" /></div>;
  }
  if (isError || !item) {
    return (
      <div>
        <PageHeader title="Content" description="Editor" />
        <Card className="border-red/30 bg-red/5"><CardContent className="p-4"><p className="text-sm text-red">Failed to load content</p></CardContent></Card>
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    DRAFT: "bg-fg-dim/10 text-fg-dim",
    IN_REVIEW: "bg-amber-500/10 text-amber-500",
    APPROVED: "bg-blue-500/10 text-blue-500",
    SCHEDULED: "bg-purple-500/10 text-purple-500",
    PUBLISHING: "bg-cyan-500/10 text-cyan-500",
    PUBLISHED: "bg-green/10 text-green",
    ARCHIVED: "bg-fg-dim/10 text-fg-dim",
    REJECTED: "bg-red/10 text-red",
  };
  const saveLabel: Record<SaveState, string> = {
    idle: "Saved",
    saving: "Saving…",
    saved: "Saved",
    error: "Save failed",
  };

  const toggleSource = (ch: PublishingChannel) => {
    setSources((prev) => (prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]));
  };

  const handleSaveNow = () => save({ title, summary: summary || null, visibility, bodyDocument: document });

  const handlePublish = async () => {
    await publish({ id, channels: sources }).unwrap();
  };

  const handleSchedule = async () => {
    if (!scheduleAt) return;
    await schedule({ id, channels: sources, scheduledAt: new Date(scheduleAt).toISOString() }).unwrap();
  };

  const handleUnpublish = async () => {
    await unpublish(id).unwrap();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.title}
        description={`${item.type} · /${item.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs ${saveState === "error" ? "text-red" : "text-fg-muted"}`}>{saveLabel[saveState]}</span>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>Preview</Button>
            {item.status === "PUBLISHED" && (
              <Button variant="danger" loading={unpublishing} onClick={handleUnpublish}>Unpublish + Archive</Button>
            )}
            {item.status === "DRAFT" && (
              <Button variant="secondary" onClick={async () => submitReview(id).unwrap()}>Submit for Review</Button>
            )}
            {item.status === "IN_REVIEW" && (
              <>
                <Button variant="secondary" onClick={async () => reject(id).unwrap()}>Reject</Button>
                <Button onClick={async () => approve(id).unwrap()}>Approve</Button>
              </>
            )}
            {item.status !== "DRAFT" && <Button onClick={handleSaveNow} loading={saving}>Save Changes</Button>}
          </div>
        }
      />

      <Badge className={`${statusColor[item.status] ?? ""} border-transparent`}>{item.status}</Badge>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="grid gap-2">
                <Label>Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} className="text-lg font-medium" />
              </div>
              <div className="grid gap-2">
                <Label>Summary</Label>
                <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Short summary shown in cards and previews" />
              </div>
              <div className="grid gap-2">
                <Label>Body Content</Label>
                {hydrated && (
                  <BlockNoteEditorComponent
                    initialDocument={document ?? null}
                    onChange={(doc) => setDocument(doc)}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-fg">Channel Variants</h3></CardHeader>
            <CardContent className="space-y-4">
              {CHANNELS.map((ch) => {
                const variant = item.variants.find((v) => v.channel === ch);
                const enabled = variant?.enabled ?? ch === "WEBSITE";
                return (
                  <div key={ch} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-fg">{CHANNEL_LABELS[ch]}</span>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => upsertVariant({ id, channel: ch, data: { enabled: v } })}
                      />
                    </div>
                    {variant && enabled && (
                      <div className="mt-3 grid gap-3">
                        <Input
                          defaultValue={variant.titleOverride ?? ""}
                          placeholder={`Title override (${CHANNEL_LABELS[ch]})`}
                          onBlur={(e) => upsertVariant({ id, channel: ch, data: { titleOverride: e.target.value || null } })}
                        />
                        {ch === "WEBSITE" ? (
                          <textarea
                            defaultValue={variant.bodyOverride ?? ""}
                            placeholder="Body override"
                            rows={3}
                            onBlur={(e) => upsertVariant({ id, channel: ch, data: { bodyOverride: e.target.value || null } })}
                            className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-fg outline-none"
                          />
                        ) : (
                          <Input
                            defaultValue={variant.caption ?? ""}
                            placeholder="Caption / post text"
                            onBlur={(e) => upsertVariant({ id, channel: ch, data: { caption: e.target.value || null } })}
                          />
                        )}
                        <div className="flex items-center gap-2 text-xs text-fg-muted">
                          <span>Hashtags:</span>
                          <span>{variant.hashtags?.length ? variant.hashtags.join(", ") : "—"}</span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-fg">Publish</h3></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Channels</Label>
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => toggleSource(ch)}
                      className={`rounded-full px-3 py-1 text-xs font-medium border ${sources.includes(ch) ? "bg-primary text-primary-foreground border-primary" : "bg-transparent text-fg-muted border-border"}`}
                    >
                      {CHANNEL_LABELS[ch]}
                    </button>
                  ))}
                </div>
              </div>

              {(item.status === "APPROVED" || item.status === "DRAFT" || item.status === "SCHEDULED" || item.status === "PUBLISHING" || item.status === "PUBLISHED") && (
                <>
                  <div className="grid gap-2">
                    <Label>Schedule (optional)</Label>
                    <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Button loading={scheduling} onClick={handleSchedule} disabled={!scheduleAt}>Schedule</Button>
                    <Button variant="success" loading={publishing} onClick={handlePublish}>Publish Now</Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-fg">Media</h3></CardHeader>
            <CardContent>
              <p className="text-xs text-fg-muted">{media?.length ?? 0} media assets in this workspace</p>
              <p className="text-xs text-fg-muted mt-1">Featured image: {item.featuredMediaId ? "selected" : "none"}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {previewOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-6" onClick={() => setPreviewOpen(false)}>
          <div className="w-full max-w-3xl rounded-xl border border-border bg-background p-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-fg">Website Preview</h3>
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(false)}>Close</Button>
            </div>
            <article className="prose-content space-y-4">
              <h1 className="text-3xl font-bold text-fg">{title}</h1>
              {summary ? <p className="text-fg-muted">{summary}</p> : null}
              {/* bodyHtml is sanitized server-side at save time; fall back to plain text. */}
              {item.bodyHtml ? (
                <div className="space-y-4 text-fg" dangerouslySetInnerHTML={{ __html: item.bodyHtml }} />
              ) : (
                <p className="whitespace-pre-wrap text-fg">{item.body}</p>
              )}
            </article>
          </div>
        </div>
      )}
    </div>
  );
}
