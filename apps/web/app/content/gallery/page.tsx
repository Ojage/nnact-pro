"use client";

// Image gallery — the operator-facing library of images the content automation
// uses for its posts.
//
// Layout intent is Google Photos: a dense justified grid, selection state on
// every tile, a lightbox for the full view, and label chips that act as album
// selectors. The difference that matters is what each chip *means*. A chip is
// not decoration — it is the instruction the pipeline reads when it picks an
// image for a post (see pickCandidateFor in apps/api/src/ai/image.ts), so the
// UI says so explicitly rather than letting an operator assume a tag is
// cosmetic.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useBulkLabelContentMediaMutation,
  useMediaFacetsQuery,
  useMediaGalleryQuery,
  usePatchContentMediaMutation,
  useUploadGalleryMediaMutation,
} from "@/lib/redux/api";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatRelativeTime } from "@/lib/utils";
import { MEDIA_USE_FOR, type ContentMediaDTO, type MediaUseFor } from "@nnact/shared";
import { explainRtkError } from "@/lib/redux/api";

const PAGE_SIZE = 60;

const USE_FOR_LABELS: Record<MediaUseFor, string> = {
  ANY: "Any post",
  ARTICLE: "Articles",
  MAINTENANCE_TIP: "Maintenance tips",
  FIELD_STORY: "Field stories",
};

/** Why each label exists, shown in the labelling panel. Mirrors the API tiers. */
const USE_FOR_HELP: Record<MediaUseFor, string> = {
  ANY: "Used for any post when nothing more specific is labelled.",
  ARTICLE: "Preferred for ARTICLE posts.",
  MAINTENANCE_TIP: "Preferred for MAINTENANCE_TIP posts.",
  FIELD_STORY: "Preferred for FIELD_STORY posts.",
};

