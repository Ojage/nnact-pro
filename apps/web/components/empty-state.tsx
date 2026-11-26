import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

/** Console empty state: an icon, a plain sentence and the next step. */
export function EmptyState({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-[8px] border border-dashed border-[var(--shell-border)] px-6 py-12 text-center">
      <span className="mb-1 grid size-11 place-items-center rounded-full bg-[var(--shell-canvas)] text-fg-muted" aria-hidden="true">
        <Inbox className="size-5" />
      </span>
      <p className="text-base font-medium text-fg">{title}</p>
      {description && <p className="max-w-md text-sm text-fg-muted">{description}</p>}
      {actions && <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
    </div>
  );
}
