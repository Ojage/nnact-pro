"use client";

import { GlobalSearch } from "@/components/global-search";

/** Always-visible global search. Desktop: slim top bar over the content area
 *  with the search pinned to the right. Mobile: floating search pill. */
export function TopBar() {
  return (
    <>
      <header className="fixed left-[var(--sidebar-width)] right-0 top-0 z-30 hidden h-16 items-center justify-end border-b border-border bg-card/80 px-4 backdrop-blur-xl md:flex md:px-8 lg:px-10">
        <GlobalSearch variant="bar" />
      </header>
      <div className="fixed right-3 top-3 z-30 md:hidden">
        <GlobalSearch variant="floating" />
      </div>
    </>
  );
}