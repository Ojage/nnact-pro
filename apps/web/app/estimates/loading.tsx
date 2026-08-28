import { Skeleton } from "@/components/ui/skeleton";

export default function EstimatesLoading() {
  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <Skeleton className="mb-2 h-8 w-32" />
          <Skeleton className="h-4 w-44" />
        </div>
      </div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Skeleton className="h-10 w-80 rounded-lg" />
        <Skeleton className="h-10 w-36 rounded-lg" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="mb-2 h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
