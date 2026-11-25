"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPublicPath } from "@/lib/public-routes";
import { useSessionUser } from "@/lib/use-session-user";
import { RequiredPasswordChange } from "@/components/required-password-change";
import { BrandLoader } from "@/components/brand-loader";

export function AuthGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading, setUser } = useSessionUser();
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
      <BrandLoader label="Verifying your session…" />
    );
  }

  if (user.mustChangePassword) {
    return (
      <RequiredPasswordChange
        user={user}
        onComplete={(next) => setUser(next)}
      />
    );
  }

  return <>{children}</>;
}
