"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { navigationPendingStore } from "@/lib/navigation-pending";

/** Thin top bar that appears the instant an internal link is pressed. */
export function NavigationBar() {
  const [pending, setPending] = useState(navigationPendingStore.pending);

  useEffect(
    () =>
      navigationPendingStore.subscribe((state) => {
        setPending(state.pending);
      }),
    [],
  );

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-x-0 top-0 z-[100] h-[3px] origin-left bg-accent shadow-[0_0_8px_rgba(var(--accent-rgb,59,130,246),0.55)] transition-[transform,opacity] duration-200 ease-out",
        pending ? "scale-x-100 opacity-100" : "scale-x-0 opacity-0",
      )}
      style={{ transitionDuration: pending ? "80ms" : "200ms" }}
    />
  );
}
