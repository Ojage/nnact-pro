import assert from "node:assert/strict";
import test from "node:test";
import {
  bodyDocumentToHtml,
  bodyDocumentToMarkdown,
  bodyDocumentToPlainText,
  bodyDocumentToChannelPayload,
  validateBodyDocument,
  youtubeIdFromUrl,
} from "../src/content-document.ts";

test("plain text flattens headings, lists, and custom blocks", () => {
  const doc = [
    { type: "heading", props: { level: 2 }, content: "Welcome" },
    { type: "paragraph", content: [{ type: "text", text: "Hello " }, { type: "text", text: "world", styles: { bold: true } }] },
    { type: "bulletListItem", content: "One" },
    { type: "nnactMaintenanceTip", props: { title: "Change filters", body: "Do it monthly" } },
  ];
  const text = bodyDocumentToPlainText(doc);
  assert.match(text, /Welcome/);
  assert.match(text, /Hello world/);
  assert.match(text, /Change filters/);
  assert.match(text, /Do it monthly/);
});

test("html rendering escapes author input and resolves safe media only", () => {
  const doc = [
    { type: "paragraph", content: [{ type: "text", text: "<script>alert(1)</script>" }] },
    { type: "image", props: { url: "javascript:alert(1)", altText: "bad" } },
    { type: "image", props: { url: "https://cdn.example/a.jpg", altText: "ok" } },
    { type: "nnactSafetyNotice", props: { severity: "WARNING", title: "Watch out", body: "<b>danger</b>" } },
  ];
  const html = bodyDocumentToHtml(doc);
  assert.ok(!html.includes("<script>"), "script must be escaped");
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("javascript:alert"), "javascript url must be dropped");
  assert.ok(html.includes("https://cdn.example/a.jpg"));
  assert.ok(html.includes("data-severity=\"WARNING\""));
  // body text of safety notice is escaped (raw <b> not injected as a tag)
  assert.ok(html.includes("&lt;b&gt;danger&lt;/b&gt;"));
});

test("markdown rendering degrades custom blocks to readable text", () => {
  const doc = [
    { type: "heading", props: { level: 3 }, content: "Title" },
    { type: "nnactTestimonial", props: { quote: "Great work", customerDisplayName: "Ada" } },
  ];
  const md = bodyDocumentToMarkdown(doc);
  assert.match(md, /### Title/);
  assert.match(md, /Great work/);
  assert.match(md, /Ada/);
});

test("channel payload truncates to provider limits", () => {
  const doc = [
    { type: "paragraph", content: "This is a long body that should be truncated for social channels." },
    { type: "image", props: { url: "https://cdn.example/a.jpg" } },
  ];
  const payload = bodyDocumentToChannelPayload(doc, { maxTextLength: 20, supportsImages: true });
  assert.ok(payload.text.length <= 20);
  assert.ok(payload.text.endsWith("…"));
  assert.equal(payload.mediaCount, 1);
});

test("validate rejects unknown block types and accepts valid docs", () => {
  assert.throws(() => validateBodyDocument([{ type: "notARealBlock" }]), /unknown block type/);
  assert.throws(() => validateBodyDocument({}), /must be an array/);
  const ok = validateBodyDocument([
    { type: "paragraph", content: "fine" },
    { type: "nnactBeforeAfter", props: { before: { mediaId: "x" }, after: { mediaId: "y" } } },
  ]);
  assert.equal(ok.length, 2);
});

test("youtube id extraction", () => {
  assert.equal(youtubeIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(youtubeIdFromUrl("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
});
