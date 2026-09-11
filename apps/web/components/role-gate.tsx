"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccessRoute } from "@/lib/nav";
import type { NavRole } from "@/lib/nav";
import { useSessionUser } from "@/lib/use-session-user";

/**
 * Guards page content by staff role. The sidebar already hides links a role
 * cannot see; this is the backstop so a deep link (or typed URL) to an
 * owner-only feature redirects non-owners instead of rendering it.
 */
export function RoleGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useSessionUser();
  const allowed = user?.role
    ? canAccessRoute(user.role as NavRole, pathname)
    : false;

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessRoute(user.role as NavRole, pathname)) {
      router.replace("/");
    }
  }, [loading, pathname, router, user]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-fg-muted">
        Checking access…
      </div>
    );
  }

  if (!user) return null;

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-fg-muted">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}