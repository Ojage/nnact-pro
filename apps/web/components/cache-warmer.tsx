"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { warmAppCaches } from "@/lib/prefetch-route";

const CORE_ROUTES = ["/jobs", "/customers", "/invoices", "/estimates", "/schedule", "/dispatch", "/documents"];

/** Prefetch core list endpoints and route chunks once after auth. */
export function CacheWarmer() {
  const dispatch = useDispatch();
  const router = useRouter();
  const warmed = useRef(false);

  useEffect(() => {
    if (warmed.current) return;
    warmed.current = true;
    warmAppCaches(dispatch);
    for (const path of CORE_ROUTES) {
      router.prefetch(path);
    }
  }, [dispatch, router]);

  return null;
}
