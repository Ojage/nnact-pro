"use client";

import { useEffect } from "react";
import { bootstrapLiveNotifications } from "@/lib/notifications-live";

/** Connects SSE + Firebase foreground push when a staff JWT is present. */
export function LiveNotificationsBridge({
  onFieldRefresh,
}: {
  onFieldRefresh?: (reason: string, jobId?: string) => void;
}) {
  useEffect(() => {
    const token = localStorage.getItem("NNPtoken");
    if (!token) return;

    let teardown: (() => void) | undefined;
    void bootstrapLiveNotifications(token, {
      onFieldRefresh: (reason, jobId) => onFieldRefresh?.(reason, jobId),
    }).then((fn) => {
      teardown = fn;
    });

    return () => teardown?.();
  }, [onFieldRefresh]);

  return null;
}
