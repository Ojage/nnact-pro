// AI context assembly — the sanitized business picture, curated brand facts,
// and approved-media inventory that every generation run sees. All data sent to
// external providers is passed through sanitizeForAi (no emails, phones, or
// confidential identifiers), and operational photos never appear because media
// context only lists approved_for_marketing rows.
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db, contentMedia, contentItems, customers, jobs, orgs } from "@nnact/db";

const MAX_CONTEXT_CHARS = 8_000;
const MAX_MEDIA_LIST = 24;
const MAX_JOB_FIELD_STORIES = 3;

export function sanitizeForAi(value: string): string {
  return value
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email removed]")
    .replace(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{3,4}(?:\s*(?:x|ext)[.\s]*\d{1,5})?/g, "[phone removed]")
    .replace(/\b\d{10,20}\b/g, "[number removed]");
}

function asString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export interface BusinessContext {
  companyName: string;
  tagline: string | null;
  contactSummary: string;
  servicesAndCategories: string[];
  specialization: string;
  fieldStorySummaries: string[];
  customerCount: number;
}

export async function buildBusinessContext(orgId: string): Promise<BusinessContext> {
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId)).limit(1);
  const companyName = org?.name ?? "NNACT";
  const businessSettings = (org?.businessSettings ?? {}) as Record<string, unknown>;
  const services = Array.isArray(businessSettings.services)
    ? businessSettings.services.map((s) => (typeof s === "string" ? s : asString((s as Record<string, unknown>)?.name ?? (s as Record<string, unknown>)?.label ?? s))).filter(Boolean).slice(0, 12)
    : [];

  const [customerCountRow] = await db.select({ value: count() }).from(customers).where(eq(customers.orgId, orgId)).catch(() => [{ value: 0 }]);
  const customerCount = Number(customerCountRow?.value ?? 0);

  const jobRows = await db
    .select({ title: jobs.title })
    .from(jobs)
    .where(eq(jobs.orgId, orgId))
    .orderBy(desc(jobs.createdAt))
    .limit(6)
    .catch(() => []);
  const fieldStorySummaries = jobRows
    .map((job) => sanitizeForAi(job.title))
    .filter((title) => title.trim().length > 0)
    .slice(0, MAX_JOB_FIELD_STORIES);

  const contactSummary = [org?.publicAddress, org?.publicPhone, org?.publicEmail].filter((v): v is string => Boolean(v)).map(sanitizeForAi).join(" · ");

  const tagline = typeof businessSettings.tagline === "string" ? businessSettings.tagline : null;

  return truncateContext({
    companyName,
    tagline,
    contactSummary,
    servicesAndCategories: services.map(sanitizeForAi),
    specialization: asString(businessSettings.specialization ?? capacityText(businessSettings)),
    fieldStorySummaries,
    customerCount,
  });
}

function capacityText(settings: Record<string, unknown>): string {
  const equipment = asString(settings.industry ?? settings.focus ?? "");
  return equipment ? equipment : "Industrial equipment maintenance, repair and reliability services";
}

function truncateContext(context: BusinessContext): BusinessContext {
  const text = JSON.stringify(context);
  return text.length <= MAX_CONTEXT_CHARS ? context : { ...context, fieldStorySummaries: [] };
}

// ── Marketing knowledge (curated, trustworthy, evergreen) ─────────────────
export interface MarketingKnowledge {
  companyName: string;
  brandVoice: string;
  guarantees: string[];
  evergreenFacts: string[];
  audience: string;
}

export function buildMarketingKnowledge(context: BusinessContext): MarketingKnowledge {
  return {
    companyName: context.companyName,
    brandVoice:
      "Reliable, field-honest, safety-first. Short paragraphs, concrete examples, no hype and no fake urgency. " +
      "Explain real maintenance and reliability truths employers and operators in the Douala industrial belt actually care about.",
    guarantees: [
      "NEVER give DIY electrical, refrigeration, gas, or lift instructions that could be unsafe.",
      "Never recommend bypassing safety devices or tampering with certified equipment.",
      "Whenever a task is genuinely unsafe for a layperson, say so and refer to certified NNACT technicians.",
      "Never invent facts, statistics, brands, or customer case studies.",
    ],
    evergreenFacts: [
      "Predictive and preventive maintenance extends equipment life and reduces unplanned downtime.",
      "Vibration analysis, oil analysis and thermographic surveys are industry-standard condition-monitoring methods.",
      "Contractor documentation and compliance records matter for insurance and guarantees.",
      "Branded, certified spare parts usually outlast non-certified alternates for heavy equipment.",
    ],
    audience: "Plant managers, maintenance superintendents, equipment owners and operators across Douala and the Cameroon industrial region.",
  };
}

// ── Media context (approved marketing assets only) ────────────────────────
export interface AiCandidateMedia {
  id: string;
  url: string;
  kind: "photo" | "gallery" | "logo";
  contentType: string;
  altText: string | null;
  usageCount: number;
  lastUsed: string | null;
}

export interface MediaContext {
  approved: AiCandidateMedia[];
  logoUrl: string | null;
  canGenerateImages: boolean;
}

export async function buildMediaContext(orgId: string, publicApiBaseUrl: string, imageGeneratorsAvailable: boolean): Promise<MediaContext> {
  const base = (publicApiBaseUrl ?? "").replace(/\/$/, "");
  const [org] = await db.select({ logoUrl: orgs.logoUrl }).from(orgs).where(eq(orgs.id, orgId)).limit(1);
  const rows = await db
    .select()
    .from(contentMedia)
    .where(and(eq(contentMedia.orgId, orgId), eq(contentMedia.approvedForMarketing, true)))
    .orderBy(desc(contentMedia.aiUsageCount), desc(contentMedia.createdAt))
    .limit(MAX_MEDIA_LIST);
  const approved: AiCandidateMedia[] = rows.map((row) => ({
    id: row.id,
    url: `${base}/api/v1/public/media/${row.id}`,
    kind: row.contentType.startsWith("video/") ? "gallery" : "photo",
    contentType: row.contentType,
    altText: row.altText,
    usageCount: row.aiUsageCount ?? 0,
    lastUsed: row.aiLastUsedAt ? row.aiLastUsedAt.toISOString() : null,
  }));
  return { approved, logoUrl: (org?.logoUrl ?? null)?.replace(/^https?:\/\//, "") ?? null, canGenerateImages: imageGeneratorsAvailable };
}

/** Mark a media asset as used by the AI pipeline. */
export async function bumpMediaUsage(orgId: string, mediaIds: string[], usedAt: Date): Promise<void> {
  if (mediaIds.length === 0) return;
  await db
    .update(contentMedia)
    .set({ aiUsageCount: sql`${contentMedia.aiUsageCount} + 1`, aiLastUsedAt: usedAt, updatedAt: usedAt })
    .where(and(eq(contentMedia.orgId, orgId), eq(contentMedia.id, mediaIds[0])));
}

export async function listRecentContentForDedupe(orgId: string, sinceWeeks = 6): Promise<{ id: string; title: string; body: string }[]> {
  const since = new Date(Date.now() - sinceWeeks * 7 * 86_400_000);
  return await db
    .select({ id: contentItems.id, title: contentItems.title, body: contentItems.body })
    .from(contentItems)
    .where(and(eq(contentItems.orgId, orgId), gte(contentItems.updatedAt, since)))
    .orderBy(desc(contentItems.updatedAt))
    .limit(200);
}