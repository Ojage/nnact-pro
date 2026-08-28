import type { AppDispatch } from "@/lib/redux/store";
import { prefetchRoute, warmAppCaches } from "@/lib/prefetch-route";

export type ListDetailKind = "jobs" | "customers" | "invoices" | "estimates";

const MAX_PREFETCH = 40;

/** Prefetch detail API data and Next.js route chunks for visible list rows. */
export function prefetchListDetails(
  dispatch: AppDispatch,
  kind: ListDetailKind,
  ids: string[],
  prefetchNextRoute?: (href: string) => void,
) {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, MAX_PREFETCH);
  if (unique.length === 0) return;

  warmAppCaches(dispatch);

  for (const id of unique) {
    const href = `/${kind}/${id}`;
    prefetchNextRoute?.(href);
    prefetchRoute(dispatch, href);
  }
}
