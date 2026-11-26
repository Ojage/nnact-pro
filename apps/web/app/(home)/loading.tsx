import { Skeleton } from "@/components/ui/skeleton";

/**
 * Home page skeleton. Mirrors the real layout block for block: Welcome
 * (left column with scope, links and actions; learning card as tall as it),
 * Quick access, then Today at a glance, so nothing jumps when data arrives.
 */
const bar = "rounded-[6px]";
const box = "rounded-[8px]";

export default function HomeLoading() {
  return (
    <div className="mx-auto min-w-0 max-w-6xl space-y-10" aria-busy="true" aria-label="Loading your home page">
      <div className="space-y-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:items-stretch">
          <div className="min-w-0 space-y-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-11 shrink-0 rounded-full sm:size-12" />
              <Skeleton className={`h-9 w-64 max-w-[70%] ${bar}`} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Skeleton className={`h-5 w-28 ${bar}`} />
              <Skeleton className="h-9 w-28 rounded-full" />
              <Skeleton className="h-9 w-36 rounded-full" />
            </div>
            <div className="flex gap-4">
              <Skeleton className={`h-4 w-44 ${bar}`} />
              <Skeleton className={`h-4 w-36 ${bar}`} />
            </div>
            <div className="flex gap-5">
              <Skeleton className={`h-4 w-32 ${bar}`} />
              <Skeleton className={`h-4 w-24 ${bar}`} />
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {[24, 32, 36, 44, 32, 30].map((width, index) => (
                <Skeleton key={index} className={`h-9 ${box}`} style={{ width: `${width * 4}px` }} />
              ))}
            </div>
          </div>
          <div className="flex min-h-[13rem] flex-col overflow-hidden rounded-[8px] border border-[var(--shell-border)]">
            <Skeleton className="min-h-28 flex-1 rounded-none" />
            <div className="space-y-2 border-t border-[var(--shell-border)] px-4 py-3">
              <Skeleton className={`h-4 w-full ${bar}`} />
              <Skeleton className={`h-4 w-32 ${bar}`} />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <Skeleton className={`h-6 w-32 ${bar}`} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className={`h-16 ${box}`} />
            ))}
          </div>
          <Skeleton className={`h-9 w-40 ${box}`} />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <Skeleton className={`h-6 w-40 ${bar}`} />
          <Skeleton className={`h-4 w-80 max-w-full ${bar}`} />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className={`h-[5.5rem] ${box}`} />
          ))}
        </div>
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
          {[0, 1].map((panel) => (
            <div key={panel} className="min-w-0 rounded-[8px] border border-[var(--shell-border)]">
              <div className="space-y-2 border-b border-[var(--shell-border)] px-5 py-4">
                <Skeleton className={`h-5 w-36 ${bar}`} />
                <Skeleton className={`h-3 w-64 max-w-full ${bar}`} />
              </div>
              <div className="space-y-3 px-5 py-4">
                {Array.from({ length: 4 }, (_, row) => (
                  <Skeleton key={row} className={`h-10 ${bar}`} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
