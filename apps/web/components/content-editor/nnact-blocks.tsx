"use client";

import {
  createReactBlockSpec,
  type ReactCustomBlockRenderProps,
} from "@blocknote/react";

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

export const NnactBeforeAfter = buildNnactBlock({
  type: "nnactBeforeAfter",
  label: "Before / After",
  fields: [
    { key: "beforeUrl", label: "Before image URL" },
    { key: "afterUrl", label: "After image URL" },
    { key: "caption", label: "Caption", full: true },
  ],
});

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

export const NnactImageGallery = buildNnactBlock({
  type: "nnactImageGallery",
  label: "Image Gallery",
  fields: [
    { key: "imageUrls", label: "Image URLs (comma separated)", kind: "textarea", full: true },
    { key: "layout", label: "Layout", kind: "select", options: ["grid", "row"] },
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
} as const;
