"use client";

import { useRef, useState } from "react";
import {
  createReactBlockSpec,
  type ReactCustomBlockRenderProps,
} from "@blocknote/react";
import {
  useContentMediaQuery,
  useUploadContentMediaMutation,
} from "@/lib/redux/api";
import { mediaUrl } from "@/lib/media-url";

// ─────────────────────────────────────────────────────────────────────────────
// NNACT custom blocks shared with the server-side transformer
// (shared/content-document.ts). Every block stores its authored data in `props`
// only (content: "none"). The type strings MUST match the constants used by the
// publishing worker transformer. Adding a block = define its spec here and a
// renderer in the shared transformer — no provider edits needed.
// ─────────────────────────────────────────────────────────────────────────────

function FieldEditor({
  label,
  value,
  kind = "text",
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  kind?: "text" | "textarea" | "select";
  options?: string[];
  placeholder?: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs">
      <span className="font-medium text-fg-muted">{label}</span>
      {kind === "select" ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary/30"
        >
          {(options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : kind === "textarea" ? (
        <textarea
          value={value}
          placeholder={placeholder}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary/30"
        />
      ) : (
        <input
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-sm text-fg outline-none focus:ring-2 focus:ring-primary/30"
        />
      )}
    </label>
  );
}

function buildNnactBlock<const TName extends string>(meta: {
  type: TName;
  label: string;
  fields: {
    key: string;
    label: string;
    kind?: "text" | "textarea" | "select";
    options?: string[];
    placeholder?: string;
    full?: boolean;
  }[];
}) {
  const propSchema = Object.fromEntries(
    meta.fields.map((f) => [
      f.key,
      f.kind === "select" && f.options?.length
        ? { default: f.options[0], values: f.options }
        : { default: "" },
    ]),
  ) as Record<string, { default: string; values?: string[] }>;

  return createReactBlockSpec(
    {
      type: meta.type,
      propSchema,
      content: "none",
    },
    {
      render: ({ block, editor }: ReactCustomBlockRenderProps<any>) => {
        const setProp = (key: string, value: string) => {
          editor.updateBlock(block, { props: { ...block.props, [key]: value } });
        };
        return (
          <div
            className="nnact-block"
            data-nnact-block={meta.type}
            style={{
              borderRadius: 10,
              border: "1px solid var(--border, #e2e8f0)",
              padding: 12,
              margin: "8px 0",
              background: "var(--card, #fff)",
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: "var(--nnact-accent, #0f766e)",
                marginBottom: 8,
              }}
            >
              {meta.label}
            </div>
            <div className="grid gap-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {meta.fields.map((f) => (
                <div key={f.key} style={f.full ? { gridColumn: "1 / -1" } : undefined}>
                  <FieldEditor
                    label={f.label}
                    value={(block.props[f.key] as string) ?? ""}
                    kind={f.kind}
                    options={f.options}
                    placeholder={f.placeholder}
                    onChange={(v) => setProp(f.key, v)}
                  />
                </div>
              ))}
            </div>
          </div>
        );
      },
    },
  )();
}

export const NnactMaintenanceTip = buildNnactBlock({
  type: "nnactMaintenanceTip",
  label: "Maintenance Tip",
  fields: [
    { key: "title", label: "Title" },
    { key: "variant", label: "Variant", kind: "select", options: ["service", "proactive", "seasonal"] },
  ],
});

export const NnactSafetyNotice = buildNnactBlock({
  type: "nnactSafetyNotice",
  label: "Safety Notice",
  fields: [
    { key: "severity", label: "Severity", kind: "select", options: ["INFO", "CAUTION", "WARNING"] },
    { key: "title", label: "Title", full: true },
  ],
});

export const NnactServiceCta = buildNnactBlock({
  type: "nnactServiceCta",
  label: "Service CTA",
  fields: [
    { key: "ctaLabel", label: "Button label" },
    { key: "ctaUrl", label: "Button link" },
    { key: "serviceType", label: "Service type", full: true },
    { key: "description", label: "Description", kind: "textarea", full: true },
  ],
});

export const NnactYoutube = buildNnactBlock({
  type: "nnactYoutube",
  label: "YouTube Embed",
  fields: [
    { key: "url", label: "Video URL", full: true, placeholder: "https://youtube.com/watch?v=..." },
    { key: "caption", label: "Caption (optional)", full: true },
  ],
});

