// Server-side content transformation — the only place the API derives generated
// representations (HTML / Markdown / plain text) from the canonical body document.
//
// This keeps the publishing pipeline browser-free: an editor saves a structured
// document, and both the admin preview and every provider adapter consume the
// plain strings produced here. Custom NNACT blocks are rendered by the shared
// transformer; adding a block never requires touching provider adapters.
import sanitizeHtml from "sanitize-html";
import { and, eq, inArray } from "drizzle-orm";
import { db, contentMedia } from "@nnact/db";
import type { BodyDocument, BodyDocumentMediaMap, ContentMediaDTO } from "@nnact/shared";
import {
  bodyDocumentToHtml,
  bodyDocumentToMarkdown,
  bodyDocumentToPlainText,
  validateBodyDocument,
} from "@nnact/shared";

export const MAX_BODY_DOCUMENT_BYTES = 5 * 1024 * 1024;

export interface DerivedContent {
  body: string; // plain text (used by text channels + list/search fallback)
  bodyDocument: BodyDocument | null;
  bodyHtml: string | null;
  bodyMarkdown: string | null;
  /** mediaId -> resolved public asset map (approved only). */
  bodyMedia: BodyDocumentMediaMap;
}

/** Collect every mediaId referenced by the canonical document's custom blocks. */
export function mediaIdsFromDocument(document: BodyDocument | null): string[] {
  if (!document) return [];
  const ids = new Set<string>();
  const walk = (blocks: BodyDocument) => {
    for (const block of blocks ?? []) {
      const props = (block.props ?? {}) as Record<string, unknown>;
      if (props.url && typeof props.url === "string" && /^[0-9a-f-]{36}$/i.test(props.url)) {
        ids.add(props.url);
      }
      const refs: unknown[] = [];
      if (props.images && Array.isArray(props.images)) refs.push(...(props.images as unknown[]));
      if (props.media) refs.push(props.media);
      if (props.before) refs.push(props.before);
      if (props.after) refs.push(props.after);
      for (const ref of refs) {
        const r = ref as { mediaId?: unknown };
        if (r && typeof r === "object" && typeof r.mediaId === "string" && /^[0-9a-f-]{36}$/i.test(r.mediaId)) {
          ids.add(r.mediaId);
        }
      }
      if (Array.isArray(block.children)) walk(block.children as BodyDocument);
    }
  };
  walk(document);
  return [...ids];
}

export class ContentTransformService {
  /** Public URL base for media resolution on the marketing site. */
  constructor(private readonly publicApiBaseUrl: string) {}

  /**
   * Derive all generated representations from an incoming body document.
   * Throws (400-class) if the document is malformed/oversized, so arbitrary
   * client JSON is never persisted. Media URLs are only emitted for media that
   * is approved for marketing — unapproved operational photos never leak into
   * rendered article HTML.
   */
  async derive(documentInput: unknown): Promise<DerivedContent> {
    let document: BodyDocument = [];
    try {
      document = validateBodyDocument(documentInput ?? []);
    } catch (err) {
      const e = Object.assign(new Error((err as Error).message), {
        statusCode: 400,
        code: "INVALID_BODY_DOCUMENT",
      });
      throw e;
    }
    if (document.length === 0) {
      return {
        body: "",
        bodyDocument: document,
        bodyHtml: null,
        bodyMarkdown: null,
        bodyMedia: {},
      };
    }

    // Resolve only approved-for-marketing media referenced by the document.
    const mediaIds = mediaIdsFromDocument(document);
    const approvedRows: typeof contentMedia.$inferSelect[] = [];
    let approved = new Set<string>();
    if (mediaIds.length > 0) {
      const rows = await db
        .select()
        .from(contentMedia)
        .where(and(eq(contentMedia.approvedForMarketing, true), inArray(contentMedia.id, mediaIds)));
      approvedRows.push(...rows);
      approved = new Set(rows.map((r) => r.id));
    }
    const base = this.publicApiBaseUrl.replace(/\/$/, "");
    const resolveMedia = (mediaId: string): string | null =>
      approved.has(mediaId) ? `${base}/api/v1/public/media/${mediaId}` : null;

    const bodyMedia: BodyDocumentMediaMap = {};
    for (const row of approvedRows) {
      const m = row as unknown as ContentMediaDTO;
      bodyMedia[row.id] = {
        url: `${base}/api/v1/public/media/${row.id}`,
        alt: m.altText ?? null,
        caption: m.caption ?? null,
        contentType: row.contentType,
      };
    }

    const rawHtml = bodyDocumentToHtml(document, { resolveMedia, siteUrl: base });
    const sanitized = sanitizeHtml(rawHtml, {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat([
        "img",
        "figure",
        "figcaption",
        "video",
        "iframe",
        "del",
        "cite",
        "table",
        "tbody",
        "tr",
        "td",
      ]),
      allowedAttributes: {
        ...sanitizeHtml.defaults.allowedAttributes,
        "*": ["class", "data-*", "id"],
        img: ["src", "alt", "loading", "class"],
        video: ["src", "controls", "preload", "class"],
        iframe: ["src", "title", "loading", "allow", "allowfullscreen", "width", "height"],
        a: ["href", "class", "target", "rel"],
        input: ["type", "disabled", "checked"],
        pre: ["data-language"],
      },
      allowedSchemes: ["http", "https", "mailto"],
      allowedSchemesByTag: { img: ["http", "https"], iframe: ["http", "https"] },
      allowProtocolRelative: false,
    });

    return {
      body: bodyDocumentToPlainText(document),
      bodyDocument: document,
      bodyHtml: sanitized.length ? sanitized : null,
      bodyMarkdown: bodyDocumentToMarkdown(document),
      bodyMedia,
    };
  }
}
