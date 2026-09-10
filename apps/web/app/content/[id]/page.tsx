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
  useUploadContentMediaMutation,
  usePatchContentMediaMutation,
  useContentCategoriesQuery,
  useContentTagsQuery,
  useCreateContentCategoryMutation,
  explainRtkError,
} from "@/lib/redux/api";
import type { PublishingChannel, BodyDocument } from "@nnact/shared";
import { mediaUrl } from "@/lib/media-url";
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
import { MultiSelect } from "@/components/ui/multi-select";
import { Plus, Check } from "lucide-react";

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

  const { data: item, isLoading, isError, refetch } = useContentItemQuery(id, { skip: !id });
  const { data: media } = useContentMediaQuery();

  // While the publishing worker is running, poll so the button re-enables
  // (and the status badge updates) as soon as the item leaves PUBLISHING.
  useEffect(() => {
    if (item?.status !== "PUBLISHING") return;
    const timer = setInterval(() => void refetch(), 3000);
    return () => clearInterval(timer);
  }, [item?.status, refetch]);

  const [patchContent, { isLoading: saving }] = usePatchContentItemMutation();
  const [submitReview] = useSubmitContentReviewMutation();
  const [approve] = useApproveContentMutation();
  const [reject] = useRejectContentMutation();
  const [publish, { isLoading: publishing }] = usePublishContentMutation();
  const [schedule, { isLoading: scheduling }] = useScheduleContentMutation();
  const [unpublish, { isLoading: unpublishing }] = useUnpublishContentMutation();
  const [upsertVariant] = useUpsertContentVariantMutation();
  const [uploadMedia, { isLoading: uploading }] = useUploadContentMediaMutation();
  const [patchMedia] = usePatchContentMediaMutation();
  const { data: categories } = useContentCategoriesQuery();
  const { data: tagOptions } = useContentTagsQuery();
  const [createCategory] = useCreateContentCategoryMutation();

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [document, setDocument] = useState<BodyDocument | null>(null);
  const [visibility, setVisibility] = useState("PUBLIC");
  const [sources, setSources] = useState<PublishingChannel[]>(["WEBSITE"]);
  const [scheduleAt, setScheduleAt] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [categoryDraftOpen, setCategoryDraftOpen] = useState(false);
  const [categoryDraft, setCategoryDraft] = useState("");

  // Hydrate editor state once the item loads.
  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setSummary(item.summary ?? "");
      setDocument(item.bodyDocument ?? null);
      setVisibility(item.visibility);
      setCategoryId(item.categoryId ?? null);
      setHydrated(true);
    }
  }, [item]);

  // Map tag ids to names once both item and tag options are available.
  useEffect(() => {
    if (!item || !tagOptions || item.tagIds.length === 0) return;
    setSelectedTags((prev) => {
      if (prev.length > 0) return prev;
      return item.tagIds.map((id) => tagOptions.find((t) => t.id === id)?.name).filter((n): n is string => Boolean(n));
    });
  }, [item, tagOptions]);

  const save = useCallback(
    async (data: Record<string, unknown>) => {
      try {
        await patchContent({ id, data }).unwrap();
        setSaveState("saved");
        setSaveError(null);
      } catch (err) {
        setSaveState("error");
        setSaveError(explainRtkError(err));
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
    await refetch();
  };

  const handleSchedule = async () => {
    if (!scheduleAt) return;
    await schedule({ id, channels: sources, scheduledAt: new Date(scheduleAt).toISOString() }).unwrap();
    await refetch();
  };

  const handleUnpublish = async () => {
    await unpublish(id).unwrap();
  };

  const handleCreateCategory = async () => {
    const name = categoryDraft.trim();
    if (!name) return;
    try {
      const created = await createCategory({ name }).unwrap();
      setCategoryId(created.id);
      await patchContent({ id, data: { categoryId: created.id } }).unwrap();
      setCategoryDraft("");
      setCategoryDraftOpen(false);
      setSaveState("saved");
      setSaveError(null);
    } catch (err) {
      setSaveState("error");
      setSaveError(explainRtkError(err, "Failed to create category"));
    }
  };

  const handleCategoryChange = (value: string) => {
    setCategoryId(value === "__none__" ? null : value);
    void save({ categoryId: value === "__none__" ? null : value });
  };

  const handleTagsChange = (names: string[]) => {
    setSelectedTags(names);
    void save({ tagNames: names });
  };

  // Upload image files from the editor (paste / drop / add-photo button).
  const handleUploadImages = useCallback(
    async (files: File[]): Promise<string[]> => {
      const ids: string[] = [];
      for (const file of files) {
        try {
          const created = await uploadMedia(file).unwrap();
          ids.push(created.id);
        } catch (err) {
          console.error("image upload failed", err);
        }
      }
      return ids;
    },
    [uploadMedia],
  );

  const setFeatured = async (featuredMediaId: string | null) => {
    await save({ featuredMediaId });
  };

  const uploadCover = async (file: File) => {
    try {
      const created = await uploadMedia(file).unwrap();
      await setFeatured(created.id);
    } catch (err) {
      setSaveState("error");
      setSaveError(explainRtkError(err, "Cover upload failed"));
    }
  };

  const featuredMedia = item.featuredMediaId
    ? (media ?? []).find((m) => m.id === item.featuredMediaId) ?? null
    : null;
  const featuredSrc = mediaUrl(item.featuredMediaId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={item.title}
        description={`${item.type} · /${item.slug}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs ${saveState === "error" ? "text-red" : "text-fg-muted"}`}>{saveError ?? saveLabel[saveState]}</span>
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>Preview</Button>
            {item.status === "PUBLISHED" && (
              <Button variant="danger" loading={unpublishing} onClick={handleUnpublish}>Unpublish + Archive</Button>
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
                    onUploadImages={handleUploadImages}
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
                    <Button loading={scheduling} onClick={handleSchedule} disabled={!scheduleAt || item.status === "PUBLISHING"}>Schedule</Button>
                    <Button
                      variant="success"
                      loading={publishing || item.status === "PUBLISHING"}
                      disabled={item.status === "PUBLISHING"}
                      onClick={handlePublish}
                    >
                      {item.status === "PUBLISHING" ? "Publishing…" : item.status === "PUBLISHED" ? "Update" : "Publish Now"}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-fg">Category &amp; Tags</h3></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label>Category</Label>
                {categoryDraftOpen ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={categoryDraft}
                      onChange={(e) => setCategoryDraft(e.target.value)}
                      placeholder="New category name"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleCreateCategory();
                        if (e.key === "Escape") setCategoryDraftOpen(false);
                      }}
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0"
                      disabled={!categoryDraft.trim()}
                      onClick={() => void handleCreateCategory()}
                      title="Create category"
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Select value={(categoryId ?? "__none__")} onValueChange={handleCategoryChange}>
                      <SelectTrigger className="flex-1"><SelectValue placeholder="Optional category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {(categories ?? []).length === 0 && (
                          <div className="px-2 py-1.5 text-sm text-fg-muted">No categories yet — add one</div>
                        )}
                        {(categories ?? []).map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="icon"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setCategoryDraftOpen(true)}
                      title="New category"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>

              <div className="grid gap-2">
                <Label>Tags</Label>
                <MultiSelect
                  options={(tagOptions ?? []).map((t) => ({ label: t.name, value: t.name }))}
                  selected={selectedTags}
                  onChange={handleTagsChange}
                  placeholder={(tagOptions ?? []).length === 0 && selectedTags.length === 0 ? "Type to create a tag…" : "Select tags"}
                  allowCreate
                  onCreate={(value) => handleTagsChange(selectedTags.includes(value) ? selectedTags : [...selectedTags, value])}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="text-sm font-semibold text-fg">Featured Image</h3></CardHeader>
            <CardContent className="space-y-3">
              {featuredSrc ? (
                <div className="relative overflow-hidden rounded-lg border border-border">
                  <img src={featuredSrc} alt={featuredMedia?.altText ?? ""} className="aspect-video w-full object-cover" />
                </div>
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed border-border text-xs text-fg-muted">
                  No featured image yet
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <label className="relative inline-flex">
                  <Button variant="secondary" size="sm" asChild>
                    <span>{uploading ? "Uploading…" : "Upload cover"}</span>
                  </Button>
                  <input
                    type="file"
                    accept="image/*"
                    className="absolute inset-0 cursor-pointer opacity-0"
                    disabled={uploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void uploadCover(file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {item.featuredMediaId && (
                  <Button variant="outline" size="sm" onClick={() => void setFeatured(null)}>Remove</Button>
                )}
              </div>

              {featuredMedia && (
                <div className="grid gap-1">
                  <Label className="text-xs">Alt text (cover)</Label>
                  <Input
                    defaultValue={featuredMedia.altText ?? ""}
                    placeholder="Describe the cover image"
                    onBlur={(e) => {
                      const value = e.target.value.trim();
                      if (value !== (featuredMedia.altText ?? "")) {
                        void patchMedia({ id: featuredMedia.id, data: { altText: value || null } });
                      }
                    }}
                  />
                </div>
              )}

              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-fg-muted">{media?.length ?? 0} media assets</span>
                  <span className="text-xs text-fg-muted">Pick from library:</span>
                </div>
                {(media?.length ?? 0) > 0 ? (
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-md border border-border p-2">
                    {media!.map((m) => {
                      const src = mediaUrl(m.id);
                      if (!src) return null;
                      const isFeatured = m.id === item.featuredMediaId;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          title={m.fileName ?? m.id}
                          onClick={() => void setFeatured(isFeatured ? null : m.id)}
                          className={`h-14 w-14 shrink-0 overflow-hidden rounded-md border ${isFeatured ? "border-primary ring-2 ring-primary/40" : "border-border"} hover:border-fg/40`}
                        >
                          <img src={src} alt={m.altText ?? ""} className="h-full w-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-fg-muted">Upload an image or add one in the body to populate the library.</p>
                )}
              </div>
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
