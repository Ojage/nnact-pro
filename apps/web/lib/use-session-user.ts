"use client";

import { useCallback, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { currentUser, logout } from "@/lib/api";
import { SessionContext, type SessionUser, type SessionUserSession } from "@/lib/session-context";

export type { SessionUser } from "@/lib/session-context";

/** Standalone fetch used when the shared SessionProvider is not mounted. */
function useStandaloneSession(): SessionUserSession {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;
    currentUser()
      .then((nextUser) => {
        if (active) setUser(nextUser);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshUser = useCallback(() => {
    return currentUser()
      .then((nextUser) => setUser(nextUser))
      .catch(() => setUser(null));
  }, []);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await logout();
    } finally {
      setUser(null);
      router.replace("/login");
      router.refresh();
      setSigningOut(false);
    }
  }, [router]);

  return { user, loading, signingOut, signOut, setUser, refreshUser };
}

/**
 * The session hook. Inside the app shell it reads the shared SessionProvider;
 * outside it (pages rendered without the shell) it falls back to its own fetch.
 */
export function useSessionUser(): SessionUserSession {
  const ctx = useContext(SessionContext);
  return ctx ?? useStandaloneSession();
}