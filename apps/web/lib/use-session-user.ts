"use client";

import { useCallback, useEffect, useState } from "react";
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

export function useSessionUser() {
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

  return { user, loading, signingOut, signOut, setUser, refreshUser };
}
