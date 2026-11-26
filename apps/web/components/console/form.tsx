"use client";

import type { ReactNode } from "react";
import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * GCP-style form section: a heading with a short explanation, then fields.
 * Sections stack with hairline dividers.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cn("grid min-w-0 gap-4 border-b border-[var(--shell-border)] pb-6 last:border-b-0", className)}>
      <div>
        <h2 id={id} className="text-base font-medium text-fg">
          {title}
        </h2>
        {description ? <p className="mt-0.5 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Helper text under a field, linked with aria-describedby by the caller. */
export function FieldHelp({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="mt-1 text-xs text-fg-muted">
      {children}
    </p>
  );
}

/** Sticky bottom bar for the main form actions (Create / Cancel). */
export function StickyActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("console-action-bar flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
