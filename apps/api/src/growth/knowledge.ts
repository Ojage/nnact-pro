// Project Knowledge gates — facts are quotable in outreach only when approved
// and sourced. Refresh logic never overwrites human-owned wording.

import {
  GROWTH_CAMPAIGN_SAFE_CATEGORIES,
  GROWTH_KNOWLEDGE_CATEGORY,
  type GrowthKnowledgeCategory,
  type GrowthKnowledgeProvenance,
  type GrowthKnowledgeStatus,
} from "@nnact/shared";

export type KnowledgeFactLike = {
  category: string;
  subject: string;
  status: string;
  provenance: string;
  manuallyCorrected?: boolean;
};

/** Stable key for deduplication across ingest passes. */
export function knowledgeFactKey(category: string, subject: string): string {
  const normalized = subject.trim().toLowerCase().replace(/\s+/g, " ");
  return `${category.toUpperCase()}::${normalized}`;
}

export function isApprovedKnowledgeCategory(category: string): category is GrowthKnowledgeCategory {
  return (GROWTH_KNOWLEDGE_CATEGORY as readonly string[]).includes(category);
}

/** Campaign copy may quote only approved facts in safe categories. */
export function isQuotableFact(fact: KnowledgeFactLike): boolean {
  if (fact.status !== "APPROVED") return false;
  if (!isApprovedKnowledgeCategory(fact.category)) return false;
  if (!(GROWTH_CAMPAIGN_SAFE_CATEGORIES as readonly string[]).includes(fact.category)) return false;
  if (fact.provenance === "INFERRED" && !fact.manuallyCorrected) return false;
  return true;
}

export function filterQuotableFacts<T extends KnowledgeFactLike>(facts: T[]): T[] {
  return facts.filter(isQuotableFact);
}

/** AI may propose INFERRED facts; they stay PENDING until a human approves. */
export function provenanceForExtraction(directQuote: boolean): GrowthKnowledgeProvenance {
  return directQuote ? "SOURCED" : "INFERRED";
}

export function statusForExtraction(provenance: GrowthKnowledgeProvenance): GrowthKnowledgeStatus {
  return provenance === "MANUAL" ? "APPROVED" : "PENDING";
}

/** When refresh sees a manually corrected fact, ingest must skip overwriting it. */
export function shouldSkipRefresh(existing: { manuallyCorrected: boolean; status: string }): boolean {
  return existing.manuallyCorrected || existing.status === "APPROVED";
}

/** Categories we expect from a public company website profile. */
export const EXPECTED_WEBSITE_CATEGORIES: readonly GrowthKnowledgeCategory[] = [
  "COMPANY_IDENTITY",
  "CONTACT_DETAILS",
  "SERVICE_AREA",
  "SERVICES",
  "EQUIPMENT_TYPES",
  "INDUSTRIES_SERVED",
  "POSITIONING",
  "CALL_TO_ACTION",
];

export function missingWebsiteCategories(present: Set<string>): GrowthKnowledgeCategory[] {
  return EXPECTED_WEBSITE_CATEGORIES.filter((c) => !present.has(c));
}
