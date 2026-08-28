"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { navigationPendingStore } from "@/lib/navigation-pending";
import { NavigationBar } from "@/components/navigation-bar";

function isInternalNavLink(anchor: HTMLAnchorElement, pathname: string | null): boolean {
  if (anchor.target === "_blank" || anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || !href.startsWith("/") || href.startsWith("//")) return false;
  if (pathname && (href === pathname || href.split("?")[0] === pathname)) return false;
  return true;
}

/** Starts instant nav feedback on pointer-down; completes when the route changes. */
export function NavigationPending() {
  const pathname = usePathname();

  useEffect(() => {
    navigationPendingStore.complete();
  }, [pathname]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || !isInternalNavLink(anchor, pathname)) return;
      const href = anchor.getAttribute("href");
      if (href) navigationPendingStore.start(href);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [pathname]);

  return <NavigationBar />;
}
