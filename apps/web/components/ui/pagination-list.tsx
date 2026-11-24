import * as React from "react";

import { cn } from "./utils";

function PaginationList({ className, children, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul
      data-slot="pagination-list"
      className={cn("flex flex-row items-center gap-1.5", className)}
      {...props}
    >
      {children}
    </ul>
  );
}

export { PaginationList };
