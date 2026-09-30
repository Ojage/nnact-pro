// Image orchestration — picks an existing approved asset, generates a new one,
// reviews it, and overlays the brand logo. Generated images persist through the
// same content_media pipeline as uploads (disk under NNPUPLOAD_DIR + a row in
// content_media marked approved-for-marketing) so the rest of the system
// treats them like any other asset. Generation failures degrade to "use
// existing approved media" instead of failing the whole slot.
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db, contentMedia } from "@nnact/db";
import type { ContentBriefDTO, AiProviderId } from "@nnact/shared";
import type { MediaContext, AiCandidateMedia } from "./context.js";
import { buildImageBriefPrompt, buildImageReviewPrompt } from "./prompts.js";
import { bumpMediaUsage } from "./context.js";
import type { AiProviderRegistry } from "./registry.js";
import type { LogoCompositorPort } from "./ports.js";

const ALLOWED_GENERATED_MIME = /^image\/(png|jpeg|webp)$/;

/**
 * Words that carry no subject signal. Without this, a tag called "a" or "the"
 * would match nearly every brief, and the tag tier would stop being a signal
 * at all.
 */
const KEYWORD_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from", "has", "have", "how", "in", "into",
  "is", "it", "its", "of", "on", "or", "our", "that", "the", "their", "them", "then", "there", "these", "they",
  "this", "to", "was", "what", "when", "which", "why", "will", "with", "you", "your", "before", "after", "when",
  "keep", "keeps", "keeping", "real", "true", "without", "not", "no", "we", "us", "can", "do", "does", "more",
  "most", "than", "then", "use", "used", "using", "make", "makes", "made", "get", "gets", "got", "one", "two",
]);

/**
 * Words from the brief that a subject tag could plausibly match on.
 *
 * Both sides are reduced to bare tokens: the brief's "fridge" has to line up
 * with an operator's "fridge" tag even though the brief says "refrigerator"
 * elsewhere and the tag was typed as "Fridge ".
 */
export function briefKeywords(brief: Pick<ContentBriefDTO, "topic" | "angle" | "serviceCategory">): Set<string> {
  const words = `${brief.topic} ${brief.angle} ${brief.serviceCategory}`.toLowerCase().split(/[^a-z0-9]+/);
  const out = new Set<string>();
  for (const word of words) {
    if (word.length < 3) continue;
    if (KEYWORD_STOPWORDS.has(word)) continue;
    out.add(word);
  }
  return out;
}

/** How many of an asset's tags appear in the brief's keyword set. */
export function tagOverlap(tags: string[], keywords: Set<string>): number {
  let hits = 0;
  for (const tag of tags) {
    if (keywords.has(tag.toLowerCase().trim())) hits += 1;
  }
  return hits;
}

/**
 * Rank an asset for a given brief, higher being better. Tiers are deliberate
 * and coarse, because the alternative — scoring everything together — lets one
 * lucky tag outrank an explicit "this is a maintenance tip image" label, which
 * is exactly the signal the operator went to the trouble of setting.
 *
 *   3  labelled for this exact post kind
 *   2  subject tags that overlap the brief
 *   1  unlabelled, i.e. "usable for anything"
 *
 * Assets that are neither labelled nor tagged land in tier 1 alongside explicit
 * ANY, which is correct: a pre-labelling upload is a general asset.
 */
export function scoreCandidate(candidate: AiCandidateMedia, brief: Pick<ContentBriefDTO, "topic" | "angle" | "serviceCategory" | "contentType">): number {
  if (candidate.useFor && candidate.useFor === brief.contentType) return 3;
  if (tagOverlap(candidate.tags, briefKeywords(brief)) > 0) return 2;
  return 1;
}

/**
 * Choose the existing asset to illustrate this brief.
 *
 * Within a tier, least-used wins so rotation keeps spreading across the library
 * rather than hammering one popular photo. The id tie-break keeps it
 * deterministic: two assets with equal usage must not swap places run to run,
 * or the same post can pick differently on a retry.
 */
