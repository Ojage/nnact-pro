// AI prompts — versioned templates for brief, article, image, review, and
// quality steps. Prompts are plain strings (previewable/auditable); a DB-backed
// template store can override any of them per org. The structured output spec
// declares exactly what the model must return so the autopilot can parse it.
import type { AiSlot } from "@nnact/shared";
import type { BusinessContext, MarketingKnowledge, MediaContext } from "./context.js";

export const PROMPT_VERSION = "2026-09-01";

export const ARTICLE_JSON_SCHEMA_DOC = `Return ONE JSON object only, no markdown fences, with exactly these fields:
{
  "title": "headline (<= 70 chars)",
  "seoTitle": "<= 60 chars",
  "seoDescription": "<= 155 chars",
  "summary": "2 sentence plain-text summary",
  "slugHint": "lowercase-hyphenated, <= 80 chars",
  "blocks": [
    {"type": "heading", "text": "..."},
    {"type": "paragraph", "text": "..."},
    {"type": "maintenanceTip", "text": "concise practical tip"},
    {"type": "safetyNotice", "text": "only when a real safety point matters"},
    {"type": "serviceCta", "text": "short call to action"}
  ],
  "hashtags": ["#nnact", "#maintenance", "..."],
  "linkedinCaption": "<= 1400 chars, plain text, no markdown, ends inviting a visit"
}
Block types allowed: heading, paragraph, maintenanceTip, safetyNotice, serviceCta. Every "text" field must be plain text — no markdown, no emoji overload (max 1-2 emojis), no links.`;

function systemVoice(knowledge: MarketingKnowledge): string {
  return [
    `You are the NNACT content writer. Brand: ${knowledge.companyName}.`,
    `Voice: ${knowledge.brandVoice}`,
    `Audience: ${knowledge.audience}`,
    `Brand guarantees you MUST follow:`,
    ...knowledge.guarantees.map((g) => `- ${g}`),
    "",
  ].join("\n");
}

/** Structured brief: topic + angle for a slot. Kept deterministic-ish. */
export function buildBriefPrompt(input: {
  dx: BusinessContext;
  knowledge: MarketingKnowledge;
  media: MediaContext;
  slot: AiSlot;
  isoDate: string;
  topicIdea: string;
}): string {
  return `Write a CONTENT BRIEF as JSON (no markdown) for a ${input.slot.toLowerCase()} publish on ${input.isoDate}.
Company: ${input.dx.companyName}
Specialization: ${input.dx.specialization}
Available approved photos count: ${input.media.approved.length}${input.media.canGenerateImages ? "; image generation allowed" : "; NO image generation available — prefer practical text"}.

Chosen topic seed: "${input.topicIdea}"
Return exactly:
{"topic":"...","angle":"...","audience":"...","serviceCategory":"...","contentType":"ARTICLE"|"MAINTENANCE_TIP"|"FIELD_STORY","primaryMessage":"...","cta":"...","desiredLength":400,"imageDirection":"...","imageNeeded":true|false}`;
}

/** Full article write. Constructed so hard safety rules cannot be washed out. */
export function buildArticlePrompt(input: {
  brief: string;
  dx: BusinessContext;
  knowledge: MarketingKnowledge;
  recentTitles: string[];
}): string {
  const dedupeNote = input.recentTitles.length ? `REFUSE to rewrite any of these recent published titles (pick a genuinely different angle):\n${input.recentTitles.map((t) => `- ${t}`).join("\n")}` : "";
  return [
    systemVoice(input.knowledge),
    input.dx.companyName ? `Company profile: ${JSON.stringify({ companyName: input.dx.companyName, tagline: input.dx.tagline, services: input.dx.servicesAndCategories, specialization: input.dx.specialization, customers: input.dx.customerCount })}` : "",
    `Published context to reflect (not copy): ${input.dx.fieldStorySummaries.join(" | ") || "none"}`,
    dedupeNote,
    "",
    "CONTENT BRIEF (from your planner):",
    input.brief,
    "",
    "HARD RULES ABOVE ALL ELSE:",
    "- No electrical, refrigeration, gas, or lift repair instructions intended for a layperson.",
    "- If a task is unsafe for non-certified staff, say so and defer to certified technicians.",
    "- No invented facts, statistics, brands, testimonials, or case studies.",
    "- Plain, factual, calm marketing tone. No clickbait, no exaggerated claims.",
    "",
    ARTICLE_JSON_SCHEMA_DOC,
  ].filter(Boolean).join("\n");
}

export function buildLinkedInPrompt(input: { title: string; summary: string; canonicalUrl: string; hashtags: string[]; brand: string }): string {
  return `Write the LinkedIn post (<= 1400 chars, plain text, no markdown, no emoji flood — max 2 emojis) for this ${input.brand} article.
Title: ${input.title}
Summary: ${input.summary}
URL: ${input.canonicalUrl}
Hashtags to include naturally: ${input.hashtags.join(" ")}
Your job: entice plant managers/operators to read the article. End with the URL on its own line. Return only the post text.`;
}

export function buildImageBriefPrompt(input: { articleTitle: string; imageDirection: string; mediaHints: string }): string {
  return `Return a JSON object: {"imagePrompt":"...","negativePrompt":"..."}\n` +
    `Topic: ${input.articleTitle}\nDirection: ${input.imageDirection}\n` +
    `${input.mediaHints}\n` +
    "Prompt must depict a clean industrial maintenance scene: real equipment, technicians with PPE, no logos, no text overlays, photorealistic, safe and professional. Negative prompt: people in distress, blood, fire, damaged machinery, cluttered scene, text, watermark.";
}

export function buildImageReviewPrompt(input: { prompt: string; altText: string | null }): string {
  return `You are an image safety reviewer. Assess this AI-generated marketing image.
Prompt used: ${input.prompt}${input.altText ? `\nSuggested alt text: ${input.altText}` : ""}
Return JSON: {"verdict":"PASS"|"FAIL","score":0..100,"issues":["..."]}
FAIL the image if: unsafe scenes (fires, electrocution hazard visuals, people near moving machinery without guards), brand logos, readable text/watermarks, disturbing detail, or it clearly does not match the prompt. Allowed: technicians in PPE working safely, industrial equipment, clean workshop.`;
}

export function buildQualityPrompt(input: { title: string; body: string; briefSnip: string }): string {
  return `You are the NNACT content quality gate. Score this draft.
Brief: ${input.briefSnip}
Title: ${input.title}

Draft body:
${input.body.slice(0, 4000)}

Return JSON: {"relevance":0..100,"clarity":0..100,"brandVoice":0..100,"factualSafety":0..100,"technicalSafety":0..100,"duplicationRisk":0..100,"seoQuality":0..100,"overall":0..100,"blockingIssues":[""],"publishDecision":"PUBLISH"|"REGENERATE"|"BLOCK"}
Blocking issues must include any safety violation, invented claim, or direct duplicate of a known title. PUBLISH means above threshold, REGENERATE means needs a rewrite pass, BLOCK means never publish.`;
}