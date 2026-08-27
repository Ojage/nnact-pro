import * as React from "react";

function PaginationList({ children, ...props }: React.ComponentProps<"ul">) {
  return <>{children}</>;
}

export { PaginationList };
