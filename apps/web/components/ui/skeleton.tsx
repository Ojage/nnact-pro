import type { ComponentProps, CSSProperties } from "react";

import { cn } from "./utils";

/** Moving highlight — pairs with `animate-shimmer` in `index.css` (background-position sweep). */
const SHIMMER_BASE: CSSProperties = {
  backgroundImage: `linear-gradient(
    90deg,
    var(--muted) 0%,
    color-mix(in oklab, var(--muted-foreground) 14%, var(--muted)) 42%,
    color-mix(in oklab, var(--muted-foreground) 22%, var(--muted)) 50%,
    color-mix(in oklab, var(--muted-foreground) 14%, var(--muted)) 58%,
    var(--muted) 100%
  )`,
  backgroundSize: "200% 100%",
};

function Skeleton({ className, style, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-shimmer rounded-md", className)}
      style={{ ...SHIMMER_BASE, ...style }}
      {...props}
    />
  );
}

export { Skeleton };
