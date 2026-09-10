// Duplicate detection — cheap deterministic similarity used before generation
// and by the quality gate so the autopilot cannot republish a near-identical
// piece during its unattended window.
function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function bigrams(value: string): Set<string> {
  const parts = tokens(value);
  const out = new Set<string>();
  if (parts.length === 1) out.add(parts[0]);
  for (let i = 0; i < parts.length - 1; i++) out.add(`${parts[i]} ${parts[i + 1]}`);
  return out;
}

/** Sørensen–Dice style similarity over bigrams — stable and dependency-free. */
export function titleSimilarity(a: string, b: string): number {
  if (!a.trim() || !b.trim()) return 0;
  const sa = bigrams(a);
  const sb = bigrams(b);
  let intersection = 0;
  for (const gram of sa) if (sb.has(gram)) intersection += 1;
  const denom = sa.size + sb.size;
  return denom === 0 ? 0 : (2 * intersection) / denom;
}

export const DUPLICATE_THRESHOLD = 0.55;

/** Returns the closest existing title when it exceeds the threshold. */
export function findNearDuplicate(candidate: string, existingTitles: string[]): string | null {
  let best = "";
  let bestScore = 0;
  for (const title of existingTitles) {
    const score = titleSimilarity(candidate, title);
    if (score > bestScore) {
      bestScore = score;
      best = title;
    }
  }
  return bestScore >= DUPLICATE_THRESHOLD ? best : null;
}