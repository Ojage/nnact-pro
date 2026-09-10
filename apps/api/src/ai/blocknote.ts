// BlockNote document builder — converts the model's structured JSON output into
// the canonical BodyDocument tree using the shared NNACT custom block types.
// The ContentTransformService (publishing/application/content-transform.ts)
// then derives HTML/markdown/plain text from this tree, so the AI path stores
// the same document shape a human editor would.
import type { BodyDocument } from "@nnact/shared";

export interface ArticleBlock {
  type: "heading" | "paragraph" | "maintenanceTip" | "safetyNotice" | "serviceCta";
  text: string;
}

export function blocksToBodyDocument(blocks: ArticleBlock[], featuredMediaId?: string | null): BodyDocument {
  const document: BodyDocument = [];
  if (featuredMediaId) {
    document.push({
      type: "nnactUploadedImage",
      props: { url: featuredMediaId, altText: null, caption: null },
    });
  }
  for (const block of blocks) {
    const text = (block.text ?? "").trim();
    if (!text) continue;
    switch (block.type) {
      case "heading":
        document.push({ type: "heading", props: { level: 2, textAlignment: "left" }, content: text });
        break;
      case "paragraph":
        document.push({ type: "paragraph", content: text });
        break;
      case "maintenanceTip":
        document.push({ type: "nnactMaintenanceTip", props: { title: "Maintenance Tip", body: text, variant: "default" } });
        break;
      case "safetyNotice":
        document.push({ type: "nnactSafetyNotice", props: { severity: "CAUTION", title: null, body: text } });
        break;
      case "serviceCta":
        document.push({ type: "nnactServiceCta", props: { title: "Talk to NNACT", description: text, ctaLabel: "Contact NNACT", ctaUrl: null, serviceType: null } });
        break;
    }
  }
  return document;
}