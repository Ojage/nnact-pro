// Planning — picks the topic seed (deterministically, using the org's recent
// field stories for variety), then expands it into a content brief with the
// top text provider. A robust local brief template exists so a provider outage
// still produces a scheduleable slot instead of a hard failure.
import type { ContentBriefDTO, AiSlot, AiProviderId } from "@nnact/shared";
import type { BusinessContext, MarketingKnowledge, MediaContext } from "./context.js";
import type { AiProviderRegistry } from "./registry.js";
import { buildBriefPrompt } from "./prompts.js";
import { hashValue } from "./domain.js";

const TOPIC_POOL: { topic: string; angle: string; contentType: ContentBriefDTO["contentType"] }[] = [
  { topic: "Why fridge breakdowns spike after power cuts", angle: "How appliance repair and maintenance prevents the pattern", contentType: "ARTICLE" },
  { topic: "The real cost of skipping AC gas and cleaning visits", angle: "Why AC gas refilling and maintenance beat full replacements", contentType: "MAINTENANCE_TIP" },
  { topic: "Home appliance troubleshooting: when to call a technician", angle: "Refrigerator, freezer, washer, dryer and microwave care", contentType: "ARTICLE" },
  { topic: "Keeping a cold room and display freezer reliable", angle: "Commercial refrigeration maintenance for shops and businesses", contentType: "ARTICLE" },
  { topic: "Generator servicing checklist before the next outage", angle: "Electrical and generator maintenance that keeps power on", contentType: "MAINTENANCE_TIP" },
  { topic: "Vehicle AC not cooling? A practical field check", angle: "Car AC gas refilling, leak detection and compressor care", contentType: "ARTICLE" },
  { topic: "Commercial HVAC: why office and factory systems need a service plan", angle: "HVAC maintenance contracts and preventative maintenance", contentType: "ARTICLE" },
  { topic: "Motor rewinding and repairs: extending equipment life", angle: "Electrical and mechanical repairs that avoid full machine replacement", contentType: "ARTICLE" },
];

export interface PlanResult {
  topic: string;
  angle: string;
  contentType: ContentBriefDTO["contentType"];
  categoryName: string;
  imageNeeded: boolean;
  imageStrategy: ContentImageStrategy;
  providerUsed: AiProviderId | "LOCAL";
  brief: ContentBriefDTO;
  briefPrompt: string;
}

export type ContentImageStrategy = "USE_EXISTING" | "ENHANCE_EXISTING" | "GENERATE_NEW";

export function pickTopicSeed(ctx: BusinessContext, slot: AiSlot, isoDate: string): { topic: string; angle: string; contentType: ContentBriefDTO["contentType"] } {
  const seeds = [...TOPIC_POOL];
  if (ctx.fieldStorySummaries.length) {
    seeds.push({ topic: ctx.fieldStorySummaries[0], angle: "Field observation with a practical lesson", contentType: "FIELD_STORY" });
  }
  const h = hashValue(`${ctx.companyName}:${isoDate}:${slot}`);
  return seeds[h % seeds.length];
}

export function categoryFor(contentType: ContentBriefDTO["contentType"]): string {
  return contentType === "MAINTENANCE_TIP" ? "Maintenance Tips" : contentType === "FIELD_STORY" ? "Field Stories" : "Reliability Insights";
}

export function localBrief(result: { topic: string; angle: string; contentType: ContentBriefDTO["contentType"]; imageNeeded: boolean }, ctx: BusinessContext): ContentBriefDTO {
  const bucket = ctx.serviceBuckets.length ? ctx.serviceBuckets[0].split("\n")[0] : (ctx.servicesAndCategories[0] ?? "Home appliance, HVAC and equipment maintenance");
  const areas = ctx.serviceAreas.length ? ctx.serviceAreas.join(", ") : "the service area";
  return {
    topic: result.topic,
    angle: result.angle,
    audience: `Homeowners and businesses across ${areas}`,
    serviceCategory: bucket,
    contentType: result.contentType,
    primaryMessage: `Reliable repairs and maintenance that prevent breakdowns`,
    cta: `Contact NNACT to schedule a service visit`,
    desiredLength: result.contentType === "MAINTENANCE_TIP" ? 320 : 420,
    imageDirection: result.imageNeeded ? "Technician performing safe preventive maintenance on residential and commercial equipment" : "none",
  };
}

export async function planSlot(input: {
  orgId: string;
  slot: AiSlot;
  isoDate: string;
  ctx: BusinessContext;
  media: MediaContext;
  knowledge: MarketingKnowledge;
  registry: AiProviderRegistry;
  textProviderOrder: AiProviderId[];
  imageGeneratorsAvailable: boolean;
}): Promise<PlanResult> {
  const seed = pickTopicSeed(input.ctx, input.slot, input.isoDate);
  const imageNeeded = seed.contentType !== "MAINTENANCE_TIP" || input.media.approved.length === 0;
  const prompt = buildBriefPrompt({ dx: input.ctx, knowledge: input.knowledge, media: input.media, slot: input.slot, isoDate: input.isoDate, topicIdea: seed.topic });

  let brief = localBrief({ topic: seed.topic, angle: seed.angle, contentType: seed.contentType, imageNeeded }, input.ctx);
  let providerUsed: AiProviderId | "LOCAL" = "LOCAL";

  try {
    const { result } = await input.registry.generateTextWithFallback(input.orgId, { prompt, structured: true, task: "brief", maxTokens: 800 }, input.textProviderOrder);
    const data = (result.structuredData ?? {}) as Record<string, unknown>;
    if (typeof data.topic === "string" && typeof data.angle === "string" && data.primaryMessage) {
      brief = {
        topic: String(data.topic),
        angle: String(data.angle),
        audience: String(data.audience ?? brief.audience),
        serviceCategory: String(data.serviceCategory ?? brief.serviceCategory),
        contentType: data.contentType === "MAINTENANCE_TIP" || data.contentType === "FIELD_STORY" ? data.contentType : "ARTICLE",
        primaryMessage: String(data.primaryMessage),
        cta: String(data.cta ?? brief.cta),
        desiredLength: Number(data.desiredLength) > 0 ? Number(data.desiredLength) : brief.desiredLength,
        imageDirection: String(data.imageDirection ?? brief.imageDirection),
      };
      providerUsed = result.provider;
    }
  } catch {
    providerUsed = "LOCAL";
  }

  const imageStrategy: ContentImageStrategy = !imageNeeded || !input.imageGeneratorsAvailable ? "USE_EXISTING" : "GENERATE_NEW";

  return {
    topic: brief.topic,
    angle: brief.angle,
    contentType: brief.contentType,
    categoryName: categoryFor(brief.contentType),
    imageNeeded,
    imageStrategy,
    providerUsed,
    brief,
    briefPrompt: prompt,
  };
}