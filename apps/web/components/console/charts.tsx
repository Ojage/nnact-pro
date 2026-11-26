"use client";

import { useId, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

export type ColumnDatum = { label: string; value: number; detail?: string };

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const exponent = 10 ** Math.floor(Math.log10(value));
  const fraction = value / exponent;
  const nice = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * exponent;
}

/**
 * Single-series column chart (one hue, so no legend; the panel title names
 * it). Thin columns with a 4px rounded data end, hairline grid, the peak and
 * the latest value labelled, a tooltip on hover and keyboard focus, and the
 * same numbers in a table view.
 */
export function ColumnChart({
  data,
  format,
  formatTick = format,
  label,
  height = 160,
  integer,
  empty = "Nothing recorded in this period.",
}: {
  data: ColumnDatum[];
  format: (value: number) => string;
  formatTick?: (value: number) => string;
  /** Accessible description of what is plotted. */
  label: string;
  height?: number;
  /** Counts: keep the axis on whole numbers. */
  integer?: boolean;
  /** Shown instead of a flat chart when every value is zero. */
  empty?: string;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const top = Math.max(0, ...data.map((d) => d.value));
  const max = integer ? Math.ceil(niceMax(Math.max(2, top)) / 2) * 2 : niceMax(top);
  if (top === 0) return <p className="py-8 text-center text-sm text-fg-muted">{empty}</p>;
  const peak = data.reduce((best, d, index) => (d.value > (data[best]?.value ?? -Infinity) ? index : best), 0);
  const last = data.length - 1;
  const ticks = [max, max / 2, 0];

  return (
    <figure className="grid gap-2" aria-labelledby={`${id}-label`}>
      <figcaption id={`${id}-label`} className="sr-only">
        {label}
      </figcaption>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
        <div className="relative text-right text-[11px] tabular-nums text-fg-muted" style={{ height }} aria-hidden="true">
          {ticks.map((tick, index) => (
            <span key={tick} className="absolute right-0 -translate-y-1/2 whitespace-nowrap" style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}>
              {formatTick(tick)}
            </span>
          ))}
        </div>
        <div className="relative" style={{ height }} onPointerLeave={() => setActive(null)}>
          {ticks.map((tick, index) => (
            <span
              key={tick}
              aria-hidden="true"
              className="absolute inset-x-0 border-t border-[var(--console-chart-grid)]"
              style={{ top: `${(index / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <ol className="absolute inset-0 flex items-end" role="list" aria-label={label}>
            {data.map((datum, index) => {
              const share = datum.value / max;
              const labelled = datum.value > 0 && (index === peak || index === last);
              return (
                <li key={datum.label} className="relative flex h-full min-w-0 flex-1 items-end justify-center">
                  <button
                    type="button"
                    className="group relative flex h-full w-full items-end justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--shell-focus)]"
                    aria-label={`${datum.label}: ${format(datum.value)}${datum.detail ? `, ${datum.detail}` : ""}`}
                    onPointerEnter={() => setActive(index)}
                    onFocus={() => setActive(index)}
                    onBlur={() => setActive(null)}
                  >
                    <span
                      className={cn(
                        "block w-full max-w-6 rounded-t-[4px] bg-[var(--console-chart-mark)] transition-opacity",
                        active !== null && active !== index && "opacity-60",
                      )}
                      style={{ height: `${Math.max(datum.value > 0 ? 2 : 0, share * 100)}%` }}
                    />
                    {labelled ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium tabular-nums text-fg"
                        style={{ bottom: `calc(${share * 100}% + 4px)` }}
                      >
                        {formatTick(datum.value)}
                      </span>
                    ) : null}
                  </button>
                  {active === index ? (
                    <span
                      role="tooltip"
                      className={cn(
                        "pointer-events-none absolute z-10 grid min-w-28 gap-0.5 rounded-[6px] border border-[var(--shell-border)] bg-[var(--shell-panel)] px-2.5 py-1.5 text-left shadow-md",
                        index > data.length / 2 ? "right-1/2" : "left-1/2",
                      )}
                      style={{ bottom: `calc(${Math.min(share, 0.75) * 100}% + 8px)` }}
                    >
                      <span className="text-sm font-semibold tabular-nums text-fg">{format(datum.value)}</span>
                      <span className="text-xs text-fg-muted">{datum.label}</span>
                      {datum.detail ? <span className="text-xs text-fg-muted">{datum.detail}</span> : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ol>
        </div>
        <span aria-hidden="true" />
        <div className="flex" aria-hidden="true">
          {data.map((datum) => (
            <span key={datum.label} className="min-w-0 flex-1 truncate pt-1 text-center text-[11px] text-fg-muted">
              {datum.label}
            </span>
          ))}
        </div>
      </div>
      <details className="text-xs text-fg-muted">
        <summary className="w-fit cursor-pointer rounded-sm font-medium text-[var(--shell-accent-text)] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]">
          Show as table
        </summary>
        <table className="mt-2 w-full text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="border-b border-[var(--shell-border)] text-left text-xs text-fg-muted">
              <th scope="col" className="py-1 font-medium">
                Period
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((datum) => (
              <tr key={datum.label} className="border-b border-[var(--shell-border)] last:border-b-0">
                <th scope="row" className="py-1 text-left font-normal text-fg">
                  {datum.label}
                </th>
                <td className="py-1 text-right tabular-nums text-fg">{format(datum.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export type MeterRow = {
  id: string;
  label: string;
  value: number;
  /** The whole the value is measured against (a plan or a cap). */
  of?: number;
  valueText: string;
  level?: "ok" | "warning" | "critical";
  href?: string;
};

const LEVEL_FILL = {
  ok: "var(--console-chart-mark)",
  warning: "var(--color-attention-fg)",
  critical: "var(--color-danger-fg)",
} as const;

/**
 * Horizontal meters, one per row: label and value as text, the fill shows the
 * share. Warning and over-plan rows also say so in words with an icon.
 */
export function MeterList({ rows, empty }: { rows: MeterRow[]; empty: string }) {
  if (rows.length === 0) return <p className="py-4 text-center text-sm text-fg-muted">{empty}</p>;
  const scale = Math.max(1, ...rows.map((row) => row.of ?? row.value));
  return (
    <ul className="grid gap-3" role="list">
      {rows.map((row) => {
        const whole = row.of ?? scale;
        const share = whole > 0 ? Math.min(1, row.value / whole) : 0;
        const level = row.level ?? "ok";
        return (
          <li key={row.id} className="grid gap-1">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-fg">{row.label}</span>
              <span className="shrink-0 tabular-nums text-fg-muted">{row.valueText}</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--shell-hover)]" aria-hidden="true">
              <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: LEVEL_FILL[level] }} />
            </div>
            {level !== "ok" ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-fg">
                <TriangleAlert className="size-3.5" style={{ color: LEVEL_FILL[level] }} aria-hidden="true" />
                {level === "critical" ? "Over plan" : "Near plan"}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Group dated amounts into the last `months` calendar months (oldest first). */
export function monthlySeries<T>(
  items: readonly T[],
  date: (item: T) => string | null | undefined,
  amount: (item: T) => number,
  months = 6,
  now = new Date(),
): ColumnDatum[] {
  const buckets: { key: string; label: string; value: number; count: number }[] = [];
  for (let offset = months - 1; offset >= 0; offset -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString(undefined, { month: "short" }),
      value: 0,
      count: 0,
    });
  }
  const index = new Map(buckets.map((bucket, i) => [bucket.key, i]));
  for (const item of items) {
    const raw = date(item);
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const slot = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (slot === undefined) continue;
    buckets[slot].value += amount(item);
    buckets[slot].count += 1;
  }
  return buckets.map(({ label, value, count }) => ({ label, value, detail: `${count} item${count === 1 ? "" : "s"}` }));
}
