import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic page skeleton, shown while any page without its own loading state
 * opens: a title, a toolbar and a table-like body, in the console style.
 * The home page has its own skeleton in app/(home)/loading.tsx.
 */
export default function PageLoading() {
  return (
    <div className="min-w-0 space-y-6" aria-busy="true" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56 rounded-[6px]" />
        <Skeleton className="h-4 w-80 max-w-full rounded-[6px]" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-9 w-64 max-w-full rounded-[8px]" />
        <Skeleton className="h-9 w-28 rounded-[8px]" />
        <Skeleton className="h-9 w-28 rounded-[8px]" />
      </div>
      <div className="overflow-hidden rounded-[8px] border border-[var(--shell-border)]">
        <Skeleton className="h-10 rounded-none" />
        <div className="divide-y divide-[var(--shell-border)]">
          {Array.from({ length: 8 }, (_, row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-1/4 rounded-[6px]" />
              <Skeleton className="h-4 w-1/3 rounded-[6px]" />
              <Skeleton className="ml-auto h-4 w-20 rounded-[6px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
