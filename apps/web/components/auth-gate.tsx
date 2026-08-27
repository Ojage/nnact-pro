"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSessionUser } from "@/lib/use-session-user";

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useSessionUser();

  const isPublicSurface =
    pathname === "/login" ||
    pathname === "/welcome" ||
    pathname.startsWith("/welcome/") ||
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/p" ||
    pathname.startsWith("/p/");

  useEffect(() => {
    if (loading || isPublicSurface) return;
    if (!user) router.replace("/login");
  }, [isPublicSurface, loading, router, user]);

  if (isPublicSurface) return <>{children}</>;
  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-100 text-sm text-fg-muted">
        Verifying session…
      </div>
    );
  }

  return <>{children}</>;
}
