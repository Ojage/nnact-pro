"use client";

import Link from "next/link";
import { useCallback, type ComponentProps, type FocusEvent, type MouseEvent } from "react";
import { useDispatch } from "react-redux";
import { prefetchRoute } from "@/lib/prefetch-route";

type PrefetchLinkProps = ComponentProps<typeof Link>;

function hrefToPath(href: PrefetchLinkProps["href"]): string {
  if (typeof href === "string") return href;
  if (typeof href === "object" && href.pathname) return href.pathname;
  return "";
}

/** Next.js Link that prefetches API data on hover/focus for faster client navigation. */
export function PrefetchLink({ href, onMouseEnter, onFocus, prefetch = true, ...props }: PrefetchLinkProps) {
  const dispatch = useDispatch();

  const warm = useCallback(() => {
    const path = hrefToPath(href);
    if (path.startsWith("/")) prefetchRoute(dispatch, path);
  }, [dispatch, href]);

  return (
    <Link
      href={href}
      prefetch={prefetch}
      onMouseEnter={(event: MouseEvent<HTMLAnchorElement>) => {
        warm();
        onMouseEnter?.(event);
      }}
      onFocus={(event: FocusEvent<HTMLAnchorElement>) => {
        warm();
        onFocus?.(event);
      }}
      {...props}
    />
  );
}
