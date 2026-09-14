export interface OptionLike {
  id: string;
  label: string;
  total: number;
  pricing?: { total?: number } | null;
  lines: Array<{ description: string; quantity: number; unitPrice: number; unit?: string | null }>;
}

export interface EstimateScopeInput {
  options: OptionLike[];
  scope?: string | null;
  jobDescription?: string | null;
}

export interface EstimateChecks {
  identicalOptions: boolean;
  identicalOptionMessage: string;
  scopeGaps: string[];
}

/**
 * Scope keywords that should map to priced line items.  The check is
 * deliberately lightweight — simple keyword/regex matching — so it can be
 * a helpful warning without requiring AI/NLP.
 */
const SCOPE_KEYWORDS: Array<{
  label: string;
  linePattern: RegExp;
  scopePatterns: RegExp[];
}> = [
  { label: "evaporator", linePattern: /evaporator/i, scopePatterns: [/evaporator/i] },
  { label: "filter/drier", linePattern: /filter|drier|filter.?drier/i, scopePatterns: [/filter|drier|filter.?drier/i] },
  { label: "capillary", linePattern: /capillary/i, scopePatterns: [/capillary/i] },
  { label: "refrigerant/gas", linePattern: /refrigerant|refrigeration|gas|freon|r-?\d+[a-z]?/i, scopePatterns: [/refrigerant|gas|freon|r-?\d+/i] },
  { label: "compressor", linePattern: /compressor/i, scopePatterns: [/compressor/i] },
  { label: "condenser", linePattern: /condenser/i, scopePatterns: [/condenser/i] },
  { label: "leak test", linePattern: /leak/i, scopePatterns: [/leak/i] },
  { label: "operational test", linePattern: /test|commissioning/i, scopePatterns: [/\btest\b|commissioning/i] },
  { label: "wiring/electrical", linePattern: /wiring|electrical|cable|wire/i, scopePatterns: [/wiring|electrical|cable/i] },
  { label: "thermostat/control", linePattern: /thermostat|control/i, scopePatterns: [/thermostat|control/i] },
];

function normalisedLines(lines: OptionLike["lines"]): string {
  return lines
    .map(
      (line) =>
        `${line.description.trim().toLowerCase()}|${line.quantity}|${line.unitPrice}|${(line.unit ?? "").trim().toLowerCase()}`,
    )
    .join("\n");
}

export function optionsIdentical(options: OptionLike[]): boolean {
  if (options.length < 2) return false;
  const [first, ...rest] = options;
  const firstKey = normalisedLines(first.lines);
  const firstTotal = first.pricing?.total ?? first.total;
  return rest.every((option) => {
    if ((option.pricing?.total ?? option.total) !== firstTotal) return false;
    return normalisedLines(option.lines) === firstKey;
  });
}

export function estimateChecks({ options, scope, jobDescription }: EstimateScopeInput): EstimateChecks {
  const identicalOptions = optionsIdentical(options);
  const identicalOptionMessage = identicalOptions
    ? "These options are identical. Differentiate the options or use a single estimate."
    : "";
  const allLines = options.flatMap((option) => option.lines);
  const text = `${scope ?? ""}\n${jobDescription ?? ""}`.toLowerCase();
  const scopeGaps: string[] = [];
  for (const keyword of SCOPE_KEYWORDS) {
    const scopeMentioned = keyword.scopePatterns.some((re) => re.test(text));
    if (!scopeMentioned) continue;
    const lineCovered = allLines.some((line) => keyword.linePattern.test(line.description));
    if (!lineCovered) scopeGaps.push(`Scope references "${keyword.label}" but no priced line item was found.`);
  }
  return { identicalOptions, identicalOptionMessage, scopeGaps };
}
