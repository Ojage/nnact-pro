// Structured body-document — the canonical serialized article representation.
//
// We store BlockNote's native block document (a plain, JSON-serializable tree of
// `{ type, props, content, children }` nodes) as `body_document` in the DB. This
// module is the ONLY place that knows how to interpret those nodes and turn them
// into generated representations (HTML / Markdown / plain text / channel payloads).
//
// It is intentionally dependency-free and pure so it can run identically in:
//   - the browser (editor preview, autosave)
//   - the API/worker (publishing jobs with no browser)
//   - the public marketing website (lightweight rendering)
//
// The publishing providers never see this structure directly; they receive the
// normalized strings produced here. Adding a custom NNACT block only requires a
// renderer in this module (+ the matching editor block) — no provider changes.

export type BodyDocument = BodyBlock[];

// Minimal structural types for the canonical document. Every field is plain JSON.
export interface InlineText {
  type: "text";
  text: string;
  styles?: Record<string, boolean>;
}

export type InlineContent = string | InlineText[] | (string | InlineText)[] | null | undefined;

export interface BodyBlock {
  type: string;
  props?: Record<string, unknown>;
  content?: InlineContent;
  children?: BodyBlock[];
}

// ── NNACT custom block types ────────────────────────────────────────────────
// These are the stable, versioned type strings used in `props`/`type` on custom
// blocks. The editor registry and the transformer both key off these constants.
export const NNACT_BLOCK_TYPES = [
  "nnactMaintenanceTip",
  "nnactSafetyNotice",
  "nnactServiceCta",
  "nnactYoutube",
  "nnactImageGallery",
  "nnactBeforeAfter",
  "nnactProjectHighlight",
  "nnactTestimonial",
] as const;
export type NnactBlockType = (typeof NNACT_BLOCK_TYPES)[number];

export interface NnactMaintenanceTipProps {
  title?: string | null;
  body: string;
  variant?: string | null;
}
export interface NnactSafetyNoticeProps {
  severity?: "INFO" | "CAUTION" | "WARNING";
  title?: string | null;
  body?: string | null;
}
export interface NnactServiceCtaProps {
  title?: string | null;
  description?: string | null;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  serviceType?: string | null;
}
export interface NnactYoutubeProps {
  url: string;
  videoId?: string | null;
  caption?: string | null;
}
export interface NnactMediaRef {
  mediaId: string;
  altText?: string | null;
  caption?: string | null;
}
export interface NnactImageGalleryProps {
  images: NnactMediaRef[];
  layout?: string | null;
}
export interface NnactBeforeAfterProps {
  before: NnactMediaRef | null;
  after: NnactMediaRef | null;
  caption?: string | null;
}
export interface NnactProjectHighlightProps {
  title?: string | null;
  serviceType?: string | null;
  summary?: string | null;
  location?: string | null;
  media?: NnactMediaRef | null;
  link?: string | null;
}
export interface NnactTestimonialProps {
  quote: string;
  customerDisplayName?: string | null;
  company?: string | null;
  serviceType?: string | null;
}

// ── Text helpers ──────────────────────────────────────────────────────────

export function inlineToPlain(inline: InlineContent): string {
  if (inline == null) return "";
  if (typeof inline === "string") return (inline as string).trim();
  if (Array.isArray(inline)) {
    return inline
      .map((part) => (typeof part === "string" ? part : (part as InlineText).text ?? ""))
      .join("");
  }
  return "";
}

export function inlineToMarkdown(inline: InlineContent): string {
  if (inline == null) return "";
  if (typeof inline === "string") return inline as string;
  if (Array.isArray(inline)) {
    return inline
      .map((part) => {
        if (typeof part === "string") return part;
        const s = part.styles ?? {};
        let t = part.text ?? "";
        if (s.bold) t = `**${t}**`;
        if (s.italic) t = `*${t}*`;
        if (s.code) t = `\`${t}\``;
        if (s.strike) t = `~~${t}~~`;
        return t;
      })
      .join("");
  }
  return "";
}

