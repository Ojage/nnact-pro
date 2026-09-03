#!/usr/bin/env tsx
/**
 * Backfill legacy markdown body text into the new structured body-document
 * format.  For each published content item that has a non-empty `body` column
 * but no `body_document`, this script:
 *
 *  1. Converts the markdown body into a BodyDocument via `markdownToBodyDocument`.
 *  2. Sanitizes + renders the document to HTML (via sanitize-html, same as the
 *     content-transform pipeline) and stores the result in `body_html`.
 *  3. Generates a plain-text markdown string via `bodyDocumentToMarkdown` and
 *     stores it in `body_markdown`.
 *  4. Persists the body_document + body_html + body_markdown columns.
 *
 * Idempotent: items that already have a body_document are skipped.  Safe to
 * re-run multiple times (though re-running will re-derive HTML/MD even if they
 * already exist — acceptable for a one-time migration).
 *
 * Usage:
 *   DATABASE_URL=postgres://ofp:ofp@localhost:5433/ofp \
 *     pnpm tsx scripts/backfill-body-document.ts [--dry-run]
 */
import { sql } from "drizzle-orm";
import { db, contentItems } from "@nnact/db";
import { markdownToBodyDocument, bodyDocumentToMarkdown, bodyDocumentToPlainText } from "@nnact/shared";
import sanitizeHtml from "sanitize-html";

const DRY_RUN = process.argv.includes("--dry-run");

function renderToHtml(document: ReturnType<typeof markdownToBodyDocument>): string {
  // Minimal inline HTML renderer (mirrors the API content-transform but avoids
  // the full ContentTransformService dependency / DB media resolution).
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (content: unknown): string => {
    if (content == null) return "";
    // For plain string content, escape HTML first, then convert markdown links.
    if (typeof content === "string") {
      const escaped = esc(content);
      return escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) =>
        `<a href="${href}">${label}</a>`,
      );
    }
    if (Array.isArray(content)) {
      return content
        .map((part: unknown) => {
          if (typeof part === "string") return esc(part);
          const s = (part as { styles?: Record<string, unknown> }).styles ?? {};
          let t = esc((part as { text?: string }).text ?? "");
          if (s.bold) t = `<strong>${t}</strong>`;
          if (s.italic) t = `<em>${t}</em>`;
          if (s.code) t = `<code>${t}</code>`;
          if (s.strike) t = `<del>${t}</del>`;
          return t;
        })
        .join("");
    }
    return "";
  };

  const parts: string[] = [];
  for (const block of document) {
    switch (block.type) {
      case "heading": {
        const lvl = Math.min(Math.max(Number((block.props as { level?: number })?.level) || 1, 1), 6);
        parts.push(`<h${lvl}>${inline(block.content)}</h${lvl}>`);
        break;
      }
      case "paragraph":
        parts.push(`<p>${inline(block.content)}</p>`);
        break;
      case "bulletListItem":
        parts.push(`<li class="bullet">${inline(block.content)}</li>`);
        break;
      case "numberedListItem":
        parts.push(`<li class="numbered">${inline(block.content)}</li>`);
        break;
      case "quote":
        parts.push(`<blockquote>${inline(block.content)}</blockquote>`);
        break;
      case "codeBlock": {
        const lang = (block.props as { language?: string })?.language;
        parts.push(`<pre${lang ? ` data-language="${esc(lang)}"` : ""}><code>${esc(typeof block.content === "string" ? block.content : "")}</code></pre>`);
        break;
      }
      case "divider":
        parts.push("<hr />");
        break;
      default:
        parts.push(`<p>${inline(block.content)}</p>`);
    }
  }
  return parts.join("\n");
}

async function main() {
  console.log(`Backfilling body_document from legacy markdown body${DRY_RUN ? " (DRY RUN)" : ""}…`);

  // Fetch all items with a non-empty body but no body_document.
  const rows = await db.execute(sql`
    SELECT id, title, body
    FROM ${contentItems}
    WHERE body IS NOT NULL AND body != ''
      AND body_document IS NULL
    ORDER BY created_at ASC
  `);

  const items = rows as unknown as Array<{ id: string; title: string; body: string }>;
  console.log(`Found ${items.length} items to backfill.`);

  let updated = 0;
  for (const item of items) {
    try {
      const document = markdownToBodyDocument(item.body);
      const html = sanitizeHtml(renderToHtml(document), {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img", "figure", "figcaption", "video", "iframe", "del", "cite",
          "table", "tbody", "tr", "td", "th", "pre", "code",
        ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          "*": ["class", "data-*"],
          img: ["src", "alt", "loading"],
          a: ["href", "class", "target", "rel"],
          pre: ["data-language"],
        },
        allowedSchemes: ["http", "https", "mailto"],
      });
      const markdown = bodyDocumentToMarkdown(document);

      console.log(`  [${item.id}] ${item.title}`);

      if (!DRY_RUN) {
        await db.execute(sql`
          UPDATE ${contentItems}
          SET body_document = ${JSON.stringify(document)}::jsonb,
              body_html = ${html},
              body_markdown = ${markdown},
              updated_at = NOW()
          WHERE id = ${item.id}
        `);
        updated++;
      } else {
        updated++;
      }
    } catch (err) {
      console.error(`  [${item.id}] FAILED: ${(err as Error).message}`);
    }
  }

  console.log(`Done. ${DRY_RUN ? "Would update" : "Updated"} ${updated} item(s).`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
