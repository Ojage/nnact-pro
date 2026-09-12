// Small deterministic fuzzy matcher used by the sidebar feature search.
// Scores title/keyword text against a (lowercased) query using substring +
// contiguous-subsequence heuristics — no external deps, works for CJK / Latin.

/** Returns a score > 0 when every char of `query` appears in `text` (in order). */
export function fuzzyScore(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return 200 - t.indexOf(q) * 0.5;

  let qi = 0;
  let score = 0;
  let streak = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      qi++;
      streak++;
      score += streak > 1 ? 6 : 3;
    } else {
      streak = 0;
    }
  }
  if (qi < q.length) return 0;
  // Prefer matches that start early and use fewer gaps.
  const proximity = 1 - t.indexOf(q[0]) / Math.max(t.length, 1);
  return score + proximity * 10;
}

/** Returns the char indices that `query` matched inside `text` (substring style). */
export function fuzzyIndexes(query: string, text: string): number[] | null {
  if (!query) return null;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const idx = t.indexOf(q);
  if (idx !== -1) return [idx, idx + q.length];
  return null;
}

export function pickBestScore(query: string, fields: string[]): number {
  let best = 0;
  for (const field of fields) {
    const s = fuzzyScore(query, field);
    if (s > best) best = s;
  }
  return best;
}