// ── Uploaded-media picker ──────────────────────────────────────────────────
// Shared control used by the image blocks: upload new files (stored via the
// Content Studio media endpoint) or pick existing assets from the library.
// Values are persisted as primitive UUID strings (BlockNote prop schemas are
// primitive-only), which the server-side transformer resolves to approved
// public media URLs.

function MediaPicker({
  label,
  ids,
  onIdsChange,
  multiple = false,
}: {
  label: string;
  ids: string[];
  onIdsChange: (ids: string[]) => void;
  multiple?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { data: library } = useContentMediaQuery();
  const [upload, { isLoading }] = useUploadContentMediaMutation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setBusy(true);
    setError(null);
    try {
      const picked: string[] = [];
      for (const file of Array.from(files)) {
        const created = await upload(file).unwrap();
        picked.push(created.id);
      }
      onIdsChange(multiple ? [...ids, ...picked] : picked);
    } catch (err) {
      setError("Upload failed");
      console.error(err);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const toggle = (id: string) => {
    if (multiple) {
      onIdsChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    } else {
      onIdsChange(ids[0] === id ? [] : [id]);
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isLoading || busy}
          className="rounded-md border border-border bg-background px-2 py-1.5 text-xs font-medium text-fg outline-none focus:ring-2 focus:ring-primary/30 hover:bg-fg/5 disabled:opacity-50"
        >
          {busy || isLoading ? "Uploading…" : `Upload ${label}`}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
        {ids.length === 0 && <span className="text-[11px] text-fg-muted">or pick from library below</span>}
      </div>
      {ids.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {ids
            .map((id) => mediaUrl(id))
            .filter((src): src is string => Boolean(src))
            .map((src, i) => (
              <div key={src + i} className="relative h-16 w-16">
                <img src={src} alt="" className="h-full w-full rounded-md border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => onIdsChange(multiple ? ids.filter((_, idx) => idx !== i) : [])}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red text-[11px] leading-none text-white"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
        </div>
      )}
      {error && <p className="text-[11px] text-red">{error}</p>}
      {(library?.length ?? 0) > 0 && (
        <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto rounded-md border border-border bg-background p-2">
          {library!.map((m) => {
            const src = mediaUrl(m.id);
            if (!src) return null;
            const active = ids.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => toggle(m.id)}
                title={m.fileName ?? m.id}
                className={`h-12 w-12 shrink-0 overflow-hidden rounded-md border ${active ? "border-primary ring-2 ring-primary/40" : "border-border"} hover:border-fg/40`}
              >
                <img src={src} alt={m.altText ?? ""} className="h-full w-full object-cover" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export const NnactBeforeAfter = createReactBlockSpec(
  {
    type: "nnactBeforeAfter",
    propSchema: { beforeUrl: { default: "" }, afterUrl: { default: "" }, caption: { default: "" } },
    content: "none",
  },
  {
    render: ({ block, editor }: ReactCustomBlockRenderProps<any>) => {
      const setProp = (key: string, value: string) => {
        editor.updateBlock(block, { props: { ...block.props, [key]: value } });
      };
      return (
        <div
          className="nnact-block"
          data-nnact-block="nnactBeforeAfter"
          style={{
            borderRadius: 10,
            border: "1px solid var(--border, #e2e8f0)",
            padding: 12,
            margin: "8px 0",
            background: "var(--card, #fff)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--nnact-accent, #0f766e)",
              marginBottom: 8,
            }}
          >
            Before / After
          </div>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-fg-muted">Before</span>
              <MediaPicker label="before photo" ids={beforeUrlIds(block.props.beforeUrl)} multiple={false} onIdsChange={(n) => setProp("beforeUrl", n[0] ?? "")} />
            </div>
            <div className="grid gap-1">
              <span className="text-xs font-medium text-fg-muted">After</span>
              <MediaPicker label="after photo" ids={beforeUrlIds(block.props.afterUrl)} multiple={false} onIdsChange={(n) => setProp("afterUrl", n[0] ?? "")} />
            </div>
          </div>
          <div className="mt-2">
            <FieldEditor label="Caption" value={block.props.caption as string} onChange={(v) => setProp("caption", v)} />
          </div>
        </div>
      );
    },
  },
)();

function beforeUrlIds(v: unknown): string[] {
  return typeof v === "string" && v.trim() ? [v.trim()] : [];
}

export const NnactImageGallery = createReactBlockSpec(
  {
    type: "nnactImageGallery",
    propSchema: { imageUrls: { default: "" }, layout: { default: "grid", values: ["grid", "row"] } },
    content: "none",
  },
  {
    render: ({ block, editor }: ReactCustomBlockRenderProps<any>) => {
      const setProp = (key: string, value: string) => {
        editor.updateBlock(block, { props: { ...block.props, [key]: value } });
      };
      const ids = ((block.props.imageUrls as string) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
      return (
        <div
          className="nnact-block"
          data-nnact-block="nnactImageGallery"
          style={{
            borderRadius: 10,
            border: "1px solid var(--border, #e2e8f0)",
            padding: 12,
            margin: "8px 0",
            background: "var(--card, #fff)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--nnact-accent, #0f766e)",
              marginBottom: 8,
            }}
          >
            Image Gallery
          </div>
          <MediaPicker label="photos" multiple ids={ids} onIdsChange={(n) => setProp("imageUrls", n.join(","))} />
          <div className="mt-2">
            <FieldEditor label="Layout" value={block.props.layout as string} kind="select" options={["grid", "row"]} onChange={(v) => setProp("layout", v)} />
          </div>
        </div>
      );
    },
  },
)();

export const NnactUploadedImage = createReactBlockSpec(
  {
    type: "nnactUploadedImage",
    propSchema: { url: { default: "" }, altText: { default: "" }, caption: { default: "" } },
    content: "none",
  },
  {
    render: ({ block, editor }: ReactCustomBlockRenderProps<any>) => {
      const setProp = (key: string, value: string) => {
        editor.updateBlock(block, { props: { ...block.props, [key]: value } });
      };
      const url = block.props.url as string;
      const src = mediaUrl(beforeUrlIds(url)[0] ?? null);
      return (
        <div
          className="nnact-block"
          data-nnact-block="nnactUploadedImage"
          style={{
            borderRadius: 10,
            border: "1px solid var(--border, #e2e8f0)",
            padding: 12,
            margin: "8px 0",
            background: "var(--card, #fff)",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              color: "var(--nnact-accent, #0f766e)",
              marginBottom: 8,
            }}
          >
            Attached Photo
          </div>
          {src ? (
            <div className="grid gap-2">
              <img src={src} alt={block.props.altText as string} className="max-h-80 w-auto max-w-full rounded-md border border-border object-contain" />
              <MediaPicker label="replace photo" ids={[url]} multiple={false} onIdsChange={(n) => setProp("url", n[0] ?? "")} />
            </div>
          ) : (
            <MediaPicker label="an image" ids={[]} multiple={false} onIdsChange={(n) => setProp("url", n[0] ?? "")} />
          )}
          <div className="mt-2 grid gap-2">
            <FieldEditor label="Alt text (accessibility)" value={block.props.altText as string} onChange={(v) => setProp("altText", v)} />
            <FieldEditor label="Caption" value={block.props.caption as string} onChange={(v) => setProp("caption", v)} />
          </div>
        </div>
      );
    },
  },
)();

export const NnactProjectHighlight = buildNnactBlock({
  type: "nnactProjectHighlight",
  label: "Project Highlight",
  fields: [
    { key: "title", label: "Project title" },
    { key: "serviceType", label: "Service type" },
    { key: "location", label: "Location", full: true },
    { key: "link", label: "Project link (optional)", full: true },
  ],
});

export const NnactTestimonial = buildNnactBlock({
  type: "nnactTestimonial",
  label: "Testimonial",
  fields: [
    { key: "quote", label: "Quote", kind: "textarea", full: true },
    { key: "customerDisplayName", label: "Customer" },
    { key: "company", label: "Company" },
  ],
});

export const NNACT_BLOCK_SPECS = {
  nnactMaintenanceTip: NnactMaintenanceTip,
  nnactSafetyNotice: NnactSafetyNotice,
  nnactServiceCta: NnactServiceCta,
  nnactYoutube: NnactYoutube,
  nnactBeforeAfter: NnactBeforeAfter,
  nnactProjectHighlight: NnactProjectHighlight,
  nnactTestimonial: NnactTestimonial,
  nnactImageGallery: NnactImageGallery,
  nnactUploadedImage: NnactUploadedImage,
} as const;