export function inlineToHtml(inline: InlineContent): string {
  if (inline == null) return "";
  if (typeof inline === "string") return escapeHtml(inline as string);
  if (Array.isArray(inline)) {
    return inline
      .map((part) => {
        if (typeof part === "string") return escapeHtml(part);
        const s = part.styles ?? {};
        let t = escapeHtml(part.text ?? "");
        if (s.bold) t = `<strong>${t}</strong>`;
        if (s.italic) t = `<em>${t}</em>`;
        if (s.code) t = `<code>${t}</code>`;
        if (s.strike) t = `<del>${t}</del>`;
        return t;
      })
      .join("");
  }
  return "";
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Transformations ───────────────────────────────────────────────────────

/**
 * Recursively compute the plain-text representation of a block tree. Used for
 * word counts, reading time, and as a fallback text for channels.
 */
export function bodyDocumentToPlainText(document: BodyDocument): string {
  const lines: string[] = [];
  for (const block of document ?? []) {
    appendBlockPlain(block, lines, 0);
  }
  return lines.filter((l) => l.trim().length > 0).join("\n\n");
}

function appendBlockPlain(block: BodyBlock, lines: string[], depth: number): void {
  const props = (block.props ?? {}) as Record<string, unknown>;
  const children = block.children ?? [];

  switch (block.type) {
    case "heading": {
      const text = inlineToPlain(block.content);
      if (text) lines.push(`[heading] ${text}`);
      break;
    }
    case "bulletListItem":
    case "numberedListItem": {
      lines.push(`${"- ".repeat(depth + 1)}${inlineToPlain(block.content)}`);
      break;
    }
    case "checkListItem": {
      lines.push(`[ ] ${inlineToPlain(block.content)}`);
      break;
    }
    case "quote": {
      lines.push(`> ${inlineToPlain(block.content)}`);
      break;
    }
    case "codeBlock": {
      lines.push(inlineToPlain(block.content));
      break;
    }
    case "divider": {
      lines.push("---");
      break;
    }
    case "image": {
      const caption = (props.caption as string | undefined) ?? (props.alt as string | undefined);
      if (caption) lines.push(`[image] ${caption}`);
      break;
    }
    case "video": {
      lines.push("[video]");
      break;
    }
    case "table": {
      const table = props.content as unknown;
      if (Array.isArray(table)) {
        for (const row of table as Array<Array<{ content?: string | unknown[] }>>) {
          if (!Array.isArray(row)) continue;
          const cells = row.map((c) => {
            const cell = c as { content?: string | unknown[] };
            if (Array.isArray(cell?.content)) return (cell.content as unknown[]).map((p) => inlineToPlain((p as { content?: string }).content)).join(" ");
            return inlineToPlain((cell?.content as string) ?? "");
          });
          lines.push(`| ${cells.join(" | ")} |`);
        }
      }
      break;
    }
    // NNACT custom blocks
    case "nnactMaintenanceTip": {
      const p = props as unknown as NnactMaintenanceTipProps;
      if (p.title) lines.push(`MAINTENANCE TIP — ${p.title}`);
      lines.push(inlineToPlain(p.body));
      break;
    }
    case "nnactSafetyNotice": {
      const p = props as unknown as NnactSafetyNoticeProps;
      lines.push(`SAFETY NOTICE (${p.severity ?? "INFO"})${p.title ? `: ${p.title}` : ""}`);
      if (p.body) lines.push(inlineToPlain(p.body));
      break;
    }
    case "nnactServiceCta": {
      const p = props as unknown as NnactServiceCtaProps;
      lines.push(p.title && String(p.title).length ? `[CTA] ${p.title}` : "[CTA]");
      if (p.description) lines.push(inlineToPlain(p.description));
      if (p.ctaLabel && p.ctaUrl) lines.push(`${p.ctaLabel}: ${p.ctaUrl}`);
      break;
    }
    case "nnactYoutube": {
      const p = props as unknown as NnactYoutubeProps;
      lines.push(`[video] ${p.videoId ?? p.url}`);
      break;
    }
    case "nnactImageGallery": {
      const p = props as unknown as NnactImageGalleryProps;
      if (p.images?.length) lines.push(`[gallery: ${p.images.length} images]`);
      break;
    }
    case "nnactBeforeAfter": {
      const p = props as unknown as NnactBeforeAfterProps;
      lines.push(`Before / After${p.caption ? `: ${p.caption}` : ""}`);
      break;
    }
    case "nnactProjectHighlight": {
      const p = props as unknown as NnactProjectHighlightProps;
      if (p.title) lines.push(`[project] ${p.title}`);
      if (p.summary) lines.push(inlineToPlain(p.summary));
      break;
    }
    case "nnactTestimonial": {
      const p = props as unknown as NnactTestimonialProps;
      lines.push(`“${inlineToPlain(p.quote)}”`);
      if (p.customerDisplayName) lines.push(`— ${p.customerDisplayName}${p.company ? `, ${p.company}` : ""}`);
      break;
    }
    default: {
      const text = inlineToPlain(block.content);
      if (text) lines.push(text);
      break;
    }
  }

  for (const child of children) {
    appendBlockPlain(child, lines, depth + 1);
  }
}

/**
 * Render a block tree to semantic, XSS-safe HTML. Any block that carries an
 * attribute value coming from author input is HTML-escaped. Media URLs are not
 * embedded here (the resolver provides safe public URLs); callers pass a
 * `resolveMedia` fn that returns an absolute, authorizeable URL string.
 */
export interface HtmlRenderOptions {
  /** Map a mediaId to a safe public URL. Required to render image blocks. */
  resolveMedia?: (mediaId: string) => string | null;
  /** The site origin for canonical links. */
  siteUrl?: string;
}

export function bodyDocumentToHtml(document: BodyDocument, opts: HtmlRenderOptions = {}): string {
  const parts: string[] = [];
  for (const block of document ?? []) {
    parts.push(blockToHtml(block, opts));
  }
  return parts.join("\n");
}

function blockToHtml(block: BodyBlock, opts: HtmlRenderOptions): string {
  const props = (block.props ?? {}) as Record<string, unknown>;

  if (block.type === "nnactMediaRef" && props.mediaId) {
    // Nested media-reference values inside custom props are rendered by their
    // parent block; guard against accidental direct rendering.
    return "";
  }

  switch (block.type) {
    case "paragraph": {
      const body = inlineToHtml(block.content);
      const children = (block.children ?? []).map((c) => blockToHtml(c, opts)).join("");
      return body || children ? `<p>${body}${children}</p>` : "";
    }
    case "heading": {
      const level = Math.min(Math.max(Number(props.level) || 2, 1), 6);
      const text = inlineToHtml(block.content);
      return `<h${level}>${text}</h${level}>`;
    }
    case "bulletListItem": {
      const text = inlineToHtml(block.content);
      const children = (block.children ?? []).map((c) => blockToHtml(c, opts)).join("");
      return `<li>${text}${children}</li>`;
    }
    case "numberedListItem": {
      const text = inlineToHtml(block.content);
      const children = (block.children ?? []).map((c) => blockToHtml(c, opts)).join("");
      return `<li>${text}${children}</li>`;
    }
    case "checkListItem": {
      const checked = Boolean(props.checked);
      const text = inlineToHtml(block.content);
      return `<li class="check-list-item${checked ? " checked" : ""}"><input type="checkbox"${checked ? " checked" : ""} disabled /> ${text}</li>`;
    }
    case "quote": {
      const text = inlineToHtml(block.content);
      return `<blockquote>${text}</blockquote>`;
    }
    case "codeBlock": {
      const lang = props.language ? ` data-language="${escapeHtml(String(props.language))}"` : "";
      return `<pre${lang}><code>${inlineToHtml(block.content)}</code></pre>`;
    }
    case "divider": {
      return `<hr />`;
    }
    case "image": {
      const url = resolveSafeUrl(props.url, opts);
      const alt = props.altText ? String(props.altText) : props.alt ? String(props.alt) : "";
      const caption = props.caption ? String(props.caption) : "";
      if (!url) return caption ? `<figure><figcaption>${escapeHtml(caption)}</figcaption></figure>` : "";
      return `<figure><img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" loading="lazy" />${caption ? `<figcaption>${escapeHtml(caption)}</figcaption>` : ""}</figure>`;
    }
    case "video": {
      const url = resolveSafeUrl(props.url, opts);
      if (!url) return "";
      return `<figure class="video"><video controls preload="none" src="${escapeHtml(url)}"></video></figure>`;
    }
    case "table": {
      const table = props.content as unknown;
      if (!Array.isArray(table)) return "";
      const rows = (table as Array<Array<{ content?: string | unknown[] }>>)
        .map((row) => {
          if (!Array.isArray(row)) return "";
          const cells = row
            .map((c) => {
              if (typeof c === "string") return c;
              const cell = c as { content?: string | unknown[] };
              if (Array.isArray(cell?.content)) {
                return (cell.content as unknown[]).map((p) => inlineToHtml((p as { content?: string }).content)).join("");
              }
              return c === null || c === undefined ? "" : String(c);
            })
            .map((cell) => `<td>${cell}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("");
      return `<table><tbody>${rows}</tbody></table>`;
    }
    case "link": {
      const href = resolveSafeUrl(props.url, opts);
      const text = inlineToHtml(block.content);
      return href ? `<a href="${escapeHtml(href)}">${text}</a>` : text;
    }
    // ── NNACT custom blocks (server + site rendering) ──
    case "nnactMaintenanceTip": {
      const p = props as unknown as NnactMaintenanceTipProps;
      const title = p.title ? `<div class="nnact-callout-title">${escapeHtml(inlineToPlain(p.title))}</div>` : "";
      return `<aside class="nnact-callout nnact-maintenance-tip" data-variant="${escapeHtml((p.variant as string) ?? "service")}">${title}<div class="nnact-callout-body">${escapeHtml(inlineToPlain(p.body))}</div></aside>`;
    }
    case "nnactSafetyNotice": {
      const p = props as unknown as NnactSafetyNoticeProps;
      const severity = (p.severity as string) ?? "INFO";
      const title = p.title ? `<div class="nnact-callout-title"><span class="nnact-safety-severity">${escapeHtml(severity)}</span> ${escapeHtml(inlineToPlain(p.title))}</div>` : "";
      return `<aside class="nnact-callout nnact-safety-notice" data-severity="${escapeHtml(severity)}">${title}${p.body ? `<div class="nnact-callout-body">${escapeHtml(inlineToPlain(p.body))}</div>` : ""}</aside>`;
    }
    case "nnactServiceCta": {
      const p = props as unknown as NnactServiceCtaProps;
      const title = p.title ? `<span class="nnact-cta-title">${escapeHtml(inlineToPlain(p.title))}</span>` : "";
      const desc = p.description ? `<span class="nnact-cta-desc">${escapeHtml(inlineToPlain(p.description))}</span>` : "";
      const btn = p.ctaLabel && p.ctaUrl ? `<a class="nnact-cta-button" href="${escapeHtml(p.ctaUrl as string)}">${escapeHtml(p.ctaLabel as string)}</a>` : "";
      return `<div class="nnact-cta">${title}${desc}${btn}</div>`;
    }
    case "nnactYoutube": {
      const p = props as unknown as NnactYoutubeProps;
      const id = (p.videoId as string) ?? youtubeIdFromUrl((p.url as string) ?? "") ?? "";
      if (!id) return "";
      const caption = p.caption ? `<figcaption>${escapeHtml(String(p.caption))}</figcaption>` : "";
      return `<figure class="nnact-youtube"><div class="video-wrapper"><iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(id)}" title="${escapeHtml(p.caption as string) ?? "YouTube video"}" loading="lazy" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>${caption}</figure>`;
    }
    case "nnactImageGallery": {
      const p = props as unknown as NnactImageGalleryProps;
      const images = p.images ?? [];
      const items = images
        .map((img) => {
          const url = opts.resolveMedia?.(img.mediaId);
          if (!url) return "";
          return `<img src="${escapeHtml(url)}" alt="${escapeHtml(img.altText ?? "")}" loading="lazy" />`;
        })
        .filter(Boolean)
        .join("");
      return `<div class="nnact-gallery${p.layout ? ` nnact-gallery--${escapeHtml((p.layout as string).toLowerCase())}` : ""}">${items}</div>`;
    }
    case "nnactBeforeAfter": {
      const p = props as unknown as NnactBeforeAfterProps;
      const before = p.before?.mediaId ? opts.resolveMedia?.(p.before.mediaId) : null;
      const after = p.after?.mediaId ? opts.resolveMedia?.(p.after.mediaId) : null;
      const caption = p.caption ? `<figcaption>${escapeHtml(String(p.caption))}</figcaption>` : "";
      return `<figure class="nnact-before-after"><div class="ba-columns">${before ? `<div class="ba-before"><img src="${escapeHtml(before)}" alt="${escapeHtml(p.before?.altText ?? "Before")}" loading="lazy" /></div>` : ""}${after ? `<div class="ba-after"><img src="${escapeHtml(after)}" alt="${escapeHtml(p.after?.altText ?? "After")}" loading="lazy" /></div>` : ""}</div>${caption}</figure>`;
    }
    case "nnactProjectHighlight": {
      const p = props as unknown as NnactProjectHighlightProps;
      const title = p.title ? `<div class="nnact-project-title">${escapeHtml(inlineToPlain(p.title))}</div>` : "";
      const summary = p.summary ? `<div class="nnact-project-summary">${escapeHtml(inlineToPlain(p.summary))}</div>` : "";
      const meta: string[] = [];
      if (p.serviceType) meta.push(escapeHtml(String(p.serviceType)));
      if (p.location) meta.push(escapeHtml(String(p.location)));
      const media = p.media?.mediaId ? opts.resolveMedia?.(p.media.mediaId) : null;
      return `<div class="nnact-project">${title}${meta.length ? `<div class="nnact-project-meta">${meta.join(" · ")}</div>` : ""}${summary}${media ? `<img src="${escapeHtml(media)}" alt="${escapeHtml(p.media?.altText ?? "")}" loading="lazy" />` : ""}${p.link ? `<a class="nnact-project-link" href="${escapeHtml(String(p.link))}">View project</a>` : ""}</div>`;
    }
    case "nnactTestimonial": {
      const p = props as unknown as NnactTestimonialProps;
      const quote = inlineToPlain(p.quote);
      const byline = p.customerDisplayName ? `<cite>${escapeHtml(inlineToPlain(p.customerDisplayName))}${p.company ? ` — ${escapeHtml(inlineToPlain(p.company))}` : ""}</cite>` : "";
      return `<blockquote class="nnact-testimonial">${escapeHtml(quote)}${byline}</blockquote>`;
    }
    default: {
      const body = inlineToHtml(block.content);
      const children = (block.children ?? []).map((c) => blockToHtml(c, opts)).join("");
      return body || children ? `<p>${body}${children}</p>` : "";
    }
  }
}

function resolveSafeUrl(value: unknown, opts: HtmlRenderOptions): string | null {
  if (!value) return null;
  const raw = String(value);
  // Only allow http/https mailto and relative URLs — never javascript: etc.
  if (/^(https?:|mailto:|#|\/)/i.test(raw) && !/javascript:/i.test(raw)) return raw;
  return null;
}

export function youtubeIdFromUrl(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  return m ? m[1] : null;
}

/**
 * Render a block tree to Markdown. Used for legacy-compatible fallback and
 * future tooling. Custom blocks degrade to readable text/links.
 */
export function bodyDocumentToMarkdown(document: BodyDocument): string {
  const lines: string[] = [];
  for (const block of document ?? []) {
    appendBlockMarkdown(block, lines, 0);
  }
  return lines.join("\n").trim() + "\n";
}

function appendBlockMarkdown(block: BodyBlock, lines: string[], depth: number): void {
  const props = (block.props ?? {}) as Record<string, unknown>;
  switch (block.type) {
    case "heading": {
      const level = Math.min(Math.max(Number(props.level) || 2, 1), 6);
      const text = inlineToMarkdown(block.content);
      if (text) lines.push(`${"#".repeat(level)} ${text}`);
      break;
    }
    case "bulletListItem": {
      lines.push(`${"  ".repeat(depth)}* ${inlineToMarkdown(block.content)}`);
      (block.children ?? []).forEach((c) => appendBlockMarkdown(c, lines, depth + 1));
      return;
    }
    case "numberedListItem": {
      lines.push(`${"  ".repeat(depth)}1. ${inlineToMarkdown(block.content)}`);
      (block.children ?? []).forEach((c) => appendBlockMarkdown(c, lines, depth + 1));
      return;
    }
    case "checkListItem": {
      const checked = Boolean(props.checked);
      lines.push(`${"  ".repeat(depth)}${checked ? "[x]" : "[ ]"} ${inlineToMarkdown(block.content)}`);
      break;
    }
    case "quote": {
      const text = inlineToMarkdown(block.content);
      if (text) lines.push(text.split("\n").map((l) => `> ${l}`).join("\n"));
      break;
    }
    case "codeBlock": {
      const text = inlineToPlain(block.content);
      if (text) lines.push("```\n" + text + "\n```");
      break;
    }
    case "divider": {
      lines.push("---");
      break;
    }
    case "image": {
      const url = props.url ? String(props.url) : "";
      const alt = props.altText ? String(props.altText) : "";
      if (url) lines.push(`![${alt.replace(/"/g, '\\"')}](${url})`);
      break;
    }
    case "table": {
      const table = props.content as unknown;
      if (Array.isArray(table)) {
        for (const row of table as Array<Array<{ content?: string | unknown[] }>>) {
          if (!Array.isArray(row)) continue;
          const cells = row.map((c) => {
            const cell = c as { content?: string | unknown[] };
            if (Array.isArray(cell?.content)) return (cell.content as unknown[]).map((p) => inlineToMarkdown((p as { content?: string }).content)).join(" ");
            return inlineToMarkdown((cell?.content as string) ?? "");
          });
          lines.push(`| ${cells.join(" | ")} |`);
        }
      }
      break;
    }
    // Custom NNACT blocks → readable markdown text
    case "nnactMaintenanceTip": {
      const p = props as unknown as NnactMaintenanceTipProps;
      if (p.title) lines.push(`**MAINTENANCE TIP — ${inlineToMarkdown(p.title)}**`);
      lines.push(inlineToMarkdown(p.body));
      break;
    }
    case "nnactSafetyNotice": {
      const p = props as unknown as NnactSafetyNoticeProps;
      const header = `**SAFETY NOTICE (${p.severity ?? "INFO"})${p.title ? ` — ${inlineToMarkdown(p.title)}` : ""}**`;
      lines.push(header);
      if (p.body) lines.push(inlineToMarkdown(p.body));
      break;
    }
    case "nnactServiceCta": {
      const p = props as unknown as NnactServiceCtaProps;
      if (p.title) lines.push(`**${inlineToMarkdown(p.title)}**`);
      if (p.description) lines.push(inlineToMarkdown(p.description));
      if (p.ctaLabel && p.ctaUrl) lines.push(`<${p.ctaUrl}>(${p.ctaLabel})`);
      break;
    }
    case "nnactYoutube": {
      const p = props as unknown as NnactYoutubeProps;
      lines.push(`> Video: ${p.caption ?? p.url}`);
      break;
    }
    case "nnactBeforeAfter": {
      const p = props as unknown as NnactBeforeAfterProps;
      lines.push(`**Before / After**${p.caption ? ` — ${inlineToMarkdown(p.caption)}` : ""}`);
      break;
    }
    case "nnactProjectHighlight": {
      const p = props as unknown as NnactProjectHighlightProps;
      if (p.title) lines.push(`**${inlineToMarkdown(p.title)}**`);
      if (p.summary) lines.push(inlineToMarkdown(p.summary));
      if (p.link) lines.push(`<${p.link}>`);
      break;
    }
    case "nnactTestimonial": {
      const p = props as unknown as NnactTestimonialProps;
      lines.push(`> “${inlineToMarkdown(p.quote)}”${p.customerDisplayName ? ` — ${inlineToMarkdown(p.customerDisplayName)}` : ""}`);
      break;
    }
    case "nnactImageGallery": {
      const p = props as unknown as NnactImageGalleryProps;
      if (p.images?.length) lines.push(`*[Image gallery: ${p.images.length} images]*`);
      break;
    }
    default: {
      const text = inlineToMarkdown(block.content);
      if (text) lines.push(text);
      (block.children ?? []).forEach((c) => appendBlockMarkdown(c, lines, depth + 1));
      return;
    }
  }
  (block.children ?? []).forEach((c) => appendBlockMarkdown(c, lines, depth + 1));
}

export interface ChannelPayload {
  text: string;
  excerpt?: string | null;
  mediaCount: number;
}

/**
 * Transform the master document into an appropriate payload for a social / text
 * channel, honouring provider capabilities. Long article blocks are truncated to
 * a sensible excerpt; custom presentation blocks degrade to clean text. This is
 * what the publishing worker feeds to adapters in place of raw article text.
 */
export function bodyDocumentToChannelPayload(
  document: BodyDocument,
  capabilities: { maxTextLength: number; supportsImages: boolean },
  opts: { maxChars?: number } = {},
): ChannelPayload {
  const text = bodyDocumentToPlainText(document);
  let truncated = text;
  if ((opts.maxChars ?? capabilities.maxTextLength) > 0 && truncated.length > (opts.maxChars ?? capabilities.maxTextLength)) {
    truncated = truncated.slice(0, (opts.maxChars ?? capabilities.maxTextLength) - 1).trimEnd() + "…";
  }
  // Count media-bearing blocks.
  let mediaCount = 0;
  for (const block of document ?? []) {
    if (["image", "video"].includes(block.type)) mediaCount += 1;
    const props = (block.props ?? {}) as Record<string, unknown>;
    if (block.type === "nnactImageGallery") mediaCount += ((props.images as { mediaId: string }[]) ?? []).length;
    if (block.type === "nnactBeforeAfter") mediaCount += ((props.before as { mediaId: string }) || (props.after as { mediaId: string })) ? 1 : 0;
    if (block.type === "nnactProjectHighlight" && (props.media as { mediaId: string } | undefined)?.mediaId) mediaCount += 1;
  }
  return { text: truncated, excerpt: null, mediaCount };
}

// ── Validation ────────────────────────────────────────────────────────────

const MAX_DOCUMENT_BLOCKS = 5_000;
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024; // 5MB cap on serialized document
const KNOWN_BLOCK_TYPES = new Set<string>([
  "paragraph",
  "heading",
  "bulletListItem",
  "numberedListItem",
  "checkListItem",
  "quote",
  "codeBlock",
  "divider",
  "image",
  "video",
  "table",
  "link",
  ...NNACT_BLOCK_TYPES,
]);

/**
 * Validate a body document. Throws on malformed input; returns a normalized,
 * safe array of blocks. Used server-side so arbitrary client JSON is never
 * persisted.
 */
export function validateBodyDocument(input: unknown): BodyDocument {
  if (input == null) return [];
  if (!Array.isArray(input)) throw new Error("bodyDocument must be an array of blocks");
  if (input.length > MAX_DOCUMENT_BLOCKS) throw new Error("bodyDocument has too many blocks");
  const json = JSON.stringify(input);
  if (json.length > MAX_DOCUMENT_BYTES) throw new Error("bodyDocument exceeds size limit");
  const out: BodyBlock[] = [];
  for (const node of input) {
    out.push(validateBlock(node, 0));
  }
  return out;
}

function validateBlock(node: unknown, depth: number): BodyBlock {
  if (depth > 10) throw new Error("bodyDocument too deeply nested");
  if (typeof node !== "object" || node === null) throw new Error("invalid bodyDocument block");
  const b = node as BodyBlock;
  if (typeof b.type !== "string" || !KNOWN_BLOCK_TYPES.has(b.type)) {
    throw new Error(`unknown block type: ${String(b?.type)}`);
  }
  const out: BodyBlock = { type: b.type };
  if (b.props != null && typeof b.props === "object") out.props = b.props as Record<string, unknown>;
  if (b.content != null) out.content = b.content as InlineContent;
  if (Array.isArray(b.children)) {
    out.children = (b.children as unknown[]).map((c) => validateBlock(c, depth + 1));
  }
  return out;
}

// ── Legacy markdown → body-document converter ──────────────────────────────
// Converts a simple markdown string (paragraphs, headings, lists, code fences)
// into a valid BodyDocument.  Intended for backfilling legacy `body` text into
// the new structured format; handles the common patterns but does NOT aim for
// full CommonMark compliance.

/** Parse inline markdown (`**bold**`, `*italic*`, `` `code` ``, `[text](url)`) into InlineText[]. */
function parseInlineMarkdown(text: string): InlineText[] {
  const tokens: InlineText[] = [];
  // Regex: **bold**, *italic*, `code`, [link](url)
  const re = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ type: "text", text: text.slice(last, m.index) });
    if (m[2] != null)       tokens.push({ type: "text", text: m[2], styles: { bold: true } });
    else if (m[3] != null) tokens.push({ type: "text", text: m[3], styles: { italic: true } });
    else if (m[4] != null) tokens.push({ type: "text", text: m[4], styles: { code: true } });
    else if (m[5] != null) tokens.push({ type: "text", text: m[5] });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ type: "text", text: text.slice(last) });
  return tokens.length === 0 ? [{ type: "text", text }] : tokens;
}

export function markdownToBodyDocument(markdown: string): BodyDocument {
  if (!markdown || !markdown.trim()) return [];
  const blocks: BodyBlock[] = [];
  // Split on double-newlines (blank lines) for top-level blocks.
  const sections = markdown.split(/\n{2,}/);
  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // Code fence: ```lang\n...\n```
    if (/^```/.test(trimmed)) {
      const lines = trimmed.split("\n");
      const lang = lines[0].replace(/^```/, "").trim();
      const code = lines.slice(1, -1).join("\n").replace(/```\s*$/, "");
      blocks.push({ type: "codeBlock", props: lang ? { language: lang } : undefined, content: code });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "divider" });
      continue;
    }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      blocks.push({ type: "heading", props: { level }, content: parseInlineMarkdown(headingMatch[2]) });
      continue;
    }

    // Blockquote
    if (/^>\s/.test(trimmed)) {
      const content = trimmed.replace(/^>\s?/gm, "");
      blocks.push({ type: "quote", content: parseInlineMarkdown(content) });
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      const lines = trimmed.split("\n");
      for (const line of lines) {
        const m = line.match(/^\d+\.\s+(.*)/);
        if (m) blocks.push({ type: "numberedListItem", content: parseInlineMarkdown(m[1]) });
      }
      continue;
    }

    // Bullet list
    if (/^[-*+]\s/.test(trimmed)) {
      const lines = trimmed.split("\n");
      for (const line of lines) {
        const m = line.match(/^[-*+]\s+(.*)/);
        if (m) blocks.push({ type: "bulletListItem", content: parseInlineMarkdown(m[1]) });
      }
      continue;
    }

    // Default: paragraph (may span multiple lines within the section)
    const text = trimmed.replace(/\n/g, " ");
    blocks.push({ type: "paragraph", content: parseInlineMarkdown(text) });
  }
  return blocks;
}
