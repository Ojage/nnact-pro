import { ChevronRight } from "lucide-react";
import { PrefetchLink as Link } from "@/components/prefetch-link";

export type Crumb = { label: string; href?: string };

/** Console breadcrumb: ancestors are links, the last item is the current page. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 flex-wrap items-center gap-1 text-sm text-fg-muted" role="list">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
              {last || !item.href ? (
                <span aria-current={last ? "page" : undefined} className="truncate text-fg">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="text-[var(--shell-accent-text)] hover:underline">
                  {item.label}
                </Link>
              )}
              {last ? null : <ChevronRight className="size-4 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
