"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { PrefetchLink as Link } from "@/components/prefetch-link";
import { cn } from "@/lib/utils";

export type TabItem<Id extends string = string> = { id: Id; label: string; count?: number };

/**
 * Read the current ?tab= value, falling back to the first tab. Needs a
 * Suspense boundary above it (useSearchParams).
 */
export function useUrlTab<Id extends string>(tabs: readonly TabItem<Id>[], param = "tab"): Id {
  const params = useSearchParams();
  const requested = params.get(param);
  return (tabs.find((tab) => tab.id === requested)?.id ?? tabs[0]?.id) as Id;
}

/**
 * Horizontal console tabs kept in the URL. These are page navigation, so
 * they are links with aria-current, not an ARIA tablist.
 */
export function TabsNav<Id extends string>({
  tabs,
  current,
  label,
  param = "tab",
  className,
}: {
  tabs: readonly TabItem<Id>[];
  current: Id;
  label: string;
  param?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const hrefFor = (id: Id) => {
    const next = new URLSearchParams(params.toString());
    if (id === tabs[0]?.id) next.delete(param);
    else next.set(param, id);
    const query = next.toString();
    return query ? `${pathname}?${query}` : pathname;
  };
  return (
    <nav aria-label={label} className={cn("-mt-2 overflow-x-auto border-b border-[var(--shell-border)]", className)}>
      <ul className="flex min-w-max gap-1" role="list">
        {tabs.map((tab) => {
          const active = tab.id === current;
          return (
            <li key={tab.id}>
              <Link
                href={hrefFor(tab.id)}
                scroll={false}
                replace
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-11 items-center gap-1.5 px-3 text-sm no-underline hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--shell-focus)]",
                  active
                    ? "font-medium text-[var(--shell-accent-text)] after:absolute after:inset-x-0 after:bottom-0 after:border-b-[3px] after:border-[var(--shell-accent-bar)]"
                    : "text-fg-muted hover:bg-[var(--shell-hover)] hover:text-fg",
                )}
              >
                {tab.label}
                {tab.count !== undefined ? (
                  <span className="rounded-full bg-[var(--shell-canvas)] px-1.5 text-[11px] tabular-nums text-fg-muted">{tab.count}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
