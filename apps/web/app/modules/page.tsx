import { Suspense } from "react";

import { ConsoleHeader, ConsolePage } from "@/components/console/page";
import { ModulesBrowser } from "@/components/modules/modules-browser";
import { Skeleton } from "@/components/ui/skeleton";

function ModulesSkeleton() {
  return (
    <ConsolePage>
      <ConsoleHeader
        title="All modules"
        breadcrumb={[{ label: "Home", href: "/" }, { label: "All modules" }]}
        description="Search every module available to your role."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, index) => (
          <Skeleton key={index} className="h-32 rounded-[8px]" />
        ))}
      </div>
    </ConsolePage>
  );
}

export default function ModulesPage() {
  return (
    <Suspense fallback={<ModulesSkeleton />}>
      <ModulesBrowser />
    </Suspense>
  );
}
