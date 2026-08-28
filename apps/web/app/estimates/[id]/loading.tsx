import { Skeleton } from "@/components/ui/skeleton";

export default function EstimateDetailLoading() {
  return (
    <div>
      <div className="mb-8 flex items-end justify-between">
        <div>
          <Skeleton className="mb-2 h-8 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-48" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <div className="flex flex-col gap-6">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
        <div className="flex flex-col gap-6">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
