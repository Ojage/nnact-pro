"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "nnact.agents.enabled";
const EVENT_NAME = "nnact:agents-enabled";

export function useAgentsEnabled() {
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "false") setEnabledState(false);

    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) setEnabledState(event.newValue !== "false");
    };
    const onAgentsChange = (event: Event) => {
      setEnabledState((event as CustomEvent<boolean>).detail);
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT_NAME, onAgentsChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT_NAME, onAgentsChange);
    };
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    window.localStorage.setItem(STORAGE_KEY, String(next));
    window.dispatchEvent(new CustomEvent<boolean>(EVENT_NAME, { detail: next }));
  }, []);

  return { enabled, setEnabled };
}
