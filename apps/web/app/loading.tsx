import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <div>
      {/* Header skeleton */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <Skeleton className="h-8 w-40 mb-2" />
          <Skeleton className="h-4 w-56" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-28 rounded-lg" />
          <Skeleton className="h-10 w-32 rounded-lg" />
        </div>
      </div>

      {/* Stat cards skeleton */}
      <div className="flex gap-4 mb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="flex-1 h-24 rounded-xl" />
        ))}
      </div>

      {/* Two-column grid skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>

      {/* Bottom full-width skeleton */}
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}
