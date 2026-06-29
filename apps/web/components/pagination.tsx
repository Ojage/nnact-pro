import { Button } from "@/components/ui/button";

interface PaginationProps {
  skip: number;
  take: number;
  total?: number;
  onSkipChange: (skip: number) => void;
}

export function Pagination({ skip, take, total, onSkipChange }: PaginationProps) {
  const hasPrev = skip > 0;
  const hasNext = total !== undefined ? skip + take < total : true;
  const from = total ? skip + 1 : skip + 1;
  const to = total ? Math.min(skip + take, total) : skip + take;

  return (
    <div className="flex items-center justify-between pt-4 pb-2">
      {total !== undefined ? (
        <p className="text-xs text-fg-dim">
          Showing {from}&ndash;{to} of {total}
        </p>
      ) : (
        <div />
      )}
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasPrev}
          onClick={() => onSkipChange(Math.max(0, skip - take))}
        >
          ← Previous
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hasNext}
          onClick={() => onSkipChange(skip + take)}
        >
          Next →
        </Button>
      </div>
    </div>
  );
}
