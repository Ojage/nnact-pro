// Prospect discovery — lawful sources only; never invent contact emails.

import type { GrowthProspectSource } from "@nnact/shared";

export interface DiscoveryFitInput {
  sectorSlug?: string;
  city?: string;
  country?: string;
  industry?: string;
  equipmentNeeds?: string;
  companyName: string;
}

export interface DiscoveryFitResult {
  score: number;
  summary: string;
  evidence: { type: string; detail: string }[];
}

const SECTOR_KEYWORDS: Record<string, string[]> = {
  hotels: ["hotel", "hospitality", "lodging", "guest"],
  restaurants: ["restaurant", "kitchen", "food", "catering"],
  schools: ["school", "university", "college", "education"],
  banks: ["bank", "finance", "credit"],
  healthcare: ["hospital", "clinic", "health", "medical"],
  "cold-chain": ["cold", "refriger", "warehouse", "storage"],
  industrial: ["factory", "plant", "industrial", "manufacturing"],
};

export function scoreProspectFit(input: DiscoveryFitInput): DiscoveryFitResult {
  const evidence: { type: string; detail: string }[] = [];
  let score = 40;
  const haystack = `${input.companyName} ${input.industry ?? ""} ${input.equipmentNeeds ?? ""}`.toLowerCase();

  if (input.city?.toLowerCase().includes("douala") || input.city?.toLowerCase().includes("buea")) {
    score += 15;
    evidence.push({ type: "geography", detail: `Located in ${input.city} — within NNACT service geography.` });
  }

  if (input.sectorSlug) {
    const keys = SECTOR_KEYWORDS[input.sectorSlug] ?? [];
    const hit = keys.some((k) => haystack.includes(k));
    if (hit) {
      score += 25;
      evidence.push({ type: "sector_match", detail: `Company text aligns with sector “${input.sectorSlug}”.` });
    } else {
      evidence.push({ type: "hypothesis", detail: `Sector “${input.sectorSlug}” assigned manually; verify fit before outreach.` });
    }
  }

  if (input.equipmentNeeds?.trim()) {
    score += 10;
    evidence.push({ type: "need_stated", detail: input.equipmentNeeds.trim() });
  }

  score = Math.min(100, Math.max(0, score));
  return {
    score,
    summary: evidence.length
      ? `Fit score ${score} based on ${evidence.length} evidence item(s).`
      : `Fit score ${score}; add industry or equipment notes to strengthen evidence.`,
    evidence,
  };
}

export interface CsvProspectRow {
  companyName: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  industry?: string;
  equipmentNeeds?: string;
  sectorSlug?: string;
  websiteDomain?: string;
  contactLabel?: string;
  source?: GrowthProspectSource;
}

export function parseCsvProspects(text: string): CsvProspectRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const rows: CsvProspectRow[] = [];
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim());
    const companyName = cols[idx("company_name")] ?? cols[idx("company")] ?? "";
    if (!companyName) continue;
    rows.push({
      companyName,
      email: cols[idx("email")] || undefined,
      phone: cols[idx("phone")] || undefined,
      city: cols[idx("city")] || undefined,
      country: cols[idx("country")] || undefined,
      industry: cols[idx("industry")] || undefined,
      equipmentNeeds: cols[idx("equipment_needs")] || cols[idx("equipment")] || undefined,
      sectorSlug: cols[idx("sector_slug")] || cols[idx("sector")] || undefined,
      websiteDomain: cols[idx("website_domain")] || cols[idx("domain")] || undefined,
      contactLabel: cols[idx("contact_label")] || cols[idx("role")] || undefined,
      source: "IMPORT",
    });
  }
  return rows;
}
