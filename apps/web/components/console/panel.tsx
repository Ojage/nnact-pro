"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { card, cardHead, cardTitle } from "./styles";

/** A framed console card with a titled header bar and optional header actions. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Children run edge to edge (tables, lists). */
  flush?: boolean;
}) {
  const id = useId();
  return (
    <section aria-labelledby={title ? id : undefined} className={cn(card, className)}>
      {title ? (
        <div className={cardHead}>
          <div className="min-w-0">
            <h2 id={id} className={cardTitle}>
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-fg-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 flex-wrap items-center gap-1">{actions}</div> : null}
        </div>
      ) : null}
      <div className={cn(flush ? "" : "px-4 py-3", bodyClassName)}>{children}</div>
    </section>
  );
}

export type Fact = [term: string, value: ReactNode];

/** Key-value rows in the console "Details" style. Empty values show an em dash. */
export function Facts({ rows, termWidth = "10rem" }: { rows: Fact[]; termWidth?: string }) {
  return (
    <dl
      className="grid gap-x-4 gap-y-2.5 text-sm"
      style={{ gridTemplateColumns: `minmax(0, ${termWidth}) minmax(0, 1fr)` }}
    >
      {rows.map(([term, value]) => (
        <div key={term} className="contents">
          <dt className="text-fg-muted">{term}</dt>
          <dd className="min-w-0 break-words tabular-nums text-fg">
            {value === null || value === undefined || value === "" ? <span className="text-fg-muted">—</span> : value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Panel titled "Details" (or another title) holding key-value facts. */
export function DetailsCard({
  title = "Details",
  rows,
  actions,
  className,
  termWidth,
}: {
  title?: ReactNode;
  rows: Fact[];
  actions?: ReactNode;
  className?: string;
  termWidth?: string;
}) {
  return (
    <Panel title={title} actions={actions} className={className}>
      <Facts rows={rows} termWidth={termWidth} />
    </Panel>
  );
}
