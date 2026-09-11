"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { currentUser, logout } from "@/lib/api";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  orgId: string;
  mustChangePassword?: boolean;
}

export interface SessionUserSession {
  user: SessionUser | null;
  loading: boolean;
  signingOut: boolean;
  signOut: () => Promise<void>;
  setUser: (user: SessionUser | null) => void;
  refreshUser: () => Promise<void>;
}

export const SessionContext = createContext<SessionUserSession | null>(null);

/** Single source of truth for the authenticated staff session. Fetch once, share everywhere. */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  const refreshUser = useCallback(() => {
    return currentUser()
      .then((nextUser) => setUser(nextUser))
      .catch(() => setUser(null));
  }, []);

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

  return (
    <SessionContext.Provider value={{ user, loading, signingOut, signOut, setUser, refreshUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionUserSession {
  const ctx = useContext(SessionContext);
  if (ctx) return ctx;
  throw new Error("useSession must be used within a SessionProvider");
}