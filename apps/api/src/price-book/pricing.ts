import {
  HISTORICAL_CONFIDENCE_CAP,
  PRICE_BOOK_DEFAULT_FRESHNESS_DAYS,
  PRICE_BOOK_MAX_CONFIDENCE,
  type PricedCandidateDTO,
  type PriceRangeDTO,
  type QuoteLineKind,
} from "@nnact/shared";

export interface ObservationLike {
  id?: string;
  amountCents: number;
  status: "pending" | "confirmed";
  source: "receipt" | "manual" | "historical";
  observedAt: Date | string;
  confidence?: number | null;
}

export interface AliasLike {
  id?: string;
  canonicalName?: string;
  name?: string;
  aliases: { en?: string[]; fr?: string[] } | null;
}

const DAY_MS = 86_400_000;

export function normalizeAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Match a receipt line against canonical names and both alias lists. */
export function matchItemByName<T extends AliasLike>(items: T[], rawName: string): T | null {
  const needle = normalizeAlias(rawName);
  if (!needle) return null;
  for (const item of items) {
    const candidates = [
      item.canonicalName,
      item.name,
      ...(item.aliases?.en ?? []),
      ...(item.aliases?.fr ?? []),
    ].filter((candidate): candidate is string => Boolean(candidate));
    if (candidates.some((candidate) => normalizeAlias(candidate) === needle)) return item;
  }
  return null;
}

/**
 * Current price range from confirmed observations. Fresh data narrows the
 * band; stale/sparse data widens it and lowers confidence. No usable data
 * produces a null range — never a guessed price.
 */
export function currentRange(
  observations: ObservationLike[],
  now: Date = new Date(),
  freshnessDays: number = PRICE_BOOK_DEFAULT_FRESHNESS_DAYS,
): PriceRangeDTO {
  const usable = observations.filter(
    (obs) => obs.status === "confirmed" && Number.isFinite(obs.amountCents) && obs.amountCents > 0,
  );
  if (!usable.length) {
    return { lowCents: null, highCents: null, weightedCents: null, confidence: 0, basis: "none", observationCount: 0 };
  }

  const windowMs = Math.max(1, freshnessDays) * DAY_MS;
  let fresh = 0;
  let totalWeight = 0;
  let weightedTotal = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = 0;
  let historicalCount = 0;

  for (const obs of usable) {
    const observed = obs.observedAt instanceof Date ? obs.observedAt : new Date(obs.observedAt);
    const ageDays = Math.max(0, Math.floor((now.getTime() - observed.getTime()) / DAY_MS));
    if (ageDays <= freshnessDays) fresh += 1;
    if (obs.source === "historical") historicalCount += 1;
    const weight = Math.max(1, Math.floor(1000 / (ageDays + 1)));
    totalWeight += weight;
    weightedTotal += obs.amountCents * weight;
    min = Math.min(min, obs.amountCents);
    max = Math.max(max, obs.amountCents);
  }

  const weighted = Math.round(weightedTotal / totalWeight);
  const sparse = usable.length < 3;
  const stale = fresh === 0 || historicalCount === usable.length;
  const basis: PriceRangeDTO["basis"] = stale ? "stale" : sparse ? "sparse" : "fresh";
  const spread = max - min;
  const spreadPct = weighted > 0 ? Math.round((spread * 100) / weighted) : 0;
  const widthBasis = basis === "fresh" ? 10 : 30;
  const width = Math.max(widthBasis, Math.min(60, widthBasis + Math.round(spreadPct / 2)));
  const lowCents = Math.max(1, Math.min(min, Math.round((weighted * (100 - width)) / 100)));
  const highCents = Math.max(lowCents, Math.max(max, Math.round((weighted * (100 + width)) / 100)));

  let confidence = basis === "fresh" ? 70 : basis === "sparse" ? 55 : 40;
  confidence += Math.min(usable.length, 10) * 3;
  confidence -= Math.min(30, Math.round(spreadPct / 4));
  if (stale && historicalCount === usable.length) confidence = Math.min(confidence, HISTORICAL_CONFIDENCE_CAP);
  const stored = usable.map((obs) => obs.confidence ?? 80);
  confidence = Math.min(confidence, Math.round(stored.reduce((a, b) => a + b, 0) / stored.length));
  const bounded = Math.max(0, Math.min(PRICE_BOOK_MAX_CONFIDENCE, confidence));

  return {
    lowCents,
    highCents,
    weightedCents: weighted,
    confidence: bounded,
    basis,
    observationCount: usable.length,
  };
}

export function rangeForCandidate(
  candidate: { observations: ObservationLike[]; freshnessDays?: number },
  now: Date = new Date(),
): PriceRangeDTO {
  return currentRange(candidate.observations, now, candidate.freshnessDays);
}

export function proposalTotals(lines: { lineLowCents: number | null; lineHighCents: number | null }[]) {
  let lowCents = 0;
  let highCents = 0;
  let hasUnknown = false;
  for (const line of lines) {
    if (line.lineLowCents === null || line.lineHighCents === null) {
      hasUnknown = true;
      continue;
    }
    lowCents += line.lineLowCents;
    highCents += line.lineHighCents;
  }
  return { lowCents: hasUnknown ? null : lowCents, highCents: hasUnknown ? null : highCents, hasUnknown };
}

export interface SelectionValidation {
  errors: string[];
  valid: boolean;
}

/**
 * Code-level no-invented-price guard. The model may only name candidates we
 * actually offered; any unknown id, wrong kind, or bad quantity is rejected.
 */
export function validateSelections(
  draft: {
    lines: Array<{
      candidateId: string;
      kind: QuoteLineKind;
      quantity: number;
      reason?: string;
      needsManualPrice?: boolean;
    }>;
  },
  candidates: PricedCandidateDTO[],
): SelectionValidation {
  const byId = new Map(candidates.map((candidate) => [candidate.itemId ?? candidate.rateId ?? "", candidate]));
  const errors: string[] = [];
  const seen = new Set<string>();
  draft.lines.forEach((line, index) => {
    const candidate = byId.get(line.candidateId);
    if (!candidate) {
      errors.push(`line ${index + 1}: unknown candidate ${line.candidateId}`);
      return;
    }
    if (candidate.kind !== line.kind) {
      errors.push(`line ${index + 1}: kind ${line.kind} does not match candidate ${line.candidateId}`);
    }
    if (seen.has(line.candidateId)) {
      errors.push(`line ${index + 1}: duplicate candidate ${line.candidateId}`);
    }
    seen.add(line.candidateId);
    if (!Number.isInteger(line.quantity) || line.quantity <= 0 || line.quantity > 1000) {
      errors.push(`line ${index + 1}: invalid quantity ${line.quantity}`);
    }
  });
  return { errors, valid: errors.length === 0 };
}
