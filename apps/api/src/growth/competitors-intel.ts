// Competitor discovery heuristics — foreign HVAC references are not local competitors.

export interface CompetitorSuggestion {
  name: string;
  websiteDomain: string;
  classification: "DIRECT_LOCAL" | "REGIONAL" | "INTERNATIONAL_REFERENCE" | "UNRELATED";
  reviewStatus: "SUGGESTED";
  geography?: string;
  evidenceSummary: string;
  sourceUrls: string[];
}

/** Known reference domains from other projects — never auto-approved as Cameroon competitors. */
export const REFERENCE_FOREIGN_DOMAINS = ["acehvacrepair.com", "onehourairftworth.com"];

export function suggestCompetitorsFromWebsite(
  companyDomain: string,
  serviceAreas: string[],
  industries: string[],
): CompetitorSuggestion[] {
  const suggestions: CompetitorSuggestion[] = [];
  const areaText = serviceAreas.join(" ").toLowerCase();
  const isCameroon =
    areaText.includes("cameroon") ||
    areaText.includes("buea") ||
    areaText.includes("douala") ||
    areaText.includes("yaoundé") ||
    areaText.includes("yaounde");

  for (const domain of REFERENCE_FOREIGN_DOMAINS) {
    suggestions.push({
      name: domain.replace(/\..*$/, "").replace(/-/g, " "),
      websiteDomain: domain,
      classification: "INTERNATIONAL_REFERENCE",
      reviewStatus: "SUGGESTED",
      geography: "United States (reference only)",
      evidenceSummary: isCameroon
        ? `US HVAC operator (${domain}) — useful positioning reference, not a direct competitor in ${serviceAreas.join(", ") || "local markets"}.`
        : `Foreign reference domain listed for comparison; geography does not overlap with ${companyDomain}.`,
      sourceUrls: [`https://${domain}`],
    });
  }

  if (industries.length) {
    suggestions.push({
      name: "Local HVAC & maintenance operators",
      websiteDomain: "",
      classification: "REGIONAL",
      reviewStatus: "SUGGESTED",
      geography: serviceAreas.join(", ") || "Regional",
      evidenceSummary: `Manual review needed: search for HVAC/maintenance providers serving ${industries.slice(0, 3).join(", ")} in the same geography as ${companyDomain}.`,
      sourceUrls: [],
    });
  }

  return suggestions;
}

export function buildComparisonSummary(
  approvedLocal: { name: string; services?: string | null; positioning?: string | null }[],
  nnactAdvantages: string[],
  nnactGaps: string[],
): { summary: string; comparison: Record<string, unknown> } {
  return {
    summary:
      `Compared ${approvedLocal.length} approved competitor(s). ` +
      `NNACT verified advantages: ${nnactAdvantages.length}. Evidence gaps to strengthen: ${nnactGaps.length}.`,
    comparison: {
      prospectsCareAbout: ["Response time", "Maintenance plan clarity", "Local presence", "Equipment expertise"],
      nnactVerifiedAdvantages: nnactAdvantages,
      nnactEvidenceGaps: nnactGaps,
      offersToStrengthen: nnactGaps,
      competitors: approvedLocal.map((c) => ({
        name: c.name,
        services: c.services,
        positioning: c.positioning,
      })),
      disclaimer: "Competitor quality and pricing claims require source URLs; none are asserted without evidence.",
    },
  };
}
