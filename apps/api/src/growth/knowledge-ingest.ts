// Website and document ingestion for Project Knowledge.

import { createHash } from "node:crypto";
import { growthStructuredText } from "./ai-text.js";
import {
  EXPECTED_WEBSITE_CATEGORIES,
  knowledgeFactKey,
  missingWebsiteCategories,
  provenanceForExtraction,
  statusForExtraction,
} from "./knowledge.js";
import type { GrowthKnowledgeCategory, GrowthKnowledgeProvenance, GrowthKnowledgeStatus } from "@nnact/shared";

const MAX_PAGE_BYTES = 512_000;
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "NNACT-Pro-GrowthBot/1.0 (+https://nnact.com)";

export interface ExtractedFactProposal {
  factKey: string;
  category: GrowthKnowledgeCategory;
  subject: string;
  supportingPassage?: string;
  sourceType: "WEBSITE" | "INTERNAL_DOCUMENT" | "AI_INFERENCE";
  sourceUrl?: string;
  sourceTitle?: string;
  confidence: number;
  provenance: GrowthKnowledgeProvenance;
  status: GrowthKnowledgeStatus;
}

export interface WebsiteIngestResult {
  pagesFetched: number;
  proposals: ExtractedFactProposal[];
  missingCategories: GrowthKnowledgeCategory[];
  error?: string;
}

function normalizeDomain(input: string): string {
  return input.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^www\./i, "").toLowerCase();
}

export function websitePathsForDomain(domain: string): string[] {
  const base = `https://${domain}`;
  return [base, `${base}/`, `${base}/about`, `${base}/services`, `${base}/contact`];
}

async function fetchPageText(url: string): Promise<{ url: string; title: string; text: string } | null> {
  try {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const raw = await response.text();
    if (Buffer.byteLength(raw) > MAX_PAGE_BYTES) return null;
    const titleMatch = raw.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch?.[1]?.trim() ?? url;
    const text = raw
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40_000);
    if (text.length < 80) return null;
    return { url, title, text };
  } catch {
    return null;
  }
}

const EXTRACT_SYSTEM = `You extract company facts for NNACT Pro Project Knowledge.
Return JSON: { "facts": [ { "category": "<one of COMPANY_IDENTITY, CONTACT_DETAILS, SERVICE_AREA, SERVICES, EQUIPMENT_TYPES, INDUSTRIES_SERVED, POSITIONING, CREDENTIALS, GUARANTEES, CASE_STUDIES, CUSTOMER_REFERENCES, PRICING, CALL_TO_ACTION, SALES_MATERIALS>", "subject": "<short quotable statement>", "supporting_passage": "<exact quote from source>", "direct_quote": true|false, "confidence": 0-100 } ] }
Rules:
- Only include facts directly supported by the provided page text.
- If a category has no support, omit it — do not invent prices, guarantees, or credentials.
- direct_quote true only when subject restates the passage faithfully.`;

export async function ingestWebsite(orgId: string, websiteInput: string): Promise<WebsiteIngestResult> {
  const domain = normalizeDomain(websiteInput);
  const paths = websitePathsForDomain(domain);
  const pages: { url: string; title: string; text: string }[] = [];
  for (const url of paths) {
    const page = await fetchPageText(url);
    if (page) pages.push(page);
    await new Promise((r) => setTimeout(r, 400));
  }

  if (!pages.length) {
    return {
      pagesFetched: 0,
      proposals: [],
      missingCategories: [...EXPECTED_WEBSITE_CATEGORIES],
      error: "website_unreachable_or_empty",
    };
  }

  const corpus = pages.map((p) => `URL: ${p.url}\nTITLE: ${p.title}\nTEXT:\n${p.text}`).join("\n\n---\n\n");
  const ai = await growthStructuredText(orgId, {
    system: EXTRACT_SYSTEM,
    prompt: `Extract facts for ${domain} from these public pages:\n\n${corpus}`,
    task: "growth_knowledge_website",
  });

  const proposals: ExtractedFactProposal[] = [];
  const categoriesSeen = new Set<string>();

  const facts = Array.isArray(ai.structured?.facts) ? ai.structured!.facts : [];
  for (const raw of facts) {
    if (!raw || typeof raw !== "object") continue;
    const rec = raw as Record<string, unknown>;
    const category = String(rec.category ?? "").toUpperCase();
    const subject = String(rec.subject ?? "").trim();
    if (!subject || !EXPECTED_WEBSITE_CATEGORIES.includes(category as GrowthKnowledgeCategory)) continue;
    const direct = Boolean(rec.direct_quote);
    const provenance = provenanceForExtraction(direct);
    const passage = String(rec.supporting_passage ?? "").trim() || undefined;
    if (provenance === "SOURCED" && !passage) continue;
    const confidence = Math.min(100, Math.max(0, Number(rec.confidence ?? 50)));
    categoriesSeen.add(category);
    proposals.push({
      factKey: knowledgeFactKey(category, subject),
      category: category as GrowthKnowledgeCategory,
      subject,
      supportingPassage: passage,
      sourceType: "WEBSITE",
      sourceUrl: pages[0]?.url,
      sourceTitle: pages[0]?.title,
      confidence,
      provenance,
      status: statusForExtraction(provenance),
    });
  }

  return {
    pagesFetched: pages.length,
    proposals,
    missingCategories: missingWebsiteCategories(categoriesSeen),
  };
}

export function ingestDocumentText(
  orgId: string,
  doc: { id: string; title: string; text: string },
): ExtractedFactProposal[] {
  void orgId;
  const proposals: ExtractedFactProposal[] = [];
  const lines = doc.text.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 20);
  for (const line of lines.slice(0, 40)) {
    const category: GrowthKnowledgeCategory = line.toLowerCase().includes("service")
      ? "SERVICES"
      : "COMPANY_IDENTITY";
    proposals.push({
      factKey: knowledgeFactKey(category, line.slice(0, 200)),
      category,
      subject: line.slice(0, 200),
      supportingPassage: line,
      sourceType: "INTERNAL_DOCUMENT",
      sourceUrl: `file:${doc.id}`,
      sourceTitle: doc.title,
      confidence: 70,
      provenance: "SOURCED",
      status: "PENDING",
    });
  }
  return proposals;
}

export function contradictionGroupKey(category: string, subjectA: string, subjectB: string): string {
  const hash = createHash("sha256")
    .update(`${category}::${subjectA}::${subjectB}`)
    .digest("hex")
    .slice(0, 16);
  return `contradiction-${category.toLowerCase()}-${hash}`;
}
