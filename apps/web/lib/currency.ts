/** Format a numeric amount with grouping separators for display in inputs. */
export function formatNumberWithCommas(value: number): string {
  if (!Number.isFinite(value)) return "";
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Parse user-typed currency/number text back to a number. */
export function parseNumericValue(input: string): number {
  const cleaned = input.replace(/[^\d.-]/g, "");
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}
