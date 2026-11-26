import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  skip: number;
  take: number;
  total?: number;
  onSkipChange: (skip: number) => void;
}

const pageButton =
  "grid size-8 place-items-center rounded-full text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--shell-focus)]";

/** Console pager: "1 – 50 of 230" with previous / next arrows. */
export function Pagination({ skip, take, total, onSkipChange }: PaginationProps) {
  const hasPrev = skip > 0;
  const hasNext = total !== undefined ? skip + take < total : true;
  if (total !== undefined && total <= take && skip === 0) return null;
  const from = total === 0 ? 0 : skip + 1;
  const to = total !== undefined ? Math.min(skip + take, total) : skip + take;

  return (
    <nav aria-label="Pagination" className="flex items-center justify-end gap-3 pt-3 text-xs text-fg-muted">
      <span aria-live="polite">
        {from} – {to}
        {total !== undefined ? ` of ${total}` : ""}
      </span>
      <span className="flex gap-1">
        <button type="button" className={pageButton} disabled={!hasPrev} onClick={() => onSkipChange(Math.max(0, skip - take))} aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden="true" />
        </button>
        <button type="button" className={pageButton} disabled={!hasNext} onClick={() => onSkipChange(skip + take)} aria-label="Next page">
          <ChevronRight className="size-4" aria-hidden="true" />
        </button>
      </span>
    </nav>
  );
}
