import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div>
      <Skeleton className="h-8 w-48 mb-8" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}