export function pickCandidateFor(brief: Pick<ContentBriefDTO, "topic" | "angle" | "serviceCategory" | "contentType">, media: MediaContext): AiCandidateMedia | null {
  const photos = media.approved.filter((m) => m.kind === "photo");
  if (photos.length === 0) return null;
  const keywords = briefKeywords(brief);
  let best: AiCandidateMedia | null = null;
  let bestScore = 0;
  for (const candidate of photos) {
    const score = Math.max(scoreCandidate(candidate, brief), tagOverlap(candidate.tags, keywords) > 0 ? 2 : 0);
    if (best === null || score > bestScore || (score === bestScore && isBetterRotation(candidate, best!))) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

/** Least usage first, then a stable id tie-break. */
function isBetterRotation(candidate: AiCandidateMedia, incumbent: AiCandidateMedia): boolean {
  if (candidate.usageCount !== incumbent.usageCount) return candidate.usageCount < incumbent.usageCount;
  return candidate.id < incumbent.id;
}

/**
 * Unlabelled, label-blind fallback. Kept for callers that have no brief to
 * match against; the pipeline itself uses pickCandidateFor.
 */
export function pickLeastUsedCandidate(media: MediaContext): AiCandidateMedia | null {
  const photos = media.approved.filter((m) => m.kind === "photo");
  if (photos.length === 0) return null;
  return [...photos].sort((a, b) => a.usageCount - b.usageCount || a.id.localeCompare(b.id))[0];
}

async function persistGeneratedImage(
  orgId: string,
  input: { contentType: string; dataBase64: string; brief: ContentBriefDTO; prompt: string },
): Promise<string> {
  const mediaId = randomUUID();
  const directory = join(process.env.NNPUPLOAD_DIR ?? "./.ofp-uploads", "content", orgId);
  const destination = join(directory, mediaId);
  await mkdir(directory, { recursive: true, mode: 0o750 });
  const buffer = Buffer.from(input.dataBase64, "base64");
  try {
    await writeFile(destination, buffer, { mode: 0o640 });
  } catch {
    await rm(destination, { force: true }).catch(() => {});
    throw new Error("failed to persist generated image");
  }
  const storageKey = `content/${orgId}/${mediaId}`;
  // A generated image is labelled for the post it was made for, and tagged with
  // the brief's own subject words. That means the gallery can explain what an
  // asset is for, and a later run can deliberately reuse it as a labelled
  // candidate instead of regenerating the same subject again.
  const tags = [...briefKeywords(input.brief)].slice(0, 12);
  try {
    await db.insert(contentMedia).values({
      id: mediaId,
      orgId,
      storageKey,
      contentType: input.contentType,
      fileName: `ai-${mediaId.slice(0, 8)}.png`,
      source: "ai_generated",
      approvedForMarketing: true,
      useFor: input.brief.contentType,
      tags,
      // The generation prompt used to be discarded here, so an operator looking
      // at a surprising image in the gallery had no way to see what caused it.
      aiPrompt: input.prompt,
      altText: input.brief.imageDirection && input.brief.imageDirection !== "none" ? input.brief.imageDirection : input.brief.topic,
    });
  } catch (error) {
    await rm(destination, { force: true }).catch(() => {});
    throw error;
  }
  return mediaId;
}

export interface ResolvedFeaturedImage {
  mediaId: string | null;
  sourceType: "existing" | "generated" | "none";
}

export async function resolveFeaturedImage(input: {
  orgId: string;
  brief: ContentBriefDTO;
  media: MediaContext;
  registry: AiProviderRegistry;
  imageProvider: AiProviderId | null;
  reviewProvider: AiProviderId | null;
  compositor: LogoCompositorPort | null;
}): Promise<ResolvedFeaturedImage> {
  // Chosen up front, before the generator is even resolved, because it is the
  // destination both failure paths need. When no image model is reachable —
  // no key, wrong model, provider down — this labelled asset is what the post
  // ships with, which is the whole point of labelling it in the gallery.
  const existing = pickCandidateFor(input.brief, input.media);

  // No generators available: reuse the best existing asset (or none).
  const generator = await input.registry.imageFactory(input.orgId, input.imageProvider);
  if (!generator) {
    if (existing) {
      await bumpMediaUsage(input.orgId, [existing.id], new Date());
      return { mediaId: existing.id, sourceType: "existing" };
    }
    return { mediaId: null, sourceType: "none" };
  }

  try {
    const generated = await generateAndStoreImage(input.orgId, {
      orgId: input.orgId,
      brief: input.brief,
      registry: input.registry,
      imageProvider: generator.provider,
      reviewProvider: input.reviewProvider,
      compositor: input.compositor,
      logoUrl: input.media.logoUrl,
    });
    if (generated) return { mediaId: generated.mediaId, sourceType: "generated" };
  } catch {
    /* fall through to existing */
  }

  if (existing) {
    await bumpMediaUsage(input.orgId, [existing.id], new Date());
    return { mediaId: existing.id, sourceType: "existing" };
  }
  return { mediaId: null, sourceType: "none" };
}

export async function generateAndStoreImage(
  orgId: string,
  input: {
    orgId: string;
    brief: ContentBriefDTO;
    registry: AiProviderRegistry;
    imageProvider: AiProviderId;
    reviewProvider: AiProviderId | null;
    compositor: LogoCompositorPort | null;
    logoUrl: string | null;
  },
): Promise<{ mediaId: string; contentType: string } | null> {
  const promptInput = buildImageBriefPrompt({ articleTitle: input.brief.topic, imageDirection: input.brief.imageDirection, mediaHints: input.brief.imageDirection === "none" ? "No specific image reference." : "" });
  const plan = await input.registry.generateImageText(input.orgId, input.imageProvider, { prompt: promptInput, structured: true, task: "imageBrief", maxTokens: 300 });
  if (!plan) throw new Error("image brief generation failed");
  const data = plan.result.structuredData ?? {};
  const imagePrompt = String(data.imagePrompt ?? input.brief.imageDirection ?? input.brief.topic);

  const generated = await input.registry.generateImage(input.orgId, input.imageProvider, {
    prompt: imagePrompt,
    negativePrompt: String(data.negativePrompt ?? "text, watermark, logo, unsafe scenes"),
    size: "1024x1024",
    task: "image",
  });
  if (!generated) throw new Error("image generation failed");
  const contentType = generated.contentType ?? "image/png";
  if (!ALLOWED_GENERATED_MIME.test(contentType)) throw new Error(`generated image type not allowed: ${contentType}`);
  const dataBase64 = Buffer.from(generated.buffer).toString("base64");

  // Brand compositor overlay (logo corner) when available.
  let composited = { contentType, dataBase64 };
  if (input.compositor) {
    try {
      composited = await input.compositor.compose({ image: { contentType, dataBase64 }, logoUrl: input.logoUrl, orgId });
    } catch {
      /* passthrough */
    }
  }

  // Vision review before persisting.
  const review = await input.registry.analyzeImage(orgId, input.reviewProvider, {
    prompt: buildImageReviewPrompt({ prompt: imagePrompt, altText: null }),
    images: [{ mediaType: composited.contentType, dataBase64: composited.dataBase64 }],
    task: "imageReview",
  });
  if (review) {
    const score = typeof review.score === "number" ? review.score : 0;
    const fail = review.verdict === "FAIL" && score < 60;
    if (fail) throw new Error(`generated image rejected by review: ${review.issues.join(", ")}`);
  }

  const mediaId = await persistGeneratedImage(orgId, { ...composited, brief: input.brief, prompt: imagePrompt });
  return { mediaId, contentType: composited.contentType };
}