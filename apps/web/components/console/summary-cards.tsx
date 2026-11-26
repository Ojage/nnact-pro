import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

export type SummaryItem = {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  /** One short line under the number, in words. */
  note?: ReactNode;
  href?: string;
  /** 0..1 share shown as a thin meter under the number. */
  meter?: number;
  /** Puts a warning mark on the note. */
  attention?: boolean;
};

/** A strip of console summary cards (Agent Office style). */
export function SummaryCards({ items, label, className }: { items: SummaryItem[]; label: string; className?: string }) {
  const cols =
    items.length >= 4 ? "sm:grid-cols-2 xl:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : items.length === 2 ? "sm:grid-cols-2" : "";
  return (
    <ul className={cn("grid grid-cols-1 gap-3", cols, className)} role="list" aria-label={label}>
      {items.map((item) => {
        const Icon = item.icon;
        const body = (
          <>
            <p className="flex items-center gap-2 text-xs font-medium text-fg-muted">
              {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
              {item.label}
            </p>
            <p className="mt-2 text-2xl font-normal tabular-nums text-fg">{item.value}</p>
            {item.meter !== undefined ? (
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--shell-hover)]" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-[var(--shell-accent-bar)]"
                  style={{ width: `${Math.max(0, Math.min(1, item.meter)) * 100}%` }}
                />
              </div>
            ) : null}
            {item.note ? (
              <p className={cn("mt-1 text-xs", item.attention ? "font-medium text-fg" : "text-fg-muted")}>
                {item.attention ? "▲ " : null}
                {item.note}
              </p>
            ) : null}
          </>
        );
        return (
          <li key={item.label} className="min-w-0">
            {item.href ? (
              <Link
                href={item.href}
                className={cn(
                  "block h-full rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)] p-4 no-underline hover:bg-[var(--shell-canvas)] hover:no-underline",
                  focusRing,
                )}
              >
                {body}
              </Link>
            ) : (
              <div className="h-full rounded-[8px] border border-[var(--shell-border)] bg-[var(--shell-panel)] p-4">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
