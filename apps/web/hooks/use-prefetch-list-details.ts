"use client";

import { useEffect } from "react";
import { useDispatch } from "react-redux";
import { useRouter } from "next/navigation";
import { prefetchListDetails, type ListDetailKind } from "@/lib/prefetch-list-details";

/** After a list loads, prefetch detail records + route JS so first clicks feel instant. */
export function usePrefetchListDetails(kind: ListDetailKind, ids: string[]) {
  const dispatch = useDispatch();
  const router = useRouter();
  const key = ids.slice(0, 40).join("\0");

  useEffect(() => {
    if (!key) return;

    const idList = key.split("\0");
    const run = () =>
      prefetchListDetails(dispatch, kind, idList, (href) => {
        router.prefetch(href);
      });

    if (typeof requestIdleCallback !== "undefined") {
      const handle = requestIdleCallback(run, { timeout: 1500 });
      return () => cancelIdleCallback(handle);
    }

    const timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
  }, [dispatch, router, kind, key]);
}