export default function GalleryPage() {
  const [useFor, setUseFor] = useState<MediaUseFor | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [source, setSource] = useState<"manual" | "ai_generated" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<ContentMediaDTO | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const filters = useMemo(
    () => ({ useFor: useFor ?? undefined, tags, search: search || undefined, source, archived: showArchived }),
    [useFor, tags, search, source, showArchived],
  );

  const galleryQ = useMediaGalleryQuery({ ...filters, limit: PAGE_SIZE });
  const facetsQ = useMediaFacetsQuery(filters);
  const [upload, uploadState] = useUploadGalleryMediaMutation();
  const [bulkLabel, bulkState] = useBulkLabelContentMediaMutation();
  const [patchOne, patchState] = usePatchContentMediaMutation();
  const fileInput = useRef<HTMLInputElement>(null);

  const items = galleryQ.data ?? [];
  const facets = facetsQ.data;
  const selectedIds = useMemo(() => [...selected], [selected]);

  // Selection is a set of ids that can outlive the filter that produced it, so
  // clear it whenever the visible set changes underneath it — otherwise a bulk
  // label could silently apply to assets the operator can no longer see.
  const visibleKey = items.map((i) => i.id).join(",");
  useEffect(() => {
    setSelected(new Set());
  }, [visibleKey]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files].filter((f) => f.type.startsWith("image/"));
      if (list.length === 0) {
        setNotice({ kind: "err", text: "Only image files can be added to the gallery." });
        return;
      }
      const rejected = [...files].length - list.length;
      let done = 0;
      const failures: string[] = [];
      for (const file of list) {
        try {
          // Label at upload time so nothing lands in the "needs labelling" pile.
          await upload({ file, useFor: useFor ?? undefined }).unwrap();
          done += 1;
        } catch (err) {
          failures.push(file.name);
        }
      }
      const parts = [`Added ${done} ${done === 1 ? "image" : "images"}`];
      if (rejected > 0) parts.push(`${rejected} non-image file${rejected === 1 ? "" : "s"} skipped`);
      if (failures.length > 0) parts.push(`failed: ${failures.slice(0, 3).join(", ")}`);
      setNotice({ kind: failures.length > 0 ? "err" : "ok", text: parts.join(" · ") });
    },
    [upload, useFor],
  );

  const applyBulk = useCallback(
    async (change: { useFor?: MediaUseFor; tags?: string[]; archived?: boolean }) => {
      if (selectedIds.length === 0) return;
      try {
        const res = await bulkLabel({ ids: selectedIds, ...change }).unwrap();
        setNotice({ kind: "ok", text: `Updated ${res.updated} ${res.updated === 1 ? "image" : "images"}.` });
        setSelected(new Set());
      } catch (err) {
        setNotice({ kind: "err", text: explainRtkError(err, "Could not update images") });
      }
    },
    [bulkLabel, selectedIds],
  );

  const labelOne = useCallback(
    async (id: string, change: { useFor?: MediaUseFor; tags?: string[]; archived?: boolean; altText?: string | null }) => {
      try {
        await patchOne({ id, data: change }).unwrap();
      } catch (err) {
        setNotice({ kind: "err", text: explainRtkError(err, "Could not update image") });
      }
    },
    [patchOne],
  );

  return (
    <div className="space-y-6" data-tour="media-gallery">
      <PageHeader
        title="Image Gallery"
        description="Images the content automation can use for its posts. Labelling one tells the automation which kind of post it fits, and it is used automatically when AI image generation is unavailable."
        actions={
          <>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void handleFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileInput.current?.click()} loading={uploadState.isLoading}>
              Upload images
            </Button>
          </>
        }
      />

      {/* Filter bar: album-style label chips, then source and archive toggles. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <FilterChip active={useFor === null} onClick={() => setUseFor(null)}>
            All {facets ? `(${facets.total})` : ""}
          </FilterChip>
          {MEDIA_USE_FOR.map((value) => (
            <FilterChip
              key={value}
              active={useFor === value}
              onClick={() => setUseFor(useFor === value ? null : value)}
              title={USE_FOR_HELP[value]}
            >
              {USE_FOR_LABELS[value]}
              {facets?.byUseFor[value] ? ` ${facets.byUseFor[value]}` : ""}
            </FilterChip>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          <FilterChip active={source === null} onClick={() => setSource(null)}>
            Any source
          </FilterChip>
          <FilterChip active={source === "manual"} onClick={() => setSource(source === "manual" ? null : "manual")}>
            Uploaded {facets?.bySource.manual ?? 0}
          </FilterChip>
          <FilterChip active={source === "ai_generated"} onClick={() => setSource(source === "ai_generated" ? null : "ai_generated")}>
            AI generated {facets?.bySource.ai_generated ?? 0}
          </FilterChip>
          <FilterChip active={showArchived} onClick={() => setShowArchived((v) => !v)}>
            Archived
          </FilterChip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search file name, alt text, caption, prompt"
            className="max-w-xs"
          />
          {(facets?.byTag ?? []).slice(0, 12).map(({ tag, count }) => (
            <FilterChip
              key={tag}
              active={tags.includes(tag)}
              onClick={() => setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))}
            >
              {tag} {count}
            </FilterChip>
          ))}
        </div>
      </div>

      {notice ? (
        <div
          className={cn(
            "rounded-md px-3 py-2 text-sm",
            notice.kind === "ok" ? "bg-green/10 text-green" : "bg-red/10 text-red",
          )}
        >
          {notice.text}
        </div>
      ) : null}

      {/* Bulk action bar appears only with a selection, as in Google Photos. */}
      {selectedIds.length > 0 ? (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface p-3 shadow-sm">
          <span className="text-sm font-medium text-fg">{selectedIds.length} selected</span>
          <span className="h-5 w-px bg-line" />
          <span className="text-xs text-fg-muted">Label as</span>
          {MEDIA_USE_FOR.map((value) => (
            <Button key={value} size="sm" variant="outline" disabled={bulkState.isLoading} onClick={() => void applyBulk({ useFor: value })}>
              {USE_FOR_LABELS[value]}
            </Button>
          ))}
          <span className="ml-auto flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              loading={bulkState.isLoading}
              onClick={() => void applyBulk({ archived: !showArchived })}
            >
              {showArchived ? "Unarchive" : "Archive"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </span>
        </div>
      ) : null}

      {/* Dropzone doubles as the empty state. */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropActive(false);
          if (e.dataTransfer.files) void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-xl border-2 border-dashed p-3 transition-colors",
          dropActive ? "border-accent bg-accent/5" : "border-line",
        )}
      >
        {galleryQ.isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square w-full rounded-md" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-14 text-center">
            <p className="text-sm font-medium text-fg">No images here yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-fg-muted">
              Drop images above, or upload them. Anything you add is available to the automation
              immediately, even before it is labelled — labelling only makes the choice smarter.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {items.map((item) => (
              <GalleryTile
                key={item.id}
                item={item}
                selected={selected.has(item.id)}
                onToggle={() => toggle(item.id)}
                onOpen={() => setLightbox(item)}
              />
            ))}
          </div>
        )}
      </div>

      {facets ? (
        <p className="text-xs text-fg-muted">
          Showing {facets.filtered ?? items.length} of {facets.total}
          {facets.unlabelled > 0 ? ` · ${facets.unlabelled} still need a label` : ""}
        </p>
      ) : null}

      {lightbox ? (
        <Lightbox
          key={lightbox.id}
          item={lightbox}
          onClose={() => setLightbox(null)}
          onLabel={(change) => void labelOne(lightbox.id, change)}
          busy={patchState.isLoading}
        />
      ) : null}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "cursor-pointer rounded-full border px-3 py-1 text-xs transition-colors",
        active ? "border-transparent bg-accent text-accent-fg" : "border-line text-fg-muted hover:bg-fg-dim/5",
      )}
    >
      {children}
    </button>
  );
}

