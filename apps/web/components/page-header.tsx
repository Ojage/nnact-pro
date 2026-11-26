import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Console page header used across staff pages: a 22px title, an optional
 * description, and the page's main actions, over a hairline divider.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-6 flex min-w-0 flex-col gap-3 border-b border-[var(--shell-border)] pb-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="break-words text-[22px] font-normal leading-tight text-fg">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
