"use client";

import { useCallback, useEffect, useState } from "react";

const KEY_PREFIX = "nnact.shell.nav.";

function storageKey(userId: string | null | undefined): string {
  return `${KEY_PREFIX}${userId ?? "anonymous"}`;
}

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "open";
  } catch {
    return false;
  }
}

/**
 * Whether the desktop sidebar is pinned open. Closed by default; each user's
 * last choice is remembered in this browser. The phone drawer is separate
 * state and always starts closed.
 */
export function useShellNav(userId: string | null | undefined) {
  const key = storageKey(userId);
  const [pinned, setPinned] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    setPinned(read(key));
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) setPinned(event.newValue === "open");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [key]);

  const setPinnedAndRemember = useCallback(
    (next: boolean) => {
      setPinned(next);
      try {
        window.localStorage.setItem(key, next ? "open" : "closed");
      } catch {
        // Private mode or blocked storage: the choice lasts for this page only.
      }
    },
    [key],
  );

  /** The hamburger: pins the sidebar on desktop, opens the drawer on a phone. */
  const toggle = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) setPinnedAndRemember(!pinned);
    else setDrawerOpen((open) => !open);
  }, [pinned, setPinnedAndRemember]);

  return { pinned, drawerOpen, setDrawerOpen, toggle };
}