function GalleryTile({
  item,
  selected,
  onToggle,
  onOpen,
}: {
  item: ContentMediaDTO;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const isImage = item.contentType.startsWith("image/");
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "group relative aspect-square cursor-pointer overflow-hidden rounded-md border bg-fg-dim/5 transition-shadow",
        selected ? "border-accent ring-2 ring-accent" : "border-line hover:shadow-md",
      )}
    >
      {isImage ? (
        // The gallery is a grid of many thumbnails, so lazy-load and give the
        // box a fixed aspect to keep the layout from reflowing as they arrive.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt={item.altText ?? item.fileName ?? "Gallery image"} loading="lazy" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-fg-muted">{item.contentType}</div>
      )}

      {/* Selection tick, mirroring the Google Photos affordance. */}
      <button
        type="button"
        aria-label={selected ? "Deselect image" : "Select image"}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={cn(
          "absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full border transition-colors",
          selected ? "border-accent bg-accent text-accent-fg" : "border-white/80 bg-black/30 text-transparent opacity-0 group-hover:opacity-100",
        )}
      >
        ✓
      </button>

      {item.archived ? (
        <span className="absolute right-1.5 top-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">Archived</span>
      ) : null}

      {/* Label + source strip, always visible: this is the gallery's whole point. */}
      <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-[10px] text-white">
        <span className="truncate font-medium">
          {item.useFor ? USE_FOR_LABELS[item.useFor] : USE_FOR_LABELS.ANY}
        </span>
        {item.source === "ai_generated" ? <span className="shrink-0 opacity-80">· AI</span> : null}
        {item.aiUsageCount > 0 ? <span className="shrink-0 opacity-80">· used {item.aiUsageCount}×</span> : null}
      </div>
    </div>
  );
}

function Lightbox({
  item,
  onClose,
  onLabel,
  busy,
}: {
  item: ContentMediaDTO;
  onClose: () => void;
  onLabel: (change: { useFor?: MediaUseFor; tags?: string[]; archived?: boolean; altText?: string | null }) => void;
  busy: boolean;
}) {
  const [tagDraft, setTagDraft] = useState(item.tags.join(", "));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const commitTags = () => {
    const tags = tagDraft
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (tags.join(",") !== item.tags.join(",")) onLabel({ tags });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-surface md:flex-row"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black/90 p-2">
          {item.contentType.startsWith("image/") ? (
            // The full-size view is exactly what a lightbox is for, so it is not
            // lazy-loaded and gets a plain img rather than next/image.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.altText ?? item.fileName ?? "Image"} className="max-h-[80vh] w-auto max-w-full object-contain" />
          ) : (
            <p className="p-8 text-sm text-white/70">Preview is only available for images. This asset is {item.contentType}.</p>
          )}
        </div>

        <div className="w-full shrink-0 space-y-4 overflow-y-auto p-4 md:w-80">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-fg">{item.fileName ?? "Untitled"}</p>
              <p className="text-xs text-fg-muted">Added {formatRelativeTime(item.createdAt)}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {item.source === "ai_generated" ? <Badge className="border-transparent bg-purple/10 text-purple">AI generated</Badge> : null}
            {item.aiUsageCount > 0 ? (
              <Badge className="border-transparent bg-blue/10 text-blue">Used {item.aiUsageCount}×</Badge>
            ) : (
              <Badge className="border-transparent bg-fg-dim/10 text-fg-dim">Not used yet</Badge>
            )}
            {item.archived ? <Badge className="border-transparent bg-amber/10 text-amber">Archived</Badge> : null}
            {item.aiLastUsedAt ? <span className="text-xs text-fg-muted">Last used {formatRelativeTime(item.aiLastUsedAt)}</span> : null}
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Used for</p>
            <div className="flex flex-wrap gap-1.5">
              {MEDIA_USE_FOR.map((value) => (
                <FilterChip
                  key={value}
                  title={USE_FOR_HELP[value]}
                  active={(item.useFor ?? "ANY") === value}
                  onClick={() => onLabel({ useFor: value })}
                >
                  {USE_FOR_LABELS[value]}
                </FilterChip>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Subject tags</p>
            <Input
              value={tagDraft}
              onChange={(e) => setTagDraft(e.target.value)}
              onBlur={commitTags}
              placeholder="refrigeration, hvac, generator"
            />
            <p className="mt-1 text-xs text-fg-muted">Comma separated. Used to match this image to a post&apos;s topic.</p>
          </div>

          {item.aiPrompt ? (
            <div>
              <p className="mb-1.5 text-xs font-medium text-fg-muted">Generation prompt</p>
              <p className="max-h-32 overflow-y-auto rounded-md bg-fg-dim/5 p-2 text-xs text-fg-muted">{item.aiPrompt}</p>
            </div>
          ) : null}

          <div>
            <p className="mb-1.5 text-xs font-medium text-fg-muted">Alt text</p>
            <Input
              key={item.altText ?? ""}
              defaultValue={item.altText ?? ""}
              onBlur={(e) => {
                const next = e.target.value.trim();
                if (next !== (item.altText ?? "")) void onLabel({ altText: next || null });
              }}
              placeholder="Describe the image"
            />
            <p className="mt-1 text-xs text-fg-muted">Social platforms index this, and Instagram has no caption field.</p>
          </div>

          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => onLabel({ archived: !item.archived })}
          >
            {item.archived ? "Restore to gallery" : "Archive"}
          </Button>
          <p className="text-xs text-fg-muted">
            Archiving hides the image from the gallery and stops the automation from choosing it. Bytes are
            kept, so published posts keep working.
          </p>
        </div>
      </div>
    </div>
  );
}
