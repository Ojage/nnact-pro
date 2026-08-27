"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPublicPath } from "@/lib/public-routes";
import { useSessionUser } from "@/lib/use-session-user";

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useSessionUser();
  const [mounted, setMounted] = useState(false);

  const isPublicSurface = isPublicPath(pathname);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || loading || isPublicSurface) return;
    if (!user) router.replace("/login");
  }, [isPublicSurface, loading, mounted, router, user]);

  if (isPublicSurface) return <>{children}</>;

  if (!mounted || loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-100 text-sm text-fg-muted">
        Verifying session…
      </div>
    );
  }

  return <>{children}</>;
}
