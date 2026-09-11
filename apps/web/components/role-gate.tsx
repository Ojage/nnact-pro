"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { canAccessRoute } from "@/lib/nav";
import type { NavRole } from "@/lib/nav";
import type { SessionUser } from "@/lib/use-session-user";

interface RoleGateProps {
  user: SessionUser | null;
  loading: boolean;
  children: ReactNode;
}

/**
 * Guards page content by staff role. The sidebar already hides links a role
 * cannot see; this is the backstop so a deep link (or typed URL) to an
 * owner-only feature redirects non-owners instead of rendering it.
 */
export function RoleGate({ user, loading, children }: RoleGateProps) {
  const pathname = usePathname();
  const router = useRouter();
  const allowed = user?.role
    ? canAccessRoute(user.role as NavRole, pathname)
    : false;

  useEffect(() => {
    if (loading || !user) return;
    if (!canAccessRoute(user.role as NavRole, pathname)) {
      router.replace("/");
    }
  }, [loading, pathname, router, user]);

  if (loading || !user) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-fg-muted">
        Checking access…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-fg-muted">
        Redirecting…
      </div>
    );
  }

  return <>{children}</>;
}