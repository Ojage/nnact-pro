// Pure money math, shared by job/estimate/invoice totals. Cents in, cents out.
// Kept dependency-free so it's unit-testable without a database.
export interface LineLike {
  quantity: number;
  unitPrice: number; // cents (revenue side)
  unitCost?: number; // cents (cost side; optional so old callers unaffected)
}

export function lineTotal(l: LineLike): number {
  return Math.round(l.quantity * l.unitPrice);
}

export function sumLines(lines: LineLike[]): number {
  return lines.reduce((acc, l) => acc + lineTotal(l), 0);
}

// Sum of business-side cost across line items. Missing unitCost treated as 0:
// old data and old callers stay correct without backfill.
export function sumCosts(lines: LineLike[]): number {
  return lines.reduce(
    (acc, l) => acc + Math.round(l.quantity * (l.unitCost ?? 0)),
    0,
  );
}

// Total cost on a job = sum of line-item costs + the job-level labor cost.
// laborCostCents is jobs.laborCostCents (tech time for the whole job).
export function jobCost(lines: LineLike[], laborCostCents: number): number {
  return sumCosts(lines) + laborCostCents;
}

// Margin = revenue - cost. Positive is profit, negative is loss. Sign-preserving:
// downstream code never needs to clamp to zero (which would hide losses).
export function jobMargin(total: number, cost: number): number {
  return total - cost;
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
