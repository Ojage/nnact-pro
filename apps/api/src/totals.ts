// Pure money math, shared by job/estimate/invoice totals. Cents in, cents out.
// Kept dependency-free so it's unit-testable without a database.
export interface LineLike {
  quantity: number;
  unitPrice: number; // cents
}

export function lineTotal(l: LineLike): number {
  return Math.round(l.quantity * l.unitPrice);
}

export function sumLines(lines: LineLike[]): number {
  return lines.reduce((acc, l) => acc + lineTotal(l), 0);
}

export function formatMoney(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
