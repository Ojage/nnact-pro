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

export function pickLeastUsedCandidate(media: MediaContext): AiCandidateMedia | null {
  const photos = media.approved.filter((m) => m.kind === "photo");
  if (photos.length === 0) return null;
  return [...photos].sort((a, b) => a.usageCount - b.usageCount || a.contentType.localeCompare(b.contentType))[0];
}

async function persistGeneratedImage(orgId: string, input: { contentType: string; dataBase64: string }): Promise<string> {
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
  try {
    await db.insert(contentMedia).values({
      id: mediaId,
      orgId,
      storageKey,
      contentType: input.contentType,
      fileName: `ai-${mediaId.slice(0, 8)}.png`,
      source: "ai_generated",
      approvedForMarketing: true,
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
  const existing = pickLeastUsedCandidate(input.media);

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

  const mediaId = await persistGeneratedImage(orgId, composited);
  return { mediaId, contentType: composited.contentType };
}