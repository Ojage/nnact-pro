import { Skeleton } from "@/components/ui/skeleton";

export default function JobsLoading() {
  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <Skeleton className="mb-2 h-8 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>
      <Skeleton className="mb-4 h-10 w-80 rounded-lg" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="mb-2 h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}
