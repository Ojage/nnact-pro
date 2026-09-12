"use client";

import { GlobalSearch } from "@/components/global-search";

/** Always-visible global search. Desktop: slim top bar over the content area
 *  with the search pinned to the right. Mobile: floating search pill. */
export function TopBar() {
  return (
    <>
      <header className="fixed left-64 right-0 top-0 z-30 hidden h-14 items-center justify-end border-b border-border bg-surface-50 px-4 md:flex">
        <GlobalSearch variant="bar" />
      </header>
      <div className="fixed right-2 top-2 z-30 md:hidden">
        <GlobalSearch variant="floating" />
      </div>
    </>
  );
}