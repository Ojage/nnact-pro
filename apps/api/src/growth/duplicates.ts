// Duplicate detection for prospects.
//
// Creating a second record for a company that already exists is the most common
// data defect in a prospect list, and it silently splits outreach history. This
// module scores candidate records against an incoming prospect so the API can
// return "did you mean?" matches and offer a merge instead of writing a dupe.
//
// Pure and synchronous by design: the route performs the indexed lookups and
// hands the rows here, so the scoring rules are unit-testable without a database.

import {
  normalizeCompany,
  normalizeDomain,
  normalizeEmail,
  normalizePhone,
  domainFromEmail,
  type SuppressionTarget,
} from "./send-policy.js";

export type DuplicateField = "EMAIL" | "DOMAIN" | "PHONE" | "COMPANY";

export interface DuplicateCandidate {
  id: string;
  companyName: string;
  websiteDomain?: string | null;
  contacts?: Array<{ kind: string; value: string; normalizedValue?: string | null }>;
}

export interface DuplicateMatch {
  id: string;
  companyName: string;
  websiteDomain?: string | null;
  matchedOn: DuplicateField;
  /** 0–100; higher is a stronger signal that the records are the same entity. */
  score: number;
}

/** Weights per matched field. A shared email is the strongest signal. */
const FIELD_SCORE: Record<DuplicateField, number> = {
  EMAIL: 100,
  DOMAIN: 90,
  PHONE: 80,
  COMPANY: 60,
};

/** Company names at or above this similarity are treated as the same company. */
const COMPANY_SIMILARITY_THRESHOLD = 0.82;

export function contactNormalizedValue(
  kind: string,
  value: string,
  options: { countryCallingCode?: string | null } = {},
): string {
  switch (kind.toUpperCase()) {
    case "EMAIL":
      return normalizeEmail(value) ?? "";
    case "PHONE":
    case "WHATSAPP":
      return normalizePhone(value, { countryCallingCode: options.countryCallingCode }) ?? "";
    case "DOMAIN":
      return normalizeDomain(value) ?? "";
    case "COMPANY":
      return normalizeCompany(value) ?? "";
    default:
      return value.trim().toLowerCase();
  }
}

/** Normalizes a prospective suppression/search target into lookup keys. */
export function duplicateLookupKeys(target: SuppressionTarget) {
  const email = normalizeEmail(target.email);
  const domain = normalizeDomain(target.domain) ?? domainFromEmail(email);
  const phone = normalizePhone(target.phone, { countryCallingCode: target.countryCallingCode });
  const company = normalizeCompany(target.company);
  return { email, domain, phone, company };
}

/**
 * Dice coefficient over bigrams — a cheap, order-tolerant similarity for short
 * company names. Returns 0 for strings with no shared bigram.
 */
export function bigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return a === b ? 1 : 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i += 1) {
    const gram = a.slice(i, i + 2);
    bigrams.set(gram, (bigrams.get(gram) ?? 0) + 1);
  }
  let matches = 0;
  for (let i = 0; i < b.length - 1; i += 1) {
    const gram = b.slice(i, i + 2);
    const remaining = bigrams.get(gram) ?? 0;
    if (remaining > 0) {
      bigrams.set(gram, remaining - 1);
      matches += 1;
    }
  }
  return (2 * matches) / (a.length - 1 + b.length - 1);
}

export function isSimilarCompany(a: string, b: string): boolean {
  const left = normalizeCompany(a);
  const right = normalizeCompany(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return bigramSimilarity(left, right) >= COMPANY_SIMILARITY_THRESHOLD;
}

function contactValues(
  candidate: DuplicateCandidate,
  kind: DuplicateField,
  options: { countryCallingCode?: string | null } = {},
): string[] {
  const wanted =
    kind === "EMAIL" ? "EMAIL" : kind === "PHONE" ? "PHONE" : kind === "DOMAIN" ? "DOMAIN" : "COMPANY";
  return (candidate.contacts ?? [])
    .filter((contact) => contact.kind.toUpperCase() === wanted)
    .map((contact) => contactNormalizedValue(contact.kind, contact.value, options))
    .filter(Boolean);
}

/**
 * Scores one candidate against the incoming target. Returns null when no field
 * matches. The strongest matching field determines the score and label.
 */
export function scoreDuplicate(target: SuppressionTarget, candidate: DuplicateCandidate): DuplicateMatch | null {
  const keys = duplicateLookupKeys(target);
  const phoneOptions = { countryCallingCode: target.countryCallingCode };
  const matches: Array<{ field: DuplicateField; score: number }> = [];

  if (keys.email) {
    if (contactValues(candidate, "EMAIL").includes(keys.email)) {
      matches.push({ field: "EMAIL", score: FIELD_SCORE.EMAIL });
    }
  }

  if (keys.domain) {
    const candidateDomain = normalizeDomain(candidate.websiteDomain);
    if (
      candidateDomain &&
      (candidateDomain === keys.domain || candidateDomain.endsWith(`.${keys.domain}`) || keys.domain.endsWith(`.${candidateDomain}`))
    ) {
      matches.push({ field: "DOMAIN", score: FIELD_SCORE.DOMAIN });
    } else if (contactValues(candidate, "DOMAIN").includes(keys.domain)) {
      matches.push({ field: "DOMAIN", score: FIELD_SCORE.DOMAIN });
    }
  }

  if (keys.phone) {
    if (contactValues(candidate, "PHONE", phoneOptions).includes(keys.phone)) {
      matches.push({ field: "PHONE", score: FIELD_SCORE.PHONE });
    }
  }

  if (keys.company && isSimilarCompany(keys.company, candidate.companyName)) {
    // A fuzzy company match is weaker evidence than an exact identifier, so it
    // is capped below the email score and discounted for distance from exact.
    const similarity = bigramSimilarity(keys.company, normalizeCompany(candidate.companyName) ?? "");
    const discounted = Math.round(FIELD_SCORE.COMPANY * Math.max(similarity, COMPANY_SIMILARITY_THRESHOLD));
    matches.push({ field: "COMPANY", score: discounted });
  }

  if (!matches.length) return null;
  matches.sort((a, b) => b.score - a.score);
  const best = matches[0];
  return {
    id: candidate.id,
    companyName: candidate.companyName,
    websiteDomain: candidate.websiteDomain ?? null,
    matchedOn: best.field,
    score: best.score,
  };
}

/**
 * Ranks all candidate matches, strongest first. Company-name matches are
 * included but scored lower than any identifier match: a similar name is worth
 * surfacing as a "did you mean?" suggestion without being strong enough on its
 * own to block creating a genuinely new prospect. Use `hasHardDuplicate` for
 * that decision.
 */
export function detectDuplicates(
  target: SuppressionTarget,
  candidates: readonly DuplicateCandidate[],
  options: { minimumScore?: number } = {},
): DuplicateMatch[] {
  const minimumScore = options.minimumScore ?? 0;
  return candidates
    .map((candidate) => scoreDuplicate(target, candidate))
    .filter((match): match is DuplicateMatch => match !== null && match.score >= minimumScore)
    .sort((a, b) => b.score - a.score);
}

/**
 * True when a match rests on a shared identifier (email, domain or phone)
 * rather than a similar company name. Only this justifies refusing or merging a
 * new prospect automatically.
 */
export function hasHardDuplicate(matches: readonly DuplicateMatch[]): boolean {
  return matches.some((match) => match.matchedOn !== "COMPANY");
}
